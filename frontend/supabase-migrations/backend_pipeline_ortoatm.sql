-- Pipeline + estágios para OrtoATM e empresas sem pipeline ativo
-- Garante que todas as empresas tenham pipeline para permitir "Novo Negócio"

DO $$
DECLARE
  v_company_id UUID;
  v_pipeline_id UUID;
BEGIN
  FOR v_company_id IN
    SELECT c.id FROM public.companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.company_id = c.id AND p.is_active = true
    )
  LOOP
    INSERT INTO public.pipelines (company_id, name, is_active, is_default)
    VALUES (v_company_id, 'Pipeline Comercial', true, true)
    RETURNING id INTO v_pipeline_id;

    INSERT INTO public.pipeline_stages (pipeline_id, name, position, color, win_probability) VALUES
      (v_pipeline_id, 'Prospecção',   1, '#6B7280', 10),
      (v_pipeline_id, 'Qualificação', 2, '#3B82F6', 25),
      (v_pipeline_id, 'Proposta',     3, '#F59E0B', 50),
      (v_pipeline_id, 'Negociação',   4, '#8B5CF6', 75),
      (v_pipeline_id, 'Fechamento',   5, '#10B981', 90);
  END LOOP;
END $$;
