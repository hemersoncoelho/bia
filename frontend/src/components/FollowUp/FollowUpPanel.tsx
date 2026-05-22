import React, { useState } from 'react';
import { Loader2, StopCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { FollowUpState, FollowUpHistoryItem } from '../../types';
import { FollowUpAttemptBadge } from './FollowUpAttemptBadge';
import { FollowUpStatusBadge } from './FollowUpStatusBadge';
import { FollowUpResponseBadge } from './FollowUpResponseBadge';
import { FollowUpNextAllowed } from './FollowUpNextAllowed';
import { FollowUpBlockReason } from './FollowUpBlockReason';
import { FollowUpHistoryPanel } from './FollowUpHistoryPanel';
import { formatAbsolute } from './followUpLabels';

// ── Skeleton ──────────────────────────────────────────────────────────────────

const PanelSkeleton: React.FC = () => (
  <div className="space-y-2 animate-pulse" aria-busy="true" aria-label="Carregando estado do follow-up">
    <div className="flex gap-1.5">
      <div className="h-4 w-20 rounded border border-stone-700 bg-stone-800" />
      <div className="h-4 w-14 rounded border border-stone-700 bg-stone-800" />
    </div>
    <div className="h-3 w-32 rounded bg-stone-800" />
  </div>
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  data: FollowUpState | null;
  history: FollowUpHistoryItem[];
  isLoading: boolean;
  error: string | null;
  onStopCycle?: () => Promise<void>;
  canManage?: boolean;
  className?: string;
}

// ── Componente principal ──────────────────────────────────────────────────────

export const FollowUpPanel: React.FC<Props> = ({
  data,
  history,
  isLoading,
  error,
  onStopCycle,
  canManage = false,
  className,
}) => {
  const [stopping, setStopping] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  if (isLoading) return <PanelSkeleton />;

  if (error) {
    return (
      <p className={cn('text-[11px] text-stone-500', className)}>
        Estado de follow indisponível.
      </p>
    );
  }

  const hasNoCycle = !data || data.cycle_status === null;

  const handleStop = async () => {
    if (!onStopCycle) return;
    setStopping(true);
    try {
      await onStopCycle();
    } finally {
      setStopping(false);
      setConfirmStop(false);
    }
  };

  const cycleIsActive = data?.cycle_status === 'active' || data?.cycle_status === 'paused';

  return (
    <div className={cn('flex flex-col gap-3', className)}>

      {/* ── Estado principal ── */}
      <div className="flex flex-col gap-2">
        {/* Badges de status + tentativas */}
        <div className="flex flex-wrap items-center gap-1.5">
          {hasNoCycle ? (
            <span className="text-[11px] text-stone-600">Sem follow registrado</span>
          ) : (
            <>
              <FollowUpAttemptBadge
                attemptCount={data!.attempt_count}
                maxAttempts={data!.max_attempts}
                cycleStatus={data!.cycle_status}
              />
              <FollowUpStatusBadge
                cycleStatus={data!.cycle_status}
                hasResponded={data!.has_responded}
                optOut={data!.opt_out}
              />
              {data!.has_responded && (
                <FollowUpResponseBadge
                  hasResponded
                  respondedAt={data!.responded_at}
                />
              )}
            </>
          )}
        </div>

        {/* Próximo follow / bloqueio */}
        {data && !hasNoCycle && (
          <div className="flex flex-col gap-1">
            <FollowUpNextAllowed
              nextAllowedAt={data.next_allowed_at}
              canSend={data.can_send}
              blockReason={data.block_reason}
            />
            <FollowUpBlockReason
              canSend={data.can_send}
              blockReason={data.block_reason}
            />
          </div>
        )}

        {/* Último follow */}
        {data?.last_follow_sent_at && (
          <p className="text-[10px] text-stone-600">
            Último follow: {formatAbsolute(data.last_follow_sent_at)}
          </p>
        )}
      </div>

      {/* ── Ação: encerrar ciclo ── */}
      {canManage && cycleIsActive && onStopCycle && (
        <div className="flex items-center gap-2">
          {confirmStop ? (
            <>
              <span className="text-[11px] text-stone-400">Encerrar ciclo?</span>
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={stopping}
                aria-label="Confirmar encerramento do ciclo de follow-up"
                className="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400 transition-colors hover:bg-rose-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400/40 disabled:opacity-50"
              >
                {stopping ? <Loader2 size={10} className="animate-spin" /> : null}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmStop(false)}
                disabled={stopping}
                className="text-[11px] text-stone-500 transition-colors hover:text-primary focus:outline-none"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmStop(true)}
              aria-label="Encerrar ciclo de follow-up manualmente"
              className="flex items-center gap-1 rounded border border-stone-600/40 px-2 py-0.5 text-[11px] text-stone-500 transition-colors hover:border-rose-500/30 hover:text-rose-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-500/30"
            >
              <StopCircle size={10} aria-hidden="true" />
              Encerrar ciclo
            </button>
          )}
        </div>
      )}

      {/* ── Histórico ── */}
      <FollowUpHistoryPanel
        history={history}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
};
