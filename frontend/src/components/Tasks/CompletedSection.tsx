import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Task } from '../../types';

function completionTime(task: Task): number {
  return new Date(task.updated_at ?? task.created_at).getTime();
}

function formatRelative(iso?: string): string {
  if (!iso) return 'sem data';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'sem data';
  const diff = Math.max(0, Date.now() - time);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (d > 0) return `há ${d}d`;
  if (h > 0) return `há ${h}h`;
  if (m > 0) return `há ${m}m`;
  return 'agora';
}

interface CompletedSectionProps {
  tasks: Task[];
  onTaskClick: (t: Task) => void;
}

export const CompletedSection: React.FC<CompletedSectionProps> = ({ tasks, onTaskClick }) => {
  const [open, setOpen] = useState(false);

  const completedTasks = useMemo(() => (
    tasks
      .filter(t => t.status === 'done')
      .slice()
      .sort((a, b) => completionTime(b) - completionTime(a))
  ), [tasks]);

  const today = useMemo(() => {
    const todayStr = new Date().toDateString();
    return completedTasks.filter(t => t.updated_at && new Date(t.updated_at).toDateString() === todayStr).length;
  }, [completedTasks]);

  return (
    <section className="rounded-xl border border-emerald-500/15 bg-surface px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
        aria-expanded={open}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 size={12} />
        </span>
        <span className="text-xs font-semibold text-primary">Concluídas</span>
        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
          {completedTasks.length}
        </span>
        <span className="ml-auto rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          {today} hoje
        </span>
        {open ? <ChevronUp size={13} className="text-stone-500" /> : <ChevronDown size={13} className="text-stone-500" />}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {completedTasks.slice(0, 5).map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => onTaskClick(task)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left transition-all duration-200 hover:translate-x-px hover:border-emerald-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
            >
              <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{task.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-stone-500">{formatRelative(task.updated_at ?? task.created_at)}</span>
              {task.contact_name && (
                <span className="shrink-0 truncate text-[10px] text-stone-500">{task.contact_name}</span>
              )}
            </button>
          ))}
          {completedTasks.length === 0 && (
            <p className="py-2 text-center text-[11px] text-stone-500">Nenhuma tarefa concluída</p>
          )}
        </div>
      )}
    </section>
  );
};
