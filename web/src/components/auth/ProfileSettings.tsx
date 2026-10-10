'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getBrowserSupabase } from '@/lib/supabase';
import { travelPreferences } from '@/lib/travel-preferences';
import InfoTip from '@/components/InfoTip';
export default function ProfileSettings({ initialName, preferences }: { initialName: string; preferences: unknown }) {
  const [name, setName] = useState(initialName);
  const [values, setValues] = useState(travelPreferences(preferences));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const pending = useRef(false); const { refreshUser } = useAuth();
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending.current) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) { setMessage('Enter a name between 1 and 80 characters.'); return; }
    pending.current = true; setBusy(true); setMessage('');
    try {
      const { error } = await getBrowserSupabase().auth.updateUser({ data: { name: cleanName, travel_preferences: values } });
      if (error) throw error;
      await refreshUser(); setMessage('Saved. Your preferences will be used for new trips.');
    } catch { setMessage('Could not save your settings. Check your connection or sign in again. Your changes are still here.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={save} className="profile-settings">
    <h2>Make it your journey</h2>
    <label htmlFor="profile-name">Display name</label><input id="profile-name" autoComplete="name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} />
    <div className="flex items-center gap-2"><h3>New trip defaults</h3><InfoTip title="Trip defaults">These choices are saved to your account and prefilled for new trips. You can change them in the planner. Shared trip links keep their own choices.</InfoTip></div>
    <label htmlFor="profile-pace">Your pace</label><select id="profile-pace" value={values.pace} onChange={e => setValues(v => ({ ...v, pace: e.target.value as typeof v.pace }))}><option value="relaxed">Relaxed · up to 2 visits/day</option><option value="balanced">Balanced · up to 3 visits/day</option><option value="intensive">Intensive · up to 4 visits/day</option></select>
    <label htmlFor="profile-transport">Local transport</label><select id="profile-transport" value={values.transport_mode} onChange={e => setValues(v => ({ ...v, transport_mode: e.target.value as typeof v.transport_mode }))}>{['cab', 'auto', 'metro', 'walk'].map(value => <option key={value} value={value}>{value === 'walk' ? 'Walking' : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select>
    <label htmlFor="profile-group">Travel group</label><select id="profile-group" value={values.group_profile} onChange={e => setValues(v => ({ ...v, group_profile: e.target.value as typeof v.group_profile }))}><option value="default">General group</option><option value="young_solo">Solo explorer</option><option value="family">Family with children</option><option value="elderly">Senior travelers</option></select>
    <button className="profile-save" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}</button><p role="status" aria-live="polite">{message}</p>
  </form>;
}
