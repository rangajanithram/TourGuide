# Trip rooms — release and acceptance notes

## What changed

The older `/shared#plan=...` URL was a portable, read-only copy. It had no saved-trip identifier, membership model or cloud ledger, so it could not update with the source trip. Its image grid also allowed the image to cover adjacent text. Artwork is now constrained to its grid track, and text can wrap; mobile stacks the image above the details.

A new `/rooms?trip=<saved-trip-id>` route implements signed-in group rooms. The owner starts a room from a saved trip. Joined members can read a minimal projection of the latest saved itinerary, record actual bills, see each person's share and balance, and record manually confirmed received payments. Account/search data and private version history are never exposed to members. Stay name/address are opt-in. The current room is checked every 10 seconds while visible and on focus; the UI reports its last check and connection errors. This is automatic polling, not an instant WebSocket guarantee.

## Chronological user flow

1. Generate and review a trip. Choose **Share plan → Open trip room**. Saving a new trip or pending revision must succeed before opening the room.
2. Start the room with your display name. The shared ledger starts empty. Existing browser-only bills are not uploaded or silently assigned to account identities.
3. In **People & invitations**, create and copy an invitation. It expires in seven days. Anyone holding it can join with a verified account, so send it only to the intended group. A new invitation replaces older unused invitations.
4. Recipients sign in with their own account, read the access notice and choose **Join room**. The invitation lives in a URL fragment, not the server's query string. The same browser can return to the invitation after login; if signing in on another device/tab context, reopen the original invitation.
5. The room opens the saved itinerary. Owner edits and restores stay in the existing planner/version system. Saving updates the room projection in the same database transaction. Unsaved edits are not shared.
6. In **Bills & balances**, add one bill: bill/payer → people and shares → review/save. Exact decimal shares must total the bill. A normal member can record a bill they paid; the owner can record on someone's behalf.
7. Review balances. The recipient or owner checks receipt before confirming it. The database ignores client settlement state/actor claims and records the verified actor and time. No bank callback or automatic bank verification is implied.
8. Owners can remove access, revoke unused invitations, turn stay sharing on/off or pause the room. Removing access retains shared financial history; existing screenshots/copies cannot be erased. Pausing hides the room from members and revokes unused links; reopening restores access for remaining members.
9. **Trip rooms** in the header lists owned and joined rooms. Deleting the underlying saved trip deletes its room, cloud bills, members, invitations and event log. The delete confirmation explains this.

## Data model and authorization

- `trip_rooms`: parent saved-trip FK, owner auth FK, bounded shared projection, cloud ledger JSON, saved plan version, independent mutation revision and timestamp.
- `trip_room_members`: verified account membership and display name, with auth FK/cascade. There is no browser-settable role; room ownership comes from the private saved trip.
- `tripweave_private.room_invites`: only SHA-256 token hashes and expiry; raw tokens are returned once and never stored in public tables. Invite rotation/removal is serialized with the room row.
- `trip_room_events`: server-derived actor/action audit, RLS visible only to room members/owner. Member deletion removes their account membership; bill history remains in the jointly held ledger for correct balances.
- All exposed tables enable RLS and grant authenticated SELECT only. There are no direct browser INSERT/UPDATE/DELETE grants. The public RPC wrapper is SECURITY INVOKER; checked privileged implementations and membership lookup stay in the unexposed private schema, with fixed empty search paths and revoked PUBLIC/anon EXECUTE.
- Owner-only private `saved_trips` and `plan_versions` RLS/grants are unchanged. The room never returns private request inputs or full revision history.
- Every ledger command locks its room row and checks expected revision. A stale write returns a conflict and reloads the latest room without discarding the bill draft. Bill IDs remain stable across retries; an identical retry cannot duplicate a bill, including after a response timeout. Client-supplied actor/receipt fields are not trusted.
- Financial limits: 50 bill participants, 1,000 bills, 1,000 receipt records, bills ₹0.01–₹50,00,000, exact shares. Guests are split-only names, not account access; guest/account identities are not automatically merged.
- New authenticated room route has private/no-store, noindex/nofollow and no-referrer headers. No service-role secret or new paid provider is required.

## Verification

- Isolated local PostgreSQL schema migration: passed, preserving the existing saved-trip/version migrations.
- `supabase/tests/trip_rooms.sql`: passed; fixtures rolled back. Covers outsider RLS/RPC denial, valid/invalid invitations, private source/history isolation, direct-write denial, actor and payer spoofing, exact shares, stale writes, idempotent bill retry, explicit receipt confirmation, overpayment rejection, atomic saved-plan sync, membership/invite revocation, anonymous/unverified denial, retained financial history and delete cascade.
- Browser: real signed-out room entry verified. A temporary development-only fixture rendered the real shared itinerary and cloud bill components using fictional data and no cloud writes. Verified desktop image/text bounds (image right edge equals text left edge), dark theme, responsive stacking/no document horizontal overflow, the three-step bill flow, a visible save failure retaining the draft, and successful single-entry retry. This is not a two-account production browser certification. Temporary fixture routes are removed before commit.
- A dark-mode layout capture is saved in `artifacts/trip-rooms/image-layout-dark.jpg`; it is explicitly labeled as a local test.

### Final code checks

- `npm run typecheck`: passed; the final production build also completed its type validation.
- `npm run lint`: no warnings or errors.
- `npm run test:auth`: 71 passed.
- `python test_api.py`: 42 passed; `python test_auth_security.py`: 7 passed; `python test_visual_planner.py`: 4 passed.
- Production build using an isolated build directory: passed, including `/rooms` and `/shared`. Generated build configuration is excluded from the commit.
- Existing `supabase/tests/account_isolation.sql`: passed after the new migration; fixtures rolled back. The new `trip_rooms.sql` role-based suite also passed.
- `git diff --check`: passed. The temporary browser fixture route was removed and the isolated PostgreSQL test server stopped.

## Production activation — completed 25 October 2026

The owner explicitly approved activation for **tripweave (`wfuvtuetjlodharrvomv`)**, used by `https://tour-guide-e3es.vercel.app`. The migration connector returned expired-request errors without applying SQL. After signing in to Supabase, the owner ran the tested migration successfully in the project SQL editor.

Verification after the manual execution:

- All three exposed room tables and the private invitation table exist with RLS enabled. The saved-trip update trigger is installed. Existing `saved_trips` and `plan_versions` policies remain owner-only.
- SHA-256 hashes of all six installed room function bodies match the reviewed migration after newline normalization. The public command wrapper is SECURITY INVOKER; privileged implementations retain the private schema and empty search path.
- The complete `supabase/tests/trip_rooms.sql` suite ran against production and returned `production_room_regressions_passed`. All synthetic accounts, trips, bills and invitations were rolled back; a separate check confirmed zero test accounts remain. No real user bill, payment or trip was changed by these tests.
- Migration history now records `20261024175910_cloud_trip_rooms` with the full verified SQL source. This records the completed manual application; it does not re-execute the DDL.
- The live `/rooms` page returned HTTP 200, `Cache-Control: private, no-cache, no-store`, `X-Robots-Tag: noindex, nofollow`, and `Referrer-Policy: no-referrer`.
- A real anonymous HTTPS request to the published room RPC returned HTTP 401 / SQL code 42501, permission denied. The command is reachable through the Data API and is not anonymously callable.
- Vercel reports production READY for frontend source commit `07f02f8`. The image fix and trip-room screens are deployed.

The production database role-based tests are not a two-account browser certification. The owner/recipient journey on separate real accounts/devices remains a manual acceptance check: start a room → join an invitation → add a bill → observe refresh → confirm receipt → save a planner revision → observe the updated itinerary → revoke access. No real bank transfer is required or appropriate for this test.

### Advisor findings

The advisor reports an informational [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) notice for `tripweave_private.room_invites`. This is intentional deny-all access in an unexposed schema, with no browser table grants; only checked private commands use it. It must not be fixed by granting public invite-table access.

The pre-existing [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) warning remains. No auth configuration, billing plan or paid provider was changed as part of activation.

## Remaining expansion

This delivers the shared itinerary and cloud expense slice, not all Stage 5 items. Voting, chat, realtime presence/WebSocket delivery, offline conflict merging, automatic guest/account reconciliation, attachments, and payment verification are not implemented. The polling loop intentionally displays last-known data on network failure and clears room content when access is denied.
