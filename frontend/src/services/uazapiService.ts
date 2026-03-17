import { supabase } from '../lib/supabase';

// Helper types matching Edge Function
export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected';

export interface UazapiResponse {
  success: boolean;
  error?: string;
  status?: IntegrationStatus;
  qrcode?: string | null;
  paircode?: string | null;
  profileName?: string | null;
}

export const uazapiService = {
  /**
   * Initialize a new instance for the company
   */
  async init(companyId: string): Promise<UazapiResponse> {
    const { data, error } = await supabase.functions.invoke<UazapiResponse>('uazapi-connector', {
      body: { action: 'init', company_id: companyId }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Failed to initialize instance');
    return data;
  },

  /**
   * Request connection (QR Code or Pair Code)
   */
  async connect(companyId: string, phone?: string): Promise<UazapiResponse> {
    const { data, error } = await supabase.functions.invoke<UazapiResponse>('uazapi-connector', {
      body: { action: 'connect', company_id: companyId, phone }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Failed to request connection');
    return data;
  },

  /**
   * Poll status of the instance
   */
  async getStatus(companyId: string): Promise<UazapiResponse> {
    const { data, error } = await supabase.functions.invoke<UazapiResponse>('uazapi-connector', {
      body: { action: 'status', company_id: companyId },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Failed to get status');
    return data;
  },
  
  /**
   * Disconnect instance
   */
  async disconnect(companyId: string): Promise<UazapiResponse> {
    const { data, error } = await supabase.functions.invoke<UazapiResponse>('uazapi-connector', {
      body: { action: 'disconnect', company_id: companyId }
    });
    if (error) throw error;
    return data || { success: true };
  }
};
