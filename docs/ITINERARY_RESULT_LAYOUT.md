# Itinerary result layout

The result dashboard follows the revised October 12 sketch:

- Trip name, save/revision/history controls beside the available travel options.
- A wide map beside a vertical export/copy/group-expense panel.
- Stay details beside a two-by-two cost summary, without a duplicate horizontal cost strip.
- Two independently growing daily timelines on large screens; one on tablet and mobile.
- Secondary budget calculations and schedule evidence remain expandable. Warnings stay visible.

## Design rationale

Shorter text lines reduce cross-screen reading. Related controls stay near their information; headings establish a predictable scanning order. Selected variants have both a visible border and an accessible pressed state. A small screen reflows vertically rather than shrinking text.

References consulted:
- W3C visual presentation: https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation
- W3C reflow: https://www.w3.org/WAI/WCAG21/Understanding/reflow
- Nielsen Norman Group progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- Nielsen Norman Group scanning research: https://www.nngroup.com/articles/layer-cake-pattern-scanning/

These principles inform the design; this change is not a formal accessibility certification or a user study.

## Validation

Required TypeScript, lint, frontend authentication/persistence regression, optimizer, and backend authentication checks passed. An isolated local preview uses a generated Hyderabad plan with the real variant, map and itinerary components; no fixture or preview route is shipped. Live account persistence still needs a signed-in check after deployment.

Production-mode browser checks passed: variant selection, day filtering, calendar download, relocated action buttons, and no page overflow at 1440, 1024, 390 and 320 CSS pixels. No browser JavaScript errors occurred in that run. The development preview produced a Leaflet initialization error; it did not reproduce in the production build.
