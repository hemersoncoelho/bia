-- =============================================================================
-- FASE 7 — Exemplos visuais da tela de Tarefas
--
-- Como usar:
-- 1. Rode primeiro as migrações de tasks/follow-up, especialmente:
--    - tasks_evolution_001.sql
--    - followup_triggers_001.sql
--    - ai_followup_decisions_001.sql
--    - rpcs_followup_001.sql
-- 2. Execute este arquivo no SQL Editor do Supabase.
--
-- O script escolhe uma empresa existente dinamicamente, reaproveita um contato
-- e uma conversa se existirem, e cria fallback se necessário. Para mirar uma
-- empresa específica, adicione um filtro no CTE target_company.
-- =============================================================================

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

WITH target_company AS (
  SELECT c.id
  FROM public.companies c
  ORDER BY c.created_at DESC NULLS LAST, c.id
  LIMIT 1
),
existing_contact AS (
  SELECT ct.id, ct.company_id
  FROM public.contacts ct
  JOIN target_company tc ON tc.id = ct.company_id
  ORDER BY ct.created_at DESC NULLS LAST, ct.id
  LIMIT 1
),
seed_contact AS (
  INSERT INTO public.contacts (
    company_id,
    full_name,
    status,
    created_at
  )
  SELECT
    tc.id,
    'Paciente Exemplo IA',
    'active',
    now()
  FROM target_company tc
  WHERE NOT EXISTS (SELECT 1 FROM existing_contact)
  RETURNING id, company_id
),
selected_contact AS (
  SELECT id, company_id FROM existing_contact
  UNION ALL
  SELECT id, company_id FROM seed_contact
  LIMIT 1
),
existing_conversation AS (
  SELECT cv.id, cv.company_id, cv.contact_id
  FROM public.conversations cv
  JOIN selected_contact sc ON sc.company_id = cv.company_id
  WHERE cv.contact_id = sc.id
  ORDER BY cv.created_at DESC NULLS LAST, cv.id
  LIMIT 1
),
seed_conversation AS (
  INSERT INTO public.conversations (
    company_id,
    contact_id,
    channel,
    status,
    priority,
    unread_count,
    attendance_mode,
    created_at
  )
  SELECT
    sc.company_id,
    sc.id,
    'whatsapp',
    'open',
    'normal',
    0,
    'ai',
    now()
  FROM selected_contact sc
  WHERE NOT EXISTS (SELECT 1 FROM existing_conversation)
  RETURNING id, company_id, contact_id
),
selected_conversation AS (
  SELECT id, company_id, contact_id FROM existing_conversation
  UNION ALL
  SELECT id, company_id, contact_id FROM seed_conversation
  LIMIT 1
),
cleanup AS (
  DELETE FROM public.tasks t
  USING target_company tc
  WHERE t.company_id = tc.id
    AND t.metadata->>'ui_seed' = 'tasks_phase7_examples_v1'
  RETURNING t.id
)
INSERT INTO public.tasks (
  company_id,
  contact_id,
  conversation_id,
  title,
  description,
  status,
  priority,
  due_at,
  source_type,
  ai_generated,
  ai_confidence,
  ai_reason,
  recommended_message,
  metadata,
  created_at,
  updated_at
)
SELECT
  sc.company_id,
  sc.contact_id,
  sc.id,
  'Follow-up recomendado pela IA',
  'A IA detectou uma conversa parada depois de uma pergunta de qualificação.',
  'open',
  'urgent',
  now() - interval '2 hours',
  'followup_trigger',
  true,
  0.58,
  'O contato ficou sem responder após a IA pedir confirmação de interesse. Como o prazo esperado expirou, a tarefa foi criada para revisão humana antes de qualquer abordagem.',
  'Olá, tudo bem? Passando para saber se você conseguiu avaliar as informações e se posso te ajudar com o próximo passo.',
  jsonb_build_object(
    'ui_seed', 'tasks_phase7_examples_v1',
    'source', 'expired_followup_trigger',
    'example', 'low_confidence_ai_followup'
  ),
  now(),
  now()
FROM selected_conversation sc;

INSERT INTO public.tasks (
  company_id,
  contact_id,
  conversation_id,
  title,
  description,
  status,
  priority,
  due_at,
  source_type,
  ai_generated,
  ai_confidence,
  ai_reason,
  recommended_message,
  metadata,
  created_at,
  updated_at
)
SELECT
  tc.id,
  NULL,
  NULL,
  'Tarefa manual sem contato e sem prazo',
  'Exemplo para validar o fallback de contato, ausência de prazo e origem manual.',
  'in_progress',
  'normal',
  NULL,
  'manual',
  false,
  NULL,
  NULL,
  NULL,
  jsonb_build_object(
    'ui_seed', 'tasks_phase7_examples_v1',
    'example', 'manual_without_contact_or_due_date'
  ),
  now(),
  now()
FROM (
  SELECT c.id
  FROM public.companies c
  ORDER BY c.created_at DESC NULLS LAST, c.id
  LIMIT 1
) tc;
