# Graph — SalesIA
_gerado: 2026-05-13_

## Rotas
/login · /select-company
/ → home, dashboard, inbox/*, tasks, contacts, deals
  ai-agents, ai-agents/:agentId, members, teams, integrations
  agenda, agenda/configuracoes, settings/team
/admin → companies, companies/:companyId, users, modules, support
/unauthorized

## Páginas
pages/
  Dashboard.tsx · Inbox.tsx · Deals.tsx · Contacts.tsx · Tasks.tsx
  Agenda.tsx · AgendaSettings.tsx · AiAgents.tsx · AiAgentDetail.tsx
  Login.tsx · SelectCompany.tsx · Unauthorized.tsx · CompanySettings.tsx
  company/: Dashboard.tsx · Home.tsx · Integrations.tsx · Members.tsx · Teams.tsx
  admin/: CompaniesList.tsx · CompanyDetails.tsx · OtherAdminPages.tsx

## Componentes
components/
  AiAgents/: AgentCard · AgentForm · AgentTestPanel · AgentToolAssets · AgentToolConfigForm
             AgentToolDependencyList · AgentToolDrawer · AgentToolFieldRenderer · AgentToolGrid
             AgentToolPayloadPreview · AgentToolProductCatalog · AgentToolStatusBadge
  Inbox/: Composer · ConversationDetail · ConversationItem · ConversationList
          NewConversationModal · Timeline
  Pipeline/: DealCard · DealDetailPanel · NewDealModal · PipelineSettingsDrawer · StageColumn
  Dashboard/: KpiCard · PeriodFilter
  admin/: AdminShell · AdminSidebar · AdminTopbar · NewCompanyModal
  Layout/: AppShell · Sidebar · SupportBanner · Topbar
  Integrations/: WhatsAppConnectModal
  members/: InviteMemberModal
  Notes/: NotesList
  settings/: CompanyTeamAndUsers
  teams/: NewTeamModal
  ErrorBoundary.tsx · RouteGuardForAgent.tsx

## Migrations (73 arquivos)
Schemas base: supabase_schema.sql · backend_conversation_hub.sql · backend_pipeline.sql
              backend_ai_agents.sql · backend_agenda.sql · backend_invite_and_teams.sql
Agent tools: agent_tools_001..006.sql
Analytics: analytics_layer_etapa1.sql · analytics_layer_etapa2.sql
RPCs: rpc_agenda.sql · rpc_ai_tools_mcp.sql · rpc_mark_deal_won_lost.sql
      rpc_persist_inbound_message.sql · rpc_save_ai_message.sql · rpc_save_human_message.sql
      rpc_update_deal_details.sql · rpc_n8n_agent_tools.sql · rpc_update_appointment_status.sql
Security: SECURITY_01..04.sql
Hotfixes: HOTFIX_*.sql · FIX_*.sql · PATCH_*.sql

## Edge Functions
create-member · create-platform-user · send-whatsapp-message · uazapi-connector

## Tipos (types.ts)
type Role · interface UserProfile · interface Company · interface UserContext
type SessionState · interface EffectiveUser
type DealStatus · interface Deal · interface PipelineStage · interface StageSummary
type TaskStatus · interface Task · interface Note
type AiAgentProvider · type AttendanceMode · type AgentBindingType · type AgentToolType
type ToolReadinessStatus · interface ToolDependency · interface ToolContext
interface ProductCatalogItem · type ToolFieldType · interface ToolFieldDef
interface AgentToolAsset · interface AgentToolCatalogItem · interface AgentToolBinding
interface AgentTool · interface AiAgentScope · interface AiAgent · interface AiAgentBinding
type ConversationStatus · type ConversationPriority · type MessageSenderType
type MessageStatus · type MessageType · interface Message · interface InboxConversation

## Contextos globais
AuthContext (contexts/AuthContext.tsx) — sessão, perfil, effectiveUser
TenantContext (contexts/TenantContext.tsx) — empresa ativa, papel, modo suporte
ThemeContext (contexts/ThemeContext.tsx) — dark/light
