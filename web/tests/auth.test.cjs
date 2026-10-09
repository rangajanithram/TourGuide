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
  for (const value of ['https://evil.test', '//evil.test', '/%2f%2fevil.test', '/account/../evil', '/account?next=evil', null]) assert.equal(safeNext(value), '/account');
  assert.equal(safeNext('/reset-password'), '/reset-password');
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
  assert.equal(response.headers.get('location'), 'https://trip.test/account');
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
    assert.equal(response.headers.get('location'), 'https://trip.test/' + (type === 'signup' ? 'verified' : 'reset-password'));
    assert.equal(response.status, 303);
  }
});

test('middleware forwards refreshed cookies and disables response caching', async () => {
  const request = new next.NextRequest('https://trip.test/account');
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
});

test('local callback preserves the browser cookie origin despite Next dev URL normalization', () => {
  const request = new Request('http://localhost:3100/auth/callback', { headers: { host: '127.0.0.1:3100' } });
  assert.equal(authOrigin(request), 'http://127.0.0.1:3100');
});
