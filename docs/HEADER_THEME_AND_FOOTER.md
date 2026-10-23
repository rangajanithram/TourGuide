# Header theme controls and shared footer

The floating theme button and its 76px body spacer were removed. ThemeToggle now appears in the standard app header (planner, trips and discovery), guide header, sign-in/sign-up header, profile header and AuthPanel used by email/recovery/status pages. The provider still retains the saved/system theme behavior.

A single SiteFooter is rendered by the root layout. The old planner, guide and account footers were removed, so there is one footer with readable text and real guide/planner links. It follows document flow and does not cover controls. Small app headers place navigation on a second row; guide and account headers reduce secondary links at narrow widths.

Verification: required typecheck, lint, frontend tests, API and auth security checks plus production build. Browser visual verification was unavailable because browser initialization/navigation timed out twice; no claim of a completed visual or production walkthrough is made.
