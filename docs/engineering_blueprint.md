# TripWeave — Engineering Blueprint v2.0 (Authoritative Build Plan)

> **Purpose:** This is the authoritative technical architecture, security specification, and implementation contract for TripWeave. While `docs/product_spec.md` preserves the long-term product vision and historical design discussions, **this document governs what we build now and how it is engineered, secured, and verified.**
>
> **Core Principle:** Deliver a verified, secure, web-first vertical slice that transforms trip constraints into a geographically coherent, time-feasible, budget-compliant, and explainable multi-day itinerary—before expanding to paid external APIs, multi-user real-time sync, or native mobile apps.

---

## 0. Source-of-Truth Hierarchy & Conflict Resolution Ledger

When `product_spec.md`, older notes, or assumptions conflict, engineers and AI agents must follow this strict precedence order:

1. **Verified Legal, Licensing & Security Constraints** (OWASP, Supabase RLS, Google Maps/Places Terms of Service, India DPDP privacy principles).
2. **`AGENTS.md` & This Document (`docs/engineering_blueprint.md` v2.0)** (Current architecture, schemas, algorithm rules, and stage acceptance criteria).
3. **Verified Working Repository Code** (`web/` Next.js frontend, `tripweave/` FastAPI optimizer, `supabase/migrations/`).
4. **`docs/product_spec.md`** (Long-term product vision and future feature backlog).

### Resolved Audit Conflicts (v1.0 → v2.0)

| # | Conflict / Gap Found in v1.0 | Authoritative Resolution in v2.0 |
|---|---|---|
| **1** | **Website vs. Mobile Conflict**: v1.0 specified `React Native + Expo`, whereas the active project is a Next.js web application deployed on Vercel. | **Web-First Architecture**: Next.js 15 (App Router) on Vercel + FastAPI on Render + Supabase is the authoritative stack. React Native is deferred to Stage 5+ after web maturity. |
| **2** | **Unlinked `users` Table**: v1.0 defined a standalone `users` table disconnected from Supabase Auth (`auth.users`). | **Supabase Identity Authority**: `auth.users` is the single source of identity. `public.profiles`, `public.saved_trips`, and all user-owned tables reference `auth.users(id) ON DELETE CASCADE`. |
| **3** | **Missing Row-Level Security (RLS)**: v1.0 SQL tables had no RLS policies or role permission matrix. | **Mandatory RLS & Authorization Matrix**: Every table in `public` has RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), default grants revoked from `anon`, and explicit ownership/role policies enforced in both Postgres and FastAPI. |
| **4** | **Google Places 30-Day Blanket JSON Cache**: v1.0 assumed arbitrary Google Places JSON responses could be cached for 30 days and suggested mining all Google reviews. | **Strict ToS Compliance**: Removed the blanket 30-day `google_places_cache` JSON table. Only `google_place_id` may be stored indefinitely per Google Maps Platform ToS. Curated/independent data lives in `public.places`. Review scraping/mining is prohibited (Places API returns at most 5 reviews). |
| **5** | **Silent Downgrade of Mandatory Activities**: v1.0 downgraded user-mandatory stops to `PREFERRED` when data confidence was `< 0.9`. | **Constraint vs. Evidence Separation**: User intent (`mandatory` / `locked`) and data reliability (`confidence`, `FactValue.UNKNOWN`) are orthogonal. Mandatory stops are **never** silently downgraded; low-confidence data triggers an explicit `unverified` warning or an honest infeasibility explanation. |
| **6** | **Forcing 3 Variants Always**: v1.0 assumed 3 variants (`Budget`, `Balanced`, `Comfort`) must always be returned even under tight constraints. | **Up to 3 Feasible Variants**: Return 1 to 3 genuinely distinct feasible plans. If constraints only permit 1 or 2 feasible plans, return only those and explain why additional variants are infeasible. |
| **7** | **MVP Scope & Timeline Contradiction**: v1.0 §1 claimed Months 1–3 for v0.1 while §11 stretched v0.1 across Months 1–6. | **Stage-Gated Roadmap (Stages 0–5)**: Replaced calendar guesses with measurable stage gates and explicit acceptance criteria. |
| **8** | **Missing Security, Privacy, Deployment & QA Specs**: v1.0 lacked threat modeling, rate limiting, DPDP privacy rules, and test gates. | **Dedicated Production Engineering Sections**: Added Sections 10–14 covering OWASP security, privacy by design, API cost funnels, deployment environments, and QA test suites. |

---

## 1. Authoritative System Architecture (Web-First)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        USER BROWSER (Desktop & Mobile Web)                │
│   Next.js 15 App Router (React 18, TypeScript, Tailwind, Leaflet/OSM)     │
│   Hosted on Vercel (HTTPS, Edge Middleware, SSR Cookie Session Sync)      │
└───────────────┬───────────────────────────────────────────┬───────────────┘
                │                                           │
   1. Auth (PKCE, Email, Google OAuth)         2. Planning, Verification & Rebalance
      & Direct RLS-Protected Queries              (REST JSON + Optional Bearer JWT)
                │                                           │
                ▼                                           ▼
┌───────────────────────────────────────┐   ┌───────────────────────────────┐
│           SUPABASE CLOUD              │   │     FASTAPI BACKEND (Render)  │
│ • Supabase Auth (auth.users, PKCE)    │◄──┤ • JWKS / Auth Server Token    │
│ • PostgreSQL 15 + Row Level Security  │   │   Verification (auth.py)      │
│ • Tables: profiles, saved_trips,      │   │ • 10-Stage Optimizer Pipeline │
│   plan_versions, trip_members         │   │ • OR-Tools Time-Window Solver │
└───────────────────────────────────────┘   │ • Independent Stage 8 Verifier│
                                            └───────────────┬───────────────┘
                                                            │
                                               3. Typed Provider Adapters
                                                            │
                                                            ▼
                                            ┌───────────────────────────────┐
                                            │   DATA & EXTERNAL PROVIDERS   │
                                            │ • Curated City Seed Datasets  │
                                            │ • Open-Meteo Weather API      │
                                            │ • NOAA Solar Math (Offline)   │
                                            │ • Google Places/Routes (Stg 3)│
                                            └───────────────────────────────┘
```

### Technology Stack
* **Frontend**: Next.js 15 (`web/`), React 18, TypeScript, Tailwind CSS, Leaflet with OpenStreetMap tiles (online rendering; no Google Maps tile caching), Three.js (interactive user guide).
* **Authentication & Database**: Supabase Auth (`@supabase/ssr`, `@supabase/supabase-js` with PKCE flow) + Supabase PostgreSQL with Row-Level Security (RLS).
* **Backend API & Optimizer**: Python 3.11+, FastAPI (`tripweave/main.py`), Pydantic v2, Google OR-Tools (`ortools`), geographical clustering (`tripweave/clustering.py`), astronomical solar calculator (`tripweave/solar.py`), PyJWT with `cryptography` (`tripweave/auth.py`).
* **Hosting**: Vercel (Frontend) + Render (FastAPI Backend) + Supabase Cloud (Managed Auth & Postgres).
* **Deferred until justified by scale**: Redis, WebSockets (until Stage 5 live group sync), PostGIS (add when spatial SQL queries replace in-memory Haversine filtering), React Native (future native mobile client).

---

## 2. Current Implementation Status vs. Staged Roadmap

Status audit: 2026-10-10. Roadmap stages below differ from the optimizer pipeline stages in Section 5. See `STAGE_2_COMPLETION_AND_HANDOFF.md` for fixes, evidence and production acceptance steps. “Implemented” describes repository code; it does not independently certify provider configuration or live data accuracy.

Unlike a greenfield specification, TripWeave already has a working foundation in the repository. All future work must preserve and harden existing functionality:

| Stage | Deliverable | Repository Status | Completion / Acceptance Requirement |
|---|---|---|---|
| **Stage 0: Foundation** | Working Next.js website, interactive `/guide`, Vercel + Render deployment, Supabase Auth (Email verification, Google OAuth, Password recovery), RLS migration, FastAPI JWT verifier. | **Implemented** (`web/`, `tripweave/auth.py`, `supabase/migrations/`) | End-to-end acceptance test passes on production URLs: email signup → verify link → login → access `/account` → logout → Google OAuth login; cross-user RLS isolation test passes. |
| **Stage 1: Core Optimizer Prototype** | Deterministic 10-stage optimization pipeline on curated city data (Hyderabad reference city + Delhi, Jaipur, Bengaluru, Mumbai seeds), OR-Tools scheduling, NOAA sunset timing, hotel travel-cost scoring, Stage 8 independent physics verifier. | **Implemented** (`tripweave/optimizer.py`, `feasibility.py`, `verifier.py`, `solar.py`) | `test_api.py` deterministic suite passes 100% offline (weather test mocked/isolated from network); infeasible budgets/caps return structured HTTP 422 explanations. |
| **Stage 2: Web MVP & Cloud Persistence** | Connect Planner UI, `/trips`, & `/account` to Supabase `saved_trips` and `plan_versions`; save, reopen without regeneration, rename, and delete itineraries; interactive stop edits (`preview-edit`) and `rebalance-day` persisted as atomic revisions with version restore. | **Implemented and locally regression-tested; production acceptance pending** (`supabase/migrations/20261010183000_saved_trips_and_plan_versions.sql`, `web/src/lib/trips-service.ts`, `web/src/app/trips/page.tsx`, `web/src/components/PlannerPage.tsx`) | Verified user can generate a trip, save it to Supabase, reopen without regeneration, commit edits/rebalances as new versions, restore earlier versions without losing history, and verify cross-user RLS isolation (`supabase/tests/account_isolation.sql`). |
| **Stage 3: Compliant Real-World Providers** | Typed provider adapters with strict quota, cost, and licensing controls; Open-Meteo resilience; optional Google Places ID lookup (ToS-compliant, no unlawful 30-day full-payload caching). | **Partial** (`weather.py`, `provider.py` implemented; live Places adapter planned) | Provider contract tests pass with mocks and live quotas; API cost per itinerary is logged and capped by rate limits. |
| **Stage 4: Quality, Security & Performance** | Rate limiting on `/api/itinerary/*`, OWASP headers, privacy policy & terms pages, Core Web Vitals & solver p50/p95 benchmarks, automated E2E & security regression tests. | **Partial** (process-local rate limits, solver slots, request caps and regression checks exist) | Load/latency benchmarks documented; rate-limiter blocks burst abuse; zero high/critical vulnerabilities in dependency and auth audits. |
| **Stage 5: Expansion** | Multi-user group trip rooms (`trips`, `trip_members`), cloud-synced group expense ledger (`expenses`, `expense_splits`), Gemini natural-language intent & explanation renderer, PWA/mobile expansion. | **Planned** (Local browser expense prototype exists; cloud group sync in Stage 5) | Host creates invite link, members vote and split expenses in real time under RLS; UPI settlement uses explicit manual confirmation. |

---

## 3. Production Database Schema & Row-Level Security (RLS)

### Core Identity & Security Rules
1. **`auth.users` is authoritative**: Never create a standalone `users` password table. All user references point to `auth.users(id) ON DELETE CASCADE`.
2. **Never trust client-supplied ownership**: `user_id` defaults to `auth.uid()` and is enforced by `WITH CHECK ((select auth.uid()) = user_id)`.
3. **Anonymous restriction**: Anonymous JWTs (`is_anonymous = true`) are rejected by RLS policies on private tables.

### SQL Schema (`supabase/migrations/`)

```sql
-- ============ 1. USER PROFILES (LINKED TO SUPABASE AUTH) ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  name text check (char_length(name) <= 80),
  avatar_url text check (char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ 2. SAVED TRIPS (PRIVATE PER-USER STORAGE) ============
create table if not exists public.saved_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 160),
  destination text not null check (char_length(destination) between 1 and 100),
  start_date text,
  end_date text,
  group_size integer not null default 1 check (group_size between 1 and 50),
  budget_tier text default 'moderate',
  pace text default 'balanced',
  selected_variant text default 'balanced' check (selected_variant in ('budget', 'balanced', 'comfort')),
  itinerary_data jsonb not null default '{}'::jsonb,
  expenses_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_trips_user_id on public.saved_trips(user_id);

-- ============ 3. PLAN VERSIONS (AUDIT & UNDO HISTORY — STAGE 2) ============
create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.saved_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  version_number integer not null check (version_number >= 1),
  change_type text not null check (change_type in ('generated', 'user_edit', 'rebalance', 'variant_switch', 'lock_added')),
  change_summary text check (char_length(change_summary) <= 280),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (trip_id, version_number)
);

create index if not exists idx_plan_versions_trip_id on public.plan_versions(trip_id);

-- ============ 4. CURATED PLACES & SCHEDULES (OWN DATA LAYER) ============
-- Note: Only google_place_id (exempt identifier) may be stored from Google Places.
-- All other attributes in this table must come from independent curation or permitted sources.
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  google_place_id text unique,               -- Exempt identifier per Google Maps Platform ToS
  name text not null,
  city text not null,
  lat double precision not null,
  lng double precision not null,
  place_type text not null,                  -- 'fort' | 'museum' | 'temple' | 'restaurant' | 'hotel' | 'park'
  tags text[] default '{}',
  visit_duration_min integer not null default 60,
  entry_fee_inr integer not null default 0,
  accessibility text default 'unknown' check (accessibility in ('accessible', 'partial', 'not_accessible', 'unknown')),
  data_source text not null default 'curated_seed',
  confidence float not null default 0.8 check (confidence between 0.0 and 1.0),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ 5. ROW LEVEL SECURITY (RLS) POLICIES ============
alter table public.profiles enable row level security;
alter table public.saved_trips enable row level security;
alter table public.plan_versions enable row level security;

revoke all on public.profiles, public.saved_trips, public.plan_versions from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.saved_trips, public.plan_versions to authenticated;

create policy profiles_owner on public.profiles for all to authenticated
  using ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

create policy trips_owner on public.saved_trips for all to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

create policy plan_versions_owner on public.plan_versions for all to authenticated
  using ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false))
  with check ((select auth.uid()) = user_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
```

### Authorization Matrix

| Actor / Role | Stateless Planning (`/api/itinerary/*`) | Own `profiles` | Own `saved_trips` & `plan_versions` | Another User's `saved_trips` | Future Group Trip (`trip_members` Stage 5) |
|---|---|---|---|---|---|
| **Anonymous Guest** | Allowed (Rate-limited) | Denied | Denied | Denied | Read-only via explicit signed share token |
| **Authenticated User** | Allowed (Rate-limited) | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | **Strictly Denied (RLS)** | Role-based (`owner`, `editor`, `member`, `viewer`) |
| **FastAPI Backend** | Executes solver | Verifies JWT via JWKS (`/api/auth/me`) | Never uses `service_role` key for user queries | Denied | Enforces role permissions server-side |

---

## 4. Provider Interfaces & Licensing Compliance

All external data flows through typed Python interfaces (`tripweave/provider.py`, `tripweave/weather.py`, `tripweave/transport.py`). The core optimizer never makes raw HTTP calls directly.

### Strict Third-Party API Licensing Rules

| Provider / Data | Permitted Storage & Usage | Prohibited Actions (Never Implement) |
|---|---|---|
| **Google Places API** | Store `place_id` indefinitely. Request live fields on demand only when needed and display required Google attributions. | **NEVER** store a generic 30-day `google_places_cache` JSONB dump of Places responses, ratings, photos, or opening hours. **NEVER** scrape or attempt to mine bulk reviews (API returns max 5 reviews). |
| **Google Routes API** | Compute travel durations for pruned candidate shortlists (`<= 12` places per cluster). | **NEVER** send unpruned $N \times M$ city-wide matrices (billed per element). **NEVER** permanently store Google route polylines/matrices against ToS. |
| **Map Tiles** | Render OpenStreetMap tiles via Leaflet (`© OpenStreetMap contributors`). | **NEVER** prefetch, cache, or store Google Maps tiles for offline usage. |
| **Indian Railways / Buses (IRCTC / RedBus)** | Use clearly labeled curated static reference schedules (`data_source: "curated_reference"`, `status: "estimated"`). | **NEVER** claim live seat availability or confirmed fares without an authorized B2B aggregator integration. |
| **UPI Payments** | Generate standard `upi://pay` deep links for user convenience; require **manual user confirmation** (`"Did the payment go through?"`) to mark settled. | **NEVER** auto-settle balances upon clicking a UPI link or claim TripWeave processes payments. |

---

## 5. Corrected Optimizer Pipeline & Algorithmic Contracts

### 5.1 Separation of User Constraints vs. Data Confidence

Every place attribute carries provenance metadata (`FactValue`: `TRUE`, `FALSE`, `UNKNOWN`, `confidence: 0.0–1.0`, `verified_at`, `source`), while user intent carries a distinct constraint priority (`MANDATORY` / pinned, `PREFERRED`, `OPTIONAL`, `EXCLUDED`).

```python
from enum import Enum

class FactValue(str, Enum):
    TRUE = "true"
    FALSE = "false"
    UNKNOWN = "unknown"  # Explicitly unknown — NEVER silently treated as FALSE or TRUE

class ConstraintPriority(str, Enum):
    MANDATORY = "mandatory"  # User pinned / locked this stop
    PREFERRED = "preferred"  # Matches user interest tags
    OPTIONAL = "optional"    # Filler candidate if time/budget allows
    EXCLUDED = "excluded"    # User explicitly dropped or banned
```

**Authoritative Optimizer Rules:**
1. **No Silent Constraint Weakening**: If a user marks an activity `MANDATORY` (pinned), the optimizer **must not** silently downgrade it to `PREFERRED` when opening hours or holiday status have low confidence (`< 0.9`) or `FactValue.UNKNOWN`.
   * If the stop can be scheduled within known constraints, schedule it as `MANDATORY` and attach an explicit `unverified_warning` badge in the UI (`"Opening hours are estimated; please verify before visiting"`).
   * If the stop conflicts with hard physics or a confirmed closure (e.g., Salar Jung Museum pinned on a Friday), return a structured **422 Infeasibility Explanation** naming the exact conflict and offering user-selectable relaxations.
2. **Up to 3 Distinct Feasible Plans**:
   * The engine attempts to synthesize up to 3 variants (`Budget`, `Balanced`, `Comfort`) with genuinely different hotel tiers, transport modes, or pacing.
   * If tight user constraints (e.g., strict ₹3,000 budget) only permit 1 or 2 feasible variants, return only the feasible variant(s) along with an explanation of why higher tiers were omitted. Never fabricate or return an infeasible plan just to fill 3 slots.

### 5.2 The 10-Stage Deterministic Pipeline (`tripweave/`)

1. **Stage 1 — Input Validation & Candidate Retrieval (`provider.py`)**: Validate dates, party size (`1–20`), budget, and pinned stops against the destination catalog.
2. **Stage 2 — Hard Feasibility Filtering (`feasibility.py`)**: Filter out venues closed on the target day-of-week, outside total budget envelope, or incompatible with group accessibility requirements (while flagging `UNKNOWN` accessibility with a warning rather than silent exclusion).
3. **Stage 3 — Geographic Clustering (`clustering.py`)**: Group candidate attractions spatially using DBSCAN / Haversine proximity.
4. **Stage 4 — Workload Estimation & Cluster Balancing (`clustering.py`)**:
   * A geographic cluster does **not** automatically equal 1 day.
   * Compute cluster workload: $\text{Workload} = \sum \text{visit\_duration} + \sum \text{transit\_time} + \text{meal\_buffers}$.
   * Split oversized clusters across multiple days and merge undersized adjacent clusters to match the user's pace (`relaxed` / `balanced` / `intensive`).
5. **Stage 5 — Total-Trip Hotel Scoring (`feasibility.py`)**:
   * Score candidate hotels by **Total Trip Inconvenience** (nightly lodging cost across party rooms + daily round-trip commute cost/time to each day's attraction cluster + arrival/departure terminal transfer), not simple geometric centroid distance.
6. **Stage 6 — Time-Window & Solar Scheduling (`optimizer.py`, `solar.py`)**:
   * Compute astronomical sunrise, golden hour, and sunset for the exact latitude, longitude, and calendar date using the NOAA solar algorithm.
   * Schedule each day using Google OR-Tools CP-SAT / routing with opening-hour windows, meal windows, sunset viewpoint bonuses, and activity dependencies (`hotel_checkin` $\rightarrow$ sightseeing).
7. **Stage 7 — Normalized Multi-Objective Scoring (`fatigue.py`, `optimizer.py`)**:
   * Normalize all cost, transit time, fatigue, experience, and preference metrics to `[0.0, 1.0]` before applying weights.
   * *Note*: Fatigue coefficients and scoring weights are initial engineering hypotheses and must be documented as configurable parameters, not universal constants.
8. **Stage 8 — Independent Physics & Feasibility Verifier (`verifier.py`)**:
   * An independent audit module inspects the generated `TripPlan` after optimization to verify:
     1. Zero opening-hour or day-of-week closure violations.
     2. Realistic transit speeds and Haversine road-curvature distances between consecutive stops.
     3. Daily hotel departure and return commutes are accounted for.
     4. Line-item costs (`activities + dining + local transit + lodging`) reconcile with the on-ground `total_cost`; intercity transport and additional meal estimates are displayed separately and respect the user's budget ceiling.
9. **Stage 9 — Variant Diversification (`main.py`)**:
   * Produce up to 3 distinct, verified plans (`Budget`, `Balanced`, `Comfort`) preserving all user hard constraints (such as transport budget caps and pinned stops).
10. **Stage 10 — Explainability Trace (`main.py`)**:
    * Emit structured decision traces (`why_this_hotel`, `why_not_candidates` omission reasons, `synthesis_stages` timing telemetry, and data provenance labels).
    * When an LLM (Gemini) is used in Stage 5+, it may only summarize this verified `decision_trace`—it may **never** invent prices, opening hours, or feasibility claims.

---

## 6. Security, Privacy (DPDP), Cost Control & Operations

### 6.1 Application Security (OWASP & API Hardening)
* **Authentication**: Handled by Supabase Auth with PKCE flow, SSR-synced cookies (the browser Supabase SDK also accesses the session; do not claim all auth cookies are HTTP-only) (`@supabase/ssr`), and email verification required before password login.
* **Backend Token Verification (`tripweave/auth.py`)**: FastAPI validates Supabase Bearer tokens using the project's JWKS endpoint (`RS256`/`ES256`) and confirms active user status with the Supabase Auth server. No tokens, passwords, or secret payloads are ever logged.
* **Rate Limiting & Bot Defense**:
  * Auth endpoints are protected by Supabase rate limits and optional Cloudflare Turnstile CAPTCHA (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
  * Expensive FastAPI solver endpoints (`/api/itinerary/generate-variants`, `/api/itinerary/rebalance-day`) must enforce per-IP rate limiting and request payload size caps (`max_days <= 14`, `max_locked_activities <= 15`) to prevent CPU exhaustion and billing abuse.
* **Safe Redirects**: Auth callback routes validate `next` parameters against a strict allowlist (`/planner`, `/account`, `/reset-password`) via `safeNext()` to prevent open-redirect attacks.

### 6.2 Privacy by Design (India DPDP Act Alignment)
* **Data Minimization**: Collect only email, display name, and optional avatar for accounts; collect trip preferences (city, dates, party count, budget) only to compute itineraries. Do not demand phone numbers, government IDs, or continuous background GPS tracking.
* **No Public Indexing of Private Trips**: All `/account`, `/auth/*`, and shared trip URLs include `noindex, nofollow` metadata and `Cache-Control: private, no-store` headers on auth routes so private itineraries are never indexed by search engines or cached by shared proxies.
* **User Control & Deletion**: Deleting a user account in Supabase cascades (`ON DELETE CASCADE`) to `public.profiles`, `public.saved_trips`, and `public.plan_versions`.

### 6.3 Performance & Reliability Budgets
* **Frontend UX**: Follow the *"One Primary Action at a Time"* principle. Preserve form state on validation or network errors; show real stage-by-stage backend synthesis telemetry rather than fake progress bars.
* **Solver Runtime Budget**: Target `p50 < 1.5s` and `p95 < 4.0s` for 3-variant curated city generation. Bound OR-Tools solver search time strictly per day so pathological inputs cannot hang worker threads.

---

## 7. Production Deployment & Environment Configuration

### 7.1 Environment Separation
Never hardcode URLs or keys in source code. Maintain separate environment configurations for **Local Development** (`web/.env.local`, `.env`) and **Production** (Vercel + Render + Supabase Dashboard).

#### Frontend Environment Variables (Vercel / `web/.env.local`)
| Variable | Scope | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Public | FastAPI backend origin (e.g., `https://tripweave-api-u6sy.onrender.com`) |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical frontend origin (e.g., `https://tour-guide-e3es.vercel.app`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL (`https://<project-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase `anon` / `publishable` key (enforces RLS; never use `service_role` key here) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public (Optional) | Cloudflare Turnstile site key for signup/reset bot protection |

#### Backend Environment Variables (Render / `.env`)
| Variable | Scope | Description |
|---|---|---|
| `ENVIRONMENT` | Server | `development` or `production` |
| `CORS_ORIGINS` | Server | Comma-separated allowed frontend origins |
| `SUPABASE_URL` | Server | Supabase project URL for JWKS & `/auth/v1/user` verification |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Supabase `anon` / `publishable` key (sufficient for identity verification; `service_role` key is never required) |

---

## 8. Comprehensive Quality Assurance & Testing Strategy

A feature is **not complete** until its automated tests and acceptance criteria pass:

1. **Deterministic Optimizer Unit & Integration Suite (`test_api.py`, `test_rebalance.py`)**:
   * Verifies Haversine distance & vehicle capacity scaling, NOAA solar sunset calculations, Friday museum closure exclusion, hotel tier differentiation, strict transport budget caps, Stage 8 independent physics audit, and live day rebalancing.
2. **Authentication & Security Suite (`test_auth_security.py`, `web/tests/auth.test.cjs`)**:
   * Verifies open-redirect blocking (`safeNext`), JWT algorithm/issuer/audience validation, rejection of `service_role` keys in client config, and rate-limit error normalization.
3. **Database RLS Isolation Suite (`supabase/tests/account_isolation.sql`)**:
   * Proves inside a transaction that User A cannot `SELECT`, `UPDATE`, or `DELETE` User B's rows in `profiles`, `saved_trips`, or `plan_versions`, and that anonymous users cannot access private tables.
4. **End-to-End Web Acceptance Journey**:
   * Register with email $\rightarrow$ verify confirmation link $\rightarrow$ log in $\rightarrow$ generate itinerary $\rightarrow$ save trip to Supabase $\rightarrow$ log out $\rightarrow$ confirm protected route `/account` redirects to `/login` $\rightarrow$ log in with Google OAuth $\rightarrow$ retrieve saved trip.

---

*Engineering Blueprint v2.0 — Reconciled and hardened for Web-First Next.js + FastAPI + Supabase production architecture.*

## 2026-10-13 amendment: journey timing increment (Stage 3, first slice)

The master user-flow plan is implemented in small SDLC increments, each with requirements,
design, implementation, validation and release evidence. The first slice adds optional
`journey_timing` version 1 to planning preferences and saved request snapshots.

- Current supported cities use Asia/Kolkata. Four explicit timestamps require the +05:30
  offset and minute precision: outbound departure, destination arrival, destination
  departure, return arrival. They must be chronological and span at most 30 days.
- Existing start/end dates remain **sightseeing dates**. Travel nights do not silently
  change hotel nights or budgets. Existing destination-budget semantics are preserved.
- User-entered arrival and departure buffers reserve transfer/luggage/rest/boarding time.
  These values are estimates, not validated transport or hotel check-in evidence.
- Arrival plus buffer and departure minus buffer constrain the first/last sightseeing
  window, intersected with existing manual availability and the 08:00–20:00 solver window.
  Conflicting sightseeing dates fail before solving. The independent verifier recomputes
  those bounds, including during edits/rebalance.
- Optional additive JSON fields preserve old snapshots; no schema migration is required.
  Frontend form, review, request forwarding and reopening retain the timing contract.
- No paid service, booking verification, road routing or whole-journey budget claim is
  introduced. Transport summaries remain reference suggestions, not the entered bookings.

Next increment: complete the journey contract with explicit budget scope and accommodation
choices, then transport/stay scenario selection and canonical place evidence validation. The broader journey milestone remains partial:
allowed travel modes, booked/no-hotel bases, terminal routes, check-in and full-journey pricing
still need independent acceptance gates.

## 2026-10-14 amendment: accommodation and lodging budget scope

The second journey increment adds optional version-1 `stay_choice` to planning preferences
and saved request JSON. Missing choices retain existing planner-selected hotels/day-trip hubs.

- Choices: already booked, family/friends, or no accommodation arranged. All require an
  explicit named daily base and coordinates; no address is silently geocoded or fabricated.
- A supplied base must be within 100 km of the supported destination center. Each daily
  route starts and ends there. This is a bounded local-planning constraint, not an assertion
  that any coordinate within the radius is accessible or is the claimed property.
- Booked stay prices are user-confirmed whole-group, whole-stay totals. They may be included
  in the destination budget or marked already paid. Excluded prepaid costs remain visible
  in the stay summary and text export, but are never charged twice to the solver budget.
- Family/friends and no-stay choices have zero counted lodging cost. No-stay is a routing
  base only and explicitly warns that overnight accommodation is not included.
- The engine does not invent nightly rates, room counts, booking validity, occupancy or
  check-in availability for user-supplied stays. Travel-night/check-in handling remains pending.
- All variants retain the selected base and cost scope. Independent verification and saved
  request validation reject changed bases or lodging scope; edit/rebalance reuse preferences.
- No schema migration, paid provider or new authentication permissions are required.

This completes lodging budget treatment, not whole-journey budgeting. Intercity tickets,
exact hotel check-in/out dates and terminal transfer routing are still outside the verified
local subtotal. Next: allowed/booked transport modes and scenario selection, with explicit
intercity cost treatment and capacity propagation before claiming door-to-door feasibility.


## 2026-10-15 amendment: allowed intercity travel modes

- Optional `intercity_modes` accepts one to three train/bus/flight values. Legacy
  requests default to all three. The form, forwarded request, saved request and
  generated planning preferences retain the selection.
- Both outbound and return reference options must respect allowed modes. Known
  non-operating weekdays are excluded, including from comparison lists. Unknown
  schedules remain explicitly unverified. User-entered journey departure dates
  take precedence over sightseeing dates for this filtering.
- Missing return routes are no longer synthesized by reversing outbound records.
  The UI withholds roundtrip totals when return fares are unknown. No matching
  outbound route produces an explicit notice while preserving the local itinerary.
- These are reference estimates, not ticket availability or bookings. Intercity
  costs remain outside the verified destination budget. Overnight transport does
  not automatically remove a hotel night.
- No migration or paid service is required. Booked fares, whole-journey budgeting,
  schedule coupling and real transport availability remain separate future work.

## 2026-10-15 amendment: user-reported booked roundtrip travel

`booked_transport` is an optional version-1 contract in the request, planning
preferences and result. It records outbound/return modes, a whole-group roundtrip
fare, and how much of that fare is already paid. Amounts are integer INR from zero
to 5,000,000; paid cannot exceed total. No booking identifiers or passenger details
are collected. Both journey legs must be booked for this increment.

- Booked travel requires the existing chronological `journey_timing` contract.
  Arrival/departure buffers continue to constrain and independently verify the
  first and last sightseeing days.
- User bookings take precedence over allowed suggestion modes. Curated transport
  suggestions are suppressed rather than displayed as replacement bookings.
- Ticket fares remain additional to the destination budget. Paid and remaining
  ticket amounts are displayed separately, with no double-counting in the local
  solver subtotal. This is not a verified whole-journey price or budget cap.
- All variants, snapshots, reopen/edit flows and text exports retain the booking.
  The independent verifier and saved-request validation reject changed booking
  fields. Tickets, payments, terminals and availability remain user-reported.
- Old snapshots need no migration. No paid API or database change is introduced.

### Next chronological increments and acceptance gates

1. **Whole-journey budget scope:** distinguish total spending from remaining cash,
   reserve confirmed ticket/stay costs once, expose unknown expenses, and have the
   independent verifier reject overspend after generation and every edit.
2. **Transfers and stay timing:** user-confirmed terminals, arrival/departure legs,
   check-in/out windows and travel nights; explicitly reject impossible connections.
3. **Real place candidate integration:** expand the candidate pool using the free
   provider, retain mandatory pins and user-confirmed unknowns, and avoid presenting
   incomplete source data as verified hours, fees, dietary safety or availability.
4. **Presentation acceptance:** signed-in generate/save/reopen/edit/restore flows,
   mobile layout, provider failures and deployment checks for each increment.

Do not combine these into an unverified claim of worldwide or door-to-door planning.

### 2026-10-20 accounting display increment

The result and text export now derive combined counted costs, reported payments
and estimated remaining spend from the active plan. See `JOURNEY_COST_SUMMARY.md`.
Included lodging is not added twice; excluded prepaid lodging is added to both
cost and paid totals. Missing tickets and uncounted costs remain explicitly
excluded. This display does not enforce a whole-journey cap: item 1 above remains
open for request, solver and independent-verifier integration.

### 2026-10-20 optional combined counted-cost cap

`whole_journey_budget_inr` now persists in planning preferences. The solver uses
the smaller of the destination cap and the combined cap less full booked tickets
and excluded prepaid lodging. The verifier checks combined reported/recomputed
costs after generation and editor reconstruction; saving checks cap consistency.
Intercity caps require user-reported booked roundtrip fares. Paid costs remain
inside total spending. Unknown costs are explicitly outside coverage; this is
not a complete door-to-door quote. See `JOURNEY_COST_SUMMARY.md` for acceptance
scope and remaining live verification.

### 2026-10-21 stay metadata and accessibility increment — reviewed scope

Check-in/out values are optional reference metadata, not enforced schedule
constraints. The verifier checks preservation of supplied values, not feasible
hotel transitions. Terminal transfers, check-in/out scheduling and luggage
handling remain unfinished. Missing times and bag-drop availability must remain
unknown; common hotel times are not verified facts.

Place rating, review-count and address fields exist in models and result UI.
This does not connect a ratings/reviews provider or establish worldwide planning.
Only source-backed data may populate them. Map links use coordinates on a fixed
OpenStreetMap origin. Navigation labels were improved; a full accessibility audit
has not been completed.

Next acceptance gate: define explicit user-confirmed transfer and stay windows,
apply them in generation and independent verification, preserve them through
edit/save/reopen, and reject impossible connections with actionable feedback.
Then expand automatic real-place candidates using free services and confirmed
planning estimates. Do not mark either increment complete from schema tests alone.

### Optional booked-stay sightseeing bounds

`stay_choice.constrain_sightseeing_to_stay` defaults false. When enabled, both
confirmed times are required: the first daily route begins after check-in and
the last daily route returns to base before checkout. The user confirms that
these are the first/last sightseeing dates. Request validation and independent
verification apply the bounds, including reconstructed edit requests. Conflicting
one-day windows are rejected. Terminal routes, luggage storage, hotel availability
and check-in service duration remain outside this increment.

### 2026-10-22 separate user-estimated terminal transfer durations

Journey timing accepts optional arrival/departure transfer minutes, default zero
for old snapshots. These are added to existing buffers before deriving daily
bounds. Inputs explain how to avoid double-counting existing transfer buffers.
The independent verifier recomputes the same bounds during generation and edits.
Result timing shows both transfers separately. These are user estimates, not
routed travel times; fares and terminal coordinates remain a later increment.

### Discovery reliability: bounded repeat-search caching

Free-provider search results are reused for five minutes, with at most 128
process-local entries. Returned values are copied to prevent mutation across
requests. Failed searches are not cached; original fetched_at remains visible.
This reduces repeated provider calls without asserting current availability.
Automatic candidate selection and source-backed reviews remain unfinished.

### 2026-10-22 terminal transfer fare accounting

`arrival_transfer_cost_inr`, `arrival_transfer_paid_inr`, `departure_transfer_cost_inr`,
and `departure_transfer_paid_inr` now capture whole-group user estimates for terminal↔base
transfers outside local sightseeing travel. Paid amounts are validated against estimated
fares. When an optional combined counted cost cap (`whole_journey_budget_inr`) is set,
transfer fares are reserved alongside booked intercity tickets and prepaid lodging before
solving. The independent verifier checks that combined counted costs fit the requested cap.
The itinerary summary, cost breakdowns and text exports display transfer costs and report
remaining cash needs cleanly, without implying a complete door-to-door quote.
