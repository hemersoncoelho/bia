# Contrato do Agente de IA — Follow-up Contextual v1

Este documento define o formato de saída que o agente de IA no n8n deve retornar
em dois momentos distintos do fluxo de follow-up.

---

## Cenário A — Agente após mensagem enviada/recebida

**Quando é chamado:** ao final de cada ciclo de atendimento, após o agente
enviar uma resposta que depende de retorno do contato.

**Responsabilidade:** decidir se a conversa passou a aguardar resposta
e, se sim, registrar um trigger para verificação futura.

**O agente NÃO deve:**
- Concluir que o contato parou de responder (não tem como saber)
- Criar tarefa diretamente neste momento
- Enviar mensagem adicional

### Formato de saída

```json
{
  "expects_contact_reply": true,
  "should_create_trigger": true,
  "trigger_type": "no_response_after_ai_question",
  "detected_event": "awaiting_contact_reply",
  "expected_reply_window_minutes": 1440,
  "reason": "A última mensagem fez uma pergunta direta ao paciente e depende de resposta para avançar.",
  "recommended_action": "Verificar se o paciente respondeu dentro do prazo.",
  "recommended_followup_message": "Olá, tudo bem? Conseguiu verificar essa informação para darmos continuidade?",
  "confidence": 0.88,
  "metadata": {
    "stage": "qualification",
    "source": "conversation_analysis"
  }
}
```

### Campos obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `expects_contact_reply` | boolean | Se a conversa aguarda resposta do contato |
| `should_create_trigger` | boolean | Se deve criar um trigger de follow-up |
| `trigger_type` | string | Tipo do trigger (ver enum abaixo) |
| `detected_event` | string | Slug do evento detectado |
| `expected_reply_window_minutes` | integer | Janela de espera em minutos |
| `confidence` | float (0–1) | Confiança da decisão |

### Campos opcionais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `reason` | string | Explicação em linguagem natural |
| `recommended_action` | string | O que fazer se o trigger vencer |
| `recommended_followup_message` | string | Mensagem sugerida para o follow-up |
| `metadata` | object | Contexto adicional (stage, source) |

### Regras de negócio

- Se `expects_contact_reply = false` → não chamar RPC de criação de trigger
- Se `should_create_trigger = false` → não chamar RPC de criação de trigger
- Não criar trigger para: mensagens de encerramento, agradecimentos finais,
  conversas marcadas como `closed`, ou quando `attendance_mode = 'human'`
  e o agente humano já está ciente
- `expected_reply_window_minutes` sugeridos por tipo:
  - `no_response_after_ai_question`: 1440 (24h)
  - `no_response_after_human_message`: 720 (12h)
  - `third_party_decision_followup`: 4320 (3 dias)
  - `asked_to_return_later`: 2880 (48h)
  - `qualification_abandoned`: 1440 (24h)
  - `post_quote_followup`: 4320 (3 dias)

### Chamada RPC resultante (n8n)

```
POST /rest/v1/rpc/rpc_create_conversation_followup_trigger
{
  "p_company_id": "...",
  "p_contact_id": "...",
  "p_conversation_id": "...",
  "p_trigger_type": "no_response_after_ai_question",
  "p_expected_reply_until": "2025-05-19T14:00:00Z",
  "p_created_from_message_id": "...",
  "p_detected_event": "awaiting_contact_reply",
  "p_reason": "...",
  "p_recommended_action": "...",
  "p_recommended_message": "...",
  "p_ai_confidence": 0.88,
  "p_last_inbound_message_at_snapshot": "2025-05-18T14:00:00Z",
  "p_last_outbound_message_at_snapshot": "2025-05-18T14:02:00Z",
  "p_metadata": { "stage": "qualification" }
}
```

---

## Cenário B — Agente após trigger vencido

**Quando é chamado:** o job de varredura do n8n detecta triggers com
`status = 'due'`, busca o contexto atualizado da conversa e aciona
o agente para decidir a próxima ação.

**Responsabilidade:** avaliar o contexto atual (contato respondeu? 
conversa foi encerrada? atendimento mudou?) e recomendar ação.

**O agente NÃO deve:**
- Enviar mensagem automaticamente nesta fase
- Criar tarefa diretamente (quem cria é o n8n via RPC)
- Assumir que o contato não vai mais responder

### Formato de saída

```json
{
  "should_create_activity": true,
  "detected_event": "qualification_abandoned",
  "action_type": "create_task",
  "title": "Fazer follow-up com o paciente",
  "description": "Paciente não respondeu após pergunta de qualificação. Verificar interesse e retomar atendimento.",
  "suggested_due_at": "2025-05-20T10:00:00Z",
  "priority": "medium",
  "reason": "A conversa estava aguardando resposta e o prazo expirou sem nova mensagem do paciente.",
  "recommended_message": "Olá, tudo bem? Conseguiu verificar as informações para continuarmos seu atendimento?",
  "confidence": 0.86,
  "requires_human_approval": true,
  "metadata": {
    "stage": "qualification",
    "trigger_type": "no_response_after_ai_question",
    "source": "expired_followup_trigger"
  }
}
```

### Campos obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `should_create_activity` | boolean | Se deve criar tarefa/follow-up |
| `detected_event` | string | Slug do evento detectado no contexto atual |
| `action_type` | string | `create_task` (único suportado nesta fase) |
| `confidence` | float (0–1) | Confiança da decisão |
| `requires_human_approval` | boolean | Se humano precisa revisar antes de agir |

### Campos opcionais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `title` | string | Título da tarefa a criar |
| `description` | string | Descrição detalhada |
| `suggested_due_at` | ISO datetime | Prazo sugerido para a tarefa |
| `priority` | string | `low`, `normal`, `high`, `urgent` |
| `reason` | string | Explicação em linguagem natural |
| `recommended_message` | string | Mensagem sugerida para o follow-up |
| `metadata` | object | Contexto adicional |

### Regras de negócio

- Se `should_create_activity = false` → marcar trigger como `skipped`, não criar tarefa
- Se `confidence < 0.6` → forçar `requires_human_approval = true`
- Se `action_type = 'create_task'` → chamar `rpc_create_ai_followup_task`
- O `raw_input` e `raw_output` DEVEM ser enviados para auditoria
- Não enviar mensagem automaticamente nesta fase

### Chamada RPC resultante (n8n)

```
POST /rest/v1/rpc/rpc_create_ai_followup_task
{
  "p_company_id": "...",
  "p_contact_id": "...",
  "p_conversation_id": "...",
  "p_followup_trigger_id": "...",
  "p_detected_event": "qualification_abandoned",
  "p_title": "Fazer follow-up com o paciente",
  "p_description": "Paciente não respondeu após pergunta de qualificação.",
  "p_due_at": "2025-05-20T10:00:00Z",
  "p_priority": "normal",
  "p_ai_reason": "Prazo expirou sem resposta do contato.",
  "p_ai_confidence": 0.86,
  "p_recommended_message": "Olá, tudo bem? ...",
  "p_requires_human_approval": true,
  "p_raw_input": { "trigger": {...}, "conversation_context": {...} },
  "p_raw_output": { "agent_response": {...} },
  "p_metadata": { "stage": "qualification" }
}
```

---

## Eventos detectados suportados

| Slug | Descrição | Cenário |
|------|-----------|---------|
| `awaiting_contact_reply` | Conversa aguarda resposta do contato | A |
| `qualification_abandoned` | Qualificação iniciada, contato parou | B |
| `no_response_after_quote` | Proposta enviada, sem retorno | B |
| `third_party_pending` | Contato aguardando terceiro | B |
| `return_later_expired` | Contato pediu para voltar mais tarde | B |
| `no_response_after_human_msg` | Agente humano enviou mensagem, sem retorno | B |
| `contact_replied` | Contato respondeu (trigger deve ser cancelado) | — |

---

## Tipos de trigger suportados

| Valor | Quando usar |
|-------|-------------|
| `no_response_after_ai_question` | IA fez pergunta e aguarda resposta |
| `no_response_after_human_message` | Agente humano enviou mensagem e aguarda resposta |
| `third_party_decision_followup` | Contato disse que precisa consultar terceiro |
| `asked_to_return_later` | Contato pediu para ser contactado depois |
| `qualification_abandoned` | Qualificação iniciada mas não concluída |
| `post_quote_followup` | Proposta enviada sem retorno |

---

## Fluxo completo do ciclo de vida

```
[Mensagem do contato]
        ↓
rpc_cancel_pending_followup_triggers_on_inbound_message
        ↓
[Agente de IA responde]
        ↓
Saída do agente (Cenário A)
        ↓
rpc_create_conversation_followup_trigger   ← trigger criado com expected_reply_until
        ↓
[Aguarda prazo]
        ↓
Job n8n (cron) — rpc_mark_followup_trigger_due + rpc_get_due_followup_triggers
        ↓
[Agente de IA avalia contexto atualizado]
        ↓
Saída do agente (Cenário B)
        ↓
rpc_create_ai_followup_task   ← decision + task criados atomicamente
        ↓
[Tarefa visível na tela de Tarefas para atendente humano]
```

---

## Validações obrigatórias no n8n

### Antes de chamar `rpc_create_conversation_followup_trigger`

1. `expects_contact_reply === true`
2. `should_create_trigger === true`
3. `trigger_type` é um dos valores do enum suportado
4. `expected_reply_window_minutes > 0`
5. `confidence >= 0` e `confidence <= 1`
6. `company_id`, `contact_id`, `conversation_id` estão presentes no contexto

### Antes de chamar `rpc_create_ai_followup_task`

1. `should_create_activity === true`
2. `action_type === 'create_task'`
3. `followup_trigger_id` disponível (ID do trigger `due` processado)
4. `raw_input` e `raw_output` preenchidos com o contexto e resposta do agente
5. Se `confidence < 0.6` → garantir `requires_human_approval = true`
