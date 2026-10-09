import { createBrowserClient } from '@supabase/ssr';
import { getAuthConfig, cookieOptions } from './supabase/config';
export const isSupabaseConfigured = Boolean(getAuthConfig());
export function getBrowserSupabase() {
  const config = getAuthConfig();
  if (!config) throw { code: 'configuration' };
  return createBrowserClient(config.url, config.key, { cookieOptions });
}
