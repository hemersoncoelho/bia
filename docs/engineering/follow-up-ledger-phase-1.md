# Follow-up Ledger — Fase 1: Fundação de Dados

_Autor: engenharia Sia One · Data: 2026-05-22_

---

## 1. Objetivo deste documento

Registrar as decisões tomadas durante a auditoria do schema real e a construção das migrations de fundação para o sistema de follow-up. Este documento é a trilha técnica da Fase 1 e deve acompanhar o PR correspondente.

---

## 2. Auditoria do schema real

### 2.1 Tabelas confirmadas e IDs

| Tabela | id type | Observação |
|--------|---------|------------|
| `companies` | `UUID` | Já possui `autopilot_enabled boolean`. Não existe `company_settings` separado — configurações por empresa vão como colunas aqui. |
| `user_profiles` | `UUID` | — |
| `user_companies` | PK composta (user_id, company_id) | Tabela de memberships — usada pelos helpers de RLS |
| `contacts` | `UUID` | Sem campos opt_out — adicionados nesta fase |
| `conversations` | `UUID` | — |
| `messages` | **`BIGINT` (BIGSERIAL)** | **Crítico:** não é UUID. FKs para messages.id devem ser `BIGINT`. Confirmado em `followup_triggers_001.sql`. |
| `deals` | `UUID` | Nome real da tabela: `deals` (não `opportunities`) |
| `tasks` | `UUID` | — |
| `ai_agents` | `UUID` | — |
| `agent_operations` | `UUID` | Tabela existe. Campos novos adicionados nesta fase. |
| `conversation_followup_triggers` | `UUID` | Tabela existe. Continua como "relógio/trigger de espera". |
| `ai_followup_decisions` | `UUID` | Tabela existe. Registro de raciocínio operacional da IA — não misturar com ledger. |
| `cadence_templates` | `UUID` | — |
| `cadence_steps` | `UUID` | — |
| `message_templates` | `UUID` | — |
| `pipelines` | `UUID` | — |
| `pipeline_stages` | `UUID` | — |
| `teams` | `UUID` | — |
| `audit_logs` | — | Referenciado no CLAUDE.md mas não há migration de CREATE TABLE entre os arquivos lidos. Assumido como presente no banco. |

### 2.2 Tabelas **não encontradas** (ausentes das migrations)

| Tabela buscada | Situação | Decisão |
|---------------|----------|---------|
| `company_settings` | Não existe | Configurações follow-up adicionadas como colunas em `companies` (padrão do projeto — `autopilot_enabled` foi feito assim) |
| `opportunities` | Não existe | Projeto usa `deals` |

### 2.3 Campos relevantes confirmados em `agent_operations`

Existentes:
- `company_id`, `contact_id`, `operation_type`, `channel`, `send_at`, `status`
- `cadence_id` (uuid, sem FK declarada), `task_id`, `agent_id`, `workflow_id`
- `idempotency_key` (UNIQUE), `created_at`, `updated_at`

**Ausentes (adicionados na Fase 1):**
- `conversation_id` — FK → `conversations(id)`
- `deal_id` — FK → `deals(id)`
- `attempt_number` — número da tentativa dentro do ciclo
- `cycle_id` — id do ciclo de follow-up
- `follow_up_event_id` — referência ao ledger; **coluna adicionada sem FK nesta fase** para evitar dependência circular

---

## 3. Helpers de RLS existentes

As três funções já existem e são SECURITY DEFINER:

```sql
public.is_platform_admin()              → boolean
public.is_company_member(uuid)          → boolean
public.has_any_company_role(uuid, text[]) → boolean
```

Fonte: `backend_teams_and_roles.sql`, com versões alternativas em `FIX_invite_member_standalone.sql` e `HOTFIX_definitive_inbox_rls.sql`.

**Padrão adotado nas novas tabelas:** usar `is_platform_admin()` e `is_company_member(company_id)` — consistente com `ai_followup_decisions`, `conversation_followup_triggers` e `tasks_evolution_001`.

---

## 4. Função `set_updated_at()` e padrão de trigger

```sql
public.set_updated_at()  -- definida em cadences_001.sql
```

Padrão de uso:
```sql
DROP TRIGGER IF EXISTS trg_<tabela>_updated_at ON public.<tabela>;
CREATE TRIGGER trg_<tabela>_updated_at
  BEFORE UPDATE ON public.<tabela>
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Adotado nas duas novas tabelas sem redefinir a função.

---

## 5. Padrão de RLS para ledger/auditoria

Padrão observado em `ai_followup_decisions` e `conversation_followup_triggers`:

- **SELECT:** `is_platform_admin() OR is_company_member(company_id)`
- **INSERT:** `WITH CHECK (FALSE)` — bloqueado para usuário autenticado direto; apenas RPCs SECURITY DEFINER criam registros
- **UPDATE:** `USING (FALSE)` — idem
- **DELETE:** `USING (FALSE)` — dados de auditoria são imutáveis
- **service_role:** política ALL separada

Este padrão foi aplicado em `follow_up_events` e `follow_up_cycle_state`.

Exceção em `follow_up_cycle_state`: UPDATE é permitido via policy para service_role (n8n atualiza estado do ciclo). Para `authenticated`, UPDATE continua bloqueado — via RPC SECURITY DEFINER futura.

---

## 6. Migrations criadas nesta fase

| Arquivo | Conteúdo |
|---------|----------|
| `followup_ledger_001_contacts_config.sql` | Configs de follow-up em `companies` + opt-out em `contacts` |
| `followup_ledger_002_agent_ops_fields.sql` | Novos campos em `agent_operations` |
| `followup_ledger_003_follow_up_events.sql` | Tabela `follow_up_events` + FK backlink em `agent_operations` |
| `followup_ledger_004_follow_up_cycle_state.sql` | Tabela `follow_up_cycle_state` |

---

## 7. Nomes ajustados (proposta → nome real)

| Proposta original | Nome real adotado | Motivo |
|-------------------|-------------------|--------|
| `opportunity_id` | `deal_id` | Tabela real é `deals` |
| Tabela `company_settings` | Colunas em `companies` | Padrão do projeto |
| `messages.id` como uuid | `BIGINT` | Confirmado no banco |

---

## 8. Decisão sobre dependência circular em `agent_operations`

**Problema:** `agent_operations.follow_up_event_id` referenciaria `follow_up_events(id)`, mas `follow_up_events.operation_id` referencia `agent_operations(id)`.

**Solução adotada:**
1. `followup_ledger_002`: adiciona `follow_up_event_id` como `uuid NULL` **sem FK constraint**.
2. `followup_ledger_003`: cria `follow_up_events` e em seguida adiciona a FK constraint `agent_operations.follow_up_event_id → follow_up_events(id)` via `ALTER TABLE ADD CONSTRAINT`.

Não há violação de lógica: as tabelas existem em sequência, e a constraint é adicionada após ambas existirem.

---

## 9. Decisão sobre UNIQUE de ciclo ativo

`follow_up_cycle_state` precisa impedir múltiplos ciclos ativos para o mesmo contexto (company + contact + contexto opcional).

**Abordagem adotada:** três índices únicos parciais, cada um cobrindo um contexto mutuamente exclusivo:

```
-- Com conversa
UNIQUE (company_id, contact_id, conversation_id)
  WHERE conversation_id IS NOT NULL AND cycle_status IN ('active','paused')

-- Com deal, sem conversa
UNIQUE (company_id, contact_id, deal_id)
  WHERE deal_id IS NOT NULL AND conversation_id IS NULL AND cycle_status IN ('active','paused')

-- Fallback: só contato
UNIQUE (company_id, contact_id)
  WHERE conversation_id IS NULL AND deal_id IS NULL AND cycle_status IN ('active','paused')
```

**Por que não `UNIQUE NULLS NOT DISTINCT`:** PostgreSQL 15+ suporta, mas a versão do Supabase pode variar. Índices parciais são portáveis e mais explícitos na semântica de negócio.

---

## 10. Riscos e pendências

| Item | Risco | Ação futura |
|------|-------|-------------|
| `follow_up_event_id` em `agent_operations` sem FK | Sem integridade referencial neste PR | Fase 2: adicionar validação via RPC ou constraint após testes |
| `audit_logs` não confirmada via migration | Pode existir sem migration exportada | Não referenciar `audit_logs` nas novas tabelas por ora |
| Detecção automática de STOP/PARE | Não implementada | Fase posterior: Edge Function ou n8n pattern |
| Backfill de ciclos existentes | Zero registros nas novas tabelas | Fase posterior: script de backfill opt-in |
| Versão do PostgreSQL no Supabase | Índices parciais com `IN (...)` no WHERE — verificar suporte | Testado via SQL Editor antes de promover |

---

## 11. Queries de validação pós-aplicação

```sql
-- 1. Verificar colunas de config em companies
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'companies'
  AND column_name IN ('follow_up_max_attempts','follow_up_min_interval_hours','follow_up_attribution_hours');

-- 2. Verificar colunas opt-out em contacts
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'contacts'
  AND column_name LIKE 'follow_up_opt_%';

-- 3. Verificar novos campos em agent_operations
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agent_operations'
  AND column_name IN ('conversation_id','deal_id','attempt_number','cycle_id','follow_up_event_id');

-- 4. Verificar tabelas criadas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('follow_up_events','follow_up_cycle_state')
ORDER BY table_name;

-- 5. RLS: verificar que as policies existem
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('follow_up_events','follow_up_cycle_state')
ORDER BY tablename, policyname;

-- 6. Inserir follow_up_event de teste (substitua por IDs reais)
/*
INSERT INTO public.follow_up_events (
  company_id, contact_id, follow_type, channel, cycle_id, attempt_number, sent_at
) VALUES (
  '<company_id_real>',
  '<contact_id_real>',
  'agent_auto',
  'whatsapp',
  gen_random_uuid(),
  1,
  now()
) RETURNING id, cycle_id, status, created_at;
*/

-- 7. Verificar constraint de idempotency_key (deve falhar na segunda inserção)
/*
INSERT INTO public.follow_up_events (
  company_id, contact_id, follow_type, channel, cycle_id, idempotency_key
) VALUES ('<company>','<contact>','agent_auto','whatsapp',gen_random_uuid(),'teste-key-001');
-- Segunda inserção com mesmo idempotency_key deve lançar violação de unicidade
*/

-- 8. Verificar ciclo duplicado bloqueado (deve falhar na segunda inserção)
/*
INSERT INTO public.follow_up_cycle_state (company_id, contact_id, conversation_id)
VALUES ('<company>','<contact>','<conversation>');
-- Segunda inserção com mesmo (company, contact, conversation) e status active deve falhar
*/

-- 9. Verificar updated_at (deve mudar após UPDATE)
/*
UPDATE public.follow_up_events
SET status = 'delivered'
WHERE id = '<id_do_evento>';
-- updated_at deve ser > created_at
*/
```
