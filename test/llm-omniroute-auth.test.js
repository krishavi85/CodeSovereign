'use strict';
/* Live-tested finding: a real, already-configured OmniRoute instance (set up
 * with real provider connections) rejects its HTTP API without a genuine key
 * — the old `Authorization: Bearer omniroute` placeholder is not a working
 * token (the real server returns 401 "Invalid API key" for it, same as no
 * header at all). This locks in the fix: no fake placeholder is ever sent,
 * and a 401 against OmniRoute surfaces a specific, actionable hint pointing
 * at its dashboard instead of a generic auth error.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  const requests = [];
  const win = {
    console,
    // a real setTimeout would let this file's unrelated background Settings-
    // patch polling (document.readyState === 'complete' -> retry loop) keep
    // scheduling real timers for the life of the process; no-op it instead —
    // chat()/testConnection() below never depend on a timer firing.
    setTimeout: () => 0, clearTimeout: () => {},
    document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }) },
    localStorage: { _d: {}, getItem(k) { return this._d[k] != null ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    fetch: (url, init) => {
      requests.push({ url, init });
      return Promise.resolve({
        ok: false, status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key', code: 'invalid_api_key' } }))
      });
    }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'engine.llm.js' });
  return { win, requests };
}

module.exports = async function (t) {
  // ---- chat() against OmniRoute, no key configured ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({ providerId: 'omniroute', enabled: true, apiKey: '', model: 'auto' });
    let threw = null;
    try { await win.Engine.LLM.chat('hello'); } catch (e) { threw = e; }
    t.ok('chat() against an unauthenticated OmniRoute throws', !!threw);
    t.ok('...naming the dashboard as the fix', /dashboard/.test(String(threw && threw.message)));
    t.equal('exactly one request was made', requests.length, 1);
    const hdrs = requests[0].init.headers || {};
    t.ok('no fake placeholder token is sent when no key is configured', !('Authorization' in hdrs) || !/omniroute/i.test(hdrs.Authorization || ''));
  }

  // ---- chat() against OmniRoute WITH a real key configured ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({ providerId: 'omniroute', enabled: true, apiKey: 'or_live_realkey123', model: 'auto' });
    try { await win.Engine.LLM.chat('hello'); } catch (_) { /* the stub still 401s; we only care what was sent */ }
    t.equal('the configured key is sent as a real Bearer token', requests[0].init.headers.Authorization, 'Bearer or_live_realkey123');
  }

  // ---- testConnection() 401 hint is OmniRoute-specific, not the generic
  // isLocalEndpoint(...) LM-Studio hint (omniroute is not flagged `local`) ----
  {
    const { win } = env();
    win.Engine.LLM.setConfig({ providerId: 'omniroute', enabled: true, apiKey: '', model: 'auto' });
    const res = await win.Engine.LLM.testConnection();
    t.equal('testConnection reports the 401', res.status, 401);
    t.ok('hint points at the OmniRoute dashboard', /dashboard/.test(res.hint || ''));
    t.ok('hint names the base URL', res.hint.includes('http://localhost:20128'));
    t.ok('hint is not the generic LM Studio wording', !/LM Studio/.test(res.hint));
  }

  // ---- provider metadata no longer over-promises ----
  {
    const { win } = env();
    const p = win.Engine.LLM.providerById('omniroute');
    t.ok('label no longer unconditionally claims "no key"', !/no key\)/i.test(p.label));
    t.ok('notes explain the dashboard key requirement for a configured instance', /dashboard/.test(p.notes));
  }
};
