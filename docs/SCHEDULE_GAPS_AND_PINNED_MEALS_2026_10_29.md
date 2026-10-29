# Nearby visits between meals — 29 October 2026

## Report and cause

A user saw breakfast end at 09:55 and the next stop, pinned Paradise Biryani,
start at 12:30. The old screen combined all 155 minutes as “travel or free time”.
The old meal resolver also excluded pinned restaurants from meal selection: a
required lunch could consume a sightseeing slot while another lunch was reserved.
The routing objective favored nearby routes and sunset timing but did not
explicitly try local insertions into each long gap after the bounded solve.

## Implementation

- `planning_candidates.reserve_pinned_meals` uses a suitable required restaurant
  for one reserved meal. Its original ID, name, pin and group meal price survive.
  Its own hours replace the previous venue's hours. No duplicate catalog node is
  passed to the solver. Explicit food needs, closures, travel availability and
  budgets remain applicable; unplaceable required meals receive a settings error.
- `schedule_gaps.fill_schedule_gaps` inspects at least 45 minutes of waiting after
  subtracting the current directional travel estimate. It tries a dropped nearby
  attraction or moves an existing same-day attraction into that gap. Each trial
  retains every already selected stop and is checked by the original OR-Tools
  model: date, service hours, dependencies, meals, visit quota, total budget,
  transport cap, return deadline and linked full-day visits remain constraints.
- Candidates must be within 3 route km of a gap endpoint and add at most 3 route
  km compared with the direct leg. No new provider requests or made-up durations
  are used. The pass favors reducing daytime waiting, then pre-dinner waiting,
  while accounting for sunset preferences and route distance. It is bounded to
  0.6 seconds, 80 assignment checks and up to two accepted changes per date
  (maximum 14 changes per request); it can stop with the prior feasible result.
- Stage 8 independently verifies the resulting route, including one breakfast,
  lunch and dinner at most per day. Required restaurants are not extra lunches.
- Each stop now includes optional `travel_minutes_from_previous` and
  `free_minutes_before` fields. Road/fallback annotation computes these inside
  the same request routing context; edits recompute them too. The web screen
  shows estimated travel and open time separately. Legacy snapshots retain a
  truthful “travel estimate unavailable” label instead of inventing a split.
- Long remaining gaps have a plain-language day note. A pace limit still means
  2/3/4 visits, reduced for older travelers, with meals separate. The planner
  never fills every minute by silently changing that limit or adding distant stops.

## Reproduction and tests

Local catalog reproduction: Hyderabad, 2–4 November 2026, 2 people, ₹30,000,
auto, Balanced, required Paradise Biryani and Lumbini Park, ₹500 meal allowance,
history/sunset/nature/food interests, mocked weather and distance-based travel.
The repaired route includes a nearby morning visit between breakfast and the
single pinned Paradise lunch, with all pins preserved and Stage 8 passing.

`test_schedule_gaps.py` covers insertion, same-day relocation, pace/budget/
closure/locality refusals, duplicate lunch rejection, old/new snapshot fields,
required restaurant hours, all three variant tiers, cab/auto/metro/walking,
older-traveler pacing, and late-arrival/early-departure windows. Existing full-day,
road matrix, edit, authentication and security regression suites also apply.

The road integration test now checks source labels against actual selected road
legs. The free matrix covers at most 25 candidate points; successful provider
access does not establish road coverage for every selected variant's route.

Release checks passed: 165 Python unittest regressions, 83 frontend tests,
42 API checks, 7 auth/security checks, TypeScript typecheck, ESLint and an isolated
Next.js production build. Live browser inspection could not be completed:
Computer Use stopped because it could not establish the current Windows browser
URL. That limitation does not certify a live browser generation or visual check.

## Limits

This is bounded local improvement, not proof of a globally optimal timetable.
Open time can remain when pace, hours, required visits, route locality or cost
prevent a useful insertion. Dinner/service windows and sunset preferences can
also leave open time. Existing saved trip snapshots are not silently rewritten;
regenerate to apply the new scheduler. Venue hours, fares, food service and road
traffic remain estimates where labeled. Additional costs are still included in
Stage 8 accounting; no bookings or current provider availability are promised.
