import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Period = 'today' | '7d' | '30d' | '90d';

export const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  '7d':  '7 Dias',
  '30d': 'Este Mês',
  '90d': '90 Dias',
};

/** Returns the ISO start datetime for a given period */
export function periodToStartDate(period: Period): string {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return start.toISOString();
  }
  if (period === '90d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 90);
    return start.toISOString();
  }
  // 30d — start of current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString();
}

interface PeriodFilterProps {
  value: Period;
  onChange: (p: Period) => void;
}

export const PeriodFilter: React.FC<PeriodFilterProps> = ({ value, onChange }) => {
  const periods: Period[] = ['today', '7d', '30d', '90d'];

  return (
    <div className="flex items-center gap-1.5">
      <Calendar size={13} className="text-zinc-500 shrink-0" />
      <div className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06]">
        {periods.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              'px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider rounded-md transition-all duration-150',
              value === p
                ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white border border-zinc-200 dark:border-white/20 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-white/5'
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
};
