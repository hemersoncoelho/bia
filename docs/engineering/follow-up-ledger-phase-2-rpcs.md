# Follow-up Ledger — Fase 2: RPCs Core

_Criado: 2026-05-22_

## 1. Resumo

Esta fase implementa as 5 RPCs core que controlam o ciclo de vida completo de um follow-up no Sia One. As funções foram aplicadas no banco via MCP Supabase e validadas com dados reais do ambiente de desenvolvimento.

---

## 2. Contexto — O que a Fase 1 criou

As migrations da Fase 1 existiam em disco mas não haviam sido aplicadas. Foram aplicadas nesta fase via MCP em ordem:

| Migration | O que criou |
|-----------|-------------|
| `agent_operations_001` | Tabela `agent_operations`, campo `companies.autopilot_enabled`, RPCs de gestão de operações |
| `followup_ledger_001_contacts_config` | Campos `companies.follow_up_max_attempts/min_interval_hours/attribution_hours`, campos `contacts.follow_up_opt_out/opt_out_at/opt_out_reason` |
| `followup_ledger_002_agent_ops_fields` | Campos `agent_operations.conversation_id/deal_id/attempt_number/cycle_id/follow_up_event_id` |
| `followup_ledger_003_follow_up_events` | Tabela `follow_up_events` (ledger auditável), FK para `agent_operations` |
| `followup_ledger_004_follow_up_cycle_state` | Tabela `follow_up_cycle_state` com índices únicos parciais por contexto |

---

## 3. RPCs Criadas

### 3.1 `rpc_can_send_follow_up`

**Assinatura:**
```sql
rpc_can_send_follow_up(
  p_company_id      uuid,
  p_contact_id      uuid,
  p_conversation_id uuid    DEFAULT NULL,
  p_deal_id         uuid    DEFAULT NULL,
  p_channel         text    DEFAULT 'whatsapp'
) RETURNS jsonb
```

**Responsabilidade:** Decisão read-only. Não cria nem altera nenhum dado.

**Retorno:**
```json
{
  "allowed": true,
  "reason": "ok",
  "attempt_number": 1,
  "max_attempts": 3,
  "last_follow_sent_at": null,
  "next_allowed_at": null,
  "cycle_status": "virtual_first",
  "cycle_id": null,
  "contact_id": "uuid",
  "conversation_id": "uuid"
}
```

**Reasons possíveis:** `ok`, `contact_not_found`, `conversation_not_found`, `deal_not_found`, `opt_out`, `autopilot_disabled`, `cycle_stopped`, `max_attempts_reached`, `min_interval_not_elapsed`, `human_recently_engaged`, `invalid_channel`

**Comportamento de ciclo respondido:** Quando o ciclo mais recente está em `responded/stopped/completed`, a função retorna `allowed=true` — um novo ciclo pode ser iniciado. O bloqueio `cycle_stopped` só se aplica quando um ciclo `active/paused` tem o status encerrado (o que não ocorre por design — ciclos encerrados não ficam em `active/paused`).

**Grants:** `authenticated`, `service_role`

---

### 3.2 `rpc_register_follow_up_sent`

**Assinatura:**
```sql
rpc_register_follow_up_sent(
  p_company_id          uuid,
  p_contact_id          uuid,
  p_conversation_id     uuid    DEFAULT NULL,
  p_deal_id             uuid    DEFAULT NULL,
  p_task_id             uuid    DEFAULT NULL,
  p_operation_id        uuid    DEFAULT NULL,
  p_trigger_id          uuid    DEFAULT NULL,
  p_cadence_id          uuid    DEFAULT NULL,
  p_cadence_step_id     uuid    DEFAULT NULL,
  p_follow_type         text    DEFAULT 'agent_auto',
  p_channel             text    DEFAULT 'whatsapp',
  p_message_id          bigint  DEFAULT NULL,
  p_external_message_id text    DEFAULT NULL,
  p_idempotency_key     text    DEFAULT NULL,
  p_next_interval_hours integer DEFAULT NULL,
  p_attribution_hours   integer DEFAULT NULL,
  p_metadata            jsonb   DEFAULT '{}'::jsonb
) RETURNS jsonb
```

**Responsabilidade:** Registra envio — cria `follow_up_event`, cria ou atualiza `follow_up_cycle_state`. Não envia mensagem.

**Nota sobre `messages.id`:** O campo é `bigint` (BIGSERIAL), não UUID. `p_message_id` deve ser `bigint`.

**Prioridade de contexto do ciclo:**
1. `conversation_id` → ciclo por conversa
2. `deal_id` (sem conversation_id) → ciclo por deal
3. Nenhum → ciclo só por contato

**Concorrência:** Usa `SELECT ... FOR UPDATE SKIP LOCKED` para evitar race condition. Em caso de conflito de unique no INSERT do ciclo, relê o estado existente com `FOR UPDATE`.

**Retorno:**
```json
{
  "success": true,
  "follow_up_event_id": "uuid",
  "attempt_number": 1,
  "next_allowed_at": "2026-05-23T03:51:56Z",
  "attribution_until": "2026-05-25T03:51:56Z",
  "cycle_id": "uuid",
  "duplicate": false
}
```

**Grants:** `service_role`, `authenticated`

---

### 3.3 `rpc_register_follow_up_response`

**Assinatura:**
```sql
rpc_register_follow_up_response(
  p_company_id          uuid,
  p_contact_id          uuid,
  p_conversation_id     uuid        DEFAULT NULL,
  p_response_message_id bigint      DEFAULT NULL,
  p_received_at         timestamptz DEFAULT NULL
) RETURNS jsonb
```

**Responsabilidade:** Atribui mensagem inbound ao follow-up elegível mais recente dentro da janela de atribuição (`attribution_until`). Encerra o ciclo com `cycle_status=responded`.

**Critérios de elegibilidade do evento:**
- `status IN ('sent','delivered')`
- `responded_at IS NULL`
- `attribution_until >= received_at`
- `sent_at <= received_at`
- Mesmo `company_id` + `contact_id` (+ `conversation_id` se informado)

**Retorno:**
```json
{
  "success": true,
  "attributed": true,
  "follow_up_event_id": "uuid",
  "attempt_number": 1,
  "response_lag_seconds": 28
}
```

**Quando `attributed=false`:** Atualiza `last_inbound_at` no ciclo ativo sem atribuir ao evento.

**Grants:** `service_role`, `authenticated`

---

### 3.4 `rpc_stop_follow_up_cycle`

**Assinatura:**
```sql
rpc_stop_follow_up_cycle(
  p_company_id         uuid,
  p_contact_id         uuid,
  p_conversation_id    uuid    DEFAULT NULL,
  p_deal_id            uuid    DEFAULT NULL,
  p_reason             text    DEFAULT 'manual_cancel',
  p_stopped_by_user_id uuid    DEFAULT NULL
) RETURNS jsonb
```

**Responsabilidade:** Encerra ciclo ativo/pausado. Cancela `agent_operations` e `conversation_followup_triggers` pendentes do mesmo ciclo.

**Reasons válidos:** `contact_replied`, `max_attempts_reached`, `deal_stage_changed`, `meeting_booked`, `human_took_over`, `opt_out`, `invalid_channel`, `manual_cancel`, `cadence_paused`, `autopilot_disabled`, `deal_won`, `deal_lost`, `conversation_closed`

**Retorno:**
```json
{
  "success": true,
  "cycle_id": "uuid",
  "was_active": true,
  "cancelled_operations": 0,
  "cancelled_triggers": 0
}
```

**Quando não há ciclo ativo:** `was_active=false`, `success=true` (idempotente).

**Grants:** `service_role`, `authenticated`

---

### 3.5 `rpc_get_follow_up_state`

**Assinatura:**
```sql
rpc_get_follow_up_state(
  p_company_id      uuid,
  p_contact_id      uuid,
  p_conversation_id uuid DEFAULT NULL,
  p_deal_id         uuid DEFAULT NULL
) RETURNS jsonb
```

**Responsabilidade:** Leitura de estado atual do ciclo para frontend/n8n. Inclui `can_send` calculado via `rpc_can_send_follow_up`.

**Diferença para `rpc_can_send_follow_up`:** Esta função busca o ciclo mais recente independente de status (inclui `responded/stopped/completed`), enquanto `can_send_follow_up` só olha `active/paused`.

**Retorno:**
```json
{
  "cycle_status": "responded",
  "attempt_count": 1,
  "max_attempts": 3,
  "last_follow_sent_at": "2026-05-22T03:51:56Z",
  "next_allowed_at": "2026-05-23T03:51:56Z",
  "has_responded": true,
  "responded_at": "2026-05-22T03:52:25Z",
  "can_send": true,
  "block_reason": null,
  "opt_out": false,
  "cycle_id": "uuid"
}
```

**Grants:** `authenticated`, `service_role`

---

## 4. Segurança

- Todas as funções: `SECURITY DEFINER` com `SET search_path = public`
- Membership validada para `authenticated`: `IF auth.uid() IS NOT NULL THEN ... is_company_member(p_company_id)`.
- `service_role` (n8n, Edge Functions) opera sem restrição de membership, mas continua com validação de tenant em todos os dados.
- Nenhuma RPC retorna dados de outros tenants: `company_id` validado em todas as queries.
- Para erros de inconsistência grave (FK cruzada): RAISE EXCEPTION.
- Para bloqueio de regra de negócio: retorno com `allowed=false`, sem exception.

---

## 5. Migrations criadas

| Arquivo | Conteúdo |
|---------|----------|
| `frontend/supabase-migrations/agent_operations_001.sql` | Fase 1 — aplicada via MCP |
| `frontend/supabase-migrations/followup_ledger_001_contacts_config.sql` | Fase 1 — aplicada via MCP |
| `frontend/supabase-migrations/followup_ledger_002_agent_ops_fields.sql` | Fase 1 — aplicada via MCP |
| `frontend/supabase-migrations/followup_ledger_003_follow_up_events.sql` | Fase 1 — aplicada via MCP |
| `frontend/supabase-migrations/followup_ledger_004_follow_up_cycle_state.sql` | Fase 1 — aplicada via MCP |
| `frontend/supabase-migrations/followup_ledger_005_core_rpcs.sql` | **Fase 2** — aplicada via MCP |

---

## 6. Como usar no n8n (próxima fase)

### Fluxo típico de envio de follow-up

```
1. n8n acorda com follow-up agendado (via conversation_followup_triggers)

2. Chamar rpc_can_send_follow_up:
   POST /rest/v1/rpc/rpc_can_send_follow_up
   { "p_company_id": "...", "p_contact_id": "...", "p_conversation_id": "..." }

3. Se allowed=false → parar. Se reason for cycle_stopped, opt_out, max_attempts_reached
   → chamar rpc_stop_follow_up_cycle (se ainda não chamado).

4. Se allowed=true → enviar mensagem via UAZAPI/WhatsApp.

5. Após envio bem-sucedido → chamar rpc_register_follow_up_sent:
   { "p_company_id": "...", "p_contact_id": "...", "p_conversation_id": "...",
     "p_follow_type": "agent_auto", "p_channel": "whatsapp",
     "p_external_message_id": "wamid...",
     "p_idempotency_key": "company_contact_conv_timestamp" }

6. Quando mensagem inbound chega → chamar rpc_register_follow_up_response:
   { "p_company_id": "...", "p_contact_id": "...", "p_conversation_id": "...",
     "p_response_message_id": 12345, "p_received_at": "2026-05-22T..." }
```

### Credencial necessária no n8n

- `rpc_can_send_follow_up` → pode usar `anon key` ou `service_role`
- `rpc_register_follow_up_sent` → usar `service_role key`
- `rpc_register_follow_up_response` → usar `service_role key`
- `rpc_stop_follow_up_cycle` → usar `service_role key`
- `rpc_get_follow_up_state` → pode usar `anon key` se autenticado, ou `service_role`

---

## 7. Resultados dos testes via MCP

Todos os testes executados no ambiente `phlgzzjyzkgvveqevqbg` (dev/staging — não produção).

| # | Teste | Resultado | Observação |
|---|-------|-----------|------------|
| 1 | `can_send_follow_up` sem ciclo | ✅ PASS | `allowed=true`, `attempt_number=1`, `cycle_status=virtual_first` |
| 2 | `register_follow_up_sent` primeira vez | ✅ PASS | Criou evento e ciclo, `attempt_number=1`, timestamps corretos |
| 3 | `can_send_follow_up` logo após envio | ✅ PASS | `allowed=false`, `reason=min_interval_not_elapsed`, `attempt_number=2` |
| 4 | `register_follow_up_sent` com mesma `idempotency_key` | ✅ PASS | `duplicate=true`, mesmo `follow_up_event_id`, sem novo evento |
| 5 | `register_follow_up_response` dentro da janela | ✅ PASS | `attributed=true`, `cycle_status=responded`, `has_responded=true` |
| 6 | `stop_follow_up_cycle` com reason `deal_won` | ✅ PASS | `was_active=true`, `cycle_status=stopped`, `stopped_reason=deal_won` |
| 7 | Opt-out: `can_send_follow_up` | ✅ PASS | `allowed=false`, `reason=opt_out`. Dado revertido. |
| 8 | Multi-tenant: `company_id` cruzado | ✅ PASS | `reason=contact_not_found` — sem vazamento entre tenants |
| 9 | `get_follow_up_state` | ✅ PASS | Estado correto, `can_send=true` após resposta (novo ciclo possível) |

---

## 8. Diferenças em relação à proposta original

| Item | Proposta | Implementado | Justificativa |
|------|----------|--------------|---------------|
| `p_response_message_id` type | `bigint` | `bigint` | `messages.id` é BIGINT no schema real |
| `companies` settings | Colunas dedicadas | Colunas dedicadas (não JSONB) | Já definido na Fase 1 |
| `agent_operations` | Referenciado opcional | Validado se informado | Tabela criada na Fase 1 |
| `outside_business_hours` | Verificar schedules | Não implementado | `schedules` existe mas sem RPC de verificação de horário atual. Documentado como pendência. |
| `cycle_stopped` quando ciclo respondido | Retornar allowed=false | Retornar allowed=true | Ciclos respondidos não ficam em active/paused. Um novo ciclo pode ser iniciado. |

---

## 9. Pendências

1. **`outside_business_hours`**: A tabela `schedules` existe mas não há helper de verificação de horário atual com suporte a fuso. A regra foi documentada no código mas não bloqueia ainda — retornaria `false` neste caso.

2. **`rpc_get_follow_up_stats`**: Analytics de follow-up. Não implementado nesta fase.

3. **Integração n8n definitiva**: Fase 3 integrará as RPCs ao workflow de follow-up do n8n.

4. **Edge Function de opt-out**: Detecção automática de palavras-chave (STOP/PARE). Fase futura.

5. **`rpc_stop_follow_up_cycle` automático**: Quando `max_attempts_reached`, o ciclo deveria ser encerrado automaticamente. Atualmente o n8n precisa chamar explicitamente. Avaliar trigger ou chamada na próxima fase.

6. **`agent_operations` sem ciclo_id**: O campo `cycle_id` em `agent_operations` é free-text (uuid sem FK). A FK só se torna possível quando `follow_up_cycle_state` foi criado com o `cycle_id` correspondente. O n8n deve chamar `rpc_register_follow_up_sent` antes de criar a `agent_operation` para ter o `cycle_id` disponível.

---

## 10. Riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Race condition em criação de ciclo | Médio | Coberto por `FOR UPDATE SKIP LOCKED` + `ON CONFLICT DO NOTHING` + releitura |
| `SKIP LOCKED` em ciclo com lock contencioso | Baixo | Se ciclo está bloqueado por outra transação, o segundo sender cria um segundo ciclo. Raro em produção. |
| `attribution_until` com fuso incorreto | Baixo | Todos os timestamps são `timestamptz` — fuso resolvido pelo Postgres |
| `cycle_status` inconsistente após crash | Baixo | `SECURITY DEFINER` é transacional; rollback em exceção |
| n8n usando `anon key` em `register_follow_up_sent` | Alto | Documentado no guia. n8n deve usar `service_role` para mutações. |

---

## 11. Próximo passo recomendado (Fase 3)

Integrar o n8n com as 3 RPCs core:

1. **No workflow de trigger de follow-up:** chamar `rpc_can_send_follow_up` antes de enviar.
2. **Após envio via UAZAPI:** chamar `rpc_register_follow_up_sent` com `p_external_message_id`.
3. **No webhook de mensagem inbound:** chamar `rpc_register_follow_up_response` antes de processar resposta com o LLM.
4. **Nos eventos de deal (won/lost/stage_change):** chamar `rpc_stop_follow_up_cycle` com o reason correspondente.
