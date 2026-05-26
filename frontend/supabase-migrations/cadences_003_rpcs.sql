-- =============================================================================
-- Cadências — Phase 3: RPCs operacionais
-- Aplicar após cadences_002_runs_events.sql
-- =============================================================================

-- =============================================================================
-- Helpers internos
-- =============================================================================

-- Renderiza message_text substituindo variáveis do template.
-- Suporta {{patient_name}}, {{contact.name}}, {{appointment_date}},
-- {{appointment_time}}, {{company_name}}, {{service_name}}.
CREATE OR REPLACE FUNCTION public._cadence_render_message(
  p_template       text,
  p_patient_name   text DEFAULT '',
  p_appt_date      text DEFAULT '',
  p_appt_time      text DEFAULT '',
  p_company_name   text DEFAULT '',
  p_service_name   text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := p_template;
  -- Suporta ambos os formatos de variável: {{patient_name}} e {{contact.name}}
  v_result := replace(v_result, '{{patient_name}}',     COALESCE(p_patient_name, ''));
  v_result := replace(v_result, '{{contact.name}}',     COALESCE(p_patient_name, ''));
  v_result := replace(v_result, '{{appointment_date}}', COALESCE(p_appt_date, ''));
  v_result := replace(v_result, '{{appointment_time}}', COALESCE(p_appt_time, ''));
  v_result := replace(v_result, '{{company_name}}',     COALESCE(p_company_name, ''));
  v_result := replace(v_result, '{{service_name}}',     COALESCE(p_service_name, ''));
  -- Limpa variáveis desconhecidas residuais
  v_result := regexp_replace(v_result, '\{\{[^}]+\}\}', '', 'g');
  RETURN v_result;
END;
$$;

-- =============================================================================
-- 1. generate_cadence_events_for_appointment
-- Idempotente: não duplica eventos se chamada mais de uma vez.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_cadence_events_for_appointment(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt            record;
  v_company         record;
  v_contact         record;
  v_service         record;
  v_phone           text;
  v_cadence         record;
  v_run_id          uuid;
  v_step            record;
  v_scheduled_at    timestamptz;
  v_message         text;
  v_ikey            text;
  v_events_created  integer := 0;
  v_runs_created    integer := 0;
  v_appt_date_br    text;
  v_appt_time_br    text;
BEGIN
  -- Busca o agendamento
  SELECT a.*, c.full_name AS contact_full_name, c.company_id AS c_company_id
  INTO v_appt
  FROM public.appointments a
  JOIN public.contacts c ON c.id = a.contact_id
  WHERE a.id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  -- Só gera eventos para agendamentos em status válido
  IF v_appt.status NOT IN ('scheduled') THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'appointment_status_' || v_appt.status);
  END IF;

  -- Dados da empresa
  SELECT id, name INTO v_company
  FROM public.companies
  WHERE id = v_appt.company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  -- Dados do contato
  SELECT c.id, c.full_name INTO v_contact
  FROM public.contacts c
  WHERE c.id = v_appt.contact_id AND c.company_id = v_appt.company_id;

  -- Telefone (WhatsApp) via contact_identities
  SELECT ci.normalized_value INTO v_phone
  FROM public.contact_identities ci
  WHERE ci.contact_id = v_appt.contact_id
    AND ci.channel_type::text = 'whatsapp'
  ORDER BY ci.created_at ASC
  LIMIT 1;

  -- Tipo de serviço
  SELECT st.name INTO v_service
  FROM public.service_types st
  WHERE st.id = v_appt.service_type_id AND st.company_id = v_appt.company_id;

  -- Formata data/hora em pt-BR (UTC → apresentação; timezone da empresa não está no schema, usa UTC)
  v_appt_date_br := to_char(v_appt.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  v_appt_time_br := to_char(v_appt.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');

  -- Itera sobre cadências ativas com trigger_type = 'appointment_scheduled'
  FOR v_cadence IN
    SELECT ct.*
    FROM public.cadence_templates ct
    WHERE ct.company_id = v_appt.company_id
      AND ct.trigger_type = 'appointment_scheduled'
      AND ct.status = 'active'
  LOOP
    -- Cria cadence_run (ou recupera existente se idempotente)
    SELECT id INTO v_run_id
    FROM public.cadence_runs
    WHERE appointment_id = p_appointment_id
      AND cadence_id = v_cadence.id
      AND status = 'active';

    IF v_run_id IS NULL THEN
      INSERT INTO public.cadence_runs (
        company_id, cadence_id, appointment_id, contact_id, status, source_snapshot
      ) VALUES (
        v_appt.company_id,
        v_cadence.id,
        p_appointment_id,
        v_appt.contact_id,
        'active',
        jsonb_build_object(
          'appointment_id',   p_appointment_id,
          'scheduled_at',     v_appt.scheduled_at,
          'contact_name',     COALESCE(v_contact.full_name, ''),
          'company_name',     v_company.name,
          'service_name',     COALESCE(v_service.name, ''),
          'recipient_phone',  COALESCE(v_phone, ''),
          'captured_at',      now()
        )
      )
      RETURNING id INTO v_run_id;

      v_runs_created := v_runs_created + 1;
    END IF;

    -- Itera sobre passos ativos da cadência
    FOR v_step IN
      SELECT cs.*
      FROM public.cadence_steps cs
      WHERE cs.cadence_template_id = v_cadence.id
        AND cs.company_id = v_appt.company_id
        AND cs.is_active = true
      ORDER BY cs.step_order ASC
    LOOP
      -- Só processa passos de mensagem WhatsApp
      IF v_step.action_type NOT IN ('whatsapp_message') THEN
        CONTINUE;
      END IF;

      -- Calcula o scheduled_at relativo ao horário do agendamento
      v_scheduled_at := v_appt.scheduled_at + (COALESCE(v_step.offset_minutes, 0) * interval '1 minute');

      -- Não agenda para o passado
      IF v_scheduled_at <= now() THEN
        CONTINUE;
      END IF;

      -- Chave de idempotência: empresa + agendamento + passo
      v_ikey := v_appt.company_id::text || ':' || p_appointment_id::text || ':' || v_step.id::text;

      -- Renderiza a mensagem
      v_message := public._cadence_render_message(
        COALESCE(v_step.message_text, ''),
        COALESCE(v_contact.full_name, 'Paciente'),
        v_appt_date_br,
        v_appt_time_br,
        v_company.name,
        COALESCE(v_service.name, '')
      );

      -- Insere sem duplicar (ON CONFLICT DO NOTHING pela unique constraint)
      INSERT INTO public.cadence_events (
        company_id,
        cadence_run_id,
        cadence_id,
        cadence_step_id,
        appointment_id,
        contact_id,
        channel,
        recipient_phone,
        scheduled_at,
        message_body,
        payload,
        status,
        idempotency_key
      ) VALUES (
        v_appt.company_id,
        v_run_id,
        v_cadence.id,
        v_step.id,
        p_appointment_id,
        v_appt.contact_id,
        'whatsapp',
        v_phone,
        v_scheduled_at,
        v_message,
        jsonb_build_object(
          'appointment_id',   p_appointment_id,
          'scheduled_at',     v_appt.scheduled_at,
          'contact_name',     COALESCE(v_contact.full_name, ''),
          'company_name',     v_company.name,
          'service_name',     COALESCE(v_service.name, ''),
          'step_name',        v_step.name,
          'step_order',       v_step.step_order,
          'cadence_name',     v_cadence.name
        ),
        'pending',
        v_ikey
      )
      ON CONFLICT (company_id, idempotency_key) DO NOTHING;

      IF FOUND THEN
        v_events_created := v_events_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success',        true,
    'runs_created',   v_runs_created,
    'events_created', v_events_created,
    'appointment_id', p_appointment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_cadence_events_for_appointment(uuid) TO service_role;

-- =============================================================================
-- 2. cancel_cadence_events_for_appointment
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancel_cadence_events_for_appointment(
  p_appointment_id uuid,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canceled_events integer;
BEGIN
  -- Cancela eventos pendentes/processing
  UPDATE public.cadence_events
  SET status    = 'canceled',
      last_error = COALESCE(p_reason, 'appointment_canceled'),
      updated_at = now()
  WHERE appointment_id = p_appointment_id
    AND status IN ('pending', 'processing');

  GET DIAGNOSTICS v_canceled_events = ROW_COUNT;

  -- Marca runs como canceled (os que ainda estão active)
  UPDATE public.cadence_runs
  SET status     = 'canceled',
      updated_at = now()
  WHERE appointment_id = p_appointment_id
    AND status = 'active';

  RETURN jsonb_build_object(
    'success',         true,
    'canceled_events', v_canceled_events,
    'appointment_id',  p_appointment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_cadence_events_for_appointment(uuid, text) TO service_role;

-- =============================================================================
-- 3. supersede_and_regenerate_cadence_events
-- Chamado quando o agendamento é remarcado (nova data/hora).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supersede_and_regenerate_cadence_events(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canceled integer;
BEGIN
  -- Supersede eventos pendentes
  UPDATE public.cadence_events
  SET status     = 'canceled',
      last_error = 'appointment_rescheduled',
      updated_at = now()
  WHERE appointment_id = p_appointment_id
    AND status IN ('pending', 'processing');

  GET DIAGNOSTICS v_canceled = ROW_COUNT;

  -- Marca runs como superseded
  UPDATE public.cadence_runs
  SET status     = 'superseded',
      updated_at = now()
  WHERE appointment_id = p_appointment_id
    AND status = 'active';

  -- Gera novos eventos com os novos horários
  RETURN public.generate_cadence_events_for_appointment(p_appointment_id)
      || jsonb_build_object('superseded_events', v_canceled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.supersede_and_regenerate_cadence_events(uuid) TO service_role;

-- =============================================================================
-- 4. claim_due_cadence_events
-- Usado pelo n8n. Faz lock atômico com FOR UPDATE SKIP LOCKED.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.claim_due_cadence_events(
  p_limit     integer DEFAULT 50,
  p_worker_id text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker    text;
  v_lock_until timestamptz;
  v_rows      jsonb;
BEGIN
  v_worker     := COALESCE(p_worker_id, 'worker-' || gen_random_uuid()::text);
  v_lock_until := now() + interval '5 minutes';

  WITH claimed AS (
    SELECT id
    FROM public.cadence_events
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND attempts < max_attempts
    ORDER BY scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.cadence_events ce
    SET status       = 'processing',
        attempts     = attempts + 1,
        locked_at    = now(),
        locked_until = v_lock_until,
        locked_by    = v_worker,
        updated_at   = now()
    FROM claimed
    WHERE ce.id = claimed.id
    RETURNING
      ce.id,
      ce.company_id,
      ce.appointment_id,
      ce.contact_id,
      ce.channel,
      ce.recipient_phone,
      ce.message_body,
      ce.payload,
      ce.attempts,
      ce.idempotency_key,
      ce.cadence_run_id,
      ce.cadence_step_id
  )
  SELECT jsonb_agg(row_to_json(u)) INTO v_rows FROM updated u;

  RETURN jsonb_build_object(
    'success', true,
    'worker',  v_worker,
    'events',  COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

-- n8n usa service_role para chamar esta função
GRANT EXECUTE ON FUNCTION public.claim_due_cadence_events(integer, text) TO service_role;

-- =============================================================================
-- 5. mark_cadence_event_sent
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_cadence_event_sent(
  p_event_id          uuid,
  p_external_message_id text DEFAULT NULL,
  p_result            jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.cadence_events
  SET status              = 'sent',
      sent_at             = now(),
      external_message_id = COALESCE(p_external_message_id, external_message_id),
      locked_at           = NULL,
      locked_until        = NULL,
      locked_by           = NULL,
      payload             = payload || jsonb_build_object('send_result', p_result),
      updated_at          = now()
  WHERE id = p_event_id
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'event_not_found_or_not_processing', 'event_id', p_event_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_cadence_event_sent(uuid, text, jsonb) TO service_role;

-- =============================================================================
-- 6. mark_cadence_event_failed
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_cadence_event_failed(
  p_event_id  uuid,
  p_error     text,
  p_retry     boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event   record;
  v_new_status text;
  v_retry_at   timestamptz;
BEGIN
  SELECT id, attempts, max_attempts, status
  INTO v_event
  FROM public.cadence_events
  WHERE id = p_event_id
    AND status = 'processing';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'event_not_found_or_not_processing', 'event_id', p_event_id);
  END IF;

  -- Se ainda há tentativas E retry solicitado → volta para pending com backoff
  IF p_retry = true AND v_event.attempts < v_event.max_attempts THEN
    v_new_status := 'pending';
    -- Backoff exponencial: 5min, 15min, 45min
    v_retry_at := now() + (power(3, v_event.attempts - 1) * interval '5 minutes');
  ELSE
    v_new_status := 'failed';
    v_retry_at   := NULL;
  END IF;

  UPDATE public.cadence_events
  SET status       = v_new_status,
      last_error   = p_error,
      failed_at    = CASE WHEN v_new_status = 'failed' THEN now() ELSE failed_at END,
      -- Se vai retry, agenda como pending apenas depois do retry_at passando via locked_until hack
      scheduled_at = CASE WHEN v_new_status = 'pending' AND v_retry_at IS NOT NULL THEN v_retry_at ELSE scheduled_at END,
      locked_at    = NULL,
      locked_until = NULL,
      locked_by    = NULL,
      updated_at   = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'success',     true,
    'event_id',    p_event_id,
    'new_status',  v_new_status,
    'attempts',    v_event.attempts,
    'max_attempts', v_event.max_attempts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_cadence_event_failed(uuid, text, boolean) TO service_role;

-- =============================================================================
-- 7. rpc_get_cadence_events_for_company
-- Leitura paginada para o frontend (usa RLS via SECURITY INVOKER default).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_cadence_events_for_company(
  p_company_id uuid,
  p_status     text[]  DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_company_id uuid;
  v_rows            jsonb;
  v_total           bigint;
BEGIN
  -- Valida que o usuário autenticado pertence à empresa
  SELECT company_id INTO v_user_company_id
  FROM public.user_companies
  WHERE user_id = auth.uid()
    AND company_id = p_company_id
  LIMIT 1;

  IF v_user_company_id IS NULL THEN
    -- Aceita platform_admin e system_admin
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND system_role::text IN ('platform_admin', 'system_admin')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.cadence_events ce
  WHERE ce.company_id = p_company_id
    AND (p_status IS NULL OR ce.status = ANY(p_status));

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   ce.id,
      'cadence_run_id',       ce.cadence_run_id,
      'cadence_id',           ce.cadence_id,
      'cadence_step_id',      ce.cadence_step_id,
      'appointment_id',       ce.appointment_id,
      'contact_id',           ce.contact_id,
      'channel',              ce.channel,
      'recipient_phone',      ce.recipient_phone,
      'scheduled_at',         ce.scheduled_at,
      'message_body',         ce.message_body,
      'status',               ce.status,
      'attempts',             ce.attempts,
      'sent_at',              ce.sent_at,
      'failed_at',            ce.failed_at,
      'last_error',           ce.last_error,
      'external_message_id',  ce.external_message_id,
      'created_at',           ce.created_at,
      'cadence_name',         ct.name,
      'step_name',            cs.name,
      'contact_name',         co.full_name
    )
  )
  INTO v_rows
  FROM public.cadence_events ce
  LEFT JOIN public.cadence_templates ct ON ct.id = ce.cadence_id
  LEFT JOIN public.cadence_steps cs     ON cs.id = ce.cadence_step_id
  LEFT JOIN public.contacts co          ON co.id = ce.contact_id
  WHERE ce.company_id = p_company_id
    AND (p_status IS NULL OR ce.status = ANY(p_status))
  ORDER BY ce.scheduled_at ASC
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'total',   v_total,
    'events',  COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_cadence_events_for_company(uuid, text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_cadence_events_for_company(uuid, text[], integer, integer) TO service_role;
