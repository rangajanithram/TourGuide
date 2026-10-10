import { getBrowserSupabase } from './supabase';
import { boundedFetch, requireApiSuccess } from './planner-network';

// The API independently verifies this token; browser state is never authorization.
export async function plannerFetch(input: string, init: RequestInit = {}) {
  const { data, error } = await getBrowserSupabase().auth.getSession();
  if (error || !data.session) throw new Error('Your session has expired. Please sign in again.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const response = await boundedFetch(input, { ...init, headers });
  if (response.status === 401) {
    window.location.assign('/login?error=session_expired');
    throw new Error('Please sign in again to continue planning.');
  }
  await requireApiSuccess(response);
  return response;
}
