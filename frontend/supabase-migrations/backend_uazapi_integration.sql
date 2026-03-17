-- ==============================================================================
-- Migration: UAZAPI Integration (app_integrations table)
-- Create this table to securely store UAZAPI instances and their connection statuses.
-- ==============================================================================

-- 1. Create the App Integrations Table
CREATE TABLE IF NOT EXISTS public.app_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'uazapi', -- currently only supporting 'uazapi'
    instance_id TEXT NOT NULL, -- The external instance ID/name in UAZAPI
    instance_token TEXT, -- Store securely, do NOT expose to client directly in open selects
    status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected, connecting, connected, error
    phone TEXT, -- Phone number if connected
    qrcode TEXT, -- Base64 QR Code if waiting to pair
    paircode TEXT, -- Pair code if waiting to pair
    profile_name TEXT, -- Profile name from WhatsApp 
    metadata JSONB DEFAULT '{}'::jsonb, -- Store raw payloads or extra info
    is_connected BOOLEAN GENERATED ALWAYS AS (status = 'connected') STORED,
    last_connected_at TIMESTAMP WITH TIME ZONE,
    last_disconnect_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(company_id, provider) -- One active integration of each type per company for now
);

-- 2. Enable Row Level Security
ALTER TABLE public.app_integrations ENABLE ROW LEVEL SECURITY;

-- 3. Row Level Security Policies
-- Policy: Users can view integrations for their companies
-- IMPORTANT: We will exclude `instance_token` from typical views if needed, 
-- but RLS restricts row access to company members.
DROP POLICY IF EXISTS "Users can view integrations for their companies" ON public.app_integrations;
CREATE POLICY "Users can view integrations for their companies" ON public.app_integrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = app_integrations.company_id 
            AND uc.user_id = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.user_profiles up 
            WHERE up.id = auth.uid() AND up.system_role = 'platform_admin'
        )
    );

-- Policy: Edge Functions (using service_role) bypass RLS. 
-- We intentionally DO NOT add INSERT/UPDATE policies for regular users.
-- Only the secure Edge Function should create or update integration credentials.

-- 4. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_integrated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_app_integrations_updated_at ON public.app_integrations;
CREATE TRIGGER update_app_integrations_updated_at
    BEFORE UPDATE ON public.app_integrations
    FOR EACH ROW EXECUTE PROCEDURE update_integrated_at_column();
