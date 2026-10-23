# Visual planner release — 24 October 2026

## User flow

1. Sign in and open Create trip. Choose a supported city using search or a city image tile. Enter dates, travelers, budget, stay and known travel times.
2. Choose pace, transport and group comfort needs.
3. Browse Places & food. Search the chosen destination, use category filters, inspect Details and add multiple places. **Add to options** gives a stop a soft ranking preference. **Must visit** remains a hard requirement. The Your places panel supports removal and changing required/optional status. The mobile version is expandable and stays within the discovery section, clear of Continue.
4. Confirm your own missing planning facts for external listings. Nothing in an illustration establishes real hours, accessibility, cost, rating or availability.
5. Set meal budget, interests and optional automatic-discovery estimate policy. Review the trip and generate up to three feasible options.
6. Read the image-assisted itinerary, compact meal reservations, stay card and route cards. Open Edit stop for existing verified edit actions. Save and reopen using the existing versioned trip flow.

## Implementation

- `PlannerDiscovery.tsx`: one destination-specific search and visual browser, category filtering, available-rating/name/duration sorting, known-duration filter, show more, selected-place panel and keyboard-managed detail drawer. Live discovery remains authenticated and bounded; source failures leave the reference catalog usable.
- `TripForm.tsx`, `InterestPicker.tsx`: city artwork, simple step headings, visual interests, integrated selections and compact disclosures for meal and automatic-discovery assumptions.
- `main.py`: public curated-catalog response adds existing cost/hour/source/rating fields; no hotel inventory or external review text is added. Historical rating evidence uses the existing dataset matcher.
- `models.py`, `optimizer.py`: `preferred_activities` defaults to an empty list for old requests. Up to 15 optional IDs add a soft drop penalty, never a mandatory constraint. Pins and independent verification stay in force. Preferences persist through planning preferences and saved request data.
- `ScheduledActivity.meal_venue_id` distinguishes a named meal venue from a base-location meal reservation. Old placeholders are also recognized by their existing source/name labels. Placeholder cards do not show venue ratings, crowd claims or restaurant map pins.
- `ItineraryView.tsx`, `StaySummaryCard.tsx`, `IntercityTravel.tsx`: local artwork, compact editing controls, explicit whole-group or per-person price units, honest room/seat availability labels, source disclosures, alternative route filtering and unknown-cost handling. A time gap is labelled as travel **or free time**, never a road-based ETA.
- `TravelImage.tsx`, `travel-media.ts`: local optimized artwork, lazy loading, fixed aspect ratios, accessible descriptions, visible AI labels and an image-error fallback.
- `planner-visual.css`: grid layouts, theme tokens, mobile selection summary, touch-sized controls and reduced-motion behavior.
- `JourneyGuide.tsx`: updated chronological help for the new browsing and editing controls.

## Images and provenance

Twelve original AI illustrations were generated with the built-in image generation tool for this release. They are stored in `web/public/images/travel/` as WebP files (1200px maximum width, approximately 3 MB combined). No MakeMyTrip images were copied and there are no image-generation API calls in the deployed app.

City covers are artistic interpretations of cities. Museum, palace, fort, food, park, stay and rail assets are category illustrations. A fictional hotel courtyard is **not** a photograph of the selected property. Unknown venues use these labelled illustrations rather than an invented photo claim. Replace an illustration with a real photo only after confirming the exact location, reuse permission, credit and alt text.

### Prompt set

City prompt template: “Use case: stylized-concept. Asset type: destination cover for TripWeave travel planner. Create one premium wide landscape editorial travel illustration (3:2 or 16:9). [Subject]. Painterly cinematic digital illustration with fine architectural detail, natural rich colors, subtle texture and confident composition. Attractive grown-up travel magazine style, not a cartoon, not a UI mockup. Fill the frame, no borders, no lettering, no logos, no watermark. This is visibly an artistic destination illustration, not a documentary photo or a hotel listing. Keep key subjects in the central 70 percent so cropping is safe.”

| File | Subject |
|---|---|
| hyderabad.webp | Hyderabad: artistic Charminar minarets, old-city arches, distant Golconda stone textures, amber dusk and teal sky |
| jaipur.webp | Jaipur: pink sandstone Hawa Mahal-inspired facades, palace arches and desert hills |
| bengaluru.webp | Bengaluru: Cubbon Park greenery, glasshouse garden and distant palace-inspired architecture |
| delhi.webp | Delhi: India Gate, Mughal garden geometry and tree-lined avenues at sunset |
| mumbai.webp | Mumbai: Gateway of India, Marine Drive-inspired seafront and distant skyline |
| food.webp | Indian restaurant table with biryani, dosa, idli, vegetarian thali and chai |
| nature.webp | Indian city park, tropical trees, calm lake and distant rocky hill |
| stay.webp | Fictional Indian boutique hotel courtyard with stone arches and plants |
| rail.webp | Indian passenger train at a clean platform, curving railway and green hills |
| museum.webp | Indian art museum gallery with stone sculpture, paintings and warm skylight |
| palace.webp | Deccan-inspired palace courtyard, white arches, chandeliers and garden |
| fort.webp | Golconda-inspired granite hill fort, ramparts, stone gateways and distant city |

Category prompt direction: “Premium wide editorial travel illustration for TripWeave. [Subject]. Visibly artistic painterly cinematic digital illustration, detailed surfaces, emerald and amber palette, grown-up travel magazine aesthetic. Atmospheric category illustration, no claim to be an exact real venue photo. No text, logo, borders or watermark. Main subject central for safe cropping.” Food/nature/stay/rail prompts additionally specified soft natural texture and no people or readable signage where appropriate.

## Verification and deployment

Required gates: frontend type check, lint, frontend regression checks, `python test_api.py`, `python test_auth_security.py`; targeted visual-planner tests cover preference bounds, catalog unknowns, preference persistence and independent verification. Build the production frontend after removing temporary local preview fixtures.

Browser evidence during development: desktop light/dark rendering, optional and pinned selections, detail facts, Escape close and focus return, no broken images or horizontal overflow in the inspected desktop view. A mobile-breakpoint result check also found and led to removal of the empty thumbnail column for unassigned meals. Browser availability was interrupted afterward; the final full signed-in production flow must be checked after deployment.

Deploy backend and frontend from the same commit. The backend must understand `preferred_activities` before users submit optional choices from the new frontend. No new key, paid service or database migration is required. GitHub push alone does not certify a successful Vercel or Render rollout.

## Honest remaining limits

- Artwork is not photographic evidence. It does not make a reference-catalog venue a live listing.
- Provider coverage and facts remain limited; no unlimited discovery, live review feed, dated hotel availability or ticket booking was introduced.
- Ratings with source evidence remain historical samples. Unknown ratings remain unknown; review text is not republished.
- Travel between cities uses reference schedules and fare ranges; local route time remains the optimizer's existing estimate.
- Final production authentication/save/reopen and full phone-device acceptance require a reachable signed-in deployment.
