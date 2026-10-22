# Planner controls, discovery and itinerary readability

## Changes

- Exclude radios from text-field CSS; use 18px selection controls and a balanced
  two-column accommodation layout, stacking on small screens.
- Fetch nearby real listings when Places & food opens. Prioritize live matches,
  retain selected pins, and label reference catalog fallbacks explicitly.
- Replace the native category dropdown with accessible filter buttons. Replace
  meal-window selection with the existing themed select.
- Keep autocomplete responses scoped to destination/category/query, cancel stale
  requests, debounce typing, and skip provider requests for 1–2-character queries.
- Reuse destination geocoding for five minutes across category/name searches.
  Existing daily provider request caps remain active.
- Display planning errors at readable sizes with recovery guidance.
- Separate outbound and return cards, transfer guidance and the cost breakdown.
- Use compact responsive day columns, smaller progress markers, wrapping action
  buttons and expandable viewpoint details. Preserve all schedule/cost data.
- Explicit planner foreground colour prevents inheritance from the dark app theme.

## Evidence

Type checking, lint, production build, 48 frontend regression tests, 42 optimizer
checks, 7 authentication-security tests and 6 discovery tests passed. Additional
mock-provider checks confirmed destination bounds and geocoding reuse across
category changes. Actual rendered React components were inspected in a temporary
local browser preview for radios, notices, transit cards and daily timelines.
The preview was removed and is not deployed.

Live provider responses and deployment acceptance have not been certified by the
local preview. Geoapify must be configured on Render and have remaining quota;
provider failures are shown honestly rather than described as live listings.
