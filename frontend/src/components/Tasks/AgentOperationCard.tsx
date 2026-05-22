import React, { useState } from 'react';
import { Clock, MoreHorizontal, Calendar, AlarmClock, Ban, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AgentOperation, AgentOperationType, FollowUpState } from '../../types';
import { AgentMessageBubble } from './AgentMessageBubble';
import { OperationCountdownBar } from './OperationCountdownBar';
import { FollowUpAttemptBadge } from '../FollowUp/FollowUpAttemptBadge';
import { FollowUpNextAllowed } from '../FollowUp/FollowUpNextAllowed';
import { FollowUpResponseBadge } from '../FollowUp/FollowUpResponseBadge';
import { FollowUpBlockReason } from '../FollowUp/FollowUpBlockReason';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEta(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Agora';
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `em ${days}d`;
  if (hrs > 0) return `em ${hrs}h`;
  return `em ${mins}min`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function isImminent(iso: string): boolean {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 60 * 60 * 1000; // menos de 60 min
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

// ── Configuração visual por tipo de operação ──────────────────────────────────
const TYPE_CONFIG: Record<AgentOperationType, {
  label: string;
  dotColor: string;
  tagClass: string;
}> = {
  follow_up: {
    label: 'FOLLOW-UP',
    dotColor: 'bg-cyan-400',
    tagClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  escalate: {
    label: 'ESCALAR',
    dotColor: 'bg-violet-400',
    tagClass: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  },
  confirm: {
    label: 'CONFIRMAR',
    dotColor: 'bg-blue-400',
    tagClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  },
  rescue: {
    label: 'RESGATE',
    dotColor: 'bg-orange-400',
    tagClass: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  },
};

// ── Avatar com iniciais ───────────────────────────────────────────────────────
const ContactAvatar: React.FC<{ initials: string; operationType: AgentOperationType }> = ({
  initials,
  operationType,
}) => {
  const colors: Record<AgentOperationType, string> = {
    follow_up: 'bg-cyan-500/20 text-cyan-300',
    escalate: 'bg-violet-500/20 text-violet-300',
    confirm: 'bg-blue-500/20 text-blue-300',
    rescue: 'bg-orange-500/20 text-orange-300',
  };
  return (
    <div
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase',
        colors[operationType],
      )}
      aria-hidden="true"
    >
      {initials.slice(0, 2)}
    </div>
  );
};

// ── Popover "Por que esta mensagem?" ─────────────────────────────────────────
const ReasonPopover: React.FC<{ reason: string | null }> = ({ reason }) => {
  const [open, setOpen] = useState(false);
  if (!reason) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
        aria-label="Por que esta mensagem?"
        aria-expanded={open}
      >
        <HelpCircle size={10} />
        Por quê?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-20 mb-1.5 w-64 rounded-lg border border-violet-500/20 bg-surface p-3 shadow-2xl shadow-black/30">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-400">
              Por que esta mensagem?
            </p>
            <p className="text-[11px] leading-relaxed text-text-muted">{reason}</p>
          </div>
        </>
      )}
    </div>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  operation: AgentOperation;
  autopilotEnabled: boolean;
  followUpState?: FollowUpState | null;
  onUpdateMessage: (id: string, message: string) => Promise<{ success: boolean; error?: string }>;
  onReschedule: (id: string) => void;
  onSnooze: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: (id: string) => void;
}

// ── Componente principal ──────────────────────────────────────────────────────
export const AgentOperationCard: React.FC<Props> = ({
  operation,
  autopilotEnabled,
  followUpState,
  onUpdateMessage,
  onReschedule,
  onSnooze,
  onCancel,
}) => {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [snoozing, setSnoozable] = useState(false);
  const config = TYPE_CONFIG[operation.operation_type];
  const imminent = isImminent(operation.send_at);
  const overdue = isOverdue(operation.send_at);
  const isPaused = operation.status === 'paused';
  const needsReschedule = operation.status === 'needs_reschedule';

  const isFollowUp = operation.operation_type === 'follow_up';
  const fup = isFollowUp ? followUpState : null;

  const handleSnooze = async () => {
    setSnoozable(true);
    await onSnooze(operation.id);
    setSnoozable(false);
    setActionsOpen(false);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-all duration-200',
        /* Borda mais forte quando iminente */
        imminent && !isPaused
          ? 'border-orange-500/40 bg-orange-500/[0.03]'
          : 'border-violet-500/15 bg-violet-500/[0.025]',
        needsReschedule && 'border-amber-500/30 bg-amber-500/[0.025]',
      )}
    >
      {/* ── Head ── */}
      <div className="flex items-start gap-2">
        <ContactAvatar initials={operation.contact_initials} operationType={operation.operation_type} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-primary">{operation.contact_name}</span>
            <span className={cn('rounded border px-1 py-px font-mono text-[9px] font-semibold', config.tagClass)}>
              {config.label}
            </span>
            {isPaused && (
              <span className="rounded border border-stone-500/25 bg-stone-500/10 px-1 py-px font-mono text-[9px] font-semibold text-stone-400">
                PAUSADO
              </span>
            )}
            {needsReschedule && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-px font-mono text-[9px] font-semibold text-amber-400">
                REAGENDAR
              </span>
            )}
            {/* Badges de follow-up — apenas para operações do tipo follow_up */}
            {fup && (
              <>
                <FollowUpAttemptBadge
                  attemptCount={fup.attempt_count}
                  maxAttempts={fup.max_attempts}
                  cycleStatus={fup.cycle_status}
                />
                {fup.has_responded && (
                  <FollowUpResponseBadge
                    hasResponded
                    respondedAt={fup.responded_at}
                    showTime={false}
                  />
                )}
              </>
            )}
          </div>

          {/* Linha de meta de follow-up */}
          {fup && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <FollowUpNextAllowed
                nextAllowedAt={fup.next_allowed_at}
                canSend={fup.can_send}
                blockReason={fup.block_reason}
              />
            </div>
          )}

          <p className="mt-0.5 text-[10px] leading-snug text-stone-500">{operation.context}</p>
        </div>

        {/* ETA + horário + menu */}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="flex items-center gap-1">
            <Clock size={9} className="text-stone-600" />
            <span className="font-mono text-[10px] text-stone-500">{formatTime(operation.send_at)}</span>
          </div>
          <span
            className={cn(
              'font-mono text-[10px] font-semibold',
              overdue && !needsReschedule ? 'text-rose-400' : imminent ? 'text-orange-400' : 'text-stone-400',
            )}
          >
            {needsReschedule ? 'vencido' : formatEta(operation.send_at)}
          </span>
        </div>

        {/* Ações: menu overflow */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setActionsOpen(o => !o)}
            aria-label="Mais ações"
            aria-expanded={actionsOpen}
            className="flex items-center justify-center rounded p-0.5 text-stone-600 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none"
          >
            <MoreHorizontal size={13} />
          </button>
          {actionsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
              <div className="absolute right-0 top-5 z-20 w-40 rounded-lg border border-border bg-surface py-1 shadow-2xl">
                <button type="button"
                  onClick={() => { onReschedule(operation.id); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                  <Calendar size={11} />Reagendar
                </button>
                <button type="button"
                  onClick={() => { void handleSnooze(); }}
                  disabled={snoozing}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-primary disabled:opacity-50">
                  <AlarmClock size={11} />{snoozing ? 'Adiando…' : 'Adiar 1h'}
                </button>
                <div className="my-1 h-px bg-border" />
                <button type="button"
                  onClick={() => { onCancel(operation.id); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-rose-400 transition-colors hover:bg-rose-500/10">
                  <Ban size={11} />Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Mensagem ── */}
      <AgentMessageBubble
        message={operation.message}
        onSave={msg => onUpdateMessage(operation.id, msg)}
        disabled={!autopilotEnabled || isPaused}
      />

      {/* ── Barra de countdown ── */}
      {!isPaused && !needsReschedule && (
        <OperationCountdownBar sendAt={operation.send_at} />
      )}

      {/* ── Bloqueio de follow-up ── */}
      {fup && !fup.can_send && fup.block_reason && fup.block_reason !== 'min_interval_not_elapsed' && (
        <FollowUpBlockReason
          canSend={fup.can_send}
          blockReason={fup.block_reason}
        />
      )}

      {/* ── Rodapé: "por quê?" ── */}
      {operation.reason && (
        <div className="flex justify-end">
          <ReasonPopover reason={operation.reason} />
        </div>
      )}
    </div>
  );
};
