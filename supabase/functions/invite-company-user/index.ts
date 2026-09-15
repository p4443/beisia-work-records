import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const authorization = request.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return Response.json({ message: 'ログインが必要です' }, { status: 401, headers: corsHeaders });

    const { email } = await request.json();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ message: '正しいメールアドレスを入力してください' }, { status: 400, headers: corsHeaders });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', authData.user.id)
      .eq('role', 'admin')
      .single();
    if (membershipError || !membership) return Response.json({ message: '会社管理者だけが招待できます' }, { status: 403, headers: corsHeaders });

    const { data: license, error: licenseError } = await adminClient
      .from('licenses')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('plan', 'company')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (licenseError) throw licenseError;
    if (!license) return Response.json({ message: '有効な会社版ライセンスが必要です' }, { status: 403, headers: corsHeaders });

    const { count, error: countError } = await adminClient
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id);
    if (countError) throw countError;
    if ((count ?? 0) >= 20) return Response.json({ message: '会社版は管理者を含め20名までです' }, { status: 409, headers: corsHeaders });

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${Deno.env.get('APP_URL') ?? ''}/account.html`,
    });
    if (inviteError) throw inviteError;

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: invited.user.id,
      email: normalizedEmail,
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { error: memberError } = await adminClient.from('organization_members').insert({
      organization_id: membership.organization_id,
      user_id: invited.user.id,
      role: 'member',
    });
    if (memberError) throw memberError;

    return Response.json({ invited: true, memberCount: (count ?? 0) + 1 }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : '招待できませんでした' }, { status: 400, headers: corsHeaders });
  }
});
