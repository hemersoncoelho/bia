import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Plus,
  RefreshCw,
  AlertCircle,
  Loader2,
  Save,
  UserPlus,
  UsersRound,
  Receipt,
  CreditCard,
  History,
  ShieldCheck,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { supabase } from '../../lib/supabase';
import type {
  AdminAuditLog,
  AdminFinancialEntry,
  AdminTenantDetail,
  AdminTenantModule,
  FinancialEntryStatus,
  FinancialEntryType,
  RealTenant,
} from './adminTypes';
import { formatBRL, formatDate } from './adminUtils';
import { TenantHero } from './components/TenantHero';
import { TenantSummary } from './components/TenantSummary';
import { SupportBanner } from './components/SupportBanner';
import { ModulesGrid } from './components/ModulesGrid';
import { UserRow } from './components/UserRow';
import { SupportConfirmModal } from './components/SupportConfirmModal';

type DetailTab = 'geral' | 'users' | 'modulos' | 'faturamento' | 'logs';

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

interface CompanyFormState {
  name: string;
  isActive: boolean;
}

interface SubscriptionFormState {
  planId: string;
  status: string;
}

interface InviteFormState {
  email: string;
  role: string;
  teamId: string;
}

interface NewFinancialEntryFormState {
  type: FinancialEntryType;
  amount: string;
  status: FinancialEntryStatus;
  description: string;
  referenceMonth: string;
  dueDate: string;
  notes: string;
  currency: string;
}

interface FinancialEntryDraft {
  status: FinancialEntryStatus;
  description: string;
  referenceMonth: string;
  dueDate: string;
  notes: string;
}

interface PaymentDraft {
  amount: string;
  method: string;
  paidAt: string;
  notes: string;
}

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: 'geral', label: 'Visão Geral' },
  { value: 'users', label: 'Times & Usuários' },
  { value: 'modulos', label: 'Módulos' },
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'logs', label: 'Logs & Auditoria' },
];

const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Ativo' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'churned', label: 'Churn' },
];

const ROLE_OPTIONS = [
  { value: 'company_admin', label: 'Admin' },
  { value: 'manager', label: 'Gerente' },
  { value: 'agent', label: 'Agente' },
];

const FINANCIAL_TYPE_OPTIONS: { value: FinancialEntryType; label: string }[] = [
  { value: 'manual_charge', label: 'Cobrança manual' },
  { value: 'manual_credit', label: 'Crédito/desconto' },
  { value: 'subscription_charge', label: 'Assinatura' },
  { value: 'setup_fee', label: 'Setup' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'refund', label: 'Reembolso' },
];

const FINANCIAL_STATUS_OPTIONS: { value: FinancialEntryStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'paid', label: 'Pago' },
  { value: 'partially_paid', label: 'Parcial' },
  { value: 'overdue', label: 'Vencido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const FINANCIAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};

const FINANCIAL_TYPE_LABELS = Object.fromEntries(
  FINANCIAL_TYPE_OPTIONS.map(option => [option.value, option.label])
) as Record<FinancialEntryType, string>;

const inputClass =
  'w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-700 outline-none focus:border-orange-500/50 transition-colors disabled:opacity-60';

const labelClass = 'text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1.5';

const HeroSkeleton: React.FC = () => (
  <div className="flex flex-col sm:flex-row sm:items-start gap-6 pb-6 border-b border-white/[0.06] animate-pulse">
    <div className="w-16 h-16 rounded-2xl bg-white/[0.07] shrink-0" />
    <div className="flex-1 space-y-3">
      <div className="h-8 w-48 bg-white/[0.07] rounded" />
      <div className="h-4 w-72 bg-white/[0.04] rounded" />
    </div>
  </div>
);

function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

function monthInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : '';
}

function toIsoMonth(value: string): string | null {
  return value ? `${value}-01` : null;
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asTenantDetail(data: unknown): AdminTenantDetail {
  return data as AdminTenantDetail;
}

function toRealTenant(detail: AdminTenantDetail): RealTenant {
  return {
    id: detail.company.id,
    name: detail.company.name,
    status: detail.subscription.status ?? (detail.company.is_active ? 'no_plan' : 'suspended'),
    plan: detail.subscription.plan_name ?? 'Sem plano',
    mrr: Number(detail.metrics.mrr ?? 0),
    openDealsCount: Number(detail.metrics.open_deals_count ?? 0),
    openDealsValue: Number(detail.metrics.open_deals_value ?? 0),
    wonDealsValue: Number(detail.metrics.won_deals_value ?? 0),
    wonDealsCount: Number(detail.metrics.won_deals_count ?? 0),
    aiAdoptionPct: Number(detail.metrics.ai_adoption_pct ?? 0),
    totalConversations: Number(detail.metrics.total_conversations ?? 0),
    aiConversations: Number(detail.metrics.ai_conversations ?? 0),
    createdAt: detail.company.created_at,
    activeUsers: Number(detail.metrics.active_users ?? 0),
    totalUsers: Number(detail.metrics.total_users ?? 0),
    messageVolume: Number(detail.metrics.message_volume ?? 0),
    teams: detail.teams.map(team => ({
      id: team.id,
      name: team.name,
      color: 'orange',
      manager: team.manager_name ?? 'Sem gerente',
      memberCount: Number(team.member_count ?? 0),
    })),
    users: detail.users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarInitials: user.name.slice(0, 2).toUpperCase(),
    })),
  };
}

function totalFinancial(entries: AdminFinancialEntry[], status?: FinancialEntryStatus): number {
  return entries
    .filter(entry => !status || entry.status === status)
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
}

function statusBadgeClass(status: string): string {
  if (status === 'paid') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
  if (status === 'partially_paid') return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400';
  if (status === 'overdue' || status === 'cancelled') return 'border-rose-500/20 bg-rose-500/10 text-rose-400';
  return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
}

function buildEntryDrafts(detail: AdminTenantDetail): Record<string, FinancialEntryDraft> {
  return Object.fromEntries(detail.financial_entries.map(entry => [
    entry.id,
    {
      status: entry.stored_status ?? entry.status,
      description: entry.description ?? '',
      referenceMonth: monthInputValue(entry.reference_month),
      dueDate: dateInputValue(entry.due_date),
      notes: entry.notes ?? '',
    },
  ]));
}

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta?: string;
}> = ({ icon, title, meta }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <div className="flex items-center gap-2">
      <span className="text-orange-400">{icon}</span>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
    </div>
    {meta && <span className="text-xs font-mono text-zinc-600">{meta}</span>}
  </div>
);

export const TenantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enableSupportMode } = useTenant();

  const [detail, setDetail] = useState<AdminTenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('geral');
  const [showSupport, setShowSupport] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingModuleSlug, setSavingModuleSlug] = useState<string | null>(null);

  const [companyForm, setCompanyForm] = useState<CompanyFormState>({ name: '', isActive: true });
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionFormState>({ planId: '', status: 'active' });
  const [inviteForm, setInviteForm] = useState<InviteFormState>({ email: '', role: 'agent', teamId: '' });
  const [newEntryForm, setNewEntryForm] = useState<NewFinancialEntryFormState>({
    type: 'manual_charge',
    amount: '',
    status: 'pending',
    description: '',
    referenceMonth: '',
    dueDate: '',
    notes: '',
    currency: 'BRL',
  });
  const [entryDrafts, setEntryDrafts] = useState<Record<string, FinancialEntryDraft>>({});
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({});

  const applyTenantDetail = useCallback((nextDetail: AdminTenantDetail) => {
    setDetail(nextDetail);
    setCompanyForm({
      name: nextDetail.company.name,
      isActive: nextDetail.company.is_active,
    });
    setSubscriptionForm({
      planId: nextDetail.subscription.plan_id ?? nextDetail.plans[0]?.id ?? '',
      status: nextDetail.subscription.status ?? 'active',
    });
    setEntryDrafts(buildEntryDrafts(nextDetail));
  }, []);

  const fetchTenant = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcErr } = await supabase.rpc('rpc_get_admin_tenant_detail', {
      p_company_id: id,
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setDetail(null);
    } else if (!data) {
      setError('Empresa não encontrada.');
      setDetail(null);
    } else {
      applyTenantDetail(asTenantDetail(data));
    }
    setLoading(false);
  }, [applyTenantDetail, id]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchTenant();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchTenant]);

  const tenant = useMemo(() => (detail ? toRealTenant(detail) : null), [detail]);

  const runDetailMutation = async (
    key: string,
    request: () => PromiseLike<RpcResult>,
    successMessage: string
  ) => {
    setSavingKey(key);
    setError(null);
    setNotice(null);
    const { data, error: rpcErr } = await request();
    if (rpcErr) {
      setError(rpcErr.message);
    } else if (data) {
      applyTenantDetail(asTenantDetail(data));
      setNotice(successMessage);
    } else {
      await fetchTenant();
      setNotice(successMessage);
    }
    setSavingKey(null);
  };

  const saveCompany = async () => {
    if (!detail) return;
    await runDetailMutation(
      'company',
      () => supabase.rpc('rpc_admin_update_company', {
        p_company_id: detail.company.id,
        p_name: companyForm.name,
        p_is_active: companyForm.isActive,
      }),
      'Dados do tenant atualizados.'
    );
  };

  const saveSubscription = async () => {
    if (!detail || !subscriptionForm.planId) return;
    await runDetailMutation(
      'subscription',
      () => supabase.rpc('rpc_admin_update_subscription', {
        p_company_id: detail.company.id,
        p_plan_id: subscriptionForm.planId,
        p_status: subscriptionForm.status,
        p_trial_ends_at: null,
        p_churned_at: subscriptionForm.status === 'churned' ? new Date().toISOString() : null,
        p_churn_reason: null,
      }),
      'Assinatura atualizada.'
    );
  };

  const toggleModule = async (module: AdminTenantModule, nextEnabled: boolean) => {
    if (!detail) return;
    setSavingModuleSlug(module.slug);
    setError(null);
    setNotice(null);

    const { data, error: rpcErr } = await supabase.rpc('rpc_admin_set_company_module', {
      p_company_id: detail.company.id,
      p_module_slug: module.slug,
      p_is_enabled: nextEnabled,
    });

    if (rpcErr) setError(rpcErr.message);
    else if (data) {
      applyTenantDetail(asTenantDetail(data));
      setNotice(`Módulo ${module.name} ${nextEnabled ? 'ativado' : 'desativado'}.`);
    }
    setSavingModuleSlug(null);
  };

  const inviteUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || !inviteForm.email.trim()) return;

    setSavingKey('invite');
    setError(null);
    setNotice(null);

    const { error: rpcErr } = await supabase.rpc('rpc_admin_invite_company_member', {
      p_company_id: detail.company.id,
      p_email: inviteForm.email.trim().toLowerCase(),
      p_role: inviteForm.role,
      p_team_id: inviteForm.teamId || null,
    });

    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      setInviteForm({ email: '', role: 'agent', teamId: '' });
      await fetchTenant();
      setNotice('Convite/vínculo registrado.');
    }
    setSavingKey(null);
  };

  const createFinancialEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    const amount = Number(newEntryForm.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Informe um valor financeiro válido.');
      return;
    }

    await runDetailMutation(
      'new-entry',
      () => supabase.rpc('rpc_admin_create_financial_entry', {
        p_company_id: detail.company.id,
        p_type: newEntryForm.type,
        p_amount: amount,
        p_status: newEntryForm.status,
        p_description: toNullable(newEntryForm.description),
        p_reference_month: toIsoMonth(newEntryForm.referenceMonth),
        p_due_date: newEntryForm.dueDate || null,
        p_notes: toNullable(newEntryForm.notes),
        p_currency: newEntryForm.currency || 'BRL',
      }),
      'Lançamento financeiro criado.'
    );

    setNewEntryForm({
      type: 'manual_charge',
      amount: '',
      status: 'pending',
      description: '',
      referenceMonth: '',
      dueDate: '',
      notes: '',
      currency: 'BRL',
    });
  };

  const updateFinancialEntry = async (entry: AdminFinancialEntry) => {
    if (!detail) return;
    const draft = entryDrafts[entry.id];
    if (!draft) return;

    await runDetailMutation(
      `entry-${entry.id}`,
      () => supabase.rpc('rpc_admin_update_financial_entry', {
        p_company_id: detail.company.id,
        p_entry_id: entry.id,
        p_status: draft.status,
        p_description: toNullable(draft.description),
        p_reference_month: toIsoMonth(draft.referenceMonth),
        p_due_date: draft.dueDate || null,
        p_notes: draft.notes,
      }),
      'Lançamento financeiro atualizado.'
    );
  };

  const recordPayment = async (entry: AdminFinancialEntry, markRemainingPaid: boolean) => {
    if (!detail) return;
    const draft = paymentDrafts[entry.id] ?? { amount: '', method: '', paidAt: dateInputValue(new Date().toISOString()), notes: '' };
    const amount = markRemainingPaid ? Number(entry.remaining_amount) : Number(draft.amount.replace(',', '.'));
    if (!markRemainingPaid && (!Number.isFinite(amount) || amount <= 0)) {
      setError('Informe um valor de pagamento válido.');
      return;
    }

    await runDetailMutation(
      `payment-${entry.id}`,
      () => supabase.rpc('rpc_admin_record_financial_payment', {
        p_company_id: detail.company.id,
        p_entry_id: entry.id,
        p_amount: markRemainingPaid ? null : amount,
        p_payment_method: toNullable(draft.method),
        p_paid_at: draft.paidAt ? new Date(`${draft.paidAt}T12:00:00`).toISOString() : new Date().toISOString(),
        p_notes: toNullable(draft.notes),
        p_mark_remaining_paid: markRemainingPaid,
      }),
      markRemainingPaid ? 'Saldo marcado como pago.' : 'Pagamento parcial registrado.'
    );

    setPaymentDrafts(prev => ({
      ...prev,
      [entry.id]: { amount: '', method: '', paidAt: dateInputValue(new Date().toISOString()), notes: '' },
    }));
  };

  const handleSupportConfirm = async () => {
    if (!id) return;
    await enableSupportMode(id);
    navigate('/');
  };

  const financialEntries = detail?.financial_entries ?? [];
  const totalPending = financialEntries
    .filter(entry => ['pending', 'partially_paid', 'overdue'].includes(entry.status))
    .reduce((sum, entry) => sum + Number(entry.remaining_amount ?? 0), 0);

  return (
    <>
      <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="max-w-7xl mx-auto space-y-6" style={{ animation: 'fadeSlideUp 0.35s ease both' }}>
        <button
          type="button"
          onClick={() => navigate('/admin/tenants')}
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-orange-400 transition-colors"
        >
          <ArrowLeft size={13} /> Voltar para Tenants
        </button>

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle size={15} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={fetchTenant}
              className="text-xs px-3 py-1.5 rounded border border-rose-500/30 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Tentar novamente
            </button>
          </div>
        )}

        {notice && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            <ShieldCheck size={15} className="shrink-0" />
            {notice}
          </div>
        )}

        {loading ? <HeroSkeleton /> : tenant && (
          <TenantHero tenant={tenant} onSupportMode={() => setShowSupport(true)} />
        )}

        {!loading && tenant && <TenantSummary tenant={tenant} />}

        {!loading && detail && tenant && (
          <>
            <div
              className="flex items-end gap-0 border-b border-white/[0.06] overflow-x-auto"
              role="tablist"
              aria-label="Detalhes do tenant"
            >
              {DETAIL_TABS.map(tab => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 border-b-2 ${
                    activeTab === tab.value
                      ? 'text-white border-orange-500'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'geral' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                    <SectionHeader icon={<Save size={16} />} title="Dados do tenant" />
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
                      <label>
                        <span className={labelClass}>Nome</span>
                        <input
                          value={companyForm.name}
                          onChange={event => setCompanyForm(prev => ({ ...prev, name: event.target.value }))}
                          className={inputClass}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Operacional</span>
                        <select
                          value={companyForm.isActive ? 'active' : 'inactive'}
                          onChange={event => setCompanyForm(prev => ({ ...prev, isActive: event.target.value === 'active' }))}
                          className={inputClass}
                        >
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={saveCompany}
                        disabled={savingKey === 'company' || !companyForm.name.trim()}
                        className="h-[42px] px-4 rounded-lg bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {savingKey === 'company' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-600 font-mono mt-3 break-all">company_id: {detail.company.id}</p>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                    <SectionHeader icon={<CreditCard size={16} />} title="Plano e assinatura" />
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
                      <label>
                        <span className={labelClass}>Plano</span>
                        <select
                          value={subscriptionForm.planId}
                          onChange={event => setSubscriptionForm(prev => ({ ...prev, planId: event.target.value }))}
                          className={inputClass}
                          disabled={detail.plans.length === 0}
                        >
                          {detail.plans.length === 0 ? (
                            <option value="">Nenhum plano ativo</option>
                          ) : detail.plans.map(plan => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name} · {formatBRL(Number(plan.price_monthly ?? 0))}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={labelClass}>Status</span>
                        <select
                          value={subscriptionForm.status}
                          onChange={event => setSubscriptionForm(prev => ({ ...prev, status: event.target.value }))}
                          className={inputClass}
                        >
                          {SUBSCRIPTION_STATUS_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={saveSubscription}
                        disabled={savingKey === 'subscription' || !subscriptionForm.planId}
                        className="h-[42px] px-4 rounded-lg bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {savingKey === 'subscription' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.015]">
                    <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Usuários</span>
                      <span className="text-xs text-zinc-600 font-mono">{detail.metrics.total_users} total</span>
                    </div>
                    <div className="p-2">
                      {detail.users.length > 0 ? detail.users.slice(0, 5).map(user => (
                        <UserRow key={user.id} user={user} onSupport={() => setShowSupport(true)} />
                      )) : (
                        <div className="py-8 text-center text-zinc-600 text-sm">Nenhum usuário vinculado.</div>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTab('users')}
                        className="w-full mt-1 py-2.5 flex items-center justify-center gap-2 text-xs text-zinc-600 border border-dashed border-white/[0.06] rounded-xl hover:border-orange-500/30 hover:text-orange-400 transition-all"
                      >
                        <Plus size={12} /> Gerenciar usuários
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <SupportBanner tenant={tenant} onEnter={() => setShowSupport(true)} />
                  <ModulesGrid modules={detail.modules} onToggle={toggleModule} savingSlug={savingModuleSlug} compact />
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                  <SectionHeader icon={<UsersRound size={16} />} title="Times" meta={`${detail.teams.length} times`} />
                  {detail.teams.length === 0 ? (
                    <div className="py-10 text-center text-zinc-600 text-sm">Nenhum time cadastrado.</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.teams.map(team => (
                        <div key={team.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-white">{team.name}</span>
                            <span className="text-xs font-mono text-zinc-600">{team.member_count} membro{team.member_count !== 1 ? 's' : ''}</span>
                          </div>
                          <p className="text-[11px] text-zinc-600 mt-1">Gerente: {team.manager_name ?? 'Não definido'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <form onSubmit={inviteUser} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                    <SectionHeader icon={<UserPlus size={16} />} title="Convidar usuário" />
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_170px_auto] gap-3 items-end">
                      <label>
                        <span className={labelClass}>Email</span>
                        <input
                          type="email"
                          value={inviteForm.email}
                          onChange={event => setInviteForm(prev => ({ ...prev, email: event.target.value }))}
                          placeholder="usuario@empresa.com"
                          className={inputClass}
                          required
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Papel</span>
                        <select
                          value={inviteForm.role}
                          onChange={event => setInviteForm(prev => ({ ...prev, role: event.target.value }))}
                          className={inputClass}
                        >
                          {ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={labelClass}>Time</span>
                        <select
                          value={inviteForm.teamId}
                          onChange={event => setInviteForm(prev => ({ ...prev, teamId: event.target.value }))}
                          className={inputClass}
                        >
                          <option value="">Sem time</option>
                          {detail.teams.map(team => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={savingKey === 'invite' || !inviteForm.email.trim()}
                        className="h-[42px] px-4 rounded-lg bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {savingKey === 'invite' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                        Convidar
                      </button>
                    </div>
                  </form>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Usuários da empresa</span>
                      <span className="text-xs text-zinc-600 font-mono">{detail.metrics.active_users} ativos</span>
                    </div>
                    <div className="p-2">
                      {detail.users.length === 0 ? (
                        <div className="py-10 text-center text-zinc-600 text-sm">Nenhum usuário vinculado.</div>
                      ) : detail.users.map(user => (
                        <UserRow key={user.id} user={user} onSupport={() => setShowSupport(true)} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'modulos' && (
              <ModulesGrid modules={detail.modules} onToggle={toggleModule} savingSlug={savingModuleSlug} />
            )}

            {activeTab === 'faturamento' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">MRR atual</span>
                    <p className="text-2xl font-semibold text-white mt-1">{formatBRL(detail.metrics.mrr)}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Saldo pendente</span>
                    <p className="text-2xl font-semibold text-amber-400 mt-1">{formatBRL(totalPending)}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Pago no histórico</span>
                    <p className="text-2xl font-semibold text-emerald-400 mt-1">{formatBRL(totalFinancial(financialEntries, 'paid'))}</p>
                  </div>
                </div>

                <form onSubmit={createFinancialEntry} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
                  <SectionHeader icon={<Receipt size={16} />} title="Adicionar valor manual" />
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label>
                      <span className={labelClass}>Tipo</span>
                      <select
                        value={newEntryForm.type}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, type: event.target.value as FinancialEntryType }))}
                        className={inputClass}
                      >
                        {FINANCIAL_TYPE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>Valor</span>
                      <input
                        value={newEntryForm.amount}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, amount: event.target.value }))}
                        placeholder="500,00"
                        inputMode="decimal"
                        className={inputClass}
                        required
                      />
                    </label>
                    <label>
                      <span className={labelClass}>Status</span>
                      <select
                        value={newEntryForm.status}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, status: event.target.value as FinancialEntryStatus }))}
                        className={inputClass}
                      >
                        {FINANCIAL_STATUS_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>Mês referência</span>
                      <input
                        type="month"
                        value={newEntryForm.referenceMonth}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, referenceMonth: event.target.value }))}
                        className={inputClass}
                      />
                    </label>
                    <label className="md:col-span-2">
                      <span className={labelClass}>Descrição</span>
                      <input
                        value={newEntryForm.description}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, description: event.target.value }))}
                        placeholder="Cobrança manual, setup, desconto..."
                        className={inputClass}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>Vencimento</span>
                      <input
                        type="date"
                        value={newEntryForm.dueDate}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, dueDate: event.target.value }))}
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={savingKey === 'new-entry'}
                      className="self-end h-[42px] px-4 rounded-lg bg-orange-500 text-black text-sm font-semibold hover:bg-orange-400 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {savingKey === 'new-entry' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Adicionar
                    </button>
                    <label className="md:col-span-4">
                      <span className={labelClass}>Observação</span>
                      <textarea
                        value={newEntryForm.notes}
                        onChange={event => setNewEntryForm(prev => ({ ...prev, notes: event.target.value }))}
                        rows={2}
                        className={inputClass}
                      />
                    </label>
                  </div>
                </form>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.04]">
                    <SectionHeader icon={<History size={16} />} title="Histórico financeiro" meta={`${financialEntries.length} lançamentos`} />
                  </div>
                  {financialEntries.length === 0 ? (
                    <div className="py-12 text-center text-zinc-600 text-sm">Nenhum lançamento financeiro registrado.</div>
                  ) : (
                    <div className="divide-y divide-white/[0.05]">
                      {financialEntries.map(entry => {
                        const entryDraft = entryDrafts[entry.id];
                        const paymentDraft = paymentDrafts[entry.id] ?? {
                          amount: '',
                          method: '',
                          paidAt: dateInputValue(new Date().toISOString()),
                          notes: '',
                        };
                        return (
                          <div key={entry.id} className="p-5 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadgeClass(entry.status)}`}>
                                    {FINANCIAL_STATUS_LABELS[entry.status] ?? entry.status}
                                  </span>
                                  <span className="text-xs text-zinc-500">{FINANCIAL_TYPE_LABELS[entry.type]}</span>
                                </div>
                                <p className="text-sm text-white mt-2">{entry.description || 'Sem descrição'}</p>
                                <p className="text-[11px] text-zinc-600 mt-1">
                                  Criado em {formatDate(entry.created_at)}
                                  {entry.due_date ? ` · vence ${formatDate(entry.due_date)}` : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-semibold text-white">{formatBRL(Number(entry.amount))}</p>
                                <p className="text-[11px] text-zinc-600">
                                  pago {formatBRL(Number(entry.paid_amount))} · saldo {formatBRL(Number(entry.remaining_amount))}
                                </p>
                              </div>
                            </div>

                            {entryDraft && (
                              <div className="grid grid-cols-1 md:grid-cols-[150px_1fr_150px_150px_auto] gap-3 items-end">
                                <label>
                                  <span className={labelClass}>Status</span>
                                  <select
                                    value={entryDraft.status}
                                    onChange={event => setEntryDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...entryDraft, status: event.target.value as FinancialEntryStatus },
                                    }))}
                                    className={inputClass}
                                  >
                                    {FINANCIAL_STATUS_OPTIONS.map(option => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span className={labelClass}>Descrição</span>
                                  <input
                                    value={entryDraft.description}
                                    onChange={event => setEntryDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...entryDraft, description: event.target.value },
                                    }))}
                                    className={inputClass}
                                  />
                                </label>
                                <label>
                                  <span className={labelClass}>Referência</span>
                                  <input
                                    type="month"
                                    value={entryDraft.referenceMonth}
                                    onChange={event => setEntryDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...entryDraft, referenceMonth: event.target.value },
                                    }))}
                                    className={inputClass}
                                  />
                                </label>
                                <label>
                                  <span className={labelClass}>Vencimento</span>
                                  <input
                                    type="date"
                                    value={entryDraft.dueDate}
                                    onChange={event => setEntryDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...entryDraft, dueDate: event.target.value },
                                    }))}
                                    className={inputClass}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => updateFinancialEntry(entry)}
                                  disabled={savingKey === `entry-${entry.id}`}
                                  className="h-[42px] px-4 rounded-lg border border-white/[0.08] text-zinc-300 text-sm hover:text-white hover:border-orange-500/30 disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                  {savingKey === `entry-${entry.id}` ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                  Salvar
                                </button>
                                <label className="md:col-span-5">
                                  <span className={labelClass}>Observação financeira</span>
                                  <textarea
                                    value={entryDraft.notes}
                                    onChange={event => setEntryDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...entryDraft, notes: event.target.value },
                                    }))}
                                    rows={2}
                                    className={inputClass}
                                  />
                                </label>
                              </div>
                            )}

                            {entry.status !== 'paid' && entry.status !== 'cancelled' && Number(entry.remaining_amount) > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-[140px_150px_150px_1fr_auto_auto] gap-3 items-end rounded-lg bg-white/[0.02] border border-white/[0.05] p-3">
                                <label>
                                  <span className={labelClass}>Pagamento</span>
                                  <input
                                    value={paymentDraft.amount}
                                    onChange={event => setPaymentDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...paymentDraft, amount: event.target.value },
                                    }))}
                                    placeholder="200,00"
                                    inputMode="decimal"
                                    className={inputClass}
                                  />
                                </label>
                                <label>
                                  <span className={labelClass}>Método</span>
                                  <input
                                    value={paymentDraft.method}
                                    onChange={event => setPaymentDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...paymentDraft, method: event.target.value },
                                    }))}
                                    placeholder="PIX, cartão..."
                                    className={inputClass}
                                  />
                                </label>
                                <label>
                                  <span className={labelClass}>Pago em</span>
                                  <input
                                    type="date"
                                    value={paymentDraft.paidAt}
                                    onChange={event => setPaymentDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...paymentDraft, paidAt: event.target.value },
                                    }))}
                                    className={inputClass}
                                  />
                                </label>
                                <label>
                                  <span className={labelClass}>Nota</span>
                                  <input
                                    value={paymentDraft.notes}
                                    onChange={event => setPaymentDrafts(prev => ({
                                      ...prev,
                                      [entry.id]: { ...paymentDraft, notes: event.target.value },
                                    }))}
                                    className={inputClass}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => recordPayment(entry, false)}
                                  disabled={savingKey === `payment-${entry.id}`}
                                  className="h-[42px] px-3 rounded-lg border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/10 disabled:opacity-60"
                                >
                                  Parcial
                                </button>
                                <button
                                  type="button"
                                  onClick={() => recordPayment(entry, true)}
                                  disabled={savingKey === `payment-${entry.id}`}
                                  className="h-[42px] px-3 rounded-lg bg-emerald-500 text-black text-xs font-semibold hover:bg-emerald-400 disabled:opacity-60"
                                >
                                  Quitar
                                </button>
                              </div>
                            )}

                            {entry.payments.length > 0 && (
                              <div className="pl-3 border-l border-white/[0.06] space-y-1.5">
                                {entry.payments.map(payment => (
                                  <p key={payment.id} className="text-[11px] text-zinc-500">
                                    {formatDate(payment.paid_at)} · {formatBRL(Number(payment.amount))}
                                    {payment.payment_method ? ` · ${payment.payment_method}` : ''}
                                    {payment.notes ? ` · ${payment.notes}` : ''}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <AuditLogsPanel logs={detail.audit_logs} />
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

const AuditLogsPanel: React.FC<{ logs: AdminAuditLog[] }> = ({ logs }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
    <div className="px-5 py-4 border-b border-white/[0.04]">
      <SectionHeader icon={<Clock size={16} />} title="Logs & Auditoria" meta={`${logs.length} eventos`} />
    </div>
    {logs.length === 0 ? (
      <div className="py-12 text-center text-zinc-600 text-sm">Nenhum log registrado para este tenant.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">Data</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">Usuário</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">Ação</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">Entidade</th>
              <th className="text-left px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">Origem</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="px-5 py-3 text-xs text-zinc-300">{log.actor_name}</td>
                <td className="px-5 py-3 text-xs font-mono text-orange-300">{log.action}</td>
                <td className="px-5 py-3 text-xs text-zinc-500">
                  {log.entity_type ?? '—'}
                  {log.entity_id ? <span className="block text-[10px] font-mono text-zinc-700">{log.entity_id.slice(0, 8)}...</span> : null}
                </td>
                <td className="px-5 py-3 text-xs text-zinc-500">{log.origin ?? 'admin_panel'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
