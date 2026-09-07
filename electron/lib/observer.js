'use strict';
/*
 * observer.js — drives the project's RUNNING app in a hidden BrowserWindow,
 * captures console / errors / network / navigation, and crawls the interactive
 * controls recording an event-to-effect trace for each.
 *
 * URL policy: only http(s)://localhost|127.0.0.1|[::1] and file:// under the
 * open workspace. The renderer cannot point this at an arbitrary site.
 */
const { BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const workspace = require('./workspace');

let obsWin = null;

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
  obsWin = new BrowserWindow({
    show: false,
    width: 1280, height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'observer-preload.js'),
      // The instrumentation must wrap the PAGE's own console/fetch, so it runs
      // in the main world. Node stays off; this window only ever loads the
      // localhost dev content the user is already running.
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      partition: 'observer',      // isolate cookies/storage from the app
      webSecurity: true
    }
  });
  obsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  obsWin.on('closed', () => { obsWin = null; });
  return obsWin;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(target) {
  assertAllowedUrl(target);
  const w = ensureWin();
  await w.loadURL(target);
  await wait(600); // let the app boot
  return { ok: true, url: w.webContents.getURL() };
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

async function screenshot() {
  const w = ensureWin();
  try {
    const img = await w.webContents.capturePage();
    return img.toDataURL();
  } catch { return null; }
}

// Enumerate interactive controls and, for each, click it and record what changed.
async function crawl(opts = {}) {
  const w = ensureWin();
  const max = Math.min(opts.max || 40, 120);

  const controls = await w.webContents.executeJavaScript(`(() => {
    const sel = 'button, a[href], [role="button"], input[type="submit"], input[type="button"], summary, [data-action], [onclick]';
    const els = Array.from(document.querySelectorAll(sel)).slice(0, ${max});
    return els.map((el, i) => {
      el.setAttribute('data-cs-obs', String(i));
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        i,
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') || el.textContent || el.value || el.id || '').trim().slice(0, 60),
        href: el.getAttribute('href') || null,
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
    await wait(400);
    const after = await read();

    // A change from ".../x" to ".../x#" (bare hash) is a dead link, not navigation.
    const stripBareHash = (u) => String(u || '').replace(/#$/, '');
    const realNav = stripBareHash(after.url) !== stripBareHash(before.url);

    const effects = {
      consoleErrors: (after.errors || []).length - (before.errors || []).length,
      networkCalls: (after.network || []).length - (before.network || []).length,
      navChanged: realNav,
      domMutations: (after.mutations || 0) - (before.mutations || 0),
      newConsole: (after.console || []).slice((before.console || []).length).slice(0, 5)
    };
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
  return {
    at: Date.now(),
    url: summary.url, title: summary.title,
    controlsFound: controls.length,
    controlsExercised: trace.filter((t) => t.status !== 'HIDDEN' && t.status !== 'DISABLED').length,
    byStatus: trace.reduce((m, t) => { m[t.status] = (m[t.status] || 0) + 1; return m; }, {}),
    consoleErrors: allErrors.slice(0, 50),
    network: allNetwork.slice(0, 80),
    trace
  };
}

function stop() {
  if (obsWin && !obsWin.isDestroyed()) obsWin.destroy();
  obsWin = null;
}

module.exports = { load, read, reset, screenshot, crawl, stop, assertAllowedUrl };
