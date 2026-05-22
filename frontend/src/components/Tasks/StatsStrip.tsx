import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface StatsStripData {
  completedToday: number;
  avgMinutes: number;
  overdue: number;
  operationsInQueue: number;
  operationsExecutedToday: number;
}

function useCountUp(target: number, duration = 800): number {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    start.current = null;
    const step = (ts: number) => {
      if (!start.current) start.current = ts;
      const progress = Math.min((ts - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(ease * target));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return val;
}

interface KpiCellProps {
  label: string;
  value: number;
  suffix?: string;
  delta?: number;
  highlight?: boolean;
  icon?: React.ReactNode;
  labelColor?: string;
  valueColor?: string;
  delay?: number;
}

const KpiCell: React.FC<KpiCellProps> = ({
  label, value, suffix = '', delta, highlight, icon, labelColor, valueColor, delay = 0,
}) => {
  const animated = useCountUp(value);
  const positive = delta !== undefined && delta > 0;
  const negative = delta !== undefined && delta < 0;

  return (
    <div
      className={cn(
        'bento-card-animate relative flex min-w-[100px] flex-1 flex-col gap-0.5 px-4 py-2.5',
        highlight && 'rounded-lg border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.04)]',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {highlight && (
        <div
          className="pointer-events-none absolute right-0 top-0 h-10 w-10 opacity-30"
          style={{ background: 'radial-gradient(circle at top right, rgba(167,139,250,0.4), transparent 70%)' }}
        />
      )}
      <div className="flex items-center gap-1">
        {icon}
        <span
          className="font-mono text-[9px] uppercase tracking-[0.16em] font-medium"
          style={{ color: labelColor ?? 'var(--text-muted)' }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="count-up-in font-mono text-lg font-bold tabular-nums leading-none"
          style={{ color: valueColor ?? 'var(--text-main)', animationDelay: `${delay + 80}ms` }}
        >
          {animated}{suffix}
        </span>
        {delta !== undefined && delta !== 0 && (
          <span className={cn('font-mono text-[10px] font-semibold leading-none', positive ? 'text-emerald-400' : negative ? 'text-rose-400' : '')}>
            {positive ? '↑' : '↓'}{Math.abs(delta)}{suffix}
          </span>
        )}
      </div>
    </div>
  );
};

interface Props { data: StatsStripData }

export const StatsStrip: React.FC<Props> = ({ data }) => (
  <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface no-scrollbar">
    <KpiCell
      label="Conclusão hoje"
      value={data.completedToday}
      suffix="%"
      delta={8}
      delay={0}
    />
    <div className="w-px self-stretch bg-border" />
    <KpiCell
      label="Tempo médio"
      value={data.avgMinutes}
      suffix=" min"
      delta={-3}
      valueColor="#fbbf24"
      delay={50}
    />
    <div className="w-px self-stretch bg-border" />
    <KpiCell
      label="Em atraso"
      value={data.overdue}
      valueColor={data.overdue > 0 ? '#f87171' : undefined}
      delay={100}
    />
    <div className="w-px self-stretch bg-border" />
    <KpiCell
      label="Operações em fila"
      value={data.operationsInQueue}
      valueColor="#a78bfa"
      delay={150}
    />
    <div className="w-px self-stretch bg-border" />
    <KpiCell
      label="Executadas hoje"
      value={data.operationsExecutedToday}
      highlight
      labelColor="#a78bfa"
      valueColor="#a78bfa"
      icon={<Zap size={9} style={{ color: '#a78bfa' }} className="shrink-0" />}
      delay={200}
    />
  </div>
);
