import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Settings2, WifiOff, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { AgentToolStatusBadge } from './AgentToolStatusBadge';
import { AgentToolDrawer } from './AgentToolDrawer';
import type {
  AgentTool,
  AgentToolAsset,
  AgentToolType,
  ToolContext,
  ToolDependency,
  ToolReadinessStatus,
} from '../../types';

// ── Tipos internos ────────────────────────────────────────────

interface CatalogRow {
  slug: string;
  name: string;
  description: string;
  tool_type: AgentToolType;
  icon: string;
  is_built_in: boolean;
  config_schema: Record<string, unknown>;
  sort_order: number;
}

interface BindingRow {
  id: string;
  tool_slug: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}

// ── Metadados visuais por tipo de tool ────────────────────────

const TYPE_META: Record<AgentToolType, { label: string; cls: string; barCls: string }> = {
  agenda_action:     { label: 'Agenda',      cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20',       barCls: 'bg-blue-500' },
  crm_action:        { label: 'CRM',         cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', barCls: 'bg-emerald-500' },
  atendimento_action:{ label: 'Atendimento', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',     barCls: 'bg-amber-500' },
  media_action:      { label: 'Mídia',       cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20',  barCls: 'bg-violet-500' },
  knowledge_action:  { label: 'Conhecimento',cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',        barCls: 'bg-cyan-500' },
  webhook_action:    { label: 'Webhook',     cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20',  barCls: 'bg-orange-500' },
  internal_action:   { label: 'Interno',     cls: 'text-stone-400 bg-stone-500/10 border-stone-500/20',     barCls: 'bg-stone-500' },
  catalog_action:    { label: 'Catálogo',    cls: 'text-teal-400 bg-teal-500/10 border-teal-500/20',        barCls: 'bg-teal-500' },
};

const READINESS_BORDER: Record<ToolReadinessStatus, string> = {
  ready:               'border-emerald-500/35 hover:border-emerald-500/60',
  incomplete:          'border-yellow-500/35 hover:border-yellow-500/60',
  inactive:            'border-border hover:border-stone-600',
  blocked:             'border-orange-500/35 hover:border-orange-500/60',
  integration_missing: 'border-red-500/35 hover:border-red-500/60',
};

const DEFAULT_CONTEXT: ToolContext = {
  schedulesConfigured: false,
  serviceTypesConfigured: false,
  pipelineConfigured: false,
  teamsConfigured: false,
  mediaStorageConfigured: true,
  knowledgeProviderConfigured: false,
  productCatalogConfigured: false,
};

// ── Helpers de schema ─────────────────────────────────────────

const getDependsOn = (schema: Record<string, unknown>): string[] => {
  const raw = schema.depends_on;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
};

const getDependencies = (
  schema: Record<string, unknown>,
  assets: AgentTool['assets'],
  context: ToolContext
): ToolDependency[] => {
  const dependsOn = getDependsOn(schema);
  const countAssets = assets?.length ?? 0;

  const MAP: Record<string, ToolDependency> = {
    schedules: {
      key: 'schedules',
      label: 'Horários da agenda',
      configured: context.schedulesConfigured,
      configurePath: '/agenda/configuracoes',
      helpText: 'Configure dias e horários de atendimento.',
    },
    service_types: {
      key: 'service_types',
      label: 'Tipos de serviço',
      configured: context.serviceTypesConfigured,
      configurePath: '/agenda/configuracoes',
      helpText: 'Cadastre ao menos um serviço ativo.',
    },
    appointments: {
      key: 'appointments',
      label: 'Módulo Agenda',
      configured: context.schedulesConfigured && context.serviceTypesConfigured,
      configurePath: '/agenda/configuracoes',
      helpText: 'A agenda precisa de horários e serviços ativos.',
    },
    contacts: {
      key: 'contacts',
      label: 'Contatos',
      configured: true,
      configurePath: '/contacts',
      helpText: 'O contato vem da conversa atual.',
    },
    pipelines: {
      key: 'pipelines',
      label: 'Pipeline comercial',
      configured: context.pipelineConfigured,
      configurePath: '/deals',
      helpText: 'Crie um pipeline com etapas.',
    },
    pipeline_stages: {
      key: 'pipeline_stages',
      label: 'Etapas do pipeline',
      configured: context.pipelineConfigured,
      configurePath: '/deals',
      helpText: 'Crie ao menos uma etapa no pipeline.',
    },
    deals: {
      key: 'deals',
      label: 'CRM de negócios',
      configured: context.pipelineConfigured,
      configurePath: '/deals',
      helpText: 'O CRM precisa de pipeline ativo.',
    },
    teams: {
      key: 'teams',
      label: 'Times de atendimento',
      configured: context.teamsConfigured,
      configurePath: '/teams',
      helpText: 'Configure um time com membros.',
    },
    user_companies: {
      key: 'user_companies',
      label: 'Membros da empresa',
      configured: context.teamsConfigured,
      configurePath: '/members',
      helpText: 'É necessário ter membros disponíveis para transferência.',
    },
    conversations: {
      key: 'conversations',
      label: 'Inbox',
      configured: true,
      configurePath: '/inbox',
      helpText: 'A conversa atual fornece o contexto.',
    },
    agent_tool_assets: {
      key: 'agent_tool_assets',
      label: 'Assets da ferramenta',
      configured: countAssets > 0,
      helpText: 'Faça upload de arquivos na Fase 3.',
    },
    'storage.media': {
      key: 'storage.media',
      label: 'Storage media',
      configured: context.mediaStorageConfigured,
      helpText: 'Bucket público media configurado.',
    },
    knowledge_provider: {
      key: 'knowledge_provider',
      label: 'Base de conhecimento',
      configured: context.knowledgeProviderConfigured,
      helpText: 'Provider externo ainda não configurado.',
    },
    product_catalog: {
      key: 'product_catalog',
      label: 'Produtos/serviços cadastrados',
      configured: context.productCatalogConfigured,
      helpText: 'Cadastre ao menos um item ativo nesta ferramenta.',
    },
  };

  return dependsOn.map(
    (key) =>
      MAP[key] ?? { key, label: key, configured: true, helpText: 'Dependência informativa.' }
  );
};

const computeReadiness = (
  tool: { slug: string; tool_type: AgentToolType; is_enabled: boolean; config: Record<string, unknown>; config_schema: Record<string, unknown>; assets?: AgentTool['assets'] },
  dependencies: ToolDependency[]
): ToolReadinessStatus => {
  if (!tool.is_enabled) return 'inactive';

  if (
    tool.tool_type === 'knowledge_action' &&
    dependencies.some((d) => !d.configured)
  ) {
    return 'integration_missing';
  }

  const SOFT_DEPS = new Set(['agent_tool_assets', 'product_catalog']);
  if (dependencies.some((d) => !d.configured && !SOFT_DEPS.has(d.key))) {
    return 'blocked';
  }

  // Campos obrigatórios
  const fields = Array.isArray(tool.config_schema.fields)
    ? (tool.config_schema.fields as Array<{ key: string; required?: boolean }>)
    : [];
  const missingRequired = fields.some((f) => {
    if (!f.required) return false;
    const v = tool.config[f.key];
    return v === undefined || v === null || v === '';
  });
  if (missingRequired) return 'incomplete';

  // Assets de mídia
  if (
    (tool.slug === 'enviar_foto' || tool.slug === 'enviar_video') &&
    (tool.assets?.length ?? 0) === 0
  ) {
    return 'incomplete';
  }

  if (dependencies.some((d) => !d.configured)) return 'incomplete';

  return 'ready';
};

// ── Toggle (cards) ────────────────────────────────────────────

interface ToggleProps {
  id: string;
  checked: boolean;
  loading?: boolean;
  onChange: () => void;
  onClick?: (e: React.MouseEvent) => void;
}

const Toggle: React.FC<ToggleProps> = ({ id, checked, loading, onChange, onClick }) => (
  <label
    htmlFor={id}
    className="relative inline-flex items-center cursor-pointer shrink-0"
    onClick={onClick}
  >
    <input
      id={id}
      type="checkbox"
      className="sr-only peer"
      checked={checked}
      onChange={onChange}
      disabled={loading}
    />
    <div
      className={cn(
        'w-9 h-5 rounded-full transition-colors',
        "after:content-[''] after:absolute after:top-0.5 after:left-0.5",
        'after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all',
        'peer-checked:after:translate-x-4',
        checked ? 'bg-indigo-600' : 'bg-stone-700',
        loading && 'opacity-60 cursor-not-allowed'
      )}
    />
    {loading && (
      <Loader2
        size={10}
        className="absolute inset-0 m-auto animate-spin text-white pointer-events-none"
      />
    )}
  </label>
);

// ── Componente principal ──────────────────────────────────────

interface AgentToolGridProps {
  agentId: string;
  companyId: string;
  context?: ToolContext | null;
}

export const AgentToolGrid: React.FC<AgentToolGridProps> = ({ agentId, companyId, context }) => {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentTool | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // ── Fetch ────────────────────────────────────────────────

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(false);

    const [catalogRes, bindingsRes] = await Promise.all([
      supabase
        .from('agent_tool_catalog')
        .select('slug, name, description, tool_type, icon, is_built_in, config_schema, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('agent_tool_bindings')
        .select('id, tool_slug, is_enabled, config')
        .eq('company_id', companyId)
        .eq('agent_id', agentId),
    ]);

    if (catalogRes.error) {
      setError(true);
      setLoading(false);
      return;
    }

    const catalog = (catalogRes.data ?? []) as CatalogRow[];
    const bindings = (bindingsRes.data ?? []) as BindingRow[];
    const bMap = new Map(bindings.map((b) => [b.tool_slug, b]));
    const ctx = context ?? DEFAULT_CONTEXT;

    // Busca assets dos bindings de mídia existentes
    const mediaBindingIds = bindings
      .filter((b) => b.tool_slug === 'enviar_foto' || b.tool_slug === 'enviar_video')
      .map((b) => b.id);

    const assetsRes = mediaBindingIds.length > 0
      ? await supabase
          .from('agent_tool_assets')
          .select('id, tool_slug, file_name, public_url, mime_type, label, sort_order')
          .in('binding_id', mediaBindingIds)
          .order('sort_order')
      : { data: [] };

    const assetsBySlug = new Map<string, AgentToolAsset[]>();
    for (const asset of (assetsRes.data ?? []) as (AgentToolAsset & { tool_slug: string })[]) {
      const list = assetsBySlug.get(asset.tool_slug) ?? [];
      list.push(asset);
      assetsBySlug.set(asset.tool_slug, list);
    }

    const merged: AgentTool[] = catalog.map((row) => {
      const b = bMap.get(row.slug);
      const configSchema = (row.config_schema ?? {}) as Record<string, unknown>;
      const toolConfig = (b?.config ?? {}) as Record<string, unknown>;
      const assets: AgentToolAsset[] = assetsBySlug.get(row.slug) ?? [];

      const base: AgentTool = {
        ...row,
        id: row.slug,
        config_schema: configSchema,
        when_to_use:
          typeof configSchema.when_to_use === 'string' ? configSchema.when_to_use : undefined,
        depends_on: getDependsOn(configSchema),
        input_schema:
          configSchema.input_schema && typeof configSchema.input_schema === 'object'
            ? (configSchema.input_schema as Record<string, unknown>)
            : undefined,
        binding_id: b?.id,
        is_enabled: b?.is_enabled ?? false,
        config: toolConfig,
        assets,
      };

      const dependencies = getDependencies(configSchema, assets, ctx);
      return {
        ...base,
        dependencies,
        readiness: computeReadiness(base, dependencies),
      };
    });

    setTools(merged);
    setLoading(false);
  }, [agentId, companyId, context]);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // ── Toggle ───────────────────────────────────────────────

  const handleToggle = useCallback(
    async (slug: string) => {
      if (toggling) return;
      const tool = tools.find((t) => t.slug === slug);
      if (!tool) return;

      setToggling(slug);
      const newEnabled = !tool.is_enabled;

      const { error: upsertErr } = await supabase
        .from('agent_tool_bindings')
        .upsert(
          {
            company_id: companyId,
            agent_id: agentId,
            tool_slug: slug,
            is_enabled: newEnabled,
            config: tool.config,
          },
          { onConflict: 'company_id,agent_id,tool_slug' }
        );

      if (!upsertErr) {
        const patchTool = (t: AgentTool): AgentTool => {
          if (t.slug !== slug) return t;
          const next = { ...t, is_enabled: newEnabled };
          const dependencies = getDependencies(
            t.config_schema,
            t.assets,
            context ?? DEFAULT_CONTEXT
          );
          return { ...next, dependencies, readiness: computeReadiness(next, dependencies) };
        };
        setTools((prev) => prev.map(patchTool));
        setSelected((s) => (s?.slug === slug ? patchTool(s) : s));
      }

      setToggling(null);
    },
    [tools, toggling, agentId, companyId, context]
  );

  // ── Drawer ───────────────────────────────────────────────

  const openDrawer = (tool: AgentTool) => {
    setSelected(tool);
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawerVisible(true)));
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setSelected(null), 220);
  };

  const handleToolUpdated = useCallback((updated: Partial<AgentTool>) => {
    setTools((prev) =>
      prev.map((t) => {
        if (t.slug !== selected?.slug) return t;
        const next = { ...t, ...updated };
        const dependencies = getDependencies(
          t.config_schema,
          t.assets,
          context ?? DEFAULT_CONTEXT
        );
        return { ...next, dependencies, readiness: computeReadiness(next, dependencies) };
      })
    );
    setSelected((s) =>
      s
        ? (() => {
            const next = { ...s, ...updated };
            const deps = getDependencies(
              s.config_schema,
              s.assets,
              context ?? DEFAULT_CONTEXT
            );
            return { ...next, dependencies: deps, readiness: computeReadiness(next, deps) };
          })()
        : s
    );
  }, [selected?.slug, context]);

  // ── Estados vazios / erro ─────────────────────────────────

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-[120px] bg-surface border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-sm text-red-400">
        <WifiOff size={16} className="shrink-0" />
        <span>Não foi possível carregar as ferramentas.</span>
        <button
          type="button"
          onClick={loadTools}
          className="ml-auto text-xs underline hover:no-underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <p className="text-sm text-stone-500 py-4">Nenhuma ferramenta disponível no catálogo.</p>
    );
  }

  // ── Render principal ──────────────────────────────────────

  const enabledCount = tools.filter((t) => t.is_enabled).length;
  const readyCount = tools.filter((t) => t.readiness === 'ready').length;
  const blockedCount = tools.filter(
    (t) => t.readiness === 'blocked' || t.readiness === 'incomplete' || t.readiness === 'integration_missing'
  ).length;

  return (
    <>
      {/* Status summary */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] text-stone-500 mr-1">
          {tools.length} ferramentas disponíveis
        </span>
        {readyCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {readyCount} pronta{readyCount !== 1 ? 's' : ''}
          </span>
        )}
        {blockedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            {blockedCount} pendente{blockedCount !== 1 ? 's' : ''}
          </span>
        )}
        {enabledCount === 0 && (
          <span className="text-[10px] text-stone-600 italic">
            Nenhuma ativa — ative pelo toggle de cada card
          </span>
        )}
        <span className="ml-auto text-[10px] text-stone-600 border border-border rounded-full px-2 py-0.5">
          payload n8n por tool
        </span>
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-2 gap-3">
        {tools.map((tool) => {
          const meta = TYPE_META[tool.tool_type];
          const readiness = tool.readiness ?? 'inactive';
          const borderCls = READINESS_BORDER[readiness];
          const isToggling = toggling === tool.slug;
          const missingDeps = (tool.dependencies ?? []).filter((d) => !d.configured);

          return (
            <button
              key={tool.slug}
              type="button"
              onClick={() => openDrawer(tool)}
              className={cn(
                'group relative text-left bg-surface border rounded-xl overflow-hidden',
                'transition-all duration-150 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5',
                borderCls
              )}
            >
              {/* Barra colorida por tipo */}
              <div
                className={cn(
                  'h-0.5 w-full',
                  meta.barCls,
                  !tool.is_enabled && 'opacity-30'
                )}
              />

              <div className="p-4">
                {/* Emoji + nome + toggle */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl leading-none select-none shrink-0">{tool.icon}</span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-primary leading-tight truncate block">
                        {tool.name}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-medium border rounded px-1.5 py-0 inline-block mt-0.5',
                          meta.cls
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                  <Toggle
                    id={`tool-toggle-card-${tool.slug}`}
                    checked={tool.is_enabled}
                    loading={isToggling}
                    onChange={() => handleToggle(tool.slug)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Status badge */}
                <div className="mb-2.5">
                  <AgentToolStatusBadge status={readiness} />
                </div>

                {/* Descrição */}
                <p className="text-[11px] text-stone-500 leading-relaxed line-clamp-2">
                  {tool.description}
                </p>

                {missingDeps.length > 0 && (
                  <p className="mt-2 text-[10px] text-orange-400 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {missingDeps.length} dependência{missingDeps.length > 1 ? 's' : ''} pendente{missingDeps.length > 1 ? 's' : ''}
                  </p>
                )}

                {/* Hint configurar (hover) */}
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <Settings2 size={12} className="text-stone-600" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Drawer */}
      {selected && (
        <AgentToolDrawer
          tool={selected}
          visible={drawerVisible}
          context={context ?? DEFAULT_CONTEXT}
          dependencies={selected.dependencies ?? []}
          agentId={agentId}
          companyId={companyId}
          onClose={closeDrawer}
          onToggle={() => handleToggle(selected.slug)}
          toggling={toggling === selected.slug}
          onToolUpdated={handleToolUpdated}
        />
      )}
    </>
  );
};
