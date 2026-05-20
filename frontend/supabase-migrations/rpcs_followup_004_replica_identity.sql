-- =============================================================================
-- REPLICA IDENTITY FULL para conversation_followup_triggers e ai_followup_decisions
--
-- Necessário para que os filtros de coluna (company_id=eq.X) funcionem
-- corretamente em eventos UPDATE do Supabase Realtime postgres_changes.
-- Sem isso, o filtro não match em UPDATEs e todos os eventos disparam re-fetch.
-- Ref: https://supabase.com/docs/guides/realtime/postgres-changes
-- =============================================================================

ALTER TABLE public.conversation_followup_triggers REPLICA IDENTITY FULL;
ALTER TABLE public.ai_followup_decisions REPLICA IDENTITY FULL;
