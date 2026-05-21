import React, { useEffect, useState } from 'react';
import type { RealTenant } from '../adminTypes';
import { STATUS_CFG } from '../adminUtils';

interface StatusDonutProps {
  tenants: RealTenant[];
}

type Slice = {
  status: string;
  count: number;
  pct: number;
  color: string;
  label: string;
};

const STATUS_COLORS: Record<string, string> = {
  active:    '#10b981',
  trial:     '#f59e0b',
  at_risk:   '#f43f5e',
  suspended: '#fb923c',
  no_plan:   '#71717a',
  none:      '#71717a',
  churned:   '#fda4af',
};

export const StatusDonut: React.FC<StatusDonutProps> = ({ tenants }) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const counts: Record<string, number> = {};
  tenants.forEach(t => { counts[t.status] = (counts[t.status] ?? 0) + 1; });

  const total = tenants.length || 1;
  const slices: Slice[] = (Object.entries(counts) as [string, number][])
    .map(([status, count]) => ({
      status,
      count,
      pct: count / total,
      color: STATUS_COLORS[status] ?? '#71717a',
      label: STATUS_CFG[status]?.label ?? status,
    }))
    .sort((a, b) => b.count - a.count);

  const R = 58;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * R;
  const gap = 3;

  let offset = -circumference / 4;
  const paths = slices.map((s, i) => {
    const dash = (prefersReduced || animated) ? (s.pct * circumference - gap) : 0;
    const startOffset = offset;
    offset += s.pct * circumference;
    return (
      <circle
        key={s.status}
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={s.color}
        strokeWidth={14}
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={-startOffset}
        strokeLinecap="round"
        style={{
          transition: prefersReduced ? 'none' : `stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`,
        }}
      />
    );
  });

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.025] border border-white/[0.06]">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-orange-400" />
        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Status da Base</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width={140} height={140} viewBox="0 0 140 140" aria-hidden="true">
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={14} />
            {paths}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-white">{tenants.length}</span>
            <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">total</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {slices.map(s => (
            <div key={s.status} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[11px] text-zinc-400 flex-1 truncate">{s.label}</span>
              <span className="text-[11px] font-mono font-bold text-white tabular-nums">{s.count}</span>
              <span className="text-[10px] font-mono text-zinc-600 w-8 text-right tabular-nums">
                {Math.round(s.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
