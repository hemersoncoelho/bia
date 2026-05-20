// Edge Function: cria um usuário de plataforma e vincula a uma empresa
// Somente platform_admin pode chamar esta função.
// Deploy: supabase functions deploy create-platform-user --project-ref phlgzzjyzkgvveqevqbg

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'Não autenticado.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!serviceKey) return json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, 500);

    // Cliente com anon key + JWT do usuário — padrão correto para getUser() em Edge Functions
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Cliente com service role para operações admin (criar usuário, upsert, etc.)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Valida que o caller é platform_admin ou system_admin
    const { data: { user: caller }, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !caller) return json({ success: false, error: 'Sessão inválida.' }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('system_role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['platform_admin', 'system_admin'].includes(callerProfile.system_role)) {
      return json({ success: false, error: 'Acesso negado. Somente platform_admin pode criar usuários de plataforma.' }, 403);
    }

    const {
      email,
      password,
      full_name,
      system_role,
      company_id,
      role_in_company,
    } = await req.json();

    if (!email?.trim())                          return json({ success: false, error: 'Email é obrigatório.' }, 400);
    if (!password?.trim() || password.length < 6) return json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres.' }, 400);
    if (!company_id)                             return json({ success: false, error: 'Selecione uma empresa.' }, 400);

    const normalizedEmail = email.trim().toLowerCase();
    const fullNameVal     = full_name?.trim() || normalizedEmail.split('@')[0];
    const targetRole      = system_role      || 'agent';
    const companyRole     = role_in_company  || 'agent';

    // Cria o usuário no Supabase Auth via Admin API
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullNameVal },
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      const errMsg = createData.msg || createData.error_description || createData.message || JSON.stringify(createData);
      return json({ success: false, error: errMsg }, 400);
    }

    const userId = createData.id;

    // Aguarda um curto instante para o trigger handle_new_user processar user_profiles
    await new Promise(resolve => setTimeout(resolve, 600));

    // Atualiza system_role e full_name no perfil
    await supabaseAdmin
      .from('user_profiles')
      .update({ system_role: targetRole, full_name: fullNameVal })
      .eq('id', userId);

    // Vincula o usuário à empresa
    const { error: linkErr } = await supabaseAdmin
      .from('user_companies')
      .upsert(
        { user_id: userId, company_id, role_in_company: companyRole },
        { onConflict: 'user_id,company_id' }
      );

    if (linkErr) {
      return json({ success: false, error: `Usuário criado, mas falha ao vincular empresa: ${linkErr.message}` }, 500);
    }

    return json({
      success:    true,
      user_id:    userId,
      message:    `Usuário "${fullNameVal}" criado e vinculado à empresa com sucesso.`,
    });
  } catch (err) {
    console.error('create-platform-user error:', err);
    return json({ success: false, error: String(err) }, 500);
  }
});
