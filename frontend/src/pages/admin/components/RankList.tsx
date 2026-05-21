import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { RealTenant, RankMetric } from '../adminTypes';
import { initials, hashHSL, formatBRLCompact } from '../adminUtils';
import { getTenantRankValue, formatRankValue } from './RankPodium';

interface RankListProps {
  tenants: RealTenant[];
  metric: RankMetric;
  startRank: number;
  onSelect: (id: string) => void;
}

export const RankList: React.FC<RankListProps> = ({ tenants, metric, startRank, onSelect }) => {
  if (tenants.length === 0) return null;

  const maxVal = Math.max(...tenants.map(t => getTenantRankValue(t, metric)), 1);

  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.015]">
      {tenants.map((tenant, idx) => {
        const rank = startRank + idx;
        const value = getTenantRankValue(tenant, metric);
        const pct = (value / maxVal) * 100;
        const displayValue = formatRankValue(value, metric);

        return (
          <div
            key={tenant.id}
            onClick={() => onSelect(tenant.id)}
            className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] cursor-pointer transition-all duration-200 group hover:translate-x-0.5"
            style={{ animation: `cardIn 0.3s ease both`, animationDelay: `${idx * 30}ms` }}
          >
            <div className="w-8 text-center shrink-0">
              <span className="text-sm font-mono font-bold text-zinc-500 tabular-nums">{rank}</span>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ background: hashHSL(tenant.name) }}
                aria-hidden="true"
              >
                {initials(tenant.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white truncate font-medium">{tenant.name}</p>
                <p className="text-[10px] text-zinc-600 font-mono truncate">{tenant.id}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-52 shrink-0">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-orange-400 w-24 text-right tabular-nums shrink-0">
                {displayValue}
              </span>
            </div>

            <div className="w-24 text-right shrink-0">
              <span className="text-[11px] text-zinc-500 font-mono">
                {formatBRLCompact(tenant.openDealsValue)} pip.
              </span>
            </div>

            <button
              onClick={e => { e.stopPropagation(); onSelect(tenant.id); }}
              className="shrink-0 px-3 py-1 rounded-lg text-xs text-zinc-500 border border-white/[0.06] hover:border-orange-500/40 hover:text-orange-400 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1"
              aria-label={`Ver ${tenant.name}`}
            >
              Ver <ArrowUpRight size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
