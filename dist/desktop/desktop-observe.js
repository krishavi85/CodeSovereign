/* =====================================================================
   desktop-observe.js  —  runtime observation of the project's running app.

   window.CSObserve:
     available()              desktop + a folder open
     detectDevServer()        -> { script, port, url } | null   (from package.json)
     ensureServer(url?)       -> Promise<{ url, started }>       (starts npm run dev if needed)
     run({ url?, max? })      -> Promise<trace>                  (load + crawl controls)
     stop()

   Drives a hidden BrowserWindow in the main process, captures
   console / errors / network / navigation, clicks every interactive control
   and records what actually changed. No-op in a browser.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.desktop || !window.desktop.isDesktop) return;
  var D = window.desktop;
  var Engine = window.Engine;
  var FS = Engine && Engine.FS;

  var COMMON_PORTS = [5173, 4173, 3000, 8080, 1420, 4321, 5000, 8000, 3001];
  var serverProc = null;

  // Tail of what the dev server printed. Live 2026-10-02: the generated
  // server crashed on its first API call (ReferenceError at server.js:241);
  // the crawl failed and the model was only told "could not be loaded at
  // all", never the crash. Events can arrive before spawnAllowed() returns
  // the id, so output is kept per id for the last few processes.
  var outputs = {}, outputOrder = [], lastServerId = null;
  var OUTPUT_CAP = 6000;
  if (D.proc && typeof D.proc.onData === 'function') {
    D.proc.onData(function (evt) {
      if (!evt || !evt.id) return;
      if (!(evt.id in outputs)) {
        outputs[evt.id] = '';
        outputOrder.push(evt.id);
        while (outputOrder.length > 6) delete outputs[outputOrder.shift()];
      }
      var add = evt.stream === 'exit' ? '\n[server process exited with code ' + evt.code + ']\n' : String(evt.data || '');
      outputs[evt.id] = (outputs[evt.id] + add).slice(-OUTPUT_CAP);
    });
  }
  function serverLog() { return (lastServerId && outputs[lastServerId]) || ''; }

  function available() { return !!(FS && FS.__hasWorkspace && FS.__hasWorkspace()); }

  function pkg() { try { return JSON.parse(FS.read('/package.json') || 'null'); } catch (_) { return null; } }

  function detectDevServer() {
    var p = pkg(); if (!p || !p.scripts) return null;
    var script = p.scripts.dev ? 'dev' : p.scripts.start ? 'start' : p.scripts.serve ? 'serve' : null;
    if (!script) return null;
    var cmd = p.scripts[script] || '';
    var m = cmd.match(/(?:--port[= ]|:)(\d{4,5})\b/) || cmd.match(/\b(\d{4,5})\b/);
    var port = m ? parseInt(m[1], 10)
      : /vite/.test(cmd) ? 5173
      : /next/.test(cmd) ? 3000
      : /astro/.test(cmd) ? 4321
      : /tauri/.test(cmd) ? 1420
      : 3000;
    return { script: script, port: port, url: 'http://localhost:' + port };
  }

  function tryLoad(url, attempts, delay) {
    return D.observer.load(url).then(function (r) {
      if (r && r.ok) return { url: url, ok: true, title: r.title || '' };
      if (attempts <= 0) return { url: url, ok: false, error: r && r.error };
      return new Promise(function (res) { setTimeout(res, delay); })
        .then(function () { return tryLoad(url, attempts - 1, delay); });
    });
  }

  function ensureServer(url) {
    var det = detectDevServer();
    // 1. an explicit URL, or THIS project's own dev port, is authoritative —
    //    never crawl a stray server on a shared common port (that server could
    //    be a completely different app and would silently invalidate the run).
    //    The common-port scan is a last resort only when the project declares no
    //    dev/start script and no URL was given.
    var candidates = url ? [url] : (det ? [det.url] : COMMON_PORTS.map(function (p) { return 'http://localhost:' + p; }));
    // Confirmed live: a generated app with an unparseable package.json (so no
    // start script) fell through to this scan, which found CodeSovereign's own
    // preview on :4173 and crawled THAT — 14 controls "observed", and the run
    // recorded a runtime success for an app that was never started. A
    // blind port-scan hit only counts if it serves this project's own page.
    var scanning = !url && !det;
    var expected = scanning ? projectTitle() : null;

    return chainFirst(candidates.map(function (u) {
      return function () {
        return tryLoad(u, 0, 0).then(function (r) {
          if (!r.ok) return null;
          if (scanning && expected && String(r.title || '').trim() !== expected) return null;
          return { url: u, started: false };
        });
      };
    })).then(function (hit) {
      if (hit) return hit;
      // 2. nothing running on our own port — start the dev script
      if (!det) return Promise.reject(new Error('No dev/start script in package.json and nothing serving on common ports. Pass a URL.'));
      try { window.toast && window.toast('Starting dev server (' + det.script + ')…', '#a78bfa'); } catch (_) {}
      return D.proc.spawnAllowed({ cmd: (pkg() && detectPm()) || 'npm', args: ['run', det.script], cwd: '.' }).then(function (r) {
        if (r && r.id) { serverProc = r.id; lastServerId = r.id; }
        return tryLoad(det.url, 30, 1000).then(function (res) {
          if (!res.ok) throw new Error('Dev server did not come up at ' + det.url + ' within 30s');
          return { url: det.url, started: true };
        });
      });
    });
  }

  // The <title> of this project's own entry page, if it has one.
  function projectTitle() {
    var html = '';
    try { html = FS.read('/index.html') || FS.read('/public/index.html') || ''; } catch (_) { html = ''; }
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!m) return null;
    // compare like document.title does: entities decoded, whitespace collapsed
    return m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim() || null;
  }

  function detectPm() {
    return FS.exists('/pnpm-lock.yaml') ? 'pnpm' : FS.exists('/yarn.lock') ? 'yarn' : 'npm';
  }

  function chainFirst(fns) {
    return fns.reduce(function (acc, fn) {
      return acc.then(function (hit) { return hit || fn(); });
    }, Promise.resolve(null));
  }

  function run(opts) {
    opts = opts || {};
    if (!available()) return Promise.resolve({ ok: false, reason: 'open a project folder in the desktop app first' });
    var startedHere = false;
    return ensureServer(opts.url).then(function (srv) {
      startedHere = !!srv.started;
      try { window.toast && window.toast('Observing ' + srv.url + ' …', '#22d3ee'); } catch (_) {}
      // Let a freshly-started server warm up: reload once and settle so the
      // first API calls a crawled control makes resolve inside the observer's
      // per-control window (a cold `node` process' first response can be slow).
      var settle = srv.started
        ? D.observer.load(srv.url).then(function () { return new Promise(function (r) { setTimeout(r, 2500); }); })
        : Promise.resolve();
      return settle.then(function () {
        // The project's own server, started here from its folder: creating
        // forms may be submitted with sample data ('verify'). A server we
        // only found running stays read-only.
        return D.observer.crawl({ max: opts.max || 40, mode: opts.mode || (srv.started ? 'verify' : 'observe') });
      }).then(function (res) {
        if (res && res.ok === false) throw new Error(res.error || 'crawl failed');
        var trace = res;
        trace.serverUrl = srv.url;
        trace.serverStartedByUs = srv.started;
        if (srv.started) trace.serverLog = serverLog().slice(-3000);
        // visual validation (§12-13): a multi-breakpoint render pass, feeds Engine.VisualCheck
        if (opts.visual !== false && D.observer.visualProbe) {
          return D.observer.visualProbe({}).then(function (vp) {
            var probe = (vp && vp.ok === false) ? null : (vp && vp.data !== undefined ? vp.data : vp);
            if (probe) {
              try {
                // don't persist the base64 screenshots into the evidence json
                var slim = Object.assign({}, probe); delete slim.screenshots;
                if (window.Engine && window.Engine.VisualCheck) window.Engine.VisualCheck.ingest(slim);
                trace.visual = { breakpoints: (slim.breakpoints || []).map(function (b) { return b.name; }), findings: (slim.breakpoints || []).reduce(function (n, b) { return n + ((b.findings || []).length); }, 0) };
              } catch (_) {}
            }
            return { ok: true, trace: trace };
          }).catch(function () { return { ok: true, trace: trace }; });
        }
        return { ok: true, trace: trace };
      });
    }).catch(function (e) {
      // A server we started (or tried to) — its output usually says why.
      var log = (startedHere || lastServerId === serverProc) ? serverLog() : '';
      return { ok: false, reason: (e && e.message) || String(e), serverLog: log.slice(-3000) };
    });
  }

  function stop() {
    try { D.observer.stop(); } catch (_) {}
    if (serverProc) { try { D.proc.kill(serverProc); } catch (_) {} serverProc = null; }
  }

  window.CSObserve = { available: available, detectDevServer: detectDevServer, ensureServer: ensureServer, run: run, stop: stop, serverLog: serverLog };
  console.info('[desktop-observe] runtime observer ready — window.CSObserve');
})();
