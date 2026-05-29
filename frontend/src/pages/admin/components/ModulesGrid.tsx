import React from 'react';
import {
  MessageSquare, GitBranch, CheckSquare, Bot, Calendar,
  BarChart2, Plug, Globe, Lock, Loader2,
} from 'lucide-react';
import type { AdminTenantModule } from '../adminTypes';

const MODULE_ICONS: Record<string, React.ReactNode> = {
  inbox: <MessageSquare size={16} />,
  pipeline: <GitBranch size={16} />,
  tasks: <CheckSquare size={16} />,
  ai_agents: <Bot size={16} />,
  calendar: <Calendar size={16} />,
  analytics: <BarChart2 size={16} />,
  integrations: <Plug size={16} />,
  public_api: <Globe size={16} />,
};

interface ModulesGridProps {
  modules: AdminTenantModule[];
  onToggle?: (module: AdminTenantModule, nextEnabled: boolean) => void;
  savingSlug?: string | null;
  compact?: boolean;
}

export const ModulesGrid: React.FC<ModulesGridProps> = ({
  modules,
  onToggle,
  savingSlug,
  compact = false,
}) => {
  const activeCount = modules.filter(m => m.is_enabled).length;

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.025] border border-white/[0.06]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Módulos Ativos</span>
        <span className="text-xs font-mono text-zinc-500">{activeCount}/{modules.length}</span>
      </div>
      {modules.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-600">Nenhum módulo cadastrado.</div>
      ) : (
        <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
          {modules.map(mod => {
            const disabled = !mod.eligible || savingSlug === mod.slug || !onToggle;
            return (
              <button
                key={mod.slug}
                type="button"
                disabled={disabled}
                onClick={() => onToggle?.(mod, !mod.is_enabled)}
                title={mod.blocked_reason ?? undefined}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left disabled:cursor-not-allowed ${
                  mod.is_enabled
                    ? 'bg-emerald-500/[0.05] border-emerald-500/20'
                    : 'bg-white/[0.02] border-white/[0.05]'
                } ${onToggle ? 'hover:border-orange-500/30' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={mod.is_enabled ? 'text-emerald-400' : mod.eligible ? 'text-zinc-600' : 'text-zinc-700'}>
                    {MODULE_ICONS[mod.slug] ?? <Plug size={16} />}
                  </span>
                  <span className={`text-xs font-medium truncate ${mod.is_enabled ? 'text-zinc-200' : 'text-zinc-600'}`}>
                    {mod.name}
                  </span>
                  {!mod.eligible && <Lock size={12} className="text-zinc-700 shrink-0" />}
                </div>
                <span
                  className={`relative w-8 h-4 rounded-full transition-all duration-300 shrink-0 ${
                    mod.is_enabled ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                  role="switch"
                  aria-checked={mod.is_enabled}
                  aria-label={`Módulo ${mod.name}`}
                >
                  {savingSlug === mod.slug ? (
                    <Loader2 size={12} className="absolute left-2.5 top-0.5 animate-spin text-white" />
                  ) : (
                    <span
                      className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300"
                      style={{ left: mod.is_enabled ? '18px' : '2px' }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {modules.some(m => !m.eligible) && (
        <p className="text-[11px] text-zinc-600">
          Módulos com cadeado dependem do plano atual do tenant.
        </p>
      )}
    </div>
  );
};
