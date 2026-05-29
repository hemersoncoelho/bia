-- ============================================================
-- FIX: rpc_set_conversation_attendance — versão definitiva
-- Garante que TODOS os tenants (não só OrtoATM) possam usar o
-- toggle de IA no Inbox: "Pausar IA", "Ativar IA", "Só humano".
--
-- Problemas corrigidos:
--   1. INSERT em messages faltando colunas NOT NULL (company_id,
--      contact_id, direction, message_type, payload) → SQLERRM
--      capturado silenciosamente, botão "Pausar IA" não fazia nada.
--   2. Role 'agent' não estava na lista de permissões →
--      agents não conseguiam alterar o modo de atendimento.
--   3. GRANT explícito para authenticated e service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_set_conversation_attendance(
    p_conversation_id UUID,
    p_mode            TEXT,
    p_agent_id        UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
    v_contact_id UUID;
    v_body       TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT company_id, contact_id INTO v_company_id, v_contact_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(v_company_id, ARRAY['company_admin', 'manager', 'agent'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para alterar o modo de atendimento.');
    END IF;

    IF p_agent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.ai_agents
            WHERE id = p_agent_id AND company_id = v_company_id
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Agente não pertence a esta empresa.');
        END IF;
    END IF;

    UPDATE public.conversations
    SET
        attendance_mode = p_mode::public.attendance_mode_enum,
        ai_agent_id     = p_agent_id,
        ai_paused_at    = CASE WHEN p_mode = 'human' THEN NOW() ELSE NULL END
    WHERE id = p_conversation_id;

    v_body := CASE p_mode
        WHEN 'ai'     THEN 'Atendimento transferido para IA.'
        WHEN 'human'  THEN 'Atendimento retomado por humano.'
        WHEN 'hybrid' THEN 'Modo híbrido ativado: IA assistindo o atendimento.'
        ELSE 'Modo de atendimento alterado.'
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
        ai_agent_id
    ) VALUES (
        v_company_id,
        p_conversation_id,
        v_contact_id,
        'outbound'::public.message_direction_enum,
        'event',
        'system',
        v_body,
        '{}'::JSONB,
        'sent'::public.message_status_enum,
        false,
        p_agent_id
    );

    RETURN json_build_object('success', true, 'mode', p_mode);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Grant explícito: qualquer usuário autenticado pode chamar
-- (a verificação de papel está dentro da função)
GRANT EXECUTE ON FUNCTION public.rpc_set_conversation_attendance(UUID, TEXT, UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
