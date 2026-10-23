# Planner form usability update — 24 October 2026

## What changed

- Replaced browser date and date/time inputs in trip setup with a themed calendar and separate hour/minute controls. The calendar supports arrow keys, Home/End, Page Up/Down, Enter and Escape, date limits, and returning focus to the date button.
- Limited the width of trip setup groups and inputs. Travel timing now has separate outbound and return cards. Transfers, rest time and fares have their own expandable section. Mobile layouts use one column.
- Gave stay choices compact 20px radio controls, whole-card selection, clear selected styles, and short transitions. Transport choices use checkbox chips. Reduced-motion and Windows forced-colors settings have fallbacks.
- Made the dark planner landscape use dark gradient colors and stronger contour lines instead of fading a light background almost completely away.
- Moved form validation into field-specific issues with a step, section, control ID and plain-language message. Continue checks the current and earlier steps; final creation checks all steps. A failure opens the relevant step, scrolls to and focuses an error summary, and offers links to individual fields. Links open collapsed sections. Inline errors and a message beside Continue help users find and fix the issue. Server planning errors also receive focus and scroll into view.
- Updated the user guide with the calendar, travel timing, error recovery and place-estimate behavior.

## Optional place fields and estimate handling

The four fields in place details—visit length, cost per person, earliest planned visit and finish by—can now be blank. Blank inputs use explicitly displayed planning estimates. Default values are 90 minutes for an attraction, 45 minutes for a restaurant, ₹200 per person, and a 09:00–20:00 planning window. Where supplied, the trip's discovery policy supplies its own visit/cost/window defaults. An entered value overrides that field's default; ₹0 remains free. Entered invalid values are rejected beside the affected field and focus moves there.

The Add action explicitly accepts estimates for blank fields. They are not asserted to be verified venue hours, entry fees, review evidence or availability. The existing confirmed-stop API payload still contains concrete values, so backend feasibility and budget checks continue to apply. Required stops remain required, including when the underlying facts are unknown.

All place additions now open details first. Add remains disabled until the end marker of the scrollable detail area is visible. Keyboard scrolling works. Reaching the end enables Add for that open detail view; reopening resets the gate. If all information fits without scrolling, it can enable immediately. This confirms reaching the end, not that someone actually read or understood the text.

## UX sources applied

- [GOV.UK error summary guidance](https://design-system.service.gov.uk/components/error-summary/): focused summary, links to fields, and errors beside the input.
- [W3C date-picker dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/): calendar grid navigation, modal focus, and visible keyboard guidance.
- [Nielsen Norman Group form error guidance](https://www.nngroup.com/articles/errors-forms-design-guidelines/): noticeable, specific and actionable feedback.

These patterns guide the implementation; this update is not an accessibility certification.

## Verification

- `npm run test:auth`: 59 passing frontend regression tests, including eight new tests for optional estimates, default overrides, invalid values and field-specific planner errors.
- `python test_api.py`: all 42 planner/API checks passed.
- `python test_auth_security.py`: all 7 security tests passed.
- `python test_visual_planner.py`: all 4 preference and meal-contract regression tests passed.
- ESLint: no warnings or errors. Production build and standalone `npm run typecheck` both passed.
- Browser checks using the actual components and local catalog: calendar selection across months with the keyboard; focused error summary after an invalid budget; an error link focusing the budget; four explicit missing travel-time errors in Journey; successful Continue after turning off unknown timing; radio controls measuring 20×20px; optional blank place fields accepted with displayed defaults; entered invalid duration focusing its inline error; Add disabled before reaching the end and enabled after keyboard scrolling; Escape closing a time dropdown without closing its parent drawer.
- Checked desktop layout and a mobile-width viewport (the browser reported about 434 CSS pixels), with one-column fields and no document horizontal overflow. Captured light-calendar and dark-place-detail screenshots in `artifacts/form-ux/`.

## Scope and remaining checks

A temporary development-only preview rendered the real components without changing protected routes, saved trips, or bookings; it was removed before commit. Its single unverified-place example was a clearly labeled UI fixture. The local environment does not configure Supabase sign-in, so this run does not claim signed-in generation/save/reopen verification or live provider success. The browser extension injected `fdprocessedid` attributes and produced a hydration warning; the mismatch was external to app markup. No code was added to hide that warning.

This is a frontend change with no database migration, provider spend or optimizer contract change. After the GitHub push, confirm the Vercel deployment uses this commit and repeat the signed-in planner flow on that deployment. A push alone is not proof of a successful production rollout.
