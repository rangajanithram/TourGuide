import type { TripFormData } from '../types/trip';

/** Deterministic, provider-free preflight. All travel times are user supplied. */
export function journeyWindow(form: Pick<TripFormData, 'journey_timing' | 'start_date' | 'end_date' | 'origin_city' | 'destination' | 'arrival_available_mins' | 'departure_deadline_mins'>) {
  let earliest = form.arrival_available_mins ?? 60;
  let latest = form.departure_deadline_mins ?? 720;
  const journey = form.journey_timing;
  if (!journey) return { earliest, latest };
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
  const ready = new Date(times[1] + (journey.arrival_buffer_minutes + (journey.arrival_transfer_minutes ?? 0)) * 60000 + 19800000).toISOString();
  const leave = new Date(times[2] - (journey.departure_buffer_minutes + (journey.departure_transfer_minutes ?? 0)) * 60000 + 19800000).toISOString();
  if (ready.slice(0,10) > form.start_date || leave.slice(0,10) < form.end_date) throw new Error('Sightseeing dates must fit between arrival plus buffer and departure minus buffer. Adjust dates or travel times.');
  const minute = (value: string) => Number(value.slice(11,13)) * 60 + Number(value.slice(14,16)) - 480;
  if (ready.slice(0,10) === form.start_date) earliest = Math.max(earliest, minute(ready));
  if (leave.slice(0,10) === form.end_date) latest = Math.min(latest, minute(leave));
  if (earliest >= 720 || latest <= 0 || (form.start_date === form.end_date && earliest >= latest)) throw new Error('Travel timing leaves no sightseeing time in the 08:00–20:00 planning window.');
  return { earliest, latest };
}
