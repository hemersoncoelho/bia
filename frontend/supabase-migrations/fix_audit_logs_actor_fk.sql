-- FIX: audit_logs_actor_user_id_fkey viola quando auth.uid() não existe em user_profiles
--
-- CAUSA: há um trigger no banco que insere em audit_logs com actor_user_id = auth.uid().
-- O auth.uid() pode ser um UUID válido em auth.users mas ainda não ter registro
-- em user_profiles (janela de criação de perfil, impersonação, etc.).
--
-- SOLUÇÃO: drop a FK e torna a coluna nullable. O UUID continua armazenado
-- como dado informativo sem enforcement de integridade referencial.
-- Isso não quebra nenhuma funcionalidade — audit_logs é append-only.
-- ============================================================

DO $$
BEGIN
  -- 1. Remove NOT NULL de actor_user_id se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'actor_user_id'
  ) THEN
    ALTER TABLE public.audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;
  END IF;

  -- 2. Remove NOT NULL de actor_id se existir (nome alternativo usado na supabase_audit.sql)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;
  END IF;

  -- 3. Dropa a FK actor_user_id_fkey que viola quando uid não existe em user_profiles
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND constraint_name = 'audit_logs_actor_user_id_fkey'
  ) THEN
    ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_actor_user_id_fkey;
  END IF;

  -- 4. Dropa variante actor_id_fkey pelo mesmo motivo
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND constraint_name = 'audit_logs_actor_id_fkey'
  ) THEN
    ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_actor_id_fkey;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
