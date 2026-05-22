import React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FollowUpBlockReason } from '../../types';
import { formatRelativeTime } from './followUpLabels';

interface Props {
  nextAllowedAt: string | null;
  canSend: boolean;
  blockReason: FollowUpBlockReason;
  className?: string;
}

export const FollowUpNextAllowed: React.FC<Props> = ({
  nextAllowedAt,
  canSend,
  blockReason,
  className,
}) => {
  if (canSend) {
    return (
      <span
        aria-label="Follow-up liberado"
        className={cn(
          'inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/8 px-1.5 py-px text-[10px] text-emerald-500',
          className,
        )}
      >
        <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden="true" />
        Liberado
      </span>
    );
  }

  if (blockReason === 'min_interval_not_elapsed' && nextAllowedAt) {
    const isPast = new Date(nextAllowedAt).getTime() <= Date.now();
    if (isPast) {
      return (
        <span
          aria-label="Follow-up disponível agora"
          className={cn('inline-flex items-center gap-1 text-[10px] text-emerald-500', className)}
        >
          <Clock size={9} aria-hidden="true" />
          Disponível agora
        </span>
      );
    }
    return (
      <span
        aria-label={`Próximo follow em ${formatRelativeTime(nextAllowedAt)}`}
        className={cn('inline-flex items-center gap-1 text-[10px] text-stone-500', className)}
      >
        <Clock size={9} aria-hidden="true" />
        Próximo {formatRelativeTime(nextAllowedAt)}
      </span>
    );
  }

  return null;
};
