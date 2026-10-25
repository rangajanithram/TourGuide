import type {SupabaseClient} from '@supabase/supabase-js';
import {roomError, RoomError} from './room-service';

export type VisitStop = {key: string; day: number; index: number; visited: boolean; revision: number; updated_at: string | null};
export type TripVisits = {trip_id: string; plan_version: number; variant: string; stops: VisitStop[]};
export function parseTripVisits(value: unknown): TripVisits {
 const r = value as TripVisits;
 if (!r || typeof r.trip_id !== 'string' || !Number.isInteger(r.plan_version) || r.plan_version < 1
  || !['budget', 'balanced', 'comfort'].includes(r.variant) || !Array.isArray(r.stops) || r.stops.length > 2000
  || r.stops.some(s => !s || !/^[a-f0-9]{64}$/.test(s.key) || !Number.isInteger(s.day) || s.day < 1
   || !Number.isInteger(s.index) || s.index < 0 || typeof s.visited !== 'boolean'
   || !Number.isInteger(s.revision) || s.revision < 0)) throw new RoomError('The shared visit checks could not be read.');
 return r;
}
export function createVisitService(client: Pick<SupabaseClient, 'rpc'>) {
 return async (tripId: string, stop?: VisitStop, planVersion?: number) => {
  const {data, error} = await client.rpc('trip_visit_command', {
   p_trip_id: tripId, p_action: stop ? 'set' : 'read',
   p_data: stop ? {key: stop.key, visited: !stop.visited, revision: stop.revision} : {},
   p_plan_version: planVersion ?? null,
  }).abortSignal(AbortSignal.timeout(15000));
  if (error) {
   const e = roomError(error);
   if (e.code === 'NOT_CONFIGURED') e.message = 'Shared visit checks need the latest database update. Your trip and personal records are safe.';
   throw e;
  }
  const result = parseTripVisits(data);
  if (result.trip_id !== tripId) throw new RoomError('The visit checks belong to a different trip.');
  return result;
 };
}
