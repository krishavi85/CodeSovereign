'use strict';
/* desktop-observe.js falls back to scanning common dev ports when a project
 * declares no dev/start/serve script. Confirmed live: a generated app whose
 * package.json didn't parse (so: no start script) hit that scan, which found
 * CodeSovereign's own preview server on :4173 and crawled IT — 14 controls
 * "observed", and a runtime success recorded for an app that never started.
 * A scan hit must serve THIS project's own page (matched by <title>).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(servers, projectFiles) {
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    document: { createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener: () => {} }
  };
  win.window = win;
  const loaded = [];
  win.desktop = {
    isDesktop: true,
    observer: {
      load: async (url) => {
        loaded.push(url);
        const s = servers[url.replace(/\/$/, '')];
        return s ? { ok: true, url, title: s } : { ok: false, error: 'ERR_CONNECTION_REFUSED' };
      }
    },
    proc: { spawnAllowed: async () => ({ ok: false }) }
  };
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.js'), 'utf8'), ctx, { filename: 'engine.js' });
  win.Engine.FS.__hasWorkspace = () => true;
  win.Engine.FS.clear(); // engine.js seeds a default package.json with scripts
  Object.keys(projectFiles).forEach((p) => win.Engine.FS.write(p, projectFiles[p]));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-observe.js'), 'utf8'), ctx, { filename: 'desktop-observe.js' });
  return { win, loaded };
}

const PREVIEW = 'CodeSovereign — AI App Factory';
const APP_HTML = '<!doctype html><html><head><title>Todo &amp; Projects</title></head><body></body></html>';

module.exports = async function (t) {
  {
    const { win } = load({ 'http://localhost:4173': PREVIEW, 'http://localhost:3000': 'Todo & Projects' }, { '/index.html': APP_HTML });
    const srv = await win.CSObserve.ensureServer();
    t.equal('the port scan skips an unrelated server (the CodeSovereign preview on :4173) and finds THIS app', srv.url, 'http://localhost:3000');
  }
  {
    const { win } = load({ 'http://localhost:4173': PREVIEW }, { '/index.html': APP_HTML });
    let err = null;
    try { await win.CSObserve.ensureServer(); } catch (e) { err = e; }
    t.ok('when only unrelated servers answer, it fails honestly instead of crawling one', !!err && /No dev\/start script/.test(err.message));
  }
  {
    const { win } = load({ 'http://localhost:4173': 'Anything' }, { '/index.html': '<!doctype html><body>no title</body>' });
    const srv = await win.CSObserve.ensureServer();
    t.equal('a project page with no <title> keeps the old behaviour (nothing to match against)', srv.url, 'http://localhost:4173');
  }
  {
    const { win, loaded } = load({ 'http://localhost:3000': 'Whatever the app titles itself' }, {
      '/index.html': APP_HTML,
      '/package.json': JSON.stringify({ name: 'app', scripts: { start: 'node server.js' } })
    });
    const srv = await win.CSObserve.ensureServer();
    t.ok('a project WITH a start script loads its own declared port — no scan, no title gate', srv.url === 'http://localhost:3000' && loaded.every((u) => u === 'http://localhost:3000'));
  }
};
