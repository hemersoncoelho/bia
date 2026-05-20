-- =============================================================================
-- FASE 2 — conversation_followup_triggers
--
-- Propósito: registrar que uma conversa passou a aguardar resposta do contato.
-- O trigger não envia mensagem nem executa ação diretamente.
-- Quando vence, o n8n consulta esta tabela e decide a próxima ação.
-- Quando o contato responde antes do prazo, o trigger é cancelado.
-- =============================================================================

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.followup_trigger_status_enum AS ENUM (
    'pending',    -- aguardando o prazo ou cancelamento
    'cancelled',  -- contato respondeu antes do prazo
    'due',        -- prazo vencido, aguardando processamento pelo n8n
    'processed',  -- n8n processou e criou tarefa/decisão
    'skipped',    -- n8n decidiu ignorar (ex: conversa já fechada)
    'failed'      -- erro durante processamento
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.followup_trigger_type_enum AS ENUM (
    'no_response_after_ai_question',     -- IA fez pergunta e aguarda resposta
    'no_response_after_human_message',   -- agente humano enviou mensagem e aguarda resposta
    'third_party_decision_followup',     -- contato disse que precisa consultar terceiro
    'asked_to_return_later',             -- contato pediu para ser contactado depois
    'qualification_abandoned',           -- qualificação iniciada mas não concluída
    'post_quote_followup'                -- proposta enviada sem retorno
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tabela principal ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversation_followup_triggers (
  id                              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ── Âncoras de tenant (obrigatórias) ──
  company_id                      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id                      UUID        NOT NULL REFERENCES public.contacts(id)  ON DELETE CASCADE,
  conversation_id                 UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

  -- ── Tipo e estado ──
  trigger_type                    public.followup_trigger_type_enum   NOT NULL,
  status                          public.followup_trigger_status_enum NOT NULL DEFAULT 'pending',

  -- ── Janela temporal ──
  expected_reply_until            TIMESTAMPTZ NOT NULL,

  -- ── Rastreabilidade da mensagem que originou o trigger ──
  -- messages.id é BIGINT (série), não UUID
  created_from_message_id         BIGINT      REFERENCES public.messages(id) ON DELETE SET NULL,
  last_inbound_message_at_snapshot  TIMESTAMPTZ,
  last_outbound_message_at_snapshot TIMESTAMPTZ,

  -- ── Contexto do evento detectado ──
  detected_event                  TEXT,
  reason                          TEXT,
  recommended_action              TEXT,
  recommended_message             TEXT,
  ai_confidence                   NUMERIC(4,3) CHECK (ai_confidence BETWEEN 0 AND 1),
  metadata                        JSONB        DEFAULT '{}',

  -- ── Timestamps de ciclo de vida ──
  created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at                    TIMESTAMPTZ,
  cancelled_at                    TIMESTAMPTZ,
  cancelled_reason                TEXT
);

-- ── 3. Trigger updated_at ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_followup_triggers_updated_at ON public.conversation_followup_triggers;
CREATE TRIGGER trg_followup_triggers_updated_at
  BEFORE UPDATE ON public.conversation_followup_triggers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Índices ───────────────────────────────────────────────────────────────

-- Busca principal: n8n lista triggers vencidos por empresa
CREATE INDEX IF NOT EXISTS idx_fup_triggers_company_status
  ON public.conversation_followup_triggers (company_id, status, expected_reply_until);

-- Busca por conversa: verificar triggers pending para cancelar quando chega mensagem
CREATE INDEX IF NOT EXISTS idx_fup_triggers_conversation_pending
  ON public.conversation_followup_triggers (conversation_id, status)
  WHERE status = 'pending';

-- Busca por contato
CREATE INDEX IF NOT EXISTS idx_fup_triggers_contact_id
  ON public.conversation_followup_triggers (contact_id);

-- Busca por vencimento: job de varredura filtra por expected_reply_until < now()
CREATE INDEX IF NOT EXISTS idx_fup_triggers_due
  ON public.conversation_followup_triggers (expected_reply_until)
  WHERE status = 'pending';

-- Unicidade soft: evita trigger duplicado pending do mesmo tipo + evento para a mesma conversa
CREATE UNIQUE INDEX IF NOT EXISTS idx_fup_triggers_no_dup_pending
  ON public.conversation_followup_triggers (conversation_id, trigger_type, detected_event)
  WHERE status = 'pending';

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.conversation_followup_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fup_triggers_select" ON public.conversation_followup_triggers;
DROP POLICY IF EXISTS "fup_triggers_insert" ON public.conversation_followup_triggers;
DROP POLICY IF EXISTS "fup_triggers_update" ON public.conversation_followup_triggers;
DROP POLICY IF EXISTS "fup_triggers_delete" ON public.conversation_followup_triggers;

CREATE POLICY "fup_triggers_select"
  ON public.conversation_followup_triggers FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_company_member(conversation_followup_triggers.company_id)
  );

-- Inserção bloqueada via policy: só as RPCs SECURITY DEFINER criam registros
CREATE POLICY "fup_triggers_insert"
  ON public.conversation_followup_triggers FOR INSERT
  WITH CHECK (FALSE);

-- Atualização bloqueada via policy: só as RPCs SECURITY DEFINER atualizam
CREATE POLICY "fup_triggers_update"
  ON public.conversation_followup_triggers FOR UPDATE
  USING (FALSE);

-- Deleção bloqueada: registros são imutáveis (apenas status muda via RPC)
CREATE POLICY "fup_triggers_delete"
  ON public.conversation_followup_triggers FOR DELETE
  USING (FALSE);
