# Updated website flow — October 10, 2026

## Entry and access

- Root URL opens `/guide`. Legacy trip query links route through the protected planner.
- Guide is public. Signed-out visitors see Log in / Sign up. Open planner sends them to login; direct planner URLs also require verification on the server.
- Email login, Google callback and email verification return to `/guide`. Verified members see My profile and can open the planner.
- Guest planner links are removed. Logout clears provider sessions and returns to the public guide.
- FastAPI generation, variant generation, candidates, edit previews and live rebalance require a verified bearer token. Frontend sends the Supabase session token; backend verifies it independently.

## Profile and design

`/account` saves display name and pace, transport and group defaults to authenticated Supabase user metadata. These are preferences, never authorization claims. New trips use them; shared links preserve explicit choices. Profile lists verified email/providers, password recovery and global logout. No new database migration is needed for these preferences. Display metadata is not used for authorization.

Planner uses cream, forest and clay colors, clear primary actions, accessible info explanations, and optional expandable settings. Ordinary visits no longer send an unwanted default generation request. Generation has a Cancel action, a two-minute timeout and protection against stale responses replacing a newer trip. The login keeps its 3D world and slow form transition with lightweight botanical SVG decoration. Expense records remain local to the browser, not private cloud synchronization.

## Deployment requirements

Redeploy **both Vercel and Render** from the changed code. In Render, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the same project used by Vercel. A publishable key is sufficient; do not use a service-role or secret key. Keep `NEXT_PUBLIC_API_URL` pointing to your Render service. Set `NEXT_PUBLIC_SITE_URL=https://tour-guide-e3es.vercel.app` and use that same origin as the Supabase Auth Site URL. Allow `/auth/callback` and `/auth/confirm` for this domain (and your intentional development origins). `NEXT_PUBLIC_API_URL` should be `https://tripweave-api-u6sy.onrender.com`.

## Acceptance checklist after deployment

1. Signed out: root opens guide; direct `/planner` and `/account` redirect to login. No guest buttons.
2. Register, verify email: return to guide; open planner, generate and preview an edit.
3. Repeat Google login: guide → planner.
4. Save profile defaults, reopen ordinary planner: defaults match. Shared links keep their selected settings.
5. Logout: direct planner access is blocked, and a request without a bearer token cannot generate a trip.
6. Test phone and desktop layouts, keyboard/touch info icons, failed login and failed generation recovery.

Downloaded `client_secret_*.json` files are now ignored by Git. Do not commit OAuth client secrets.

---

# TripWeave authentication: implementation, setup, and acceptance checks

## What is implemented

TripWeave now uses Supabase Auth as the only credential and session authority. Email signup requires confirmation; Google uses Supabase's standard OAuth redirect and PKCE exchange. PKCE ties a returned Google authorization code to the browser that started sign-in. OAuth lets Google verify the user without TripWeave receiving their Google password.

The application uses separate browser and per-request server clients from `@supabase/ssr`. The session is carried in cookies, refreshed by Next.js middleware, and validated by `getUser()` before the account and password pages render. A session is a temporary signed-in relationship; cookies carry its tokens between the browser and server. This SDK's browser-readable cookies are intentional for browser token refresh and are **not HttpOnly**. They use SameSite=Lax and Secure in production. Keep CSP/XSS controls and HTTPS in the deployment security review; cookies alone do not prevent XSS.

Implemented routes:

- `/login`, `/signup`, `/forgot-password`: email credentials, confirmation fields, visibility controls, provider errors, preserved inputs and duplicate-submit guards.
- `/check-email`: neutral notices, verification resend, a 60-second UI cooldown and optional CAPTCHA.
- `/auth/confirm`: deliberate Continue action before consuming a single-use email link, helping prevent email scanners from consuming it.
- `/auth/verify`: same-origin POST to verify signup/recovery token hashes.
- `/auth/callback`: Google PKCE code exchange, verified identity check, restricted internal redirects and safe error recovery.
- `/verified`: compatibility redirect to the guide for verified users.
- `/reset-password`: server-protected password form, password confirmation, global logout after success.
- `/account`: server-protected email, verification status, connected provider names, password action and logout.
- `/auth/error`: cancelled, invalid, expired or already-used links, including missing PKCE verifier recovery.

Account pages and callbacks disable shared caching and referrers. Browser auth state listens to provider events, refreshes after focus, handles logout across tabs and avoids applying a stale identity response after logout. Authorization does not trust browser localStorage, user IDs in request bodies, or editable user metadata.

FastAPI `/api/auth/me` verifies Supabase bearer identity. Asymmetric JWT signatures, issuer, audience, expiry and role are checked against the configured project's keys; the Auth service also validates the user. A JWT is a signed token carrying identity claims. Legacy HS256 signatures are verified by the Auth service, followed by issuer/audience/expiry checks. Provider outages return 503, invalid sessions return 401. The old custom signup/login/Google/logout endpoints now return 410. SQLite password/session handling and the browser Google-client-ID setup modal are retired. Existing local account databases are not deleted or automatically migrated.

The planner now requires a verified Supabase account, enforced on the server page and every itinerary API endpoint. Browser-local expense ledgers and share-by-query features are not cloud account storage. The RLS migration prepares private `profiles` and `saved_trips`; this change does not claim that all planner state is now saved to Supabase. RLS (row-level security) makes Postgres enforce ownership even when someone bypasses the UI and calls its API directly. Both UPDATE and INSERT check the resulting owner; anonymous visitors and anonymous Auth identities are excluded.

Next.js was updated from 14.2.35 to **15.5.27** for published security fixes; async request APIs were adapted. The JWT verifier uses PyJWT **2.15.1**, including the current JWKS refresh and malformed-token security fixes. Supabase packages are pinned to SSR **0.10.0** and JS **2.109.0**, compatible with the installed Node 20 runtime. PostCSS, selector parsing and source map dependencies received available published fixes. Lockfile changes are part of this work. Never run an unreviewed `npm audit fix --force` across this application.

## 1. Find the Supabase project URL and public key

1. Open https://supabase.com/dashboard and open the project you want to use for TripWeave, or create your project there.
2. Open **Connect** for the project. Copy **Project URL** and the **publishable key**. The key begins with `sb_publishable_`. The project's Settings/API Keys area also lists the keys.
3. Copy `web/.env.example` to `web/.env.local` and fill:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

4. Copy the repository root `.env.example` to `.env`. Use the **same project URL and public key**:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

The Python configuration loads root `.env`, preserving already set environment variables. Next.js loads `web/.env.local`. Restart both servers after editing them. `NEXT_PUBLIC_*` values are shipped to browsers at build time, so rebuild for production changes.

A public key is intended to be public; the database must enforce RLS. The application's auth integration needs **no Supabase service-role key or JWT signing secret**. Do not place `sb_secret_`, legacy service-role keys, database passwords, Google client secrets, SMTP credentials or CAPTCHA secrets in `NEXT_PUBLIC_*`. Real environment files are ignored by Git; example files contain placeholders.

## 2. Configure email authentication, redirects, passwords and sending

In Supabase **Authentication**:

1. Under **Sign In / Providers → Email**, enable email/password and **Confirm email**. The exact menu grouping can vary. Disable anonymous sign-in for this product stage.
2. Under **URL Configuration**, set development **Site URL** to `http://127.0.0.1:3000`.
3. Add exact allowed Redirect URLs:

```text
http://127.0.0.1:3000/auth/callback
http://127.0.0.1:3000/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

For an alternate development port, add the same paths on that port. Use one hostname consistently during a sign-in flow; `localhost` and `127.0.0.1` have separate cookie storage. Google needs the same browser that started the PKCE flow. Custom email token-hash links can work in another browser.

For production, set Site URL and `NEXT_PUBLIC_SITE_URL` to your real HTTPS origin, and allow its exact `/auth/callback` and `/auth/confirm` paths. Avoid broad wildcard production redirects. Configure any alternate domain to redirect to that canonical origin before users begin login. Never add your Google Cloud client-secret value to these URLs.

4. Set the provider minimum password length to **12**, matching the forms. Prefer unique passphrases and allow password managers/paste. Enable leaked-password protection when available on your Supabase plan. If you later enable secure password change requiring reauthentication/nonce entry, add and verify that additional flow before enabling it for users.
5. Set email OTP/link expiry to a reasonable window (for example 1 hour). Keep access-token lifetime short enough for your security needs; **15 minutes** is a reasonable initial setting to review. Global logout revokes refresh sessions, but already issued access tokens can remain usable until expiry. Strict immediate token revocation for future sensitive actions needs an additional session-validity check.
6. Review **Authentication → Rate Limits**. Supabase enforces the actual provider limits; the UI cooldown only reduces accidental repeat clicks and is not security enforcement. Review signup, sign-in, recovery, resend and verification limits before public launch. Avoid adding an attacker-triggered permanent account lockout.
7. Set up **Custom SMTP** under Authentication/Email settings for delivery to real users. Get SMTP host, port, username and password from your chosen mail provider after verifying your sending domain. Enter them into Supabase's SMTP settings. The default Supabase sender has significant restrictions, including recipient restrictions; it is unsuitable for assuming unrestricted public email delivery. Disable link tracking on authentication emails.

## 3. Configure the required email templates

These templates support this implementation's deliberate confirmation page. Set them under **Authentication → Email Templates**.

For **Confirm signup**, use a link like:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup">Verify your TripWeave email</a>
```

For **Reset password**, use:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Reset your TripWeave password</a>
```

The application passes an allowed `/auth/confirm` URL as RedirectTo for these emails. The user opens the link, presses Continue, and the server consumes the hash through Supabase. Signup continues to `/verified`; recovery continues to `/reset-password`. Link hashes are credentials: avoid analytics on these routes and configure hosting/proxy logs to redact auth query parameters. Do not copy actual links into issue trackers or chat.

## 4. Find and configure Google OAuth credentials

1. Open https://console.cloud.google.com and select/create your Google Cloud project.
2. Open **Google Auth Platform** (or APIs & Services → OAuth consent screen). Configure branding, support email and audience. While in Testing mode, add your chosen Google test accounts as test users.
3. Under **Clients** (or Credentials), create an **OAuth client ID** with application type **Web application**.
4. In **Authorized redirect URIs**, add:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

This is the **Google → Supabase** callback. Copy the exact callback displayed in Supabase's Google provider settings, especially if using a custom Supabase domain. Your application's `/auth/callback` is the separate **Supabase → TripWeave** callback; placing it in Google's redirect URI list does not replace the Supabase callback.

5. Copy the Google **Client ID** and **Client secret** from that client.
6. In Supabase **Authentication → Providers → Google**, enable Google and enter those two values; save them there. Do not put the Google secret into frontend environment files. This app uses redirects, so it does not need the Google GIS script, an in-browser client-ID form, offline Google access, or additional Google API scopes.
7. Test Google using the same website origin configured above. Supabase handles provider identity linking; do not manually merge records using an email supplied by the browser. Verify its documented automatic linking behavior with a verified email account and the matching Google account.

## 5. Optional Turnstile CAPTCHA

1. In Cloudflare dashboard → **Turnstile**, create a widget for your website. Add development hostnames and your production hostname.
2. Copy its **site key** into `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
3. Copy its **secret key** into Supabase **Authentication → Bot and Abuse Protection → CAPTCHA**, choose Cloudflare Turnstile and enable it.
4. Restart/rebuild the website. The widget passes its token to Supabase for actual verification on login/signup/recovery/resend. Tokens are cleared after an attempt or expiration. Test the challenge and failure states with provider configuration enabled.

Keep the site key blank and provider CAPTCHA disabled until you configure both sides. Supabase also supports hCaptcha, but this implementation includes the Turnstile widget. Phone OTP, identity uploads and mandatory MFA are not introduced.

## 6. Apply and check the database migration

The CLI generated `supabase/migrations/20261009152206_auth_account_isolation.sql`. Review it and apply it once to your chosen project using the Supabase migration workflow, or paste its contents into that project's SQL Editor. The old `supabase/schema.sql` is deprecated.

The migration grants authenticated access only behind ownership RLS, rejects ownership transfers, indexes saved-trip ownership and removes the prototype's privileged public metadata trigger. `auth.users` remains authoritative. Existing legacy profile columns are not trusted for authorization. Existing custom SQLite users need a deliberate account migration/re-registration plan; this work does not silently import their passwords.

Then run `supabase/tests/account_isolation.sql` in the SQL Editor as a privileged test runner, in a non-production project first. Its fixtures are rolled back. It checks another user's SELECT/INSERT/UPDATE/DELETE, ownership transfers, editable metadata pretending to be an admin and anonymous access. A successful script produces no exceptions. Run the project's **Security Advisor** and **Performance Advisor**, and review all findings before publishing. Database application, advisor execution and live isolation tests are pending until a project is configured.

## 7. Start and run acceptance checks

From the repository root, install Python requirements and start FastAPI. From `web`, install the locked dependencies and start Next.js:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn tripweave.main:app --reload --port 8000
```

In another terminal:

```powershell
cd web
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. If an older server was already running during the dependency update, stop and restart it before evaluating the new code.

Controlled checks:

```powershell
python -m unittest test_auth_security -v
```

From `web`:

```powershell
npm run test:auth
npm run typecheck
npm run lint
npm run build
npm audit
```

Use dedicated test accounts to run the live acceptance journey:

1. Sign up using an email you control. Before confirmation, try logging in and directly requesting `/account`: access must be denied.
2. Receive the email, open its link and press Continue. Verify the success page. Log out, log in with the password, open `/account`, refresh and confirm the session persists.
3. Open an additional tab; log out on all devices. Both tabs must lose private account access. Try browser Back and a direct account URL.
4. Repeat the entire journey with Google. Test a new Google identity, a returning identity and the Google identity matching an already verified email/password account. Cancel provider consent and try a callback without a valid code/verifier.
5. Request password recovery. Try an expired/used/invalid link, then a fresh link. Confirm password mismatch feedback and successful update. Old password must fail and new password must succeed. Verify the logout step after updating.
6. Exercise resend/recovery cooldowns, a provider 429, unavailable network, duplicate submits, and a CAPTCHA failure if enabled. Inputs must remain available for retry.
7. Use two separate accounts for the database isolation test. Account A must never read, modify or delete B's private records, including direct Data API calls. A public share feature must be separately designed before exposing saved-trip rows.
8. Check session expiry and refresh with a suitably short staging token lifetime. Inspect cookie Secure/SameSite and private/no-store headers in production, and confirm no shared/CDN cache leaks account responses. Check phone/tablet layouts and keyboard focus.

## Verification status and remaining limits

15 controlled JavaScript checks and 7 controlled Python checks pass. These are provider mocks and local cryptographic checks, not proof of live provider configuration.

| Area | Status |
|---|---|
| Email signup/login, confirmation, recovery, Google adapter, logout, callbacks and safe redirects | Implemented; controlled provider mocks tested |
| Signed JWT validation, issuer/audience/expiry, unverified/anonymous denial, provider outages | Controlled Python tests passed |
| Per-request SSR client, cookie refresh, no-store responses, direct unconfigured protected access | Local checks performed |
| Password form layout and signup switching; safe missing-config feedback | Local browser checks performed |
| TypeScript, lint, optimized build | Passed locally |
| Live email sending/verification/recovery | Pending project URL/key, email settings/templates and SMTP |
| Live Google new/returning/matching-email flow | Pending Google provider credentials and test accounts |
| RLS migration, cross-user database checks and advisors | Prepared; not applied or run against a live project |
| CAPTCHA provider verification | Optional implementation; live widget/provider checks pending configuration |
| Development dependency advisories | Seven high findings remain in development tooling through unpatched `braces`; `npm audit --omit=dev` reports zero production advisories. Follow upstream fixes. |

No production-ready claim is made from mocked tests. Complete the live acceptance checks and resolve/review outstanding dependency findings before a public launch.

Official references: [SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [password security](https://supabase.com/docs/guides/auth/password-security), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
