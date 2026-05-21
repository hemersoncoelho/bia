import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Brain, AlertTriangle } from 'lucide-react';
import type { RankMetric, AdminPeriod, RealTenant } from './adminTypes';
import { hashHSL, initials } from './adminUtils';
import { MetricPicker } from './components/MetricPicker';
import { RankPodium, getTenantRankValue, formatRankValue } from './components/RankPodium';
import { RankList } from './components/RankList';

type RankedItem = {
  tenant: RealTenant;
  value: number;
  displayValue: string;
  rank: number;
};

interface Props {
  tenants: RealTenant[];
  loading: boolean;
  period: AdminPeriod;
  onPeriodChange: (p: AdminPeriod) => void;
}

const PERIODS: { value: AdminPeriod; label: string }[] = [
  { value: '7d',  label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y',  label: '1a' },
];

export const TenantsPageRanking: React.FC<Props> = ({
  tenants, loading, period, onPeriodChange,
}) => {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<RankMetric>('mrr');

  const ranked: RankedItem[] = useMemo(() => {
    return [...tenants]
      .sort((a, b) => getTenantRankValue(b, metric) - getTenantRankValue(a, metric))
      .map((tenant, i) => {
        const value = getTenantRankValue(tenant, metric);
        return { tenant, value, displayValue: formatRankValue(value, metric), rank: i + 1 };
      });
  }, [tenants, metric]);

  const top3   = ranked.slice(0, 3);
  const rest   = ranked.slice(3);
  const highest = ranked[0]?.tenant ?? null;
  const mostAI  = [...tenants].sort((a, b) => b.aiAdoptionPct - a.aiAdoptionPct)[0] ?? null;
  const atRisk  = tenants.find(t => t.status === 'at_risk' || t.status === 'suspended') ?? null;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-60 bg-white/[0.05] rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-48 bg-white/[0.04] border border-white/[0.06] rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-white/[0.025] border border-white/[0.06] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-mono uppercase text-orange-500 tracking-widest mb-1">COMPETIÇÃO INTERNA</p>
          <p className="text-sm text-zinc-500">Ranking comparativo. Veja quem cresce e quem precisa de atenção.</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.025] border border-white/[0.06]">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                period === p.value
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {tenants.length === 0 ? (
        <div className="py-24 text-center text-zinc-600 text-sm">Nenhum tenant cadastrado ainda.</div>
      ) : (
        <>
          {/* Metric picker */}
          <MetricPicker value={metric} onChange={setMetric} />

          {/* Pódio top 3 */}
          {top3.length >= 3 && (
            <RankPodium
              top3={top3}
              metric={metric}
              onSelect={id => navigate(`/admin/tenants/${id}`)}
            />
          )}

          {/* Lista 4..N */}
          {rest.length > 0 && (
            <RankList
              tenants={rest.map(r => r.tenant)}
              metric={metric}
              startRank={4}
              onSelect={id => navigate(`/admin/tenants/${id}`)}
            />
          )}

          {/* Destaques footer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            {highest && (
              <HighlightCard
                icon={<Flame size={16} className="text-orange-400" />}
                iconBg="bg-orange-500/10"
                title="Maior MRR"
                tenant={highest}
                onClick={() => navigate(`/admin/tenants/${highest.id}`)}
              />
            )}
            {mostAI && (
              <HighlightCard
                icon={<Brain size={16} className="text-violet-400" />}
                iconBg="bg-violet-500/10"
                title="Maior adoção de IA"
                tenant={mostAI}
                sub={`${mostAI.aiAdoptionPct}% das conversas`}
                onClick={() => navigate(`/admin/tenants/${mostAI.id}`)}
              />
            )}
            {atRisk && (
              <HighlightCard
                icon={<AlertTriangle size={16} className="text-rose-400" />}
                iconBg="bg-rose-500/10"
                title="Em risco"
                tenant={atRisk}
                sub={atRisk.status === 'at_risk' ? 'Atenção necessária' : 'Suspenso'}
                onClick={() => navigate(`/admin/tenants/${atRisk.id}`)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

interface HighlightCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  tenant: RealTenant;
  sub?: string;
  onClick: () => void;
}

const HighlightCard: React.FC<HighlightCardProps> = ({ icon, iconBg, title, tenant, sub, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all text-left w-full"
  >
    <div className={`p-2 rounded-xl shrink-0 ${iconBg}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">{title}</p>
      <div className="flex items-center gap-2 mt-1">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-bold text-white shrink-0"
          style={{ background: hashHSL(tenant.name) }}
          aria-hidden="true"
        >
          {initials(tenant.name)}
        </div>
        <span className="text-sm font-medium text-white truncate">{tenant.name}</span>
      </div>
      {sub && <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{sub}</p>}
    </div>
  </button>
);
