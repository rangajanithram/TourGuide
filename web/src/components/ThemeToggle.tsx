'use client';
import { Moon, Sun } from 'lucide-react';
import { useSiteTheme } from './SiteTheme';

export default function ThemeToggle() {
  const { dark, toggle } = useSiteTheme();
  const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
  return <button type="button" className="site-theme-toggle" onClick={toggle} aria-label={label} title={label}>
    {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
  </button>;
}
