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

export interface Task {
  id: string;
  company_id: string;
  title: string;
  description?: string;
  due_at?: string;
  status: TaskStatus;
  assigned_to?: string;
  assigned_to_name?: string;
  contact_id?: string;
  contact_name?: string;
  conversation_id?: string;
  deal_id?: string;
  deal_name?: string;
  created_at: string;
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
  | 'internal_action';

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
