-- ============================================================
-- FIX: channel_events_raw RLS policy
-- 
-- A tabela foi criada com RLS ativo mas SEM policies.
-- Resultado: nenhum INSERT funciona (nem service_role se o
-- header apikey estiver incorreto).
--
-- Solução: Adicionar política permissiva para o service_role
-- e uma policy de INSERT para qualquer role autenticada
-- (o n8n pode usar service_role OU uma JWT específica).
-- ============================================================

-- Opção A: Simplesmente desabilitar RLS nesta tabela.
-- É seguro porque:
--   1. Somente o n8n (via service_role) acessa esta tabela
--   2. O frontend nunca faz SELECT nesta tabela
--   3. Não há dados sensíveis de usuário (apenas payloads de webhook)
ALTER TABLE public.channel_events_raw DISABLE ROW LEVEL SECURITY;

-- OU, se preferir manter RLS ativo com policies explícitas:
-- (descomente as linhas abaixo e comente o DISABLE acima)

-- ALTER TABLE public.channel_events_raw ENABLE ROW LEVEL SECURITY;
-- 
-- DROP POLICY IF EXISTS "channel_events_raw_insert_all" ON public.channel_events_raw;
-- CREATE POLICY "channel_events_raw_insert_all" ON public.channel_events_raw
--   FOR INSERT
--   WITH CHECK (true);
-- 
-- DROP POLICY IF EXISTS "channel_events_raw_select_admin" ON public.channel_events_raw;
-- CREATE POLICY "channel_events_raw_select_admin" ON public.channel_events_raw
--   FOR SELECT
--   USING (public.is_platform_admin());
-- 
-- DROP POLICY IF EXISTS "channel_events_raw_update_all" ON public.channel_events_raw;
-- CREATE POLICY "channel_events_raw_update_all" ON public.channel_events_raw
--   FOR UPDATE
--   USING (true);
