import React, { useEffect, useState, useCallback } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { KpiCard } from '../components/Dashboard/KpiCard';
import { PeriodFilter, periodToStartDate } from '../components/Dashboard/PeriodFilter';
import type { Period } from '../components/Dashboard/PeriodFilter';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  MessageSquare, Target, Inbox, BadgeCheck,
  AlertCircle, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface KPIData {
  total_messages:     number;
  total_leads:        number;
  open_conversations: number;
  qualified_leads:    number;
  overdue_tasks:      number;
}

interface ChartData {
  conversasPorCanal:     { canal: string; total: number }[];
  contatosPorEstagio:    { estagio: string; total: number }[];
  tasksPorStatus:        { status: string; total: number; color: string }[];
  conversasPorPrioridade:{ prioridade: string; total: number; color: string }[];
}

// ── Helpers ────────────────────────────────────────────────────

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'E-mail', webchat: 'WebChat',
  instagram: 'Instagram', telegram: 'Telegram', facebook: 'Facebook',
};

const ESTAGIO_LABELS: Record<string, string> = {
  lead: 'Lead', qualified: 'Qualificado',
  opportunity: 'Oportunidade', customer: 'Cliente', lost: 'Perdido',
};

const ESTAGIO_ORDER = ['lead', 'qualified', 'opportunity', 'customer', 'lost'];

const TASK_COLORS: Record<string, string> = {
  open: '#60a5fa', in_progress: '#f59e0b', done: '#34d399', cancelled: '#6b7280',
};
const TASK_LABELS: Record<string, string> = {
  open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', cancelled: 'Cancelada',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f43f5e', high: '#f97316', normal: '#60a5fa', low: '#a8a29e',
};
const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baixa',
};

// ── Custom Tooltip ─────────────────────────────────────────────

const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1C1C1E] border border-[#27272A] rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-stone-400 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill || '#fff' }}>
          {p.name ? `${p.name}: ` : ''}<strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Chart panels ───────────────────────────────────────────────

const ChartPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
    <h3 className="text-xs font-medium text-stone-500 uppercase tracking-widest">{title}</h3>
    {children}
  </div>
);

// ── Dashboard ──────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { currentCompany, companyRole, impersonatedUser } = useTenant();
  const { user } = useAuth();
  const [period, setPeriod]       = useState<Period>('30d');
  const [loading, setLoading]     = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [kpis, setKpis]           = useState<KPIData | null>(null);
  const [charts, setCharts]       = useState<ChartData | null>(null);

  const isAgentView = companyRole === 'agent';
  const effectiveUserId = (impersonatedUser ?? user)?.id ?? null;

  const fetchKPIs = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setLoading(true);
    setError(null);
    const since = periodToStartDate(activePeriod);

    try {
      if (isAgentView && effectiveUserId) {
        // Agent: só dados atribuídos ao usuário
        const [convRes, messagesRes, leadsRes, qualifiedRes, overdueRes] = await Promise.all([
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .eq('status', 'open')
            .eq('assigned_to', effectiveUserId),

          supabase
            .from('messages')
            .select('id, conversations!inner(company_id, assigned_to)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id)
            .eq('conversations.assigned_to', effectiveUserId)
            .gte('created_at', since),

          supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .eq('status', 'lead')
            .eq('owner_user_id', effectiveUserId)
            .gte('created_at', since),

          supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .eq('status', 'active')
            .eq('owner_user_id', effectiveUserId)
            .gte('created_at', since),

          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .eq('assigned_to_user_id', effectiveUserId)
            .lt('due_at', new Date().toISOString())
            .or('status.eq.pending,status.eq.open'),
        ]);

        setKpis({
          total_messages:     messagesRes.count  ?? 0,
          total_leads:        leadsRes.count     ?? 0,
          open_conversations: convRes.count      ?? 0,
          qualified_leads:    qualifiedRes.count ?? 0,
          overdue_tasks:      overdueRes.count ?? 0,
        });
      } else {
        // Admin/gerente: visão da empresa inteira
        const [viewRes, messagesRes, qualifiedRes] = await Promise.all([
          supabase
            .from('v_company_kpis')
            .select('total_leads, open_conversations, overdue_tasks')
            .eq('company_id', currentCompany.id)
            .single(),

          supabase
            .from('messages')
            .select('id, conversations!inner(company_id)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id)
            .gte('created_at', since),

          supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .eq('status', 'active')
            .gte('created_at', since),
        ]);

        if (viewRes.error && viewRes.error.code !== 'PGRST116') throw viewRes.error;
        const v = viewRes.data;

        setKpis({
          total_messages:     messagesRes.count  ?? 0,
          total_leads:        v?.total_leads        ?? 0,
          open_conversations: v?.open_conversations ?? 0,
          qualified_leads:    qualifiedRes.count ?? 0,
          overdue_tasks:      v?.overdue_tasks     ?? 0,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar KPIs.');
    } finally {
      setLoading(false);
    }
  }, [currentCompany, isAgentView, effectiveUserId]);

  const fetchCharts = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setChartsLoading(true);
    const since = periodToStartDate(activePeriod);

    let convQuery = supabase
      .from('conversations')
      .select('channel, priority')
      .eq('company_id', currentCompany.id)
      .gte('created_at', since);
    let contactsQuery = supabase
      .from('contacts')
      .select('status')
      .eq('company_id', currentCompany.id)
      .gte('created_at', since);
    let tasksQuery = supabase
      .from('tasks')
      .select('status')
      .eq('company_id', currentCompany.id)
      .gte('created_at', since);

    if (isAgentView && effectiveUserId) {
      convQuery = convQuery.eq('assigned_to', effectiveUserId);
      contactsQuery = contactsQuery.eq('owner_user_id', effectiveUserId);
      tasksQuery = tasksQuery.eq('assigned_to_user_id', effectiveUserId);
    }

    try {
      const [convRes, contatosRes, tasksRes] = await Promise.all([
        convQuery,
        contactsQuery,
        tasksQuery,
      ]);
      const convCanalRes = { data: convRes.data };
      const convPriorRes = { data: convRes.data };

      // Conversas por canal
      const canalCount: Record<string, number> = {};
      convCanalRes.data?.forEach(r => {
        const k = r.channel || 'outro';
        canalCount[k] = (canalCount[k] ?? 0) + 1;
      });
      const conversasPorCanal = Object.entries(canalCount)
        .map(([canal, total]) => ({ canal: CANAL_LABELS[canal] ?? canal, total }))
        .sort((a, b) => b.total - a.total);

      // Contatos por estágio (status: lead->lead, active->qualified, inactive->lost)
      const statusToEstagio: Record<string, string> = { lead: 'lead', active: 'qualified', inactive: 'lost' };
      const estagioCount: Record<string, number> = {};
      contatosRes.data?.forEach(r => {
        const k = statusToEstagio[r.status ?? 'lead'] ?? 'lead';
        estagioCount[k] = (estagioCount[k] ?? 0) + 1;
      });
      const contatosPorEstagio = ESTAGIO_ORDER
        .filter(e => estagioCount[e])
        .map(e => ({ estagio: ESTAGIO_LABELS[e], total: estagioCount[e] }));

      // Tasks por status
      const taskCount: Record<string, number> = {};
      tasksRes.data?.forEach(r => {
        const k = r.status ?? 'open';
        taskCount[k] = (taskCount[k] ?? 0) + 1;
      });
      const tasksPorStatus = Object.entries(taskCount).map(([status, total]) => ({
        status: TASK_LABELS[status] ?? status,
        total,
        color: TASK_COLORS[status] ?? '#a8a29e',
      }));

      // Conversas por prioridade
      const priorCount: Record<string, number> = {};
      convPriorRes.data?.forEach(r => {
        const k = r.priority ?? 'normal';
        priorCount[k] = (priorCount[k] ?? 0) + 1;
      });
      const conversasPorPrioridade = ['urgent', 'high', 'normal', 'low']
        .filter(p => priorCount[p])
        .map(p => ({
          prioridade: PRIORITY_LABELS[p],
          total: priorCount[p],
          color: PRIORITY_COLORS[p],
        }));

      setCharts({ conversasPorCanal, contatosPorEstagio, tasksPorStatus, conversasPorPrioridade });
    } finally {
      setChartsLoading(false);
    }
  }, [currentCompany, isAgentView, effectiveUserId]);

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    fetchKPIs(p);
    fetchCharts(p);
  }, [fetchKPIs, fetchCharts]);

  useEffect(() => {
    fetchKPIs(period);
    fetchCharts(period);
  }, [currentCompany, period, fetchKPIs, fetchCharts]);

  if (!currentCompany) {
    return (
      <div className="p-8 text-stone-500 font-mono uppercase text-xs tracking-widest text-center mt-20">
        Nenhuma empresa no contexto.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 reveal active">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-border pb-6 gap-6">
        <div>
          <span className="text-xs font-mono uppercase text-text-muted block mb-2 tracking-widest">
            Overview Operacional
          </span>
          <h1 className="text-4xl font-medium tracking-tight text-primary">
            Dashboard <span className="text-stone-400">{currentCompany.name}</span>
          </h1>
        </div>
        <PeriodFilter value={period} onChange={handlePeriodChange} />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={() => { fetchKPIs(period); fetchCharts(period); }}
            className="text-xs font-mono uppercase tracking-widest hover:text-white transition-colors px-4 py-2 rounded bg-rose-500/20 hover:bg-rose-500/30"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl p-5 animate-pulse h-28">
              <div className="h-3 bg-white/5 rounded w-2/5 mb-6" />
              <div className="h-8 bg-white/10 rounded w-1/3" />
            </div>
          ))
        ) : kpis ? (
          <>
            <KpiCard
              title="Mensagens Trocadas"
              value={kpis.total_messages.toLocaleString('pt-BR')}
              icon={<MessageSquare size={16} />}
            />
            <KpiCard
              title="Leads Ativos"
              value={kpis.total_leads}
              icon={<Target size={16} />}
            />
            <KpiCard
              title="Conversas Abertas"
              value={kpis.open_conversations}
              icon={<Inbox size={16} />}
            />
            <KpiCard
              title="Leads Qualificados"
              value={kpis.qualified_leads}
              icon={<BadgeCheck size={16} />}
            />
            <KpiCard
              title="Tarefas Atrasadas"
              value={kpis.overdue_tasks}
              icon={<AlertCircle size={16} />}
              trend={
                kpis.overdue_tasks > 0
                  ? `${kpis.overdue_tasks} pendente${kpis.overdue_tasks > 1 ? 's' : ''}`
                  : 'Em dia'
              }
              trendUp={kpis.overdue_tasks === 0}
            />
          </>
        ) : null}
      </div>

      {/* Charts */}
      {chartsLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl p-5 h-64 animate-pulse">
              <div className="h-3 bg-white/5 rounded w-1/4 mb-6" />
              <div className="h-full bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : charts ? (
        <>
          {/* Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Conversas por Canal */}
            <ChartPanel title="Conversas por Canal">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.conversasPorCanal} barSize={28} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="canal" tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="total" name="Conversas" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            {/* Funil de Contatos */}
            <ChartPanel title="Funil de Contatos">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.contatosPorEstagio} layout="vertical" barSize={18} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: '#78716c', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="estagio" tick={{ fill: '#a8a29e', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="total" name="Contatos" radius={[0, 4, 4, 0]}>
                    {charts.contatosPorEstagio.map((_, i) => {
                      const colors = ['#a78bfa', '#818cf8', '#60a5fa', '#34d399'];
                      return <Cell key={i} fill={colors[i % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Tasks por Status */}
            <ChartPanel title="Tarefas por Status">
              <div className="flex items-center justify-center gap-8">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={charts.tasksPorStatus}
                      dataKey="total"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {charts.tasksPorStatus.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5 text-xs">
                  {charts.tasksPorStatus.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-stone-400">{item.status}</span>
                      <span className="text-stone-200 font-medium ml-auto pl-4">{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartPanel>

            {/* Conversas por Prioridade */}
            <ChartPanel title="Conversas por Prioridade">
              <div className="flex items-center justify-center gap-8">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={charts.conversasPorPrioridade}
                      dataKey="total"
                      nameKey="prioridade"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {charts.conversasPorPrioridade.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5 text-xs">
                  {charts.conversasPorPrioridade.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-stone-400">{item.prioridade}</span>
                      <span className="text-stone-200 font-medium ml-auto pl-4">{item.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartPanel>

          </div>
        </>
      ) : null}

      {/* Empty state */}
      {!loading && !chartsLoading && !error && kpis && kpis.open_conversations === 0 && (
        <div className="glass-panel p-16 text-center rounded-xl border border-dashed border-border">
          <div className="w-16 h-16 bg-surface border border-border rounded-full flex items-center justify-center mx-auto mb-6">
            <RefreshCw size={24} className="text-stone-600" />
          </div>
          <h3 className="text-xl font-medium text-primary mb-2">Operação silenciosa</h3>
          <p className="text-text-muted max-w-sm mx-auto text-sm leading-relaxed">
            Nenhuma conversa ou contato registrado ainda na {currentCompany.name}.
          </p>
        </div>
      )}

    </div>
  );
};
