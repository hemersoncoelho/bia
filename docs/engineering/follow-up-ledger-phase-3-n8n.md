# Follow-up Ledger — Fase 3: Integração n8n

_Criado: 2026-05-22_

---

## 1. Resumo executivo

Esta fase integra os workflows do n8n com as 5 RPCs core criadas na Fase 2, garantindo que todo follow-up automático passe por validação centralizada, seja registrado no ledger e tenha resposta atribuída corretamente.

**Princípio central:** o n8n não decide sozinho se pode enviar follow-up. Ele consulta `rpc_can_send_follow_up` e respeita o resultado.

**Artefatos entregues:**

| Arquivo | Tipo | Função |
|---------|------|--------|
| `[Sia One] [Process Due Followup Triggers].json` | Workflow n8n (novo) | Cron que processa triggers vencidos, chama RPCs, envia via UAZAPI |
| `[Sia One] [Inbound Follow Up Response].json` | Sub-workflow n8n (novo) | Registra resposta inbound no ledger de follow-up |
| `[Sia One] [CRM Event Stop Cycle].json` | Sub-workflow n8n (novo) | Para ciclo de follow-up em eventos CRM |
| `frontend/supabase-migrations/followup_ledger_006_n8n_patches.sql` | Migration SQL | RPCs de suporte para n8n + patches em RPCs de CRM |

---

## 2. Workflows analisados

| Workflow | ID exportado | Função | Status Fase 3 |
|----------|-------------|--------|---------------|
| `[Sia One] [Followup]` | `xR35lphGVuJs4hhW` | Sub-workflow chamado pelo IA Comercial após cada resposta de IA. Analisa conversa, decide se cria trigger, cria `conversation_followup_triggers` e `agent_operations`. | **Sem alteração** — já cria trigger e operação corretamente |
| `[Sia One] [IA - Comercial]` | (não exportado completo) | Orquestra LangChain Agent, envia mensagens via UAZAPI, persiste via `rpc_save_ai_message`. Chama sub-workflow `[Followup]` ao final. | **Sem alteração** — integração via sub-workflows novos |
| `[Sia One] [Messages] [Nao-Oficial]` | (exportado, não analisado) | Recebe webhook inbound da UAZAPI. Já chama `rpc_cancel_pending_followup_triggers_on_inbound_message`. | **Requer integração manual** — ver Seção 6 |
| `[Sia One] [Process Due Followup Triggers]` | `SiaOneProcessDueFollowupTriggers01` | **NOVO** — Cron de 15 min que executa o ciclo completo de follow-up. | **Criado nesta fase** |
| `[Sia One] [Inbound Follow Up Response]` | `SiaOneInboundFollowUpResponse01` | **NOVO** — Sub-workflow para registrar resposta inbound. | **Criado nesta fase** |
| `[Sia One] [CRM Event Stop Cycle]` | `SiaOneCRMEventStopCycle01` | **NOVO** — Sub-workflow para parar ciclo em eventos CRM. | **Criado nesta fase** |

---

## 3. Workflows alterados (direto)

**Nenhum workflow existente foi alterado nesta fase.** A integração é feita via:
1. Novos workflows que executam as RPCs;
2. Patches SQL nos RPCs existentes de CRM;
3. Documentação de onde adicionar chamadas a sub-workflows.

---

## 4. Onde `rpc_can_send_follow_up` foi inserida

### Workflow: `[Sia One] [Process Due Followup Triggers]`
- **Node:** `can_send_check` (posição: 1450, 300)
- **Momento:** Imediatamente após `build_context`, antes de qualquer operação de envio
- **Payload:**
```json
{
  "p_company_id":      "{{$json.company_id}}",
  "p_contact_id":      "{{$json.contact_id}}",
  "p_conversation_id": "{{$json.conversation_id || null}}",
  "p_channel":         "whatsapp"
}
```
- **Credencial:** service_role key (`Supabase API`)
- **Se `allowed=false`:** fluxo vai para `parse_block` → sem envio

---

## 5. Onde `rpc_register_follow_up_sent` foi inserida

### Workflow: `[Sia One] [Process Due Followup Triggers]`
- **Node:** `register_sent` (posição: 4200, 100)
- **Momento:** Após envio UAZAPI bem-sucedido + persistência via `rpc_save_ai_message`
- **Dependências no payload:**
  - `message_id` (bigint) ← retorno de `rpc_save_ai_message`
  - `external_message_id` ← campo `key` do retorno UAZAPI
  - `operation_id` ← busca em `agent_operations` por `conversation_id`
  - `trigger_id` ← vem do trigger original
  - `idempotency_key` ← `fup_{company_id}_{contact_id}_{conversation_id}_{trigger_id}`

---

## 6. Onde `rpc_register_follow_up_response` foi inserida

### Sub-workflow: `[Sia One] [Inbound Follow Up Response]`
- **Node:** `register_follow_up_response` (posição: 950, 200)

### Integração manual necessária em `[Sia One] [Messages]`
Adicionar após o node `rpc_cancel_pending_followup_triggers_on_inbound_message`:

```
Execute Workflow: [Sia One] [Inbound Follow Up Response]
Payload:
{
  "company_id":      "{{$json.company_id}}",
  "contact_id":      "{{$json.contact_id}}",
  "conversation_id": "{{$json.conversation_id || null}}",
  "message_id":      "{{$json.message_id || null}}",
  "received_at":     "{{$json.received_at || $now}}"
}
```

> **Nota:** `message_id` é do tipo `bigint` — é o `id` da linha na tabela `messages`, não um UUID.

---

## 7. Onde `rpc_stop_follow_up_cycle` foi inserida

### Método 1 — Via patches SQL (aplicados por `followup_ledger_006_n8n_patches.sql`)

| RPC patcheada | Evento | Reason |
|--------------|--------|--------|
| `rpc_mark_deal_won` | Deal fechado como ganho | `deal_won` |
| `rpc_mark_deal_lost` | Deal fechado como perdido | `deal_lost` |
| `rpc_n8n_set_attendance_mode` (novo) | Atendimento humano assumido (`mode='human'`) | `human_took_over` |
| `rpc_n8n_update_deal_stage` (novo) | Deal avançou estágio (se `p_stop_follow_up=true`) | `deal_stage_changed` |

O stop é encapsulado em `BEGIN/EXCEPTION` para não reverter o CRM em caso de falha no ledger.

### Método 2 — Via sub-workflow `[Sia One] [CRM Event Stop Cycle]`
Sub-workflow genérico chamável de qualquer workflow. Payload:

```json
{
  "company_id":      "{{$json.company_id}}",
  "contact_id":      "{{$json.contact_id}}",
  "conversation_id": "{{$json.conversation_id || null}}",
  "deal_id":         "{{$json.deal_id || null}}",
  "event_type":      "meeting_booked"
}
```

**event_type → stop_reason:**

| event_type | stop_reason |
|-----------|-------------|
| `deal_won` | `deal_won` |
| `deal_lost` | `deal_lost` |
| `deal_stage_changed` | `deal_stage_changed` |
| `meeting_booked` | `meeting_booked` |
| `human_took_over` | `human_took_over` |
| `conversation_closed` | `conversation_closed` |
| `opt_out` | `opt_out` |
| `manual` | `manual_cancel` |

### Integração manual necessária em `[Sia One] [IA - Comercial]`
Quando o agente usar as tools `mover_crm`, `editar_deal_crm`, `transferir_atendimento`, adicionar chamada ao sub-workflow `[Sia One] [CRM Event Stop Cycle]` após execução bem-sucedida da tool.

---

## 8. Formato final da idempotency_key

```
fup_{company_id}_{contact_id}_{conversation_id}_{trigger_id}
```

**Exemplos:**
```
fup_b9f12661-cdce-48f7-abd0-1dcc341cd878_c08554ac-b563-41d3-a8c9-b0ccb0bac964_9646ee83-570d-4f33-bd3b-c9014d9dec84_71579ab9-5240-4ed6-ac40-86a2d4e5d721
```

**Regras:**
- Gerada em `build_context` node do workflow Process Due Triggers
- Estável: a mesma intenção de follow-up (mesmo trigger_id) sempre gera a mesma chave
- Se algum ID for nulo, substitui por string `'noX'` para manter estabilidade
- Não usa timestamp — retries geram a mesma chave

---

## 9. Tratamento de `allowed=false`

No workflow `[Process Due Followup Triggers]`, quando `rpc_can_send_follow_up` retorna `allowed=false`:

```
parse_block → check_needs_stop → IF needs_stop:
  TRUE:  stop_cycle → mark_trigger_skipped_stop → log_blocked
  FALSE: mark_trigger_skipped_block → log_blocked
```

| Reason | needs_stop | stop_reason | Trigger status |
|--------|-----------|-------------|----------------|
| `max_attempts_reached` | true | `max_attempts_reached` | `skipped` |
| `opt_out` | true | `opt_out` | `skipped` |
| `cycle_stopped` | true | `manual_cancel` | `skipped` |
| `human_recently_engaged` | false | — | `skipped` |
| `min_interval_not_elapsed` | false | — | `skipped` |
| `outside_business_hours` | false | — | `skipped` |
| `autopilot_disabled` | false | — | `skipped` |
| `contact_not_found` | false | — | `skipped` |
| `conversation_not_found` | false | — | `skipped` |

> **Nota sobre `min_interval_not_elapsed`:** O trigger é marcado como `skipped` (não `pending`). No próximo ciclo do cron, este trigger não será re-processado pois já não está `pending/due`. Se o comportamento desejado for reagendar para `next_allowed_at`, criar um step adicional para PATCH o trigger de volta a `pending` com `expected_reply_until = next_allowed_at`. **Documentado como pendência.**

---

## 10. Tratamento de `duplicate=true`

Em `check_register_result` (Code node):

```javascript
if (reg && reg.duplicate === true) {
  // Log: follow_up_duplicate_ignored
  // Segue normalmente para mark_trigger_processed
}
```

Quando `duplicate=true`:
- Não cria segundo `follow_up_event`
- Não reenvia mensagem (o envio já ocorreu antes deste ponto)
- Loga como `follow_up_duplicate_ignored`
- Continua para marcar o trigger como `processed`

---

## 11. RPCs criadas em `followup_ledger_006_n8n_patches.sql`

| RPC | Propósito | Grant |
|-----|-----------|-------|
| `rpc_n8n_process_due_trigger(company_id, trigger_id)` | Marca trigger `due/pending` como `processed` | `service_role` |
| `rpc_n8n_skip_due_trigger(company_id, trigger_id, reason)` | Marca trigger `due/pending` como `skipped` com reason | `service_role` |
| `rpc_mark_deal_won` (patch) | Fecha deal como won + stop follow-up cycle | `authenticated`, `service_role` |
| `rpc_mark_deal_lost` (patch) | Fecha deal como lost + stop follow-up cycle | `authenticated`, `service_role` |
| `rpc_n8n_set_attendance_mode` (novo) | Altera attendance_mode + stop follow-up se mode=human | `service_role` |
| `rpc_n8n_update_deal_stage` (novo) | Move deal de estágio + stop follow-up se `p_stop_follow_up=true` | `service_role` |

---

## 12. Nodes adicionados por workflow

### `[Sia One] [Process Due Followup Triggers]` (novo — 26 nodes)

| Node | Tipo | Função |
|------|------|--------|
| `schedule_trigger` | Schedule | Cron a cada 15 minutos |
| `mark_triggers_due` | HTTP Request | `rpc_mark_followup_trigger_due` — marca pending vencidos como due |
| `get_due_triggers` | HTTP Request | `rpc_get_due_followup_triggers` — lista triggers due (limit 50) |
| `split_trigger_items` | Code | Converte array de triggers em itens individuais |
| `build_context` | Code | Extrai campos, gera `idempotency_key` |
| `can_send_check` | HTTP Request | `rpc_can_send_follow_up` — decisão de permissão |
| `route_allowed` | IF | Roteia por `allowed=true/false` |
| `get_contact_phone` | HTTP Request | Busca `normalized_value` em `contact_identities` |
| `get_company_integration` | HTTP Request | `rpc_get_company_integration` — instance_token UAZAPI |
| `prepare_send` | Code | Valida phone + integration, monta payload UAZAPI |
| `check_ready_to_send` | IF | Verifica se dados completos (phone + token) |
| `send_whatsapp` | HTTP Request | UAZAPI `/send/text` |
| `check_uazapi_ok` | IF | Verifica `key != null` na resposta UAZAPI |
| `save_ai_message` | HTTP Request | `rpc_save_ai_message` — persiste no Inbox |
| `get_operation_id` | HTTP Request | Busca `agent_operations` por `conversation_id` |
| `build_register_payload` | Code | Monta payload para `rpc_register_follow_up_sent` |
| `register_sent` | HTTP Request | `rpc_register_follow_up_sent` — ledger + ciclo |
| `check_register_result` | Code | Interpreta resultado, loga, passa dados adiante |
| `update_operation_sent` | HTTP Request | PATCH `agent_operations` status=`sent` |
| `mark_trigger_processed` | HTTP Request | `rpc_n8n_process_due_trigger` |
| `log_sent` | NoOp | Fim do happy path |
| `log_send_error` | Code | Loga falha UAZAPI |
| `log_skip_no_data` | Code | Loga skip por ausência de dados |
| `parse_block` | Code | Interpreta reason, decide needs_stop |
| `check_needs_stop` | IF | Roteia por needs_stop=true/false |
| `stop_cycle` | HTTP Request | `rpc_stop_follow_up_cycle` |
| `mark_trigger_skipped_stop` | HTTP Request | `rpc_n8n_skip_due_trigger` (após stop) |
| `mark_trigger_skipped_block` | HTTP Request | `rpc_n8n_skip_due_trigger` (sem stop) |
| `log_blocked` | NoOp | Fim do blocked path |

### `[Sia One] [Inbound Follow Up Response]` (novo — 5 nodes)

| Node | Tipo | Função |
|------|------|--------|
| `When Executed by Another Workflow` | ExecuteWorkflowTrigger | Entrada do sub-workflow |
| `validate_inbound_payload` | Code | Valida campos obrigatórios |
| `check_valid_payload` | IF | Pula se inválido |
| `register_follow_up_response` | HTTP Request | `rpc_register_follow_up_response` |
| `log_response_result` | Code | Loga attributed=true/false |

### `[Sia One] [CRM Event Stop Cycle]` (novo — 5 nodes)

| Node | Tipo | Função |
|------|------|--------|
| `When Executed by Another Workflow` | ExecuteWorkflowTrigger | Entrada do sub-workflow |
| `validate_crm_event` | Code | Valida campos, mapeia event_type → stop_reason |
| `check_valid_event` | IF | Pula se inválido |
| `stop_follow_up_cycle` | HTTP Request | `rpc_stop_follow_up_cycle` |
| `log_stop_result` | Code | Loga resultado |

---

## 13. Payloads finais usados nas RPCs

### `rpc_can_send_follow_up`
```json
{
  "p_company_id":      "{{$json.company_id}}",
  "p_contact_id":      "{{$json.contact_id}}",
  "p_conversation_id": "{{$json.conversation_id || null}}",
  "p_channel":         "whatsapp"
}
```

### `rpc_register_follow_up_sent`
```json
{
  "p_company_id":          "{{company_id}}",
  "p_contact_id":          "{{contact_id}}",
  "p_conversation_id":     "{{conversation_id || null}}",
  "p_deal_id":             null,
  "p_task_id":             null,
  "p_operation_id":        "{{operation_id || null}}",
  "p_trigger_id":          "{{trigger_id || null}}",
  "p_cadence_id":          null,
  "p_cadence_step_id":     null,
  "p_follow_type":         "agent_auto",
  "p_channel":             "whatsapp",
  "p_message_id":          "{{message_id (bigint) || null}}",
  "p_external_message_id": "{{uazapi.key || null}}",
  "p_idempotency_key":     "fup_{company_id}_{contact_id}_{conversation_id}_{trigger_id}",
  "p_metadata": {
    "workflow_name":  "[Sia One] [Process Due Followup Triggers]",
    "trigger_type":   "{{trigger_type}}",
    "attempt_number": "{{attempt_number}}"
  }
}
```

### `rpc_register_follow_up_response`
```json
{
  "p_company_id":          "{{company_id}}",
  "p_contact_id":          "{{contact_id}}",
  "p_conversation_id":     "{{conversation_id || null}}",
  "p_response_message_id": "{{message_id (bigint) || null}}",
  "p_received_at":         "{{received_at || now()}}"
}
```

### `rpc_stop_follow_up_cycle`
```json
{
  "p_company_id":      "{{company_id}}",
  "p_contact_id":      "{{contact_id}}",
  "p_conversation_id": "{{conversation_id || null}}",
  "p_deal_id":         "{{deal_id || null}}",
  "p_reason":          "{{stop_reason}}"
}
```

---

## 14. Credenciais n8n por RPC

| RPC | Credencial | Nota |
|-----|-----------|------|
| `rpc_can_send_follow_up` | `Supabase API` (service_role) | Pode usar anon mas service_role é mais seguro |
| `rpc_register_follow_up_sent` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_register_follow_up_response` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_stop_follow_up_cycle` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_get_due_followup_triggers` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_mark_followup_trigger_due` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_n8n_process_due_trigger` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_n8n_skip_due_trigger` | `Supabase API` (service_role) | **Obrigatório service_role** |
| `rpc_save_ai_message` | `Supabase API` (service_role) | service_role ou authenticated |
| `rpc_get_company_integration` | `Supabase API` (service_role) | service_role ou anon |
| `UAZAPI /send/text` | Header `token` dinâmico | Vem de `rpc_get_company_integration` |

---

## 15. Testes a executar (checklist)

> **IMPORTANTE:** Executar apenas em ambiente dev/staging (`phlgzzjyzkgvveqevqbg`).
> Confirmar que nenhum workflow está conectado a produção antes de ativar.

### Pré-condições
- [ ] Migration `followup_ledger_006_n8n_patches.sql` aplicada via Supabase SQL Editor
- [ ] Workflows importados no n8n de dev/staging
- [ ] Workflow `[Sia One] [Process Due Followup Triggers]` **desativado** (testar manualmente primeiro)
- [ ] Usar `company_id` e `contact_id` de tenant de teste (nunca dados reais de produção)

### Teste 1 — Follow permitido (happy path)
- Contato sem opt-out, sem ciclo ativo, dentro do horário
- Executar `rpc_can_send_follow_up` manualmente via SQL Editor
- **Esperado:** `allowed=true`, `attempt_number=1`
- Executar workflow manualmente com trigger_id real
- **Esperado:** mensagem enviada, `follow_up_events` criado, trigger marcado como `processed`

### Teste 2 — Intervalo mínimo
- Executar workflow logo após primeiro envio
- **Esperado:** `allowed=false`, `reason=min_interval_not_elapsed`, trigger skipped

### Teste 3 — Idempotência
- Re-executar workflow com mesmo trigger_id após primeiro envio
- **Esperado:** `duplicate=true` em `rpc_register_follow_up_sent`, nenhum novo evento criado

### Teste 4 — Resposta atribuída
- Simular inbound dentro de `attribution_until` chamando sub-workflow Inbound Response
- **Esperado:** `attributed=true`, `follow_up_events.status=responded`, `cycle_status=responded`

### Teste 5 — Resposta fora da janela
- Simular inbound após `attribution_until` expirar
- **Esperado:** `attributed=false`, ciclo não alterado

### Teste 6 — Opt-out
- Setar `contacts.follow_up_opt_out=true` no contato de teste
- **Esperado:** `allowed=false`, `reason=opt_out`, trigger skipped, ciclo stopped

### Teste 7 — Humano assumiu
- Setar `conversations.attendance_mode='human'`
- **Esperado:** `allowed=false`, `reason=human_recently_engaged`, trigger skipped

### Teste 8 — Evento CRM para ciclo (deal ganho)
- Chamar `rpc_mark_deal_won(company_id, deal_id)` com deal que tem ciclo ativo
- **Esperado:** `follow_up_cycle_state.cycle_status=stopped`, `stopped_reason=deal_won`

### Teste 9 — Multi-tenant
- Chamar RPCs com `company_id` de tenant A e `contact_id` de tenant B
- **Esperado:** erro controlado (`contact_not_found`), nenhum dado vazado

---

## 16. Evidências de testes

> Seção a ser preenchida após execução dos testes em dev/staging.

```
Data do teste: ___________
Ambiente: phlgzzjyzkgvveqevqbg (dev/staging)
Executado por: ___________

T1 (happy path):     [ ] PASS  [ ] FAIL  Observação: ___
T2 (intervalo):      [ ] PASS  [ ] FAIL  Observação: ___
T3 (idempotência):   [ ] PASS  [ ] FAIL  Observação: ___
T4 (resp. atribuída):[ ] PASS  [ ] FAIL  Observação: ___
T5 (resp. expirada): [ ] PASS  [ ] FAIL  Observação: ___
T6 (opt-out):        [ ] PASS  [ ] FAIL  Observação: ___
T7 (humano):         [ ] PASS  [ ] FAIL  Observação: ___
T8 (deal ganho):     [ ] PASS  [ ] FAIL  Observação: ___
T9 (multi-tenant):   [ ] PASS  [ ] FAIL  Observação: ___
```

---

## 17. Riscos operacionais

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Workflow ativado antes da migration SQL ser aplicada | Alto | Aplicar migration antes de importar workflows |
| Cron processando triggers de produção | Alto | Workflow inicia como `active=false` — ativar só após testes |
| UAZAPI timeout na hora do envio | Médio | `alwaysOutputData=true` + verificação de `key` na resposta + log |
| `rpc_save_ai_message` falhar e `rpc_register_follow_up_sent` ser chamado sem `message_id` | Médio | `message_id` é `DEFAULT NULL` na RPC — funciona sem, mas sem rastreio de mensagem |
| Trigger processado duas vezes (race condition cron) | Baixo | `idempotency_key` garante `duplicate=true` na segunda chamada |
| `rpc_mark_deal_won` patch quebrar se assinatura diferir | Médio | `DO $$ BEGIN ... IF NOT EXISTS ... END; $$` protege contra isso; verificar antes de aplicar |
| Triggers `skipped` por `min_interval_not_elapsed` não reagendados | Médio | Documentado como pendência — ver Seção 19 |
| Stop cycle chamado em deal sem conversa | Baixo | `p_conversation_id=null` e `p_deal_id=null` causam `was_active=false` (idempotente) |

---

## 18. Plano de rollback

### Passo 1 — Desativar workflows novos
```
n8n → [Sia One] [Process Due Followup Triggers] → Desativar
n8n → [Sia One] [Inbound Follow Up Response] → Desativar
n8n → [Sia One] [CRM Event Stop Cycle] → Desativar
```

### Passo 2 — Reverter patches SQL (opcional)
As RPCs novas (`rpc_n8n_process_due_trigger`, `rpc_n8n_skip_due_trigger`, etc.) são compatíveis com o banco anterior — não afetam execução sem chamadas. Não precisam ser removidas para rollback funcional.

Se necessário reverter `rpc_mark_deal_won`/`rpc_mark_deal_lost` aos originais:
```sql
-- Aplicar novamente rpc_mark_deal_won_lost.sql (versão sem patch de follow-up)
```

### Passo 3 — Manter dados de ledger
Não apagar `follow_up_events` ou `follow_up_cycle_state` criados em teste — são registros de auditoria imutáveis. Se criados em tenant de teste, deixar como estão.

### Passo 4 — Não há envios de produção
Por design: workflow inicia como `active=false`. Nenhum envio real ocorre sem ativação explícita.

---

## 19. Pendências

| # | Pendência | Prioridade | Fase sugerida |
|---|-----------|-----------|---------------|
| 1 | Reagendamento de trigger quando `min_interval_not_elapsed` — salvar `next_allowed_at` no trigger e reprogramar para esse horário | Médio | Fase 3.1 |
| 2 | Integração manual em `[Sia One] [Messages]`: adicionar chamada ao sub-workflow `[Inbound Follow Up Response]` após `rpc_cancel_pending_followup_triggers_on_inbound_message` | Alto | Imediato |
| 3 | Integração manual em `[Sia One] [IA - Comercial]`: adicionar chamada a `[CRM Event Stop Cycle]` após execução das tools `mover_crm`, `transferir_atendimento` | Alto | Imediato |
| 4 | `rpc_mark_deal_won`/`rpc_mark_deal_lost` — verificar assinatura real no banco antes de aplicar o patch SQL (pode ter parâmetros extras) | Alto | Antes de aplicar migration 006 |
| 5 | `outside_business_hours` — tabela `schedules` existe mas `rpc_can_send_follow_up` não verifica horário ainda | Baixo | Fase futura |
| 6 | Ativar workflow `[Process Due Followup Triggers]` apenas após todos os testes passarem | Crítico | Antes de produção |
| 7 | Limite de 50 triggers por cron-run — se houver backlog grande, pode precisar de loop ou limite maior | Baixo | Monitorar após ativação |

---

## 20. Próximo passo recomendado (Fase 4)

Adaptar o frontend para exibir o estado do ciclo de follow-up ao usuário:
- `Follow N/M` no card de Tasks/Inbox
- `Próximo follow permitido em X horas`
- Indicador de bloqueio (opt-out, humano assumiu, etc.)
- Retomada atribuída (`Respondeu após follow-up`)
- Histórico do ciclo via `rpc_get_follow_up_state`

**RPC base:** `rpc_get_follow_up_state(company_id, contact_id, conversation_id)` — já implementada na Fase 2.
