export type Role = 'system_admin' | 'company_admin' | 'manager' | 'agent' | 'viewer' | 'platform_admin';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: Role;
}

export interface Company {
  id: string;
  name: string;
  logo_url?: string;
}

export interface UserContext {
  token: string;
  user: UserProfile;
}

export type SessionState = 'loading' | 'authenticated' | 'unauthenticated' | 'expired';

export interface EffectiveUser extends UserProfile {
  isImpersonated: boolean;
  trueUserId: string;
}

// ── Pipeline ──────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color?: string;
  win_probability?: number;
}

export type DealStatus = 'open' | 'won' | 'lost';

export interface Deal {
  id: string;
  company_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  owner_user_id: string | null;
  title: string;
  amount: number;
  currency?: string;
  status: DealStatus;
  loss_reason?: string | null;
  closed_at?: string | null;
  expected_close_date?: string | null;
  created_at: string;
  updated_at: string;
  contact?: { id: string; full_name: string } | null;
  assigned_user?: { full_name: string } | null;
  conversation?: { id: string; channel: string } | null;
}

export interface StageSummary {
  stage_id: string;
  stage_name: string;
  stage_order: number;
  deal_count: number;
  total_value: number;
}

// ===== TASKS =====
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskSourceType =
  | 'manual'
  | 'ai'
  | 'followup_trigger'
  | 'cadence'
  | 'appointment'
  | 'inbox'
  | 'system';

export interface Task {
  id: string;
  company_id: string;
  title: string;
  description?: string;
  due_at?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  source_type?: TaskSourceType;
  source_id?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_agent_id?: string;
  contact_id?: string;
  contact_name?: string;
  conversation_id?: string;
  deal_id?: string;
  deal_name?: string;
  ai_generated?: boolean;
  ai_confidence?: number;
  ai_reason?: string;
  recommended_message?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

// ===== FOLLOWUP TRIGGERS =====
export type FollowupTriggerStatus =
  | 'pending'
  | 'cancelled'
  | 'due'
  | 'processed'
  | 'skipped'
  | 'failed';

export type FollowupTriggerType =
  | 'no_response_after_ai_question'
  | 'no_response_after_human_message'
  | 'third_party_decision_followup'
  | 'asked_to_return_later'
  | 'qualification_abandoned'
  | 'post_quote_followup';

export interface ConversationFollowupTrigger {
  id: string;
  company_id: string;
  contact_id: string;
  conversation_id: string;
  trigger_type: FollowupTriggerType;
  status: FollowupTriggerStatus;
  expected_reply_until: string;
  created_from_message_id?: number;
  last_inbound_message_at_snapshot?: string;
  last_outbound_message_at_snapshot?: string;
  detected_event?: string;
  reason?: string;
  recommended_action?: string;
  recommended_message?: string;
  ai_confidence?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  cancelled_at?: string;
  cancelled_reason?: string;
}

// ===== AI FOLLOWUP DECISIONS =====
export type AiFollowupDecisionStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'converted_to_task'
  | 'converted_to_execution'
  | 'ignored'
  | 'failed';

export interface AiFollowupDecision {
  id: string;
  company_id: string;
  contact_id: string;
  conversation_id: string;
  followup_trigger_id?: string;
  detected_event?: string;
  recommended_action?: string;
  recommended_message?: string;
  suggested_due_at?: string;
  confidence?: number;
  requires_human_approval?: boolean;
  status: AiFollowupDecisionStatus;
  raw_input?: Record<string, unknown>;
  raw_output?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

// ===== CADENCES =====

export type CadenceStatus = 'draft' | 'active' | 'paused' | 'archived';

export type CadenceTriggerType =
  | 'appointment_scheduled'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'no_response'
  | 'manual';

export type CadenceCategory =
  | 'agendamento'
  | 'qualificacao'
  | 'pos_orcamento'
  | 'reativacao'
  | 'pos_atendimento'
  | 'personalizada';

export type CadenceActionType =
  | 'whatsapp_message'
  | 'create_task'
  | 'notify_user';

export interface CadenceStep {
  id: string;
  company_id: string;
  cadence_template_id: string;
  step_order: number;
  name: string;
  action_type: CadenceActionType;
  relative_to?: string;
  offset_minutes?: number;
  message_template_id?: string;
  message_text?: string;
  media_asset_id?: string;
  requires_approval: boolean;
  is_active: boolean;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CadenceTemplate {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  category: CadenceCategory;
  trigger_type: CadenceTriggerType;
  status: CadenceStatus;
  settings?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
  step_count?: number;
  steps?: CadenceStep[];
}

export interface MessageTemplate {
  id: string;
  company_id: string;
  name: string;
  channel: string;
  body: string;
  variables?: Record<string, unknown>;
  media_asset_id?: string;
  status: 'active' | 'draft' | 'archived';
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ===== NOTES =====
export interface Note {
  id: string;
  company_id: string;
  author_id: string;
  author_name: string;
  body: string;
  contact_id?: string;
  conversation_id?: string;
  deal_id?: string;
  created_at: string;
}

// ===== AI AGENTS =====

export type AiAgentProvider = 'openai' | 'anthropic' | 'google' | 'custom';
export type AttendanceMode = 'human' | 'ai' | 'hybrid';
export type AgentBindingType = 'all' | 'channel' | 'conversation';
export type AgentToolType =
  | 'agenda_action'
  | 'crm_action'
  | 'atendimento_action'
  | 'media_action'
  | 'knowledge_action'
  | 'webhook_action'
  | 'internal_action'
  | 'catalog_action';

export type ToolReadinessStatus =
  | 'ready'
  | 'incomplete'
  | 'inactive'
  | 'blocked'
  | 'integration_missing';

export interface ToolDependency {
  key: string;
  label: string;
  configured: boolean;
  configurePath?: string;
  helpText?: string;
}

export interface ToolContext {
  schedulesConfigured: boolean;
  serviceTypesConfigured: boolean;
  pipelineConfigured: boolean;
  teamsConfigured: boolean;
  mediaStorageConfigured: boolean;
  knowledgeProviderConfigured: boolean;
  productCatalogConfigured: boolean;
}

export interface ProductCatalogItem {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  duration_minutes?: number | null;
  price?: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  service_type_id?: string | null;
}

// ── Campo declarativo do drawer de configuração ───────────────

export type ToolFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'toggle'
  | 'select'
  | 'multiselect';

export interface ToolFieldOption {
  value: string | number | boolean;
  label: string;
}

export interface ToolFieldDef {
  key: string;
  type: ToolFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  default?: unknown;
  options?: ToolFieldOption[];
  min?: number;
  max?: number;
  rows?: number;
}

export interface AgentToolAsset {
  id: string;
  file_name: string;
  public_url: string;
  mime_type?: string;
  label?: string;
  sort_order: number;
}

export interface AgentToolCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  tool_type: AgentToolType;
  icon: string;
  is_built_in: boolean;
  config_schema: Record<string, unknown>;
  when_to_use?: string;
  depends_on?: string[];
  input_schema?: Record<string, unknown>;
  sort_order: number;
}

export interface AgentToolBinding {
  id: string;
  company_id: string;
  agent_id: string;
  tool_slug: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Shape retornado por rpc_get_agent_tools — catálogo + estado do binding fundidos */
export interface AgentTool extends AgentToolCatalogItem {
  binding_id?: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  assets?: AgentToolAsset[];
  readiness?: ToolReadinessStatus;
  dependencies?: ToolDependency[];
}

export interface AiAgentScope {
  channels: string[];
  auto_reply: boolean;
  working_hours?: {
    enabled: boolean;
    start: string; // "09:00"
    end: string;   // "18:00"
    timezone: string;
  };
}

export interface AiAgent {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  provider: AiAgentProvider;
  model: string;
  /** system_prompt is NEVER returned to the client in listings — only on edit */
  system_prompt?: string;
  scope: AiAgentScope;
  handoff_keywords: string[];
  handoff_after_mins?: number;
  is_active: boolean;
  is_published: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AiAgentBinding {
  id: string;
  agent_id: string;
  company_id: string;
  binding_type: AgentBindingType;
  channel?: string;
  conversation_id?: string;
  is_active: boolean;
  created_at: string;
}

// ===== AGENT OPERATIONS (Autopilot) =====

export type AgentOperationType = 'follow_up' | 'escalate' | 'confirm' | 'rescue';

export type AgentOperationLabel = 'FOLLOW-UP' | 'ESCALAR' | 'CONFIRMAR' | 'RESGATE';

export type AgentOperationStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed'
  | 'paused'
  | 'needs_reschedule';

export interface AgentOperation {
  id: string;
  company_id: string;

  contact_id: string | null;
  contact_name: string;
  contact_initials: string;

  operation_type: AgentOperationType;
  operation_label: AgentOperationLabel;

  context: string;
  message: string;

  channel: 'whatsapp' | 'email';

  send_at: string;

  status: AgentOperationStatus;

  reason: string | null;

  source: 'agent';

  agent_id?: string | null;
  workflow_id?: string | null;
  cadence_id?: string | null;
  task_id?: string | null;

  idempotency_key?: string | null;

  created_at: string;
  updated_at: string;
}

// ===== FOLLOW-UP STATE =====

export type FollowUpCycleStatus =
  | 'active'
  | 'paused'
  | 'stopped'
  | 'responded'
  | 'completed'
  | null;

export type FollowUpBlockReason =
  | 'ok'
  | 'contact_not_found'
  | 'conversation_not_found'
  | 'deal_not_found'
  | 'opt_out'
  | 'autopilot_disabled'
  | 'cycle_stopped'
  | 'max_attempts_reached'
  | 'min_interval_not_elapsed'
  | 'human_recently_engaged'
  | 'outside_business_hours'
  | 'invalid_channel'
  | (string & Record<never, never>)
  | null;

export interface FollowUpState {
  cycle_status: FollowUpCycleStatus;
  attempt_count: number;
  max_attempts: number;
  last_follow_sent_at: string | null;
  next_allowed_at: string | null;
  has_responded: boolean;
  responded_at: string | null;
  can_send: boolean;
  block_reason: FollowUpBlockReason;
  opt_out: boolean;
  cycle_id: string | null;
}

export type FollowUpFollowType = 'agent_auto' | 'cadence_step' | 'human_manual' | 'human_bulk' | 'system_rescue';
export type FollowUpChannel = 'whatsapp' | 'email' | 'sms' | 'internal';
export type FollowUpEventStatus =
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'responded'
  | 'expired'
  | 'stopped';

export interface FollowUpHistoryItem {
  id: string;
  follow_type: FollowUpFollowType;
  channel: FollowUpChannel;
  attempt_number: number;
  status: FollowUpEventStatus;
  sent_at: string;
  next_allowed_at: string | null;
  attribution_until: string | null;
  responded_at: string | null;
  stopped_reason: string | null;
}

// ===== CONVERSATIONS & MESSAGES =====

export type ConversationStatus = 'open' | 'closed' | 'pending';
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type MessageSenderType = 'contact' | 'agent' | 'system' | 'bot';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
export type MessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact_card'
  | 'reaction'
  | 'unknown';

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: MessageSenderType;
  sender_id?: string;
  sender_name?: string;
  body: string;
  message_type: MessageType;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
  metadata?: Record<string, unknown> | null;
  status: MessageStatus;
  is_internal: boolean;
  ai_agent_id?: string;
  ai_agent_name?: string;
  created_at: string;
}

export interface InboxConversation {
  conversation_id: string;
  company_id: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  unread_count: number;
  attendance_mode: AttendanceMode;
  ai_paused_at?: string;
  contact_id: string;
  contact_name: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  ai_agent_id?: string;
  ai_agent_name?: string;
  ai_agent_active?: boolean;
  open_deals_count: number;
  last_message_preview?: string;
  last_message_at?: string;
  contact_phone?: string;
}
