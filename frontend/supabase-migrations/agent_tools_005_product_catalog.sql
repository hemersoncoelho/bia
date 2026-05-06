-- ============================================================
-- Agent Tools — Fase 5: Catálogo de Produtos/Serviços
-- Nova tool: buscar_produtos_servicos
-- Nova tabela: product_catalog (separada de service_types para
-- preservar a semântica de agenda e não exigir duration_minutes)
-- ============================================================

BEGIN;

-- ── 1. Expandir constraint de tool_type para catalog_action ───

ALTER TABLE public.agent_tool_catalog
  DROP CONSTRAINT IF EXISTS agent_tool_catalog_tool_type_check;

ALTER TABLE public.agent_tool_catalog
  ADD CONSTRAINT agent_tool_catalog_tool_type_check
  CHECK (
    tool_type IN (
      'agenda_action',
      'crm_action',
      'atendimento_action',
      'media_action',
      'knowledge_action',
      'webhook_action',
      'internal_action',
      'catalog_action'
    )
  );

-- ── 2. Tabela: product_catalog ────────────────────────────────
-- Catálogo comercial consultável pelo agente de IA.
-- Diferente de service_types: duration_minutes é opcional e
-- não há exigência de integração com módulo de agenda.

CREATE TABLE IF NOT EXISTS public.product_catalog (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT         NOT NULL,
  description      TEXT,
  duration_minutes INTEGER      CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  price            NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  sort_order       INTEGER      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_company_active
  ON public.product_catalog (company_id, is_active);

-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_catalog_company_members" ON public.product_catalog;
CREATE POLICY "product_catalog_company_members" ON public.product_catalog
  FOR ALL USING (
    public.is_platform_admin()
    OR public.is_company_member(product_catalog.company_id)
  );

-- ── 4. Inserir tool no catálogo ───────────────────────────────

INSERT INTO public.agent_tool_catalog
  (slug, name, description, tool_type, icon, config_schema, is_built_in, is_active, sort_order)
VALUES (
  'buscar_produtos_servicos',
  'Buscar Produtos/Serviços',
  'Consulta o catálogo de produtos e serviços da empresa para apresentar ao cliente durante a conversa.',
  'catalog_action',
  '🛍️',
  '{
    "depends_on": ["product_catalog"],
    "when_to_use": "Quando o cliente perguntar sobre o que a empresa oferece, preços, serviços disponíveis ou quiser conhecer mais detalhes de um produto ou plano.",
    "input_schema": {
      "query": "string | null",
      "limit": "integer"
    },
    "fields": []
  }'::jsonb,
  true,
  true,
  35
)
ON CONFLICT (slug) DO UPDATE
  SET name         = EXCLUDED.name,
      description  = EXCLUDED.description,
      tool_type    = EXCLUDED.tool_type,
      icon         = EXCLUDED.icon,
      config_schema = EXCLUDED.config_schema,
      is_built_in  = EXCLUDED.is_built_in,
      is_active    = EXCLUDED.is_active,
      sort_order   = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';

COMMIT;
