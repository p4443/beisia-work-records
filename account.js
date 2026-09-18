import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const config = window.JIZAI_CLOUD_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const supabase = configured ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const setupPanel = document.getElementById('setupPanel');
const loginPanel = document.getElementById('loginPanel');
const accountPanel = document.getElementById('accountPanel');
const message = document.getElementById('accountMessage');

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = `message ${isError ? 'error' : 'success'}`;
}

function showPanel(panel) {
  [setupPanel, loginPanel, accountPanel].forEach(element => element.hidden = element !== panel);
}

async function loadAccount(user) {
  const { data: licenses, error: licenseError } = await supabase
    .from('licenses')
    .select('plan,status,organization_id,purchased_at')
    .eq('status', 'active');
  if (licenseError) throw licenseError;
  if (!licenses?.length) {
    showPanel(loginPanel);
    showMessage('有効な購入情報を確認できません。購入時と同じメールアドレスでログインしてください。', true);
    return;
  }

  const license = licenses[0];
  document.getElementById('accountEmail').textContent = user.email || '';
  document.getElementById('accountPlan').textContent = license.plan === 'company' ? '会社版' : '個人版';
  showPanel(accountPanel);

  const companyPanel = document.getElementById('companyPanel');
  if (license.plan !== 'company' || !license.organization_id) {
    companyPanel.hidden = true;
    return;
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id,role,organizations(name,max_members)')
    .eq('organization_id', license.organization_id)
    .eq('user_id', user.id)
    .single();
  if (membershipError) throw membershipError;

  companyPanel.hidden = false;
  document.getElementById('companyName').textContent = membership.organizations.name;
  document.getElementById('inviteForm').hidden = membership.role !== 'admin';
  await loadMembers(membership.organization_id, membership.role === 'admin');
}

async function loadMembers(organizationId, isAdmin) {
  const { data: memberships, error: memberError } = await supabase
    .from('organization_members')
    .select('user_id,role,created_at')
    .eq('organization_id', organizationId)
    .order('created_at');
  if (memberError) throw memberError;

  const userIds = memberships.map(item => item.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,display_name')
    .in('id', userIds);
  if (profileError) throw profileError;
  const profileMap = new Map(profiles.map(profile => [profile.id, profile]));

  document.getElementById('memberCount').textContent = `${memberships.length} / 20名`;
  const memberList = document.getElementById('memberList');
  memberList.replaceChildren(...memberships.map(item => {
    const profile = profileMap.get(item.user_id) || {};
    const removable = isAdmin && item.role !== 'admin';
    const listItem = document.createElement('li');
    const details = document.createElement('span');
    const name = document.createElement('strong');
    const role = document.createElement('small');
    name.textContent = profile.display_name || profile.email || '利用者';
    role.textContent = item.role === 'admin' ? '管理者' : '利用者';
    details.append(name, role);
    listItem.append(details);
    if (removable) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.userId = item.user_id;
      removeButton.className = 'remove-member';
      removeButton.textContent = '削除';
      listItem.append(removeButton);
    }
    return listItem;
  }));

  document.querySelectorAll('.remove-member').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('この利用者を会社から削除しますか？')) return;
    const { error } = await supabase.from('organization_members').delete().eq('organization_id', organizationId).eq('user_id', button.dataset.userId);
    if (error) return showMessage(error.message, true);
    await loadMembers(organizationId, true);
  }));
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const button = event.submitter;
  button.disabled = true;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${location.pathname}` } });
  button.disabled = false;
  showMessage(error ? error.message : 'ログイン用リンクをメールで送信しました。', Boolean(error));
});

document.getElementById('inviteForm').addEventListener('submit', async event => {
  event.preventDefault();
  const emailInput = document.getElementById('inviteEmail');
  const button = event.submitter;
  button.disabled = true;
  const { data, error } = await supabase.functions.invoke('invite-company-user', { body: { email: emailInput.value.trim() } });
  button.disabled = false;
  if (error || data?.message) return showMessage(data?.message || error.message, true);
  emailInput.value = '';
  showMessage('招待メールを送信しました。');
  const { data: sessionData } = await supabase.auth.getSession();
  await loadAccount(sessionData.session.user);
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showPanel(loginPanel);
});

if (!configured) {
  showPanel(setupPanel);
} else {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    loadAccount(data.session.user).catch(error => showMessage(error.message, true));
  } else {
    showPanel(loginPanel);
  }
}
