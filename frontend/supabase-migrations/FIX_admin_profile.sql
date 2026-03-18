-- ============================================================
-- FIX: Admin aparece como "agent" e não vê tenants
-- ============================================================
-- O AuthContext lê system_role de user_profiles. Se estiver 'agent',
-- o usuário é tratado como agente e não vê a área admin.
--
-- INSTRUÇÕES:
-- 1. Substitua 'SEU_EMAIL@exemplo.com' pelo seu email de admin
-- 2. Execute no SQL Editor do Supabase
-- ============================================================

-- Atualiza system_role para platform_admin (ou cria o perfil se não existir)
INSERT INTO public.user_profiles (id, full_name, system_role)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), 
  'platform_admin'
FROM auth.users 
WHERE email = 'hemerson@admin.com.br'  -- ALTERE para seu email se diferente
ON CONFLICT (id) DO UPDATE 
SET system_role = 'platform_admin';
