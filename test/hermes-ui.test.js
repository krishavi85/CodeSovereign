'use strict';
/* The Hermes Agent steps in Settings -> Agents (dist/app.js): a failed status check must not freeze the row, and a
 * re-created API key must reach a gateway that is already running. The functions are lifted out of app.js and run
 * against a scripted desktop bridge. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(bridge) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  const a = src.indexOf('function hermesDesktop()');
  const b = src.indexOf('function setHermesAgentField(');
  if (a < 0 || b < 0) throw new Error('hermes UI functions not found');
  const cfgStore = {};
  const toasts = [];
  const sandbox = {
    console, Promise, setTimeout,
    S: {},
    toast: (m) => toasts.push(m),
    renderAll: () => {},
    esc: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    Engine: { LLM: { getConfig: () => cfgStore, setConfig: (p) => Object.assign(cfgStore, p) } },
    window: { desktop: { isDesktop: true, hermes: bridge } }
  };
  sandbox.window.Engine = sandbox.Engine;
  vm.createContext(sandbox);
  vm.runInContext(src.slice(a, b) + '\nthis.__api = { hermesMgrRefresh, hermesMgrAct, renderHermesSteps };', sandbox);
  return { api: sandbox.__api, S: sandbox.S, cfg: cfgStore, toasts };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

module.exports = async function (t) {
  /* ---- a failed status check ---- */
  let fail = true;
  const calls = [];
  const bridge = {
    getStatus: async () => (fail ? { ok: false, error: 'IPC handler failed' } : { ok: true, installed: false, version: null, gatewayRunning: false, api: { reachable: false, ok: false }, installCommand: 'iex (irm …)' }),
    install: async () => { calls.push('install'); return { ok: true, version: '1.0.0' }; },
    setupApiServer: async () => { calls.push('api'); return { ok: true, key: 'newkey1234567890', gatewayWasRunning: false }; },
    stopGateway: async () => { calls.push('stop'); return { ok: true }; },
    startGateway: async (k) => { calls.push('start:' + k); return { ok: true, ready: true }; },
    openSetup: async () => ({ ok: true }), openDownloadPage: async () => ({ ok: true })
  };
  let { api, S, cfg } = load(bridge);
  let html = api.renderHermesSteps(cfg);
  await tick();
  html = api.renderHermesSteps(cfg);
  t.ok('a status check that fails shows why instead of "checking…" forever', /could not check \(IPC handler failed\)/.test(html) && !/checking…/.test(html));
  t.ok('the Install button is still enabled (the user is not locked out by a failed check)', !/disabled[^>]*onclick="hermesMgrAct\('install'\)"/.test(html) && /hermesMgrAct\('install'\)/.test(html));
  t.ok('and a "Check again" button is offered', /hermesMgrAct\('recheck'\)/.test(html));
  t.ok('the failed check is not retried in a loop by rendering', calls.length === 0 && S.hermesMgr.asked === true);
  fail = false;
  api.hermesMgrAct('recheck');
  await tick();
  html = api.renderHermesSteps(cfg);
  t.ok('Check again recovers once the status works: it now says not found, with the normal Install button', /not found on this computer/.test(html) && !/could not check/.test(html));

  /* ---- re-creating the key with a gateway that is running ---- */
  const calls2 = [];
  const bridge2 = {
    getStatus: async () => ({ ok: true, installed: true, version: '1.0.0', gatewayRunning: true, api: { reachable: true, ok: true }, installCommand: 'x' }),
    setupApiServer: async () => { calls2.push('api'); return { ok: true, key: 'rotatedkey0987654321', gatewayWasRunning: true }; },
    stopGateway: async () => { calls2.push('stop'); return { ok: true }; },
    startGateway: async (k) => { calls2.push('start:' + k); return { ok: true, ready: true }; },
    install: async () => ({ ok: true }), openSetup: async () => ({ ok: true }), openDownloadPage: async () => ({ ok: true })
  };
  const L2 = load(bridge2);
  L2.cfg.hermesAgentKey = 'oldkey';
  L2.api.renderHermesSteps(L2.cfg); await tick();
  L2.api.hermesMgrAct('api'); await tick(); await tick();
  t.ok('the new key is saved', L2.cfg.hermesAgentKey === 'rotatedkey0987654321');
  t.deepEqual('the running gateway is stopped and started again with the NEW key', calls2, ['api', 'stop', 'start:rotatedkey0987654321']);
  t.ok('and the user is told it was restarted', L2.toasts.some((m) => /restarted with it/.test(m)));

  /* ---- the old gateway cannot be stopped: no second one is started ---- */
  const calls4 = [];
  const bridge4 = Object.assign({}, bridge2, { setupApiServer: async () => { calls4.push('api'); return { ok: true, key: 'k4key123456789', gatewayWasRunning: true }; }, stopGateway: async () => { calls4.push('stop'); return { ok: false, wasRunning: true, error: 'The Hermes gateway did not exit after being stopped.' }; }, startGateway: async () => { calls4.push('start'); return { ok: true, ready: true }; } });
  const L4 = load(bridge4);
  L4.api.renderHermesSteps(L4.cfg); await tick();
  L4.api.hermesMgrAct('api'); await tick(); await tick();
  t.deepEqual('a stop that fails means no start (never a second gateway on a held port)', calls4, ['api', 'stop']);
  t.ok('and the user is told, with the reason', L4.toasts.some((m) => /could not be stopped/.test(m) && /did not exit/.test(m)));

  /* ---- no gateway of ours running: the user is told to restart one they started themselves ---- */
  const calls3 = [];
  const bridge3 = Object.assign({}, bridge2, { setupApiServer: async () => { calls3.push('api'); return { ok: true, key: 'freshkey12345678', gatewayWasRunning: false }; }, stopGateway: async () => { calls3.push('stop'); return { ok: true }; }, startGateway: async () => { calls3.push('start'); return { ok: true }; } });
  const L3 = load(bridge3);
  L3.api.renderHermesSteps(L3.cfg); await tick();
  L3.api.hermesMgrAct('api'); await tick(); await tick();
  t.deepEqual('no restart is attempted when the app did not start the gateway', calls3, ['api']);
  t.ok('the message says to restart Hermes if it was started outside the app', L3.toasts.some((m) => /restart it so it uses the new key/.test(m)));
};
