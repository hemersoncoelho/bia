-- =============================================================================
-- RPCs para aceitar / descartar conversation_followup_triggers a partir do frontend
--
-- A tabela tem UPDATE bloqueado por RLS (USING FALSE) — apenas RPCs SECURITY
-- DEFINER podem alterar o status. Concedemos EXECUTE para authenticated.
-- =============================================================================

-- ── 1. rpc_process_followup_trigger ─────────────────────────────────────────
-- Marca o trigger como 'processed' (aceito pelo humano → tarefa criada).

CREATE OR REPLACE FUNCTION public.rpc_process_followup_trigger(
  p_company_id  UUID,
  p_trigger_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE public.conversation_followup_triggers
  SET
    status       = 'processed',
    processed_at = NOW(),
    updated_at   = NOW()
  WHERE id         = p_trigger_id
    AND company_id = p_company_id
    AND status     = 'pending';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'trigger_not_found_or_not_pending');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_process_followup_trigger(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_process_followup_trigger(UUID, UUID) FROM anon;

-- ── 2. rpc_cancel_followup_trigger ──────────────────────────────────────────
-- Marca o trigger como 'cancelled' (descartado pelo humano).

CREATE OR REPLACE FUNCTION public.rpc_cancel_followup_trigger(
  p_company_id     UUID,
  p_trigger_id     UUID,
  p_cancel_reason  TEXT DEFAULT 'dismissed_by_user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE public.conversation_followup_triggers
  SET
    status          = 'cancelled',
    cancelled_at    = NOW(),
    cancelled_reason = p_cancel_reason,
    updated_at      = NOW()
  WHERE id         = p_trigger_id
    AND company_id = p_company_id
    AND status     = 'pending';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'trigger_not_found_or_not_pending');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_followup_trigger(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_cancel_followup_trigger(UUID, UUID, TEXT) FROM anon;
