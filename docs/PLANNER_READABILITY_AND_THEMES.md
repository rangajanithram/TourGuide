# Planner readability and site themes

## Changes
- One “Before you go” notice replaces repeated estimate warnings. Its checklist removes repeated place names; all other warnings stay visible and errors remain alerts.
- Trip costs use two compact columns on wide screens and one column on narrow screens. Included-cost limits, payments and exclusions retain the existing accounting rules.
- Place selection evidence uses three short counts and an expandable explanation. Detailed source notes stay available.
- Transit cards use their content height. Plain language replaces technical headings, button labels and common stored explanations.
- A site-wide light/dark switch follows the system initially, saves explicit choices locally, and syncs across tabs. The initial script applies the saved theme before paint; blocked storage does not prevent switching.
- Shared surface, text, border and status tokens cover planner controls, dropdowns, cards, dialogs, authentication and account pages. Existing Tailwind hex utilities use a compatibility palette in theme.css. Guide night scenery follows the same theme; scene controls leave room for the switch.
- Map tiles retain the provider’s original appearance. Map controls, legends and popups use the site theme. No tile inversion or provider change was introduced.

## Verification
- Required existing suites: frontend typecheck/lint, 48 auth/planner tests, 42 API checks and 7 auth security tests.
- Local browser: sign-in in both themes, saved choice after reload, dark guide, actual itinerary component rendered with a generated Hyderabad plan, and expanded deduplicated warnings.
- Narrow viewport: cost columns stack and page width does not overflow. Browser screenshot capture at the narrow size timed out; do not treat this as complete mobile visual acceptance.
- Production build result and Git commit are recorded in the task completion message.

## Boundaries
This is presentation work. Provider access, source licensing, optimizer constraints, budget calculations, authentication and saved-trip ownership are unchanged. Source warnings remain available. A signed-in production walkthrough after deployment is still needed; local checks do not establish deployment success.
