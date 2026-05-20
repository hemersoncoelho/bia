import React, { useState } from 'react';
import {
  Calendar, User, MessageSquare, ExternalLink,
  AlertCircle, Bot, Sparkles, Clock, Circle,
  Flag, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAttendeeTextColor } from '../../utils/attendeeColors';
import type { Task, TaskStatus, TaskPriority, TaskSourceType } from '../../types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', cancelled: 'Cancelada',
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
};
const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  normal: 'text-stone-400 bg-stone-400/10 border-stone-500/20',
  high: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  urgent: 'text-red-400 bg-red-400/10 border-red-400/20',
};
const STATUS_BADGE: Record<TaskStatus, string> = {
  open: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  in_progress: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  done: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  cancelled: 'text-stone-500 bg-stone-500/10 border-stone-500/20',
};
const SOURCE_LABELS: Record<TaskSourceType, string> = {
  manual: 'Manual', ai: 'IA', followup_trigger: 'Follow-up',
  cadence: 'Cadência', appointment: 'Agenda', inbox: 'Inbox', system: 'Sistema',
};
const SOURCE_BADGE: Record<TaskSourceType, string> = {
  manual: 'text-stone-400 bg-stone-400/10 border-stone-500/20',
  ai: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30',
  followup_trigger: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  cadence: 'text-violet-300 bg-violet-500/15 border-violet-500/30',
  appointment: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  inbox: 'text-blue-300 bg-blue-500/15 border-blue-500/30',
  system: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
};
const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'cancelled'];

function normalizeSourceType(v: unknown): TaskSourceType {
  const valid: TaskSourceType[] = ['manual','ai','followup_trigger','cadence','appointment','inbox','system'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskSourceType) : 'manual';
}
function normalizePriority(v: unknown): TaskPriority {
  const valid: TaskPriority[] = ['low','normal','high','urgent'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskPriority) : 'normal';
}
function isFollowup(t: Task) {
  return t.source_type === 'followup_trigger' || (t.metadata as Record<string,unknown>)?.source === 'expired_followup_trigger';
}
function getSource(t: Task): TaskSourceType {
  return isFollowup(t) ? 'followup_trigger' : normalizeSourceType(t.source_type);
}
function isOverdue(due?: string, status?: TaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  const d = new Date(due); return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
function isDueToday(due?: string, status?: TaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  const d = new Date(due);
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}
function formatDue(due?: string): string | null {
  if (!due) return null;
  const d = new Date(due); if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((startDue.getTime() - startToday.getTime()) / 86400000);
  if (diff < 0) return `Venceu há ${Math.abs(diff)}d`;
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function confidencePercent(c?: number): number | null {
  if (c === undefined || c === null || Number.isNaN(c)) return null;
  return Math.round(c <= 1 ? c * 100 : c);
}

interface Props {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onOpenConversation: (id: string) => void;
  onClick: () => void;
}

export const ActivityTaskCard: React.FC<Props> = ({ task, onStatusChange, onOpenConversation, onClick }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const overdue = isOverdue(task.due_at, task.status);
  const dueToday = isDueToday(task.due_at, task.status);
  const dueLabel = formatDue(task.due_at);
  const isDimmed = task.status === 'done' || task.status === 'cancelled';
  const sourceType = getSource(task);
  const priority = normalizePriority(task.priority);
  const confidence = confidencePercent(task.ai_confidence);
  const needsReview = confidence !== null && confidence < 65;
  const showPriority = (priority === 'high' || priority === 'urgent') && !isDimmed;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'activity-card-sheen group relative overflow-hidden rounded-lg border bg-surface transition-all duration-200',
        'cursor-pointer select-none',
        'motion-safe:hover:-translate-y-px hover:shadow-md active:scale-[0.995] active:shadow-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        isDimmed && 'opacity-50',
        !isDimmed && overdue && 'border-border border-l-[3px] border-l-red-500/70 shadow-[0_0_0_1px_rgba(239,68,68,0.05)] hover:border-l-red-500',
        !isDimmed && !overdue && dueToday && 'border-border border-l-[3px] border-l-amber-500/60 shadow-[0_0_0_1px_rgba(245,158,11,0.05)] hover:border-l-amber-500',
        !isDimmed && !overdue && !dueToday && 'border-border hover:border-primary/20',
      )}
    >
      {/* Thin gradient line for AI tasks */}
      {task.ai_generated && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
      )}

      <div className="relative flex items-start gap-3 px-4 py-3">
        {/* Status circle – interactive, isolated from card click */}
        <div className="relative mt-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-150',
              'hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              task.status === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
              task.status === 'in_progress' && 'border-amber-400',
              task.status === 'cancelled' && 'border-stone-600',
              task.status === 'open' && 'border-stone-500 hover:border-primary',
            )}
            aria-label="Alterar status da atividade"
          >
            {task.status === 'done' && <CheckCircle2 size={11} />}
            {task.status === 'in_progress' && <div className="h-2 w-2 rounded-full bg-amber-400" />}
            {task.status === 'cancelled' && <X size={9} className="text-stone-500" />}
            {task.status === 'open' && <Circle size={9} className="text-stone-600" />}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-7 z-20 w-44 rounded-lg border border-border bg-surface py-1.5 shadow-2xl">
                {ALL_STATUSES.map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => { onStatusChange(task.id, s); setMenuOpen(false); }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-surface-hover',
                      task.status === s ? 'text-primary' : 'text-text-muted',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full',
                      s === 'open' && 'bg-blue-400',
                      s === 'in_progress' && 'bg-amber-400',
                      s === 'done' && 'bg-emerald-400',
                      s === 'cancelled' && 'bg-stone-500',
                    )} />
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Row 1: title + due date */}
          <div className="flex items-start justify-between gap-3">
            <p className={cn(
              'text-sm font-medium leading-snug',
              isDimmed ? 'line-through text-text-muted' : 'text-primary',
            )}>
              {task.title}
            </p>
            <div className="mt-0.5 flex shrink-0 items-center gap-2">
              {overdue && (
                <span className="rounded-full border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                  Atrasada
                </span>
              )}
              <span className={cn(
                'flex items-center gap-1 font-mono text-[11px] whitespace-nowrap transition-colors',
                overdue ? 'text-red-400' : dueToday ? 'text-amber-400' : 'text-stone-500',
              )}>
                {overdue ? <AlertCircle size={10} /> : <Calendar size={10} />}
                {dueLabel ?? 'Sem prazo'}
              </span>
            </div>
          </div>

          {/* Row 2: source badge + optional badges + meta */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Source badge */}
            <span className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              SOURCE_BADGE[sourceType],
            )}>
              {sourceType === 'ai' && <Bot size={9} />}
              {sourceType === 'followup_trigger' && <Clock size={9} />}
              {sourceType === 'cadence' && <Sparkles size={9} />}
              {SOURCE_LABELS[sourceType]}
            </span>

            {task.ai_generated && (
              <span className="inline-flex items-center gap-1 rounded border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
                <Bot size={9} />IA
              </span>
            )}

            <span className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
              STATUS_BADGE[task.status],
            )}>
              {STATUS_LABELS[task.status]}
            </span>

            {/* "Revisar" - only when AI + low confidence */}
            {task.ai_generated && needsReview && (
              <span className="activity-review-pop inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                <AlertTriangle size={9} />Revisar
              </span>
            )}

            {/* Priority — only for high / urgent */}
            {showPriority && (
              <span className={cn(
                'inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                PRIORITY_BADGE[priority],
              )}>
                <Flag size={8} />{PRIORITY_LABELS[priority]}
              </span>
            )}

            {/* Spacer */}
            <span className="min-w-2 flex-1" />

            {/* Contact name */}
            <span className="flex items-center gap-1 text-[11px] text-stone-500">
              <User size={10} />{task.contact_name ? task.contact_name.split(' ')[0] : 'Contato sem nome'}
            </span>

            {/* Assignee name */}
            {task.assigned_to_name && (
              <span className={cn('flex items-center gap-1 text-[11px] font-medium', getAttendeeTextColor(task.assigned_to_name))}>
                {task.assigned_to_name.split(' ')[0]}
              </span>
            )}

            {/* Conversation link */}
            {task.conversation_id && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onOpenConversation(task.conversation_id!); }}
                className="inline-flex items-center gap-0.5 rounded text-[11px] text-blue-400 transition-colors hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                aria-label="Abrir conversa no Inbox"
              >
                <MessageSquare size={10} /><ExternalLink size={9} />
              </button>
            )}

            <span className="hidden text-[11px] font-medium text-stone-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:inline">
              Ver detalhes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
