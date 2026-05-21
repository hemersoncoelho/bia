import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AdminTabValue, AdminPeriod, AdminTenantRow, AdminKpiGlobal, RealTenant } from './adminTypes';
import { toRealTenant } from './adminUtils';
import { TenantsPageLista } from './TenantsPage.lista';
import { TenantsPageAnalytics } from './TenantsPage.analytics';
import { TenantsPageRanking } from './TenantsPage.ranking';

const TABS: { value: AdminTabValue; label: string }[] = [
  { value: 'lista',     label: 'Lista' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'ranking',   label: 'Ranking' },
];

export const TenantsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab    = (params.get('tab')    ?? 'lista') as AdminTabValue;
  const period = (params.get('period') ?? '30d')   as AdminPeriod;

  const [tenants, setTenants]         = useState<RealTenant[]>([]);
  const [kpi,     setKpi]             = useState<AdminKpiGlobal | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error,   setError]           = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);

    const [kpiRes, tenantsRes] = await Promise.all([
      supabase.rpc('rpc_get_admin_kpi_global'),
      supabase.rpc('rpc_get_admin_tenants_table'),
    ]);

    if (gen !== fetchGenRef.current) return;

    if (kpiRes.error) {
      setError(kpiRes.error.message);
      setLoading(false);
      return;
    }
    if (tenantsRes.error) {
      setError(tenantsRes.error.message);
      setLoading(false);
      return;
    }

    const kpiData = kpiRes.data as AdminKpiGlobal & { error?: string };
    if (kpiData?.error) { setError(kpiData.error); setLoading(false); return; }

    setKpi(kpiData as AdminKpiGlobal);
    setTenants(((tenantsRes.data as AdminTenantRow[]) ?? []).map(toRealTenant));
    setLoading(false);
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const setTab = useCallback((t: AdminTabValue) => {
    setParams(prev => { prev.set('tab', t); return prev; });
  }, [setParams]);

  const setPeriod = useCallback((p: AdminPeriod) => {
    setParams(prev => { prev.set('period', p); return prev; });
  }, [setParams]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono uppercase text-orange-500 tracking-widest">
              GESTÃO · PLATAFORMA
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Tenants</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gerencie empresas, planos, acessos e modos de suporte.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-zinc-600">
              <Building2 size={13} />
              {tenants.length} empresa{tenants.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-1.5 rounded-lg border border-white/[0.06] text-zinc-500 hover:text-white hover:border-white/[0.15] transition-all disabled:opacity-40"
            title="Recarregar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchAll} className="text-xs px-3 py-1.5 rounded border border-rose-500/30 hover:bg-rose-500/10 transition-colors">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-end gap-0 border-b border-white/[0.06]" role="tablist" aria-label="Seções de tenants">
        {TABS.map(t => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 relative flex items-center gap-1.5 ${
                active ? 'text-white border-orange-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              {t.label}
              {t.value === 'lista' && !loading && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  active ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-700'
                }`}>
                  {tenants.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div key={tab} style={{ animation: 'fadeSlideUp 0.18s ease both' }}>
        {tab === 'lista' && (
          <TenantsPageLista tenants={tenants} loading={loading} onRefresh={fetchAll} />
        )}
        {tab === 'analytics' && (
          <TenantsPageAnalytics tenants={tenants} kpi={kpi} loading={loading} period={period} onPeriodChange={setPeriod} />
        )}
        {tab === 'ranking' && (
          <TenantsPageRanking tenants={tenants} loading={loading} period={period} onPeriodChange={setPeriod} />
        )}
      </div>
    </div>
  );
};
