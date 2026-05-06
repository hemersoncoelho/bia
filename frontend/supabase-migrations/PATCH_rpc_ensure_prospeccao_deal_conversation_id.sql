-- ============================================================
-- PATCH: rpc_ensure_prospeccao_deal — adiciona suporte a conversation_id
--
-- Problema: o INSERT de deals não vinculava conversation_id,
-- então o card do CRM nunca tinha a conversa linkada.
--
-- Solução: aceitar p_conversation_id como parâmetro opcional
-- e populá-lo no INSERT quando fornecido.
--
-- Compatibilidade: parâmetro tem DEFAULT NULL →
-- chamadas existentes sem p_conversation_id continuam funcionando.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ensure_prospeccao_deal(
  p_company_id      UUID,
  p_phone           TEXT,
  p_sender_name     TEXT    DEFAULT '',
  p_lead_metadata   JSONB   DEFAULT '{}',
  p_conversation_id UUID    DEFAULT NULL   -- NOVO: vínculo com a conversa
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id  UUID;
  v_deal_id     UUID;
  v_pipeline_id UUID;
  v_stage_id    UUID;
  v_is_new      BOOLEAN := FALSE;
BEGIN

  -- Localiza o contato pelo telefone normalizado (ex: 558898325848)
  SELECT ci.contact_id INTO v_contact_id
  FROM contact_identities ci
  WHERE ci.company_id      = p_company_id
    AND ci.channel_type    = 'whatsapp'::channel_type_enum
    AND ci.normalized_value = p_phone
  LIMIT 1;

  -- Contato ainda não existe
  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Contato não encontrado para phone=' || p_phone
    );
  END IF;

  -- Verifica se já existe algum deal aberto para este contato
  SELECT id INTO v_deal_id
  FROM deals
  WHERE company_id = p_company_id
    AND contact_id = v_contact_id
    AND status     = 'open'::deal_status_enum
  ORDER BY created_at ASC
  LIMIT 1;

  -- Se o deal já existe mas não tem conversation_id e foi passado um → atualizar
  IF v_deal_id IS NOT NULL AND p_conversation_id IS NOT NULL THEN
    UPDATE deals
    SET conversation_id = p_conversation_id,
        updated_at      = now()
    WHERE id                = v_deal_id
      AND company_id        = p_company_id
      AND conversation_id IS NULL;  -- só atualiza se ainda não tinha vínculo
  END IF;

  -- Nenhum deal encontrado → cria no primeiro estágio (Prospecção)
  IF v_deal_id IS NULL THEN

    -- Pipeline padrão ativo da empresa
    SELECT p.id INTO v_pipeline_id
    FROM pipelines p
    WHERE p.company_id = p_company_id
      AND p.is_active  = true
    ORDER BY p.is_default DESC, p.created_at ASC
    LIMIT 1;

    -- Primeiro estágio do pipeline (posição mais baixa = Prospecção)
    IF v_pipeline_id IS NOT NULL THEN
      SELECT ps.id INTO v_stage_id
      FROM pipeline_stages ps
      WHERE ps.pipeline_id = v_pipeline_id
      ORDER BY ps.position ASC
      LIMIT 1;
    END IF;

    IF v_pipeline_id IS NOT NULL AND v_stage_id IS NOT NULL THEN
      INSERT INTO deals (
        company_id, contact_id,
        pipeline_id, stage_id,
        title, amount, currency, status,
        conversation_id          -- NOVO
      ) VALUES (
        p_company_id,
        v_contact_id,
        v_pipeline_id,
        v_stage_id,
        COALESCE(NULLIF(trim(p_sender_name), ''), 'Lead WhatsApp ' || p_phone),
        0,
        'BRL',
        'open'::deal_status_enum,
        p_conversation_id        -- NOVO: pode ser NULL se não passado
      )
      RETURNING id INTO v_deal_id;

      v_is_new := TRUE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'contact_id',      v_contact_id,
    'deal_id',         v_deal_id,
    'is_new_deal',     v_is_new,
    'conversation_id', p_conversation_id  -- retorna para o n8n confirmar
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rpc_ensure_prospeccao_deal error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
