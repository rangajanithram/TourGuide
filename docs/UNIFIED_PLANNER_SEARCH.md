# Unified planner search fix — 2026-10-14

## Problem and change

Destination inputs were disabled while the venue catalog loaded. City suggestions now have a
separate database-independent endpoint; inputs remain editable and preserve unconfirmed text.
Users must select a city suggestion before generating, preventing a typed city from silently
using the previously selected destination.

Step 3 has one Search and pin a place control. It combines catalog options with debounced
live name searches across tourism, restaurants, parks and hills. Multiple selections persist
as removable pins. The separate discovery category/load/filter form is removed. A live place
with unknown feasibility facts opens a compact estimate confirmation only after selection.

Live queries use Geoapify's documented name filter:
https://apidocs.geoapify.com/docs/places/
Requests are bounded to 20 results within 15 km, wait 900 ms after typing, cancel obsolete
responses, and retain at most ten successful queries in component memory. Existing auth,
request limits and daily provider allowance remain enforced. Errors and retries are visible;
catalog matches remain usable when live search fails. Nearby catalog/live duplicates with
matching names are suppressed. Restaurant identity is preserved for food preference checks.

Interests are displayed together, combining destination tags with supported interest labels.
These are soft ranking preferences, not a promise of corresponding venues in every city.

## Verification

Passed typecheck, lint, 42 engine checks, 7 auth/security checks, 6 discovery checks,
3 live-planning checks and 38 frontend/auth/persistence checks (96 automated checks).
A local browser scenario with delayed mock catalog/city responses confirmed editable typing,
keyboard selection, two retained pins, unified interests, no page JavaScript errors, and no
horizontal overflow at 390px. The temporary browser fixture was removed before commit.
Provider tests validate request mapping against mocked responses; signed-in production
Geoapify access and deployment readiness were not verified in this increment.

## Still pending

Full worldwide destination planning, automatic discovery of additional optimizer candidates,
canonical place details/evidence, road-based routes, and real meal venue planning remain
separate milestones. This change unifies user selection and does not claim those are complete.
