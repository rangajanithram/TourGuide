# 🧭 TripWeave — AI-Powered Trip Optimizer
### Complete Product Specification (Long-Term Vision & Feature Archive)

> **Tagline:** *You choose the trip. We figure out the journey.*

---

## ⚠️ Document Governance & Source-of-Truth Hierarchy (Read First)

This document (`product_spec.md`) is the **long-term product vision, feature catalog, and multi-round review archive**. Because it preserves historical brainstorming and iterative corrections alongside future phases, AI coding agents and engineers must follow this strict hierarchy:

| Priority | Document / Source | Role & Authority |
|---|---|---|
| **1 (Highest)** | **`AGENTS.md` & Verified Repository Code** | Operational rules, security boundaries, active stack (`Next.js` + `FastAPI` + `Supabase`), and tested code. |
| **2** | **`docs/engineering_blueprint.md` (v2.0)** | **Authoritative current build plan**, database schema with RLS, API licensing rules, algorithm contracts, and stage acceptance criteria. |
| **3** | **`docs/product_spec.md` (This File)** | **Long-term product vision** and future feature requirements (Group Sync, OCR, Live Transit, Native Mobile). |

### Key Reconciliations with Current Engineering (`engineering_blueprint.md` v2.0)
1. **Web-First Direction**: TripWeave is built web-first using **Next.js (Vercel)** + **FastAPI (Render)** + **Supabase (Auth + PostgreSQL + RLS)**. References to React Native/Expo in earlier notes represent a future Phase 3 mobile expansion, not the current frontend.
2. **Authentication & Data Ownership**: User identities are managed exclusively by **Supabase Auth (`auth.users`)** with PKCE and Row-Level Security (RLS). Standalone unlinked user tables are superseded.
3. **Google Places API Licensing**: Only `google_place_id` may be stored indefinitely. Do **not** implement a blanket 30-day JSON cache of restricted Google Places fields or scrape/mine bulk Google reviews (Places API returns at most 5 reviews).
4. **User Constraints vs. Evidence Confidence**: A user's `mandatory` (pinned) activity must **never** be silently downgraded to `preferred` due to low data confidence. Instead, keep it mandatory and surface an explicit `unverified` warning or infeasibility explanation.
5. **Feasible Variants**: Return **up to 3** genuinely distinct feasible plans; if tight constraints only permit 1 or 2 feasible plans, return those honestly and explain why.

---

## 🎯 The Problem We Solve (Simply Put)

Current apps like Wanderlog make you plan your own trip (they're digital notebooks).  
**TripWeave plans the trip for you** — intelligently, geographically optimized, within your budget, with no zigzagging across the city.

---

## 👁️ The Core Design Philosophy (Anti-Wanderlog)

Wanderlog's biggest mistake: **dumping everything on screen at once.**

### Our Rule: "One Thing at a Time"

| What Wanderlog Does | What TripWeave Does |
|---|---|
| Shows 10+ menu options immediately | Shows ONE primary action: "Plan a Trip" |
| You research and add places manually | AI generates the full plan, you approve/tweak |
| Route optimization is a paid feature | Route optimization is the core, always free |
| Expense tracking is buried | Expense tracker is a floating bottom bar, always visible |
| Collaboration is a separate flow | Group mode is baked in from the start |

### The 3-Screen Rule
A new user should reach their full AI-generated itinerary in **3 screens or less.**

```
Screen 1 → Enter trip basics (where, when, how many, budget)
Screen 2 → Choose preferences (fast checkboxes: transport, food, interests, pace)
Screen 3 → Review your generated plan  ✅ Done
```

Everything else (expense tracker, group sharing, map view, re-planning) is **discoverable but not forced.**

---

## 📱 Full Feature Set

---

### FEATURE 1: AI Trip Generator (Core)

**Input:**
- From / To city
- Travel dates (or number of days)
- Number of people (with age groups: adults / kids / elderly)
- Total budget (INR)
- Transport preference: Train / Bus / Flight / Car / Any
- Interests (tap chips): History, Food, Shopping, Nature, Religious, Adventure, Photography, Nightlife
- Food type: Veg / Non-veg / Vegan / Jain / Any
- Pace: Relaxed / Balanced / Explorer

**What AI generates:**
- Best inter-city transport option (comparing price + travel time + last-mile convenience to hotel)
- Which bus stand / train station to arrive at and which stop to deboard
- Geo-clustered attractions (Day 1 = Old City zone, Day 2 = West zone, etc.)
- Hotels selected *after* knowing attraction clusters — picks the one closest to the center of gravity
- Restaurants placed *inside* the itinerary at natural lunch/dinner times, filtered by food type + budget + proximity + open hours
- Full day-by-day timeline with travel time between each stop

**3 Plan Variants Generated:**
```
Plan A — Budget (₹28,500)    [tight budget, public transport]
Plan B — Balanced (₹36,200)  [mix of cab + metro, comfortable hotel]  ← recommended
Plan C — Comfort (₹44,800)   [private cab, better hotel, fewer crowded stops]
```

User picks one. Can also mix-and-match items from all 3.

**Why this hotel? Button:**
> ✓ ₹2,400/night — fits your budget  
> ✓ 1.1 km from your main Day 1–2 attraction cluster  
> ✓ 18 min from Hyderabad railway station  
> ✓ Saves ~4.5 hrs of unnecessary travel vs the cheaper option  

---

### FEATURE 2: Smart Expense Tracker

**The philosophy:** Don't make it a separate app. Make it feel like a natural part of the trip.

#### How it works:

**Context-aware prompts:**
When the user checks off "Lunch at Hotel Shadab" in the itinerary:
```
🍛 How was the biryani?
   "Add what you spent →"  [₹ ___]  [Split equally] [Skip]
```

When they check off "Auto to Charminar":
```
🛺 Auto ride to Charminar
   "Add fare →"  [₹ ___]  [Skip]
```

This makes expense entry feel like a 2-second check-in, not a chore.

**The Expense Dashboard (always visible as bottom bar during the trip):**
```
┌────────────────────────────────────┐
│ 💰 Budget: ₹40,000                  │
│ ████████░░░░░░░  ₹22,400 spent     │
│ ₹17,600 remaining • Day 2 of 4     │
└────────────────────────────────────┘
```
Tap it → full breakdown:
```
Transport       ₹8,400   [████░░░]
Hotel           ₹4,800   [███░░░░]
Food            ₹5,200   [████░░░]
Activities      ₹1,800   [██░░░░░]
Local transport ₹2,200   [██░░░░░]
──────────────────────────
Spent so far   ₹22,400
Remaining      ₹17,600
Predicted total ₹39,100 ✅ Under budget
```

**AI Budget Warning:**
> ⚠️ At your current food spending pace, you'll exceed your food budget by ₹1,200. Want me to suggest cheaper restaurants for Day 3?

**Receipt Scan:**
Camera icon → scan any restaurant bill → OCR auto-fills the amount → confirm → done.

---

### FEATURE 3: Group Trip Planning

This is the **biggest social differentiator.** Indian trips are almost always group trips.

#### 3A — Creating a Group Trip

**One person creates the trip** (the "Trip Host") and shares a simple invite:

```
Suresh created "Hyd Trip 2025 🔥"
Join with code: HYD-4421
Or tap this link 👉 [tripweave.app/join/HYD-4421]
```

Friends join via link — **no signup required for guests.** They just enter their name.

#### 3B — Group Planning Mode

Each member can:
- 👍 Vote on places to visit ("I want to go here" / "Skip this")
- 📌 Add a place they want to see
- 💬 Comment on any itinerary item
- 👀 See the live itinerary

The Trip Host sees a consolidated view:
```
📍 Ramoji Film City
   ✅ Suresh  ✅ Priya  ✅ Ravi  ❌ Meera
   → 3/4 want to go. Add it? [Yes] [Skip]
```

AI then regenerates the optimized route respecting group votes.

#### 3C — Group Expense Tracker (This is the killer feature)

**Who paid → auto-calculate who owes whom.**

When adding an expense:
```
🍛 Dinner at Paradise Restaurant
   Total bill: ₹2,400
   Paid by: [Suresh ▾]
   Split: [Equally ✓] [Custom] [Only some people]
   Members: ✅ Suresh  ✅ Priya  ✅ Ravi  ✅ Meera
   → Each owes Suresh: ₹600
```

**Group Balance Dashboard (real-time, syncs in <2 seconds):**
```
Group: Hyd Trip 2025 🔥
Total spent: ₹18,400

Priya owes Suresh    ₹1,200  [Remind] [Settle]
Ravi owes Suresh     ₹800    [Remind] [Settle]
Meera owes Priya     ₹450    [Remind] [Settle]
```

**Settle button:** Opens UPI deep link. One tap → Google Pay / PhonePe.  
After payment, both users get a notification and the balance clears instantly.

**Notification when someone adds an expense:**
> 💸 Suresh paid ₹2,400 for dinner. You owe ₹600. [View] [Settle Now]

**End-of-trip summary (WhatsApp-shareable card):**
```
🧳 Hyd Trip 2025 — Final Summary
4 people • 4 days
Total spent: ₹38,200 (under budget ✅)

Top spend: Hotel (₹9,600)
Best meal: Paradise Restaurant ₹2,400
Km traveled: 142 km

Suresh gets back: ₹1,800
Priya gets back: ₹450
Ravi owes: ₹1,200 (pending)
```

---

### FEATURE 4: Live Trip Mode (During the Trip)

Once the trip starts, the app switches to a simpler "During Trip" mode:

**Today's view:**
```
📅 Day 2 — Hyderabad Old City

✅ 08:30 Breakfast at hotel
🔵 09:30 Charminar          ← CURRENT STOP
   ↓  🛺 Auto • 2.1 km • ~12 min • ~₹50
⬜ 11:30 Laad Bazaar
   ↓  🚶 Walk • 300m • 4 min
⬜ 12:30 Salar Jung Museum
   ↓  🛺 Auto • 1.4 km • ~8 min • ~₹40
⬜ 13:30 🍛 Lunch — Hotel Nayaab
   ...

[I'm tired — simplify my day]   [Replan from here]
```

**"I'm tired" button** → removes 1–2 activities, replaces with a relaxing option (café, park, hotel rest).

**Traffic alert:**
> 🚦 Heavy traffic toward Salar Jung. Suggested: Visit Laad Bazaar first, then museum after traffic clears (saves ~25 min).

---

### FEATURE 5: India-Specific Intelligence

- **Bus stop awareness:** "Get down at Imlibun Bus Stand — 1.2 km from your hotel. Auto fare ~₹60."
- **Train coach guidance:** "Platform 3, Coach S4 — it stops near the staircase for faster exit."
- **Festival calendar:** Automatically warns if your trip dates overlap with local festivals (crowd alerts) or holidays (closure alerts).
- **UPI-only restaurant flags:** "This place is cash-only. Nearest ATM: 200m."
- **Telugu/Hindi/Kannada phrase card:** Destination-language quick phrases for non-local visitors.
- **Auto/cab price range:** Shows expected local fare ranges so you're not overcharged.
- **Heat/rain advisory:** "Outdoor forts are brutal at 2 PM in Hyderabad in May. Suggesting museums from 12–3 PM, outdoor spots in the evening."

---

### FEATURE 6: Conversational Re-Planning

At any point during the trip, tap the AI chat button:

> "My parents are very tired today"
→ AI reduces walking by 60%, removes 2 outdoor stops, suggests a comfortable café and an easy indoor spot.

> "We want to eat Hyderabadi biryani for dinner, best place near us"
→ Shows top 3 options within 2 km, filtered by rating + budget + open now. One tap adds to itinerary.

> "Skip tomorrow's fort visit, we're not interested"
→ AI reorganizes the day, fills the gap with nearby alternatives matching your interests.

---

### FEATURE 7: Universal Best Experience Intelligence

> *"The app doesn't just tell you where to go. For every single landmark, it knows the best time, best conditions, best viewpoint, and the best version of that experience — automatically."*

The Charminar golden hour was just **one example**. Every landmark has its own "best moment" and the engine computes it for all of them.

A waterfall is best post-monsoon. A fort is best at dawn before crowds arrive. A bazaar comes alive at dusk. A lake is magical in early morning mist. A sound-and-light show only runs at 6:30 PM. A temple is most spiritual during morning aarti. A zoo's animals are active at opening time. A biryani restaurant serves a fresh pot at 1 PM and again at 8 PM.

**The engine knows all of this — for every place, on every trip date, for every type of user.**

---

#### The Universal Best Experience Taxonomy

Every landmark in the database gets scored across **6 dimensions**:

```
DIMENSION 1 — Light & Time of Day
  golden_hour_morning | golden_hour_evening | blue_hour
  night_illuminated | overcast_preferred | midday_avoid
  depends_on_sun_angle  ← calculated per trip date (astral + bearing math)

DIMENSION 2 — Crowd & Timing
  early_morning_low_crowd | weekday_preferred | weekend_avoid
  festival_transforms (Eid at Charminar, Diwali at temples, Holi at ghats)
  off_season_better | peak_season_better (monsoon for waterfalls)

DIMENSION 3 — Weather & Season
  best_season: [post_monsoon | winter | summer | monsoon]
  avoid_in: [summer_afternoon | monsoon_if_outdoor | foggy_for_viewpoints]
  best_weather: [clear_sky | overcast | misty_morning]
  rain_friendly: true / false

DIMENSION 4 — Fixed Events & Schedules (Hard Data)
  sound_light_show: "18:30"       ← Golconda Fort, Mysore Palace
  aarti_times: ["05:30","19:00"]  ← Birla Mandir, Tirupati
  market_peak: "17:00–21:00"      ← Laad Bazaar, Fancy Bazaar
  boat_hours: "06:00–21:00"       ← Hussain Sagar, Dal Lake
  prayer_times: calculated daily   ← Mecca Masjid, Jama Masjid

DIMENSION 5 — Activity Match
  photography | family_visit | meditation | shopping | food_experience
  architecture | cultural_immersion | boating | history | religious
  nightlife | adventure | nature | birdwatching

DIMENSION 6 — Physical Access
  requires_climbing: true/false
  elderly_friendly: true/false
  child_friendly: true/false
  wheelchair_accessible: true/false
  advance_ticket_required: true/false
  dress_code_required: true/false   ← temples, mosques
```

---

#### Every Place Type Has Different "Best Moment" Rules

| Place Type | Best Moment | Source |
|---|---|---|
| **Fort / Hilltop** | Dawn — cool, golden light, no crowd | Astronomy + review NLP |
| **Mosque / Dargah** | Sunset Azaan — spiritual atmosphere peaks | Prayer schedule + review NLP |
| **Temple** | Morning aarti (5–7 AM) or evening aarti (7–8 PM) | Fixed schedule + review NLP |
| **Museum / Art Gallery** | Weekday morning — quiet, cool, unhurried | Popular Times data |
| **Waterfall** | Aug–Oct post-monsoon — maximum flow and roar | Seasonal data + review NLP |
| **Lake / Reservoir** | Sunrise — mist, bird calls, mirror reflections | Astronomy + review NLP |
| **Night Market / Bazaar** | 5–9 PM evening — vendors set up, lights on | Popular Times + review NLP |
| **Beach** | Sunrise or sunset — avoid midday heat | Astronomy + review NLP |
| **Sound & Light Show** | Fixed show time only — hard constraint | Schedule DB (never override) |
| **Observatory / Planetarium** | After dark, clear sky forecast | Astronomy + weather API |
| **Palace / Heritage Site** | Weekday morning — before school groups arrive | Popular Times + review NLP |
| **Biryani Restaurant** | Lunch 1–2 PM or dinner 8–9 PM (fresh deg) | India-specific review NLP |
| **Street Food Street** | 6–10 PM — peak freshness, full variety | Review NLP + Popular Times |
| **Hilltop Viewpoint** | Sunset + clear weather + low wind | Astronomy + weather API |
| **Zoo / Wildlife Sanctuary** | Opening hour (7–9 AM) — animals most active | Review NLP + ecology |
| **Botanical Garden** | Early morning — cool, fragrant, uncrowded | Popular Times + seasonal |
| **Ghats (river steps)** | Sunrise for bathing rituals / evening aarti | Astronomy + fixed schedule |
| **Shopping Mall** | Weekday afternoon — no weekend crowd | Popular Times |
| **Cave / Cavern** | Midday fine — no sun needed, temperature consistent | Review NLP |
| **Amusement Park** | Weekday, open time — shortest queues | Popular Times + review NLP |

---

#### How the Engine Learns "Best Moment" for Any New Place

The system doesn't need manual curation for every landmark. It uses a **4-source pipeline**:

```
SOURCE 1: Place Type Rules (instant, automatic)
  → "This is a temple" → apply temple rules: aarti times, dress code, morning preferred
  → "This is a waterfall" → apply waterfall rules: season check, rain_friendly=true

SOURCE 2: Review NLP Mining (runs offline/nightly)
  → Scan all Google reviews for the place
  → Extract signals:
       time_mentions:    "morning", "sunset", "evening", "night"
       crowd_signals:    "too crowded", "peaceful", "empty"
       light_mentions:   "golden light", "beautiful at dusk", "well lit at night"
       season_mentions:  "monsoon", "winter", "summer", "peak season"
       activity_mentions: "great for photos", "family friendly", "romantic"

SOURCE 3: Astronomical Calculation (per trip date, per place)
  → Compute golden hour, sun azimuth, sun elevation
  → Calculate light angle per viewpoint — which face of monument is lit

SOURCE 4: Weather + Seasonal Data (at trip generation time)
  → Current forecast for the trip dates
  → Historical seasonal patterns for the city
```

**Result for any landmark, anywhere:**
```python
place_experience = {
  "place_id": "golconda_fort_hyderabad",
  "best_moments": [
    {
      "label":       "Dawn Visit",
      "time":        "06:30–08:30",
      "why":         "Cool temperature, golden light on stone, almost no crowd",
      "confidence":  "high",
      "sources":     ["review_nlp", "astronomy", "popular_times"]
    },
    {
      "label":       "Sound & Light Show",
      "time":        "18:30",
      "why":         "Daily show — fort illuminated with narration",
      "confidence":  "certain",   ← hard fact, not a prediction
      "sources":     ["fixed_schedule"]
    }
  ],
  "avoid": ["12:00–15:00 — extreme heat + harsh light"],
  "best_season": "October–February",
  "requires": ["comfortable_shoes", "1.5hrs", "climbing_tolerance"]
}
```

---

#### The 3 Types of Intelligence (Critical Design Rule)

#### The 3 Types of Intelligence (Critical Design Rule)

This feature mixes three completely different kinds of knowledge. They must **never be confused** — for the user's trust, and for engineering correctness.

| Type | What it is | Example | How we get it |
|---|---|---|---|
| 🧮 **Calculation** | Mathematically precise facts | Sunset is at 05:58 PM on 17 Oct in Hyderabad | `astral` library, zero error |
| 🔎 **Evidence** | Inferred from data | This viewpoint has 67 mentions of "great Charminar view" in reviews | NLP on Google reviews |
| 🤖 **Prediction** | Model's best estimate | This viewpoint likely gives best golden-hour composition for a photographer | Scored ranking model |

The app shows confidence levels to the user accordingly:
```
📸 Main Approach Road     ← Confidence: ✅ High  (lots of review evidence + sun geometry match)
📸 Nimrah Café Rooftop    ← Confidence: ⚡ Medium (fewer reviews, but geometry is good)
📸 Laad Bazaar Lane       ← Confidence: 💡 Likely (mostly based on description, less photo evidence)
```
> This builds trust. The app isn't pretending to know everything — it shows what it knows and how.

---

#### Step 1 — Astronomical Calculation (Zero API cost, zero error)

Using the trip date + place latitude/longitude:
```python
from astral import LocationInfo
from astral.sun import sun, golden_hour
from datetime import date

city = LocationInfo("Hyderabad", "India", "Asia/Kolkata", 17.385, 78.487)
s = sun(city.observer, date=date(2025, 10, 17))

# Precise times for this specific date:
golden_morning = golden_hour(city.observer, date=date(2025,10,17), direction=SunDirection.RISING)
# → (06:07 AM – 07:10 AM)

golden_evening = golden_hour(city.observer, date=date(2025,10,17), direction=SunDirection.SETTING)
# → (04:58 PM – 05:58 PM)
```
**Free. Works offline. Accurate to the minute for any date, any city on Earth.**

---

#### Step 2 — Sun Geometry (The Clever Part)

This is what no other travel app does.

We don't just know *when* golden hour is. We know **which direction the sun is coming from** at that exact time — and therefore *which viewpoints get the best light on Charminar* specifically.

```python
from astral.sun import azimuth, elevation

# At 5:30 PM on 17 Oct in Hyderabad:
sun_azimuth   = azimuth(city.observer, specific_datetime)   # e.g. 258° (west-southwest)
sun_elevation  = elevation(city.observer, specific_datetime) # e.g. 12° (low, warm light)

# Viewpoint → Charminar bearing:
def bearing(from_lat, from_lng, to_lat, to_lng):
    # Returns compass bearing in degrees
    ...
    # Laad Bazaar → Charminar = ~45° (northeast)

# Light direction vs viewing angle:
# If sun is at 258° and viewer is at 45° from monument:
# Sun is BEHIND the viewer → front-lit Charminar = vibrant, warm colours
# Sun is BEHIND the monument → silhouette shot = dramatic, moody
```

**Result for each viewpoint:**
```
Laad Bazaar → Charminar bearing: 45° (northeast)
Sun azimuth at 5:30 PM:          258° (west-southwest)
Light hits Charminar front? ✅   YES → beautiful warm stone colours
```

This computation takes **milliseconds**, costs nothing, and is **exactly correct**.

---

#### Step 3 — Crowd Intelligence

Google Places API returns Popular Times — hour-by-hour crowd levels:
```
Charminar crowd levels (typical Tuesday):
  06:00 AM  ▁  Very low  ← ideal for photographers
  09:00 AM  ▃  Low
  12:00 PM  █  Peak — avoid
  03:00 PM  █  Peak — avoid
  05:30 PM  ▄  Moderate  ← golden hour, worth it
  08:00 PM  ▂  Low       ← night lights, peaceful
```

---

#### Step 4 — Review NLP (Evidence Mining)

Don't use the overall star rating. Mine reviews for **experience-specific mentions**.

```python
# NLP pipeline on Google Places reviews for viewpoints near Charminar:
review_signals = {
    "sunset_mentions":        42,   # "beautiful at sunset", "golden hour view"
    "photography_mentions":   31,   # "great for photos", "must photograph"
    "charminar_view_score":   67,   # how often this viewpoint mentions Charminar
    "night_mentions":         22,   # "illuminated", "night view", "glows"
    "crowd_complaints":       14,   # "too crowded", "hard to get good angle"
}
```

**A viewpoint with 4.5⭐ that mentions "great food" 80x and "Charminar view" 3x is WORSE for our user than a 4.2⭐ place that mentions sunset views 45x.**

---

#### Step 5 — Experience Scoring Formula

Every viewpoint gets a **context-specific score**, not just an overall rating:

```
ExperienceScore = (LightMatch     × 0.25)   ← sun geometry calculation
               + (ViewQuality     × 0.20)   ← how well Charminar is visible
               + (PhotoEvidence   × 0.15)   ← photo count + composition analysis
               + (ReviewEvidence  × 0.15)   ← experience-specific review mentions
               + (CrowdScore      × 0.10)   ← lower crowd = higher score
               + (Atmosphere      × 0.10)   ← bazaar life, ambiance
               + (Convenience     × 0.05)   ← walking distance from itinerary
```

> Note: These weights are **starting hypotheses**, not permanent truth. As users make choices, the model learns and weights get tuned via A/B testing.

---

#### Step 6 — What the User Sees

When they tap on Charminar in their itinerary:

```
📍 Charminar
   ⭐ 4.5 • Avg visit: 1.5 hrs • UNESCO Heritage Site

✨ Best Moments on 17 Oct:
   🌅 06:07 AM  Morning Golden Hour — soft light, almost no crowds   [calculated ✅]
   🌇 04:58 PM  Evening Golden Hour — warm tones, bazaar comes alive  ← YOUR TIME ✅
   🌙 07:30 PM  Night View — illuminated purple & green               [calculated ✅]

📸 3 best spots to experience it:

   [1] Main Approach Road      ✅ High confidence
       Front-lit at your time • Iconic frame • Bazaar life in foreground
       📍 200m south of entrance • 🚶 3 min walk

   [2] Nimrah Café Rooftop     ⚡ Medium confidence
       Slightly elevated • Less crowded • Good minaret sightline
       📍 150m west • 🚶 2 min walk

   [3] Laad Bazaar Lane        💡 Likely good
       Arches as natural frame • Bangle shops glow at night
       📍 300m northwest • 🚶 4 min walk

⚠️  Avoid 11 AM – 3 PM: harsh overhead light + maximum crowds

Your itinerary: Charminar at 5:00 PM ✅ Perfect golden hour timing!
```

If the engine scheduled it wrong (e.g., 12 PM):
```
💡 Charminar is dramatically better at golden hour (5:00 PM).
   Reschedule it and adjust the rest of Day 2?
   [Yes, optimize day]   [Keep 12 PM]
```

---

#### Night-View Options (User Selection Card)

```
🌙 Places that look amazing at night in Hyderabad:

   ✓ Charminar           → You're going at golden hour ✅
   ○ Hussain Sagar Lake   → Water reflections, romantic
   ○ Necklace Road        → Lit promenade, family-friendly walk
   ○ Golconda Fort        → Sound & Light Show at 6:30 PM 🎭
   ○ Laad Bazaar          → Bangle shops glow, magical atmosphere

   Tap to add to your trip →
```

---

#### The Experience Graph (Data Model)

Places are no longer just lat/lng + rating. Each has a rich experience graph:

```
CHARMINAR
  ├── EXPERIENCE TYPES
  │     ├── golden_hour_view     → score: 0.91, confidence: high
  │     ├── night_view           → score: 0.87, confidence: high
  │     ├── morning_photography  → score: 0.79, confidence: medium
  │     ├── architecture         → score: 0.95, confidence: high
  │     └── family_visit         → score: 0.72, confidence: medium
  │
  ├── BEST TIMES (calculated per date)
  │     ├── 17 Oct → golden evening: 04:58–05:58 PM
  │     └── 17 Oct → night:          07:30 PM onwards
  │
  ├── VIEWPOINTS (curated + evidence-based)
  │     ├── Main Approach Road  → {lat, lng, bearing, score, evidence}
  │     ├── Nimrah Café         → {lat, lng, bearing, score, evidence}
  │     └── Laad Bazaar Lane    → {lat, lng, bearing, score, evidence}
  │
  └── CONDITIONS
        ├── crowd_by_hour       → [Popular Times data]
        ├── best_weather        → clear sky → prioritize silhouette
        └── worst_conditions    → monsoon → skip outdoor viewpoints
```

---

#### The API Cost Funnel (How We Keep Costs Low)

Never fetch expensive data for every candidate. Use a coarse-to-fine approach:

```
1,000 candidate places
        ↓ basic lat/lng filter + category  [local DB, free]
  150 candidates
        ↓ distance + opening hours check   [local DB, free]
   50 candidates
        ↓ cached rating + preference match [Redis cache, free]
   20 candidates
        ↓ Google Places detail call        [~$0.017 per call = $0.34 total]
   10 candidates
        ↓ Route matrix calculation         [Google Routes API]
    5 candidates   ← expensive API calls only happen here
        ↓ Experience scoring + AI explanation
    3 final recommendations → User
```

**Total API cost per plan: ~$0.10 – $0.40** (not $5–10 if naively calling everything).

---

#### Data Sources for This Feature

| Data | Source | Cost |
|---|---|---|
| Sunrise/sunset/golden hour | `astral` Python lib | Free, offline |
| Sun azimuth/bearing math | Pure Python geometry | Free |
| Crowd levels by hour | Google Places Popular Times | ~\$0.017/call |
| Photography viewpoints | Curated DB + review NLP | One-time build |
| Night illumination data | Pre-curated per landmark | One-time build |
| Review NLP mining | spaCy / Gemini batch processing | One-time + periodic refresh |

---



## ⚙️ The Trip Optimization Engine (The Technical Heart)

> This is what makes TripWeave fundamentally different from Wanderlog. Wanderlog optimizes **routes**. TripWeave optimizes **the entire trip as one connected system.**

---

### The Central Question Our Engine Answers

> *"Given a group of people, a destination, dates, budget, preferences, transportation options, real-world constraints, and available places — what is the most feasible, geographically efficient, time-efficient, and human-comfortable multi-day itinerary?"*

---

### Step 1 — Build the Trip Graph

Every location is a **node**. Every connection between locations is an **edge** with attributes:

```
Node (Place):
  - lat, lng
  - opening_hours
  - avg_visit_duration
  - price_level
  - rating
  - type (attraction / restaurant / hotel / transport_hub)

Edge (Connection):
  - distance_km
  - travel_time_mins (traffic-aware)
  - travel_cost_INR
  - mode (walk / auto / metro / cab)
```

The optimizer finds the best **path through this graph** across all days — not just the fastest route between two points.

---

### Step 2 — Hard Constraints vs Soft Constraints

**Hard constraints — NEVER violated:**
```
✗ Train/flight departure time
✗ Timed-entry tickets (museum slot at 10 AM)
✗ Hotel check-in / check-out time
✗ Total budget ceiling
✗ Place is closed on that day
✗ Place requires advance booking (cannot walk in)
```

**Soft constraints — can flex if needed:**
```
~ Preferred restaurant choice
~ Preferred attraction (can be moved to another day)
~ Walking distance preference
~ Rating threshold
~ Arrival/departure time preference
```

**Conflict resolution rule:**
> Hard constraint ALWAYS wins. If a soft constraint conflicts with a hard one, the soft constraint is adjusted or dropped — and the user is told why.

---

### Step 3 — Scoring Formula for Every Choice

**Every hotel, restaurant, and attraction gets a trip-contextual score, not just a standalone rating.**

#### Restaurant Score (not just "best-rated nearby"):
```
RestaurantScore = (FoodQuality × 0.25)
               + (PreferenceMatch × 0.25)   ← veg/non-veg/jain match
               + (PriceMatch × 0.20)        ← within budget?
               + (Rating × 0.15)
               - (DetourPenalty × 0.15)     ← how far off the route?
```

**Detour Penalty** is the key innovation:
```
If Attraction A → Restaurant → Attraction B

DetourPenalty = extra_distance + extra_time_mins × time_value

A restaurant 500m off-route with great food scores HIGHER
than a famous restaurant 7km off-route.
```

#### Hotel Score (chosen AFTER clustering attractions):
```
HotelScore = (PriceMatch × 0.30)
           + (DistanceToAttractionCentroid × 0.35)  ← most important
           + (DistanceFromArrivalPoint × 0.20)
           + (Rating × 0.15)
```

> The cheapest hotel is NOT always chosen. The hotel that minimizes **total trip inconvenience** is chosen.

#### Overall Trip Score (multi-objective optimization):
```
TripScore = w1 × (1 - BudgetOverrun)
          + w2 × (1 - TotalTravelTime)
          + w3 × (1 - TotalDistance)
          + w4 × ComfortIndex
          + w5 × PreferenceMatchRate
          + w6 × (1 - FatigueScore)
```

Weights change per user preference:
| User Type | Budget | Time | Comfort | Preferences |
|---|---|---|---|---|
| Budget traveler | 40% | 15% | 10% | 35% |
| Comfort traveler | 15% | 20% | 35% | 30% |
| Explorer | 10% | 25% | 15% | 50% |

---

### Step 4 — Human Realism Buffers

AI itineraries fail when they treat humans like robots. Every schedule includes:

```
Getting ready in the morning:       +30 min
Hotel checkout:                     +20 min
Finding entrance / parking:         +10–15 min
Queue at popular attractions:       +15–45 min (crowd-level based)
Toilet breaks (every 90 min):       +10 min (especially for elderly/kids)
Meal time (not just travel + visit): +45–60 min per meal
Fatigue rest (after 3+ attractions): +20 min buffer
Safety buffer before transport:     +20–30 min before train/bus
```

Google Maps says Hotel → Railway Station = 35 min.  
TripWeave schedules departure at: **35 min + 20 min buffer = 55 min before.**

---

### Step 5 — Fatigue Model

Each day gets a fatigue score. The engine **balances fatigue across the trip**, not just within a day.

```
Daily Fatigue = (walking_km × 10)
              + (attractions_count × 8)
              + (transport_transfers × 5)
              + (early_start_penalty if start < 8AM)
              + (late_finish_penalty if end > 9PM)
```

| Score | Label | Action |
|---|---|---|
| 0–30 | 🟢 Easy | No change |
| 31–55 | 🟡 Moderate | No change |
| 56–75 | 🟠 Tiring | Suggest removing 1 activity |
| 76+ | 🔴 Exhausting | Auto-reduce to 3 activities max |

High-energy days are always followed by lighter days. Arrival day and departure day are always light.

---

### Step 6 — Trip Feasibility Check

Before showing the plan to the user, the engine runs a **feasibility verification pass**:

```
For each activity in every day:
  ✓ arrival_time + travel_time < place_opening_time? (not too early)
  ✓ arrival_time + visit_duration < place_closing_time? (not too late)
  ✓ fixed_ticket_time respected?
  ✓ hotel_checkin_time >= 14:00?
  ✓ transport_departure has 25-min buffer?
  ✓ daily_budget not exceeded?
  ✓ total_walking within user's tolerance?
  ✓ no geographically impossible back-and-forth?
```

Result shown to user:
```
Trip Feasibility: ✅ Looks Good
  → All 4 days checked. No scheduling conflicts found.

  — OR —

Trip Feasibility: ⚠️ Needs Adjustment
  → Day 2 is tightly scheduled. Museum visit may run into dinner time.
  → Suggested fix: Move Hussain Sagar to Day 3 (it fits better there).
  [Apply Fix Automatically]  [Show Me Why]
```

---

### Step 7 — Multi-Day Global Optimization

The engine optimizes **the entire trip together**, not each day in isolation.

```
WRONG approach (what most apps do):
  Day 1 → optimize Day 1 stops
  Day 2 → optimize Day 2 stops
  Day 3 → optimize Day 3 stops

RIGHT approach (TripWeave):
  All days → assign attraction clusters to days (considering fatigue flow)
  → optimize routes within each cluster
  → check cross-day constraints (hotel, transport, budget)
  → verify full trip feasibility
  → output final plan
```

Example: If Ramoji Film City is a full-day trip, the engine knows to put it on Day 3 (relaxed day after 2 tiring sightseeing days), not Day 1 right after a long train journey.

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────┐
│              React Native App               │
│     (iOS + Android, single codebase)        │
└────────────────┬────────────────────────────┘
                 │ REST + WebSocket
┌────────────────▼────────────────────────────┐
│             FastAPI Backend                  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Trip     │ │ Expense  │ │ Group Sync  │ │
│  │ Service  │ │ Service  │ │ Service     │ │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘ │
│       │            │              │         │
│  ┌────▼────────────▼──────────────▼──────┐ │
│  │         Optimization Engine           │ │
│  │  clustering → TSP → time windows      │ │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         │              │             │
   Google Maps     Gemini API     PostgreSQL
   Places API      (NLU + NLG)   + PostGIS
   Routes API
         │
   RedBus API  /  IRCTC wrapper  /  Amadeus Hotels
```

**Real-time sync for groups:** WebSocket connection. When any member adds an expense or votes on a place, all devices update in under 2 seconds.

---

## 🗂️ Database Schema (Key Tables)

```
users           → id, name, phone, upi_id
trips           → id, title, host_user_id, from_city, to_city, dates, budget, status
trip_members    → trip_id, user_id, role (host/member/guest), join_code
preferences     → trip_id, transport_pref, food_pref, pace, interests[]
itinerary_days  → id, trip_id, day_number, date
itinerary_items → id, day_id, type (attraction/restaurant/transport/hotel), time, place_id, lat, lng, duration_mins, estimated_cost, status (pending/done/skipped)
expenses        → id, trip_id, added_by_user_id, amount, category, description, receipt_url, timestamp
expense_splits  → expense_id, user_id, amount_owed, is_settled, settled_at
places_cache    → place_id, name, type, lat, lng, opening_hours, price_level, rating, cached_at
```

---

## 📺 Screen Flow (UX Map)

```
App Open
   ↓
🏠 Home
   → [Plan New Trip]   [My Trips]
         ↓
📝 Step 1 — Basics
   From / To / Dates / People / Budget
         ↓
⚡ Step 2 — Preferences (30 seconds)
   Tap chips: Transport / Food / Interests / Pace
         ↓
⏳ Generating your trip... (AI + algorithms, ~8 seconds)
         ↓
📋 Step 3 — Plan Review
   Plan A / B / C tabs
   Day-by-day itinerary list + map
   [Customize] [Share with Group] [Start Trip]
         ↓  (tap "Start Trip")
🔴 Live Trip Mode
   Today's stops → check off as you go
   [Add expense] button after each stop
   Budget bar always at bottom
         ↓
💰 Expense Tab (accessible anytime)
   Total / breakdown / who owes whom / settle via UPI
         ↓
🎉 End of Trip
   Summary card (shareable to WhatsApp)
   Settle all balances screen
```

---

## 🚀 Development Phases

### Phase 1 — MVP (3–4 months)
- Single route: Any Indian origin → Any major Indian city
- AI itinerary generation (Google Places + Gemini + OR-Tools clustering)
- Geo-clustered day-by-day plan, hotel recommendation
- Personal expense tracker (manual entry + receipt scan)
- Basic group sharing (view-only for members)
- Budget breakdown screen

### Phase 2 — Groups + Live Mode (2–3 months)
- Full group collaboration (voting, comments, real-time sync)
- Group expense splitting + UPI settle integration
- Live Trip Mode with check-off and re-planning
- "I'm tired" button + conversational re-planning
- Weather awareness + festival/holiday alerts

### Phase 3 — Smart Data + Transport (3–4 months)
- IRCTC / RedBus integration for real-time availability
- Bus stand / train station intelligence (which stop to deboard)
- Auto/cab price estimates per leg
- Traffic-aware re-routing
- Offline mode for core itinerary

### Phase 4 — Booking + Monetization (4–6 months)
- Hotel booking (Booking.com / MakeMyTrip affiliate)
- Restaurant reservation links (Zomato / Swiggy affiliate)
- Activity ticket booking
- Premium plan: advanced customization, unlimited group members, trip history

---

## 💡 How TripWeave Beats Wanderlog

| | Wanderlog | TripWeave |
|---|---|---|
| **Planning model** | Manual — you do the work | AI + algorithms do it for you |
| **New user experience** | Overwhelming — 10+ options on screen | 3 screens to a full generated plan |
| **India-specific** | ❌ No INR, no local context | ✅ Built for India from day one |
| **Geo-clustering** | ❌ None | ✅ Core algorithm — no zigzag days |
| **Bus/train stop intelligence** | ❌ | ✅ Which stop to deboard, auto fare |
| **Hotel selection logic** | You pick manually | Chosen *after* clustering attractions |
| **Detour penalty for restaurants** | ❌ Shows "best rated nearby" | ✅ Scores by route fit, not just rating |
| **Hard vs soft constraints** | User-reported limitations | ✅ Engine never violates hard constraints |
| **Trip feasibility check** | ❌ No verification | ✅ Checks every day before showing plan |
| **Human realism buffers** | ❌ Uses raw Google Maps times | ✅ Adds queues, toilet breaks, buffers |
| **Fatigue model** | ❌ | ✅ Balances fatigue across all days |
| **Multi-day global optimization** | ❌ Day by day | ✅ Optimizes entire trip together |
| **Group expense splitting** | ❌ | ✅ With UPI settle, real-time sync |
| **Context-aware expense prompts** | ❌ | ✅ Appears after each activity |
| **"I'm tired" re-planning** | ❌ | ✅ One tap |
| **Why this choice? Explanation** | ❌ | ✅ Every major decision explained |
| **Festival/holiday awareness** | ❌ | ✅ |
| **Route optimization** | Paid feature | ✅ Always free, always on |

---

## 💰 Monetization (Future)

- **Free forever:** Full trip planning, group trips up to 6 members, expense tracker
- **TripWeave Pro (₹299/year):** Unlimited group size, offline maps, priority AI re-planning, trip history archive, PDF export
- **Affiliate commissions:** Hotel bookings, train tickets, activity tickets (Phase 4)

---

*Last updated: September 2024 — Living document, updated as development progresses.*

---

## 🔴 CORRECTIONS & REALITY CHECK (v2.0 — September 2024)

> Verified against actual API documentation, Indian regulations, and engineering timelines. Every item below is confirmed.

---

### C1: Google Popular Times — No Official API

**Was assumed:** Google Places API provides hourly crowd data per place.  
**Reality:** No such API field exists. It's displayed on Maps visually but intentionally not exposed via API (privacy reasons). Unofficial scrapers violate Google ToS at commercial scale.

**Fix:**
| Phase | Approach |
|---|---|
| Phase 1 | Place-type crowd rules: "forts quiet at 7 AM", "museums empty weekday morning" — free, local |
| Phase 2 | BestTime.app API — legitimate, purpose-built, ~\$100–200/month |
| Phase 3 | Google Maps Platform enterprise tier (custom pricing) |

---

### C2: IRCTC — No Public Developer API

**Was assumed:** IRCTC API via RapidAPI wrapper for Phase 3.  
**Reality:** No official public IRCTC API. Wrappers on RapidAPI are unauthorized scrapers ("educational only") — illegal at commercial scale. Official path is B2B partnership with IRCTC as licensed agent.

**Fix:**
| Phase | Approach |
|---|---|
| Phase 1 | Static curated train data for top 10 routes (Bengaluru–Hyderabad, Mumbai–Pune, etc.) |
| Phase 2 | Authorized B2B aggregators: **AOPAY** or **NTS Digital Hub** (have developer sandboxes now) |
| Phase 3 | Direct IRCTC B2B partnership for live booking |

---

### C3: RedBus — No Self-Serve API

**Was assumed:** RedBus API in Phase 3.  
**Reality:** RedBus SeatSeller API requires direct enterprise partnership. For startups, use a **Bus API Aggregator** (eTravelSmart, Bitla Software, AOPAY, ZuelPay) — single API covering RedBus + APSRTC + KSRTC + all operators, with developer sandboxes available now.

**Fix:** Replace "RedBus API" everywhere with "Bus Booking Aggregator (eTravelSmart / AOPAY)."

---

### C4: Guest + UPI Payment — Legal Contradiction (Critical)

**Was assumed:** "Friends join with no signup — just enter their name. Settle via UPI."  
**Reality:** Impossible under RBI/NPCI rules. UPI requires verified mobile number linked to a bank account + 2FA (mandatory since April 2026). An anonymous "typed name" cannot send/receive real money.

**Fix — Two-tier model:**
```
VIEWER (zero friction, no signup)
  ✅ See itinerary, map, day plan
  ✅ Vote on places, add comments  
  ❌ Cannot participate in expense money settlement

MEMBER (30-second phone OTP)
  ✅ Full group access
  ✅ Expense splitting + UPI settlement
  ✅ Payment identity verified — RBI compliant
```
Join flow: arrive as viewer instantly → tap "Join expense splitting" → phone OTP → member.

---

### C5: Google Review Mining at Scale — ToS Violation

**Was assumed:** NLP mining of "all Google reviews" for experience signals.  
**Reality:** Places API returns max 5 reviews per place. Mining full review corpus = scraping = ToS violation at scale.

**Fix — Layered review strategy:**
| Source | What you get | Status |
|---|---|---|
| Google Places API | 5 reviews + AI summary | ✅ Official |
| TripAdvisor Content API | Full review access for attractions | ✅ Official (apply) |
| Gemini batch analysis | Summarize available reviews into signals | ✅ Official |
| Your users' tips | "Best time" user contributions in-app | ✅ Yours |
| Manual seed data | Curate 50–100 top landmarks at launch | ✅ Yours |

**Phase 1: manually curate best-moment data for top landmarks in launch cities.** Higher quality than NLP mining, zero ToS risk.

---

### C6: Scoring Formula Weights Are Unvalidated

**Fix:** All weights moved to `weights.yaml` config file — not hardcoded. Every formula in this spec carries the note: *"Initial hypothesis — requires A/B calibration after 1,000+ real trips."* Analytics instrumented from Day 1 to track user acceptance/rejection of recommendations.

---

### C7: Fatigue Formula — Units Inconsistent, Not Profile-Aware

**Fix — Parameterize by user profile:**
```python
FATIGUE_COEFFICIENTS = {
    "young_solo":  {"per_km": 5,  "per_attraction": 4,  "per_transfer": 3},
    "family":      {"per_km": 10, "per_attraction": 7,  "per_transfer": 6},
    "elderly":     {"per_km": 20, "per_attraction": 12, "per_transfer": 10},
}
# Still hypotheses — calibrate with real user data after launch
```

---

### C8: Offline Mode vs. Live Re-planning — Defined Degradation

**Fix:**
```
ONLINE:   Full AI re-planning ✅ | "I'm tired" button ✅ | Group sync ✅
OFFLINE:  View itinerary ✅ | Add expenses ✅ | Cached maps ✅
          AI re-planning ❌ (greyed out) | Group sync ❌ (queued)
```
Offline itinerary view promoted to **Phase 1** (not Phase 3). Heritage sites have no connectivity.

---

### C9: Recomputation Costs Not Budgeted

**Fix:** The $0.10–0.40 estimate is initial generation only.  
Full session cost model: ~$0.50–1.00 per trip planning session (includes edits).  
Edit strategy: minor reorders use cached distance matrix (free); full re-plans trigger new API cycle and are shown clearly to the user.

---

### C10: Sun Geometry / Viewpoint Scoring — Cut from Phase 1

**Fix:**
- Phase 1: Golden hour **timing** only (`astral` — 10 lines of free Python, real value)
- Phase 2: Manually curated viewpoints for top 20 landmarks in launch cities
- Phase 3: Automate via review NLP + user contributions

---

### C11: Missing Features Added

**Safety / Emergency Layer (Phase 2):**
```
🆘 One-tap emergency screen:
   → Local emergency numbers (100, 108, 112)
   → Nearest hospital to current GPS location
   → Nearest pharmacy
   → Share live location with family contact back home
   → SOS message in local language (Telugu for Hyderabad, etc.)
```

**ID / Document Wallet (Phase 2):** Encrypted Aadhaar/passport storage. Hotel check-in in India requires ID — having it in-app removes the "I forgot a photocopy" problem.

**Cancellation / Change Flows (Phase 3):** Train delayed → AI re-plans the day. Group member drops out → re-splits all expenses. Hotel moved → recalculates proximity scores.

**Data Licensing Budget (recurring cost — add to financial model):**
```
BestTime.app API:        ~$100–200/month
Bus API Aggregator:      ~$50–150/month + per-booking fee
IRCTC B2B:               one-time setup + per-ticket commission
TripAdvisor Content API: revenue-share
Estimated total Phase 2: $200–500/month in data costs
```

---

### REVISED REALISTIC TIMELINE

| Phase | Honest Duration | Core Deliverables |
|---|---|---|
| **Phase 1** | **5–6 months** | Clustering + TSP optimizer, hotel scoring, 3-plan variants, expense tracker, group view, offline itinerary, golden hour timing. Static curated data for 3 cities. |
| **Phase 2** | **4–5 months** | Group expense split + OTP identity, UPI settlement, live trip mode, BestTime crowd data, weather, safety layer, conversational re-planning, ID wallet |
| **Phase 3** | **4–6 months** | Bus aggregator API, IRCTC B2B, viewpoint database, traffic re-routing, cancellation flows |
| **Phase 4** | **6+ months** | Real bookings, payments, marketplace, revenue |

---

### Claude's Critique — Final Verdict

| Point | Our verdict |
|---|---|
| Popular Times no official API | ✅ Confirmed, fixed |
| IRCTC no public API | ✅ Confirmed, fixed |
| RedBus no self-serve API | ✅ Confirmed, use aggregator |
| Guest + UPI = legal contradiction | ✅ Critical, fixed with two-tier model |
| Review mining ToS violation | ✅ Confirmed, fixed with layered approach |
| Timeline is fantasy | ✅ Revised to 5–6 months |
| Sun geometry is niche for MVP | ✅ Agreed, cut to Phase 2 |
| Scoring weights are guesses | ✅ Moved to config, flagged clearly |
| Fatigue formula inconsistent | ✅ Parameterized by profile |
| Offline should be Phase 1 | ✅ Moved up |
| Safety layer missing | ✅ Added to Phase 2 |
| Recomputation costs unbudgeted | ✅ Session cost model added |
| Cut Best Experience from MVP entirely | ⚠️ **Partial disagreement** — golden hour *timing* stays (10 lines of free code, real value). Viewpoint scoring machinery cut to Phase 2. |

---

*Spec version 2.0 — Corrections verified September 2024.*

---

## 🔴 CORRECTIONS v3.0 — Architectural Depth (ChatGPT Analysis)

> These go deeper than Claude's review. Less about "this API doesn't exist" and more about "this architecture is wrong at the foundation."

---

### C12: Google Places Caching Policy — Critical Architecture Issue

**Nobody caught this before ChatGPT.**

**Was assumed:** Fetch data from Google Places → store in `places_cache` PostgreSQL table indefinitely.

**Reality (verified):** Google Places ToS explicitly prohibits pre-fetching and indefinite storage of place content. You may only cache for **up to 30 days** for performance purposes. The one exception: `place_id` can be stored indefinitely.

**Fix — Two-layer data model:**

```
YOUR OWN DATABASE (can store forever, own fully):
  tripweave_place
    ├── place_id (google_place_id — storable forever ✅)
    ├── category, best_moment, viewpoints (your curated data ✅)
    ├── experience_scores (your computed scores ✅)
    ├── user_feedback (your users' data ✅)
    └── seasonal_metadata (your own ✅)

GOOGLE DATA (fetch fresh each time or cache max 30 days):
  → name, address, rating, photos, reviews, hours
  → pulled at plan generation time, not pre-fetched
  → 30-day TTL cache for performance only
```

This is actually a stronger architecture — your database becomes your **own proprietary experience intelligence layer** on top of Google's transactional data. You own your data. Google owns theirs.

---

### C13: "TSP" Is the Wrong Name — And the Wrong Mental Model

**Was assumed:** The core engine is described as "TSP (Travelling Salesman Problem)."

**Reality:** The actual problem is far more complex than TSP. TripWeave must handle:
- Multiple days (not a single tour)
- Opening hours and timed tickets
- Budget across food + hotel + transport
- Multiple travel modes
- Fatigue accumulated across days
- Fixed events (Sound & Light Show at 18:30)
- User preferences and activities with different value
- Not all places must be visited (you're choosing what to include)

**The correct problem class:**
```
Constraint-Based Multi-Day Itinerary Optimization
  ├── Orienteering Problem (select best subset of places to visit)
  ├── TSP with Time Windows (order within a day)
  ├── Resource-Constrained Scheduling (time + budget + fatigue)
  └── Multi-objective Optimization (cost vs time vs fatigue vs preference)
```

**Fix:** Rename "TSP" to "Multi-Day Itinerary Optimizer" everywhere. OR-Tools still handles it — but the framing matters for how engineers build and extend it.

---

### C14: Activity Priority — Third Category Missing

**Was assumed:** Hard constraints vs. soft constraints.

**Reality:** Need a third classification for activities:

```python
ActivityStatus = {
    "MANDATORY":  "Train departure, timed tickets, hotel check-in — never dropped",
    "PREFERRED":  "User specifically asked for this — drop only if infeasible",
    "OPTIONAL":   "Engine added based on interest — first to be sacrificed if needed"
}

# Example for a day in Hyderabad:
Train departure 18:30       → MANDATORY  (hard constraint, locked)
Charminar at golden hour    → PREFERRED  (user asked for it)
Salar Jung Museum           → OPTIONAL   (engine added based on history interest)
Random café visit           → OPTIONAL   (filler, first to go)
```

When the day becomes too packed, the optimizer drops OPTIONAL first, then tries to compress PREFERRED, never touches MANDATORY.

---

### C15: Activity Dependencies — Missing Concept

**Completely absent from the spec.** Some activities cannot be freely reordered.

```python
# Dependencies that must be modelled:
hotel_checkin → drop_luggage → any_attraction
train_arrival → travel_to_hotel → hotel_checkin → anything_else
advance_ticket_venue → must arrive before show time
```

```python
# Data model addition:
{
    "activity_id": "salar_jung_museum",
    "depends_on": ["hotel_checkin"],   # can't go here before checking in
    "blocks_until": None
}
```

Without this, the optimizer can produce plans like "visit museum at 9 AM, check in to hotel at 11 AM" — which is impossible if you have luggage.

---

### C16: Locked Activities — Missing Feature

**Not in the spec.** A user might already have a fixed commitment:
- "My train arrives at 11:20 AM"
- "I already booked Golconda Fort Sound & Light Show at 6:30 PM"
- "Our group decided we're doing Charminar at sunset, non-negotiable"

The optimizer must **work around locked activities**, not treat them as suggestions.

```python
{
    "activity_id": "golconda_show",
    "time": "18:30",
    "locked": True,   # optimizer cannot move this
    "icon": "🔒"      # shown with lock icon in UI
}
```

In the UI: locked activities show a 🔒 icon and cannot be dragged or rescheduled.

---

### C17: Uncertainty Distributions — Replace Arbitrary Buffers

**Was assumed:** Fixed durations + arbitrary Human Realism Buffers ("+15 min for queues").

**Reality:** Travel times and visit durations are distributions, not fixed numbers.

```python
# Instead of: travel_time = 25 minutes
travel_time = {
    "expected": 25,    # median
    "p75":      32,    # 75th percentile (mild traffic)
    "p90":      41,    # 90th percentile (heavy traffic)
    "mode":     "auto/metro/walk"
}

# Instead of: museum_duration = 90 minutes
museum_visit = {
    "expected": 90,
    "minimum":  60,    # rushing through
    "maximum":  140,   # thorough visit
    "user_pace_modifier": 1.0  # 1.2x for slow pace, 0.8x for fast
}
```

The optimizer uses the **p75 estimate** when scheduling (not median, not p90) — creates a plan that's realistic without being pessimistic. If user runs late: p90 is the "danger zone" where the day breaks. This is more principled than "+15 minutes for queues."

---

### C18: Hotel Optimization Beyond Centroid

**Was assumed:** Hotel selected closest to geometric centroid of attraction clusters.

**Reality:** Geometric centroid can land in a location with no hotels, bad road access, poor metro coverage, or expensive last-mile transport — making it worse than a hotel further away.

**Fix — Optimize for minimum total trip inconvenience:**

```
HotelScore = (PriceMatch           × 0.25)
           + (TotalDailyTravelCost × 0.25)   ← weighted sum of all attraction distances
           + (ArrivalPointDistance × 0.15)   ← distance from station/bus stop on arrival
           + (DeparturePointProximity × 0.15) ← ease of leaving for return journey
           + (TransportAccess      × 0.10)   ← metro/auto/cab availability near hotel
           + (Rating               × 0.10)

# TotalDailyTravelCost = Σ(distance to each day's attractions × expected transport cost)
# NOT just distance to centroid
```

---

### C19: Budget Flexibility — Too Rigid

**Was assumed:** Total budget = hard ceiling = never exceeded.

**Reality:** Travellers think in three budget modes:

```python
budget = {
    "target":       40000,   # "I want to spend around ₹40k"
    "maximum":      45000,   # "₹45k is okay if experience is significantly better"
    "flexibility":  0.4      # 0 = rigid, 1 = fully flexible
}
```

With a hard ceiling only, the optimizer might reject a plan that's ₹500 over budget but dramatically better. With flexibility, it can say: *"This option is ₹2,100 over your target — here's why it's worth it."*

---

### C20: Trip State Architecture — Live Trip Is More Than a View

**Was assumed:** Static itinerary + "Live Trip Mode" as a separate feature.

**Reality:** A trip is an evolving state that the engine must track and optimize from continuously.

```python
TripState = {
    "status":           "in_progress",   # planned | started | paused | completed
    "current_location": {"lat": 17.36, "lng": 78.47},
    "current_time":     "15:23",
    "completed":        ["golconda_fort", "lunch_paradise"],
    "skipped":          ["salar_jung"],   # user chose to skip
    "delayed_by_min":   35,               # running behind schedule
    "fatigue_level":    "high",           # low | medium | high | critical
    "weather_state":    "rain_started",
    "budget_spent":     18400,
    "budget_remaining": 21600
}
```

When the user hits "I'm tired" or a train is delayed: the engine re-optimizes **from the current TripState** — not from scratch. Much faster, much more accurate.

---

### C21: "Why Not?" Explanation Engine

**Not in the spec.** Just as important as "Why this hotel?" is "Why didn't you include X?"

```
User: "Why isn't Ramoji Film City on Day 2?"

App: "Ramoji Film City needs 6–7 hours (it's a full-day park).
     Adding it to Day 2 would require:
     → Removing Salar Jung Museum and Chowmahalla Palace
     → Moving dinner 2 hours later (9:30 PM)
     → Missing the return train window by 45 minutes

     Want to dedicate all of Day 3 to Ramoji Film City instead?
     [Yes, rebuild Day 3]   [No, keep current plan]"
```

This makes the engine **understandable and trustworthy**, not a black box.

---

### C22: Plan Quality Metrics — How You Know If It's Actually Working

**Missing from the spec.** Internal TripScore (our formula) is not the same as user satisfaction.

**Add from Day 1 as telemetry:**

```python
# Per-plan analytics (stored, never shown to user):
plan_quality_metrics = {
    "plan_id":              "plan_xyz",
    "plan_acceptance":      True,       # did user accept or regenerate?
    "edits_made":           3,          # how many changes before trip?
    "activities_skipped":   1,          # skipped during actual trip
    "budget_deviation_pct": 4.2,        # actual spend vs planned
    "travel_time_deviation":12,         # actual travel vs planned (minutes)
    "replan_triggered":     True,       # did user hit "I'm tired" / replanning?
    "user_rating":          4,          # end-of-trip optional rating
    "places_api_calls":     23,
    "routes_api_calls":     8,
    "llm_tokens_used":      4200,
    "total_api_cost_usd":   0.38,
    "generation_time_ms":   6800,
}
```

After 1,000 trips: these metrics replace the guessed formula weights with **actual calibrated numbers**. This is where the ML eventually comes from.

---

### C23: Sun Geometry Needs Vector Math, Not Verbal Reasoning

**The spec currently says:**
> "Sun at 258°, viewer facing Charminar at 45° → sun is behind viewer → front-lit"

**ChatGPT correctly flagged:** This verbal reasoning is wrong without vector calculation. Sun "behind the viewer" depends on the exact geometry, not a simple azimuth comparison.

**Fix:** The sun geometry feature must be implemented with actual vectors:
```python
import numpy as np

def light_angle_on_facade(viewer_pos, monument_pos, sun_azimuth_deg, sun_elevation_deg):
    # Vector from viewer to monument
    view_vec = np.array([monument_pos[0]-viewer_pos[0], monument_pos[1]-viewer_pos[1]])
    view_vec = view_vec / np.linalg.norm(view_vec)

    # Sun direction vector (horizontal component)
    sun_az_rad = np.radians(sun_azimuth_deg)
    sun_vec = np.array([np.sin(sun_az_rad), np.cos(sun_az_rad)])

    # Dot product → cos(angle between sun and view direction)
    cos_angle = np.dot(view_vec, sun_vec)
    # cos_angle > 0 → sun roughly behind viewer → monument is front-lit
    # cos_angle < 0 → sun behind monument → silhouette
    return cos_angle, "front_lit" if cos_angle > 0 else "silhouette"
```

**Also fix:** Remove "zero error" claim. Replace with "deterministic astronomical calculation" — application-level errors can still come from coordinate imprecision, timezone handling, and atmospheric conditions.

---

### C24: Google Routes ≠ The Trip Optimizer

**Was implied:** Google Routes API handles the optimization, TripWeave adds intelligence on top.

**Reality (ChatGPT's correct correction):**

```
WRONG mental model:
  Google Routes → (does optimization) → TripWeave adds intelligence

CORRECT mental model:
  TripWeave Optimizer (OR-Tools + our engine)
    ├── Uses Google Routes API for accurate travel times/costs
    └── Uses Google Routes waypoint hint for intra-day ordering
    → Google Routes is a data source, not the optimizer
```

Google's waypoint optimization only minimizes travel time between waypoints. It knows nothing about: budget, fatigue, opening hours, experience scores, hotel proximity, or multi-day balancing. Our engine does all of that.

---

### REVISED MVP SEQUENCING (v0.1 → v0.2 → v0.3)

ChatGPT's most actionable suggestion — split Phase 1 into three sub-versions:

```
MVP v0.1 — Prove the engine works (Month 1–3):
  Input:  origin, destination, dates, people, budget, interests
  Engine: candidate generation → geo-clustering → hotel scoring →
          route matrix → time-window scheduler → feasibility check
  Output: 3 itinerary plans with day-by-day view + map + "why this hotel?"
  Data:   Static curated data for 3 launch cities only
  No:     Group features, expense tracking, live trip mode, OCR

MVP v0.2 — Make it editable and explainable (Month 4–5):
  + Locked activities (🔒 user can pin their own commitments)
  + "Move this to sunset" / "Replace this" / "Why not X?"
  + "Why?" button for every major decision
  + Consequences shown before any change ("Moving this adds 47 min to Day 2")
  + Golden hour timing (just astral, no viewpoint scoring)

MVP v0.3 — Live trip intelligence (Month 5–6):
  + Trip State tracking (current position, completed, delayed)
  + "I'm tired" → re-optimizes remaining day from current state
  + Expense tracker (manual entry only, no OCR)
  + Offline itinerary view
  + Weather-aware replanning
```

> **Receipt OCR**, group UPI settlement, conversational AI replanning, viewpoint scoring, bus/train live APIs → all Phase 2+.

---

### ChatGPT's Critique — Final Verdict

| ChatGPT's Point | Our verdict |
|---|---|
| Google Places caching policy (30-day limit, no pre-fetch) | ✅ **Critical — verified, new issue nobody else caught** |
| "TSP" is the wrong framing | ✅ Renamed to Multi-Day Itinerary Optimizer |
| Activity priority: mandatory/preferred/optional | ✅ Added |
| Activity dependencies | ✅ Added |
| Locked activities | ✅ Added |
| Uncertainty distributions > arbitrary buffers | ✅ Added |
| Hotel optimization beyond centroid | ✅ Fixed |
| Budget: target + maximum + flexibility | ✅ Added |
| Trip State architecture | ✅ Added |
| "Why not?" explanations | ✅ Added |
| Plan quality metrics as telemetry | ✅ Added |
| Sun geometry needs vector math | ✅ Fixed |
| Remove "zero error" claim | ✅ Fixed |
| Google Routes ≠ the optimizer | ✅ Clarified |
| Progressive v0.1/v0.2/v0.3 MVP | ✅ Adopted |
| Don't add ID/document storage early | ✅ Agreed |
| Keep Experience Intelligence in architecture (not MVP) | ✅ Agreed |
| Pareto-efficient plan variants | 🟡 Interesting — Phase 3 |
| Group preference aggregation per-day | 🟡 Phase 2 |
| Don't remove receipt OCR entirely | ⚠️ Partial: it moves to Phase 2, not MVP |

---

*Spec version 3.0 — Full architecture corrections complete.*

---

## 🔧 ENGINEERING FIXES v4.0 — The Three Abstraction Patterns

> These are the concrete architectural solutions to the four issues. Less about what's wrong, more about exactly how to build it correctly.

---

### FIX 1: Crowd Intelligence Layer (not "Google Popular Times")

**Never name a feature after a data source.** Name it after what it does.

```
                    CROWD INTELLIGENCE LAYER
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
   Place-Type          BestTime.app        TripWeave
   Heuristics          API (Phase 2)      User Signals
   (Phase 1, free)                        (Phase 3+)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ↓
              Crowd Score (0–100) + Confidence Level
```

**Phase 1 — Heuristics (free, instant, no external API):**
```python
# rules/crowd_heuristics.py
CROWD_RULES = {
    "museum":        {"weekend_afternoon": 85, "weekday_morning": 20, "default": 50},
    "temple":        {"festival_day": 95, "morning_aarti": 70, "default": 45},
    "fort":          {"weekend_noon": 80, "weekday_dawn": 10, "default": 40},
    "restaurant":    {"lunch_peak": 90, "dinner_peak": 85, "off_hours": 20},
    "market_bazaar": {"evening_5_9pm": 80, "morning": 30, "default": 55},
    "waterfall":     {"monsoon_weekend": 95, "weekday": 40, "default": 60},
}

def estimate_crowd(place_type, day_of_week, time_of_day, is_holiday):
    # Returns: {"score": 45, "confidence": "medium", "reason": "Weekday morning, museum type"}
```

**Phase 2 — BestTime.app API:**
```python
# providers/crowd_provider.py — the interface never changes
class CrowdProvider:
    def get_forecast(self, place_id, day, hour) -> CrowdForecast: ...

class HeuristicCrowdProvider(CrowdProvider):    # Phase 1
    ...
class BestTimeCrowdProvider(CrowdProvider):     # Phase 2
    ...
class TripWeaveMLCrowdProvider(CrowdProvider):  # Phase 3
    ...
```

The optimizer calls `crowd_provider.get_forecast(...)` and never knows or cares which backend is running.

---

### FIX 2: Transport Provider Adapter (not "IRCTC API" or "RedBus API")

**The optimizer asks for trains. It never calls IRCTC directly.**

```python
# The engine always calls this interface:
transport_engine.search_trains(
    origin="Bengaluru",
    destination="Hyderabad",
    date="2025-10-17",
    passengers=4
)

# What's behind the interface changes over time:
```

```
                   TRANSPORT ENGINE
                        │
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
   TrainProvider    BusProvider    FlightProvider
   Adapter          Adapter        Adapter
        │               │               │
   ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
   │Phase 1  │     │Phase 1  │     │Phase 2  │
   │Curated  │     │Curated  │     │Amadeus  │
   │static   │     │static   │     │         │
   │data     │     │data     │     │         │
   └────┬────┘     └────┬────┘     └─────────┘
        │Phase 2         │Phase 2
   ┌────┴────┐     ┌────┴────┐
   │AOPAY /  │     │eTravelS-│
   │NTS Hub  │     │mart/    │
   │(B2B)    │     │AOPAY    │
   └─────────┘     └─────────┘
```

**Phase 1 — Curated static transport data** (no external API needed):
```python
# data/transport/bengaluru_hyderabad.json
{
  "route": "Bengaluru → Hyderabad",
  "trains": [
    {
      "name": "Rajdhani Express",
      "departure": "06:00", "arrival": "12:30",
      "station_arrival": "Secunderabad",
      "last_mile_to_city_center": "~30 min auto/metro",
      "typical_fare_2AC": 1100, "typical_fare_SL": 400
    }
  ],
  "buses": [
    {
      "operator_type": "KSRTC/TSRTC Volvo",
      "departure_window": "20:00–23:00",
      "duration": "~7–8 hours",
      "arrival_stand": "Majestic / Uppal",
      "typical_fare": 650
    }
  ],
  "note": "Availability and exact fares need verification. Book at redbus.in or irctc.co.in"
}
```

This is honest, useful, zero-API-cost, and legally safe. When Phase 2 connects live APIs, the same data structure gets populated with real-time data — the optimizer sees no difference.

---

### FIX 3: Expense Ledger ≠ Payment System

**TripWeave calculates who owes whom. It does not move money.**

> ⚠️ **Correction to v2.0:** "Guest + UPI = illegal" was too strong. The actual rule is simpler: **TripWeave should never process payments, hold money, or ask for UPI PINs.** Showing a "Pay ₹650 via UPI" button that opens the user's own UPI app (Google Pay, PhonePe) is completely legal and requires no payment license.

```
            GROUP EXPENSE ENGINE
                    │
        ┌───────────┴───────────┐
        ↓                       ↓
  EXPENSE LEDGER          SETTLEMENT CALC
  "What was spent"        "Who owes whom"
        │                       │
  ┌─────┴─────┐          ┌──────┴──────┐
  │ Person A  │          │ Minimise    │
  │ paid ₹4k  │    →     │ number of   │
  │ Person B  │          │ transactions│
  │ paid ₹1k  │          │ (algorithm) │
  └───────────┘          └──────┬──────┘
                                │
                         Show in app:
                         "Ravi owes Suresh ₹650"
                                │
                    ┌───────────┴──────────┐
                    ↓                      ↓
             [Pay ₹650 via UPI]    [Mark as settled]
                    │
            Opens user's own
            UPI app (GPay/PhonePe)
            TripWeave never touches money
```

**The two-tier model (corrected):**
```
VIEWER (zero friction, instant)
  ✅ See itinerary, map, day plan
  ✅ See expense totals and who owes whom
  ✅ Vote on places
  — No money features, no identity needed

PARTICIPANT (name + phone OTP — 30 seconds)
  ✅ Add expenses ("I paid ₹1,200 for lunch")
  ✅ Confirm your share
  ✅ See your personal settle-up screen
  ✅ Tap "Pay via UPI" → opens your UPI app
  — Phone number for notification + identity, not for payments
```

**Phase 1 MVP — expense tracking only (no settlement buttons yet):**
```
Add expense: [Who paid] [₹ amount] [Category] [Split equally?]
             → shows running totals, no payment integration
```

**Phase 2 — settlement calculation + UPI deep link:**
```python
# Generate UPI deep link — completely legal, no payment license needed
def generate_upi_link(amount, payee_upi_id, note):
    return f"upi://pay?pa={payee_upi_id}&am={amount}&tn={note}&cu=INR"
# Opens GPay/PhonePe/BHIM directly in the user's phone
# TripWeave never sees the transaction, never holds money
```

---

### Month-by-Month Phase 1 Plan (2–3 person team)

```
Month 1 — Data Foundation
  ├── Database schema (PostgreSQL + PostGIS)
  ├── TripWeave Place model (own data, not Google's cache)
  ├── Curate seed data: Hyderabad, Bengaluru, Mumbai (top 80 places each)
  ├── Transport static data for top 10 routes
  ├── Google Places API integration (fetch-on-demand, 30-day TTL cache)
  └── Place-type crowd heuristics

Month 2 — Candidate Generation + Clustering
  ├── Google Places candidate fetching pipeline
  ├── DBSCAN geo-clustering (scikit-learn)
  ├── Hotel scoring (beyond centroid — full TotalDailyTravelCost model)
  ├── Restaurant scoring with detour penalty
  └── Activity priority: MANDATORY / PREFERRED / OPTIONAL tagging

Month 3 — Optimizer Core
  ├── OR-Tools: time-window scheduling per day
  ├── Activity dependencies (hotel_checkin → attractions)
  ├── Locked activities (🔒 user commitments)
  ├── Budget optimizer (target + maximum + flexibility)
  ├── Fatigue model (parameterized by group profile)
  └── Uncertainty distributions (p75 scheduling)

Month 4 — Feasibility + Explanation + 3 Plans
  ├── Feasibility verifier (opening hours, timed tickets, budget check)
  ├── "Why this hotel?" explanation engine (Gemini)
  ├── "Why not X?" engine (constraint-aware rejection explanations)
  ├── 3-plan generation (Budget / Balanced / Comfort variants)
  └── astral golden hour timing insertion

Month 5 — UI + Transport Provider + Polish
  ├── React Native app (3-screen onboarding → plan view)
  ├── Day-by-day itinerary UI with map
  ├── Transport Provider Adapter (static data for Phase 1)
  ├── Plan streaming UI (progressive reveal while computing)
  └── "Why?" button on every major card

Month 6 — Real-World Validation
  ├── 10–20 real test trips with real families/friends
  ├── Plan quality telemetry instrumented
  ├── Performance optimization (target: <8s cold, <3s cached)
  ├── Edge cases: 1-day trips, very tight budgets, elderly groups
  └── Fix everything that breaks in real use
```

---

### The Final Correct Architecture

```
USER INPUT
  origin / destination / dates / people / budget / interests / pace
             │
             ▼
     ┌──────────────┐
     │ Intent Engine │  ← Gemini: understand natural language, build constraints
     └──────┬───────┘
             ▼
     ┌──────────────┐
     │  Constraint  │  ← Hard / Soft / Mandatory / Preferred / Optional / Locked
     │   Builder    │
     └──────┬───────┘
             ▼
     ┌──────────────────────────────┐
     │     DATA PROVIDER LAYER      │  ← All external APIs behind adapters
     │  Places | Hotels | Transport  │
     │  Weather | Crowd | Events     │
     └──────────────┬───────────────┘
             ▼
     ┌──────────────┐
     │  Candidate   │  ← Coarse-to-fine funnel: 1000→150→50→20→5
     │  Generation  │
     └──────┬───────┘
             ▼
     ┌──────────────┐
     │ Intelligence │  ← Crowd heuristics, golden hour, weather, review signals
     │    Layer     │
     └──────┬───────┘
             ▼
     ┌──────────────────────────────┐
     │   OPTIMIZATION ENGINE        │  ← OR-Tools core
     │  Clustering → Time Windows   │     NOT Google Routes
     │  Budget → Fatigue → Prefs    │     NOT an LLM
     │  Dependencies → Constraints  │
     └──────────────┬───────────────┘
             ▼
     ┌──────────────┐
     │ Feasibility  │  ← Check every day before showing user
     │  Verifier    │
     └──────┬───────┘
             ▼
     ┌──────────────┐
     │  Explanation │  ← Gemini writes "why", optimizer decides "what"
     │   Engine     │
     └──────┬───────┘
             ▼
     3 TRIP PLANS (Budget / Balanced / Comfort)

─────────────────────────────────────────
DURING THE TRIP — separate system:

     TRIP STATE (current location, completed, delayed, fatigue, weather)
             │
             ▼
     REPLAN ENGINE (re-optimizes REMAINING trip from current state)
             │
             ▼
     UPDATED REMAINING ITINERARY
```

> **The LLM is never the optimizer. OR-Tools is never the data source. Google Routes is never the intelligence layer. Each component does exactly one job.**

---

### Summary: The 4 Fixes

| Problem | Wrong approach | Correct approach |
|---|---|---|
| Crowd data | "Google Popular Times API" | Crowd Intelligence Layer — heuristics → BestTime → own ML |
| Train/bus data | "Call IRCTC/RedBus API" | Transport Provider Adapter — static → B2B aggregator → partnership |
| Guest + expenses | "No signup, pay via UPI" | Expense Ledger (calculate) + UPI deep link (user's own app pays) |
| Timeline | "Phase 1 = everything" | v0.1 proves the engine, v0.2 adds editing, v0.3 adds live state |

---

*Spec version 4.0 — Engineering fixes documented.*

---

## 🔴 CORRECTIONS v5.0 — Final Critical Issues (Claude + ChatGPT Round 3)

---

### C25: Amadeus Self-Service API — Shut Down July 17, 2026 ✅ VERIFIED

**Was assumed:** "Amadeus Hotels API" in architecture diagram.  
**Reality:** Amadeus decommissioned its entire Self-Service developer portal on **July 17, 2026**. API keys no longer work. Only enterprise-contract customers retain access.

**Fix — Remove "Amadeus Hotels" from all architecture diagrams. Replace with:**
```
Hotel Provider Adapter (same pattern as Transport)
  Phase 1: No booking — show hotel candidates via Google Places only
  Phase 2: Booking.com Demand API (requires Managed Affiliate Partner approval)
           OR MakeMyTrip partner program
           OR hotel aggregator (RateHawk, Hotelbeds, etc.)
  Phase 3: Direct hotel partnerships
```

---

### C26: TripScore Formula — Mathematical Normalization Bug 🔴 CRITICAL

**The spec says:** `TripScore = w1×(1-BudgetOverrun) + w2×(1-TotalTravelTime) + ...`

**Reality:** If `TotalTravelTime = 480 minutes`, then `1 - 480 = -479`. The score collapses.

**Fix — All inputs must be normalized to [0, 1] before combining:**
```python
def normalize(value, min_val, max_val):
    """Clamp and normalize to [0, 1]. 1 = best, 0 = worst."""
    return max(0.0, min(1.0, 1 - (value - min_val) / (max_val - min_val)))

# Correct TripScore:
TripScore = (
    w1 * normalize(budget_spent,   budget_min, budget_max)   +
    w2 * normalize(travel_minutes, 0, max_acceptable_travel) +
    w3 * normalize(fatigue_score,  0, max_fatigue)           +
    w4 * experience_score          # already 0–1              +
    w5 * preference_match          # already 0–1
)

# Same fix for DetourPenalty — convert everything to one unit (₹ or minutes):
DetourCost_rupees = (extra_km * per_km_cost_rs) + (extra_min * time_value_rs_per_min)
# NOT: extra_km + extra_min × 0.8  ← mixing units
```

---

### C27: Route Matrix Element Billing — Not "One API Call"

**Was assumed:** "20 candidates → route matrix → one API call."  
**Reality:** Google Routes Matrix is billed per origin-destination element. 20×20 = 400 elements, each individually billed.

**Fix — Matrix size control is critical:**
```python
# Bad: full matrix for every candidate set
route_matrix(20_origins, 20_destinations)  # = 400 billable elements

# Good: prune candidates BEFORE matrix call
shortlist = prune_by_straight_line_distance(candidates, limit=10)
route_matrix(10_origins, 10_destinations)  # = 100 elements (4× cheaper)

# Better: reuse matrix across variants — compute once, optimize 3 plans
```

Budget: route matrix cost = `N × M × price_per_element`, not flat per plan.

---

### C28: Offline Maps — Google Map Tiles Caching Prohibited ✅ VERIFIED

**Was assumed:** "Offline cached maps" using Google Maps tiles.  
**Reality:** Google Map Tiles API ToS explicitly prohibits pre-fetching, caching, and storing map tiles for offline use. Violates ToS; API key can be revoked.

**Fix — Two-layer maps approach:**
```
ONLINE (default): Google Maps for display (familiar, high quality)

OFFLINE (on trip): OpenStreetMap-based rendering
  Recommended: MapLibre GL (React Native plugin: @maplibre/maplibre-react-native)
  Tile source: Download city-level OSM tiles before trip starts
  Legal: OSM data is ODbL licensed — caching explicitly allowed
  Storage: ~50–200MB per city (compressed vector tiles)

Download prompt: "Download Hyderabad map for offline use? (78MB)"
                 → triggers when user's trip is 24h away, on WiFi
```

---

### C29: UPI Settlement Confirmation — Cannot Assume Payment Succeeded

**Was assumed:** User taps "Pay via UPI" → payment confirmed → TripWeave clears the debt.  
**Reality:** When the user's UPI app opens, TripWeave has no reliable callback confirming the payment succeeded. The user could close the app mid-payment.

**Fix — Manual confirmation model (Phase 2):**
```
[Pay ₹650 via UPI]  ← opens GPay/PhonePe
         ↓
User completes (or abandons) payment in their app
         ↓
TripWeave shows: "Did the payment go through?"
         ↓
[Yes, mark as settled] ← user confirms manually
         ↓
Expense cleared in ledger

Note: Never auto-clear. Always require user confirmation.
Future (Phase 3): UPI intent callbacks if payment SDK supports it.
```

---

### C30: "Unknown" State — Missing From Data Model

**Was assumed:** All facts are either known (true/false) or absent.  
**Reality:** Much of real-world travel data is genuinely unknown at the time of planning.

**Rule: Unknown must NEVER silently become false.**

```python
# Every external fact needs three values, not two:
class FactValue(Enum):
    TRUE    = "true"
    FALSE   = "false"
    UNKNOWN = "unknown"    # explicitly not known — not false

# Examples:
place.wheelchair_accessible = UNKNOWN  # → don't say "not accessible"
place.cash_only             = UNKNOWN  # → don't say "UPI accepted"
transport.available         = UNKNOWN  # → don't say "seats available"
restaurant.open_on_holiday  = UNKNOWN  # → don't say "will be open"

# UI rule: UNKNOWN shows a warning, not a green checkmark or a red X
```

---

### C31: Data Freshness — Hard Constraints Need Verified Sources

**Fix — Every important fact in the database needs provenance:**
```python
class PlaceFact:
    value:          Any
    confidence:     float        # 0.0 – 1.0
    source:         str          # "official_website" | "user_report" | "heuristic" | "llm_guess"
    source_url:     Optional[str]
    verified_at:    datetime
    freshness_days: int          # how old is this

# Rule: A "MANDATORY" (hard) constraint is only hard if:
#   confidence >= 0.9 AND freshness_days <= 30
# Otherwise: treat as PREFERRED, show warning to user
```

---

### C32: Plan Versioning — Missing from DB Schema

```sql
-- Add to schema:
CREATE TABLE plan_versions (
    id          UUID PRIMARY KEY,
    trip_id     UUID REFERENCES trips(id),
    version     INTEGER,
    created_at  TIMESTAMPTZ,
    changed_by  UUID REFERENCES users(id),
    change_type TEXT,  -- 'generated' | 'user_edit' | 'replan' | 'lock_added'
    snapshot    JSONB  -- full itinerary state at this version
);
```

Without this, you cannot answer "what was the original plan?" or "what changed and why?"

---

### C33: DBSCAN Clusters ≠ Days — Need Workload Estimation Step

**Was assumed:** DBSCAN geo-clusters → each cluster = one day.  
**Reality:** A geo-cluster might have 10 attractions needing 14 hours, or 3 needing 4 hours. Cluster size ≠ day workload.

**Fix — Correct pipeline:**
```
1. DBSCAN → geographic candidate groups
2. Estimate workload per candidate:
   workload = Σ(visit_duration) + Σ(travel_time_between) + meal_time + buffers
3. Split oversized clusters / merge undersized ones → balanced day candidates
4. Assign day candidates to trip days (Day 1, Day 2, etc.)
5. OR-Tools: optimize order within each assigned day
```

Step 2-3 is currently missing. Without it, Day 1 might have 14 hours of activities and Day 2 only 4.

---

### C34: Provider Adapter — Expand to ALL External Dependencies

Complete the pattern everywhere:

```python
# All external data goes through a typed adapter — core never calls APIs directly

class PlaceProvider(ABC):
    def search_nearby(self, lat, lng, type, radius) -> List[Place]: ...
    def get_details(self, place_id) -> PlaceDetail: ...

class RouteProvider(ABC):
    def get_matrix(self, origins, destinations, mode) -> RouteMatrix: ...

class HotelProvider(ABC):
    def search(self, location, dates, guests, budget) -> List[HotelOption]: ...

class WeatherProvider(ABC):
    def get_forecast(self, lat, lng, date) -> WeatherForecast: ...

class CrowdProvider(ABC):
    def get_forecast(self, place_id, day, hour) -> CrowdForecast: ...

class TransportProvider(ABC):
    def search_routes(self, origin, dest, date) -> List[TransportOption]: ...

class EventProvider(ABC):
    def get_events(self, city, date_range) -> List[Event]: ...

# The Optimizer only speaks to these interfaces.
# Swap implementations without touching optimization code.
```

---

### C35: Constraint Relaxation + Infeasibility Explanation

**Currently missing:** What happens when no feasible plan exists?

```
Bad:  Show a broken/bad itinerary
Good: Explain what's infeasible and offer choices

Example:
  "No feasible plan found for your ₹15,000 budget over 3 days.
   The minimum feasible budget is ₹17,400.

   To make this trip work, choose one:
   [+₹2,400 to budget]
   [Remove one hotel night — day trip from Bengaluru]
   [Use bus instead of train — saves ₹600]
   [Remove Ramoji Film City — saves ₹1,100 + 5 hrs]"
```

The engine must: (1) detect infeasibility, (2) find the minimum constraint relaxation, (3) present human-readable options.

---

### Summary: What Still Needed Fixing in v4

| Issue | Source | Status |
|---|---|---|
| Amadeus shutdown (July 2026) | Claude | ✅ Fixed — remove from arch |
| TripScore math normalization bug | ChatGPT | ✅ Fixed — normalize all inputs |
| Route matrix billing per element | Both | ✅ Fixed — prune before matrix |
| Offline Google Maps prohibited | ChatGPT | ✅ Fixed — MapLibre + OSM |
| UPI confirmation not guaranteed | ChatGPT | ✅ Fixed — manual confirm step |
| "Unknown" state missing | ChatGPT | ✅ Added to data model |
| Data freshness for hard constraints | ChatGPT | ✅ Added provenance model |
| Plan versioning | ChatGPT | ✅ Added to DB schema |
| DBSCAN ≠ days (workload estimation) | ChatGPT | ✅ Added pipeline step |
| Provider adapter everywhere | ChatGPT | ✅ All providers typed |
| Constraint relaxation / infeasibility | ChatGPT | ✅ Added explanation engine |

---

*Spec version 5.0 — All known issues documented. See Engineering Blueprint v1.0 for the clean build guide.*
