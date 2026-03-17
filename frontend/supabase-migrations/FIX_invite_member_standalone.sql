-- ============================================================
-- FIX: rpc_invite_member — Execute no Supabase SQL Editor
-- ============================================================
-- Este script cria a função rpc_invite_member e dependências.
-- Copie e cole no Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1. Funções auxiliares (necessárias para rpc_invite_member)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT up.system_role::TEXT = 'platform_admin'
     FROM public.user_profiles up WHERE up.id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = auth.uid()
  ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.has_any_company_role(p_company_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id
      AND uc.user_id = auth.uid()
      AND uc.role_in_company::TEXT = ANY(p_roles)
  ) OR public.is_platform_admin();
$$;

-- 2. Tabela teams (se não existir — rpc_invite_member referencia team_id)
CREATE TABLE IF NOT EXISTS public.teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  manager_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, slug)
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT USING (
  public.is_company_member(company_id)
);

DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams FOR INSERT WITH CHECK (
  public.has_any_company_role(company_id, ARRAY['company_admin'])
);

-- team_id em user_companies
ALTER TABLE public.user_companies
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- 3. Tabela company_invites (convites pendentes)
CREATE TABLE IF NOT EXISTS public.company_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_in_company public.app_role NOT NULL DEFAULT 'agent',
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, email)
);

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invites_select" ON public.company_invites;
CREATE POLICY "company_invites_select" ON public.company_invites FOR SELECT USING (
  public.is_company_member(company_id)
);

DROP POLICY IF EXISTS "company_invites_insert" ON public.company_invites;
CREATE POLICY "company_invites_insert" ON public.company_invites FOR INSERT WITH CHECK (
  public.has_any_company_role(company_id, ARRAY['company_admin'])
);

-- 4. Política INSERT para user_companies
DROP POLICY IF EXISTS "company_admin_insert_members" ON public.user_companies;
CREATE POLICY "company_admin_insert_members" ON public.user_companies
  FOR INSERT WITH CHECK (
    public.has_any_company_role(company_id, ARRAY['company_admin'])
  );

-- 5. RPC: convidar ou adicionar membro
CREATE OR REPLACE FUNCTION public.rpc_invite_member(
  p_company_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'agent',
  p_team_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não autenticado.');
  END IF;

  IF NOT public.has_any_company_role(p_company_id, ARRAY['company_admin']) THEN
    RETURN json_build_object('success', false, 'error', 'Sem permissão para convidar membros.');
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Email é obrigatório.');
  END IF;

  p_email := lower(trim(p_email));

  -- Verifica se usuário já existe em auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Usuário existe: adiciona à empresa
    INSERT INTO public.user_companies (user_id, company_id, role_in_company, team_id)
    VALUES (v_user_id, p_company_id, p_role::public.app_role, p_team_id)
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET role_in_company = p_role::public.app_role, team_id = p_team_id;

    RETURN json_build_object('success', true, 'added', true, 'user_id', v_user_id);
  END IF;

  -- Usuário não existe: cria convite pendente
  INSERT INTO public.company_invites (company_id, email, role_in_company, team_id, invited_by)
  VALUES (p_company_id, p_email, p_role::public.app_role, p_team_id, auth.uid())
  ON CONFLICT (company_id, email) DO UPDATE
  SET role_in_company = p_role::public.app_role, team_id = p_team_id, status = 'pending', invited_by = auth.uid();

  RETURN json_build_object('success', true, 'pending', true, 'message', 'Convite registrado. O usuário será adicionado ao acessar a plataforma.');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
