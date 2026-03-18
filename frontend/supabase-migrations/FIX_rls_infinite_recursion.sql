-- ============================================================
-- HOTFIX: Infinite recursion in RLS SELECT policy on user_profiles
--
-- Root cause: The SELECT policy on user_profiles contained a
-- recursive self-reference:
--   EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() ...)
-- This caused PostgreSQL to throw:
--   ERROR 42P17: infinite recursion detected in policy for relation "user_profiles"
-- The AuthContext caught this error and fell back to role='agent',
-- making all users (including MASTER ADM) appear as agents after login.
--
-- Additional recursive policies found and fixed:
--   - user_companies SELECT: same pattern
--   - companies SELECT (old "Users can view their own companies"): same pattern
--   - app_integrations SELECT: same pattern
--   - notes/tasks ALL: legacy policies superseded by specific ones
--
-- All replacements use SECURITY DEFINER functions (is_platform_admin,
-- shares_company_with, is_company_member, is_company_admin_for) which
-- bypass RLS internally and never cause recursion.
-- ============================================================

-- ============================================================
-- 1. CRITICAL: Fix user_profiles SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "Users can view profiles in their companies" ON public.user_profiles;

CREATE POLICY "user_profiles_select" ON public.user_profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_platform_admin()
  OR public.shares_company_with(id)
);

-- ============================================================
-- 2. Fix user_companies SELECT policy (also had recursive user_profiles subquery)
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_companies;

CREATE POLICY "user_companies_select" ON public.user_companies
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_platform_admin()
  OR public.is_company_admin_for(company_id)
);

-- ============================================================
-- 3. Drop duplicate companies SELECT policy
--    (companies_select already exists with correct is_platform_admin() logic)
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;

-- ============================================================
-- 4. Fix app_integrations SELECT policy (had inline user_profiles subquery)
-- ============================================================
DROP POLICY IF EXISTS "Users can view integrations for their companies" ON public.app_integrations;

CREATE POLICY "app_integrations_select" ON public.app_integrations
FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR public.is_company_member(company_id)
);

-- ============================================================
-- 5. Drop legacy ALL policies superseded by specific policies
--    (they also contained inline user_profiles subqueries)
-- ============================================================
DROP POLICY IF EXISTS "Company members can manage notes" ON public.notes;
DROP POLICY IF EXISTS "Company members can manage tasks" ON public.tasks;
