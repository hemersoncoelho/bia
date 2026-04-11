-- ============================================================
-- RPC: rpc_persist_inbound_message
-- 
-- Modificado para suportar o Human Handoff (se for outbound, 
-- não incrementa unread e desativa a IA da conversa)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_persist_inbound_message(
  p_company_id         UUID,
  p_phone              TEXT,
  p_sender_name        TEXT,
  p_direction          TEXT DEFAULT 'inbound',
  p_sender_type        TEXT DEFAULT 'contact',
  p_message_type       TEXT DEFAULT 'text',
  p_body               TEXT DEFAULT '',
  p_media_url          TEXT DEFAULT NULL,
  p_media_mime_type    TEXT DEFAULT NULL,
  p_media_filename     TEXT DEFAULT NULL,
  p_thumbnail_url      TEXT DEFAULT NULL,
  p_external_message_id TEXT DEFAULT NULL,
  p_quoted_external_id TEXT DEFAULT NULL,
  p_reaction_emoji     TEXT DEFAULT NULL,
  p_metadata           JSONB DEFAULT '{}'::jsonb,
  p_raw_provider_payload JSONB DEFAULT '{}'::jsonb,
  p_timestamp          TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id       UUID;
  v_conversation_id  UUID;
  v_message_id       BIGINT;
  v_is_new_contact   BOOLEAN := FALSE;
  v_is_new_conv      BOOLEAN := FALSE;
  v_preview          TEXT;
  v_now_human        BOOLEAN := FALSE;
  v_unread_inc       INTEGER := 1;
BEGIN

  -- 1. Resolver contato
  SELECT ci.contact_id INTO v_contact_id
  FROM contact_identities ci
  WHERE ci.company_id = p_company_id
    AND ci.channel_type = 'whatsapp'::channel_type_enum
    AND ci.normalized_value = p_phone
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (company_id, full_name)
    VALUES (p_company_id, COALESCE(NULLIF(p_sender_name, ''), 'WhatsApp ' || p_phone))
    RETURNING id INTO v_contact_id;

    INSERT INTO contact_identities (company_id, contact_id, channel_type, identity_type, normalized_value, display_value)
    VALUES (p_company_id, v_contact_id, 'whatsapp'::channel_type_enum, 'phone', p_phone, '+' || p_phone);

    v_is_new_contact := TRUE;
  END IF;

  -- 2. Resolver conversa
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE company_id = p_company_id
    AND contact_id = v_contact_id
    AND status = 'open'::conversation_status_enum
    AND channel = 'whatsapp'
  ORDER BY created_at DESC LIMIT 1;

  IF v_conversation_id IS NULL THEN
    -- A nova conversa começa sempre com attendance_mode bot_ativo se for inbound, ou human_ativo se o humano que iniciou
    INSERT INTO conversations (company_id, contact_id, channel, status, priority, unread_count, attendance_mode, ai_paused_at)
    VALUES (
      p_company_id, 
      v_contact_id, 
      'whatsapp', 
      'open'::conversation_status_enum, 
      'normal'::priority_enum, 
      0,
      CASE WHEN p_direction = 'outbound' THEN 'human'::attendance_mode_enum ELSE 'bot'::attendance_mode_enum END,
      CASE WHEN p_direction = 'outbound' THEN p_timestamp ELSE NULL END
    )
    RETURNING id INTO v_conversation_id;
    v_is_new_conv := TRUE;
  END IF;

  -- 3. Inserir mensagem
  INSERT INTO messages (
    company_id, conversation_id, contact_id,
    direction, sender_type, message_type,
    body, media_url, media_mime_type, media_filename,
    thumbnail_url, external_message_id, quoted_external_id,
    reaction_emoji, metadata, raw_provider_payload,
    payload, status, is_internal, created_at
  ) VALUES (
    p_company_id, v_conversation_id, v_contact_id,
    p_direction::message_direction_enum,
    p_sender_type::sender_type_enum,
    p_message_type,
    p_body, p_media_url, p_media_mime_type, p_media_filename,
    p_thumbnail_url, p_external_message_id, p_quoted_external_id,
    p_reaction_emoji, p_metadata, p_raw_provider_payload,
    '{}'::jsonb,
    'received'::message_status_enum,
    FALSE,
    p_timestamp
  ) RETURNING id INTO v_message_id;

  -- 4. Atualizar conversa (Regra do Human Handoff)
  
  -- Preview bonitinho
  v_preview := CASE
    WHEN p_message_type = 'text' THEN LEFT(p_body, 200)
    WHEN p_message_type = 'audio' THEN '🎵 Áudio'
    WHEN p_message_type = 'image' THEN '📷 Imagem'
    WHEN p_message_type = 'video' THEN '🎥 Vídeo'
    WHEN p_message_type = 'document' THEN '📄 Documento'
    ELSE LEFT(COALESCE(p_body, '[' || p_message_type || ']'), 200)
  END;

  -- Se foi você quem mandou a mensagem (pelo Front ou Whatsapp app):
  IF p_direction = 'outbound' THEN
    v_unread_inc := 0; -- Humanos falando não aumenta o badge de "não lidas" (pois o humano que escreveu)
    v_now_human := TRUE; -- Corta o botão da IA (muda pra human)
  ELSE
    v_unread_inc := 1;
    v_now_human := FALSE;
  END IF;

  -- Atualiza!
  UPDATE conversations
  SET 
    last_message_at = p_timestamp, 
    last_message_preview = v_preview,
    unread_count = CASE WHEN p_direction = 'outbound' THEN 0 ELSE unread_count + 1 END,
    updated_at = NOW(),
    -- Regra Magica:
    attendance_mode = CASE 
      WHEN v_now_human THEN 'human'::attendance_mode_enum 
      ELSE attendance_mode 
    END,
    ai_paused_at = CASE 
      WHEN v_now_human THEN COALESCE(ai_paused_at, NOW())
      ELSE ai_paused_at
    END
  WHERE id = v_conversation_id;

  -- 5. Finalizar e Retornar se o Bot deve atuar ou nao
  RETURN jsonb_build_object(
    'message_id', v_message_id,
    'contact_id', v_contact_id,
    'conversation_id', v_conversation_id,
    'is_new_contact', v_is_new_contact,
    'is_new_conversation', v_is_new_conv,
    -- Nós devolvemos essa flag pra dizer pro n8n parar ali ou continuar pra openai
    'should_ai_answer', CASE WHEN v_now_human THEN false ELSE true END
  );
END;
$$;
