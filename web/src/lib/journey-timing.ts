import type { TripFormData } from '../types/trip';

type TimingForm = Pick<TripFormData, 'journey_timing' | 'start_date' | 'end_date' | 'origin_city' | 'destination' | 'arrival_available_mins' | 'departure_deadline_mins'> & Pick<Partial<TripFormData>, 'stay_choice'>;

/** Deterministic, provider-free preflight. All travel times are user supplied. */
export function journeyWindow(form: TimingForm) {
  const journey = form.journey_timing;
  if (!journey) return windowBounds(form);
  if (journey.version !== 1 || journey.timezone !== 'Asia/Kolkata') throw new Error('Unsupported journey timing version or timezone.');
  if (!form.origin_city || form.origin_city.trim().toLowerCase() === form.destination.trim().toLowerCase()) throw new Error('Choose a different origin city for travel timing.');
  const keys = ['outbound_departure', 'destination_arrival', 'destination_departure', 'return_arrival'] as const;
  const times = keys.map(key => {
    const value = journey[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?\+05:30$/.test(value)) throw new Error('Enter all four travel times in India time.');
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || new Date(ms + 19800000).toISOString().slice(0,16) !== value.slice(0,16)) throw new Error('Enter valid travel dates and times.');
    return ms;
  });
  if (times.some((ms, i) => i > 0 && ms <= times[i-1])) throw new Error('Travel times must follow departure, destination arrival, destination departure, then return arrival.');
  if (times[3] - times[0] > 30 * 86400000) throw new Error('Travel timing can cover at most 30 days.');
  for (const value of [journey.arrival_buffer_minutes, journey.departure_buffer_minutes, journey.arrival_transfer_minutes ?? 0, journey.departure_transfer_minutes ?? 0]) {
    if (!Number.isInteger(value) || value < 0 || value > 720) throw new Error('Enter transfer buffers between 0 and 720 minutes.');
  }
  if (journey.arrival_transfer_cost_inr != null) {
    if (!Number.isInteger(journey.arrival_transfer_cost_inr) || journey.arrival_transfer_cost_inr < 0 || journey.arrival_transfer_cost_inr > 500000) {
      throw new Error('Enter an arrival transfer cost between ₹0 and ₹5,00,000.');
    }
  }
  if (journey.arrival_transfer_paid_inr != null) {
    if (journey.arrival_transfer_cost_inr == null && journey.arrival_transfer_paid_inr > 0) {
      throw new Error('Paid arrival transfer amount requires an arrival transfer cost estimate.');
    }
    if (!Number.isInteger(journey.arrival_transfer_paid_inr) || journey.arrival_transfer_paid_inr < 0 || (journey.arrival_transfer_cost_inr != null && journey.arrival_transfer_paid_inr > journey.arrival_transfer_cost_inr)) {
      throw new Error('Paid arrival transfer amount cannot exceed the whole-group arrival transfer fare.');
    }
  }
  if (journey.departure_transfer_cost_inr != null) {
    if (!Number.isInteger(journey.departure_transfer_cost_inr) || journey.departure_transfer_cost_inr < 0 || journey.departure_transfer_cost_inr > 500000) {
      throw new Error('Enter a departure transfer cost between ₹0 and ₹5,00,000.');
    }
  }
  if (journey.departure_transfer_paid_inr != null) {
    if (journey.departure_transfer_cost_inr == null && journey.departure_transfer_paid_inr > 0) {
      throw new Error('Paid departure transfer amount requires a departure transfer cost estimate.');
    }
    if (!Number.isInteger(journey.departure_transfer_paid_inr) || journey.departure_transfer_paid_inr < 0 || (journey.departure_transfer_cost_inr != null && journey.departure_transfer_paid_inr > journey.departure_transfer_cost_inr)) {
      throw new Error('Paid departure transfer amount cannot exceed the whole-group departure transfer fare.');
    }
  }
  return windowBounds(form);
}

function windowBounds(form: TimingForm) {
  const days = calendarWindows(form);
  return {earliest: days[0].end ? days[0].start : form.arrival_available_mins ?? 60,
    latest: days[days.length - 1].end || (form.departure_deadline_mins ?? 720)};
}

function calendarWindows(form: TimingForm) {
  const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0,10) === v;
  if (!validDate(form.start_date) || !validDate(form.end_date)) throw new Error('Choose valid first and last trip dates.');
  const count = (Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000 + 1;
  if (count < 1 || count > 14) throw new Error('Choose trip dates in order, up to 14 days.');
  const j = form.journey_timing, s = form.stay_choice;
  if (j && (j.destination_arrival.slice(0,10) > form.start_date || j.destination_departure.slice(0,10) < form.end_date)) throw new Error('Trip dates must be between your destination arrival and departure dates. Adjust the first or last trip date.');
  const ready = j ? Date.parse(j.destination_arrival) + ((j.arrival_transfer_minutes ?? 0) + j.arrival_buffer_minutes) * 60000 : null;
  const leave = j ? Date.parse(j.destination_departure) - ((j.departure_transfer_minutes ?? 0) + j.departure_buffer_minutes) * 60000 : null;
  if (!!s?.check_in_date !== !!s?.check_out_date) throw new Error('Enter both check-in and check-out dates, or leave both blank.');
  if (s?.check_in_date && s.check_out_date) {
    if (!validDate(s.check_in_date) || !validDate(s.check_out_date) || s.check_out_date < s.check_in_date || Date.parse(s.check_out_date) - Date.parse(s.check_in_date) > 30 * 86400000) throw new Error('Booked stay dates must be in order and span at most 30 nights.');
    if (s.check_in_date > (j?.destination_arrival.slice(0,10) ?? form.start_date) || s.check_out_date < (j?.destination_departure.slice(0,10) ?? form.end_date)) throw new Error('Your booked stay dates do not cover the destination nights. Correct the stay dates or arrange the missing nights.');
  }
  const offsets = [s?.check_in_buffer_minutes ?? 0, s?.check_out_buffer_minutes ?? 0];
  if (offsets.some(v => !Number.isInteger(v) || v < 0 || v > 180)) throw new Error('Use 0 to 180 minutes for check-in and check-out buffers.');
  let roomReady = s?.constrain_sightseeing_to_stay && s.check_in_time ? Date.parse(`${s.check_in_date || form.start_date}T${s.check_in_time}:00+05:30`) : null;
  if (roomReady != null) roomReady = Math.max(roomReady, ready ?? roomReady) + offsets[0] * 60000;
  let checkout = s?.constrain_sightseeing_to_stay && s.check_out_time ? Date.parse(`${s.check_out_date || form.end_date}T${s.check_out_time}:00+05:30`) : null;
  if (checkout != null) checkout = Math.min(checkout, leave ?? checkout) - offsets[1] * 60000;
  const days = Array.from({length: count}, (_, i) => {
    const date = new Date(Date.parse(form.start_date) + i * 86400000).toISOString().slice(0,10);
    const base = Date.parse(`${date}T08:00:00+05:30`);
    let start = i === 0 ? form.arrival_available_mins ?? 60 : 60;
    let end = i === count - 1 ? form.departure_deadline_mins ?? 720 : 720;
    for (const lower of [ready, roomReady]) if (lower != null) start = Math.max(start, (lower - base) / 60000);
    for (const upper of [leave, checkout]) if (upper != null) end = Math.min(end, (upper - base) / 60000);
    start = Math.max(0, start); end = Math.min(720, end);
    return {date, start: start < end ? start : 0, end: start < end ? end : 0};
  });
  if (!days.some(d => d.end > d.start)) throw new Error('Travel and stay timing leaves no sightseeing time. Change the trip dates, travel times or luggage arrangements.');
  return days;
}

export function planningWindows(form: TimingForm) {
  journeyWindow(form); // Validate all travel times, chronology, fares and buffers.
  return calendarWindows(form);
}
