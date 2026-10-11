# Map tile configuration

The planner previously suppressed Referer headers and used OSM subdomain URLs. Public OSM tiles require website identification and the canonical https://tile.openstreetmap.org/{z}/{x}/{y}.png template. Planner responses and tile images now send only the origin, never trip IDs or query strings. Auth routes retain no-referrer.

Tile failures remove the background layer and show a Retry map control; stops and route lines remain usable. There is no automatic retry loop, proxy, tile prefetch or cache bypass. A provider may return a block-message image successfully, which Leaflet cannot distinguish from a normal tile. Existing blocked images may remain in browser cache; use a managed provider if blocking persists after deployment. Availability cannot be guaranteed by this fix.

For a production managed OSM-derived raster service, obtain a provider account and set NEXT_PUBLIC_MAP_TILE_URL to its HTTPS raster template (containing {z}, {x}, {y}) in Vercel. Set NEXT_PUBLIC_MAP_TILE_ATTRIBUTION to the provider's required attribution, including OpenStreetMap credit when required. Restrict any browser API key to the production domain in the provider dashboard, configure quotas, and redeploy. These variables are browser-visible; never use a server secret. Validate coverage, zoom support (up to 19), terms and costs before activation. Blank configuration uses public OSM.

MapTiler supports domain-restricted browser keys: https://docs.maptiler.com/guides/credentials/api-key/
OSM policy: https://operations.osmfoundation.org/policies/tiles/

Google Maps would require a separate supported renderer, billing/key setup and an explicit architecture decision under AGENTS.md. Do not insert Google tile URLs into Leaflet.
