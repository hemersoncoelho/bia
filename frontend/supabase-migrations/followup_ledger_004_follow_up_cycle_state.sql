-- =============================================================================
-- followup_ledger_004_follow_up_cycle_state.sql
--
-- Fase 1 da fundação de dados do sistema de follow-up.
-- Cria o estado corrente do ciclo de follow-up por contato/contexto.
--
-- Responsabilidades desta tabela:
--   - Manter o estado atual do ciclo (active, paused, stopped, responded, completed).
--   - Controlar contagem de tentativas e máximo permitido.
--   - Saber quando o próximo follow é permitido (next_allowed_at).
--   - Registrar quando o contato respondeu.
--   - Impedir ciclos ativos duplicados para o mesmo contexto.
--
-- IMPORTANTE:
--   - Uma única linha por ciclo ativo por contexto (company + contact + conversa/deal).
--   - Ciclos stopped/responded/completed não bloqueiam novos ciclos futuros.
-- =============================================================================

-- ── 1. Tabela principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follow_up_cycle_state (

  -- ── Identidade ──
  id            uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Âncoras de tenant ──
  company_id      uuid NOT NULL REFERENCES public.companies(id)     ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES public.contacts(id)      ON DELETE CASCADE,
  conversation_id uuid          REFERENCES public.conversations(id) ON DELETE SET NULL,
  deal_id         uuid          REFERENCES public.deals(id)         ON DELETE SET NULL,

  -- ── Ciclo ──
  -- Compartilhado com follow_up_events.cycle_id para rastrear todos os eventos
  -- de uma mesma sequência de tentativas.
  cycle_id      uuid NOT NULL DEFAULT gen_random_uuid(),

  -- ── Estado do ciclo ──
  -- active    : ciclo em andamento, aguardando next_allowed_at para próxima tentativa
  -- paused    : ciclo pausado manualmente ou por cadência pausada
  -- stopped   : ciclo encerrado por regra (ver stopped_reason)
  -- responded : contato respondeu — ciclo encerrado com sucesso
  -- completed : todas as tentativas esgotadas sem resposta
  cycle_status  text NOT NULL DEFAULT 'active'
    CHECK (cycle_status IN ('active','paused','stopped','responded','completed')),

  -- ── Contagem de tentativas ──
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts  integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),

  -- ── Controle temporal ──
  last_follow_sent_at timestamptz,  -- quando o último follow foi enviado
  next_allowed_at     timestamptz,  -- quando a próxima tentativa é permitida

  -- ── Resposta do contato ──
  last_inbound_at timestamptz,       -- último inbound recebido neste contexto
  has_responded   boolean NOT NULL DEFAULT false,
  responded_at    timestamptz,

  -- ── Parada do ciclo ──
  stopped_at     timestamptz,
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

  -- ── Origem das configurações ──
  -- company_default : usa follow_up_max_attempts e follow_up_min_interval_hours da empresa
  -- cadence         : usa configuração da cadência vinculada
  -- manual          : configuração sobrescrita manualmente por agente/admin
  settings_source text NOT NULL DEFAULT 'company_default'
    CHECK (settings_source IN ('company_default','cadence','manual')),

  -- ── Relacionamento com cadência ──
  cadence_id uuid REFERENCES public.cadence_templates(id) ON DELETE SET NULL,

  -- ── Auditoria ──
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()

);

-- ── 2. Trigger updated_at ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_follow_up_cycle_state_updated_at ON public.follow_up_cycle_state;
CREATE TRIGGER trg_follow_up_cycle_state_updated_at
  BEFORE UPDATE ON public.follow_up_cycle_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Índices de unicidade de ciclo ativo ────────────────────────────────────
--
-- Três índices únicos parciais para cobrir os três contextos possíveis.
-- Cada índice é mutuamente exclusivo com os outros pelo filtro WHERE.
-- Permite múltiplos ciclos para o mesmo contato contanto que não sejam
-- simultaneamente active/paused no mesmo contexto.
--
-- Por que índices parciais em vez de UNIQUE NULLS NOT DISTINCT?
--   Portabilidade: o NULLS NOT DISTINCT requer PostgreSQL 15+.
--   Semântica: cada índice expressa explicitamente o contexto de negócio.

-- Contexto 1: ciclo com conversa (ex: follow de Inbox)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fup_cycle_state_unique_active_conversation
  ON public.follow_up_cycle_state (company_id, contact_id, conversation_id)
  WHERE conversation_id IS NOT NULL
    AND cycle_status IN ('active','paused');

-- Contexto 2: ciclo com deal, sem conversa (ex: follow de Pipeline)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fup_cycle_state_unique_active_deal
  ON public.follow_up_cycle_state (company_id, contact_id, deal_id)
  WHERE deal_id IS NOT NULL
    AND conversation_id IS NULL
    AND cycle_status IN ('active','paused');

-- Contexto 3: ciclo só por contato (sem conversa nem deal)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fup_cycle_state_unique_active_contact_only
  ON public.follow_up_cycle_state (company_id, contact_id)
  WHERE conversation_id IS NULL
    AND deal_id IS NULL
    AND cycle_status IN ('active','paused');

-- ── 4. Índices de performance ─────────────────────────────────────────────────

-- Busca por empresa + contato (histórico de ciclos)
CREATE INDEX IF NOT EXISTS idx_fup_cycle_state_company_contact
  ON public.follow_up_cycle_state (company_id, contact_id);

-- Busca por status (dashboard de ciclos ativos)
CREATE INDEX IF NOT EXISTS idx_fup_cycle_state_company_status
  ON public.follow_up_cycle_state (company_id, cycle_status);

-- Job de varredura: ciclos ativos com next_allowed_at vencido
CREATE INDEX IF NOT EXISTS idx_fup_cycle_state_next_allowed
  ON public.follow_up_cycle_state (company_id, next_allowed_at)
  WHERE cycle_status = 'active' AND next_allowed_at IS NOT NULL;

-- Busca por cycle_id (join com follow_up_events)
CREATE INDEX IF NOT EXISTS idx_fup_cycle_state_cycle_id
  ON public.follow_up_cycle_state (cycle_id);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.follow_up_cycle_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fup_cycle_select"       ON public.follow_up_cycle_state;
DROP POLICY IF EXISTS "fup_cycle_insert"       ON public.follow_up_cycle_state;
DROP POLICY IF EXISTS "fup_cycle_update"       ON public.follow_up_cycle_state;
DROP POLICY IF EXISTS "fup_cycle_delete"       ON public.follow_up_cycle_state;
DROP POLICY IF EXISTS "fup_cycle_service_role" ON public.follow_up_cycle_state;

-- Leitura: membros da empresa
CREATE POLICY "fup_cycle_select"
  ON public.follow_up_cycle_state FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_company_member(follow_up_cycle_state.company_id)
  );

-- Inserção bloqueada para authenticated: apenas RPCs SECURITY DEFINER criam ciclos
CREATE POLICY "fup_cycle_insert"
  ON public.follow_up_cycle_state FOR INSERT
  WITH CHECK (FALSE);

-- Atualização bloqueada para authenticated: apenas RPCs SECURITY DEFINER atualizam estado
CREATE POLICY "fup_cycle_update"
  ON public.follow_up_cycle_state FOR UPDATE
  USING (FALSE);

-- Deleção bloqueada: ciclos encerrados são histórico
CREATE POLICY "fup_cycle_delete"
  ON public.follow_up_cycle_state FOR DELETE
  USING (FALSE);

-- service_role (n8n, Edge Functions) tem acesso total
CREATE POLICY "fup_cycle_service_role"
  ON public.follow_up_cycle_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 6. Grants ─────────────────────────────────────────────────────────────────

-- authenticated pode consultar via RLS; não pode escrever diretamente
GRANT SELECT ON public.follow_up_cycle_state TO authenticated;
