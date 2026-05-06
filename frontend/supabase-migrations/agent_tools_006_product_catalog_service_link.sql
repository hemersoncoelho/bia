-- ============================================================
-- Agent Tools — Fase 6: Vínculo product_catalog ↔ service_types
-- Adiciona service_type_id (nullable) em product_catalog para
-- que o agente saiba qual service_type usar ao verificar
-- disponibilidade e criar agendamentos.
-- ============================================================

BEGIN;

ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS service_type_id UUID
    REFERENCES public.service_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_catalog_service_type_id
  ON public.product_catalog (service_type_id)
  WHERE service_type_id IS NOT NULL;

-- Atualiza a descrição da tool para documentar o campo
UPDATE public.agent_tool_catalog
SET config_schema = config_schema || '{
  "input_schema": {
    "query": "string | null — filtro opcional por nome",
    "limit": "integer — máximo de resultados",
    "output_fields": "id, name, description, price, duration_minutes, service_type_id — use service_type_id diretamente ao chamar buscar_horarios_disponiveis ou agendar"
  }
}'::jsonb
WHERE slug = 'buscar_produtos_servicos';

NOTIFY pgrst, 'reload schema';

COMMIT;
