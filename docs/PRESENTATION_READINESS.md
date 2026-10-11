# Presentation reliability pass — 2026-10-10

## Hosted save repair — 2026-10-11

Applied the missing Stage 2 migration to the TripWeave Supabase project, followed by `repair_trip_writer_auth_access`. The hosted migration records are `20261010180735` and `20261011062447`. GitHub deployment had not applied the database migration, causing PGRST202 on Save trip.

Hosted Supabase's `postgres` role cannot grant custom roles usage on the protected `auth` schema. The writer now obtains the caller ID through a private, fixed-search-path, read-only helper. The private ownership check runs as postgres solely to check the current caller's verified/non-anonymous auth record. All trip writes still run as the restricted writer with forced RLS. No auth table is exposed through the helper and no browser user ID is trusted.

Hosted `account_isolation.sql` passed after repair: create/read, idempotent retries, revision conflicts, restore, ownership isolation, anonymous/unverified denial, immutable history and deletion cascade. All fixtures rolled back; zero fixture users remain. The PostgREST schema cache was reloaded. This verifies database behavior; the user should retry Save trip on the existing open itinerary to confirm their browser session.

For future releases, run `supabase/tests/deployment_contract.sql` against the target database after migration and before frontend deployment. It fails on missing RPC signatures, incorrect execute grants, missing forced RLS or an unsafe writer role. Then run the rollback-based account isolation test. Both gates passed on the hosted project. The source migration contains the hosted identity fix for fresh databases. Already migrated environments need the updated SQL applied explicitly; do not assume editing an applied migration makes a deployment runner execute it again. Reconcile hosted migration versions before introducing CLI-managed deployments.

## Implemented in this pass

- The generation flow checks `/ready` before submitting a costly solver request. Loading text reflects two actual client operations: checking the service, then waiting for generation. This is not live solver-stage telemetry.
- Readiness checks Supabase configuration and validates all supported curated city catalogs, including hotel/attraction availability and unique place IDs. It does not contact Supabase or claim live inventory, road routing, or external service availability. `/health` remains a separate liveness endpoint.
- Shared planner transport applies a deadline through response body delivery, cleans up timers/listeners, supports cancellation, and never automatically retries expensive POSTs. Connection checks allow 90 seconds for startup; generation/edits/rebalance allow 120 seconds per request.
- Production requires an explicit public HTTPS `NEXT_PUBLIC_API_URL`. Missing configuration no longer silently sends users' planning requests to their own localhost. All planner API components use the same URL validation.
- Temporary capacity and rate-limit responses explain how long to wait when a numeric `Retry-After` is supplied. Server failures show safe recovery text rather than internal details. Validation errors remain actionable.
- A generated response must pass the existing snapshot validator before replacing the current itinerary. A failed response preserves the previous trip.
- Solver concurrency and queue wait are configurable with `SOLVER_CONCURRENCY` (default 2, range 1–16) and `SOLVER_QUEUE_TIMEOUT_SECONDS` (default 5, maximum 30). These remain per-process limits, not distributed quotas.

## Important behavior

Cancel stops browser waiting and prevents late results replacing the itinerary. It does not terminate an OR-Tools solve already received by the backend. A retry is a new request, so wait for the previous solve to finish after a cancellation/timeout on a small host.

The catalogs still use curated JSON records. This pass improves real backend execution and recovery; it does not move the catalog into a database or introduce live prices. Do not describe estimates as bookings or verified live inventory.

## Deploy together

1. Follow `STAGE_2_COMPLETION_AND_HANDOFF.md` for the pending database migration and account isolation acceptance. This pass adds no new database migration.
2. Configure backend `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and allowed frontend CORS origins. Optionally set the solver limits for host capacity. Credentials stay in deployment configuration.
3. Deploy the backend first. Check `/health` returns 200 and `/ready` returns 200 with `status: ready`. A 503 readiness result requires fixing configuration/catalogs; it is not a healthy planning deployment.
4. Set the frontend `NEXT_PUBLIC_API_URL` to the deployed backend HTTPS base URL, without an endpoint path. Build/deploy the frontend after the `/ready` route is available. New frontend code expects this route.
5. Run the two-account save/reopen/edit/restore flow from the Stage 2 handoff. Test service startup, offline mode, validation failures, rate limits and browser cancellation. Confirm a failed new generation keeps the old trip.

Live save and two-account isolation were confirmed by the user on October 11. Signed-in browser edit/restore/delete acceptance remains pending. Unit/regression checks are not a substitute for that journey. Next coding work after acceptance: a maintained catalog and one licensed live provider with provenance and explicit fallback.

## Stage 2 follow-up — October 11

- My Trips now loads 12 complete snapshots per page, with deterministic ordering and Previous/Next controls. Opening a trip still loads and validates its complete snapshot. Metadata-only trip cards remain a future optimization.
- History fetches revision metadata in explicit 100-row batches, ordered oldest-first during retrieval so appending a revision cannot shift earlier pages. The UI displays newest-first. Snapshot validation still runs on restore responses.
- Aggregate serialized history size on the current hosted rows: 64,492 bytes for full rows versus 697 bytes for selected metadata (about 98.9% less; this is a payload measurement, not a latency benchmark).
- Delete now requests the deleted ID and rejects a zero-row result. It cannot claim success when RLS hides a row or another session already deleted it.
- Stale list responses are ignored; refresh/paging cannot run during rename/delete. Failed initial loads no longer display the empty-account message. History has explicit loading feedback, and closing its drawer does not fetch it again.
- Hosted deployment-contract and rollback account-isolation SQL checks passed. The latter exercises create/idempotency, edit revisions, stale/null version rejection, restore, immutable history, rename, cross-account and anonymous/unverified denial, and cascading delete. Zero fixture users remained afterward.
- Local checks: typecheck, lint, 32 frontend service/auth checks, 42 optimizer checks, and 7 backend authentication checks passed.
- Final release checks: an isolated optimized Next.js production build passed (all 13 static pages generated). The sandboxed build stalled; the approved local build completed. My Trips refills the current page after deletion so the Next control remains available when later trips exist.
- Production browser access to `/trips` redirected the available session to `/login?error=session_expired`, correctly protecting private data. After deployment, use a disposable trip to check rename → reopen → edit/rebalance → save revision → restore → reopen → delete in a signed-in browser. Also check paging and a failed-network refresh. This signed-in UI journey remains unverified by the agent.

## Local regression evidence

### Calendar save fix

The optimizer previously omitted dates with no scheduled stops (including dates emptied by budget trimming). That produced a shorter snapshot than the original request, so cloud save correctly rejected it. The optimizer now preserves every requested date with zero scheduled activity cost on free days, and the itinerary explicitly labels those days. Snapshot date/budget checks remain strict. A one-visit/three-day real solver regression checks the full calendar, empty-day costs and independent feasibility verification; frontend coverage checks saving free days and rejecting truncated snapshots. Deploy the backend fix and regenerate existing truncated itineraries before saving them; do not invent missing dates in the browser.

- Type checking and lint passed; 28 frontend checks passed, including timeout, delayed response body, cancellation, no automatic POST retry, API configuration and error handling.
- All 42 optimizer checks and 7 authentication checks passed.
- Five readiness/configuration checks passed, covering all real catalogs, malformed/empty/duplicate catalogs, missing auth configuration, safe failures and bounded environment settings.
- Local in-memory HTTP checks passed for `/ready` and `/health` with controlled test auth configuration. The sandbox blocked sockets/stalled TestClient, so the HTTP check ran with approved local access.
- Production database acceptance and real browser journeys have not been performed in this pass.
- An isolated optimized Next.js production build passed, including the protected planner/account/trips routes. It required approved local access after the sandboxed build stalled; no deployment was made.
