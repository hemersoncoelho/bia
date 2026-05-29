-- RPC: rpc_n8n_update_ai_summary
-- Salva/atualiza o ai_summary de uma conversa após o agente de IA responder.
-- Chamada pelo nó salva_resumo do workflow n8n.
-- Requer que conversations_ai_summary.sql já tenha sido aplicada.
-- SECURITY DEFINER + GRANT anon → bypassa RLS; UUID da conversa é a fronteira de segurança.
--
-- Parâmetros:
--   p_conversation_id — conversa a atualizar
--   p_summary         — novo texto de resumo (substituição total, não append)
--
-- Retorna: { success, error? }

CREATE OR REPLACE FUNCTION public.rpc_n8n_update_ai_summary(
  p_conversation_id UUID,
  p_summary         TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET ai_summary = p_summary,
      updated_at = NOW()
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Conversa não encontrada'
    );
  END IF;

  RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_n8n_update_ai_summary(UUID, TEXT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
