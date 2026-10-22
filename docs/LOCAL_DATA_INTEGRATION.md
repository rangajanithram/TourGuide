# Local dataset integration — first delivery

## Implemented

1. Repeatable import from the external dataset directory; no Windows-only path
   in the running backend.
2. Reproducible compressed railway reference bundle, based on DataMeet's
   source-declared CC0 data, including input checksum and skipped-row count.
3. Authenticated, rate-limited station search and historical direct-route lookup.
4. Optional train-reference cards in Planner → Journey, when different origin
   and destination cities are selected. Select exact stations to search.
5. Historical labels, unknown collection date, explicit unknown fares/seats and
   operating days, and an official schedule-check link.
6. Full local download inventory without copying review content or identities.

The planner does not derive current arrival/departure constraints from historical
trains. Users must still supply confirmed journey timing using the existing form.
This keeps the optimizer and independent verifier's contracts intact.

## Next integration batches

- GTFS bus/metro: preserve operator terms and ODbL notices, validate stop/trip
  relationships and service dates, distinguish platforms/entrances from stations,
  and document timing estimates before using a transit router.
- Place/restaurant/hotel metadata: establish source permissions, normalize cities,
  match locations and deduplicate properties before combining with discovery.
- Ratings/reviews: keep disabled pending source reuse verification. Preserve each
  rating scale and collection date; do not copy reviewer personal information.
- Hotel prices and rail timetables remain historical; datasets do not establish
  dated room availability, live seats, bookings or current quotes.

No new Supabase table, authentication change, paid provider, or database migration
is required for the first delivery. Deploy the backend and frontend from the same
commit. No live acceptance result is implied by local checks.

## Verification for this delivery

- `npm run typecheck`: passed.
- `npm run lint`: passed (existing Next.js lint-command deprecation notice).
- `npm run test:auth`: 48 passed.
- `python test_api.py`: all 42 checks passed.
- `python test_auth_security.py`: 7 passed.
- Local HTTP checks with isolated test authentication: unauthenticated access
  rejected, private/no-store headers, station lookup, invalid station pairs,
  invalid input syntax and overnight results passed.
- Direct dataset lookups checked Secunderabad–Bengaluru and Delhi–Jaipur in both
  directions. No production timetable accuracy or browser acceptance is claimed.
