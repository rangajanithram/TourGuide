# TripWeave implementation gap analysis

Audit date: 13 October 2026 (Asia/Kolkata). Repository baseline: `115e858`.
Reference: `docs/TripWeave_Master_User_Flow_and_Engineering_Plan.md`, version 1.0.

## Scope and evidence

This is a repository inspection, not a new live acceptance test. The new master plan was read alongside the current frontend, backend, provider contracts, migration sources and tests. Previous user-confirmed live save/reopen/account-isolation flows remain historical evidence; production deployments, provider credentials, current venue facts and signed-in browser behavior were not reverified during this audit. No application code or existing specification was changed. Tests were not rerun for this documentation-only review.

Status definitions: **Implemented** means present in inspected code; **Partial** means only part of the target behavior exists; **Missing** means no matching implementation was found; **Unverified** means runtime/provider acceptance still needs evidence. These are not percentages of project completion.

## Main finding

The existing web application should be extended. Authentication, snapshot/version persistence, local constraint scheduling, independent verification, up to three variants, maps, export and edits are foundations worth retaining. The largest missing capability is a shared journey scenario that links departure transport, destination arrival, accommodation logistics, sightseeing, meals and return transport.

Today `_build_single_plan` schedules destination activities and chooses a base, then adds intercity advice. The master plan requires upstream travel and stay choices to influence availability, nights, transfers and budget, and be reconsidered if the local plan fails. A live POI search alone does not close this gap.

## Governance and decisions

1. AGENTS.md and `engineering_blueprint.md` remain authoritative under repository rules. The master plan is the comparison target and proposed expanded behavior. Conflicts require a reviewed blueprint amendment, not silently changing the architecture or product specification.
2. The user has already selected **free services only**. Do not ask again or enable Google billed APIs/paid plans. Geoapify free-plan access is the current discovery path, with quotas and attribution. Outbound Maps links are a separate capability.
3. The user has authorized **clearly labeled user-confirmed planning estimates** for missing scheduling facts. Preserve that path; do not relabel them as verified data.
4. Current budget scope explicitly excludes intercity travel and taxes. The master plan proposes selectable total journey scope. This is a contract change, not a label-only UI edit.
5. Current dates mean sightseeing dates, with limited first/last-day local availability. Travel dates and exact timezone-aware departure/return timestamps are separate missing concepts.
6. The new document's phase numbers are not the same as existing blueprint roadmap stages or optimizer pipeline stages. Do not call its Phase 3 complete because the solver already has a Stage 3.

## Screen-by-screen comparison

| Master screen | Current implementation | Status | Remaining behavior |
|---|---|---|---|
| A: quick intent | Journey step: supported origin/destination cities, dates, party count, destination budget | Partial | Address/station identity, adult/child composition, travel-date semantics, exact departure/return windows, budget scope, allowed intercity modes, booked travel |
| B: style/physical feasibility | Group profile, pace, local mode, visit cap; climbing question only with catalog evidence | Partial | Walking/transfer limits, explicit accessibility, luggage, wake-up/energy, overnight preference, conditional mode questions |
| C: discover/lock | Catalog combobox plus live Geoapify category lists, mandatory/optional user-confirmed stops | Partial | Server place-name search, detail view, location map confirmation, licensed photos/ratings when available, custom place flow, fixed-ticket times, preflight capacity check |
| D: food/experience | Interests, surprise mode, dietary enum/evidence filtering, optional reserved meal blocks | Partial | Strict vegetarian-only versus mixed kitchen, Jain/allergen rules, per-meal opt-in, included hotel breakfast, actual meal venue selection, interest priority/exclusions |
| E: travel/stay choices | Result includes curated intercity options and a selected hotel | Partial | Choose/lock transport before generation; choose hotel, existing accommodation/no hotel, luggage/check-in/out scenarios |
| F: final review | Four-step summary, local arrival/departure availability, generation | Partial | Review selected transport/stay, exact dates/timezones, conflicts and data uncertainty before solve |
| G: full journey result | Local day timelines/map, costs, assumptions, variants, export, saved revisions/edits | Partial | Departure-to-return timeline including terminal transfers, booked legs, wait/check-in/out, scenario switching and unified journey cost |

## File-by-file implementation gaps

### Frontend routes, intake and discovery

| File | Present evidence | Gap / proposed change |
|---|---|---|
| `web/src/app/page.tsx` | Guide entry flow | Preserve entry; no journey-engine change needed here |
| `web/src/app/guide/page.tsx` | Public explanation route | Update explanatory claims after actual journey capabilities ship; do not promise live tickets or worldwide verified planning |
| `web/src/components/guide/JourneyGuide.tsx` | Interactive guide and planner access | Add accurate explanation of travel versus sightseeing dates, source statuses and free-provider limits |
| `web/src/app/planner/page.tsx` | Server verified-user gate and existing PlannerPage | Preserve gate; eventually restore a typed journey draft alongside preferences |
| `web/src/components/TripForm.tsx` | Four progressive steps, supported-city catalog, dynamic discovery, pins, optional stops, user estimates, local time bounds and meal budget | Add versioned journey intake, allowed intercity modes, exact travel windows, budget scope, stay requirement and conditional questions. Keep four top-level steps |
| `web/src/components/PlaceSearch.tsx` | Client-side filtering of loaded options | No provider-backed name query or global destination identity resolution. Keep for small catalogs; add bounded server search rather than calling public Nominatim autocomplete |
| `web/src/components/PlannerDiscovery.tsx` | Loads category results within destination; filters locally; user confirms duration/cost/window; hard/soft selection | Only a bounded fetched list, not comprehensive Hyderabad name search. No provider detail/map confirmation, access facts or canonical city validation. Uses DOM IDs/uncontrolled estimate fields; replace with scoped typed draft state for reliability and accessible error association |
| `web/src/components/DiscoveryPage.tsx` | Standalone authenticated worldwide category discovery | Does not establish worldwide planning feasibility. Extend details/shared place-selection model; avoid duplicate discovery state/validation |
| `web/src/app/discover/page.tsx` | Verified-user route and noindex metadata | Preserve; discovery and supported planning coverage should remain clearly distinguished |
| `web/src/components/PlannerPage.tsx` | Generate/variants transport, reopen, atomic save/revision/restore, estimate and time-field forwarding | Orchestrates local plan only; add draft and scenario selection, cancellation/version guards for scenario changes, and propagation of chosen travel/stay constraints through generation and revisions |
| `web/src/types/trip.ts` | Request/result/persistence types plus confirmed stops and minute-based availability | Add JourneyIntent, JourneyScenario, TravelLeg, lodging choice, typed fact status/provenance and violations; maintain backward compatibility with saved snapshots |
| `web/src/lib/snapshot-validation.ts` | Calendar, costs, coordinates, pinned stop and new estimate checks | Validate future journey legs, timezone/date rollover, hard/soft constraints, scope reconciliation and provenance; test old snapshots rather than rewriting them |
| `web/src/lib/travel-preferences.ts` | Stored travel defaults | Separate reusable preferences from a dated trip's actual selections; extend strict diet/access fields without treating profile age as accessibility evidence |

### Results, map, edits and persistence

| File | Present evidence | Gap / proposed change |
|---|---|---|
| `web/src/components/ItineraryView.tsx` | Vertical stop completion, day cards, cost/check disclosures, estimates, meal placeholders, local edits and export | Real departure/return legs absent. Meal reservations are at base with venue unspecified. Browser expense/check-off state is separate from trip versions. Add scenario/status presentation and avoid calling internal checks world verification |
| `web/src/components/SharedTripOverview.tsx` | Parameter-based overview/settings and outbound parameter link | Parameter link regenerates settings; it is not an authorized shared saved plan and does not encode full new journey intent. Rename/explain or implement scoped sharing later |
| `web/src/components/VariantSwitcher.tsx` | Selects available distinct Budget/Balanced/Comfort plans | These are local itinerary variants, not alternate transport/stay scenarios. Comparison should show consequential travel/stay choices and consistent cost scope |
| `web/src/components/MapComponent.tsx` | Leaflet route overlays, attribution, tile failure/retry and day filtering | Lines are schematic straight connections, not road geometry. Add terminal/base anchors and route legs only from a compatible licensed routing source |
| `web/src/lib/map-tiles.ts` | Configurable tiles and required attribution | Keep; provider uptime/production quota not guaranteed. No tile bulk/offline caching |
| `web/src/components/EditConsequenceModal.tsx` | Stop edit preview/consequences | No transport/hotel/fixed-ticket edits; add dependency-aware replanning after new journey contracts exist |
| `web/src/components/LiveRebalanceModal.tsx` | Day fatigue rebalancing | Must account for protected travel, meals, fixed appointments and selected base; existing verifier can reject conflicts but does not create a complete journey replan |
| `web/src/lib/trips-service.ts` | Owner-session queries, atomic RPC saves/revisions, pagination/conflict handling | Saves completed snapshots, not independent editable journey drafts/jobs. Preserve RPC behavior; add additive draft support only if needed |
| `web/src/components/TripsListClient.tsx` | Saved trip list, rename/delete/reopen/history | Show journey dates versus sightseeing coverage and scope/status when introduced; keep existing operations |
| `web/src/components/GroupExpenseModal.tsx` | Browser-local expense ledger and explicit settle action | Not cloud group collaboration/payment confirmation. Master plan does not require this for next milestone; keep outside journey-critical scope |
| `web/src/utils/calendarExport.ts` | Local activity export/share text | Export timezone-aware travel/check-in/transfer events and uncertainty without implying bookings |
| `web/src/app/globals.css` | Responsive results, intake, disclosure and discovery styles | Retain layouts; browser-check new conditional panels and detail cards at mobile widths, keyboard focus and zoom. Do not restart a global visual redesign |

### Backend intent, scheduling and evidence

| File | Present evidence | Gap / proposed change |
|---|---|---|
| `tripweave/models.py` | Typed local request, confirmed external stops, 08:00-20:00 availability, per-meal estimate, result/verification contracts | No exact timezone-aware journey legs, allowed intercity modes, budget scope, accommodation choice, ticket-fixed times, luggage or fact-by-fact uncertainty. Some Place defaults still use curated status/review date; replace defaults with unknown in a reviewed migration/compatibility change |
| `tripweave/main.py` | Authenticated generate/edit/rebalance endpoints; bounded concurrency/rate limits; merge selected live stops; meals; post-generation transport summary | Major scenario coupling gap. Discovering places does not automatically provide a verified candidate pool. No durable idempotent generation jobs, preflight capacity or upstream choice reconsideration |
| `tripweave/discovery.py` | Geoapify geocoding/category adapter, 20 results/15km, named coordinates, timeout/body bound, sanitized errors, process-local allowance | No name query/details/media/capability contract, stable normalized provenance or account-wide credit budget. Search retrieval time is not venue review time. No geospatial match of confirmed request to destination on backend |
| `tripweave/provider.py` | JSON catalogs, Hyderabad Supabase catalog, merge of user-confirmed estimates | Dynamic additions are user-confirmed inputs, not independently verified provider facts. Auto recommendation mostly draws from existing catalog plus confirmed optional stops. Add normalized candidates, canonical identities, deduplication, evidence reliability and permitted freshness rules |
| `tripweave/geocoding.py` | Fixed known city/hub coordinates and aliases | No arbitrary address/station resolution, ambiguity UI or timezone contract. Preserve reference hubs as labeled fallbacks |
| `tripweave/transport.py` | Curated train/bus/flight records, indicative fares, weekday metadata, outbound/return last-mile guidance | No actual departure/arrival datetime, allowed-mode filter from user, seat inventory, booked leg contract, own-drive scenario or selected option lock. Reference data needs cited schedule evidence and freshness |
| `tripweave/feasibility.py` | Day-trip base; nights=days-1; hotel room/guest budget checks and centroid/commute score | No no-hotel/family/already-booked overnight choice; nights depend on local days rather than journey dates. No terminal transfer/check-in/luggage or whole-route hotel trade-off evaluation |
| `tripweave/distance.py` | Cached Haversine plus road-curvature/speed/fare estimates | No road/transit network matrix, traffic/one-way streets, supported time-dependent routing or explicit matrix source/expiry. Current geometry cannot certify realistic road duration |
| `tripweave/clustering.py` | Geographic clustering and workload balancing | Add travel-day capacities, protected appointment/meal/transfer windows and matrix-aware group evaluation; geographic clusters should not force one calendar day |
| `tripweave/optimizer.py` | OR-Tools sequencing, hours/closures, pins, pace, costs, first/last-day bounds and daily reserved meals | Availability applies at base; no actual terminal-origin legs or hotel check-in. Meal blocks use base coordinates, not chosen restaurant routes. Hard mode exclusions/fixed bookings must survive variant construction. No coupled scenario search |
| `tripweave/verifier.py` | Independent timeline, costs, pins, closures, preferences, availability and reserved-meal checks | Checks assumptions, not world truth. Add travel/transfer/wait/check-in/checkout invariants, transport dates/modes, hotel nights and full budget scope. Add FEASIBLE_ESTIMATED/NEEDS_CONFIRMATION versus independently verified facts |
| `tripweave/editor.py` | Edit/rebalance verification reuses confirmed stops, meal records and preferences | No alternate train/hotel dependency graph. Reserved meals remain protected through checks; actual venue substitution/movement needs accounting and constraints. Test new inputs through edit/save/reopen/restore |
| `tripweave/preferences.py` | Duration/climbing and documented vegetarian/vegan/halal filters; own-meals | No vegetarian-only kitchen/Jain/allergy/cross-contact semantics. Reserved base meal blocks bypass venue suitability because no venue is selected; never present this as dietary certification |
| `tripweave/weather.py` | Open-Meteo short-range forecasts, bounded cache and seasonal fallback | No full provider evidence envelope/explicit fetched time in plan; seasonal fallback is broad, not city-specific climate verification. Verify free noncommercial use/attribution before wider launch |
| `tripweave/solar.py` | Date/coordinate golden-hour math | Geometry does not prove view quality or venue access. Add local timezone handling for expansion and explicit viewpoint evidence; retain calculation |
| `tripweave/crowd.py` | Heuristic crowd forecast | Not live popularity. Show heuristic provenance/confidence; avoid presenting seed/default crowd numbers as observed facts |
| `tripweave/fatigue.py` | Group-profile workload estimates | No travel sleep deprivation, luggage, arrival energy, user walking limits or individualized accessibility contract |
| `tripweave/explainability.py` | Decision trace for local hotel/pacing/exclusions | Extend to scenario trade-offs, scope and missing facts; explain exclusions and relaxation choices without inventing causal facts |
| `tripweave/config.py` | Provider selection, public auth config, server Geoapify key/request allowance | Add per-provider capability/config validation and usage controls if new adapters ship; free-only decision remains binding |

### Authentication and data safety

| File | Present evidence | Gap / proposed change |
|---|---|---|
| `tripweave/auth.py` | Supabase identity verification and rejection of unverified/anonymous users | Preserve; future trip-ID APIs must also verify ownership, not merely bearer identity |
| `web/src/lib/require-user.ts` | Server verified-user gate | Preserve for new drafts/scenario routes |
| `web/src/lib/auth-service.ts` | Verification, OAuth and recovery workflows | No journey-specific rewrite needed; live configuration acceptance is separate |
| `web/src/context/AuthContext.tsx` | Session/user refresh and sign-out flow | Preserve; verify cancellation/private draft handling on sign-out |
| `web/src/middleware.ts` | Private/no-store, noindex and route coverage including discovery | Add any new private routes; parameter links still need privacy review before claiming secure sharing |
| `web/src/lib/planner-fetch.ts` | Session bearer forwarding and unauthorized redirect | Preserve; extend typed provider errors and bounded calls for scenario queries |
| `web/src/lib/planner-network.ts` | Configuration checks, bounded fetch and retry/backoff guidance | No durable job progress/resume; add when a measured need exists rather than speculative infrastructure |
| `supabase/migrations/20261009152206_auth_account_isolation.sql` | Profiles and account ownership policies | New drafts/jobs/choices require ownership foreign keys and RLS; do not change auth identity authority |
| `supabase/migrations/20261010183000_saved_trips_and_plan_versions.sql` | Saved snapshots, immutable versions and atomic RPC functions | Keep working snapshot/version model. Normalized day/leg tables are a design proposal, not a prerequisite for intake. Reconcile local/hosted migration history before future migration deployment |
| `supabase/migrations/20261012135830_hyderabad_place_catalog.sql` | Published read-only catalog, source URLs/review date fields; seed import | Imported data is estimated, not researched. No field-level facts, provider rights, licensed photo credits or dietary verification records |
| `data/*_mock.json` | Supported-city seeds including hotels and venues | Review source/fee/hour validity; do not imply that moving seeds to Supabase removed hardcoded data |
| `data/` transport references | Curated transport input to transport.py | Require actual published source URLs/review timestamps for semester journey scenarios; no live inventory claim |
| `render.yaml` / `web/next.config.mjs` | Existing Render backend and Next deployment/build setup | Backend and frontend must deploy independently; current production readiness is not established by a frontend build alone |

## API comparison

| Current API | Existing role | Target gap |
|---|---|---|
| `GET /api/planner/catalog` | Supported cities, catalog places and questions | Full destination identity, typed capabilities and source statuses |
| `GET /api/places` | Curated catalog | Not a comprehensive name search/details service |
| `GET /api/discovery` | Authenticated live category discovery | Dedicated name/detail queries, city confirmation and precise errors/capabilities |
| `POST /api/itinerary/generate[-variants]` | Synchronous local solve under verified identity | Scenario-aware intake, idempotent generation and budget-scope status |
| Existing preview-edit/rebalance endpoints | Local edit consequences and independent verification | Travel/hotel selection changes and dependency-aware partial replanning |
| Supabase saved-trip/version RPCs | Owner-scoped atomic persistence | Additive journey-draft persistence; no need to replace RPCs with the proposed REST names merely for stylistic consistency |
| Missing | Transport option selection, hotel selection, draft and job status APIs | Introduce only as milestones require; every trip-specific endpoint needs owner authorization |

## Highest-priority gaps and concrete risks

- **P0:** Travel option cannot alter arrival date/nights/activity capacity; a correct local plan can still represent an impossible door-to-door journey.
- **P0:** On-ground budget and sightseeing dates are not a round-trip budget/travel-date contract. Copying the master plan wording without changing contracts would mislead users.
- **P0:** New request fields are user-confirmed estimates; backend does not revalidate provider identity/location. Clearly label source and validate destination/duplicate identity before treating a listing as an authenticated provider fact.
- **P1:** No-hotel overnight trips and booked transport/base choices are absent.
- **P1:** Dietary enum cannot establish exclusively vegetarian, Jain or allergen-safe venues. Unknown must stay unknown.
- **P1:** No usable backend place-details path or name-search contract; current dynamic browser list is bounded and locally filtered.
- **P1:** Meal slots are protected but not actual restaurant recommendations; terminal meals and included hotel breakfast are not modeled.
- **P1:** Source/checked/expiry/status are not a shared field-level fact contract. A single score cannot certify price, access or schedule accuracy.
- **P2:** Process-local quotas reset/repeat across workers; no account-wide usage enforcement or measured API spend. Do not claim a zero-charge guarantee from the application counter.
- **P2:** No evaluated road-based routing or user-study comparisons/latency benchmarks supporting the master plan's quantitative targets.

## Minimal first implementation milestone (proposal, no code changes yet)

**Journey intake and scenario contract, retaining the four screens and local solver.** Build the Bengaluru-to-Hyderabad example using explicit user-provided/curated-reference transport, not commercial inventory APIs.

Files to change first:
1. `docs/engineering_blueprint.md`: propose reviewed date, budget, evidence-status and journey contract amendment; preserve product_spec.
2. `tripweave/models.py`: additive versioned JourneyIntent/TravelLeg/BudgetScope/StayChoice definitions; exact timezone-aware timestamps; distinguish sightseeing coverage from travel dates.
3. `web/src/types/trip.ts`: mirror the request/response contracts.
4. `web/src/components/TripForm.tsx`: date/scope/mode/stay inputs, already-here/self-arranged/booked paths and conditional questions; keep advanced inputs expandable.
5. `web/src/components/PlannerPage.tsx`: forward and restore journey intent without losing existing pins/confirmed estimates.
6. `web/src/lib/snapshot-validation.ts`: version handling and old-snapshot compatibility; no destructive snapshot rewrites.
7. `tripweave/main.py`: validate and expose a bounded journey preflight response with missing facts and conflicts; do not call it a coupled final optimizer before that exists.
8. `web/src/lib/trips-service.ts`: preserve intent in new saves; introduce dedicated editable drafts only with a real autosave/restore requirement.
9. `test_live_planning.py`, `test_api.py`, `web/tests/auth.test.cjs`: add round-trip/sightseeing-date distinctions, overnight rollover, budget scope and backward-compatible save/reopen tests.
10. A new migration only if a separate user-owned drafts table is selected. Create it using the Supabase CLI, auth.users foreign key, RLS and atomic version rules. JSON snapshot additions alone do not need new normalized tables.

Exit gate: a user can enter a Bengaluru departure, Hyderabad arrival, local dates, return deadline, explicit allowed modes and budget/stay scope; review exact dates/timezones/unknowns; save/reopen these choices; legacy saved trips still work. Do not represent external bookings as verified. This milestone prepares the scenario engine; it does not claim to deliver all master-plan features.

## Subsequent increments and acceptance gates

| Order | Increment | Minimum acceptance |
|---|---|---|
| 2 | Canonical POI search/details and field-level evidence | More than five distinct real Hyderabad stops, correct identity/map confirmation, known/unknown/user-supplied labels, no fabricated photos/reviews |
| 3 | Strict food/access rules and venue-linked meals | Mixed/unknown kitchen never certified as vegetarian-only/Jain/allergen-safe; only compatible sourced or explicitly user-accepted venue suggestions |
| 4 | Coupled curated/user-booked journey scenarios | Morning versus overnight travel changes arrival date, usable day-1 time, nights, buffers and costs; allowed modes/locks survive alternatives |
| 5 | Stay choices and route-aware base comparison | No-hotel/family/booked stays work; terminal transfers/check-in/out/bag storage remain explicit; compare full cash/time impact |
| 6 | Compatible road matrix and full journey verifier | Sequencing accounts for actual leg-to-leg travel; transfers/meal venues/return terminal satisfy fixed times; honestly classify estimated feasibility |
| 7 | Presentation acceptance and evaluation | Signed-in Bengaluru-Hyderabad generation/save/reopen/edit/restore; mobile/keyboard/outage checks; measured baselines on the same travel matrix |

## Tests: what exists versus what must be added

Existing test assets include `test_api.py`, `test_auth_security.py`, `test_stage2_edits.py`, `test_rebalance.py`, `test_calendar_integrity.py`, `test_planner_preferences.py`, `test_catalog_provider.py`, `test_discovery.py`, `test_live_planning.py`, `test_stage2_database.py`, `web/tests/auth.test.cjs` and `supabase/tests/`. These cover important local solver, auth/persistence, pin, estimate, meal reservation and provider guardrails. Their existence does not prove the complete master journey.

Missing acceptance coverage: night/morning travel changes; 05:00 arrival with 14:00 check-in; alternate booked train; overnight no-hotel; strict vegetarian-only/Jain/allergy evidence; actual restaurant meal routing; mode exclusions across variants; old/new journey snapshot round-trip; provider place identity confirmation; full round-trip budget and terminal return buffers; consistent road-matrix baseline comparisons. Run all required AGENTS checks and meaningful new contract tests before claiming each implementation milestone complete.

## Decisions to resolve before the corresponding milestone

Already resolved: web-first Next/FastAPI/Supabase architecture; free-services-only provider budget; explicit user-confirmed estimates allowed; existing persistence to preserve.
Still unresolved: default total versus destination budget; precise travel-date/night semantics; acceptable curated-reference transport evidence; strict versus user-accepted mixed-kitchen dietary policy; independent/booked/family accommodation behavior; authoritative place dataset and review process. Do not ask every question upfront; settle the relevant contract before its implementation batch.

## Audit conclusion

Continue the project on the current architecture. The next priority is a coherent journey intent and scenario contract, followed by credible place/diet evidence and coupled transport/stay scheduling. The master plan expands the product beyond the current local itinerary MVP; it is a useful target, not an accurate description of what already works. No application implementation was changed during this analysis.
