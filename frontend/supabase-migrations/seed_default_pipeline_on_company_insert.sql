-- =============================================================================
-- Trigger: semeia pipeline padrão automaticamente ao criar uma empresa.
-- Garante que toda nova empresa — criada pelo frontend, API, SQL ou admin —
-- sempre tenha um pipeline com etapas prontas para uso.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_seed_default_pipeline_on_company_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  -- Cria o pipeline padrão
  INSERT INTO public.pipelines (company_id, name, is_active)
  VALUES (NEW.id, 'Jornada do Cliente', true)
  RETURNING id INTO v_pipeline_id;

  -- Cria as etapas padrão (pipeline_stages não tem coluna company_id)
  INSERT INTO public.pipeline_stages (pipeline_id, name, position, color, win_probability)
  VALUES
    (v_pipeline_id, 'Prospecção',   0, '#6B7280', 10),
    (v_pipeline_id, 'Qualificação', 1, '#3B82F6', 25),
    (v_pipeline_id, 'Proposta',     2, '#8B5CF6', 50),
    (v_pipeline_id, 'Negociação',   3, '#F59E0B', 75),
    (v_pipeline_id, 'Fechamento',   4, '#10B981', 90);

  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir (idempotente)
DROP TRIGGER IF EXISTS trg_seed_default_pipeline_on_company_insert ON public.companies;

-- Cria o trigger na tabela companies
CREATE TRIGGER trg_seed_default_pipeline_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_seed_default_pipeline_on_company_insert();
