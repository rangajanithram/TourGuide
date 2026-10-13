# TripWeave — Complete User Journey, Data Strategy & Engineering Execution Plan

**Product:** TripWeave · *You choose the trip. We figure out the journey.*  
**Document version:** 1.0 · **Research checked:** 13 October 2026  
**Purpose:** A decision-ready functional and technical plan for the existing web project; suitable for Antigravity and for explaining a college project.  
**Scope of evidence:** Based on the owner's four planner screenshots, their Bengaluru-to-Hyderabad scenario, `product_spec(3).md`, and `engineering_blueprint.md`; external API availability and restrictions checked against official documentation linked at the end. **No repository source code or live application authentication was audited.**

> **North-star promise:** Given a real departure point, destination, travel dates, party, travel preferences, budget, mandatory stops, dietary rules and desired experiences, TripWeave should produce an explainable, geographically efficient, time-feasible **door-to-door journey**—not just a ranked list of sightseeing places. Where it cannot independently confirm bookings, fares, schedules or room availability, it must label the information accordingly and help the user check an authorized source.

---

## 1. Executive decision: what TripWeave really builds

TripWeave has **three linked planning problems**. Do not solve them independently and splice the answers together.

1. **Reach the destination:** Decide among user-permitted train, bus, flight, self-drive and other modes using time window, door-to-door time, available published schedule evidence, expected cost, last-mile access, comfort and baggage needs.
2. **Establish the trip base:** Determine luggage handling, whether a hotel is needed, hotel location and nights, check-in/check-out restrictions, daily start/end location, and travel to/from the arrival/departure terminal.
3. **Spend the days well:** Respect locked must-visit places, recommend suitable attractions, match food/diet and preferences, group geography, sequence visits with opening hours and buffers, and present multiple feasible alternatives.

The optimizer should be able to **reconsider upstream choices** if downstream constraints fail. Example: a cheap late-morning train may be a worse choice than a slightly costlier overnight train because it consumes a sightseeing day; a cheaper distant hotel may lose its savings in taxi fares and travel time. Return options with trade-offs, not a fabricated universal winner.

### Product behavior principles

- **Dynamic discovery does not mean every number is live.** Real named places can be obtained dynamically, but official confirmed prices, seat availability, admission rules and hotel inventory need the right source and access permission.
- **User locks are hard constraints, not mere ranking boosts.** A locked stop must be included if feasible. If impossible, explain why and ask permission to relax; never secretly remove it.
- **Food restrictions are strict filters** where required. Never infer that a restaurant is certified Jain, vegan, allergen-safe or exclusively vegetarian from a generic cuisine label.
- **Travel legs are activities too.** Departure, transit, arrival, meals near a station, bag drop, hotel check-in, checkout, return travel, waiting and transfer buffers belong in the timeline.
- **Less effort in the interface, more rigor in the backend.** Ask only relevant follow-up questions; perform expensive computation after collecting the essential constraints.
- **No fictional certainty.** Show Verified / Published schedule / Estimated / Typical / User supplied / Not confirmed / Unknown with source and freshness.

## 2. Assessment of the current planner screenshots

The screenshots show a thoughtful four-step interface: (1) Journey; (2) Travel style; (3) Places & food; (4) Review. Its colors, spacing, typography and progressive steps form a good presentation layer. It should **not be discarded**. Improve what it asks and how that information changes the solver.

| Current UI observation | Gap | Required behavior |
|---|---|---|
| Origin can be “Already at the destination” | No clear terminal or door-to-door legs | Support origin address/city and explicit “already here” and “self-arranged transport” paths; optional station/home-to-station legs |
| Travel dates and budget | Arrival/departure time and trip-nights unclear | Collect arrival tolerance, departure window, return date/time, whether dates mean travel dates or sightseeing dates, nights, and budget components |
| “A little of everything,” pace, cab/taxi | No conditional preference logic | Ask luggage, children/elders, maximum walking, overnight journey, comfort and local transport only when applicable |
| Text place picker shows a small list | Catalog seems constrained | Search a real POI provider or properly licensed database, show selectable multi-result cards, unique IDs, map, photos/ratings only if sourced |
| “Surprise me” and interests | No category-specific questioning | First lock must-visits, then ask relevant categories (heritage, food, gardens, photography, nightlife, etc.) plus optional exclusions |
| Generic food dropdown | Insufficient strict dietary handling | Distinguish restaurant category, cuisine, vegetarian-only / Jain / vegan, cross-contact uncertainty and meal budget |
| Final review stage | May generate without fixing intercity transport | Show decisions, candidate alternatives, unknowns and price/schedule verification status; users can override suggestions |

**Interaction correction:** The four top-level screens can remain visually, but implement dynamic sub-sections/cards within them. Avoid forcing dozens of mandatory questions. Keep advanced options expandable and ask follow-ups based on transport mode and selected place types.

---

## 3. Full user journey: exact behavior, screen by screen

### Screen A — Start: quick trip intent

Ask for **from** (city/station/address or already at destination), **to** (city/area), **travel starting date**, **date of return or number of nights**, **number of travelers** (adults, children, elderly if relevant), **estimated total budget** (whole group, in INR), and an optional **trip purpose** (sightseeing, family, food, photography, mixed). Validate Indian city aliases and ambiguous city names. Let users enter a locality or station rather than requiring only a city. Show a concise budget scope control: **includes intercity travel / excludes intercity travel**, and **includes hotel / no hotel needed**. Avoid guessing.

**Timing:** Ask “When do you prefer to leave Bengaluru?” with earliest/latest date-time or Morning / Afternoon / Evening / Overnight / Flexible. Ask “By when must you reach Hyderabad?” only when important. Ask whether the return journey must be planned or is already booked. Provide a timezone-aware summary, including arrival on the **following calendar day** for overnight trips.

**Transportation:** Choices: train, bus, flight, own car, rented vehicle, taxi, compare all, or booked independently. These are allowed modes, not an instruction to choose a mode the user excluded. If own car: ask available vehicle/seats, driving breaks, driver count, toll/fuel estimate preferences, parking and acceptable driving hours. If train: class preference, overnight berth preference, boarding/alighting station flexibility and luggage constraints. If bus: sleeper/seater/AC preference and pickup/drop area. If flight: airport transfer, checked luggage and airport reporting buffers. Do not ask irrelevant questions for excluded modes.

### Screen B — Travel style and physical feasibility

Show a few fast choices: **Relaxed / Balanced / Explore More**, preferred local movement (walk/metro/bus/cab/auto/own vehicle), maximum acceptable walking or transfers (optional), special accessibility needs, luggage, arrival-day energy, and desired wake-up time. Offer a toggle “Need a hotel?” and “Start sightseeing from station, hotel/bag drop, or another location?” If arriving very early, ask “Store luggage first?” and whether the hotel allows early check-in; do not assume it does.

**Conditional examples:** If older travelers are present, optionally ask stairs/climbing and rest-break preference, without treating age as a substitute for accessibility needs. If departure is at night, ask sleeper comfort and whether dinner should be planned near the departure terminal. If arrival is before breakfast, ask about breakfast near station/hotel. These should be optional suggestions, not forced daily meals.

### Screen C — Explore, lock & customize places

This screen is **not a tiny hardcoded dropdown**. It should have two complementary panels:

**Discover:** search by place name or category, browse map pins and curated real destination categories, and show optional image, place name, category, neighborhood, rating and review count when available, indicative entrance cost, typical visit length, source/freshness, and “Open in Google Maps.” Filters may include family-friendly, parks, architecture, history, museums, temples, forts, lakes, shopping, art, markets, photographic viewpoints, accessible places and child-friendly attractions.

**My must-visit places:** users can select **multiple** destinations, see a numbered short list, drag to reorder only if order is an actual requirement, mark **Must visit (lock)** vs **Would like to visit**, remove choices, and choose a fixed time if they have a ticket. Allow the user to add a custom place that is not found, but mark it as an unverified custom location until matched to coordinates and an appropriate provider record. Prevent duplicates and ambiguous similarly named places with place IDs and location confirmation.

**Place detail on click:** verified/available description, location on map, best-known published hours, official website, suitable visit duration estimate, ticket/pricing status (confirmed vs estimated), rating, reviews or link to read full reviews, photo/credit, phone when published, accessibility status when known, last verified and source links. Do not fabricate an illustration or reviews. For Google provider content, respect Google logo, attribution, caching and display rules. If photo/license is unavailable, show an honest placeholder.

After the user has locked places, compute an approximate “days needed” and compatibility check. Example: 8 locked attractions including an all-day theme park may not fit into 2 days. Raise this **before** generating the complete trip. Suggest extending duration, dropping a soft preference, or shifting a travel choice. Do not drop locks automatically.

### Screen D — Categories, food and experience intent

Ask interests only after viewing the user's fixed places, with suggested preselected categories derived from those choices—but allow editing. Include heritage, architecture, history, religion, museums, art, gardens, lakes, forts, outdoor nature, street food, shopping, markets, family entertainment, photography, nightlife, science and technology, and local experiences. Let users express priority: **Must have / Interested / Not interested**. Optional special prompts include sunrise/sunset photography, golden hour, quiet morning, indoor midday, evening markets, festival experiences and minimizing crowds. Never promise a place-specific “best time” based solely on generic place-type rules.

**Food preference is a hard constraint when selected as such:** Vegetarian-only, vegetarian meals at mixed restaurants (user consent), non-vegetarian allowed, vegan (verify menu/ingredients), Jain (ask whether strict Jain preparation is required), halal or other religious preferences (verify), egg preferences, allergens, and cuisine preferences. A generic “servesVegetarianFood” flag does not establish an all-vegetarian kitchen, Jain compliance, allergen safety or vegan certification. If there is no sufficiently verified venue, show **Not verified — please confirm with restaurant** and do not quietly recommend a nonmatching restaurant as compliant. Ask whether the user wants breakfast/lunch/dinner suggestions, whether meals are included in hotel fare, and a rough per-person meal budget.

### Screen E — Travel + stay decisions (new essential step or review sub-flow)

The user should see **realistic options, not one unchangeable answer**. Split into:

**Transport option cards:** Train/Bus/Flight/Drive candidates filtered by allowed modes, departure range, arrival time, published schedule (if legally accessed), boarding/alighting points, estimated duration, transfers, last-mile time, available class/comfort, estimated/verified price status and source. Show a recommended option **and alternatives**. The user can lock a preferred train or bus if they confirm it themselves. Where live inventory isn't accessible, show a clearly labeled example/curated published schedule with **Check current timetable/availability on official provider** and let users enter confirmed booking details manually.

**Hotel option cards:** Recommend based on the **whole itinerary**, not just distance to the centroid. Show location, distance/time to major day clusters, arrival terminal transfer, total nights, estimated total stay budget, rating/review status, photos where licensed, published contact/website, cancellation/check-in policies where verified, and a link to inspect or book externally. No invented room inventory, taxes or dynamic date-specific price. Show multiple geographically meaningful alternatives: lower cost vs lower travel time vs more comfort. The user may select **No stay needed / Staying with family / Already booked** and enter a start/end anchor address without pricing.

**Arrival decision:** “Start from terminal or first drop bags at hotel?” Consider check-in hours, whether the hotel permits bag storage, transfer time, meal timing and traveler fatigue. Starting at a station with luggage should require deliberate confirmation. **Return journey** gets a symmetrical check-out/luggage/last-mile/buffer sequence.

### Screen F — Final review and generation

Display a concise editable summary: cities and dates, selected mode or alternatives, arrival/return windows, party size, budget scope and reserved amount, hotel needs, must-visits, interest priorities, meal/diet rules, pace and accessibility, no-go constraints. Mark **verified facts vs assumptions**. Explain what may need official confirmation. On Generate, create a job, not duplicate expensive requests. Give genuine stages: validate → gather candidate evidence → transport/hotel alternatives → travel-time matrix → day assignment → schedule & meals → feasibility verification → alternatives & explanation.

### Screen G — Result: entire journey and multi-day itinerary

Present **up to three meaningfully distinct feasible plans** (e.g. Lower cost / Balanced / Less travel), or fewer if constraints do not permit three. A top summary should show expected spend **range**, nights, planned activities, intercity travel, local travel, walking, free time, confidence, and not-yet-confirmed items. Then present separate sections:

- **Getting there:** home-to-terminal if enabled, terminal reporting buffer, transport, on-board food or station meal suggestions, arrival location/time, arrival transfer and luggage handling.
- **Your stay:** recommended and user-selected hotel with source, travel impact, check-in/out and unconfirmed price indicators.
- **Day-by-day:** a real chronological timeline with each place name, visit window, duration, transport leg, travel cost estimate, buffer, lunch/dinner, rest and Google Maps navigation link.
- **Getting home:** hotel checkout, terminal transfer, reporting buffer, return journey, meals around the return leg.
- **Why this plan?** explain cluster grouping, locked place accommodation, timing, hotel trade-offs, cost and uncertainties from deterministic decision traces.
- **Edit:** replace a place, adjust departure/train manually, switch hotel, change food preference, lock a time, regenerate the affected parts, undo, save version and compare alternatives.

Never imply the user has a paid booking until a verified partner booking workflow actually occurs.

---

## 4. Detailed reference journey (illustrative; not live train/price results)

**Scenario:** Two travelers, Bengaluru → Hyderabad, three sightseeing days; user enters their budget, travel dates and preferred overnight train window. They lock **Charminar**, **Salar Jung Museum** and **Golconda Fort**, express interest in heritage/food/photography, require vegetarian-only restaurants, and request manageable walking.

1. **Input validation:** Interpret the specified departure time in `Asia/Kolkata`; distinguish departure date from arrival and sightseeing dates. Confirm whether the total budget includes round-trip rail fares and hotel nights.
2. **Transport candidate generation:** Find authorized published train options, or use an explicitly curated schedule dataset tagged with source and validation timestamp. Prioritize options meeting the time window, with plausible arrival morning, and include official enquiry/booking links for live seat/fare confirmation. Do not invent train numbers or availability.
3. **Departure evening meal:** If departing around dinner time and the travelers want dinner, search for suitable verified vegetarian restaurants near the **selected boarding station**, allowing sufficient door-to-station and boarding buffer; otherwise mark on-board food as user-managed/unverified.
4. **Arrival:** If arriving early in Hyderabad, show breakfast options near the arrival terminal **or** on the path to the chosen hotel. Ask whether luggage should be dropped off first. Do not place a long fort visit immediately after an exhausting overnight journey without considering pace.
5. **Place discovery:** Search real places around locked attractions and recommended categories. Present correct place records and source-linked photos/reviews. Only use a controlled/verified filter for strict diet, and show Unknown when no reliable evidence is available.
6. **Stay:** Evaluate hotel candidates for 2–3 actual nights as derived from arrival/return timing, both terminal transfers and total daily access to chosen attraction clusters, plus estimated price range and known amenities. Ask user to confirm a chosen hotel or bring their own.
7. **Day geography:** Charminar and nearby Old City attractions could form an area-focused day if opening hours and real travel times permit. Salar Jung Museum must be placed only at a feasible visit window. Golconda Fort may belong to a different day with nearby stops, rather than arbitrary cross-city bouncing. These are **grouping illustrations**, not guaranteed optimal clusters or current opening-hour claims.
8. **Food placement:** Lunch near the current route and during the specified eating window, not halfway across the city just because its rating is higher. Allow a “known dietary match” policy and mark nonverified restaurants as unsuitable for strict requirements.
9. **Experience:** Prefer appropriate outdoor timing based on astronomical solar position plus actual access, weather and observed/viewpoint evidence. If night lighting or shows are advertised, require date-valid official schedules. Never claim precise “best photo angle” on sun geometry alone.
10. **Return:** Build the final day backward from terminal reporting/boarding time. Allow checkout, luggage storage if verified, one or two nearby visits only if they fit, last meal, and terminal travel buffer.
11. **Result:** Show the recommended plan with reasons and alternatives; label each external fact by confidence; offer Google Maps links and official booking verification.

### Simple logical dataflow

```text
USER INPUT
  → Trip intent + confirmed locks + food/access requirements
  → Constraints and budget allocator
  → Authorized intercity transport candidates + independent travel estimates
  → Destination POIs, hotels, restaurants, experience/context evidence
  → Candidate filtering (food, accessibility, dates, duplicates, exclusions)
  → Explore transport × arrival × hotel anchor combinations
  → Geographic grouping + day workload partitioning
  → Road/transit travel-time estimates + buffers
  → Time-window scheduler + meal insertion + return-leg construction
  → Independent feasibility/budget verifier
  → Diverse plan selection + decision trace
  → User-facing timeline, map links, warnings, explanation, save/version
```

---

## 5. Real data: where it comes from, what is free, and what cannot be promised

**Critical rule:** “Real place exists” ≠ “current price/availability is verified.” Adopt a provider registry with `source`, `observed_at`, `expires_at` (where permitted), `accuracy/confidence`, `usage_rights`, `status` and `deep_link`. Integrate each provider through an adapter that declares its capabilities, not generic magic API calls.

| Need | Practical source & access | College-budget assessment | Reliability / limitations | MVP policy |
|---|---|---|---|---|
| Place names, coordinates, POI types, nearby discovery | OpenStreetMap extract / properly scoped Overpass; optionally Google Places API (New) | OSM data open with ODbL obligations; Google has billing and SKU-dependent free monthly allowances for eligible India accounts | OSM coverage varies. Overpass/Nominatim public infrastructure not intended as an unlimited consumer autocomplete service; Google storage/display policies apply | Start city-scale OSM + independently curated verified dataset; optional Google integration |
| Place search / autocomplete | Locally indexed OSM/curated POI catalog; Google Places Autocomplete (New) | Local DB can be free; Google usage metered | **Never implement typing-autocomplete directly against public OSMF Nominatim** | Use local search or appropriately licensed supported provider |
| Photos | Wikimedia Commons or other properly licensed images; Google Place Photos (New) | Commons often free with license attribution; Google API usage metered | Attribution/license per photo; Google Place photo storage/display policy applies | Fallback placeholder; real photo only if permission and provenance exist |
| Ratings and reviews | Google Places API (New) place details, when enabled; direct Google Maps review link | Paid-tier field masks may be triggered despite free usage allowance | Standard Place resource supplies **up to 5 reviews**, not entire review corpus; follow attribution requirements; reviews are opinions | Rating/review count when authorized, links to full Google reviews; no scraped review NLP |
| Address, telephone, website, standard opening hours | Google Places fields; OSM where contributed; official business sites | Some fields in higher-cost Places SKUs | May be absent, outdated or irregular for festivals/holidays | Show source and “verify”; do not assume unknown = open |
| Maps directions link | Google Maps URLs | **No API key required** for outbound map links | Opens external navigation rather than returning an internal route-matrix model | Always provide link for each stop; encode parameters safely |
| Road distance/time matrix | Google Routes API; self-hosted OSRM/Valhalla/GraphHopper with OSM | Google usage metered by matrix elements; self-host requires computing and routable data | Self-hosted OSM routing normally lacks live traffic and public-transit schedule accuracy | Start matrix with lawful provider or local routing engine; label ETA estimates |
| Metro/bus local public transit | Google Routes transit where covered; verified operator/GTFS data if licensed | Coverage and usage vary | Not a universal guarantee of all services or live positions | Show only supported coverage; road fallback where necessary |
| Indian train schedules | Official Indian Railways schedule and reserved trains-between-stations enquiry websites; approved railway data provider if contracted | Official **human-facing enquiry** exists, but no unrestricted official free developer train-inventory API was verified | Train numbers, station codes, seasonal changes, quotas and delays must be confirmed at source | Curate small cited schedule dataset for demo; link to official live verification; user manual confirmation |
| Live seats and exact train fares | Official IRCTC/Indian Railways consumer interfaces or authorized contracted partner | No general unrestricted official free inventory API established | Contract/eligibility requirements; per-date seat/class/quota variability | Do not call it real-time; show “Check live price/availability” and accept user-supplied details |
| Intercity bus schedules/prices | Official bus operator consumer site / authorized partner API / independent curated examples | No unrestricted comprehensive free operator feed established | Operator-specific services and dynamic prices; live inventories restricted | Deep-link to operator and allow user-confirmed service/date/fare |
| Flights | Direct airlines' consumer sites or contracted aggregators | Public shopping/inventory API cannot be assumed free | Taxes, baggage, airport time, time zone and availability | Add after train/bus core is proven, otherwise externally verify |
| Hotel existence, contact, location and rating | OSM, business official site, Google Places | Open POI sources and metered Places | A hotel listing is not proof of room inventory | Show hotel POIs / official contact and source-linked reviews |
| Actual hotel room price and availability for dates | Direct hotel booking engine, eligible commercial booking partner | Booking.com Demand API requires **Managed Affiliate Partner** credentials | Room rate changes by dates, occupancy, taxes, cancellation, breakfast | Estimated stay budget or user-confirmed quote; external booking links; never fake inventory |
| Attraction entry price and event schedules | Official venue/operator website, locally curated dated records | Often free manual verification | Dynamic tickets, holidays, festival closures, child rates | `verified/estimated/unknown` with timestamp; update before trip |
| Weather forecast | Open-Meteo Forecast API | Free for **noncommercial use** under published limits; attribution/license applies | Forecasts cover up to about **16 days**; beyond that use seasonal climate context, not a forecast | Use near-trip forecast and an honest long-range seasonal fallback |
| Sunrise/sunset/solar geometry | Python `astral` or solar calculation | Offline/open-source packages, no external weather API charge | Geometry does not prove quality of view, access or lighting | Use for preferences; validate viewpoint geometry/evidence |
| Crowd popularity, peak hour | Provider with explicit authorization, or transparent heuristics | Reliable unrestricted real-time crowd data not established | Google Places general backend does **not** expose universal live Popular Times | Low-confidence category heuristics labeled as such; optional later provider |
| Festivals/closures | Official state tourism/venue/event sites, manually verified holidays | Manual curation feasible | Regional/event-specific data changes | Warn only on verifiable events, otherwise tentative |
| Restaurant dietary claims | Official restaurant site/menu, explicit verified listing or user confirmation | Manual verification feasible in one city | “Serves vegetarian” ≠ vegetarian-only / vegan / Jain / allergen-safe | Strict exclusions unless suitability verified; call/message to confirm |

### Specific official constraints researched

- **Google Places API (New):** Search/details/photos/ratings are available according to requested field masks and billing tier. Google documentation lists a maximum of five returned reviews and up to ten photo metadata entries per place. Respect attribution and restrictions against caching/storing Places content beyond defined exceptions; place IDs have a special storage exception. See [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Place Details fields](https://developers.google.com/maps/documentation/places/web-service/place-details), [Google India pricing](https://developers.google.com/maps/billing-and-pricing/pricing-india).
- **Free Google Maps links:** [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) do not need an API key. Example, with proper URL encoding: `https://www.google.com/maps/search/?api=1&query=Charminar%2C%20Hyderabad`; use supported Place IDs when available.
- **Indian rail:** Official [train schedule](https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.jsp), [reserved trains between stations](https://www.indianrail.gov.in/enquiry/TBIS/TrainBetweenImportantStations.jsp), [fare enquiry](https://indianrail.gov.in/enquiry/FARE/FareEnquiry.html), and [IRCTC](https://www.irctc.co.in/nget) are consumer verification paths. The official [IRCTC B2B scheme document](https://contents.irctc.co.in/en/NormsforB2B.pdf) evidences significant commercial eligibility; it is not a general free student API.
- **Hotels:** [Booking.com Demand API prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites) require managed affiliate partner status, credentials and a contract. Do not claim access without these.
- **OSM public services:** [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) allows limited uses (maximum 1 request/second, proper ID/attribution) and disallows autocomplete and systematic bulk POI extraction. [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/) forbids bulk/offline download from public tile servers. Obtain appropriately licensed extracts/self-host where necessary.
- **Weather:** [Open-Meteo terms](https://open-meteo.com/en/terms) provide a noncommercial free tier subject to rate limits/CC BY attribution; [forecast docs](https://open-meteo.com/en/docs) show up to 16-day forecast availability.
- **Photos:** [Wikimedia Commons reuse](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) requires checking the particular photo's author/license/attribution.

**Free-first decision:** Use a legally sourced Hyderabad POI dataset + licensed images + manually verified small train/hotel references + Open-Meteo + local/OSM routing where feasible + Maps outbound URLs. Optionally add Google Places under an API/billing account with **strict quota limits and current term checks**. For a live public product, expect ongoing provider and hosting costs; “free college demo” must not be represented as guaranteed free at scale.

---

## 6. Transport: decision engine and actual timetable interaction

### Intercity transport candidate contract

Each candidate: `provider`, `mode`, `service_id/name` (if verified), `boarding_terminal`, `arrival_terminal`, `departure_datetime`, `arrival_datetime`, `timezone`, `days_of_operation`, `class`, `fare_min/max`, `fare_status`, `seat_status`, `source_url`, `verified_at`, `transfers`, `travel_duration`, `terminal_access_time`, `terminal_exit_time`, `boarding_buffer`, `comfort_score`, `reliability_source`. Missing live inventory must be `unknown`, not “available.”

### Ranking and hard filters

- **Hard:** only user-allowed modes; correct date; party fit; required arrival cutoff; no forbidden overnight journeys; wheelchair/access requirements when supported; non-negotiable fare ceiling only when cost is sufficiently known.
- **Soft:** departure closeness to preferred window; door-to-door travel time; total estimated cost; number of transfers; baggage suitability; comfort and arrival-day fatigue.
- **Special:** respect separately booked/locked journeys. If price/schedule data is missing, rank as **tentative**, not as a formally feasible confirmed ticket.

Construct alternative **transport + terminal + first-day** scenarios. A train at 23:00 with arrival at 07:00 changes hotel nights, breakfast and visit capacity, whereas a train at 07:00 arriving later may consume more sightseeing daylight. Do not optimize train price alone.

**UI:** compare cards side by side, then “Choose this / See other departures / Open official booking.” If user selects an externally booked train, accept `train_number`, `date`, `boarding`, `arrival`, `departure`, `class`, `total_paid` as **user-provided**, validating format and dates but not pretending to verify the booking without a partner API. No scraping of IRCTC or third-party booking pages, and no simulated live seat numbers.

### Meals around travel

Construct a meal decision from timestamp and context: `departure_before_mealtime`, `travel_over_mealtime`, `arrival_near_mealtime`, `hotel_breakfast_included`, station food availability, selected diet, meal budget and buffer. When a train is at night, suggest optional dinner near the **departure** station before boarding if feasible; breakfast near the **arrival** station/hotel if arriving in the morning. For morning departure, propose breakfast before boarding if time allows, otherwise label food during transit as user-managed unless verified service options exist. Do not route the traveler across the city just for a restaurant.

---

## 7. Hotel engine: choosing a stay for the actual itinerary

Hotel choice is a combined **price-and-location** problem, not “pick the nearest hotel to a centroid.” For candidate hotel `h`, estimate the sum of all expected day start/end travel, transfers from arrival terminal, luggage/checkout inconvenience, price for actual nights, accessibility, and potential booking constraints.

```text
TotalStayImpact(h) = confirmed_or_estimated_room_cost(h)
                   + local_transport_cost_from_hotel(h)
                   + value_of_travel_time(h)
                   + terminal_transfer_cost(h)
                   + luggage/check-in penalty(h)
                   + user_preferences_penalty(h)
```

Use normalized comparable costs and explicit weights; do not mix minutes and rupees without conversion or normalization. A hotel must not be disqualified for lack of a room price unless “unknown price excluded” is a user-requested hard constraint; instead mark the candidate **needs verification** and avoid claiming full-budget feasibility.

Hotel card: name, area, location, photo/license, rating+review count if sourced, contact, Maps link, actual number of nights, indicative rate source and timestamp, taxes/cancellation/breakfast **only when verified**, check-in/out, luggage-storage status, access to day clusters and arrival terminal. For ratings from Google, show proper attribution. Offer **View other hotels**, **I already booked**, **Stay with family**, **No hotel**. Avoid recommending a hotel when it is not needed.

---

## 8. Routing and itinerary engine: prevent “zigzag” days

Your opposite-direction example is exactly why nearest-neighbor sorting or distance to the hotel alone is insufficient. The optimization objective uses **actual leg-to-leg travel**, not repeated hotel-centered distances. For a route `hotel → A → B → C → hotel`, evaluate `T(hotel,A) + T(A,B) + T(B,C) + T(C,hotel)` and compare against alternatives in their real road/transit network and expected departure times. Include one-way streets and traffic if a supported provider supplies them. Straight-line distance is useful to **shortlist**, not to guarantee travel times.

### Scheduling sequence

1. Validate dates, locked reservations, station/return times and fixed constraints.
2. Discover a bounded set of real candidate attractions, food places and hotels; deduplicate by provider ID and location.
3. Filter hard exclusions: unsuitable diet, incompatible access, incompatible opening hours or dates, outside budget where price is known and firm, forbidden activities.
4. Estimate visit-workload by activity, then geographic affinity; cluster **nearby POIs as candidate groups**, not one arbitrary cluster = one calendar day.
5. Split or merge groups based on total visit duration, walking, meal breaks, return-home constraints, buffer and opening hours.
6. Choose candidate transport/hotel anchors and compute relevant travel-time matrices **only after pruning**. In Google Routes, elements are `origins × destinations` and can be billed accordingly.
7. Schedule time windows (visits, reservations, hotel transfers, meals and transport), include fatigue budget and optional rest periods.
8. Explore swaps and alternatives: hotel, train, day assignment and travel mode trade-offs. Freeze confirmed/locked bookings unless user changes them.
9. Run a **separate feasibility verifier** against the output. Check temporal order, opening windows, travel legs, buffer, meal/diet, budget coverage, locked items, accessibility, and departure cutoff.
10. Select up to three meaningful Pareto-style or differently weighted feasible variants; generate explanations only from factual decision traces.

### Example objective

```text
Hard constraints: confirmed time windows, fixed departure, allowed mode,
                  mandatory visits, forbidden places, strict diet, capacity,
                  required accessibility, credible non-negotiable maximum budget

Among feasible schedules, minimize:
  weighted(daily in-city travel time, estimated cash spending,
           unnecessary transfers, fatigue, detours, uncertainty penalties)
  while maximizing preference match and experiential relevance.

Never pretend unknown costs, room availability or train seats are verified.
```

### Photography/experience time

Use a tiered system: (a) **verified event or access schedule**; (b) astronomical time (sunrise/sunset/solar direction); (c) weather forecast if date within forecast horizon; (d) curated viewpoint observations or suitably licensed evidence; (e) low-confidence general heuristics. Explain why morning/evening was chosen and show uncertainty. A golden-hour timestamp is mathematically computable, but a good photograph depends on view direction, obstacles, weather, permitted access and activity restrictions. Do not promise “best timing for every site” without data.

### Feasibility statuses

- `FEASIBLE_VERIFIED`: essential time/cost/booking facts are verified to necessary standard for the claimed scope.
- `FEASIBLE_WITH_ASSUMPTIONS`: mathematically feasible under disclosed published/estimated times and costs; external availability unconfirmed.
- `NEEDS_USER_CONFIRMATION`: one or more important facts are unknown (train, hotel, dietary suitability, access).
- `INFEASIBLE`: hard constraint conflict; show conflicts and user-approved relaxations.
- `PROVIDER_UNAVAILABLE`: cannot obtain sufficient data; preserve inputs and offer retry/manual path.

A public live-booking guarantee must not be made from a computed itinerary or user-entered travel details.

---

## 9. Engineering architecture (web-first, preserve existing app)

```text
Next.js / existing web frontend (Vercel)
  ├─ Supabase Auth: email/password, Google OAuth, sessions
  ├─ Planner forms / places search / map / transport picker
  ├─ Saved itineraries / plan comparisons / explanations
  └─ Calls to protected APIs
             ↓
FastAPI modular monolith (deployed independently where needed)
  ├─ Auth token verification + access/ownership authorization
  ├─ Trip orchestration / trip job state / usage quotas
  ├─ Providers: places, transport, hotels, routes, weather, event, image
  ├─ Candidate builder + data provenance/confidence model
  ├─ Travel scenario enumeration + hotel scoring
  ├─ Geographic grouping + OR-Tools scheduling
  ├─ Independent feasibility and budget verification
  └─ Plan variants, explanations and versioning
             ↓
Supabase PostgreSQL + PostGIS (private data + our permitted data)
  ├─ profiles/trips/constraints/locked items/plan options/versions
  ├─ licensed or independently curated POI cache/index
  ├─ authorized provider identifiers + permitted provenance
  └─ internal usage metrics and job status
```

**Implementation note:** Do not assume the screenshot proves the codebase uses Next.js or a specific backend; inspect the repository. Host the FastAPI service in an environment appropriate for Python and longer jobs. A Vercel frontend deployment alone does not deploy a separate persistent Python service. Keep one module per domain inside the backend initially—no mandatory microservices/Redis/Kubernetes.

### Provider interfaces

`PlaceProvider.search(query, location, filters)` • `PlaceProvider.details(id)` • `PlaceMediaProvider.images(id)` • `IntercityTransportProvider.search(origin, destination, departure_window, travelers, mode)` • `HotelProvider.search(city, dates, guests, location_filters)` • `RouteProvider.matrix(origins, destinations, mode, departure)` • `WeatherProvider.forecast(place,date)` • `EventProvider.calendar(city,dates)`.

Each provider should declare `supports_live_inventory`, `supports_exact_price`, `supports_schedule`, `supports_reviews`, `supports_photos`, `can_cache_fields`, `licence_and_attribution` and `refresh_rules`; do not blindly assume every provider implements every capability. Return typed errors `UNAVAILABLE`, `NOT_SUPPORTED`, `RATE_LIMITED`, `STALE`, `NO_RESULTS`, `AUTH_REQUIRED`, `PARTNER_REQUIRED`.

### Database changes beyond old blueprint

- **Identity:** `profiles.id` references `auth.users.id` or follows a reviewed equivalent; email/password credentials remain managed by Supabase Auth. Apply RLS to all exposed tables; validate Supabase JWT and trip ownership on protected FastAPI endpoints.
- **Trip intent:** origin and destination **place IDs/coordinates/timezone**, exact departure/return windows, group composition, allowed transport, budget scope and categories, accommodation requirement, luggage preferences, dietary and accessibility constraints, interest priorities, user-provided booking status.
- **User choices:** `locked_places` with `hard/soft`, optional fixed time and reason, `excluded_places`, `selected_transport` with source/status, `selected_hotel`, `user_confirmations`.
- **Provider facts:** an internal provenance envelope with source and time; provider-copyrighted content not persisted beyond license allowances. A permanent generic Google Places JSON blob cache must not be introduced by default.
- **Plans:** `plan_runs`/jobs (status, idempotency key, cost, error), `plans`/variants, `days`, `activities`, `legs`, `cost_estimates` by category and certainty, `constraint_violations`, `decision_trace`, immutable `plan_versions`.
- **Referential safety:** UUID ownership and indexes; check constraints for date order, positive party size, budgets and unique ordered activities; authorization and RLS tests, transactions and version conflict handling.

### Example normalized internal data

```json
{
  "place_id": "tw:provider:identifier",
  "name": "Example Place",
  "category": "heritage",
  "latitude": 17.0,
  "longitude": 78.0,
  "hours": {"status": "unknown", "periods": null},
  "entry_cost": {"min_inr": null, "max_inr": null, "status": "unknown"},
  "dietary": {"strict_vegetarian_only": "unknown"},
  "photo": {"url": null, "licence": null, "credit": null},
  "source": {"provider": "curated", "checked_at": null},
  "external_map_url": "https://www.google.com/maps/search/?api=1&query=Example%20Place"
}
```

*Illustrative schema, not an actual fetched place; coordinate values above are generic sample values.*

### Suggested protected API endpoints (adapt after repository inspection)

`POST /api/trips/drafts` • `PATCH /api/trips/{id}/preferences` • `GET /api/places/search` • `GET /api/places/{id}` • `POST /api/trips/{id}/locked-places` • `GET /api/transport/options` • `POST /api/trips/{id}/transport-selection` • `GET /api/hotels/options` • `POST /api/trips/{id}/generate` (idempotent job) • `GET /api/plan-jobs/{job_id}` • `GET /api/trips/{id}/plans` • `POST /api/trips/{id}/replan` • `GET /api/trips/{id}/versions`.

Every private endpoint enforces owner/authorized-member permissions. Rate-limit place search, transport discovery and optimization separately. No broad privileged Supabase keys in the browser.

---

## 10. Recommended chronological build order (feature gates)

**Do not implement the entire product in one Antigravity prompt.** Have the agent inspect and incrementally improve the existing repository. Each phase has verifiable completion criteria; time estimates depend on weekly hours and provider access.

| Phase | Build exactly this | Do not build yet | Exit criteria |
|---|---|---|---|
| 0. Repository safety | Inventory routes/components, current DB/Auth, env keys, deployments, screenshots' data path; baseline tests | New UI rewrite | Architecture map + no lost features |
| 1. Real identity & trip persistence | Supabase email/Google Auth, callbacks, protected routes, profile, RLS, trip drafts/save | Group accounts, UPI | Two real test users cannot read each other's trips |
| 2. Journey intake | Rewrite Journey fields and conditional travel style; budget scope, departure/return windows, station/hotel/start preferences | Train scraper | Input validation and draft restore work |
| 3. Real place discovery | Licensed Hyderabad POI dataset with backend search + map pins + multiple locks + place detail links, images where licensed | Global search engine, bulk Google reviews | User can lock >5 real, distinct places without hardcoded frontend list |
| 4. Dietary & category logic | Interests, category boosts, strict restaurant dietary restrictions and verified/unknown data status | AI nutritional claims | Unsafe/unknown restaurant not falsely labeled compliant |
| 5. Journey scenario engine | Train/bus/self-drive candidate **interfaces**, curated published examples with provenance and external official verification; terminal/meal/luggage cases | Unlicensed live fares/inventory | Morning vs overnight option changes day-1 plan and budget |
| 6. Hotel selection | Hotel POIs, arrival anchor, nights, total daily travel scoring, choose own hotel/no hotel, confirmed-vs-estimated labels | Live booking checkout | Hotel choice changes travel outcome with explainable score |
| 7. Optimizer vertical slice | Candidate filter, clustering/workload, route matrix, timed itinerary, meals, buffers, return journey, independent verifier | Complex ML crowd NLP | Route avoids zigzags and satisfies fixed windows in test cases |
| 8. User results UX | Timeline/map, up to 3 alternatives, explanations, missing-data notices, Google Maps/official links, plan saving/version | Realtime group editor | End-to-end Bengaluru–Hyderabad demo succeeds with assumptions visible |
| 9. Real provider upgrades | Google Places if budget/account, live routed travel times, optional supported transport partners, weather, events | Unconfirmed commercial booking integration | API budgets, attribution, failure fallbacks and cache licensing tested |
| 10. Production & study evaluation | Rate limits, usage/cost monitoring, auth/RLS tests, mobile/accessibility, outage recovery, load tests, analytics and comparisons | Payments/live tracking by default | Defined user-facing and backend metrics met |

### Smallest credible semester demonstration

One destination city (Hyderabad); one origin city (Bengaluru); actual named local places sourced from a licensed POI dataset; a small cited, manually curated rail/bus options list (clearly marked **schedule reference, not live**); a few independently documented lodging candidates with **estimated/unverified room rate**; correct multimodal/arrival logic; 2–4 day planning; at least 5 locked user-selectable real POIs; strict user-selected food type; route-aware daily groups; 1–3 feasible plans; saved accounts; source labels; external official train/Google Maps links. Add more cities only after this is defensible.

---

## 11. UX, safety and reliability rules for every milestone

- Keep four top-level planner steps if they remain clear; use conditional panels to avoid form fatigue. Search results should be keyboard accessible and touch friendly, with loading/empty/error states and distinct place IDs.
- Always display source and price/availability status next to consequential facts. “Estimated ₹X–₹Y” is not “₹X confirmed.” Do not display invented stars or reviews when the provider lacks data.
- Do not allow strict diet preferences to be treated as a soft recommendation weight; ask about uncertain restaurant suitability and provide a contact link.
- Every saved trip belongs to its authenticated creator; shareable links need their own scoped permissions. Location and trip dates should be private by default.
- Supabase session refresh, Google OAuth, email confirmation, password recovery, server verification, RLS, CSRF where relevant, input validation, anti-bot/rate limits and log redaction must be tested before real-user launch.
- City/place search and heavy generation must have separate quotas and retry/backoff; meter Google provider calls by actual billing units. No expensive infinite loops or unbounded matrices.
- Use actual progress stages for itinerary jobs and clear timeout/failure messages. Preserve drafts and allow changing constraints without losing locked places.
- Use WCAG-aware semantic inputs, text contrast, loading announcements, and responsive layouts. Keep image payloads small; aim for good Core Web Vitals and measure actual bottlenecks.
- Implement no-results, no-hotel-needed, no-food-match, no-feasible-plan, provider outage, unverified train and invalid date/booking cases before claiming “complete.”
- Database credentials and partner keys are provided by the developer via secret configuration, never hardcoded. Google Maps links alone require no paid Maps API key.

## 12. Test plan: high-value scenarios and acceptance criteria

| Case | Expected testable behavior |
|---|---|
| Two locked places on opposite sides of Hyderabad | Day grouping considers inter-stop travel, not hotel→stop→hotel for every stop |
| Night train vs morning train | Different arrival date, hotel night count, sleep/fatigue and meal blocks |
| Selected train arrives after an attraction's closing time | Attraction moved to another valid day or explicit infeasibility shown |
| Arrival at 05:00, hotel check-in at 14:00 | Bag drop status verified or labeled unknown; no false early check-in guarantee |
| User selects no hotel | Planner never charges a room or forces a hotel selection |
| Strict vegetarian-only restaurant requirement | No mixed/unknown restaurant silently represented as verified vegetarian-only |
| Jain or allergy-sensitive traveler | No claim of suitable kitchen/preparation without venue evidence |
| 10 must-visit places in two short days | Explain conflicts and offer explicit choices; do not drop locks |
| User reselects an alternate train | Recompute arrival, meals, hotel logistics, budget and affected days |
| Hotel farther away is cheaper | Compare full cash + travel trade-off rather than listing room price only |
| Quota exceeded / network offline | Honest temporary failure, saved inputs, retry and budget protection |
| Train availability unavailable | “Live seat availability not verified” and official source link |
| Google photo missing | Proper placeholder, no fake image, no broken layout |
| Locked place lookup matches similarly named POIs | User confirms correct city/location using IDs, address and map |
| Two logged-in accounts | User A cannot read User B's drafts, itinerary or plan generation results |
| Refund/cancellation claim shown without booking | Must not exist; platform does not issue bookings |
| Plan total exceeds strict confirmed cost ceiling | Reject as confirmed feasible or show estimate uncertainty and ask user |
| Date beyond weather forecast horizon | Show seasonal trend, never a fabricated exact forecast |

### Quantitative metrics to collect

- Hard-constraint violation rate (target **zero** for outputs claimed feasible), no-feasible-plan precision, percentage of locked places retained, mean/median total in-city travel time per day, scheduling lateness, route zigzag ratio vs basic baselines, walking and fatigue surrogate, estimated budget deviation vs actual trip, alternate-plan diversity, estimated and measured API cost per generation, generation p50/p95, broken-link/error frequency, and user plan edits/acceptance.
- For a college comparison: generate the same cases using **naive input-order sequencing**, **nearest-neighbor**, and **TripWeave solver**; compare route minutes and feasibility **using the same travel-time matrix and constraints**, not incomparable methods or invented gains.

### Acceptance boundary

“Live” only if actual authorized provider results were retrieved at the requested date/time; “verified” only if checked with adequate freshness and legal access; “estimated” if computed from assumptions; “user supplied” if entered by the traveler. A working demo can be excellent without real booking inventory if it is transparent and algorithmically correct.

---

## 13. Decisions still requiring developer approval

1. **Budget scope:** Is ₹20,000 round trip plus hotel plus destination, or destination-only? Default must be explicit, not inferred.
2. **Arrival/departure semantics:** Do travel dates include overnight journey days? Which days count as sightseeing days? Store independently.
3. **Provider budget:** Is a Google Maps billing account permitted with hard quotas and monitored free-tier use, or is *zero risk of charges* mandatory? The latter means no Google billed APIs, just outbound free Maps URLs and OSM/curated data.
4. **Train integration:** Are curated verified published schedules + official verification links acceptable for this college MVP (recommended), until a licensed inventory integration exists?
5. **Strict food rules:** Must restaurants be exclusively vegetarian/Jain/vegan, or can user-accepted mixed kitchens qualify? Never decide for user.
6. **Hotel access:** Are estimated room-price ranges with external booking links acceptable, or is live hotel booking required? The latter needs partner eligibility/access.
7. **Travel style:** Should user select one fixed mode, allow multiple mode alternatives, or allow the optimizer to recommend any mode subject to exclusions?
8. **Source dataset:** Use OSM city extract + independently verified supplemental records (recommended free-first), or Google Places field-masked API (richer, billing and terms)?
9. **Actual repository technology:** Confirm current frontend/backend by inspecting code. Preserve deployed work and use migrations rather than an unsolicited rewrite.

---

## 14. Antigravity implementation instructions (copy into its task)

> Inspect the current TripWeave repository and the existing `product_spec.md`, `engineering_blueprint.md`, and this journey document. Keep the working visual identity and current pages; do not rebuild the whole frontend. Implement the **door-to-door journey model** in chronological phases: Auth/save → complete trip input → licensed dynamic places search and multi-lock → conditional interests/strict dietary filters → transport alternatives and official-source verification → hotel/arrival/luggage selection → geography-aware time-window optimizer with buffers and meals → independent verifier → 1–3 explainable plans and versioned storage. Inspect actual framework versions before choosing integration code. Do not hardcode frontend place results or train inventories as live data. A curated demo transport table is allowed only if labeled published/manual/reference with source and timestamp. Never invent official schedules, seats, prices, ratings, reviews or photos. Do not scrape Google/IRCTC/booking portals or violate map/POI licensing. Use secure Supabase Auth, server access checks and RLS. Create typed provider adapters and distinguish verified, estimated, unknown and user-supplied values. Build in small independently tested batches; after each stage show what changed, the request/dataflow, tests, and remaining external setup. When keys or paid billing are required, stop and give the owner step-by-step provider-dashboard instructions rather than inventing credentials or making silent purchases. Do not edit the original product specification unless explicitly authorized; propose engineering-blueprint changes for approval. **First deliver:** a repository gap analysis mapping the present four screens and APIs to this workflow, plus the minimal change set for the first milestone.

---

## 15. Selected official references (review again when implementing)

1. Google Places API (New), fields & policies — https://developers.google.com/maps/documentation/places/web-service/place-details ; https://developers.google.com/maps/documentation/places/web-service/policies ; https://developers.google.com/maps/documentation/places/web-service/data-fields
2. Google India pricing and usage — https://developers.google.com/maps/billing-and-pricing/pricing-india
3. Google Maps URLs (no key) — https://developers.google.com/maps/documentation/urls/get-started
4. Google Routes Matrix & transit — https://developers.google.com/maps/documentation/routes/compute_route_matrix ; https://developers.google.com/maps/documentation/routes/transit-route
5. Indian Railways schedule / trains between stations / fare — https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.jsp ; https://www.indianrail.gov.in/enquiry/TBIS/TrainBetweenImportantStations.jsp ; https://indianrail.gov.in/enquiry/FARE/FareEnquiry.html
6. IRCTC official consumer site and B2B eligibility — https://www.irctc.co.in/nget ; https://contents.irctc.co.in/en/NormsforB2B.pdf
7. Booking.com Demand API partner prerequisites — https://developers.booking.com/demand/docs/getting-started/prerequisites
8. OSM public Nominatim policy and tile rules — https://operations.osmfoundation.org/policies/nominatim/ ; https://operations.osmfoundation.org/policies/tiles/
9. Open-Meteo forecast and non-commercial usage terms — https://open-meteo.com/en/docs ; https://open-meteo.com/en/terms
10. Wikimedia Commons image reuse — https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
11. Supabase Auth docs and RLS — https://supabase.com/docs/guides/auth ; https://supabase.com/docs/guides/database/postgres/row-level-security

**Documentation rule:** This is the **recommended updated design**, not a claim that all pieces are already implemented. The attached older specification contains long-term vision and historical corrections. Reconcile current repository and confirm budget/data-license decisions before coding. Recheck providers at integration time because limits, licensing and products can change.
