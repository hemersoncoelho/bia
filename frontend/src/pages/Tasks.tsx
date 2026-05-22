import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, Layers, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { useAgentOperations } from '../hooks/useAgentOperations';
import { ActivityDetailDrawer } from '../components/Tasks/ActivityDetailDrawer';
import { NewTaskModal } from '../components/Tasks/NewTaskModal';
import { CadenceList } from '../components/Tasks/CadenceList';
import { CadenceWizard } from '../components/Tasks/CadenceWizard';
import { StatsStrip } from '../components/Tasks/StatsStrip';
import type { StatsStripData } from '../components/Tasks/StatsStrip';
import { MissionControlBento } from '../components/Tasks/MissionControlBento';
import type { Task, TaskStatus, TaskPriority, TaskSourceType } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
type MainTab = 'atividades' | 'cadencias';

type SupabaseRelation<T> = T | T[] | null | undefined;
type NameRelation = { id?: string | null; full_name?: string | null };
type TaskRow = {
  id: string; company_id: string; title: string; description?: string | null;
  due_at?: string | null; status: TaskStatus; priority?: string | null;
  source_type?: string | null; source_id?: string | null; assigned_to?: string | null;
  assigned_to_profile?: SupabaseRelation<NameRelation>; assigned_agent_id?: string | null;
  contact_id?: string | null; contact?: SupabaseRelation<NameRelation>;
  conversation_id?: string | null; deal_id?: string | null; ai_generated?: boolean | null;
  ai_confidence?: number | string | null; ai_reason?: string | null;
  recommended_message?: string | null; metadata?: unknown; created_by?: string | null;
  created_at: string; updated_at?: string | null;
};
type TeamMemberRow = { user_profiles?: SupabaseRelation<NameRelation> };

// ── Helpers ───────────────────────────────────────────────────────────────────
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function firstRelation<T>(v: SupabaseRelation<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
function normalizePriority(v: unknown): TaskPriority {
  const valid: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskPriority) : 'normal';
}
function normalizeSource(v: unknown): TaskSourceType {
  const valid: TaskSourceType[] = ['manual', 'ai', 'followup_trigger', 'cadence', 'appointment', 'inbox', 'system'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskSourceType) : 'manual';
}
function isOverdue(due?: string, status?: TaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  const d = new Date(due);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
function mapTask(row: TaskRow): Task {
  const conf = row.ai_confidence === null || row.ai_confidence === undefined
    ? undefined : Number(row.ai_confidence);
  return {
    id: row.id, company_id: row.company_id, title: row.title,
    description: row.description ?? undefined, due_at: row.due_at ?? undefined,
    status: row.status, priority: normalizePriority(row.priority),
    source_type: normalizeSource(row.source_type), source_id: row.source_id ?? undefined,
    assigned_to: row.assigned_to ?? undefined,
    assigned_to_name: firstRelation(row.assigned_to_profile)?.full_name ?? undefined,
    assigned_agent_id: row.assigned_agent_id ?? undefined,
    contact_id: row.contact_id ?? undefined,
    contact_name: firstRelation(row.contact)?.full_name ?? undefined,
    conversation_id: row.conversation_id ?? undefined, deal_id: row.deal_id ?? undefined,
    ai_generated: Boolean(row.ai_generated),
    ai_confidence: Number.isNaN(conf) ? undefined : conf,
    ai_reason: row.ai_reason ?? undefined, recommended_message: row.recommended_message ?? undefined,
    metadata: isRecord(row.metadata) ? row.metadata : undefined,
    created_by: row.created_by ?? undefined, created_at: row.created_at, updated_at: row.updated_at ?? undefined,
  };
}

function computeStats(
  tasks: Task[],
  operationsInQueue: number,
  operationsExecutedToday: number,
): StatsStripData {
  const todayStr = new Date().toDateString();
  const completedToday = tasks.filter(t =>
    t.status === 'done' && t.updated_at && new Date(t.updated_at).toDateString() === todayStr,
  ).length;
  const doneTasks = tasks.filter(t => t.status === 'done' && t.updated_at && t.created_at);
  const avgMs = doneTasks.length
    ? doneTasks.reduce((s, t) => s + (new Date(t.updated_at!).getTime() - new Date(t.created_at).getTime()), 0) / doneTasks.length
    : 0;
  const avgMinutes = Math.max(1, Math.round(avgMs / 60000));
  const overdueCount = tasks.filter(t => isOverdue(t.due_at, t.status)).length;
  const pct = Math.min(100, Math.max(0, completedToday > 0 && tasks.length > 0
    ? Math.round((completedToday / Math.max(tasks.filter(t => t.status !== 'cancelled').length, 1)) * 100)
    : completedToday));
  return {
    completedToday: pct,
    avgMinutes: Math.min(avgMinutes, 999),
    overdue: overdueCount,
    operationsInQueue,
    operationsExecutedToday,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export const Tasks: React.FC = () => {
  const { currentCompany } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = currentCompany?.id ?? null;

  const [mainTab, setMainTab] = useState<MainTab>('atividades');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── Operações do agente (Autopilot) ────────────────────────────────────────
  const {
    operations: agentOperations,
    operationsInQueue,
    operationsExecutedToday,
    autopilotEnabled,
    updateMessage: updateOperationMessage,
    reschedule: rescheduleOperation,
    snooze: snoozeOperation,
    cancel: cancelOperation,
    toggleAutopilot,
  } = useAgentOperations(companyId);

  // ── Fetch de tarefas ──────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!companyId) { setTasks([]); setLoadedCompanyId(null); setLoading(false); return; }
    setLoading(true);
    setLoadedCompanyId(companyId);

    const { data } = await supabase
      .from('tasks')
      .select('*, assigned_to_profile:assigned_to(full_name), contact:contact_id(full_name)')
      .eq('company_id', companyId)
      .in('status', ['open', 'in_progress', 'done'])
      .order('due_at', { ascending: true, nullsFirst: false });

    setTasks(((data ?? []) as TaskRow[]).map(mapTask));
    setLoading(false);
  }, [companyId]);

  const fetchTasksRef = useRef(fetchTasks);
  useEffect(() => { fetchTasksRef.current = fetchTasks; });

  const fetchTeamMembers = useCallback(async () => {
    if (!companyId) { setTeamMembers([]); return; }
    const { data } = await supabase.from('user_companies')
      .select('user_id, user_profiles(id, full_name)').eq('company_id', companyId);
    setTeamMembers(((data ?? []) as TeamMemberRow[])
      .map(d => ({ id: firstRelation(d.user_profiles)?.id ?? '', full_name: firstRelation(d.user_profiles)?.full_name || 'Usuário' }))
      .filter(m => m.id));
  }, [companyId]);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);
  useEffect(() => { void fetchTeamMembers(); }, [fetchTeamMembers]);

  // Realtime para tarefas
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`tasks-rt-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `company_id=eq.${companyId}` },
        () => { void fetchTasksRef.current(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ── Mutações de tarefas ───────────────────────────────────────────────────
  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!companyId) return;
    const prev = tasks.find(t => t.id === taskId);
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status } : t));
    if (selectedTask?.id === taskId) setSelectedTask(s => s ? { ...s, status } : s);
    const { error: e } = await supabase.from('tasks').update({ status }).eq('id', taskId).eq('company_id', companyId);
    if (e && prev) setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: prev.status } : t));
  };

  const handleUpdateTask = async (id: string, changes: Partial<Task>) => {
    if (!companyId) return;
    const updatePayload: Partial<Pick<Task, 'title' | 'description' | 'due_at' | 'priority'>> = {};
    if ('title' in changes) updatePayload.title = changes.title;
    if ('description' in changes) updatePayload.description = changes.description;
    if ('due_at' in changes) updatePayload.due_at = changes.due_at;
    if ('priority' in changes) updatePayload.priority = changes.priority;
    const { error } = await supabase.from('tasks').update(updatePayload).eq('id', id).eq('company_id', companyId);
    if (error) { console.error('Failed to update task', error); return; }
    const updatedAt = new Date().toISOString();
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...changes, updated_at: updatedAt } : t));
    setSelectedTask(s => s?.id === id ? { ...s, ...changes, updated_at: updatedAt } : s);
  };

  // ── Cancelamento de operação com toast ────────────────────────────────────
  const handleCancelOperation = (id: string) => {
    void cancelOperation(id).then(r => {
      if (r.success) setToast('Operação cancelada.');
    });
  };

  const currentTasks = loadedCompanyId === companyId ? tasks : [];
  const stats = computeStats(currentTasks, operationsInQueue, operationsExecutedToday);

  return (
    <div className="flex h-full flex-col">

      {/* ── Page header ── */}
      <div className="relative shrink-0 overflow-hidden border-b border-border bg-surface/60">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="pointer-events-none absolute right-8 top-4 hidden h-24 w-24 rounded-full bg-primary/5 blur-3xl sm:block" />

        <div className="flex flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="pulse-rose h-1.5 w-1.5 rounded-full bg-rose-400" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">Central operacional</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-primary">Tarefas</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
              Tarefas manuais e operações do Autopilot num único painel operacional.
            </p>
          </div>

          {/* Split create button */}
          <div className="relative shrink-0">
            <div className="group flex items-stretch overflow-hidden rounded-md border border-primary/40 bg-primary shadow-lg shadow-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
              <button
                type="button"
                onClick={() => setShowNewTask(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Plus size={15} />Nova tarefa
              </button>
              <div className="w-px bg-background/20" />
              <button
                type="button"
                onClick={() => setShowCreateMenu(v => !v)}
                className="flex items-center px-2 text-background transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Mais opções"
                aria-expanded={showCreateMenu}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {showCreateMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCreateMenu(false)} />
                <div className="absolute right-0 top-10 z-20 w-44 rounded-lg border border-border bg-surface py-1.5 shadow-2xl">
                  <button type="button"
                    onClick={() => { setShowWizard(true); setMainTab('cadencias'); setShowCreateMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                    <Layers size={13} />Nova cadência
                  </button>
                  <button type="button"
                    onClick={() => { setShowWizard(true); setMainTab('cadencias'); setShowCreateMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                    <Sparkles size={13} />Novo template IA
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Main tabs ── */}
      <div className="shrink-0 border-b border-border bg-background/70 px-5 py-2 sm:px-8">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {(['atividades', 'cadencias'] as MainTab[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setMainTab(k)}
              aria-pressed={mainTab === k}
              className={cn(
                'relative rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                mainTab === k
                  ? 'bg-primary text-background shadow-sm'
                  : 'text-text-muted hover:bg-surface-hover hover:text-primary',
              )}
            >
              {k === 'atividades' ? 'Atividades' : 'Cadências'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Atividades tab ── */}
      {mainTab === 'atividades' && (
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5 sm:px-8">
          <div className="mx-auto max-w-5xl space-y-5">

            {/* Stats strip */}
            {!loading && <StatsStrip data={stats} />}

            {/* Loading skeleton */}
            {loading ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {[1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className="bento-card-animate h-48 animate-pulse rounded-2xl border border-border bg-surface"
                    style={{ animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
            ) : (
              <MissionControlBento
                tasks={currentTasks}
                agentOperations={agentOperations}
                autopilotEnabled={autopilotEnabled}
                onToggleAutopilot={() => { void toggleAutopilot(); }}
                onUpdateOperationMessage={updateOperationMessage}
                onRescheduleOperation={rescheduleOperation}
                onSnoozeOperation={snoozeOperation}
                onCancelOperation={handleCancelOperation}
                onStatusChange={handleStatusChange}
                onOpenConversation={id => navigate(`/inbox/${id}`)}
                onTaskClick={t => setSelectedTask(t)}
                onEditTask={t => setSelectedTask(t)}
                onAddTask={() => setShowNewTask(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Cadências tab ── */}
      {mainTab === 'cadencias' && companyId && (
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-primary">Cadências</h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  Sequências automáticas de acompanhamento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWizard(true)}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary/90"
              >
                <Plus size={15} />Nova cadência
              </button>
            </div>
            <CadenceList
              companyId={companyId}
              onNewCadence={() => setShowWizard(true)}
              onEditCadence={() => setShowWizard(true)}
            />
          </div>
        </div>
      )}

      {/* ── Detail drawer ── */}
      <ActivityDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChange}
        onOpenConversation={id => navigate(`/inbox/${id}`)}
        onUpdate={handleUpdateTask}
      />

      {/* ── New task modal ── */}
      {showNewTask && companyId && (
        <NewTaskModal
          companyId={companyId}
          userId={user?.id}
          teamMembers={teamMembers}
          onClose={() => setShowNewTask(false)}
          onCreated={() => { void fetchTasks(); setShowNewTask(false); }}
        />
      )}

      {/* ── Cadence wizard ── */}
      {showWizard && companyId && (
        <CadenceWizard
          companyId={companyId}
          userId={user?.id}
          onClose={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); setMainTab('cadencias'); }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-lg border border-emerald-500/30 bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-2xl shadow-emerald-950/30">
          {toast}
        </div>
      )}
    </div>
  );
};
