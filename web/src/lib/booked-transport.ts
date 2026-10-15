import type { TripFormData } from '../types/trip';
export function validateBookedTransport(form: TripFormData): void {
  const booking = form.booked_transport;
  if (!booking) return;
  if (!form.journey_timing) throw new Error('Add outbound and return travel timing for your booked journeys.');
  if (booking.version !== 1 || !['train', 'bus', 'flight'].includes(booking.outbound_mode) || !['train', 'bus', 'flight'].includes(booking.return_mode)) throw new Error('Check booked travel modes.');
  if ([booking.total_fare_inr, booking.paid_inr].some(value => !Number.isSafeInteger(value) || value < 0 || value > 5000000) || booking.paid_inr > booking.total_fare_inr) throw new Error('Enter whole-group fares in whole rupees. Paid amount cannot exceed the total fare.');
}
