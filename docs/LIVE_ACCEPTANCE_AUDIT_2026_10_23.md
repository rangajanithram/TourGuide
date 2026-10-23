# Live acceptance audit — 23 October 2026

## Scope and evidence
Live production website: https://tour-guide-e3es.vercel.app. Signed-in existing session; no passwords or tokens extracted. Base release checked: 4091918. The fixes below are a subsequent single commit; this report does not claim they were already present in the live session.

## Confirmed live
- Journey and travel-style steps advance. Dark dropdown selection works.
- Hyderabad search returned Birla Mandir with a destination address. Explicit test estimates (60 minutes, zero entry cost, 09:00–19:00) could be confirmed and pinned. Native time entry worked using hour/minute segments; automation fill alone did not set those controls.
- Generated 30 October–1 November for two travelers, budget ₹15,000, automatic discovery enabled, meals ₹200/person. Two feasible options returned; the unavailable budget option was stated honestly. All three days had stops and breakfast/lunch/dinner. The pin was retained. Weather and historical rating labels were shown.
- Saved test trip 139029c6-7953-4463-a711-e34ef7324fd4 as “QA live check — 23 Oct 2026”. Version 1 total ₹11,746. Removing Maze showed a verified preview of −₹540; saved v2 total ₹11,206. Reload reopened v2. Restoring v1 created v3 at ₹11,746, preserving history.
- Light/dark switching worked on live results. Narrow viewport stacked the layout; measured page width 482px within viewport 488px (browser scaling affected the requested 390px override).
- Expense dialog opened in dark mode with zero spending. No payments or real expenses recorded.
- Guide loaded signed in; keyboard ArrowRight switched the manual panel. Jaipur sample opened the planner with Jaipur dates and parameters, then returned three options (Budget ₹7,643, Balanced ₹8,002, Comfort also available).
- Captured live browser console errors list was empty at inspection time.

## Confirmed issues fixed
1. Dark utility colors added an unintended solid background to the open form: preserve transparent form surface.
2. Version history stretched the adjacent options card, leaving a large blank block: align each card to its own content height.
3. Expense categories counted meals twice (Food ₹3,600 and Activities ₹5,600 within a ₹11,746 plan): derive food and visits separately from scheduled stops. Added regression coverage.
4. Ordinary burial grounds appeared as automatic tourist suggestions: exclude matching graveyard/cemetery/burial-ground/crematorium names from automatic candidates only. User-selected and mandatory inputs are preserved. This is a narrow safeguard, not comprehensive place-quality validation.
5. Edit and rest dialogs lacked dialog semantics and keyboard containment: add names, focus handling, Escape and focus return.
6. Guide omitted save/reopen/revision/restore steps and overstated link sharing: provide five ordered topics and explain that the basic settings link does not contain the private saved snapshot or every advanced choice.
7. Shorten technical headings and expose the settings link’s limitation in its visible label.

## Verification and limits
Required typecheck, lint, frontend tests, API suite, auth security suite, discovery suite, new candidate-filter regression and production build are run for this change. Test results are reported in the completion message.

This is not a claim that every feature on every device is perfect. Delete/account deletion, real payments, password recovery, new-user email/OAuth delivery, every transit combination, all cities, download/import into external calendar apps, every rebalance severity, cross-user attacks against production, and every browser/device remain outside this live pass. Do not delete existing user trips as test cleanup. The labeled QA trip is retained for review. Provider venue/address mismatches and broad tourism discovery relevance still need data-quality checks; unknown opening hours, ratings and hotel availability remain unverified rather than invented. New fixes require a post-deployment smoke check.
