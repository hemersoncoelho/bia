import React, { useState } from 'react';
import {
  Flame, Sparkles, Timer, Calendar,
  MessageSquare, ChevronDown, ChevronUp, User,
  Pencil, Plus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Task, TaskStatus, AiFollowupDecision } from '../../types';
import { CompletedSection } from './CompletedSection';

// ── helpers ──────────────────────────────────────────────────────────────────
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
function formatFuture(iso?: string): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return 'Hoje';
}
function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-primary">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
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

// ── AgoraItem — single-line compact ──────────────────────────────────────────
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
      {/* Status button */}
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

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{task.title}</span>

      {/* Overdue badge */}
      {overdue && (
        <span className="shrink-0 rounded border border-rose-500/30 bg-rose-500/10 px-1 py-px font-mono text-[9px] font-semibold uppercase text-rose-400">
          {formatRelative(task.due_at)}
        </span>
      )}

      {/* Meta: contact · assignee */}
      {(task.contact_name ?? task.assigned_to_name) && (
        <span className="shrink-0 flex items-center gap-1 text-[10px] text-stone-500">
          <User size={8} />
          {[task.contact_name?.split(' ')[0], task.assigned_to_name?.split(' ')[0]].filter(Boolean).join(' · ')}
        </span>
      )}

      {/* Actions */}
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


// ── IASuggestion — compact ────────────────────────────────────────────────────
interface IASuggestionProps {
  decision: AiFollowupDecision;
  agentName: string;
  onAccept: (id: string) => void;
  onDiscard: (id: string) => void;
}
const IASuggestion: React.FC<IASuggestionProps> = ({ decision, agentName, onAccept, onDiscard }) => {
  const pct = decision.confidence !== undefined
    ? Math.round((decision.confidence ?? 0) <= 1 ? (decision.confidence ?? 0) * 100 : (decision.confidence ?? 0))
    : null;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.03] px-2.5 py-2 transition-all duration-200 hover:border-violet-500/35">
      {/* Header row */}
      <div className="mb-1.5 flex items-center gap-1.5">
        {/* Mini avatar */}
        <div className="relative h-5 w-5 shrink-0">
          <div className="spin-halo absolute inset-0 rounded-full opacity-35"
            style={{ background: 'conic-gradient(from 0deg, rgba(167,139,250,0.8), rgba(34,211,238,0.4), rgba(167,139,250,0.8))' }} />
          <div className="absolute inset-[2px] flex items-center justify-center rounded-full bg-surface">
            <Sparkles size={8} className="text-violet-400" />
          </div>
        </div>
        <span className="text-[11px] font-semibold text-violet-300">{agentName}</span>
        {pct !== null && (
          <span className="ml-auto font-mono text-[10px] font-semibold"
            style={{ color: pct >= 80 ? '#34d399' : pct >= 65 ? '#fbbf24' : '#f87171' }}>
            {pct}%
          </span>
        )}
      </div>

      {/* Text (2 lines max) */}
      <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-text-muted">
        {decision.recommended_action ? renderBold(decision.recommended_action) : 'Ação recomendada pela IA.'}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onAccept(decision.id)}
          className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300 transition-colors hover:bg-violet-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40">
          Aceitar
        </button>
        <button type="button" onClick={() => onDiscard(decision.id)}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none">
          Descartar
        </button>
      </div>
    </div>
  );
};

// ── ProgressItem — compact ────────────────────────────────────────────────────
const ProgressItem: React.FC<{ task: Task; onEditTask: () => void; onClick: () => void }> = ({ task, onEditTask, onClick }) => {
  const pct = progressPct(task);
  const isAi = task.ai_generated;
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
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-stone-500">
          <span className={cn('rounded border px-1 font-mono uppercase tracking-wide text-[9px]',
            isAi ? 'border-violet-500/25 text-violet-400' : 'border-stone-500/25 text-stone-500')}>
            {isAi ? 'IA' : 'Manual'}
          </span>
          {task.assigned_to_name && <span>{task.assigned_to_name.split(' ')[0]}</span>}
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

// ── NextItem — compact single line ────────────────────────────────────────────
const NextItem: React.FC<{ task: Task; onEditTask: () => void; onClick: () => void }> = ({ task, onEditTask, onClick }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
    className="group flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 cursor-pointer transition-all duration-200 hover:translate-x-px focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
  >
    <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-stone-500" />
    <p className="min-w-0 flex-1 truncate text-xs text-primary">{task.title}</p>
    {(task.contact_name ?? task.assigned_to_name) && (
      <span className="shrink-0 text-[10px] text-stone-500">
        {[task.contact_name?.split(' ')[0], task.assigned_to_name?.split(' ')[0]].filter(Boolean).join(' · ')}
      </span>
    )}
    {task.due_at && (
      <span className="shrink-0 font-mono text-[10px] text-stone-500">{formatFuture(task.due_at)}</span>
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
      <button
        type="button"
        aria-label="Ver tarefa"
        onClick={e => { e.stopPropagation(); onClick(); }}
        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 transition-colors hover:bg-surface-hover hover:text-primary focus:outline-none"
      >
        Ver
      </button>
    </div>
  </div>
);

// ── Typing dots ───────────────────────────────────────────────────────────────
const TypingDots: React.FC = () => (
  <div className="flex items-center gap-0.5" aria-label="IA processando">
    {[0,1,2].map(i => <span key={i} className="typing-dot h-1 w-1 rounded-full bg-violet-400" />)}
  </div>
);

// ── Empty ─────────────────────────────────────────────────────────────────────
const EmptySlot: React.FC<{ label: string; onAddTask?: () => void }> = ({ label, onAddTask }) => (
  <div className="flex flex-col items-center gap-2 py-3 text-center">
    <p className="text-[11px] text-stone-500">{label}</p>
    {onAddTask && (
      <button
        type="button"
        onClick={onAddTask}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:border-primary/25 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Plus size={11} />
        Adicionar tarefa
      </button>
    )}
  </div>
);

// ── Main export ───────────────────────────────────────────────────────────────
export interface BentoProps {
  tasks: Task[];
  aiDecisions: AiFollowupDecision[];
  agentName?: string;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onOpenConversation: (id: string) => void;
  onTaskClick: (t: Task) => void;
  onEditTask: (t: Task) => void;
  onAcceptDecision: (id: string) => void;
  onDiscardDecision: (id: string) => void;
  onAddTask?: () => void;
}

export const MissionControlBento: React.FC<BentoProps> = ({
  tasks, aiDecisions, agentName, onStatusChange, onOpenConversation, onTaskClick, onEditTask, onAcceptDecision, onDiscardDecision, onAddTask,
}) => {
  const displayAgentName = agentName || 'IA';
  const nowTasks = tasks.filter(t =>
    t.status !== 'done' && t.status !== 'cancelled' &&
    (t.priority === 'urgent' || isOverdue(t.due_at, t.status))
  );
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const nextTasks = tasks.filter(t =>
    t.status === 'open' && !isOverdue(t.due_at, t.status) && t.priority !== 'urgent'
  );

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {/* Card 1 — Agora */}
      <BentoCard
        title="Agora · precisa de você"
        icon={<Flame size={12} className="text-rose-400" />}
        count={nowTasks.length}
        delay={0}
        accentClass="bg-rose-500/10"
        borderClass="border-rose-500/20"
        glowStyle={{ background: 'radial-gradient(ellipse at top left, rgba(244,63,94,0.05), transparent 55%)' }}
      >
        {nowTasks.length === 0 ? <EmptySlot label="Nenhuma atividade urgente agora" onAddTask={onAddTask} /> : (
          <ExpandableList items={nowTasks} initial={3} accentColor="#f43f5e"
            renderItem={t => <AgoraItem task={t} onStatusChange={onStatusChange} onOpenConversation={onOpenConversation} onEditTask={() => onEditTask(t)} onClick={() => onTaskClick(t)} />} />
        )}
      </BentoCard>

      {/* Card 2 — IA Agent */}
      <BentoCard
        title={`IA · ${displayAgentName} sugere`}
        icon={<Sparkles size={12} className="text-violet-400" />}
        count={aiDecisions.length}
        delay={60}
        accentClass="bg-violet-500/10"
        borderClass="border-violet-500/20"
        glowStyle={{ background: 'radial-gradient(ellipse at top right, rgba(167,139,250,0.05), transparent 55%)' }}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <TypingDots />
          <span className="text-[10px] text-stone-500">analisando conversas…</span>
        </div>
        {aiDecisions.length === 0 ? <EmptySlot label="Nenhuma sugestão pendente" /> : (
          <ExpandableList items={aiDecisions} initial={2} accentColor="#a78bfa"
            renderItem={d => <IASuggestion decision={d} agentName={displayAgentName} onAccept={onAcceptDecision} onDiscard={onDiscardDecision} />} />
        )}
      </BentoCard>

      {/* Card 3 — Em andamento */}
      <BentoCard
        title="Em andamento"
        icon={<Timer size={12} className="text-amber-400" />}
        count={inProgressTasks.length}
        delay={120}
        accentClass="bg-amber-500/10"
      >
        {inProgressTasks.length === 0 ? <EmptySlot label="Nenhuma tarefa em andamento" /> : (
          <ExpandableList items={inProgressTasks} initial={2} accentColor="#fbbf24"
            renderItem={t => <ProgressItem task={t} onEditTask={() => onEditTask(t)} onClick={() => onTaskClick(t)} />} />
        )}
      </BentoCard>

      {/* Card 4 — Próximas */}
      <BentoCard
        title="Próximas"
        icon={<Calendar size={12} className="text-stone-400" />}
        count={nextTasks.length}
        delay={180}
        accentClass="bg-stone-500/10"
      >
        {nextTasks.length === 0 ? <EmptySlot label="Nenhuma tarefa agendada" onAddTask={onAddTask} /> : (
          <ExpandableList items={nextTasks} initial={2} accentColor="#22d3ee"
            renderItem={t => <NextItem task={t} onEditTask={() => onEditTask(t)} onClick={() => onTaskClick(t)} />} />
        )}
      </BentoCard>
      </div>

      <CompletedSection tasks={tasks} onTaskClick={onTaskClick} />
    </div>
  );
};
