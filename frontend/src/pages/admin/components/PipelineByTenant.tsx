import React, { useState, useEffect } from 'react';
import { Briefcase } from 'lucide-react';
import type { RealTenant } from '../adminTypes';
import { formatBRLCompact } from '../adminUtils';

interface PipelineByTenantProps {
  tenants: RealTenant[];
}

export const PipelineByTenant: React.FC<PipelineByTenantProps> = ({ tenants }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 150);
    return () => clearTimeout(t);
  }, []);

  const data = tenants
    .filter(t => (t.openDealsValue > 0) || (t.wonDealsValue > 0))
    .sort((a, b) => (b.openDealsValue + b.wonDealsValue) - (a.openDealsValue + a.wonDealsValue))
    .slice(0, 6);

  const maxVal = Math.max(...data.map(t => t.openDealsValue + t.wonDealsValue), 1);

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.025] border border-white/[0.06] h-full">
      <div className="flex items-center gap-2">
        <Briefcase size={13} className="text-orange-400" />
        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Pipeline por Tenant</span>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">Nenhum deal registrado</div>
      ) : (
        <div className="flex flex-col gap-4">
          {data.map(t => {
            const total = t.openDealsValue + t.wonDealsValue;
            const openPct = (t.openDealsValue / maxVal) * 100;
            const wonPct = (t.wonDealsValue / maxVal) * 100;
            const winRate = total > 0 ? Math.round((t.wonDealsValue / total) * 100) : 0;
            return (
              <div key={t.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium truncate max-w-[140px]">{t.name}</span>
                  <span className="text-zinc-500 font-mono text-[10px] shrink-0 ml-2">{winRate}% win</span>
                </div>
                <div className="flex gap-0.5 h-5 rounded overflow-hidden">
                  <div
                    className="flex items-center justify-end pr-1.5 rounded-l overflow-hidden min-w-0 transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      width: (prefersReduced || animated) ? `${openPct}%` : '0%',
                      background: 'linear-gradient(90deg, #c2410c, #fb923c)',
                    }}
                  >
                    {openPct > 15 && (
                      <span className="text-[9px] font-mono text-black/70 whitespace-nowrap">
                        {formatBRLCompact(t.openDealsValue)}
                      </span>
                    )}
                  </div>
                  <div
                    className="flex items-center justify-end pr-1.5 rounded-r overflow-hidden min-w-0 transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      transitionDelay: '80ms',
                      width: (prefersReduced || animated) ? `${wonPct}%` : '0%',
                      background: 'linear-gradient(90deg, #059669, #10b981)',
                    }}
                  >
                    {wonPct > 15 && (
                      <span className="text-[9px] font-mono text-black/70 whitespace-nowrap">
                        {formatBRLCompact(t.wonDealsValue)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 mt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#fb923c' }} />
              <span className="text-[10px] text-zinc-500 font-mono">Em aberto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[10px] text-zinc-500 font-mono">Ganhos</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
