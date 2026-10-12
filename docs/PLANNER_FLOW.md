# Progressive planner flow — 2026-10-12

The existing planner now uses Journey → Travel style → Places & food → Review.
The guide, authentication, saved trips and result views remain in place.

## Data and behavior
- GET /api/planner/catalog derives supported cities, place suggestions, interests and relevant question availability from the current provider. No duplicated frontend destination/place arrays.
- City and place inputs filter suggestions as users type; keyboard selection, empty results and a retryable catalog error are included. Selecting a new destination clears destination-specific pins and preferences with a notice.
- Pins remain mandatory. Surprise mode clears interest ranking and lets the optimizer select remaining feasible stops; it never clears pins or guarantees random results.
- max_visit_minutes, avoid_climbing and food_preference are validated in Python and persisted in requests and each plan's planning_preferences. The independent verifier checks these constraints during generation, editing and rebalancing.
- A pinned preference conflict returns HTTP 422 with a remedy. Unknown climbing/dietary metadata is never interpreted as a positive suitability claim.
- Advanced questions are progressively disclosed. Climbing questions appear only where catalog evidence exists. Dietary choices appear only for documented options. Arrange-own-meals excludes scheduled restaurant stops; existing extra-meal estimates remain applicable.

## Current limits
The existing five-city curated catalog is still the source. This is not worldwide live autocomplete. Current seeds do not establish climbing or dietary suitability, so the interface states that gap rather than inventing venue facts. Actual provider integration and reviewed metadata are still needed for those richer questions.
Deploy the updated backend before the frontend: the new form requires /api/planner/catalog and the extended request schema. No database migration is needed for the JSON snapshot fields.

## Verification
- TypeScript and ESLint passed.
- Existing frontend tests: 33 passed; optimizer checks: 42 passed; authentication checks: 7 passed.
- test_planner_preferences.py: 6 passed, including destination-specific suggestions, unknown climbing evidence, dietary filtering, visit duration, pin conflict, serialized preferences and independent verification.
- Isolated browser form check: departure autocomplete with keyboard selection, visit-length selection, place pin, surprise preservation, review and emitted request values passed. Destination change cleared previous pins and destination preferences.
- Checked at desktop and 390px width. Form and summary fit the viewport; the temporary debug JSON output was wider and was removed with the preview harness.
- Initial local development compilation produced a chunk timeout; reloading after compilation succeeded. This is not a production performance measurement.
- Live authenticated generate/save/reopen with these new controls and production performance remain unverified. Changes have not been deployed in this task.
