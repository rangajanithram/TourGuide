# Antigravity increment review — 22 October 2026

Reviewed f93f463 and 0855673 against repository code.

Useful additions: user-reported transfer fares/paid amounts, combined-cap reservation,
result/export accounting, optional discovered-stop admission and address propagation.

Corrections:
- PlannerDiscovery sent osm_url, but ConfirmedDiscoveryStop forbids that extra field.
  Removed the unsupported field; result map links already derive safe OSM URLs from coordinates.
- Discovery addresses can exceed the 300-character planning contract; confirmation now bounds them.
- Independent recomputed combined costs now include transfer fares.
- Independent verification rejects changed transfer fares/payments even without a combined cap.
- Saved-request validation rejects transfer accounting changes against plan preferences.
- Added a regression for altered transfer payments without a cap.

Completion limits: optional candidate admission does not implement automatic discovery-driven
planning. Ratings/review fields do not connect a real source. Hotel inventory, restaurant
service evidence, complete terminal routing and signed-in production acceptance remain pending.
Health 200 alone does not verify a user flow or exact deployed commit. A failed health request
cannot establish Render sleeping as its cause. Avoid fixed completion-time promises or
claims of guaranteed presentation success.

Next acceptance: live discovered attraction/restaurant confirmation → generation → edit →
save → reopen, with transfer costs and payments preserved. Then review meal venue scheduling
and automatic candidate admission with explicit confirmation of missing facts.
