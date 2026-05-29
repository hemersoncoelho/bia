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

export type MockTeam = { id: string; name: string; color: string; manager: string; memberCount: number };
export type MockUser = { id: string; name: string; email: string; role: string; avatarInitials: string };

export type FinancialEntryType =
  | 'manual_charge'
  | 'manual_credit'
  | 'subscription_charge'
  | 'setup_fee'
  | 'adjustment'
  | 'refund';

export type FinancialEntryStatus =
  | 'pending'
  | 'paid'
  | 'partially_paid'
  | 'cancelled'
  | 'overdue';

export interface AdminPlan {
  id: string;
  name: string;
  price_monthly: number;
  description: string | null;
  is_active: boolean;
}

export interface AdminTenantDetail {
  company: {
    id: string;
    name: string;
    is_active: boolean;
    created_at: string | null;
  };
  subscription: {
    id?: string;
    plan_id?: string;
    plan_name?: string;
    price_monthly?: number;
    status?: string;
    trial_ends_at?: string | null;
    subscribed_at?: string | null;
    churned_at?: string | null;
    churn_reason?: string | null;
    updated_at?: string | null;
  };
  plans: AdminPlan[];
  metrics: {
    mrr: number;
    open_deals_count: number;
    open_deals_value: number;
    won_deals_count: number;
    won_deals_value: number;
    ai_conversations: number;
    total_conversations: number;
    ai_adoption_pct: number;
    total_users: number;
    active_users: number;
    total_teams: number;
    active_modules: number;
    total_modules: number;
    message_volume: number;
  };
  users: AdminTenantUser[];
  teams: AdminTenantTeam[];
  modules: AdminTenantModule[];
  financial_entries: AdminFinancialEntry[];
  audit_logs: AdminAuditLog[];
}

export interface AdminTenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | string;
  joined_at: string | null;
  team_id: string | null;
  team_name: string | null;
}

export interface AdminTenantTeam {
  id: string;
  name: string;
  slug: string;
  manager_id: string | null;
  manager_name: string | null;
  member_count: number;
  created_at: string | null;
}

export interface AdminTenantModule {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  default_enabled: boolean;
  eligible: boolean;
  allowed_plan_names: string[] | null;
  blocked_reason: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface AdminFinancialPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  paid_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AdminFinancialEntry {
  id: string;
  company_id: string;
  type: FinancialEntryType;
  amount: number;
  currency: string;
  status: FinancialEntryStatus;
  stored_status: FinancialEntryStatus;
  description: string | null;
  notes: string | null;
  reference_month: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  paid_amount: number;
  remaining_amount: number;
  payments: AdminFinancialPayment[];
}

export interface AdminAuditLog {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  origin: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
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
