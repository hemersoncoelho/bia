-- =============================================================================
-- followup_ledger_002_agent_ops_fields.sql
--
-- Fase 1 da fundação de dados do sistema de follow-up.
-- Adiciona campos de contexto de ciclo em `agent_operations`.
-- Todos os comandos são ADD COLUMN IF NOT EXISTS — idempotentes.
--
-- NOTA SOBRE follow_up_event_id:
--   A coluna é adicionada aqui SEM FK constraint porque follow_up_events
--   ainda não existe neste momento. A FK é adicionada em
--   followup_ledger_003_follow_up_events.sql após a tabela ser criada.
-- =============================================================================

-- ── Campos de contexto de ciclo ──────────────────────────────────────────────

ALTER TABLE public.agent_operations
  ADD COLUMN IF NOT EXISTS conversation_id   uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id           uuid REFERENCES public.deals(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt_number    integer NOT NULL DEFAULT 1
    CHECK (attempt_number > 0),
  ADD COLUMN IF NOT EXISTS cycle_id         uuid,
  -- Referência ao evento de ledger correspondente.
  -- FK adicionada em followup_ledger_003_follow_up_events.sql.
  ADD COLUMN IF NOT EXISTS follow_up_event_id uuid;

COMMENT ON COLUMN public.agent_operations.conversation_id IS
  'Conversa associada a esta operação de follow-up.';
COMMENT ON COLUMN public.agent_operations.deal_id IS
  'Deal associado a esta operação de follow-up.';
COMMENT ON COLUMN public.agent_operations.attempt_number IS
  'Número da tentativa dentro do ciclo de follow-up (1 = primeira tentativa).';
COMMENT ON COLUMN public.agent_operations.cycle_id IS
  'ID do ciclo de follow-up ao qual esta operação pertence. Corresponde a follow_up_cycle_state.cycle_id.';
COMMENT ON COLUMN public.agent_operations.follow_up_event_id IS
  'Referência ao registro de ledger em follow_up_events. FK adicionada após criação da tabela alvo.';

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_ops_conversation_id
  ON public.agent_operations (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_deal_id
  ON public.agent_operations (deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_ops_cycle_id
  ON public.agent_operations (cycle_id)
  WHERE cycle_id IS NOT NULL;
