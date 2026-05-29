-- B-001 fix: campo de qualificação em deals
-- Aplique no SQL Editor do Supabase Dashboard

-- 1. Adiciona colunas de qualificação na tabela deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS is_qualified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;

-- Índice para tornar o filtro do Dashboard eficiente
CREATE INDEX IF NOT EXISTS idx_deals_is_qualified
  ON deals (company_id, is_qualified, created_at)
  WHERE is_qualified = true;

-- 2. RPC chamada pelo n8n ao final do fluxo de qualificação do agente
-- Permissões: anon + authenticated (padrão dos RPCs chamados pelo n8n sem service_role)
CREATE OR REPLACE FUNCTION rpc_mark_lead_qualified(
  p_deal_id    UUID,
  p_company_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal deals%ROWTYPE;
BEGIN
  -- Valida que o deal pertence à empresa
  SELECT * INTO v_deal
  FROM deals
  WHERE id = p_deal_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Deal não encontrado ou não pertence a esta empresa');
  END IF;

  IF v_deal.is_qualified THEN
    RETURN json_build_object('success', true, 'already_qualified', true);
  END IF;

  UPDATE deals
  SET
    is_qualified = true,
    qualified_at = now(),
    updated_at   = now()
  WHERE id = p_deal_id AND company_id = p_company_id;

  RETURN json_build_object('success', true, 'qualified_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_mark_lead_qualified(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION rpc_mark_lead_qualified(UUID, UUID) TO authenticated;
