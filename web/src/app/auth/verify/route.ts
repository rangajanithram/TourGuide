import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { authOrigin } from '@/lib/auth-origin';

export async function POST(request: Request) {
  const origin = authOrigin(request);
  if (request.headers.get('origin') !== origin) return new NextResponse('Invalid origin', { status: 403 });
  const form = await request.formData();
  const hash = form.get('token_hash');
  const type = form.get('type');
  let destination = '/auth/error';
  const client = await getServerSupabase();
  if (client && typeof hash === 'string' && hash.length <= 1024 && (type === 'signup' || type === 'recovery')) {
    const { error } = await client.auth.verifyOtp({ token_hash: hash, type });
    if (!error) destination = type === 'recovery' ? '/reset-password' : '/verified';
  }
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
