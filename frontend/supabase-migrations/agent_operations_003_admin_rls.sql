-- =============================================================
-- agent_operations_003_admin_rls.sql
-- Adiciona política RLS para system_admin e platform_admin
-- lerem agent_operations de qualquer empresa.
-- Necessário para o painel em MODO DELEGADO (suporte) funcionar.
-- =============================================================

-- Leitura irrestrita para admins de plataforma (MODO DELEGADO)
-- Usa is_platform_admin() — padrão do codebase, evita cast direto do enum app_role
CREATE POLICY "agent_operations: platform admins read all"
  ON agent_operations FOR SELECT TO authenticated
  USING (public.is_platform_admin());
