# TripWeave — Complete Progress, User Flow and Engineering Handoff

Prepared 22 October 2026. Repository baseline: `a103b4a` on `main`.
Repository: https://github.com/rangajanithram/TourGuide
Frontend: https://tour-guide-e3es.vercel.app
Backend: https://tripweave-api-u6sy.onrender.com

## 1. Read this before continuing

This is a repository and evidence handoff, not a certification that every production feature works. It summarizes current code, recorded checks and user confirmations. No fresh live browser acceptance or provider-account inspection was performed while writing it. GitHub push does not establish deployment readiness or successful live execution.

Read AGENTS.md and docs/engineering_blueprint.md first. Security, privacy and provider licensing take precedence. The blueprint is authoritative architecture; product_spec.md preserves historical vision. Do not delete or rewrite that vision to match an implementation shortcut. Older status documents need to be interpreted alongside later amendments and commits.

The immediate objective is a trustworthy web trip planner that users can understand and operate from start to finish. Do not claim worldwide verified scheduling, live hotel inventory, authentic reviews, traffic-aware routes or complete trip pricing unless an actual provider and the full execution path support the claim.

Standing user requirements: free services only; preserve working features; never invent missing facts; allow clearly labeled user-confirmed planning estimates; commit and push completed notable changes with descriptive messages after checks. Deliver sequential, reviewable increments.

## 2. Product purpose and differentiation

TripWeave takes destination, dates, travelers, budget, pace, interests and mandatory stops, then constructs feasible multi-day itineraries. It supports comparing alternatives, inspecting map/schedules/costs, changing stops and keeping cloud version history.

The intended distinction from booking catalogs is constraint-based planning: explain which places fit together geographically, when they fit, which expenses are counted and why a requested plan cannot work. It is not currently a transport or accommodation booking engine.

A coherent itinerary with honest unknowns is more valuable than a crowded page of invented recommendations. A saved trip is a snapshot; reopening should not regenerate it or silently replace its evidence with current provider data.

## 3. Architecture and responsibilities

- web/: Next.js 15 App Router, React 18, TypeScript, Tailwind, Leaflet/OSM and Three.js for the guide. Hosted on Vercel.
- tripweave/: Python FastAPI and OR-Tools optimizer, Pydantic contracts, independent verifier, adapters, weather and solar calculations. Hosted on Render.
- Supabase: authentication and PostgreSQL with ownership RLS, profiles, saved trips and immutable plan revisions.
- Data: curated city catalogs, optional Supabase catalog provider, Geoapify discovery, Open-Meteo forecasts and local astronomical calculation.

Browser authenticates through Supabase. Planning calls carry a verified session token. FastAPI derives identity from token verification; ownership must never come from arbitrary browser IDs. Browser persistence uses Supabase policies and atomic database functions. Keep service credentials and API secrets in deployment configuration, never source control.

Architecture is web-first. Native apps, distributed queues, Redis and realtime collaboration are future decisions, not prerequisites for the present release.

## 4. Progress from the beginning

### Foundation and guide

A deployed Next.js site, interactive guide, planner, account and trip-list pages exist. The guide uses animation and an illustrated travel theme. Layout iterations addressed login/signup shifts, navbar spacing, planner width, excessive horizontal result panels, result readability, daily timelines, budget/check disclosures and responsive action placement. Local Fraunces and Geist font assets exist; typography is not dependent solely on a remote font fetch.

Loading and transition components exist. Planner requests have bounded deadlines and cancellation handling. This does not prove every action has complete loading/error accessibility coverage; audit it at actual screen sizes.

### Authentication and private data

Email signup/verification, login, Google OAuth, recovery/reset, confirmation/error routes, protected pages and logout paths exist. Supabase remains the identity authority. Backend token validation, private-table RLS and account isolation checks exist.

User previously confirmed saving on the live site and that a second account could not see the first account's trip. This is valuable observed evidence, but not a current exhaustive security audit. Recheck session refresh, expired sessions and recovery links before release.

### Core optimizer

The engine has request validation, curated place loading, feasibility filtering, geographic clustering, travel estimation, OR-Tools time windows, budget/pacing constraints, fatigue scoring, sunset calculation, variant construction, independent verification and explanation output.

Reference catalogs cover Hyderabad, Delhi, Jaipur, Bengaluru and Mumbai. Supported-city scheduling and worldwide discovery are separate capabilities. Configured database data may supplement or replace some curated records; it does not make every city supported.

Mandatory stops must remain mandatory even when their evidence is uncertain. Return explicit infeasibility and useful relaxation choices rather than silently dropping or weakening pins. Up to three genuinely distinct feasible variants may be returned; do not manufacture three similar plans when only one works.

Requested dates remain present even on days with no scheduled attractions. Empty days are labeled as free time, not omitted or filled with fake stops.

### Editing and persistence

Users can save, reopen without regeneration, rename, delete, inspect history, save revisions and restore earlier versions. Edit previews support stop actions and rebalancing. Independent verification guards changes.

Persistence improvements include snapshot validation, request/itinerary consistency, atomic create/version handling, stale-revision safeguards, pagination and more efficient history metadata loading. A past missing database-function deployment caused save failures; the user later confirmed live saving worked. Never disable validation to mask a mismatch or missing migration.

The user reported rename → edit → save revision → reopen → restore → delete working. Agent-recorded booked-trip verification also passed generation, save, reopen, pin edit, revision v2, reload and history listing. That evidence predates the newest timing increments.

### Discovery and preferences

Geoapify-based free-plan discovery exists, with bounded requests, safe provider errors and daily process-local limits. Planner search/pinning was unified after earlier duplicated catalog/live search controls caused confusion. Real listings require user confirmation of missing visit duration, fee and time window before optimizer use.

Confirmed external attractions/restaurants merge with curated optimizer candidates and retain estimated provenance. This is real-place input integration, not automatic discovery-driven worldwide trip generation. Automatic candidate injection remains unfinished.

Travel style, sightseeing pace, local transport, interests, climbing/visit-duration preferences and food preferences exist in the contracts/UI. They need full destination-specific acceptance. Do not claim an interest is fully supported merely because a selectable chip exists.

### Meals

Optional meal reservations use the user's per-person estimate and reserve base meal blocks when timing/budget permits. Blocks are labeled as requiring a venue arrangement. A confirmed restaurant may also enter the schedule.

Automatic nearby breakfast/lunch/dinner venue selection, verified dietary suitability, restaurant service windows and complete venue travel reconciliation remain unfinished. Dietary labels are preferences, not allergy-safety guarantees.

### Accommodation

Planner-selected estimated stays and user-supplied booked/family/no-stay bases exist. Users supply a base location and total group stay cost. Included lodging stays inside the destination budget; prepaid excluded lodging is shown separately and counted once in combined costs.

Missing check-in/out times remain unknown. Bag-drop availability defaults unknown, not true. An earlier increment displayed assumed 14:00/11:00 times; this was corrected. Old saved snapshots may retain earlier values and must not be relabeled confirmed facts.

An optional booked-stay constraint now starts the first day's route after entered check-in and requires the final route to return to base before checkout. Users confirm these correspond to the first/last sightseeing dates. It is not a complete hotel-stay calendar or luggage workflow. Conflicting one-day windows are rejected. The constraint survives edits and is checked when saving.

### Journey timing and transport

Four user-entered India-time timestamps capture origin departure, destination arrival, destination departure and return arrival. Chronology, offsets and duration limits are validated. Sightseeing windows respect arrival/departure buffers.

Separate user-estimated arrival/departure terminal transfer durations were added; they are added to existing buffers. The UI warns against counting the same transfer twice. Zero means no separate time reserved. Terminal coordinates, traffic routes, transfer fare accounting and booking confirmation are still missing.

Intercity mode preferences and curated reference transport suggestions exist. Unknown return services are not invented by reversing an outbound route. Booked roundtrip travel can preserve actual user-reported modes, total group fare and paid amount; replacement suggestions are suppressed for that booking path.

### Accounting and combined cap

Destination subtotal counts modeled lodging, local travel and scheduled stop/meal costs. It excludes intercity fares and other uncounted items.

Counted journey total = destination subtotal + full booked roundtrip fare + excluded prepaid stay.
Reported paid = ticket paid amount + excluded prepaid stay.
Remaining counted amount = counted journey total − reported paid.

The optional combined cap reserves full booked fares and excluded prepaid lodging before solving. Destination allowance is the smaller of the destination cap and the remaining combined allowance. Already-paid expenses still count toward total spending. Intercity combined-cap use requires booked fares. Independent checks compare reported and recomputed costs. Edits and saves must retain the cap.

This is a partial counted-cost cap. Unbooked tickets, transfer fares outside the itinerary, unarranged stays, extra meals, taxes and personal spending can remain excluded. Never present the partial cap as a complete door-to-door quote.

### Map, exports and local expenses

Leaflet shows place pins, day routes, zoom and day filters. Public OSM attribution/referrer configuration and tile-failure recovery exist. A provider may return a block-message image with HTTP success, which Leaflet cannot reliably detect. Public tile access is not guaranteed. A managed OSM-derived service requires permitted configuration; do not use Google tile URLs in Leaflet.

Calendar and text export, parameter-link copying and a browser-local expense split prototype exist. Parameter links rerun inputs; they do not grant access to private saved snapshots. Copy/export need live acceptance. Browser-local expenses are not cloud collaboration. UPI links do not confirm payment: settlement always needs manual confirmation.

### Latest reliability work

Discovery results now have a five-minute, at-most-128-entry process-local cache. Repeated searches reuse copies, failures are not cached, and original fetched timestamps remain. It reduces duplicate calls but does not provide distributed quotas or prevent every concurrent duplicate request.

## 5. What data is actually dynamic?

| Data | Current position | Do not claim |
|---|---|---|
| Place listings/names/coordinates | Geoapify discovery where configured | Every listing is optimizer-ready or every city is supported |
| Hours, fees and visit duration | Curated records or user-confirmed estimates | Provider-verified current facts for all places |
| Weather | Open-Meteo forecast integration | Certain future weather or forecasts beyond available horizon |
| Golden hour/sunset | Local astronomical calculation | Guaranteed visibility, weather or venue access |
| Travel time | Geographic/model estimates and user transfer input | Live road traffic or confirmed transit timetable |
| Hotel prices | Curated/user-supplied estimates | Live available rooms or bookable quote |
| Ratings/review count | Fields/UI exist; actual provider feed not completed | Real reviews are integrated because fields were added |
| Crowd/fatigue | Modeled/estimated signals | Real-time measured attendance or personal medical assessment |

## 6. Intended complete user flow

1. Visitor sees guide, understands the planner, costs and limitations, then signs in or follows whatever guest route is explicitly supported. Private saving requires a valid account.
2. Journey: searchable origin/destination, confirmed suggestion, dates, traveler count and destination budget. Explain supported-city coverage. Keep typing usable while requests load; selecting a different city must clear incompatible pins.
3. Optional logistics: booked travel, four timestamps, separate transfers/buffers, accommodation/base/cost/prepaid scope and optional combined cap. Explain exactly what is counted.
4. Travel style: pace, transport, group comfort, climbing tolerance and useful optional preferences. Progressive disclosure should reduce overload.
5. Places and food: one search/pin control with multiple selected chips, clear removal, unified interests, optional surprises and meal preferences. Missing facts get a short confirmation step, not fabricated defaults.
6. Review: summarize choices, mandatory stops, estimates, unknown costs and feasible time windows. Permit direct correction before generation.
7. Generate: clear processing status, cancel/recovery and no silent repeated expensive POST. Preserve the prior plan if the request fails. Never show a saveable result before validation.
8. Results: compare feasible alternatives, view map and readable day schedules, accommodation, counted cost/paid/remaining totals and assumptions. Explain empty days and excluded requests.
9. Customize: preview meaningful time/cost consequences; reject pin removal or infeasible edits clearly. Rebalance without losing constraints.
10. Save: accurate title, visible progress and success only after confirmed persistence. Save revisions with conflict handling rather than overwriting another tab's changes.
11. My Trips: reopen exact snapshots, rename, inspect/restore history and delete with clear consequences. Session expiry must not expose another user's records or discard recoverable work without explanation.
12. Export/share: state whether output is a snapshot, private record or parameter rerun. Never imply copied parameters contain the entire private trip.

## 7. Critical edge cases and expected behavior

- Invalid/reversed dates, too many days/travelers, malformed money or coordinates: reject before expensive solving and validate again server-side.
- Arrival plus transfers later than available sightseeing, departure too early, conflicting stay window: explain which time conflicts and how to adjust it.
- Overnight travel: preserve real dates and offsets. Do not infer hotel-night removal from an overnight service.
- Tight budgets: return fewer feasible alternatives or explicit infeasibility. Never drop mandatory stops silently or invent free fares.
- Too many pins, duplicate places, geographically distant places or closed-day conflicts: preserve intent, deduplicate safely and explain conflicts.
- Unknown hours/fees: request confirmation, mark estimates and retain source/checked time where available.
- Meals: avoid overlaps/double counting, account for transfers, honor availability and distinguish reserved time from selected restaurant.
- Empty last day: show free time and reason; do not truncate calendar or fabricate activities.
- Discovery unavailable/quota reached: keep existing selections, show recovery and distinguish curated fallback from live data.
- Weather unavailable/outside horizon: show unknown or labeled fallback rather than fake current weather.
- Map failure: retain textual itinerary and controls; provide retry without unbounded loops.
- Browser offline/timeout/cancel: keep previous result; no automatic POST retry; late responses must not replace newer plans.
- Session expired: prompt login safely; no token leakage, private caching or weakened ownership validation.
- Two tabs editing: handle stale versions explicitly and preserve history.
- Paid fare above total, exhausted cap, changed snapshot cap/base/booking: reject inconsistent accounting.
- Restore old snapshot: preserve data provenance and version semantics; never silently upgrade estimated facts.

## 8. File-by-file engineering map

| Path | Responsibility and next review focus |
|---|---|
| tripweave/main.py | API orchestration, readiness, generation, variants, edits, quotas. Duplicate root/health route declarations exist: inspect before cleanup; preserve readiness behavior. |
| tripweave/models.py | Shared backend contracts, dates, stay/journey/cap validation. Add versioned, backward-compatible fields. |
| tripweave/optimizer.py | Scheduling/time windows/budget/pace. Preserve calendar and mandatory stops. |
| tripweave/verifier.py | Independent timing/cost/constraint checks after generation and edits. Never bypass for UI convenience. |
| tripweave/provider.py | JSON/Supabase catalogs and confirmed-stop merge. Keep source and estimate status intact. |
| tripweave/discovery.py | Free discovery, bounded calls/cache/errors. Next: provider contract and candidate admission policy. |
| tripweave/feasibility.py | Stay/base selection, budget scope and constraints. No invented rates or hotel facts. |
| tripweave/editor.py | Edit preview/rebalance reconstruction. Every new preference must survive these paths. |
| tripweave/route_accounting.py | Route reconciliation; use before introducing transfer costs. |
| tripweave/transport.py, distance.py | Reference transport and estimated travel. Keep routing evidence explicit. |
| tripweave/weather.py, solar.py, crowd.py, fatigue.py | Forecast/calculation/model evidence and honest labels. |
| web/src/components/PlannerPage.tsx | Form → request → result, persistence and cancellation. Preserve state on failures. |
| web/src/components/TripForm.tsx | Four-step setup, review and validation. Audit mobile/keyboard use. |
| JourneyTimingFields.tsx, StayChoiceFields.tsx | User logistics, optional constraints and scope explanations. |
| ItineraryView.tsx, JourneyCostSummary.tsx | Result hierarchy, actions, timing and accounting. Keep readable columns. |
| web/src/lib/snapshot-validation.ts | Request/result consistency and backward-compatible saved snapshots. |
| web/src/lib/trips-service.ts | Cloud persistence/version functions and safe failure behavior. |
| journey-budget.ts, journey-costs.ts | Frontend accounting parity with backend/verifier/export. |
| planner-network.ts, planner-fetch.ts | Deadlines, aborts, safe errors and no automatic POST retry. |
| web/src/utils/calendarExport.ts | Export parity; verify fees, timing and assumptions. |
| web/src/app/discover/page.tsx | Discovery browsing; avoid duplicating the planner's selection flow. |
| web/src/app/trips/page.tsx | Trip list, paging, rename/delete/history. |
| supabase/migrations/ | Identity isolation, saved trips/version functions, Hyderabad catalog. Apply migrations before dependent deployments. |

## 9. Verification evidence and its limits

Recent local runs passed frontend typecheck/lint and 48 frontend checks. The terminal-transfer increment passed nine stay/timing checks, 42 engine checks and seven auth-security checks. The latest cache change passed six discovery checks plus the 42 engine and seven security checks. Other dedicated suites exist for budgets, journey timing, accommodation, transport, edits, calendar integrity, providers, readiness and database behavior. These counts describe separate suites/runs, not a single fresh exhaustive end-to-end certification.

A prior live booked-trip sample successfully saved/reopened and retained pins/fares through revision v2. A transient generation connection failure occurred once and succeeded on manual retry; its underlying cause was not established. Do not attribute it to Render startup without logs. New stay/transfer/cache increments have GitHub push evidence; exact production rollout and signed-in live acceptance remain unverified in this handoff.

Required baseline: npm run typecheck, npm run lint, npm run test:auth in web; python test_api.py and python test_auth_security.py in root. Run relevant dedicated suites for changed contracts. Check each exit code; a later successful command must not hide an earlier failure. Some sandboxed lint/build runs have stalled; retry with appropriate execution permissions and report evidence accurately.

## 10. Next steps in dependency order

### Release gate A — establish the deployed baseline

Confirm GitHub SHA, Vercel deployment and Render rollout. Check /health and /ready, then the live schema. Verify database functions/migrations match code. Run signed-in generate → edit → save → reopen → restore with a clearly named test trip. Confirm two-account isolation and session-expiry behavior. Record exact commit, timestamps, scenario and observed failures. Fix blockers before widening scope.

### Increment B — transfer fare accounting

Define versioned user-reported arrival/return transfer costs, whole-group units, paid amounts and unknown-vs-zero semantics. State these are terminal↔base legs outside daily base↔attraction travel. Reserve costs exactly once in combined cap; preserve destination cap meaning. Update backend request, solver allowance, independent verifier, frontend totals, export, save/reopen/edit validation and tests together. Do not blindly add a transport suggestion fare to booked fare totals. Acceptance: prepaid/unpaid transfers, unknown fare, exhausted cap and edited itinerary all reconcile.

### Increment C — real-place candidate admission

Reuse free-provider discovery and one search UI. Separate discovery records from optimizer-ready records. Deduplicate provider/catalog aliases. Obtain user confirmation for missing scheduling facts and preserve mandatory pins. Add an explicit reviewable candidate pool; optional confirmed candidates can supplement pins. Do not feed every nearby listing into the solver with invented hours or fees. Define supported-city expansion and base/hotel behavior before claiming new destinations.

Acceptance: multiple real attractions and a restaurant → estimate confirmation → generate → no missing pins → save → reopen → edit. Provider failure must preserve prior choices and disclose any curated fallback.

### Increment D — useful meal and day planning

Select confirmed real restaurants near routes; reserve service/meal windows and travel, check preferences without pretending dietary verification, prevent duplicate meal costs and handle arrival/departure days. Preserve base meal-block fallback as arrange-your-own when no evidenced venue fits. Explain unfilled days.

### Increment E — stay/terminal realism

Add explicit stay dates, terminal/base coordinates, check-in service/luggage assumptions, travel nights and robust connection conflicts. Integrate a permitted free routing provider only after checking limits and terms. Keep estimated vs routed times visible. Current check-in/out bounds and user-entered transfers are foundations, not full logistics.

### Increment F — presentation acceptance

Desktop/mobile layouts, keyboard focus, accessible labels, loading/error states, retry/cancel, exports, map recovery, offline handling, narrow timelines and cold-start behavior. Rehearse one complete good path and one honest infeasibility path. A presentation should show current coverage and limitations plainly.

### Later roadmap

Provider-supported ratings/photos/reviews and dated hotel offers where free permitted access exists; privacy/terms completeness; dependency/security audit; performance benchmarks; distributed quotas if needed; cloud collaboration and expenses under RLS; optional intent parsing that never invents itinerary facts; PWA/native only after web maturity. Payments, booking transactions and realtime rooms should not delay the core release.

## 11. Latest important pushed commits

- a103b4a: bounded repeat-discovery cache.
- 2bd05ce: separate terminal transfer durations.
- 3c756f5: optional booked-stay sightseeing bounds.
- 71b1205: unknown stay facts preserved and handoff claims corrected.
- 6e92606: stay/metadata fields and accessibility labels; scope subsequently corrected.
- a9f4f75: combined budget enforcement and better network feedback.
- 65fdf01: booked journeys and ticket paid/balance accounting.
- bdaa8d6: mode choices and honest unknown return fares.
- 00efe8c: editable destination and unified real-place pinning.
- bc4247d: accommodation choices/prepaid scope.
- bbcb265: journey timing and buffers.
- 115e858: confirmed discovered stops, availability and meal reservations.
- ea23d1a: bounded free discovery.

## 12. Copy-ready instruction for Antigravity

Continue TripWeave from main at a103b4a or the verified newer repository HEAD. Read AGENTS.md, engineering_blueprint.md and this handoff. Inspect git status and preserve unrelated work. First establish which commit is deployed and run the signed-in release gate. Then implement transfer-fare accounting as a complete vertical increment across request validation, budget reservation, verifier, UI, exports, persistence and edit reconstruction. Run required and focused checks, fix failures, commit with a descriptive message and push. Continue to real-place candidate admission and restaurant planning only after that gate passes. Use free services only. Missing provider facts must remain unknown or explicitly user-confirmed estimates. Preserve mandatory pins, return only genuinely feasible variants, never bypass RLS or snapshot validation, and never represent fields/UI as a completed provider integration. Report exact changes, tests, live evidence, limitations and next gate. Do not rewrite the stack, fabricate hours/prices/reviews, or mark all features complete from passing unit tests.
