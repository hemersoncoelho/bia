import React from 'react';
import type { RealTenant, RankMetric } from '../adminTypes';
import { initials, hashHSL, formatBRL, formatBRLCompact } from '../adminUtils';
import { PlanTag } from './PlanTag';

interface RankedTenant {
  tenant: RealTenant;
  value: number;
  displayValue: string;
  rank: number;
}

interface RankPodiumProps {
  top3: RankedTenant[];
  metric: RankMetric;
  onSelect: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { year: 'numeric', month: 'short' });
}

const MEDALS = [
  { bg: 'bg-amber-400/20', border: 'border-amber-400/40', shadow: 'shadow-[inset_0_0_24px_rgba(251,191,36,0.08)]', text: 'text-amber-400', label: '🥇' },
  { bg: 'bg-zinc-400/10',  border: 'border-zinc-400/20',  shadow: '',                                              text: 'text-zinc-400',  label: '🥈' },
  { bg: 'bg-amber-700/10', border: 'border-amber-700/20', shadow: '',                                              text: 'text-amber-700', label: '🥉' },
];

const METRIC_SUFFIX: Record<RankMetric, string> = {
  mrr:          '/ mês',
  pipeline:     'em aberto',
  deals_won:    'ganhos',
  ia_adoption:  '% IA',
  active_users: 'usuários',
  messages:     'msgs',
};

export const RankPodium: React.FC<RankPodiumProps> = ({ top3, metric, onSelect }) => {
  if (top3.length === 0) return null;

  const order = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {order.map((item, colIdx) => {
        const isCenter = top3.length >= 3 && colIdx === 1;
        const medal = MEDALS[item.rank - 1] ?? MEDALS[2];
        const suffix = METRIC_SUFFIX[metric];

        return (
          <div
            key={item.tenant.id}
            onClick={() => onSelect(item.tenant.id)}
            className={`relative rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.02] border ${medal.bg} ${medal.border} ${medal.shadow} ${isCenter ? '-translate-y-2.5' : ''}`}
          >
            <span
              className="absolute top-3 right-3 text-5xl font-black tabular-nums select-none pointer-events-none"
              style={{ color: 'rgba(255,255,255,0.04)', lineHeight: 1 }}
              aria-hidden="true"
            >
              #{item.rank}
            </span>

            <div className="text-2xl">{medal.label}</div>

            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: hashHSL(item.tenant.name) }}
                aria-hidden="true"
              >
                {initials(item.tenant.name)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm leading-tight truncate">{item.tenant.name}</p>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                  {formatDate(item.tenant.createdAt)}
                </p>
              </div>
            </div>

            <PlanTag plan={item.tenant.plan} />

            <div>
              <span className={`text-2xl font-bold tabular-nums ${medal.text}`}>{item.displayValue}</span>
              <span className="text-[10px] text-zinc-500 font-mono ml-1.5">{suffix}</span>
            </div>

            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
              <span>{formatBRLCompact(item.tenant.openDealsValue)} pipeline</span>
              <span>{item.tenant.aiAdoptionPct}% IA</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export function getTenantRankValue(tenant: RealTenant, metric: RankMetric): number {
  switch (metric) {
    case 'mrr':          return tenant.mrr;
    case 'pipeline':     return tenant.openDealsValue;
    case 'deals_won':    return tenant.wonDealsValue;
    case 'ia_adoption':  return tenant.aiAdoptionPct;
    case 'active_users': return tenant.activeUsers;
    case 'messages':     return tenant.messageVolume;
  }
}

export function formatRankValue(value: number, metric: RankMetric): string {
  switch (metric) {
    case 'mrr':
    case 'pipeline':
    case 'deals_won':    return formatBRL(value);
    case 'ia_adoption':  return `${value}%`;
    case 'active_users': return value.toLocaleString('pt-BR');
    case 'messages':     return value.toLocaleString('pt-BR');
  }
}
