import AccountWelcome from '@/components/guide/AccountWelcome';

export const metadata = { title: 'Welcome back · TripWeave' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {

  const params = await searchParams;

  const notice = params.error === 'configuration' ? 'Account sign-in is not configured yet. You can still explore the guide.'

    : params.error === 'session_expired' ? 'Your session has ended. Please log in again.'

    : params.message === 'password_updated' ? 'Password updated. Log in with your new password.' : '';

  return <AccountWelcome initialNotice={notice} />;

}
