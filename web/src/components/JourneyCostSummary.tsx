import type { TripPlan } from '../types/trip';
import { journeyCosts, journeyCostCaveat } from '../lib/journey-costs';

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export default function JourneyCostSummary({ plan }: { plan: TripPlan }) {
  const costs = journeyCosts(plan);
  return (
    <section aria-label="Combined journey costs" className="rounded-2xl border border-[#c6d2c0] bg-[#fffdf5] p-5 sm:p-6">
      <h3 className="text-xl font-bold text-[#243e33]">Your journey costs, together</h3>
      {plan.planning_preferences?.whole_journey_budget_inr != null && <p className="mt-2 font-semibold">Combined counted cost cap: {rupees(plan.planning_preferences.whole_journey_budget_inr)} · {costs.total <= plan.planning_preferences.whole_journey_budget_inr ? 'Within cap' : 'Over cap'}</p>}
      <p className="mt-2 max-w-2xl text-sm text-[#526653]">Whole-group amounts. Destination costs include counted lodging, local travel and scheduled stops.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <dl className="space-y-3 text-base">
          <div className="flex flex-wrap justify-between gap-2"><dt>Destination estimate</dt><dd className="font-semibold">{rupees(costs.destination)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Booked roundtrip tickets</dt><dd className="font-semibold">{costs.hasBookedTickets ? rupees(costs.tickets) : 'Not included'}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Prepaid stay excluded from destination</dt><dd className="font-semibold">{rupees(costs.prepaidStay)}</dd></div>
          {costs.hasTransfers && (
            <div className="flex flex-wrap justify-between gap-2"><dt>Terminal transfers (outside local sightseeing)</dt><dd className="font-semibold">{rupees(costs.transfersCost)}</dd></div>
          )}
        </dl>
        <dl className="space-y-3 rounded-xl bg-[#edf1e6] p-4 text-base">
          <div className="flex flex-wrap justify-between gap-2"><dt>Counted journey total</dt><dd className="text-xl font-bold">{rupees(costs.total)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Reported already paid</dt><dd className="font-semibold">{rupees(costs.paid)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-[#c6d2c0] pt-3"><dt>Estimated amount still to cover</dt><dd className="text-xl font-bold">{rupees(costs.remaining)}</dd></div>
        </dl>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#526653]">{journeyCostCaveat}</p>
    </section>
  );
}
