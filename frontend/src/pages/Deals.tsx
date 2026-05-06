import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, Kanban, Plus, Settings2 } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { StageColumn } from '../components/Pipeline/StageColumn';
import { DealDetailPanel } from '../components/Pipeline/DealDetailPanel';
import { NewDealModal } from '../components/Pipeline/NewDealModal';
import { PipelineSettingsDrawer } from '../components/Pipeline/PipelineSettingsDrawer';
import type { Deal, DealStatus, PipelineStage } from '../types';

type StatusOption = { value: DealStatus; label: string };

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'open', label: 'Ativos' },
  { value: 'won', label: 'Ganhos' },
  { value: 'lost', label: 'Perdidos' },
];

export const Deals: React.FC = () => {
  const { currentCompany, companyRole } = useTenant();
  const { user } = useAuth();

  const canAddDeal =
    (companyRole === 'company_admin' || companyRole === 'manager') ||
    (user?.role === 'platform_admin' || user?.role === 'system_admin');

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [statusFilter, setStatusFilter] = useState<DealStatus>('open');
  const [showNewDeal, setShowNewDeal]   = useState(false);
  const [pipelineId, setPipelineId]     = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const canMove = user?.role !== 'viewer';

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    if (!currentCompany) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch the default active pipeline for this company
      const { data: pipelineData, error: pipelineErr } = await supabase
        .from('pipelines')
        .select('id')
        .eq('company_id', currentCompany.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1)
        .single();

      if (pipelineErr && pipelineErr.code !== 'PGRST116') throw pipelineErr;

      const activePipelineId = pipelineData?.id ?? null;
      setPipelineId(activePipelineId);

      // Fetch pipeline stages ordered by position
      const { data: stagesData, error: stagesErr } = activePipelineId
        ? await supabase
            .from('pipeline_stages')
            .select('*')
            .eq('pipeline_id', activePipelineId)
            .order('position', { ascending: true })
        : { data: [], error: null };

      if (stagesErr) throw stagesErr;

      // Fetch deals with related contact, assigned user, and conversation
      let dealsQuery = supabase
        .from('deals')
        .select(`
          *,
          contact:contact_id (id, full_name),
          assigned_user:owner_user_id (full_name),
          conversation:conversation_id (id, channel)
        `)
        .eq('company_id', currentCompany.id)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

      if (activePipelineId) dealsQuery = dealsQuery.eq('pipeline_id', activePipelineId);

      const { data: dealsData, error: dealsErr } = await dealsQuery;

      if (dealsErr) throw dealsErr;

      setStages(stagesData ?? []);
      setDeals((dealsData as Deal[]) ?? []);
    } catch (err: any) {
      console.error('[Deals] fetch error:', err);
      setError(err.message || 'Erro ao carregar o pipeline.');
    } finally {
      setLoading(false);
    }
  }, [currentCompany, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep selectedDeal in sync when deals refresh
  useEffect(() => {
    if (selectedDeal) {
      const refreshed = deals.find(d => d.id === selectedDeal.id);
      if (refreshed) setSelectedDeal(refreshed);
    }
  }, [deals]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdateDeal = useCallback((dealId: string, patch: Partial<Deal>) => {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...patch } : d));
  }, []);

  const handleStatusChange = useCallback((dealId: string, newStatus: DealStatus, _patch: Partial<Deal>) => {
    // Remove deal from current view (it no longer matches the 'open' status filter)
    setDeals(prev => prev.filter(d => d.id !== dealId));
    setSelectedDeal(null);
    showToast(
      newStatus === 'won'
        ? 'Negócio marcado como Ganho!'
        : 'Negócio marcado como Perdido.',
      'success'
    );
  }, []);

  const handleMoveDeal = async (dealId: string, newStageId: string) => {
    const prevDeal = deals.find(d => d.id === dealId);
    if (!prevDeal) return;

    const targetStage = stages.find(s => s.id === newStageId);

    // Optimistic update — move immediately in local state
    const patch = (prev: Deal[]) =>
      prev.map(d => d.id === dealId ? { ...d, stage_id: newStageId } : d);

    setDeals(patch);
    if (selectedDeal?.id === dealId) {
      setSelectedDeal(prev => prev ? { ...prev, stage_id: newStageId } : null);
    }

    try {
      const { error: rpcErr } = await supabase.rpc('rpc_update_deal_stage', {
        p_deal_id: dealId,
        p_stage_id: newStageId,
      });

      if (rpcErr) throw rpcErr;

      showToast(`Negócio movido para "${targetStage?.name ?? 'novo estágio'}"`, 'success');
    } catch (err: any) {
      // Revert on failure
      const revert = (prev: Deal[]) =>
        prev.map(d => d.id === dealId ? { ...d, stage_id: prevDeal.stage_id } : d);

      setDeals(revert);
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(prev => prev ? { ...prev, stage_id: prevDeal.stage_id } : null);
      }

      showToast(err.message || 'Erro ao mover negócio. Operação revertida.', 'error');
      throw err;
    }
  };

  if (!currentCompany) {
    return (
      <div className="p-8 text-stone-500 font-mono uppercase text-xs tracking-widest text-center mt-20">
        Nenhuma empresa mapeada no contexto.
      </div>
    );
  }

  const totalDeals = deals.length;
  const totalValue = deals.reduce((sum, d) => sum + (d.amount || 0), 0);

  const formattedTotalValue = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(totalValue);

  return (
    <div className="flex flex-col reveal active h-[calc(100vh-76px)] sm:h-[calc(100vh-112px)]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-border pb-5 mb-5 gap-4 shrink-0">
        <div>
          <span className="text-[11px] font-mono uppercase text-stone-500 block mb-2 tracking-widest">
            CRM Comercial
          </span>
          <h1 className="text-3xl font-medium tracking-tight text-primary flex items-center gap-3">
            <Kanban size={26} className="text-stone-500 shrink-0" />
            Jornada do Cliente
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {/* Status filter tabs */}
          <div className="flex bg-surface border border-border rounded-lg p-1 gap-1">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest rounded transition-all',
                  statusFilter === opt.value
                    ? 'bg-white text-black font-semibold'
                    : 'text-stone-500 hover:text-stone-200'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-widest text-text-muted hover:text-text-main border border-border rounded-lg hover:bg-surface-hover transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>

          {/* Configurar CRM — admin/gerente ou platform/system admin */}
          {canAddDeal && pipelineId && (
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-widest text-text-muted hover:text-text-main border border-border rounded-lg hover:bg-surface-hover transition-all"
              title="Configurar etapas do CRM"
            >
              <Settings2 size={13} />
              Configurar CRM
            </button>
          )}

          {/* New Deal — admin/gerente ou platform/system admin */}
          {stages.length > 0 && pipelineId && canAddDeal && (
            <button
              onClick={() => setShowNewDeal(true)}
              className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-widest bg-white text-black rounded-lg hover:bg-stone-200 transition-all font-semibold"
            >
              <Plus size={13} />
              Novo Negócio
            </button>
          )}
        </div>
      </div>

      {/* ── Summary bar ── */}
      {!loading && totalDeals > 0 && (
        <div className="flex items-center gap-5 mb-4 px-0.5 shrink-0">
          <span className="text-[12px] text-stone-500">
            <span className="text-stone-300 font-semibold tabular-nums">{totalDeals}</span>{' '}
            {totalDeals === 1 ? 'negócio' : 'negócios'}
          </span>
          <span className="text-stone-800">·</span>
          <span className="text-[12px] text-stone-500">
            Total:{' '}
            <span className="text-emerald-400 font-semibold tabular-nums">{formattedTotalValue}</span>
          </span>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-lg flex items-center gap-3 shrink-0 text-sm">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchData}
            className="ml-auto text-xs font-mono uppercase tracking-widest hover:text-rose-300 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Board ── */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          /* Skeleton */
          <div className="flex gap-5 h-full overflow-x-auto pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-72 shrink-0 flex flex-col gap-2">
                <div className="h-0.5 bg-border rounded animate-pulse mb-3" />
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <div className="h-3.5 w-24 bg-surface-hover rounded animate-pulse" />
                  <div className="h-3 w-12 bg-surface-hover rounded animate-pulse" />
                </div>
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="bg-surface border border-border rounded-lg p-3.5 animate-pulse"
                    style={{ animationDelay: `${j * 80}ms` }}
                  >
                    <div className="h-3 bg-surface-hover rounded w-4/5 mb-3" />
                    <div className="h-3 bg-surface-hover rounded w-1/3 mb-4" />
                    <div className="h-2.5 bg-surface-hover rounded w-2/5" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : stages.length === 0 ? (
          /* Empty state — no stages configured */
          <div className="flex-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 bg-surface border border-border rounded-full flex-center mx-auto mb-5">
                <Kanban size={24} className="text-stone-600" />
              </div>
              <h3 className="text-lg font-medium text-primary mb-2">Nenhuma etapa configurada</h3>
              <p className="text-stone-500 text-sm leading-relaxed">
                Configure as etapas da jornada do cliente clicando em{' '}
                <span className="text-text-main font-medium">Configurar CRM</span> no cabeçalho.
              </p>
            </div>
          </div>
        ) : deals.length === 0 && !loading ? (
          /* Empty deals for this status filter */
          <div className="flex gap-5 h-full overflow-x-auto pb-4 items-start pt-1">
            {stages.map(stage => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={[]}
                stages={stages}
                canMove={false}
                onSelectDeal={setSelectedDeal}
                onMoveDeal={handleMoveDeal}
              />
            ))}
          </div>
        ) : (
          /* Full board */
          <div
            className="flex gap-5 h-full overflow-x-auto pb-4 items-start pt-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}
          >
            {stages.map(stage => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={deals.filter(d => d.stage_id === stage.id)}
                stages={stages}
                canMove={canMove}
                onSelectDeal={setSelectedDeal}
                onMoveDeal={handleMoveDeal}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-8 left-1/2 -translate-x-1/2 z-[60]',
            'flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-2xl border',
            'text-sm font-medium transition-all',
            toast.type === 'success'
              ? 'bg-surface border-border text-text-main'
              : 'bg-rose-950 border-rose-800/60 text-rose-300'
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle size={15} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={15} className="text-rose-400 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* ── Deal detail slide-over ── */}
      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          stages={stages}
          canMove={canMove}
          onClose={() => setSelectedDeal(null)}
          onMove={handleMoveDeal}
          onUpdate={handleUpdateDeal}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* ── New Deal modal ── */}
      {showNewDeal && pipelineId && (
        <NewDealModal
          companyId={currentCompany.id}
          pipelineId={pipelineId}
          stages={stages}
          onClose={() => setShowNewDeal(false)}
          onSuccess={() => { setShowNewDeal(false); fetchData(); }}
        />
      )}

      {/* ── Pipeline Settings Drawer ── */}
      {showSettings && pipelineId && (
        <PipelineSettingsDrawer
          pipelineId={pipelineId}
          companyId={currentCompany.id}
          onClose={() => setShowSettings(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
};
