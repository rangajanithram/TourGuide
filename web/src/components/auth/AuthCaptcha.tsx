'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

export default function AuthCaptcha({ onToken }: { onToken: (token: string) => void }) {
  const target = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const api = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!ready || !sitekey || !target.current || !api) return;
    const id = api.render(target.current, {
      sitekey,
      theme: 'light',
      callback: onToken,
      'expired-callback': () => onToken(''),
      'error-callback': () => { onToken(''); setFailed(true); },
    });
    return () => { api.remove(id); };
  }, [ready, sitekey, onToken]);

  if (!sitekey) return null;
  return <div>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
      onReady={() => setReady(true)} onError={() => setFailed(true)} />
    <div ref={target} />
    {failed && <p role="alert">Security check unavailable. Reload to retry.</p>}
  </div>;
}
