'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/auth-policy';
import { Lock, ArrowRight, CheckCircle2, AlertCircle, Compass } from 'lucide-react';
import '@/components/guide/account.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const pending = useRef(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    setErrorMessage('');
    setSuccessMessage('');

    if (password.length < 12 || password.length > 128) {
      setErrorMessage('Use 12 to 128 characters. A unique passphrase works well.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    pending.current = true;
    setIsSubmitting(true);
    try {
      const { error } = await getBrowserSupabase().auth.updateUser({ password });
      if (error) throw error;

      const result = await getBrowserSupabase().auth.signOut({ scope: 'global' });
      if (result.error) { setSuccessMessage('Password updated. Logout failed; retry logout from your account.'); return; }
      router.replace('/login?message=password_updated'); router.refresh();
    } catch (err: unknown) {
      const msg = authErrorMessage(err);
      setErrorMessage(msg);
    } finally {
      pending.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="account-page flex items-center justify-center min-h-screen py-12">
      <div className="max-w-md w-full bg-[#fffdf5] border border-[#dce0ce] rounded-2xl p-8 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center">
            <Compass size={20} />
          </div>
          <span className="font-bold text-lg text-slate-800">TripWeave Security</span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Create New Password</h1>
        <p className="text-xs text-slate-600 mb-6">
          Please enter a strong password for your TripWeave account.
        </p>

        {errorMessage && (
          <div className="account-error-banner mb-4" role="alert">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="account-success-banner mb-4" role="status">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-700">
            New Password
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 12 characters"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              disabled={isSubmitting}
              className="mt-1 w-full p-2.5 rounded-lg border border-slate-300 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-700">
            Confirm New Password
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              disabled={isSubmitting}
              className="mt-1 w-full p-2.5 rounded-lg border border-slate-300 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>

          <button type="button" className="underline text-sm text-[#294333]" onClick={() => setShowPassword(value => !value)}>
            {showPassword ? 'Hide passwords' : 'Show passwords'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#294333] hover:bg-[#1d3024] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
          >
            {isSubmitting ? (
              'Updating password...'
            ) : (
              <>
                <Lock size={16} /> Update Password <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          <Link href="/login" className="hover:underline text-slate-700 font-semibold">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
