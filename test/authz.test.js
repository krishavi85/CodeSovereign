'use strict';
/* Engine.Auth §16 — authorization attack surface + MFA / OAuth / passkey scaffolding.
 *
 * Generates a real full-stack app (auth + an owned entity + all extra auth
 * methods), boots its server on an ephemeral port, and runs the attacks the
 * blueprint calls for: IDOR (read/list/modify another user's rows),
 * privilege gaps, forged tokens, missing auth, plus the TOTP / OAuth /
 * WebAuthn code paths. Everything runs FOR REAL against the generated code. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const crypto = require('crypto');

function loadEngines(names) {
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: { _data: data, isFile: (p) => !!data[p], exists: (p) => p in data, read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}, count: () => 0, __flush: () => Promise.resolve() },
    Sovereign: { read: (p) => (sov[p] ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null), write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); } }
  };
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), win, { filename: n });
  return win;
}

module.exports = async function (t) {
  const win = loadEngines([
    'engine-universal.js', 'engine.js', 'engine.schema.js', 'engine.contract.js',
    'engine.auth.js', 'engine.backend.js', 'engine.jobs.js', 'engine.frontends.js',
    'engine.localize.js', 'engine.testgen.js', 'engine.deploy.js', 'engine.scaffold.js'
  ]);

  // ---- 1. the contract detects the requested auth methods ----
  const contract = await win.Engine.Contract.deriveFromPrompt(
    'A notes app where a user signs in, creates private notes and deletes them. Support two-factor auth (TOTP), ' +
    'sign in with Google and GitHub, and passkeys / WebAuthn.', { useLLM: false });
  const am = (contract.supportedStack || {}).authMethods || {};
  t.ok('contract: MFA requested -> authMethods.mfa', am.mfa === true);
  t.ok('contract: social login requested -> authMethods.oauth', am.oauth === true);
  t.ok('contract: passkeys requested -> authMethods.passkeys', am.passkeys === true);
  t.ok('contract: an IDOR security statement is recorded',
    (contract.security || []).some((s) => /only.*their own rows|IDOR/i.test(s.statement)));

  // ---- 2. generate the app + write it to disk ----
  const spec = win.Engine.Scaffold.specFromContract(contract);
  const files = win.Engine.Scaffold.generate(spec);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'authz-'));
  try {
    for (const f of files) {
      const abs = path.join(root, f.path.replace(/^\//, ''));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, typeof f.content === 'string' ? f.content : String(f.content));
    }
    const authSrc = fs.readFileSync(path.join(root, 'src', 'auth.js'), 'utf8');
    t.ok('auth.js: TOTP verification generated', /function totpVerify\(/.test(authSrc));
    t.ok('auth.js: OAuth Authorization-Code + PKCE generated', /code_challenge_method.*S256|S256/.test(authSrc) && /OAUTH_PROVIDERS/.test(authSrc));
    t.ok('auth.js: WebAuthn assertion verification generated', /crypto\.verify\(/.test(authSrc) && /cborDecode/.test(authSrc));
    t.ok('auth.js: OAuth client secrets come from env only, never persisted',
      /process\.env\['OAUTH_' \+ provider/.test(authSrc) && !/db\.\w+\([^)]*client_secret/.test(authSrc));

    const AUTH_INTERNAL = ['user', 'session', 'job', 'webauthn_credential'];
    const owned = spec.entities.find((e) => AUTH_INTERNAL.indexOf(e.name) < 0);
    const table = win.Engine.Schema.normalizeSpec(spec).entities.find((e) => e.name === owned.name).table || (owned.name + 's');

    // ---- 3. boot the generated server + run the attacks ----
    const drv = `
      'use strict';
      process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'authz-run-' + process.pid);
      process.env.LOG = 'silent';
      const test = require('node:test'); const assert = require('node:assert');
      const db = require('./src/db'); const auth = require('./src/auth'); const { server } = require('./server');
      const B = () => 'http://localhost:' + server.address().port;
      const j = (p, o) => fetch(B() + p, o).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null), redirect: r.headers.get('location') }));
      const asUser = (tok) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + tok });

      test('authorization attack surface', async () => {
        await db.reset(); await db.migrate();
        await new Promise((r) => server.listen(0, r));
        try {
          const A = (await j('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@x.co', password: 'password123' }) })).j;
          const Bb = (await j('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bob@x.co', password: 'password123' }) })).j;
          assert.ok(A.token && Bb.token, 'both users registered');

          const made = await j('/api/${table}', { method: 'POST', headers: asUser(A.token), body: JSON.stringify(${JSON.stringify(sampleRow(owned))}) });
          assert.equal(made.s, 201, 'A creates a row');
          const rowId = made.j.id;

          // IDOR: B reads A's row by id
          const bRead = await j('/api/${table}/' + rowId, { headers: asUser(Bb.token) });
          assert.equal(bRead.s, 403, 'IDOR blocked: B cannot GET A\\'s row by id (got ' + bRead.s + ')');

          // missing auth: anonymous reads A's row by id
          const anonRead = await j('/api/${table}/' + rowId, {});
          assert.equal(anonRead.s, 401, 'anonymous GET-by-id on an owned row -> 401 (got ' + anonRead.s + ')');

          // IDOR: B lists — must not see A's row
          const bList = await j('/api/${table}', { headers: asUser(Bb.token) });
          assert.equal(bList.s, 200);
          assert.equal((bList.j.rows || []).length, 0, 'B\\'s listing does not leak A\\'s rows');

          // missing auth: anonymous list of an owned resource
          const anonList = await j('/api/${table}', {});
          assert.equal(anonList.s, 401, 'anonymous list of an owned resource -> 401 (got ' + anonList.s + ')');

          // IDOR: B modifies / deletes A's row
          const bPut = await j('/api/${table}/' + rowId, { method: 'PUT', headers: asUser(Bb.token), body: JSON.stringify({}) });
          assert.equal(bPut.s, 403, 'IDOR blocked: B cannot modify A\\'s row');
          const bDel = await j('/api/${table}/' + rowId, { method: 'DELETE', headers: asUser(Bb.token) });
          assert.equal(bDel.s, 403, 'IDOR blocked: B cannot delete A\\'s row');

          // forged token
          const forged = await j('/api/auth/me', { headers: asUser('deadbeef'.repeat(6)) });
          assert.ok(!forged.j.user, 'a forged bearer token resolves to no user');

          // A still owns + can read its row
          const aRead = await j('/api/${table}/' + rowId, { headers: asUser(A.token) });
          assert.equal(aRead.s, 200, 'A can still read its own row');

          // ---- MFA (TOTP) ----
          const setup = await j('/api/auth/mfa/setup', { method: 'POST', headers: asUser(A.token) });
          assert.equal(setup.s, 200); assert.match(setup.j.secret, /^[A-Z2-7]{16,}$/);
          const code = auth.totp(setup.j.secret);
          const enable = await j('/api/auth/mfa/enable', { method: 'POST', headers: asUser(A.token), body: JSON.stringify({ code }) });
          assert.equal(enable.s, 200); assert.ok(Array.isArray(enable.j.backupCodes) && enable.j.backupCodes.length === 8, 'backup codes issued');
          const noCode = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@x.co', password: 'password123' }) });
          assert.equal(noCode.s, 401); assert.equal(noCode.j.code, 'MFA_REQUIRED', 'login without a code -> MFA_REQUIRED');
          const badCode = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@x.co', password: 'password123', code: '000000' }) });
          assert.equal(badCode.s, 401, 'a wrong TOTP code is rejected');
          const goodCode = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@x.co', password: 'password123', code: auth.totp(setup.j.secret) }) });
          assert.equal(goodCode.s, 200); assert.ok(goodCode.j.token, 'a valid TOTP code completes login');

          // ---- OAuth: credential-gated ----
          const oa = await j('/api/auth/oauth/google');
          assert.equal(oa.s, 501, 'OAuth with no configured secret -> 501');
          assert.ok((oa.j.need || []).join(' ').includes('OAUTH_GOOGLE_CLIENT_ID'), 'the 501 names the exact env var');
          const oaState = { verifier: 'x', provider: 'google', at: Date.now() };
          const badCb = await j('/api/auth/oauth/google/callback?code=x&state=nope');
          assert.ok(badCb.s === 501 || badCb.s === 400, 'a callback with a bad state is rejected');

          // ---- passkeys ----
          const pkOpts = await j('/api/auth/webauthn/login/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@x.co' }) });
          assert.equal(pkOpts.s, 200);
          assert.deepEqual(pkOpts.j.allowCredentials, [], 'no passkeys for an unknown email');
          assert.ok(typeof pkOpts.j.challenge === 'string' && pkOpts.j.challenge.length > 20, 'a real challenge is issued');

          // the bundled CBOR decoder reads a WebAuthn-shaped map: {1: 2, "a": [1,2]} -> a2 01 02 61 61 82 01 02
          const d2 = auth.cborDecode(Buffer.from('a201026161820102', 'hex'));
          assert.ok(d2 instanceof Map && d2.get(1) === 2 && Array.isArray(d2.get('a')) && d2.get('a')[1] === 2, 'CBOR decoder reads maps/ints/arrays');

          console.log('AUTHZ_ALL_PASS');
        } finally {
          await new Promise((r) => server.close(r));
        }
      });
    `;
    fs.writeFileSync(path.join(root, 'authz-driver.test.js'), drv);

    if (fs.existsSync(path.join(root, 'scripts', 'migrate.js'))) {
      try { cp.execFileSync('node', ['scripts/migrate.js'], { cwd: root, stdio: 'pipe', timeout: 20000 }); } catch (_) {}
    }
    const r = cp.spawnSync('node', ['--test', 'authz-driver.test.js'], { cwd: root, encoding: 'utf8', timeout: 60000 });
    const out = (r.stdout || '') + (r.stderr || '');
    t.ok('generated app: every authorization attack is blocked + MFA/OAuth/passkey paths work',
      /AUTHZ_ALL_PASS/.test(out) && r.status === 0);
    if (!/AUTHZ_ALL_PASS/.test(out)) process.stdout.write(out.split('\n').filter((l) => /not ok|Error|assert|fail|AssertionError/i.test(l)).slice(0, 30).join('\n') + '\n');
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
};

function sampleRow(entity) {
  const o = {};
  for (const f of entity.fields || []) {
    if (f.type === 'ref' && f.ref === 'user') continue;         // owner is set server-side
    if (f.name === 'id' || f.name === 'createdAt') continue;
    o[f.name] = f.type === 'int' || f.type === 'float' ? 3
      : f.type === 'bool' ? false
      : f.type === 'timestamp' ? new Date().toISOString()
      : 'sample ' + f.name;
  }
  return o;
}
