import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const appOrigin = Deno.env.get('APP_ORIGIN')?.replace(/\/$/, '');

function corsHeaders(origin: string | null) {
  return origin && appOrigin && origin === appOrigin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } : { 'Vary': 'Origin' };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  if (!appOrigin) return Response.json({ message: 'サーバー設定を確認してください' }, { status: 500, headers });
  if (origin !== appOrigin) return Response.json({ message: '許可されていない送信元です' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

  const authorization = request.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(authorization)) {
    return Response.json({ message: 'ログインが必要です' }, { status: 401, headers });
  }
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
    if (authError || !authData.user) return Response.json({ message: 'ログインが必要です' }, { status: 401, headers });

    const { email } = await request.json();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ message: '正しいメールアドレスを入力してください' }, { status: 400, headers });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', authData.user.id)
      .eq('role', 'admin')
      .single();
    if (membershipError || !membership) return Response.json({ message: '会社管理者だけが招待できます' }, { status: 403, headers });

    const { data: license, error: licenseError } = await adminClient
      .from('licenses')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('plan', 'company')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (licenseError) throw licenseError;
    if (!license) return Response.json({ message: '有効な会社版ライセンスが必要です' }, { status: 403, headers });

    const { count, error: countError } = await adminClient
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id);
    if (countError) throw countError;
    if ((count ?? 0) >= 20) return Response.json({ message: '会社版は管理者を含め20名までです' }, { status: 409, headers });

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

    return Response.json({ invited: true, memberCount: (count ?? 0) + 1 }, { headers });
  } catch (error) {
    console.error('invite-company-user failed', error);
    return Response.json({ message: '招待できませんでした。入力内容を確認して再度お試しください' }, { status: 400, headers });
  }
});
