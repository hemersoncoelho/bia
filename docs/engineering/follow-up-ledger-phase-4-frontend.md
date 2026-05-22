# Follow-up Ledger — Fase 4: Frontend

**Data:** 2026-05-22
**Escopo:** Exibição de estado de ciclos de follow-up no produto.
**Não alterado:** n8n, migrações, analytics, envio de mensagens.

---

## 1. Resumo

O frontend agora consome `rpc_get_follow_up_state` e exibe o estado de ciclos de follow-up em dois pontos do produto:

- **Inbox → ConversationDetail**: seção colapsável "Follow-ups" no sidebar de contexto.
- **Tarefas → AgentOperationCard**: badges de tentativas, próximo follow e bloqueio sobrepostos nos cards de operação do tipo `follow_up`.

---

## 2. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `frontend/src/types.ts` | Tipos adicionados: `FollowUpCycleStatus`, `FollowUpBlockReason`, `FollowUpState`, `FollowUpHistoryItem`, `FollowUpFollowType`, `FollowUpChannel`, `FollowUpEventStatus` |
| `frontend/src/hooks/useFollowUpState.ts` | Hook principal de leitura e ação |
| `frontend/src/components/FollowUp/followUpLabels.ts` | Helpers de tradução pt-BR |
| `frontend/src/components/FollowUp/FollowUpAttemptBadge.tsx` | Pill "Follow N/M" |
| `frontend/src/components/FollowUp/FollowUpStatusBadge.tsx` | Badge de status do ciclo |
| `frontend/src/components/FollowUp/FollowUpResponseBadge.tsx` | Badge "Retomou" |
| `frontend/src/components/FollowUp/FollowUpNextAllowed.tsx` | Quando o próximo follow é permitido |
| `frontend/src/components/FollowUp/FollowUpBlockReason.tsx` | Alerta inline de bloqueio |
| `frontend/src/components/FollowUp/FollowUpHistoryPanel.tsx` | Histórico colapsável de eventos |
| `frontend/src/components/FollowUp/FollowUpPanel.tsx` | Painel consolidado (agrupa todos os componentes) |

## 3. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `frontend/src/components/Inbox/ConversationDetail.tsx` | Hook `useFollowUpState` + seção "Follow-ups" colapsável |
| `frontend/src/components/Tasks/AgentOperationCard.tsx` | Prop `followUpState?: FollowUpState \| null` + badges inline |

---

## 4. Hook `useFollowUpState`

```typescript
const { data, history, isLoading, error, refetch, stopCycle } = useFollowUpState({
  contactId,       // obrigatório
  conversationId,  // opcional
  dealId,          // opcional
});
```

**Responsabilidades:**
- Obtém `company_id` via `TenantContext` — nunca hardcoded.
- Não dispara se `companyId` ou `contactId` for nulo.
- Chama `rpc_get_follow_up_state` via `supabase.rpc`.
- Busca histórico de `follow_up_events` via query direta com RLS.
- Expõe `stopCycle(reason)` que chama `rpc_stop_follow_up_cycle`.
- Usa `fetchGenRef` para evitar race conditions.

**Não faz:**
- Não calcula se pode enviar follow (delega ao RPC).
- Não conta tentativas a partir de `messages`.
- Não usa `service_role`.

---

## 5. Onde aparecem os estados

### Follow N/M (`FollowUpAttemptBadge`)
- **AgentOperationCard**: topo do head row, ao lado do tag de tipo, quando `operation_type === 'follow_up'`.
- **ConversationDetail → Follow-ups**: dentro do `FollowUpPanel`.

### Próximo follow (`FollowUpNextAllowed`)
- **AgentOperationCard**: linha de meta abaixo dos badges, quando `block_reason === 'min_interval_not_elapsed'`.
- **ConversationDetail → Follow-ups**: dentro do `FollowUpPanel`.

### Retomou (`FollowUpResponseBadge`)
- **AgentOperationCard**: ao lado do badge de tentativas, quando `has_responded === true`.
- **ConversationDetail → Follow-ups**: dentro do `FollowUpPanel`.

### Bloqueios (`FollowUpBlockReason`)
- **AgentOperationCard**: bloco de alerta inline acima do rodapé, apenas para bloqueios que não sejam `min_interval_not_elapsed` (esse caso é coberto por `FollowUpNextAllowed`).
- **ConversationDetail → Follow-ups**: dentro do `FollowUpPanel`.

### Opt-out
- Exibido via `FollowUpStatusBadge` com label "Pausa solicitada".
- `FollowUpBlockReason` mostra alerta "Contato solicitou pausa".

### Histórico (`FollowUpHistoryPanel`)
- **ConversationDetail → Follow-ups**: colapsável com `defaultOpen={false}`.
- Exibe: tentativa, origem (IA/Cadência/Manual), canal, status, enviado em, respondeu ou não, motivo de parada.

---

## 6. Tradução de labels (`followUpLabels.ts`)

| Chave | Label pt-BR |
|-------|-------------|
| `ok` | Disponível |
| `opt_out` | Contato solicitou pausa |
| `max_attempts_reached` | Limite de tentativas atingido |
| `min_interval_not_elapsed` | Próximo follow ainda não liberado |
| `human_recently_engaged` | Humano assumiu recentemente |
| `outside_business_hours` | Fora do horário comercial |
| `autopilot_disabled` | Autopilot desativado |
| `cycle_stopped` | Ciclo encerrado |
| `contact_not_found` | Contato não encontrado |
| `conversation_not_found` | Conversa não encontrada |
| `deal_not_found` | Negócio não encontrado |
| `invalid_channel` | Canal inválido |
| `active` | Ciclo ativo |
| `paused` | Pausado |
| `stopped` | Encerrado |
| `responded` | Contato respondeu |
| `completed` | Concluído |
| `agent_auto` | IA |
| `cadence_step` | Cadência |
| `human_manual` | Manual |
| `human_bulk` | Manual em lote |
| `system_rescue` | Resgate |

---

## 7. Decisões de performance

- **Sem N+1 no AutopilotCard:** os badges de follow-up só aparecem em `AgentOperationCard` quando a prop `followUpState` for passada pelo pai. O `AutopilotCard` não chama o hook internamente — a decisão de carregar o estado fica com o consumidor (por enquanto `AgentOperationCard` aceita a prop mas o `AutopilotCard` não a passa, zero chamadas extras por card).
- **Carregamento lazy:** o estado é carregado apenas quando o `ConversationDetail` monta com um `contact_id` válido.
- **Histórico limitado:** `follow_up_events` buscado com `LIMIT 20`, ordenado por `sent_at DESC`.
- **Race condition:** `fetchGenRef` protege contra respostas de fetches stale.

> **Pendência de performance:** se o `AutopilotCard` precisar mostrar follow-up state para múltiplos cards simultaneamente, avaliar batch RPC ou carregamento on-demand (expandir card para ver estado).

---

## 8. Ação "Encerrar ciclo"

- Botão visível em `FollowUpPanel` quando `canManage === true` e `cycleIsActive === true`.
- Requer confirmação inline antes de chamar `rpc_stop_follow_up_cycle` com `reason = 'manual_cancel'`.
- Após confirmar: refetch automático do estado via hook.
- A RPC `rpc_stop_follow_up_cycle` está acessível para `authenticated` (GRANT já aplicado na migração `followup_ledger_005_core_rpcs.sql`).

---

## 9. Loading e erro

| Estado | Comportamento |
|--------|---------------|
| `isLoading = true` | Skeleton animado de 2 pills no lugar do painel |
| `error != null` | Texto discreto "Estado de follow indisponível." — sem quebrar o layout |
| `data = null` sem erro | "Sem follow registrado" |
| `history.length = 0` | "Nenhum follow-up registrado neste ciclo." |

---

## 10. Fora do escopo (este PR)

- Dashboard analítico de follow-up.
- Gráficos de eficiência e retomada.
- `rpc_get_follow_up_stats`.
- Envio real de follow pelo frontend.
- Backfill histórico.
- Batch RPC para múltiplos cards.

---

## 11. Próximo passo recomendado

**Fase 5:** Dashboard analítico de follow-up com `rpc_get_follow_up_stats`:
- Taxa de retomada por empresa/agente/canal.
- Funil de tentativas (Follow 1 → 2 → 3 → Respondeu).
- Métricas de lag de resposta.
- Integração ao painel do Dashboard Comercial existente.
