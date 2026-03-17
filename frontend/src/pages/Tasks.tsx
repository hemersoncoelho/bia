import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  CheckCircle2,
  Clock,
  X,
  Loader2,
  Calendar,
  User,
  AlertCircle,
  Circle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAttendeeTextColor } from '../utils/attendeeColors';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import type { Task, TaskStatus } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Aberta',
  in_progress: 'Em Andamento',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  open: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  in_progress: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  done: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  cancelled: 'text-stone-500 bg-stone-500/10 border-stone-500/20',
};

const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'cancelled'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dueAt?: string, status?: TaskStatus): boolean {
  if (!dueAt || status === 'done' || status === 'cancelled') return false;
  return new Date(dueAt) < new Date();
}

function formatDue(dueAt?: string): string | null {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Venceu há ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ── TaskStatusIcon ────────────────────────────────────────────────────────────

interface StatusIconProps {
  status: TaskStatus;
  onClick: () => void;
}

const TaskStatusIcon: React.FC<StatusIconProps> = ({ status, onClick }) => {
  const base =
    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer hover:scale-110';

  if (status === 'done')
    return (
      <button onClick={onClick} className={`${base} bg-emerald-500 border-emerald-500 text-white`}>
        <CheckCircle2 size={12} />
      </button>
    );
  if (status === 'in_progress')
    return (
      <button onClick={onClick} className={`${base} border-amber-400`}>
        <div className="w-2 h-2 rounded-full bg-amber-400" />
      </button>
    );
  if (status === 'cancelled')
    return (
      <button onClick={onClick} className={`${base} border-stone-600`}>
        <X size={10} className="text-stone-500" />
      </button>
    );
  return (
    <button onClick={onClick} className={`${base} border-stone-500 hover:border-primary`}>
      <Circle size={10} className="text-stone-600" />
    </button>
  );
};

// ── TaskCard ──────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onStatusChange }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const overdue = isOverdue(task.due_at, task.status);
  const dueLabel = formatDue(task.due_at);

  const isDimmed = task.status === 'done' || task.status === 'cancelled';

  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
        isDimmed
          ? 'border-border opacity-50'
          : overdue
          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
          : 'border-border bg-surface hover:border-border/60'
      }`}
    >
      {/* Status circle */}
      <div className="relative mt-0.5">
        <TaskStatusIcon status={task.status} onClick={() => setMenuOpen((v) => !v)} />

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-7 left-0 z-20 bg-stone-900 border border-stone-700 rounded-lg shadow-2xl py-1.5 w-48 min-w-max">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onStatusChange(task.id, s);
                    setMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-stone-800 flex items-center gap-2.5 ${
                    task.status === s ? 'text-white' : 'text-stone-300'
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      s === 'open'
                        ? 'bg-blue-400'
                        : s === 'in_progress'
                        ? 'bg-amber-400'
                        : s === 'done'
                        ? 'bg-emerald-400'
                        : 'bg-stone-500'
                    }`}
                  />
                  {STATUS_LABELS[s]}
                  {task.status === s && (
                    <span className="ml-auto text-[9px] text-stone-500 font-mono uppercase tracking-wider">atual</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium leading-tight ${
            isDimmed ? 'line-through text-text-muted' : 'text-primary'
          }`}
        >
          {task.title}
        </p>

        {task.description && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">{task.description}</p>
        )}

        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {task.assigned_to_name && (
            <span className={`flex items-center gap-1 text-xs font-medium ${getAttendeeTextColor(task.assigned_to_name)}`}>
              <User size={11} />
              {task.assigned_to_name.split(' ')[0]}
            </span>
          )}
          {task.contact_name && (
            <span className="text-xs text-stone-500">@ {task.contact_name}</span>
          )}
        </div>
      </div>

      {/* Right column: badge + due */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span
          className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide ${STATUS_BADGE[task.status]}`}
        >
          {STATUS_LABELS[task.status]}
        </span>

        {dueLabel && (
          <span
            className={`flex items-center gap-1 text-xs font-mono ${
              overdue ? 'text-red-400' : 'text-text-muted'
            }`}
          >
            {overdue && <AlertCircle size={11} />}
            <Calendar size={11} />
            {dueLabel}
          </span>
        )}
      </div>
    </div>
  );
};

// ── NewTaskModal ──────────────────────────────────────────────────────────────

interface NewTaskModalProps {
  teamMembers: { id: string; full_name: string }[];
  onClose: () => void;
  onCreated: () => void;
  companyId: string;
}

const NewTaskModal: React.FC<NewTaskModalProps> = ({
  teamMembers,
  onClose,
  onCreated,
  companyId,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError('');

    const { error: err } = await supabase.from('tasks').insert({
      company_id: companyId,
      title: title.trim(),
      description: description.trim() || null,
      due_at: dueAt || null,
      assigned_to: assignedTo || null,
      status: 'open',
    });

    if (err) {
      setError('Erro ao criar tarefa. Tente novamente.');
    } else {
      onCreated();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-base font-semibold text-primary">Nova Tarefa</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
              Título *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Ex: Enviar proposta comercial"
              autoFocus
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais..."
              rows={3}
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
                Vencimento
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
                Responsável
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40 transition-colors cursor-pointer"
              >
                <option value="">Sem responsável</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-primary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Criar Tarefa
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Tasks Page ───────────────────────────────────────────────────────────

type FilterStatus = TaskStatus | 'all';

const TAB_LABELS: Record<FilterStatus, string> = {
  all: 'Todas',
  open: 'Abertas',
  in_progress: 'Andamento',
  done: 'Concluídas',
  cancelled: 'Canceladas',
};

export const Tasks: React.FC = () => {
  const { currentCompany } = useTenant();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [showModal, setShowModal] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!currentCompany) return;
    setLoading(true);

    let query = supabase
      .from('tasks')
      .select(
        `
        *,
        assigned_to_profile:assigned_to(full_name),
        contact:contact_id(full_name)
      `
      )
      .eq('company_id', currentCompany.id)
      .order('due_at', { ascending: true, nullsFirst: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (assigneeFilter !== 'all') query = query.eq('assigned_to', assigneeFilter);

    const { data, error } = await query;
    if (!error && data) {
      setTasks(
        data.map((t) => ({
          id: t.id,
          company_id: t.company_id,
          title: t.title,
          description: t.description,
          due_at: t.due_at,
          status: t.status as TaskStatus,
          assigned_to: t.assigned_to,
          assigned_to_name: (t.assigned_to_profile as any)?.full_name,
          contact_id: t.contact_id,
          contact_name: (t.contact as any)?.full_name,
          conversation_id: t.conversation_id,
          deal_id: t.deal_id,
          created_at: t.created_at,
        }))
      );
    }
    setLoading(false);
  }, [currentCompany, statusFilter, assigneeFilter]);

  const fetchTeamMembers = useCallback(async () => {
    if (!currentCompany) return;
    const { data } = await supabase
      .from('user_companies')
      .select('user_id, user_profiles(id, full_name)')
      .eq('company_id', currentCompany.id);

    if (data) {
      setTeamMembers(
        data
          .map((d) => ({
            id: (d.user_profiles as any)?.id as string,
            full_name: ((d.user_profiles as any)?.full_name as string) || 'Usuário',
          }))
          .filter((m) => m.id)
      );
    }
  }, [currentCompany]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await supabase.from('tasks').update({ status }).eq('id', taskId);
  };

  // Counts per status (from unfiltered would be ideal, but for UX it's fine from loaded list)
  const counts = tasks.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const filterTabs: FilterStatus[] = ['all', 'open', 'in_progress', 'done', 'cancelled'];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-primary">Tarefas</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Acompanhe e organize as atividades do time
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nova Tarefa
        </button>
      </div>

      {/* Filters — flex-wrap faz as abas quebrarem em vez de serem cortadas */}
      <div className="px-8 py-3 border-b border-border flex items-center gap-4 shrink-0 flex-wrap bg-surface/40">
        {/* Status tabs — flex-wrap para quebrar em múltiplas linhas quando necessário */}
        <div className="flex items-center gap-1 p-1 bg-stone-900 border border-stone-800 rounded-lg flex-wrap">
          {filterTabs.map((s) => {
            const dotColor =
              s === 'open' ? 'bg-blue-400' :
              s === 'in_progress' ? 'bg-amber-400' :
              s === 'done' ? 'bg-emerald-400' :
              s === 'cancelled' ? 'bg-stone-500' : '';

            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                  statusFilter === s
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                }`}
              >
                {s !== 'all' && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    statusFilter === s ? (
                      s === 'open' ? 'bg-blue-500' :
                      s === 'in_progress' ? 'bg-amber-500' :
                      s === 'done' ? 'bg-emerald-500' : 'bg-stone-400'
                    ) : dotColor
                  }`} />
                )}
                {TAB_LABELS[s]}
                {s !== 'all' && counts[s] ? (
                  <span className={`text-[10px] font-mono px-1 rounded shrink-0 ${
                    statusFilter === s ? 'text-stone-600' : 'text-stone-600 bg-stone-800'
                  }`}>
                    {counts[s]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Assignee filter */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <User size={13} className="text-stone-500 shrink-0" />
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="bg-stone-900 border border-stone-700 text-sm text-stone-200 rounded-md px-3 py-1.5 outline-none focus:border-stone-500 cursor-pointer transition-colors"
          >
            <option value="all">Todos os responsáveis</option>
            {user && <option value={user.id}>Minhas tarefas</option>}
            {teamMembers
              .filter((m) => m.id !== user?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-surface rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <CheckCircle2 size={40} className="text-stone-700 mb-4" />
            <p className="text-primary font-medium">Nenhuma tarefa encontrada</p>
            <p className="text-sm text-text-muted mt-1">
              {statusFilter === 'all'
                ? 'Crie uma nova tarefa para começar'
                : `Nenhuma tarefa com status "${TAB_LABELS[statusFilter]}"`}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl">
            {/* Group overdue first */}
            {tasks.some((t) => isOverdue(t.due_at, t.status)) && (
              <div className="flex items-center gap-3 mb-4 mt-2">
                <AlertCircle size={13} className="text-red-400" />
                <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
                  Vencidas
                </span>
                <div className="flex-1 h-px bg-red-500/20" />
              </div>
            )}
            {tasks
              .filter((t) => isOverdue(t.due_at, t.status))
              .map((t) => (
                <TaskCard key={t.id} task={t} onStatusChange={handleStatusChange} />
              ))}

            {tasks.some((t) => isOverdue(t.due_at, t.status)) &&
              tasks.some((t) => !isOverdue(t.due_at, t.status)) && (
                <div className="flex items-center gap-3 mt-6 mb-4">
                  <Clock size={13} className="text-text-muted" />
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    Próximas
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

            {tasks
              .filter((t) => !isOverdue(t.due_at, t.status))
              .map((t) => (
                <TaskCard key={t.id} task={t} onStatusChange={handleStatusChange} />
              ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && currentCompany && (
        <NewTaskModal
          companyId={currentCompany.id}
          teamMembers={teamMembers}
          onClose={() => setShowModal(false)}
          onCreated={fetchTasks}
        />
      )}
    </div>
  );
};
