import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth-policy';
import { authOrigin } from '@/lib/auth-origin';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get('code');
  const client = await getServerSupabase(); let destination = '/auth/error';
  if (client && code && !url.searchParams.has('error')) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) { const { data } = await client.auth.getUser(); if (data.user?.email_confirmed_at) destination = safeNext(url.searchParams.get('next')); }
  }
  const response = NextResponse.redirect(new URL(destination, authOrigin(request)));
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Referrer-Policy', 'no-referrer'); return response;
}
