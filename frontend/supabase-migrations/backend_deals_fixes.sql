-- Permite deals sem contato vinculado e sistema_admin criar deals
-- 1. contact_id opcional (permite criar negócio sem contato)
ALTER TABLE public.deals ALTER COLUMN contact_id DROP NOT NULL;

-- 2. Incluir system_admin na política de INSERT de deals
DROP POLICY IF EXISTS "deals_insert" ON public.deals;
CREATE POLICY "deals_insert" ON public.deals FOR INSERT WITH CHECK (
  is_platform_admin()
  OR (SELECT get_my_system_role() = 'system_admin')
  OR has_any_company_role(company_id, ARRAY['company_admin','manager'])
  OR (
    has_company_role(company_id, 'agent')
    AND ((owner_user_id IS NULL) OR (owner_user_id = auth.uid()))
  )
);
