-- RPC: rpc_ai_move_deal_stage
-- Move um deal aberto para outro estágio do pipeline usando o NOME do estágio.
-- Chamada pela tool_mover_crm do agente de IA via n8n (anon key).
-- SECURITY DEFINER + GRANT anon → bypassa RLS com validação de tenant interna.
--
-- Parâmetros:
--   p_company_id      — tenant (validação de isolamento)
--   p_conversation_id — conversa vinculada ao deal
--   p_stage_name      — nome exato (ou parcial) do estágio destino
--
-- Retorna: { success, deal_id?, stage_id?, moved_from?, moved_to?, error? }

CREATE OR REPLACE FUNCTION public.rpc_ai_move_deal_stage(
  p_company_id      UUID,
  p_conversation_id UUID,
  p_stage_name      TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_id   UUID;
  v_stage_id  UUID;
  v_old_stage TEXT;
BEGIN
  -- Busca deal aberto vinculado à conversa
  SELECT d.id INTO v_deal_id
  FROM public.deals d
  WHERE d.conversation_id = p_conversation_id
    AND d.company_id = p_company_id
    AND d.status = 'open'
  LIMIT 1;

  -- Fallback: busca via contact_id da conversa
  IF v_deal_id IS NULL THEN
    SELECT d.id INTO v_deal_id
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
      'success', false,
      'error', 'Nenhum deal aberto encontrado para esta conversa'
    );
  END IF;

  -- Busca estágio por nome exato (case-insensitive) no pipeline do deal
  SELECT ps.id INTO v_stage_id
  FROM public.pipeline_stages ps
  JOIN public.deals d ON d.pipeline_id = ps.pipeline_id
  WHERE d.id = v_deal_id
    AND lower(ps.name) = lower(trim(p_stage_name))
  LIMIT 1;

  -- Fallback: match parcial
  IF v_stage_id IS NULL THEN
    SELECT ps.id INTO v_stage_id
    FROM public.pipeline_stages ps
    JOIN public.deals d ON d.pipeline_id = ps.pipeline_id
    WHERE d.id = v_deal_id
      AND lower(ps.name) LIKE '%' || lower(trim(p_stage_name)) || '%'
    ORDER BY ps.sort_order
    LIMIT 1;
  END IF;

  IF v_stage_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Estágio não encontrado: "' || p_stage_name || '". Verifique os nomes disponíveis no pipeline.'
    );
  END IF;

  -- Captura estágio atual para resposta
  SELECT ps.name INTO v_old_stage
  FROM public.deals d
  JOIN public.pipeline_stages ps ON ps.id = d.stage_id
  WHERE d.id = v_deal_id;

  -- Move o deal
  UPDATE public.deals
  SET stage_id   = v_stage_id,
      updated_at = NOW()
  WHERE id = v_deal_id
    AND company_id = p_company_id;

  RETURN json_build_object(
    'success',    true,
    'deal_id',    v_deal_id,
    'stage_id',   v_stage_id,
    'moved_from', COALESCE(v_old_stage, 'desconhecido'),
    'moved_to',   p_stage_name
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ai_move_deal_stage(UUID, UUID, TEXT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
