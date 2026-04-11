-- ============================================================
-- FIX: RLS em messages — permitir leitura para company_memberships
-- A policy "Messages isolation" só verificava user_companies.
-- Usuários em company_memberships (Etapa 2) não conseguiam ver mensagens.
-- ============================================================

DROP POLICY IF EXISTS "Messages isolation" ON public.messages;

CREATE POLICY "Messages isolation" ON public.messages
FOR ALL
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.company_memberships cm ON cm.company_id = c.company_id
    WHERE c.id = messages.conversation_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.user_companies uc ON uc.company_id = c.company_id
    WHERE c.id = messages.conversation_id
      AND uc.user_id = auth.uid()
  )
);
