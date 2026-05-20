-- =============================================================================
-- FASE 3 — ai_followup_decisions
--
-- Propósito: registrar o raciocínio operacional da IA antes de criar tarefa
-- ou follow-up. Funciona como trilha de auditoria das decisões do agente.
--
-- Esta tabela é separada da memória da conversa e da execução de WhatsApp.
-- Não misturar com ai_agents (configuração) nem com tasks (ação resultante).
-- =============================================================================

-- ── 1. Enum de status ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.ai_followup_decision_status_enum AS ENUM (
    'pending',              -- decisão registrada, aguardando avaliação
    'accepted',             -- humano aprovou a ação recomendada
    'rejected',             -- humano rejeitou a ação
    'converted_to_task',    -- gerou tarefa em tasks
    'converted_to_execution', -- gerou execução futura (envio de mensagem)
    'ignored',              -- descartada (ex: contato respondeu antes)
    'failed'                -- erro ao processar
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tabela principal ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_followup_decisions (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ── Âncoras de tenant (obrigatórias) ──
  company_id              UUID        NOT NULL REFERENCES public.companies(id)     ON DELETE CASCADE,
  contact_id              UUID        NOT NULL REFERENCES public.contacts(id)      ON DELETE CASCADE,
  conversation_id         UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

  -- ── Origem: trigger que gerou esta decisão (opcional) ──
  followup_trigger_id     UUID        REFERENCES public.conversation_followup_triggers(id) ON DELETE SET NULL,

  -- ── Contexto da decisão ──
  detected_event          TEXT,
  recommended_action      TEXT,
  recommended_message     TEXT,
  suggested_due_at        TIMESTAMPTZ,
  confidence              NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
  requires_human_approval BOOLEAN      NOT NULL DEFAULT FALSE,

  -- ── Estado da decisão ──
  status                  public.ai_followup_decision_status_enum NOT NULL DEFAULT 'pending',

  -- ── Payload bruto para auditoria ──
  raw_input               JSONB,
  raw_output              JSONB,

  -- ── Timestamps ──
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Trigger updated_at ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_ai_followup_decisions_updated_at ON public.ai_followup_decisions;
CREATE TRIGGER trg_ai_followup_decisions_updated_at
  BEFORE UPDATE ON public.ai_followup_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Índices ───────────────────────────────────────────────────────────────

-- Busca por empresa + status (dashboard de pendentes para aprovação humana)
CREATE INDEX IF NOT EXISTS idx_ai_decisions_company_status
  ON public.ai_followup_decisions (company_id, status);

-- Busca por conversa (histórico de decisões de uma conversa)
CREATE INDEX IF NOT EXISTS idx_ai_decisions_conversation_id
  ON public.ai_followup_decisions (conversation_id);

-- Join com triggers
CREATE INDEX IF NOT EXISTS idx_ai_decisions_trigger_id
  ON public.ai_followup_decisions (followup_trigger_id)
  WHERE followup_trigger_id IS NOT NULL;

-- Busca por contato
CREATE INDEX IF NOT EXISTS idx_ai_decisions_contact_id
  ON public.ai_followup_decisions (contact_id);

-- Pendentes que requerem aprovação humana
CREATE INDEX IF NOT EXISTS idx_ai_decisions_pending_approval
  ON public.ai_followup_decisions (company_id, requires_human_approval)
  WHERE status = 'pending' AND requires_human_approval = TRUE;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_followup_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_decisions_select" ON public.ai_followup_decisions;
DROP POLICY IF EXISTS "ai_decisions_insert" ON public.ai_followup_decisions;
DROP POLICY IF EXISTS "ai_decisions_update" ON public.ai_followup_decisions;
DROP POLICY IF EXISTS "ai_decisions_delete" ON public.ai_followup_decisions;

-- Leitura: membros da empresa veem as decisões da própria empresa
CREATE POLICY "ai_decisions_select"
  ON public.ai_followup_decisions FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_company_member(ai_followup_decisions.company_id)
  );

-- Inserção bloqueada: apenas RPCs SECURITY DEFINER criam registros
CREATE POLICY "ai_decisions_insert"
  ON public.ai_followup_decisions FOR INSERT
  WITH CHECK (FALSE);

-- Atualização bloqueada: apenas RPCs SECURITY DEFINER atualizam status
CREATE POLICY "ai_decisions_update"
  ON public.ai_followup_decisions FOR UPDATE
  USING (FALSE);

-- Deleção bloqueada: dados de auditoria são imutáveis
CREATE POLICY "ai_decisions_delete"
  ON public.ai_followup_decisions FOR DELETE
  USING (FALSE);
