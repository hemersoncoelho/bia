import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame, Timer,
  MessageSquare, ChevronDown, ChevronUp, User,
  Pencil, Plus, Layers, Clock, Send,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import type { Task, TaskStatus, AgentOperation, CadenceTemplate, CadenceEvent } from '../../types';
import { CompletedSection } from './CompletedSection';
import { AgentBadgeMini } from './AgentBadgeMini';
import { AutopilotCard } from './AutopilotCard';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRelative(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `Venceu há ${d}d`;
  if (h > 0) return `Há ${h}h`;
  if (m > 0) return `Há ${m}m`;
  return 'Agora';
}
function isOverdue(due?: string, status?: TaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  return new Date(due).getTime() < Date.now();
}
function progressPct(task: Task): number {
  if (task.status === 'done') return 100;
  if (task.status === 'in_progress') {
    const c = task.ai_confidence;
    return c ? Math.round(Number(c) <= 1 ? Number(c) * 100 : Number(c)) : 45;
  }
  return 0;
}

function isAgentTask(task: Task): boolean {
  return (
    task.ai_generated === true ||
    task.source_type === 'ai' ||
    task.source_type === 'followup_trigger' ||
    task.source_type === 'cadence'
  );
}

// ── ExpandableList ────────────────────────────────────────────────────────────
interface ExpandableListProps<T> {
  items: T[];
  initial?: number;
  renderItem: (item: T, idx: number) => React.ReactNode;
  accentColor?: string;
}
function ExpandableList<T>({ items, initial = 3, renderItem, accentColor = '#22d3ee' }: ExpandableListProps<T>) {
  const [open, setOpen] = useState(false);
  const visible = open ? items : items.slice(0, initial);
  const hidden = items.length - initial;
  return (
    <div className="flex flex-col gap-1">
      {visible.map((it, i) => (
        <div key={i} className="task-card-animate" style={{ animationDelay: `${i * 35}ms` }}>
          {renderItem(it, i)}
        </div>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="mt-0.5 flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-[11px] font-medium text-stone-500 transition-all duration-200 hover:border-solid hover:text-primary"
        >
          {open ? <><ChevronUp size={11} />Mostrar menos</> : (
            <><ChevronDown size={11} />Ver mais
              <span className="rounded px-1 font-mono text-[10px] font-semibold" style={{ background: 'rgba(34,211,238,0.1)', color: accentColor }}>+{hidden}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── BentoCard ─────────────────────────────────────────────────────────────────
interface BentoCardProps {
  title: string;
  icon: React.ReactNode;
  count?: number;
  delay?: number;
  accentClass?: string;
  borderClass?: string;
  glowStyle?: React.CSSProperties;
  children: React.ReactNode;
}
const BentoCard: React.FC<BentoCardProps> = ({
  title, icon, count, delay = 0, accentClass, borderClass, glowStyle, children,
}) => (
  <div
    className={cn(
      'bento-card-animate relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-surface px-3 py-3',
      borderClass ?? 'border-border',
    )}
    style={{ animationDelay: `${delay}ms` }}
  >
    {glowStyle && <div className="pointer-events-none absolute inset-0 opacity-30" style={glowStyle} />}
    <div className="relative flex items-center gap-1.5">
      <span className={cn('flex h-5 w-5 items-center justify-center rounded', accentClass)}>
        {icon}
      </span>
      <span className="text-xs font-semibold text-primary">{title}</span>
      {count !== undefined && count > 0 && (
        <span className="ml-auto font-mono text-[10px] tabular-nums text-stone-500">{count} pendentes</span>
      )}
    </div>
    <div className="relative">{children}</div>
  </div>
);

// ── AgoraItem ─────────────────────────────────────────────────────────────────
interface AgoraItemProps {
  task: Task;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onOpenConversation: (id: string) => void;
  onEditTask: () => void;
  onClick: () => void;
}
const AgoraItem: React.FC<AgoraItemProps> = ({ task, onStatusChange, onOpenConversation, onEditTask, onClick }) => {
  const overdue = isOverdue(task.due_at, task.status);
  const isUrgent = task.priority === 'urgent';
  const isInProgress = task.status === 'in_progress';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all duration-200',
        'hover:translate-x-px focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40',
        isUrgent && 'border-rose-500/25 bg-rose-500/[0.03]',
        !isUrgent && overdue && 'border-amber-500/25 bg-amber-500/[0.03]',
        !isUrgent && !overdue && 'border-border',
      )}
    >
      <button
        type="button"
        aria-label="Alterar status"
        onClick={e => { e.stopPropagation(); onStatusChange(task.id, task.status === 'done' ? 'open' : 'done'); }}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110 focus:outline-none',
          isUrgent ? 'border-rose-500' : overdue ? 'border-amber-400' : 'border-stone-500',
        )}
      >
        {isInProgress && <span className={cn('h-1.5 w-1.5 rounded-full', isUrgent ? 'bg-rose-400' : 'bg-amber-400')} />}
      </button>

      <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{task.title}</span>

      {isAgentTask(task) && <AgentBadgeMini />}

      {overdue && (
        <span className="shrink-0 rounded border border-rose-500/30 bg-rose-500/10 px-1 py-px font-mono text-[9px] font-semibold uppercase text-rose-400">
          {formatRelative(task.due_at)}
        </span>
      )}

      {(task.contact_name ?? task.assigned_to_name) && (
        <span className="shrink-0 flex items-center gap-1 text-[10px] text-stone-500">
          <User size={8} />
          {[task.contact_name?.split(' ')[0], task.assigned_to_name?.split(' ')[0]].filter(Boolean).join(' · ')}
        </span>
      )}

      <div className="shrink-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Editar tarefa"
          onClick={e => { e.stopPropagation(); onEditTask(); }}
          className="rounded p-0.5 text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none"
        >
          <Pencil size={11} />
        </button>
        {task.conversation_id && (
          <button
            type="button"
            aria-label="Abrir conversa"
            onClick={e => { e.stopPropagation(); onOpenConversation(task.conversation_id!); }}
            className="rounded p-0.5 text-blue-400 transition-colors hover:bg-blue-400/10 focus:outline-none"
          >
            <MessageSquare size={11} />
          </button>
        )}
        <button
          type="button"
          aria-label="Atender"
          onClick={e => { e.stopPropagation(); onClick(); }}
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none',
            isUrgent ? 'text-rose-400 hover:bg-rose-400/10' : 'text-stone-500 hover:bg-surface-hover hover:text-primary',
          )}
        >
          {isUrgent ? 'Atender' : task.status === 'in_progress' ? 'Concluir' : 'Ver'}
        </button>
      </div>
    </div>
  );
};

// ── ProgressItem ──────────────────────────────────────────────────────────────
const ProgressItem: React.FC<{ task: Task; onEditTask: () => void; onClick: () => void }> = ({ task, onEditTask, onClick }) => {
  const pct = progressPct(task);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
      className="group rounded-lg border border-border px-2.5 py-2 cursor-pointer transition-all duration-200 hover:translate-x-px focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{task.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {isAgentTask(task) ? <AgentBadgeMini /> : (
            <span className="rounded border border-stone-500/25 px-1 font-mono text-[9px] uppercase tracking-wide text-stone-500">Manual</span>
          )}
          {task.assigned_to_name && <span className="text-[10px] text-stone-500">{task.assigned_to_name.split(' ')[0]}</span>}
        </div>
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            aria-label="Editar tarefa"
            onClick={e => { e.stopPropagation(); onEditTask(); }}
            className="rounded p-0.5 text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            aria-label="Ver tarefa"
            onClick={e => { e.stopPropagation(); onClick(); }}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none"
          >
            Ver
          </button>
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-amber-400">{pct}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-amber-500/15">
        <div className="progress-shimmer h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }}
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
      </div>
    </div>
  );
};

// ── EmptySlot ─────────────────────────────────────────────────────────────────
const EmptySlot: React.FC<{ label: string; onAddTask?: () => void }> = ({ label, onAddTask }) => (
  <div className="flex flex-col items-center gap-2 py-3 text-center">
    <p className="text-[11px] text-stone-500">{label}</p>
    {onAddTask && (
      <button
        type="button"
        onClick={onAddTask}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:border-primary/25 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Plus size={11} />Adicionar tarefa
      </button>
    )}
  </div>
);

// ── CadenceBentoCard ──────────────────────────────────────────────────────────
function formatScheduled(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const hrs = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);
  if (diff < 0) return 'atrasado';
  if (mins < 60) return `em ${mins}min`;
  if (hrs < 24) return `em ${hrs}h`;
  if (days === 1) return 'amanhã';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface CadenceBentoCardProps {
  companyId: string;
  cadences: CadenceTemplate[];
  onOpenCadences: () => void;
  delay?: number;
}

const CadenceBentoCard: React.FC<CadenceBentoCardProps> = ({ companyId, cadences, onOpenCadences, delay = 0 }) => {
  const [events, setEvents] = useState<CadenceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const activeCount = cadences.filter(c => c.status === 'active').length;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('rpc_get_cadence_events_for_company', {
      p_company_id: companyId,
      p_status:     ['pending', 'processing'],
      p_limit:      10,
      p_offset:     0,
    });
    const result = data as { success: boolean; events: CadenceEvent[] } | null;
    setEvents(result?.events ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  const visible = expanded ? events : events.slice(0, 3);
  const hidden = events.length - 3;

  return (
    <div
      className="bento-card-animate relative flex flex-col gap-2 overflow-hidden rounded-xl border border-cyan-500/20 bg-surface px-3 py-3"
      style={{
        animationDelay: `${delay}ms`,
        background: 'radial-gradient(ellipse at top right, rgba(34,211,238,0.04), transparent 55%)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-cyan-500/10">
          <Layers size={12} className="text-cyan-400" />
        </span>
        <span className="text-xs font-semibold text-primary">Cadências</span>
        {activeCount > 0 && (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 motion-safe:animate-pulse" aria-hidden="true" />
            <span className="ml-0.5 font-mono text-[10px] tabular-nums text-stone-500">
              {activeCount} {activeCount === 1 ? 'ativa' : 'ativas'}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={onOpenCadences}
          className="ml-auto text-[10px] font-medium text-stone-500 transition-colors hover:text-cyan-400 focus:outline-none"
        >
          ver todas →
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-1.5 py-1">
          {[1, 2].map(i => (
            <div key={i} className="h-9 animate-pulse rounded-lg border border-border bg-surface-hover/40" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-3 text-center">
          {activeCount === 0 ? (
            <>
              <p className="text-[11px] text-stone-500">Nenhuma cadência ativa.</p>
              <button
                type="button"
                onClick={onOpenCadences}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:border-cyan-500/25 hover:text-cyan-400 focus:outline-none"
              >
                <Plus size={11} />Criar cadência
              </button>
            </>
          ) : (
            <p className="text-[11px] text-stone-500">Nenhuma mensagem agendada.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {visible.map((evt, i) => (
            <div
              key={evt.id}
              className="task-card-animate flex items-start gap-2 rounded-lg border border-border px-2.5 py-2"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <Send size={11} className="mt-0.5 shrink-0 text-cyan-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-primary">
                  {evt.contact_name ?? 'Contato'}
                </p>
                <p className="truncate text-[10px] text-stone-500 leading-snug">
                  {evt.message_body}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="flex items-center gap-0.5 font-mono text-[9px] text-cyan-400">
                  <Clock size={8} />
                  {formatScheduled(evt.scheduled_at)}
                </span>
                {evt.step_name && (
                  <p className="mt-0.5 text-[9px] text-stone-600 truncate max-w-[80px]">{evt.step_name}</p>
                )}
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="flex items-center justify-center gap-1 rounded-md border border-dashed border-cyan-500/20 py-1 text-[11px] font-medium text-stone-500 transition-all hover:border-solid hover:border-cyan-500/30 hover:text-cyan-400 focus:outline-none"
            >
              {expanded
                ? <><ChevronUp size={11} />Mostrar menos</>
                : <><ChevronDown size={11} />Ver mais
                  <span className="rounded px-1 font-mono text-[10px] font-semibold bg-cyan-500/10 text-cyan-400">+{hidden}</span>
                </>
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface BentoProps {
  companyId: string;
  tasks: Task[];
  agentOperations: AgentOperation[];
  autopilotEnabled: boolean;
  activeCadences: CadenceTemplate[];
  onToggleAutopilot: () => void;
  onOpenCadences: () => void;
  onUpdateOperationMessage: (id: string, message: string) => Promise<{ success: boolean; error?: string }>;
  onRescheduleOperation: (id: string, sendAt: string) => Promise<{ success: boolean; error?: string }>;
  onSnoozeOperation: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCancelOperation: (id: string) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onOpenConversation: (id: string) => void;
  onTaskClick: (t: Task) => void;
  onEditTask: (t: Task) => void;
  onAddTask?: () => void;
}

// ── Main export ───────────────────────────────────────────────────────────────
export const MissionControlBento: React.FC<BentoProps> = ({
  companyId,
  tasks,
  agentOperations,
  autopilotEnabled,
  activeCadences,
  onToggleAutopilot,
  onOpenCadences,
  onUpdateOperationMessage,
  onRescheduleOperation,
  onSnoozeOperation,
  onCancelOperation,
  onStatusChange,
  onOpenConversation,
  onTaskClick,
  onEditTask,
  onAddTask,
}) => {
  const nowTasks = tasks.filter(t =>
    t.status !== 'done' && t.status !== 'cancelled' &&
    (t.priority === 'urgent' || isOverdue(t.due_at, t.status)),
  );
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">

        {/* Row 1 — Autopilot | Cadências */}
        <AutopilotCard
          operations={agentOperations}
          autopilotEnabled={autopilotEnabled}
          onToggleAutopilot={onToggleAutopilot}
          onUpdateMessage={onUpdateOperationMessage}
          onReschedule={onRescheduleOperation}
          onSnooze={onSnoozeOperation}
          onCancel={onCancelOperation}
          delay={0}
        />

        <CadenceBentoCard
          companyId={companyId}
          cadences={activeCadences}
          onOpenCadences={onOpenCadences}
          delay={60}
        />

        {/* Row 2 — Agora | Em andamento */}
        <BentoCard
          title="Agora · precisa de você"
          icon={<Flame size={12} className="text-rose-400" />}
          count={nowTasks.length}
          delay={120}
          accentClass="bg-rose-500/10"
          borderClass="border-rose-500/20"
          glowStyle={{ background: 'radial-gradient(ellipse at top left, rgba(244,63,94,0.05), transparent 55%)' }}
        >
          {nowTasks.length === 0
            ? <EmptySlot label="Nenhuma atividade urgente agora" onAddTask={onAddTask} />
            : (
              <ExpandableList items={nowTasks} initial={3} accentColor="#f43f5e"
                renderItem={t => (
                  <AgoraItem
                    task={t}
                    onStatusChange={onStatusChange}
                    onOpenConversation={onOpenConversation}
                    onEditTask={() => onEditTask(t)}
                    onClick={() => onTaskClick(t)}
                  />
                )}
              />
            )}
        </BentoCard>

        <BentoCard
          title="Em andamento"
          icon={<Timer size={12} className="text-amber-400" />}
          count={inProgressTasks.length}
          delay={180}
          accentClass="bg-amber-500/10"
        >
          {inProgressTasks.length === 0
            ? <EmptySlot label="Nenhuma tarefa em andamento" />
            : (
              <ExpandableList items={inProgressTasks} initial={2} accentColor="#fbbf24"
                renderItem={t => (
                  <ProgressItem
                    task={t}
                    onEditTask={() => onEditTask(t)}
                    onClick={() => onTaskClick(t)}
                  />
                )}
              />
            )}
        </BentoCard>
      </div>

      <CompletedSection tasks={tasks} onTaskClick={onTaskClick} />
    </div>
  );
};
