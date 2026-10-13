# Stage 3C - planner-integrated discovery and time availability

Step 3 now loads live Geoapify listings inside the planner. A user confirms visit duration, per-person expense and intended visit window before adding a stop. Coordinates and names originate in discovery, but the request is treated as user-confirmed planning input rather than independently verified provider facts. Estimated stops carry no fabricated review date. Mandatory stops stay pinned; optional confirmed stops join candidate optimization. Existing catalog candidates supplement the confirmed stops.

Arrival availability and departure-day return deadlines constrain the OR-Tools depot windows and the independent verifier. Enter ready-to-start time after check-in and finish-by time before onward transfers. Current daily scheduling runs 08:00-20:00; overnight arrivals/departures and live intercity timetable synchronization are not implemented.

Meal reservations are opt-in and require the user's per-person/per-meal expense estimate. Each applicable day reserves 30-minute breakfast, lunch and dinner blocks at the trip base, constrained by arrival/departure availability and the total budget. These are explicitly labeled "arrange venue" rather than invented restaurant bookings. Restaurant listings can also be added as confirmed visits. Automatic selection of a real venue for each meal, dietary/service-time evidence and travel-to-venue reconciliation remain a further increment.

Confirmed stops and time/meal preferences are persisted in the existing JSON snapshot and reused by edit verification; no SQL migration is required. Generated meal records travel with the plan for reconciliation. The independent verifier rejects missing reserved meals and visits/return transfers outside availability. Meal blocks do not consume the sightseeing pace cap.

Required activation: the existing Render GEOAPIFY_API_KEY setting; redeploy backend and frontend. No new credentials. Verify live selected stop -> generation -> save -> reopen -> edit with a signed-in account before presentation. Live discovery needs the configured free-plan account. This does not replace the curated hotel catalog or enable verified worldwide destination planning.

Tests: deterministic confirmed-pin retention/provenance, arrival/departure windows, multi-day meal blocks and invalid confirmation windows, plus existing optimizer, auth, preferences, edit and snapshot suites. Live provider and signed-in browser acceptance are separate checks.
