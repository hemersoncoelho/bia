import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Plus } from 'lucide-react';
import type { RealTenant } from './adminTypes';
import { TenantsTable } from './components/TenantsTable';
import { SupportConfirmModal } from './components/SupportConfirmModal';
import { useTenant } from '../../contexts/TenantContext';
import { NewCompanyModal } from '../../components/admin/NewCompanyModal';

type FilterStatus = 'all' | string;

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all',       label: 'Todos' },
  { value: 'active',    label: 'Ativos' },
  { value: 'trial',     label: 'Trial' },
  { value: 'suspended', label: 'Suspensos' },
  { value: 'churned',   label: 'Churn' },
  { value: 'none',      label: 'Sem plano' },
];

interface Props {
  tenants: RealTenant[];
  loading: boolean;
  onRefresh: () => void;
}

export const TenantsPageLista: React.FC<Props> = ({ tenants, loading, onRefresh }) => {
  const navigate = useNavigate();
  const { enableSupportMode } = useTenant();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [supportTarget, setSupportTarget] = useState<RealTenant | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const filtered = useMemo(() => {
    let list = tenants;
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tenants, search, statusFilter]);

  const countStatus = (status: FilterStatus) => {
    if (status === 'all') return tenants.length;
    return tenants.filter(t => t.status === status).length;
  };

  const handleSupport = async (tenant: RealTenant) => {
    await enableSupportMode(tenant.id);
    navigate('/');
  };

  return (
    <>
      <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="space-y-6" style={{ animation: 'fadeSlideUp 0.4s ease both' }}>

        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm w-full">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome ou ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/[0.025] border border-white/[0.06] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 transition-colors"
              aria-label="Buscar tenants"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-all"
            >
              <Plus size={15} /> Nova Empresa
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] hover:text-white transition-all">
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por status">
          {STATUS_FILTERS.map(f => {
            const count  = countStatus(f.value);
            const active = statusFilter === f.value;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(f.value)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-white/[0.06]'
                }`}
              >
                {f.label}
                <span className={`text-[9px] font-mono tabular-nums ${active ? 'text-orange-400/70' : 'text-zinc-700'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <TenantsTable
          tenants={filtered}
          loading={loading}
          onManage={id => navigate(`/admin/tenants/${id}`)}
          onSupport={t => setSupportTarget(t)}
        />
      </div>

      {supportTarget && (
        <SupportConfirmModal
          tenant={supportTarget}
          onConfirm={() => handleSupport(supportTarget)}
          onClose={() => setSupportTarget(null)}
        />
      )}

      {showNewModal && (
        <NewCompanyModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onSuccess={() => { setShowNewModal(false); onRefresh(); }}
        />
      )}
    </>
  );
};
