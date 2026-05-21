import React, { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import type { RealTenant } from '../adminTypes';
import { formatBRL } from '../adminUtils';

interface MRRByPlanProps {
  tenants: RealTenant[];
}

const PLAN_COLORS = ['#8b5cf6', '#06b6d4', '#fb923c', '#10b981', '#f59e0b', '#f43f5e'];

export const MRRByPlan: React.FC<MRRByPlanProps> = ({ tenants }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 300);
    return () => clearTimeout(t);
  }, []);

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const byPlan: Record<string, { count: number; total: number }> = {};
  tenants.filter(t => t.status === 'active' || t.status === 'trial').forEach(t => {
    if (!byPlan[t.plan]) byPlan[t.plan] = { count: 0, total: 0 };
    byPlan[t.plan].count += 1;
    byPlan[t.plan].total += t.mrr;
  });

  const rows = Object.entries(byPlan)
    .map(([plan, data]) => ({ plan, ...data }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0) || 1;

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.025] border border-white/[0.06]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign size={13} className="text-emerald-400" />
          <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">MRR por Plano</span>
        </div>
        <span className="text-sm font-bold text-emerald-400 tabular-nums">{formatBRL(grandTotal)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Sem assinaturas ativas</div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row, i) => {
            const pct   = (row.total / grandTotal) * 100;
            const color = PLAN_COLORS[i % PLAN_COLORS.length];
            return (
              <div key={row.plan} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs text-zinc-300">{row.plan}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{row.count} tenant{row.count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold tabular-nums" style={{ color }}>{formatBRL(row.total)}</span>
                    <span className="text-[10px] text-zinc-600 font-mono tabular-nums w-9 text-right">
                      {Math.round(pct)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      transitionDelay: `${i * 80}ms`,
                      width: (prefersReduced || animated) ? `${pct}%` : '0%',
                      background: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
