-- =============================================================================
-- Cadências Estáticas — Phase 1
-- Tabelas: message_templates, cadence_templates, cadence_steps
-- Aplicar via Supabase SQL Editor
-- =============================================================================

-- message_templates: textos reutilizáveis com variáveis dinâmicas
CREATE TABLE IF NOT EXISTS public.message_templates (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  channel        text        NOT NULL DEFAULT 'whatsapp',
  body           text        NOT NULL,
  variables      jsonb,
  media_asset_id uuid,
  status         text        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'draft', 'archived')),
  created_by     uuid        REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- cadence_templates: modelos de cadência por empresa
CREATE TABLE IF NOT EXISTS public.cadence_templates (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  category     text        NOT NULL DEFAULT 'personalizada',
  trigger_type text        NOT NULL DEFAULT 'manual',
  status       text        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  settings     jsonb       NOT NULL DEFAULT '{}',
  created_by   uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- cadence_steps: passos de cada cadência (ordenados por step_order)
CREATE TABLE IF NOT EXISTS public.cadence_steps (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cadence_template_id uuid        NOT NULL REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  step_order          integer     NOT NULL DEFAULT 1,
  name                text        NOT NULL,
  action_type         text        NOT NULL DEFAULT 'whatsapp_message',
  relative_to         text,
  offset_minutes      integer,
  message_template_id uuid        REFERENCES public.message_templates(id),
  message_text        text,
  media_asset_id      uuid,
  requires_approval   boolean     NOT NULL DEFAULT false,
  is_active           boolean     NOT NULL DEFAULT true,
  settings            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Índices
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cadence_templates_company
  ON public.cadence_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_cadence_templates_company_status
  ON public.cadence_templates(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_template
  ON public.cadence_steps(cadence_template_id);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_company
  ON public.cadence_steps(company_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_company
  ON public.message_templates(company_id);

-- =============================================================================
-- Triggers updated_at (reusa função existente se já houver)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cadence_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_cadence_templates_updated_at
      BEFORE UPDATE ON public.cadence_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cadence_steps_updated_at'
  ) THEN
    CREATE TRIGGER trg_cadence_steps_updated_at
      BEFORE UPDATE ON public.cadence_steps
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_message_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_message_templates_updated_at
      BEFORE UPDATE ON public.message_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- RLS — isola por empresa
-- =============================================================================

ALTER TABLE public.cadence_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates  ENABLE ROW LEVEL SECURITY;

-- cadence_templates
CREATE POLICY cadence_templates_select ON public.cadence_templates
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY cadence_templates_insert ON public.cadence_templates
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY cadence_templates_update ON public.cadence_templates
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY cadence_templates_delete ON public.cadence_templates
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );

-- cadence_steps
CREATE POLICY cadence_steps_select ON public.cadence_steps
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY cadence_steps_insert ON public.cadence_steps
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY cadence_steps_update ON public.cadence_steps
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY cadence_steps_delete ON public.cadence_steps
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );

-- message_templates
CREATE POLICY message_templates_select ON public.message_templates
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY message_templates_insert ON public.message_templates
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY message_templates_update ON public.message_templates
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
CREATE POLICY message_templates_delete ON public.message_templates
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  );
