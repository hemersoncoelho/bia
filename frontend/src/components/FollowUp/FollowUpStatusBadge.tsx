import React from 'react';
import { cn } from '../../lib/utils';
import type { FollowUpCycleStatus } from '../../types';

interface Props {
  cycleStatus: FollowUpCycleStatus;
  hasResponded?: boolean;
  optOut?: boolean;
  className?: string;
}

type BadgeConfig = { label: string; class: string };

function resolveBadge(
  cycleStatus: FollowUpCycleStatus,
  hasResponded: boolean,
  optOut: boolean,
): BadgeConfig {
  // Prioridade visual: opt_out > responded > stopped > paused > active
  if (optOut) {
    return { label: 'Pausa solicitada', class: 'border-rose-500/30 bg-rose-500/10 text-rose-400' };
  }
  if (hasResponded || cycleStatus === 'responded') {
    return { label: 'Retomou', class: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' };
  }
  if (cycleStatus === 'stopped') {
    return { label: 'Encerrado', class: 'border-stone-500/25 bg-stone-500/10 text-stone-400' };
  }
  if (cycleStatus === 'completed') {
    return { label: 'Concluído', class: 'border-stone-500/25 bg-stone-500/10 text-stone-500' };
  }
  if (cycleStatus === 'paused') {
    return { label: 'Pausado', class: 'border-amber-500/30 bg-amber-500/10 text-amber-400' };
  }
  if (cycleStatus === 'active') {
    return { label: 'Ativo', class: 'border-violet-500/30 bg-violet-500/10 text-violet-400' };
  }
  return { label: 'Sem ciclo', class: 'border-stone-500/20 bg-stone-500/5 text-stone-600' };
}

export const FollowUpStatusBadge: React.FC<Props> = ({
  cycleStatus,
  hasResponded = false,
  optOut = false,
  className,
}) => {
  const badge = resolveBadge(cycleStatus, hasResponded, optOut);

  return (
    <span
      aria-label={`Status do follow-up: ${badge.label}`}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide',
        badge.class,
        className,
      )}
    >
      {badge.label}
    </span>
  );
};
