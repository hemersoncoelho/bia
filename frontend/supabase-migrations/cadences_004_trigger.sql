-- =============================================================================
-- Cadências — Phase 4: Trigger automático em appointments
-- Aplicar após cadences_003_rpcs.sql
-- =============================================================================

-- =============================================================================
-- Função de trigger
-- Chama as RPCs de cadência após INSERT ou UPDATE em appointments.
-- Erros são capturados com EXCEPTION para não reverter o agendamento.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_appointments_cadence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- ── INSERT: novo agendamento em status 'scheduled' → gera eventos ──────────
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'scheduled' THEN
      BEGIN
        PERFORM public.generate_cadence_events_for_appointment(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[cadence_trigger] generate failed for appointment %: %', NEW.id, SQLERRM;
      END;
    END IF;

  -- ── UPDATE: verifica o que mudou ────────────────────────────────────────────
  ELSIF TG_OP = 'UPDATE' THEN

    -- Cancelamento: status virou 'cancelled' ou 'rescheduled'
    IF NEW.status IN ('cancelled', 'rescheduled') AND OLD.status NOT IN ('cancelled', 'rescheduled') THEN
      BEGIN
        PERFORM public.cancel_cadence_events_for_appointment(NEW.id, 'appointment_' || NEW.status);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[cadence_trigger] cancel failed for appointment %: %', NEW.id, SQLERRM;
      END;

    -- Remarcação de horário (status ainda 'scheduled' mas scheduled_at mudou)
    ELSIF NEW.status = 'scheduled' AND OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
      BEGIN
        PERFORM public.supersede_and_regenerate_cadence_events(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[cadence_trigger] supersede failed for appointment %: %', NEW.id, SQLERRM;
      END;

    -- Status virou 'scheduled' (era outra coisa) → gera eventos
    ELSIF NEW.status = 'scheduled' AND OLD.status != 'scheduled' THEN
      BEGIN
        PERFORM public.generate_cadence_events_for_appointment(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[cadence_trigger] generate (status change) failed for appointment %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Cria/recria o trigger
-- =============================================================================
DROP TRIGGER IF EXISTS trg_appointments_cadence ON public.appointments;

CREATE TRIGGER trg_appointments_cadence
  AFTER INSERT OR UPDATE OF status, scheduled_at
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_appointments_cadence();
