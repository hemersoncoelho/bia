-- ============================================================
-- MIGRATION: RPCs para Tools do Agente de IA (n8n)
--
-- Funções SECURITY DEFINER chamadas pelo n8n com service_role key.
-- NÃO requerem auth.uid() — validam isolamento via p_company_id.
--
-- Por que novas RPCs em vez de usar as existentes?
--   rpc_set_conversation_attendance → verifica auth.uid() IS NULL → falha no n8n
--   rpc_update_deal_stage           → verifica user_companies/auth.uid() → falha no n8n
--
-- Funções:
--   1. rpc_n8n_set_attendance_mode  — transfere conversa para human/ai/hybrid
--   2. rpc_n8n_update_deal_stage    — move deal para novo estágio do pipeline
--
-- GRANTS: apenas service_role (anon e authenticated NÃO podem chamar)
-- ============================================================

BEGIN;


-- ────────────────────────────────────────────────────────────
-- 1. rpc_n8n_set_attendance_mode
--
-- Altera o attendance_mode de uma conversa.
-- Uso típico: IA transfere para humano ao detectar pedido do cliente.
--
-- Parâmetros:
--   p_company_id      UUID  — tenant (validação de isolamento)
--   p_conversation_id UUID  — conversa a alterar
--   p_mode            TEXT  — 'human' | 'ai' | 'hybrid'
--
-- Retorna: { success, conversation_id, mode } ou { success: false, error }
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_n8n_set_attendance_mode(
    p_company_id      UUID,
    p_conversation_id UUID,
    p_mode            TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation public.conversations%ROWTYPE;
    v_msg_body     TEXT;
BEGIN
    -- 1. Validar parâmetros obrigatórios
    IF p_company_id IS NULL OR p_conversation_id IS NULL OR p_mode IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Parâmetros obrigatórios ausentes: company_id, conversation_id, mode.'
        );
    END IF;

    -- 2. Validar modo aceito
    IF p_mode NOT IN ('human', 'ai', 'hybrid') THEN
        RETURN json_build_object(
            'success', false,
            'error',   format('Modo inválido "%s". Use: human, ai ou hybrid.', p_mode)
        );
    END IF;

    -- 3. Buscar conversa e validar pertencimento ao tenant
    SELECT * INTO v_conversation
    FROM public.conversations
    WHERE id         = p_conversation_id
      AND company_id = p_company_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Conversa não encontrada para esta empresa.'
        );
    END IF;

    -- 4. Atualizar modo de atendimento
    UPDATE public.conversations
    SET
        attendance_mode = p_mode::public.attendance_mode_enum,
        ai_paused_at    = CASE WHEN p_mode = 'human' THEN NOW() ELSE NULL END,
        updated_at      = NOW()
    WHERE id = p_conversation_id;

    -- 5. Inserir mensagem interna de auditoria (is_internal = true — não exibida ao cliente)
    v_msg_body := CASE p_mode
        WHEN 'human'  THEN 'Atendimento transferido para um agente humano.'
        WHEN 'ai'     THEN 'Atendimento retomado pela IA.'
        WHEN 'hybrid' THEN 'Modo híbrido ativado: IA auxiliando o atendimento.'
        ELSE                'Modo de atendimento alterado para ' || p_mode || '.'
    END;

    INSERT INTO public.messages (
        company_id,
        conversation_id,
        contact_id,
        direction,
        message_type,
        sender_type,
        body,
        payload,
        status,
        is_internal,
        created_at
    ) VALUES (
        p_company_id,
        p_conversation_id,
        v_conversation.contact_id,
        'outbound'::public.message_direction_enum,
        'text',
        'bot'::public.sender_type_enum,
        v_msg_body,
        '{}'::jsonb,
        'sent'::public.message_status_enum,
        true,
        NOW()
    );

    RETURN json_build_object(
        'success',         true,
        'conversation_id', p_conversation_id,
        'mode',            p_mode
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Apenas service_role pode chamar (n8n usa service_role key)
REVOKE EXECUTE ON FUNCTION public.rpc_n8n_set_attendance_mode(UUID, UUID, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_n8n_set_attendance_mode(UUID, UUID, TEXT) TO service_role;


-- ────────────────────────────────────────────────────────────
-- 2. rpc_n8n_update_deal_stage
--
-- Move um deal aberto para outro estágio do pipeline.
-- Valida isolamento de tenant e consistência de pipeline.
--
-- Parâmetros:
--   p_company_id   UUID — tenant
--   p_deal_id      UUID — deal a mover
--   p_new_stage_id UUID — novo estágio (deve pertencer ao mesmo pipeline)
--
-- Retorna: { success, deal_id, new_stage_id } ou { success: false, error }
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_n8n_update_deal_stage(
    p_company_id   UUID,
    p_deal_id      UUID,
    p_new_stage_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deal           public.deals%ROWTYPE;
    v_stage_pipeline UUID;
BEGIN
    -- 1. Validar parâmetros obrigatórios
    IF p_company_id IS NULL OR p_deal_id IS NULL OR p_new_stage_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Parâmetros obrigatórios ausentes: company_id, deal_id, new_stage_id.'
        );
    END IF;

    -- 2. Buscar deal e validar pertencimento ao tenant
    SELECT * INTO v_deal
    FROM public.deals
    WHERE id         = p_deal_id
      AND company_id = p_company_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Deal não encontrado para esta empresa.'
        );
    END IF;

    -- 3. Não mover deals já fechados
    IF v_deal.status != 'open' THEN
        RETURN json_build_object(
            'success', false,
            'error',   format('Deal já está fechado com status "%s". Apenas deals abertos podem ser movidos.', v_deal.status)
        );
    END IF;

    -- 4. Validar que o novo estágio pertence ao mesmo pipeline do deal
    SELECT pipeline_id INTO v_stage_pipeline
    FROM public.pipeline_stages
    WHERE id = p_new_stage_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error',   'Estágio de destino não encontrado.'
        );
    END IF;

    IF v_stage_pipeline IS DISTINCT FROM v_deal.pipeline_id THEN
        RETURN json_build_object(
            'success', false,
            'error',   'O estágio de destino não pertence ao pipeline deste deal.'
        );
    END IF;

    -- 5. Mover deal para o novo estágio
    UPDATE public.deals
    SET
        stage_id   = p_new_stage_id,
        updated_at = NOW()
    WHERE id = p_deal_id;

    RETURN json_build_object(
        'success',      true,
        'deal_id',      p_deal_id,
        'new_stage_id', p_new_stage_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Apenas service_role pode chamar
REVOKE EXECUTE ON FUNCTION public.rpc_n8n_update_deal_stage(UUID, UUID, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_n8n_update_deal_stage(UUID, UUID, UUID) TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- VARIÁVEIS N8N NECESSÁRIAS (Settings → Variables)
-- ============================================================
-- SUPABASE_ANON_KEY        → anon key do projeto Supabase
-- SUPABASE_SERVICE_ROLE_KEY → service_role key do projeto Supabase
-- UAZAPI_INSTANCE_TOKEN     → instance_token da empresa (app_integrations.instance_token)
--
-- NOTA MULTI-TENANT: UAZAPI_INSTANCE_TOKEN é por empresa.
-- Para suporte a múltiplos tenants no mesmo workflow, o buffer
-- deve passar instance_token no payload, e o node "msg" deve
-- lê-lo via $('When Executed by Another Workflow').item.json.instance_token
-- ============================================================
