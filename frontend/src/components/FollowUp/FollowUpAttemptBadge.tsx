import React from 'react';
import { cn } from '../../lib/utils';
import type { FollowUpCycleStatus } from '../../types';
import { getAttemptLabel } from './followUpLabels';

interface Props {
  attemptCount: number;
  maxAttempts: number;
  cycleStatus?: FollowUpCycleStatus;
  className?: string;
}

export const FollowUpAttemptBadge: React.FC<Props> = ({
  attemptCount,
  maxAttempts,
  cycleStatus,
  className,
}) => {
  const isAtLimit = attemptCount >= maxAttempts && maxAttempts > 0;
  const isNearLimit = !isAtLimit && maxAttempts > 0 && attemptCount === maxAttempts - 1;
  const hasAttempts = attemptCount > 0;
  const label = getAttemptLabel(attemptCount, maxAttempts);

  const colorClass = (() => {
    if (isAtLimit) return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
    if (isNearLimit) return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    if (hasAttempts) return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400';
    return 'border-stone-500/25 bg-stone-500/10 text-stone-500';
  })();

  const isActive = cycleStatus === 'active' && hasAttempts && !isAtLimit;

  return (
    <span
      aria-label={`Tentativas de follow-up: ${label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide',
        colorClass,
        className,
      )}
    >
      {isActive && (
        <span className="h-1 w-1 rounded-full bg-cyan-400 motion-safe:animate-pulse" aria-hidden="true" />
      )}
      {label}
    </span>
  );
};
