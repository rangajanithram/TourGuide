import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthConfig, cookieOptions } from '@/lib/supabase/config';
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getAuthConfig();
  if (config) {
    const client = createServerClient(config.url, config.key, { cookieOptions, cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    } });
    await client.auth.getClaims();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Expires', '0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
export const config = {
  runtime: 'nodejs',
  matcher: ['/account/:path*', '/auth/:path*', '/login', '/signup', '/forgot-password', '/check-email', '/reset-password', '/verified'],
};
