-- ============================================================
-- Admin Tenant Detail: modules, billing history, audit-safe RPCs
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'system_admin';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT up.system_role::text IN ('platform_admin', 'system_admin')
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_companies uc
      WHERE uc.company_id = p_company_id
        AND uc.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_any_company_role(p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_companies uc
      WHERE uc.company_id = p_company_id
        AND uc.user_id = auth.uid()
        AND uc.role_in_company::text = ANY(p_roles)
    );
$$;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles(email)
  WHERE email IS NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.messages m
SET company_id = c.company_id
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_company_id
  ON public.messages(company_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_user_id uuid,
  impersonated_user_id uuid,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  before_data jsonb,
  after_data jsonb,
  origin text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS impersonated_user_id uuid,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN company_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON public.audit_logs(company_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR (
      company_id IS NOT NULL
      AND public.has_any_company_role(company_id, ARRAY['company_admin'])
    )
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.platform_module_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 100,
  default_enabled boolean NOT NULL DEFAULT false,
  allowed_plan_names text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_module_settings (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.platform_module_catalog(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_company_module_settings_company
  ON public.company_module_settings(company_id);

DROP TRIGGER IF EXISTS trg_company_module_settings_updated_at
  ON public.company_module_settings;
CREATE TRIGGER trg_company_module_settings_updated_at
  BEFORE UPDATE ON public.company_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_module_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_module_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_module_catalog_select" ON public.platform_module_catalog;
CREATE POLICY "platform_module_catalog_select"
  ON public.platform_module_catalog
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "platform_module_catalog_manage" ON public.platform_module_catalog;
CREATE POLICY "platform_module_catalog_manage"
  ON public.platform_module_catalog
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "company_module_settings_select" ON public.company_module_settings;
CREATE POLICY "company_module_settings_select"
  ON public.company_module_settings
  FOR SELECT
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "company_module_settings_insert" ON public.company_module_settings;
CREATE POLICY "company_module_settings_insert"
  ON public.company_module_settings
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "company_module_settings_update" ON public.company_module_settings;
CREATE POLICY "company_module_settings_update"
  ON public.company_module_settings
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "company_module_settings_delete" ON public.company_module_settings;
CREATE POLICY "company_module_settings_delete"
  ON public.company_module_settings
  FOR DELETE
  USING (public.is_platform_admin());

INSERT INTO public.platform_module_catalog
  (slug, name, description, sort_order, default_enabled, allowed_plan_names)
VALUES
  ('inbox',        'Inbox',        'Atendimento e conversas omnichannel.',       10, true,  NULL),
  ('pipeline',     'Pipeline',     'CRM comercial e funil de negócios.',         20, true,  NULL),
  ('tasks',        'Tarefas',      'Tarefas operacionais e follow-up.',          30, true,  NULL),
  ('ai_agents',    'Agentes IA',   'Agentes de IA e automações assistidas.',     40, false, ARRAY['pro', 'enterprise']),
  ('calendar',     'Agenda',       'Agenda, horários e procedimentos.',          50, false, ARRAY['pro', 'enterprise']),
  ('analytics',    'Analytics',    'Métricas avançadas e relatórios.',           60, false, ARRAY['pro', 'enterprise']),
  ('integrations', 'Integrações',  'Conectores externos e canais integrados.',   70, false, ARRAY['pro', 'enterprise']),
  ('public_api',   'API Pública',  'Acesso programático à API pública.',         80, false, ARRAY['enterprise'])
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  default_enabled = EXCLUDED.default_enabled,
  allowed_plan_names = EXCLUDED.allowed_plan_names,
  is_active = true;

CREATE TABLE IF NOT EXISTS public.company_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'manual_charge',
    'manual_credit',
    'subscription_charge',
    'setup_fee',
    'adjustment',
    'refund'
  )),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL CHECK (status IN (
    'pending',
    'paid',
    'partially_paid',
    'cancelled',
    'overdue'
  )),
  description text,
  notes text,
  reference_month date,
  due_date date,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_financial_entries_company_created
  ON public.company_financial_entries(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_financial_entries_status_due
  ON public.company_financial_entries(company_id, status, due_date);

DROP TRIGGER IF EXISTS trg_company_financial_entries_updated_at
  ON public.company_financial_entries;
CREATE TRIGGER trg_company_financial_entries_updated_at
  BEFORE UPDATE ON public.company_financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.company_financial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_entry_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text,
  paid_at timestamptz NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (financial_entry_id, company_id)
    REFERENCES public.company_financial_entries(id, company_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_company_financial_payments_entry
  ON public.company_financial_payments(financial_entry_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_financial_payments_company
  ON public.company_financial_payments(company_id, paid_at DESC);

ALTER TABLE public.company_financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_financial_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_financial_entries_select" ON public.company_financial_entries;
CREATE POLICY "company_financial_entries_select"
  ON public.company_financial_entries
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.has_any_company_role(company_id, ARRAY['company_admin'])
  );

DROP POLICY IF EXISTS "company_financial_entries_insert" ON public.company_financial_entries;
CREATE POLICY "company_financial_entries_insert"
  ON public.company_financial_entries
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "company_financial_entries_update" ON public.company_financial_entries;
CREATE POLICY "company_financial_entries_update"
  ON public.company_financial_entries
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "company_financial_payments_select" ON public.company_financial_payments;
CREATE POLICY "company_financial_payments_select"
  ON public.company_financial_payments
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.has_any_company_role(company_id, ARRAY['company_admin'])
  );

DROP POLICY IF EXISTS "company_financial_payments_insert" ON public.company_financial_payments;
CREATE POLICY "company_financial_payments_insert"
  ON public.company_financial_payments
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

CREATE TABLE IF NOT EXISTS public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_in_company public.app_role NOT NULL DEFAULT 'agent',
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invites_select" ON public.company_invites;
CREATE POLICY "company_invites_select"
  ON public.company_invites
  FOR SELECT
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "company_invites_insert" ON public.company_invites;
CREATE POLICY "company_invites_insert"
  ON public.company_invites
  FOR INSERT
  WITH CHECK (public.has_any_company_role(company_id, ARRAY['company_admin']));

DROP POLICY IF EXISTS "company_invites_update" ON public.company_invites;
CREATE POLICY "company_invites_update"
  ON public.company_invites
  FOR UPDATE
  USING (public.has_any_company_role(company_id, ARRAY['company_admin']))
  WITH CHECK (public.has_any_company_role(company_id, ARRAY['company_admin']));

CREATE OR REPLACE FUNCTION public.fn_admin_audit(
  p_company_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_origin text DEFAULT 'admin_panel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    actor_id,
    actor_user_id,
    company_id,
    action,
    entity_type,
    entity_id,
    details,
    before_data,
    after_data,
    origin
  )
  VALUES (
    auth.uid(),
    auth.uid(),
    p_company_id,
    p_action,
    p_entity_type,
    p_entity_id,
    jsonb_build_object(
      'origin', p_origin,
      'before', p_before_data,
      'after', p_after_data
    ),
    p_before_data,
    p_after_data,
    p_origin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admin_audit(uuid, text, text, uuid, jsonb, jsonb, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.rpc_get_admin_tenant_detail(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
  v_plan_name text;
  v_open_deals_count bigint := 0;
  v_open_deals_value numeric := 0;
  v_won_deals_count bigint := 0;
  v_won_deals_value numeric := 0;
  v_total_conversations bigint := 0;
  v_ai_conversations bigint := 0;
  v_total_users bigint := 0;
  v_active_users bigint := 0;
  v_total_teams bigint := 0;
  v_message_volume bigint := 0;
  v_active_modules bigint := 0;
  v_modules_total bigint := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  SELECT lower(sp.name)
  INTO v_plan_name
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = p_company_id;

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE d.status::text = 'open'), 0),
    COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'open'), 0),
    COALESCE(COUNT(*) FILTER (WHERE d.status::text = 'won'), 0),
    COALESCE(SUM(d.amount) FILTER (WHERE d.status::text = 'won'), 0)
  INTO v_open_deals_count, v_open_deals_value, v_won_deals_count, v_won_deals_value
  FROM public.deals d
  WHERE d.company_id = p_company_id;

  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE c.attendance_mode::text = 'ai'), 0)
  INTO v_total_conversations, v_ai_conversations
  FROM public.conversations c
  WHERE c.company_id = p_company_id;

  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE COALESCE(up.is_active, true)), 0)
  INTO v_total_users, v_active_users
  FROM public.user_companies uc
  LEFT JOIN public.user_profiles up ON up.id = uc.user_id
  WHERE uc.company_id = p_company_id;

  SELECT COALESCE(COUNT(*), 0)
  INTO v_total_teams
  FROM public.teams t
  WHERE t.company_id = p_company_id;

  SELECT COALESCE(COUNT(*), 0)
  INTO v_message_volume
  FROM public.messages m
  WHERE m.company_id = p_company_id;

  SELECT COUNT(*)
  INTO v_modules_total
  FROM public.platform_module_catalog pm
  WHERE pm.is_active = true;

  SELECT COUNT(*)
  INTO v_active_modules
  FROM public.platform_module_catalog pm
  LEFT JOIN public.company_module_settings cms
    ON cms.module_id = pm.id
   AND cms.company_id = p_company_id
  WHERE pm.is_active = true
    AND COALESCE(cms.is_enabled, pm.default_enabled) = true
    AND (
      pm.allowed_plan_names IS NULL
      OR COALESCE(v_plan_name, '') = ANY(pm.allowed_plan_names)
    );

  RETURN jsonb_build_object(
    'company', jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'is_active', v_company.is_active,
      'created_at', v_company.created_at
    ),
    'subscription', COALESCE((
      SELECT jsonb_build_object(
        'id', cs.id,
        'plan_id', cs.plan_id,
        'plan_name', sp.name,
        'price_monthly', sp.price_monthly,
        'status', cs.status,
        'trial_ends_at', cs.trial_ends_at,
        'subscribed_at', cs.subscribed_at,
        'churned_at', cs.churned_at,
        'churn_reason', cs.churn_reason,
        'updated_at', cs.updated_at
      )
      FROM public.company_subscriptions cs
      JOIN public.subscription_plans sp ON sp.id = cs.plan_id
      WHERE cs.company_id = p_company_id
    ), '{}'::jsonb),
    'plans', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sp.id,
          'name', sp.name,
          'price_monthly', sp.price_monthly,
          'description', sp.description,
          'is_active', sp.is_active
        )
        ORDER BY sp.price_monthly, sp.name
      )
      FROM public.subscription_plans sp
      WHERE sp.is_active = true
    ), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'mrr', COALESCE((
        SELECT sp.price_monthly
        FROM public.company_subscriptions cs
        JOIN public.subscription_plans sp ON sp.id = cs.plan_id
        WHERE cs.company_id = p_company_id
          AND cs.status IN ('trial', 'active')
      ), 0),
      'open_deals_count', v_open_deals_count,
      'open_deals_value', v_open_deals_value,
      'won_deals_count', v_won_deals_count,
      'won_deals_value', v_won_deals_value,
      'ai_conversations', v_ai_conversations,
      'total_conversations', v_total_conversations,
      'ai_adoption_pct', CASE
        WHEN v_total_conversations > 0 THEN ROUND((v_ai_conversations::numeric / v_total_conversations::numeric) * 100, 1)
        ELSE 0
      END,
      'total_users', v_total_users,
      'active_users', v_active_users,
      'total_teams', v_total_teams,
      'active_modules', v_active_modules,
      'total_modules', v_modules_total,
      'message_volume', v_message_volume
    ),
    'users', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', uc.user_id,
          'name', COALESCE(up.full_name, au.email, 'Sem nome'),
          'email', COALESCE(up.email, au.email, ''),
          'role', uc.role_in_company::text,
          'status', CASE WHEN COALESCE(up.is_active, true) THEN 'active' ELSE 'inactive' END,
          'joined_at', uc.created_at,
          'team_id', uc.team_id,
          'team_name', t.name
        )
        ORDER BY COALESCE(up.full_name, au.email, '')
      )
      FROM public.user_companies uc
      LEFT JOIN public.user_profiles up ON up.id = uc.user_id
      LEFT JOIN auth.users au ON au.id = uc.user_id
      LEFT JOIN public.teams t ON t.id = uc.team_id
      WHERE uc.company_id = p_company_id
    ), '[]'::jsonb),
    'teams', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'slug', t.slug,
          'manager_id', t.manager_id,
          'manager_name', manager.full_name,
          'member_count', COALESCE(member_counts.member_count, 0),
          'created_at', t.created_at
        )
        ORDER BY t.name
      )
      FROM public.teams t
      LEFT JOIN public.user_profiles manager ON manager.id = t.manager_id
      LEFT JOIN (
        SELECT team_id, COUNT(*) AS member_count
        FROM public.user_companies
        WHERE company_id = p_company_id
        GROUP BY team_id
      ) member_counts ON member_counts.team_id = t.id
      WHERE t.company_id = p_company_id
    ), '[]'::jsonb),
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug', pm.slug,
          'name', pm.name,
          'description', pm.description,
          'sort_order', pm.sort_order,
          'is_enabled', (
            COALESCE(cms.is_enabled, pm.default_enabled) = true
            AND (
              pm.allowed_plan_names IS NULL
              OR COALESCE(v_plan_name, '') = ANY(pm.allowed_plan_names)
            )
          ),
          'default_enabled', pm.default_enabled,
          'eligible', (
            pm.allowed_plan_names IS NULL
            OR COALESCE(v_plan_name, '') = ANY(pm.allowed_plan_names)
          ),
          'allowed_plan_names', pm.allowed_plan_names,
          'blocked_reason', CASE
            WHEN pm.allowed_plan_names IS NOT NULL
             AND NOT (COALESCE(v_plan_name, '') = ANY(pm.allowed_plan_names))
            THEN 'Plano atual não permite este módulo.'
            ELSE NULL
          END,
          'updated_at', cms.updated_at,
          'updated_by', cms.updated_by
        )
        ORDER BY pm.sort_order
      )
      FROM public.platform_module_catalog pm
      LEFT JOIN public.company_module_settings cms
        ON cms.module_id = pm.id
       AND cms.company_id = p_company_id
      WHERE pm.is_active = true
    ), '[]'::jsonb),
    'financial_entries', COALESCE((
      WITH payment_stats AS (
        SELECT
          p.financial_entry_id,
          COALESCE(SUM(p.amount), 0) AS paid_amount,
          jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'amount', p.amount,
              'payment_method', p.payment_method,
              'paid_at', p.paid_at,
              'notes', p.notes,
              'created_by', p.created_by,
              'created_at', p.created_at
            )
            ORDER BY p.paid_at DESC
          ) AS payments
        FROM public.company_financial_payments p
        WHERE p.company_id = p_company_id
        GROUP BY p.financial_entry_id
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'company_id', e.company_id,
          'type', e.type,
          'amount', e.amount,
          'currency', e.currency,
          'status', CASE
            WHEN e.status = 'pending' AND e.due_date IS NOT NULL AND e.due_date < current_date THEN 'overdue'
            ELSE e.status
          END,
          'stored_status', e.status,
          'description', e.description,
          'notes', e.notes,
          'reference_month', e.reference_month,
          'due_date', e.due_date,
          'paid_at', e.paid_at,
          'created_by', e.created_by,
          'created_at', e.created_at,
          'updated_at', e.updated_at,
          'paid_amount', COALESCE(ps.paid_amount, 0),
          'remaining_amount', GREATEST(e.amount - COALESCE(ps.paid_amount, 0), 0),
          'payments', COALESCE(ps.payments, '[]'::jsonb)
        )
        ORDER BY e.created_at DESC
      )
      FROM public.company_financial_entries e
      LEFT JOIN payment_stats ps ON ps.financial_entry_id = e.id
      WHERE e.company_id = p_company_id
    ), '[]'::jsonb),
    'audit_logs', COALESCE((
      SELECT jsonb_agg(log_row.payload ORDER BY log_row.created_at DESC)
      FROM (
        SELECT
          al.created_at,
          jsonb_build_object(
            'id', al.id,
            'created_at', al.created_at,
            'actor_user_id', COALESCE(al.actor_user_id, al.actor_id),
            'actor_name', COALESCE(up.full_name, au.email, 'Sistema'),
            'action', al.action,
            'entity_type', al.entity_type,
            'entity_id', al.entity_id,
            'origin', al.origin,
            'before_data', al.before_data,
            'after_data', al.after_data,
            'details', al.details
          ) AS payload
        FROM public.audit_logs al
        LEFT JOIN public.user_profiles up ON up.id = COALESCE(al.actor_user_id, al.actor_id)
        LEFT JOIN auth.users au ON au.id = COALESCE(al.actor_user_id, al.actor_id)
        WHERE al.company_id = p_company_id
        ORDER BY al.created_at DESC
        LIMIT 100
      ) log_row
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_admin_tenant_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_company(
  p_company_id uuid,
  p_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  SELECT to_jsonb(c) INTO v_before
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  UPDATE public.companies
  SET
    name = COALESCE(NULLIF(trim(p_name), ''), name),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_company_id
  RETURNING to_jsonb(companies.*) INTO v_after;

  PERFORM public.fn_admin_audit(
    p_company_id,
    'admin.company.update',
    'company',
    p_company_id,
    v_before,
    v_after,
    'admin_panel'
  );

  RETURN public.rpc_get_admin_tenant_detail(p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_update_company(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_subscription(
  p_company_id uuid,
  p_plan_id uuid,
  p_status text DEFAULT 'active',
  p_trial_ends_at timestamptz DEFAULT NULL,
  p_churned_at timestamptz DEFAULT NULL,
  p_churn_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano é obrigatório.';
  END IF;

  IF p_status NOT IN ('trial', 'active', 'churned', 'suspended') THEN
    RAISE EXCEPTION 'Status de assinatura inválido.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plano não encontrado ou inativo.';
  END IF;

  SELECT to_jsonb(cs) INTO v_before
  FROM public.company_subscriptions cs
  WHERE cs.company_id = p_company_id;

  INSERT INTO public.company_subscriptions (
    company_id,
    plan_id,
    status,
    trial_ends_at,
    churned_at,
    churn_reason
  )
  VALUES (
    p_company_id,
    p_plan_id,
    p_status,
    p_trial_ends_at,
    CASE WHEN p_status = 'churned' THEN COALESCE(p_churned_at, now()) ELSE p_churned_at END,
    p_churn_reason
  )
  ON CONFLICT (company_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    trial_ends_at = EXCLUDED.trial_ends_at,
    churned_at = EXCLUDED.churned_at,
    churn_reason = EXCLUDED.churn_reason,
    updated_at = now()
  RETURNING to_jsonb(company_subscriptions.*) INTO v_after;

  PERFORM public.fn_admin_audit(
    p_company_id,
    'admin.subscription.update',
    'company_subscription',
    (v_after->>'id')::uuid,
    v_before,
    v_after,
    'admin_panel'
  );

  RETURN public.rpc_get_admin_tenant_detail(p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_update_subscription(uuid, uuid, text, timestamptz, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_company_module(
  p_company_id uuid,
  p_module_slug text,
  p_is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module public.platform_module_catalog%ROWTYPE;
  v_plan_name text;
  v_allowed boolean;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  SELECT *
  INTO v_module
  FROM public.platform_module_catalog
  WHERE slug = p_module_slug
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Módulo não encontrado.';
  END IF;

  SELECT lower(sp.name)
  INTO v_plan_name
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = p_company_id;

  v_allowed := (
    v_module.allowed_plan_names IS NULL
    OR COALESCE(v_plan_name, '') = ANY(v_module.allowed_plan_names)
  );

  IF p_is_enabled AND NOT v_allowed THEN
    RAISE EXCEPTION 'O plano atual não permite ativar este módulo.';
  END IF;

  SELECT to_jsonb(cms) INTO v_before
  FROM public.company_module_settings cms
  WHERE cms.company_id = p_company_id
    AND cms.module_id = v_module.id;

  INSERT INTO public.company_module_settings (
    company_id,
    module_id,
    is_enabled,
    updated_by
  )
  VALUES (
    p_company_id,
    v_module.id,
    p_is_enabled,
    auth.uid()
  )
  ON CONFLICT (company_id, module_id) DO UPDATE
  SET
    is_enabled = EXCLUDED.is_enabled,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING to_jsonb(company_module_settings.*) INTO v_after;

  PERFORM public.fn_admin_audit(
    p_company_id,
    CASE WHEN p_is_enabled THEN 'admin.module.enable' ELSE 'admin.module.disable' END,
    'company_module',
    v_module.id,
    v_before,
    v_after || jsonb_build_object('module_slug', v_module.slug, 'module_name', v_module.name),
    'admin_panel'
  );

  RETURN public.rpc_get_admin_tenant_detail(p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_set_company_module(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_invite_company_member(
  p_company_id uuid,
  p_email text,
  p_role text DEFAULT 'agent',
  p_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_invite_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  IF p_role NOT IN ('company_admin', 'manager', 'agent') THEN
    RAISE EXCEPTION 'Papel inválido para empresa.';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Email é obrigatório.';
  END IF;

  IF p_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams WHERE id = p_team_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Time não pertence à empresa.';
  END IF;

  SELECT au.id
  INTO v_user_id
  FROM auth.users au
  WHERE lower(au.email) = v_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT to_jsonb(uc) INTO v_before
    FROM public.user_companies uc
    WHERE uc.company_id = p_company_id
      AND uc.user_id = v_user_id;

    INSERT INTO public.user_profiles (id, full_name, email, system_role)
    SELECT
      au.id,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email, 'Novo usuário'),
      au.email,
      'agent'::public.app_role
    FROM auth.users au
    WHERE au.id = v_user_id
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_companies (
      user_id,
      company_id,
      role_in_company,
      team_id
    )
    VALUES (
      v_user_id,
      p_company_id,
      p_role::public.app_role,
      p_team_id
    )
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET
      role_in_company = EXCLUDED.role_in_company,
      team_id = EXCLUDED.team_id
    RETURNING to_jsonb(user_companies.*) INTO v_after;

    PERFORM public.fn_admin_audit(
      p_company_id,
      'admin.member.upsert',
      'user_company',
      v_user_id,
      v_before,
      v_after,
      'admin_panel'
    );

    RETURN jsonb_build_object('success', true, 'added', true, 'user_id', v_user_id);
  END IF;

  INSERT INTO public.company_invites (
    company_id,
    email,
    role_in_company,
    team_id,
    invited_by,
    status
  )
  VALUES (
    p_company_id,
    v_email,
    p_role::public.app_role,
    p_team_id,
    auth.uid(),
    'pending'
  )
  ON CONFLICT (company_id, email) DO UPDATE
  SET
    role_in_company = EXCLUDED.role_in_company,
    team_id = EXCLUDED.team_id,
    invited_by = EXCLUDED.invited_by,
    status = 'pending'
  RETURNING id, to_jsonb(company_invites.*)
  INTO v_invite_id, v_after;

  PERFORM public.fn_admin_audit(
    p_company_id,
    'admin.member.invite',
    'company_invite',
    v_invite_id,
    NULL,
    v_after,
    'admin_panel'
  );

  RETURN jsonb_build_object('success', true, 'pending', true, 'invite_id', v_invite_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_invite_company_member(uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_financial_entry(
  p_company_id uuid,
  p_type text,
  p_amount numeric,
  p_status text DEFAULT 'pending',
  p_description text DEFAULT NULL,
  p_reference_month date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_currency text DEFAULT 'BRL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.company_financial_entries%ROWTYPE;
  v_after jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  IF p_type NOT IN ('manual_charge', 'manual_credit', 'subscription_charge', 'setup_fee', 'adjustment', 'refund') THEN
    RAISE EXCEPTION 'Tipo financeiro inválido.';
  END IF;

  IF p_status NOT IN ('pending', 'paid', 'partially_paid', 'cancelled', 'overdue') THEN
    RAISE EXCEPTION 'Status financeiro inválido.';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior ou igual a zero.';
  END IF;

  INSERT INTO public.company_financial_entries (
    company_id,
    type,
    amount,
    currency,
    status,
    description,
    notes,
    reference_month,
    due_date,
    paid_at,
    created_by
  )
  VALUES (
    p_company_id,
    p_type,
    p_amount,
    COALESCE(NULLIF(trim(p_currency), ''), 'BRL'),
    p_status,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_notes), ''),
    p_reference_month,
    p_due_date,
    CASE WHEN p_status = 'paid' THEN now() ELSE NULL END,
    auth.uid()
  )
  RETURNING * INTO v_entry;

  v_after := to_jsonb(v_entry);

  PERFORM public.fn_admin_audit(
    p_company_id,
    'admin.financial_entry.create',
    'company_financial_entry',
    v_entry.id,
    NULL,
    v_after,
    'admin_panel'
  );

  RETURN public.rpc_get_admin_tenant_detail(p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_create_financial_entry(uuid, text, numeric, text, text, date, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_financial_entry(
  p_company_id uuid,
  p_entry_id uuid,
  p_status text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_reference_month date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'paid', 'partially_paid', 'cancelled', 'overdue') THEN
    RAISE EXCEPTION 'Status financeiro inválido.';
  END IF;

  SELECT to_jsonb(e) INTO v_before
  FROM public.company_financial_entries e
  WHERE e.id = p_entry_id
    AND e.company_id = p_company_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Lançamento financeiro não encontrado.';
  END IF;

  UPDATE public.company_financial_entries
  SET
    status = COALESCE(p_status, status),
    description = COALESCE(NULLIF(trim(p_description), ''), description),
    reference_month = COALESCE(p_reference_month, reference_month),
    due_date = COALESCE(p_due_date, due_date),
    notes = COALESCE(p_notes, notes),
    paid_at = CASE
      WHEN COALESCE(p_status, status) = 'paid' THEN COALESCE(paid_at, now())
      WHEN COALESCE(p_status, status) IN ('pending', 'partially_paid', 'cancelled', 'overdue') THEN paid_at
      ELSE paid_at
    END
  WHERE id = p_entry_id
    AND company_id = p_company_id
  RETURNING to_jsonb(company_financial_entries.*) INTO v_after;

  PERFORM public.fn_admin_audit(
    p_company_id,
    'admin.financial_entry.update',
    'company_financial_entry',
    p_entry_id,
    v_before,
    v_after,
    'admin_panel'
  );

  RETURN public.rpc_get_admin_tenant_detail(p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_update_financial_entry(uuid, uuid, text, text, date, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_record_financial_payment(
  p_company_id uuid,
  p_entry_id uuid,
  p_amount numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL,
  p_mark_remaining_paid boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.company_financial_entries%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_paid_before numeric := 0;
  v_paid_after numeric := 0;
  v_remaining numeric := 0;
  v_payment_amount numeric;
  v_payment_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.company_financial_entries
  WHERE id = p_entry_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento financeiro não encontrado.';
  END IF;

  IF v_entry.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível registrar pagamento em lançamento cancelado.';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_before
  FROM public.company_financial_payments
  WHERE company_id = p_company_id
    AND financial_entry_id = p_entry_id;

  v_remaining := GREATEST(v_entry.amount - v_paid_before, 0);
  v_payment_amount := CASE
    WHEN p_mark_remaining_paid THEN v_remaining
    ELSE p_amount
  END;

  IF v_payment_amount IS NULL OR v_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero.';
  END IF;

  IF v_payment_amount > v_remaining THEN
    RAISE EXCEPTION 'Pagamento maior que o saldo pendente.';
  END IF;

  v_before := to_jsonb(v_entry) || jsonb_build_object('paid_amount', v_paid_before, 'remaining_amount', v_remaining);

  INSERT INTO public.company_financial_payments (
    company_id,
    financial_entry_id,
    amount,
    payment_method,
    paid_at,
    notes,
    created_by
  )
  VALUES (
    p_company_id,
    p_entry_id,
    v_payment_amount,
    NULLIF(trim(p_payment_method), ''),
    COALESCE(p_paid_at, now()),
    NULLIF(trim(p_notes), ''),
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_after
  FROM public.company_financial_payments
  WHERE company_id = p_company_id
    AND financial_entry_id = p_entry_id;

  UPDATE public.company_financial_entries
  SET
    status = CASE
      WHEN v_paid_after >= amount THEN 'paid'
      WHEN v_paid_after > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_at = CASE
      WHEN v_paid_after >= amount THEN COALESCE(p_paid_at, now())
      ELSE paid_at
    END
  WHERE id = p_entry_id
    AND company_id = p_company_id
  RETURNING to_jsonb(company_financial_entries.*) INTO v_after;

  v_after := v_after || jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_amount', v_payment_amount,
    'paid_amount', v_paid_after,
    'remaining_amount', GREATEST(v_entry.amount - v_paid_after, 0)
  );

  PERFORM public.fn_admin_audit(
    p_company_id,
    'admin.financial_payment.record',
    'company_financial_payment',
    v_payment_id,
    v_before,
    v_after,
    'admin_panel'
  );

  RETURN public.rpc_get_admin_tenant_detail(p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_record_financial_payment(uuid, uuid, numeric, text, timestamptz, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_enter_support_mode(
  p_company_id uuid,
  p_impersonated_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_after jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores da plataforma.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada.';
  END IF;

  IF p_impersonated_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    WHERE uc.company_id = p_company_id
      AND uc.user_id = p_impersonated_user_id
  ) THEN
    RAISE EXCEPTION 'Usuário de suporte não pertence à empresa.';
  END IF;

  v_after := jsonb_build_object(
    'company_id', p_company_id,
    'impersonated_user_id', p_impersonated_user_id
  );

  INSERT INTO public.audit_logs (
    actor_id,
    actor_user_id,
    impersonated_user_id,
    company_id,
    action,
    entity_type,
    entity_id,
    details,
    after_data,
    origin
  )
  VALUES (
    auth.uid(),
    auth.uid(),
    p_impersonated_user_id,
    p_company_id,
    'admin.support.enter',
    'company',
    p_company_id,
    v_after,
    v_after,
    'support_mode'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_enter_support_mode(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
