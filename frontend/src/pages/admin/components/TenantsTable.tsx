import React from 'react';
import { Bot, Zap } from 'lucide-react';
import type { RealTenant } from '../adminTypes';
import { formatBRL, formatDate, initials, hashHSL } from '../adminUtils';
import { StatusPill } from './StatusPill';
import { PlanTag } from './PlanTag';

const RowSkeleton: React.FC = () => (
  <tr className="border-b border-white/[0.04] animate-pulse">
    {[1,2,3,4,5,6,7,8,9].map(i => (
      <td key={i} className="px-4 py-4">
        <div className="h-3.5 bg-white/[0.05] rounded" style={{ width: `${45 + (i * 13) % 40}%` }} />
      </td>
    ))}
  </tr>
);

interface TenantsTableProps {
  tenants: RealTenant[];
  loading?: boolean;
  onManage: (id: string) => void;
  onSupport: (tenant: RealTenant) => void;
}

export const TenantsTable: React.FC<TenantsTableProps> = ({
  tenants, loading, onManage, onSupport,
}) => (
  <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.015]">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[960px]" role="grid">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['Empresa', 'Plano', 'Status', 'MRR', 'Deals abertos', 'Won', 'Adoção IA', 'Desde', 'Ações'].map(h => (
              <th
                key={h}
                scope="col"
                className={`px-4 py-3.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 ${h === 'MRR' || h === 'Won' ? 'text-right' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
            : tenants.length === 0
              ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-zinc-500 text-sm">
                    Nenhuma empresa encontrada.
                  </td>
                </tr>
              )
              : tenants.map((tenant, idx) => {
                  const aiPct = tenant.totalConversations > 0
                    ? Math.round((tenant.aiConversations / tenant.totalConversations) * 100)
                    : 0;
                  return (
                    <tr
                      key={tenant.id}
                      onClick={() => onManage(tenant.id)}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-all duration-200 group hover:translate-x-0.5"
                      style={{ animation: 'cardIn 0.3s ease both', animationDelay: `${idx * 30}ms` }}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: hashHSL(tenant.name) }}
                            aria-hidden="true"
                          >
                            {initials(tenant.name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white leading-none">{tenant.name}</p>
                            <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{tenant.id.slice(0, 10)}…</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <PlanTag plan={tenant.plan} />
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusPill status={tenant.status} />
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <span className={`text-sm font-mono tabular-nums ${tenant.mrr > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                          {tenant.mrr > 0 ? formatBRL(tenant.mrr) : '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div>
                          <span className="text-sm font-mono text-white tabular-nums">{tenant.openDealsCount}</span>
                          {tenant.openDealsValue > 0 && (
                            <p className="text-[10px] text-zinc-500 font-mono">{formatBRL(tenant.openDealsValue)}</p>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <span className={`text-sm font-mono tabular-nums ${tenant.wonDealsValue > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                          {tenant.wonDealsValue > 0 ? formatBRL(tenant.wonDealsValue) : '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 w-32">
                          {tenant.totalConversations > 0 && (
                            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div className="h-full rounded-full bg-violet-500" style={{ width: `${aiPct}%` }} />
                            </div>
                          )}
                          <div className="flex items-center gap-1 shrink-0">
                            {aiPct > 0 && <Bot size={10} className="text-violet-400" />}
                            <span className="text-xs font-mono text-violet-400 tabular-nums">{aiPct}%</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-sm text-zinc-500 font-mono">{formatDate(tenant.createdAt)}</span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={e => { e.stopPropagation(); onSupport(tenant); }}
                            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all"
                          >
                            <Zap size={11} /> Suporte
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); onManage(tenant.id); }}
                            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-zinc-400 hover:border-white/[0.2] hover:text-white transition-all"
                          >
                            Gerenciar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
          }
        </tbody>
      </table>
    </div>
    {!loading && tenants.length > 0 && (
      <div className="px-4 py-3 border-t border-white/[0.04] text-[11px] text-zinc-600 font-mono">
        Mostrando {tenants.length} de {tenants.length} empresas
      </div>
    )}
  </div>
);
