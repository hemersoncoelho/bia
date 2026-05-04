-- ============================================================
-- Agent Tools Module — Fase 2.0
-- Adiciona array "fields" ao config_schema de cada tool
-- para renderização dinâmica no drawer de configuração.
-- ============================================================

BEGIN;

-- buscar_agenda
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "lookahead_days",
      "type": "number",
      "label": "Dias para buscar disponibilidade",
      "description": "Quantos dias à frente o agente deve verificar horários disponíveis.",
      "default": 7,
      "min": 1,
      "max": 60,
      "required": false
    },
    {
      "key": "allow_weekend_search",
      "type": "toggle",
      "label": "Buscar nos fins de semana",
      "description": "Incluir sábado e domingo na busca de disponibilidade.",
      "default": false,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'buscar_agenda';

-- agendar
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "allow_same_day",
      "type": "toggle",
      "label": "Permitir agendamento no mesmo dia",
      "description": "Habilita marcar horários para o dia atual, caso haja disponibilidade.",
      "default": false,
      "required": false
    },
    {
      "key": "require_confirmation",
      "type": "toggle",
      "label": "Exigir confirmação do cliente",
      "description": "O cliente deve confirmar antes de o agendamento ser criado.",
      "default": true,
      "required": false
    },
    {
      "key": "confirmation_message",
      "type": "textarea",
      "label": "Mensagem de confirmação",
      "description": "Mensagem enviada ao cliente após o agendamento ser criado. Use {{data}} e {{hora}}.",
      "placeholder": "Agendamento confirmado para {{data}} às {{hora}}!",
      "default": "Agendamento confirmado para {{data}} às {{hora}}!",
      "rows": 3,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'agendar';

-- cancelar_agenda
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "require_reason",
      "type": "toggle",
      "label": "Exigir motivo do cancelamento",
      "description": "O cliente deve informar o motivo antes do cancelamento ser registrado.",
      "default": false,
      "required": false
    },
    {
      "key": "cancellation_message",
      "type": "textarea",
      "label": "Mensagem de cancelamento",
      "description": "Mensagem enviada ao cliente após o cancelamento.",
      "placeholder": "Seu agendamento foi cancelado. Qualquer dúvida, estamos aqui!",
      "default": "Seu agendamento foi cancelado. Qualquer dúvida, estamos aqui!",
      "rows": 3,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'cancelar_agenda';

-- mover_crm
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "require_justification",
      "type": "toggle",
      "label": "Exigir justificativa para mover",
      "description": "O agente deve incluir uma justificativa textual ao mover o deal de etapa.",
      "default": false,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'mover_crm';

-- editar_deal_crm
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "allow_amount_edit",
      "type": "toggle",
      "label": "Permitir editar valor do deal",
      "description": "O agente poderá atualizar o campo de valor monetário do negócio.",
      "default": true,
      "required": false
    },
    {
      "key": "allow_title_edit",
      "type": "toggle",
      "label": "Permitir editar título do deal",
      "description": "O agente poderá atualizar o título/nome do negócio.",
      "default": true,
      "required": false
    },
    {
      "key": "allow_expected_close_date_edit",
      "type": "toggle",
      "label": "Permitir editar data prevista",
      "description": "O agente poderá atualizar a data estimada de fechamento.",
      "default": false,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'editar_deal_crm';

-- transferir_atendimento
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "allow_team_transfer",
      "type": "toggle",
      "label": "Transferir para time",
      "description": "Permite ao agente transferir para um time inteiro.",
      "default": true,
      "required": false
    },
    {
      "key": "allow_agent_transfer",
      "type": "toggle",
      "label": "Transferir para agente específico",
      "description": "Permite ao agente transferir para um membro específico.",
      "default": false,
      "required": false
    },
    {
      "key": "transfer_message_template",
      "type": "textarea",
      "label": "Mensagem antes da transferência",
      "description": "Mensagem enviada ao cliente imediatamente antes da transferência.",
      "placeholder": "Vou transferir você para um especialista. Um momento!",
      "default": "Vou transferir você para um especialista. Um momento!",
      "rows": 3,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'transferir_atendimento';

-- enviar_foto
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "caption",
      "type": "text",
      "label": "Legenda padrão",
      "description": "Legenda enviada junto à imagem, caso não seja especificada na conversa.",
      "placeholder": "Ex: Confira nosso cardápio!",
      "required": false
    },
    {
      "key": "max_assets_per_send",
      "type": "number",
      "label": "Máx. imagens por envio",
      "description": "Quantas imagens o agente pode enviar de uma vez.",
      "default": 1,
      "min": 1,
      "max": 5,
      "required": false
    },
    {
      "key": "use_asset_label_as_caption",
      "type": "toggle",
      "label": "Usar label do asset como legenda",
      "description": "Se ativo, usa o label cadastrado no asset em vez da legenda padrão.",
      "default": false,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'enviar_foto';

-- enviar_video
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "caption",
      "type": "text",
      "label": "Legenda padrão",
      "description": "Legenda enviada junto ao vídeo.",
      "placeholder": "Ex: Veja como funciona!",
      "required": false
    },
    {
      "key": "max_assets_per_send",
      "type": "number",
      "label": "Máx. vídeos por envio",
      "description": "Quantos vídeos o agente pode enviar de uma vez.",
      "default": 1,
      "min": 1,
      "max": 3,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'enviar_video';

-- enviar_resumo
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "template",
      "type": "textarea",
      "label": "Template do resumo",
      "description": "Template padrão. Use {{contact_name}}, {{last_messages}}, {{deal_title}}.",
      "placeholder": "Olá {{contact_name}}, segue um resumo da nossa conversa...",
      "rows": 4,
      "required": false
    },
    {
      "key": "include_contact_name",
      "type": "toggle",
      "label": "Incluir nome do contato",
      "description": "Adiciona o nome do contato no resumo gerado.",
      "default": true,
      "required": false
    },
    {
      "key": "include_last_messages_count",
      "type": "number",
      "label": "Número de mensagens recentes",
      "description": "Quantas mensagens recentes incluir no contexto do resumo.",
      "default": 5,
      "min": 1,
      "max": 20,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'enviar_resumo';

-- buscar_conhecimento
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "fields": [
    {
      "key": "top_k",
      "type": "number",
      "label": "Número de resultados (top_k)",
      "description": "Quantos chunks da base de conhecimento retornar por consulta.",
      "default": 3,
      "min": 1,
      "max": 10,
      "required": false
    },
    {
      "key": "min_score",
      "type": "number",
      "label": "Score mínimo de relevância",
      "description": "Resultados abaixo deste score são descartados (0.0–1.0).",
      "default": 0.75,
      "min": 0,
      "max": 1,
      "required": false
    },
    {
      "key": "fallback_message",
      "type": "textarea",
      "label": "Mensagem de fallback",
      "description": "Mensagem quando nenhum resultado relevante for encontrado.",
      "placeholder": "Não encontrei informações sobre isso. Posso ajudar com mais alguma coisa?",
      "rows": 3,
      "required": false
    }
  ]
}'::jsonb
WHERE slug = 'buscar_conhecimento';

NOTIFY pgrst, 'reload schema';

COMMIT;
