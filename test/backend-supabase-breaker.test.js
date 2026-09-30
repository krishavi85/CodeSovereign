'use strict';
/* backend.js's optional Supabase sync goes through one choke point, _supa(),
 * reached via the public Backend.ping() health check (and project sync).
 * Confirmed live: the configured project host stopped resolving
 * (ERR_NAME_NOT_RESOLVED) and every ping kept re-hitting it — a console error
 * and a wasted request each time. A network-level failure must trip a
 * cooldown; an HTTP error from a LIVE host must not.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Cloud sync is opt-in now; these breaker tests run against a configured project.
const CFG = JSON.stringify({ url: 'https://example-ref.supabase.co', anonKey: 'sb_publishable_test' });
function load(fetchImpl, opts) {
  const store = (opts && opts.unconfigured) ? {} : { 'cs.supabase.config': CFG };
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    fetch: fetchImpl
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext('var __now = Date.now(); Date.now = function () { return __now; };', ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'backend.js'), 'utf8'), ctx, { filename: 'backend.js' });
  return { win, advance: (ms) => vm.runInContext('__now += ' + ms, ctx) };
}
// ping() probes Supabase in the background — let that settle
const settle = () => new Promise((r) => setTimeout(r, 20));

module.exports = async function (t) {
  {
    let calls = 0;
    const { win, advance } = load(async () => { calls++; throw new TypeError('Failed to fetch'); });
    const info = await win.Backend.ping();
    await settle();
    t.ok('ping() never throws when the cloud host is unreachable', info && info.ok === true);
    t.equal('the status says unreachable, not a vague "no table"', info.supabase.reason, 'unreachable');
    await win.Backend.ping(); await settle();
    await win.Backend.ping(); await settle();
    t.equal('after one network failure, later pings skip the dead host entirely', calls, 1);
    advance(5 * 60 * 1000 + 1);
    await win.Backend.ping(); await settle();
    t.equal('after the cooldown it tries the host again (connectivity may be back)', calls, 2);
  }
  {
    let calls = 0;
    const { win } = load(async () => { calls++; return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' }; });
    await win.Backend.ping(); await settle();
    await win.Backend.ping(); await settle();
    t.equal('an HTTP error from a LIVE host does not trip the breaker', calls, 2);
  }
  {
    const { win } = load(async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ([{ id: 1 }]), text: async () => '' }));
    const info = await win.Backend.ping(); await settle();
    t.ok('a healthy host still reports online', info.supabase.online === true && info.supabase.reason === 'ok');
  }
  {
    // app.js pings twice at startup, back to back. Both used to reach the
    // dead host (two requests, two console errors) because neither had failed
    // yet when the other started.
    let calls = 0;
    const { win } = load(() => { calls++; return new Promise((_res, rej) => setTimeout(() => rej(new TypeError('Failed to fetch')), 10)); });
    await Promise.all([win.Backend.ping(), win.Backend.ping()]);
    await settle(); await settle();
    t.equal('two concurrent startup pings share one request to the host', calls, 1);
  }
  {
    // Not configured (the default): no request at all, and an honest status.
    let calls = 0;
    const { win } = load(async () => { calls++; throw new TypeError('Failed to fetch'); }, { unconfigured: true });
    const info = await win.Backend.ping(); await settle();
    t.equal('unconfigured: no request is sent to any host', calls, 0);
    t.equal('unconfigured: status says not-configured', info.supabase.reason, 'not-configured');
    t.equal('unconfigured: SUPABASE_URL is null (marketplace/ratings stay local)', win.Backend.SUPABASE_URL, null);
    t.ok('the status object is exported for Settings (was always "not-checked")', win.Backend._supabase && win.Backend._supabase.reason === 'not-configured');

    t.ok('configure: rejects a non-supabase.co URL (the CSP would block it)', win.Backend.configureSupabase('https://evil.example.com', 'k').ok === false);
    t.ok('configure: rejects a missing key', win.Backend.configureSupabase('https://abc.supabase.co', '').ok === false);
    t.ok('configure: accepts a project URL + key (trailing slash trimmed)', win.Backend.configureSupabase('https://abc.supabase.co/', 'sb_publishable_x').ok === true);
    t.equal('configure: SUPABASE_URL reflects the saved project', win.Backend.SUPABASE_URL, 'https://abc.supabase.co');
    t.ok('configure: persisted to localStorage', /abc.supabase.co/.test(win.localStorage.getItem('cs.supabase.config') || ''));
    await win.Backend.checkSupabase();
    t.equal('configured: the next check actually contacts the project', calls, 1);
    t.ok('disconnect: clears the project', win.Backend.configureSupabase('', '').ok === true && win.Backend.SUPABASE_URL === null && win.localStorage.getItem('cs.supabase.config') === null);
  }
};
