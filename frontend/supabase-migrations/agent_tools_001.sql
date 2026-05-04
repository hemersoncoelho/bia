-- ============================================================
-- Agent Tools Module — Fase 1 MVP
-- Tabelas: agent_tool_catalog, agent_tool_bindings, agent_tool_assets
-- ============================================================

-- ── 1. Catálogo de ferramentas do produto ─────────────────────
-- Fonte única de verdade para todas as tools disponíveis.
-- Gerenciado pelo produto; imutável por tenants.

CREATE TABLE IF NOT EXISTS public.agent_tool_catalog (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT        NOT NULL,
  tool_type     TEXT        NOT NULL
                CHECK (tool_type IN ('action', 'media', 'webhook', 'internal')),
  icon          TEXT        NOT NULL DEFAULT '🔧',   -- emoji exibido na UI
  config_schema JSONB       NOT NULL DEFAULT '{}',   -- JSON Schema dos params configuráveis
  is_built_in   BOOLEAN     NOT NULL DEFAULT true,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Bindings de ferramentas por agente ─────────────────────
-- Registra quais ferramentas estão habilitadas para cada agente
-- e armazena a configuração específica daquele cliente/agente.
-- Fase 1: agent_id obrigatório.
-- Fase 2: agent_id nullable (NULL = padrão da empresa, herança).

CREATE TABLE IF NOT EXISTS public.agent_tool_bindings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  agent_id    UUID        NOT NULL REFERENCES public.ai_agents(id)  ON DELETE CASCADE,
  tool_slug   TEXT        NOT NULL,
  is_enabled  BOOLEAN     NOT NULL DEFAULT true,
  config      JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_tool_bindings_unique UNIQUE (company_id, agent_id, tool_slug)
);

-- ── 3. Assets de ferramentas ──────────────────────────────────
-- Arquivos vinculados a uma tool de um agente (fotos, vídeos, docs).
-- Upload via Supabase Storage bucket 'media'; path em storage_path.
-- UI de upload e uso pleno na Fase 2.

CREATE TABLE IF NOT EXISTS public.agent_tool_assets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id)           ON DELETE CASCADE,
  binding_id      UUID        NOT NULL REFERENCES public.agent_tool_bindings(id) ON DELETE CASCADE,
  tool_slug       TEXT        NOT NULL,
  file_name       TEXT        NOT NULL,
  storage_path    TEXT        NOT NULL,   -- path dentro do bucket 'media'
  public_url      TEXT        NOT NULL,   -- URL pública resolvida
  mime_type       TEXT,
  file_size_bytes BIGINT,
  label           TEXT,                   -- ex: "Catálogo Verão 2025"
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Trigger updated_at (reutiliza função existente) ────────

DROP TRIGGER IF EXISTS trg_agent_tool_bindings_updated_at ON public.agent_tool_bindings;
CREATE TRIGGER trg_agent_tool_bindings_updated_at
  BEFORE UPDATE ON public.agent_tool_bindings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_tool_bindings_agent
  ON public.agent_tool_bindings (company_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_bindings_slug
  ON public.agent_tool_bindings (tool_slug);

CREATE INDEX IF NOT EXISTS idx_agent_tool_assets_binding
  ON public.agent_tool_assets (binding_id);

-- ── 6. RLS ───────────────────────────────────────────────────

ALTER TABLE public.agent_tool_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_assets   ENABLE ROW LEVEL SECURITY;

-- Catálogo: leitura pública para usuários autenticados (é um catálogo do produto)
DROP POLICY IF EXISTS "authenticated users can read tool catalog" ON public.agent_tool_catalog;
CREATE POLICY "authenticated users can read tool catalog"
  ON public.agent_tool_catalog FOR SELECT TO authenticated
  USING (is_active = true);

-- Bindings: CRUD para membros da empresa + platform admins
DROP POLICY IF EXISTS "company members can manage tool bindings" ON public.agent_tool_bindings;
CREATE POLICY "company members can manage tool bindings"
  ON public.agent_tool_bindings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = agent_tool_bindings.company_id
        AND uc.user_id = auth.uid()
    ) OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = agent_tool_bindings.company_id
        AND uc.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

-- Assets: CRUD para membros da empresa + platform admins
DROP POLICY IF EXISTS "company members can manage tool assets" ON public.agent_tool_assets;
CREATE POLICY "company members can manage tool assets"
  ON public.agent_tool_assets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = agent_tool_assets.company_id
        AND uc.user_id = auth.uid()
    ) OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = agent_tool_assets.company_id
        AND uc.user_id = auth.uid()
    ) OR public.is_platform_admin()
  );

-- ── 7. Seed do catálogo ───────────────────────────────────────
-- Ferramentas padrão do produto. ON CONFLICT DO NOTHING = idempotente.

INSERT INTO public.agent_tool_catalog
  (slug, name, description, tool_type, icon, config_schema, sort_order)
VALUES
  (
    'schedule',
    'Agendar',
    'Agenda um horário para o cliente. Use quando o cliente quiser marcar uma consulta, procedimento ou reunião.',
    'action',
    '📅',
    '{
      "type": "object",
      "properties": {
        "default_service_type_id": {
          "type": "string",
          "title": "Tipo de serviço padrão"
        },
        "allow_same_day": {
          "type": "boolean",
          "title": "Permitir agendamento no mesmo dia",
          "default": false
        }
      }
    }'::jsonb,
    10
  ),
  (
    'knowledge_search',
    'Buscar Conhecimento',
    'Pesquisa na base de conhecimento da empresa antes de responder. Útil para perguntas sobre produtos, preços e políticas.',
    'internal',
    '🔍',
    '{
      "type": "object",
      "properties": {
        "top_k": {
          "type": "integer",
          "title": "Número de resultados",
          "default": 3
        },
        "min_score": {
          "type": "number",
          "title": "Score mínimo de relevância (0–1)",
          "default": 0.75
        }
      }
    }'::jsonb,
    20
  ),
  (
    'team_handoff',
    'Chamar Equipe',
    'Transfere a conversa para um agente humano ou time específico. Use quando o cliente pedir atendimento humano ou quando a situação exigir.',
    'action',
    '👥',
    '{
      "type": "object",
      "properties": {
        "default_team_id": {
          "type": "string",
          "title": "Time padrão de destino"
        },
        "message": {
          "type": "string",
          "title": "Mensagem ao cliente antes da transferência"
        }
      }
    }'::jsonb,
    30
  ),
  (
    'send_photo',
    'Enviar Foto',
    'Envia uma ou mais fotos para o cliente. Configure as imagens que o agente poderá enviar e em que situação usar cada uma.',
    'media',
    '📸',
    '{
      "type": "object",
      "properties": {
        "caption": {
          "type": "string",
          "title": "Legenda padrão"
        },
        "auto_send_trigger": {
          "type": "string",
          "title": "Quando enviar automaticamente (ex: quando cliente pedir cardápio)"
        }
      }
    }'::jsonb,
    40
  ),
  (
    'send_video',
    'Enviar Vídeo',
    'Envia um vídeo para o cliente. Ideal para apresentações de produto, tutoriais e demonstrações.',
    'media',
    '🎥',
    '{
      "type": "object",
      "properties": {
        "caption": {
          "type": "string",
          "title": "Legenda do vídeo"
        },
        "auto_send_trigger": {
          "type": "string",
          "title": "Quando enviar automaticamente"
        }
      }
    }'::jsonb,
    50
  ),
  (
    'referral',
    'Indicação',
    'Registra uma indicação de cliente e coleta dados do indicado. Use em fluxos de programa de indicação.',
    'action',
    '🤝',
    '{
      "type": "object",
      "properties": {
        "reward_description": {
          "type": "string",
          "title": "Descrição da recompensa pela indicação"
        }
      }
    }'::jsonb,
    60
  )
ON CONFLICT (slug) DO NOTHING;

-- ── 8. RPC: rpc_get_agent_tools ───────────────────────────────
-- Retorna todas as tools ativas do catálogo com o estado de binding
-- do agente especificado. Tools sem binding aparecem com is_enabled=false.
-- Usado pelo frontend para montar o AgentToolGrid.

CREATE OR REPLACE FUNCTION public.rpc_get_agent_tools(
  p_company_id UUID,
  p_agent_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'slug',        c.slug,
      'name',        c.name,
      'description', c.description,
      'tool_type',   c.tool_type,
      'icon',        c.icon,
      'is_built_in', c.is_built_in,
      'sort_order',  c.sort_order,
      'binding_id',  b.id,
      'is_enabled',  COALESCE(b.is_enabled, false),
      'config',      COALESCE(b.config, '{}')
    )
    ORDER BY c.sort_order
  )
  INTO v_result
  FROM public.agent_tool_catalog c
  LEFT JOIN public.agent_tool_bindings b
    ON  b.tool_slug   = c.slug
    AND b.company_id  = p_company_id
    AND b.agent_id    = p_agent_id
  WHERE c.is_active = true;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_agent_tools(UUID, UUID) TO authenticated;

-- ── 9. Extensão de rpc_get_active_ai_agent ────────────────────
-- TODO Fase 2: fazer JOIN com agent_tool_catalog + agent_tool_bindings
-- e retornar campo "tools" no payload para o n8n consumir.
-- Exemplo de extensão:
--
--   SELECT jsonb_build_object(
--     'agent_id',     a.id,
--     'system_prompt', a.system_prompt,
--     'model',        a.model,
--     'provider',     a.provider,
--     'tools',        public.rpc_get_agent_tools(a.company_id, a.id)
--   )
--   FROM public.ai_agents a WHERE a.company_id = p_company_id AND a.is_active = true LIMIT 1;
