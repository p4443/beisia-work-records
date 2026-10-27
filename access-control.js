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

const hasCachedAccess = readCachedAccess();
if (hasCachedAccess) document.documentElement.hidden = false;

async function verifyAccess() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
  clearCachedAccess();
  location.replace('account.html?reason=configuration');
  return;
  }

  try {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (sessionError || !data.session) {
    clearCachedAccess();
    location.replace(`account.html?next=${encodeURIComponent('index.html')}`);
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
    location.replace('purchase.html?reason=license');
    return;
  }

  cacheAccess();
  document.documentElement.hidden = false;
  } catch (error) {
  console.error('クラウドのアクセス確認に失敗しました。', error);
  if (!hasCachedAccess) {
    location.replace('account.html?reason=connection');
  }
  }
}

verifyAccess();
