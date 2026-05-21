import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { RealTenant } from '../adminTypes';
import { formatBRL, formatBRLCompact } from '../adminUtils';

interface TenantSummaryProps {
  tenant: RealTenant;
}

export const TenantSummary: React.FC<TenantSummaryProps> = ({ tenant }) => {
  const aiPct = tenant.totalConversations > 0
    ? Math.round((tenant.aiConversations / tenant.totalConversations) * 100)
    : 0;

  const cells = [
    {
      label: 'Plano',
      value: tenant.plan || '—',
      sub: tenant.mrr > 0 ? `${formatBRL(tenant.mrr)}/mês` : 'sem assinatura',
      color: 'text-cyan-400',
    },
    {
      label: 'MRR',
      value: formatBRL(tenant.mrr),
      sub: 'receita mensal',
      color: 'text-emerald-400',
    },
    {
      label: 'Pipeline aberto',
      value: formatBRLCompact(tenant.openDealsValue),
      sub: `${tenant.openDealsCount} negociações`,
      color: 'text-orange-400',
    },
    {
      label: 'Deals Won',
      value: formatBRL(tenant.wonDealsValue),
      sub: tenant.wonDealsCount > 0 ? `${tenant.wonDealsCount} fechados` : 'acumulado',
      color: 'text-emerald-400',
    },
    {
      label: 'Adoção de IA',
      value: `${aiPct}%`,
      sub: `${tenant.aiConversations} / ${tenant.totalConversations} conv.`,
      color: 'text-violet-400',
    },
  ];

  return (
    <div className="grid grid-cols-5 rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.015]">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={`px-4 py-4 flex flex-col gap-1 ${i < cells.length - 1 ? 'border-r border-white/[0.06]' : ''}`}
        >
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{cell.label}</span>
          <span className={`text-lg font-bold tabular-nums ${cell.color}`}>{cell.value}</span>
          <span className="text-[10px] text-zinc-600 font-mono">{cell.sub}</span>
        </div>
      ))}
    </div>
  );
};

export { TrendingUp };
