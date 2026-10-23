import type { TripPlan } from '../types/trip';

export function expenseBudgets(plan: TripPlan) {
  let dining = 0, activities = 0;
  for (const day of plan.days) for (const stop of day.activities) {
    if (stop.place_type === 'restaurant' || stop.meal_type) dining += stop.estimated_cost_inr;
    else activities += stop.estimated_cost_inr;
  }
  const lodging = plan.hotel_summary?.total_cost_inr ?? 0;
  const transit = plan.estimated_transport_cost_inr ?? 0;
  return { dining, activities, lodging, transit, total:plan.total_cost_inr ?? lodging + transit + activities + dining };
}
