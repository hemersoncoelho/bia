-- RPC: rpc_ai_get_conversation_crm_context
-- Retorna o deal aberto vinculado a uma conversa + todos os estágios do pipeline.
-- Chamada pelo nó busca_contexto_crm do workflow n8n antes do agente de IA.
-- SECURITY DEFINER + GRANT anon → bypassa RLS com validação de tenant interna.
--
-- Parâmetros:
--   p_company_id      — tenant
--   p_conversation_id — conversa (buscará deal por conversation_id ou contact fallback)
--
-- Retorna: { deal: { id, title, amount, status, current_stage, pipeline_id } | null,
--            pipeline_stages: [{ id, name, sort_order }] }

CREATE OR REPLACE FUNCTION public.rpc_ai_get_conversation_crm_context(
  p_company_id      UUID,
  p_conversation_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_id     UUID;
  v_pipeline_id UUID;
  v_deal        JSON;
  v_stages      JSON;
BEGIN
  -- Busca deal aberto por conversation_id
  SELECT d.id, d.pipeline_id INTO v_deal_id, v_pipeline_id
  FROM public.deals d
  WHERE d.conversation_id = p_conversation_id
    AND d.company_id = p_company_id
    AND d.status = 'open'
  LIMIT 1;

  -- Fallback: via contact_id da conversa
  IF v_deal_id IS NULL THEN
    SELECT d.id, d.pipeline_id INTO v_deal_id, v_pipeline_id
    FROM public.conversations c
    JOIN public.deals d ON d.contact_id = c.contact_id
    WHERE c.id = p_conversation_id
      AND c.company_id = p_company_id
      AND d.company_id = p_company_id
      AND d.status = 'open'
    ORDER BY d.created_at DESC
    LIMIT 1;
  END IF;

  IF v_deal_id IS NULL THEN
    RETURN json_build_object(
      'deal',            NULL,
      'pipeline_stages', '[]'::JSON
    );
  END IF;

  -- Monta JSON do deal com estágio atual
  SELECT json_build_object(
    'id',            d.id,
    'title',         d.title,
    'amount',        d.amount,
    'status',        d.status,
    'current_stage', ps.name,
    'pipeline_id',   d.pipeline_id
  ) INTO v_deal
  FROM public.deals d
  LEFT JOIN public.pipeline_stages ps ON ps.id = d.stage_id
  WHERE d.id = v_deal_id;

  -- Busca todos os estágios do pipeline ordenados
  SELECT COALESCE(
    json_agg(
      json_build_object('id', ps.id, 'name', ps.name, 'sort_order', ps.sort_order)
      ORDER BY ps.sort_order
    ),
    '[]'::JSON
  ) INTO v_stages
  FROM public.pipeline_stages ps
  WHERE ps.pipeline_id = v_pipeline_id;

  RETURN json_build_object(
    'deal',            v_deal,
    'pipeline_stages', v_stages
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'deal',            NULL,
    'pipeline_stages', '[]'::JSON,
    'error',           SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ai_get_conversation_crm_context(UUID, UUID)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
