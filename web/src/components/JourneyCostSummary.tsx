import type { TripPlan } from '../types/trip';
import { journeyCosts, journeyCostCaveat } from '../lib/journey-costs';

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export default function JourneyCostSummary({ plan }: { plan: TripPlan }) {
  const costs = journeyCosts(plan);
  return (
    <section aria-label="Combined journey costs" className="journey-cost-summary rounded-2xl border border-[#c6d2c0] bg-[#fffdf5] p-5 sm:p-6">
      <h3 className="text-xl font-bold text-[#243e33]">Your trip costs</h3>
      {plan.planning_preferences?.whole_journey_budget_inr != null && <p className="mt-2 font-semibold">Budget for included costs: {rupees(plan.planning_preferences.whole_journey_budget_inr)} · {costs.total <= plan.planning_preferences.whole_journey_budget_inr ? 'Within cap' : 'Over cap'}</p>}
      <p className="mt-2 max-w-2xl text-sm text-[#526653]">Costs for your whole group. Includes your stay, local travel and planned stops.</p>
      <div className="journey-cost-columns">
        <dl className="space-y-3 text-base">
          <div className="flex flex-wrap justify-between gap-2"><dt>Destination estimate</dt><dd className="font-semibold">{rupees(costs.destination)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Booked roundtrip tickets</dt><dd className="font-semibold">{costs.hasBookedTickets ? rupees(costs.tickets) : 'Not included'}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Stay paid for separately</dt><dd className="font-semibold">{rupees(costs.prepaidStay)}</dd></div>
          {costs.hasTransfers && (
            <div className="flex flex-wrap justify-between gap-2"><dt>Station / airport transfers</dt><dd className="font-semibold">{rupees(costs.transfersCost)}</dd></div>
          )}
        </dl>
        <dl className="space-y-3 rounded-xl bg-[#edf1e6] p-4 text-base">
          <div className="flex flex-wrap justify-between gap-2"><dt>Total included costs</dt><dd className="text-xl font-bold">{rupees(costs.total)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>You marked as paid</dt><dd className="font-semibold">{rupees(costs.paid)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-[#c6d2c0] pt-3"><dt>Left to pay (estimate)</dt><dd className="text-xl font-bold">{rupees(costs.remaining)}</dd></div>
        </dl>
      </div>
      <details className="cost-inclusions"><summary>What is not included?</summary><p>{journeyCostCaveat}</p></details>
    </section>
  );
}
