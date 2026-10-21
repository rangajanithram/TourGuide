const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Transpile TypeScript with the already installed compiler; no browser secrets or live emails.
function load(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const { safeNext, authErrorMessage } = load('lib/auth-policy.ts');
const { createAuthService } = load('lib/auth-service.ts');
const { apiBaseUrl, boundedFetch, requireApiSuccess } = load('lib/planner-network.ts');
const costsModule = load('lib/journey-costs.ts');
test('combined budget reserves full tickets and prepaid stays and rejects missing fares', () => {
  const { validateJourneyBudget } = load('lib/journey-budget.ts');
  const form = { destination: 'hyderabad', origin_city: 'bengaluru', budget_inr: 15000,
    whole_journey_budget_inr: 10000, booked_transport: { total_fare_inr: 6000, paid_inr: 4000 } };
  assert.equal(validateJourneyBudget(form), 4000);
  assert.equal(validateJourneyBudget({ ...form, stay_choice: { budget_treatment: 'already_paid', total_stay_cost_inr: 2000 } }), 2000);
  assert.throws(() => validateJourneyBudget({ ...form, booked_transport: undefined }), /booked roundtrip/);
  assert.throws(() => validateJourneyBudget({ ...form, whole_journey_budget_inr: 6000 }), /no destination budget/);
});
test('combined journey costs count included stay once and subtract reported ticket payments', () => {
  const costs = costsModule.journeyCosts({
    total_cost_inr: 6051,
    hotel_summary: { total_cost_inr: 2400 },
    booked_transport: { total_fare_inr: 6000, paid_inr: 4000 },
  });
  assert.equal(costs.total, 12051);
  assert.equal(costs.paid, 4000);
  assert.equal(costs.remaining, 8051);
});
test('prepaid excluded stay is counted in journey total and already paid exactly once', () => {
  const costs = costsModule.journeyCosts({
    total_cost_inr: 3651,
    hotel_summary: { total_cost_inr: 0, excluded_prepaid_cost_inr: 2400 },
    booked_transport: { total_fare_inr: 6000, paid_inr: 4000 },
  });
  assert.equal(costs.total, 12051);
  assert.equal(costs.paid, 6400);
  assert.equal(costs.remaining, 5651);
});
test('old snapshots and edited destination totals derive fresh journey costs', () => {
  assert.equal(costsModule.journeyCosts({ total_cost_inr: 5000 }).hasBookedTickets, false);
  assert.equal(costsModule.journeyCosts({ total_cost_inr: 5000 }).remaining, 5000);
  assert.equal(costsModule.journeyCosts({ total_cost_inr: 4500 }).total, 4500);
});
test('text export shares the same combined accounting and labels unknown costs', () => {
  const { formatItineraryForShare } = load('utils/calendarExport.ts', { '../lib/journey-costs': costsModule });
  const text = formatItineraryForShare({
    variant_type: 'balanced', total_cost_inr: 6051, transport_mode: 'cab',
    estimated_transport_cost_inr: 1651, days: [],
    booked_transport: { outbound_mode: 'train', return_mode: 'flight', total_fare_inr: 6000, paid_inr: 4000 },
  }, 'Hyderabad');
  assert.match(text, /12,051/);
  assert.match(text, /8,051/);
  assert.match(text, /not a complete journey quote/);
});
test('production API configuration never falls back to localhost or insecure URLs', () => {
  for (const value of ['', 'http://localhost:8000', 'https://127.0.0.1', 'ftp://api.test', 'https://user:password@api.test', 'https://api.test?key=secret']) {
    assert.throws(() => apiBaseUrl(value, 'production'));
  }
  assert.equal(apiBaseUrl('https://api.test/', 'production'), 'https://api.test');
  assert.equal(apiBaseUrl('', 'development'), 'http://127.0.0.1:8000');
});
test('API failures preserve validation feedback and explain server backoff', async () => {
  await assert.rejects(requireApiSuccess(new Response('{}', { status: 429, headers: { 'Retry-After': '8' } })), /8 seconds/);
  await assert.rejects(requireApiSuccess(new Response('private server traceback', { status: 500 })), /existing trip is unchanged/);
  await assert.rejects(requireApiSuccess(new Response(JSON.stringify({ detail: [{ msg: 'Budget must be positive' }] }), { status: 422 })), /Budget must be positive/);
});
test('bounded requests time out, respect cancellation and never retry a POST', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      const rejectAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (init.signal.aborted) rejectAbort();
      else init.signal.addEventListener('abort', rejectAbort, { once: true });
    });
  };
  try {
    await assert.rejects(boundedFetch('https://api.test', { method: 'POST' }, 10), /took too long/);
    assert.equal(calls, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(boundedFetch('https://api.test', { signal: controller.signal }), { name: 'AbortError' });
  } finally { global.fetch = original; }
});
test('deadline includes delayed response body delivery', async () => {
  const original = global.fetch;
  global.fetch = async (_url, init) => ({ arrayBuffer: () => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }) });
  try { await assert.rejects(boundedFetch('https://api.test', {}, 10), /took too long/); }
  finally { global.fetch = original; }
});
test('network failures distinguish connection loss from incomplete response without retrying', async () => {
  const original = global.fetch;
  let calls = 0;
  try {
    global.fetch = async () => { calls++; throw new TypeError('private transport details'); };
    await assert.rejects(boundedFetch('https://api.test', { method: 'POST' }), error =>
      error.code === 'connection' && !error.message.includes('private transport'));
    assert.equal(calls, 1);
    global.fetch = async () => ({ arrayBuffer: async () => { throw new TypeError('stream failed'); } });
    await assert.rejects(boundedFetch('https://api.test'), error => error.code === 'response');
  } finally { global.fetch = original; }
});
const verified = { id: 'a', email_confirmed_at: '2026-10-09', is_anonymous: false };
function provider(overrides = {}) {
  const calls = [];
  const auth = {};
  for (const name of ['signInWithPassword', 'signUp', 'signInWithOAuth', 'resetPasswordForEmail', 'signOut']) {
    auth[name] = async (...input) => { calls.push([name, ...input]); return { data: {}, error: null }; };
  }
  Object.assign(auth, overrides);
  return { client: { auth }, calls };
}
test('redirects reject external, encoded, protocol-relative and unknown destinations', () => {
  for (const value of ['https://evil.test', '//evil.test', '/%2f%2fevil.test', '/account/../evil', '/account?next=evil', null]) assert.equal(safeNext(value), '/guide');
  assert.equal(safeNext('/reset-password'), '/reset-password');
  assert.equal(safeNext('/trips'), '/trips');
  assert.equal(safeNext('/planner'), '/planner');
});
test('email signup does not sign in or reveal duplicate account existence', async () => {
  for (const error of [null, { code: 'user_already_exists' }]) {
    const { client } = provider({ signUp: async () => ({ data: {}, error }) });
    assert.deepEqual(await createAuthService(client, 'https://trip.test').signup('Name', 'a@test.com', 'long passphrase'), { requiresEmailVerification: true, user: null });
  }
});
test('accidentally disabled email confirmation revokes the signup session', async () => {
  const { client, calls } = provider({ signUp: async () => ({ data: { session: { access_token: 'mock' } }, error: null }) });
  await assert.rejects(createAuthService(client, 'https://trip.test').signup('Name', 'a@test.com', 'passphrase'), e => e.code === 'verification_configuration');
  assert.equal(calls[0][0], 'signOut');
});
test('unverified and anonymous login never enters protected account state', async () => {
  for (const user of [{ ...verified, email_confirmed_at: null }, { ...verified, is_anonymous: true }]) {
    const { client, calls } = provider({ signInWithPassword: async () => ({ data: { user, session: {} }, error: null }) });
    await assert.rejects(createAuthService(client, 'https://trip.test').login('a@test.com', 'secret'), e => e.code === 'email_not_confirmed');
    assert.equal(calls[0][0], 'signOut');
  }
});
test('verified password login requires a real provider session', async () => {
  const { client } = provider({ signInWithPassword: async () => ({ data: { user: verified, session: {} }, error: null }) });
  assert.equal(await createAuthService(client, 'https://trip.test').login('a@test.com', 'secret'), verified);
});
test('Google uses standard Supabase redirect without offline scopes or browser-entered client IDs', async () => {
  const { client, calls } = provider();
  await createAuthService(client, 'https://trip.test').google();
  assert.deepEqual(calls[0], ['signInWithOAuth', { provider: 'google', options: { redirectTo: 'https://trip.test/auth/callback' } }]);
});
test('CAPTCHA passes through to Supabase and recovery has a neutral account result', async () => {
  const { client, calls } = provider();
  await createAuthService(client, 'https://trip.test').recover(' a@test.com ', 'captcha-mock');
  assert.deepEqual(calls[0], ['resetPasswordForEmail', 'a@test.com', { redirectTo: 'https://trip.test/auth/confirm', captchaToken: 'captcha-mock' }]);
});

test('provider rate limits, wrong credentials and logout failures remain failures', async () => {
  for (const code of ['over_request_rate_limit', 'invalid_credentials']) {
    const { client } = provider({ signInWithPassword: async () => ({ data: {}, error: { code } }) });
    await assert.rejects(createAuthService(client, 'https://trip.test').login('a@test.com', 'secret'), e => e.code === code);
  }
  const { client } = provider({ signOut: async () => ({ error: { code: 'network_error' } }) });
  await assert.rejects(createAuthService(client, 'https://trip.test').logout(), e => e.code === 'network_error');
  assert.match(authErrorMessage({ status: 429 }), /wait/);
});
const next = require('next/server');
const { authOrigin } = load('lib/auth-origin.ts');
function callback(client) {
  return load('app/auth/callback/route.ts', {
    'next/server': next, '@/lib/auth-origin': { authOrigin }, '@/lib/supabase/server': { getServerSupabase: async () => client },
    '@/lib/auth-policy': { safeNext },
  }).GET;
}
test('OAuth callback exchanges the code, checks the user and rejects open redirects', async () => {
  const calls = [];
  const GET = callback({ auth: {
    exchangeCodeForSession: async code => { calls.push(code); return { error: null }; },
    getUser: async () => ({ data: { user: verified } }),
  } });
  const response = await GET(new Request('https://trip.test/auth/callback?code=controlled-code&next=https://evil.test'));
  assert.deepEqual(calls, ['controlled-code']);
  assert.equal(response.headers.get('location'), 'https://trip.test/guide');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('cancelled, expired and missing-verifier OAuth produce a safe recovery page', async () => {
  for (const query of ['error=access_denied', '', 'code=expired']) {
    const GET = callback({ auth: { exchangeCodeForSession: async () => ({ error: { message: 'secret provider detail' } }) } });
    const response = await GET(new Request('https://trip.test/auth/callback?' + query));
    assert.equal(response.headers.get('location'), 'https://trip.test/auth/error');
  }
});
test('unverified callback never unlocks the account', async () => {
  const GET = callback({ auth: { exchangeCodeForSession: async () => ({ error: null }), getUser: async () => ({ data: { user: { ...verified, email_confirmed_at: null } } }) } });
  assert.equal((await GET(new Request('https://trip.test/auth/callback?code=mock'))).headers.get('location'), 'https://trip.test/auth/error');
});
test('email confirmation rejects cross-site submissions before contacting Supabase', async () => {
  let called = false;
  const POST = load('app/auth/verify/route.ts', { 'next/server': next, '@/lib/auth-origin': { authOrigin }, '@/lib/supabase/server': { getServerSupabase: async () => { called = true; } } }).POST;
  const result = await POST(new Request('https://trip.test/auth/verify', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: new URLSearchParams({ token_hash: 'mock', type: 'signup' }) }));
  assert.equal(result.status, 403); assert.equal(called, false);
});
test('confirmation and recovery verify single-use token hashes through the provider', async () => {
  for (const type of ['signup', 'recovery']) {
    const calls = [];
    const POST = load('app/auth/verify/route.ts', { 'next/server': next, '@/lib/auth-origin': { authOrigin }, '@/lib/supabase/server': { getServerSupabase: async () => ({ auth: { verifyOtp: async input => { calls.push(input); return { error: null }; } } }) } }).POST;
    const response = await POST(new Request('https://trip.test/auth/verify', { method: 'POST', headers: { Origin: 'https://trip.test' }, body: new URLSearchParams({ token_hash: 'mock-hash', type }) }));
    assert.deepEqual(calls, [{ token_hash: 'mock-hash', type }]);
    assert.equal(response.headers.get('location'), 'https://trip.test/' + (type === 'signup' ? 'guide' : 'reset-password'));
    assert.equal(response.status, 303);
  }
});

test('middleware forwards refreshed cookies and disables response caching', async () => {
  const request = new next.NextRequest('https://trip.test/guide');
  const { middleware } = load('middleware.ts', {
    'next/server': next, '@/lib/auth-origin': { authOrigin },
    '@/lib/supabase/config': { getAuthConfig: () => ({ url: 'https://example.supabase.co', key: 'sb_publishable_test' }), cookieOptions: { path: '/' } },
    '@supabase/ssr': { createServerClient: (_url, _key, options) => ({ auth: { getClaims: async () => {
      options.cookies.setAll([{ name: 'sb-refresh-test', value: 'refreshed-mock', options: { path: '/' } }], { Expires: '0', Pragma: 'no-cache' });
      return { data: { claims: { sub: 'mock-user' } } };
    } } }) },
  });
  const response = await middleware(request);
  assert.equal(request.cookies.get('sb-refresh-test').value, 'refreshed-mock');
  assert.equal(response.cookies.get('sb-refresh-test').value, 'refreshed-mock');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('expires'), '0');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const plannerResponse = await middleware(new next.NextRequest('https://trip.test/planner?tripId=private-id'));
  assert.equal(plannerResponse.headers.get('referrer-policy'), 'strict-origin');
});

test('map tiles use the canonical OSM URL and require valid managed provider configuration', () => {
  const { mapTileConfig } = load('lib/map-tiles.ts');
  assert.equal(mapTileConfig().url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.throws(() => mapTileConfig('http://tiles.test/{z}/{x}/{y}.png', 'Provider'));
  assert.throws(() => mapTileConfig('https://tiles.test/{z}/{x}/{y}.png', ''));
  assert.throws(() => mapTileConfig('https://tiles.test/fixed.png', 'Provider'));
  assert.equal(mapTileConfig('https://tiles.test/{z}/{x}/{y}.png', 'Provider').attribution, 'Provider');
});

test('local callback preserves the browser cookie origin despite Next dev URL normalization', () => {
  const request = new Request('http://localhost:3100/auth/callback', { headers: { host: '127.0.0.1:3100' } });
  assert.equal(authOrigin(request), 'http://127.0.0.1:3100');
});


test('protected pages reject missing, unverified and anonymous users', async () => {
  for (const user of [null, { ...verified, email_confirmed_at: null }, { ...verified, is_anonymous: true }, verified]) {
    const { requireVerifiedUser } = load('lib/require-user.ts', {
      'server-only': {},
      'next/navigation': { redirect: path => { throw new Error(path); } },
      './supabase/server': { getServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
    });
    if (user === verified) assert.equal(await requireVerifiedUser(), verified);
    else await assert.rejects(requireVerifiedUser(), /login/);
  }
});
test('travel preferences reject unknown values and preserve valid selections', () => {
  const { travelPreferences } = load('lib/travel-preferences.ts');
  assert.deepEqual(travelPreferences(null), { pace: 'balanced', transport_mode: 'cab', group_profile: 'default' });
  assert.deepEqual(travelPreferences({ pace: 'fast', transport_mode: 'plane', group_profile: 'admin' }), travelPreferences(null));
  assert.deepEqual(travelPreferences({ pace: 'relaxed', transport_mode: 'walk', group_profile: 'family' }), { pace: 'relaxed', transport_mode: 'walk', group_profile: 'family' });
});
test('planner requests include bearer credentials and reject missing sessions', async () => {
  const previousFetch = global.fetch;
  try {
    let sent;
    global.fetch = async (input, init) => { sent = init; return new Response('{}'); };
    const network = { boundedFetch, requireApiSuccess };
    const { plannerFetch } = load('lib/planner-fetch.ts', { './planner-network': network, './supabase': { getBrowserSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } }) } });
    await plannerFetch('https://api.test', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(sent.headers.get('Authorization'), 'Bearer test-token');
    assert.equal(sent.headers.get('Content-Type'), 'application/json');
    const absent = load('lib/planner-fetch.ts', { './planner-network': network, './supabase': { getBrowserSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) } });
    await assert.rejects(absent.plannerFetch('https://api.test'), /expired/);
  } finally { global.fetch = previousFetch; }
});

const {
  createTripsService,
  normalizeSavedSnapshot,
  resolveSelectedVariant,
  getAvailableVariants,
} = load('lib/trips-service.ts', { './snapshot-validation': load('lib/snapshot-validation.ts', { './journey-budget': load('lib/journey-budget.ts'), './booked-transport': load('lib/booked-transport.ts'), './journey-timing': load('lib/journey-timing.ts'), './stay-choice': load('lib/stay-choice.ts') }) });

const sampleDay = {
  day_number: 1,
  date: '2026-10-15',
  day_cost_inr: 600,
  activities: [{ place_id: 'hyd_charminar', place_name: 'Charminar', start_time: '09:00', end_time: '10:30', duration_mins: 90, estimated_cost_inr: 600, travel_time_from_prev_mins: 0, lat: 17.3616, lng: 78.4747 }],
};
const samplePlan = {
  variant_type: 'balanced',
  plan_name: 'Balanced Plan',
  total_cost_inr: 4600,
  estimated_transport_cost_inr: 500,
  transport_mode: 'cab',
  days: [sampleDay, { ...sampleDay, day_number: 2, date: '2026-10-16' }],
  hotel_summary: { hotel_name: 'Test hotel', lat: 17.3616, lng: 78.4747, total_cost_inr: 2900, rooms_needed: 1, nights: 1 },
};

test('variant helpers safely handle 1, 2, or 3 variants and explain unavailable options', () => {
  const oneVariant = {
    schema_version: 1,
    destination: 'Hyderabad',
    travel_dates: '2 Days',
    variants: { budget: { ...samplePlan, variant_type: 'budget' } },
    unavailable_variants: {
      balanced: 'Balanced tier exceeded the tight ₹3,500 local on-ground cap.',
      comfort: 'Comfort tier requires at least ₹8,000 local on-ground budget.',
    },
  };
  const normalized = normalizeSavedSnapshot(oneVariant);
  assert.deepEqual(getAvailableVariants(normalized.variants), ['budget']);
  assert.equal(resolveSelectedVariant(normalized.variants, 'comfort'), 'budget');
  assert.equal(resolveSelectedVariant(normalized.variants, 'balanced'), 'budget');
  assert.match(normalized.unavailable_variants.comfort, /₹8,000/);

  const twoVariants = {
    ...oneVariant,
    variants: {
      budget: { ...samplePlan, variant_type: 'budget' },
      balanced: samplePlan,
    },
  };
  assert.deepEqual(getAvailableVariants(twoVariants.variants), ['budget', 'balanced']);
  assert.equal(resolveSelectedVariant(twoVariants.variants, 'comfort'), 'balanced');
});

test('saved trip service blocks duplicate concurrent saves, reopens without regeneration, and enforces version concurrency', async () => {
  const tripUuid = '11111111-2222-3333-4444-555555555555';
  const snapshot = {
    schema_version: 1,
    destination: 'Hyderabad',
    travel_dates: '2026-10-15 to 2026-10-16',
    variants: { balanced: samplePlan },
    unavailable_variants: {},
  };
  const formData = {
    destination: 'hyderabad',
    start_date: '2026-10-15',
    end_date: '2026-10-16',
    budget_inr: 15000,
    people_count: 2,
    pace: 'balanced',
    transport_mode: 'cab',
    interests: ['history'],
    start_location: 'Kacheguda station',
    locked_activities: ['hyd_charminar'],
  };

  let rpcCalls = [];
  let resolveSlowRpc;
  const mockClient = {
    rpc: (fn, args) => {
      rpcCalls.push([fn, args]);
      if (fn === 'create_saved_trip_with_version') {
        return new Promise((resolve) => {
          resolveSlowRpc = () =>
            resolve({
              data: {
                id: tripUuid,
                user_id: 'user-1',
                title: args.p_title,
                destination: args.p_destination,
                days: args.p_days,
                budget_inr: args.p_budget_inr,
                selected_variant: args.p_selected_variant,
                schema_version: 1,
                current_version: 1,
                request_data: args.p_request_data,
                itinerary_data: args.p_itinerary_data,
                provenance_data: args.p_provenance_data,
                created_at: '2026-10-10T10:00:00Z',
                updated_at: '2026-10-10T10:00:00Z',
              },
              error: null,
            });
        });
      }
      if (fn === 'commit_trip_version') {
        if (args.p_expected_version !== 1) {
          return Promise.resolve({
            data: null,
            error: { code: '40001', message: 'CONCURRENCY_CONFLICT: Trip was modified by another session' },
          });
        }
        return Promise.resolve({
          data: {
            trip: {
              id: tripUuid,
              user_id: 'user-1',
              title: 'Hyderabad Trip',
              destination: 'Hyderabad',
              days: 2,
              budget_inr: 15000,
              selected_variant: 'balanced',
              schema_version: 1,
              current_version: 2,
              request_data: formData,
              itinerary_data: args.p_itinerary_data,
              provenance_data: args.p_provenance_data,
            },
            version: {
              id: 'ver-2',
              trip_id: tripUuid,
              user_id: 'user-1',
              version_number: 2,
              schema_version: 1,
              change_type: args.p_change_type,
              change_summary: args.p_change_summary,
              selected_variant: 'balanced',
              request_data: formData,
              itinerary_data: args.p_itinerary_data,
              provenance_data: args.p_provenance_data,
              restored_from_version: null,
            },
          },
          error: null,
        });
      }
      if (fn === 'restore_trip_version') {
        return Promise.resolve({
          data: {
            trip: {
              id: tripUuid,
              user_id: 'user-1',
              title: 'Hyderabad Trip',
              destination: 'Hyderabad',
              days: 2,
              budget_inr: 15000,
              selected_variant: 'balanced',
              schema_version: 1,
              current_version: 3,
              request_data: formData,
              itinerary_data: snapshot,
              provenance_data: {},
            },
            version: {
              id: 'ver-3',
              trip_id: tripUuid,
              user_id: 'user-1',
              version_number: 3,
              schema_version: 1,
              change_type: 'restore',
              change_summary: `Restored from version v${args.p_target_version_number}`,
              selected_variant: 'balanced',
              request_data: formData,
              itinerary_data: snapshot,
              provenance_data: {},
              restored_from_version: args.p_target_version_number,
            },
          },
          error: null,
        });
      }
    },
    from: (table) => ({
      select: () => ({
        eq: (_col, val) => ({
          single: async () => ({
            data: {
              id: val,
              user_id: 'user-1',
              title: 'Saved Snapshot Without Regeneration',
              destination: 'Hyderabad',
              days: 2,
              budget_inr: 15000,
              selected_variant: 'balanced',
              schema_version: 1,
              current_version: 1,
              request_data: formData,
              itinerary_data: snapshot,
              provenance_data: {},
            },
            error: null,
          }),
        }),
      }),
    }),
  };

  const service = createTripsService(mockClient);

  // 1. Duplicate concurrent save prevention
  const firstSavePromise = service.saveNewTrip({
    title: 'My Hyderabad Escape',
    formData,
    multiPlan: snapshot,
    selectedVariant: 'balanced',
  });
  await assert.rejects(
    service.saveNewTrip({
      title: 'My Hyderabad Escape',
      formData,
      multiPlan: snapshot,
    formData,
      selectedVariant: 'balanced',
    }),
    (err) => err.code === 'DUPLICATE_IN_FLIGHT'
  );
  resolveSlowRpc();
  const saved = await firstSavePromise;
  assert.equal(saved.id, tripUuid);
  assert.equal(saved.current_version, 1);
  assert.equal(rpcCalls[0][1].p_request_data.start_location, 'Kacheguda station');
  assert.match(rpcCalls[0][1].p_creation_key, /^[0-9a-f-]{36}$/i);

  // 2. Reopen saved trip directly from stored snapshot
  const reopened = await service.getSavedTrip(tripUuid);
  assert.equal(reopened.title, 'Saved Snapshot Without Regeneration');
  assert.equal(reopened.itinerary_data.variants.balanced.total_cost_inr, 4600);

  // 3. Commit revision increments version and detects stale expectedVersion conflicts
  const rev2 = await service.commitTripRevision({
    tripId: tripUuid,
    expectedVersion: 1,
    changeType: 'edit',
    changeSummary: 'Swapped stop on Day 1',
    selectedVariant: 'balanced',
    multiPlan: snapshot,
    formData,
  });
  assert.equal(rev2.trip.current_version, 2);
  assert.equal(rev2.version.version_number, 2);

  await assert.rejects(
    service.commitTripRevision({
      tripId: tripUuid,
      expectedVersion: 99,
      changeType: 'edit',
      changeSummary: 'Stale tab edit',
      selectedVariant: 'balanced',
      multiPlan: snapshot,
    formData,
    }),
    (err) => err.code === 'CONCURRENCY_CONFLICT'
  );

  // 4. Restoring version 1 creates new version 3 preserving history
  const restored = await service.restoreTripVersion({
    tripId: tripUuid,
    targetVersionNumber: 1,
    expectedVersion: 2,
  });
  assert.equal(restored.trip.current_version, 3);
  assert.equal(restored.version.version_number, 3);
  assert.equal(restored.version.restored_from_version, 1);
});


const snapshotValidator = load('lib/snapshot-validation.ts', { './journey-budget': load('lib/journey-budget.ts'), './booked-transport': load('lib/booked-transport.ts'), './journey-timing': load('lib/journey-timing.ts'), './stay-choice': load('lib/stay-choice.ts') });
test('saved journey cap survives serialization and rejects mismatch or overspend', () => {
  const snapshot = { destination: 'Hyderabad', variants: { balanced: structuredClone(samplePlan) } };
  const form = { destination: 'hyderabad', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [], whole_journey_budget_inr: 15000 };
  snapshot.variants.balanced.planning_preferences = { whole_journey_budget_inr: 15000 };
  const restored = JSON.parse(JSON.stringify(snapshot));
  assert.equal(snapshotValidator.validateTripRequest(form, restored).whole_journey_budget_inr, 15000);
  assert.throws(() => snapshotValidator.validateTripRequest({ ...form, whole_journey_budget_inr: undefined }, restored), /cap mismatch/);
  restored.variants.balanced.planning_preferences.whole_journey_budget_inr = 1;
  assert.throws(() => snapshotValidator.validateTripRequest({ ...form, whole_journey_budget_inr: 1 }, restored), /exceeds/);
});
test('snapshot guard rejects future schemas, broken costs, coordinates and overlapping appointments', () => {
  const original = { schema_version: 1, destination: 'Hyderabad', variants: { balanced: samplePlan } };
  assert.doesNotThrow(() => normalizeSavedSnapshot(original));
  for (const mutate of [
    s => { s.schema_version = 2; },
    s => { s.variants.balanced.total_cost_inr++; },
    s => { s.variants.balanced.days[0].activities[0].lat = 100; },
    s => { s.variants.balanced.days[0].activities[0].start_time = 'nonsense'; },
    s => { s.variants.balanced.days[0].activities.push({ ...s.variants.balanced.days[0].activities[0] }); },
    s => { s.variants.balanced.days[0].weather = { max_temp_c: 'hot' }; },
  ]) {
    const bad = structuredClone(original); mutate(bad);
    assert.throws(() => normalizeSavedSnapshot(bad), /Invalid|Unsupported/);
  }
});
test('calendar validation rejects impossible dates and request/snapshot mismatches', () => {
  assert.equal(snapshotValidator.validDate('2026-02-30'), false);
  assert.equal(snapshotValidator.validDate('2028-02-29'), true);
  const s = { destination: 'Hyderabad', variants: { balanced: samplePlan } };
  const f = { destination: 'hyderabad', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [] };
  assert.doesNotThrow(() => snapshotValidator.validateTripRequest(f,s));
  assert.throws(() => snapshotValidator.validateTripRequest({ ...f, budget_inr: 100 },s), /budget/);
  assert.throws(() => snapshotValidator.validateTripRequest({ ...f, people_count: 21 },s), /travelers/);
});
test('saved snapshots retain unscheduled dates and reject truncated calendars', () => {
  const snapshot = { schema_version: 1, destination: 'Hyderabad', variants: { balanced: structuredClone(samplePlan) } };
  const form = { destination: 'hyderabad', start_date: '2026-10-15', end_date: '2026-10-17', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [] };
  assert.throws(() => snapshotValidator.validateTripRequest(form, snapshot), /every requested day/);
  snapshot.variants.balanced.days.push({ ...snapshot.variants.balanced.days[1], day_number: 3, date: '2026-10-17', activities: [], day_cost_inr: 0 });
  assert.doesNotThrow(() => snapshotValidator.validateSnapshot(snapshot));
  assert.doesNotThrow(() => snapshotValidator.validateTripRequest(form, snapshot, 'balanced'));
});

test('saved requests cannot lose mandatory stops in the selected variant', () => {
  const snapshot = { destination: 'Hyderabad', variants: { balanced: samplePlan } };
  const form = { destination: 'hyderabad', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [], locked_activities: ['missing-stop'] };
  assert.throws(() => snapshotValidator.validateTripRequest(form, snapshot, 'balanced'), /mandatory stop/);
});
test('absent verification evidence stays unknown', () => {
  const serviceModule = load('lib/trips-service.ts', { './snapshot-validation': snapshotValidator });
  const provenance = serviceModule.buildTripProvenance({ destination: 'Hyderabad', variants: { balanced: samplePlan } }, 'balanced', 'Test');
  assert.equal(provenance.is_verified_valid, null);
  assert.equal(provenance.audit_score, null);
});

test('history reads metadata in stable pages without downloading snapshots', async () => {
  const tripId = 'a1000000-0000-4000-8000-000000000001';
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `v${i}`, trip_id: tripId,
    version_number: i + 1, change_type: 'edit', change_summary: 'Updated',
    selected_variant: 'balanced', created_at: '2026-10-11T00:00:00Z' }));
  const ranges = [];
  const chain = {
    select(columns) { assert.equal(columns.includes('*'), false); assert.equal(columns.includes('itinerary_data'), false); return this; },
    eq(column, value) { assert.equal(column, 'trip_id'); assert.equal(value, tripId); return this; },
    order(column, options) { assert.equal(column, 'version_number'); assert.equal(options.ascending, true); return this; },
    range(from, to) { ranges.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
  };
  const service = createTripsService({ from: () => chain });
  const history = await service.listTripVersions(tripId);
  assert.deepEqual(ranges, [[0, 99], [100, 199]]);
  assert.equal(history.length, 101);
  assert.equal(history[0].version_number, 101);
  assert.equal(history[100].version_number, 1);
});

test('trip pages are bounded and invalid pages never reach the database', async () => {
  const calls = [];
  const chain = { select() { return this; }, order(column) { calls.push(column); return this; },
    range(from, to) { calls.push([from, to]); return Promise.resolve({ data: [], error: null }); } };
  const service = createTripsService({ from: () => chain });
  assert.deepEqual(await service.listSavedTrips(2), []);
  assert.deepEqual(calls, ['updated_at', 'id', [24, 35]]);
  for (const page of [-1, NaN, 0.5]) await assert.rejects(service.listSavedTrips(page), err => err.code === 'INVALID_PAGE');
});

test('delete requires a returned row and releases its lock after failure', async () => {
  let result = { data: null, error: { code: 'PGRST116' } };
  const chain = { delete() { return this; }, eq() { return this; },
    select(columns) { assert.equal(columns, 'id'); return this; }, single: async () => result };
  const service = createTripsService({ from: () => chain });
  const id = 'a1000000-0000-4000-8000-000000000001';
  await assert.rejects(service.deleteSavedTrip(id), err => err.code === 'NOT_FOUND');
  result = { data: { id }, error: null };
  await service.deleteSavedTrip(id);
});

const { journeyWindow } = load('lib/journey-timing.ts');
const timedTrip = {
  origin_city: 'bengaluru', destination: 'hyderabad', start_date: '2026-10-19', end_date: '2026-10-19',
  journey_timing: { version: 1, timezone: 'Asia/Kolkata', outbound_departure: '2026-10-18T22:00+05:30', destination_arrival: '2026-10-19T10:00+05:30', destination_departure: '2026-10-19T19:00+05:30', return_arrival: '2026-10-20T07:00+05:30', arrival_buffer_minutes: 60, departure_buffer_minutes: 90 },
};
test('journey preflight preserves legacy requests and applies overnight transfer buffers', () => {
  assert.deepEqual(journeyWindow({ ...timedTrip, journey_timing: undefined }), { earliest: 60, latest: 720 });
  assert.deepEqual(journeyWindow(timedTrip), { earliest: 180, latest: 570 });
  assert.deepEqual(journeyWindow(JSON.parse(JSON.stringify(timedTrip))), { earliest: 180, latest: 570 });
});
test('journey preflight rejects invalid dates, order, offsets and unavailable sightseeing dates', () => {
  for (const changes of [{ outbound_departure: '2026-10-19T11:00+05:30' }, { destination_arrival: '2026-02-30T10:00+05:30' }, { destination_arrival: '2026-10-19T10:00' }, { arrival_buffer_minutes: 600 }, { departure_buffer_minutes: -1 }, { version: 2 }]) {
    assert.throws(() => journeyWindow({ ...timedTrip, journey_timing: { ...timedTrip.journey_timing, ...changes } }));
  }
  assert.throws(() => journeyWindow({ ...timedTrip, start_date: '2026-10-18' }), /Sightseeing dates/);
  assert.throws(() => journeyWindow({ ...timedTrip, origin_city: '' }), /origin city/);
});

test('saved request validation retains journey timing and rejects unsupported contracts', () => {
  const snapshot = { destination: 'Hyderabad', variants: { balanced: samplePlan } };
  const form = { destination: 'hyderabad', origin_city: 'bengaluru', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [], journey_timing: { ...timedTrip.journey_timing, outbound_departure: '2026-10-14T08:00+05:30', destination_arrival: '2026-10-14T20:00+05:30', destination_departure: '2026-10-17T08:00+05:30', return_arrival: '2026-10-17T20:00+05:30' } };
  const saved = snapshotValidator.validateTripRequest(form, snapshot, 'balanced');
  const reopened = snapshotValidator.validateTripRequest(JSON.parse(JSON.stringify(saved)), snapshot, 'balanced');
  assert.deepEqual(reopened.journey_timing, form.journey_timing);
  assert.throws(() => snapshotValidator.validateTripRequest({ ...form, journey_timing: { ...form.journey_timing, version: 2 } }, snapshot), /Unsupported journey/);
});

const { validateStayChoice } = load('lib/stay-choice.ts');
const bookedStay = { version: 1, kind: 'booked', base_name: 'My base', lat: 17.385, lng: 78.486, total_stay_cost_inr: 3000, budget_treatment: 'include' };
test('stay input validates costs, coordinate bounds and prepaid scope', () => {
  assert.doesNotThrow(() => validateStayChoice(undefined, 15000));
  assert.doesNotThrow(() => validateStayChoice(bookedStay, 15000));
  assert.doesNotThrow(() => validateStayChoice({ ...bookedStay, budget_treatment: 'already_paid' }, 2000));
  assert.doesNotThrow(() => validateStayChoice({ ...bookedStay, check_in_time: '14:00', check_out_time: '11:00' }, 15000));
  assert.throws(() => validateStayChoice({ ...bookedStay, check_in_time: '25:00' }, 15000), /HH:MM format/);
  for (const changes of [{ lat: NaN }, { lng: 200 }, { total_stay_cost_inr: -1 }, { kind: 'family_friends' }, { base_name: ' ' }, { version: 2 }]) assert.throws(() => validateStayChoice({ ...bookedStay, ...changes }, 15000));
  assert.throws(() => validateStayChoice(bookedStay, 3000), /entire destination budget/);
  for (const allows_bag_drop of [undefined, null, false, true]) assert.doesNotThrow(() => validateStayChoice({ ...bookedStay, allows_bag_drop }, 15000));
  assert.throws(() => validateStayChoice({ ...bookedStay, allows_bag_drop: 'yes' }, 15000), /luggage storage/);
});
test('saved request keeps a confirmed stay and rejects base or cost changes', () => {
  const form = { destination: 'hyderabad', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [], stay_choice: bookedStay };
  const snapshot = { destination: 'Hyderabad', variants: { balanced: structuredClone(samplePlan) } };
  snapshot.variants.balanced.hotel_summary = { ...snapshot.variants.balanced.hotel_summary, hotel_name: bookedStay.base_name, accommodation_kind: 'booked', lat: bookedStay.lat, lng: bookedStay.lng, total_cost_inr: 3000, reported_stay_total_inr: 3000, excluded_prepaid_cost_inr: 0 };
  const saved = snapshotValidator.validateTripRequest(form, snapshot);
  assert.deepEqual(snapshotValidator.validateTripRequest(JSON.parse(JSON.stringify(saved)), snapshot).stay_choice, bookedStay);
  snapshot.variants.balanced.hotel_summary.lat = 17.4;
  assert.throws(() => snapshotValidator.validateTripRequest(form, snapshot), /base or lodging budget scope/);
  snapshot.variants.balanced.hotel_summary.lat = bookedStay.lat;
  snapshot.variants.balanced.hotel_summary.excluded_prepaid_cost_inr = 3000;
  assert.throws(() => snapshotValidator.validateTripRequest(form, snapshot), /base or lodging budget scope/);
});
test('saved requests retain allowed intercity modes and reject empty or unsupported choices', () => {
  const snapshot = { destination: 'Hyderabad', variants: { balanced: samplePlan } };
  const form = { destination: 'hyderabad', origin_city: 'bengaluru', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [], intercity_modes: ['train'] };
  const saved = snapshotValidator.validateTripRequest(form, snapshot);
  assert.deepEqual(snapshotValidator.validateTripRequest(JSON.parse(JSON.stringify(saved)), snapshot).intercity_modes, ['train']);
  for (const modes of [[], ['boat'], ['train', 'bus', 'flight', 'train']]) {
    assert.throws(() => snapshotValidator.validateTripRequest({ ...form, intercity_modes: modes }, snapshot), /intercity modes/);
  }
});

const { validateBookedTransport } = load('lib/booked-transport.ts');
test('booked transport requires timing and valid whole-group paid amounts', () => {
  const booked_transport = { version: 1, outbound_mode: 'train', return_mode: 'flight', total_fare_inr: 6000, paid_inr: 4000 };
  assert.doesNotThrow(() => validateBookedTransport({ ...timedTrip, booked_transport }));
  assert.throws(() => validateBookedTransport({ booked_transport }), /timing/);
  for (const changes of [{ paid_inr: 6001 }, { total_fare_inr: -1 }, { total_fare_inr: true }, { paid_inr: 1.5 }, { return_mode: 'boat' }, { version: 2 }]) {
    assert.throws(() => validateBookedTransport({ ...timedTrip, booked_transport: { ...booked_transport, ...changes } }));
  }
});
test('saved bookings retain fares and reject changed snapshot bookings', () => {
  const booked_transport = { version: 1, outbound_mode: 'train', return_mode: 'flight', total_fare_inr: 6000, paid_inr: 4000 };
  const form = { destination: 'hyderabad', origin_city: 'bengaluru', start_date: '2026-10-15', end_date: '2026-10-16', budget_inr: 15000, people_count: 2, pace: 'balanced', transport_mode: 'cab', interests: [], booked_transport, journey_timing: { ...timedTrip.journey_timing, outbound_departure: '2026-10-14T08:00+05:30', destination_arrival: '2026-10-14T20:00+05:30', destination_departure: '2026-10-17T08:00+05:30', return_arrival: '2026-10-17T20:00+05:30' } };
  const snapshot = { destination: 'Hyderabad', variants: { balanced: { ...structuredClone(samplePlan), booked_transport } } };
  assert.deepEqual(snapshotValidator.validateTripRequest(JSON.parse(JSON.stringify(form)), snapshot).booked_transport, booked_transport);
  snapshot.variants.balanced.booked_transport = { ...booked_transport, paid_inr: 0 };
  assert.throws(() => snapshotValidator.validateTripRequest(form, snapshot), /booked transport changed/);
});
