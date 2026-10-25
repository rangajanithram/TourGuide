# Road routing and travel/stay timing

Implemented 25–26 October 2026. This is an extension of the existing web planner,
Python optimizer and independent verifier. It needs no database migration.

## User flow

1. Enter the trip dates. They may include dates used only for travel or rest.
2. Optionally enter all four intercity travel times in India time. Enter the
   station/airport transfer time and extra time for luggage, rest and boarding.
   The initial 45-minute rest and 90-minute boarding buffers are editable
   planning estimates, not operator requirements.
3. For a booked stay, optionally enter both actual stay dates. Enable the room
   timing constraint to start after check-in and return before checkout. Add
   check-in/rest and packing/checkout time if needed. Otherwise arrange luggage
   storage yourself; unknown storage remains visibly unconfirmed.
4. In Travel style, optionally enable road travel estimates. This discloses that
   candidate and base coordinates are sent to Geoapify. It is off by default.
5. Generate a plan. Read Travel times and Arrival, departure and stay. Road
   evidence and fallback estimates are distinguished and the checking time is
   shown when road evidence actually covers selected legs.
6. Save and reopen normally. Regenerate older saved plans to apply the new
   rules; reopening alone does not replace an existing itinerary.

## Road evidence and free limits

`tripweave/routing.py` uses the existing server-only `GEOAPIFY_API_KEY` and the
Geoapify Route Matrix endpoint. There is no new paid subscription or public key.
Use a Free provider project with its provider-side quota enforced. Geoapify's
published Free allowance is 3,000 credits/day shared across that project's APIs;
the application must not be mistaken for an independent provider billing cap.
See the [provider pricing](https://www.geoapify.com/pricing/) and
[matrix contract](https://apidocs.geoapify.com/docs/routing/route-matrix/).

- At most 25 coordinates / 625 cells per matrix. All optimizer candidates stay
  available; large catalogs route a subset prioritizing bases and required
  stops. Other legs retain labeled estimates.
- Default `ROUTING_DAILY_CREDITS=1000`, allowed range 0–1500. Set 0 to stop new
  provider requests. The budget is process-local, resets at UTC midnight and
  resets on process restart. It is an extra guard, **not a durable quota shared
  across workers**. Provider-side limits remain the final guard.
- Each request conservatively reserves the documented baseline plus one extra
  credit per cell. Uncertain/failed calls are charged locally, never refunded.
  HTTP 402/429 exhausts that process's allowance. A 60-second failure cooldown
  prevents immediate retries across variants.
- Successful matrices are cached in memory for 30 minutes, up to 32 entries.
  Cab and auto reuse the driving profile; subsets can reuse a larger matrix.
  No matrix is written to the database or sent back to the browser.
- A six-second timeout, bounded response size and strict numeric/matrix checks
  reject malformed responses. Missing configuration, timeouts, provider quota
  errors and uncovered legs fall back to the existing distance estimate.
  An explicit provider response that a leg is unreachable remains infeasible;
  it is not replaced by an invented direct road.
- Drive uses approximated traffic, a speed cap and conservative pickup/speed
  assumptions. Walk uses walking routes. Auto access and fares are estimates;
  metro remains a general travel estimate, not a verified train route.
- Provider exceptions and URLs containing the key are not logged. Consent is
  retained with planning preferences. Provider matrices are request-scoped and
  are refetched/cached server-side for edits; browser matrices are not trusted.

The optimizer, route cost calculation, totals, fatigue and Stage 8 verifier use
the same directional evidence. Each resulting plan records how many actual
legs used road data versus distance estimates. Map lines are stop connections,
not navigation geometry. This does not provide live traffic, booked fares,
confirmed station-to-hotel transfers or intercity routing.

## Calendar and stay rules

`tripweave/availability.py` derives a separate usable window for each trip date.
Arrival transfers and rest are reserved before sightseeing. Return transfers
and boarding time are reserved after sightseeing. Check-in processing follows
arrival readiness; packing precedes the earlier of checkout or departure from
base. These sequential processes cannot consume the same buffer twice.

A fully unavailable boundary date remains a travel/rest day, with no automatic
visits or meals. At least one usable sightseeing date is required. Meal slots
use the same date-specific windows. The independent verifier also checks travel
from the base to the first stop and the return to base against those windows.

Lodging estimates count destination nights, including nights outside the shown
sightseeing dates. Explicit booked dates must cover those nights. A no-stay
choice adds no lodging charge, but warns when an overnight arrangement is
needed. Room inventory, capacity, luggage storage and bookings are not verified.

The frontend mirrors the calendar preflight, directs errors to travel/stay
sections and uses the existing custom date/time controls. Catalog capability
flags hide unsupported new controls during a rolling backend deployment.
`availability_version=2` identifies newly built plans; old snapshots and legacy
undated stays remain readable. Room/static-copy day notes include the generic
travel basis without adding private booked-stay fields to their projection.

## Validation and release checklist

Install test dependencies with `python -m pip install -r requirements-dev.txt`.
The added httpx dependency is for FastAPI's in-process authenticated test client,
not the production server. On this Windows sandbox that test runner needs local
socket access to initialize its event loop; a blocked socket is not an API hang.

Regression coverage includes directional/asymmetric routes, timeout/malformed/
quota fallbacks, no-key/no-consent requests, cache/subset reuse, unreachable legs,
large catalogs, authentication, variant verification, nested saved preferences,
travel nights, closed boundary dates, sequential stay buffers and stale-plan
rejection. Existing pin, budget, meal, edit/rebalance and authorization suites
remain release gates.

Local validation passed: 121 Python unittest cases (including the authenticated
API generation test), all 42 checks in `test_api.py`, all 7 auth/security cases,
80 web auth/planner tests, TypeScript checking, lint with no warnings, and a
production Next.js build. Provider responses in routing regressions are
controlled fixtures; a real provider call is a separate deployment check.

Before release run the full Python unittest suite, `python test_api.py`,
`python test_auth_security.py`, web typecheck/lint/auth tests and the production
build. After push, verify Vercel's production commit and the Render catalog's
`availability_version=2`, `routing_supported` and `routing_configured` flags.
Live provider evidence must be distinguished from deterministic stubbed tests.
Do not claim a provider call was verified merely because a fallback plan passed.
