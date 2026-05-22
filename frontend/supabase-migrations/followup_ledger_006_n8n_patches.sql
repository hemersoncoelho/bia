-- =============================================================================
-- followup_ledger_006_n8n_patches.sql
--
-- Fase 3 — Patches para integração n8n + Follow-up Ledger.
--
-- Mudanças:
--   1. rpc_n8n_process_due_trigger   — marca trigger 'due' como 'processed'
--   2. rpc_n8n_skip_due_trigger       — marca trigger 'due' como 'skipped'
--   3. Adiciona rpc_stop_follow_up_cycle em RPCs de CRM (deal won/lost, etc.)
--      para encerrar ciclos automaticamente quando eventos comerciais ocorrem.
--
-- Dependências (devem estar aplicadas):
--   - followup_ledger_005_core_rpcs.sql   (rpc_stop_follow_up_cycle)
--   - followup_triggers_001.sql           (conversation_followup_triggers)
--   - rpcs_followup_001.sql               (rpc_create_conversation_followup_trigger)
--   - rpc_mark_deal_won_lost.sql          (rpc_mark_deal_won, rpc_mark_deal_lost)
--   - backend_conversation_hub.sql        (rpc_close_conversation)
--
-- Credencial n8n: service_role key obrigatória para todas as RPCs deste arquivo.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_n8n_process_due_trigger
--    Marca trigger 'due' (ou 'pending') como 'processed'.
--    Chamada pelo n8n após envio bem-sucedido do follow-up.
--    Aceita 'due' OU 'pending' para cobrir casos de corrida.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_n8n_process_due_trigger(
  p_company_id uuid,
  p_trigger_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN

  UPDATE public.conversation_followup_triggers
     SET status       = 'processed',
         processed_at = now(),
         updated_at   = now()
   WHERE id         = p_trigger_id
     AND company_id = p_company_id
     AND status     IN ('due', 'pending');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Pode estar já processado (idempotência) ou não encontrado
    RETURN jsonb_build_object(
      'success', true,
      'updated', false,
      'note', 'trigger_not_found_or_already_processed'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', true);

END;
$$;

COMMENT ON FUNCTION public.rpc_n8n_process_due_trigger IS
  'Fase 3 — Marca trigger due/pending como processed após envio bem-sucedido. Chamado pelo n8n Process Due Followup Triggers.';

REVOKE EXECUTE ON FUNCTION public.rpc_n8n_process_due_trigger(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_n8n_process_due_trigger(uuid, uuid) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_n8n_skip_due_trigger
--    Marca trigger 'due' (ou 'pending') como 'skipped' com reason.
--    Chamada quando rpc_can_send_follow_up retorna allowed=false
--    e o n8n decide descartar a tentativa atual.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_n8n_skip_due_trigger(
  p_company_id uuid,
  p_trigger_id uuid,
  p_reason     text DEFAULT 'follow_up_blocked'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN

  UPDATE public.conversation_followup_triggers
     SET status          = 'skipped',
         cancelled_at    = now(),
         cancelled_reason = p_reason,
         updated_at      = now()
   WHERE id         = p_trigger_id
     AND company_id = p_company_id
     AND status     IN ('due', 'pending');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'updated', false,
      'note', 'trigger_not_found_or_not_skippable'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', true);

END;
$$;

COMMENT ON FUNCTION public.rpc_n8n_skip_due_trigger IS
  'Fase 3 — Marca trigger due/pending como skipped (allowed=false). Chamado pelo n8n Process Due Followup Triggers quando follow-up é bloqueado.';

REVOKE EXECUTE ON FUNCTION public.rpc_n8n_skip_due_trigger(uuid, uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_n8n_skip_due_trigger(uuid, uuid, text) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_mark_deal_won — patch para encerrar ciclo de follow-up
--    Reutiliza a lógica existente e adiciona chamada a rpc_stop_follow_up_cycle.
--    A função original é substituída por esta versão que inclui o stop.
--
-- ATENÇÃO: Este CREATE OR REPLACE sobrescreve a versão existente.
--          Validar que os parâmetros são compatíveis com rpc_mark_deal_won.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Verifica se rpc_mark_deal_won existe antes de tentar modificá-la.
  -- Se não existir, documenta pendência sem quebrar a migration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_mark_deal_won'
  ) THEN
    RAISE NOTICE 'rpc_mark_deal_won não encontrada — stop cycle em deal_won requer integração manual via n8n';
  END IF;
END;
$$;

-- O patch abaixo é aplicado APENAS se rpc_mark_deal_won aceitar os parâmetros
-- (p_company_id uuid, p_deal_id uuid). Ajustar assinatura se diferente.
-- Por segurança, o stop cycle é encapsulado em BEGIN/EXCEPTION para não
-- quebrar o deal mesmo que o stop falhe.

CREATE OR REPLACE FUNCTION public.rpc_mark_deal_won(
  p_deal_id    uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal     RECORD;
  v_stop_res jsonb;
BEGIN

  -- ── 1. Validar deal pertence à empresa ──────────────────────────────────
  SELECT id, contact_id, conversation_id, status
    INTO v_deal
    FROM public.deals
   WHERE id = p_deal_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'deal_not_found');
  END IF;

  IF v_deal.status = 'won' THEN
    RETURN jsonb_build_object('success', true, 'note', 'already_won');
  END IF;

  -- ── 2. Fechar deal como ganho ────────────────────────────────────────────
  UPDATE public.deals
     SET status    = 'won',
         closed_at = now()
   WHERE id = p_deal_id AND company_id = p_company_id;

  -- ── 3. Encerrar ciclo de follow-up associado (best-effort) ──────────────
  BEGIN
    v_stop_res := public.rpc_stop_follow_up_cycle(
      p_company_id      := p_company_id,
      p_contact_id      := v_deal.contact_id,
      p_conversation_id := v_deal.conversation_id,
      p_deal_id         := p_deal_id,
      p_reason          := 'deal_won'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Stop cycle falhou: deal já foi fechado; não reverter
    v_stop_res := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'success',    true,
    'deal_id',    p_deal_id,
    'closed_at',  now(),
    'stop_cycle', v_stop_res
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_mark_deal_won IS
  'Fecha deal como won. Patch Fase 3: encerra ciclo de follow-up associado via rpc_stop_cycle(deal_won).';

GRANT EXECUTE ON FUNCTION public.rpc_mark_deal_won(uuid, uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_mark_deal_lost — patch para encerrar ciclo de follow-up
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_mark_deal_lost'
  ) THEN
    RAISE NOTICE 'rpc_mark_deal_lost não encontrada — stop cycle em deal_lost requer integração manual via n8n';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_deal_lost(
  p_deal_id     uuid,
  p_company_id  uuid,
  p_loss_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal     RECORD;
  v_stop_res jsonb;
BEGIN

  SELECT id, contact_id, conversation_id, status
    INTO v_deal
    FROM public.deals
   WHERE id = p_deal_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'deal_not_found');
  END IF;

  IF v_deal.status = 'lost' THEN
    RETURN jsonb_build_object('success', true, 'note', 'already_lost');
  END IF;

  UPDATE public.deals
     SET status      = 'lost',
         closed_at   = now(),
         loss_reason = NULLIF(TRIM(COALESCE(p_loss_reason, '')), '')
   WHERE id = p_deal_id AND company_id = p_company_id;

  BEGIN
    v_stop_res := public.rpc_stop_follow_up_cycle(
      p_company_id      := p_company_id,
      p_contact_id      := v_deal.contact_id,
      p_conversation_id := v_deal.conversation_id,
      p_deal_id         := p_deal_id,
      p_reason          := 'deal_lost'
    );
  EXCEPTION WHEN OTHERS THEN
    v_stop_res := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'success',      true,
    'deal_id',      p_deal_id,
    'closed_at',    now(),
    'loss_reason',  p_loss_reason,
    'stop_cycle',   v_stop_res
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_mark_deal_lost IS
  'Fecha deal como lost. Patch Fase 3: encerra ciclo de follow-up associado via rpc_stop_cycle(deal_lost).';

GRANT EXECUTE ON FUNCTION public.rpc_mark_deal_lost(uuid, uuid, text) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_n8n_set_attendance_mode — patch para human_took_over
--    Substitui a versão 3-param por uma versão 5-param compatível.
--    DROP necessário porque adicionar parâmetros cria overload duplicado.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove a versão antiga (3 params) para evitar overload duplicado
DROP FUNCTION IF EXISTS public.rpc_n8n_set_attendance_mode(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_n8n_set_attendance_mode(
  p_company_id      uuid,
  p_conversation_id uuid,
  p_mode            text,
  p_agent_id        uuid DEFAULT NULL,
  p_team_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv     RECORD;
  v_msg_body text;
  v_stop_res jsonb;
BEGIN

  -- ── 1. Validar parâmetros ────────────────────────────────────────────────
  IF p_company_id IS NULL OR p_conversation_id IS NULL OR p_mode IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_required_params');
  END IF;

  IF p_mode NOT IN ('human', 'ai', 'hybrid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
  END IF;

  -- ── 2. Validar conversa ──────────────────────────────────────────────────
  SELECT id, company_id, contact_id, attendance_mode
    INTO v_conv
    FROM public.conversations
   WHERE id = p_conversation_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'conversation_not_found');
  END IF;

  -- ── 3. Atualizar attendance_mode + agente/time opcionais ─────────────────
  UPDATE public.conversations
     SET attendance_mode   = p_mode::public.attendance_mode_enum,
         ai_paused_at      = CASE WHEN p_mode = 'human' THEN now() ELSE NULL END,
         assigned_agent_id = CASE WHEN p_agent_id IS NOT NULL THEN p_agent_id ELSE assigned_agent_id END,
         assigned_team_id  = CASE WHEN p_team_id  IS NOT NULL THEN p_team_id  ELSE assigned_team_id  END,
         updated_at        = now()
   WHERE id = p_conversation_id AND company_id = p_company_id;

  -- ── 4. Mensagem interna de auditoria ──────────────────────────────────────
  v_msg_body := CASE p_mode
    WHEN 'human'  THEN 'Atendimento transferido para um agente humano.'
    WHEN 'ai'     THEN 'Atendimento retomado pela IA.'
    WHEN 'hybrid' THEN 'Modo híbrido ativado: IA auxiliando o atendimento.'
    ELSE                'Modo de atendimento alterado para ' || p_mode || '.'
  END;

  INSERT INTO public.messages (
    company_id, conversation_id, contact_id,
    direction, message_type, sender_type, body, payload, status, is_internal, created_at
  ) VALUES (
    p_company_id, p_conversation_id, v_conv.contact_id,
    'outbound'::public.message_direction_enum, 'text',
    'bot'::public.sender_type_enum, v_msg_body, '{}'::jsonb,
    'sent'::public.message_status_enum, true, now()
  );

  -- ── 5. Se modo 'human': encerrar ciclo de follow-up (best-effort) ────────
  IF p_mode = 'human' THEN
    BEGIN
      v_stop_res := public.rpc_stop_follow_up_cycle(
        p_company_id      := p_company_id,
        p_contact_id      := v_conv.contact_id,
        p_conversation_id := p_conversation_id,
        p_reason          := 'human_took_over'
      );
    EXCEPTION WHEN OTHERS THEN
      v_stop_res := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'conversation_id', p_conversation_id,
    'mode',            p_mode,
    'stop_cycle',      v_stop_res
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.rpc_n8n_set_attendance_mode IS
  'Altera attendance_mode de conversa. Patch Fase 3: quando modo=human, encerra ciclo de follow-up via rpc_stop_cycle(human_took_over). Apenas service_role.';

REVOKE EXECUTE ON FUNCTION public.rpc_n8n_set_attendance_mode(uuid, uuid, text, uuid, uuid) FROM anon, public, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_n8n_set_attendance_mode(uuid, uuid, text, uuid, uuid) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. rpc_n8n_update_deal_stage — patch para deal_stage_changed
--    Quando deal avança de etapa, encerrar ciclo se configurado.
--    DROP necessário: terceiro param renomeado de p_new_stage_id → p_pipeline_stage_id
--    e novo quarto param adicionado. CREATE OR REPLACE não substitui overload diferente.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove versão antiga (3 params) para evitar overload fantasma no schema
DROP FUNCTION IF EXISTS public.rpc_n8n_update_deal_stage(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_n8n_update_deal_stage(
  p_company_id       uuid,
  p_deal_id          uuid,
  p_pipeline_stage_id uuid,
  p_stop_follow_up   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal     RECORD;
  v_stage    RECORD;
  v_stop_res jsonb;
BEGIN

  -- ── 1. Validar deal ──────────────────────────────────────────────────────
  SELECT id, company_id, contact_id, conversation_id, status
    INTO v_deal
    FROM public.deals
   WHERE id = p_deal_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'deal_not_found');
  END IF;

  IF v_deal.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'deal_not_open');
  END IF;

  -- ── 2. Validar stage ─────────────────────────────────────────────────────
  SELECT id INTO v_stage
    FROM public.pipeline_stages
   WHERE id = p_pipeline_stage_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'stage_not_found');
  END IF;

  -- ── 3. Mover deal ────────────────────────────────────────────────────────
  UPDATE public.deals
     SET pipeline_stage_id = p_pipeline_stage_id,
         updated_at        = now()
   WHERE id = p_deal_id AND company_id = p_company_id;

  -- ── 4. Stop follow-up se solicitado (best-effort) ────────────────────────
  IF p_stop_follow_up THEN
    BEGIN
      v_stop_res := public.rpc_stop_follow_up_cycle(
        p_company_id      := p_company_id,
        p_contact_id      := v_deal.contact_id,
        p_conversation_id := v_deal.conversation_id,
        p_deal_id         := p_deal_id,
        p_reason          := 'deal_stage_changed'
      );
    EXCEPTION WHEN OTHERS THEN
      v_stop_res := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',   true,
    'deal_id',   p_deal_id,
    'stage_id',  p_pipeline_stage_id,
    'stop_cycle', v_stop_res
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_n8n_update_deal_stage IS
  'Move deal para novo estágio. Patch Fase 3: encerra ciclo de follow-up se p_stop_follow_up=true. Apenas service_role.';

REVOKE EXECUTE ON FUNCTION public.rpc_n8n_update_deal_stage(uuid, uuid, uuid, boolean) FROM anon, public, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_n8n_update_deal_stage(uuid, uuid, uuid, boolean) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Notificar PostgREST para recarregar schema
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
