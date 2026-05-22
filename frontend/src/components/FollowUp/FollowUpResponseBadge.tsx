import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatRelativeTime } from './followUpLabels';

interface Props {
  hasResponded: boolean;
  respondedAt?: string | null;
  showTime?: boolean;
  className?: string;
}

export const FollowUpResponseBadge: React.FC<Props> = ({
  hasResponded,
  respondedAt,
  showTime = true,
  className,
}) => {
  if (!hasResponded) return null;

  const timeLabel = showTime && respondedAt ? formatRelativeTime(respondedAt) : null;

  return (
    <span
      aria-label={`Contato retomou o contato${timeLabel ? ` ${timeLabel}` : ''}`}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-emerald-400',
        className,
      )}
    >
      <CheckCircle2 size={9} aria-hidden="true" />
      Retomou
      {timeLabel && (
        <span className="font-normal normal-case tracking-normal text-emerald-500/70">
          {timeLabel}
        </span>
      )}
    </span>
  );
};
