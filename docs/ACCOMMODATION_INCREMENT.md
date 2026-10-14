# Accommodation choices — SDLC increment 2

Date: 2026-10-14. Previous increment: bbcb265.

## Requirement and design

Let travelers keep their booked stay or another daily base instead of forcing a suggested
hotel. Make lodging's treatment in the destination budget explicit and preserve it through
variants, edits and saved versions.

The additive version-1 StayChoice contract carries kind, name, coordinates, whole-stay group
cost and budget treatment. It is saved with existing request/preferences JSON; no database
migration is needed. The frontend validates input and the backend checks the destination
radius and derives the daily depot. The independent verifier checks base identity and cost
scope separately from route/accounting checks.

## Delivered

- Suggested stay (legacy behavior), booked stay, family/friends, or no accommodation arranged.
- Explicit daily base with a map link for checking the coordinates; 100 km destination bound.
- Booked cost included in the budget or shown separately as already paid.
- No fabricated nightly rate or occupancy claim for user-arranged stays.
- Fixed base across variants, preferences restored on reopen, and changed base/cost rejection.
- Clear review/results/export labels and warnings for missing overnight accommodation.

## Validation

Passed TypeScript and lint, plus 117 automated checks:
42 engine, 7 authentication/security, 7 accommodation, 8 edit, 6 journey timing,
3 live-planning, 6 planning preferences, and 38 frontend/auth/persistence checks.

Covered included/prepaid accounting, empty hotel catalog with a custom base, invalid costs,
coordinates and destination mismatch, saved JSON reopen, verifier rejection of altered
prepaid cost, multi-day no-stay warnings, fixed bases across variants and legacy behavior.
Live signed-in production acceptance and visual browser checks are not established by these tests.

## Acceptance walkthrough after both services deploy

1. Choose Hyderabad and a two-day sightseeing period, with a ₹15,000 destination budget.
2. Under **Where will you stay?**, choose **I already booked a stay**.
3. Enter the actual base name and confirmed map coordinates. Use the map link to check it.
4. Enter ₹3,000 as the whole group's full stay total; choose **Count this stay inside my budget**.
5. Generate. Every variant should use this base and count ₹3,000 in lodging.
6. Generate again with **Already paid; my budget is for remaining costs**. Lodging counted
   in the subtotal should be ₹0, with ₹3,000 separately shown as paid. The solver may choose
   different stops because more destination budget is available.
7. Save, reopen, edit a stop and save a revision. Check the base and budget treatment remain.
8. Try family/friends or no accommodation. There should be no suggested hotel cost; multi-day
   no-accommodation plans must clearly say an overnight stay still needs arranging.
9. Reopen an older trip without StayChoice; its existing hotel and costs should be retained.

## Remaining scope and next dependency

Coordinate entry is manual in this increment; place search/pin selection can improve it after
canonical place identity is implemented. Booking validity, room occupancy, property access,
actual check-in/out and road-based transfers remain unverified. No-stay is not an overnight
sleep plan. Only destination budget treatment is implemented, not full-trip quoted pricing.

Next SDLC cycle: transport intent and selection (allowed/booked modes), explicit intercity cost
scope and scenario checks that propagate actual travel times into local availability. Continue
using free sources and user-confirmed facts; do not promise live inventory or verified fares.
