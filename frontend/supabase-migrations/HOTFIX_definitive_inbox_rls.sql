-- ============================================================
-- HOTFIX DEFINITIVO: RLS completo para Inbox / Mensagens
-- ============================================================
-- CAUSA RAIZ: as policies de conversations, contacts, deals e tasks
-- só verificavam user_companies. Usuários em company_memberships
-- (fluxo Etapa 2) não passam nessas policies — isso bloqueia:
--   • SELECT direto em messages (timeline vazia)
--   • Realtime subscription (mensagens não chegam ao frontend)
--   • Cascading: messages RLS faz subquery em conversations → bloqueada
--
-- O sidebar funciona porque rpc_get_inbox_conversations é SECURITY DEFINER
-- e bypassa RLS. Mas o ConversationDetail.tsx faz SELECT direto.
--
-- SOLUÇÃO: usar is_company_member() em TODAS as policies.
-- is_company_member() é SECURITY DEFINER e checa ambas as tabelas.
-- ============================================================

BEGIN;

-- ── 1. is_company_member: verifica user_companies OU company_memberships ────
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.company_memberships cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  );
$$;

-- ── 2. has_any_company_role: verifica user_companies OU company_memberships ──
CREATE OR REPLACE FUNCTION public.has_any_company_role(p_company_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id
      AND uc.user_id = auth.uid()
      AND uc.role_in_company::TEXT = ANY(p_roles)
  )
  OR EXISTS (
    SELECT 1 FROM public.company_memberships cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
      AND cm.role::TEXT = ANY(p_roles)
  );
$$;


-- ── 3. FIX conversations RLS ────────────────────────────────────────────────
-- ANTES: FOR SELECT + user_companies only → bloqueava company_memberships
-- AGORA: FOR ALL + is_company_member()
DROP POLICY IF EXISTS "Conversations isolation" ON public.conversations;

CREATE POLICY "Conversations isolation" ON public.conversations
FOR ALL USING (
  public.is_platform_admin()
  OR public.is_company_member(conversations.company_id)
);


-- ── 4. FIX contacts RLS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Contacts isolation" ON public.contacts;

CREATE POLICY "Contacts isolation" ON public.contacts
FOR ALL USING (
  public.is_platform_admin()
  OR public.is_company_member(contacts.company_id)
);


-- ── 5. FIX messages RLS ─────────────────────────────────────────────────────
-- Usa messages.company_id direto para evitar cascading RLS via conversations.
-- Fallback via conversations para mensagens antigas sem company_id.
DROP POLICY IF EXISTS "Messages isolation" ON public.messages;
DROP POLICY IF EXISTS "messages_all" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_all" ON public.messages
FOR ALL USING (
  public.is_platform_admin()
  OR public.is_company_member(messages.company_id)
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND public.is_company_member(c.company_id)
  )
);

-- Backfill: garante company_id em mensagens órfãs
UPDATE public.messages m
SET company_id = c.company_id
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.company_id IS NULL;


-- ── 6. FIX contact_identities RLS ───────────────────────────────────────────
DROP POLICY IF EXISTS "Contact Identities isolation" ON public.contact_identities;
DROP POLICY IF EXISTS "contact_identities_all" ON public.contact_identities;

CREATE POLICY "contact_identities_all" ON public.contact_identities
FOR ALL USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_identities.contact_id
      AND public.is_company_member(c.company_id)
  )
);


-- ── 7. FIX deals RLS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Deals isolation" ON public.deals;

CREATE POLICY "Deals isolation" ON public.deals
FOR ALL USING (
  public.is_platform_admin()
  OR public.is_company_member(deals.company_id)
);


-- ── 8. FIX tasks RLS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tasks isolation" ON public.tasks;

CREATE POLICY "Tasks isolation" ON public.tasks
FOR ALL USING (
  public.is_platform_admin()
  OR public.is_company_member(tasks.company_id)
);


-- ── 9. View v_inbox_conversations (versão definitiva) ───────────────────────
CREATE OR REPLACE VIEW public.v_inbox_conversations AS
SELECT
  cnv.id                AS conversation_id,
  cnv.company_id,
  cnv.status,
  cnv.priority::TEXT,
  (
    SELECT COUNT(*)::INTEGER
    FROM public.messages msg
    WHERE msg.conversation_id = cnv.id
      AND msg.sender_type = 'contact'
      AND msg.status != 'read'
      AND msg.is_internal = false
  )                     AS unread_count,
  cnv.attendance_mode::TEXT,
  cnv.ai_paused_at,
  ctc.id                AS contact_id,
  ctc.full_name         AS contact_name,
  up.id                 AS assigned_to_id,
  up.full_name          AS assigned_to_name,
  agt.id                AS ai_agent_id,
  agt.name              AS ai_agent_name,
  agt.is_active         AS ai_agent_active,
  (
    SELECT COUNT(d.id)
    FROM public.deals d
    WHERE d.contact_id = ctc.id AND d.status = 'open'
  )                     AS open_deals_count,
  m.body                AS last_message_preview,
  m.created_at          AS last_message_at
FROM public.conversations cnv
JOIN public.contacts ctc ON cnv.contact_id = ctc.id
LEFT JOIN public.user_profiles up ON cnv.assigned_to = up.id
LEFT JOIN public.ai_agents agt ON cnv.ai_agent_id = agt.id
LEFT JOIN (
  SELECT conversation_id, body, created_at,
         ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC) AS rn
  FROM public.messages
) m ON m.conversation_id = cnv.id AND m.rn = 1;


-- ── 10. rpc_get_inbox_conversations (versão definitiva) ─────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_inbox_conversations(p_company_id UUID)
RETURNS SETOF public.v_inbox_conversations
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role    TEXT;
  v_team_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;

  IF public.is_platform_admin() THEN
    RETURN QUERY
      SELECT * FROM public.v_inbox_conversations v
      WHERE v.company_id = p_company_id
      ORDER BY v.last_message_at DESC NULLS LAST;
    RETURN;
  END IF;

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

  IF NOT FOUND THEN RETURN; END IF;

  IF v_role IN ('company_admin', 'admin') THEN
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
          OR v.assigned_to_id IS NULL
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


-- ── 11. rpc_enqueue_outbound_message (versão definitiva) ────────────────────
CREATE OR REPLACE FUNCTION public.rpc_enqueue_outbound_message(
    p_conversation_id UUID,
    p_body            TEXT,
    p_sender_id       UUID,
    p_is_internal     BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
    v_conv   public.conversations%ROWTYPE;
    v_msg_id BIGINT;
    v_pub_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
    END IF;

    SELECT * INTO v_conv
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Conversa não encontrada.');
    END IF;

    IF NOT (public.is_platform_admin() OR public.is_company_member(v_conv.company_id)) THEN
        RETURN json_build_object('success', false, 'error', 'Sem permissão para enviar nessa conversa.');
    END IF;

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
        v_conv.company_id,
        v_conv.id,
        v_conv.contact_id,
        v_conv.channel_account_id,
        'outbound'::public.message_direction_enum,
        'text',
        'user',
        COALESCE(p_sender_id, auth.uid()),
        p_body,
        '{}'::JSONB,
        CASE WHEN p_is_internal
             THEN 'sent'::public.message_status_enum
             ELSE 'queued'::public.message_status_enum END,
        p_is_internal
    )
    RETURNING id, public_id INTO v_msg_id, v_pub_id;

    UPDATE public.conversations
    SET
        last_message_at      = NOW(),
        last_message_preview = LEFT(p_body, 200)
    WHERE id = p_conversation_id;

    RETURN json_build_object(
        'success',    true,
        'message_id', v_msg_id,
        'public_id',  v_pub_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 12. rpc_create_contact_and_conversation (versão definitiva) ─────────────
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

    v_norm := CASE
        WHEN p_channel = 'whatsapp' THEN regexp_replace(p_identity, '[^0-9]', '', 'g')
        ELSE p_identity
    END;

    SELECT ci.contact_id INTO v_contact_id
    FROM public.contact_identities ci
    JOIN public.contacts c ON c.id = ci.contact_id
    WHERE ci.company_id = p_company_id
      AND ci.channel_type::TEXT = p_channel
      AND (ci.normalized_value = v_norm OR ci.display_value = p_identity)
    LIMIT 1;

    IF v_contact_id IS NULL THEN
        -- Fallback: busca pelo identifier legado
        SELECT ci.contact_id INTO v_contact_id
        FROM public.contact_identities ci
        JOIN public.contacts c ON c.id = ci.contact_id
        WHERE c.company_id = p_company_id
          AND ci.identifier = p_identity
        LIMIT 1;
    END IF;

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

    INSERT INTO public.conversations (
        company_id, contact_id, channel, assigned_to, status, priority, unread_count, created_at
    ) VALUES (
        p_company_id, v_contact_id, p_channel, p_agent_id, 'open', 'normal', 0, now()
    ) RETURNING id INTO v_conversation_id;

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
        'public_id',       v_pub_id
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rpc_create_contact_and_conversation error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ── 13. rpc_set_conversation_attendance (versão definitiva) ─────────────────
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


COMMIT;
