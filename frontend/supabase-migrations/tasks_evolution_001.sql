-- =============================================================================
-- FASE 1 — Evolução da tabela tasks
-- Adiciona campos faltantes sem quebrar compatibilidade com a estrutura existente.
-- Todos os comandos usam ADD COLUMN IF NOT EXISTS ou DROP/CREATE seguro.
-- =============================================================================

-- ── 1. Colunas de relacionamento (já podem existir; IF NOT EXISTS protege) ───

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS description         TEXT,
  ADD COLUMN IF NOT EXISTS contact_id          UUID REFERENCES public.contacts(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id     UUID REFERENCES public.conversations(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id             UUID REFERENCES public.deals(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to         UUID REFERENCES public.user_profiles(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_agent_id   UUID REFERENCES public.ai_agents(id)       ON DELETE SET NULL;

-- ── 2. Metadados de origem ───────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority       TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS source_type    TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'ai', 'followup_trigger', 'cadence', 'appointment', 'inbox', 'system')),
  ADD COLUMN IF NOT EXISTS source_id      UUID,
  ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}';

-- ── 3. Campos de raciocínio da IA ────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ai_generated         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_confidence        NUMERIC(4,3)         CHECK (ai_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS ai_reason            TEXT,
  ADD COLUMN IF NOT EXISTS recommended_message  TEXT;

-- ── 4. Auditoria ─────────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- ── 5. Trigger updated_at ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Índices de desempenho ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_company_id      ON public.tasks (company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id      ON public.tasks (contact_id)      WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_conversation_id ON public.tasks (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to     ON public.tasks (assigned_to)     WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status          ON public.tasks (company_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at          ON public.tasks (company_id, due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_ai_generated    ON public.tasks (company_id, ai_generated) WHERE ai_generated = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_source_type     ON public.tasks (company_id, source_type);

-- ── 7. RLS — substituir políticas antigas por versão com is_company_member ───

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tasks isolation"      ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_policy"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_policy"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_policy"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_policy"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"         ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"         ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"         ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"         ON public.tasks;

-- Leitura: apenas membros da empresa ou plataforma-admin
CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_company_member(tasks.company_id)
  );

-- Criação: apenas membros da empresa podem criar tarefas na própria empresa
CREATE POLICY "tasks_insert"
  ON public.tasks FOR INSERT
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_company_member(tasks.company_id)
  );

-- Atualização: apenas membros da empresa
CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  USING (
    public.is_platform_admin()
    OR public.is_company_member(tasks.company_id)
  );

-- Deleção: apenas membros da empresa
CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  USING (
    public.is_platform_admin()
    OR public.is_company_member(tasks.company_id)
  );
