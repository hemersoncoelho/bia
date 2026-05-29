-- RPC: rpc_n8n_get_conversation_context
-- Retorna attendance_mode (e ai_summary se coluna existir) de uma conversa.
-- SECURITY DEFINER + GRANT anon → bypassa RLS para uso pelo n8n sem JWT.
-- Substitui queries REST diretas na tabela conversations (que falham com anon key + RLS).
--
-- Aplicar ANTES ou DEPOIS de conversations_ai_summary.sql — compatível com ambos.

CREATE OR REPLACE FUNCTION public.rpc_n8n_get_conversation_context(
  p_conversation_id uuid
)
RETURNS TABLE (
  attendance_mode text,
  ai_summary      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_ai_summary boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'conversations'
      AND column_name  = 'ai_summary'
  ) INTO v_has_ai_summary;

  IF v_has_ai_summary THEN
    RETURN QUERY
      SELECT c.attendance_mode::text, c.ai_summary::text
      FROM public.conversations c
      WHERE c.id = p_conversation_id
      LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT c.attendance_mode::text, null::text
      FROM public.conversations c
      WHERE c.id = p_conversation_id
      LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_n8n_get_conversation_context(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
