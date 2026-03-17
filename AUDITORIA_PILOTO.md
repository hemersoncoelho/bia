# Auditoria de Prontidão para Piloto — SalesIA

**Data:** 17/03/2025  
**Objetivo:** Avaliar se o sistema está pronto para um teste piloto com cliente real.

---

## 1. RESUMO EXECUTIVO

### Visão geral do estado atual

O SalesIA é um SaaS de operação comercial com Inbox unificado, CRM (Leads/Contatos), Pipeline de vendas, Tarefas, Agentes de IA e gestão de equipe/times. A arquitetura usa React + Vite no frontend e Supabase (Postgres + Auth + Realtime) no backend.

**Pontos fortes:**
- Fluxos principais (Login, SelectCompany, Home, Dashboard, Inbox, Deals, Tasks, Contacts) estão implementados com dados reais do banco
- Autenticação e multi-tenant funcionais
- RPCs críticos existem e estão integrados (inbox, deals, conversas, agentes)
- Estados de loading, empty e error presentes na maioria das telas
- Permissões por perfil (agent, manager, company_admin, system_admin) implementadas

**Principais riscos:**
1. **Bloqueador:** InviteMemberModal chama RPC `create_company_member` que **não existe** no banco — fluxo de "Criar Membro" quebra
2. **Bloqueador:** NewConversationModal passa `p_agent_id: user.id` (ID do usuário) em vez de ID do agente IA ou null — pode causar erro ou comportamento incorreto na RPC
3. **Importante:** Integrações são apenas catálogo estático — botões "Conectar" não fazem nada; sem integração real, o Inbox não recebe mensagens de canais externos
4. **Importante:** Rota `/settings` mostra placeholder "Configurações gerais em breve"
5. **Importante:** Rota `/companies` mostra placeholder "Companies Module"

### Decisão sugerida: **GO com ressalvas**

O sistema pode ser usado em piloto **desde que**:
- Os bloqueadores P0 sejam corrigidos antes
- O piloto seja conduzido com cenário controlado (ex.: conversas criadas manualmente via "Novo Atendimento", sem dependência de integrações externas)
- O cliente aceite que Integrações e algumas configurações ainda estão em desenvolvimento

---

## 2. PERCENTUAL DE CONCLUSÃO

### Metodologia

A estimativa foi baseada na cobertura dos fluxos essenciais por área, considerando:
- **Pronto:** fluxo completo, persistência real, sem mocks, UX aceitável
- **Parcial:** fluxo existe mas com gaps (ex.: sem integração real, placeholder)
- **Crítico:** fluxo quebrado ou ausente

| Área | Peso | Cobertura | Contribuição |
|------|------|-----------|--------------|
| Auth e acesso | 10% | 95% | 9.5% |
| Home e navegação | 8% | 90% | 7.2% |
| Inbox + detalhe conversa | 15% | 85% | 12.75% |
| Contatos/Leads | 10% | 90% | 9% |
| Pipeline/Deals | 10% | 90% | 9% |
| Tarefas | 8% | 90% | 7.2% |
| Equipe/Membros | 8% | 60% | 4.8% |
| Times | 6% | 85% | 5.1% |
| Agentes IA | 8% | 90% | 7.2% |
| Integrações | 6% | 30% | 1.8% |
| Dashboard/KPIs | 5% | 90% | 4.5% |
| Configurações | 6% | 50% | 3% |

### Resultados

- **Produto concluído:** ~72%
- **Falta para piloto:** ~15–18% (correção de bloqueadores + ajustes importantes)
- **Falta para maturidade pós-piloto:** ~25–30% (integrações reais, configurações completas, refinamentos)

---

## 3. MATRIZ DE PRONTIDÃO

| Área | Status | Nota | Observação |
|------|--------|------|------------|
| **Autenticação e acesso** | Pronto | 9 | Login (senha + OTP), guards, redirect por role, SelectCompany |
| **Home e navegação** | Pronto | 9 | Home com dados reais, menu lateral, IndexRedirect por role |
| **Operação comercial** | Parcial | 8 | Inbox + Deals + Tasks funcionais; pequenos bugs |
| **Inbox** | Parcial | 8 | Lista, detalhe, nova conversa, realtime; bug em p_agent_id |
| **Contatos/Leads** | Pronto | 9 | CRUD real, lifecycle, contact_identities, busca |
| **Equipe/Times** | Parcial | 7 | Membros e Times com dados reais; InviteMember quebrado |
| **Integrações** | Crítico | 3 | Catálogo estático; botões sem ação; sem persistência |
| **Agentes IA** | Pronto | 9 | CRUD, toggle, persistência via RPC |
| **Dashboard/KPIs** | Pronto | 9 | KPIs reais, gráficos, filtro de período, visão agent |
| **Persistência e banco** | Pronto | 9 | RPCs integrados; view v_company_kpis |
| **UX geral** | Parcial | 7 | Loading/empty/error na maioria; algumas telas com gaps |
| **Performance** | Parcial | 8 | Lazy load, debounce; sem problemas graves |
| **Confiabilidade para piloto** | Parcial | 7 | Bloqueadores impedem uso pleno; corrigíveis |

---

## 4. LISTA DE MELHORIAS PRIORIZADAS

### P0 — Bloqueadores do piloto

| # | Título | Problema | Impacto | Recomendação |
|---|--------|----------|---------|---------------|
| 1 | InviteMemberModal usa RPC inexistente | Chama `create_company_member` que não existe no banco. A Edge Function `create-member` existe mas é HTTP, não RPC | Admin não consegue adicionar membros à equipe | Alterar InviteMemberModal para chamar a Edge Function `create-member` via `supabase.functions.invoke('create-member', { body: {...} })` em vez de `supabase.rpc` |
| 2 | NewConversationModal passa user.id como p_agent_id | RPC `rpc_create_contact_and_conversation` espera ID do agente IA ou null. Passar user.id pode causar erro ou lógica incorreta | Nova conversa pode falhar ou criar vínculo errado | Passar `null` para `p_agent_id` (atribuição manual) ou permitir seleção de agente no modal |

### P1 — Importantes para estabilidade e confiança

| # | Título | Problema | Impacto | Recomendação |
|---|--------|----------|---------|---------------|
| 3 | Rota /settings placeholder | Configurações gerais mostra "Configurações gerais em breve" | Usuário espera configurações e encontra vazio | Redirecionar /settings para /settings/team ou criar página mínima com links para Times/Usuários |
| 4 | Rota /companies placeholder | "Companies Module" sem implementação | Menu ou link pode levar a dead-end | Remover do menu ou implementar listagem mínima |
| 5 | Integrações sem ação | Botões "Conectar" não fazem nada; status sempre desconectado | Cliente não consegue conectar canais; Inbox depende de conversas manuais | Para piloto: deixar explícito que integrações estão em breve; ou implementar fluxo mínimo (ex.: WhatsApp) |
| 6 | Email não exibido em Membros | user_profiles não tem email; Members mostra "—" | Dificulta identificar membros | Buscar email de auth.users via RPC ou view (com permissão) e exibir |
| 7 | TeamCard botões sem ação | "Configurar" e "Detalhes" não navegam nem abrem modal | UX confusa | Implementar navegação para edição de time ou remover botões até implementar |
| 8 | SelectCompany com 0 empresas | platform_admin sem empresas pode ficar em loop | Edge case | Garantir redirect para /admin quando availableCompanies.length === 0 e role é admin |

### P2 — Melhorias recomendadas (não bloqueiam)

| # | Título | Problema | Impacto | Recomendação |
|---|--------|----------|---------|---------------|
| 9 | Contato: lifecycle_stage vs status | NewContactModal mapeia stage→status; Contacts usa lifecycle_stage derivado | Possível inconsistência em edge cases | Padronizar schema (lifecycle_stage ou status) e garantir mapeamento correto |
| 10 | Members: StatCard "Ativos" | Mostra mesmo valor que "Total" | Cosmético | Calcular ativos (ex.: últimos 30 dias) ou remover card duplicado |
| 11 | Responsividade | Algumas telas podem quebrar em mobile | Piloto provavelmente desktop | Revisar breakpoints em telas críticas |
| 12 | Documentação "Ver documentação" | Botão em Integrações não leva a lugar | Baixo | Linkar para docs ou remover até ter conteúdo |

---

## 5. PLANO DE AÇÃO

### Etapa 1: Corrigir bloqueadores do piloto

**Objetivo:** Permitir que o fluxo essencial funcione sem erros críticos.

**Tarefas:**
1. Corrigir InviteMemberModal: chamar Edge Function `create-member` em vez de RPC inexistente
2. Corrigir NewConversationModal: passar `p_agent_id: null` (ou implementar seleção de agente)

**Impacto:** Admin consegue adicionar membros; nova conversa funciona corretamente.

**Dependências:** Edge Function `create-member` já existe e está deployada; secrets configurados.

**Esforço:** Baixo (1–2h)

---

### Etapa 2: Ajustar pontos importantes para estabilidade

**Objetivo:** Evitar dead-ends e melhorar confiança do usuário.

**Tarefas:**
1. Rota /settings: redirecionar para /settings/team ou criar página mínima
2. Rota /companies: remover do menu ou implementar placeholder útil
3. Integrações: adicionar mensagem explícita "Em breve" ou desabilitar botões com tooltip
4. Members: buscar e exibir email (via RPC ou view)
5. TeamCard: remover ou implementar ações dos botões
6. SelectCompany: tratar caso 0 empresas para admin

**Impacto:** Menos frustração; fluxo mais coerente.

**Esforço:** Médio (4–6h)

---

### Etapa 3: Melhorias pós-piloto

**Objetivo:** Refinamentos e funcionalidades completas.

**Tarefas:**
1. Integrações reais (WhatsApp, etc.)
2. Configurações gerais completas
3. Padronização lifecycle_stage/status em contatos
4. Responsividade e polish de UX
5. Documentação de API

**Esforço:** Alto (semanas)

---

## 6. CHECKLIST FINAL DE GO / NO-GO

### O que precisa obrigatoriamente estar pronto para liberar o piloto

- [ ] InviteMemberModal funcionando (Edge Function ou RPC equivalente)
- [ ] NewConversationModal com p_agent_id correto
- [ ] Login, SelectCompany, Home, Dashboard operacionais
- [ ] Inbox listando conversas e permitindo nova conversa manual
- [ ] Detalhe da conversa: enviar mensagem, atribuir, fechar
- [ ] Contatos: criar, listar, filtrar
- [ ] Pipeline: listar deals, mover entre estágios, criar novo
- [ ] Tarefas: criar, listar, alterar status
- [ ] Agentes IA: criar, editar, ativar/desativar
- [ ] Membros e Times: listar; criar time; criar membro (após correção)

### O que pode ficar para depois

- Integrações reais (WhatsApp, etc.)
- Configurações gerais completas
- Rota /companies
- Botões Configurar/Detalhes em TeamCard
- Email em lista de membros
- Responsividade completa

### Decisão sugerida

**GO com ressalvas** — Corrigir os 2 itens P0 e realizar piloto com cenário controlado (conversas manuais, sem integrações externas). Comunicar ao cliente que integrações e algumas configurações estão em roadmap.

---

## ANEXO: Validações realizadas

- Rotas e Guards: `AppRoutes.tsx`, `Guards.tsx`, `RouteGuardForAgent.tsx`
- Contextos: `AuthContext`, `TenantContext`
- Páginas: Home, Dashboard, Inbox, Contacts, Deals, Tasks, AiAgents, AiAgentDetail, Members, Teams, Integrations, CompanySettings, SelectCompany, Login
- Componentes críticos: ConversationDetail, NewConversationModal, InviteMemberModal, NewTeamModal, NewDealModal, CompanyTeamAndUsers
- Supabase: migrations, RPCs (rpc_get_inbox_conversations, rpc_create_contact_and_conversation, rpc_update_deal_stage, rpc_save_ai_agent, rpc_toggle_ai_agent, rpc_invite_member)
- Edge Functions: create-member
