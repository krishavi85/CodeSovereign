/* =====================================================================
   engine.design.js  —  Engine.Design   (blueprint §11)

   Design / vision input. Turns a reference design into a normalized
   **design spec** (sections, components, colour + type + spacing tokens)
   that the frontend generator can consume and `Engine.VisualCheck` can
   diff the built UI against.

   Three inputs, offline-first:
     - Figma frame JSON  (the user's own export — no API token, no network)
     - HTML / CSS markup (paste or a file)
     - a screenshot      (stored as the visual-fidelity reference; layout
                          inference is SUPPORTED but needs a vision model —
                          reported precisely, never silently dropped)

   window.Engine.Design
     ingest({ kind, data|json|markup|dataUrl, name? })  -> design spec
     applyTokens(spec?)   -> writes public/design-tokens.css
     analyze()            -> writes .sovereign/design-spec.json + report
     load()               -> the spec or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function hex(c) {
    if (!c) return null;
    if (typeof c === 'string') return c;
    // Figma colour: { r,g,b,a } 0..1
    if (typeof c.r === 'number') {
      var to = function (n) { return ('0' + Math.round(n * 255).toString(16)).slice(-2); };
      return '#' + to(c.r) + to(c.g) + to(c.b);
    }
    return null;
  }
  function firstFill(node) {
    var f = (node.fills || node.background || [])[0];
    if (!f || f.visible === false) return null;
    return hex(f.color || (f.gradientStops && f.gradientStops[0] && f.gradientStops[0].color));
  }

  function emptySpec(source, name) {
    return {
      source: source, name: name || 'design', ingestedAt: Date.now(),
      sections: [], components: [], text: [],
      tokens: { colors: [], fontFamilies: [], fontSizes: [], radii: [], spacing: [] },
      viewport: null, notes: []
    };
  }

  function dedupePush(arr, v) { if (v != null && arr.indexOf(v) < 0) arr.push(v); }

  /* ---------------- Figma frame JSON ---------------- */
  function fromFigma(doc, name) {
    var spec = emptySpec('figma', name);
    var root = doc.document || doc;
    // pick the largest top-level FRAME as the viewport
    function walk(node, depth) {
      if (!node || typeof node !== 'object') return;
      var box = node.absoluteBoundingBox || node.absoluteRenderBounds;
      var fill = firstFill(node);
      dedupePush(spec.tokens.colors, fill);
      if (node.style) {
        dedupePush(spec.tokens.fontFamilies, node.style.fontFamily);
        dedupePush(spec.tokens.fontSizes, node.style.fontSize);
      }
      if (typeof node.cornerRadius === 'number') dedupePush(spec.tokens.radii, node.cornerRadius);
      if (typeof node.itemSpacing === 'number') dedupePush(spec.tokens.spacing, node.itemSpacing);
      if (typeof node.paddingLeft === 'number') dedupePush(spec.tokens.spacing, node.paddingLeft);

      var nm = String(node.name || '');
      if (node.type === 'TEXT' && node.characters) {
        spec.text.push(node.characters.slice(0, 120));
      }
      if (node.type === 'FRAME' && depth <= 2 && box) {
        if (!spec.viewport || box.width * box.height > spec.viewport.width * spec.viewport.height) {
          spec.viewport = { width: Math.round(box.width), height: Math.round(box.height) };
        }
        if (depth >= 1) spec.sections.push({ name: nm || 'section', box: { w: Math.round(box.width), h: Math.round(box.height) } });
      }
      // component heuristics by layer name
      if (/\b(button|btn|cta)\b/i.test(nm)) spec.components.push({ role: 'button', name: nm, label: (node.characters || '').slice(0, 40) });
      else if (/\b(input|field|text ?field|search)\b/i.test(nm)) spec.components.push({ role: 'input', name: nm });
      else if (/\b(nav|header|topbar|app ?bar)\b/i.test(nm)) spec.components.push({ role: 'nav', name: nm });
      else if (/\b(card|tile|list ?item)\b/i.test(nm)) spec.components.push({ role: 'card', name: nm });
      else if (node.type === 'COMPONENT' || node.type === 'INSTANCE') spec.components.push({ role: 'component', name: nm });

      (node.children || []).forEach(function (c) { walk(c, depth + 1); });
    }
    walk(root, 0);
    spec.tokens.colors = spec.tokens.colors.filter(Boolean).slice(0, 12);
    spec.tokens.fontSizes = spec.tokens.fontSizes.filter(function (n) { return n; }).sort(function (a, b) { return a - b; });
    spec.components = spec.components.slice(0, 40);
    spec.sections = spec.sections.slice(0, 20);
    if (!spec.components.length) spec.notes.push('no named button/input/nav/card layers found — layer names drive component detection');
    return spec;
  }

  /* ---------------- HTML / CSS markup ---------------- */
  function fromHtml(markup, name) {
    var spec = emptySpec('html', name);
    var html = String(markup || '');
    var css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';

    (html.match(/<(section|header|nav|main|footer|article|aside)\b[^>]*>/gi) || []).forEach(function (tag) {
      spec.sections.push({ name: tag.replace(/[<>]/g, '').split(/\s/)[0] });
    });
    (html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || []).forEach(function (b) {
      spec.components.push({ role: 'button', label: b.replace(/<[^>]+>/g, '').trim().slice(0, 40) });
    });
    (html.match(/<input\b[^>]*>/gi) || []).forEach(function (i) {
      var type = (i.match(/type="([^"]+)"/i) || [])[1] || 'text';
      spec.components.push({ role: 'input', inputType: type });
    });
    if (/<nav\b/i.test(html) || /class="[^"]*\b(nav|navbar|header)\b/i.test(html)) spec.components.push({ role: 'nav' });
    (html.match(/>([^<>{}\n][^<>]{2,80})</g) || []).forEach(function (m) {
      var txt = m.slice(1, -1).trim();
      if (txt && !/^[\s\d.,:;!?%$#@/\\|()[\]-]+$/.test(txt)) spec.text.push(txt.slice(0, 120));
    });
    spec.text = spec.text.slice(0, 60);

    // tokens from inline CSS
    (css.match(/#[0-9a-f]{3,8}\b/gi) || []).forEach(function (c) { dedupePush(spec.tokens.colors, c.toLowerCase()); });
    (css.match(/rgba?\([^)]+\)/gi) || []).forEach(function (c) { dedupePush(spec.tokens.colors, c); });
    (css.match(/font-family\s*:\s*([^;]+)/gi) || []).forEach(function (f) { dedupePush(spec.tokens.fontFamilies, f.split(':')[1].trim().replace(/["']/g, '')); });
    (css.match(/font-size\s*:\s*([\d.]+)px/gi) || []).forEach(function (f) { dedupePush(spec.tokens.fontSizes, Number(f.match(/([\d.]+)/)[1])); });
    (css.match(/border-radius\s*:\s*([\d.]+)px/gi) || []).forEach(function (f) { dedupePush(spec.tokens.radii, Number(f.match(/([\d.]+)/)[1])); });
    spec.tokens.colors = spec.tokens.colors.slice(0, 12);
    spec.tokens.fontSizes.sort(function (a, b) { return a - b; });
    return spec;
  }

  /* ---------------- screenshot ---------------- */
  // offline pixel analysis via an offscreen canvas (same primitive as
  // Engine.VisualCheck.fidelity) — no model, no library.
  function pixelAnalyze(dataUrl) {
    return new Promise(function (resolve) {
      try {
        if (typeof document === 'undefined' || !document.createElement) { resolve(null); return; }
        var img = new Image();
        img.onerror = function () { resolve(null); };
        img.onload = function () {
          try {
            var W = Math.min(img.width, 320), H = Math.min(img.height, 640);
            var scale = Math.min(W / img.width, H / img.height) || 1;
            var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
            var d = ctx.getImageData(0, 0, w, h).data;
            // colour histogram — quantise to a 5-bit-per-channel bucket
            var hist = {};
            for (var i = 0; i < d.length; i += 4) {
              if (d[i + 3] < 128) continue;
              var key = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3);
              hist[key] = (hist[key] || 0) + 1;
            }
            var sorted = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; });
            var toHex = function (k) {
              var p = k.split(',').map(function (n) { return Math.min(255, (+n << 3) + 4); });
              return '#' + p.map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
            };
            var colors = sorted.slice(0, 6).map(toHex);
            var bg = toHex(sorted[0] || '31,31,31');
            // horizontal bands — rows whose mean colour differs sharply from the
            // previous row mark a section boundary
            var rowMean = [];
            for (var y = 0; y < h; y++) {
              var r = 0, g = 0, bl = 0, n = 0;
              for (var x = 0; x < w; x++) { var o = (y * w + x) * 4; r += d[o]; g += d[o + 1]; bl += d[o + 2]; n++; }
              rowMean.push([r / n, g / n, bl / n]);
            }
            var bands = [], start = 0;
            for (var yy = 1; yy < h; yy++) {
              var dd = Math.abs(rowMean[yy][0] - rowMean[yy - 1][0]) + Math.abs(rowMean[yy][1] - rowMean[yy - 1][1]) + Math.abs(rowMean[yy][2] - rowMean[yy - 1][2]);
              if (dd > 60 && yy - start > h * 0.05) {
                bands.push({ topPct: Math.round(start / h * 100), bottomPct: Math.round(yy / h * 100), kind: start === 0 ? 'header' : 'section' });
                start = yy;
              }
            }
            bands.push({ topPct: Math.round(start / h * 100), bottomPct: 100, kind: bands.length ? 'footer-or-section' : 'single-region' });
            resolve({ width: img.width, height: img.height, colors: colors, background: bg, bands: bands.slice(0, 10) });
          } catch (e) { resolve(null); }
        };
        img.src = dataUrl;
      } catch (e) { resolve(null); }
    });
  }

  function fromScreenshot(dataUrl, name) {
    var spec = emptySpec('screenshot', name);
    spec.reference = { stored: true, bytes: dataUrl ? dataUrl.length : 0 };
    try { if (S() && dataUrl) S().write('design-reference.txt', dataUrl); } catch (_) {}
    var vision = null;
    try { vision = Engine.AI && (Engine.AI.vision || (Engine.AI.status && Engine.AI.status().vision)); } catch (_) {}
    spec.needsVision = !vision;
    spec.notes.push(
      'The screenshot is stored as the visual-fidelity reference — the built UI is pixel-diffed against it (Engine.VisualCheck.fidelity).');
    // offline heuristic: palette + coarse layout bands from the raw pixels
    spec._pixelPending = !!dataUrl;
    if (vision) {
      spec.notes.push('A vision model is connected — call Engine.Design.describe() for full section/component inference.');
      spec.status = 'READY';
      spec.reason = null;
    } else {
      spec.notes.push('SUPPORTED — full layout inference needs a multimodal model (VISION_MODEL_REQUIRED); an offline palette + banding heuristic is applied.');
      spec.status = 'PARTIAL';
      spec.reason = 'VISION_MODEL_REQUIRED';
    }
    return spec;
  }

  // async second pass: run the pixel analysis + fold it into the stored spec
  function analyzeScreenshot(dataUrl) {
    return pixelAnalyze(dataUrl || (S() && S().read('design-reference.txt'))).then(function (px) {
      var spec = load();
      if (!spec || spec.source !== 'screenshot') return spec;
      if (px) {
        spec.viewport = { width: px.width, height: px.height };
        (px.colors || []).forEach(function (c) { dedupePush(spec.tokens.colors, c); });
        spec.tokens.colors = spec.tokens.colors.slice(0, 8);
        spec.background = px.background;
        spec.sections = (px.bands || []).map(function (b) { return { name: b.kind, box: null, topPct: b.topPct, bottomPct: b.bottomPct }; });
        spec.pixelAnalyzed = true;
        spec.notes.push('Offline analysis: ' + (px.colors || []).length + ' dominant colours, ' + (px.bands || []).length + ' layout band(s).');
      } else {
        spec.notes.push('Offline pixel analysis unavailable in this environment (no canvas) — palette/bands not extracted.');
        spec.pixelAnalyzed = false;
      }
      delete spec._pixelPending;
      if (S()) {
        S().write('design-spec.json', spec);
        if (spec.tokens.colors.length) S().write('design-language.json', {
          palette: spec.tokens.colors, type: [], scale: [], radii: [], spacing: [],
          components: [], source: 'screenshot-heuristic'
        });
      }
      return spec;
    });
  }

  /* ---------------- public ---------------- */
  function ingest(input) {
    input = input || {};
    var spec;
    if (input.kind === 'figma') {
      var json = input.json || input.data;
      if (typeof json === 'string') { try { json = JSON.parse(json); } catch (_) { json = null; } }
      spec = json ? fromFigma(json, input.name) : emptySpec('figma', input.name);
      if (!json) { spec.status = 'FAILED'; spec.reason = 'INVALID_FIGMA_JSON'; }
    } else if (input.kind === 'html') {
      spec = fromHtml(input.markup || input.data, input.name);
      spec.status = 'READY';
    } else if (input.kind === 'screenshot') {
      spec = fromScreenshot(input.dataUrl || input.data, input.name);
      if (S()) S().write('design-spec.json', spec);
      // kick the offline pixel pass (async — folds palette + bands into the spec)
      try { analyzeScreenshot(input.dataUrl || input.data); } catch (_) {}
    } else {
      spec = emptySpec(input.kind || 'unknown', input.name);
      spec.status = 'FAILED'; spec.reason = 'UNKNOWN_INPUT_KIND';
    }
    if (spec.status === undefined) spec.status = 'READY';
    if (S()) S().write('design-spec.json', spec);
    // feed the intent layer so the contract can carry a design language
    try {
      if (spec.status === 'READY' && S()) {
        S().write('design-language.json', {
          palette: spec.tokens.colors, type: spec.tokens.fontFamilies, scale: spec.tokens.fontSizes,
          radii: spec.tokens.radii, spacing: spec.tokens.spacing,
          components: spec.components.map(function (c) { return c.role; })
        });
      }
    } catch (_) {}
    return spec;
  }

  function load() {
    try { var v = S() && S().read('design-spec.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; }
  }

  function applyTokens(spec) {
    spec = spec || load();
    if (!spec || !FS()) return { wrote: null, reason: spec ? 'NO_FS' : 'NO_SPEC' };
    var t = spec.tokens || {};
    var col = (t.colors || []).filter(Boolean);
    var sizes = (t.fontSizes || []).filter(function (n) { return n; });
    var css = ':root {\n' +
      '  /* generated by Engine.Design from ' + spec.source + ' input */\n' +
      (col[0] ? '  --color-bg: ' + col[0] + ';\n' : '') +
      (col[1] ? '  --color-surface: ' + col[1] + ';\n' : '') +
      (col.filter(function (c) { return /^#|rgb/.test(c); })[2] ? '  --color-accent: ' + col[2] + ';\n' : '') +
      (col[3] ? '  --color-text: ' + col[3] + ';\n' : '') +
      (t.fontFamilies && t.fontFamilies[0] ? '  --font-sans: ' + t.fontFamilies[0] + ', system-ui, sans-serif;\n' : '') +
      (sizes[0] ? '  --text-sm: ' + sizes[0] + 'px;\n' : '') +
      (sizes[Math.floor(sizes.length / 2)] ? '  --text-base: ' + sizes[Math.floor(sizes.length / 2)] + 'px;\n' : '') +
      (sizes[sizes.length - 1] ? '  --text-lg: ' + sizes[sizes.length - 1] + 'px;\n' : '') +
      (t.radii && t.radii.length ? '  --radius: ' + Math.round(t.radii.reduce(function (a, b) { return a + b; }, 0) / t.radii.length) + 'px;\n' : '') +
      (t.spacing && t.spacing.length ? '  --space: ' + Math.min.apply(null, t.spacing) + 'px;\n' : '') +
      '}\n';
    try { FS().write('/public/design-tokens.css', css); } catch (_) { return { wrote: null, reason: 'WRITE_FAILED' }; }
    return { wrote: '/public/design-tokens.css', tokens: { colors: col.length, sizes: sizes.length } };
  }

  function analyze() {
    var spec = load();
    if (!spec) {
      var none = { generatedAt: Date.now(), present: false, note: 'no design input ingested — Engine.Design.ingest({ kind, … })' };
      if (S()) S().write('design-findings.json', none);
      return none;
    }
    var report = {
      generatedAt: Date.now(), present: true,
      source: spec.source, status: spec.status, reason: spec.reason || null,
      sections: spec.sections.length, components: spec.components.length,
      componentRoles: spec.components.reduce(function (m, c) { m[c.role] = (m[c.role] || 0) + 1; return m; }, {}),
      tokens: {
        colors: (spec.tokens.colors || []).length,
        fontSizes: (spec.tokens.fontSizes || []).length,
        radii: (spec.tokens.radii || []).length
      },
      needsVision: !!spec.needsVision,
      notes: spec.notes || []
    };
    if (S()) {
      S().write('design-findings.json', report);
      S().write('design-report.md',
        '# Design input\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Source:** ' + report.source + ' · **Status:** ' + report.status + (report.reason ? ' (' + report.reason + ')' : '') + '\n\n' +
        report.sections + ' section(s) · ' + report.components + ' component(s) — ' +
        Object.keys(report.componentRoles).map(function (r) { return r + ' ×' + report.componentRoles[r]; }).join(', ') + '\n\n' +
        report.tokens.colors + ' colour token(s), ' + report.tokens.fontSizes + ' font size(s)\n\n' +
        (report.notes.length ? report.notes.map(function (n) { return '- ' + n; }).join('\n') + '\n' : ''));
    }
    return report;
  }

  Engine.Design = { ingest: ingest, applyTokens: applyTokens, analyze: analyze, load: load, analyzeScreenshot: analyzeScreenshot, _fromFigma: fromFigma, _fromHtml: fromHtml, _pixelAnalyze: pixelAnalyze };
  console.info('[Design] design / vision input ready — Engine.Design');
})();
