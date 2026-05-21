import type { TenantPlan, AdminTenantRow, RealTenant } from './adminTypes';

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value);
}

export function formatBRLCompact(value: number): string {
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}k`;
  return formatBRL(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function hashHSL(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 28%)`;
}

export const STATUS_CFG: Record<string, {
  label: string; dot: string; bg: string; text: string; border: string;
}> = {
  active:   { label: 'Ativo',     dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  trial:    { label: 'Trial',     dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  at_risk:  { label: 'Em risco',  dot: 'bg-rose-400',    bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/20' },
  suspended:{ label: 'Suspenso',  dot: 'bg-orange-400',  bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20' },
  no_plan:  { label: 'Sem plano', dot: 'bg-zinc-500',    bg: 'bg-zinc-800/40',    text: 'text-zinc-500',    border: 'border-zinc-700/30' },
  none:     { label: 'Sem plano', dot: 'bg-zinc-500',    bg: 'bg-zinc-800/40',    text: 'text-zinc-500',    border: 'border-zinc-700/30' },
  churned:  { label: 'Churn',     dot: 'bg-rose-300',    bg: 'bg-rose-500/[0.06]',text: 'text-rose-300',    border: 'border-rose-500/15' },
};

export const PLAN_CFG: Record<TenantPlan, {
  label: string; swatch: string; text: string; bg: string; border: string;
}> = {
  basic:      { label: 'Basic',      swatch: 'bg-zinc-500',    text: 'text-zinc-400',   bg: 'bg-zinc-800/40',    border: 'border-zinc-700/30' },
  pro:        { label: 'Pro',        swatch: 'bg-cyan-500',    text: 'text-cyan-400',   bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  enterprise: { label: 'Enterprise', swatch: 'bg-violet-500',  text: 'text-violet-400', bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
};

/** Converte uma linha do rpc_get_admin_tenants_table para o modelo canônico RealTenant */
export function toRealTenant(row: AdminTenantRow): RealTenant {
  const ai = Number(row.ai_managed_conversations ?? 0);
  const total = Number(row.total_conversations ?? 0);
  return {
    id:                 row.company_id,
    name:               row.company_name,
    status:             row.status ?? 'none',
    plan:               row.plan_name ?? 'Sem plano',
    mrr:                Number(row.price_monthly ?? 0),
    openDealsCount:     Number(row.open_deals_count ?? 0),
    openDealsValue:     Number(row.open_deals_value ?? 0),
    wonDealsValue:      Number(row.closed_won_value ?? 0),
    wonDealsCount:      0,
    aiAdoptionPct:      total > 0 ? Math.round((ai / total) * 100) : 0,
    totalConversations: total,
    aiConversations:    ai,
    createdAt:          row.subscribed_at ?? null,
    activeUsers:        0,
    totalUsers:         0,
    messageVolume:      0,
    teams:              [],
    users:              [],
  };
}

export const TEAM_COLOR_MAP: Record<string, string> = {
  cyan:    'bg-cyan-500/15 text-cyan-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  violet:  'bg-violet-500/15 text-violet-400',
  rose:    'bg-rose-500/15 text-rose-400',
  amber:   'bg-amber-500/15 text-amber-400',
  orange:  'bg-orange-500/15 text-orange-400',
};
