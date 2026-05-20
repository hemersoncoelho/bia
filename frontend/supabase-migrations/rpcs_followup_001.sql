-- =============================================================================
-- FASE 4 — RPCs seguras para triggers, cancelamentos e tarefas da IA
--
-- Todas as funções são SECURITY DEFINER para que o n8n (service_role key)
-- possa chamá-las sem passar por RLS. Mesmo assim, cada função valida
-- explicitamente que os IDs informados pertencem ao company_id declarado.
--
-- RPCs criadas:
--   1. rpc_create_conversation_followup_trigger
--   2. rpc_cancel_pending_followup_triggers_on_inbound_message
--   3. rpc_create_ai_followup_task
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. rpc_create_conversation_followup_trigger
--    Registra que uma conversa passou a aguardar resposta do contato.
--    Chamado pelo n8n imediatamente após o agente de IA identificar
--    que a última mensagem requer resposta do contato.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_create_conversation_followup_trigger(
  p_company_id                      UUID,
  p_contact_id                      UUID,
  p_conversation_id                 UUID,
  p_trigger_type                    TEXT,
  p_expected_reply_until            TIMESTAMPTZ,
  p_created_from_message_id         BIGINT      DEFAULT NULL,
  p_detected_event                  TEXT        DEFAULT NULL,
  p_reason                          TEXT        DEFAULT NULL,
  p_recommended_action              TEXT        DEFAULT NULL,
  p_recommended_message             TEXT        DEFAULT NULL,
  p_ai_confidence                   NUMERIC     DEFAULT NULL,
  p_last_inbound_message_at_snapshot  TIMESTAMPTZ DEFAULT NULL,
  p_last_outbound_message_at_snapshot TIMESTAMPTZ DEFAULT NULL,
  p_metadata                        JSONB       DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_id UUID;
BEGIN

  -- ── Validação 1: company_id existe ──────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'company_not_found');
  END IF;

  -- ── Validação 2: contact_id pertence ao company_id ──────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = p_contact_id AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'contact_not_in_company');
  END IF;

  -- ── Validação 3: conversation_id pertence ao company_id ─────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'conversation_not_in_company');
  END IF;

  -- ── Validação 4: trigger_type válido ────────────────────────────────────
  IF p_trigger_type NOT IN (
    'no_response_after_ai_question',
    'no_response_after_human_message',
    'third_party_decision_followup',
    'asked_to_return_later',
    'qualification_abandoned',
    'post_quote_followup'
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'invalid_trigger_type');
  END IF;

  -- ── Validação 5: expected_reply_until no futuro ──────────────────────────
  IF p_expected_reply_until <= NOW() THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'expected_reply_until_must_be_future');
  END IF;

  -- ── Verificação de duplicidade: já existe trigger pending para este contexto ──
  -- O índice UNIQUE em (conversation_id, trigger_type, detected_event) WHERE status = 'pending'
  -- também garante isso, mas retornamos erro limpo antes de falhar no INSERT.
  IF EXISTS (
    SELECT 1 FROM public.conversation_followup_triggers
    WHERE conversation_id = p_conversation_id
      AND trigger_type     = p_trigger_type::public.followup_trigger_type_enum
      AND COALESCE(detected_event, '') = COALESCE(p_detected_event, '')
      AND status           = 'pending'
  ) THEN
    -- Retorna o id do trigger existente em vez de criar duplicata
    SELECT id INTO v_trigger_id
    FROM public.conversation_followup_triggers
    WHERE conversation_id = p_conversation_id
      AND trigger_type     = p_trigger_type::public.followup_trigger_type_enum
      AND COALESCE(detected_event, '') = COALESCE(p_detected_event, '')
      AND status           = 'pending'
    LIMIT 1;

    RETURN jsonb_build_object(
      'success',    TRUE,
      'trigger_id', v_trigger_id,
      'duplicate',  TRUE
    );
  END IF;

  -- ── Inserção ─────────────────────────────────────────────────────────────
  INSERT INTO public.conversation_followup_triggers (
    company_id,
    contact_id,
    conversation_id,
    trigger_type,
    status,
    expected_reply_until,
    created_from_message_id,
    last_inbound_message_at_snapshot,
    last_outbound_message_at_snapshot,
    detected_event,
    reason,
    recommended_action,
    recommended_message,
    ai_confidence,
    metadata
  ) VALUES (
    p_company_id,
    p_contact_id,
    p_conversation_id,
    p_trigger_type::public.followup_trigger_type_enum,
    'pending',
    p_expected_reply_until,
    p_created_from_message_id,
    p_last_inbound_message_at_snapshot,
    p_last_outbound_message_at_snapshot,
    p_detected_event,
    p_reason,
    p_recommended_action,
    p_recommended_message,
    p_ai_confidence,
    COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_trigger_id;

  RETURN jsonb_build_object(
    'success',    TRUE,
    'trigger_id', v_trigger_id,
    'duplicate',  FALSE
  );

END;
$$;

-- n8n usa service_role key; anon + authenticated não devem chamar diretamente
REVOKE EXECUTE ON FUNCTION public.rpc_create_conversation_followup_trigger(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ, BIGINT, TEXT, TEXT, TEXT, TEXT, NUMERIC,
  TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_create_conversation_followup_trigger(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ, BIGINT, TEXT, TEXT, TEXT, TEXT, NUMERIC,
  TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. rpc_cancel_pending_followup_triggers_on_inbound_message
--    Cancela todos os triggers pending da conversa quando o contato responde.
--    Chamado pelo n8n logo após rpc_persist_inbound_message.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_cancel_pending_followup_triggers_on_inbound_message(
  p_company_id          UUID,
  p_contact_id          UUID,
  p_conversation_id     UUID,
  p_inbound_message_id  UUID        DEFAULT NULL,
  p_inbound_message_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled_count INTEGER;
BEGIN

  -- ── Validação: conversation_id pertence ao company_id ───────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'conversation_not_in_company');
  END IF;

  -- ── Cancelar triggers pending que aguardavam resposta do contato ─────────
  -- Cancela apenas triggers cujo expected_reply_until ainda não venceu
  -- (ou seja, o contato respondeu antes do prazo — caso feliz).
  -- Triggers já vencidos (due/processed) não são revertidos.
  UPDATE public.conversation_followup_triggers
  SET
    status          = 'cancelled',
    cancelled_at    = COALESCE(p_inbound_message_at, NOW()),
    cancelled_reason = 'contact_replied_before_due',
    updated_at      = NOW()
  WHERE
    conversation_id = p_conversation_id
    AND company_id  = p_company_id
    AND status      = 'pending';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',         TRUE,
    'cancelled_count', v_cancelled_count
  );

END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_cancel_pending_followup_triggers_on_inbound_message(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_cancel_pending_followup_triggers_on_inbound_message(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. rpc_create_ai_followup_task
--    Chamado pelo n8n após um trigger vencer e o agente decidir criar tarefa.
--    Cria registro em ai_followup_decisions + registro em tasks atomicamente.
--    Evita duplicidade de tarefa aberta para o mesmo contexto.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_create_ai_followup_task(
  p_company_id              UUID,
  p_contact_id              UUID,
  p_conversation_id         UUID,
  p_followup_trigger_id     UUID        DEFAULT NULL,
  p_detected_event          TEXT        DEFAULT NULL,
  p_title                   TEXT        DEFAULT 'Follow-up pendente',
  p_description             TEXT        DEFAULT NULL,
  p_due_at                  TIMESTAMPTZ DEFAULT NULL,
  p_priority                TEXT        DEFAULT 'normal',
  p_ai_reason               TEXT        DEFAULT NULL,
  p_ai_confidence           NUMERIC     DEFAULT NULL,
  p_recommended_message     TEXT        DEFAULT NULL,
  p_requires_human_approval BOOLEAN     DEFAULT TRUE,
  p_raw_input               JSONB       DEFAULT NULL,
  p_raw_output              JSONB       DEFAULT NULL,
  p_metadata                JSONB       DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision_id UUID;
  v_task_id     UUID;
  v_existing_task_id UUID;
BEGIN

  -- ── Validação 1: company_id existe ──────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'company_not_found');
  END IF;

  -- ── Validação 2: contact_id pertence ao company_id ──────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE id = p_contact_id AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'contact_not_in_company');
  END IF;

  -- ── Validação 3: conversation_id pertence ao company_id ─────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'conversation_not_in_company');
  END IF;

  -- ── Validação 4: followup_trigger_id pertence à conversa (quando informado) ──
  IF p_followup_trigger_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_followup_triggers
      WHERE id            = p_followup_trigger_id
        AND company_id    = p_company_id
        AND conversation_id = p_conversation_id
    ) THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'trigger_not_in_conversation');
    END IF;
  END IF;

  -- ── Validação 5: priority válida ────────────────────────────────────────
  IF p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'invalid_priority');
  END IF;

  -- ── Verificação de duplicidade: tarefa aberta para o mesmo contexto ──────
  -- Evita criar tarefa duplicada quando o n8n re-processa um trigger vencido.
  SELECT id INTO v_existing_task_id
  FROM public.tasks
  WHERE company_id      = p_company_id
    AND conversation_id = p_conversation_id
    AND source_type     IN ('ai', 'followup_trigger')
    AND status          NOT IN ('done', 'cancelled')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success',     TRUE,
      'task_id',     v_existing_task_id,
      'decision_id', NULL,
      'duplicate',   TRUE
    );
  END IF;

  -- ── Criar registro de decisão da IA ──────────────────────────────────────
  INSERT INTO public.ai_followup_decisions (
    company_id,
    contact_id,
    conversation_id,
    followup_trigger_id,
    detected_event,
    recommended_action,
    recommended_message,
    suggested_due_at,
    confidence,
    requires_human_approval,
    status,
    raw_input,
    raw_output
  ) VALUES (
    p_company_id,
    p_contact_id,
    p_conversation_id,
    p_followup_trigger_id,
    p_detected_event,
    'create_task',
    p_recommended_message,
    p_due_at,
    p_ai_confidence,
    p_requires_human_approval,
    'converted_to_task',  -- marcamos diretamente pois criaremos a task abaixo
    p_raw_input,
    p_raw_output
  )
  RETURNING id INTO v_decision_id;

  -- ── Criar tarefa ─────────────────────────────────────────────────────────
  INSERT INTO public.tasks (
    company_id,
    contact_id,
    conversation_id,
    title,
    description,
    due_at,
    status,
    priority,
    source_type,
    source_id,
    ai_generated,
    ai_confidence,
    ai_reason,
    recommended_message,
    metadata
  ) VALUES (
    p_company_id,
    p_contact_id,
    p_conversation_id,
    p_title,
    p_description,
    p_due_at,
    'open',
    p_priority,
    CASE WHEN p_followup_trigger_id IS NOT NULL THEN 'followup_trigger' ELSE 'ai' END,
    COALESCE(p_followup_trigger_id, v_decision_id),
    TRUE,
    p_ai_confidence,
    p_ai_reason,
    p_recommended_message,
    COALESCE(p_metadata, '{}') || jsonb_build_object('decision_id', v_decision_id)
  )
  RETURNING id INTO v_task_id;

  -- ── Marcar trigger como processado (quando informado) ────────────────────
  IF p_followup_trigger_id IS NOT NULL THEN
    UPDATE public.conversation_followup_triggers
    SET
      status       = 'processed',
      processed_at = NOW(),
      updated_at   = NOW()
    WHERE id = p_followup_trigger_id;
  END IF;

  RETURN jsonb_build_object(
    'success',     TRUE,
    'task_id',     v_task_id,
    'decision_id', v_decision_id,
    'duplicate',   FALSE
  );

END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_create_ai_followup_task(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, NUMERIC,
  TEXT, BOOLEAN, JSONB, JSONB, JSONB
) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_create_ai_followup_task(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, NUMERIC,
  TEXT, BOOLEAN, JSONB, JSONB, JSONB
) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. rpc_mark_followup_trigger_due
--    Marca triggers vencidos como 'due' para que o n8n possa listar
--    apenas os que precisam ser processados (evita re-processar).
--    Chamado pelo job de varredura no n8n (cron).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_mark_followup_trigger_due(
  p_company_id UUID DEFAULT NULL  -- NULL = varrer todas as empresas
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked_count INTEGER;
BEGIN

  UPDATE public.conversation_followup_triggers
  SET
    status     = 'due',
    updated_at = NOW()
  WHERE
    status               = 'pending'
    AND expected_reply_until <= NOW()
    AND (p_company_id IS NULL OR company_id = p_company_id);

  GET DIAGNOSTICS v_marked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',       TRUE,
    'marked_as_due', v_marked_count
  );

END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_mark_followup_trigger_due(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_mark_followup_trigger_due(UUID) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. rpc_get_due_followup_triggers
--    Retorna triggers com status 'due' para o n8n processar.
--    O n8n chama esta função, itera os resultados e dispara o agente de IA
--    para cada trigger, passando o contexto atualizado da conversa.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_get_due_followup_triggers(
  p_company_id UUID    DEFAULT NULL,
  p_limit      INTEGER DEFAULT 50
)
RETURNS TABLE (
  trigger_id          UUID,
  company_id          UUID,
  contact_id          UUID,
  conversation_id     UUID,
  trigger_type        TEXT,
  detected_event      TEXT,
  reason              TEXT,
  recommended_action  TEXT,
  recommended_message TEXT,
  ai_confidence       NUMERIC,
  expected_reply_until TIMESTAMPTZ,
  metadata            JSONB,
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.company_id,
    t.contact_id,
    t.conversation_id,
    t.trigger_type::TEXT,
    t.detected_event,
    t.reason,
    t.recommended_action,
    t.recommended_message,
    t.ai_confidence,
    t.expected_reply_until,
    t.metadata,
    t.created_at
  FROM public.conversation_followup_triggers t
  WHERE
    t.status = 'due'
    AND (p_company_id IS NULL OR t.company_id = p_company_id)
  ORDER BY t.expected_reply_until ASC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_get_due_followup_triggers(UUID, INTEGER) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_get_due_followup_triggers(UUID, INTEGER) TO service_role;
