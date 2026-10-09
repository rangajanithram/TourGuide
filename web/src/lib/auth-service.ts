import type { SupabaseClient } from '@supabase/supabase-js';

/** Provider adapter: no local credential storage, fallback login, or identity linking. */
export function createAuthService(client: SupabaseClient, origin: string) {
  return {
    async login(email: string, password: string, captchaToken?: string) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } });
      if (error) throw error;
      if (!data.session || !data.user?.email_confirmed_at || data.user.is_anonymous) {
        await client.auth.signOut();
        throw { code: 'email_not_confirmed' };
      }
      return data.user;
    },
    async signup(name: string, email: string, password: string, captchaToken?: string) {
      const { data, error } = await client.auth.signUp({ email: email.trim(), password,
        options: { data: { name: name.trim() }, captchaToken, emailRedirectTo: `${origin}/auth/confirm` } });
      if (error && error.code !== 'user_already_exists') throw error;
      // Required verification is a provider setting. Detect accidental disablement.
      if (data.session) {
        await client.auth.signOut();
        throw { code: 'verification_configuration' };
      }
      return { requiresEmailVerification: true, user: null };
    },
    async google() {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google',
        options: { redirectTo: `${origin}/auth/callback` } });
      if (error) throw error;
    },
    async recover(email: string, captchaToken?: string) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/confirm`, captchaToken,
      });
      if (error && error.code !== 'user_not_found') throw error;
    },
    async logout() {
      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) throw error;
    },
  };
}
