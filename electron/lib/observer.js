'use strict';
/*
 * observer.js — drives the project's RUNNING app in a hidden BrowserWindow,
 * captures console / errors / network / navigation, and crawls the interactive
 * controls recording an event-to-effect trace for each.
 *
 * URL policy: only http(s)://localhost|127.0.0.1|[::1] and file:// under the
 * open workspace. The renderer cannot point this at an arbitrary site.
 */
const { BrowserWindow, session } = require('electron');
const path = require('path');
const url = require('url');
const workspace = require('./workspace');

let obsWin = null;
const OBS_PARTITION = 'observer-ephemeral';   // no `persist:` prefix -> in-memory only
const actionLog = [];                          // everything the observer did this run

// Controls whose activation could mutate data / spend money / send a message.
// Skipped in observe mode; require confirmation in interactive mode.
const DESTRUCTIVE = /\b(delete|remove|destroy|drop|erase|wipe|purge|deactivate|disable|revoke|cancel subscription|unsubscribe|pay|buy|purchase|checkout|order|charge|withdraw|transfer|send|submit|publish|deploy|release|confirm|approve|invite|share|archive)\b/i;
const MUTATING_TAGS = new Set(['form']);

function assertAllowedUrl(target) {
  let u;
  try { u = new url.URL(target); } catch { throw new Error('Invalid URL'); }
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return target;
    throw new Error('Observer only allows localhost URLs (got ' + h + ')');
  }
  if (u.protocol === 'file:') {
    const root = workspace.getRoot();
    if (!root) throw new Error('No workspace open');
    const p = decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
    const real = path.resolve(p);
    const rel = path.relative(root, real);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('file:// URL escapes the workspace');
    return target;
  }
  throw new Error('Unsupported protocol: ' + u.protocol);
}

function ensureWin() {
  if (obsWin && !obsWin.isDestroyed()) return obsWin;
  const ses = session.fromPartition(OBS_PARTITION);
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (e) => e.preventDefault());
  // block ALL third-party requests — the observed app may only talk to loopback
  ses.webRequest.onBeforeRequest((details, cb) => {
    try {
      const u = new url.URL(details.url);
      const okHost = u.protocol === 'file:' || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
      if (!okHost && !/^(devtools|about|blob|data):/.test(details.url)) {
        actionLog.push({ t: Date.now(), kind: 'blocked-request', url: details.url.slice(0, 200) });
        return cb({ cancel: true });
      }
    } catch { /* fall through */ }
    cb({ cancel: false });
  });

  obsWin = new BrowserWindow({
    show: false,
    width: 1280, height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'observer-preload.js'),
      // The instrumentation must wrap the PAGE's own console/fetch, so it runs
      // in the main world. Node stays off; this window only ever loads the
      // localhost dev content the user is already running. It uses its OWN
      // preload and an ephemeral partition — the normal window.desktop bridge
      // and the app's stored credentials are never present here.
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      partition: OBS_PARTITION,
      webSecurity: true,
      images: true, webgl: false, plugins: false
    }
  });
  obsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const navGuard = (e, targetUrl) => {
    try { assertAllowedUrl(targetUrl); }
    catch { e.preventDefault(); actionLog.push({ t: Date.now(), kind: 'blocked-navigation', url: String(targetUrl).slice(0, 200) }); }
  };
  obsWin.webContents.on('will-navigate', navGuard);
  obsWin.webContents.on('will-redirect', navGuard);
  obsWin.on('closed', () => { obsWin = null; });
  return obsWin;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(target) {
  assertAllowedUrl(target);
  actionLog.length = 0;
  actionLog.push({ t: Date.now(), kind: 'load', url: target });
  const w = ensureWin();
  await w.loadURL(target);
  await wait(600); // let the app boot
  return { ok: true, url: w.webContents.getURL(), blockedDuringLoad: actionLog.filter((a) => /^blocked-/.test(a.kind)).length };
}

async function read() {
  const w = ensureWin();
  try {
    return await w.webContents.executeJavaScript('window.__obs ? window.__obs.read() : null', true);
  } catch (e) { return { error: String(e.message) }; }
}
async function reset() {
  const w = ensureWin();
  try { await w.webContents.executeJavaScript('window.__obs && window.__obs.reset()', true); } catch { /* ignore */ }
}
async function quietWait(quietMs, capMs) {
  const w = ensureWin();
  try {
    return await w.webContents.executeJavaScript(
      `window.__obs && window.__obs.quiet ? window.__obs.quiet(${quietMs || 250}, ${capMs || 3000}) : null`, true);
  } catch { return null; }
}

async function screenshot() {
  const w = ensureWin();
  try {
    const img = await w.webContents.capturePage();
    return img.toDataURL();
  } catch { return null; }
}

// Enumerate interactive controls and, for each, click it and record what changed.
// mode: 'observe' (default) never activates a destructive-looking control or a
// form; 'interactive' does (the renderer must have confirmed with the user).
async function crawl(opts = {}) {
  const w = ensureWin();
  const max = Math.min(opts.max || 40, 120);
  const mode = opts.mode === 'interactive' ? 'interactive' : 'observe';
  actionLog.push({ t: Date.now(), kind: 'crawl-start', mode, url: w.webContents.getURL() });

  const controls = await w.webContents.executeJavaScript(`(() => {
    const sel = 'button, a[href], [role="button"], input[type="submit"], input[type="button"], summary, [data-action], [onclick]';
    const els = Array.from(document.querySelectorAll(sel)).slice(0, ${max});
    return els.map((el, i) => {
      el.setAttribute('data-cs-obs', String(i));
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const form = el.form || el.closest('form');
      return {
        i,
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute('type') || '').toLowerCase(),
        name: (el.getAttribute('aria-label') || el.textContent || el.value || el.id || '').trim().slice(0, 60),
        href: el.getAttribute('href') || null,
        inForm: !!form,
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
        disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        pointerEvents: cs.pointerEvents
      };
    });
  })()`, true);

  const trace = [];
  const allNetwork = [];
  const allErrors = [];
  for (const c of controls) {
    if (!c.visible || c.disabled) {
      trace.push({ control: c, status: c.disabled ? 'DISABLED' : 'HIDDEN', effects: {} });
      continue;
    }
    const risky = DESTRUCTIVE.test(c.name) || c.type === 'submit' || (c.inForm && c.tag === 'button' && c.type !== 'button');
    if (risky && mode === 'observe') {
      actionLog.push({ t: Date.now(), kind: 'skipped-destructive', control: c.name });
      trace.push({ control: c, status: 'SKIPPED', reason: 'destructive/mutating — not activated in observe mode', effects: {} });
      continue;
    }
    actionLog.push({ t: Date.now(), kind: 'activate', control: c.name, risky });
    // Let the previous control's in-flight async (a pending fetch, a debounced
    // render) drain and be discarded before this control's window opens, so an
    // effect is attributed to the control that actually caused it. Wait for the
    // page to actually go quiet (no in-flight fetch, no mutations) rather than a
    // fixed sleep that is too short on a fast host and racy on a slow one.
    await quietWait(250, 3000);
    await reset();
    await wait(120);
    await reset();
    const before = await read();
    let threw = null;
    try {
      await w.webContents.executeJavaScript(`(() => {
        const el = document.querySelector('[data-cs-obs="${c.i}"]');
        if (!el) return 'gone';
        try { el.click(); return 'clicked'; } catch (e) { return 'throw:' + e.message; }
      })()`, true);
    } catch (e) { threw = String(e.message); }

    // A change from ".../x" to ".../x#" (bare hash) is a dead link, not navigation.
    const stripBareHash = (u) => String(u || '').replace(/#$/, '');

    // Poll for a settled effect rather than one fixed sleep — a fetch to a local
    // API can land anywhere from ~20ms to ~1s depending on server warmth.
    let after = await read();
    for (let k = 0; k < 8; k++) {
      const net = (after.network || []).length - (before.network || []).length;
      const dom = (after.mutations || 0) - (before.mutations || 0);
      const errs = (after.errors || []).length - (before.errors || []).length;
      if (net > 0 || dom >= 2 || errs > 0 || stripBareHash(after.url) !== stripBareHash(before.url)) break;
      await wait(150);
      after = await read();
    }
    // if this control kicked off a fetch, wait for it to finish so the effect is
    // measured against the control that caused it, not the next one.
    if ((after.inflight || 0) > 0) { await quietWait(200, 2500); after = await read(); }

    const realNav = stripBareHash(after.url) !== stripBareHash(before.url);

    const effects = {
      consoleErrors: (after.errors || []).length - (before.errors || []).length,
      networkCalls: (after.network || []).length - (before.network || []).length,
      navChanged: realNav,
      domMutations: (after.mutations || 0) - (before.mutations || 0),
      newConsole: (after.console || []).slice((before.console || []).length).slice(0, 5)
    };
    if (process.env.CS_OBS_DEBUG) {
      console.error('[obs] ' + c.name + ' before.net=' + (before.network || []).length + ' after.net=' + (after.network || []).length +
        ' netURLs=' + JSON.stringify((after.network || []).slice((before.network || []).length).map((n) => n.url || n)) +
        ' dom=' + effects.domMutations + ' errs=' + effects.consoleErrors + ' inflight=' + (after.inflight || 0) + ' threw=' + threw);
    }
    const deadHref = !c.href || c.href === '#' || /^javascript:/.test(c.href);
    let status;
    if (threw || effects.consoleErrors > 0) status = 'BROKEN';
    else if (effects.navChanged || effects.networkCalls > 0 || effects.domMutations >= 2) status = 'REAL';
    else if (c.href && !deadHref) status = 'REAL';   // a real link that just didn't SPA-navigate in time
    else status = 'MOCK';

    (after.network || []).forEach((n) => allNetwork.push(n));
    (after.errors || []).forEach((e) => allErrors.push(Object.assign({ afterControl: c.name }, e)));
    trace.push({ control: c, status, effects, threw });
  }

  const summary = await read();
  actionLog.push({ t: Date.now(), kind: 'crawl-end' });
  return {
    at: Date.now(),
    mode,
    url: summary.url, title: summary.title,
    controlsFound: controls.length,
    controlsExercised: trace.filter((t) => t.status !== 'HIDDEN' && t.status !== 'DISABLED' && t.status !== 'SKIPPED').length,
    controlsSkipped: trace.filter((t) => t.status === 'SKIPPED').length,
    byStatus: trace.reduce((m, t) => { m[t.status] = (m[t.status] || 0) + 1; return m; }, {}),
    consoleErrors: allErrors.slice(0, 50),
    network: allNetwork.slice(0, 80),
    blockedRequests: actionLog.filter((a) => a.kind === 'blocked-request' || a.kind === 'blocked-navigation'),
    actionLog: actionLog.slice(),
    trace
  };
}

function stop() {
  if (obsWin && !obsWin.isDestroyed()) obsWin.destroy();
  obsWin = null;
}

module.exports = { load, read, reset, screenshot, crawl, stop, assertAllowedUrl, DESTRUCTIVE };
