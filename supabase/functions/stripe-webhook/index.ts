import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const paymentLinkPlans = new Map([
  [Deno.env.get('STRIPE_PERSONAL_PAYMENT_LINK_ID'), 'personal'],
  [Deno.env.get('STRIPE_COMPANY_PAYMENT_LINK_ID'), 'company'],
]);

async function findOrInviteUser(email: string) {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw usersError;
  const existing = usersData.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing;

  const redirectTo = `${Deno.env.get('APP_URL') ?? ''}/account.html`;
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw error;
  return data.user;
}

async function activateCheckout(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email ?? session.customer_email;
  const paymentLinkId = typeof session.payment_link === 'string' ? session.payment_link : session.payment_link?.id;
  const plan = paymentLinkPlans.get(paymentLinkId);
  if (!email || !paymentLinkId || !plan) throw new Error('購入者メールまたは対象プランを確認できません');

  const user = await findOrInviteUser(email);
  let organizationId: string | null = null;

  if (plan === 'company') {
    const { data: existingMembership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    organizationId = existingMembership?.organization_id ?? null;
    if (!organizationId) {
      const defaultName = session.customer_details?.name?.trim() || `${email} の会社`;
      const { data: organization, error: organizationError } = await supabase
        .from('organizations')
        .insert({ name: defaultName, owner_id: user.id, max_members: 20 })
        .select('id')
        .single();
      if (organizationError) throw organizationError;
      organizationId = organization.id;

      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({ organization_id: organizationId, user_id: user.id, role: 'admin' });
      if (memberError) throw memberError;
    }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, email }, { onConflict: 'id' });
  if (profileError) throw profileError;

  const { error: licenseError } = await supabase.from('licenses').upsert({
    stripe_checkout_session_id: session.id,
    stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    stripe_payment_link_id: paymentLinkId,
    purchaser_email: email,
    plan,
    status: 'active',
    user_id: user.id,
    organization_id: organizationId,
  }, { onConflict: 'stripe_checkout_session_id' });
  if (licenseError) throw licenseError;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  try {
    const payload = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    );
    if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
      await activateCheckout(event.data.object);
    }
    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Webhook error' }, { status: 400 });
  }
});
