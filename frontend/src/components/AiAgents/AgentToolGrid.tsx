import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, WifiOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { AgentToolDrawer } from './AgentToolDrawer';
import { AgentToolRow, TOOL_ISSUE_STATUSES } from './AgentToolRow';
import type {
  AgentTool,
  AgentToolAsset,
  AgentToolType,
  ToolContext,
  ToolDependency,
  ToolReadinessStatus,
} from '../../types';

// ── Tipos internos ────────────────────────────────────────────────

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

// ── Metadados visuais por tipo ────────────────────────────────────

const TYPE_META: Record<AgentToolType, { label: string; cls: string; barCls: string }> = {
  agenda_action:      { label: 'Agenda',       cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20',       barCls: 'bg-blue-500' },
  crm_action:         { label: 'CRM',          cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', barCls: 'bg-emerald-500' },
  atendimento_action: { label: 'Atendimento',  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',     barCls: 'bg-amber-500' },
  media_action:       { label: 'Mídia',        cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20',  barCls: 'bg-violet-500' },
  knowledge_action:   { label: 'Conhecimento', cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',        barCls: 'bg-cyan-500' },
  webhook_action:     { label: 'Webhook',      cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20',  barCls: 'bg-orange-500' },
  internal_action:    { label: 'Interno',      cls: 'text-stone-400 bg-stone-500/10 border-stone-500/20',     barCls: 'bg-stone-500' },
  catalog_action:     { label: 'Catálogo',     cls: 'text-teal-400 bg-teal-500/10 border-teal-500/20',        barCls: 'bg-teal-500' },
};

const LEGACY_TOOL_TYPE_TO_META_KEY: Record<string, AgentToolType> = {
  action:   'internal_action',
  media:    'media_action',
  webhook:  'webhook_action',
  internal: 'internal_action',
};

function isToolReadinessStatus(v: string): v is ToolReadinessStatus {
  return ['ready', 'incomplete', 'inactive', 'blocked', 'integration_missing'].includes(v);
}

function resolveReadiness(raw: string | undefined | null): ToolReadinessStatus {
  const v = (raw ?? 'inactive').trim();
  return isToolReadinessStatus(v) ? v : 'inactive';
}

const DEFAULT_CONTEXT: ToolContext = {
  schedulesConfigured: false,
  serviceTypesConfigured: false,
  pipelineConfigured: false,
  teamsConfigured: false,
  mediaStorageConfigured: true,
  knowledgeProviderConfigured: false,
  productCatalogConfigured: false,
};

// ── Helpers de schema ─────────────────────────────────────────────

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
      helpText: 'Faça upload de arquivos na configuração.',
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
  tool: {
    slug: string;
    tool_type: AgentToolType;
    is_enabled: boolean;
    config: Record<string, unknown>;
    config_schema: Record<string, unknown>;
    assets?: AgentTool['assets'];
  },
  dependencies: ToolDependency[]
): ToolReadinessStatus => {
  if (!tool.is_enabled) return 'inactive';

  if (tool.tool_type === 'knowledge_action' && dependencies.some((d) => !d.configured)) {
    return 'integration_missing';
  }

  const SOFT_DEPS = new Set(['agent_tool_assets', 'product_catalog']);
  if (dependencies.some((d) => !d.configured && !SOFT_DEPS.has(d.key))) {
    return 'blocked';
  }

  const fields = Array.isArray(tool.config_schema.fields)
    ? (tool.config_schema.fields as Array<{ key: string; required?: boolean }>)
    : [];
  const missingRequired = fields.some((f) => {
    if (!f.required) return false;
    const v = tool.config[f.key];
    return v === undefined || v === null || v === '';
  });
  if (missingRequired) return 'incomplete';

  if (
    (tool.slug === 'enviar_foto' || tool.slug === 'enviar_video') &&
    (tool.assets?.length ?? 0) === 0
  ) {
    return 'incomplete';
  }

  if (dependencies.some((d) => !d.configured)) return 'incomplete';

  return 'ready';
};

// ── Filtro ────────────────────────────────────────────────────────

type ToolFilter = 'all' | 'active' | 'pending' | AgentToolType;

// ── Componente principal ──────────────────────────────────────────

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
  const [filter, setFilter] = useState<ToolFilter>('all');

  // ── Fetch ─────────────────────────────────────────────────────

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

    const mediaBindingIds = bindings
      .filter((b) => b.tool_slug === 'enviar_foto' || b.tool_slug === 'enviar_video')
      .map((b) => b.id);

    const assetsRes =
      mediaBindingIds.length > 0
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

  // ── Toggle ────────────────────────────────────────────────────

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

  // ── Drawer ────────────────────────────────────────────────────

  const openDrawer = (tool: AgentTool) => {
    setSelected(tool);
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawerVisible(true)));
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setSelected(null), 220);
  };

  const handleToolUpdated = useCallback(
    (updated: Partial<AgentTool>) => {
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
    },
    [selected?.slug, context]
  );

  // ── Dados derivados (hooks devem vir antes dos early returns) ──

  const availableCategories = useMemo((): AgentToolType[] => {
    const seen = new Set<AgentToolType>();
    const ordered: AgentToolType[] = [];
    for (const tool of tools) {
      const key = (tool.tool_type ?? '').trim();
      let cat: AgentToolType | undefined;
      if (key && key in TYPE_META) cat = key as AgentToolType;
      else if (LEGACY_TOOL_TYPE_TO_META_KEY[key]) cat = LEGACY_TOOL_TYPE_TO_META_KEY[key];
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        ordered.push(cat);
      }
    }
    return ordered;
  }, [tools]);

  const filteredTools = useMemo(() => {
    if (filter === 'all') return tools;
    if (filter === 'active') return tools.filter((t) => t.is_enabled);
    if (filter === 'pending')
      return tools.filter(
        (t) => t.is_enabled && TOOL_ISSUE_STATUSES.has(resolveReadiness(t.readiness))
      );
    return tools.filter((t) => {
      const key = (t.tool_type ?? '').trim();
      return key === filter || LEGACY_TOOL_TYPE_TO_META_KEY[key] === filter;
    });
  }, [tools, filter]);

  // ── Estados de carregamento / erro ────────────────────────────

  if (loading) {
    return (
      <div className="border border-border rounded-xl overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 animate-pulse"
          >
            <div className="w-0.5 h-7 rounded-full bg-stone-800" />
            <div className="w-5 h-5 rounded bg-stone-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-stone-800 rounded w-28" />
              <div className="h-2 bg-stone-800 rounded w-44" />
            </div>
            <div className="w-14 h-5 bg-stone-800 rounded-full" />
            <div className="w-9 h-5 bg-stone-800 rounded-full" />
            <div className="w-20 h-6 bg-stone-800 rounded-lg" />
          </div>
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

  // ── Dados derivados ───────────────────────────────────────────

  const enabledCount = tools.filter((t) => t.is_enabled).length;
  const readyCount = tools.filter((t) => t.readiness === 'ready').length;
  const pendingCount = tools.filter(
    (t) => t.is_enabled && TOOL_ISSUE_STATUSES.has(resolveReadiness(t.readiness))
  ).length;

  const countFor = (f: ToolFilter): number => {
    if (f === 'all') return tools.length;
    if (f === 'active') return enabledCount;
    if (f === 'pending') return pendingCount;
    return tools.filter((t) => {
      const key = (t.tool_type ?? '').trim();
      return key === f || LEGACY_TOOL_TYPE_TO_META_KEY[key] === f;
    }).length;
  };

  // ── Prontidão para publicação ─────────────────────────────────

  const activeWithIssues = tools.filter(
    (t) => t.is_enabled && TOOL_ISSUE_STATUSES.has(resolveReadiness(t.readiness))
  );
  const activeReady = tools.filter((t) => t.is_enabled && t.readiness === 'ready');

  // ── Render ───────────────────────────────────────────────────

  const STATIC_FILTERS: Array<{ id: ToolFilter; label: string }> = [
    { id: 'all', label: 'Todas' },
    { id: 'active', label: 'Ativas' },
    { id: 'pending', label: 'Pendentes' },
  ];

  return (
    <>
      {/* Resumo de status */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[11px] text-stone-500">
          {tools.length} disponív{tools.length === 1 ? 'el' : 'eis'}
        </span>
        <span className="text-stone-700">·</span>
        {enabledCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {enabledCount} ativa{enabledCount !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-[10px] text-stone-600 italic">Nenhuma ativada</span>
        )}
        {readyCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {readyCount} pronta{readyCount !== 1 ? 's' : ''}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5">
            <AlertTriangle size={9} />
            {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {STATIC_FILTERS.map(({ id, label }) => {
          const count = countFor(id);
          const isActive = filter === id;
          const isPending = id === 'pending';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
                isActive
                  ? isPending
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-stone-700 border-stone-600 text-stone-100'
                  : 'border-border text-stone-500 hover:text-stone-300 hover:border-stone-600'
              )}
            >
              {label}
              <span className={cn('text-[10px]', isActive ? 'opacity-70' : 'opacity-50')}>
                {count}
              </span>
            </button>
          );
        })}

        {availableCategories.map((cat) => {
          const meta = TYPE_META[cat];
          const count = countFor(cat);
          const isActive = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
                isActive
                  ? meta.cls + ' border-current/30'
                  : 'border-border text-stone-500 hover:text-stone-300 hover:border-stone-600'
              )}
            >
              {meta.label}
              <span className="text-[10px] opacity-50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Lista compacta de ferramentas */}
      <div className="border border-border rounded-xl overflow-hidden bg-surface">
        {filteredTools.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-stone-500">Nenhuma ferramenta neste filtro.</p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-2 text-xs text-stone-600 hover:text-stone-400 underline"
            >
              Ver todas
            </button>
          </div>
        ) : (
          filteredTools.map((tool) => (
            <AgentToolRow
              key={tool.slug}
              tool={tool}
              isToggling={toggling === tool.slug}
              onToggle={() => handleToggle(tool.slug)}
              onOpen={() => openDrawer(tool)}
            />
          ))
        )}
      </div>

      {/* Aviso de prontidão para publicação */}
      {enabledCount > 0 && (
        activeWithIssues.length > 0 ? (
          <div className="flex items-start gap-2 p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl text-xs text-orange-400 mt-3">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              <strong>{activeWithIssues.length}</strong>{' '}
              ferramenta{activeWithIssues.length > 1 ? 's ativas com' : ' ativa com'} pendência
              {activeWithIssues.length > 1 ? 's' : ''} —{' '}
              {activeWithIssues.length > 1 ? 'elas não serão incluídas' : 'ela não será incluída'}{' '}
              no payload enviado ao n8n até que as pendências sejam resolvidas.
            </span>
          </div>
        ) : activeReady.length > 0 ? (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 mt-3">
            <CheckCircle2 size={13} className="shrink-0" />
            <span>
              {activeReady.length} ferramenta{activeReady.length > 1 ? 's prontas' : ' pronta'}{' '}
              — configuração completa para publicação.
            </span>
          </div>
        ) : null
      )}

      {/* Drawer de configuração */}
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
