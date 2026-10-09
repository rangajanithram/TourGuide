export function safeNext(value: string | null | undefined): string {
  return ['/planner', '/account', '/reset-password'].includes(value || '') ? value! : '/account';
}
export function authErrorMessage(error: unknown): string {
  const e = error as { code?: string; status?: number; name?: string };
  if (e?.code === 'configuration') return 'Account sign-in is not configured yet. You can still explore the guest planner.';
  if (e?.code === 'verification_configuration') return 'Email verification needs to be enabled by the site administrator.';
  if (e?.code === 'reauthentication_needed' || e?.code === 'session_not_found') return 'Sign in again or request a new password recovery link.';
  if (e?.status === 429 || e?.code?.includes('rate_limit')) return 'Too many attempts. Please wait a minute before trying again.';
  if (e?.code === 'email_not_confirmed') return 'Verify your email first. Request a new link from Check email.';
  if (e?.code === 'weak_password') return 'Choose a longer, unique password that has not appeared in a data breach.';
  if (e?.code === 'captcha_failed') return 'Complete the security check again.';
  if (e?.name === 'AuthRetryableFetchError' || e instanceof TypeError) return 'Unable to reach sign-in. Check your connection and try again.';
  return 'Unable to sign in. Check your details or try password recovery.';
}
export const EMAIL_NOTICE = 'If this address is eligible, a link will arrive shortly. Check your inbox and spam folder.';
