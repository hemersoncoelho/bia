-- =============================================================================
-- followup_ledger_003_follow_up_events.sql
--
-- Fase 1 da fundação de dados do sistema de follow-up.
-- Cria o ledger auditável de tentativas e resultados de follow-up.
--
-- Responsabilidades desta tabela:
--   - Registrar cada tentativa de follow-up enviada (imutável após created).
--   - Armazenar o status de entrega, resposta e parada.
--   - Controlar a janela de atribuição (attribution_until).
--   - Garantir idempotência por idempotency_key.
--
-- Esta tabela NÃO substitui:
--   - messages: comunicação real com o contato.
--   - agent_operations: agendamento/execução de tarefas do autopilot.
--   - conversation_followup_triggers: relógio de espera.
-- =============================================================================

-- ── 1. Tabela principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follow_up_events (

  -- ── Identidade ──
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Âncoras de tenant ──
  company_id    uuid        NOT NULL REFERENCES public.companies(id)      ON DELETE CASCADE,
  contact_id    uuid        NOT NULL REFERENCES public.contacts(id)       ON DELETE CASCADE,
  conversation_id uuid               REFERENCES public.conversations(id)  ON DELETE SET NULL,
  deal_id       uuid                 REFERENCES public.deals(id)          ON DELETE SET NULL,
  task_id       uuid                 REFERENCES public.tasks(id)          ON DELETE SET NULL,

  -- ── Rastreabilidade de execução ──
  operation_id  uuid                 REFERENCES public.agent_operations(id) ON DELETE SET NULL,
  trigger_id    uuid                 REFERENCES public.conversation_followup_triggers(id) ON DELETE SET NULL,
  cadence_id    uuid                 REFERENCES public.cadence_templates(id) ON DELETE SET NULL,
  cadence_step_id uuid               REFERENCES public.cadence_steps(id)   ON DELETE SET NULL,

  -- ── Origem do follow-up ──
  -- agent_auto    : agente de IA enviou automaticamente
  -- cadence_step  : passo de cadência estática
  -- human_manual  : agente humano enviou manualmente com marcação de follow
  -- human_bulk    : envio em massa marcado como follow
  -- system_rescue : sistema de rescue/fallback
  follow_type   text        NOT NULL
    CHECK (follow_type IN ('agent_auto','cadence_step','human_manual','human_bulk','system_rescue')),

  -- ── Canal de comunicação ──
  channel       text        NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp','email','sms','internal')),

  -- ── Ciclo ──
  cycle_id      uuid        NOT NULL,
  attempt_number integer    NOT NULL DEFAULT 1 CHECK (attempt_number > 0),

  -- ── Mensagem enviada ──
  -- messages.id é BIGINT (BIGSERIAL) — não UUID
  message_id              bigint     REFERENCES public.messages(id) ON DELETE SET NULL,
  external_message_id     text,

  -- ── Controle temporal ──
  sent_at           timestamptz NOT NULL DEFAULT now(),
  next_allowed_at   timestamptz,          -- próximo follow permitido (calculado ao criar)
  attribution_until timestamptz,          -- até quando uma resposta inbound é atribuída a este follow

  -- ── Status do ciclo de vida do evento ──
  -- scheduled  : agendado mas ainda não enviado
  -- sent       : enviado, aguardando confirmação
  -- delivered  : confirmação de entrega recebida
  -- failed     : falha no envio
  -- cancelled  : cancelado antes do envio
  -- responded  : contato respondeu dentro da janela de atribuição
  -- expired    : attribution_until passou sem resposta
  -- stopped    : ciclo parado por regra (ver stopped_reason)
  status        text        NOT NULL DEFAULT 'sent'
    CHECK (status IN ('scheduled','sent','delivered','failed','cancelled','responded','expired','stopped')),

  -- ── Resposta do contato ──
  responded_at          timestamptz,
  -- messages.id é BIGINT
  response_message_id   bigint     REFERENCES public.messages(id) ON DELETE SET NULL,

  -- ── Parada do ciclo ──
  stopped_reason text
    CHECK (stopped_reason IS NULL OR stopped_reason IN (
      'contact_replied',
      'max_attempts_reached',
      'deal_stage_changed',
      'meeting_booked',
      'human_took_over',
      'opt_out',
      'invalid_channel',
      'manual_cancel',
      'cadence_paused',
      'autopilot_disabled',
      'deal_won',
      'deal_lost',
      'conversation_closed'
    )),

  -- ── Idempotência ──
  -- Permite que n8n reenvie o mesmo payload sem duplicar o registro.
  -- Unique aplicado via índice parcial abaixo (apenas quando não null).
  idempotency_key text,

  -- ── Auditoria ──
  created_by_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()

);

-- ── 2. Trigger updated_at ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_follow_up_events_updated_at ON public.follow_up_events;
CREATE TRIGGER trg_follow_up_events_updated_at
  BEFORE UPDATE ON public.follow_up_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Índices ────────────────────────────────────────────────────────────────

-- Busca principal: todos os follows de um contato por empresa, ordem cronológica
CREATE INDEX IF NOT EXISTS idx_fup_events_company_contact
  ON public.follow_up_events (company_id, contact_id, sent_at DESC);

-- Busca por conversa
CREATE INDEX IF NOT EXISTS idx_fup_events_company_conversation
  ON public.follow_up_events (company_id, conversation_id, sent_at DESC)
  WHERE conversation_id IS NOT NULL;

-- Busca por deal
CREATE INDEX IF NOT EXISTS idx_fup_events_company_deal
  ON public.follow_up_events (company_id, deal_id, sent_at DESC)
  WHERE deal_id IS NOT NULL;

-- Busca por cadência e status (relatórios de cadência)
CREATE INDEX IF NOT EXISTS idx_fup_events_company_cadence_status
  ON public.follow_up_events (company_id, cadence_id, status)
  WHERE cadence_id IS NOT NULL;

-- Busca de respondidos (análise de atribuição)
CREATE INDEX IF NOT EXISTS idx_fup_events_company_responded_at
  ON public.follow_up_events (company_id, responded_at)
  WHERE responded_at IS NOT NULL;

-- Busca de janelas de atribuição abertas (job de varredura para marcar expired)
CREATE INDEX IF NOT EXISTS idx_fup_events_attribution_open
  ON public.follow_up_events (company_id, attribution_until)
  WHERE status = 'sent' AND responded_at IS NULL;

-- Busca por ciclo
CREATE INDEX IF NOT EXISTS idx_fup_events_cycle_id
  ON public.follow_up_events (cycle_id);

-- Idempotência: único parcial — só entra em vigor quando idempotency_key não é null
CREATE UNIQUE INDEX IF NOT EXISTS idx_fup_events_idempotency_key
  ON public.follow_up_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.follow_up_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fup_events_select"         ON public.follow_up_events;
DROP POLICY IF EXISTS "fup_events_insert"         ON public.follow_up_events;
DROP POLICY IF EXISTS "fup_events_update"         ON public.follow_up_events;
DROP POLICY IF EXISTS "fup_events_delete"         ON public.follow_up_events;
DROP POLICY IF EXISTS "fup_events_service_role"   ON public.follow_up_events;

-- Leitura: membros da empresa (o is_company_member já inclui is_platform_admin)
CREATE POLICY "fup_events_select"
  ON public.follow_up_events FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_company_member(follow_up_events.company_id)
  );

-- Inserção bloqueada para authenticated: apenas RPCs SECURITY DEFINER criam registros
CREATE POLICY "fup_events_insert"
  ON public.follow_up_events FOR INSERT
  WITH CHECK (FALSE);

-- Atualização bloqueada para authenticated: apenas RPCs SECURITY DEFINER atualizam
CREATE POLICY "fup_events_update"
  ON public.follow_up_events FOR UPDATE
  USING (FALSE);

-- Deleção bloqueada: ledger é imutável
CREATE POLICY "fup_events_delete"
  ON public.follow_up_events FOR DELETE
  USING (FALSE);

-- service_role (n8n, Edge Functions) tem acesso total
CREATE POLICY "fup_events_service_role"
  ON public.follow_up_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 5. Grants ─────────────────────────────────────────────────────────────────

-- authenticated pode consultar via RLS; não pode escrever diretamente
GRANT SELECT ON public.follow_up_events TO authenticated;

-- ── 6. FK backlink em agent_operations ───────────────────────────────────────
--
-- follow_up_events já existe agora. Adicionamos a FK constraint que estava
-- pendente em followup_ledger_002_agent_ops_fields.sql.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_agent_ops_follow_up_event'
      AND conrelid = 'public.agent_operations'::regclass
  ) THEN
    ALTER TABLE public.agent_operations
      ADD CONSTRAINT fk_agent_ops_follow_up_event
        FOREIGN KEY (follow_up_event_id)
        REFERENCES public.follow_up_events(id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_agent_ops_follow_up_event ON public.agent_operations IS
  'FK adicionada aqui (não em followup_ledger_002) para evitar dependência circular durante criação.';
