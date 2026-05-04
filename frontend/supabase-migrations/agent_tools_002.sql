-- ============================================================
-- Agent Tools Module — Fase 1.1
-- Catálogo canônico + tipos semânticos de ferramentas
-- ============================================================

BEGIN;

-- ── 1. Remover constraint antiga ──────────────────────────────
-- A constraint original foi criada inline em agent_tools_001.sql;
-- em Postgres o nome padrão é agent_tool_catalog_tool_type_check.

ALTER TABLE public.agent_tool_catalog
  DROP CONSTRAINT IF EXISTS agent_tool_catalog_tool_type_check;

-- ── 2. Desativar catálogo legado ──────────────────────────────
-- Os slugs antigos não correspondem ao contrato operacional usado
-- pelo n8n. Mantemos os registros para histórico/bindings antigos,
-- mas eles deixam de aparecer na UI por is_active=false.

UPDATE public.agent_tool_catalog
SET is_active = false,
    tool_type = CASE
      WHEN slug = 'schedule' THEN 'agenda_action'
      WHEN slug = 'knowledge_search' THEN 'knowledge_action'
      WHEN slug = 'team_handoff' THEN 'atendimento_action'
      WHEN slug IN ('send_photo', 'send_video') THEN 'media_action'
      ELSE 'internal_action'
    END
WHERE slug IN (
  'schedule',
  'knowledge_search',
  'team_handoff',
  'send_photo',
  'send_video',
  'referral'
);

-- ── 3. Expandir tool_type para tipos semânticos ───────────────

ALTER TABLE public.agent_tool_catalog
  ADD CONSTRAINT agent_tool_catalog_tool_type_check
  CHECK (
    tool_type IN (
      'agenda_action',
      'crm_action',
      'atendimento_action',
      'media_action',
      'knowledge_action',
      'webhook_action',
      'internal_action'
    )
  );

-- ── 4. Inserir/atualizar catálogo canônico ───────────────────

INSERT INTO public.agent_tool_catalog
  (slug, name, description, tool_type, icon, config_schema, is_built_in, is_active, sort_order)
VALUES
  (
    'buscar_agenda',
    'Buscar Agenda',
    'Consulta horários disponíveis no módulo Agenda antes de propor uma marcação ao cliente.',
    'agenda_action',
    '🔎',
    '{
      "depends_on": ["schedules", "service_types"],
      "when_to_use": "Quando o cliente perguntar sobre disponibilidade, horários ou agenda.",
      "input_schema": {
        "date": "string (YYYY-MM-DD)",
        "service_type_id": "uuid | null"
      },
      "properties": {
        "default_service_type_id": {
          "type": "string",
          "title": "Tipo de serviço padrão"
        },
        "lookahead_days": {
          "type": "integer",
          "title": "Dias para buscar disponibilidade",
          "default": 7
        }
      }
    }'::jsonb,
    true,
    true,
    10
  ),
  (
    'agendar',
    'Agendar',
    'Cria um agendamento para o contato usando os horários e serviços configurados.',
    'agenda_action',
    '📅',
    '{
      "depends_on": ["schedules", "service_types"],
      "when_to_use": "Quando o cliente confirmar interesse em marcar um horário.",
      "input_schema": {
        "contact_id": "uuid",
        "service_type_id": "uuid",
        "scheduled_at": "string (ISO8601)",
        "notes": "string | null"
      },
      "properties": {
        "allow_same_day": {
          "type": "boolean",
          "title": "Permitir agendamento no mesmo dia",
          "default": false
        },
        "confirmation_message": {
          "type": "string",
          "title": "Mensagem de confirmação",
          "default": "Agendamento confirmado para {{data}} às {{hora}}!"
        }
      }
    }'::jsonb,
    true,
    true,
    20
  ),
  (
    'cancelar_agenda',
    'Cancelar Agenda',
    'Cancela um agendamento existente e registra o motivo informado pelo cliente.',
    'agenda_action',
    '🗓️',
    '{
      "depends_on": ["schedules"],
      "when_to_use": "Quando o cliente pedir para cancelar um horário marcado.",
      "input_schema": {
        "appointment_id": "uuid",
        "reason": "string | null"
      },
      "properties": {}
    }'::jsonb,
    true,
    true,
    30
  ),
  (
    'mover_crm',
    'Mover CRM',
    'Move um negócio para outra etapa do pipeline comercial.',
    'crm_action',
    '🧭',
    '{
      "depends_on": ["pipelines", "pipeline_stages"],
      "when_to_use": "Quando a conversa indicar avanço ou mudança de etapa no funil.",
      "input_schema": {
        "deal_id": "uuid",
        "stage_id": "uuid"
      },
      "properties": {}
    }'::jsonb,
    true,
    true,
    40
  ),
  (
    'editar_deal_crm',
    'Editar Deal CRM',
    'Atualiza título ou valor de um negócio existente no CRM.',
    'crm_action',
    '💼',
    '{
      "depends_on": ["pipelines"],
      "when_to_use": "Quando o cliente fornecer valor, escopo ou dados que alterem o negócio.",
      "input_schema": {
        "deal_id": "uuid",
        "title": "string | null",
        "amount": "number | null"
      },
      "properties": {}
    }'::jsonb,
    true,
    true,
    50
  ),
  (
    'transferir_atendimento',
    'Transferir Atendimento',
    'Transfere a conversa para um time ou agente humano.',
    'atendimento_action',
    '👥',
    '{
      "depends_on": ["teams", "user_companies"],
      "when_to_use": "Quando o cliente pedir humano ou quando a situação exigir intervenção.",
      "input_schema": {
        "team_id": "uuid | null",
        "agent_id": "uuid | null",
        "message": "string | null"
      },
      "properties": {
        "message": {
          "type": "string",
          "title": "Mensagem antes da transferência"
        }
      }
    }'::jsonb,
    true,
    true,
    60
  ),
  (
    'enviar_foto',
    'Enviar Foto',
    'Envia uma foto previamente cadastrada nos assets da ferramenta.',
    'media_action',
    '📸',
    '{
      "depends_on": ["agent_tool_assets", "storage.media"],
      "when_to_use": "Quando o cliente pedir imagem, catálogo, cardápio ou referência visual.",
      "input_schema": {
        "asset_index": "integer",
        "caption": "string | null"
      },
      "properties": {
        "caption": {
          "type": "string",
          "title": "Legenda padrão"
        }
      }
    }'::jsonb,
    true,
    true,
    70
  ),
  (
    'enviar_video',
    'Enviar Vídeo',
    'Envia um vídeo previamente cadastrado nos assets da ferramenta.',
    'media_action',
    '🎥',
    '{
      "depends_on": ["agent_tool_assets", "storage.media"],
      "when_to_use": "Quando o cliente pedir demonstração, apresentação ou tutorial.",
      "input_schema": {
        "asset_index": "integer",
        "caption": "string | null"
      },
      "properties": {
        "caption": {
          "type": "string",
          "title": "Legenda padrão"
        }
      }
    }'::jsonb,
    true,
    true,
    80
  ),
  (
    'enviar_resumo',
    'Enviar Resumo',
    'Gera e envia um resumo da conversa, lead ou oportunidade usando dados do CRM.',
    'media_action',
    '📝',
    '{
      "depends_on": [],
      "when_to_use": "Quando for útil resumir histórico, proposta ou próximos passos.",
      "input_schema": {
        "template": "string",
        "variables": "object"
      },
      "properties": {
        "template": {
          "type": "string",
          "title": "Template padrão"
        }
      }
    }'::jsonb,
    true,
    true,
    90
  ),
  (
    'buscar_conhecimento',
    'Buscar Conhecimento',
    'Consulta base de conhecimento externa para responder com mais precisão.',
    'knowledge_action',
    '📚',
    '{
      "depends_on": ["knowledge_provider"],
      "when_to_use": "Quando o cliente perguntar sobre produtos, preços, políticas ou conteúdo documentado.",
      "input_schema": {
        "query": "string",
        "top_k": "integer",
        "min_score": "number"
      },
      "properties": {
        "top_k": {
          "type": "integer",
          "title": "Número de resultados",
          "default": 3
        },
        "min_score": {
          "type": "number",
          "title": "Score mínimo de relevância",
          "default": 0.75
        }
      }
    }'::jsonb,
    true,
    true,
    100
  )
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    tool_type = EXCLUDED.tool_type,
    icon = EXCLUDED.icon,
    config_schema = EXCLUDED.config_schema,
    is_built_in = EXCLUDED.is_built_in,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';

COMMIT;
