# Nearby daily routes and simpler result panels — 26 October 2026

## User problem

The three-day Hyderabad plan was feasible but crossed the city for meals and
mixed sightseeing areas. The budget panel repeated technical totals, and the
omitted-place list expanded into dozens of wide, small-text cards with misleading
reasons. This change addresses both requests in one release.

## Route planning

1. Keep the existing DBSCAN discovery grouping, then refine each group using
   **complete-link agglomeration**. Every pair of sightseeing candidates in a
   refined guide group is within 5 km straight-line distance. Restaurants and
   hotels cannot bridge separate sightseeing areas into one giant group.
2. Use deterministic greedy workload packing to choose a primary area for each
   usable day. Consider required places, closures, visit length, the available
   day window, travel from the stay, interests and researched visitor places.
   Prefer a different area on later days when suitable areas remain. Use an
   actual member place as the medoid; do not invent a venue at a centroid.
3. Choose meals after those day guides. Lunch choices stay within 4 km of the
   area's medoid. Breakfast/dinner favor the corridor between the base and the
   day's area. Allow restaurant rotation within 2 km of the best extra-distance
   score; variety cannot justify a cross-city detour. Preserve meal hours,
   closures, dietary/comfort filters, budget and return-to-base checks.
4. Feed soft day preferences and a nearby cheapest-insertion warm start to the
   existing **OR-Tools vehicle-routing solver with time windows and guided local
   search**. Charge an internal objective penalty of 140 points per modeled km
   between stops, 600 for moving between compact sightseeing groups and 1,200
   for departing from a preferred day. These are tuning hypotheses, not rupee
   prices, physical time or guarantees of a globally optimal route.
5. Keep every candidate available to the solver. All pins, prerequisites,
   opening hours, travel/stay windows, return journeys, pace and cost caps remain
   hard constraints. Every result still passes the independent Stage 8 verifier.

The 5 km guide diameter is **not a new hard user constraint**. Distant pins,
closures, a sparse catalog, road layout or tight dates can require wider routes.
A long commute from the selected stay to a day's area is counted in full.
The change does not add provider calls or relax existing free routing limits.
Road evidence is used where available, with labeled distance-based fallback.

If no suitable nearby lunch venue exists, retain a clearly unnamed meal block
at a shown meeting point in the day's area. It is not a restaurant listing or a
confirmed service. The venue and walking time still require confirmation. Do
not claim complete restaurant coverage from the current dataset.

Algorithm references:

- [DBSCAN epsilon is not a maximum cluster diameter](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.DBSCAN.html).
- [Complete linkage and other agglomeration methods](https://scikit-learn.org/stable/modules/clustering.html#different-linkage-type-ward-complete-average-and-single-linkage).
- [OR-Tools initial routes](https://developers.google.com/optimization/routing/routing_tasks)
  and [routing search options](https://developers.google.com/optimization/routing/routing_options).

## Result panels

- Budget summary: planned cost, money left, a small visual cost bar and four
  readable categories. Use actual scheduled dining in the subtotal. Show any
  additional meal allowance separately, avoiding double-counting. Over-budget
  totals remain visibly negative/over budget rather than clamping to zero.
- Omitted places: native collapsed disclosure, readable two-column cards,
  category filters, counts, six initial results and a show-more control. Use
  theme tokens for light/dark contrast and minimum 44 px filter controls.
- Omission hints now count sightseeing slots separately from reserved meals,
  omit already-used restaurant IDs, and distinguish full-trip closures from
  partial weekday closures. Remove invented claims that the solver proved a
  detour exceeds 40 minutes. Do not suggest switching to the current pace.
  Explain that another mix of stops may fit.

Files: `tripweave/locality.py`, `clustering.py`, `planning_candidates.py`,
`initial_routes.py`, `optimizer.py`, `main.py`, `exclusions.py`,
`explainability.py`, `verifier.py`; web `BudgetSummary.tsx`, `OmittedPlaces.tsx`,
`budget-presentation.ts`, `planner-results.css`, `ItineraryView.tsx`, `layout.tsx`.

## Verification and limits

Offline comparison, same Hyderabad request (2–4 November, two travelers,
₹15,000, cab, balanced pace, history/sunset interests, ₹200 per-person meals),
weather mocked equally and road routing disabled in both runs:

| Measure | Before | After |
| --- | ---: | ---: |
| Balanced total modeled travel, including base commutes | 119.1 km | 83.8 km |
| Day 1 sightseeing spread | 2.91 km | 2.91 km |
| Day 2 sightseeing spread | 3.69 km | 1.25 km |
| Day 3 sightseeing spread | 4.04 km | 0.88 km |
| Scheduled meals | 9 | 9 |
| Balanced destination estimate | ₹11,263 | ₹10,107 |

These are representative bounded-search results, not fixed promises: search,
weather, road coverage, prices and constraints can change the selected plan.
The quality regression allows up to 95 modeled km for this fixture, requires
multiple sightseeing visits each day, compact daily sights, nine meal blocks
and a valid independent verification report within budget.

146 Python regressions, 82 frontend tests, the 42-check API script, seven auth
security tests, TypeScript, lint and a production build passed. New tests cover
connected-cluster chains, distinct day areas, nearby lunches, honest missing
venues, distant pins, meal-slot counting, closure explanations and budget math.

Browser visual review was attempted using an isolated, loopback-only fixture
rendered from the real components and production CSS. Computer Use stopped
before navigation because it could not verify the current browser URL. No
completed light/dark browser visual acceptance is claimed. Manual review of
desktop/mobile layouts, filters and light/dark states remains a release check.
The public catalog capability `route_locality_version=1` identifies the backend
release; old saved plans retain their snapshot until deliberately regenerated.
