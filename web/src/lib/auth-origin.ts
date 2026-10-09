/** Use the configured deployment origin, and preserve localhost aliases in dev. */
export function authOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== 'production') {
    const host = request.headers.get('host');
    if (host) {
      try {
        const local = new URL(`${url.protocol}//${host}`);
        if (['localhost', '127.0.0.1', '[::1]'].includes(local.hostname)) return local.origin;
      } catch { /* Use the request's parsed origin. */ }
    }
  }
  return url.origin;
}
