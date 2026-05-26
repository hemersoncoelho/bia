# Contrato n8n — Motor de Cadências

## Visão geral

O motor de cadências usa um padrão de job queue com lock atômico. O n8n roda em poll (cron a cada 1 minuto), reclama eventos vencidos via RPC, envia pelo UAZAPI e confirma ou registra falha.

---

## Fluxo principal

```
Cron (1 min)
  └─► claim_due_cadence_events()
        └─► Para cada evento retornado:
              ├─► Enviar mensagem via UAZAPI
              │     ├─► Sucesso → mark_cadence_event_sent()
              │     └─► Falha   → mark_cadence_event_failed()
```

---

## 1. Reclamar eventos vencidos

**RPC:** `claim_due_cadence_events`  
**Credencial:** `service_role`  
**Método:** POST `/rest/v1/rpc/claim_due_cadence_events`

### Request body

```json
{
  "p_limit": 50,
  "p_worker_id": "n8n-worker-1"
}
```

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `p_limit` | integer | 50 | Máximo de eventos por batch |
| `p_worker_id` | text | auto-gerado | Identificador do worker (para auditoria) |

### Response

```json
{
  "success": true,
  "worker": "n8n-worker-1",
  "events": [
    {
      "id": "uuid",
      "company_id": "uuid",
      "appointment_id": "uuid",
      "contact_id": "uuid",
      "channel": "whatsapp",
      "recipient_phone": "5511999990000",
      "message_body": "Olá Maria, sua consulta é amanhã às 14:00.",
      "payload": {
        "appointment_id": "uuid",
        "scheduled_at": "2026-05-24T14:00:00Z",
        "contact_name": "Maria Silva",
        "company_name": "Clínica Exemplo",
        "service_name": "Consulta de retorno",
        "step_name": "Lembrete 1 dia antes",
        "step_order": 1,
        "cadence_name": "Lembrete de consulta"
      },
      "attempts": 1,
      "idempotency_key": "company_uuid:appointment_uuid:step_uuid",
      "cadence_run_id": "uuid",
      "cadence_step_id": "uuid"
    }
  ]
}
```

> **Importante:** `events` pode ser array vazio `[]` — o n8n deve tratar isso sem erro.

---

## 2. Enviar mensagem via UAZAPI

Use o `recipient_phone` do evento e o `message_body` como conteúdo da mensagem.

Endpoint UAZAPI (padrão do projeto):
```
POST https://simplifique.uazapi.com/message/sendText/{instance_id}
Authorization: Bearer {instance_token}

{
  "phone": "{{recipient_phone}}",
  "text": "{{message_body}}"
}
```

Para obter `instance_id` e `instance_token`, use `rpc_get_company_integration(company_id)` com credencial `service_role`.

---

## 3. Marcar como enviado

**RPC:** `mark_cadence_event_sent`  
**Credencial:** `service_role`

### Request body

```json
{
  "p_event_id": "uuid",
  "p_external_message_id": "uazapi_message_id_opcional",
  "p_result": { "raw_response": "..." }
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `p_event_id` | uuid | sim | ID do evento retornado pelo claim |
| `p_external_message_id` | text | não | ID da mensagem no UAZAPI |
| `p_result` | jsonb | não | Resposta bruta do UAZAPI (auditoria) |

### Response

```json
{ "success": true, "event_id": "uuid" }
```

---

## 4. Marcar como falha

**RPC:** `mark_cadence_event_failed`  
**Credencial:** `service_role`

### Request body

```json
{
  "p_event_id": "uuid",
  "p_error": "UAZAPI: recipient not on WhatsApp",
  "p_retry": true
}
```

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `p_event_id` | uuid | — | ID do evento |
| `p_error` | text | — | Mensagem de erro |
| `p_retry` | boolean | true | `false` → marca como `failed` imediatamente sem aguardar retentativas |

### Comportamento de retry

| Tentativa | Próximo envio (backoff exponencial) |
|-----------|-------------------------------------|
| 1ª falha  | +5 min |
| 2ª falha  | +15 min |
| 3ª falha (max) | marca como `failed` definitivamente |

### Response

```json
{
  "success": true,
  "event_id": "uuid",
  "new_status": "pending",
  "attempts": 1,
  "max_attempts": 3
}
```

---

## 5. Garantias anti-duplicação

- A RPC `claim_due_cadence_events` usa `FOR UPDATE SKIP LOCKED` — dois workers simultâneos **nunca** recebem o mesmo evento.
- `idempotency_key` é único por `(company_id, idempotency_key)` — inserções duplicadas são silenciosamente ignoradas.
- Nunca faça `SELECT` direto em `cadence_events` para disparar envios — use sempre o RPC de claim.

---

## 6. Configuração manual necessária

1. **Aplicar migrations em ordem:**
   - `cadences_001.sql`
   - `cadences_002_runs_events.sql`
   - `cadences_003_rpcs.sql`
   - `cadences_004_trigger.sql`

2. **Criar cadência com `trigger_type = 'appointment_scheduled'` e status `active`** no painel de Cadências da empresa para que os eventos sejam gerados automaticamente.

3. **Passos da cadência** devem ter `action_type = 'whatsapp_message'` e `is_active = true` para gerar eventos. Outros tipos (`create_task`, `notify_user`) são ignorados pelo motor atual.

4. **Contatos sem telefone** em `contact_identities` com `channel_type = 'whatsapp'` terão eventos criados com `recipient_phone = null`. O n8n deve pular esses eventos (checar se `recipient_phone` não é nulo antes de enviar).

5. **Janela de envio** (`send_window_start` / `send_window_end`) configurada no wizard está salva em `cadence_templates.settings` mas **não é aplicada automaticamente pelo motor atual** — o n8n pode verificar esse campo no `payload` se necessário.

---

## 7. Exemplo de workflow n8n (pseudocódigo)

```
[Cron - a cada 1 min]
  → HTTP: POST /rpc/claim_due_cadence_events { p_limit: 50, p_worker_id: "n8n-1" }
  → IF events.length == 0: STOP

[SplitInBatches: 1 evento por vez]
  → SET: phone = {{ $json.recipient_phone }}
  → IF phone is empty: 
       → HTTP: POST /rpc/mark_cadence_event_failed { p_event_id: ..., p_error: "no_phone", p_retry: false }
       → CONTINUE
  → HTTP: POST UAZAPI /message/sendText/{instance_id}
       body: { phone: phone, text: {{ $json.message_body }} }
  → IF success:
       → HTTP: POST /rpc/mark_cadence_event_sent { p_event_id: ..., p_external_message_id: ... }
  → IF error:
       → HTTP: POST /rpc/mark_cadence_event_failed { p_event_id: ..., p_error: error_message, p_retry: true }
```
