# Expense and plan-sharing update — 24 October 2026

## Findings before changes

The expense modal combined every bill, category, split and note control at once. Many labels used 10–12px type, with pale text on pale controls. Its “Live Ledger” and “Auto-synced” labels overstated browser-only persistence. The existing basic-settings link opened an authenticated planner and generated a fresh result; it did not share the selected saved schedule. There was no public, read-only recipient page or live group collaboration.

## Delivered user flows

### Record an expense

1. Open **Split costs on this device**. Start here explains checking people, adding bills and checking balances.
2. Use **People** to rename local travelers. This does not invite anyone or connect their account. UPI IDs remain optional.
3. Choose **Add expense**. Step 1 asks for the bill name, total and payer. Category changes are optional and tucked into a separate disclosure.
4. Step 2 asks who shares it. Equal splitting is the default; custom shares must total the bill exactly, to the paisa.
5. Step 3 shows the bill, payer and each share. Notes are optional. Choose **Save expense** once.
6. Use **Who owes what** to inspect balances and suggested payments. Opening a UPI app does not record a payment. “Confirm received” stays disabled until the user explicitly confirms receipt.

The redesigned modal uses theme tokens, readable labels, 16px input text, visible focus, compact controls and a scrollable body. The wizard action bar stays visible on short/mobile screens. Existing expense and settlement data shapes remain compatible when valid. A one-paisa debt bug was corrected. Summaries now omit UPI addresses and label payments as manually confirmed.

### Send a useful plan link

1. Choose **Share plan** in itinerary actions. This also works in the legacy settings-link results view.
2. Read the disclosure. A shared link contains a fixed copy of the selected itinerary. Anyone with it can read and forward it; the copy cannot be revoked.
3. Stay name/address are excluded by default. Include them only deliberately. Member names, UPI IDs, expense records, payments, private trip IDs and account identifiers are not included in the constructed share payload. Meal placeholders and rest stops do not export private base coordinates.
4. Copy the plan link. It opens `/shared#plan=...` without requiring a sign-in or generating a plan again.
5. The recipient sees a themed, read-only page with dates, day filters, ordered stops, times, map links, stored weather/rating evidence where available, estimated costs, source details, optional stay information and print controls.
6. After editing the original itinerary, create and send a new copy. Existing links do not update.

A downloaded JSON plan copy and a bounded local file reader provide a fallback for long links. The application limits encoded links to 24,000 characters and decoded JSON to 150,000 characters. The reader checks the schema, primitive types, array limits, cost/time/coordinate bounds and supported version. No HTML from the payload is executed. Link fragments do not go in the page's HTTP request. The route is marked noindex/nofollow, private/no-store, and no-referrer.

Shared copies are sender-supplied data, not signed or newly verified itineraries. Forecast labels refer to the original plan, not a fresh weather request. A new copy timestamp must not be treated as a provider checking time. Private saved-trip authorization and existing RLS are unchanged; no public table or database migration was introduced.

## What “automatic” means

- A valid local expense edit is saved to this browser immediately. A storage failure is shown instead of being silently ignored. Reloading on the same browser can restore it.
- Storage events can refresh the same ledger in another tab of the same origin/browser profile. This is not conflict-safe collaborative editing; simultaneous writes can overwrite one another.
- Expense keys remain scoped to the current plan settings/variant. Switching variants, changing the relevant settings or using a different browser can show a separate list.
- No cross-device/group expense sync exists. Adding a local member is not an invitation. Clearing browser data removes local expenses.
- A shared itinerary is a static copy. It does not sync edits, expenses, payments or live provider data.

## File-by-file changes

| File | Responsibility |
| --- | --- |
| `GroupExpenseModal.tsx` | Readable overview, bills, people and payment views; manual payment confirmation; local-only notices. |
| `ExpenseWizard.tsx` | Three-step bill entry, precise validation, review and visible actions. |
| `expense-entry.ts` | Paisa validation, valid payer/participants, exact custom totals, checked local ledger parsing. |
| `settlement.ts` | Preserve one-paisa debts; safer, clearer copied expense summaries. |
| `ItineraryView.tsx` | Wire the new expense dialog, checked local persistence/status and the new share dialog. |
| `PlanShareDialog.tsx` | Explain visibility, opt-in stay details, copy a real schedule snapshot and start a file download. |
| `shared-plan.ts` | Construct a minimal share model, validate and encode/decode it. |
| `/shared/page.tsx`, `SharedPlanReader.tsx` | Public read-only recipient flow, local file reader and normal TripWeave theme. |
| `SharedTripOverview.tsx` | Keep legacy settings links honest and offer the new plan-copy action. |
| `expenses-sharing.css`, `layout.tsx`, `next.config.mjs` | Responsive styling and recipient privacy headers. |
| `JourneyGuide.tsx` | Explain the new expense, sharing and sync behavior in the user manual. |
| `auth.test.cjs` | Expense, privacy, share-format and small-debt regression coverage. |

## Verification evidence and limits

- Local browser checks used the real components with clearly labeled fictional data. Verified empty bill validation → bill entry → three equal shares → review → save; local reload restored the ₹600 test bill; balances showed ₹400 owed to the payer; receipt confirmation was blocked until explicitly checked.
- A newly copied 1,112-character example link opened in a second tab without sign-in and showed the exact chosen Charminar/lunch/Golconda schedule. Day filtering, private stay omission, source/cost notices and dark mode were checked.
- A mobile viewport reported about 434 CSS pixels: single-column expense fields, 16px input text, a visible Save action and no document horizontal overflow. Review captures are in `artifacts/expense-sharing/`; category options were subsequently moved into an optional disclosure.
- The download-event automation timed out. File serialization/parsing is regression-tested; a completed browser download and reopening that downloaded file were not confirmed in this run. This must not be represented as a passing browser test.
- Temporary development preview routes were removed. No real user bill, bank payment, booking or private trip was modified during testing.
- Production deployment and signed-in generation/save/reopen remain separate rollout checks. Pushing the commit does not establish that production uses it.

### Final automated checks

- `npm run typecheck`: passed.
- `npm run lint`: passed with no warnings or errors.
- `npm run test:auth`: 67 passed.
- `python test_api.py`: 42 passed.
- `python test_auth_security.py`: 7 passed.
- `python test_visual_planner.py`: 4 passed.
- Isolated `npm run build`: passed. The sandbox initially blocked generated build-directory creation with EPERM; running the same build outside the sandbox completed successfully.
- Built `/shared` returned HTTP 200 without a login redirect, with `Cache-Control: no-store, private`, `X-Robots-Tag: noindex, nofollow`, and `Referrer-Policy: no-referrer`.
- `git diff --check`: passed. Generated build configuration and temporary preview routes are excluded from the change.

## Next stage for live group sync

Keep Stage 5 gated: verified group memberships and explicit invitations; per-member RLS; transaction-safe expense writes; conflict/version handling; revoke/leave permissions; private-data retention/deletion; and a two-account/two-device test. Live plan links should then identify their update time and access rules. Do not label the current static copy or browser ledger as live collaboration.
