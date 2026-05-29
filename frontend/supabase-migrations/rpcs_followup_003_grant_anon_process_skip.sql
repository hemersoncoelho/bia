-- =============================================================================
-- PATCH: Grant EXECUTE para anon nas RPCs que o workflow n8n
--        [Process Due Followup Triggers] chama com anon key.
--
-- Problema: rpc_n8n_process_due_trigger e rpc_n8n_skip_due_trigger foram
-- criados com REVOKE de anon, mas a credencial "Supabase API" no n8n usa
-- anon key. Resultado: trigger processado nunca é marcado como 'processed',
-- causando reenvio em loop a cada 1 minuto.
--
-- Por que é seguro conceder para anon:
--   - Ambas as funções são SECURITY DEFINER
--   - Validam internamente company_id + trigger_id (tenant isolation)
--   - Operações de escrita são restritas ao próprio tenant
--   - Segue o mesmo padrão de rpcs_followup_002_grant_anon.sql
-- =============================================================================

-- ── 1. rpc_n8n_process_due_trigger ───────────────────────────────────────────
--    Marca trigger due/pending como 'processed' após envio bem-sucedido.

GRANT EXECUTE ON FUNCTION public.rpc_n8n_process_due_trigger(uuid, uuid)
  TO anon, authenticated;

-- ── 2. rpc_n8n_skip_due_trigger ──────────────────────────────────────────────
--    Marca trigger como 'skipped' quando rpc_can_send_follow_up retorna
--    allowed=false. Sem este grant, triggers bloqueados ficam presos em 'due'.

GRANT EXECUTE ON FUNCTION public.rpc_n8n_skip_due_trigger(uuid, uuid, text)
  TO anon, authenticated;

-- ── 3. rpc_register_follow_up_sent ───────────────────────────────────────────
--    Registra o evento de envio no ledger (rastreabilidade de métricas).
--    Já tem grant para authenticated e service_role; faltava anon.

GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_sent(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid,
  text, text, bigint, text, text, integer, integer, jsonb
) TO anon;

-- ── 4. rpc_stop_follow_up_cycle ──────────────────────────────────────────────
--    Chamado no caminho de bloqueio (max_attempts, opt_out).
--    Já tem grant para authenticated e service_role; faltava anon.

GRANT EXECUTE ON FUNCTION public.rpc_stop_follow_up_cycle(
  uuid, uuid, uuid, uuid, text, uuid
) TO anon;
