import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  DollarSign,
  MessageSquare,
  Calendar,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  AlertCircle,
  Loader2,
  Trophy,
  XCircle,
  CheckCircle2,
  Link2,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import type { Deal, PipelineStage, DealStatus } from '../../types';

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
  phone: 'Telefone',
  chat: 'Chat',
};

const STATUS_CONFIG: Record<DealStatus, { label: string; dot: string; badge: string }> = {
  open: {
    label: 'Ativo',
    dot: 'bg-blue-500',
    badge: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  },
  won: {
    label: 'Ganho',
    dot: 'bg-emerald-500',
    badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  },
  lost: {
    label: 'Perdido',
    dot: 'bg-rose-500',
    badge: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  },
};

interface DealDetailPanelProps {
  deal: Deal | null;
  stages: PipelineStage[];
  canMove: boolean;
  onClose: () => void;
  onMove: (dealId: string, stageId: string) => Promise<void>;
  onUpdate?: (dealId: string, patch: Partial<Deal>) => void;
  onStatusChange?: (dealId: string, newStatus: DealStatus, patch: Partial<Deal>) => void;
}

export const DealDetailPanel: React.FC<DealDetailPanelProps> = ({
  deal,
  stages,
  canMove,
  onClose,
  onMove,
  onUpdate,
  onStatusChange,
}) => {
  const { currentCompany } = useTenant();
  const navigate = useNavigate();

  // ── Move deal ──
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  // ── Inline editing ──
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [savingField, setSavingField] = useState<'name' | 'value' | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const nameCancelledRef = useRef(false);
  const valueCancelledRef = useRef(false);
  const isEditingRef = useRef(false);

  // ── Close deal (won / lost) ──
  const [confirmClose, setConfirmClose] = useState<null | 'won' | 'lost'>(null);
  const [lossReason, setLossReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // ── Link conversation ──
  type ConvOption = { id: string; contact_name: string; channel: string; last_message_preview?: string | null };
  const [showLinkConv, setShowLinkConv] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [convOptions, setConvOptions] = useState<ConvOption[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [linkingConv, setLinkingConv] = useState(false);

  useEffect(() => {
    isEditingRef.current = isEditingName || isEditingValue;
  }, [isEditingName, isEditingValue]);

  // Reset close state when deal changes
  useEffect(() => {
    setConfirmClose(null);
    setLossReason('');
    setCloseError(null);
    setShowLinkConv(false);
    setConvSearch('');
  }, [deal?.id]);

  useEffect(() => {
    if (!isEditingName) setDraftName(deal?.title ?? '');
  }, [deal?.title, isEditingName]);

  useEffect(() => {
    if (!isEditingValue) {
      const v = deal?.amount ?? 0;
      setDraftValue(v === 0 ? '' : String(v));
    }
  }, [deal?.amount, isEditingValue]);

  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus();
  }, [isEditingName]);

  useEffect(() => {
    if (isEditingValue) {
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
    }
  }, [isEditingValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    if (showMoveMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoveMenu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditingRef.current) {
        if (showLinkConv) {
          setShowLinkConv(false);
        } else if (confirmClose !== null) {
          setConfirmClose(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmClose, showLinkConv]);

  if (!deal) return null;

  // ── Buscar conversas para vincular ──────────────────────

  const fetchConversations = async (search: string) => {
    if (!currentCompany) return;
    setLoadingConvs(true);
    try {
      // Reatribuição de tipos diferentes de query causa TS2589; usar ternário evita isso.
      const baseSelect = 'id, channel, contact:contact_id(full_name)';
      const query = (deal.contact_id && !search)
        ? supabase
            .from('conversations')
            .select(baseSelect)
            .eq('company_id', currentCompany.id)
            .eq('contact_id', deal.contact_id)
            .order('created_at', { ascending: false })
            .limit(20)
        : supabase
            .from('conversations')
            .select(baseSelect + ', messages(body, created_at)')
            .eq('company_id', currentCompany.id)
            .order('created_at', { ascending: false })
            .limit(20);

      const { data } = await query;
      // contact retorna como array no tipo inferido do Supabase; cast via unknown é seguro.
      const rows = (data ?? []) as unknown as Array<{ id: string; channel: string; contact: { full_name: string } | null }>;
      const filtered = search
        ? rows.filter(r =>
            r.contact?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
            r.channel?.toLowerCase().includes(search.toLowerCase())
          )
        : rows;

      setConvOptions(
        filtered.map(r => ({
          id: r.id,
          contact_name: r.contact?.full_name ?? 'Sem contato',
          channel: r.channel,
        }))
      );
    } finally {
      setLoadingConvs(false);
    }
  };

  const linkConversation = async (conversationId: string) => {
    if (!currentCompany) return;
    setLinkingConv(true);
    try {
      const { error: upErr } = await supabase
        .from('deals')
        .update({ conversation_id: conversationId, updated_at: new Date().toISOString() })
        .eq('id', deal.id)
        .eq('company_id', currentCompany.id);
      if (upErr) throw upErr;
      onUpdate?.(deal.id, { conversation_id: conversationId });
      setShowLinkConv(false);
    } catch (err: any) {
      console.error('[DealDetailPanel] linkConversation error:', err);
    } finally {
      setLinkingConv(false);
    }
  };

  const currentStage = stages.find(s => s.id === deal.stage_id);
  const otherStages = stages
    .filter(s => s.id !== deal.stage_id)
    .sort((a, b) => a.position - b.position);
  const statusConfig = STATUS_CONFIG[deal.status] ?? STATUS_CONFIG.open;

  const formattedValue = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(deal.amount || 0);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  // ── Save handlers ──

  const saveName = async () => {
    if (nameCancelledRef.current) {
      nameCancelledRef.current = false;
      return;
    }
    const nextName = draftName.trim();
    if (!nextName) {
      setDraftName(deal.title);
      setIsEditingName(false);
      return;
    }
    if (nextName === deal.title) {
      setIsEditingName(false);
      return;
    }
    setSavingField('name');
    setFieldError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_update_deal_details', {
        p_company_id: currentCompany!.id,
        p_deal_id: deal.id,
        p_name: nextName,
        p_value: null,
      });
      if (error) throw error;
      onUpdate?.(deal.id, {
        title: nextName,
        updated_at: (data as any)?.updated_at ?? deal.updated_at,
      });
    } catch (err: any) {
      setFieldError(err.message || 'Erro ao salvar nome.');
      setDraftName(deal.title);
    } finally {
      setSavingField(null);
      setIsEditingName(false);
    }
  };

  const saveValue = async () => {
    if (valueCancelledRef.current) {
      valueCancelledRef.current = false;
      return;
    }
    const raw = draftValue.trim().replace(',', '.');
    const parsed = raw === '' ? 0 : parseFloat(raw);
    const finalAmount = isNaN(parsed) ? 0 : Math.max(0, parsed);
    if (finalAmount === (deal.amount ?? 0)) {
      setIsEditingValue(false);
      return;
    }
    setSavingField('value');
    setFieldError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_update_deal_details', {
        p_company_id: currentCompany!.id,
        p_deal_id: deal.id,
        p_name: null,
        p_value: finalAmount,
      });
      if (error) throw error;
      onUpdate?.(deal.id, {
        amount: finalAmount,
        updated_at: (data as any)?.updated_at ?? deal.updated_at,
      });
    } catch (err: any) {
      setFieldError(err.message || 'Erro ao salvar valor.');
      setDraftValue(deal.amount === 0 ? '' : String(deal.amount ?? 0));
    } finally {
      setSavingField(null);
      setIsEditingValue(false);
    }
  };

  const handleMove = async (stageId: string) => {
    setMoveError(null);
    setMoving(true);
    setShowMoveMenu(false);
    try {
      await onMove(deal.id, stageId);
    } catch (err: any) {
      setMoveError(err.message || 'Erro ao mover negócio.');
    } finally {
      setMoving(false);
    }
  };

  // ── Win / Loss handlers ──

  const handleMarkWon = async () => {
    if (!currentCompany) return;
    setClosing(true);
    setCloseError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_mark_deal_won', {
        p_deal_id: deal.id,
        p_company_id: currentCompany.id,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao marcar como ganho');
      const closedAt = data.closed_at ?? new Date().toISOString();
      onStatusChange?.(deal.id, 'won', { status: 'won', closed_at: closedAt, loss_reason: null });
    } catch (err: any) {
      setCloseError(err.message || 'Erro ao marcar negócio como ganho.');
    } finally {
      setClosing(false);
    }
  };

  const handleMarkLost = async () => {
    if (!currentCompany) return;
    setClosing(true);
    setCloseError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_mark_deal_lost', {
        p_deal_id: deal.id,
        p_company_id: currentCompany.id,
        p_loss_reason: lossReason.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Falha ao marcar como perdido');
      const closedAt = data.closed_at ?? new Date().toISOString();
      onStatusChange?.(deal.id, 'lost', {
        status: 'lost',
        closed_at: closedAt,
        loss_reason: (data.loss_reason ?? lossReason.trim()) || null,
      });
    } catch (err: any) {
      setCloseError(err.message || 'Erro ao marcar negócio como perdido.');
    } finally {
      setClosing(false);
    }
  };

  const inputCls =
    'w-full bg-surface-hover border border-border rounded-lg px-2 py-1 text-primary focus:outline-none focus:border-text-muted transition-colors disabled:opacity-50';

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-surface border-l border-border z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                'inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border rounded px-2 py-0.5',
                statusConfig.badge
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dot)} />
                {statusConfig.label}
              </span>
              {deal.closed_at && (
                <span className="text-[10px] text-stone-600 font-mono">
                  {formatDate(deal.closed_at)}
                </span>
              )}
            </div>

            {/* Editable title */}
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      nameCancelledRef.current = true;
                      setDraftName(deal.title);
                      setIsEditingName(false);
                    }
                  }}
                  onBlur={saveName}
                  disabled={savingField === 'name'}
                  className={cn(inputCls, 'text-base font-semibold leading-snug')}
                />
                {savingField === 'name' && (
                  <Loader2 size={14} className="animate-spin text-stone-500 shrink-0" />
                )}
              </div>
            ) : (
              <button
                onClick={() => { setFieldError(null); setIsEditingName(true); }}
                disabled={savingField !== null}
                title="Clique para editar o nome"
                className="text-left w-full group/name disabled:pointer-events-none"
              >
                <h2 className="text-base font-semibold text-primary leading-snug line-clamp-2 group-hover/name:text-text-muted transition-colors">
                  {deal.title}
                  {savingField === 'name' && (
                    <Loader2 size={13} className="inline ml-2 animate-spin text-stone-500 align-middle" />
                  )}
                </h2>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-main transition-colors shrink-0 mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Field error banner ── */}
        {fieldError && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 shrink-0">
            <AlertCircle size={12} className="shrink-0" />
            <span>{fieldError}</span>
            <button
              onClick={() => setFieldError(null)}
              className="ml-auto text-rose-500 hover:text-rose-300 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── Scrollable content ── */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-border"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}
        >

          {/* Value */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-1.5">
              Valor do Negócio
            </p>

            {isEditingValue ? (
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-500 shrink-0" />
                <input
                  ref={valueInputRef}
                  type="text"
                  inputMode="decimal"
                  value={draftValue}
                  onChange={e => setDraftValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveValue(); }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      valueCancelledRef.current = true;
                      setDraftValue(deal.amount === 0 ? '' : String(deal.amount ?? 0));
                      setIsEditingValue(false);
                    }
                  }}
                  onBlur={saveValue}
                  disabled={savingField === 'value'}
                  placeholder="0"
                  className={cn(inputCls, 'w-40 text-2xl font-semibold tabular-nums')}
                />
                {savingField === 'value' && (
                  <Loader2 size={14} className="animate-spin text-stone-500 shrink-0" />
                )}
              </div>
            ) : (
              <button
                onClick={() => { setFieldError(null); setIsEditingValue(true); }}
                disabled={savingField !== null}
                title="Clique para editar o valor"
                className="flex items-baseline gap-2 group/value hover:opacity-75 transition-opacity disabled:pointer-events-none"
              >
                <DollarSign size={16} className="text-emerald-500 self-center" />
                <span className="text-2xl font-semibold text-primary tabular-nums">
                  {formattedValue}
                </span>
                {savingField === 'value' && (
                  <Loader2 size={14} className="animate-spin text-stone-500 self-center" />
                )}
              </button>
            )}
          </div>

          {/* Stage + move */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
              Estágio Atual
            </p>

            <div className="flex items-center justify-between gap-3">
              {currentStage ? (
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: currentStage.color || '#6B7280' }}
                  />
                  <span className="text-sm font-medium text-primary">{currentStage.name}</span>
                </div>
              ) : (
                <span className="text-sm text-stone-500">—</span>
              )}

              {canMove && deal.status === 'open' && (
                <div className="relative" ref={moveMenuRef}>
                  <button
                    onClick={() => setShowMoveMenu(v => !v)}
                    disabled={moving}
                    className={cn(
                      'flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest',
                      'px-3 py-1.5 rounded-lg border border-border bg-surface-hover hover:bg-border',
                      'text-text-muted hover:text-text-main transition-all',
                      moving && 'opacity-50 pointer-events-none'
                    )}
                  >
                    {moving ? (
                      <>
                        <span className="w-3 h-3 rounded-full border-2 border-stone-500 border-t-white animate-spin" />
                        Movendo
                      </>
                    ) : (
                      <>
                        Mover
                        <ChevronDown size={12} />
                      </>
                    )}
                  </button>

                  {showMoveMenu && (
                    <div className="absolute right-0 top-9 z-50 min-w-[180px] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-stone-600 border-b border-border">
                        Mover para
                      </div>
                      {otherStages.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-stone-600">
                          Nenhum outro estágio
                        </div>
                      ) : (
                        otherStages.map(stage => (
                          <button
                            key={stage.id}
                            onClick={() => handleMove(stage.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-text-main hover:bg-surface-hover transition-colors text-left"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: stage.color || '#6B7280' }}
                            />
                            {stage.name}
                            <ArrowRight size={12} className="ml-auto text-stone-600" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {moveError && (
              <p className="mt-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">
                {moveError}
              </p>
            )}
          </div>

          {/* ── Fechar Negócio (apenas quando deal está aberto) ── */}
          {deal.status === 'open' && canMove && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Fechar Negócio
              </p>

              {closeError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mb-3">
                  <AlertCircle size={12} className="shrink-0" />
                  <span>{closeError}</span>
                  <button onClick={() => setCloseError(null)} className="ml-auto">
                    <X size={12} />
                  </button>
                </div>
              )}

              {confirmClose === null && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCloseError(null); setConfirmClose('won'); }}
                    disabled={closing}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all text-sm font-semibold disabled:opacity-50"
                  >
                    <Trophy size={14} />
                    Ganhar
                  </button>
                  <button
                    onClick={() => { setCloseError(null); setConfirmClose('lost'); }}
                    disabled={closing}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50 transition-all text-sm font-semibold disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    Perder
                  </button>
                </div>
              )}

              {confirmClose === 'won' && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-lg">
                    <p className="text-sm text-text-main leading-relaxed">
                      Marcar <span className="font-semibold">"{deal.title}"</span> como{' '}
                      <span className="text-emerald-400 font-semibold">Ganho</span>?
                    </p>
                    <p className="text-[11px] text-stone-500 mt-1">
                      O negócio será removido do pipeline ativo.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmClose(null)}
                      disabled={closing}
                      className="flex-1 py-2 text-sm text-text-muted border border-border rounded-lg hover:bg-surface-hover transition-all disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleMarkWon}
                      disabled={closing}
                      className="flex-1 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {closing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      {closing ? 'Salvando…' : 'Confirmar Ganho'}
                    </button>
                  </div>
                </div>
              )}

              {confirmClose === 'lost' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-rose-400 mb-2">
                      Motivo da perda
                    </p>
                    <textarea
                      value={lossReason}
                      onChange={e => setLossReason(e.target.value)}
                      placeholder="Descreva o motivo da perda (opcional)"
                      rows={3}
                      disabled={closing}
                      className="w-full bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-stone-600 outline-none focus:border-rose-500/40 resize-none transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmClose(null); setLossReason(''); }}
                      disabled={closing}
                      className="flex-1 py-2 text-sm text-text-muted border border-border rounded-lg hover:bg-surface-hover transition-all disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleMarkLost}
                      disabled={closing}
                      className="flex-1 py-2 text-sm font-semibold bg-rose-700 text-white rounded-lg hover:bg-rose-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {closing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <XCircle size={14} />
                      )}
                      {closing ? 'Salvando…' : 'Confirmar Perda'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact */}
          {deal.contact && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Contato
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-surface-hover border border-border flex items-center justify-center text-xs font-semibold text-text-muted uppercase shrink-0">
                  {deal.contact.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-primary">{deal.contact.full_name}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Conversa ── sempre visível */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600">
                Conversa
              </p>
              {!deal.conversation_id && !showLinkConv && (
                <button
                  onClick={() => {
                    setShowLinkConv(true);
                    fetchConversations('');
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-text-muted hover:text-text-main border border-border rounded-lg px-2.5 py-1 hover:bg-surface-hover transition-all"
                >
                  <Link2 size={11} />
                  Vincular
                </button>
              )}
            </div>

            {/* Caso 1: tem conversa vinculada */}
            {deal.conversation_id && deal.conversation && (
              <button
                onClick={() => navigate(`/inbox/${deal.conversation_id}`)}
                className="w-full flex items-center justify-between gap-3 p-3 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/20 hover:border-sky-500/40 rounded-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <MessageSquare size={14} className="text-sky-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-sky-300">
                      {CHANNEL_LABELS[deal.conversation.channel] || deal.conversation.channel}
                    </p>
                    <p className="text-[11px] text-sky-500/70 mt-0.5">Abrir conversa no Inbox</p>
                  </div>
                </div>
                <ExternalLink
                  size={14}
                  className="text-sky-600 group-hover:text-sky-400 transition-colors shrink-0"
                />
              </button>
            )}

            {/* Caso 1b: tem conversation_id mas conversation não carregado (join pendente) */}
            {deal.conversation_id && !deal.conversation && (
              <button
                onClick={() => navigate(`/inbox/${deal.conversation_id}`)}
                className="w-full flex items-center justify-between gap-3 p-3 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/20 rounded-lg transition-all group"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-sky-400" />
                  <span className="text-sm text-sky-300 font-medium">Abrir conversa no Inbox</span>
                </div>
                <ExternalLink size={14} className="text-sky-600 group-hover:text-sky-400 transition-colors" />
              </button>
            )}

            {/* Caso 2: sem conversa — estado vazio */}
            {!deal.conversation_id && !showLinkConv && (
              <div
                className="flex flex-col items-center justify-center py-5 border border-dashed border-border rounded-lg gap-2 cursor-pointer group hover:border-stone-500 hover:bg-surface-hover/30 transition-all"
                onClick={() => { setShowLinkConv(true); fetchConversations(''); }}
              >
                <MessageSquare size={18} className="text-stone-700 group-hover:text-stone-500 transition-colors" />
                <p className="text-[11px] text-stone-600 group-hover:text-stone-400 text-center leading-relaxed transition-colors">
                  Nenhuma conversa vinculada.<br />
                  <span className="text-stone-500 underline underline-offset-2">Clique para vincular</span>
                </p>
              </div>
            )}

            {/* Caso 3: seletor de conversa */}
            {showLinkConv && (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" />
                  <input
                    autoFocus
                    value={convSearch}
                    onChange={e => {
                      setConvSearch(e.target.value);
                      fetchConversations(e.target.value);
                    }}
                    placeholder="Buscar por contato ou canal…"
                    className="w-full bg-surface-hover border border-border rounded-lg pl-7 pr-3 py-2 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-text-muted transition-colors"
                  />
                </div>

                <div
                  className="space-y-1 max-h-48 overflow-y-auto"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}
                >
                  {loadingConvs ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={14} className="animate-spin text-stone-500" />
                    </div>
                  ) : convOptions.length === 0 ? (
                    <p className="text-center text-xs text-stone-600 py-4">Nenhuma conversa encontrada.</p>
                  ) : (
                    convOptions.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => linkConversation(conv.id)}
                        disabled={linkingConv}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover border border-transparent hover:border-border text-left transition-all disabled:opacity-50"
                      >
                        <div className="w-6 h-6 rounded bg-surface-hover border border-border flex items-center justify-center shrink-0">
                          <MessageSquare size={11} className="text-stone-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-main truncate">{conv.contact_name}</p>
                          <p className="text-[10px] text-stone-600">{CHANNEL_LABELS[conv.channel] || conv.channel}</p>
                        </div>
                        {linkingConv && <Loader2 size={11} className="ml-auto animate-spin text-stone-500 shrink-0" />}
                      </button>
                    ))
                  )}
                </div>

                <button
                  onClick={() => { setShowLinkConv(false); setConvSearch(''); }}
                  className="text-[11px] text-stone-600 hover:text-stone-400 transition-colors w-full text-center pt-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* Assigned user */}
          {deal.assigned_user && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Responsável
              </p>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-surface-hover border border-border flex items-center justify-center text-[10px] font-semibold text-text-muted uppercase shrink-0">
                  {deal.assigned_user.full_name.charAt(0)}
                </div>
                <span className="text-sm text-primary">{deal.assigned_user.full_name}</span>
              </div>
            </div>
          )}

          {/* Loss reason */}
          {deal.loss_reason && (
            <div className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                Motivo da Perda
              </p>
              <p className="text-sm text-text-main leading-relaxed whitespace-pre-wrap">
                {deal.loss_reason}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div className="p-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-4">
              Linha do Tempo
            </p>
            <div className="relative space-y-4 pl-4">
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />

              <div className="relative flex items-start gap-3">
                <div className="absolute -left-[11px] w-2 h-2 rounded-full bg-border border border-border mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-text-main">Deal criado</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                    <Calendar size={10} />
                    <span>{formatDate(deal.created_at)}</span>
                  </div>
                </div>
              </div>

              {deal.updated_at && deal.updated_at !== deal.created_at && !deal.closed_at && (
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[11px] w-2 h-2 rounded-full bg-stone-700 border border-stone-600 mt-1 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-text-main">Última atualização</p>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                      <Clock size={10} />
                      <span>{formatDate(deal.updated_at)}</span>
                    </div>
                  </div>
                </div>
              )}

              {currentStage && deal.status === 'open' && (
                <div className="relative flex items-start gap-3">
                  <div
                    className="absolute -left-[11px] w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: currentStage.color || '#6B7280' }}
                  />
                  <div>
                    <p className="text-xs font-medium text-text-main">Estágio atual</p>
                    <p className="text-[11px] text-stone-600 mt-1">{currentStage.name}</p>
                  </div>
                </div>
              )}

              {deal.closed_at && (
                <div className="relative flex items-start gap-3">
                  <div className={cn(
                    'absolute -left-[11px] w-2 h-2 rounded-full mt-1 shrink-0',
                    deal.status === 'won' ? 'bg-emerald-500' : 'bg-rose-500'
                  )} />
                  <div>
                    <p className="text-xs font-medium text-text-main">
                      {deal.status === 'won' ? 'Negócio ganho' : 'Negócio perdido'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600">
                      <Calendar size={10} />
                      <span>{formatDate(deal.closed_at)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="p-4 border-t border-border shrink-0">
          <p className="text-[10px] text-stone-700 font-mono text-center">
            ID: {deal.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    </>
  );
};
