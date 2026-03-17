// Supabase Edge Function: UAZAPI Connector
// Handles init, connect, and status polling securely.
// Deploy: supabase functions deploy uazapi-connector --project-ref phlgzzjyzkgvveqevqbg

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Interface for requests
interface UazapiReq {
  action: 'init' | 'connect' | 'status' | 'disconnect';
  company_id: string;
  phone?: string; // only used for pair code
}

// UAZAPI responses (conforme uazapi-openapi-spec.yaml)
interface UazapiInitResponse {
  token: string; // Token retornado na raiz, não hash.apikey
  name?: string;
  instance?: object;
}

interface UazapiConnectResponse {
  instance?: {
    qrcode?: string;
    paircode?: string;
    status?: string;
  };
}

interface UazapiStatusResponse {
  instance?: {
    status?: string; // 'connected', 'connecting', 'disconnected'
    profileName?: string;
    qrcode?: string;
    paircode?: string;
  };
  status?: {
    connected?: boolean;
    loggedIn?: boolean;
  };
}

Deno.serve(async (req) => {
  // Sempre tratar o OPTIONS logo de cara
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Não autenticado.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, company_id, phone } = await req.json() as UazapiReq;

    if (!action || !company_id) {
       return new Response(JSON.stringify({ success: false, error: 'Parâmetros action e company_id são obrigatórios.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL') || 'https://api.uazapi.com'; 
    const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') || 'mock_admin_token_replace_in_secrets';

    // Cria o client baseando-se no token do usuário logado (passado no header) para RLS real.
    // Usaremos esse client para validar a sessão antes de usar chamadas com bypass (service_key).
    const supabaseUserClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Client admin apenas para persistir o token secreto ignorando RLS quando preciso
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Security: get caller strictly using the user-scoped client
    const { data: { user: caller }, error: authErr } = await supabaseUserClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: 'Sessão inválida. Verifique o login.', details: authErr }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Platform/System admins têm acesso a qualquer empresa (não precisam de user_companies)
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('system_role')
      .eq('id', caller.id)
      .single();

    const isPlatformAdmin = profile?.system_role === 'platform_admin' || profile?.system_role === 'system_admin';

    let roleInCompany: string | null = null;
    if (!isPlatformAdmin) {
      const { data: uc, error: ucErr } = await supabaseAdmin
        .from('user_companies')
        .select('role_in_company')
        .eq('user_id', caller.id)
        .eq('company_id', company_id)
        .single();

      if (ucErr || !uc) {
        return new Response(JSON.stringify({ success: false, error: 'Usuário não pertence à empresa.', details: ucErr, callerId: caller.id, companyId: company_id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      roleInCompany = uc.role_in_company;
    } else {
      roleInCompany = 'platform_admin'; // Admins têm permissão total
    }

    // Apenas Admins podem conectar, inicializar ou desconectar. Qualquer membro pode ver o status.
    if (action !== 'status') {
      if (!['company_admin', 'manager', 'platform_admin'].includes(roleInCompany || '')) {
        return new Response(JSON.stringify({ success: false, error: 'Sem permissão para gerenciar integrações nesta empresa.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Busca nome da empresa para usar como identificador da instância UAZAPI
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', company_id)
      .single();

    const companyName = (company?.name || 'cliente').trim();
    // UAZAPI espera "name" no payload; sanitiza: lowercase, sem espaços, apenas alfanum e underscore
    const instanceName = `salesia_${companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || company_id.replace(/-/g, '')}`;

    // Helper to get or create integration record
    const getIntegration = async () => {
       let { data } = await supabaseAdmin.from('app_integrations').select('*').eq('company_id', company_id).eq('provider', 'uazapi').single();
       if (!data) {
           const { data: inserted } = await supabaseAdmin.from('app_integrations').insert({
               company_id, provider: 'uazapi', instance_id: instanceName, status: 'disconnected'
           }).select().single();
           data = inserted;
       }
       return data;
    };

    if (action === 'init') {
        const record = await getIntegration();
        
        // Se já tem token, apenas retorna sucesso (não recria)
        if (record.instance_token) {
             return new Response(JSON.stringify({ success: true, message: 'Instância já inicializada.', status: record.status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Criar na UAZAPI — API exige "name" no payload (OpenAPI: token retornado na raiz)
        const res = await fetch(`${uazapiBaseUrl}/instance/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'admintoken': uazapiAdminToken },
            body: JSON.stringify({ name: instanceName })
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`UAZAPI init failed: ${res.status} ${errBody}`);
        }

        const uazData = (await res.json()) as Record<string, unknown>;
        if (!uazData || typeof uazData !== 'object') {
          throw new Error('Resposta da UAZAPI inválida ou vazia.');
        }
        // API pode retornar token em vários formatos (OpenAPI, hash.apikey, instance.token, etc.)
        const getStr = (o: unknown, ...keys: string[]): string | undefined => {
          if (typeof o !== 'object' || o === null) return undefined;
          const obj = o as Record<string, unknown>;
          for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.trim()) return v;
          }
          return undefined;
        };
        const dig = (o: unknown, ...path: string[]): string | undefined => {
          let cur: unknown = o;
          for (const k of path) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = (cur as Record<string, unknown>)[k];
          }
          return typeof cur === 'string' && cur.trim() ? cur : undefined;
        };
        const instanceToken = getStr(uazData, 'token', 'apikey')
          ?? dig(uazData, 'instance', 'token')
          ?? dig(uazData, 'instance', 'apikey')
          ?? dig(uazData, 'instance', 'hash', 'apikey')
          ?? dig(uazData, 'hash', 'apikey')
          ?? dig(uazData, 'hash', 'token')
          ?? dig(uazData, 'data', 'token')
          ?? dig(uazData, 'data', 'instance', 'token')
          ?? dig(uazData, 'data', 'hash', 'apikey')
          ?? dig(uazData, 'result', 'token')
          ?? dig(uazData, 'response', 'token');

        if (!instanceToken) {
          const keys = Object.keys(uazData);
          const sample = keys.reduce((acc, k) => {
            const v = uazData[k];
            acc[k] = v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object) : typeof v;
            return acc;
          }, {} as Record<string, unknown>);
          throw new Error(`Token não encontrado. Chaves: ${keys.join(', ')}. Estrutura: ${JSON.stringify(sample)}`);
        }

        // Salvar no banco
        await supabaseAdmin.from('app_integrations').update({ 
            instance_token: instanceToken, 
            status: 'disconnected' 
        }).eq('id', record.id);

        return new Response(JSON.stringify({ success: true, message: 'Instância criada.', status: 'disconnected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    else if (action === 'connect') {
        const record = await getIntegration();
        if (!record.instance_token) throw new Error('Instância não inicializada. Chame init primeiro.');

        // Doc: POST /instance/connect, header "token", body { phone? } para pair code
        const bodyPayload: Record<string, string> = {};
        if (phone && phone.trim() !== '') {
            bodyPayload.phone = phone.replace(/[^0-9]/g, '');
        }

        const res = await fetch(`${uazapiBaseUrl}/instance/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': record.instance_token },
            body: JSON.stringify(Object.keys(bodyPayload).length ? bodyPayload : {}),
        });

        let qrcode: string | null = null;
        let paircode: string | null = null;
        
        if (res.ok) {
           const uazData: UazapiConnectResponse = await res.json();
           // Doc: qrcode e paircode vêm em instance
           qrcode = uazData.instance?.qrcode ?? null;
           paircode = uazData.instance?.paircode ?? null;
        } else {
           console.log("Connect call returned", res.status);
        }

        await supabaseAdmin.from('app_integrations').update({ 
            status: 'connecting',
            qrcode: qrcode,
            paircode: paircode,
            phone: phone || null,
            updated_at: new Date().toISOString()
        }).eq('id', record.id);

        return new Response(JSON.stringify({ 
             success: true, 
             status: 'connecting', 
             qrcode, 
             paircode 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    else if (action === 'status') {
         const record = await getIntegration();
         if (!record.instance_token) {
             return new Response(JSON.stringify({ success: true, status: 'disconnected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
         }

         // Doc: GET /instance/status, header "token"
         const res = await fetch(`${uazapiBaseUrl}/instance/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'token': record.instance_token }
         });

         let dbStatus = record.status;
         let qrcode = record.qrcode;
         let paircode = record.paircode;
         let profileName = record.profile_name;
         
         if (res.ok) {
             const uazData: UazapiStatusResponse = await res.json();
             // Doc: instance.status ('connected'|'connecting'|'disconnected') e status.connected
             const apiStatus = uazData.instance?.status || '';
             const isConnected = uazData.status?.connected ?? uazData.status?.loggedIn ?? false;
             
             if (apiStatus === 'connected' || isConnected) {
                 dbStatus = 'connected';
                 qrcode = null;
                 paircode = null;
                 profileName = uazData.instance?.profileName || profileName;
             } else if (apiStatus === 'connecting') {
                 dbStatus = 'connecting';
                 qrcode = uazData.instance?.qrcode ?? qrcode;
                 paircode = uazData.instance?.paircode ?? paircode;
             } else {
                 dbStatus = 'disconnected';
             }
         }

         // Puxar QR Code novo se em connecting e sem pair code
         if (dbStatus === 'connecting' && !record.phone && !qrcode) {
             const qrRes = await fetch(`${uazapiBaseUrl}/instance/connect`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json', 'token': record.instance_token }
             });
             if (qrRes.ok) {
                 const qrData: UazapiConnectResponse = await qrRes.json();
                 if (qrData.instance?.qrcode) qrcode = qrData.instance.qrcode;
             }
         }

         await supabaseAdmin.from('app_integrations').update({ 
            status: dbStatus,
            qrcode,
            paircode,
            profile_name: profileName,
            ...(dbStatus === 'connected' ? { last_connected_at: new Date().toISOString() } : {})
        }).eq('id', record.id);

        return new Response(JSON.stringify({ 
             success: true, 
             status: dbStatus, 
             qrcode, 
             paircode,
             profileName
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    else if (action === 'disconnect') {
        const record = await getIntegration();
         if (record.instance_token) {
            // Doc: POST /instance/disconnect, header "token"
            await fetch(`${uazapiBaseUrl}/instance/disconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': record.instance_token }
            });
         }
         await supabaseAdmin.from('app_integrations').update({ 
            status: 'disconnected', qrcode: null, paircode: null, phone: null
         }).eq('id', record.id);
        
         return new Response(JSON.stringify({ success: true, status: 'disconnected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error('Action inválida.');

  } catch (err: any) {
    console.error('uazapi-connector error:', err);
    // CRÍTICO: Sempre retornar os corsHeaders no catch principal
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
