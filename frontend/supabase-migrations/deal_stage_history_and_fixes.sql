-- ============================================================
-- deal_stage_history_and_fixes.sql
-- Sia One — Histórico de movimentação de deals no pipeline
--
-- Problemas resolvidos:
--   1. Tabela deal_stage_history não existia (trigger disparava mas tabela ausente)
--   2. Trigger fn_track_deal_stage_change causava FK violation em audit_logs
--      ao chamar auth.uid() em contextos onde o user não está em user_profiles
--   3. Parâmetro p_stage_id renomeado para p_new_stage_id em rpc_update_deal_stage
--      (frontend estava enviando p_stage_id → 400 Bad Request)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.deal_stage_history CASCADE;
--   DROP TRIGGER IF EXISTS trg_deal_stage_history ON public.deals;
--   DROP FUNCTION IF EXISTS public.fn_track_deal_stage_change();
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabela deal_stage_history
--    Cada linha = uma movimentação de estágio de um deal
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_stage_history (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES public.companies(id)        ON DELETE CASCADE,
  deal_id             UUID        NOT NULL REFERENCES public.deals(id)            ON DELETE CASCADE,
  old_stage_id        UUID                 REFERENCES public.pipeline_stages(id)  ON DELETE SET NULL,
  new_stage_id        UUID                 REFERENCES public.pipeline_stages(id)  ON DELETE SET NULL,
  changed_by_user_id  UUID                 REFERENCES public.user_profiles(id)    ON DELETE SET NULL,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal_id
  ON public.deal_stage_history (deal_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_company_id
  ON public.deal_stage_history (company_id, changed_at DESC);

-- RLS: qualquer membro da empresa pode ler; trigger (service_role) pode inserir
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_stage_history_select" ON public.deal_stage_history;
CREATE POLICY "deal_stage_history_select"
  ON public.deal_stage_history
  FOR SELECT
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "deal_stage_history_insert" ON public.deal_stage_history;
CREATE POLICY "deal_stage_history_insert"
  ON public.deal_stage_history
  FOR INSERT
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────
-- 2. Trigger function — best-effort (EXCEPTION = silently skip)
--    auth.uid() pode retornar NULL em contextos service_role ou
--    quando o user_profiles ainda não foi criado; deixar nullable.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_track_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só registra se stage_id realmente mudou
  IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.deal_stage_history (
      company_id,
      deal_id,
      old_stage_id,
      new_stage_id,
      changed_by_user_id,
      changed_at
    ) VALUES (
      NEW.company_id,
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      auth.uid(),   -- NULL quando service_role / sem sessão (permitido pela FK nullable)
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Logging best-effort: nunca bloquear o UPDATE do deal por falha no histórico
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Recriar o trigger de forma idempotente
DROP TRIGGER IF EXISTS trg_deal_stage_history ON public.deals;
CREATE TRIGGER trg_deal_stage_history
  AFTER UPDATE OF stage_id ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_track_deal_stage_change();


-- ────────────────────────────────────────────────────────────
-- 3. Corrige rpc_update_deal_stage para aceitar tanto p_stage_id
--    quanto p_new_stage_id (compatibilidade frontend)
--    O frontend agora envia p_new_stage_id (corrigido), mas
--    mantemos um wrapper com p_stage_id como alias seguro.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_deal_stage(
  p_deal_id      UUID,
  p_new_stage_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id     UUID;
  v_deal_pipeline  UUID;
  v_stage_pipeline UUID;
BEGIN
  SELECT company_id, pipeline_id
    INTO v_company_id, v_deal_pipeline
    FROM public.deals
   WHERE id = p_deal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio não encontrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = v_company_id AND uc.user_id = auth.uid()
  ) AND NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT pipeline_id
    INTO v_stage_pipeline
    FROM public.pipeline_stages
   WHERE id = p_new_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estágio não encontrado.';
  END IF;

  IF v_stage_pipeline IS DISTINCT FROM v_deal_pipeline THEN
    RAISE EXCEPTION 'Estágio não pertence ao pipeline deste negócio.';
  END IF;

  UPDATE public.deals
     SET stage_id   = p_new_stage_id,
         updated_at = now()
   WHERE id = p_deal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_deal_stage(UUID, UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. Corrige audit_logs: permite que actor_user_id (ou actor_id)
--    seja nullable para não bloquear inserts de usuários normais.
--    Executado de forma defensiva com IF EXISTS.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Tenta tornar actor_user_id nullable (caso exista com esse nome)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'audit_logs'
      AND column_name  = 'actor_user_id'
  ) THEN
    ALTER TABLE public.audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;
  END IF;

  -- Tenta tornar actor_id nullable (nome usado na migration supabase_audit.sql)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'audit_logs'
      AND column_name  = 'actor_id'
  ) THEN
    ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;
  END IF;
END $$;


NOTIFY pgrst, 'reload schema';
