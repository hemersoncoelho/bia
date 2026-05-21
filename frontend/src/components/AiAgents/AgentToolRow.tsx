import React from 'react';
import { Settings2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AgentToolStatusBadge } from './AgentToolStatusBadge';
import type { AgentTool, AgentToolType, ToolReadinessStatus } from '../../types';

// ── Metadados visuais por categoria ──────────────────────────────

const TYPE_LABELS: Record<AgentToolType, { label: string; cls: string }> = {
  agenda_action:      { label: 'Agenda',       cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  crm_action:         { label: 'CRM',          cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  atendimento_action: { label: 'Atendimento',  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  media_action:       { label: 'Mídia',        cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  knowledge_action:   { label: 'Conhecimento', cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  webhook_action:     { label: 'Webhook',      cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  internal_action:    { label: 'Interno',      cls: 'text-stone-400 bg-stone-500/10 border-stone-500/20' },
  catalog_action:     { label: 'Catálogo',     cls: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
};

const LEGACY_MAP: Record<string, AgentToolType> = {
  action:   'internal_action',
  media:    'media_action',
  webhook:  'webhook_action',
  internal: 'internal_action',
};

function resolveTypeLabel(raw: string | undefined | null) {
  const key = (raw ?? '').trim();
  if (key && key in TYPE_LABELS) return TYPE_LABELS[key as AgentToolType];
  const mapped = LEGACY_MAP[key];
  if (mapped) return TYPE_LABELS[mapped];
  return TYPE_LABELS.internal_action;
}

export const TOOL_ISSUE_STATUSES = new Set<ToolReadinessStatus>([
  'incomplete',
  'blocked',
  'integration_missing',
]);

// ── Toggle ────────────────────────────────────────────────────────

interface ToggleProps {
  id: string;
  checked: boolean;
  loading?: boolean;
  onChange: () => void;
}

const Toggle: React.FC<ToggleProps> = ({ id, checked, loading, onChange }) => (
  <label htmlFor={id} className="relative inline-flex items-center cursor-pointer shrink-0">
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

// ── Componente principal ──────────────────────────────────────────

export interface AgentToolRowProps {
  tool: AgentTool;
  isToggling: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

export const AgentToolRow: React.FC<AgentToolRowProps> = ({
  tool,
  isToggling,
  onToggle,
  onOpen,
}) => {
  const meta = resolveTypeLabel(tool.tool_type);
  const readiness = (tool.readiness ?? 'inactive') as ToolReadinessStatus;
  const hasIssue = TOOL_ISSUE_STATUSES.has(readiness);
  const missingDeps = (tool.dependencies ?? []).filter((d) => !d.configured);

  const stripCls = cn(
    'w-0.5 self-stretch rounded-full shrink-0',
    readiness === 'ready' && tool.is_enabled
      ? 'bg-emerald-500'
      : hasIssue && tool.is_enabled
      ? 'bg-orange-400'
      : tool.is_enabled
      ? 'bg-indigo-500/50'
      : 'bg-stone-700/40'
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        'border-b border-border last:border-b-0',
        'transition-colors hover:bg-surface cursor-pointer select-none',
        !tool.is_enabled && 'opacity-60 hover:opacity-80'
      )}
    >
      {/* Faixa de cor lateral */}
      <div className={stripCls} />

      {/* Emoji da ferramenta */}
      <span className="text-base leading-none select-none shrink-0 w-5 text-center">
        {tool.icon}
      </span>

      {/* Nome + categoria + info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-primary leading-tight">{tool.name}</span>
          <span
            className={cn(
              'text-[10px] font-medium border rounded px-1.5 shrink-0 leading-[18px]',
              meta.cls
            )}
          >
            {meta.label}
          </span>
        </div>

        {hasIssue && missingDeps.length > 0 ? (
          <p className="text-[11px] text-orange-400 flex items-center gap-1 mt-0.5 leading-tight">
            <AlertTriangle size={9} className="shrink-0" />
            <span className="truncate">{missingDeps.map((d) => d.label).join(', ')}</span>
          </p>
        ) : (
          <p className="text-[11px] text-stone-500 truncate mt-0.5 leading-tight">
            {tool.description}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0">
        <AgentToolStatusBadge status={readiness} />
      </div>

      {/* Toggle */}
      <div onClick={(e) => e.stopPropagation()} role="presentation">
        <Toggle
          id={`row-toggle-${tool.slug}`}
          checked={tool.is_enabled}
          loading={isToggling}
          onChange={onToggle}
        />
      </div>

      {/* Botão de ação */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={cn(
          'shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap',
          hasIssue
            ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10'
            : 'border-border text-stone-400 hover:text-primary hover:border-stone-600'
        )}
      >
        {hasIssue ? (
          <>
            <AlertTriangle size={10} />
            Pendência
          </>
        ) : (
          <>
            <Settings2 size={10} />
            Configurar
          </>
        )}
      </button>
    </div>
  );
};
