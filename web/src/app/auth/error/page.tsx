import Link from 'next/link';
import AuthPanel from '@/components/auth/AuthPanel';

export default function AuthErrorPage() {
  return <AuthPanel title="This sign-in link could not be used">
    <p>It may have expired, already been used, or been cancelled. For Google sign-in, start again in the same browser. The provider may also need configuration.</p>
    <Link href="/login" className="underline block">Try signing in again</Link>
    <Link href="/check-email" className="underline block">Request a new verification link</Link>
    <Link href="/forgot-password" className="underline block">Recover your password</Link>
  </AuthPanel>;
}
