-- =============================================================
-- agent_operations_002_n8n_rpc.sql
-- RPC para criação/atualização de agent_operations pelo n8n.
-- Resolve o erro RLS: INSERT direto via anon key é bloqueado.
-- Esta RPC é SECURITY DEFINER, contorna RLS internamente.
-- Grants para anon + authenticated — funciona com a anon key.
-- =============================================================

CREATE OR REPLACE FUNCTION rpc_n8n_upsert_agent_operation(
  p_company_id       uuid,
  p_contact_id       uuid,
  p_conversation_id  uuid,
  p_contact_name     text,
  p_contact_initials text,
  p_operation_type   text,
  p_operation_label  text,
  p_message          text,
  p_context          text,
  p_reason           text,
  p_send_at          timestamptz,
  p_source           text,
  p_channel          text,
  p_idempotency_key  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_created   boolean;
BEGIN
  -- Valida operation_type para evitar injeção de dados inválidos
  IF p_operation_type NOT IN ('follow_up', 'escalate', 'confirm', 'rescue') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'invalid_operation_type: ' || p_operation_type
    );
  END IF;

  -- Valida channel
  IF p_channel NOT IN ('whatsapp', 'email') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'invalid_channel: ' || p_channel
    );
  END IF;

  -- Verifica se já existe operação ativa (queued/paused) para a conversa
  SELECT id INTO v_id
    FROM agent_operations
   WHERE conversation_id = p_conversation_id
     AND company_id      = p_company_id
     AND status IN ('queued', 'paused')
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Atualiza a operação existente
    UPDATE agent_operations
       SET message    = p_message,
           context    = p_context,
           send_at    = p_send_at,
           reason     = p_reason,
           status     = 'queued',
           updated_at = now()
     WHERE id = v_id;

    v_created := false;
  ELSE
    -- Insere nova operação (ON CONFLICT idempotency_key faz update silencioso)
    INSERT INTO agent_operations (
      company_id, contact_id, conversation_id,
      contact_name, contact_initials,
      operation_type, operation_label,
      message, context, reason,
      send_at, source, channel, idempotency_key,
      status
    ) VALUES (
      p_company_id, p_contact_id, p_conversation_id,
      p_contact_name, p_contact_initials,
      p_operation_type, p_operation_label,
      p_message, p_context, p_reason,
      p_send_at, p_source, p_channel, p_idempotency_key,
      'queued'
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET message    = EXCLUDED.message,
          context    = EXCLUDED.context,
          send_at    = EXCLUDED.send_at,
          reason     = EXCLUDED.reason,
          status     = 'queued',
          updated_at = now()
    RETURNING id INTO v_id;

    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id',      v_id,
    'created', v_created
  );
END;
$$;

-- anon key do n8n pode chamar esta RPC (SECURITY DEFINER faz o INSERT)
GRANT EXECUTE ON FUNCTION rpc_n8n_upsert_agent_operation TO anon;
GRANT EXECUTE ON FUNCTION rpc_n8n_upsert_agent_operation TO authenticated;
