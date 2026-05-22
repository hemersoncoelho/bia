-- =============================================================================
-- followup_ledger_001_contacts_config.sql
--
-- Fase 1 da fundação de dados do sistema de follow-up.
-- Não altera fluxo n8n, frontend nem dados existentes.
--
-- Entrega:
--   A) Configurações de follow-up por empresa em `companies`
--   B) Campos de opt-out por contato em `contacts`
-- =============================================================================

-- ── A. CONFIGURAÇÕES DE FOLLOW-UP EM COMPANIES ───────────────────────────────
--
-- Padrão do projeto: configs por empresa são adicionadas como colunas
-- em `companies` (mesmo padrão de autopilot_enabled em agent_operations_001.sql).
-- Não existe tabela company_settings separada.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS follow_up_max_attempts      integer NOT NULL DEFAULT 3
    CHECK (follow_up_max_attempts > 0),
  ADD COLUMN IF NOT EXISTS follow_up_min_interval_hours integer NOT NULL DEFAULT 24
    CHECK (follow_up_min_interval_hours > 0),
  ADD COLUMN IF NOT EXISTS follow_up_attribution_hours  integer NOT NULL DEFAULT 72
    CHECK (follow_up_attribution_hours > 0);

COMMENT ON COLUMN public.companies.follow_up_max_attempts IS
  'Número máximo de tentativas de follow-up por ciclo antes de parar automaticamente.';
COMMENT ON COLUMN public.companies.follow_up_min_interval_hours IS
  'Intervalo mínimo em horas entre duas tentativas de follow-up para o mesmo contato.';
COMMENT ON COLUMN public.companies.follow_up_attribution_hours IS
  'Janela em horas após o envio do follow-up na qual uma resposta inbound é atribuída ao follow-up.';

-- ── B. OPT-OUT DE FOLLOW-UP EM CONTACTS ──────────────────────────────────────
--
-- Permite que um contato seja marcado como optout manualmente (ou futuramente
-- por detecção automática de palavras-chave como STOP/PARE).
-- A lógica de detecção automática virá em fase posterior.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS follow_up_opt_out        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_opt_out_at     timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_opt_out_reason text;

COMMENT ON COLUMN public.contacts.follow_up_opt_out IS
  'true quando o contato optou por não receber follow-ups automáticos.';
COMMENT ON COLUMN public.contacts.follow_up_opt_out_at IS
  'Timestamp em que o opt-out foi registrado.';
COMMENT ON COLUMN public.contacts.follow_up_opt_out_reason IS
  'Motivo do opt-out (ex: "stop_keyword", "manual_request", "opted_out_via_n8n").';

-- ── Índice: busca rápida de contatos com opt-out ativo ───────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_follow_up_opt_out
  ON public.contacts (company_id)
  WHERE follow_up_opt_out = true;
