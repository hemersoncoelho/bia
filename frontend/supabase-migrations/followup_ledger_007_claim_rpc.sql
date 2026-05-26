-- =============================================================================
-- followup_ledger_007_claim_rpc.sql
--
-- Opção B — Convergência parcial com motor de cadências.
--
-- Problemas resolvidos:
--   1. Race condition: rpc_mark_followup_trigger_due + rpc_get_due_followup_triggers
--      eram duas chamadas separadas → janela para duplicação entre workers.
--   2. 2 HTTP calls extras por evento no n8n (phone + integration buscados
--      separadamente). Agora resolvidos inline pelo banco.
--   3. Sem retry com backoff para falhas UAZAPI. Trigger ficava "preso" em 'due'.
--
-- Mudanças:
--   1. ALTER TABLE: adiciona `attempts` e `last_attempt_at`
--      em conversation_followup_triggers.
--   2. rpc_claim_due_followup_triggers — claim atômico com FOR UPDATE SKIP LOCKED.
--      Dois workers concorrentes NUNCA recebem o mesmo trigger.
--      Resolve recipient_phone e instance_token inline (elimina 2 HTTP calls por
--      evento no n8n).
--   3. rpc_mark_followup_trigger_failed — retry com backoff exponencial:
--      tentativa 1 → +5 min | tentativa 2 → +15 min | tentativa 3+ → failed
--
-- Dependências (devem estar aplicadas antes):
--   - followup_triggers_001.sql   (conversation_followup_triggers)
--   - rpcs_followup_001.sql       (rpc_mark_followup_trigger_due, rpc_get_due_followup_triggers)
--   - followup_ledger_006_n8n_patches.sql
--
-- Credencial n8n: service_role key obrigatória.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Novas colunas em conversation_followup_triggers
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.conversation_followup_triggers
  ADD COLUMN IF NOT EXISTS attempts        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN public.conversation_followup_triggers.attempts IS
  'Número de vezes que este trigger foi reclamado pelo worker (claim RPC). '
  'Controla backoff exponencial em rpc_mark_followup_trigger_failed.';

COMMENT ON COLUMN public.conversation_followup_triggers.last_attempt_at IS
  'Timestamp do último claim pelo worker. Auditoria.';

-- Índice para retry: triggers pending com expected_reply_until já vencido
CREATE INDEX IF NOT EXISTS idx_fup_triggers_pending_due
  ON public.conversation_followup_triggers (expected_reply_until)
  WHERE status IN ('pending', 'due');


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_claim_due_followup_triggers
--
--    Equivalente ao claim_due_cadence_events do motor de cadências.
--    Seleciona e atualiza triggers em uma única transação com
--    FOR UPDATE SKIP LOCKED — garante que dois workers simultâneos
--    nunca processam o mesmo trigger.
--
--    Também resolve recipient_phone e instance_token inline, eliminando
--    os nós get_contact_phone e get_company_integration do workflow n8n.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_claim_due_followup_triggers(
  p_limit     INTEGER DEFAULT 50,
  p_worker_id TEXT    DEFAULT 'n8n-worker-1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed_ids uuid[];
  v_events      jsonb;
BEGIN

  -- ── Claim atômico ──────────────────────────────────────────────────────────
  -- CTE `claimable` seleciona os triggers elegíveis com FOR UPDATE SKIP LOCKED.
  -- CTE `updated` aplica o UPDATE retornando os IDs confirmados.
  -- Isso garante atomicidade: só triggers que o UPDATE confirmou são retornados.
  WITH claimable AS (
    SELECT id
    FROM public.conversation_followup_triggers
    WHERE (
      (status = 'pending' AND expected_reply_until <= now())
      OR status = 'due'
    )
    ORDER BY expected_reply_until ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.conversation_followup_triggers t
    SET
      status          = 'due',
      attempts        = COALESCE(t.attempts, 0) + 1,
      last_attempt_at = now(),
      updated_at      = now()
    FROM claimable c
    WHERE t.id = c.id
    RETURNING t.id
  )
  SELECT array_agg(id) INTO v_claimed_ids FROM updated;

  -- Nenhum trigger disponível — retorna array vazio (n8n deve tratar sem erro)
  IF v_claimed_ids IS NULL OR array_length(v_claimed_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'worker',  p_worker_id,
      'events',  '[]'::jsonb
    );
  END IF;

  -- ── Resolve dados de envio inline ──────────────────────────────────────────
  -- JOIN LATERAL para phone: evita N queries separadas no n8n.
  -- JOIN LATERAL para integration: idem — ORDER BY created_at DESC pega a mais recente.
  SELECT jsonb_agg(
    jsonb_build_object(
      'trigger_id',          t.id,
      'company_id',          t.company_id,
      'contact_id',          t.contact_id,
      'conversation_id',     t.conversation_id,
      'trigger_type',        t.trigger_type::text,
      'detected_event',      t.detected_event,
      'recommended_message', COALESCE(t.recommended_message, t.reason),
      'attempts',            t.attempts,
      -- Fórmula idêntica ao build_context original do workflow
      'idempotency_key',
        'fup_' || t.company_id::text
        || '_' || t.contact_id::text
        || '_' || COALESCE(t.conversation_id::text, 'noconv')
        || '_' || t.id::text,
      -- Telefone WhatsApp do contato (pode ser null — n8n verifica)
      'recipient_phone',  ci.normalized_value,
      -- Credenciais UAZAPI da empresa (podem ser null — n8n verifica)
      'instance_id',      ai_int.instance_id,
      'instance_token',   ai_int.instance_token
    )
    ORDER BY t.expected_reply_until ASC
  ) INTO v_events
  FROM public.conversation_followup_triggers t
  LEFT JOIN LATERAL (
    SELECT normalized_value
    FROM public.contact_identities
    WHERE contact_id   = t.contact_id
      AND company_id   = t.company_id
      AND channel_type = 'whatsapp'
    LIMIT 1
  ) ci ON true
  LEFT JOIN LATERAL (
    SELECT instance_id, instance_token
    FROM public.app_integrations
    WHERE company_id = t.company_id
    ORDER BY created_at DESC
    LIMIT 1
  ) ai_int ON true
  WHERE t.id = ANY(v_claimed_ids);

  RETURN jsonb_build_object(
    'success', true,
    'worker',  p_worker_id,
    'events',  COALESCE(v_events, '[]'::jsonb)
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_claim_due_followup_triggers IS
  'Opção B — Claim atômico com FOR UPDATE SKIP LOCKED. '
  'Substitui rpc_mark_followup_trigger_due + rpc_get_due_followup_triggers no n8n. '
  'Resolve recipient_phone e instance_token inline. '
  'Dois workers simultâneos nunca recebem o mesmo trigger.';

-- anon/authenticated: seguro porque SECURITY DEFINER + validação de tenant interna.
-- Padrão do projeto: credencial n8n "Supabase API" usa anon key (ver rpcs_followup_002_grant_anon.sql).
GRANT EXECUTE ON FUNCTION public.rpc_claim_due_followup_triggers(INTEGER, TEXT)
  TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_mark_followup_trigger_failed
--
--    Retry com backoff exponencial para falhas de envio UAZAPI.
--    Tentativa 1 → reagenda para +5 min  (status volta a 'pending')
--    Tentativa 2 → reagenda para +15 min (status volta a 'pending')
--    Tentativa 3+ → marca como 'failed' definitivamente
--
--    Análogo a mark_cadence_event_failed do motor de cadências.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_mark_followup_trigger_failed(
  p_trigger_id uuid,
  p_company_id uuid,
  p_error      text    DEFAULT NULL,
  p_retry      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger    RECORD;
  v_backoff    interval;
  v_next_at    timestamptz;
  v_max_atts   constant integer := 3;
BEGIN

  SELECT id, company_id, attempts
    INTO v_trigger
    FROM public.conversation_followup_triggers
   WHERE id = p_trigger_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'trigger_not_found');
  END IF;

  -- ── Falha definitiva: retry=false OU esgotou tentativas ───────────────────
  IF p_retry = false OR COALESCE(v_trigger.attempts, 0) >= v_max_atts THEN
    UPDATE public.conversation_followup_triggers
       SET status           = 'failed',
           cancelled_reason = COALESCE(p_error, 'uazapi_send_failed'),
           cancelled_at     = now(),
           updated_at       = now()
     WHERE id = p_trigger_id AND company_id = p_company_id;

    RETURN jsonb_build_object(
      'success',      true,
      'new_status',   'failed',
      'attempts',     v_trigger.attempts,
      'max_attempts', v_max_atts
    );
  END IF;

  -- ── Retry com backoff exponencial ─────────────────────────────────────────
  -- attempt 1 → +5min | attempt 2 → +15min | fallback → +30min
  v_backoff := CASE COALESCE(v_trigger.attempts, 0)
    WHEN 1 THEN interval '5 minutes'
    WHEN 2 THEN interval '15 minutes'
    ELSE         interval '30 minutes'
  END;

  v_next_at := now() + v_backoff;

  -- Volta para 'pending' com novo expected_reply_until.
  -- Será reclamado novamente no próximo ciclo do cron.
  UPDATE public.conversation_followup_triggers
     SET status               = 'pending',
         expected_reply_until = v_next_at,
         metadata             = COALESCE(metadata, '{}') || jsonb_build_object(
                                  'last_error',    COALESCE(p_error, 'uazapi_send_failed'),
                                  'last_error_at', now()
                                ),
         updated_at           = now()
   WHERE id = p_trigger_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'success',       true,
    'new_status',    'pending',
    'attempts',      v_trigger.attempts,
    'max_attempts',  v_max_atts,
    'next_retry_at', v_next_at
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_mark_followup_trigger_failed IS
  'Opção B — Retry com backoff para falhas UAZAPI. '
  'attempt 1 → pending +5min | attempt 2 → pending +15min | attempt 3+ → failed. '
  'Análogo a mark_cadence_event_failed do motor de cadências.';

-- Mesma política: anon key no n8n, SECURITY DEFINER valida tenant.
GRANT EXECUTE ON FUNCTION public.rpc_mark_followup_trigger_failed(uuid, uuid, text, boolean)
  TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Reload PostgREST schema
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
