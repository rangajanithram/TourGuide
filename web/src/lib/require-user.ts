import 'server-only';
import { redirect } from 'next/navigation';
import { getServerSupabase } from './supabase/server';

export async function requireVerifiedUser() {
  const client = await getServerSupabase();
  if (!client) redirect('/login?error=configuration');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) redirect('/login?error=session_expired');
  return data.user;
}
