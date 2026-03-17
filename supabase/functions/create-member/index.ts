// Supabase Edge Function: cria usuário com email + senha e adiciona à empresa
// Deploy: supabase functions deploy create-member --project-ref phlgzzjyzkgvveqevqbg
// Secret obrigatório: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function createUserViaGoTrue(
  supabaseUrl: string,
  serviceKey: string,
  email: string,
  password: string,
  fullName: string
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split('@')[0] },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    return { error: json.msg || json.error_description || json.message || String(json) };
  }
  return { id: json.id };
}

async function findUserByEmailViaGoTrue(
  supabaseUrl: string,
  serviceKey: string,
  email: string
): Promise<{ id: string } | null> {
  const perPage = 100;
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });
    const json = await res.json();
    if (!res.ok) return null;
    const users: { id: string; email?: string }[] = json.users ?? [];
    const found = users.find((u) => (u.email || '').toLowerCase() === normalized);
    if (found) return { id: found.id };
    if (users.length < perPage) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autenticado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY não configurada. Execute: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, password, full_name, company_id, role_in_company, team_id } = await req.json();

    if (!email?.trim() || !password?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email e senha são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!company_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'company_id é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user: caller } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: uc } = await supabase
      .from('user_companies')
      .select('role_in_company')
      .eq('user_id', caller.id)
      .eq('company_id', company_id)
      .single();

    if (!uc || uc.role_in_company !== 'company_admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Sem permissão para adicionar membros.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const fullNameVal = full_name?.trim() || normalizedEmail.split('@')[0];

    const createResult = await createUserViaGoTrue(
      supabaseUrl,
      supabaseServiceKey,
      normalizedEmail,
      password,
      fullNameVal
    );

    if ('error' in createResult) {
      const errMsg = createResult.error;
      if (errMsg?.toLowerCase().includes('already') || errMsg?.toLowerCase().includes('registered')) {
        const existing = await findUserByEmailViaGoTrue(supabaseUrl, supabaseServiceKey, normalizedEmail);
        if (existing) {
          const { error: linkErr } = await supabase.from('user_companies').upsert(
            { user_id: existing.id, company_id, role_in_company: role_in_company || 'agent', team_id: team_id ?? null },
            { onConflict: 'user_id,company_id' }
          );
          if (linkErr) {
            return new Response(
              JSON.stringify({ success: false, error: linkErr.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({ success: true, added: true, user_id: existing.id, message: 'Usuário já existia e foi vinculado à empresa.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = createResult.id;
    // user_profiles é criado pelo trigger handle_new_user com full_name do user_metadata

    const { error: linkErr } = await supabase.from('user_companies').insert({
      user_id: userId,
      company_id,
      role_in_company: role_in_company || 'agent',
      team_id: team_id || null,
    });

    if (linkErr) {
      return new Response(
        JSON.stringify({ success: false, error: linkErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, message: 'Membro criado. Ele pode fazer login com o email e senha informados.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('create-member error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
