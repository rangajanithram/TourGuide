# Presentation reliability pass — 2026-10-10

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

Production rollout and live two-account browser acceptance remain pending. Unit/regression checks are not a substitute for them. Next coding work after acceptance: bounded metadata-only trip/history pagination, then a maintained catalog and one licensed live provider with provenance and explicit fallback.

## Local regression evidence

- Type checking and lint passed; 28 frontend checks passed, including timeout, delayed response body, cancellation, no automatic POST retry, API configuration and error handling.
- All 42 optimizer checks and 7 authentication checks passed.
- Five readiness/configuration checks passed, covering all real catalogs, malformed/empty/duplicate catalogs, missing auth configuration, safe failures and bounded environment settings.
- Local in-memory HTTP checks passed for `/ready` and `/health` with controlled test auth configuration. The sandbox blocked sockets/stalled TestClient, so the HTTP check ran with approved local access.
- Production database acceptance and real browser journeys have not been performed in this pass.
- An isolated optimized Next.js production build passed, including the protected planner/account/trips routes. It required approved local access after the sandboxed build stalled; no deployment was made.
