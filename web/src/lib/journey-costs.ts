import type { TripPlan } from '../types/trip';

/** Derived accounting only: no new prices, payment verification or spending cap. */
export function journeyCosts(plan: TripPlan) {
  const destination = plan.total_cost_inr;
  const tickets = plan.booked_transport?.total_fare_inr ?? 0;
  const ticketsPaid = plan.booked_transport?.paid_inr ?? 0;
  // Counted lodging is already in destination. Only excluded prepaid lodging is added.
  const prepaidStay = plan.hotel_summary?.excluded_prepaid_cost_inr ?? 0;
  const total = destination + tickets + prepaidStay;
  const paid = ticketsPaid + prepaidStay;
  return {
    destination, tickets, prepaidStay, total, paid,
    remaining: total - paid,
    hasBookedTickets: Boolean(plan.booked_transport),
  };
}

export const journeyCostCaveat = 'Partial estimate, not a complete journey quote. Any combined cap covers counted costs only. Unbooked tickets, unarranged stays, transfers outside the itinerary, uncounted meals, taxes and personal spending are not included. Payments are user-reported, not verified.';
