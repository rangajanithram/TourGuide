# Live planner verification — 25 October 2026

Target: https://tour-guide-e3es.vercel.app. Tests use a separately named QA trip and fictional bills. Existing personal trip and expense records are not changed.

## Problems found and fixed

- Room list links changed the URL but left the old list visible. Route pages now pass the requested trip ID and reset client state when switching trips. The planner also resets its loaded snapshot when the trip URL changes.
- Returning to a browser tab refreshed the account object and cleared an unfinished cloud bill. Room subscriptions now depend on the account ID, preserving the draft during refreshes for the same account.
- Opening a room for an owner’s saved trip that had no room yet displayed a misleading access error. The normal Start room screen no longer reports that expected state as a failure.
- Joining through an invitation displayed an access error before the user had joined. Expected read denial is handled as the normal join screen; actual join failures remain visible.

## Live verification results

- Live plan generation, saving a new named trip, and opening its room from Share plan.
- Destination typing, supported-city suggestions, advancing the normal form, and clearing old destination selections when changing city.
- Saved three-day itinerary includes meals and visits on each day. Sources, estimated prices, weather status and unavailable ratings are visibly labelled.
- Room-list navigation after deployment opens the chosen room without manual reload.
- A second verified account in Chrome joined the owner’s QA room in Brave. Member view omits the owner’s private planner-edit link. Guest split names remain separate from account membership.
- Empty bill validation, exact equal rounding of ₹1.01 into ₹0.51 and ₹0.50, and blocking custom shares that do not total the bill amount.
- A member’s unfinished bill retained its name and total after switching to the owner’s browser and back.
- The member saved a fictional ₹600 bill with two ₹300 shares. The owner saw it automatically without reloading or pressing Refresh. The database recorded one bill and ₹600 total shares.
- The recipient’s receipt confirmation was disabled until explicitly checked. Recording the fictional ₹300 receipt cleared the outstanding debt, retained the original bill and exposed the manually confirmed payment record. No bank transaction was performed.
- Owner saved a different option as version 2; member saw the new version and ₹1,227 estimate automatically. Restoring version 1 created version 3 and returned the member view to ₹735. The bill and receipt remained intact across both changes.
- The member could read the shared room but opening the owner’s private saved-trip planner was denied.
- Dark-mode inspection covered room headings, navigation, bills, balances, receipt controls, itinerary hero, background patterns and planner error notice. The tested owner window also used a narrower layout; this is not a substitute for physical phone testing.
- The normal Create trip link replaced the saved-trip screen with a new form, rather than retaining the old saved trip.
- The Hyderabad discovery step loaded 17 catalogue/live entries. Search opened Golconda Fort details; Add stayed disabled until the end of the drawer. Adding a live restaurant next retained both selections. Optional visit length, price and time fields could be left blank after accepting the displayed estimates.
- Generating through the normal form with those two choices succeeded. The three-day result included the selected fort and breakfast, lunch and dinner on every day. The restaurant was reused, as described below.
- Removed the disposable saved trip after testing. Follow-up database checks confirmed zero remaining QA trips, rooms, memberships, invitations or saved revisions. Its fictional ledger was deleted with the room.

## Automated checks

- Frontend: typecheck and lint; 73 tests passed, including route-state regression cases.
- Production frontend build passed; generated build-directory changes were not committed.
- Python: 42 API/optimizer checks, 7 authentication/security tests, and 4 visual-planner regression tests passed.
- Production database room regression suite passed inside a transaction that rolls back its fixtures. Coverage includes invitations, authorization, optimistic concurrency, duplicate bill retries, payment records and saved-itinerary projection.

## Further UI corrections

- Private saved-trip access failures now direct the reader to My trips or Trip rooms rather than telling them to change the budget.
- Plan cards explicitly label the selected option and use the singular Day for one-day options.
- The guide distinguishes existing shared rooms from future simultaneous itinerary editing.
- Fixed broken UTF-8 punctuation in discovery headings, search hints, source labels and the selected-place count.

## Coverage limits

This is a production smoke test with two accounts, not a guarantee of every browser, screen reader, device, provider response or network condition. Invitation expiry, access revocation, duplicate saves, concurrent edits and other destructive cases are primarily covered by transactional production database tests. No real payment, paid booking or provider purchase was made. Actual mobile devices and long-running offline/reconnect sessions were not exhaustively tested.

## Remaining planning-quality work

In the normal-form test, choosing one optional live restaurant without a preferred meal time resulted in the same venue being reused for all nine meals. Scheduling and budget checks passed, but this is limited meal variety. Improve variety when multiple suitable candidates exist and explain reuse when verified/accepted alternatives are limited. Do not invent new venues or service hours just to create variety. Open-data listings also need ongoing quality review; live discovery is not an endorsement of every returned point of interest.

## Product limits

Rooms refresh every 10 seconds while visible and when focused; this is polling, not instantaneous collaborative editing. Only saved owner itinerary changes are shared. Browser-only visited marks and old local bills do not become cloud records. Payment records are manually confirmed and do not verify a bank transfer. Fixed-copy exports do not sync. Prices, room availability, venue hours and provider data retain their listed estimate/source limits.
