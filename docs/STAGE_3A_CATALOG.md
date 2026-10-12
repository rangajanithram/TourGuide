# Stage 3A — Hyderabad catalog foundation (2026-10-12)

Stage 2 acceptance: the user confirmed the live rename → edit → save revision → reopen → restore → delete flow works.

## This increment
- Hosted public.places contains the existing Hyderabad seed places with stable city/place IDs. Published catalog rows are publicly readable; browser roles cannot insert/update/delete; drafts are hidden through RLS. This shared catalog contains no account or trip data.
- Payload is independent curated planner data, not a Google Places cache. A separate google_place_id column can hold IDs for later on-demand lookup. Source URLs and reviewed_at are explicit fields.
- Imported entries are estimated, with reviewed_at NULL, no climbing/dietary claim and no invented source links. Migrating storage is not a factual review.
- SupabasePlacesProvider uses the public Data API with a publishable key, an 8-second timeout, 2MB/500-row bound, 60-second cache and cloned results. Outages or invalid catalogs produce a 503 through the existing catalog error handler. Other cities still use JSON.
- Database provider is opt-in: PLACE_CATALOG_PROVIDER=supabase. Default json keeps current production behavior until the release is enabled. No service-role key is needed.

## Enable after backend deployment
In Render configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and PLACE_CATALOG_PROVIDER=supabase, then redeploy. Keep credentials in Render environment settings. Verify /api/planner/catalog?destination=hyderabad reports Database curated catalog, then generate, save and reopen a trip. Revert the provider flag to json for a deliberate rollback.

## Evidence and remaining work
Hosted migration: 20261012135830_hyderabad_place_catalog. Local migration was created with the official CLI and renamed to match the hosted migration history. Catalog SQL tests passed for public reads, hidden drafts and blocked writes for anon/authenticated. Four provider unit tests passed for cloning/cache, expiry/outage, invalid response and other-city compatibility. Existing application regression checks were run.
The local environment has no configured public Supabase credentials, so an HTTP integration test of the Python adapter and live Render activation are still pending. The hosted SQL schema/data and permission checks were verified independently.
Next increment: review Hyderabad venue facts using independently licensed official sources, record links and review dates, then expose the evidence in discovery UI. No current prices, climbing suitability or dietary suitability have been newly verified in this increment.
