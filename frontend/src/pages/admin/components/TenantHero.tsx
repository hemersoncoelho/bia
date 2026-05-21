import React from 'react';
import { Zap, Edit2 } from 'lucide-react';
import type { RealTenant } from '../adminTypes';
import { initials, hashHSL, formatDate } from '../adminUtils';
import { StatusPill } from './StatusPill';

interface TenantHeroProps {
  tenant: RealTenant;
  onSupportMode: () => void;
}

export const TenantHero: React.FC<TenantHeroProps> = ({ tenant, onSupportMode }) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-6 border-b border-white/[0.06]">
    <div className="flex items-center gap-5">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
        style={{ background: hashHSL(tenant.name) }}
        aria-hidden="true"
      >
        {initials(tenant.name)}
      </div>
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">{tenant.name}</h1>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="text-[10px] font-mono text-zinc-600">{tenant.id}</span>
          <StatusPill status={tenant.status} />
          <span className="text-[11px] text-zinc-500 font-mono">
            Cliente desde {formatDate(tenant.createdAt)}
          </span>
          <span className="text-[11px] text-zinc-500">
            {tenant.totalUsers} usuários · {tenant.teams.length} times
          </span>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-3 shrink-0">
      <button className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 border border-white/[0.1] rounded-xl hover:bg-white/[0.04] hover:text-white transition-all">
        <Edit2 size={14} /> Editar dados
      </button>
      <button
        onClick={onSupportMode}
        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-all shadow-[0_0_20px_rgba(251,146,60,0.25)]"
      >
        <Zap size={14} /> Modo Suporte
      </button>
    </div>
  </div>
);
