/** Shared transport for planner requests. Never retry a costly POST automatically. */
export function apiBaseUrl(value = process.env.NEXT_PUBLIC_API_URL, environment = process.env.NODE_ENV): string {
  const configured = value?.trim() || (environment === 'production' ? '' : 'http://127.0.0.1:8000');
  if (!configured) throw new Error('The planning service is not configured. Please contact the site owner.');
  let url: URL;
  try { url = new URL(configured); }
  catch { throw new Error('The planning service address is invalid. Please contact the site owner.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('The planning service address is invalid. Please contact the site owner.');
  }
  if (environment === 'production' && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('The planning service needs a public HTTPS address. Please contact the site owner.');
  }
  return url.href.replace(/\/$/, '');
}

export async function boundedFetch(input: string, init: RequestInit = {}, timeoutMs = 120_000): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) cancel();
  else init.signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal, cache: 'no-store' });
    // Keep the deadline active through body delivery, not just response headers.
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (timedOut) throw new Error('The planning service took too long to respond. Your existing trip is unchanged. Please try again.');
    throw new Error('Could not reach the planning service. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}

export async function requireApiSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 429 || response.status === 503) {
    const seconds = Number(response.headers.get('Retry-After'));
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Try again in ${Math.ceil(seconds)} seconds.` : ' Please try again shortly.';
    throw new Error((response.status === 429 ? 'You have made several requests recently.' : 'The planning service is temporarily unavailable.') + wait);
  }
  if (response.status >= 500) throw new Error('The planning service could not complete this request. Your existing trip is unchanged. Please try again.');
  const data = await response.json().catch(() => ({}));
  const detail = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail)
    ? data.detail.map((item: { msg?: string }) => item.msg || 'Check your trip details.').join(' ')
    : 'Could not complete this request. Check your trip details and try again.';
  throw new Error(detail);
}

export async function checkPlannerReadiness(signal: AbortSignal): Promise<void> {
  const response = await boundedFetch(`${apiBaseUrl()}/ready`, { signal }, 90_000);
  await requireApiSuccess(response);
  const data = await response.json();
  if (data.status !== 'ready') throw new Error('The planning service is not ready. Please try again shortly.');
}
