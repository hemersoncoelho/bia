// Supabase Edge Function: send-whatsapp-message
// Despacha mensagem outbound via UAZAPI para o WhatsApp do contato.
// Deploy: supabase functions deploy send-whatsapp-message --project-ref phlgzzjyzkgvveqevqbg

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendRequest {
  /** UUID da conversa */
  conversation_id: string;
  /** Bigint retornado pelo rpc_enqueue_outbound_message */
  message_id: number;
  /** Corpo da mensagem (para despacho; o registro já está no banco) */
  body: string;
}

interface UazapiSendResponse {
  key?: { id?: string; remoteJid?: string };
  status?: string;
  error?: string;
}

// Remove sufixo JID (@s.whatsapp.net) e garante apenas dígitos
function normalizePhone(raw: string): string {
  return raw.split('@')[0].replace(/[^0-9]/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, error: 'Não autenticado.' });
    }

    const { conversation_id, message_id, body } = (await req.json()) as SendRequest;

    if (!conversation_id || !body) {
      return json({ success: false, error: 'conversation_id e body são obrigatórios.' });
    }

    const supabaseUrl       = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey   = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl     = Deno.env.get('UAZAPI_BASE_URL') || 'https://api.uazapi.com';

    // Client com JWT do usuário — valida sessão e respeita RLS
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Client admin — lê tokens de integração sem RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Valida sessão
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (!caller) {
      return json({ success: false, error: 'Sessão inválida.', details: authErr });
    }

    // 2. Busca dados da conversa (company_id, contact_id, channel)
    const { data: conv, error: convErr } = await adminClient
      .from('conversations')
      .select('id, company_id, contact_id, channel, channel_account_id')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) {
      return json({ success: false, error: 'Conversa não encontrada.', details: convErr });
    }

    // 3. Verifica permissão do usuário na empresa
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('system_role')
      .eq('id', caller.id)
      .single();

    const isPlatformAdmin =
      profile?.system_role === 'platform_admin' ||
      profile?.system_role === 'system_admin';

    if (!isPlatformAdmin) {
      const { data: membership } = await adminClient
        .from('company_memberships')
        .select('user_id')
        .eq('company_id', conv.company_id)
        .eq('user_id', caller.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!membership) {
        return json({ success: false, error: 'Sem permissão para enviar nessa conversa.' });
      }
    }

    // 4. Somente canais WhatsApp são despachados via UAZAPI
    const channel = (conv.channel || '').toLowerCase();
    if (channel !== 'whatsapp') {
      // Canal não suportado — marcamos como enviado (foi salvo no banco, canal diferente)
      if (message_id) {
        await adminClient
          .from('messages')
          .update({ status: 'sent' })
          .eq('id', message_id);
      }
      return json({ success: true, dispatched: false, reason: 'Canal não é WhatsApp.' });
    }

    // 5. Busca o telefone — contact_identities usa normalized_value e channel_type
    const { data: identity } = await adminClient
      .from('contact_identities')
      .select('normalized_value, display_value')
      .eq('contact_id', conv.contact_id)
      .eq('channel_type', 'whatsapp')
      .maybeSingle();

    let rawPhone: string | null = identity?.normalized_value || identity?.display_value || null;

    if (!rawPhone) {
      const { data: contact } = await adminClient
        .from('contacts')
        .select('document')
        .eq('id', conv.contact_id)
        .maybeSingle();

      if (!contact?.document) {
        if (message_id) {
          await adminClient
            .from('messages')
            .update({ status: 'failed' })
            .eq('id', message_id);
        }
        return json({ success: false, error: 'Número de WhatsApp do contato não encontrado.' });
      }
      rawPhone = contact.document;
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      if (message_id) {
        await adminClient.from('messages').update({ status: 'failed' }).eq('id', message_id);
      }
      return json({ success: false, error: 'Número de telefone inválido.' });
    }

    // 6. Busca a integração UAZAPI ativa da empresa
    const { data: integration } = await adminClient
      .from('app_integrations')
      .select('instance_id, instance_token, status')
      .eq('company_id', conv.company_id)
      .eq('provider', 'uazapi')
      .maybeSingle();

    if (!integration?.instance_token) {
      if (message_id) {
        await adminClient.from('messages').update({ status: 'failed' }).eq('id', message_id);
      }
      return json({ success: false, error: 'Integração WhatsApp não configurada para esta empresa.' });
    }

    if (integration.status !== 'connected') {
      if (message_id) {
        await adminClient.from('messages').update({ status: 'failed' }).eq('id', message_id);
      }
      return json({
        success: false,
        error: `Integração WhatsApp não conectada (status: ${integration.status}). Reconecte nas configurações.`,
      });
    }

    // 7. Envia mensagem via UAZAPI
    // Endpoint: POST /message/sendText/{instanceName}
    // Header: token: {instance_token}
    // Body: { phone, message, delay? }
    const uazapiRes = await fetch(
      `${uazapiBaseUrl}/message/sendText/${integration.instance_id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: integration.instance_token,
        },
        body: JSON.stringify({
          phone,
          message: body,
          delay: 500,
        }),
      }
    );

    let uazapiData: UazapiSendResponse = {};
    try {
      uazapiData = await uazapiRes.json();
    } catch (_) {
      // ignora erro de parse
    }

    const sent = uazapiRes.ok && !uazapiData.error;

    // 8. Atualiza status da mensagem no banco
    if (message_id) {
      await adminClient
        .from('messages')
        .update({ status: sent ? 'sent' : 'failed' })
        .eq('id', message_id);
    }

    if (!sent) {
      return json({
        success: false,
        error: uazapiData.error || `UAZAPI retornou HTTP ${uazapiRes.status}`,
      });
    }

    return json({ success: true, dispatched: true, messageKey: uazapiData.key?.id });
  } catch (err: unknown) {
    console.error('send-whatsapp-message error:', err);
    return json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
