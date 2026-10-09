'use client';
import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { createAuthService } from '@/lib/auth-service';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/lib/auth';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
function profile(user: User): UserProfile {
  return { id: user.id, email: user.email || '', name: typeof user.user_metadata.name === 'string' ? user.user_metadata.name : 'Traveler',
    auth_provider: user.app_metadata.provider === 'google' ? 'google' : 'local', created_at: user.created_at };
}
function useAuthState() {
  const router = useRouter();
  const revision = useRef(0);
  const mounted = useRef(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setLoading] = useState(true);
  const refreshUser = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const current = revision.current;
    try {
      const { data, error } = await getBrowserSupabase().auth.getUser();
      if (!mounted.current || current !== revision.current) return;
      setUser(!error && data.user?.email_confirmed_at ? profile(data.user) : null);
      setLoading(false);
    } catch {
      if (!mounted.current || current !== revision.current) return;
      setUser(null); setLoading(false);
    }
  }, []);
  useEffect(() => {
    try { ['tripweave_session_token', 'tripweave_user_profile', 'tripweave_google_client_id'].forEach(k => localStorage.removeItem(k)); } catch { /* Storage may be disabled. */ }
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true; mounted.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const { data: { subscription } } = getBrowserSupabase().auth.onAuthStateChange((event, session) => {
      revision.current += 1;
      if (event === 'SIGNED_OUT') router.refresh();
      if (!session) { setUser(null); setLoading(false); return; }
      // Leave the provider lock before calling another auth method.
      const timer = setTimeout(() => { timers.delete(timer); if (active) void refreshUser(); }, 0);
      timers.add(timer);
    });
    const focus = () => { void refreshUser(); };
    window.addEventListener('focus', focus);
    return () => { active = false; mounted.current = false; subscription.unsubscribe(); timers.forEach(clearTimeout); window.removeEventListener('focus', focus); };
  }, [refreshUser, router]);
  const login = useCallback(async (email: string, password: string, captchaToken?: string) => {
    const user = await createAuthService(getBrowserSupabase(), location.origin).login(email, password, captchaToken);
    revision.current += 1;
    const mapped = profile(user);
    setUser(mapped);
    return mapped;
  }, []);
  const signup = useCallback((name: string, email: string, password: string, captchaToken?: string) =>
    createAuthService(getBrowserSupabase(), location.origin).signup(name, email, password, captchaToken), []);
  const loginWithGoogle = useCallback(() => createAuthService(getBrowserSupabase(), location.origin).google(), []);
  const resetPassword = useCallback((email: string, captchaToken?: string) =>
    createAuthService(getBrowserSupabase(), location.origin).recover(email, captchaToken), []);
  const logout = useCallback(async () => {
    await createAuthService(getBrowserSupabase(), location.origin).logout();
    revision.current += 1; setUser(null); location.assign('/login');
  }, []);
  return useMemo(() => ({ user, isLoading, isSupabase: isSupabaseConfigured, login, signup, loginWithGoogle, resetPassword, logout, refreshUser }), [user, isLoading, login, signup, loginWithGoogle, resetPassword, logout, refreshUser]);
}
const AuthContext = createContext<ReturnType<typeof useAuthState> | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth requires AuthProvider'); return value; }
