# Auditoria de Performance — SalesIA Frontend

**Data:** 15/03/2025  
**Objetivo:** Identificar e corrigir gargalos de performance sem refatoração ampla.

---

## 1. DIAGNÓSTICO — GARGALOS ENCONTRADOS

### 1.1 Renderização

| Problema | Local | Impacto |
|----------|-------|---------|
| `navItems` recriado a cada render | `Sidebar.tsx` | Re-render desnecessário dos NavLinks |
| `filtered` recalculado a cada render | `Contacts.tsx`, `Inbox.tsx`, `Members.tsx`, `Teams.tsx` | Filtro pesado em listas grandes |
| `stageCount` recalculado a cada render | `Contacts.tsx` | 5 chamadas de filter por render |
| Context value sem memoização | `TenantContext.tsx` | Todos os consumidores re-renderizam quando qualquer valor muda |
| `setCompany`, `enableSupportMode`, `disableSupportMode` recriados | `TenantContext.tsx` | Props instáveis em componentes filhos |
| `fetchKPIs`, `fetchCharts`, `handlePeriodChange` sem useCallback | `Dashboard.tsx` | Dependências instáveis em useEffect |

### 1.2 Dados e Fetch

| Problema | Local | Impacto |
|----------|-------|---------|
| 6+ queries sequenciais | `useCompanySummary.ts` | Home lenta; pipelines + stages + members em série |
| `fetchMembers` e `fetchTeams` em useEffects separados | `Members.tsx` | 2 round-trips em paralelo, mas poderia ser 1 |
| `select('*')` em user_profiles | `AuthContext.tsx` | Dados desnecessários trafegados |
| Sem debounce em buscas | `Contacts.tsx`, `Inbox.tsx`, `Members.tsx`, `Teams.tsx` | Filtro executado a cada tecla |

### 1.3 Estrutura e Carregamento

| Problema | Local | Impacto |
|----------|-------|---------|
| Sem code splitting | `AppRoutes.tsx` | Bundle único; Recharts (~100KB) carregado mesmo sem abrir Dashboard |
| Páginas pesadas carregadas no bootstrap | Dashboard, Inbox, Deals, AiAgents, etc. | TTI (Time to Interactive) alto |

### 1.4 Supabase

| Problema | Local | Impacto |
|----------|-------|---------|
| Queries em série onde paralelo resolve | `useCompanySummary` | 1–2 round-trips economizados |

---

## 2. CORREÇÕES APLICADAS

### 2.1 Code Splitting (AppRoutes.tsx)

- **Antes:** Todas as páginas importadas estaticamente.
- **Depois:** `Dashboard`, `Inbox`, `Deals`, `Tasks`, `AiAgents`, `AiAgentDetail`, `Contacts`, `Members`, `Teams`, `Integrations`, `CompanySettings` carregados via `React.lazy()`.
- **Ganho:** Bundle inicial menor; Recharts e páginas pesadas carregam sob demanda.
- **Arquivo:** `frontend/src/routes/AppRoutes.tsx`

### 2.2 Debounce em Buscas

- **Novo hook:** `useDebounce(value, delay)` em `frontend/src/hooks/useDebounce.ts`.
- **Contacts:** `debouncedSearch` (280ms) para filtro; evita filtro a cada tecla.
- **Inbox:** `debouncedSearch` (250ms) para `filteredConversations`.
- **Arquivos:** `Contacts.tsx`, `Inbox.tsx`, `hooks/useDebounce.ts`

### 2.3 Memoização de Filtros

- **Contacts:** `useMemo` em `filtered`; `useCallback` em `stageCount`.
- **Inbox:** `useMemo` em `filteredConversations`.
- **Members:** `useMemo` em `filteredMembers`.
- **Teams:** `useMemo` em `filteredTeams`.
- **Arquivos:** `Contacts.tsx`, `Inbox.tsx`, `Members.tsx`, `Teams.tsx`

### 2.4 Otimização de useCompanySummary

- **Antes:** pipelines → stages (sequencial) → members (sequencial).
- **Depois:** `stagesData` e `membersData` em `Promise.all`.
- **Ganho:** 1 round-trip a menos.
- **Arquivo:** `frontend/src/hooks/useCompanySummary.ts`

### 2.5 Dashboard — useCallback

- `fetchKPIs` e `fetchCharts` com `useCallback`.
- `handlePeriodChange` com `useCallback`.
- `useEffect` com dependências corretas.
- **Arquivo:** `frontend/src/pages/Dashboard.tsx`

### 2.6 TenantContext — Memoização

- `useMemo` no valor do contexto.
- `useCallback` em `setCompany`, `enableSupportMode`, `disableSupportMode`.
- **Ganho:** Menos re-renders em Sidebar, Topbar, páginas.
- **Arquivo:** `frontend/src/contexts/TenantContext.tsx`

### 2.7 Sidebar — navItems

- `NAV_ITEMS` constante fora do componente.
- `useMemo` para montar ícones a partir dos itens.
- **Arquivo:** `frontend/src/components/Layout/Sidebar.tsx`

### 2.8 AuthContext — Select Enxuto

- `select('*')` → `select('id, full_name, avatar_url, system_role')`.
- **Arquivo:** `frontend/src/contexts/AuthContext.tsx`

### 2.9 Members — Fetches em Paralelo

- `fetchMembers` e `fetchTeams` no mesmo `useEffect`.
- **Arquivo:** `frontend/src/pages/company/Members.tsx`

---

## 3. ARQUIVOS ALTERADOS

| Arquivo | Alteração |
|---------|-----------|
| `routes/AppRoutes.tsx` | Code splitting com lazy + Suspense |
| `hooks/useDebounce.ts` | **Novo** — hook de debounce |
| `hooks/useCompanySummary.ts` | Paralelização de stages + members |
| `pages/Dashboard.tsx` | useCallback em fetches e handlers |
| `pages/Contacts.tsx` | useMemo, useCallback, useDebounce |
| `pages/Inbox.tsx` | useMemo, useDebounce |
| `pages/company/Members.tsx` | useMemo, useEffect unificado |
| `pages/company/Teams.tsx` | useMemo |
| `contexts/TenantContext.tsx` | useMemo, useCallback |
| `contexts/AuthContext.tsx` | Select enxuto |
| `components/Layout/Sidebar.tsx` | NAV_ITEMS constante, useMemo |

---

## 4. GANHOS ESPERADOS

- **Carregamento inicial:** Redução do bundle inicial (Dashboard, Inbox, etc. sob demanda).
- **Navegação:** Menos re-renders em Sidebar/Topbar e páginas.
- **Busca/filtro:** Debounce reduz trabalho em digitação rápida.
- **Home:** 1 round-trip a menos ao Supabase.
- **Percepção:** Skeletons durante lazy load; menos travamentos ao digitar.

---

## 5. O QUE AINDA PODE SER MELHORADO (FUTURO)

1. **ConversationDetail:** Componente grande (~1000 linhas); considerar split ou virtualização da Timeline.
2. **Deals:** `select('*')` em deals; poderia selecionar apenas colunas usadas.
3. **Dashboard:** Gráficos Recharts poderiam ser lazy dentro da página (só montar quando visíveis).
4. **Paginação:** Contacts, Inbox, Deals sem limite; em volumes altos, adicionar paginação.
5. **Recharts:** Avaliar alternativa mais leve (Chart.js, lightweight-charts) se o bundle for crítico.
6. **Ícones Lucide:** Importação por nome já é tree-shakeable; verificar se há imports desnecessários.
