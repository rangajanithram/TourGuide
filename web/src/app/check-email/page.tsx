'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import AuthPanel from '@/components/auth/AuthPanel';
import AuthCaptcha from '@/components/auth/AuthCaptcha';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { EMAIL_NOTICE, authErrorMessage } from '@/lib/auth-policy';

export default function CheckEmailPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(EMAIL_NOTICE);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setToken] = useState('');
  const [cycle, setCycle] = useState(0);
  const pending = useRef(false);
  const nextAllowed = useRef(0);
  return <AuthPanel title="Check your email">
    <p>{EMAIL_NOTICE} Email confirmation is needed before you can use your account.</p>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault();
      if (pending.current) return;
      if (Date.now() < nextAllowed.current) { setMessage('Please wait a minute before requesting another link.'); return; }
      if (!isSupabaseConfigured) { setMessage('Account sign-in is not configured yet.'); return; }
      if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken) { setMessage('Complete the security check first.'); return; }
      pending.current = true; setBusy(true);
      try {
        const { error } = await getBrowserSupabase().auth.resend({ type: 'signup', email: email.trim(),
          options: { emailRedirectTo: `${location.origin}/auth/confirm`, captchaToken } });
        if (error && !['user_not_found', 'email_not_confirmed'].includes(error.code || '')) throw error;
        setMessage(EMAIL_NOTICE);
      } catch (error) { setMessage(authErrorMessage(error)); }
      finally {
        pending.current = false; setBusy(false); setToken(''); setCycle(v => v + 1);
        nextAllowed.current = Date.now() + 60000;
      }
    }}>
      <label className="block">Email address
        <input className="block border border-[#829682] rounded-lg p-3 w-full mt-2" type="email" autoComplete="email"
          required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <AuthCaptcha key={cycle} onToken={setToken} />
      <button className="bg-[#294333] text-white px-4 py-3 rounded-lg disabled:opacity-50" disabled={busy}>
        {busy ? 'Requesting link…' : 'Resend verification email'}
      </button>
    </form>
    <p role="status">{message}</p>
    <Link href="/login" className="underline">Back to log in</Link>
  </AuthPanel>;
}
