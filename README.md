# TripWeave — Deterministic Travel Optimization Engine

[![FastAPI](https://img.shields.io/badge/FastAPI-0.112.2-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![OR-Tools](https://img.shields.io/badge/Google_OR--Tools-9.10-4285F4?style=flat-square&logo=google&logoColor=white)](https://developers.google.com/optimization)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-18%2F18_Passing-brightgreen?style=flat-square)](#automated-testing)

TripWeave is an end-to-end, anti-hallucination travel synthesis and route optimization engine. Unlike generative AI itineraries that frequently suggest closed venues, impossible transit times, or fictional budgets, TripWeave pairs **Google OR-Tools VRPTW (Vehicle Routing Problem with Time Windows)** with deterministic physics and astronomical calculation to construct verified, mathematically optimal travel itineraries.

---

## 🌟 Core Architecture & Capabilities

### 1. Operations Research Optimization (Google OR-Tools VRPTW)
- **Time Windows & Operating Hours**: Attractions are visited only during their actual opening hours with enforced minimum dwell times.
- **Trip-Wide Global Budget Constraints**: Uses in-solver cumulative vehicle variables (`solver.Sum([dim.CumulVar(routing.End(v)) for v in range(days)]) <= cap`) allowing flexible budget allocation across days while guaranteeing the overall trip cap.
- **Strict Transport Cap Enforcement**: User-selected transport limits (`max_budget_inr`) are strictly maintained across all generated variants (*Budget*, *Balanced*, *Comfort*).
- **Minimum Useful Plan Guardrail**: Guarantees itineraries contain substantive sightseeing visits; tight-constraint infeasibility returns explicit HTTP 422 errors instead of 0-visit plans.

### 2. Physical & Astronomical Modeling
- **Great-Circle Haversine Routing**: Point-to-point transit distances modeled using spherical trigonometry with mode-specific Indian urban velocity calibrations (Cab: 22 km/h, Auto: 18 km/h, Metro: 32 km/h, Walk: 4.5 km/h).
- **Date-Specific NOAA Solar Calculations**: Accurately computes solar noon, twilight, and sunset for any day of the year, scheduling scenic viewpoints during actual golden hour windows.
- **Day-of-Week Closures**: Automatically accounts for museum and monument rest days (e.g., Salar Jung Museum Friday closures).
- **Full-Day Return Window Audit**: Verifies complete return journeys to the hotel depot, ensuring travelers return safely before late-night cutoffs (9:00 PM cutoff error, 8:00 PM warning).

### 3. Multi-City Hubs & Overnight Bases
- **Supported Cities**: Curated, verified destination datasets for **Hyderabad**, **Delhi**, and **Jaipur**.
- **Accurate Geocoding**: Real coordinate resolution for City Center hubs (Abids, Connaught Place, MI Road), Railway Stations, and Airports (RGIA, IGI T3, JAI).
- **Centroid Hotel Depot**: Multi-day itineraries select an optimal geographic centroid hotel by tier (*Dorm/Hostel*, *Budget Hotel*, *Premium Boutique*), ensuring minimal commute overhead.

### 4. Verification & Fatigue Analytics
- **Independent Feasibility Verifier**: A decoupled audit engine scores every plan (0–100) across 7 objective criteria: activity density, closure compliance, transit physics, budget bounds, transport cap, accounting reconciliation, and return transit feasibility.
- **Fatigue & Pace Engine**: Analyzes cumulative daily walking vs vehicle transit against traveler pace preferences (*Relaxed*, *Balanced*, *Packed*), alerting travelers to excessive walking loads.

### 5. Frontend & Export
- **Next.js 14 Dark-Mode Cockpit**: Responsive dual-column layout with instant interactive synthesis.
- **Interactive Leaflet Routing**: Day-by-day route visualization, numbered stop markers, and dynamic map fitting via coordinate digests.
- **RFC 5545 Calendar (.ics) Export**: One-click download compatible with Apple Calendar, Google Calendar, and Outlook, complete with strict 75-octet line folding and timezone support.
- **Shareable Trip Links**: Encodes complete trip parameters for one-click sharing.

---

## 📁 Repository Structure

```
TourGuide/
├── data/                         # Verified seed datasets
│   ├── hyderabad_mock.json       # Attractions, opening hours, coords, hotels
│   ├── delhi_mock.json           # Delhi monuments, museums, and hubs
│   └── jaipur_mock.json          # Jaipur forts, palaces, and transit hubs
├── tripweave/                    # Python FastAPI & OR-Tools backend
│   ├── main.py                   # REST API routes and variant synthesis
│   ├── models.py                 # Pydantic v2 schemas and validation
│   ├── optimizer.py              # OR-Tools VRPTW solver & budget dimension
│   ├── verifier.py               # Independent physics & feasibility audit
│   ├── geocoding.py              # Haversine distance & origin hub resolver
│   ├── solar.py                  # NOAA astronomical solar calculation
│   └── config.py                 # Application settings and CORS configuration
├── web/                          # Next.js 14 frontend client
│   ├── src/
│   │   ├── app/                  # App Router entry page
│   │   ├── components/           # UI components (TripForm, Map, ItineraryView)
│   │   ├── types/                # TypeScript contract matching backend models
│   │   └── utils/                # Calendar .ics generator & formatting
│   └── package.json
├── test_api.py                   # 18 comprehensive automated tests
├── requirements.txt              # Backend dependencies
├── start.ps1                     # PowerShell launch script
└── start.bat                     # Windows Batch launch script
```

---

## 🚀 Getting Started

### Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher
- **npm** or **yarn**

---

### Running Manually

#### 1. Backend Setup (Terminal 1)
From the project root directory:

```bash
# Optional: create and activate a virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1   # On Windows PowerShell
# source venv/bin/activate    # On Linux / macOS

# Install backend dependencies
pip install -r requirements.txt

# Start the FastAPI engine on port 8000
python -m uvicorn tripweave.main:app --port 8000 --reload
```
- API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health Check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

#### 2. Frontend Setup (Terminal 2)
From the `web/` directory:

```bash
cd web

# Install frontend dependencies
npm install

# Start Next.js development server on port 3000
npm run dev
```
- Web Application: [http://localhost:3000](http://localhost:3000)

---

### Quick Launch Scripts (Windows)

To start both the FastAPI backend and Next.js frontend in separate terminal windows with a single command:

**PowerShell**:
```powershell
.\start.ps1
```

**Command Prompt / Batch**:
```cmd
start.bat
```

---

## 🧪 Automated Testing

The project includes an extensive test suite verifying mathematical solvers, astronomical shifts, budget bounds, physical transit speeds, and verifier reports.

### Run All 18 Backend Engine Tests
From the root directory:
```bash
python test_api.py
```

#### Test Suite Coverage:
1. **Haversine Distance**: Validates great-circle distance math against benchmark landmarks.
2. **NOAA Solar Calculation**: Computes exact sunset and golden hour minutes from latitude/longitude.
3. **Multi-City Day-Trip Origins**: Verifies hub resolution in Delhi, Jaipur, and Hyderabad.
4. **Date & Mode Resolution**: Validates flexible input combinations and root transport mode parsing.
5. **Day-of-Week Exclusions**: Verifies Friday museum closures (e.g. Salar Jung Museum).
6. **Viewpoint Compatibility**: Confirms naming compatibility across API and UI contracts.
7. **Differentiated Hotel Tiers**: Validates lodging selection across Budget, Balanced, and Comfort variants.
8. **Real Origin Coordinates**: Confirms exact GPS coordinates for all airports and train stations.
9. **Data Provenance & Freshness**: Verifies audit dates and provenance metadata on activities.
10. **Independent Verifier Audit**: Runs full physics verification scoring 100/100.
11. **In-Solver Budget Dimension**: Verifies OR-Tools cumulative cost dimension under tight constraints.
12. **Fatigue & Pace Engine**: Verifies walking distance calculations and pace rating formulas.
13. **Strict Budget Guardrail**: Verifies infeasible budgets are rejected with clear error details.
14. **Strict Transport Cap & Useful Plan**: Confirms transport limits are enforced and 0-visit plans are blocked.
15. **Date-Specific Sunset Shift**: Verifies summer vs winter sunset variations and golden-hour tagging.
16. **Full-Day Return Window Audit**: Verifies depot return travel time within operating limits.
17. **Variant Transport Cap Preservation**: Confirms user transport budget is preserved across all variants.
18. **City Center Origin Resolution**: Verifies city center hubs for all supported cities.

### Run Frontend Type Check
From the `web/` directory:
```bash
cd web
npx tsc --noEmit
```

---

## 📄 License
This project is licensed under the MIT License.
