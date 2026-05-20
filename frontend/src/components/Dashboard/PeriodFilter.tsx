import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Period = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface CustomRange {
  from: string; // ISO string
  to: string;   // ISO string
}

export const PERIOD_LABELS: Record<Exclude<Period, 'custom'>, string> = {
  today: 'Hoje',
  '7d':  'Esta Semana',
  '30d': 'Este Mês',
  '90d': '3 meses',
};

export function periodToStartDate(period: Exclude<Period, 'custom'>): string {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === '90d') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  // 30d — start of current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString();
}

interface PeriodFilterProps {
  value: Period;
  onChange: (p: Period) => void;
  customRange?: CustomRange | null;
  onCustomRangeChange?: (r: CustomRange) => void;
}

export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
}) => {
  const periods: Period[] = ['today', '7d', '30d', '90d', 'custom'];

  function handleFromChange(dateValue: string) {
    const to = customRange?.to ?? new Date().toISOString();
    onCustomRangeChange?.({ from: `${dateValue}T00:00:00Z`, to });
  }

  function handleToChange(dateValue: string) {
    const from = customRange?.from ?? new Date().toISOString();
    onCustomRangeChange?.({ from, to: `${dateValue}T23:59:59Z` });
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Calendar size={13} className="text-stone-500 shrink-0" />
        <div className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-lg bg-stone-100 dark:bg-white/[0.04] border border-stone-200 dark:border-white/[0.06]">
          {periods.map(p => (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={cn(
                'px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider rounded-md transition-all duration-150',
                value === p
                  ? 'bg-white dark:bg-white/10 text-stone-900 dark:text-white border border-stone-300 dark:border-white/20 shadow'
                  : 'text-stone-600 dark:text-zinc-500 hover:text-stone-800 dark:hover:text-zinc-300 hover:bg-white/70 dark:hover:bg-white/5'
              )}
            >
              {p === 'custom' ? 'Período' : PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {value === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customRange?.from?.substring(0, 10) ?? ''}
            onChange={e => handleFromChange(e.target.value)}
            className="text-[11px] font-mono px-2 py-1 rounded-md bg-white dark:bg-white/[0.06] border border-stone-200 dark:border-white/[0.10] text-stone-700 dark:text-zinc-300 outline-none focus:border-orange-400 transition-colors"
          />
          <span className="text-[10px] text-stone-500 font-mono">até</span>
          <input
            type="date"
            value={customRange?.to?.substring(0, 10) ?? ''}
            onChange={e => handleToChange(e.target.value)}
            className="text-[11px] font-mono px-2 py-1 rounded-md bg-white dark:bg-white/[0.06] border border-stone-200 dark:border-white/[0.10] text-stone-700 dark:text-zinc-300 outline-none focus:border-orange-400 transition-colors"
          />
        </div>
      )}
    </div>
  );
};
