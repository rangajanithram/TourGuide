# AGENTS.md — TripWeave AI Engineering Governance & Source-of-Truth Rules

This file governs how AI coding assistants (Antigravity, Codex, etc.) and developers inspect, modify, and extend the TripWeave repository.

---

## 1. Source-of-Truth Hierarchy

Never treat historical brainstorming in `docs/product_spec.md` as an instruction to overwrite working code or violate licensing/security rules. Follow this strict precedence order:

1. **Security, Privacy & Provider Licensing Rules** (OWASP, Supabase RLS, Google Maps/Places Terms of Service, India DPDP privacy principles).
2. **`AGENTS.md` (This File) & `docs/engineering_blueprint.md` (v2.0)** — Authoritative current architecture, database schema, algorithm contracts, and stage acceptance criteria.
3. **Verified Working Repository Code** (`web/`, `tripweave/`, `supabase/migrations/`).
4. **`docs/product_spec.md`** — Long-term product vision and future feature backlog. Never silently delete or rewrite `product_spec.md`; propose updates to `engineering_blueprint.md` instead.

---

## 2. Authoritative Architecture Lock (Web-First)

* **Frontend**: Next.js 15 App Router in `web/`, deployed on **Vercel**. Preserve and extend the existing Next.js web application. Do **not** replace it with React Native/Expo (native mobile is a future Stage 5+ expansion).
* **Authentication & Database**: **Supabase Auth** (`auth.users` with PKCE, Email Verification, Google OAuth, Password Recovery) + **Supabase PostgreSQL** with mandatory **Row-Level Security (RLS)** (`supabase/migrations/`).
* **Backend & Optimizer**: Python 3.11+ **FastAPI** in `tripweave/`, deployed on **Render**. Validates Supabase Bearer tokens via JWKS (`tripweave/auth.py`).

---

## 3. Non-Negotiable Security & Privacy Guardrails

1. **No Hardcoded Auth or Secrets**: Never hardcode user accounts, passwords, JWTs, OAuth client secrets, or API keys. Keep `.env` and `web/.env.local` out of version control; document required variables in `.env.example` and `web/.env.example`.
2. **Supabase Identity Authority**: Every user-owned table (`profiles`, `saved_trips`, `plan_versions`, etc.) must reference `auth.users(id) ON DELETE CASCADE` and enforce RLS using `(select auth.uid()) = user_id` (excluding anonymous tokens).
3. **Never Trust Browser Ownership Fields**: User IDs, trip ownership, roles, and settlement states must be derived from verified sessions (`auth.uid()` or FastAPI `get_current_user`), never trusted from client request bodies.
4. **No Public Indexing of Private Data**: Auth routes, account pages, and shared trip views must use `noindex, nofollow` and `Cache-Control: private, no-store` where applicable.

---

## 4. Provider Licensing & Cost Guardrails

1. **Google Places ToS**: Only `google_place_id` may be stored indefinitely. **Never** create a generic 30-day `google_places_cache` JSON dump of restricted Google Places fields, and **never** scrape or mine bulk reviews.
2. **Map Tiles**: Use OpenStreetMap tiles via Leaflet with proper attribution. **Never** cache or prefetch Google Maps tiles.
3. **UPI Settlements**: UPI links (`upi://pay`) do not provide payment confirmation callbacks. Always require **manual user confirmation** before marking an expense split as settled.
4. **LLM Boundaries**: LLMs (Gemini) may only parse natural-language intent into validated schemas or summarize the optimizer's verified `decision_trace`. LLMs must **never** invent opening hours, prices, transit times, or schedule feasibility.

---

## 5. Optimizer Integrity Rules

1. **User Constraints vs. Evidence Reliability**: Never silently downgrade a user's `mandatory` (pinned) stop into `preferred` because data confidence is low or `UNKNOWN`. Keep it mandatory and display an explicit `unverified` warning, or return a structured HTTP 422 infeasibility explanation with relaxation choices.
2. **Independent Verification**: Every generated or rebalanced itinerary must pass the independent Stage 8 physics and budget verifier (`tripweave/verifier.py`).
3. **Feasible Variants**: Return **up to 3** genuinely distinct feasible variants (`Budget`, `Balanced`, `Comfort`). If tight constraints only allow 1 or 2 feasible variants, return only those honestly.

---

## 6. Testing & Communication Standard

* **Before Marking Complete**: Run `npm run typecheck`, `npm run lint`, `npm run test:auth` (in `web/`), and `python test_api.py` / `python test_auth_security.py` (in root).
* **Beginner-Friendly Explanations**: Explain what changed, why it was needed, how components interact, how it was tested, and what remains incomplete or unverified in clear, jargon-free language.
