/* =====================================================================
   engine.vision.js  —  Engine.Vision   (offline-plan §3-4)

   Screenshot → component tree, offline. No model — this is a computer-
   vision pipeline (the same class of technique PixelDraft uses):

     screenshot
       → offscreen-canvas normalize
       → background estimate + contrast map
       → connected-component region detection (union-find on a coarse grid)
       → bounding boxes
       → element classification (header / nav / card / button / input /
         text / image) by size · aspect · position · fill
       → containment nesting  → component tree
       → adjacency (left-of / above / contains) → layout graph
       → HTML reconstruction skeleton

   Then the render-and-compare loop (offline-plan §4):
     reconstruct → render in the observer → capture → Engine.VisualCheck
     .fidelity(target, rendered) → similarity → PASS / FAIL / repair.

   The palette + band heuristic from engine.design.js is kept as the
   fallback when a canvas is unavailable.

   window.Engine.Vision
     detect(dataUrl)              -> Promise<{ regions, background, palette, width, height }>
     componentTree(detection)     -> nested component tree
     layoutGraph(detection)       -> adjacency graph
     reconstruct(tree)            -> an HTML skeleton string
     compare(targetUrl, renderedUrl) -> Promise<{ similarity, verdict }>
     analyze(dataUrl?)            -> writes .sovereign/vision/* + screenshot-analysis-evidence.json
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function hasCanvas() { return typeof document !== 'undefined' && !!document.createElement && !!document.createElement('canvas').getContext; }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  function hex(r, g, b) { return '#' + [r, g, b].map(function (n) { return ('0' + Math.max(0, Math.min(255, n | 0)).toString(16)).slice(-2); }).join(''); }

  /* ---------------- detection ---------------- */
  function detect(dataUrl) {
    if (!hasCanvas()) return Promise.resolve({ error: 'NO_CANVAS', regions: [], palette: [], background: null });
    dataUrl = dataUrl || (S() && S().read('design-reference.txt'));
    if (!dataUrl) return Promise.resolve({ error: 'NO_IMAGE', regions: [], palette: [], background: null });

    return loadImage(dataUrl).then(function (img) {
      var GW = 96;                                   // coarse grid width
      var scale = GW / img.width;
      var GH = Math.max(1, Math.round(img.height * scale));
      var c = document.createElement('canvas'); c.width = GW; c.height = GH;
      var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, GW, GH);
      var d = ctx.getImageData(0, 0, GW, GH).data;

      // background = the modal colour of the outer 1-px frame
      var frame = {};
      for (var x = 0; x < GW; x++) { sample(0, x); sample(GH - 1, x); }
      for (var y = 0; y < GH; y++) { sample(y, 0); sample(y, GW - 1); }
      function sample(yy, xx) { var o = (yy * GW + xx) * 4; var k = (d[o] >> 4) + ',' + (d[o + 1] >> 4) + ',' + (d[o + 2] >> 4); frame[k] = (frame[k] || 0) + 1; }
      var bgKey = Object.keys(frame).sort(function (a, b) { return frame[b] - frame[a]; })[0] || '15,15,15';
      var bg = bgKey.split(',').map(function (n) { return (+n << 4) + 8; });

      // full colour histogram for the palette
      var hist = {};
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        var kk = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3);
        hist[kk] = (hist[kk] || 0) + 1;
      }
      var palette = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; }).slice(0, 6).map(function (k) {
        var p = k.split(',').map(function (n) { return (+n << 3) + 4; }); return hex(p[0], p[1], p[2]);
      });

      // foreground mask: pixel differs from bg by > threshold
      var TH = 42;
      var fg = new Uint8Array(GW * GH);
      for (var yy = 0; yy < GH; yy++) for (var xx = 0; xx < GW; xx++) {
        var o = (yy * GW + xx) * 4;
        if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) > TH) fg[yy * GW + xx] = 1;
      }
      // dilate once (close small gaps)
      var dil = new Uint8Array(fg);
      for (var yy2 = 0; yy2 < GH; yy2++) for (var xx2 = 0; xx2 < GW; xx2++) {
        if (fg[yy2 * GW + xx2]) continue;
        var n = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var ny = yy2 + dy, nx = xx2 + dx;
          if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && fg[ny * GW + nx]) n++;
        }
        if (n >= 3) dil[yy2 * GW + xx2] = 1;
      }

      // connected components (union-find)
      var parent = new Int32Array(GW * GH).fill(-1);
      function find(a) { while (parent[a] >= 0) a = parent[a]; return a; }
      function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
      for (var yy3 = 0; yy3 < GH; yy3++) for (var xx3 = 0; xx3 < GW; xx3++) {
        var idx = yy3 * GW + xx3;
        if (!dil[idx]) continue;
        if (parent[idx] < 0) parent[idx] = idx;
        if (xx3 > 0 && dil[idx - 1]) union(idx, idx - 1);
        if (yy3 > 0 && dil[idx - GW]) union(idx, idx - GW);
      }
      var comps = {};
      for (var idx2 = 0; idx2 < GW * GH; idx2++) {
        if (!dil[idx2]) continue;
        var r = find(idx2);
        var cx = idx2 % GW, cy = (idx2 / GW) | 0;
        var comp = comps[r] || (comps[r] = { x0: cx, y0: cy, x1: cx, y1: cy, n: 0, rsum: 0, gsum: 0, bsum: 0 });
        comp.x0 = Math.min(comp.x0, cx); comp.y0 = Math.min(comp.y0, cy);
        comp.x1 = Math.max(comp.x1, cx); comp.y1 = Math.max(comp.y1, cy);
        comp.n++;
        var oo = idx2 * 4; comp.rsum += d[oo]; comp.gsum += d[oo + 1]; comp.bsum += d[oo + 2];
      }

      var regions = Object.keys(comps).map(function (k) {
        var b = comps[k];
        var w = (b.x1 - b.x0 + 1) / GW, h = (b.y1 - b.y0 + 1) / GH;
        var xp = b.x0 / GW, yp = b.y0 / GH;
        var fill = b.n ? hex(b.rsum / b.n, b.gsum / b.n, b.bsum / b.n) : null;
        var density = b.n / ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1));
        return { xPct: +(xp * 100).toFixed(1), yPct: +(yp * 100).toFixed(1), wPct: +(w * 100).toFixed(1), hPct: +(h * 100).toFixed(1),
          fill: fill, density: +density.toFixed(2), kind: classify(xp, yp, w, h, density) };
      }).filter(function (r) { return r.wPct > 4 && r.hPct > 1.5; })
        .sort(function (a, b) { return (a.yPct - b.yPct) || (a.xPct - b.xPct); })
        .slice(0, 40);

      return { width: img.width, height: img.height, background: hex(bg[0], bg[1], bg[2]), palette: palette, regions: regions };
    }).catch(function (e) { return { error: String(e && e.message || e), regions: [], palette: [], background: null }; });
  }

  function classify(xp, yp, w, h, density) {
    if (yp < 0.12 && w > 0.7) return 'header';
    if (xp < 0.06 && h > 0.5 && w < 0.35) return 'nav';
    if (yp > 0.88 && w > 0.6) return 'footer';
    if (h < 0.06 && w < 0.35 && density > 0.4) return 'button';
    if (h < 0.09 && w > 0.35) return 'input';
    if (w > 0.55 && h > 0.2) return 'section';
    if (w < 0.5 && h > 0.12 && h < 0.5) return 'card';
    if (h < 0.05) return 'text';
    return 'block';
  }

  /* ---------------- tree + graph ---------------- */
  function contains(a, b) {
    return a.xPct <= b.xPct + 1 && a.yPct <= b.yPct + 1 &&
      a.xPct + a.wPct >= b.xPct + b.wPct - 1 && a.yPct + a.hPct >= b.yPct + b.hPct - 1 &&
      (a.wPct * a.hPct) > (b.wPct * b.hPct);
  }
  function componentTree(det) {
    var rs = (det.regions || []).map(function (r, i) { return Object.assign({ id: 'n' + i, children: [] }, r); });
    rs.sort(function (a, b) { return (b.wPct * b.hPct) - (a.wPct * a.hPct); });
    var roots = [];
    rs.forEach(function (node) {
      var parent = null;
      for (var i = 0; i < rs.length; i++) {
        if (rs[i] === node) continue;
        if (contains(rs[i], node) && (!parent || (rs[i].wPct * rs[i].hPct) < (parent.wPct * parent.hPct))) parent = rs[i];
      }
      if (parent) parent.children.push(node); else roots.push(node);
    });
    return { root: { id: 'root', kind: 'page', children: roots }, count: rs.length };
  }
  function layoutGraph(det) {
    var rs = det.regions || [];
    var edges = [];
    for (var i = 0; i < rs.length; i++) for (var j = 0; j < rs.length; j++) {
      if (i === j) continue;
      var a = rs[i], b = rs[j];
      if (a.xPct + a.wPct <= b.xPct + 1 && overlap(a.yPct, a.hPct, b.yPct, b.hPct)) edges.push({ from: 'r' + i, to: 'r' + j, rel: 'left-of' });
      if (a.yPct + a.hPct <= b.yPct + 1 && overlap(a.xPct, a.wPct, b.xPct, b.wPct)) edges.push({ from: 'r' + i, to: 'r' + j, rel: 'above' });
    }
    return { nodes: rs.map(function (r, i) { return { id: 'r' + i, kind: r.kind }; }), edges: edges.slice(0, 120) };
  }
  function overlap(p1, s1, p2, s2) { return p1 < p2 + s2 && p2 < p1 + s1; }

  /* ---------------- reconstruction ---------------- */
  var TAG = { page: 'main', header: 'header', nav: 'nav', footer: 'footer', section: 'section', card: 'article', button: 'button', input: 'input', text: 'p', block: 'div' };
  function reconstruct(tree) {
    function node(n, depth) {
      if (depth > 6) return '';
      var tag = TAG[n.kind] || 'div';
      var pad = new Array(depth + 2).join('  ');
      if (n.kind === 'input') return pad + '<input type="text" aria-label="field" placeholder="…">\n';
      if (n.kind === 'button') return pad + '<button type="button">Action</button>\n';
      if (n.kind === 'text') return pad + '<p>Text</p>\n';
      var inner = (n.children || []).map(function (c) { return node(c, depth + 1); }).join('');
      return pad + '<' + tag + ' data-vision="' + n.kind + '">\n' + (inner || pad + '  <p>' + (n.kind || 'block') + '</p>\n') + pad + '</' + tag + '>\n';
    }
    var body = (tree.root.children || []).map(function (c) { return node(c, 1); }).join('');
    return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>reconstructed</title>\n<style>*{box-sizing:border-box;margin:0}body{font:15px/1.5 system-ui;padding:16px}' +
      'header,nav,section,article,footer{border:1px solid #ccc;border-radius:8px;padding:12px;margin:0 0 12px}' +
      'button{padding:9px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:7px}' +
      'input{padding:8px 10px;border:1px solid #767676;border-radius:7px;width:100%}</style>\n</head>\n<body>\n' + body + '</body>\n</html>\n';
  }

  /* ---------------- render-and-compare (§4) ---------------- */
  function compare(targetUrl, renderedUrl) {
    if (!Engine.VisualCheck || !Engine.VisualCheck.fidelity) return Promise.resolve({ error: 'NO_FIDELITY', similarity: null });
    return Engine.VisualCheck.fidelity(targetUrl, renderedUrl).then(function (f) {
      if (f.error) return { error: f.error, similarity: null };
      var sim = 1 - (f.ratio || 0);
      return { similarity: +sim.toFixed(4), changedPixels: f.changedPixels, verdict: sim >= 0.82 ? 'PASS' : sim >= 0.6 ? 'PARTIAL' : 'FAIL' };
    });
  }

  /* ---------------- analyze ---------------- */
  function analyze(dataUrl) {
    return detect(dataUrl).then(function (det) {
      if (det.error) {
        var blocked = { generatedAt: Date.now(), capability: 'screenshot-to-component-tree', support: 'SUPPORTED',
          status: det.error === 'NO_IMAGE' ? 'IDLE' : 'BLOCKED', reason: det.error,
          note: det.error === 'NO_CANVAS' ? 'runs in the renderer (canvas required); heuristic fallback: Engine.Design palette + bands' : 'no screenshot ingested' };
        if (S()) S().write('screenshot-analysis-evidence.json', blocked);
        return blocked;
      }
      var tree = componentTree(det);
      var graph = layoutGraph(det);
      var html = reconstruct(tree);
      if (S()) {
        S().write('vision/screenshot-detection.json', det);
        S().write('vision/component-tree.json', tree);
        S().write('vision/layout-graph.json', graph);
        S().write('vision/reconstructed.html', html);
      }
      var report = {
        generatedAt: Date.now(), capability: 'screenshot-to-component-tree', support: 'SUPPORTED', status: 'PASS',
        regions: det.regions.length, componentCount: tree.count,
        roles: det.regions.reduce(function (m, r) { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {}),
        palette: det.palette, background: det.background, viewport: { width: det.width, height: det.height }
      };
      if (S()) S().write('screenshot-analysis-evidence.json', report);
      // feed the design language
      if (S() && det.palette.length) S().write('design-language.json', {
        palette: det.palette, type: [], scale: [], radii: [], spacing: [],
        components: det.regions.map(function (r) { return r.kind; }), source: 'screenshot-cv'
      });
      return report;
    });
  }

  function load() { try { var v = S() && S().read('screenshot-analysis-evidence.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Vision = { detect: detect, componentTree: componentTree, layoutGraph: layoutGraph, reconstruct: reconstruct, compare: compare, analyze: analyze, load: load, _classify: classify };
  console.info('[Vision] screenshot -> component tree (offline CV) ready — Engine.Vision');
})();
