import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import AuthPanel from '@/components/auth/AuthPanel';

export const dynamic = 'force-dynamic';
export default async function VerifiedPage() {
  const client = await getServerSupabase();
  const result = client && await client.auth.getUser();
  if (!result?.data.user?.email_confirmed_at) redirect('/auth/error');
  return <AuthPanel title="Email verified"><p>Your email is verified and you are signed in.</p>
    <Link href="/account" className="underline">Continue to your account →</Link></AuthPanel>;
}
