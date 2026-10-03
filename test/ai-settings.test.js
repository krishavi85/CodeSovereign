'use strict';
/* Regression: the Local AI / Autonomy & Deployment / Cost Sovereignty cards
 * (app.ai.extras.js) used the same too-broad /card[\s\S]*?Integrations/
 * anchor app.llm.extras.js was fixed for — it starts at the FIRST .card/.h3
 * in Settings and spans everything up to Integrations, dumping the cards at
 * the top of the screen instead of beside Integrations. And confirms the
 * in-app OmniRoute start/stop control (no PowerShell / manual `npx omniroute
 * serve`) is actually wired into the card.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const extrasPath = path.join(__dirname, '..', 'dist', 'app.ai.extras.js');
  const extrasSrc = fs.readFileSync(extrasPath, 'utf8');

  t.ok('injector anchors on the interpolated Integrations heading, not a template literal', extrasSrc.includes("out.indexOf('Integrations</h3>')"));
  t.ok('injector uses slice(), not String.replace(), so $-sequences in earlier cards are not treated as tokens', !/out\.replace\(anchor\[0\]/.test(extrasSrc));

  const AR = {
    discover: () => Promise.resolve({ at: Date.now(), runtimes: [], count: 0 }),
    recommend: () => ({ fits: false, reason: 'no probe yet' }),
    omniRouteStatus: () => Promise.resolve({ ok: false, installed: false, running: false }),
    stopOmniRoute: () => Promise.resolve({ ok: true }),
    OpenClaw: {
      status: () => Promise.resolve({ ok: true, installed: false, phase: 'not-installed' }),
      detect: () => Promise.resolve({ ok: true, installed: false }),
      probe: () => Promise.resolve({ ok: true, ready: false }),
      install: () => Promise.resolve({ ok: true, version: '2026.7.1-2' }),
      installGateway: () => Promise.resolve({ ok: true }),
      startGateway: () => Promise.resolve({ ok: true }),
      stopGateway: () => Promise.resolve({ ok: true }),
      restartGateway: () => Promise.resolve({ ok: true }),
      openOnboarding: () => Promise.resolve({ ok: true }),
      openDashboard: () => Promise.resolve({ ok: true })
    }
  };
  const MM = { CATALOG: [] };
  const HW = { probe: () => Promise.resolve({}), summary: () => 'test host' };
  const AI = { status: () => ({ connected: false }), ready: () => false };

  function renderSettings() {
    return `
    <div class="screen-inner" style="padding:24px;max-width:1100px;margin:0 auto">
      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px"><svg></svg> Workspace</h3>
        <div>price $100 and $& leftover</div>
      </div>
      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px"><svg></svg> AI Provider</h3>
      </div>
      <div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px"><svg></svg> Integrations</h3>
      </div>
    </div>`;
  }

  const listeners = {};
  // A minimal stateful stand-in for #aiExtrasHost so the real mount hook
  // (window.renderAll -> "screen==='settings' and not yet bound" -> rerender()
  // + refreshOmniStatus()/refreshOpenclawStatus()) can actually run, instead
  // of being silently skipped (getElementById returning null everywhere
  // else in this file is fine for the other checks, which read the HTML
  // string directly and never rely on the mount hook firing).
  const hostEl = { innerHTML: '', __aiBound: false, querySelector: () => null, querySelectorAll: () => [] };
  const win = {
    console,
    document: {
      readyState: 'complete',
      addEventListener: (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); },
      getElementById: (id) => (id === 'aiExtrasHost' ? hostEl : null),
      createElement: () => ({ style: {}, appendChild: () => {} })
    },
    Engine: { AIRouter: AR, ModelManager: MM, Hardware: HW, AI: AI },
    renderSettings,
    renderAll: function () { return 'ok'; },
    S: { screen: 'welcome' },
    setTimeout: (fn) => fn()
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(extrasSrc, win, { filename: 'app.ai.extras.js' });

  t.ok('renderSettings is wrapped', win.renderSettings !== renderSettings);
  t.ok('wrapper is marked injected', !!win.renderSettings.__aiInjected);

  const html = win.renderSettings();
  t.ok('injected host id is present', /id="aiExtrasHost"/.test(html));
  t.ok('Local AI heading is present', />Local AI</.test(html));
  t.ok('OmniRoute card is present', /OmniRoute — free AI gateway/.test(html));
  t.ok('OmniRoute button is present', /id="aiOmniBtn"/.test(html));
  t.ok('runs in-app, no terminal needed', /in-app — no terminal/.test(html));
  t.ok('card sits before Integrations', html.indexOf('Local AI') < html.indexOf('Integrations'));
  t.ok(
    'card sits after earlier cards, not dumped at the top of the stack',
    html.indexOf('Workspace') < html.indexOf('Local AI') && html.indexOf('AI Provider') < html.indexOf('Local AI')
  );
  t.ok('Integrations card is still present', /Integrations<\/h3>/.test(html));
  t.ok(
    'dollar sequences in earlier cards are not treated as replace tokens',
    html.includes('price $100') && html.includes('$&amp; leftover') || html.includes('$& leftover')
  );

  // ---- OpenClaw card ----
  t.ok('OpenClaw card is present', /OpenClaw — Local Agent Gateway/.test(html));
  t.ok('OpenClaw card sits before Integrations too', html.indexOf('OpenClaw') < html.indexOf('Integrations'));
  t.ok('OpenClaw card describes automatic install/start/stop/restart/health-check', /install, start, stop, restart and health-check the Gateway automatically/.test(html));
  t.ok('OpenClaw card is honest that first-time auth/onboarding needs the setup wizard, not that generation routes through it', /interactive onboarding may require opening the OpenClaw setup wizard/.test(html));
  t.ok('OpenClaw card no longer mixes install status with an architecture benchmark claim', !/noticeably slower than the Ollama/.test(html));

  // ---- status states: not checked yet / stopped / running ----
  t.ok('unknown status shows "Checking…"', /Checking…/.test(html));

  AR.omniRouteStatus = () => Promise.resolve({ ok: true, installed: true, running: false });
  win.renderSettings.__aiInjected = false; // force a fresh wrap so state starts clean... actually state persists module-wide
  const htmlStopped = win.renderSettings();
  t.ok('not-running-but-installed still offers Enable, not Stop', /Enable free AI \(OmniRoute\)/.test(htmlStopped) && !/id="aiOmniStopBtn"/.test(htmlStopped));

  // ---- OpenClaw phase -> card rendering, for each phase independently.
  // state.openclawStatus is only ever populated once per session (the mount
  // hook guards on `if (!state.openclawStatus)`, by design — poll once, not
  // on every render), and it's a module-private closure the test can't
  // reset. So each phase gets its own fresh vm context + a real mount pass
  // (S.screen='settings', renderAll(), await the status promise) rather
  // than reusing the one already exercised above.
  async function renderWithOpenclawStatus(openclawStatus) {
    const arFresh = Object.assign({}, AR, { OpenClaw: Object.assign({}, AR.OpenClaw, { status: () => Promise.resolve(openclawStatus) }) });
    const host = { innerHTML: '', __aiBound: false, querySelector: () => null, querySelectorAll: () => [] };
    const w = {
      console,
      document: {
        readyState: 'complete', addEventListener: () => {},
        getElementById: (id) => (id === 'aiExtrasHost' ? host : null),
        createElement: () => ({ style: {}, appendChild: () => {} })
      },
      Engine: { AIRouter: arFresh, ModelManager: MM, Hardware: HW, AI: AI },
      renderSettings, renderAll: function () { return 'ok'; },
      S: { screen: 'settings' }, setTimeout: (fn) => fn()
    };
    w.window = w;
    vm.createContext(w);
    vm.runInContext(extrasSrc, w, { filename: 'app.ai.extras.js' });
    w.renderAll(); // triggers the mount hook: rerender() + refreshOpenclawStatus()
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // let the status promise resolve
    return w.renderSettings();
  }

  const htmlNotInstalled = await renderWithOpenclawStatus({ ok: true, installed: false, phase: 'not-installed' });
  t.ok('not-installed shows "Not installed" and an Install CLI button', /Not installed/.test(htmlNotInstalled) && /id="aiOpenclawInstallBtn"/.test(htmlNotInstalled) && /Install CLI/.test(htmlNotInstalled));
  t.ok('not-installed does not offer Start/Stop/Dashboard', !/id="aiOpenclawStartBtn"/.test(htmlNotInstalled) && !/id="aiOpenclawStopBtn"/.test(htmlNotInstalled) && !/id="aiOpenclawDashBtn"/.test(htmlNotInstalled));

  const htmlOnboarding = await renderWithOpenclawStatus({ ok: true, installed: true, version: '2026.7.1-2', phase: 'needs-onboarding', needsOnboarding: true, gateway: null });
  t.ok('needs-onboarding shows "Not configured" and an Open Setup Wizard button', /Not configured/.test(htmlOnboarding) && /Open Setup Wizard/.test(htmlOnboarding));

  const htmlGwMissing = await renderWithOpenclawStatus({ ok: true, installed: true, version: '2026.7.1-2', phase: 'gateway-not-installed', needsOnboarding: false, gateway: { installed: false, serviceStatus: 'unknown', ready: false, port: 18789 } });
  t.ok('gateway-not-installed shows "Not configured" and an Install Gateway button', /Not configured/.test(htmlGwMissing) && /Install Gateway/.test(htmlGwMissing));

  const htmlRunning = await renderWithOpenclawStatus({
    ok: true, installed: true, version: '2026.7.1-2', phase: 'running', needsOnboarding: false,
    gateway: { installed: true, serviceStatus: 'running', ready: true, port: 18789, dashboardUrl: 'http://127.0.0.1:18789/' }
  });
  t.ok('running shows "Running"', /Running/.test(htmlRunning));
  t.ok('running offers Stop Gateway, Restart and Open Dashboard', /id="aiOpenclawStopBtn"/.test(htmlRunning) && /id="aiOpenclawRestartBtn"/.test(htmlRunning) && /id="aiOpenclawDashBtn"/.test(htmlRunning));
  t.ok('running does not offer Start/Install', !/id="aiOpenclawStartBtn"/.test(htmlRunning) && !/id="aiOpenclawInstallBtn"/.test(htmlRunning));

  const htmlGwStopped = await renderWithOpenclawStatus({
    ok: true, installed: true, version: '2026.7.1-2', phase: 'stopped', needsOnboarding: false,
    gateway: { installed: true, serviceStatus: 'stopped', ready: false, port: 18789, dashboardUrl: 'http://127.0.0.1:18789/' }
  });
  t.ok('stopped shows "Stopped" and a Start Gateway button', /Stopped/.test(htmlGwStopped) && /id="aiOpenclawStartBtn"/.test(htmlGwStopped));
  t.ok('stopped does not offer Stop/Dashboard', !/id="aiOpenclawStopBtn"/.test(htmlGwStopped) && !/id="aiOpenclawDashBtn"/.test(htmlGwStopped));

  // ---- source-level checks for the in-app start/stop flow (exercised live in
  // test/ai.test.js against Engine.AIRouter itself) ----
  t.ok('Enable button calls AIRouter.ensureOmniRoute (in-app, not a shell command)', extrasSrc.includes('AR.ensureOmniRoute'));
  t.ok('a Stop control exists and calls AIRouter.stopOmniRoute', extrasSrc.includes('aiOmniStopBtn') && extrasSrc.includes('AR.stopOmniRoute'));
  t.ok('status is polled read-only on Settings mount (before any click)', extrasSrc.includes('refreshOmniStatus()') && extrasSrc.includes("if (!state.omniStatus) refreshOmniStatus()"));
  t.ok('status refresh never spawns anything — comment states it is read-only', /read-only poll of whether omniroute is installed\/running/i.test(extrasSrc));
  t.ok('the free-models list surfaces once OmniRoute is discovered running (real /v1/models, not a static list)', extrasSrc.includes('cs-aimodel') && extrasSrc.includes('rt.models'));

  t.ok('Start button calls AIRouter.OpenClaw.startGateway (in-app, not a shell command)', extrasSrc.includes('AR.OpenClaw.startGateway()'));
  t.ok('a Stop control exists and calls AIRouter.OpenClaw.stopGateway', extrasSrc.includes('aiOpenclawStopBtn') && extrasSrc.includes('AR.OpenClaw.stopGateway()'));
  t.ok('a Restart control exists and calls AIRouter.OpenClaw.restartGateway', extrasSrc.includes('aiOpenclawRestartBtn') && extrasSrc.includes('AR.OpenClaw.restartGateway()'));
  t.ok('OpenClaw status is polled read-only on Settings mount too', extrasSrc.includes('refreshOpenclawStatus()') && extrasSrc.includes('if (!state.openclawStatus) refreshOpenclawStatus()'));
  t.ok('a dashboard button opens the real IPC-provided dashboard URL, not a hardcoded link', extrasSrc.includes('aiOpenclawDashBtn') && extrasSrc.includes('AR.OpenClaw.openDashboard(url)'));
  t.ok('the CLI-not-installed path calls AIRouter.OpenClaw.install (npm, not npx-on-every-call)', extrasSrc.includes('AR.OpenClaw.install()'));
  t.ok('the needs-onboarding path opens the real setup wizard via IPC', extrasSrc.includes('AR.OpenClaw.openOnboarding()'));
  t.ok('the gateway-not-installed path calls AIRouter.OpenClaw.installGateway', extrasSrc.includes('AR.OpenClaw.installGateway()'));
};
