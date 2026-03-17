# Auditoria de Integração Frontend ↔ Supabase

**Data:** 15/03/2025  
**Objetivo:** Remover mocks, hardcodes e dados fictícios; garantir que o frontend use apenas dados reais do banco.

---

## 1. DIAGNÓSTICO DO QUE ESTAVA MOCKADO OU DESCONECTADO

### Home (`pages/company/Home.tsx`)
- **Métricas:** Valores fixos (12 membros, 3 times, 48 conversas, R$ 125k)
- **Membros Recentes:** Lista estática (Alice Silva, Bruno Costa, Carla Souza)
- **Pipeline:** Estágios fixos (Leads 24, Qualificação 12, Proposta 5, Fechamento 3)

### Dashboard da Empresa (`pages/company/Dashboard.tsx`)
- **Idêntico ao Home:** Mesmos números e listas mockadas

### Membros (`pages/company/Members.tsx`)
- **Lista completa mockada:** 4 membros fictícios (Alice, Bruno, Carla, Daniel)
- **Stats:** Derivados do array local
- **Busca:** Filtrava apenas o array mock

### Times (`pages/company/Teams.tsx`)
- **Lista completa mockada:** 3 times fictícios (Vendas BR, Suporte Global, Customer Success)
- **Busca:** Filtrava apenas o array local

### Integrações (`pages/company/Integrations.tsx`)
- **Status fake:** WhatsApp e API marcados como "conectados" sem backend
- **Contador:** "2 conectadas" inventado

### Contatos (`pages/Contacts.tsx`)
- **Schema mismatch:** `contact_identities` usa `provider`/`identifier` no banco, frontend esperava `channel_type`/`display_value`
- **NewContactModal:** Inseria em colunas inexistentes (`company_id`, `channel_type`, `display_value` em `contact_identities`)

### Dashboard Principal (`pages/Dashboard.tsx`)
- **lifecycle_stage:** Consultava coluna que pode não existir (schema usa `status`)
- **qualified_leads:** Filtrava por `lifecycle_stage = 'qualified'` em vez de `status = 'active'`

### Login (`pages/Login.tsx`)
- **Comentário:** "Login Form (Mock)" — o formulário já era real (Supabase Auth)

---

## 2. LISTA OBJETIVA DO QUE FOI CORRIGIDO

| Página/Componente | Correção |
|-------------------|----------|
| **Home** | Criado hook `useCompanySummary`; KPIs, membros e pipeline vêm de `v_company_kpis`, `user_companies`, `user_profiles`, `teams`, `deals`, `pipeline_stages` |
| **Dashboard (empresa)** | Mesmo hook; dados reais em todas as seções |
| **Membros** | Fetch de `user_companies` + `user_profiles` + `teams`; listagem real com loading e empty state |
| **Times** | Fetch de `teams`; contagem de membros via `user_companies`; gerentes via `user_profiles` |
| **Integrações** | Todos os status alterados para `disconnected`; badge mostra "Nenhuma conectada" quando 0 |
| **Contatos** | Select ajustado para `provider`/`identifier`; mapeamento para UI; insert em `contact_identities` com colunas corretas |
| **Dashboard principal** | `qualified_leads` usa `status = 'active'`; contatos por estágio usa `status` com mapeamento lead/active/inactive → lead/qualified/lost |
| **Login** | Removido comentário "(Mock)" |

---

## 3. PÁGINAS QUE AGORA USAM DADOS REAIS

- **Home** — `useCompanySummary` (v_company_kpis, user_companies, teams, deals, pipeline_stages)
- **Dashboard (empresa)** — Idem
- **Membros** — `user_companies`, `user_profiles`, `teams`
- **Times** — `teams`, `user_companies`, `user_profiles`
- **Contatos** — `contacts`, `contact_identities` (schema real)
- **Dashboard principal** — `v_company_kpis`, `messages`, `contacts`, `conversations`, `tasks` (já integrado, ajustes de colunas)
- **Inbox** — `rpc_get_inbox_conversations` (já integrado)
- **Deals/Pipeline** — `pipelines`, `pipeline_stages`, `deals`, `rpc_update_deal_stage` (já integrado)
- **Tasks** — `tasks`, `user_companies`, `user_profiles` (já integrado)
- **Agentes IA** — `ai_agents`, `rpc_toggle_ai_agent` (já integrado)

---

## 4. BOTÕES E FORMULÁRIOS QUE PERSISTEM NO BANCO

- **Novo Contato** — Insert em `contacts` e `contact_identities`
- **Nova Tarefa** — Insert em `tasks`
- **Novo Negócio** — Insert em `deals` (via `NewDealModal`)
- **Nova Conversa** — `rpc_create_contact_and_conversation`
- **Mover deal** — `rpc_update_deal_stage`
- **Toggle agente IA** — `rpc_toggle_ai_agent`
- **Enviar mensagem** — `rpc_enqueue_outbound_message`
- **Atribuir conversa** — `rpc_assign_conversation`
- **Marcar como lido** — `rpc_mark_conversation_read`
- **Fechar conversa** — `rpc_close_conversation`
- **Salvar agente** — `rpc_save_ai_agent`
- **CompanyTeamAndUsers** — Update em `user_companies`, `teams`

---

## 5. PONTOS QUE AINDA DEPENDEM DE BACKEND

| Funcionalidade | Estado |
|----------------|--------|
| **Integrações** | Não há tabela de integrações; status sempre "desconectado" |
| **Configurar Time** | Botões "Configurar" e "Detalhes" sem ação de persistência |
| **Email em Membros** | `user_profiles` não tem email; exibido "—" |

### Implementados (pós-auditoria)
- **Convidar Membro** — Modal + RPC `rpc_invite_member`; adiciona usuário existente ou cria convite pendente. Migration: `backend_invite_and_teams.sql`
- **Criar Novo Time** — Modal `NewTeamModal`; insert em `teams`. Policy `teams_insert` já existia.

---

## 6. CONFIRMAÇÃO: MOCKS E HARDCODES REMOVIDOS

- ✅ Números fixos em cards de resumo (Home, Dashboard)
- ✅ Listas estáticas de membros e times
- ✅ Pipeline com contagens inventadas
- ✅ Status fake em Integrações (WhatsApp, API)
- ✅ Arrays mock em Members e Teams
- ✅ Comentário "Mock" no Login

---

## 7. ARQUIVOS ALTERADOS

| Arquivo | Alteração |
|---------|-----------|
| `frontend/src/hooks/useCompanySummary.ts` | **Novo** — Hook para KPIs, membros, times, pipeline |
| `frontend/src/pages/company/Home.tsx` | Uso de `useCompanySummary`; dados reais |
| `frontend/src/pages/company/Dashboard.tsx` | Idem |
| `frontend/src/pages/company/Members.tsx` | Fetch Supabase; remoção de mock |
| `frontend/src/pages/company/Teams.tsx` | Fetch Supabase; remoção de mock |
| `frontend/src/pages/company/Integrations.tsx` | Status real (todos desconectados) |
| `frontend/src/pages/Contacts.tsx` | Schema `contact_identities`; mapeamento provider/identifier |
| `frontend/src/pages/Dashboard.tsx` | Uso de `status` em vez de `lifecycle_stage` |
| `frontend/src/pages/Login.tsx` | Remoção de comentário "(Mock)" |

---

## 8. VALIDAÇÃO

- Build do frontend: **OK**
- Sem dados mockados nas páginas principais
- Sem números fictícios em cards e gráficos
- Sem listas fake
- Botões e inputs principais integrados ao Supabase
- Frontend usa o banco como fonte de verdade
