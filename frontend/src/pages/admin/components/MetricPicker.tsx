import React from 'react';
import type { RankMetric } from '../adminTypes';

interface MetricOption {
  value: RankMetric;
  label: string;
}

const OPTIONS: MetricOption[] = [
  { value: 'mrr',          label: 'MRR' },
  { value: 'pipeline',     label: 'Pipeline aberto' },
  { value: 'deals_won',    label: 'Deals Won' },
  { value: 'ia_adoption',  label: 'Adoção de IA' },
  { value: 'active_users', label: 'Usuários ativos' },
  { value: 'messages',     label: 'Vol. de mensagens' },
];

interface MetricPickerProps {
  value: RankMetric;
  onChange: (m: RankMetric) => void;
}

export const MetricPicker: React.FC<MetricPickerProps> = ({ value, onChange }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <span className="text-[11px] font-mono uppercase text-zinc-500 tracking-widest shrink-0">Rankear por</span>
    <div className="flex items-center gap-1.5 flex-wrap">
      {OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 border ${
              active
                ? 'border-orange-500/60 bg-orange-500/10 text-orange-400'
                : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.15]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
);
