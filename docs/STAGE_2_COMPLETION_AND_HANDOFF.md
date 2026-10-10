# TripWeave Stage 2 implementation and handoff

Status: 2026-10-10. Stage 2 code is implemented and locally checked. Production acceptance is still required. This is the cloud persistence stage, not pipeline Stage 2 (candidate filtering). No claim of zero future defects or live travel guarantees is made.

## Direction and phases

The web-first Next.js + FastAPI + Supabase direction fits the current presentation goal. Finish the save/edit/reopen journey with real accounts before expanding the feature list. The original product specification is the long-term vision, not proof that every proposed feature exists.

| Phase | Completed in the repository | Remaining gate / work |
|---|---|---|
| 0: Foundation | Guide, themed auth pages, verified-account routes, email/Google adapters, account settings, JWT protection | User reports deployed email/Google verification works. Repeat login/logout/expiry and recovery acceptance after deployment. |
| 1: Curated planning prototype | Five city seed catalogs, bounded OR-Tools routing, hotel/base selection, sunset timing, pins, up to three distinct feasible variants, cost/time audits, map/calendar/share controls | Venue data, transit speeds and inventory remain estimates. Validate current facts before actual travel; benchmark representative itineraries. |
| 2: Save and edit MVP | Save/reopen/rename/delete; atomic version commits and restore; selected variant and request preservation; stale-write conflicts; immutable owner-isolated history; full-route edit accounting; Undo and failure feedback | Apply updated SQL, deploy frontend/backend, then run the two-account production journey below. This gate has not been completed by this local run. |
| 3: Live providers | Weather integration and provider abstraction exist | Licensed live venue/route data, freshness/confidence UI, quota/cost controls, timeout/fallback contract tests. Start with one reference city. |
| 4: Release quality | Auth/security regression tests, process-local rate limits, solver concurrency guards, input bounds | Automated browser journeys, responsive/keyboard checks, dependency audit, measured Core Web Vitals and solver percentiles, pagination/metadata-only list queries, shared rate limiting when adding workers, privacy/terms review. |
| 5: Expansion | Browser-local group expense prototype and heuristic tiredness replanning exist | Real multi-user rooms/invites/cloud expenses, offline/PWA, live trip state, optional natural-language input. Do not describe local expense storage or query-string sharing as cloud collaboration. |

## What changed in this hardening pass

### Database (`supabase/migrations/20261010183000_saved_trips_and_plan_versions.sql`)

- Added missing `days`, `budget_inr` and per-account `creation_key`; date conversion and schema changes run inside one transaction.
- Initial saves and their version 1 are atomic. Retrying the same creation key and same snapshot returns the original trip.
- Commit and restore reject missing/stale expected versions and use row locks. Two concurrent sessions cannot both overwrite the same version.
- History rows cannot be directly inserted, updated or deleted by authenticated users. Direct itinerary/ownership/version writes are revoked; title rename and parent deletion remain permitted.
- Public RPC wrappers run as invokers. Private implementations use a limited NOLOGIN/NOBYPASSRLS writer role, fixed empty search paths and ownership policies. The writer can append history, not rewrite it.
- Verified ownership checks actual `auth.users.email_confirmed_at` and anonymous status, not a browser-provided verification field. No service-role key is required in the app.
- Snapshot/request checks cover schema version, dates/day sequence, destination, variant/mode, nonnegative reconciled costs, traveler/budget bounds, useful sightseeing and storage payload bounds.
- Revisions preserve their request data; restore recovers that version's dates, budget, pace, party and pins together with its snapshot. Parent deletion cascades to all versions.
- Keep `tripweave_private` OUT of Supabase's exposed Data API schemas. Only the intended public wrappers should be exposed.

### Frontend

- Added typed snapshot validation and rejected incompatible future versions, malformed nested data, impossible calendar dates, overlapping appointments and inconsistent totals before rendering/saving.
- Missing verification evidence is represented as unknown, not silently declared valid. Stored browser-supplied audit fields are not cryptographic proof of backend verification.
- Saved request data includes arrival/start location, interests, group settings and pins. Local pin changes are reflected in request state.
- Save success is recorded before refreshing history. A history-fetch failure now says the trip is saved and offers a retry through View history, rather than falsely reporting a failed write.
- Preserved Undo history across ordinary parent updates; reset it on a different trip, variant or restore. Kept the current plan after failed generation.
- Blocked overlapping persistence operations and edit controls during writes; protected against stale load/history responses and warned before closing a tab with unsaved work.
- Initial-save retries retain a stable creation key; bounded the service's retry-key memory.

### Editing and math

- Edits retain the selected variant's transport mode, pass the requested pace to fatigue evaluation and recalculate every hotel/departure/stop/return fare.
- Identical locations generate zero minutes/zero fare in every mode.
- Remove keeps remaining appointment times instead of packing them into invented 20-minute travel gaps. Swap/sunset results must pass independent verification before Apply.
- Sunset scheduling requires the actual trip date; it no longer silently uses today for invalid dates. The sunset regression now checks the target stop against its astronomical window.
- Unknown venues, malformed times, overlaps and insufficient transfer time fail verification. Closure checks derive weekday from date rather than trusting a contradictory label.
- Rebalances reconcile complete route costs, expense totals and retained pins. Even a “no remaining stops” result is independently verified. GPS is transient for the next leg's timing; retained coarse locations provide the stored route estimate. Exact GPS is not serialized.
- Transit, weather, crowd and fatigue remain model estimates; there is no promise of actual road routing, live hotel inventory or medical/accessibility suitability.

## Local verification evidence

- `npm run typecheck`: passed.
- `npm run lint`: passed without lint warnings/errors (Next's CLI deprecation notice remains).
- `npm run test:auth`: 24 checks passed.
- `npm run build`: optimized build passed, including `/planner`, `/trips`, `/account` and auth routes. A sandbox output-directory restriction required an approved local build outside the sandbox.
- `python test_api.py`: all 42 backend checks passed.
- `python test_auth_security.py`: 7 checks passed.
- `python test_rebalance.py`: 10 checks passed.
- `python test_stage2_edits.py`: 8 additional edit/verifier regressions passed.
- A real generated multi-variant backend response was accepted by the frontend snapshot validator.
- Fresh migration application and repeat application passed on isolated PostgreSQL 17.
- `supabase/tests/account_isolation.sql` passed: profile/trip/history isolation, rename/delete, anonymous/unverified denial, history immutability, null/stale conflicts, initial-save idempotency, failed-write rollback, restore request preservation and cascade deletion.
- `python test_stage2_database.py --port 55439` passed with two genuinely concurrent database sessions: one successful revision, one stale conflict, exactly two history rows.

These checks are not a completed browser/production acceptance run. They do not measure Core Web Vitals or prove live provider setup.

## Apply and demonstrate Stage 2

1. Back up the Supabase database. Apply the foundation migration first if it is absent, then run the FULL updated Stage 2 SQL file using the privileged SQL editor. Do not run `supabase/tests/local_bootstrap.sql` on a hosted project: it is only an isolated local test scaffold.
2. If an earlier draft of the same Stage 2 filename was already applied, the migration tracker will not rerun an edited file automatically. Apply the updated file explicitly as a reviewed SQL upgrade (or record it as a new forward migration in your deployment workflow). Do not merely mark it applied.
3. Invalid legacy dates abort the transaction; correct them explicitly before retrying. Existing malformed/empty legacy snapshots are preserved and may fail validation when opened. Recreate/repair them explicitly; do not relabel them verified.
4. Confirm the private schema is not exposed and the writer role has no login/bypassRLS privileges. Run the rollback-based RLS test in staging with dedicated fixture accounts.
5. Deploy matching frontend and backend code after SQL. The new create RPC needs `p_creation_key`; commit needs `p_request_data`. Old and new signatures are not interchangeable. Coordinate the rollout so an old client is not used during the migration window.
6. Account A: log in, generate, save, refresh, reopen from My trips without another generation request, rename, edit, Save revision, Undo another local edit, then restore version 1. Confirm history is preserved and request preferences match the restored version.
7. Two tabs of A: load the same version, save a revision in tab 1, try saving in tab 2. Tab 2 must retain its local work and show the conflict/reload action. Deliberately interrupt network and verify recovery feedback.
8. Account B: confirm A's trip is absent; direct requests for A's UUID must not reveal it or its history. Check logged-out/unverified/anonymous access denial.
9. Delete the test trip and verify version cascade. Repeat the journey with Google login. Check mobile layout, focus/keyboard behavior, refresh, logout, network failure and session expiry.

For the class proposal, describe this as a verified-account travel-planning MVP using curated estimates, with cloud save/versioning implemented and a clearly identified live deployment gate. Keep one prepared reference-city itinerary and a recovery path if the free backend sleeps.

## Antigravity instructions for the next pass

Preserve the Next.js/FastAPI/Supabase architecture and current UI. Read AGENTS.md, engineering_blueprint.md and this handoff. First complete the production Stage 2 acceptance journey; report evidence for every step and any failures. Do not claim an untested gate passed. After acceptance, prioritize a small browser regression suite and bounded metadata-only trip/history pagination. Then implement one licensed live provider behind the existing abstraction with freshness labels, quotas, timeouts, contract tests and deterministic fallback. Do not add group cloud collaboration, payment confirmation or mobile rewrites until their own authorization/data model is designed. Retain all regression coverage and independent feasibility checks after every edit/rebalance.
