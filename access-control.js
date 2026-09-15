import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const config = window.JIZAI_CLOUD_CONFIG || {};
if (config.supabaseUrl && config.supabaseAnonKey) {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.replace(`account.html?next=${encodeURIComponent('index.html')}`);
  } else {
    const { data: licenses, error } = await supabase
      .from('licenses')
      .select('id')
      .eq('status', 'active')
      .limit(1);
    if (error || !licenses?.length) {
      location.replace('purchase.html?reason=license');
    }
  }
}
