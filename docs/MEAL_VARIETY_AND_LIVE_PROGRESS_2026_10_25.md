# Meal variety and shared visit checks — 25 October 2026

## Behavior

- Automatic meals choose suitable restaurants used least often, with no automatic repeat within one day. Nearby aliases of one named venue count as one venue.
- Opening hours, weekday closures, meal budget, food requirements, pinned stops and arrival/departure limits still apply. Deterministic inputs produce a stable plan, rather than random choices on each request.
- Too few suitable venues produce clearly unnamed meal blocks and a warning. Users can add restaurant choices or consent to automatic discovery. Missing venue facts are never invented to increase variety.
- Numbered visit checks in a saved planner itinerary and its trip room now use the same cloud records. Any joined member can mark or unmark the group’s visits while access is enabled. Owners can sync across their devices before starting a room.
- Visit checks do not add expenses or confirm payments. Draft checks and older device-only notes/bills remain separate; there is no silent import.
- Save planner edits before changing cloud checks. A time change keeps a check; another venue or date gets a different identity. Reopening an earlier saved version can restore checks for its original stops.
- Room itinerary changes, bills and checks use Supabase Realtime invalidations followed by checked reads. Subscription/reconnection and tab focus catch missed changes. A periodic access check remains while connected, with a shorter 10-second fallback when disconnected.
- Static exported copies do not update. Unsaved owner itinerary edits are not live collaborative edits.

## Database and privacy

`20261025132151_trip_visit_progress_and_realtime.sql` was applied to production project `tripweave` through the Supabase migration tool. The local filename matches the version assigned by that tool. Both `trip_rooms` and `trip_stop_visits` are in `supabase_realtime`.

`trip_stop_visits` has RLS and no direct browser write grants. The checked RPC derives owner and actor from the saved trip and verified session. It validates current stop identity, saved-plan version and per-stop revision. Repeated identical writes are idempotent; stale opposite writes conflict. It never returns private request inputs, history, addresses or account details. Stop identities are computed on the server.

Subscriptions listen only to trip-filtered INSERT/UPDATE events. DELETE is deliberately excluded because those events cannot be filtered by trip. The server revokes read/write access immediately when room access changes; previously displayed content clears on the next authorized refresh. Bill entry drafts survive ordinary room refreshes.

## Validation before release

- `npm run typecheck`: passed.
- `npm run lint`: passed with no warnings/errors.
- `npm run test:auth`: 76 tests passed, including payload validation, stop/plan revisions, conflict/configuration errors, scoped subscriptions, catch-up reads, hidden-tab behavior and channel cleanup.
- `npm run build`: passed, using an isolated build directory; generated TypeScript configuration changes were restored.
- `python test_api.py`: all 42 engine/API checks passed, including independent generated/edit verification.
- `python test_auth_security.py`: 7 passed.
- `python test_visual_planner.py`: 4 passed.
- `python test_meal_variety.py`: 5 passed, covering nine-meal rotation, aliases, scarce venues, hours/closures/budget, pins, travel-day windows and opting out.
- Existing `supabase/tests/trip_rooms.sql`: passed on an isolated PostgreSQL 17 database after applying all migrations.
- New `supabase/tests/trip_visits.sql`: passed locally and against production inside a transaction rolled back afterward. Covered owner-before-room sync, member access, outsiders, direct write denial, forged actor, arbitrary stop keys, conflicting writes, safe retries, paused/removed members, anonymous/unverified sessions, edit identity and deletion cascade. Verified zero test users remained.
- Production checks confirmed RLS enabled and the two intended publication tables present.

Supabase advisors reported no new RLS/security error. Existing notices remain for disabled leaked-password protection and the profiles policy initialization plan. The private invitation table intentionally denies all direct access. Unused-index information includes the new actor FK index; it is retained for referential-integrity operations. [Password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS performance guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

These checks establish implementation and database behavior. A fresh deployed-browser check is a separate release check; this record does not claim that unit tests alone verify live WebSocket delivery or every device/network combination.
