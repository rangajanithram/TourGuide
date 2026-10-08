# Animated TripWeave guide

## October 8 sketch revision

The guide now uses `NatureRailway.tsx` and `forest.css`: a full-width overhead forest valley, winding railway, mountain passages, and a scroll-following train/camera. Editorial sections alternate sides on desktop, with a stacked layout on phones. Trees and sleepers use instancing, materials/geometries are reused, and the new scene skips drawing once scroll motion settles.

`/welcome`, `/login`, and `/signup` render `AccountWelcome.tsx` with `account.css`. Login has the 3D illustration on the left and form on the right; switching mode animates the panels across the desktop layout. Mobile uses stacked panels. The existing `TravelWorld.tsx` miniature is reused here.

These account forms are explicitly presentation previews. There was no authentication backend in the repository. They do not transmit credentials, write local storage, create accounts, or log users in. Submission preserves the fields and explains the limitation; guest access opens the real guide. Production authentication still requires an agreed provider and server-side integration.

The default `/` entry now shows the welcome screen. The previous planner component moved intact to `web/src/components/PlannerPage.tsx` and is served at `/planner`. Existing root URLs containing trip parameters still render the planner, preserving old shared links. Guide sample links and planner navigation now target `/planner`.

The earlier review results below describe the prior guide revision, not automated checks of this sketch revision.

The `/guide` route is the introduction and user manual for the class business proposal. It now presents the product as a five-stop travel journey. The existing planner remains at `/`.

## Files

- `web/src/app/guide/page.tsx`: server entry and route metadata.
- `web/src/components/guide/JourneyGuide.tsx`: narrative, scroll progress, interactive demonstrations, field guide, FAQs, and planner links.
- `web/src/components/guide/TravelWorld.tsx`: browser-only Three.js scene, original procedural landmarks, train, landscape, and lifecycle cleanup.
- `web/src/app/guide/journey.css`: scoped visual system and responsive layouts. It does not recolor the planner.
- `web/package.json` and lockfile: Three.js runtime and development type definitions.

## What visitors can do

1. Scroll through five chapters while the train moves along the illustrated route.
2. Jump to a chapter using its station link.
3. Change the scene between daylight and evening, rotate it, or pause ambient animation.
4. Explore pace, sample budget variants, a sample café detour, and an equal group-bill split.
5. Read the tabbed field guide and expandable FAQs.
6. Open the real planner with a supported destination, dates next week, and selected preferences.

## Important boundaries

- The railway and landmark positions are illustrative. They are not a real rail connection or a multi-city itinerary.
- Budget examples are fixed demonstrations. Their displayed totals are calculated from their displayed categories. They exclude intercity travel and contingency.
- Expense shares use integer paise; any remainder is assigned deterministically so shares total exactly to the bill.
- The café interaction is a visual demonstration, not a call to the optimization backend.
- Guide interactions do not save expenses or perform payments.
- Generated planner requests use local calendar dates, avoiding stale hardcoded dates and UTC day shifts.
- Provider booking, live expense synchronization, and future features are not presented as completed capabilities.

## Performance and accessibility

Three.js is loaded separately on the client. The miniature has no remote models, textures, or asset licenses to manage. Pixel density is capped, the frame rate is limited, and rendering is skipped while the scene is offscreen or the document is hidden. Geometry, materials, observers, event handlers, and renderer resources are disposed on unmount.

The guide remains usable if WebGL is unavailable. It respects reduced motion, has an ambient animation pause control, keyboard-operable tabs, native FAQ disclosures, focus indicators, and a skip link. On mobile the model becomes a compact sticky panel.

Keep the scene panel at `overflow: clip`, not `overflow: hidden`: the latter creates an internal scroll container which can scroll unexpectedly when keyboard focus or browser scroll-into-view targets its controls.

## Local review performed

- TypeScript typecheck completed without errors.
- ESLint completed without warnings or errors.
- Browser inspected at desktop and narrow mobile dimensions.
- Confirmed scroll changes train position, evening lighting toggles, sample comfort subtotal is ₹10,200, and four shares of a ₹2,400 bill are ₹600.
- Fixed an internal sticky-panel scrolling issue discovered during mobile inspection.

No claim is made that this work resolves every pre-existing planner or backend issue. Before a public launch, review dependency security, real-device GPU performance, current provider data, and end-to-end planner behavior separately.
