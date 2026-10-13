# Stage 3B: free-plan discovery foundation

Provider: Geoapify Places and Forward Geocoding, using OpenStreetMap data. This increment adds an authenticated /discover page and /api/discovery endpoint. No existing itinerary catalog or saved snapshot is replaced.

Setup:
1. Register at https://myprojects.geoapify.com/ and select the Free plan; do not enable paid upgrades.
2. Create a project and copy its API key.
3. In Render add GEOAPIFY_API_KEY (server-only) and DISCOVERY_DAILY_REQUESTS=100, then redeploy.
4. Keep provider-side quotas and rate limits within the free plan. The app counter is process-local and resets on restart; it cannot enforce an account-wide credit cap.
5. Log in, open Discover, search Hyderabad, India with each category. Then try Paris, France to verify worldwide discovery. Missing configuration, failures and quota exhaustion should show useful messages.

Each search costs one geocoding call plus one Places call; result limit is 20 and radius is 15km. Searches occur on explicit submission, not on every keystroke. Six searches per minute per verified user; 100 provider requests per UTC day per process by default. Provider credit cost differs from request count; check the current dashboard and https://www.geoapify.com/pricing/ before activation.

The provider key never enters frontend code or responses. Provider URLs/errors are sanitized; HTTP replies are private/no-store. Only returned names and addresses are displayed, with Geoapify and OSM attribution and retrieval time. No claim of exhaustiveness, current prices, opening hours, ratings, reviews or booking availability.

NEXT INCREMENT: translate provider IDs into validated planner constraints with explicit unknown hours/fees/duration handling and licensing-compliant persisted provenance. Discovered places currently cannot be pinned or scheduled. Worldwide discovery does not mean worldwide verified itinerary generation.

Existing Open-Meteo integration covers short-range weather forecasts, with clearly labeled fallback for unsupported future dates. Golden hour is calculated from date and coordinates, not a fixed time. Hotel availability, price quotes and real reviews remain separate integrations; this free provider does not supply them here.

Validation: contract tests mock successful data, empty/unconfigured provider, malformed items, quota exhaustion and sanitized errors. Live requests require the user-configured key; activation and live provider acceptance remain pending.
