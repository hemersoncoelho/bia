-- ============================================================
-- MIGRATION: Canonical Message Model Enhancement
-- Prepara a tabela messages para receber payloads variados
-- do webhook WhatsApp via n8n.
--
-- SEGURO: Todos os comandos são ADD COLUMN IF NOT EXISTS.
-- Pode rodar múltiplas vezes sem efeito colateral.
-- ============================================================

BEGIN;

-- ── 1. Campos de mídia ──────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT,
  ADD COLUMN IF NOT EXISTS media_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- ── 2. ID externo (WhatsApp/UAZAPI message ID) ─────────────────────────
--    Essencial para: deduplicação, correlação de status updates, replies.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_message_id TEXT;

-- ── 3. Reply / Quoted message ───────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS quoted_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS quoted_external_id TEXT;

-- ── 4. Reações ──────────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reaction_emoji TEXT,
  ADD COLUMN IF NOT EXISTS reaction_target_id BIGINT;

-- ── 5. Erro detalhado (para falhas de envio) ────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_detail TEXT;

-- ── 6. Metadata e payload raw do provedor ───────────────────────────────
--    metadata: dados estruturados extras (location coords, etc.)
--    raw_provider_payload: payload bruto do webhook para debug
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS raw_provider_payload JSONB;

-- ── 7. Default para message_type (já existe como TEXT) ──────────────────
ALTER TABLE public.messages
  ALTER COLUMN message_type SET DEFAULT 'text';

-- ── 8. Índices para performance e deduplicação ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_external_id
  ON public.messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_quoted
  ON public.messages(quoted_message_id)
  WHERE quoted_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_direction_type
  ON public.messages(conversation_id, direction, message_type);

-- ── 9. Tabela de eventos raw do webhook (auditoria + debug) ─────────────
--    Todo payload que chega do UAZAPI é gravado aqui ANTES de ser processado.
--    Garante rastreabilidade total e possibilidade de replay.
CREATE TABLE IF NOT EXISTS public.channel_events_raw (
  id            BIGSERIAL PRIMARY KEY,
  company_id    UUID,
  channel_type  TEXT NOT NULL DEFAULT 'whatsapp',
  event_type    TEXT NOT NULL,           -- 'message', 'status', 'reaction', etc.
  external_id   TEXT,                     -- ID do evento no provedor
  sender_phone  TEXT,                     -- telefone do remetente
  raw_payload   JSONB NOT NULL,
  processed     BOOLEAN DEFAULT false,
  process_error TEXT,
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

-- Índice para buscar eventos não processados rapidamente
CREATE INDEX IF NOT EXISTS idx_channel_events_raw_unprocessed
  ON public.channel_events_raw(processed, received_at)
  WHERE processed = false;

-- Índice para deduplicação por external_id
CREATE INDEX IF NOT EXISTS idx_channel_events_raw_external_id
  ON public.channel_events_raw(external_id)
  WHERE external_id IS NOT NULL;

-- RLS: service_role apenas — n8n usa service_role key
ALTER TABLE public.channel_events_raw ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated users → somente service_role tem acesso

COMMIT;

-- ============================================================
-- VALIDAÇÃO PÓS-EXECUÇÃO
-- ============================================================

-- Verifica que os novos campos existem em messages
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'messages'
  AND column_name IN (
    'media_url', 'media_mime_type', 'media_filename',
    'external_message_id', 'quoted_message_id',
    'reaction_emoji', 'error_code', 'error_detail',
    'metadata', 'raw_provider_payload'
  )
ORDER BY ordinal_position;

-- Verifica que channel_events_raw foi criada
SELECT COUNT(*) AS channel_events_raw_exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'channel_events_raw';
