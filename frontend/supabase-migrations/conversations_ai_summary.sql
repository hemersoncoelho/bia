-- Adiciona campo ai_summary em conversations para long memory do agente
-- Aplique no SQL Editor do Supabase Dashboard

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Permite que o n8n (anon/service_role) atualize via PATCH REST
-- O RLS existente já cobre o acesso por tenant; apenas garantimos
-- que service_role pode escrever (necessário para o workflow Followup).
-- Nenhuma policy nova é necessária se a tabela já tem RLS permissiva para service_role.
