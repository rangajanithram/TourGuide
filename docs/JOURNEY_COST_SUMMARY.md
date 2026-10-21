# Combined journey cost summary — accounting increment

The result and text export derive a combined summary from the active itinerary.
No migration, external service or new persisted totals are needed. Reopened old
snapshots work, and edits/variant switches recalculate rather than retaining stale totals.

- Counted total = destination subtotal + booked roundtrip fare + excluded prepaid stay.
- Reported paid = booked-ticket paid amount + excluded prepaid stay.
- Still to cover = counted total minus reported paid.
- Lodging already inside the destination subtotal is never added again.
- Missing booked tickets are labelled not included, never a confirmed zero fare.
- Estimates exclude uncounted meals, taxes, transfers and personal spending.

## Optional combined counted-cost cap

`whole_journey_budget_inr` is now an optional integer cap in request and saved
planning preferences. It limits counted spending, including already-paid costs.
The existing destination cap remains a separate upper bound.

Available destination budget is the smaller of the destination cap and combined
cap minus the full booked ticket fare minus excluded prepaid lodging. Included
lodging stays inside destination costs. Intercity trips must supply booked fares
to enable this cap; exhausted caps return validation feedback.

Generation reserves these amounts before hotel/stop selection. Independent
verification checks both reported and recomputed totals; reconstructed edit and
rebalance requests retain the cap through planning preferences. Saved-request
validation rejects cap mismatches and overspend. Old snapshots omit the field.

This is not a complete journey quote: uncounted meals, transfers, unarranged stays,
taxes and personal expenses still need budgeting. Production end-to-end acceptance
remains necessary after deployment.

## Local verification — 21 October 2026

TypeScript typecheck, ESLint (no warnings or errors), frontend persistence tests (48), core engine checks (42),
authentication-security checks (7), and the combined-budget suite (6) passed.
Budget cases cover full-fare reservation, prepaid versus included lodging,
invalid/exhausted caps, variant serialization, pin edits, rebalancing, and
saved-request cap mismatch/overspend rejection. No production deployment or
signed-in live acceptance of this new cap has been completed yet.

## Dynamic data sequence

1. Verify the budget-cap increment live, then implement transfer/stay timing.
2. Expand the automatic candidate pool using the existing free provider; merge
   discovery with catalog IDs, deduplicate, retain mandatory pins and obtain user
   confirmation for missing opening hours, fees and durations.
3. Integrate restaurants with meal windows and travel time, including dietary
   uncertainty. Avoid inventing available restaurants just to fill a day.
4. Add provider-supported place details. Reviews, ratings, photos and hotel offers
   require an actual permitted data source; missing fields remain unavailable.
   No scraping or paid fallback is authorized.

Worldwide search does not mean worldwide verified scheduling. Hotel listings do
not establish availability or bookable prices. Forecasts do not establish future
weather certainty. Keep these distinctions visible.
