import type {SupabaseClient} from '@supabase/supabase-js';

export type TripConnection = 'connecting' | 'live' | 'reconnecting';
/** Events only invalidate data. Callers must read through their authorized RPC. */
export function watchTrip(client: Pick<SupabaseClient, 'channel' | 'removeChannel'>,
 tripId: string, refresh: () => void, status: (value: TripConnection) => void) {
 let active = true;
 let live = false;
 let lastRefresh = 0;
 const update = () => {
  if (active && document.visibilityState === 'visible') {lastRefresh = Date.now(); refresh();}
 };
 status('connecting');
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {update(); return () => {active = false;};}
 const channel = client.channel(`trip:${tripId}:${crypto.randomUUID()}`);
 for (const table of ['trip_rooms', 'trip_stop_visits']) {
  // DELETE cannot be filtered by trip ID. Never subscribe to it or to '*'.
  for (const event of ['INSERT', 'UPDATE'] as const) {
   channel.on('postgres_changes', {event, schema: 'public', table, filter: `trip_id=eq.${tripId}`}, update);
  }
 }
 channel.subscribe(value => {
  if (!active) return;
  live = value === 'SUBSCRIBED';
  status(live ? 'live' : 'reconnecting');
  if (live) update(); // Catch changes between the initial read and subscription.
 });
 const timer = setInterval(() => {
  // Access changes/deletions may prevent delivery under RLS. Periodically
  // revalidate access even when connected; reconnecting uses a shorter fallback.
  if (Date.now() - lastRefresh >= (live ? 30000 : 10000)) update();
 }, 10000);
 window.addEventListener('focus', update);
 document.addEventListener('visibilitychange', update);
 update();
 return () => {
  active = false;
  clearInterval(timer);
  window.removeEventListener('focus', update);
  document.removeEventListener('visibilitychange', update);
  void client.removeChannel(channel);
 };
}

export const tripConnectionLabel = (status: TripConnection) => status === 'live'
 ? 'Live updates connected'
 : 'Connecting to live updates; checking for changes every 10 seconds';
