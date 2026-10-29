import type { ScheduledActivity } from '@/types/trip';
export function isUnassignedMeal(activity: ScheduledActivity): boolean {
  return !!activity.meal_type && !activity.meal_venue_id && (/arrange venue/i.test(activity.place_name) || /reserved meal time at base/i.test(activity.source_reference || ''));
}
function minute(value: string): number | null {
  const match=/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if(!match)return null;
  let hour=Number(match[1]);const min=Number(match[2]);
  if(min>59||(match[3]?hour<1||hour>12:hour>23))return null;
  if(match[3])hour=hour%12+(match[3].toUpperCase()==='PM'?12:0);
  return hour*60+min;
}
export function timeBetweenStops(previous: ScheduledActivity, next: ScheduledActivity): number | null {
  const end=minute(previous.end_time), start=minute(next.start_time);
  return end==null||start==null||start<end?null:start-end;
}
export function stopGapLabel(previous: ScheduledActivity, next: ScheduledActivity): string | null {
  const gap = timeBetweenStops(previous, next);
  if (gap == null || gap === 0) return null;
  const travel = next.travel_minutes_from_previous;
  if (travel == null || !Number.isInteger(travel) || travel < 0 || travel > gap) {
    return `${gap} min between stops · travel estimate unavailable`;
  }
  const free = gap - travel;
  return [`${travel} min estimated travel`, free > 0 ? `${free} min open time` : null].filter(Boolean).join(' · ');
}
