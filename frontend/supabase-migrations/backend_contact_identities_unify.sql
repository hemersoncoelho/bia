-- ============================================================
-- Unifica schema contact_identities: suporta provider/identifier
-- e channel_type/normalized_value
-- ============================================================

-- 1. Adiciona provider e identifier se não existirem (para DBs com channel_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_identities' AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.contact_identities ADD COLUMN provider TEXT;
    UPDATE public.contact_identities SET provider = channel_type::text WHERE channel_type IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_identities' AND column_name = 'identifier'
  ) THEN
    ALTER TABLE public.contact_identities ADD COLUMN identifier TEXT;
    UPDATE public.contact_identities SET identifier = COALESCE(normalized_value, display_value) WHERE identifier IS NULL;
  END IF;
END $$;

-- 2. Adiciona channel_type e normalized_value se não existirem (para DBs com provider)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_identities' AND column_name = 'channel_type'
  ) THEN
    ALTER TABLE public.contact_identities ADD COLUMN channel_type TEXT;
    UPDATE public.contact_identities SET channel_type = provider WHERE provider IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_identities' AND column_name = 'normalized_value'
  ) THEN
    ALTER TABLE public.contact_identities ADD COLUMN normalized_value TEXT;
    UPDATE public.contact_identities SET normalized_value = identifier WHERE identifier IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_identities' AND column_name = 'display_value'
  ) THEN
    ALTER TABLE public.contact_identities ADD COLUMN display_value TEXT;
    UPDATE public.contact_identities SET display_value = identifier WHERE identifier IS NOT NULL;
  END IF;
END $$;
