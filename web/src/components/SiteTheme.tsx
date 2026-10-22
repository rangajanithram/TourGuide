'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext({ dark: false, toggle: () => {} });
const storageKey = 'tripweave-theme';

export const useSiteTheme = () => useContext(ThemeContext);

export default function SiteTheme({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    sync();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(storageKey); } catch { /* Storage can be disabled. */ }
      if (saved !== 'light' && saved !== 'dark') {
        document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
        sync();
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const saved = event.newValue;
      document.documentElement.dataset.theme = saved === 'dark' || saved !== 'light' && media.matches ? 'dark' : 'light';
      sync();
    };
    media.addEventListener('change', followSystem);
    window.addEventListener('storage', storageChanged);
    return () => {
      media.removeEventListener('change', followSystem);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);
  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Theme still works for this visit. */ }
  }, []);
  const dark = theme === 'dark';
  return <ThemeContext.Provider value={{ dark, toggle }}>
    {children}
    <button type="button" className="site-theme-toggle" onClick={toggle} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={`Switch to ${dark ? 'light' : 'dark'} mode`}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      <span>{dark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  </ThemeContext.Provider>;
}
