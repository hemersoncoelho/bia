import React from 'react';
import { RefreshCw, Building2, Users, Clock, TrendingDown, DollarSign, Tag, Briefcase, Bot } from 'lucide-react';
import type { AdminPeriod, AdminKpiGlobal, RealTenant } from './adminTypes';
import { formatBRL } from './adminUtils';
import { KpiCard } from './components/KpiCard';
import { PipelineByTenant } from './components/PipelineByTenant';
import { StatusDonut } from './components/StatusDonut';
import { IAAdoptionList } from './components/IAAdoptionList';
import { MRRByPlan } from './components/MRRByPlan';

const PERIODS: { value: AdminPeriod; label: string }[] = [
  { value: '7d',  label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y',  label: '1a' },
];

interface Props {
  tenants: RealTenant[];
  kpi: AdminKpiGlobal | null;
  loading: boolean;
  period: AdminPeriod;
  onPeriodChange: (p: AdminPeriod) => void;
}

const KpiSkeleton: React.FC = () => (
  <div className="rounded-xl p-5 flex flex-col gap-4 animate-pulse bg-white/[0.025] border border-white/[0.06]">
    <div className="h-2.5 w-20 bg-white/[0.07] rounded" />
    <div className="h-9 w-28 bg-white/[0.07] rounded" />
    <div className="h-2.5 w-16 bg-white/[0.04] rounded" />
  </div>
);

export const TenantsPageAnalytics: React.FC<Props> = ({
  tenants, kpi, loading, period, onPeriodChange,
}) => {
  const kpiCards = kpi ? [
    {
      label: 'Total de Empresas',     rawValue: kpi.total_companies,
      value: String(kpi.total_companies), icon: <Building2 size={14} />,
      iconBg: 'bg-orange-500/10', iconColor: 'text-orange-400', accentColor: '#fb923c',
      sparkData: [], sparkColor: '#fb923c', delta: 0, animDelay: 0,
    },
    {
      label: 'Clientes Ativos',       rawValue: kpi.active_companies,
      value: String(kpi.active_companies), icon: <Users size={14} />,
      iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400', accentColor: '#10b981',
      sparkData: [], sparkColor: '#10b981', delta: 0, animDelay: 60,
    },
    {
      label: 'Em Trial',              rawValue: kpi.trial_companies,
      value: String(kpi.trial_companies), icon: <Clock size={14} />,
      iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400', accentColor: '#f59e0b',
      sparkData: [], sparkColor: '#f59e0b', delta: 0, animDelay: 120,
    },
    {
      label: 'Churn',                 rawValue: kpi.churned_companies,
      value: String(kpi.churned_companies), icon: <TrendingDown size={14} />,
      iconBg: 'bg-rose-500/10', iconColor: 'text-rose-400', accentColor: '#f43f5e',
      sparkData: [], sparkColor: '#f43f5e', delta: 0, animDelay: 180,
    },
    {
      label: 'MRR — Receita Mensal',  rawValue: kpi.mrr,
      value: formatBRL(kpi.mrr), icon: <DollarSign size={14} />,
      iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400', accentColor: '#10b981',
      sparkData: [], sparkColor: '#10b981', delta: 0, animDelay: 240,
    },
    {
      label: 'Ticket Médio',          rawValue: kpi.avg_ticket,
      value: formatBRL(kpi.avg_ticket), icon: <Tag size={14} />,
      iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-400', accentColor: '#06b6d4',
      sparkData: [], sparkColor: '#06b6d4', delta: 0, animDelay: 300,
    },
    {
      label: 'Negociações em Aberto', rawValue: kpi.open_deals_count,
      value: String(kpi.open_deals_count), icon: <Briefcase size={14} />,
      iconBg: 'bg-orange-500/10', iconColor: 'text-orange-400', accentColor: '#fb923c',
      sparkData: [], sparkColor: '#fb923c', delta: 0, animDelay: 360,
    },
    {
      label: 'Conversas via IA',      rawValue: kpi.ai_managed_conversations,
      value: String(kpi.ai_managed_conversations), icon: <Bot size={14} />,
      iconBg: 'bg-violet-500/10', iconColor: 'text-violet-400', accentColor: '#8b5cf6',
      sparkData: [], sparkColor: '#8b5cf6', delta: 0, animDelay: 420,
    },
  ] : [];

  return (
    <div className="space-y-8" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>

      {/* Period + Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono uppercase text-orange-500 tracking-widest mb-1">VISÃO CONSOLIDADA</p>
          <p className="text-sm text-zinc-500">Saúde da plataforma, MRR e adoção de IA em todos os tenants.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.025] border border-white/[0.06]">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 ${
                  period === p.value
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            disabled={loading}
            className="p-2 rounded-xl border border-white/[0.06] text-zinc-500 hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs 4×2 */}
      <section>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <KpiSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map(c => (
              <KpiCard
                key={c.label}
                label={c.label}
                value={c.value}
                rawValue={c.rawValue}
                icon={c.icon}
                iconBg={c.iconBg}
                iconColor={c.iconColor}
                accentColor={c.accentColor}
                sparkData={c.sparkData}
                sparkColor={c.sparkColor}
                delta={c.delta}
                animDelay={c.animDelay}
              />
            ))}
          </div>
        )}
      </section>

      {/* Row 1: Pipeline (2) + StatusDonut (1) */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <PipelineByTenant tenants={tenants} />
        </div>
        <StatusDonut tenants={tenants} />
      </section>

      {/* Row 2: IAAdoption (2) + MRR (1) */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <IAAdoptionList tenants={tenants} />
        </div>
        <MRRByPlan tenants={tenants} />
      </section>

    </div>
  );
};
