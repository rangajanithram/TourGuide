# Full-day visit recovery — 26 October 2026

## Reproduced request

The user's screenshots show Bengaluru → Hyderabad, 2–5 November 2026, two
travelers, ₹30,000 destination budget, active explorers, balanced pace, auto,
road routing on, train/bus suggestions only, a suggested stay, five must-visits
(Charminar, Chowmahalla Palace, Golconda Fort, Hussain Sagar and Ramoji Film City),
history/UNESCO/sunset/nature/food interests, and ₹500 per person per meal.
There is no booked journey, custom stay or extra discovery enabled.

## Cause

The catalog estimates Ramoji as a six-hour visit with a 09:00–17:30 window.
The old routing model treated it as an uninterrupted activity while also
requiring a separate lunch during 12:00–15:00. Those two blocks could not fit
together after the long outward trip. Automatic restaurant choices and a
price-led stay could make it worse. The bounded solver then returned an
unfinished search rather than a usable trip. Repeated retries could not repair
this modeling conflict.

## Changes

- Required attractions with an estimated visit block of at least five hours
  receive linked before-lunch and after-lunch parts, with a 30-minute unnamed
  onsite lunch between them. This is an explicit **planning assumption**: the
  estimated total venue visit block includes lunch. It does not assert actual
  food service, a restaurant, walking access or a booking. The example remains
  six hours in total: 165 minutes + 30 minutes lunch + 165 minutes.
- The original place ID remains the required stop. Continuation IDs are
  distinct. Ticket cost is charged once; continuation cost is zero. Dependency
  and immediate-successor constraints keep all three parts on the same day,
  at the original coordinates and in order, without an intervening city stop.
- A later dedicated excursion day can start at 08:00. This is shown in its
  planning note. The first-day arrival bound is never moved earlier. Journey,
  transfer, rest, check-in/check-out and departure limits still apply after the
  early-start default. Other days keep their existing default start.
- Breakfast and dinner on that day reserve 30 minutes at the stay, using the
  user's meal allowance and clearly unknown venues. This avoids additional
  restaurant detours. The other days keep nearby restaurant selection.
- Suggested stays must pass a necessary visit/travel/meal-time check for each
  required long visit. A closer candidate can replace a cheaper unsuitable
  stay. A user-confirmed base is never moved. Provider calls and free routing
  limits are unchanged.
- Constructive routes honor the linked parts before local improvement. The
  continuation does not consume another sightseeing quota slot. Simple total
  required-time conflicts return an actionable 422 before search; they are
  not presented as retryable timeouts.
- Stage 8 independently checks the original catalog visit length, part order,
  meal duration, venue coordinates, original hours and single-ticket cost.
  Missing lunch, shortened parts and stripped markers fail verification.
- Optional snapshot fields preserve the continuation through save/reopen and
  cloud room snapshots. Legacy snapshots still parse. The shared-copy renderer
  keeps the day note and explicit before/after-lunch names.
- Individual edits and tired-day changes on a linked excursion day require
  regeneration through trip settings. Both UI and backend explain this limit.
  Other days retain edits. Replanning normalizes linked parts back to the
  original pin so it is not duplicated or sent as an unknown place.

## Evidence and release checks

Local reproduction returned three independently verified options under
₹30,000, retaining all five pins, four dates and twelve meal breaks. Example
offline estimates were ₹17,367 / ₹18,280 / ₹24,796; search, weather and road data
can change these amounts. A directional-road regression also passes and checks
that a nearer stay can replace an unsuitable one.

The regression suite covers the exact settings, complete visit length, a single
ticket, missing/shortened parts, removed markers, snapshot round-trip, linked
edit protection, first-day/stay availability, and directional road evidence.
Required checks include the complete Python suite, the 42-check API script,
seven auth/security tests, frontend tests, type checking, lint and an isolated
production build.

Release validation passed: 155 Python regressions, 82 frontend tests, all 42 API
checks, seven auth/security tests, TypeScript, lint and the production build.

`excursion_planning_version=1` on the public catalog identifies the backend
release. The unchanged signed-in browser draft is retained for a live retry
after deployment. A successful local or public capability check alone does not
prove that signed-in production generation passed.

Limits: long-visit allocation is bounded and may require another date for
several excursions. A genuinely tight request still receives a conflict with
the settings to change; pins, budget, hours and explicit travel/stay timing
must not be silently loosened. Restaurant service and rates remain unconfirmed.
