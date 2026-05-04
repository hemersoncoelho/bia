-- ============================================================
-- Agent Tools — RPCs para o MCP Server n8n
-- Operações atômicas chamadas pelas tools do agente de IA.
-- SECURITY DEFINER → roda como postgres (sem JWT do n8n anon).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1. rpc_ai_edit_deal
--    Edita título, valor e/ou data prevista de um deal.
--    O agente só pode editar deals da mesma empresa.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_ai_edit_deal(
  p_company_id          UUID,
  p_deal_id             UUID,
  p_title               TEXT    DEFAULT NULL,
  p_amount              NUMERIC DEFAULT NULL,
  p_expected_close_date DATE    DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_deal_exists BOOLEAN;
BEGIN
  -- Valida que o deal pertence à empresa
  SELECT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_deal_id AND company_id = p_company_id
  ) INTO v_deal_exists;

  IF NOT v_deal_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Deal não encontrado ou não pertence a esta empresa'
    );
  END IF;

  -- Atualiza apenas os campos fornecidos (COALESCE preserva valor atual)
  UPDATE public.deals
  SET
    title               = COALESCE(p_title,               title),
    amount              = COALESCE(p_amount,              amount),
    expected_close_date = COALESCE(p_expected_close_date, expected_close_date),
    updated_at          = NOW()
  WHERE id = p_deal_id
    AND company_id = p_company_id;

  RETURN json_build_object(
    'success', true,
    'deal_id', p_deal_id,
    'updated_fields', json_build_object(
      'title',               p_title,
      'amount',              p_amount,
      'expected_close_date', p_expected_close_date
    )
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_ai_edit_deal(UUID, UUID, TEXT, NUMERIC, DATE)
  TO anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 2. rpc_ai_transfer_attendance
--    Transfere a conversa para humano em uma chamada atômica:
--    1) muda attendance_mode → 'human'
--    2) limpa ai_agent_id da conversa
--    3) atribui ao team_id ou agent_id (opcional)
--    4) opcionalmente enfileira mensagem de aviso ao cliente
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_ai_transfer_attendance(
  p_company_id      UUID,
  p_conversation_id UUID,
  p_team_id         UUID    DEFAULT NULL,
  p_agent_id        UUID    DEFAULT NULL,
  p_message         TEXT    DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_conv_exists   BOOLEAN;
  v_agent_valid   BOOLEAN := true;
  v_team_valid    BOOLEAN := true;
BEGIN
  -- Valida que a conversa pertence à empresa
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND company_id = p_company_id
  ) INTO v_conv_exists;

  IF NOT v_conv_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Conversa não encontrada ou não pertence a esta empresa'
    );
  END IF;

  -- Valida team se fornecido
  IF p_team_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = p_team_id AND company_id = p_company_id
    ) INTO v_team_valid;

    IF NOT v_team_valid THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Time não encontrado ou não pertence a esta empresa'
      );
    END IF;
  END IF;

  -- Valida agente humano se fornecido
  IF p_agent_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_companies
      WHERE user_id = p_agent_id AND company_id = p_company_id
    ) INTO v_agent_valid;

    IF NOT v_agent_valid THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Agente não encontrado nesta empresa'
      );
    END IF;
  END IF;

  -- Executa transferência atômica
  UPDATE public.conversations
  SET
    attendance_mode  = 'human',
    ai_agent_id      = NULL,
    ai_paused_at     = NOW(),
    assigned_to      = COALESCE(p_agent_id, assigned_to),
    updated_at       = NOW()
  WHERE id = p_conversation_id
    AND company_id = p_company_id;

  -- Enfileira mensagem de aviso ao cliente (se fornecida)
  IF p_message IS NOT NULL AND p_message <> '' THEN
    PERFORM public.rpc_enqueue_outbound_message(
      p_conversation_id := p_conversation_id,
      p_body            := p_message,
      p_sender_type     := 'system'
    );
  END IF;

  RETURN json_build_object(
    'success',         true,
    'conversation_id', p_conversation_id,
    'transferred_to',  json_build_object(
      'team_id',  p_team_id,
      'agent_id', p_agent_id
    ),
    'message_sent', p_message IS NOT NULL AND p_message <> ''
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_ai_transfer_attendance(UUID, UUID, UUID, UUID, TEXT)
  TO anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 3. rpc_ai_get_assets
--    Retorna os assets de uma tool de mídia para o n8n.
--    O n8n usa o public_url para enviar via UAZAPI.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_ai_get_assets(
  p_company_id UUID,
  p_agent_id   UUID,
  p_tool_slug  TEXT
)
RETURNS JSON AS $$
DECLARE
  v_assets JSON;
BEGIN
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id',         a.id,
        'label',      COALESCE(a.label, a.file_name),
        'public_url', a.public_url,
        'mime_type',  a.mime_type,
        'sort_order', a.sort_order
      )
      ORDER BY a.sort_order
    ),
    '[]'::json
  )
  INTO v_assets
  FROM public.agent_tool_assets a
  JOIN public.agent_tool_bindings b ON b.id = a.binding_id
  WHERE b.company_id = p_company_id
    AND b.agent_id   = p_agent_id
    AND a.tool_slug  = p_tool_slug;

  RETURN json_build_object(
    'success', true,
    'tool_slug', p_tool_slug,
    'assets', v_assets
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_ai_get_assets(UUID, UUID, TEXT)
  TO anon, authenticated;

COMMIT;
