import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FollowUpBlockReason as FollowUpBlockReasonType } from '../../types';
import { getBlockReasonLabel } from './followUpLabels';

interface Props {
  canSend: boolean;
  blockReason: FollowUpBlockReasonType;
  nextAllowedAt?: string | null;
  className?: string;
}

export const FollowUpBlockReason: React.FC<Props> = ({
  canSend,
  blockReason,
  className,
}) => {
  // Não renderizar se pode enviar, se sem razão, ou se apenas intervalo (NextAllowed já cobre)
  if (canSend || !blockReason || blockReason === 'ok') return null;
  if (blockReason === 'min_interval_not_elapsed') return null;

  const label = getBlockReasonLabel(blockReason);

  const isOptOut = blockReason === 'opt_out';
  const isHard = blockReason === 'max_attempts_reached'
    || blockReason === 'cycle_stopped'
    || blockReason === 'autopilot_disabled';

  const colorClass = isOptOut || isHard
    ? 'border-amber-500/20 bg-amber-500/[0.05] text-amber-400'
    : 'border-stone-500/20 bg-stone-500/[0.04] text-stone-400';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px]',
        colorClass,
        className,
      )}
    >
      <AlertCircle size={11} className="shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
};
