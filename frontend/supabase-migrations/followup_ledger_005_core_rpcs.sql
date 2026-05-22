-- =============================================================================
-- followup_ledger_005_core_rpcs.sql
--
-- Fase 2 — RPCs core do sistema de follow-up.
--
-- Funções criadas:
--   1. rpc_can_send_follow_up        — decisão read-only de permissão
--   2. rpc_register_follow_up_sent   — registra envio, cria evento + atualiza ciclo
--   3. rpc_register_follow_up_response — atribui resposta inbound a follow-up
--   4. rpc_stop_follow_up_cycle      — encerra ciclo e cancela pendências
--   5. rpc_get_follow_up_state       — leitura de estado para frontend/n8n
--
-- Dependências (Fase 1 — devem estar aplicadas):
--   - public.follow_up_events
--   - public.follow_up_cycle_state
--   - public.agent_operations (com campos cycle_id, follow_up_event_id, etc.)
--   - public.companies (com follow_up_max_attempts, follow_up_min_interval_hours,
--                        follow_up_attribution_hours, autopilot_enabled)
--   - public.contacts (com follow_up_opt_out)
--   - public.is_company_member(uuid)
--   - public.is_platform_admin()
--
-- Segurança:
--   - Todas as funções são SECURITY DEFINER com SET search_path = public
--   - Isolamento por company_id em todos os passos
--   - Membership validada para chamadas authenticated (auth.uid() IS NOT NULL)
--   - service_role opera sem restrição, mas dados inconsistentes geram exceção
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_can_send_follow_up
--    Função read-only de decisão. Não cria nem altera nenhum dado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_can_send_follow_up(
  p_company_id      uuid,
  p_contact_id      uuid,
  p_conversation_id uuid    DEFAULT NULL,
  p_deal_id         uuid    DEFAULT NULL,
  p_channel         text    DEFAULT 'whatsapp'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact         RECORD;
  v_company         RECORD;
  v_cycle           RECORD;
  v_has_human_msg   boolean;
  v_attempt_number  integer;
  v_now             timestamptz := now();
BEGIN

  -- ── 1. Validar membership quando chamado por usuário autenticado ──────────
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden: caller is not a member of company %', p_company_id;
    END IF;
  END IF;

  -- ── 2. Validar canal ──────────────────────────────────────────────────────
  IF p_channel NOT IN ('whatsapp','email','sms','internal') THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'invalid_channel',
      'attempt_number', 1, 'max_attempts', 3,
      'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
      'cycle_status', NULL, 'cycle_id', NULL,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 3. Validar contato + empresa ─────────────────────────────────────────
  SELECT id, company_id, follow_up_opt_out
    INTO v_contact
    FROM public.contacts
   WHERE id = p_contact_id
     AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'contact_not_found',
      'attempt_number', 1, 'max_attempts', 3,
      'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
      'cycle_status', NULL, 'cycle_id', NULL,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 4. Validar conversation, se informada ─────────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.conversations
     WHERE id = p_conversation_id
       AND company_id = p_company_id
       AND contact_id = p_contact_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'conversation_not_found',
        'attempt_number', 1, 'max_attempts', 3,
        'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
        'cycle_status', NULL, 'cycle_id', NULL,
        'contact_id', p_contact_id, 'conversation_id', p_conversation_id
      );
    END IF;
  END IF;

  -- ── 5. Validar deal, se informado ─────────────────────────────────────────
  IF p_deal_id IS NOT NULL THEN
    PERFORM 1 FROM public.deals
     WHERE id = p_deal_id
       AND company_id = p_company_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'deal_not_found',
        'attempt_number', 1, 'max_attempts', 3,
        'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
        'cycle_status', NULL, 'cycle_id', NULL,
        'contact_id', p_contact_id, 'conversation_id', p_conversation_id
      );
    END IF;
  END IF;

  -- ── 6. Carregar configurações da empresa ──────────────────────────────────
  SELECT id, follow_up_max_attempts, follow_up_min_interval_hours,
         follow_up_attribution_hours, autopilot_enabled
    INTO v_company
    FROM public.companies
   WHERE id = p_company_id;

  -- ── 7. Verificar opt-out do contato ──────────────────────────────────────
  IF v_contact.follow_up_opt_out THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'opt_out',
      'attempt_number', 1, 'max_attempts', v_company.follow_up_max_attempts,
      'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
      'cycle_status', NULL, 'cycle_id', NULL,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 8. Verificar autopilot_enabled ───────────────────────────────────────
  IF v_company.autopilot_enabled = false THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'autopilot_disabled',
      'attempt_number', 1, 'max_attempts', v_company.follow_up_max_attempts,
      'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
      'cycle_status', NULL, 'cycle_id', NULL,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 9. Buscar ciclo ativo/pausado ─────────────────────────────────────────
  --    Prioridade: conversation_id > deal_id > só contato
  IF p_conversation_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id = p_conversation_id
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1;
  ELSIF p_deal_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND deal_id         = p_deal_id
       AND conversation_id IS NULL
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1;
  ELSE
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id IS NULL
       AND deal_id         IS NULL
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  -- ── 10. Sem ciclo existente → primeira tentativa sempre permitida ─────────
  IF NOT FOUND THEN
    -- Verificar se há humano no modo de atendimento, mesmo sem ciclo
    IF p_conversation_id IS NOT NULL THEN
      -- Checar attendance_mode
      PERFORM 1 FROM public.conversations
       WHERE id = p_conversation_id
         AND company_id = p_company_id
         AND attendance_mode = 'human';
      IF FOUND THEN
        RETURN jsonb_build_object(
          'allowed', false, 'reason', 'human_recently_engaged',
          'attempt_number', 1, 'max_attempts', v_company.follow_up_max_attempts,
          'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
          'cycle_status', NULL, 'cycle_id', NULL,
          'contact_id', p_contact_id, 'conversation_id', p_conversation_id
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'allowed', true, 'reason', 'ok',
      'attempt_number', 1, 'max_attempts', v_company.follow_up_max_attempts,
      'last_follow_sent_at', NULL, 'next_allowed_at', NULL,
      'cycle_status', 'virtual_first', 'cycle_id', NULL,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 11. Verificar se ciclo está encerrado ────────────────────────────────
  IF v_cycle.cycle_status IN ('stopped','responded','completed') THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'cycle_stopped',
      'attempt_number', v_cycle.attempt_count + 1,
      'max_attempts', v_cycle.max_attempts,
      'last_follow_sent_at', v_cycle.last_follow_sent_at,
      'next_allowed_at', v_cycle.next_allowed_at,
      'cycle_status', v_cycle.cycle_status,
      'cycle_id', v_cycle.cycle_id,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 12. Verificar limite de tentativas ───────────────────────────────────
  IF v_cycle.attempt_count >= v_cycle.max_attempts THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'max_attempts_reached',
      'attempt_number', v_cycle.attempt_count + 1,
      'max_attempts', v_cycle.max_attempts,
      'last_follow_sent_at', v_cycle.last_follow_sent_at,
      'next_allowed_at', v_cycle.next_allowed_at,
      'cycle_status', v_cycle.cycle_status,
      'cycle_id', v_cycle.cycle_id,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 13. Verificar intervalo mínimo ────────────────────────────────────────
  IF v_cycle.next_allowed_at IS NOT NULL AND v_cycle.next_allowed_at > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'min_interval_not_elapsed',
      'attempt_number', v_cycle.attempt_count + 1,
      'max_attempts', v_cycle.max_attempts,
      'last_follow_sent_at', v_cycle.last_follow_sent_at,
      'next_allowed_at', v_cycle.next_allowed_at,
      'cycle_status', v_cycle.cycle_status,
      'cycle_id', v_cycle.cycle_id,
      'contact_id', p_contact_id, 'conversation_id', p_conversation_id
    );
  END IF;

  -- ── 14. Verificar se humano assumiu a conversa ────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    -- Bloquear se attendance_mode = 'human'
    PERFORM 1 FROM public.conversations
     WHERE id = p_conversation_id
       AND company_id = p_company_id
       AND attendance_mode = 'human';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'human_recently_engaged',
        'attempt_number', v_cycle.attempt_count + 1,
        'max_attempts', v_cycle.max_attempts,
        'last_follow_sent_at', v_cycle.last_follow_sent_at,
        'next_allowed_at', v_cycle.next_allowed_at,
        'cycle_status', v_cycle.cycle_status,
        'cycle_id', v_cycle.cycle_id,
        'contact_id', p_contact_id, 'conversation_id', p_conversation_id
      );
    END IF;

    -- Bloquear se agente humano enviou mensagem nas últimas 24h
    SELECT EXISTS (
      SELECT 1 FROM public.messages
       WHERE conversation_id = p_conversation_id
         AND company_id      = p_company_id
         AND direction       = 'outbound'
         AND sender_type     = 'user'
         AND created_at     >= v_now - interval '24 hours'
    ) INTO v_has_human_msg;

    IF v_has_human_msg THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'human_recently_engaged',
        'attempt_number', v_cycle.attempt_count + 1,
        'max_attempts', v_cycle.max_attempts,
        'last_follow_sent_at', v_cycle.last_follow_sent_at,
        'next_allowed_at', v_cycle.next_allowed_at,
        'cycle_status', v_cycle.cycle_status,
        'cycle_id', v_cycle.cycle_id,
        'contact_id', p_contact_id, 'conversation_id', p_conversation_id
      );
    END IF;
  END IF;

  -- ── 15. Tudo passou → permitido ──────────────────────────────────────────
  v_attempt_number := v_cycle.attempt_count + 1;

  RETURN jsonb_build_object(
    'allowed', true, 'reason', 'ok',
    'attempt_number', v_attempt_number,
    'max_attempts', v_cycle.max_attempts,
    'last_follow_sent_at', v_cycle.last_follow_sent_at,
    'next_allowed_at', v_cycle.next_allowed_at,
    'cycle_status', v_cycle.cycle_status,
    'cycle_id', v_cycle.cycle_id,
    'contact_id', p_contact_id, 'conversation_id', p_conversation_id
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_can_send_follow_up IS
  'Fase 2 — Decisão read-only: retorna se um follow-up pode ser enviado para o contato/contexto. Não cria nem altera dados.';

GRANT EXECUTE ON FUNCTION public.rpc_can_send_follow_up TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_can_send_follow_up TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_register_follow_up_sent
--    Registra envio, cria evento no ledger, cria/atualiza estado do ciclo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_register_follow_up_sent(
  p_company_id          uuid,
  p_contact_id          uuid,
  p_conversation_id     uuid    DEFAULT NULL,
  p_deal_id             uuid    DEFAULT NULL,
  p_task_id             uuid    DEFAULT NULL,
  p_operation_id        uuid    DEFAULT NULL,
  p_trigger_id          uuid    DEFAULT NULL,
  p_cadence_id          uuid    DEFAULT NULL,
  p_cadence_step_id     uuid    DEFAULT NULL,
  p_follow_type         text    DEFAULT 'agent_auto',
  p_channel             text    DEFAULT 'whatsapp',
  p_message_id          bigint  DEFAULT NULL,
  p_external_message_id text    DEFAULT NULL,
  p_idempotency_key     text    DEFAULT NULL,
  p_next_interval_hours integer DEFAULT NULL,
  p_attribution_hours   integer DEFAULT NULL,
  p_metadata            jsonb   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company          RECORD;
  v_cycle            RECORD;
  v_existing_event   RECORD;
  v_event_id         uuid;
  v_cycle_id         uuid;
  v_attempt_number   integer;
  v_next_allowed_at  timestamptz;
  v_attribution_until timestamptz;
  v_sent_at          timestamptz := now();
  v_interval_hours   integer;
  v_attr_hours       integer;
BEGIN

  -- ── 1. Validar membership quando chamado por usuário autenticado ──────────
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden: caller is not a member of company %', p_company_id;
    END IF;
  END IF;

  -- ── 2. Validar follow_type ────────────────────────────────────────────────
  IF p_follow_type NOT IN ('agent_auto','cadence_step','human_manual','human_bulk','system_rescue') THEN
    RAISE EXCEPTION 'invalid_follow_type: %', p_follow_type;
  END IF;

  -- ── 3. Validar channel ────────────────────────────────────────────────────
  IF p_channel NOT IN ('whatsapp','email','sms','internal') THEN
    RAISE EXCEPTION 'invalid_channel: %', p_channel;
  END IF;

  -- ── 4. Validar contato + empresa ─────────────────────────────────────────
  PERFORM 1 FROM public.contacts
   WHERE id = p_contact_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found: contact % not in company %', p_contact_id, p_company_id;
  END IF;

  -- ── 5. Validar entidades opcionais ────────────────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.conversations
     WHERE id = p_conversation_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation_not_found: conversation % not in company %', p_conversation_id, p_company_id;
    END IF;
  END IF;

  IF p_deal_id IS NOT NULL THEN
    PERFORM 1 FROM public.deals
     WHERE id = p_deal_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'deal_not_found: deal % not in company %', p_deal_id, p_company_id;
    END IF;
  END IF;

  IF p_operation_id IS NOT NULL THEN
    PERFORM 1 FROM public.agent_operations
     WHERE id = p_operation_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'operation_not_found: operation % not in company %', p_operation_id, p_company_id;
    END IF;
  END IF;

  IF p_trigger_id IS NOT NULL THEN
    PERFORM 1 FROM public.conversation_followup_triggers
     WHERE id = p_trigger_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'trigger_not_found: trigger % not in company %', p_trigger_id, p_company_id;
    END IF;
  END IF;

  -- ── 6. Idempotência: checar chave duplicada ───────────────────────────────
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, cycle_id, attempt_number, next_allowed_at, attribution_until
      INTO v_existing_event
      FROM public.follow_up_events
     WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'follow_up_event_id', v_existing_event.id,
        'attempt_number', v_existing_event.attempt_number,
        'next_allowed_at', v_existing_event.next_allowed_at,
        'attribution_until', v_existing_event.attribution_until,
        'cycle_id', v_existing_event.cycle_id,
        'duplicate', true
      );
    END IF;
  END IF;

  -- ── 7. Carregar configurações da empresa ──────────────────────────────────
  SELECT id, follow_up_max_attempts, follow_up_min_interval_hours,
         follow_up_attribution_hours
    INTO v_company
    FROM public.companies
   WHERE id = p_company_id;

  v_interval_hours := COALESCE(p_next_interval_hours, v_company.follow_up_min_interval_hours, 24);
  v_attr_hours     := COALESCE(p_attribution_hours,   v_company.follow_up_attribution_hours,  72);

  -- ── 8. Buscar ciclo ativo com lock ───────────────────────────────────────
  --    Usar SELECT FOR UPDATE para evitar corrida entre duas tentativas simultâneas.
  IF p_conversation_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id = p_conversation_id
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
  ELSIF p_deal_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND deal_id         = p_deal_id
       AND conversation_id IS NULL
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
  ELSE
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id IS NULL
       AND deal_id         IS NULL
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
  END IF;

  -- ── 9. Criar ciclo se não existir ─────────────────────────────────────────
  IF NOT FOUND THEN
    v_cycle_id := gen_random_uuid();

    INSERT INTO public.follow_up_cycle_state (
      company_id, contact_id, conversation_id, deal_id,
      cycle_id, cycle_status, attempt_count, max_attempts,
      settings_source, cadence_id
    ) VALUES (
      p_company_id, p_contact_id, p_conversation_id, p_deal_id,
      v_cycle_id, 'active', 0, v_company.follow_up_max_attempts,
      CASE WHEN p_cadence_id IS NOT NULL THEN 'cadence' ELSE 'company_default' END,
      p_cadence_id
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_cycle;

    -- Se houve conflito de unique (race condition), reler o estado existente
    IF NOT FOUND THEN
      IF p_conversation_id IS NOT NULL THEN
        SELECT * INTO v_cycle
          FROM public.follow_up_cycle_state
         WHERE company_id      = p_company_id
           AND contact_id      = p_contact_id
           AND conversation_id = p_conversation_id
           AND cycle_status IN ('active','paused')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE;
      ELSIF p_deal_id IS NOT NULL THEN
        SELECT * INTO v_cycle
          FROM public.follow_up_cycle_state
         WHERE company_id      = p_company_id
           AND contact_id      = p_contact_id
           AND deal_id         = p_deal_id
           AND conversation_id IS NULL
           AND cycle_status IN ('active','paused')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE;
      ELSE
        SELECT * INTO v_cycle
          FROM public.follow_up_cycle_state
         WHERE company_id      = p_company_id
           AND contact_id      = p_contact_id
           AND conversation_id IS NULL
           AND deal_id         IS NULL
           AND cycle_status IN ('active','paused')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE;
      END IF;
    END IF;
  END IF;

  -- ── 10. Calcular attempt_number e timestamps ──────────────────────────────
  v_attempt_number    := v_cycle.attempt_count + 1;
  v_next_allowed_at   := v_sent_at + make_interval(hours => v_interval_hours);
  v_attribution_until := v_sent_at + make_interval(hours => v_attr_hours);
  v_cycle_id          := v_cycle.cycle_id;

  -- ── 11. Inserir follow_up_event (ledger) ──────────────────────────────────
  INSERT INTO public.follow_up_events (
    company_id, contact_id, conversation_id, deal_id, task_id,
    operation_id, trigger_id, cadence_id, cadence_step_id,
    follow_type, channel,
    cycle_id, attempt_number,
    message_id, external_message_id, idempotency_key,
    sent_at, next_allowed_at, attribution_until,
    status, metadata
  ) VALUES (
    p_company_id, p_contact_id, p_conversation_id, p_deal_id, p_task_id,
    p_operation_id, p_trigger_id, p_cadence_id, p_cadence_step_id,
    p_follow_type, p_channel,
    v_cycle_id, v_attempt_number,
    p_message_id, p_external_message_id, p_idempotency_key,
    v_sent_at, v_next_allowed_at, v_attribution_until,
    'sent', COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  -- ── 12. Atualizar follow_up_cycle_state ───────────────────────────────────
  UPDATE public.follow_up_cycle_state
     SET attempt_count       = v_attempt_number,
         last_follow_sent_at = v_sent_at,
         next_allowed_at     = v_next_allowed_at,
         cycle_status        = 'active',
         max_attempts        = v_company.follow_up_max_attempts
   WHERE id = v_cycle.id;

  -- ── 13. Atualizar agent_operations, se fornecido ──────────────────────────
  IF p_operation_id IS NOT NULL THEN
    UPDATE public.agent_operations
       SET follow_up_event_id = v_event_id,
           attempt_number     = v_attempt_number,
           cycle_id           = v_cycle_id
     WHERE id            = p_operation_id
       AND company_id    = p_company_id;
  END IF;

  -- ── 14. Retornar payload ──────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success', true,
    'follow_up_event_id', v_event_id,
    'attempt_number', v_attempt_number,
    'next_allowed_at', v_next_allowed_at,
    'attribution_until', v_attribution_until,
    'cycle_id', v_cycle_id,
    'duplicate', false
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_register_follow_up_sent IS
  'Fase 2 — Registra envio de follow-up: cria follow_up_event, cria/atualiza follow_up_cycle_state. Idempotente por idempotency_key. Não envia mensagem.';

-- service_role (n8n) é o principal caller; authenticated só se o frontend precisar envio manual
GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_sent TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_sent TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_register_follow_up_response
--    Atribui mensagem inbound ao follow-up elegível mais recente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_register_follow_up_response(
  p_company_id          uuid,
  p_contact_id          uuid,
  p_conversation_id     uuid    DEFAULT NULL,
  p_response_message_id bigint  DEFAULT NULL,
  p_received_at         timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event         RECORD;
  v_cycle         RECORD;
  v_received_at   timestamptz;
  v_lag_seconds   bigint;
BEGIN

  -- ── 1. Validar membership quando chamado por usuário autenticado ──────────
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden: caller is not a member of company %', p_company_id;
    END IF;
  END IF;

  -- ── 2. Validar contato + empresa ─────────────────────────────────────────
  PERFORM 1 FROM public.contacts
   WHERE id = p_contact_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found: contact % not in company %', p_contact_id, p_company_id;
  END IF;

  -- ── 3. Validar conversa, se informada ─────────────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.conversations
     WHERE id = p_conversation_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation_not_found: conversation % not in company %', p_conversation_id, p_company_id;
    END IF;
  END IF;

  -- ── 4. Validar mensagem de resposta, se informada ─────────────────────────
  IF p_response_message_id IS NOT NULL AND p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.messages
     WHERE id              = p_response_message_id
       AND company_id      = p_company_id
       AND conversation_id = p_conversation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'message_not_found: message % not in conversation % / company %',
        p_response_message_id, p_conversation_id, p_company_id;
    END IF;
  END IF;

  v_received_at := COALESCE(p_received_at, now());

  -- ── 5. Buscar follow_up_event elegível mais recente ───────────────────────
  --    Condições: mesma empresa, mesmo contato, status sent/delivered,
  --    responded_at null, dentro da janela de atribuição.
  IF p_conversation_id IS NOT NULL THEN
    SELECT e.*
      INTO v_event
      FROM public.follow_up_events e
     WHERE e.company_id      = p_company_id
       AND e.contact_id      = p_contact_id
       AND e.conversation_id = p_conversation_id
       AND e.status          IN ('sent','delivered')
       AND e.responded_at    IS NULL
       AND e.attribution_until >= v_received_at
       AND e.sent_at          <= v_received_at
     ORDER BY e.sent_at DESC
     LIMIT 1;
  ELSE
    SELECT e.*
      INTO v_event
      FROM public.follow_up_events e
     WHERE e.company_id    = p_company_id
       AND e.contact_id    = p_contact_id
       AND e.status        IN ('sent','delivered')
       AND e.responded_at  IS NULL
       AND e.attribution_until >= v_received_at
       AND e.sent_at          <= v_received_at
     ORDER BY e.sent_at DESC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    -- Nenhum evento elegível: apenas atualizar last_inbound_at no ciclo ativo
    UPDATE public.follow_up_cycle_state
       SET last_inbound_at = v_received_at
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND (
         (p_conversation_id IS NOT NULL AND conversation_id = p_conversation_id)
         OR
         (p_conversation_id IS NULL AND conversation_id IS NULL)
       )
       AND cycle_status IN ('active','paused');

    RETURN jsonb_build_object(
      'success', true,
      'attributed', false,
      'follow_up_event_id', NULL,
      'attempt_number', NULL,
      'response_lag_seconds', NULL
    );
  END IF;

  -- ── 6. Atribuir resposta ao evento ────────────────────────────────────────
  v_lag_seconds := EXTRACT(EPOCH FROM (v_received_at - v_event.sent_at))::bigint;

  UPDATE public.follow_up_events
     SET status              = 'responded',
         responded_at        = v_received_at,
         response_message_id = p_response_message_id
   WHERE id = v_event.id;

  -- ── 7. Atualizar ciclo: encerrar como respondido ──────────────────────────
  UPDATE public.follow_up_cycle_state
     SET has_responded  = true,
         responded_at   = v_received_at,
         last_inbound_at = v_received_at,
         cycle_status   = 'responded',
         stopped_reason = 'contact_replied',
         stopped_at     = v_received_at
   WHERE cycle_id = v_event.cycle_id
     AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'attributed', true,
    'follow_up_event_id', v_event.id,
    'attempt_number', v_event.attempt_number,
    'response_lag_seconds', v_lag_seconds
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_register_follow_up_response IS
  'Fase 2 — Atribui mensagem inbound ao follow-up elegível mais recente dentro da janela de atribuição. Encerra ciclo como respondido.';

GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_response TO service_role;
-- authenticated pode precisar para casos de atribuição manual no frontend:
GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_response TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_stop_follow_up_cycle
--    Encerra ciclo ativo e cancela operações pendentes do mesmo ciclo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_stop_follow_up_cycle(
  p_company_id        uuid,
  p_contact_id        uuid,
  p_conversation_id   uuid    DEFAULT NULL,
  p_deal_id           uuid    DEFAULT NULL,
  p_reason            text    DEFAULT 'manual_cancel',
  p_stopped_by_user_id uuid   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle              RECORD;
  v_cancelled_ops      integer := 0;
  v_cancelled_triggers integer := 0;
  v_valid_reasons      text[] := ARRAY[
    'contact_replied','max_attempts_reached','deal_stage_changed','meeting_booked',
    'human_took_over','opt_out','invalid_channel','manual_cancel','cadence_paused',
    'autopilot_disabled','deal_won','deal_lost','conversation_closed'
  ];
  v_now                timestamptz := now();
BEGIN

  -- ── 1. Validar membership quando chamado por usuário autenticado ──────────
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden: caller is not a member of company %', p_company_id;
    END IF;
  END IF;

  -- ── 2. Validar reason ────────────────────────────────────────────────────
  IF p_reason != ALL(v_valid_reasons) THEN
    RAISE EXCEPTION 'invalid_stop_reason: %', p_reason;
  END IF;

  -- ── 3. Validar contato + empresa ─────────────────────────────────────────
  PERFORM 1 FROM public.contacts
   WHERE id = p_contact_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found: contact % not in company %', p_contact_id, p_company_id;
  END IF;

  -- ── 4. Validar conversa/deal se informados ────────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.conversations
     WHERE id = p_conversation_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation_not_found: conversation % not in company %', p_conversation_id, p_company_id;
    END IF;
  END IF;

  IF p_deal_id IS NOT NULL THEN
    PERFORM 1 FROM public.deals
     WHERE id = p_deal_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'deal_not_found: deal % not in company %', p_deal_id, p_company_id;
    END IF;
  END IF;

  -- ── 5. Buscar ciclo ativo/pausado correspondente ──────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id = p_conversation_id
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
  ELSIF p_deal_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND deal_id         = p_deal_id
       AND conversation_id IS NULL
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
  ELSE
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id IS NULL
       AND deal_id         IS NULL
       AND cycle_status IN ('active','paused')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    -- Não há ciclo ativo; retornar com was_active=false
    RETURN jsonb_build_object(
      'success', true,
      'cycle_id', NULL,
      'was_active', false,
      'cancelled_operations', 0,
      'cancelled_triggers', 0
    );
  END IF;

  -- ── 6. Encerrar ciclo ────────────────────────────────────────────────────
  UPDATE public.follow_up_cycle_state
     SET cycle_status      = 'stopped',
         stopped_reason    = p_reason,
         stopped_at        = v_now,
         stopped_by_user_id = p_stopped_by_user_id
   WHERE id = v_cycle.id;

  -- ── 7. Cancelar agent_operations pendentes do mesmo ciclo_id ─────────────
  UPDATE public.agent_operations
     SET status = 'cancelled'
   WHERE company_id = p_company_id
     AND cycle_id   = v_cycle.cycle_id
     AND status IN ('queued','paused','needs_reschedule');

  GET DIAGNOSTICS v_cancelled_ops = ROW_COUNT;

  -- ── 8. Cancelar conversation_followup_triggers pendentes ──────────────────
  --    Contexto: mesma empresa + conversa/contato; status pending/due
  IF p_conversation_id IS NOT NULL THEN
    UPDATE public.conversation_followup_triggers
       SET status       = 'cancelled',
           cancelled_at = v_now,
           cancelled_reason = p_reason
     WHERE company_id      = p_company_id
       AND conversation_id = p_conversation_id
       AND status IN ('pending','due');
    GET DIAGNOSTICS v_cancelled_triggers = ROW_COUNT;
  END IF;

  -- ── 9. Marcar eventos abertos do ciclo como stopped ──────────────────────
  UPDATE public.follow_up_events
     SET status         = 'stopped',
         stopped_reason = p_reason
   WHERE cycle_id    = v_cycle.cycle_id
     AND company_id  = p_company_id
     AND status IN ('scheduled','sent','delivered')
     AND responded_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'cycle_id', v_cycle.cycle_id,
    'was_active', true,
    'cancelled_operations', v_cancelled_ops,
    'cancelled_triggers', v_cancelled_triggers
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_stop_follow_up_cycle IS
  'Fase 2 — Encerra ciclo de follow-up ativo, cancela agent_operations e triggers pendentes. Não afeta outros tenants.';

GRANT EXECUTE ON FUNCTION public.rpc_stop_follow_up_cycle TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_stop_follow_up_cycle TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_get_follow_up_state
--    Leitura de estado atual do ciclo para frontend/n8n.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_get_follow_up_state(
  p_company_id      uuid,
  p_contact_id      uuid,
  p_conversation_id uuid DEFAULT NULL,
  p_deal_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact    RECORD;
  v_company    RECORD;
  v_cycle      RECORD;
  v_can_send   jsonb;
BEGIN

  -- ── 1. Validar membership quando chamado por usuário autenticado ──────────
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden: caller is not a member of company %', p_company_id;
    END IF;
  END IF;

  -- ── 2. Validar contato + empresa ─────────────────────────────────────────
  SELECT id, company_id, follow_up_opt_out
    INTO v_contact
    FROM public.contacts
   WHERE id = p_contact_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found: contact % not in company %', p_contact_id, p_company_id;
  END IF;

  -- ── 3. Carregar configurações da empresa ──────────────────────────────────
  SELECT id, follow_up_max_attempts
    INTO v_company
    FROM public.companies
   WHERE id = p_company_id;

  -- ── 4. Buscar ciclo mais recente (qualquer status) ────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id = p_conversation_id
     ORDER BY created_at DESC
     LIMIT 1;
  ELSIF p_deal_id IS NOT NULL THEN
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND deal_id         = p_deal_id
       AND conversation_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1;
  ELSE
    SELECT * INTO v_cycle
      FROM public.follow_up_cycle_state
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND conversation_id IS NULL
       AND deal_id         IS NULL
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  -- ── 5. Chamar rpc_can_send_follow_up para bloco can_send + block_reason ──
  v_can_send := public.rpc_can_send_follow_up(
    p_company_id      := p_company_id,
    p_contact_id      := p_contact_id,
    p_conversation_id := p_conversation_id,
    p_deal_id         := p_deal_id,
    p_channel         := 'whatsapp'
  );

  -- ── 6. Montar retorno ─────────────────────────────────────────────────────
  IF NOT FOUND THEN
    -- Sem ciclo: estado virtual de primeira tentativa
    RETURN jsonb_build_object(
      'cycle_status', NULL,
      'attempt_count', 0,
      'max_attempts', v_company.follow_up_max_attempts,
      'last_follow_sent_at', NULL,
      'next_allowed_at', NULL,
      'has_responded', false,
      'responded_at', NULL,
      'can_send', (v_can_send->>'allowed')::boolean,
      'block_reason', CASE WHEN (v_can_send->>'allowed')::boolean THEN NULL ELSE v_can_send->>'reason' END,
      'opt_out', v_contact.follow_up_opt_out,
      'cycle_id', NULL
    );
  ELSE
    RETURN jsonb_build_object(
      'cycle_status', v_cycle.cycle_status,
      'attempt_count', v_cycle.attempt_count,
      'max_attempts', v_cycle.max_attempts,
      'last_follow_sent_at', v_cycle.last_follow_sent_at,
      'next_allowed_at', v_cycle.next_allowed_at,
      'has_responded', v_cycle.has_responded,
      'responded_at', v_cycle.responded_at,
      'can_send', (v_can_send->>'allowed')::boolean,
      'block_reason', CASE WHEN (v_can_send->>'allowed')::boolean THEN NULL ELSE v_can_send->>'reason' END,
      'opt_out', v_contact.follow_up_opt_out,
      'cycle_id', v_cycle.cycle_id
    );
  END IF;

END;
$$;

COMMENT ON FUNCTION public.rpc_get_follow_up_state IS
  'Fase 2 — Retorna estado atual do ciclo de follow-up incluindo can_send calculado. Consumível por frontend e n8n.';

GRANT EXECUTE ON FUNCTION public.rpc_get_follow_up_state TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_follow_up_state TO service_role;
