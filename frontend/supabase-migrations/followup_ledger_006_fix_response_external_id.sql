-- followup_ledger_006_fix_response_external_id.sql
--
-- Adiciona suporte a p_external_message_id (text) em rpc_register_follow_up_response.
-- O n8n envia o ID externo do WhatsApp (string hex), não o bigint interno da tabela
-- messages. A função agora faz o lookup interno quando p_response_message_id for NULL
-- e p_external_message_id for informado.

-- Remove a assinatura antiga (sem p_external_message_id) para evitar ambiguidade de overload.
DROP FUNCTION IF EXISTS public.rpc_register_follow_up_response(uuid, uuid, uuid, bigint, timestamptz);

CREATE OR REPLACE FUNCTION public.rpc_register_follow_up_response(
  p_company_id            uuid,
  p_contact_id            uuid,
  p_conversation_id       uuid        DEFAULT NULL,
  p_response_message_id   bigint      DEFAULT NULL,
  p_external_message_id   text        DEFAULT NULL,
  p_received_at           timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event           RECORD;
  v_received_at     timestamptz;
  v_lag_seconds     bigint;
  v_resolved_msg_id bigint;
BEGIN

  -- ── 1. Validar membership quando chamado por usuário autenticado ──────────
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden: caller is not a member of company %', p_company_id;
    END IF;
  END IF;

  -- ── 2. Validar contato + empresa ─────────────────────────────────────────
  PERFORM 1 FROM public.contacts
   WHERE id = p_contact_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found: contact % not in company %', p_contact_id, p_company_id;
  END IF;

  -- ── 3. Validar conversa, se informada ─────────────────────────────────────
  IF p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.conversations
     WHERE id = p_conversation_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation_not_found: conversation % not in company %', p_conversation_id, p_company_id;
    END IF;
  END IF;

  -- ── 4. Resolver ID interno da mensagem ────────────────────────────────────
  --    Prioridade: p_response_message_id (bigint direto) > lookup por external_message_id
  v_resolved_msg_id := p_response_message_id;

  IF v_resolved_msg_id IS NULL AND p_external_message_id IS NOT NULL THEN
    SELECT m.id INTO v_resolved_msg_id
      FROM public.messages m
     WHERE m.external_message_id = p_external_message_id
       AND m.company_id          = p_company_id
     LIMIT 1;
    -- Não lançar erro se não encontrado: a mensagem pode ainda não ter sido persistida.
    -- A atribuição ao follow-up ainda funciona sem o vínculo direto à mensagem.
  END IF;

  -- ── 5. Validar mensagem resolvida, se informada ───────────────────────────
  IF v_resolved_msg_id IS NOT NULL AND p_conversation_id IS NOT NULL THEN
    PERFORM 1 FROM public.messages
     WHERE id              = v_resolved_msg_id
       AND company_id      = p_company_id
       AND conversation_id = p_conversation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'message_not_found: message % not in conversation % / company %',
        v_resolved_msg_id, p_conversation_id, p_company_id;
    END IF;
  END IF;

  v_received_at := COALESCE(p_received_at, now());

  -- ── 6. Buscar follow_up_event elegível mais recente ───────────────────────
  IF p_conversation_id IS NOT NULL THEN
    SELECT e.*
      INTO v_event
      FROM public.follow_up_events e
     WHERE e.company_id      = p_company_id
       AND e.contact_id      = p_contact_id
       AND e.conversation_id = p_conversation_id
       AND e.status          IN ('sent','delivered')
       AND e.responded_at    IS NULL
       AND e.attribution_until >= v_received_at
       AND e.sent_at          <= v_received_at
     ORDER BY e.sent_at DESC
     LIMIT 1;
  ELSE
    SELECT e.*
      INTO v_event
      FROM public.follow_up_events e
     WHERE e.company_id    = p_company_id
       AND e.contact_id    = p_contact_id
       AND e.status        IN ('sent','delivered')
       AND e.responded_at  IS NULL
       AND e.attribution_until >= v_received_at
       AND e.sent_at          <= v_received_at
     ORDER BY e.sent_at DESC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    UPDATE public.follow_up_cycle_state
       SET last_inbound_at = v_received_at
     WHERE company_id      = p_company_id
       AND contact_id      = p_contact_id
       AND (
         (p_conversation_id IS NOT NULL AND conversation_id = p_conversation_id)
         OR
         (p_conversation_id IS NULL AND conversation_id IS NULL)
       )
       AND cycle_status IN ('active','paused');

    RETURN jsonb_build_object(
      'success', true,
      'attributed', false,
      'follow_up_event_id', NULL,
      'attempt_number', NULL,
      'response_lag_seconds', NULL
    );
  END IF;

  -- ── 7. Atribuir resposta ao evento ────────────────────────────────────────
  v_lag_seconds := EXTRACT(EPOCH FROM (v_received_at - v_event.sent_at))::bigint;

  UPDATE public.follow_up_events
     SET status              = 'responded',
         responded_at        = v_received_at,
         response_message_id = v_resolved_msg_id
   WHERE id = v_event.id;

  -- ── 8. Encerrar ciclo como respondido ─────────────────────────────────────
  UPDATE public.follow_up_cycle_state
     SET has_responded   = true,
         responded_at    = v_received_at,
         last_inbound_at = v_received_at,
         cycle_status    = 'responded',
         stopped_reason  = 'contact_replied',
         stopped_at      = v_received_at
   WHERE cycle_id    = v_event.cycle_id
     AND company_id  = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'attributed', true,
    'follow_up_event_id', v_event.id,
    'attempt_number', v_event.attempt_number,
    'response_lag_seconds', v_lag_seconds
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_register_follow_up_response(uuid, uuid, uuid, bigint, text, timestamptz) IS
  'Fase 2 — Atribui mensagem inbound ao follow-up elegível mais recente dentro da janela de atribuição. Aceita p_external_message_id (text) para lookup automático do id interno quando o n8n envia ID externo do WhatsApp.';

GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_response(uuid, uuid, uuid, bigint, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_follow_up_response(uuid, uuid, uuid, bigint, text, timestamptz) TO authenticated;
