const config = window.JIZAI_CLOUD_CONFIG || {};
const ACCESS_CACHE_KEY = 'jizai_access_verified_until';
const ACCESS_CACHE_TTL = 10 * 60 * 1000;

function readCachedAccess() {
  try {
  return Number(localStorage.getItem(ACCESS_CACHE_KEY)) > Date.now();
  } catch (error) {
  console.warn('アクセス確認キャッシュを読み込めませんでした。', error);
  return false;
  }
}

function cacheAccess() {
  try {
  localStorage.setItem(ACCESS_CACHE_KEY, String(Date.now() + ACCESS_CACHE_TTL));
  } catch (error) {
  console.warn('アクセス確認キャッシュを保存できませんでした。', error);
  }
}

function clearCachedAccess() {
  try {
  localStorage.removeItem(ACCESS_CACHE_KEY);
  } catch (error) {
  console.warn('アクセス確認キャッシュを削除できませんでした。', error);
  }
}

const TRIAL_BANNER_ID = 'trialModeBanner';

function showTrialBanner(message = '試用モードで利用中です。稼働記録の機能を購入前にお試しいただけます。') {
  const banner = document.getElementById(TRIAL_BANNER_ID) || document.createElement('div');
  banner.id = TRIAL_BANNER_ID;
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'background:#fef9c3;color:#713f12;border-bottom:1px solid #fde047;padding:8px 12px;font-size:13px;line-height:1.6;text-align:center;';
  banner.textContent = message;
  banner.innerHTML += ' 記録はこのブラウザー内に保存されます。点呼確認簿へ接続した場合は同期先にも送信されます。'
  + '<a href="purchase.html" style="color:#166534;font-weight:700;margin-left:8px;white-space:nowrap;">購入はこちら</a>'
  + '<a href="account.html" style="color:#166534;font-weight:700;margin-left:8px;white-space:nowrap;">購入済みの方はログイン</a>';
  document.body.prepend(banner);
}

function removeTrialBanner() {
  document.getElementById(TRIAL_BANNER_ID)?.remove();
}

async function verifyAccess() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.warn('クラウド設定が不足しているため、購入状況を確認できません。');
  clearCachedAccess();
  showTrialBanner();
  return;
  }

  try {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!data.session) {
    clearCachedAccess();
    showTrialBanner();
    return;
  }

  const { data: licenses, error } = await supabase
    .from('licenses')
    .select('id')
    .eq('status', 'active')
    .limit(1);

  if (error) throw error;
  if (!licenses?.length) {
    clearCachedAccess();
    showTrialBanner();
    return;
  }

  cacheAccess();
  removeTrialBanner();
  } catch (error) {
  console.error('クラウドのアクセス確認に失敗しました。', error);
  showTrialBanner('購入状況を確認できませんでした。記録機能は引き続き利用できます。アカウントページで接続状況を確認してください。');
  }
}

if (!readCachedAccess()) showTrialBanner('購入状況を確認中です。確認中も記録機能を利用できます。');
verifyAccess();
