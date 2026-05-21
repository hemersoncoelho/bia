import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from './Sparkline';

interface KpiCardProps {
  label: string;
  value: string;
  rawValue: number;
  prefix?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  sparkColor?: string;
  sparkData?: number[];
  delta?: number;
  deltaLabel?: string;
  animDelay?: number;
}

function useCountUp(target: number, duration = 700, delay = 0): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    timerRef.current = setTimeout(() => {
      const start = performance.now();
      const animate = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setCount(Math.round(target * e));
        if (p < 1) rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);
  return count;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label, value, rawValue, icon, iconBg, iconColor,
  accentColor, sparkColor, sparkData, delta, deltaLabel, animDelay = 0,
}) => {
  const count = useCountUp(rawValue, 700, animDelay);

  const isNumericValue = !isNaN(Number(value.replace(/[R$\s.,]/g, '')));
  const displayValue = isNumericValue && rawValue > 0
    ? value.replace(/\d+/, count.toLocaleString('pt-BR'))
    : value;

  const defaultSpark = [40, 55, 48, 70, 65, 80, 75, count || rawValue];

  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-3 overflow-hidden bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300 group bento-card-animate"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.08] blur-2xl pointer-events-none"
        style={{ background: accentColor, transform: 'translate(40%, -40%)' }}
      />

      <div className="flex items-start justify-between gap-2 relative">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono leading-snug">{label}</span>
        <div className={`shrink-0 p-2 rounded-lg ${iconBg} ${iconColor} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>

      <div className="flex flex-col gap-1 relative">
        <span className="text-3xl font-bold text-white leading-none tabular-nums">{displayValue}</span>
        {(delta !== undefined) && (
          <div className="flex items-center gap-1 mt-0.5">
            {delta > 0
              ? <TrendingUp size={11} className="text-emerald-400 shrink-0" />
              : delta < 0
                ? <TrendingDown size={11} className="text-rose-400 shrink-0" />
                : <Minus size={11} className="text-zinc-500 shrink-0" />
            }
            <span className={`text-[10px] font-mono ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
              {delta > 0 ? '+' : ''}{delta}% {deltaLabel ?? 'vs. último mês'}
            </span>
          </div>
        )}
      </div>

      {sparkData !== undefined && (
        <div className="absolute bottom-3 right-3 pointer-events-none">
          <Sparkline data={sparkData ?? defaultSpark} color={sparkColor ?? accentColor} />
        </div>
      )}
    </div>
  );
};
