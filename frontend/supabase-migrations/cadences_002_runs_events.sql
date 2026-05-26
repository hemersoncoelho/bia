-- =============================================================================
-- Cadências — Phase 2: cadence_runs + cadence_events
-- Aplicar via Supabase SQL Editor após cadences_001.sql
-- =============================================================================

-- =============================================================================
-- 1. cadence_runs
-- Representa uma execução de cadência vinculada a um agendamento específico.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cadence_runs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cadence_id      uuid        NOT NULL REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  appointment_id  uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  contact_id      uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'canceled', 'superseded')),
  source_snapshot jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cadence_runs_company
  ON public.cadence_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_cadence_runs_appointment
  ON public.cadence_runs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_cadence_runs_cadence
  ON public.cadence_runs(cadence_id);
CREATE INDEX IF NOT EXISTS idx_cadence_runs_status
  ON public.cadence_runs(company_id, status);

-- =============================================================================
-- 2. cadence_events
-- Jobs reais que o n8n vai consumir (um evento por passo por run).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cadence_events (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cadence_run_id      uuid        NOT NULL REFERENCES public.cadence_runs(id) ON DELETE CASCADE,
  cadence_id          uuid        NOT NULL REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  cadence_step_id     uuid        NOT NULL REFERENCES public.cadence_steps(id) ON DELETE CASCADE,
  appointment_id      uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  contact_id          uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel             text        NOT NULL DEFAULT 'whatsapp',
  recipient_phone     text,
  scheduled_at        timestamptz NOT NULL,
  message_body        text        NOT NULL,
  payload             jsonb       NOT NULL DEFAULT '{}',
  status              text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled', 'skipped')),
  attempts            integer     NOT NULL DEFAULT 0,
  max_attempts        integer     NOT NULL DEFAULT 3,
  locked_at           timestamptz,
  locked_until        timestamptz,
  locked_by           text,
  sent_at             timestamptz,
  failed_at           timestamptz,
  last_error          text,
  external_message_id text,
  idempotency_key     text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cadence_events_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_cadence_events_company
  ON public.cadence_events(company_id);
CREATE INDEX IF NOT EXISTS idx_cadence_events_appointment
  ON public.cadence_events(appointment_id);
CREATE INDEX IF NOT EXISTS idx_cadence_events_run
  ON public.cadence_events(cadence_run_id);
CREATE INDEX IF NOT EXISTS idx_cadence_events_status_scheduled
  ON public.cadence_events(status, scheduled_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_cadence_events_idempotency
  ON public.cadence_events(idempotency_key);

-- =============================================================================
-- 3. Triggers updated_at
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cadence_runs_updated_at'
  ) THEN
    CREATE TRIGGER trg_cadence_runs_updated_at
      BEFORE UPDATE ON public.cadence_runs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cadence_events_updated_at'
  ) THEN
    CREATE TRIGGER trg_cadence_events_updated_at
      BEFORE UPDATE ON public.cadence_events
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- 4. RLS
-- =============================================================================
ALTER TABLE public.cadence_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_events ENABLE ROW LEVEL SECURITY;

-- ── cadence_runs ──
DROP POLICY IF EXISTS cadence_runs_select ON public.cadence_runs;
DROP POLICY IF EXISTS cadence_runs_insert ON public.cadence_runs;
DROP POLICY IF EXISTS cadence_runs_update ON public.cadence_runs;
DROP POLICY IF EXISTS cadence_runs_delete ON public.cadence_runs;

CREATE POLICY cadence_runs_select ON public.cadence_runs
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND system_role::text IN ('platform_admin','system_admin'))
  );

-- Usuários não criam/alteram runs diretamente; somente RPCs (SECURITY DEFINER) fazem isso.
-- Bloqueando INSERT/UPDATE/DELETE para authenticated; service_role bypassa RLS.
CREATE POLICY cadence_runs_insert ON public.cadence_runs
  FOR INSERT WITH CHECK (false);

CREATE POLICY cadence_runs_update ON public.cadence_runs
  FOR UPDATE USING (false);

CREATE POLICY cadence_runs_delete ON public.cadence_runs
  FOR DELETE USING (false);

-- ── cadence_events ──
DROP POLICY IF EXISTS cadence_events_select ON public.cadence_events;
DROP POLICY IF EXISTS cadence_events_insert ON public.cadence_events;
DROP POLICY IF EXISTS cadence_events_update ON public.cadence_events;
DROP POLICY IF EXISTS cadence_events_delete ON public.cadence_events;

CREATE POLICY cadence_events_select ON public.cadence_events
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND system_role::text IN ('platform_admin','system_admin'))
  );

-- Escrita somente por RPCs SECURITY DEFINER ou service_role.
CREATE POLICY cadence_events_insert ON public.cadence_events
  FOR INSERT WITH CHECK (false);

CREATE POLICY cadence_events_update ON public.cadence_events
  FOR UPDATE USING (false);

CREATE POLICY cadence_events_delete ON public.cadence_events
  FOR DELETE USING (false);

-- =============================================================================
-- 5. Grants de leitura para authenticated (RPCs fazem escrita)
-- =============================================================================
GRANT SELECT ON public.cadence_runs   TO authenticated;
GRANT SELECT ON public.cadence_events TO authenticated;
