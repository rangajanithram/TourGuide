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

## Production activation — approval required

Automatic approval review rejected applying the migration to production project **tripweave (`wfuvtuetjlodharrvomv`)**, because that exact remote target and persistent member access had not been explicitly approved. No alternative production SQL path was attempted. The migration remains in the repository and has been tested locally. Do not claim live rooms are active before approval, migration application and production acceptance.

After explicit approval: apply the committed migration through the normal Supabase migration process; run the rolled-back room fixture suite and security advisors; confirm the deployed frontend uses the matching commit; perform owner create → recipient join on another account/device → bill add → auto refresh → received-payment confirmation → owner save revision → recipient refresh → revoke access. Verify offline recovery, duplicate retry and paused access. Never use a real bank transfer as an automated test.

Existing security advisor warning before this change: leaked-password protection is disabled in Supabase Auth. No auth configuration or billing plan was changed as part of rooms.

## Remaining expansion

This delivers the shared itinerary and cloud expense slice, not all Stage 5 items. Voting, chat, realtime presence/WebSocket delivery, offline conflict merging, automatic guest/account reconciliation, attachments, and payment verification are not implemented. The polling loop intentionally displays last-known data on network failure and clears room content when access is denied.
