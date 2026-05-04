import React from 'react';
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ToolDependency } from '../../types';

interface AgentToolDependencyListProps {
  dependencies: ToolDependency[];
}

export const AgentToolDependencyList: React.FC<AgentToolDependencyListProps> = ({
  dependencies,
}) => {
  if (dependencies.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
        <CheckCircle2 size={14} className="shrink-0" />
        Sem dependências obrigatórias.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {dependencies.map((dep) => (
        <div
          key={dep.key}
          className="flex items-start gap-2 p-3 bg-surface border border-border rounded-lg"
        >
          {dep.configured ? (
            <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <Circle size={14} className="text-orange-400 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-stone-300">{dep.label}</p>
            {dep.helpText && (
              <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">{dep.helpText}</p>
            )}
          </div>
          {!dep.configured && dep.configurePath && (
            <Link
              to={dep.configurePath}
              className="text-stone-500 hover:text-primary transition-colors shrink-0"
              title="Configurar"
            >
              <ExternalLink size={13} />
            </Link>
          )}
        </div>
      ))}
    </div>
  );
};
