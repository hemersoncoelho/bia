-- ============================================================
-- FIX: Novo atendimento — suporte a company_memberships
-- Após Etapa 2, usuários podem estar apenas em company_memberships.
-- has_any_company_role e rpc_get_inbox_conversations usavam só user_companies.
-- rpc_create_contact_and_conversation verificava agente só em user_companies.
-- ============================================================

-- 1. has_any_company_role — verifica company_memberships OU user_companies
CREATE OR REPLACE FUNCTION public.has_any_company_role(p_company_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.company_memberships cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
      AND cm.role::TEXT = ANY(p_roles)
  )
  OR EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id
      AND uc.user_id = auth.uid()
      AND uc.role_in_company::TEXT = ANY(p_roles)
  );
$$;

-- 2. rpc_get_inbox_conversations — busca role em company_memberships primeiro
CREATE OR REPLACE FUNCTION public.rpc_get_inbox_conversations(p_company_id UUID)
RETURNS SETOF public.v_inbox_conversations
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role     TEXT;
  v_team_id  UUID;
  v_user_id  UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN QUERY
    SELECT * FROM public.v_inbox_conversations v
    WHERE v.company_id = p_company_id
    ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

  -- Busca role: company_memberships primeiro, fallback user_companies
  SELECT cm.role::TEXT, cm.team_id INTO v_role, v_team_id
  FROM public.company_memberships cm
  WHERE cm.company_id = p_company_id AND cm.user_id = v_user_id AND cm.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT uc.role_in_company::TEXT, uc.team_id INTO v_role, v_team_id
    FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = v_user_id
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_role = 'company_admin' THEN
    RETURN QUERY
    SELECT * FROM public.v_inbox_conversations v
    WHERE v.company_id = p_company_id
    ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

  IF v_role = 'manager' THEN
    RETURN QUERY
    SELECT * FROM public.v_inbox_conversations v
    WHERE v.company_id = p_company_id
      AND (
        v.assigned_to_id = v_user_id
        OR v.assigned_to_id IN (
          SELECT uc2.user_id FROM public.user_companies uc2
          JOIN public.teams t ON t.id = uc2.team_id AND t.manager_id = v_user_id
          WHERE uc2.company_id = p_company_id
        )
        OR v.assigned_to_id IN (
          SELECT cm2.user_id FROM public.company_memberships cm2
          JOIN public.teams t ON t.id = cm2.team_id AND t.manager_id = v_user_id
          WHERE cm2.company_id = p_company_id AND cm2.status = 'active'
        )
        OR v.assigned_to_id IS NULL
      )
    ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM public.v_inbox_conversations v
  WHERE v.company_id = p_company_id
    AND v.assigned_to_id = v_user_id
  ORDER BY v.last_message_at DESC NULLS LAST;
END;
$$;

-- 3. rpc_create_contact_and_conversation — verifica agente em cm OU uc
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
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    IF NOT (
        public.is_platform_admin()
        OR public.has_any_company_role(p_company_id, ARRAY['company_admin', 'manager', 'agent'])
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para criar contato/conversa nesta empresa.');
    END IF;

    -- Agente deve pertencer à empresa (company_memberships OU user_companies)
    IF p_agent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.company_memberships
            WHERE user_id = p_agent_id AND company_id = p_company_id AND status = 'active'
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_companies
            WHERE user_id = p_agent_id AND company_id = p_company_id
        ) THEN
            RETURN json_build_object('success', false, 'error', 'Agente atribuído não pertence a esta empresa.');
        END IF;
    END IF;

    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.identifier = p_identity AND c.company_id = p_company_id
    LIMIT 1;

    IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (company_id, full_name, created_at)
        VALUES (p_company_id, p_contact_name, now())
        RETURNING id INTO v_contact_id;

        INSERT INTO public.contact_identities (contact_id, provider, identifier)
        VALUES (v_contact_id, p_channel, p_identity);
    END IF;

    INSERT INTO public.conversations (
        company_id, contact_id, channel, assigned_to, status, priority, unread_count, created_at
    ) VALUES (
        p_company_id, v_contact_id, p_channel, p_agent_id, 'open', 'normal', 0, now()
    ) RETURNING id INTO v_conversation_id;

    -- INSERT compatível com schema atual (company_id, direction, sender_user_id, etc.)
    INSERT INTO public.messages (
        company_id, conversation_id, contact_id, channel_account_id,
        direction, message_type, sender_type, sender_user_id,
        body, payload, status, is_internal
    ) VALUES (
        p_company_id, v_conversation_id, v_contact_id, NULL,
        'outbound'::public.message_direction_enum, 'text', 'user',
        p_agent_id, p_initial_message, '{}'::JSONB,
        'queued'::public.message_status_enum, false
    ) RETURNING id INTO v_message_id;

    UPDATE public.conversations
    SET last_message_at = NOW(), last_message_preview = LEFT(p_initial_message, 200)
    WHERE id = v_conversation_id;

    RETURN json_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'contact_id', v_contact_id,
        'message_id', v_message_id
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rpc_create_contact_and_conversation error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
