import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FollowUpHistoryItem } from '../../types';
import {
  getFollowTypeLabel,
  getEventStatusLabel,
  formatRelativeTime,
  formatAbsolute,
} from './followUpLabels';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColorClass(status: FollowUpHistoryItem['status']): string {
  switch (status) {
    case 'responded': return 'text-emerald-400';
    case 'delivered':
    case 'sent':     return 'text-cyan-400';
    case 'failed':   return 'text-rose-400';
    case 'cancelled':
    case 'stopped':  return 'text-stone-500';
    case 'expired':  return 'text-amber-400';
    default:         return 'text-stone-400';
  }
}

function channelIcon(channel: FollowUpHistoryItem['channel']): string {
  const icons: Record<string, string> = {
    whatsapp: 'W',
    email: 'E',
    sms: 'S',
    internal: 'I',
  };
  return icons[channel] ?? '?';
}

// ── Item do histórico ─────────────────────────────────────────────────────────

const HistoryItem: React.FC<{ item: FollowUpHistoryItem; idx: number }> = ({ item, idx }) => {
  const lag = item.responded_at && item.sent_at
    ? formatRelativeTime(item.sent_at)
    : null;

  return (
    <div className={cn(
      'flex items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-[11px]',
      'task-card-animate',
    )}
    style={{ animationDelay: `${idx * 30}ms` }}>

      {/* Número da tentativa */}
      <div className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-700 bg-stone-800 font-mono text-[9px] font-bold text-stone-400">
        {item.attempt_number}
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        {/* Linha principal */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-primary">Follow {item.attempt_number}</span>
          <span className="rounded border border-stone-700 px-1 font-mono text-[9px] text-stone-500">
            {getFollowTypeLabel(item.follow_type)}
          </span>
          <span className="rounded border border-stone-700/50 px-1 font-mono text-[9px] text-stone-600">
            {channelIcon(item.channel)}
          </span>
          <span className={cn('font-semibold', statusColorClass(item.status))}>
            {getEventStatusLabel(item.status)}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 text-[10px] text-stone-500">
          <span title={formatAbsolute(item.sent_at)}>
            Enviado {formatRelativeTime(item.sent_at)}
          </span>
          {item.responded_at && (
            <span className="text-emerald-500/70">
              Respondeu {formatRelativeTime(item.responded_at)}
              {lag && ` (${lag})`}
            </span>
          )}
          {item.stopped_reason && (
            <span className="text-stone-600">
              Motivo: {item.stopped_reason.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Loading skeleton ──────────────────────────────────────────────────────────

const HistorySkeleton: React.FC = () => (
  <div className="space-y-2">
    {[1, 2].map(i => (
      <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-surface" />
    ))}
  </div>
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  history: FollowUpHistoryItem[];
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  initiallyExpanded?: boolean;
}

// ── Componente principal ──────────────────────────────────────────────────────

export const FollowUpHistoryPanel: React.FC<Props> = ({
  history,
  isLoading = false,
  error = null,
  className,
  initiallyExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11px] font-semibold text-stone-500 transition-colors hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
      >
        {isLoading
          ? <Loader2 size={11} className="shrink-0 animate-spin" aria-hidden="true" />
          : <History size={11} className="shrink-0" aria-hidden="true" />
        }
        Histórico de follow-ups
        {history.length > 0 && (
          <span className="ml-0.5 font-mono text-[10px] tabular-nums text-stone-600">
            ({history.length})
          </span>
        )}
        <span className="ml-auto" aria-hidden="true">
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {/* Conteúdo */}
      {expanded && (
        <div className="ml-1 space-y-1.5">
          {isLoading && <HistorySkeleton />}

          {!isLoading && error && (
            <p className="text-[11px] text-stone-500">Histórico indisponível no momento.</p>
          )}

          {!isLoading && !error && history.length === 0 && (
            <p className="text-[11px] text-stone-600">
              Nenhum follow-up registrado neste ciclo.
            </p>
          )}

          {!isLoading && !error && history.map((item, idx) => (
            <HistoryItem key={item.id} item={item} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
};
