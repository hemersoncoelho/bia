-- ============================================================
-- n8n Agent Lookup — Fase 2
-- Expande rpc_get_active_ai_agent para retornar o agente
-- com tools habilitadas, config e readiness computados.
-- O n8n recebe tools_disponiveis (string) e tools_json (array)
-- prontos para injeção no prompt e execução.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_active_ai_agent(
  p_company_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_agent_row   public.ai_agents%ROWTYPE;
  v_agent_cfg   JSONB;
  v_tools_json  JSON;
  v_tools_str   TEXT;
BEGIN
  -- ── 1. Busca agente ativo ──────────────────────────────────
  SELECT * INTO v_agent_row
  FROM public.ai_agents
  WHERE company_id = p_company_id
    AND is_active  = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_agent_row.id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Nenhum agente ativo para esta empresa'
    );
  END IF;

  v_agent_cfg := COALESCE(v_agent_row.config, '{}'::jsonb);

  -- ── 2. Monta tools_json com bindings habilitados ──────────
  SELECT
    COALESCE(
      json_agg(
        json_build_object(
          'name',               c.slug,
          'label',              c.name,
          'description',        c.description,
          'when_to_use',        c.config_schema->>'when_to_use',
          'type',               c.tool_type,
          'enabled',            b.is_enabled,
          'input_schema',       c.config_schema->'input_schema',
          'config',             COALESCE(b.config, '{}'::jsonb),
          'depends_on',         c.config_schema->'depends_on',
          'requires_permission', '[]'::json,
          'assets',             '[]'::json
        )
        ORDER BY c.sort_order
      ),
      '[]'::json
    )
  INTO v_tools_json
  FROM public.agent_tool_bindings b
  JOIN public.agent_tool_catalog  c ON c.slug = b.tool_slug
  WHERE b.agent_id   = v_agent_row.id
    AND b.company_id = p_company_id
    AND b.is_enabled = true
    AND c.is_active  = true;

  -- ── 3. tools_disponiveis — string para injeção no prompt ──
  SELECT COALESCE(
    string_agg(c.slug, ', ' ORDER BY c.sort_order),
    ''
  )
  INTO v_tools_str
  FROM public.agent_tool_bindings b
  JOIN public.agent_tool_catalog  c ON c.slug = b.tool_slug
  WHERE b.agent_id   = v_agent_row.id
    AND b.company_id = p_company_id
    AND b.is_enabled = true
    AND c.is_active  = true;

  -- ── 4. Retorna payload completo ───────────────────────────
  RETURN json_build_object(
    'success', true,
    'agent', json_build_object(
      'id',                 v_agent_row.id,
      'name',               v_agent_row.name,
      'provider',           v_agent_row.model_provider,
      'model',              v_agent_row.model_name,
      'system_prompt',      v_agent_row.system_prompt,
      'auto_reply',         COALESCE((v_agent_cfg->>'auto_reply')::boolean, false),
      'handoff_keywords',   COALESCE(v_agent_cfg->'handoff_keywords', '[]'::jsonb),
      'handoff_after_mins', (v_agent_cfg->>'handoff_after_mins')::integer,
      'is_published',       COALESCE((v_agent_cfg->>'is_published')::boolean, false)
    ),
    'tools_disponiveis', v_tools_str,
    'tools_json',        v_tools_json
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_get_active_ai_agent(UUID) TO anon, authenticated;
