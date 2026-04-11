-- ============================================================
-- FIX: rpc_create_contact_and_conversation
-- Remove fallback ci.identifier (coluna não existe no live)
-- Adiciona: se contato/número já existe com conversa aberta → retorna da existente
-- Executar no Supabase SQL Editor
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_create_contact_and_conversation(uuid, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_create_contact_and_conversation(
    p_company_id      UUID,
    p_contact_name    TEXT,
    p_channel         TEXT,
    p_identity        TEXT,
    p_initial_message TEXT,
    p_agent_id        UUID
)
RETURNS JSON AS $$
DECLARE
    v_contact_id      UUID;
    v_conversation_id UUID;
    v_message_id      BIGINT;
    v_pub_id          UUID;
    v_norm            TEXT;
    v_existing_conv   UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(p_company_id, ARRAY['company_admin', 'manager', 'agent'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para criar atendimento nesta empresa.');
    END IF;

    IF p_agent_id IS NOT NULL THEN
        IF NOT (
            EXISTS (
                SELECT 1 FROM public.company_memberships
                WHERE user_id = p_agent_id AND company_id = p_company_id AND status = 'active'
            )
            OR EXISTS (
                SELECT 1 FROM public.user_companies
                WHERE user_id = p_agent_id AND company_id = p_company_id
            )
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Agente atribuído não pertence a esta empresa.');
        END IF;
    END IF;

    -- Normaliza o número de telefone (remove não-dígitos para WhatsApp)
    v_norm := CASE
        WHEN p_channel = 'whatsapp' THEN regexp_replace(p_identity, '[^0-9]', '', 'g')
        ELSE p_identity
    END;

    -- Busca contato pelo número normalizado OU display_value (schema novo, sem ci.identifier)
    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.company_id = p_company_id
      AND ci.channel_type::TEXT = p_channel
      AND (ci.normalized_value = v_norm OR ci.display_value = p_identity)
    LIMIT 1;

    -- Se encontrou contato existente, verifica se há uma conversa aberta para ele
    IF v_contact_id IS NOT NULL THEN
        SELECT id INTO v_existing_conv
        FROM public.conversations
        WHERE company_id = p_company_id
          AND contact_id = v_contact_id
          AND channel = p_channel
          AND status = 'open'
        ORDER BY created_at DESC
        LIMIT 1;

        -- Se existe conversa aberta → retorna ela sem criar nova
        IF v_existing_conv IS NOT NULL THEN
            RETURN json_build_object(
                'success',         true,
                'conversation_id', v_existing_conv,
                'contact_id',      v_contact_id,
                'message_id',      NULL,
                'public_id',       NULL,
                'reused',          true  -- sinaliza que é uma conversa já existente
            );
        END IF;
    END IF;

    -- Contato não existe → criar contato + identity
    IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (company_id, full_name, created_at)
        VALUES (p_company_id, p_contact_name, now())
        RETURNING id INTO v_contact_id;

        INSERT INTO public.contact_identities (
            company_id, contact_id, channel_type, identity_type, normalized_value, display_value
        ) VALUES (
            p_company_id,
            v_contact_id,
            p_channel::public.channel_type_enum,
            CASE p_channel
                WHEN 'whatsapp' THEN 'phone'
                WHEN 'email'    THEN 'email'
                ELSE 'external'
            END,
            v_norm,
            p_identity
        );
    END IF;

    -- Criar nova conversa (contato existe mas não tem conversa aberta, ou foi recém-criado)
    INSERT INTO public.conversations (
        company_id, contact_id, channel, assigned_to, status, priority, unread_count, created_at
    ) VALUES (
        p_company_id, v_contact_id, p_channel, p_agent_id, 'open', 'normal', 0, now()
    ) RETURNING id INTO v_conversation_id;

    -- Inserir mensagem inicial
    INSERT INTO public.messages (
        company_id,
        conversation_id,
        contact_id,
        channel_account_id,
        direction,
        message_type,
        sender_type,
        sender_user_id,
        body,
        payload,
        status,
        is_internal
    ) VALUES (
        p_company_id,
        v_conversation_id,
        v_contact_id,
        NULL,
        'outbound'::public.message_direction_enum,
        'text',
        'user',
        COALESCE(p_agent_id, auth.uid()),
        p_initial_message,
        '{}'::JSONB,
        'queued'::public.message_status_enum,
        false
    )
    RETURNING id, public_id INTO v_message_id, v_pub_id;

    UPDATE public.conversations
    SET
        last_message_at      = NOW(),
        last_message_preview = LEFT(p_initial_message, 200)
    WHERE id = v_conversation_id;

    RETURN json_build_object(
        'success',         true,
        'conversation_id', v_conversation_id,
        'contact_id',      v_contact_id,
        'message_id',      v_message_id,
        'public_id',       v_pub_id,
        'reused',          false
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rpc_create_contact_and_conversation error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
