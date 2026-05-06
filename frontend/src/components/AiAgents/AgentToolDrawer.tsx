import React, { useState, useCallback } from 'react';
import { X, Settings2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { AgentToolStatusBadge } from './AgentToolStatusBadge';
import { AgentToolDependencyList } from './AgentToolDependencyList';
import { AgentToolConfigForm } from './AgentToolConfigForm';
import { AgentToolAssets } from './AgentToolAssets';
import { AgentToolProductCatalog } from './AgentToolProductCatalog';
import { AgentToolPayloadPreview } from './AgentToolPayloadPreview';
import type { AgentTool, AgentToolAsset, ToolContext, ToolDependency, ToolReadinessStatus } from '../../types';

// ── Metadados visuais por tipo ────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  agenda_action: 'Agenda',
  crm_action: 'CRM',
  atendimento_action: 'Atendimento',
  media_action: 'Mídia',
  knowledge_action: 'Conhecimento',
  webhook_action: 'Webhook',
  internal_action: 'Interno',
  catalog_action: 'Catálogo',
};

const TYPE_CLS: Record<string, string> = {
  agenda_action: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  crm_action: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  atendimento_action: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  media_action: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  knowledge_action: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  webhook_action: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  internal_action: 'text-stone-400 bg-stone-500/10 border-stone-500/20',
  catalog_action: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
};

// ── Lógica de prontidão refinada ──────────────────────────────

const computeReadiness = (
  tool: AgentTool,
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
  const criticalMissing = dependencies.some(
    (d) => !d.configured && !SOFT_DEPS.has(d.key)
  );
  if (criticalMissing) return 'blocked';

  // Verifica campos required do config_schema
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

// ── Toggle padrão visual ──────────────────────────────────────

interface ToggleProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}

const Toggle: React.FC<ToggleProps> = ({ id, checked, disabled, onChange }) => (
  <label htmlFor={id} className="relative inline-flex items-center cursor-pointer shrink-0">
    <input
      id={id}
      type="checkbox"
      className="sr-only peer"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
    <div
      className={cn(
        'w-9 h-5 rounded-full transition-colors',
        "after:content-[''] after:absolute after:top-0.5 after:left-0.5",
        'after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all',
        'peer-checked:after:translate-x-4',
        checked ? 'bg-indigo-600' : 'bg-stone-700',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    />
  </label>
);

// ── Section wrapper ───────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
      {title}
    </p>
    {children}
  </div>
);

// ── Props / Component ─────────────────────────────────────────

interface AgentToolDrawerProps {
  tool: AgentTool;
  visible: boolean;
  context: ToolContext;
  dependencies: ToolDependency[];
  agentId: string;
  companyId: string;
  onClose: () => void;
  onToggle: () => void;
  toggling: boolean;
  onToolUpdated: (updated: Partial<AgentTool>) => void;
}

export const AgentToolDrawer: React.FC<AgentToolDrawerProps> = ({
  tool,
  visible,
  dependencies,
  agentId,
  companyId,
  onClose,
  onToggle,
  toggling,
  onToolUpdated,
}) => {
  const [savingConfig, setSavingConfig] = useState(false);
  const [productCatalogCount, setProductCatalogCount] = useState<number | null>(null);

  const handleCatalogCountChange = useCallback(
    (count: number) => {
      setProductCatalogCount(count);
      const patchedDeps = dependencies.map((d) =>
        d.key === 'product_catalog' ? { ...d, configured: count > 0 } : d
      );
      const newReadiness = computeReadiness({ ...tool }, patchedDeps);
      onToolUpdated({ readiness: newReadiness });
    },
    [dependencies, tool, onToolUpdated]
  );

  const getWhenToUse = () => {
    const v = tool.when_to_use ?? tool.config_schema.when_to_use;
    return typeof v === 'string' ? v : 'Use quando a conversa exigir esta ação.';
  };

  const handleSaveConfig = async (newConfig: Record<string, unknown>) => {
    setSavingConfig(true);
    const merged = { ...tool.config, ...newConfig };

    const { error } = await supabase
      .from('agent_tool_bindings')
      .upsert(
        {
          company_id: companyId,
          agent_id: agentId,
          tool_slug: tool.slug,
          is_enabled: tool.is_enabled,
          config: merged,
        },
        { onConflict: 'company_id,agent_id,tool_slug' }
      );

    if (!error) {
      const updatedTool = { ...tool, config: merged };
      const newReadiness = computeReadiness(updatedTool, dependencies);
      onToolUpdated({ config: merged, readiness: newReadiness });
    }
    setSavingConfig(false);
  };

  // Deps patchadas com o count local de produtos (quando disponível)
  const patchedDepsForReadiness = tool.slug === 'buscar_produtos_servicos' && productCatalogCount !== null
    ? dependencies.map((d) =>
        d.key === 'product_catalog' ? { ...d, configured: productCatalogCount > 0 } : d
      )
    : dependencies;

  // Tool atualizada com readiness recomputado para o preview
  const toolWithReadiness: AgentTool = {
    ...tool,
    readiness: computeReadiness(tool, patchedDepsForReadiness),
  };

  const typeCls = TYPE_CLS[tool.tool_type] ?? TYPE_CLS.internal_action;
  const typeLabel = TYPE_LABEL[tool.tool_type] ?? tool.tool_type;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Painel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[420px] z-50',
          'bg-background border-l border-border flex flex-col shadow-2xl',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border shrink-0">
          <span className="text-2xl leading-none select-none">{tool.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-primary">{tool.name}</h3>
              <span className={cn('text-[10px] font-medium border rounded px-1.5 py-0.5', typeCls)}>
                {typeLabel}
              </span>
              <AgentToolStatusBadge status={toolWithReadiness.readiness ?? 'inactive'} />
              {tool.is_built_in && (
                <span className="text-[10px] text-stone-500 border border-stone-700 rounded px-1.5 py-0.5">
                  Padrão
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-primary hover:bg-surface rounded-lg transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo scrollável */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {/* Bloco de status com toggle */}
          <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-300">
                {tool.is_enabled ? 'Ferramenta ativa' : 'Ferramenta inativa'}
              </p>
              <p className="text-[11px] text-stone-600 mt-0.5">
                {tool.is_enabled
                  ? 'Esta ferramenta será incluída no payload enviado ao n8n.'
                  : 'Ative para habilitar esta ação no agente.'}
              </p>
            </div>
            <Toggle
              id={`tool-toggle-drawer-${tool.slug}`}
              checked={tool.is_enabled}
              disabled={toggling}
              onChange={onToggle}
            />
          </div>

          {/* Descrição + quando usar */}
          <Section title="Descrição">
            <p className="text-sm text-stone-400 leading-relaxed">{tool.description}</p>
            <p className="text-xs text-stone-500 leading-relaxed mt-2">
              <span className="text-stone-400">Quando usar: </span>
              {getWhenToUse()}
            </p>
          </Section>

          {/* Dependências */}
          <Section title="Dependências">
            <AgentToolDependencyList dependencies={dependencies} />
          </Section>

          {/* Configuração dinâmica */}
          <Section title="Configuração">
            <AgentToolConfigForm
              tool={tool}
              onSave={handleSaveConfig}
              saving={savingConfig}
            />
          </Section>

          {/* Assets de mídia — Fase 3 */}
          {(tool.slug === 'enviar_foto' || tool.slug === 'enviar_video') && (
            <Section title="Assets de mídia">
              <AgentToolAssets
                toolSlug={tool.slug as 'enviar_foto' | 'enviar_video'}
                agentId={agentId}
                companyId={companyId}
                bindingId={tool.binding_id}
                assets={tool.assets ?? []}
                onAssetsChanged={(updatedAssets: AgentToolAsset[]) => {
                  const next = { ...tool, assets: updatedAssets };
                  const newReadiness = computeReadiness(next, dependencies);
                  onToolUpdated({ assets: updatedAssets, readiness: newReadiness });
                }}
              />
            </Section>
          )}

          {/* Catálogo de Produtos/Serviços */}
          {tool.slug === 'buscar_produtos_servicos' && (
            <Section title="Catálogo de produtos/serviços">
              <p className="text-[11px] text-stone-500 leading-relaxed mb-3">
                Cadastre os itens que o agente poderá consultar e apresentar ao cliente.
                A tool aparece como <strong className="text-stone-400">Pronta</strong> quando
                houver ao menos um item ativo.
              </p>
              <AgentToolProductCatalog
                companyId={companyId}
                onCountChange={handleCatalogCountChange}
              />
            </Section>
          )}

          {/* Config schema teaser se sem campos */}
          {Array.isArray(tool.config_schema.fields) &&
            (tool.config_schema.fields as unknown[]).length === 0 && (
              <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
                <div className="flex items-center gap-2 mb-1.5">
                  <Settings2 size={13} className="text-indigo-400 shrink-0" />
                  <p className="text-xs font-semibold text-indigo-400">
                    Configuração avançada
                  </p>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Campos adicionais serão disponibilizados conforme o catálogo evolui.
                </p>
              </div>
            )}

          {/* Payload preview */}
          <AgentToolPayloadPreview tool={toolWithReadiness} dependencies={dependencies} />
        </div>
      </div>
    </>
  );
};
