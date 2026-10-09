'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LogOut } from 'lucide-react';

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div>
    <button aria-label="Log out on all devices" className={`rounded-xl bg-[#294333] text-white disabled:opacity-50 ${compact ? 'p-2' : 'px-5 py-3'}`} disabled={busy}
      onClick={async () => {
        setBusy(true); setError('');
        try { await logout(); }
        catch { setError('Unable to log out. Check your connection and retry.'); setBusy(false); }
      }}>{compact ? <LogOut size={16} /> : busy ? 'Logging out…' : 'Log out on all devices'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
