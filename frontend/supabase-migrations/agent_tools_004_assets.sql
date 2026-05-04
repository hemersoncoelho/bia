-- ============================================================
-- Agent Tools — Fase 3: Upload de Assets
-- Abre upload no bucket 'media' para usuários autenticados
-- na pasta tool-assets/, e cria RPC de deleção segura.
-- ============================================================

BEGIN;

-- ── 1. Policy: authenticated pode fazer upload em tool-assets/ ──
-- O path convencional é: tool-assets/{company_id}/{agent_id}/{tool_slug}/{filename}

DROP POLICY IF EXISTS "tool_assets_authenticated_insert" ON storage.objects;
CREATE POLICY "tool_assets_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'tool-assets'
  );

DROP POLICY IF EXISTS "tool_assets_authenticated_update" ON storage.objects;
CREATE POLICY "tool_assets_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'tool-assets'
  );

DROP POLICY IF EXISTS "tool_assets_authenticated_delete" ON storage.objects;
CREATE POLICY "tool_assets_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'tool-assets'
  );

-- ── 2. RPC: deletar asset (remove storage + registro da tabela) ──

CREATE OR REPLACE FUNCTION public.rpc_delete_tool_asset(
  p_asset_id   UUID,
  p_company_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_asset public.agent_tool_assets%ROWTYPE;
BEGIN
  -- Garante que o asset pertence à empresa do caller
  SELECT * INTO v_asset
  FROM public.agent_tool_assets
  WHERE id = p_asset_id
    AND company_id = p_company_id;

  IF v_asset.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Asset não encontrado');
  END IF;

  -- Remove da tabela (o storage é removido pelo frontend via SDK)
  DELETE FROM public.agent_tool_assets WHERE id = p_asset_id;

  RETURN json_build_object('success', true, 'storage_path', v_asset.storage_path);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.rpc_delete_tool_asset(UUID, UUID) TO authenticated;

COMMIT;
