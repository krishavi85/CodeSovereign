/* =====================================================================
   engine.visualcheck.js  —  Engine.VisualCheck   (blueprint §12-13)

   Visual validation + screenshot-fidelity. Two layers:

   1. LIVE (desktop) — `window.CSObserve` runs `observer.visualProbe()` which
      renders the running app at mobile / tablet / desktop breakpoints and
      measures every element's box + computed style: page horizontal overflow,
      elements past the viewport edge, content clipped by overflow:hidden,
      covering fixed overlays, off-screen text, zero-size interactive controls,
      low computed contrast. Screenshots per breakpoint.

   2. STATIC (any host) — heuristics over the HTML + CSS for the same defect
      classes that are visible without a renderer: fixed 100vw/100vh with
      z-index, `white-space: nowrap` on wide content, absolute negative
      positioning of real content, huge fixed pixel widths on a mobile-first
      page, `overflow: hidden` on `html`/`body`.

   analyze()          -> { generatedAt, findings, byImpact, score, breakpoints }
                         writes .sovereign/visual-findings.json + visual-report.md
   ingest(probe)      -> merge a live observer.visualProbe() result
   fidelity(a, b)     -> { changedPixels, ratio }  (dataURL PNG diff; desktop)
   load()             -> the written report or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function isProduct(p) { return !/^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor)\//.test(p); }
  function files(re) {
    return Object.keys(Engine.FS._data).filter(function (p) { return Engine.FS.isFile(p) && isProduct(p) && re.test(p); });
  }
  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

  function staticFindings() {
    var f = [];
    var push = function (rule, impact, file, line, detail) { f.push({ rule: rule, impact: impact, source: 'static', file: file, line: line, detail: detail }); };

    files(/\.css$/).forEach(function (p) {
      var css = read(p);
      // overflow hidden on the document root — clips everything, no scroll recovery
      if (/(^|[,\s{])(html|body)\b[^{}]*\{[^}]*overflow\s*:\s*hidden/i.test(css))
        push('root-overflow-hidden', 'serious', p, 1, 'overflow:hidden on html/body clips overflowing content with no way to scroll to it');
      // a large fixed pixel width that will overflow a phone (not max-width / min-width intent, not inside @media)
      var wm, wRe = /(?<![-a-z])(width)\s*:\s*(\d{3,4})px/gi;
      while ((wm = wRe.exec(css))) if (+wm[2] >= 500 && !/@media[^{]*\{[^}]*$/.test(css.slice(0, wm.index)))
        push('fixed-wide-element', 'moderate', p, lineOf(css, wm.index), 'a rule sets width:' + wm[2] + 'px — overflows a 375px viewport (use max-width / % / rem)');
      // full-viewport fixed overlay with a stacking context
      var om, oRe = /\{[^}]*position\s*:\s*fixed[^}]*\}/gi;
      while ((om = oRe.exec(css))) {
        var body = om[0];
        if (/(width|min-width)\s*:\s*(100vw|100%)/.test(body) && /(height|min-height)\s*:\s*(100vh|100%)/.test(body) && /z-index\s*:\s*[1-9]/.test(body) && !/pointer-events\s*:\s*none/.test(body))
          push('fullscreen-overlay', 'serious', p, lineOf(css, om.index), 'a position:fixed element sized 100vw×100vh with z-index covers the whole app');
      }
      // negative absolute positioning of (probably) real content — not a skip-link
      var nm, nRe = /([-a-z0-9 .#>:_\[\]="'-]+)\{[^}]*position\s*:\s*absolute[^}]*(?:left|top)\s*:\s*-\d{3,}px/gi;
      while ((nm = nRe.exec(css))) if (!/skip|sr-only|visually-hidden/i.test(nm[1]))
        push('offscreen-absolute', 'moderate', p, lineOf(css, nm.index), nm[1].trim() + ' is pushed far off-screen with a large negative offset');
    });

    files(/\.html?$/).forEach(function (p) {
      var html = read(p).replace(/<!--[\s\S]*?-->/g, '');
      if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html))
        push('no-viewport-meta', 'serious', p, 1, 'no <meta name="viewport"> — mobile browsers render at a zoomed-out desktop width');
      var tm, tRe = /style\s*=\s*["'][^"']*(width|min-width)\s*:\s*(\d{3,4})px/gi;
      while ((tm = tRe.exec(html))) if (+tm[2] >= 500)
        push('fixed-wide-element', 'moderate', p, lineOf(html, tm.index), 'inline ' + tm[1] + ':' + tm[2] + 'px overflows small viewports');
    });

    return f;
  }

  function fromProbe(probe) {
    var f = [];
    (probe && probe.breakpoints || []).forEach(function (bp) {
      (bp.findings || []).forEach(function (x) {
        f.push({ rule: x.rule, impact: x.impact, source: 'runtime', breakpoint: bp.name, el: x.el || null, detail: x.detail });
      });
    });
    return f;
  }

  function summarise(findings, breakpoints) {
    var byImpact = findings.reduce(function (m, x) { m[x.impact] = (m[x.impact] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (byImpact.critical || 0) * 25 - (byImpact.serious || 0) * 10 - (byImpact.moderate || 0) * 4 - (byImpact.minor || 0) * 1);
    return {
      generatedAt: Date.now(), findings: findings, byImpact: byImpact, score: score,
      clean: !(byImpact.critical),
      breakpoints: breakpoints || [],
      checks: ['page-horizontal-overflow', 'element-overflow', 'clipped-content', 'covering-overlay', 'offscreen-content', 'zero-size-control', 'low-contrast', 'no-viewport-meta', 'root-overflow-hidden', 'fixed-wide-element', 'fullscreen-overlay']
    };
  }

  function write(report) {
    if (!S()) return report;
    S().write('visual-findings.json', report);
    S().write('visual-report.md',
      '# Visual validation\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
      '**Score ' + report.score + '/100** — ' + (report.byImpact.critical || 0) + ' critical, ' + (report.byImpact.serious || 0) + ' serious, ' + (report.byImpact.moderate || 0) + ' moderate\n\n' +
      (report.breakpoints.length ? 'Rendered at: ' + report.breakpoints.map(function (b) { return b.name + ' (' + (b.viewport ? b.viewport.w + '×' + b.viewport.h : '?') + ')'; }).join(', ') + '\n\n' : '_Static analysis only — run in the desktop app for a live multi-breakpoint render._\n\n') +
      (report.findings.length ? report.findings.map(function (x) {
        return '- **' + x.impact.toUpperCase() + '** `' + x.rule + '`' + (x.breakpoint ? ' @' + x.breakpoint : '') + (x.el ? ' `' + x.el + '`' : '') + (x.file ? ' ' + x.file : '') + ' — ' + x.detail;
      }).join('\n') : '_No visual-integrity defects found._') + '\n');
    try {
      var ds = JSON.parse(S().read('decision-state.json') || '{}');
      ds.visual = { at: report.generatedAt, score: report.score, critical: report.byImpact.critical || 0 };
      S().write('decision-state.json', ds);
    } catch (_) {}
    return report;
  }

  function sj(name) {
    try { var v = S() && S().read(name); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; }
  }
  function analyze() {
    var probe = sj('visual-observations.json');
    var findings = staticFindings();
    var bps = [];
    if (probe) {
      findings = findings.concat(fromProbe(probe));
      bps = (probe.breakpoints || []).map(function (b) { return { name: b.name, viewport: b.viewport, elementCount: b.elementCount }; });
    }
    // de-dupe (same rule+detail from static + runtime)
    var seen = {}, uniq = [];
    findings.forEach(function (x) { var k = x.rule + '|' + (x.detail || '') + '|' + (x.breakpoint || ''); if (!seen[k]) { seen[k] = 1; uniq.push(x); } });
    return write(summarise(uniq, bps));
  }

  function ingest(probe) {
    if (probe && S()) S().write('visual-observations.json', probe);
    return analyze();
  }

  // pixel diff of two PNG data URLs (desktop only — uses an offscreen canvas)
  function fidelity(aUrl, bUrl) {
    return new Promise(function (resolve) {
      try {
        var ca = document.createElement('canvas'), cb = document.createElement('canvas');
        var ia = new Image(), ib = new Image(); var done = 0, res = {};
        function go() {
          if (++done < 2) return;
          var w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
          if (!w || !h) { resolve({ error: 'empty image' }); return; }
          ca.width = cb.width = w; ca.height = cb.height = h;
          ca.getContext('2d').drawImage(ia, 0, 0); cb.getContext('2d').drawImage(ib, 0, 0);
          var da = ca.getContext('2d').getImageData(0, 0, w, h).data;
          var db = cb.getContext('2d').getImageData(0, 0, w, h).data;
          var changed = 0;
          for (var i = 0; i < da.length; i += 4) {
            if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) changed++;
          }
          var total = w * h;
          resolve({ width: w, height: h, changedPixels: changed, ratio: +(changed / total).toFixed(4) });
        }
        ia.onload = go; ib.onload = go; ia.onerror = function () { resolve({ error: 'load a' }); }; ib.onerror = function () { resolve({ error: 'load b' }); };
        ia.src = aUrl; ib.src = bUrl;
      } catch (e) { resolve({ error: String(e && e.message || e) }); }
    });
  }

  function load() {
    try {
      var v = S() && S().read('visual-findings.json');
      if (v == null) return null;
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch (_) { return null; }
  }

  Engine.VisualCheck = { analyze: analyze, ingest: ingest, fidelity: fidelity, load: load };
  console.info('[VisualCheck] visual validation + screenshot fidelity ready — Engine.VisualCheck');
})();
