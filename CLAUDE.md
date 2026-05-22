# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

## Comportamento Obrigatório — Buscas no Código

**SEMPRE** invoque a skill `/graphify` antes de qualquer busca no codebase (grep, find, leitura exploratória de arquivos desconhecidos). Isso se aplica a toda exploração de código, localização de símbolos e descoberta de arquivos — sem exceção.

**SEMPRE** invoque o MCP `/context7-mcp` antes de qualquer  refatoracao, criacao de novos componentes. Use para pegar as bibliotecas mais atuais. 

## Visão Geral do Projeto

Sia One é um CRM SaaS multi-tenant construído com React + Supabase. Não há backend tradicional — toda a lógica de negócio roda pelo Supabase (PostgreSQL + Auth + Realtime + Edge Functions). O frontend fica em `frontend/` e as Edge Functions em `supabase/functions/`.

## Deploy

O projeto é hospedado na **Vercel** como monorepo:
- `vercel.json` na raiz configura `installCommand`, `buildCommand` e `outputDirectory` apontando para `frontend/`
- `frontend/vercel.json` configura o rewrite SPA (`/(.*) → /index.html`) para o React Router funcionar corretamente
- Variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` devem ser configuradas no painel da Vercel

## Comandos de Desenvolvimento

Todos os comandos rodam a partir de `frontend/`:

```bash
npm run dev       # Inicia o servidor de desenvolvimento em http://localhost:5173
npm run build     # Checagem TypeScript (tsc -b) + build de produção com Vite
npm run lint      # Verificação com ESLint
npm run preview   # Preview do build de produção localmente
```

> ⚠️ **Peer conflict Vite 8:** `@tailwindcss/vite` declara peer `vite@^5||^6||^7` mas o projeto usa Vite 8.
> Sempre instale dependências com `npm install --legacy-peer-deps` em `frontend/`.

Sem suite de testes — o projeto usa testes manuais e checklists de auditoria (`AUDITORIA_*.md`).

## Arquitetura

### Stack de Tecnologias
- **Frontend:** React 19, React Router 7, TypeScript 5.9, Vite 8, Tailwind CSS 4, Recharts
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Edge Functions no runtime Deno)
- **API Externa:** UAZAPI (`https://simplifique.uazapi.com`) para integração com WhatsApp
- **Automação:** Workflows n8n (exports JSON na raiz do projeto) para orquestração de agentes de IA e processamento de mensagens

### Multi-Tenancy e Autenticação
Usuários pertencem a uma ou mais empresas. O banco de dados aplica isolamento por tenant em todas as camadas:
- **Políticas RLS** em todas as tabelas — queries são automaticamente escopadas para a empresa do usuário
- **Papéis:** `system_admin`, `platform_admin`, `company_admin`, `manager`, `agent`, `viewer`
- **Impersonação:** Modo suporte permite que admins atuem como outra empresa (TenantContext)

### Gerenciamento de Estado (Context API)
Três contextos globais envolvem o app em `main.tsx`:
- `AuthContext` — sessão, perfil do usuário, `effectiveUser` (suporta impersonação)
- `TenantContext` — empresa ativa, empresas disponíveis, papel do usuário na empresa, flag de modo suporte
- `ThemeContext` — alternância dark/light

Sempre use `TenantContext.currentCompany.id` para obter o ID da empresa ativa — nunca use um ID hardcoded ou derivado da URL.

### Roteamento e Guards
Definidos em `frontend/src/routes/AppRoutes.tsx`. Páginas pesadas são carregadas com lazy load via `React.lazy` + `Suspense` (fallback PageSkeleton). Guards divididos em dois arquivos:

`routes/Guards.tsx`:
- `<ProtectedRoute>` — exige sessão válida
- `<ProtectedRoute allowedRoles={[...]}>` — seções restritas por papel
- `<PublicRoute>` — redireciona usuário autenticado para `/`

`components/RouteGuardForAgent.tsx`:
- `<AgentRestrictedRoute>` — bloqueia o papel `agent` em determinadas páginas
- `<IndexRedirect>` — redireciona `/` para `home` ou `dashboard` baseado no papel

### Organização de Componentes
- `components/ui/` — primitivos reutilizáveis (botões, modais, inputs)
- `components/Inbox/`, `components/Pipeline/`, `components/AiAgents/`, etc. — componentes agrupados por feature
- `components/ErrorBoundary.tsx` — Error boundary React de catch-all; exibe tela de erro com botão "Tentar novamente"
- `lib/utils.ts` exporta `cn(...classes)` (clsx + tailwind-merge) — use para todas as classes condicionais do Tailwind
- Tipos TypeScript centralizados em `src/types.ts`

### Temas (Dark/Light)
Use classes CSS Tailwind baseadas em variáveis (`bg-background`, `text-primary`, `border-border`, etc.) — nunca cores hexadecimais hardcoded. O ThemeContext alterna a classe `dark` no `<html>`.

### Padrão de Busca de Dados
1. **Leituras simples:** `supabase.from('table').select(...)` — RLS cuida do escopo por tenant automaticamente
2. **Mutações complexas:** `supabase.rpc('rpc_function_name', { p_param: value })` — lógica server-side com operações atômicas
3. **Operações sensíveis:** `supabase.functions.invoke('function-name', { body })` — Edge Functions para chamadas UAZAPI e criação de membros
4. **Tempo real:** Assinaturas Supabase Realtime nas tabelas `conversations` e `messages` no Inbox

### Migrações SQL
Arquivos `.sql` em `frontend/supabase-migrations/` — aplicados manualmente via Supabase Dashboard (SQL Editor) ou `supabase db push`. Não existe pipeline de migração automatizado.

### Backoffice Admin
Seção `/admin` acessível apenas para `system_admin` e `platform_admin`. Usa `AdminShell` separado do `AppShell` principal. Páginas: CompaniesList, CompanyDetails, UsersList, ModulesList, SupportPanel.

O `UsersList` inclui modal de criação de usuário que chama a Edge Function `create-platform-user` — exige vínculo com uma empresa obrigatoriamente.

`CompaniesList` exibe métricas de cada tenant (plano de assinatura, status, MRR acumulado) e permite gestão de `company_subscriptions`. Usa `NewCompanyModal` (`components/admin/NewCompanyModal.tsx`) para criar novas empresas diretamente pelo painel. `CompanyDetails` inclui painel de assinatura com troca de plano, histórico de status e ações de churn/suspensão.

### Compatibilidade Vite/OXC
O Vite 8 usa o parser OXC que é mais restrito que o `tsc`:
- **Proibido:** misturar `??` e `||` sem parênteses — use `(a ?? b) || c`
- **Proibido:** declarar `type` alias dentro do corpo de funções ou componentes — declare sempre no escopo de módulo
- Sempre rode `npx tsc --noEmit` após mudanças em TypeScript; o OXC pode rejeitar padrões que o `tsc` aceita

### Edge Functions
Localizadas em `supabase/functions/`. Cada função:
- Valida o JWT do usuário via header `Authorization`
- Usa `SUPABASE_SERVICE_ROLE_KEY` para operações administrativas (bypass de RLS quando necessário)
- Recebe credenciais UAZAPI via secrets do Supabase (`UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`)

| Função | Propósito |
|--------|-----------|
| `uazapi-connector` | Gerenciamento de canais WhatsApp (conectar/desconectar instâncias) |
| `send-whatsapp-message` | Envio de mensagens via UAZAPI |
| `create-member` | Convite e criação de membros na empresa (requer `company_id` + caller ser `company_admin`) |
| `create-platform-user` | Criação de usuário de plataforma com vínculo obrigatório a empresa (requer caller ser `platform_admin`) |

### Funções RPC Principais
| RPC | Propósito |
|-----|-----------|
| `rpc_get_inbox_conversations` | Conversas paginadas com filtros |
| `rpc_create_contact_and_conversation` | Criação atômica de contato + conversa |
| `rpc_persist_inbound_message` | Salva mensagem recebida do n8n, respeita `attendance_mode` |
| `rpc_enqueue_outbound_message` | Enfileira mensagem para envio via UAZAPI |
| `rpc_mark_conversation_read` | Zera contador de não lidos |
| `rpc_assign_conversation` | Atribui conversa a um agente |
| `rpc_close_conversation` | Fecha conversa com evento de auditoria |
| `rpc_set_conversation_attendance` | Alterna entre modo human/ai/hybrid e vincula agente |
| `rpc_update_deal_stage` | Move deal no pipeline |
| `rpc_mark_deal_won` | Fecha deal como Ganho: `status='won'`, `closed_at=now()` |
| `rpc_mark_deal_lost` | Fecha deal como Perdido: `status='lost'`, `loss_reason`, `closed_at=now()` |
| `rpc_update_deal_details` | Atualiza título e/ou valor de um deal (COALESCE — null preserva valor atual) |
| `rpc_ensure_prospeccao_deal` | Cria automaticamente deal de prospecção em nova conversa (idempotente) |
| `rpc_update_contact_lead_metadata` | Atualiza campos de qualificação do lead |
| `rpc_save_ai_agent` | Upsert de configuração do agente de IA (nome, model, system_prompt, scope) |
| `rpc_toggle_ai_agent` | Ativa/desativa agente de IA |
| `rpc_invite_member` | Convida usuário para empresa com papel definido |
| `rpc_save_ai_message` | Persiste resposta da IA no Inbox após envio via UAZAPI — **apenas service_role** |
| `rpc_save_human_message` | Persiste mensagem de agente humano enviada via n8n/UAZAPI — **apenas service_role** |
| `rpc_resolve_company_by_token` | Resolve `company_id` a partir do `instance_token` da integração UAZAPI (SECURITY DEFINER, usado pelo n8n sem JWT) |
| `rpc_get_active_ai_agent` | Retorna config do agente de IA ativo por `company_id` (SECURITY DEFINER, usado pelo n8n) |
| `rpc_get_company_integration` | Retorna `instance_id` e `instance_token` da integração UAZAPI ativa da empresa — **apenas service_role** |
| `rpc_get_available_slots` | Retorna slots livres para um serviço em uma data (SECURITY DEFINER) |
| `rpc_create_appointment` | Cria novo agendamento com validação de conflito (SECURITY DEFINER) |
| `rpc_cancel_appointment` | Cancela agendamento com `cancellation_reason` (SECURITY DEFINER) |
| `rpc_reschedule_appointment` | Remarca agendamento criando novo e linkando via `rescheduled_from_id` (SECURITY DEFINER) |
| `rpc_update_appointment_status` | Atualiza `status` de um agendamento com validação de tenant (SECURITY DEFINER) |
| `rpc_ai_edit_deal` | Edita título, valor e/ou `expected_close_date` de um deal (SECURITY DEFINER — chamado pelo n8n via MCP; `anon`+`authenticated` podem executar) |
| `rpc_ai_transfer_attendance` | Transfere conversa para humano atomicamente: muda `attendance_mode`, limpa `ai_agent_id`, atribui `team_id`/`agent_id` e enfileira mensagem de aviso (SECURITY DEFINER; `anon`+`authenticated`) |
| `rpc_ai_get_assets` | Retorna assets de mídia de uma tool do agente para o n8n enviar via UAZAPI (SECURITY DEFINER; `anon`+`authenticated`) |
| `rpc_n8n_set_attendance_mode` | Altera `attendance_mode` de uma conversa e insere mensagem interna de auditoria — **apenas `service_role`** |
| `rpc_n8n_update_deal_stage` | Move deal aberto para outro estágio do mesmo pipeline, com validação de tenant — **apenas `service_role`** |

### Principais Tabelas do Banco
| Tabela | Propósito |
|--------|-----------|
| `companies` | Tenants |
| `user_profiles` | Perfil do usuário: `id`, `full_name`, `avatar_url`, `system_role` (enum `app_role`) |
| `user_companies` | Vínculo usuário-empresa-papel (`role_in_company`) |
| `contacts` / `contact_identities` | Contatos do CRM; identidades vinculam telefone/email ao contato; `contacts.metadata` (JSONB) armazena campos de lead do UAZAPI |
| `conversations` / `messages` | Hub do Inbox; conversas possuem `attendance_mode` (human/ai/hybrid) |
| `channel_events_raw` | Eventos brutos recebidos da UAZAPI, processados pelo n8n |
| `app_integrations` | Credenciais do canal WhatsApp por empresa (`instance_id`, `instance_token`) |
| `pipelines` / `pipeline_stages` / `deals` | Pipeline do CRM |
| `tasks` | Tarefas vinculadas a contatos/deals |
| `teams` | Times de agentes dentro de uma empresa |
| `ai_agents` | Configuração do agente de IA por empresa (`model_provider`, `model_name`, `system_prompt`, `is_active`). **`is_published`, `scope`, `handoff_keywords`, `handoff_after_mins` vivem no JSONB `config`** — não são colunas top-level. |
| `ai_agent_bindings` | Vincula agentes de IA a canais ou conversas específicas |
| `audit_logs` | Trilha de auditoria imutável |
| `kpi_company_daily_snapshots` | Snapshots diários de KPIs para analytics |
| `schedules` | Horário de funcionamento por empresa e dia da semana (`company_id`, `weekday` 0–6, `opens_at`, `closes_at`, `is_active`) |
| `service_types` | Tipos de serviço/procedimento por empresa (`name`, `duration_minutes` NOT NULL, `is_active`) — **exclusivo do módulo Agenda** |
| `appointments` | Agendamentos do módulo Agenda (`scheduled_at`, `ends_at`, `status`, `rescheduled_from_id`) |
| `product_catalog` | Catálogo comercial consultável pelo agente de IA (`name`, `description`, `duration_minutes` nullable, `price` nullable, `is_active`, `sort_order`, `service_type_id` nullable FK→`service_types`) — **separado de `service_types`** |
| `subscription_plans` | Catálogo de planos de assinatura da plataforma (`name`, `price_monthly`, `is_active`) |
| `company_subscriptions` | Plano ativo por tenant (`plan_id`, `status`: trial/active/churned/suspended, `trial_ends_at`, `churn_reason`) |

### Storage
Bucket `media` no Supabase Storage para mídias do WhatsApp (áudio, imagem, vídeo, documento, sticker):
- Bucket público — leitura sem autenticação
- Limite de 50 MB por arquivo
- Upload feito exclusivamente pelo n8n com `service_role` key
- Configurado via `frontend/supabase-migrations/storage_media_bucket.sql`

### Modelo de Deal (Pipeline)
A tabela `deals` suporta o ciclo de vida completo de um negócio:
- **`status`** — enum: `open` | `won` | `lost`
- **`closed_at`** — timestamp preenchido por `rpc_mark_deal_won` / `rpc_mark_deal_lost`
- **`loss_reason`** — texto opcional, preenchido ao marcar como perdido
- **`conversation_id`** — link direto à conversa; usado pelo Inbox para buscar o deal vinculado
- Deals ganhos/perdidos **não aparecem** no filtro "Ativos" do Pipeline; use os filtros "Ganhos" / "Perdidos"

**UI de ganho/perda disponível em dois lugares:**
1. `DealDetailPanel` (Pipeline) — seção "Fechar Negócio" com confirmação inline; só exibida quando `deal.status === 'open'`
2. `ConversationDetail` (Inbox) — seção "Negócios" no sidebar; busca o deal por `conversation_id` (fallback: `contact_id + status=open`)

### Views Analíticas
| View | Propósito |
|------|-----------|
| `v_inbox_conversations` | Lista de conversas enriquecida com contato, agente e campos de IA |
| `v_company_kpis` | KPIs agregados por empresa |
| `v_kpi_company_daily` | Série temporal diária de KPIs |
| `v_pipeline_conversion` | Taxas de conversão por etapa do funil |
| `v_agent_performance` | Métricas de resposta por agente |
| `v_cohort_retention` | Retenção de contatos por coorte |
| `v_integration_health` | Status da integração WhatsApp por empresa |
| `v_memberships_canonical` | View achatada de usuário-empresa-papel |
| `v_users_canonical` | Todos os usuários com sua empresa principal |

## Módulo de Agentes de IA

Agentes de IA são configurados por empresa na tabela `ai_agents` e orquestrados via n8n.

### Ferramentas do Agente (Agent Tools)

O sistema de ferramentas tem três camadas:

| Tabela | Propósito |
|--------|-----------|
| `agent_tool_catalog` | Catálogo canônico do produto (slugs, config_schema, sort_order) |
| `agent_tool_bindings` | Ativação por agente + config customizada do tenant |
| `agent_tool_assets` | Arquivos de mídia vinculados a tools (fotos, vídeos) |

**Tipos de ferramenta (`AgentToolType`):**

| Tipo | Cor UI | Descrição |
|------|--------|-----------|
| `agenda_action` | azul | Operações de agendamento |
| `crm_action` | esmeralda | Operações no pipeline/deals |
| `atendimento_action` | âmbar | Transferência de atendimento |
| `media_action` | violeta | Envio de mídias |
| `knowledge_action` | ciano | Busca em base de conhecimento |
| `webhook_action` | laranja | Chamadas externas |
| `internal_action` | stone | Ações internas |
| `catalog_action` | teal | Catálogo de produtos/serviços |

**Status de prontidão (`ToolReadinessStatus`):** `ready` | `incomplete` | `inactive` | `blocked` | `integration_missing`

**Dependências "soft" vs "críticas":** `agent_tool_assets` e `product_catalog` são soft deps — sua ausência causa `incomplete`, não `blocked`. Todas as outras dependências não configuradas causam `blocked`.

**Tools disponíveis no catálogo:**

| Slug | Nome | Tipo | Depende de |
|------|------|------|------------|
| `buscar_agenda` | Buscar Agenda | agenda_action | schedules, service_types |
| `agendar` | Agendar | agenda_action | schedules, service_types |
| `cancelar_agenda` | Cancelar Agenda | agenda_action | schedules |
| `buscar_produtos_servicos` | Buscar Produtos/Serviços | catalog_action | product_catalog |
| `mover_crm` | Mover CRM | crm_action | pipelines, pipeline_stages |
| `editar_deal_crm` | Editar Deal CRM | crm_action | pipelines |
| `transferir_atendimento` | Transferir Atendimento | atendimento_action | teams, user_companies |
| `enviar_foto` | Enviar Foto | media_action | agent_tool_assets, storage.media |
| `enviar_video` | Enviar Vídeo | media_action | agent_tool_assets, storage.media |
| `enviar_resumo` | Enviar Resumo | media_action | — |
| `buscar_conhecimento` | Buscar Conhecimento | knowledge_action | knowledge_provider |

**Componentes em `frontend/src/components/AiAgents/`:**

| Componente | Propósito |
|------------|-----------|
| `AgentCard` | Card de listagem do agente na página `/ai-agents` (nome, status, provider) |
| `AgentForm` | Formulário de criação/edição do agente (nome, model, provider, system_prompt, handoff) |
| `AgentTestPanel` | Painel de teste inline com simulação de resposta local (sem chamada real ao LLM) |
| `AgentToolGrid` | Grid 2 colunas com cards de tools, toggle on/off |
| `AgentToolDrawer` | Painel lateral de configuração (abre ao clicar no card) |
| `AgentToolConfigForm` | Renderiza campos declarativos do `config_schema.fields` |
| `AgentToolFieldRenderer` | Renderer de campo individual (text, textarea, number, toggle, select, multiselect) |
| `AgentToolDependencyList` | Lista de dependências com status configurado/pendente |
| `AgentToolAssets` | Upload e gestão de assets de mídia (fotos/vídeos) |
| `AgentToolProductCatalog` | CRUD de produtos/serviços da tool `buscar_produtos_servicos` |
| `AgentToolPayloadPreview` | Preview JSON do payload enviado ao n8n |
| `AgentToolStatusBadge` | Badge visual de readiness |

**`ToolContext`** — calculado em `AiAgentDetail.fetchToolContext()`, inclui:
- `schedulesConfigured` — tem schedules ativos
- `serviceTypesConfigured` — tem service_types ativos (para tools de agenda)
- `pipelineConfigured` — tem pipeline + etapas
- `teamsConfigured` — tem times com membros
- `mediaStorageConfigured` — sempre `true` (bucket configurado)
- `knowledgeProviderConfigured` — sempre `false` (pendente integração)
- `productCatalogConfigured` — tem itens ativos em `product_catalog`

**Padrão crítico de callback em `AgentToolProductCatalog`:**
O componente recebe `onCountChange` do drawer. Para evitar loop de re-fetch infinito (onCountChange → onToolUpdated → selected muda → tool prop nova → handleCatalogCountChange nova ref → notifyCount nova ref → fetchItems nova ref → useEffect dispara → loop), use sempre `useRef` para estabilizar o callback:
```tsx
const onCountChangeRef = useRef(onCountChange);
useEffect(() => { onCountChangeRef.current = onCountChange; }); // sem deps — atualiza todo render
const notifyCount = useCallback((list) => { onCountChangeRef.current(...); }, []); // deps vazia — estável
```

**Migrações das tools:**
- `agent_tools_001.sql` — tabelas base
- `agent_tools_002.sql` — catálogo canônico (10 tools)
- `agent_tools_003.sql` — campos dinâmicos (`fields` no config_schema)
- `agent_tools_004_assets.sql` — assets de mídia
- `agent_tools_005_product_catalog.sql` — tabela `product_catalog` + tool `buscar_produtos_servicos` + tipo `catalog_action`
- `agent_tools_006_product_catalog_service_link.sql` — adiciona `service_type_id` nullable em `product_catalog` para o agente saber qual service_type usar ao verificar slots e criar agendamentos

**`service_types` vs `product_catalog`:**
- `service_types.duration_minutes` é `NOT NULL CHECK (> 0)` — obrigatório para agenda calcular slots. **Nunca alterar esta constraint** — quebra `rpc_get_available_slots`.
- `product_catalog.duration_minutes` é nullable — catálogo comercial sem exigência de duração.
- `product_catalog.service_type_id` (nullable FK) — elo entre o catálogo e o módulo de agenda. Quando preenchido, o agente usa esse `service_type_id` diretamente ao chamar `buscar_agenda` ou `agendar`.
- Não misturar os dois módulos: agenda usa `service_types`, agente de IA usa `product_catalog`.

Agentes de IA são configurados por empresa na tabela `ai_agents` e orquestrados via n8n.

**Schema real confirmado via banco** — colunas top-level:
`id`, `company_id`, `name`, `slug` (NOT NULL), `description`, `system_prompt`, `operating_instructions`, `model_provider` (NOT NULL), `model_name` (NOT NULL), `temperature` (default 0.7), `max_tokens`, `handoff_enabled` (default true), `is_active` (default true), `config` (JSONB, default `{}`), `created_at`, `updated_at`

> ⚠️ **`is_published` NÃO é coluna top-level** — vive exclusivamente no JSONB `config` como `config->>'is_published'`. Ao fazer `select(...)` na tabela, não inclua `is_published` como coluna; leia sempre via `(row.config as any).is_published`.

Campos-chave:
- **`is_active`** — ativa/desativa o agente (via `rpc_toggle_ai_agent`). É a flag usada pelo n8n (`rpc_get_active_ai_agent` filtra apenas por `is_active = true`).
- **`config.is_published`** — `false` = modo rascunho/teste; controla visibilidade na UI de edição. **Não usar para filtrar dropdown de atribuição no Inbox** — use `is_active`.
- **`system_prompt`** — mensagem de sistema completa injetada no LLM
- **`model_provider`** / **`model_name`** — provider e modelo (mapeados no frontend para `provider` / `model`)
- **`config.scope`** — `{ channels: [], auto_reply: bool }`
- **`config.handoff_keywords`** / **`config.handoff_after_mins`** — gatilhos para transferência ao humano

**Dropdown de atribuição manual no Inbox (`ConversationDetail`):** filtra agentes por `is_active`, não por `is_published` — alinhado com o comportamento do n8n. Qualquer agente ativo aparece no dropdown independente de estar publicado.

Conversas carregam `attendance_mode` (`human` | `ai` | `hybrid`) e `ai_agent_id` para roteamento das mensagens.

## Workflows n8n (Orquestração de IA)

Quatro workflows formam o pipeline completo (exports JSON na raiz do projeto):

| Arquivo | Workflow | Papel |
|---------|----------|-------|
| `[Sia One] [Messages] [Nao-Oficial].json` | Messages | Recebe webhook da UAZAPI → normaliza (`sender_name` correto em `fromMe`, expõe `from_me`, `was_sent_by_api`, `instance_owner_phone`) → salva em `channel_events_raw` |
| *(workflow buffer)* | Buffer | Debounce de mensagens rápidas, agrupa em uma única invocação de IA |
| `[Sia One] [IA - Comercial].json` | IA - Comercial | Busca config do agente via `rpc_get_active_ai_agent` → executa LLM → envia via UAZAPI → salva via `rpc_save_ai_message` |
| `[Sia One] [Outbound - Human].json` | Outbound - Human | Envia mensagem de agente humano via UAZAPI e persiste via `rpc_save_human_message` |

**Resolução dinâmica de `company_id` no n8n:**
O n8n não carrega JWT de usuário. Para identificar a empresa, usa `rpc_resolve_company_by_token(instance_token)`.

**Dois padrões de credencial para RPCs do n8n:**
- RPCs de lookup/leitura (`rpc_resolve_company_by_token`, `rpc_get_active_ai_agent`, `rpc_ai_edit_deal`, `rpc_ai_transfer_attendance`, `rpc_ai_get_assets`) — `GRANT` para `anon`+`authenticated`; o n8n pode usar anon key
- RPCs de escrita sensível (`rpc_n8n_set_attendance_mode`, `rpc_n8n_update_deal_stage`, `rpc_save_ai_message`, `rpc_save_human_message`) — **apenas `service_role`**; o n8n deve usar service_role key

**Fluxo do IA - Comercial:**
1. Acionado pelo workflow buffer com `{ role, content, company_id, message, sender_name }`
2. Busca config via `rpc_get_active_ai_agent(company_id)` — retorna `system_prompt`, `model`, `provider`
3. Formata role/content para entrada no LLM
4. LangChain Agent executa o modelo com `system_prompt` dinâmico
5. Divide a resposta em partes → envia cada parte via UAZAPI com 2s de intervalo
6. Persiste resposta via `rpc_save_ai_message` e atualiza memória de longo prazo

## Variáveis de Ambiente

Frontend (`frontend/.env`):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Edge Functions usam `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN` e `SUPABASE_SERVICE_ROLE_KEY` definidos como secrets do Supabase (não no `.env`).

## Segurança — Migrações Aplicadas

As migrações em `frontend/supabase-migrations/SECURITY_0*.sql` corrigiram vulnerabilidades críticas:

| Arquivo | Fix |
|---------|-----|
| `SECURITY_01_revoke_anon_from_rpcs.sql` | Revoga `EXECUTE` de `anon` em `rpc_save_ai_message`, `rpc_save_human_message` e `rpc_get_company_integration`; adiciona verificação interna de `service_role` como defesa em profundidade |
| `SECURITY_02_channel_events_raw_rls.sql` | Habilita RLS em `channel_events_raw`; `anon` não pode mais ler eventos brutos |
| `SECURITY_03_fix_ai_agents_rls.sql` | Corrige políticas em `ai_agents` para isolar configs por tenant |
| `SECURITY_04_fix_audit_logs_rls.sql` | Restringe leitura de `audit_logs` apenas ao `company_admin` da empresa |

**Impacto no n8n:** após aplicar `SECURITY_01`, todos os nodes que chamam `rpc_save_ai_message`, `rpc_save_human_message` e `rpc_get_company_integration` devem usar credencial **service_role key** (não mais anon key). Ver instruções completas no final do arquivo SQL.

## Problemas Conhecidos
1. `NewConversationModal` passa `user.id` como `p_agent_id` — deve passar `null` ou um ID de agente válido

## Módulo: Dashboard Comercial (Visão Comercial)

Página principal do painel do tenant. Arquivo principal em `frontend/src/pages/Dashboard.tsx`. Componente externo extraído: `components/Dashboard/KpiCard.tsx` — card de KPI reutilizável com `title`, `value`, `icon`, `trend` e `trendUp`.

### Sub-componentes internos (definidos no próprio arquivo)

| Componente | Propósito |
|------------|-----------|
| `ProfoundTooltip` | Tooltip escuro premium para todos os gráficos Recharts (`rgba(8,8,8,0.96)` + `backdrop-blur`) |
| `HeroPill` | Pill de KPI secundário (Receita Fechada / Conversão / Perdidos) no bloco hero |
| `StatCard` | Card de métrica com `useCountUp`, ícone colorido, hover scale, pulse "Em dia" |
| `Panel` | Container padrão de seção (título + subtítulo + slot de ação) |
| `StageBar` | Linha de ranking para Pipeline por Etapa (barra animada proporcional) |
| `BarRow` | Linha genérica com barra inline (Canais, Prioridade, Tarefas) |
| `FunnelRow` | Linha com barra dupla sobreposta para funil de conversão |
| `AgentRow` | Linha de ranking de agente estilo Rho (avatar colorido, win rate pill) |
| `UrgencySignal` | Badge de urgência condicional (urgentes + tarefas atrasadas) |
| `SkeletonPanel` | Skeleton animado (`animate-pulse`) para painéis de gráficos |

### Hooks internos

| Hook | Propósito |
|------|-----------|
| `useCountUp(target, duration)` | Animação de número de 0 → target com `requestAnimationFrame` |
| `useBarAnimate()` | Retorna `true` após 120ms para disparar animações CSS de barras |

### Fetches de dados (5 independentes, todos com `company_id`)

| Fetch | Dados | Loading state |
|-------|-------|---------------|
| `fetchKPIs` | Mensagens, Leads, Conversas abertas, Leads qualificados, Tarefas atrasadas, **Agendamentos concluídos** | `loading` |
| `fetchCharts` | Conversas por canal, Tarefas por status, Conversas por prioridade | `chartsLoading` |
| `fetchCommercial` | Pipeline value, Won value, Lost count, Deals por etapa | `commercialLoading` |
| `fetchTrend` | Série temporal diária com coorte de deals — inclui `newLeads` por dia (usa `v_kpi_company_daily` ou fallback direto em `deals`) | `trendLoading` |
| `fetchAnalytics` | Funil de conversão por etapa, Performance por agente | `analyticsLoading` |

### Biblioteca de gráficos
**Recharts v3** — tipos usados: `ComposedChart`, `AreaChart`, `BarChart`, `Area`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `CartesianGrid`.

### Design System do Dashboard

- **Fundo base:** `bg-white/[0.025]` com `border-white/[0.06]` (dark mode permanente nos cards)
- **Hero block:** `bg-gradient-to-br from-blue-950/40` com glow `drop-shadow` cyan no valor principal
- **Paleta de acentos:** ciano `#22D3EE` (pipeline), esmeralda `#10B981` (receita/ganhos), laranja `text-orange-400` (primário/labels), vermelho `#EF4444` (perdidos), roxo `text-violet-400` (IA/leads)
- **Grid dos gráficos:** `strokeDasharray="2 6"` + `stroke="rgba(255,255,255,0.04)"` sem linhas verticais
- **Ticks dos eixos:** `fill: '#52525b'` (zinc-600)
- **Animação de entrada dos cards:** classe CSS `.card-animate` definida em `index.css` com `@keyframes cardIn` (opacity 0→1, translateY 12px→0 em 400ms). Stagger via `animationDelay` prop nos `StatCard`.
- **Barras de progresso:** animam via `useBarAnimate()` de `width: 0%` → valor real com `transition: width 700ms cubic-bezier(0.16, 1, 0.3, 1)`

### Ícones necessários (lucide-react)
Todos os ícones do Dashboard devem estar explicitamente importados no topo do arquivo:
```
DollarSign, Trophy, Percent, AlertCircle, MessageSquare, Target, Inbox,
BadgeCheck, Zap, Clock, ArrowUpRight, ArrowDownRight, Minus, ChevronRight,
Activity, TrendingUp, Mail, Users, Layers
```
> ⚠️ `Layers` é usado no empty state do bloco "Pipeline por Etapa". Esquecer de importá-lo causa um `ReferenceError` em runtime que derruba toda a página.

### Seletor de período
Componente separado em `frontend/src/components/Dashboard/PeriodFilter.tsx`:
- Tipos: `'today' | '7d' | '30d' | '90d' | 'custom'`
- Interface `CustomRange { from: string; to: string }` — ISO datetimes do intervalo personalizado
- `periodToStartDate(period)` só aceita `Exclude<Period, 'custom'>` — para `'custom'` use `customRange.from`/`customRange.to` diretamente
- Filtro "Este Mês" (`30d`) usa início do mês corrente, não exatamente 30 dias atrás
- Ao selecionar `'custom'`, o componente exibe dois `<input type="date">` e chama `onCustomRangeChange(range)`. O Dashboard mantém `CustomRange | null` em estado e só dispara os fetches quando `customRange` está preenchido

## Módulo: Agenda

Módulo de agendamentos disponível para todos os membros da empresa. Rotas: `/agenda` e `/agenda/configuracoes`.

### Páginas

| Página | Arquivo | Propósito |
|--------|---------|-----------|
| `AgendaPage` | `frontend/src/pages/Agenda.tsx` | Lista, calendário semanal e mensal de agendamentos com criação/cancelamento/remarcação inline |
| `AgendaSettings` | `frontend/src/pages/AgendaSettings.tsx` | Configuração de horários de funcionamento por dia da semana e gerenciamento de tipos de serviço |

### Componentes internos (Agenda.tsx)

| Componente | Propósito |
|------------|-----------|
| `SlotsPicker` | Busca e exibe slots disponíveis via `rpc_get_available_slots` para a data e serviço selecionados |
| `ContactSearch` | Input de busca de contato com debounce e dropdown |
| `Toast` | Feedback de sucesso/erro com auto-dismiss em 3,5s |
| `Av` | Avatar colorido baseado no hash do nome (paleta determinística) |

### Modos de visualização (Agenda)
- **Lista** — todos os agendamentos com filtro por status e busca textual
- **Semana** — grade de 7 colunas (Dom–Sáb) com blocos posicionados por horário (7h–21h)
- **Mês** — grid mensal com indicadores de agendamentos por dia

### Status de agendamento
```
scheduled → completed
scheduled → cancelled   (requer cancellation_reason)
scheduled → rescheduled (cria novo appointment, linkado via rescheduled_from_id)
```

### Tabelas usadas pelo módulo Agenda
- `schedules` — leitura/escrita via `AgendaSettings`
- `service_types` — CRUD completo via `AgendaSettings` (**exclusivo da Agenda** — não confundir com `product_catalog`)
- `appointments` — leitura/escrita via `AgendaPage`

### RPCs da Agenda
Todas são `SECURITY DEFINER` e retornam `{ success: bool, error?: text, ... }`:
- `rpc_get_available_slots(p_company_id, p_service_type_id, p_date)` — retorna `{ slots: [{slot_start, slot_end}] }`
- `rpc_create_appointment(p_company_id, p_contact_id, p_service_type_id, p_scheduled_at, p_notes?)` — cria agendamento e retorna `appointment_id`
- `rpc_cancel_appointment(p_company_id, p_appointment_id, p_reason?)` — cancela
- `rpc_reschedule_appointment(p_company_id, p_appointment_id, p_new_scheduled_at)` — remarca
- `rpc_update_appointment_status(p_company_id, p_appointment_id, p_new_status, p_reason?)` — atualiza status com validação de tenant

## AuthContext — Comportamento de Carregamento

O `AuthContext` usa `onAuthStateChange` como **única** fonte de eventos de sessão (não chama `getSession()` separadamente — evita race condition com React StrictMode double-mount).

**Retry com backoff exponencial:** se o fetch do perfil falhar por timeout (8s) ou erro transiente, tenta novamente 3 vezes com delays de 2s, 4s e 8s. Após 3 tentativas sem sucesso, redireciona para `/login`.

**Geração de fetch (`fetchGenRef`):** evita que um fetch lento e cancelado aplique seu resultado após um fetch mais novo já ter resolvido (proteção contra race conditions no React StrictMode).

**Eventos ignorados:** `TOKEN_REFRESHED` e `SIGNED_IN` são ignorados se `profileLoadedRef.current === true` — evita loop de timeout a cada rotação de token.

## Git
- Remote: `https://github.com/hemersoncoelho/siaone.git` (repositório foi renomeado de `bia` para `siaone` em mai/2026 — atualize com `git remote set-url origin https://github.com/hemersoncoelho/siaone.git` se necessário)
- Commits seguem os prefixos `feat:`, `fix:`, `refactor:`. Mensagens de commit são escritas em português.
