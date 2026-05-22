-- =============================================================
-- agent_operations_001.sql
-- Tabela de operações do agente (Autopilot).
-- Operações são criadas pelo n8n/IA e executadas automaticamente
-- no horário agendado. O usuário pode editar, adiar ou cancelar.
-- =============================================================

-- ── Tabela principal ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_operations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id        uuid        REFERENCES contacts(id) ON DELETE SET NULL,

  contact_name      text        NOT NULL DEFAULT '',
  contact_initials  text        NOT NULL DEFAULT '',

  operation_type    text        NOT NULL
    CHECK (operation_type IN ('follow_up', 'escalate', 'confirm', 'rescue')),
  operation_label   text        NOT NULL,

  context           text        NOT NULL DEFAULT '',
  message           text        NOT NULL DEFAULT '',

  channel           text        NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'email')),

  send_at           timestamptz NOT NULL,

  status            text        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'cancelled', 'failed', 'paused', 'needs_reschedule')),

  reason            text,

  source            text        NOT NULL DEFAULT 'agent'
    CHECK (source = 'agent'),

  agent_id          uuid        REFERENCES ai_agents(id) ON DELETE SET NULL,
  workflow_id       text,
  cadence_id        uuid,
  task_id           uuid        REFERENCES tasks(id) ON DELETE SET NULL,

  idempotency_key   text        UNIQUE,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_operations_company_status
  ON agent_operations (company_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_operations_company_send_at
  ON agent_operations (company_id, send_at);

-- ── Autopilot por empresa ─────────────────────────────────────
-- Adiciona flag de autopilot à tabela companies.
-- Se já existir, o IF NOT EXISTS garante idempotência.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS autopilot_enabled boolean NOT NULL DEFAULT true;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE agent_operations ENABLE ROW LEVEL SECURITY;

-- Leitura: membros da empresa
CREATE POLICY "agent_operations: members read"
  ON agent_operations FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

-- Escrita: membros podem editar message, send_at e cancelar (status)
CREATE POLICY "agent_operations: members update"
  ON agent_operations FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

-- service_role tem acesso total (n8n, Edge Functions)
CREATE POLICY "agent_operations: service_role all"
  ON agent_operations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Trigger: updated_at automático ───────────────────────────
CREATE OR REPLACE FUNCTION set_agent_operations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_operations_updated_at
  BEFORE UPDATE ON agent_operations
  FOR EACH ROW EXECUTE FUNCTION set_agent_operations_updated_at();

-- ── RPCs ──────────────────────────────────────────────────────

-- Atualiza a mensagem de uma operação pendente
CREATE OR REPLACE FUNCTION rpc_update_agent_operation_message(
  p_company_id   uuid,
  p_operation_id uuid,
  p_message      text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE agent_operations
     SET message = p_message
   WHERE id = p_operation_id
     AND company_id = p_company_id
     AND status IN ('queued', 'paused');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'operation_not_found_or_not_editable');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Reagenda (define novo send_at e retorna status para queued)
CREATE OR REPLACE FUNCTION rpc_reschedule_agent_operation(
  p_company_id   uuid,
  p_operation_id uuid,
  p_send_at      timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE agent_operations
     SET send_at = p_send_at,
         status  = 'queued'
   WHERE id = p_operation_id
     AND company_id = p_company_id
     AND status NOT IN ('sent', 'sending');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'operation_not_found_or_already_sent');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Adia a operação em N minutos (padrão: 60)
CREATE OR REPLACE FUNCTION rpc_snooze_agent_operation(
  p_company_id   uuid,
  p_operation_id uuid,
  p_minutes      int DEFAULT 60
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE agent_operations
     SET send_at = send_at + (p_minutes || ' minutes')::interval
   WHERE id = p_operation_id
     AND company_id = p_company_id
     AND status IN ('queued', 'paused', 'needs_reschedule');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'operation_not_found_or_not_snoozable');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Cancela uma operação pendente
CREATE OR REPLACE FUNCTION rpc_cancel_agent_operation(
  p_company_id   uuid,
  p_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE agent_operations
     SET status = 'cancelled'
   WHERE id = p_operation_id
     AND company_id = p_company_id
     AND status IN ('queued', 'paused', 'needs_reschedule');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'operation_not_found_or_already_sent');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Liga/desliga o Autopilot por empresa
CREATE OR REPLACE FUNCTION rpc_set_company_autopilot_enabled(
  p_company_id uuid,
  p_enabled    boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE companies
     SET autopilot_enabled = p_enabled
   WHERE id = p_company_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Grants ────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION rpc_update_agent_operation_message   TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_reschedule_agent_operation       TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_snooze_agent_operation           TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_cancel_agent_operation           TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_set_company_autopilot_enabled    TO authenticated;

-- n8n usa service_role — sem necessidade de grant explícito
-- IMPORTANTE: após aplicar esta migration, os nodes do n8n que criam
-- agent_operations devem usar a credencial service_role key.
