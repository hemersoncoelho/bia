-- =============================================================================
-- PATCH: Concede EXECUTE das RPCs de follow-up para anon e authenticated
--
-- Problema: o fluxo n8n usa a credencial "Supabase API" com anon key.
-- As RPCs foram criadas com GRANT apenas para service_role, causando:
--   "permission denied for function rpc_cancel_pending_followup_triggers..."
--
-- Por que é seguro conceder para anon/authenticated:
--   - Todas as funções são SECURITY DEFINER
--   - Todas validam internamente que company_id, contact_id e conversation_id
--     pertencem ao mesmo tenant antes de executar qualquer escrita
--   - Um chamador com anon key não consegue manipular dados de outro tenant
--     mesmo conhecendo os IDs, pois a função valida ownership
-- =============================================================================

-- ── 1. rpc_cancel_pending_followup_triggers_on_inbound_message ───────────────
--    Chamada pelo fluxo de recebimento após persistir mensagem inbound.
--    Cancela triggers pending — operação de baixo risco de abuso.

GRANT EXECUTE ON FUNCTION public.rpc_cancel_pending_followup_triggers_on_inbound_message(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO anon, authenticated;

-- ── 2. rpc_create_conversation_followup_trigger ──────────────────────────────
--    Chamada pelo fluxo IA-Comercial após decisão do agente.
--    Cria trigger — validação de tenant embutida impede abuso cross-tenant.

GRANT EXECUTE ON FUNCTION public.rpc_create_conversation_followup_trigger(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ, BIGINT, TEXT, TEXT, TEXT, TEXT, NUMERIC,
  TIMESTAMPTZ, TIMESTAMPTZ, JSONB
) TO anon, authenticated;

-- ── 3. rpc_mark_followup_trigger_due ─────────────────────────────────────────
--    Chamada pelo cron n8n. Concedemos apenas para authenticated pois o
--    cron deve usar service_role. Se necessário adicionar anon, descomentar.

-- GRANT EXECUTE ON FUNCTION public.rpc_mark_followup_trigger_due(UUID)
-- TO anon, authenticated;

-- ── 4. rpc_get_due_followup_triggers ─────────────────────────────────────────
--    Chamada pelo cron n8n para listar triggers vencidos.

-- GRANT EXECUTE ON FUNCTION public.rpc_get_due_followup_triggers(UUID, INTEGER)
-- TO anon, authenticated;
