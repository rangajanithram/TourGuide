import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase/server';
import AuthPanel from '@/components/auth/AuthPanel';
import LogoutButton from '@/components/auth/LogoutButton';

export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const client = await getServerSupabase();
  if (!client) redirect('/login?error=configuration');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) redirect('/login?error=session_expired');
  const user = data.user;
  return <AuthPanel title="Your travel account">
    <p>Signed in as <strong className="break-all">{user.email}</strong></p>
    <dl><dt>Email status</dt><dd>Verified</dd><dt>Connected sign-in methods</dt>
      <dd>{user.identities?.map(i => i.provider).join(', ') || 'Email'}</dd></dl>
    <Link href="/planner" className="underline block">Open the planner →</Link>
    <Link href="/reset-password" className="underline block">Change password</Link>
    <LogoutButton />
  </AuthPanel>;
}
