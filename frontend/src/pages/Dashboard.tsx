import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PeriodFilter, periodToStartDate } from '../components/Dashboard/PeriodFilter';
import type { Period } from '../components/Dashboard/PeriodFilter';
import {
  ComposedChart, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  DollarSign, Trophy, Percent, AlertCircle,
  MessageSquare, Target, Inbox, BadgeCheck, Zap,
  Clock, ArrowUpRight, ArrowDownRight, Minus,
  ChevronRight, Activity, TrendingUp, Mail, Users, Layers
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface KPIData {
  total_messages:     number;
  total_leads:        number;
  open_conversations: number;
  qualified_leads:    number;
  overdue_tasks:      number;
}

interface ChartData {
  conversasPorCanal:      { canal: string; total: number }[];
  tasksPorStatus:         { status: string; total: number; color: string }[];
  conversasPorPrioridade: { prioridade: string; total: number; color: string }[];
}

interface CommercialData {
  pipelineValue:    number;
  wonValue:         number;
  wonCount:         number;
  lostCount:        number;
  totalInPeriod:    number;
  conversionRate:   number;
  dealsByStage:     { stage: string; count: number; value: number; color: string; position: number }[];
  dealsByStatus:    { status: string; total: number; color: string }[];
}

interface TrendPoint {
  date:                string;
  wonAmount:           number;
  openPipelineAmount:  number;
  newDeals:            number;
  wonDeals:            number;
  lostDeals:           number;
  newLeads:            number;
}

interface PipelineConversionRow {
  stage_name:        string;
  position:          number;
  total_deals:       number;
  open_deals:        number;
  won_deals:         number;
  open_amount:       number;
  won_amount:        number;
  weighted_forecast: number;
}

interface AgentPerfRow {
  user_id:                string;
  full_name:              string;
  deals_won:              number;
  deals_total:            number;
  won_amount:             number;
  win_rate_pct:           number;
  avg_first_response_min: number | null;
}

// ── Label maps ──────────────────────────────────────────────────

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'E-mail', webchat: 'WebChat',
  instagram: 'Instagram', telegram: 'Telegram', facebook: 'Facebook',
};
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

const CANAL_COLORS: Record<string, string> = {
  WhatsApp: '#25D366', 'E-mail': '#60a5fa', WebChat: '#a78bfa',
  Instagram: '#e1306c', Telegram: '#0088cc', Facebook: '#1877f2',
};

const CANAL_ICONS: Record<string, React.ReactNode> = {
  WhatsApp:  <MessageSquare size={14} className="text-emerald-400" />,
  'E-mail':  <Mail size={14} className="text-blue-400" />,
  WebChat:   <Inbox size={14} className="text-violet-400" />,
  Instagram: <Activity size={14} className="text-rose-400" />,
  Telegram:  <MessageSquare size={14} className="text-sky-400" />,
  Facebook:  <Users size={14} className="text-blue-500" />,
};

// ── Helpers ─────────────────────────────────────────────────────

const fmt = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

const fmtShort = (val: number): string => {
  if (val >= 1_000_000) return `R$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `R$${(val / 1_000).toFixed(0)}k`;
  return `R$${val.toFixed(0)}`;
};

function generateDateRange(fromDateStr: string): string[] {
  const result: string[] = [];
  const start = new Date(fromDateStr + 'T12:00:00Z');
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= today) {
    result.push(cur.toISOString().substring(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
}

// ── Hooks ────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 700): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    let rafId: number;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setCurrent(Math.round(eased * target));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return current;
}

function useBarAnimate(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(t);
  }, []);
  return ready;
}

// ── Tooltip — estilo Profound ───────────────────────────────────

const CURRENCY_KEYS = new Set(['wonAmount', 'openPipelineAmount', 'open_amount', 'won_amount', 'weighted_forecast']);

const ProfoundTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const hasCurrency = payload.some((p: any) => CURRENCY_KEYS.has(p.dataKey));
  const total: number | null = (hasCurrency && payload.length > 1)
    ? payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0)
    : null;
  return (
    <div
      className="border border-white/10 rounded-xl px-4 py-3 shadow-2xl min-w-[160px]"
      style={{ background: 'rgba(8,8,8,0.96)', backdropFilter: 'blur(8px)' }}
    >
      {label && <p className="text-zinc-400 text-xs font-medium mb-2.5">{label}</p>}
      <div className="space-y-1.5">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.fill }} />
              <span className="text-zinc-400 text-xs">{p.name}</span>
            </div>
            <span className="text-white font-semibold text-xs">
              {hasCurrency ? fmt(Number(p.value)) : p.value}
            </span>
          </div>
        ))}
      </div>
      {total !== null && (
        <>
          <div className="h-px bg-white/10 my-2" />
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 text-xs">Total</span>
            <span className="text-white font-bold text-xs">{fmt(total)}</span>
          </div>
        </>
      )}
    </div>
  );
};

// ── HeroPill ─────────────────────────────────────────────────────

const HERO_PILL_THEMES = {
  emerald: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
  rose:    'bg-rose-500/10    border-rose-500/25    text-rose-400',
  blue:    'bg-cyan-500/10    border-cyan-500/25    text-cyan-400',
};

const HeroPill: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  theme: 'emerald' | 'rose' | 'blue';
}> = ({ label, value, icon, theme }) => (
  <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border backdrop-blur-sm transition-all duration-200 hover:brightness-110 ${HERO_PILL_THEMES[theme]}`}>
    <div className="shrink-0 opacity-80">{icon}</div>
    <div>
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] opacity-60 mb-0.5">{label}</p>
      <p className="text-[15px] font-bold leading-tight tabular-nums">{value}</p>
    </div>
  </div>
);

// ── StatCard ──────────────────────────────────────────────────────

const ACCENT_BG: Record<string, string> = {
  'text-blue-400':    'bg-blue-400/10',
  'text-violet-400':  'bg-violet-400/10',
  'text-emerald-400': 'bg-emerald-400/10',
  'text-rose-400':    'bg-rose-400/10',
  'text-amber-400':   'bg-amber-400/10',
  'text-orange-400':  'bg-orange-400/10',
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: string;
  trendDir?: 'up' | 'down' | 'flat';
  accent?: string;
  loading?: boolean;
  delay?: number;
}> = ({ title, value, icon, subtitle, trend, trendDir, accent = 'text-zinc-400', loading, delay = 0 }) => {
  const numValue  = typeof value === 'number' ? value : 0;
  const animated  = useCountUp(numValue, 800);
  const TrendIcon = trendDir === 'up' ? ArrowUpRight : trendDir === 'down' ? ArrowDownRight : Minus;
  const trendColor = trendDir === 'up'
    ? 'text-emerald-400'
    : trendDir === 'down'
      ? 'text-rose-400'
      : 'text-zinc-500';

  if (loading) {
    return (
      <div
        className="card-animate rounded-2xl border border-white/[0.06] bg-white/[0.025] animate-pulse h-[120px]"
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className="p-5 space-y-3">
          <div className="flex justify-between">
            <div className="h-2 bg-white/[0.05] rounded w-24" />
            <div className="w-8 h-8 bg-white/[0.05] rounded-lg" />
          </div>
          <div className="h-8 bg-white/[0.04] rounded w-20 mt-4" />
        </div>
      </div>
    );
  }

  const isZero     = typeof value === 'number' && value === 0;
  const valueColor = isZero
    ? 'text-zinc-600'
    : 'text-white';
  const iconBg     = ACCENT_BG[accent] ?? 'bg-white/5';

  return (
    <div
      className="card-animate rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:scale-[1.02] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-200 p-4 sm:p-5 flex flex-col gap-3 group cursor-default"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">{title}</p>
          {subtitle && <p className="text-[10px] text-zinc-600 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-xl shrink-0 ${accent} ${iconBg} transition-all duration-200 group-hover:scale-110`}>{icon}</div>
      </div>
      <div>
        <p className={`text-3xl sm:text-4xl font-bold leading-none tabular-nums ${valueColor}`}>
          {typeof value === 'number' ? animated.toLocaleString('pt-BR') : value}
        </p>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendColor}`}>
            <TrendIcon size={11} />
            {trend}
          </div>
        )}
        {isZero && !trend && (
          <div className="flex items-center gap-1 mt-2 text-xs font-medium text-emerald-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Em dia
          </div>
        )}
      </div>
    </div>
  );
};

// ── Panel ─────────────────────────────────────────────────────────

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 flex flex-col gap-4 transition-colors duration-200 hover:border-white/[0.09] ${className}`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <h3 className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">{title}</h3>
        {subtitle && <p className="text-[10px] text-zinc-600 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

// ── StageBar — ranking estilo premium ────────────────────────────

const StageBar: React.FC<{
  label: string;
  count: number;
  value: number;
  color: string;
  totalCount: number;
  rank: number;
}> = ({ label, count, value, color, totalCount, rank }) => {
  const barReady = useBarAnimate();
  const pct = totalCount > 0 ? Math.max(4, (count / totalCount) * 100) : 4;
  return (
    <div className="flex items-center gap-3 group">
      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 w-4 shrink-0 text-right font-mono">{rank}</span>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono">
              {count} deal{count !== 1 ? 's' : ''}
            </span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtShort(value)}</span>
          </div>
        </div>
        <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: barReady ? `${pct}%` : '0%',
              background: color,
              transition: 'width 700ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ── BarRow — linha com barra inline (canal, prioridade, tarefa) ──

const BarRow: React.FC<{
  label: string;
  count: number;
  total: number;
  color: string;
  pulse?: boolean;
  icon?: React.ReactNode;
}> = ({ label, count, total, color, pulse, icon }) => {
  const barReady = useBarAnimate();
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0 flex items-center justify-center w-5 h-5">
        {icon ?? (
          <>
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            {(pulse && count > 0) && (
              <div
                className="absolute w-2 h-2 rounded-full animate-ping opacity-50"
                style={{ background: color }}
              />
            )}
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{label}</span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-zinc-900 dark:text-white tabular-nums">{count}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono w-8 text-right tabular-nums">{pct}%</span>
          </div>
        </div>
        <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: barReady ? `${Math.max(3, pct)}%` : '0%',
              background: color,
              transition: 'width 700ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ── FunnelRow — barra dupla sobrepostas para funil de conversão ──

const FunnelRow: React.FC<{
  rank: number;
  name: string;
  openDeals: number;
  maxOpen: number;
  wonDeals: number;
  totalDeals: number;
  openAmount: number;
  convRate: number;
}> = ({ rank, name, openDeals, maxOpen, wonDeals, totalDeals, openAmount, convRate }) => {
  const barReady = useBarAnimate();
  const openPct  = maxOpen > 0 ? Math.max(4, (openDeals / maxOpen) * 100) : 4;
  const convPct  = totalDeals > 0 ? Math.max(0, (wonDeals / totalDeals) * 100) : 0;
  const rateColor = convRate === 0 ? 'text-rose-400' : convRate >= 50 ? 'text-emerald-400' : 'text-zinc-400';
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono text-zinc-500 dark:text-zinc-600 bg-zinc-100 dark:bg-white/[0.05] shrink-0">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{name}</span>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono hidden sm:inline">{openDeals} abertos</span>
            <span className={`text-[10px] font-mono font-semibold ${rateColor}`}>{convRate}%</span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtShort(openAmount)}</span>
          </div>
        </div>
        <div className="relative h-1.5 w-full bg-zinc-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 h-full rounded-full bg-blue-300 dark:bg-white/10"
            style={{
              width: barReady ? `${openPct}%` : '0%',
              transition: 'width 700ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
          <div
            className="absolute inset-y-0 left-0 h-full rounded-full bg-cyan-400"
            style={{
              width: barReady ? `${convPct}%` : '0%',
              transition: 'width 800ms cubic-bezier(0.16, 1, 0.3, 1) 100ms',
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ── AgentRow — ranking de agente estilo Rho ──────────────────────

const AGENT_COLORS = ['#22D3EE', '#a78bfa', '#34d399', '#f59e0b', '#f43f5e', '#818cf8'];

const AgentRow: React.FC<{
  rank: number;
  name: string;
  dealsWon: number;
  dealsTotal: number;
  wonAmount: number;
  maxAmount: number;
  winRate: number;
  colorIdx: number;
}> = ({ rank, name, dealsWon, dealsTotal, wonAmount, maxAmount, winRate, colorIdx }) => {
  const barReady = useBarAnimate();
  const pct = maxAmount > 0 ? Math.max(4, (wonAmount / maxAmount) * 100) : 4;
  const color = AGENT_COLORS[colorIdx % AGENT_COLORS.length];
  const rateColor = winRate >= 50 ? 'text-emerald-400' : winRate >= 25 ? 'text-amber-400' : 'text-zinc-500';
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-3 group">
      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 w-4 shrink-0 text-right font-mono">{rank}</span>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ background: color + '33', border: `1.5px solid ${color}66` }}
      >
        <span style={{ color }}>{initial}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{name}</span>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono hidden sm:inline">{dealsWon}/{dealsTotal}</span>
            <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full border ${rateColor} border-current/20 bg-current/5`}>
              {winRate}%
            </span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtShort(wonAmount)}</span>
          </div>
        </div>
        <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: barReady ? `${pct}%` : '0%',
              background: color,
              transition: 'width 700ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ── UrgencySignal ─────────────────────────────────────────────────

const UrgencySignal: React.FC<{
  count: number;
  label: string;
  icon: React.ReactNode;
  level: 'critical' | 'warn' | 'ok';
}> = ({ count, label, icon, level }) => {
  const styles = {
    critical: 'bg-rose-50   border-rose-200   text-rose-700   dark:bg-rose-500/8   dark:border-rose-500/20   dark:text-rose-400',
    warn:     'bg-amber-50  border-amber-200  text-amber-700  dark:bg-amber-500/8  dark:border-amber-500/20  dark:text-amber-400',
    ok:       'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/8 dark:border-emerald-500/20 dark:text-emerald-400',
  }[level];
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${styles}`}>
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums">{count}</p>
        <p className="text-[10px] font-mono uppercase tracking-wider opacity-70 mt-0.5">{label}</p>
      </div>
    </div>
  );
};

// ── SkeletonPanel ─────────────────────────────────────────────────

const SkeletonPanel = ({ h = 'h-56' }: { h?: string }) => (
  <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 animate-pulse ${h}`}>
    <div className="flex justify-between items-start mb-4">
      <div>
        <div className="h-2 bg-white/[0.05] rounded w-24 mb-2" />
        <div className="h-1.5 bg-white/[0.03] rounded w-32" />
      </div>
      <div className="h-4 bg-white/[0.04] rounded w-16" />
    </div>
    <div className="flex-1 h-36 bg-white/[0.04] rounded-xl" />
  </div>
);

// ── Dashboard ─────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { currentCompany, companyRole, impersonatedUser } = useTenant();
  const { user } = useAuth();

  const [period, setPeriod]                         = useState<Period>('today');
  const [loading, setLoading]                       = useState(true);
  const [chartsLoading, setChartsLoading]           = useState(true);
  const [error, setError]                           = useState<string | null>(null);
  const [kpis, setKpis]                             = useState<KPIData | null>(null);
  const [charts, setCharts]                         = useState<ChartData | null>(null);
  const [commercial, setCommercial]                 = useState<CommercialData | null>(null);
  const [commercialLoading, setCommercialLoading]   = useState(true);
  const [trend, setTrend]                           = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading]             = useState(true);
  const [pipelineConv, setPipelineConv]             = useState<PipelineConversionRow[]>([]);
  const [agentPerf, setAgentPerf]                   = useState<AgentPerfRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading]     = useState(true);

  const isAgentView     = companyRole === 'agent';
  const effectiveUserId = (impersonatedUser ?? user)?.id ?? null;

  // ── fetchKPIs ───────────────────────────────────────────────
  const fetchKPIs = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setLoading(true); setError(null);
    const since = periodToStartDate(activePeriod);
    try {
      if (isAgentView && effectiveUserId) {
        const [convRes, messagesRes, leadsRes, qualifiedDealsRes, overdueRes] = await Promise.all([
          supabase.from('conversations').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'open').eq('assigned_to', effectiveUserId),
          supabase.from('messages')
            .select('id, conversations!inner(company_id, assigned_to)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id)
            .eq('conversations.assigned_to', effectiveUserId).gte('created_at', since),
          supabase.from('contacts').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('status', 'lead')
            .eq('owner_user_id', effectiveUserId),
          supabase.from('deals').select('contact_id')
            .eq('company_id', currentCompany.id).eq('status', 'open')
            .eq('owner_user_id', effectiveUserId).not('contact_id', 'is', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id).eq('assigned_to_user_id', effectiveUserId)
            .lt('due_at', new Date().toISOString())
            .not('status', 'in', '("done","cancelled")'),
        ]);
        const qualifiedCount = new Set(qualifiedDealsRes.data?.map(d => d.contact_id) ?? []).size;
        setKpis({
          total_messages:     messagesRes.count ?? 0,
          total_leads:        leadsRes.count    ?? 0,
          open_conversations: convRes.count     ?? 0,
          qualified_leads:    qualifiedCount,
          overdue_tasks:      overdueRes.count  ?? 0,
        });
      } else {
        const [viewRes, messagesRes, qualifiedDealsRes, overdueRes] = await Promise.all([
          supabase.from('v_company_kpis')
            .select('total_leads, open_conversations')
            .eq('company_id', currentCompany.id).single(),
          supabase.from('messages')
            .select('id, conversations!inner(company_id)', { count: 'exact', head: true })
            .eq('conversations.company_id', currentCompany.id).gte('created_at', since),
          supabase.from('deals').select('contact_id')
            .eq('company_id', currentCompany.id).eq('status', 'open').not('contact_id', 'is', null),
          supabase.from('tasks').select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompany.id)
            .lt('due_at', new Date().toISOString())
            .not('status', 'in', '("done","cancelled")'),
        ]);
        if (viewRes.error && viewRes.error.code !== 'PGRST116') throw viewRes.error;
        const v = viewRes.data;
        const qualifiedCount = new Set(qualifiedDealsRes.data?.map(d => d.contact_id) ?? []).size;
        setKpis({
          total_messages:     messagesRes.count    ?? 0,
          total_leads:        v?.total_leads        ?? 0,
          open_conversations: v?.open_conversations ?? 0,
          qualified_leads:    qualifiedCount,
          overdue_tasks:      overdueRes.count      ?? 0,
        });
      }
    } catch (err: any) { setError(err.message || 'Erro ao carregar KPIs.'); }
    finally { setLoading(false); }
  }, [currentCompany, isAgentView, effectiveUserId]);

  // ── fetchCharts ─────────────────────────────────────────────
  const fetchCharts = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setChartsLoading(true);
    const since = periodToStartDate(activePeriod);
    let convQuery  = supabase.from('conversations').select('channel, priority').eq('company_id', currentCompany.id).gte('created_at', since);
    let tasksQuery = supabase.from('tasks').select('status').eq('company_id', currentCompany.id).gte('created_at', since);
    if (isAgentView && effectiveUserId) {
      convQuery  = convQuery.eq('assigned_to', effectiveUserId);
      tasksQuery = tasksQuery.eq('assigned_to_user_id', effectiveUserId);
    }
    try {
      const [convRes, tasksRes] = await Promise.all([convQuery, tasksQuery]);
      const canalCount: Record<string, number> = {};
      convRes.data?.forEach(r => { const k = r.channel || 'outro'; canalCount[k] = (canalCount[k] ?? 0) + 1; });
      const conversasPorCanal = Object.entries(canalCount)
        .map(([canal, total]) => ({ canal: CANAL_LABELS[canal] ?? canal, total }))
        .sort((a, b) => b.total - a.total);
      const taskCount: Record<string, number> = {};
      tasksRes.data?.forEach(r => { const k = r.status ?? 'open'; taskCount[k] = (taskCount[k] ?? 0) + 1; });
      const tasksPorStatus = Object.entries(taskCount).map(([status, total]) => ({
        status: TASK_LABELS[status] ?? status, total, color: TASK_COLORS[status] ?? '#a8a29e',
      }));
      const priorCount: Record<string, number> = {};
      convRes.data?.forEach(r => { const k = r.priority ?? 'normal'; priorCount[k] = (priorCount[k] ?? 0) + 1; });
      const conversasPorPrioridade = ['urgent', 'high', 'normal', 'low'].filter(p => priorCount[p]).map(p => ({
        prioridade: PRIORITY_LABELS[p], total: priorCount[p], color: PRIORITY_COLORS[p],
      }));
      setCharts({ conversasPorCanal, tasksPorStatus, conversasPorPrioridade });
    } finally { setChartsLoading(false); }
  }, [currentCompany, isAgentView, effectiveUserId]);

  // ── fetchCommercial ─────────────────────────────────────────
  const fetchCommercial = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setCommercialLoading(true);
    const since = periodToStartDate(activePeriod);
    try {
      const { data: dealsData } = await supabase
        .from('deals')
        .select('status, amount, pipeline_stages(name, color, position)')
        .eq('company_id', currentCompany.id)
        .gte('created_at', since);

      let pipelineValue = 0;
      let wonValue = 0, wonCount = 0, lostCount = 0;
      const stageMap: Record<string, { count: number; value: number; color: string; position: number }> = {};

      for (const d of (dealsData ?? [])) {
        const amt        = Number(d.amount) || 0;
        const stage      = (d as any).pipeline_stages;
        const stageName  = stage?.name     ?? 'Sem etapa';
        const stageColor = stage?.color    ?? '#60a5fa';
        const stagePos   = stage?.position ?? 99;

        if (d.status === 'open') {
          pipelineValue += amt;
          if (!stageMap[stageName]) stageMap[stageName] = { count: 0, value: 0, color: stageColor, position: stagePos };
          stageMap[stageName].count++;
          stageMap[stageName].value += amt;
        } else if (d.status === 'won') {
          wonValue += amt;
          wonCount++;
        } else if (d.status === 'lost') {
          lostCount++;
        }
      }

      const totalInPeriod = (dealsData ?? []).length;
      const conversionRate = totalInPeriod > 0 ? Math.round((wonCount / totalInPeriod) * 100) : 0;
      const dealsByStage = Object.entries(stageMap)
        .map(([stage, v]) => ({ stage, ...v }))
        .sort((a, b) => a.position - b.position);
      const openCount = dealsByStage.reduce((s, d) => s + d.count, 0);
      const dealsByStatus = [
        { status: 'Em aberto', total: openCount, color: '#60a5fa' },
        { status: 'Ganhos',    total: wonCount,  color: '#34d399' },
        { status: 'Perdidos',  total: lostCount, color: '#f43f5e' },
      ].filter(s => s.total > 0);
      setCommercial({ pipelineValue, wonValue, wonCount, lostCount, totalInPeriod, conversionRate, dealsByStage, dealsByStatus });
    } finally { setCommercialLoading(false); }
  }, [currentCompany]);

  // ── fetchTrend ──────────────────────────────────────────────
  const fetchTrend = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setTrendLoading(true);
    const sinceDate = periodToStartDate(activePeriod).substring(0, 10);
    try {
      const { data: viewData, error: viewErr } = await supabase
        .from('v_kpi_company_daily')
        .select('snapshot_date, won_amount, open_pipeline_amount, new_deals, won_deals, lost_deals')
        .eq('company_id', currentCompany.id)
        .gte('snapshot_date', sinceDate)
        .order('snapshot_date', { ascending: true });

      if (!viewErr && viewData && viewData.length > 0) {
        setTrend(viewData.map(row => ({
          date:               new Date(row.snapshot_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          wonAmount:          Number(row.won_amount)           || 0,
          openPipelineAmount: Number(row.open_pipeline_amount) || 0,
          newDeals:           row.new_deals   || 0,
          wonDeals:           row.won_deals   || 0,
          lostDeals:          row.lost_deals  || 0,
          newLeads:           0,
        })));
        return;
      }

      const [wonRes, allRes] = await Promise.all([
        supabase.from('deals')
          .select('updated_at, amount')
          .eq('company_id', currentCompany.id)
          .eq('status', 'won')
          .gte('updated_at', sinceDate),
        supabase.from('deals')
          .select('created_at, status, amount')
          .eq('company_id', currentCompany.id)
          .gte('created_at', sinceDate),
      ]);

      const wonByDay: Record<string, { wonAmount: number; wonDeals: number }> = {};
      const actByDay: Record<string, { newDeals: number; lostDeals: number; openAmount: number }> = {};

      for (const d of (wonRes.data ?? [])) {
        const day = (d.updated_at as string).substring(0, 10);
        if (!wonByDay[day]) wonByDay[day] = { wonAmount: 0, wonDeals: 0 };
        wonByDay[day].wonAmount += Number(d.amount) || 0;
        wonByDay[day].wonDeals++;
      }
      for (const d of (allRes.data ?? [])) {
        const day = (d.created_at as string).substring(0, 10);
        if (!actByDay[day]) actByDay[day] = { newDeals: 0, lostDeals: 0, openAmount: 0 };
        actByDay[day].newDeals++;
        if (d.status === 'lost') actByDay[day].lostDeals++;
        if (d.status === 'open') actByDay[day].openAmount += Number(d.amount) || 0;
      }

      const days = generateDateRange(sinceDate);
      setTrend(days.map(dateStr => ({
        date:               new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        wonAmount:          wonByDay[dateStr]?.wonAmount  ?? 0,
        openPipelineAmount: actByDay[dateStr]?.openAmount ?? 0,
        newDeals:           actByDay[dateStr]?.newDeals   ?? 0,
        wonDeals:           wonByDay[dateStr]?.wonDeals   ?? 0,
        lostDeals:          actByDay[dateStr]?.lostDeals  ?? 0,
        newLeads:           0,
      })));
    } finally { setTrendLoading(false); }
  }, [currentCompany]);

  // ── fetchAnalytics ──────────────────────────────────────────
  const fetchAnalytics = useCallback(async (activePeriod: Period) => {
    if (!currentCompany) return;
    setAnalyticsLoading(true);
    const since = periodToStartDate(activePeriod);
    try {
      const [convRes, agentRes] = await Promise.all([
        supabase.from('deals')
          .select('status, amount, stage_id, pipeline_stages(name, position)')
          .eq('company_id', currentCompany.id)
          .gte('created_at', since),
        isAgentView
          ? Promise.resolve({ data: [] as any[], error: null })
          : supabase.from('deals')
              .select('status, amount, owner_user_id, assigned_user:owner_user_id(full_name)')
              .eq('company_id', currentCompany.id)
              .not('owner_user_id', 'is', null)
              .gte('created_at', since),
      ]);

      if (convRes.data) {
        const map: Record<string, PipelineConversionRow> = {};
        for (const d of convRes.data) {
          const st = (d as any).pipeline_stages;
          if (!st) continue;
          if (!map[st.name]) map[st.name] = {
            stage_name: st.name, position: st.position ?? 99,
            total_deals: 0, open_deals: 0, won_deals: 0,
            open_amount: 0, won_amount: 0, weighted_forecast: 0,
          };
          map[st.name].total_deals++;
          if (d.status === 'open') { map[st.name].open_deals++; map[st.name].open_amount += Number(d.amount) || 0; }
          if (d.status === 'won')  { map[st.name].won_deals++;  map[st.name].won_amount  += Number(d.amount) || 0; }
        }
        setPipelineConv(Object.values(map).sort((a, b) => a.position - b.position));
      }

      if (!isAgentView && agentRes.data) {
        const amap: Record<string, AgentPerfRow> = {};
        for (const d of agentRes.data) {
          const uid = d.owner_user_id as string;
          if (!amap[uid]) amap[uid] = {
            user_id: uid,
            full_name: (d as any).assigned_user?.full_name ?? 'Sem nome',
            deals_won: 0, deals_total: 0, won_amount: 0,
            win_rate_pct: 0, avg_first_response_min: null,
          };
          amap[uid].deals_total++;
          if (d.status === 'won') { amap[uid].deals_won++; amap[uid].won_amount += Number(d.amount) || 0; }
        }
        const agents = Object.values(amap)
          .map(a => ({ ...a, win_rate_pct: a.deals_total > 0 ? Math.round((a.deals_won / a.deals_total) * 100) : 0 }))
          .sort((a, b) => b.won_amount - a.won_amount)
          .slice(0, 6);
        setAgentPerf(agents);
      }
    } catch {
      // silencia erros de views inexistentes
    } finally { setAnalyticsLoading(false); }
  }, [currentCompany, isAgentView]);

  const handlePeriodChange = useCallback((p: Period) => { setPeriod(p); }, []);

  useEffect(() => {
    fetchKPIs(period); fetchCharts(period); fetchCommercial(period); fetchTrend(period); fetchAnalytics(period);
  }, [currentCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchKPIs(period); fetchCharts(period); fetchCommercial(period); fetchTrend(period); fetchAnalytics(period);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animated pipeline value for hero
  const animatedPipeline = useCountUp(commercial?.pipelineValue ?? 0, 1000);

  if (!currentCompany) return (
    <div className="p-8 text-zinc-500 font-mono uppercase text-xs tracking-widest text-center mt-20">
      Nenhuma empresa no contexto.
    </div>
  );

  const hasTrendData    = trend.some(p => p.wonAmount > 0 || p.openPipelineAmount > 0 || p.newDeals > 0);
  const totalStageCount = commercial
    ? Math.max(1, commercial.dealsByStage.reduce((s, d) => s + d.count, 0))
    : 1;
  const urgentConvs     = charts?.conversasPorPrioridade.find(p => p.prioridade === 'Urgente')?.total ?? 0;
  const overdueTasks    = kpis?.overdue_tasks ?? 0;
  const totalForecast   = pipelineConv.reduce((s, r) => s + (r.weighted_forecast ?? 0), 0);
  const openDealCount   = commercial?.dealsByStage.reduce((s, d) => s + d.count, 0) ?? 0;
  const periodLabel     = period === 'today' ? 'hoje' : period === '7d' ? 'últimos 7 dias' : period === '30d' ? 'este mês' : 'últimos 90 dias';
  const maxOpenDeals    = Math.max(...pipelineConv.map(r => r.open_deals), 1);
  const maxAgentAmount  = Math.max(...agentPerf.map(a => a.won_amount), 1);
  const totalCanal      = charts?.conversasPorCanal.reduce((s, c) => s + c.total, 0) ?? 1;
  const totalPrior      = charts?.conversasPorPrioridade.reduce((s, p) => s + p.total, 0) ?? 1;
  const totalTasks      = charts?.tasksPorStatus.reduce((s, t) => s + t.total, 0) ?? 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6 reveal active">

      {/* ══════════════════════════════════════════════════════════
          HEADER — ETAPA 10
      ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-white/[0.06]">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-orange-500 dark:text-orange-400 block mb-1.5">
            Visão Comercial
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white flex items-baseline gap-2 sm:gap-3 flex-wrap">
            Dashboard
            <span className="text-zinc-400 dark:text-zinc-500 text-base sm:text-xl font-normal">{currentCompany.name}</span>
          </h1>
        </div>
        <PeriodFilter value={period} onChange={handlePeriodChange} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          ERRO
      ══════════════════════════════════════════════════════════ */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2"><AlertCircle size={16} />{error}</div>
          <button
            onClick={() => { fetchKPIs(period); fetchCharts(period); }}
            className="text-xs font-mono px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          HERO BLOCK — ETAPA 2
      ══════════════════════════════════════════════════════════ */}
      <div className="relative rounded-2xl overflow-hidden border border-blue-500/20 bg-gradient-to-br from-blue-950/40 via-[#0A0A0B]/60 to-[#0A0A0B]/80 p-6 lg:p-8">
        {/* Glow accent */}
        <div className="absolute -top-40 -right-40 w-[28rem] h-[28rem] rounded-full bg-blue-600/[0.07] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-32 bg-cyan-500/[0.04] blur-2xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">

          {/* Left: main pipeline value */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={12} className="text-blue-400 dark:text-blue-400" />
              <p className="text-[10px] font-mono uppercase tracking-widest text-blue-500 dark:text-blue-400">
                Pipeline em Aberto
              </p>
            </div>
            <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 mb-3">
              Deals criados no período · {periodLabel}
            </p>

            {commercialLoading ? (
              <div className="h-16 w-56 bg-white/[0.05] rounded-xl animate-pulse" />
            ) : (
              <>
                <p
                  className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white tabular-nums leading-none"
                  style={{ filter: 'drop-shadow(0 0 32px rgba(34,211,238,0.35)) drop-shadow(0 0 12px rgba(34,211,238,0.2))' }}
                >
                  {fmtShort(animatedPipeline)}
                </p>
                {openDealCount > 0 && (
                  <p className="text-sm text-zinc-400 mt-2 font-mono">
                    {openDealCount} deal{openDealCount !== 1 ? 's' : ''} em aberto
                  </p>
                )}
                {openDealCount === 0 && !commercialLoading && (
                  <p className="text-sm text-zinc-600 mt-2 font-mono">Nenhum deal em aberto no período</p>
                )}
              </>
            )}
          </div>

          {/* Center: sparkline */}
          {(!trendLoading && hasTrendData && trend.some(p => p.openPipelineAmount > 0)) && (
            <div className="flex-1 min-w-0 h-24 max-w-sm hidden lg:block opacity-80">
              {/* height={96} matches h-24 so Recharts doesn't need to measure
                  the parent (avoids height(-1) on first render and width/height(0)
                  when display:none on mobile). debounce prevents premature paint. */}
              <ResponsiveContainer width="100%" height={96} debounce={50}>
                <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="heroSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22D3EE" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="openPipelineAmount"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    fill="url(#heroSparkGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#22D3EE', strokeWidth: 0 }}
                  />
                  <Tooltip content={<ProfoundTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Right: 3 KPI pills */}
          <div className="flex flex-wrap lg:flex-col gap-2 lg:shrink-0">
            {commercialLoading ? (
              <>
                <div className="h-14 w-48 bg-white/[0.05] rounded-xl animate-pulse" />
                <div className="h-14 w-48 bg-white/[0.04] rounded-xl animate-pulse" />
                <div className="h-14 w-48 bg-white/[0.03] rounded-xl animate-pulse" />
              </>
            ) : commercial ? (
              <>
                <HeroPill
                  label="Receita Fechada"
                  value={fmtShort(commercial.wonValue)}
                  icon={<DollarSign size={14} />}
                  theme="emerald"
                />
                <HeroPill
                  label="Conversão"
                  value={`${commercial.conversionRate}%`}
                  icon={<Percent size={14} />}
                  theme="blue"
                />
                <HeroPill
                  label="Perdidos"
                  value={commercial.lostCount.toString()}
                  icon={<Trophy size={14} />}
                  theme="rose"
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SINAIS DE URGÊNCIA (condicional)
      ══════════════════════════════════════════════════════════ */}
      {(!loading && !chartsLoading) && (urgentConvs > 0 || overdueTasks > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UrgencySignal count={urgentConvs} label="Conversas Urgentes" icon={<Zap size={16} />}
            level={urgentConvs > 0 ? 'critical' : 'ok'} />
          <UrgencySignal count={overdueTasks} label="Tarefas Atrasadas" icon={<Clock size={16} />}
            level={overdueTasks >= 5 ? 'critical' : overdueTasks > 0 ? 'warn' : 'ok'} />
          <UrgencySignal count={kpis?.open_conversations ?? 0} label="Conversas Abertas" icon={<Inbox size={16} />}
            level="ok" />
          <UrgencySignal count={kpis?.qualified_leads ?? 0} label="Leads Qualificados" icon={<BadgeCheck size={16} />}
            level="ok" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          KPI CARDS — ETAPA 3
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title="Mensagens Trocadas"
          subtitle="No período"
          value={kpis?.total_messages.toLocaleString('pt-BR') ?? '—'}
          icon={<MessageSquare size={15} />}
          accent="text-blue-400"
          loading={loading}
          delay={0}
        />
        <StatCard
          title="Leads em Aberto"
          subtitle="Agora"
          value={kpis?.total_leads ?? '—'}
          icon={<Target size={15} />}
          accent="text-violet-400"
          loading={loading}
          delay={60}
        />
        <StatCard
          title="Conversas Abertas"
          subtitle="Agora"
          value={kpis?.open_conversations ?? '—'}
          icon={<Inbox size={15} />}
          accent="text-blue-400"
          loading={loading}
          delay={120}
        />
        <StatCard
          title="Leads Qualificados"
          subtitle="Agora"
          value={kpis?.qualified_leads ?? '—'}
          icon={<BadgeCheck size={15} />}
          accent="text-emerald-400"
          loading={loading}
          delay={180}
        />
        <StatCard
          title="Tarefas Atrasadas"
          subtitle="Agora"
          value={kpis?.overdue_tasks ?? '—'}
          icon={<AlertCircle size={15} />}
          trend={
            kpis
              ? kpis.overdue_tasks === 0 ? 'Em dia' : `${kpis.overdue_tasks} pendente${kpis.overdue_tasks > 1 ? 's' : ''}`
              : undefined
          }
          trendDir={kpis ? (kpis.overdue_tasks === 0 ? 'up' : 'down') : undefined}
          accent="text-rose-400"
          loading={loading}
          delay={240}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA PRINCIPAL — Pipeline vs Receita + Pipeline por Etapa
          ETAPAs 4 e 5
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ETApA 4 — Gráfico Pipeline vs Receita */}
        <div className="lg:col-span-2">
          {trendLoading ? (
            <SkeletonPanel h="h-80" />
          ) : (
            <Panel
              title="Pipeline vs Receita Fechada"
              subtitle={`Pipeline = coorte criado no dia · Receita = deals ganhos no dia · ${periodLabel}`}
              action={
                <Link
                  to="/deals"
                  className="flex items-center gap-1 text-[10px] font-mono text-orange-500 dark:text-orange-400 hover:underline transition-colors shrink-0"
                >
                  ver deals <ChevronRight size={10} />
                </Link>
              }
            >
              {hasTrendData ? (
                <>
                  <ResponsiveContainer width="100%" height={230} debounce={50}>
                    <ComposedChart data={trend} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradPipeline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#22D3EE" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#22D3EE" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10B981" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tickFormatter={fmtShort} tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
                      <Tooltip content={<ProfoundTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />
                      <Area
                        type="monotone"
                        dataKey="openPipelineAmount"
                        name="Pipeline Aberto"
                        stroke="#22D3EE"
                        strokeWidth={2}
                        fill="url(#gradPipeline)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#22D3EE', strokeWidth: 0 }}
                      />
                      <Bar
                        dataKey="wonAmount"
                        name="Receita Fechada"
                        fill="url(#gradWon)"
                        stroke="#10B981"
                        strokeWidth={1}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={20}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-5 text-[10px] text-zinc-500 font-mono mt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-[3px] rounded-full inline-block bg-cyan-400" />
                      Pipeline Aberto
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block bg-emerald-500/80" />
                      Receita Fechada
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-52 gap-3">
                  <TrendingUp size={32} className="text-zinc-300 dark:text-zinc-700" />
                  <p className="text-zinc-400 dark:text-zinc-600 text-sm">Sem movimentação no período</p>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* ETAPA 5 — Pipeline por Etapa como ranking */}
        <div>
          {commercialLoading ? (
            <SkeletonPanel h="h-80" />
          ) : (
            <Panel
              title="Pipeline por Etapa"
              subtitle="Deals abertos · barra proporcional à quantidade"
              className="h-full"
            >
              {commercial && commercial.dealsByStage.length > 0 ? (
                <div className="space-y-4 flex-1">
                  {commercial.dealsByStage.map((s, i) => (
                    <StageBar
                      key={s.stage}
                      rank={i + 1}
                      label={s.stage}
                      count={s.count}
                      value={s.value}
                      color={s.color}
                      totalCount={totalStageCount}
                    />
                  ))}
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.07] mt-2">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      Total em aberto
                    </span>
                    <span className="text-xl font-bold text-white">{fmt(commercial.pipelineValue)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Layers size={32} className="text-zinc-300 dark:text-zinc-700" />
                  <p className="text-zinc-400 dark:text-zinc-600 text-sm text-center">Nenhum deal em aberto</p>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA 2 — Atividade do Pipeline + Conversas por Canal
          ETAPAs 6 e 7
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ETAPA 6 — Atividade do Pipeline: barras arredondadas */}
        {trendLoading ? <SkeletonPanel /> : (
          <Panel title="Atividade do Pipeline" subtitle="Novos, ganhos e perdidos por dia no período">
            {hasTrendData && trend.some(p => p.newDeals > 0 || p.wonDeals > 0 || p.lostDeals > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={200} debounce={50}>
                  <BarChart data={trend} barSize={6} barGap={2} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ProfoundTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                    <Bar dataKey="newDeals"  name="Novos"    fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="wonDeals"  name="Ganhos"   fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lostDeals" name="Perdidos" fill="#EF444460" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
                  {([['#3B82F6', 'Novos'], ['#10B981', 'Ganhos'], ['#EF4444', 'Perdidos']] as [string, string][]).map(([color, label]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color + (label === 'Perdidos' ? '80' : '') }} />
                      {label}
                    </span>
                  ))}
                </div>
              </>
            ) : commercial && commercial.dealsByStatus.length > 0 ? (
              <div className="space-y-3 py-2">
                {commercial.dealsByStatus.map((item) => (
                  <BarRow
                    key={item.status}
                    label={item.status}
                    count={item.total}
                    total={Math.max(1, commercial.dealsByStatus.reduce((s, d) => s + d.total, 0))}
                    color={item.color}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-44 gap-3">
                <Activity size={32} className="text-zinc-300 dark:text-zinc-700" />
                <p className="text-zinc-400 dark:text-zinc-600 text-sm">Sem dados de pipeline</p>
              </div>
            )}
          </Panel>
        )}

        {/* ETAPA 7 — Conversas por Canal: lista com barra inline + % */}
        {chartsLoading ? <SkeletonPanel /> : (
          <Panel
            title="Conversas por Canal"
            subtitle={`Volume no período — ${periodLabel}`}
          >
            {charts && charts.conversasPorCanal.length > 0 ? (
              <div className="space-y-4 flex-1">
                {charts.conversasPorCanal.length === 1 && charts.conversasPorCanal[0] ? (
                  // Card de destaque quando há apenas um canal
                  <div className="flex items-center justify-between py-4 px-2">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{
                          background: (CANAL_COLORS[charts.conversasPorCanal[0].canal] ?? '#22D3EE') + '15',
                          boxShadow: `0 0 20px ${(CANAL_COLORS[charts.conversasPorCanal[0].canal] ?? '#22D3EE')}20`,
                        }}
                      >
                        <span className="scale-150">
                          {CANAL_ICONS[charts.conversasPorCanal[0].canal] ?? <MessageSquare size={22} className="text-cyan-400" />}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                          {charts.conversasPorCanal[0].canal}
                        </p>
                        <p className="text-4xl font-bold text-white tabular-nums">
                          {charts.conversasPorCanal[0].total}
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-zinc-700">100%</span>
                  </div>
                ) : (
                  charts.conversasPorCanal.map(c => (
                    <BarRow
                      key={c.canal}
                      label={c.canal}
                      count={c.total}
                      total={totalCanal}
                      color={CANAL_COLORS[c.canal] ?? '#60a5fa'}
                      icon={CANAL_ICONS[c.canal]}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-44 gap-3">
                <MessageSquare size={32} className="text-zinc-300 dark:text-zinc-700" />
                <p className="text-zinc-400 dark:text-zinc-600 text-sm">Sem conversas no período</p>
              </div>
            )}
          </Panel>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          LINHA 3 — Tarefas + Prioridade de Conversas
          ETAPA 8
      ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {chartsLoading ? (
          <>
            <SkeletonPanel h="h-48" />
            <SkeletonPanel h="h-48" />
          </>
        ) : charts ? (
          <>
            <Panel title="Tarefas" subtitle="Distribuição por status no período">
              {charts.tasksPorStatus.length > 0 ? (
                <div className="space-y-4 flex-1">
                  {charts.tasksPorStatus.map(item => (
                    <BarRow
                      key={item.status}
                      label={item.status}
                      count={item.total}
                      total={totalTasks}
                      color={item.color}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Clock size={28} className="text-zinc-300 dark:text-zinc-700" />
                  <p className="text-zinc-400 dark:text-zinc-600 text-sm">Sem tarefas no período</p>
                </div>
              )}
            </Panel>

            {/* ETAPA 8 — Conversas por Prioridade sem donut */}
            <Panel title="Conversas por Prioridade" subtitle="Nível de urgência no período">
              {charts.conversasPorPrioridade.length > 0 ? (
                <div className="space-y-4 flex-1">
                  {charts.conversasPorPrioridade.map(item => (
                    <BarRow
                      key={item.prioridade}
                      label={item.prioridade}
                      count={item.total}
                      total={totalPrior}
                      color={item.color}
                      pulse={item.prioridade === 'Urgente'}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Zap size={28} className="text-zinc-300 dark:text-zinc-700" />
                  <p className="text-zinc-400 dark:text-zinc-600 text-sm">Sem conversas no período</p>
                </div>
              )}
            </Panel>
          </>
        ) : null}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ANALYTICS AVANÇADOS — ETAPA 9
      ══════════════════════════════════════════════════════════ */}
      <div className="border-t border-white/[0.06] pt-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={13} className="text-zinc-600" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">
            Analytics Avançados
          </span>
          <div className="flex-1 h-px bg-white/[0.05]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ETAPA 9.1 — Conversão do Pipeline: barras duplas sobrepostas */}
          {analyticsLoading ? <SkeletonPanel /> : (
            <Panel
              title="Conversão do Pipeline"
              subtitle="Deals criados no período · barra: abertos vs ganhos"
            >
              {pipelineConv.length > 0 ? (
                <div className="space-y-4">
                  {pipelineConv.map((row, i) => {
                    const convRate = row.total_deals > 0
                      ? Math.round((row.won_deals / row.total_deals) * 100)
                      : 0;
                    return (
                      <FunnelRow
                        key={i}
                        rank={i + 1}
                        name={row.stage_name}
                        openDeals={row.open_deals}
                        maxOpen={maxOpenDeals}
                        wonDeals={row.won_deals}
                        totalDeals={row.total_deals}
                        openAmount={row.open_amount}
                        convRate={convRate}
                      />
                    );
                  })}
                  {totalForecast > 0 && (
                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.07]">
                      <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                        Forecast ponderado total
                      </span>
                      <span className="text-sm font-bold text-amber-400">{fmt(totalForecast)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <TrendingUp size={32} className="text-zinc-300 dark:text-zinc-700" />
                  <p className="text-zinc-400 dark:text-zinc-600 text-sm">Nenhum deal encontrado para este pipeline</p>
                </div>
              )}
            </Panel>
          )}

          {/* ETAPA 9.2 — Performance por Agente com empty state premium */}
          {!isAgentView && (
            analyticsLoading ? <SkeletonPanel /> : (
              <Panel
                title="Performance por Agente"
                subtitle="Receita gerada no período · win rate"
                action={
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-zinc-500 dark:text-zinc-400">
                    Período
                  </span>
                }
              >
                {agentPerf.length > 0 ? (
                  <div className="space-y-4">
                    {agentPerf.map((agent, i) => (
                      <AgentRow
                        key={agent.user_id}
                        rank={i + 1}
                        name={agent.full_name}
                        dealsWon={agent.deals_won}
                        dealsTotal={agent.deals_total}
                        wonAmount={agent.won_amount}
                        maxAmount={maxAgentAmount}
                        winRate={Math.round(agent.win_rate_pct ?? 0)}
                        colorIdx={i}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 gap-4">
                    <div
                      className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center"
                      style={{ boxShadow: '0 0 20px rgba(255,255,255,0.02)' }}
                    >
                      <Users size={26} className="text-zinc-600" />
                    </div>
                    <div className="text-center">
                      <p className="text-zinc-400 text-sm font-medium">
                        Nenhum deal com responsável atribuído
                      </p>
                      <p className="text-zinc-600 text-xs mt-1.5">
                        Atribua deals a agentes para ver a performance individual
                      </p>
                    </div>
                    <Link
                      to="/deals"
                      className="text-[10px] font-mono uppercase tracking-widest px-5 py-2.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-all duration-200"
                    >
                      Atribuir Deals
                    </Link>
                  </div>
                )}
              </Panel>
            )
          )}
        </div>
      </div>

    </div>
  );
};
