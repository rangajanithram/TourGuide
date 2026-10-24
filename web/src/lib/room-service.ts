import type {SupabaseClient} from '@supabase/supabase-js';
import type {TripExpenseLedger} from '@/types/trip';
import {parseExpenseLedger} from './expense-entry';
import {readSharedPlan,type SharedPlan} from './shared-plan';
export type Room = {trip_id:string;user_id:string;enabled:boolean;include_stay:boolean;plan_data:SharedPlan;plan_version:number;ledger:TripExpenseLedger;revision:number;updated_at:string;members:{user_id:string;name:string;joined_at:string}[]};
export class RoomError extends Error { constructor(message:string,public code='ROOM_ERROR'){super(message);} }
export function roomError(error:{message?:string;code?:string}) {
  if(error.code==='40001')return new RoomError('Someone updated the room. Your draft is kept. Check the latest details and try again.','CONFLICT');
  if(error.code==='42883'||error.code==='PGRST202'||error.code==='42P01')return new RoomError('Trip rooms need the latest database update. Your saved trip is safe.','NOT_CONFIGURED');
  return new RoomError(error.message||'The room could not be reached. Check your connection and retry.',error.code);
}
export function parseRoom(value:unknown):Room {
 const r=value as Room;
 if(!r||typeof r.trip_id!=='string'||typeof r.user_id!=='string'||!Number.isInteger(r.revision)||r.revision<1||!Array.isArray(r.members)||typeof r.enabled!=='boolean')throw new RoomError('This room response could not be read.');
 return {...r,plan_data:readSharedPlan(JSON.stringify(r.plan_data)),ledger:parseExpenseLedger(JSON.stringify(r.ledger))};
}
export function createRoomService(client:Pick<SupabaseClient,'rpc'|'from'>){
 async function raw(tripId:string,action:string,data:Record<string,unknown>={},revision?:number){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId))throw new RoomError('This room link has an invalid trip ID.');
  const {data:result,error}=await client.rpc('trip_room_command',{p_trip_id:tripId,p_action:action,p_data:data,p_expected_version:revision??null}).abortSignal(AbortSignal.timeout(15000));
  if(error)throw roomError(error);return result;
 }
 return {
  async command(tripId:string,action:string,data:Record<string,unknown>={},revision?:number){return parseRoom(await raw(tripId,action,data,revision));},
  async invite(tripId:string){const result=await raw(tripId,'invite');if(!result||!/^[0-9a-f]{64}$/.test(result.token))throw new RoomError('An invitation could not be created.');return result as {token:string;expires_at:string};},
  async list(){const {data,error}=await client.from('trip_rooms').select('trip_id,plan_data,updated_at,enabled,user_id').order('updated_at',{ascending:false}).limit(50).abortSignal(AbortSignal.timeout(15000));if(error)throw roomError(error);return data as {trip_id:string;plan_data:SharedPlan;updated_at:string;enabled:boolean;user_id:string}[];},
  async ownedTrip(tripId:string){const {data,error}=await client.from('saved_trips').select('id,title').eq('id',tripId).abortSignal(AbortSignal.timeout(15000)).maybeSingle();if(error)throw roomError(error);return data as {id:string;title:string}|null;}
 };
}
export function roomReturnPath(value:string|null){return value&&/^\/rooms\?trip=[0-9a-f-]{36}(?:#invite=[0-9a-f]{64})?$/i.test(value)?value:null;}
