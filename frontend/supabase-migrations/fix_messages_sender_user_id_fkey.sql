-- FIX: messages_sender_user_id_fkey viola quando o UUID do agente não existe em user_profiles
--
-- CAUSA: rpc_save_human_message insere em messages com sender_user_id = p_sender_id.
-- O p_sender_id vem do frontend (auth.uid() do agente logado), que pode existir em
-- auth.users mas ainda não ter registro em user_profiles (janela de criação de perfil,
-- migração de contas, criação via invite sem perfil completo, etc.).
--
-- SOLUÇÃO: drop a FK e mantém a coluna nullable. O UUID continua armazenado como dado
-- informativo sem enforcement de integridade referencial. Mesmo padrão aplicado em
-- fix_audit_logs_actor_fk.sql — messages é append-only de auditoria.
-- ============================================================

DO $$
BEGIN
  -- 1. Remove NOT NULL de sender_user_id se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sender_user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.messages ALTER COLUMN sender_user_id DROP NOT NULL;
  END IF;

  -- 2. Dropa a FK messages_sender_user_id_fkey
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND constraint_name = 'messages_sender_user_id_fkey'
  ) THEN
    ALTER TABLE public.messages DROP CONSTRAINT messages_sender_user_id_fkey;
  END IF;

  -- 3. Variante com sufixo diferente (caso o constraint tenha outro nome gerado)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND constraint_name LIKE '%sender_user_id%fkey%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.messages DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'messages'
        AND constraint_name LIKE '%sender_user_id%fkey%'
      LIMIT 1
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
