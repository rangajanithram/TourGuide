export function getAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key || url.includes('your-project') || key.includes('placeholder')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null;
    if (key.startsWith('sb_secret_')) return null;
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') return null;
    }
    return { url, key };
  } catch { return null; }
}
export const cookieOptions = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };
