import type { TripFormData } from '../types/trip';

export function validateJourneyBudget(form: TripFormData): number {
  const cap = form.whole_journey_budget_inr;
  if (cap == null) return form.budget_inr;
  if (!Number.isInteger(cap) || cap <= 0 || cap > 5_000_000) throw new Error('Enter a combined cost cap between ₹1 and ₹50,00,000.');
  if (form.origin_city && form.origin_city.toLowerCase() !== form.destination.toLowerCase() && !form.booked_transport) {
    throw new Error('Enter booked roundtrip tickets before setting a combined cost cap.');
  }
  const prepaid = form.stay_choice?.budget_treatment === 'already_paid' ? form.stay_choice.total_stay_cost_inr : 0;
  const timing = form.journey_timing;
  const transfers = (timing?.arrival_transfer_cost_inr ?? 0) + (timing?.departure_transfer_cost_inr ?? 0);
  const available = Math.min(form.budget_inr, cap - (form.booked_transport?.total_fare_inr ?? 0) - prepaid - transfers);
  if (available <= 0) throw new Error('Tickets, transfers and prepaid stay leave no destination budget. Increase the combined cap or reduce confirmed costs.');
  return available;
}
