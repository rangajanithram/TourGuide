'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import {getBrowserSupabase, isSupabaseConfigured} from '@/lib/supabase';
import {createVisitService, type TripVisits} from '@/lib/trip-visits';
import {watchTrip, type TripConnection} from '@/lib/trip-realtime';

export function useTripVisits(tripId?: string, planVersion?: number, variant?: string) {
 const {user} = useAuth();
 const userId = user?.id;
 const client = useMemo(() => isSupabaseConfigured ? getBrowserSupabase() : null, []);
 const service = useMemo(() => client ? createVisitService(client) : null, [client]);
 const [snapshot, setSnapshot] = useState<{scope: string; value: TripVisits} | null>(null);
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const [connection, setConnection] = useState<TripConnection>('connecting');
 const scope = `${userId}:${tripId}:${planVersion}:${variant}`;
 const scopeRef = useRef(scope); scopeRef.current = scope;
 const generation = useRef(0), pending = useRef(false), reading = useRef(false), writing = useRef(false);
 const invalidate = useCallback(() => {generation.current++;}, []);
 const refreshRef = useRef<() => void>(() => {});
 const load = useCallback(async () => {
  if (!service || !tripId || !userId) return;
  if (reading.current || writing.current) {pending.current = true; return;}
  const current = generation.current;
  reading.current = true; pending.current = false;
  try {
   const value = await service(tripId);
   if (generation.current !== current || scopeRef.current !== scope) return;
   setSnapshot({scope, value}); setError('');
  } catch (e) {
   if (generation.current === current && scopeRef.current === scope) {setSnapshot(null); setError((e as Error).message);}
  } finally {
   if (generation.current === current) {reading.current = false; if (pending.current) refreshRef.current();}
  }
 }, [service, tripId, userId, scope]);
 useEffect(() => {refreshRef.current = () => {void load();};}, [load]);
 useEffect(() => {
  invalidate(); reading.current = false; writing.current = false; pending.current = false;
  setSnapshot(null); setError(''); setBusy(false);
  if (!client || !tripId || !userId) return;
  const stop = watchTrip(client, tripId, () => {void load();}, setConnection);
  return () => {invalidate(); stop();};
 }, [client, tripId, userId, load, invalidate]);
 const data = snapshot?.scope === scope ? snapshot.value : null;
 const matches = !!data && (planVersion == null || data.plan_version === planVersion) && (!variant || data.variant === variant);
 async function toggle(day: number, index: number) {
  const stop = data?.stops.find(s => s.day === day && s.index === index);
  if (!service || !tripId || !stop || !matches || writing.current) return;
  const current = ++generation.current;
  writing.current = true; reading.current = false; setBusy(true);
  try {
   const value = await service(tripId, stop, data.plan_version);
   if (current === generation.current && scopeRef.current === scope) {setSnapshot({scope, value}); setError('');}
  } catch (e) {
   if (current === generation.current && scopeRef.current === scope) {setError((e as Error).message); pending.current = true;}
  } finally {
   if (current === generation.current) {writing.current = false; setBusy(false); if (pending.current) refreshRef.current();}
  }
 }
 return {data, busy, ready: matches, connection,
  error: error || (data && !matches ? 'The saved plan changed. Reopen the latest saved trip to use its visit checks.' : ''),
  refresh: () => {void load();}, toggle};
}
export type TripVisitProgress = ReturnType<typeof useTripVisits>;
