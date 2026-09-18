import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const config = window.JIZAI_CLOUD_CONFIG || {};
document.documentElement.hidden = true;

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  location.replace('account.html?reason=configuration');
} else {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session) {
    location.replace(`account.html?next=${encodeURIComponent('index.html')}`);
  } else {
    const { data: licenses, error } = await supabase
      .from('licenses')
      .select('id')
      .eq('status', 'active')
      .limit(1);
    if (error || !licenses?.length) {
      location.replace('purchase.html?reason=license');
    } else {
      document.documentElement.hidden = false;
    }
  }
}
