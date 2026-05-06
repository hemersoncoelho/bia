import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ToolReadinessStatus } from '../../types';

interface ReadinessMeta {
  label: string;
  cls: string;
  dot?: string;
}

const META: Record<ToolReadinessStatus, ReadinessMeta> = {
  ready: {
    label: 'Pronta',
    cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    dot: 'bg-emerald-400',
  },
  incomplete: {
    label: 'Incompleta',
    cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25',
  },
  inactive: {
    label: 'Inativa',
    cls: 'text-stone-500 bg-stone-500/10 border-stone-500/20',
  },
  blocked: {
    label: 'Dependência',
    cls: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  },
  integration_missing: {
    label: 'Integração',
    cls: 'text-red-400 bg-red-500/10 border-red-500/25',
  },
};

interface AgentToolStatusBadgeProps {
  status: ToolReadinessStatus;
  size?: 'sm' | 'md';
}

export const AgentToolStatusBadge: React.FC<AgentToolStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => {
  const meta = META[status] ?? META.inactive;
  const textCls = size === 'md' ? 'text-xs' : 'text-[10px]';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold border rounded-full px-2 py-0.5',
        textCls,
        meta.cls
      )}
    >
      {meta.dot ? (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
      ) : status !== 'inactive' ? (
        <AlertTriangle size={9} className="shrink-0" />
      ) : null}
      {meta.label}
    </span>
  );
};
