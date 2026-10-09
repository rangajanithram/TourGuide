import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
export const dynamic = 'force-dynamic';
export default async function ResetPasswordPage() {
  const client = await getServerSupabase(); const result = client && await client.auth.getUser();
  if (!result?.data.user?.email_confirmed_at) redirect('/auth/error');
  return <ResetPasswordForm />;
}
