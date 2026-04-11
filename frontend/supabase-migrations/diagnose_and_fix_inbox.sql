-- ============================================================
-- DIAGNÓSTICO + CORREÇÃO DEFINITIVA: Fluxo Inbox / Mensagens
-- Executar no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- SEÇÃO 1: DIAGNÓSTICO — execute primeiro para validar as hipóteses
-- ════════════════════════════════════════════════════════════

-- [H1] Conversas com preview mas SEM mensagens reais
--      Hipótese: last_message_preview preenchido sem INSERT em messages
SELECT
  c.id             AS conversation_id,
  c.company_id,
  c.last_message_preview,
  c.last_message_at,
  COUNT(m.id)      AS msg_count
FROM public.conversations c
LEFT JOIN public.messages m ON m.conversation_id = c.id
WHERE c.last_message_preview IS NOT NULL
GROUP BY c.id, c.company_id, c.last_message_preview, c.last_message_at
HAVING COUNT(m.id) = 0
ORDER BY c.last_message_at DESC NULLS LAST;

-- [H2] Mensagens existentes por conversa (valida que a timeline tem dados)
SELECT
  m.conversation_id,
  COUNT(*)          AS total_messages,
  MAX(m.created_at) AS last_at,
  array_agg(DISTINCT m.sender_type) AS sender_types
FROM public.messages m
GROUP BY m.conversation_id
ORDER BY last_at DESC NULLS LAST
LIMIT 20;

-- [H3] Mensagens recentes — verificar sender_type, company_id, direction
SELECT
  m.id,
  m.conversation_id,
  m.sender_type,
  m.sender_user_id,
  m.direction,
  m.status,
  m.company_id,
  m.is_internal,
  LEFT(m.body, 80) AS body_preview,
  m.created_at
FROM public.messages m
ORDER BY m.created_at DESC
LIMIT 30;

-- [H4] Integração WhatsApp ativa por empresa
SELECT
  ai.company_id,
  c.name           AS company_name,
  ai.provider,
  ai.instance_id,
  ai.status,
  ai.is_connected,
  ai.instance_token IS NOT NULL AS has_token,
  ai.last_connected_at
FROM public.app_integrations ai
JOIN public.companies c ON c.id = ai.company_id
WHERE ai.provider = 'uazapi'
ORDER BY ai.created_at DESC;

-- [H5] contact_identities — verificar se channel_type está preenchido
--      Legados usam apenas provider/identifier sem channel_type
SELECT
  ci.id,
  ci.contact_id,
  ci.provider,
  ci.identifier,
  ci.channel_type,
  ci.normalized_value,
  ci.display_value,
  c.full_name AS contact_name,
  c.company_id
FROM public.contact_identities ci
JOIN public.contacts c ON c.id = ci.contact_id
ORDER BY ci.created_at DESC
LIMIT 30;

-- [H6] contact_identities SEM channel_type (legados — impede envio WhatsApp)
SELECT
  ci.id,
  ci.contact_id,
  c.full_name AS contact_name,
  c.company_id,
  ci.provider,
  ci.identifier
FROM public.contact_identities ci
JOIN public.contacts c ON c.id = ci.contact_id
WHERE ci.channel_type IS NULL;

-- [H7] Policies ativas em messages (verificar RLS)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('messages', 'conversations', 'contact_identities', 'contacts')
ORDER BY tablename, policyname;

-- [H8] Mensagens sem company_id (podem ser invisíveis pela policy messages_all)
SELECT COUNT(*) AS messages_sem_company_id
FROM public.messages
WHERE company_id IS NULL;


-- ════════════════════════════════════════════════════════════
-- SEÇÃO 2: CORREÇÕES — execute após confirmar os diagnósticos
-- ════════════════════════════════════════════════════════════

-- FIX A: Backfill company_id em mensagens órfãs
--        (mensagens criadas por versões antigas da RPC sem company_id)
UPDATE public.messages m
SET company_id = c.company_id
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.company_id IS NULL;

-- FIX B: Backfill channel_type — NÃO NECESSÁRIO
-- A tabela contact_identities já usa o schema novo (channel_type, normalized_value).
-- A coluna 'provider' não existe no banco live. Backfill ignorado automaticamente.


-- FIX C: Garante que a policy de messages usa is_company_member
-- Remove versões antigas e recria a definitiva
DROP POLICY IF EXISTS "Messages isolation" ON public.messages;
DROP POLICY IF EXISTS "messages_select"    ON public.messages;
DROP POLICY IF EXISTS "messages_insert"    ON public.messages;
DROP POLICY IF EXISTS "messages_update"    ON public.messages;
DROP POLICY IF EXISTS "messages_all"       ON public.messages;

CREATE POLICY "messages_all" ON public.messages
FOR ALL
USING (
  public.is_platform_admin()
  OR public.is_company_member(messages.company_id)
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND public.is_company_member(c.company_id)
  )
);

-- FIX D: Garante que conversations RLS usa is_company_member
DROP POLICY IF EXISTS "Conversations isolation" ON public.conversations;

CREATE POLICY "Conversations isolation" ON public.conversations
FOR ALL
USING (
  public.is_platform_admin()
  OR public.is_company_member(conversations.company_id)
);


-- ════════════════════════════════════════════════════════════
-- SEÇÃO 3: VALIDAÇÃO PÓS-CORREÇÃO
-- ════════════════════════════════════════════════════════════

-- Verifica que não há mais mensagens sem company_id
SELECT COUNT(*) AS mensagens_sem_company_id_restantes
FROM public.messages
WHERE company_id IS NULL;

-- Verifica que não há mais contact_identities sem channel_type para WhatsApp
SELECT COUNT(*) AS identities_sem_channel_type
FROM public.contact_identities
WHERE channel_type IS NULL AND provider = 'whatsapp';

-- Confirma que a integração está com status correto
SELECT company_id, status, is_connected, instance_token IS NOT NULL AS has_token
FROM public.app_integrations
WHERE provider = 'uazapi';
