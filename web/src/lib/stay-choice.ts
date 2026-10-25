import type { StayChoice } from '../types/trip';

export function validateStayChoice(stay: StayChoice | undefined, budget: number): void {
  if (stay === undefined || stay === null) return;
  if (stay.version !== 1 || !['booked', 'family_friends', 'no_stay'].includes(stay.kind)) throw new Error('Unsupported accommodation choice.');
  if (typeof stay.base_name !== 'string' || !stay.base_name.trim() || stay.base_name.length > 160) throw new Error('Enter a name for your daily base.');
  if (!Number.isFinite(stay.lat) || Math.abs(stay.lat) > 90 || !Number.isFinite(stay.lng) || Math.abs(stay.lng) > 180) throw new Error('Confirm valid latitude and longitude for your daily base.');
  if (!Number.isSafeInteger(stay.total_stay_cost_inr) || stay.total_stay_cost_inr < 0 || stay.total_stay_cost_inr > 5000000) throw new Error('Enter a whole-group stay cost between ₹0 and ₹50,00,000.');
  if (!['include', 'already_paid'].includes(stay.budget_treatment)) throw new Error('Choose how the stay cost counts toward your budget.');
  if (stay.kind !== 'booked' && (stay.total_stay_cost_inr !== 0 || stay.budget_treatment !== 'include')) throw new Error('Only booked stays can have a lodging cost or prepaid treatment.');
  if (stay.budget_treatment === 'include' && stay.total_stay_cost_inr >= budget) throw new Error('Your booked stay uses the entire destination budget. Increase the budget or correct the stay cost.');
  if (stay.constrain_sightseeing_to_stay !== undefined && typeof stay.constrain_sightseeing_to_stay !== 'boolean') throw new Error('Choose whether to constrain sightseeing to your stay.');
  if (stay.constrain_sightseeing_to_stay && (stay.kind !== 'booked' || !stay.check_in_time || !stay.check_out_time)) throw new Error('Stay scheduling requires a booked stay and confirmed check-in and check-out times.');
  if (stay.allows_bag_drop != null && typeof stay.allows_bag_drop !== 'boolean') throw new Error('Confirm luggage storage as available or unavailable, or leave it unknown.');
  if (stay.check_in_time !== undefined && stay.check_in_time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(stay.check_in_time)) throw new Error('Check-in time must be in HH:MM format.');
  if (stay.check_out_time !== undefined && stay.check_out_time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(stay.check_out_time)) throw new Error('Check-out time must be in HH:MM format.');
  if (!!stay.check_in_date !== !!stay.check_out_date) throw new Error('Enter both check-in and check-out dates, or leave both blank.');
  if (stay.check_in_date && stay.check_out_date) {
    const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0,10) === v;
    if (stay.kind !== 'booked' || !valid(stay.check_in_date) || !valid(stay.check_out_date) || stay.check_out_date < stay.check_in_date || Date.parse(stay.check_out_date) - Date.parse(stay.check_in_date) > 30 * 86400000) throw new Error('Booked stay dates must be in order and span at most 30 nights.');
  }
  if ([stay.check_in_buffer_minutes ?? 0, stay.check_out_buffer_minutes ?? 0].some(v => !Number.isInteger(v) || v < 0 || v > 180)) throw new Error('Use 0 to 180 minutes for check-in and check-out buffers.');
}
