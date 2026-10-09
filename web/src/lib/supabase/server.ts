import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAuthConfig, cookieOptions } from './config';
export async function getServerSupabase() {
  const config = getAuthConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookieOptions, cookies: {
    getAll: () => jar.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
      catch { /* Server Components cannot set cookies; middleware performs refresh. */ }
    },
  } });
}
