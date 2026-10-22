# Candidate expansion, daily coverage and meals

## Root causes

Generation previously used seeds plus manually confirmed external stops. A live
search did not automatically expand solver inputs. The solver could group visits
into two days and leave the third unused. Meal blocks were opt-in and always at
the base. Weather was attached after optimization, not supplied to its objective.

## Implemented flow

1. In Places & food, enable **Include real destination listings using my estimates
   below** and review duration, attraction cost, restaurant cost and the assumed
   09:00–20:00 window. Unknown closures remain unknown. Default is disabled: this
   is a user-confirmed planning policy, not verified venue evidence.
2. Fetch destination attractions and restaurants once per generation, reusing
   the bounded provider cache across variants. Deduplicate near-identical
   name/coordinate matches. User selections keep priority. At most 15 discovered
   candidates (including manual inputs) join the seed catalog; this is not an
   exhaustive search of every venue in the city. API failure does not silently
   become a successful automatic-discovery plan.
3. Match historical numeric attraction rating samples by normalized name and
   city. Low sample counts shrink toward a neutral prior. Unknown ratings stay
   neutral. Restaurant sample aggregates remain unattached until a branch-level
   identity crosswalk exists. No written review or reviewer identity is exported.
4. Reserve breakfast, lunch and dinner only where arrival/departure windows
   permit. Choose a suitable affordable restaurant with a fitting catalog or
   user-confirmed window; otherwise use an explicitly unconfirmed base meal.
   Meal settings are editable; fresh forms suggest ₹200/person/meal, visibly an
   estimate. Existing requests remain backward compatible.
5. Prefer a useful stop on each usable day using a soft coverage cost, including
   empty vehicles in that objective. Budgets, closures, pins and verified
   feasibility still win. Explicit sunset interests receive stronger soft timing
   preference. Weather/seasonal heat and rain are soft outdoor-ranking signals,
   not safety guarantees or venue closure predictions.
6. Run independent verification and cost reconciliation, preserving every
   requested date. Costed meal stops are not counted again as an extra generic
   meal allowance. Underfilled days describe candidate/constraint limitations.
7. Persist the discovery policy, expanded confirmed candidates, meal nodes and
   rating provenance with the snapshot so editing does not lose its inputs.

## Data and UI

- `scripts/import_rating_samples.py` exports numerical sample means/counts from
  the user-provided Hyderabad review CSVs. It exports no personal information,
  quotes, photos or full review records. Source collection dates are unverified;
  the scores are not live platform ratings or verified unique-reviewer counts.
- `data/reference/rating_samples.json`: 110 sample aggregates (100 restaurant
  names, 10 attraction names). Only attraction matches are currently applied.
- Results show candidate counts, historical score evidence and limitations,
  missing ratings, weather involvement and reserved meal labels.
- Mandatory meal blocks cannot be casually dropped or moved to sunset from a
  stop card; change meal preferences and regenerate instead.

## Checks

Local checks reproduced Hyderabad 29–31 October with sightseeing on all three
days; optional meal planning produced three meal blocks each day and no duplicate
meal allowance. A mocked discovery flow supplied 15 additional candidates once
for all variants and produced 2/3/4 daily sightseeing stops in Budget/Balanced/
Comfort plus three named meals per day. All generated variants passed Stage 8.
These fixtures do not certify live Geoapify coverage, current opening hours,
prices, reviews, dietary suitability, or actual restaurant operation.

Required type/lint/auth/optimizer checks and production build are recorded in the
delivery response. Live deployment acceptance remains separate. Old saved trips
reopen unchanged; generate a new plan to exercise the updated pipeline.
