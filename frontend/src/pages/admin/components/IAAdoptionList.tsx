import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import type { RealTenant } from '../adminTypes';
import { initials, hashHSL } from '../adminUtils';

interface IAAdoptionListProps {
  tenants: RealTenant[];
}

export const IAAdoptionList: React.FC<IAAdoptionListProps> = ({ tenants }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 250);
    return () => clearTimeout(t);
  }, []);

  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sorted = tenants
    .filter(t => t.totalConversations > 0)
    .sort((a, b) => b.aiAdoptionPct - a.aiAdoptionPct);

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 bg-white/[0.025] border border-white/[0.06]">
      <div className="flex items-center gap-2">
        <Bot size={13} className="text-violet-400" />
        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Adoção de IA por Tenant</span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Sem conversas</div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(t => {
            const humanPct = 100 - t.aiAdoptionPct;
            return (
              <div key={t.id} className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ background: hashHSL(t.name) }}
                  aria-hidden="true"
                >
                  {initials(t.name)}
                </div>
                <span className="text-[11px] text-zinc-300 w-32 truncate shrink-0">{t.name}</span>
                <div className="flex-1 flex h-4 rounded overflow-hidden gap-0.5">
                  <div
                    className="transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] rounded-l bg-violet-500"
                    style={{ width: (prefersReduced || animated) ? `${t.aiAdoptionPct}%` : '0%' }}
                  />
                  <div
                    className="transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] rounded-r bg-zinc-700"
                    style={{
                      transitionDelay: '60ms',
                      width: (prefersReduced || animated) ? `${humanPct}%` : '0%',
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono font-bold text-violet-400 w-9 text-right tabular-nums shrink-0">
                  {t.aiAdoptionPct}%
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-4 mt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />
              <span className="text-[10px] text-zinc-500 font-mono">IA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-zinc-700" />
              <span className="text-[10px] text-zinc-500 font-mono">Humano</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
