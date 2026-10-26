# Planner search recovery — 26 October 2026

## Report and cause

The reported request is Bengaluru → Hyderabad, 2–4 November 2026, two travelers,
₹15,000 destination budget, balanced pace, cab, no required places, and interests
in history/sunset/UNESCO. The existing browser form also has road routing enabled.
The error used to say no feasible itinerary could be found, with no explanation
of the difference between a failed search and a proven constraint conflict.

The solver had only a two-second bounded search and no initial checked route.
The larger catalog and fixed daily meals made constructing its first solution
less reliable, especially on a slower host. Some automatic dinner choices also
failed to leave time for the return to base. The same visible request could
succeed locally while other variants failed. The old error did not preserve the
engine status, so the screenshot alone cannot prove which status occurred live.

## Changes

- `initial_routes.py` builds a bounded initial route from the same actual
  directional time/fare matrices used by the optimizer. It retains fixed meals,
  pins and prerequisite stops, accounts for weekly closures, per-date travel/stay
  windows, pace, transport caps and the whole plan budget. It adds nearby useful
  attractions before improvement starts. All candidates remain in the solver.
  This heuristic is not a feasibility proof; if it cannot construct a route the
  normal solver still runs.
- OR-Tools validates that complete assignment against its model. Improvement
  starts from the valid assignment. A valid seed remains usable if improvement
  times out. Every resulting itinerary still passes the independent verifier;
  no user constraints are loosened and no travel evidence is invented.
- Waiting for an afternoon opening is allowed inside the real daily window;
  the old arbitrary two-hour waiting cap is removed.
- Automatic meal venues must be reachable before their meal window closes and
  leave time to return to base by the daily deadline. Otherwise an honestly
  unnamed meal block is used. No venue or confirmed booking is fabricated.
- A stay-and-meals cost lower bound gives a specific 422 explanation when those
  costs already exceed the budget, identifying Journey or Places & food → Meals.
- A proven `ROUTING_INFEASIBLE` result remains a constraint error. Timeouts and
  searches without a solution use `503 / planner_search_incomplete`, with a
  three-second Retry-After header. Model-invalid errors are internal errors.
  Server logs keep status/counts without coordinates, account IDs or credentials.
- A failed search for one variant does not discard other verified variants. If
  every variant fails and any search is incomplete, the response is retryable,
  rather than claiming the user's constraints are impossible.
- The web client recognizes the search response, gives matching guidance, and
  offers a manual retry of the last submitted trip/revision request. No costly
  POST is retried automatically. Form entries and existing saved trips remain.

The implementation follows the distinction in the
[OR-Tools search-status contract](https://developers.google.com/optimization/routing/routing_options)
and its supported
[initial-route API](https://developers.google.com/optimization/routing/routing_tasks).
It makes no global-optimum guarantee. Existing road-provider/free-limit controls
are unchanged; no database migration or new service is required.

## Validation

The 138-case full Python suite passed, including road-enabled search recovery,
along with 81 web tests, the 42-check API script, 7 auth/security cases, TypeScript
checking, lint and an isolated production build. Tests cover the exact visible
trip, inflated directional road inputs, improvement timeouts with preserved pins,
unknown versus proven failures, partial variant success, unreachable meals,
afternoon waiting, rejected empty seeds, budget explanations and safe web error messages.

Local reproduction now produces verified feasible variants within ₹15,000.
The catalog's `search_recovery_version=1` flag identifies the backend release.
Production capability checks and a browser retry of the unchanged road-enabled
request are separate post-push acceptance steps.
