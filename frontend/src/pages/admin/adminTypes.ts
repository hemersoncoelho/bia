export type TenantStatus = 'active' | 'trial' | 'at_risk' | 'suspended' | 'no_plan' | 'churned';
export type TenantPlan = 'basic' | 'pro' | 'enterprise';
export type AdminTabValue = 'lista' | 'analytics' | 'ranking';
export type AdminPeriod = '7d' | '30d' | '90d' | '1y';
export type RankMetric = 'mrr' | 'pipeline' | 'deals_won' | 'ia_adoption' | 'active_users' | 'messages';

/** Shape retornada por rpc_get_admin_tenants_table */
export interface AdminTenantRow {
  company_id: string;
  company_name: string;
  status: string;
  plan_name: string;
  price_monthly: number;
  subscribed_at: string | null;
  churned_at: string | null;
  open_deals_count: number;
  open_deals_value: number;
  closed_won_value: number;
  ai_managed_conversations: number;
  total_conversations: number;
}

/** Shape retornada por rpc_get_admin_kpi_global */
export interface AdminKpiGlobal {
  total_companies: number;
  active_companies: number;
  trial_companies: number;
  churned_companies: number;
  churn_rate_pct: number;
  mrr: number;
  avg_ticket: number;
  open_deals_count: number;
  open_deals_value: number;
  closed_won_count: number;
  closed_won_value: number;
  ai_managed_conversations: number;
}

/** Modelo canônico de tenant usado por todos os componentes de admin */
export interface RealTenant {
  id: string;
  name: string;
  status: string;
  plan: string;
  mrr: number;
  openDealsCount: number;
  openDealsValue: number;
  wonDealsValue: number;
  wonDealsCount: number;
  aiAdoptionPct: number;
  totalConversations: number;
  aiConversations: number;
  createdAt: string | null;
  activeUsers: number;
  totalUsers: number;
  messageVolume: number;
  teams: { id: string; name: string; color: string; manager: string; memberCount: number }[];
  users: { id: string; name: string; email: string; role: string; avatarInitials: string }[];
}
