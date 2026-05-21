import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, MessageSquare, GitBranch, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import type { AdminTenantRow, RealTenant } from './adminTypes';
import { toRealTenant } from './adminUtils';
import { TenantHero } from './components/TenantHero';
import { TenantSummary } from './components/TenantSummary';
import { SupportBanner } from './components/SupportBanner';
import { ModulesGrid } from './components/ModulesGrid';
import { UserRow } from './components/UserRow';
import { SupportConfirmModal } from './components/SupportConfirmModal';

type DetailTab = 'geral' | 'users' | 'modulos' | 'faturamento' | 'logs';

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: 'geral',       label: 'Visão Geral' },
  { value: 'users',       label: 'Times & Usuários' },
  { value: 'modulos',     label: 'Módulos' },
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'logs',        label: 'Logs & Auditoria' },
];

const HeroSkeleton: React.FC = () => (
  <div className="flex flex-col sm:flex-row sm:items-start gap-6 pb-6 border-b border-white/[0.06] animate-pulse">
    <div className="w-16 h-16 rounded-2xl bg-white/[0.07] shrink-0" />
    <div className="flex-1 space-y-3">
      <div className="h-8 w-48 bg-white/[0.07] rounded" />
      <div className="h-4 w-72 bg-white/[0.04] rounded" />
    </div>
  </div>
);

export const TenantDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enableSupportMode } = useTenant();

  const [tenant,      setTenant]      = useState<RealTenant | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<DetailTab>('geral');
  const [showSupport, setShowSupport] = useState(false);

  const fetchTenant = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcErr } = await supabase.rpc('rpc_get_admin_tenants_table');
    if (rpcErr) { setError(rpcErr.message); setLoading(false); return; }

    const row = ((data as AdminTenantRow[]) ?? []).find(r => r.company_id === id);
    if (!row) { setError('Empresa não encontrada.'); setLoading(false); return; }

    setTenant(toRealTenant(row));
    setLoading(false);
  }, [id]);

  useEffect(() => { void fetchTenant(); }, [fetchTenant]);

  const handleSupportConfirm = async () => {
    if (!id) return;
    await enableSupportMode(id);
    navigate('/');
  };

  return (
    <>
      <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="max-w-7xl mx-auto space-y-6" style={{ animation: 'fadeSlideUp 0.35s ease both' }}>

        {/* Breadcrumb */}
        <button
          onClick={() => navigate('/admin/tenants')}
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-orange-400 transition-colors"
        >
          <ArrowLeft size={13} /> Voltar para Tenants
        </button>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle size={15} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={fetchTenant} className="text-xs px-3 py-1.5 rounded border border-rose-500/30 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5">
              <RefreshCw size={12} /> Tentar novamente
            </button>
          </div>
        )}

        {/* Hero */}
        {loading ? <HeroSkeleton /> : tenant && (
          <TenantHero tenant={tenant} onSupportMode={() => setShowSupport(true)} />
        )}

        {/* KPI Strip */}
        {!loading && tenant && <TenantSummary tenant={tenant} />}

        {/* Detail tabs */}
        {!loading && tenant && (
          <>
            <div
              className="flex items-end gap-0 border-b border-white/[0.06] overflow-x-auto"
              role="tablist"
              aria-label="Detalhes do tenant"
            >
              {DETAIL_TABS.map(t => (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={activeTab === t.value}
                  onClick={() => setActiveTab(t.value)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 border-b-2 ${
                    activeTab === t.value
                      ? 'text-white border-orange-500'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab body */}
            {activeTab === 'geral' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">

                {/* Col left: users */}
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.015]">
                    <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Usuários</span>
                      <span className="text-xs text-zinc-600 font-mono">{tenant.totalUsers} total</span>
                    </div>
                    <div className="p-2">
                      {tenant.users.length > 0
                        ? tenant.users.map(u => (
                            <UserRow key={u.id} user={u} onSupport={() => setShowSupport(true)} />
                          ))
                        : (
                          <div className="py-8 text-center text-zinc-600 text-sm">
                            Nenhum usuário carregado
                          </div>
                        )
                      }
                      <button className="w-full mt-1 py-2.5 flex items-center justify-center gap-2 text-xs text-zinc-600 border border-dashed border-white/[0.06] rounded-xl hover:border-orange-500/30 hover:text-orange-400 transition-all">
                        <Plus size={12} /> Convidar novo usuário
                      </button>
                    </div>
                  </div>
                </div>

                {/* Col right */}
                <div className="space-y-4">
                  <SupportBanner tenant={tenant} onEnter={() => setShowSupport(true)} />
                  <ModulesGrid />
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center text-zinc-500 text-sm">
                <MessageSquare size={32} className="mx-auto text-zinc-700 mb-3" />
                Gestão completa de times e usuários em breve.
              </div>
            )}

            {activeTab === 'modulos' && (
              <div className="max-w-xl">
                <ModulesGrid />
              </div>
            )}

            {activeTab === 'faturamento' && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center text-zinc-500 text-sm">
                <GitBranch size={32} className="mx-auto text-zinc-700 mb-3" />
                Histórico de faturamento e assinaturas em breve.
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center text-zinc-500 text-sm">
                <Clock size={32} className="mx-auto text-zinc-700 mb-3" />
                Logs de auditoria disponíveis em breve.
              </div>
            )}
          </>
        )}

      </div>

      {showSupport && tenant && (
        <SupportConfirmModal
          tenant={tenant}
          onConfirm={handleSupportConfirm}
          onClose={() => setShowSupport(false)}
        />
      )}
    </>
  );
};
