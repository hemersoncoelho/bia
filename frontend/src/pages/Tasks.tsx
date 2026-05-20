import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, Layers, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { ActivityDetailDrawer } from '../components/Tasks/ActivityDetailDrawer';
import { NewTaskModal } from '../components/Tasks/NewTaskModal';
import { CadenceList } from '../components/Tasks/CadenceList';
import { CadenceWizard } from '../components/Tasks/CadenceWizard';
import { StatsStrip } from '../components/Tasks/StatsStrip';
import type { StatsStripData } from '../components/Tasks/StatsStrip';
import { MissionControlBento } from '../components/Tasks/MissionControlBento';
import type { Task, TaskStatus, TaskPriority, TaskSourceType, AiFollowupDecision, ConversationFollowupTrigger } from '../types';

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
  const valid: TaskPriority[] = ['low','normal','high','urgent'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskPriority) : 'normal';
}
function normalizeSource(v: unknown): TaskSourceType {
  const valid: TaskSourceType[] = ['manual','ai','followup_trigger','cadence','appointment','inbox','system'];
  return (typeof v === 'string' && (valid as string[]).includes(v)) ? (v as TaskSourceType) : 'manual';
}
function isOverdue(due?: string, status?: TaskStatus) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  const d = new Date(due); return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
function isFollowupTask(task: Task) {
  return task.source_type === 'followup_trigger' || (isRecord(task.metadata) && task.metadata.source === 'expired_followup_trigger');
}
function mapTask(row: TaskRow): Task {
  const conf = row.ai_confidence === null || row.ai_confidence === undefined ? undefined : Number(row.ai_confidence);
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

function computeStats(tasks: Task[], decisions: AiFollowupDecision[]): StatsStripData {
  const todayStr = new Date().toDateString();
  const completedToday = tasks.filter(t =>
    t.status === 'done' && t.updated_at && new Date(t.updated_at).toDateString() === todayStr
  ).length;
  const doneTasks = tasks.filter(t => t.status === 'done' && t.updated_at && t.created_at);
  const avgMs = doneTasks.length
    ? doneTasks.reduce((s, t) => s + (new Date(t.updated_at!).getTime() - new Date(t.created_at).getTime()), 0) / doneTasks.length
    : 0;
  const avgMinutes = Math.max(1, Math.round(avgMs / 60000));
  const overdueCount = tasks.filter(t => isOverdue(t.due_at, t.status)).length;
  const aiSuggested = decisions.length + tasks.filter(t => t.ai_generated).length;
  const followupTotal = tasks.filter(isFollowupTask).length;
  const followupDone = tasks.filter(t => isFollowupTask(t) && t.status === 'done').length;
  const converted = followupTotal > 0 ? Math.round((followupDone / followupTotal) * 100) : 0;
  const pct = Math.min(100, Math.max(0, completedToday > 0 && tasks.length > 0
    ? Math.round((completedToday / Math.max(tasks.filter(t => t.status !== 'cancelled').length, 1)) * 100)
    : completedToday));
  return {
    completedToday: pct,
    avgMinutes: Math.min(avgMinutes, 999),
    overdue: overdueCount,
    aiSuggested,
    convertedAfterFollowup: converted,
    convertedAfterFollowupDelta: 4,
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
  const [aiDecisions, setAiDecisions] = useState<AiFollowupDecision[]>([]);
  const [agentName, setAgentName] = useState<string | undefined>(undefined);
  const fetchAiDecisionsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // IDs descartados/aceitos localmente — guard contra volta após re-fetch
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  const fetchAiDecisions = useCallback(async () => {
    if (!companyId) { setAiDecisions([]); return; }

    const [{ data: decisions }, { data: triggers }] = await Promise.all([
      supabase.from('ai_followup_decisions').select('*').eq('company_id', companyId).eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
      supabase.from('conversation_followup_triggers').select('*').eq('company_id', companyId).eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
    ]);

    const decisionItems = (decisions ?? []) as AiFollowupDecision[];

    // IDs de triggers que já viraram decision — não duplicar
    const processedTriggerIds = new Set(decisionItems.map(d => d.followup_trigger_id).filter(Boolean));

    const triggerItems: AiFollowupDecision[] = ((triggers ?? []) as ConversationFollowupTrigger[])
      .filter(t => !processedTriggerIds.has(t.id))
      .map(t => ({
        id: `trigger:${t.id}`,
        company_id: t.company_id,
        contact_id: t.contact_id,
        conversation_id: t.conversation_id,
        detected_event: t.detected_event,
        recommended_action: t.recommended_action,
        recommended_message: t.recommended_message,
        suggested_due_at: t.expected_reply_until,
        confidence: t.ai_confidence,
        requires_human_approval: true,
        status: 'pending' as const,
        created_at: t.created_at,
      }));

    const allItems = [...decisionItems, ...triggerItems];
    setAiDecisions(allItems.filter(d => !dismissedIdsRef.current.has(d.id)));
  }, [companyId]);
  fetchAiDecisionsRef.current = fetchAiDecisions;

  const fetchTeamMembers = useCallback(async () => {
    if (!companyId) { setTeamMembers([]); return; }
    const { data } = await supabase.from('user_companies')
      .select('user_id, user_profiles(id, full_name)').eq('company_id', companyId);
    setTeamMembers(((data ?? []) as TeamMemberRow[])
      .map(d => ({ id: firstRelation(d.user_profiles)?.id ?? '', full_name: firstRelation(d.user_profiles)?.full_name || 'Usuário' }))
      .filter(m => m.id));
  }, [companyId]);

  const fetchAgentName = useCallback(async () => {
    if (!companyId) { setAgentName(undefined); return; }
    const { data } = await supabase
      .from('ai_agents')
      .select('name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    setAgentName((data as { name?: string } | null)?.name ?? undefined);
  }, [companyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchTasks(); }, [fetchTasks]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchAiDecisions(); }, [fetchAiDecisions]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchTeamMembers(); }, [fetchTeamMembers]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchAgentName(); }, [fetchAgentName]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`mission-control-${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_followup_triggers', filter: `company_id=eq.${companyId}` },
        () => { void fetchAiDecisionsRef.current(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_followup_triggers', filter: `company_id=eq.${companyId}` },
        () => { void fetchAiDecisionsRef.current(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_followup_decisions', filter: `company_id=eq.${companyId}` },
        () => { void fetchAiDecisionsRef.current(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_followup_decisions', filter: `company_id=eq.${companyId}` },
        () => { void fetchAiDecisionsRef.current(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    if (error) {
      console.error('Failed to update task', error);
      return;
    }
    const updatedAt = new Date().toISOString();
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...changes, updated_at: updatedAt } : t));
    setSelectedTask(s => s?.id === id ? { ...s, ...changes, updated_at: updatedAt } : s);
  };

  const handleAcceptDecision = async (id: string) => {
    if (!companyId) return;
    const decision = aiDecisions.find(d => d.id === id);
    if (!decision) return;

    const isTrigger = id.startsWith('trigger:');
    const originalId = isTrigger ? id.replace('trigger:', '') : id;

    const fallbackDue = new Date();
    fallbackDue.setDate(fallbackDue.getDate() + 1);
    fallbackDue.setHours(9, 0, 0, 0);

    const recommendedAction = decision.recommended_action?.trim() || '';
    const { error: taskError } = await supabase.from('tasks').insert({
      company_id: companyId,
      title: recommendedAction.slice(0, 80) || 'Follow-up sugerido pela IA',
      description: decision.recommended_action ?? null,
      recommended_message: decision.recommended_message ?? null,
      source_type: 'followup_trigger',
      ai_generated: true,
      ai_confidence: decision.confidence ?? null,
      contact_id: decision.contact_id,
      conversation_id: decision.conversation_id,
      status: 'open',
      priority: 'high',
      due_at: decision.suggested_due_at ?? fallbackDue.toISOString(),
      created_by: user?.id ?? null,
    });
    if (taskError) {
      console.error('Failed to create task from AI decision', taskError);
      return;
    }

    // Marca como descartado antes de qualquer await para evitar volta por re-fetch concorrente
    dismissedIdsRef.current = new Set([...dismissedIdsRef.current, id]);
    setAiDecisions(prev => prev.filter(d => d.id !== id));

    if (isTrigger) {
      const { error: rpcErr } = await supabase.rpc('rpc_process_followup_trigger', { p_company_id: companyId, p_trigger_id: originalId });
      if (rpcErr) console.error('[rpc_process_followup_trigger]', rpcErr.message);
    } else {
      await supabase.from('ai_followup_decisions').update({ status: 'converted_to_task' }).eq('id', originalId).eq('company_id', companyId);
    }

    await fetchTasks();
    setToast('Tarefa criada! Aparece em Próximas.');
  };

  const handleDiscardDecision = async (id: string) => {
    if (!companyId) return;
    const isTrigger = id.startsWith('trigger:');
    const originalId = isTrigger ? id.replace('trigger:', '') : id;

    dismissedIdsRef.current = new Set([...dismissedIdsRef.current, id]);
    setAiDecisions(prev => prev.filter(d => d.id !== id));

    if (isTrigger) {
      const { error: rpcErr } = await supabase.rpc('rpc_cancel_followup_trigger', { p_company_id: companyId, p_trigger_id: originalId });
      if (rpcErr) console.error('[rpc_cancel_followup_trigger]', rpcErr.message);
    } else {
      await supabase.from('ai_followup_decisions').update({ status: 'ignored' }).eq('id', originalId).eq('company_id', companyId);
    }
  };

  const currentTasks = loadedCompanyId === companyId ? tasks : [];
  const stats = computeStats(currentTasks, aiDecisions);

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
            <h1 className="text-2xl font-semibold tracking-tight text-primary">Mission Control</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
              Tarefas, follow-ups e decisões da IA num único painel operacional.
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
                  <button type="button" onClick={() => { setShowWizard(true); setMainTab('cadencias'); setShowCreateMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-primary">
                    <Layers size={13} />Nova cadência
                  </button>
                  <button type="button" onClick={() => { setShowWizard(true); setMainTab('cadencias'); setShowCreateMenu(false); }}
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
                {[1,2,3,4].map(i => (
                  <div key={i} className="bento-card-animate h-48 animate-pulse rounded-2xl border border-border bg-surface" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
              </div>
            ) : (
              <MissionControlBento
                tasks={currentTasks}
                aiDecisions={aiDecisions}
                agentName={agentName}
                onStatusChange={handleStatusChange}
                onOpenConversation={id => navigate(`/inbox/${id}`)}
                onTaskClick={t => setSelectedTask(t)}
                onEditTask={t => setSelectedTask(t)}
                onAcceptDecision={handleAcceptDecision}
                onDiscardDecision={handleDiscardDecision}
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

      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-lg border border-emerald-500/30 bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-2xl shadow-emerald-950/30">
          {toast}
        </div>
      )}
    </div>
  );
};
