/* =====================================================================
   engine.a11y.js  —  Engine.A11y   (blueprint §47 — accessibility as a gate)

   A real WCAG 2.1 AA-oriented audit over the generated / open project's
   HTML + CSS. Static (regex tokeniser — same style as the other engines), so
   it runs headlessly and gates the Definition-of-Done. The desktop observer
   adds live focus-order + computed-contrast checks on top; this is the gate.

   Checks: image alt (1.1.1) · form labels (1.3.1, 3.3.2) · heading order
   (1.3.1) · colour contrast (1.4.3) · keyboard operability of click handlers
   (2.1.1) · a main landmark + skip link (2.4.1) · link text (2.4.4) · visible
   focus indicator (2.4.7) · html lang (3.1.1) · ARIA roles/states (4.1.2) ·
   target size (2.5.5) · positive tabindex · duplicate ids · invalid ARIA.

   window.Engine.A11y
     RULES
     audit()   -> { generatedAt, findings, byImpact, score, checks }
                  writes .sovereign/a11y-findings.json + a11y-report.md
     load()    -> the written report or null
     contrastRatio(fg, bg) -> number   (exposed for the observer)
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function isProduct(p) { return !/^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor)\//.test(p); }
  function isTest(p) { return /(^|\/)(test|tests|spec|__tests__|e2e)\//i.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p); }
  function files(re) {
    return Object.keys(Engine.FS._data).filter(function (p) {
      return Engine.FS.isFile(p) && isProduct(p) && !isTest(p) && re.test(p);
    });
  }
  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

  /* ---------------- colour + contrast ---------------- */
  var NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', purple: '#800080', maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', yellow: '#ffff00', orange: '#ffa500', transparent: null };
  function parseColor(s) {
    if (!s) return null;
    s = String(s).trim().toLowerCase();
    if (NAMED[s] !== undefined) s = NAMED[s];
    if (!s) return null;
    var m = s.match(/^#([0-9a-f]{3})$/);
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    m = s.match(/^#([0-9a-f]{6})$/);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function lum(rgb) {
    var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastRatio(fg, bg) {
    var a = parseColor(fg), b = parseColor(bg);
    if (!a || !b) return null;
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // pull a flat map of selector -> { color, background, fontSize, outline } from CSS text
  function cssRules(css) {
    var out = [];
    var re = /([^{}]+)\{([^}]*)\}/g, m;
    while ((m = re.exec(css))) {
      var sel = m[1].trim(), body = m[2];
      var d = {};
      (body.match(/[-a-z]+\s*:\s*[^;]+/gi) || []).forEach(function (decl) {
        var kv = decl.split(':');
        d[kv[0].trim().toLowerCase()] = kv.slice(1).join(':').trim().toLowerCase();
      });
      out.push({ selector: sel, decl: d });
    }
    return out;
  }

  var VALID_ROLES = /^(alert|alertdialog|application|article|banner|button|cell|checkbox|columnheader|combobox|complementary|contentinfo|definition|dialog|directory|document|feed|figure|form|grid|gridcell|group|heading|img|link|list|listbox|listitem|log|main|marquee|math|menu|menubar|menuitem|menuitemcheckbox|menuitemradio|navigation|none|note|option|presentation|progressbar|radio|radiogroup|region|row|rowgroup|rowheader|scrollbar|search|searchbox|separator|slider|spinbutton|status|switch|tab|table|tablist|tabpanel|term|textbox|timer|toolbar|tooltip|tree|treegrid|treeitem)$/;

  var RULES = [
    { id: 'html-lang', wcag: '3.1.1', impact: 'serious' },
    { id: 'image-alt', wcag: '1.1.1', impact: 'critical' },
    { id: 'link-name', wcag: '2.4.4', impact: 'serious' },
    { id: 'button-name', wcag: '4.1.2', impact: 'critical' },
    { id: 'label', wcag: '1.3.1 / 3.3.2', impact: 'critical' },
    { id: 'heading-order', wcag: '1.3.1', impact: 'moderate' },
    { id: 'landmark-main', wcag: '2.4.1', impact: 'moderate' },
    { id: 'color-contrast', wcag: '1.4.3', impact: 'serious' },
    { id: 'click-events-key', wcag: '2.1.1', impact: 'serious' },
    { id: 'focus-visible', wcag: '2.4.7', impact: 'serious' },
    { id: 'target-size', wcag: '2.5.5', impact: 'moderate' },
    { id: 'tabindex-positive', wcag: '2.4.3', impact: 'moderate' },
    { id: 'duplicate-id', wcag: '4.1.1', impact: 'minor' },
    { id: 'aria-valid', wcag: '4.1.2', impact: 'serious' }
  ];

  function attrs(tag) {
    var out = {};
    (tag.match(/[-a-z]+(?:="[^"]*"|='[^']*'|=[^\s>]+)?/gi) || []).forEach(function (a) {
      var m = a.match(/^([-a-z]+)(?:=["']?([^"'>]*)["']?)?$/i);
      if (m) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2];
    });
    return out;
  }

  function auditHtml(p, rawHtml, cssText) {
    // strip comments + <script> bodies so markup inside them isn't audited
    var html = String(rawHtml)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
    var f = [];
    var push = function (rule, line, message, sample) {
      var r = RULES.filter(function (x) { return x.id === rule; })[0] || { impact: 'moderate', wcag: '' };
      f.push({ rule: rule, wcag: r.wcag, impact: r.impact, file: p, line: line, message: message, sample: sample ? String(sample).slice(0, 120).replace(/\s+/g, ' ') : undefined });
    };

    // 3.1.1
    if (!/<html[^>]*\blang\s*=\s*["']?[a-z]/i.test(html)) push('html-lang', 1, '<html> is missing a valid lang attribute');

    // 1.1.1
    var im;
    var imgRe = /<img\b[^>]*>/gi;
    while ((im = imgRe.exec(html))) {
      var a = attrs(im[0]);
      if (!('alt' in a) && !a['aria-hidden'] && a['role'] !== 'presentation' && a['role'] !== 'none')
        push('image-alt', lineOf(html, im.index), '<img> without an alt attribute (use alt="" if decorative)', im[0]);
    }

    // 2.4.4 link name
    var lk, lkRe = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    while ((lk = lkRe.exec(html))) {
      var la = attrs(lk[0].match(/<a\b[^>]*>/i)[0]);
      var text = lk[1].replace(/<[^>]+>/g, '').trim();
      var innerImgAlt = (lk[1].match(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!text && !innerImgAlt && !la['aria-label'] && !la['aria-labelledby'] && !la['title'])
        push('link-name', lineOf(html, lk.index), 'link has no discernible text', lk[0]);
    }

    // 4.1.2 button name
    var bt, btRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    while ((bt = btRe.exec(html))) {
      var ba = attrs(bt[0].match(/<button\b[^>]*>/i)[0]);
      var btext = bt[1].replace(/<[^>]+>/g, '').trim();
      var bimg = (bt[1].match(/\balt\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!btext && !bimg && !ba['aria-label'] && !ba['aria-labelledby'] && !ba['title'])
        push('button-name', lineOf(html, bt.index), 'button has no accessible name', bt[0]);
    }

    // 1.3.1 / 3.3.2 form control labels
    var forAttrs = (html.match(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi) || []).map(function (s) { return (s.match(/for\s*=\s*["']([^"']+)["']/i) || [])[1]; });
    var ctl, ctlRe = /<(input|select|textarea)\b[^>]*>/gi;
    while ((ctl = ctlRe.exec(html))) {
      var ca = attrs(ctl[0]);
      if (ctl[1].toLowerCase() === 'input' && /^(hidden|submit|button|reset|image)$/i.test(ca['type'] || '')) continue;
      var snippet = ctl[0].slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var wrapped = new RegExp('<label\\b[^>]*>[\\s\\S]{0,400}' + snippet).test(html);
      var labelled = (ca['id'] && forAttrs.indexOf(ca['id']) >= 0) || ca['aria-label'] || ca['aria-labelledby'] || ca['title'] || wrapped;
      if (!labelled)
        push('label', lineOf(html, ctl.index), '<' + ctl[1] + '> has no associated label (a placeholder is not a label)', ctl[0]);
    }

    // 1.3.1 heading order
    var levels = (html.match(/<h([1-6])\b/gi) || []).map(function (s) { return +s.replace(/\D/g, ''); });
    for (var i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1)
      push('heading-order', 1, 'heading level jumps from h' + levels[i - 1] + ' to h' + levels[i] + ' (skips a level)');
    if (levels.length && levels[0] !== 1) push('heading-order', 1, 'first heading is h' + levels[0] + ', not h1');

    // 2.4.1 main landmark
    if (/<body[\s>]/i.test(html) && !/<main\b|role\s*=\s*["']main["']/i.test(html))
      push('landmark-main', 1, 'no <main> landmark / role="main" — screen-reader + skip-link navigation has no target');

    // 2.1.1 click handlers on non-interactive elements
    var ce, ceRe = /<(div|span|li|p|td|img|i|a)\b[^>]*\bon(click|mousedown|mouseup)\s*=[^>]*>/gi;
    while ((ce = ceRe.exec(html))) {
      var ea = attrs(ce[0]);
      var tag = ce[1].toLowerCase();
      if (tag === 'a' && ea['href']) continue;
      var keyboardOk = ('onkeydown' in ea) || ('onkeypress' in ea) || ('onkeyup' in ea);
      var focusable = ('tabindex' in ea) || tag === 'a';
      var roled = 'role' in ea;
      if (!keyboardOk || !focusable || !roled)
        push('click-events-key', lineOf(html, ce.index), '<' + tag + '> has a mouse handler but is not keyboard-operable (needs tabindex + role + a key handler)', ce[0]);
    }

    // 2.4.3 positive tabindex
    var tp, tpRe = /\btabindex\s*=\s*["']?(\d+)/gi;
    while ((tp = tpRe.exec(html))) if (+tp[1] > 0) push('tabindex-positive', lineOf(html, tp.index), 'tabindex="' + tp[1] + '" (> 0) breaks the natural focus order — use 0 or -1');

    // 4.1.1 duplicate id
    var ids = {}, di, diRe = /\bid\s*=\s*["']([^"']+)["']/gi;
    while ((di = diRe.exec(html))) { ids[di[1]] = (ids[di[1]] || 0) + 1; }
    Object.keys(ids).forEach(function (k) { if (ids[k] > 1) push('duplicate-id', 1, 'id "' + k + '" is used ' + ids[k] + ' times'); });

    // 4.1.2 invalid role / bad aria
    var ro, roRe = /\brole\s*=\s*["']([^"']+)["']/gi;
    while ((ro = roRe.exec(html))) if (!VALID_ROLES.test(ro[1].trim().split(/\s+/)[0])) push('aria-valid', lineOf(html, ro.index), 'role="' + ro[1] + '" is not a valid ARIA role');
    var ar, arRe = /\b(aria-[a-z]+)\s*=\s*["']([^"']*)["']/gi;
    var ARIA_BOOL = /^aria-(hidden|expanded|checked|selected|pressed|disabled|required|invalid|busy|current|modal|multiline|multiselectable|readonly|atomic)$/;
    while ((ar = arRe.exec(html))) {
      if (ARIA_BOOL.test(ar[1]) && !/^(true|false|mixed|page|step|location|date|time|undefined|)$/.test(ar[2].trim()))
        push('aria-valid', lineOf(html, ar.index), ar[1] + '="' + ar[2] + '" — expected a boolean/token value');
    }

    // 2.4.7 focus indicator
    var css = cssRules(cssText + '\n' + ((html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || ''));
    var killsOutline = css.some(function (r) { return /:focus\b/.test(r.selector) && /outline\s*:\s*(none|0)/.test(JSON.stringify(r.decl)); });
    var addsFocusStyle = css.some(function (r) { return /:focus(-visible)?\b/.test(r.selector) && /(box-shadow|border|outline\s*:\s*(?!none|0)|background)/.test(JSON.stringify(r.decl)); });
    var globalKill = css.some(function (r) { return /\*|:focus/.test(r.selector) && /outline\s*:\s*(none|0)/.test(JSON.stringify(r.decl)); });
    if ((killsOutline || globalKill) && !addsFocusStyle)
      push('focus-visible', 1, 'CSS removes the focus outline (outline:none) without providing a visible replacement (:focus-visible box-shadow/border)');

    // 1.4.3 contrast — body text + button + inline styles
    var bg = null, fg = null;
    css.forEach(function (r) {
      if (/^(body|html|:root)$/.test(r.selector.trim())) { if (r.decl['background'] || r.decl['background-color']) bg = (r.decl['background'] || r.decl['background-color']).split(/\s+/)[0]; if (r.decl['color']) fg = r.decl['color']; }
    });
    var inl, inlRe = /style\s*=\s*["']([^"']*color[^"']*)["']/gi;
    var checked = 0;
    while ((inl = inlRe.exec(html)) && checked < 40) {
      var d = {};
      (inl[1].match(/[-a-z]+\s*:\s*[^;]+/gi) || []).forEach(function (x) { var kv = x.split(':'); d[kv[0].trim()] = kv.slice(1).join(':').trim(); });
      var c = d['color'] || fg, b = d['background'] || d['background-color'] || bg || '#ffffff';
      if (c && b) {
        var ratio = contrastRatio(c, b);
        checked++;
        if (ratio != null && ratio < 4.5)
          push('color-contrast', lineOf(html, inl.index), 'text contrast ' + ratio.toFixed(2) + ':1 (needs ≥ 4.5:1 for normal text) — ' + c + ' on ' + b, inl[0]);
      }
    }
    css.forEach(function (r) {
      var c = r.decl['color'], b = r.decl['background'] || r.decl['background-color'];
      if (c && b) {
        var ratio = contrastRatio(c.split(/\s+/)[0], b.split(/\s+/)[0]);
        if (ratio != null && ratio < 4.5)
          push('color-contrast', 1, r.selector.trim() + ': contrast ' + ratio.toFixed(2) + ':1 (needs ≥ 4.5:1)');
      }
    });

    // 2.5.5 target size — interactive elements with a tiny CSS box
    css.forEach(function (r) {
      if (!/button|\[data-del\]|\.btn|\.icon|a\b/.test(r.selector)) return;
      var h = parseFloat(r.decl['height'] || ''), w = parseFloat(r.decl['width'] || ''), pad = parseFloat(r.decl['padding'] || '');
      if ((h && h < 24 && !pad) || (w && w < 24 && !pad))
        push('target-size', 1, r.selector.trim() + ': interactive target ~' + (h || w) + 'px (WCAG 2.5.5 recommends ≥ 24×24px)');
    });

    return f;
  }

  function audit() {
    var htmlFiles = files(/\.html?$/);
    var cssFiles = files(/\.css$/);
    var cssText = cssFiles.map(read).join('\n');
    var findings = [];
    if (!htmlFiles.length) {
      var report0 = { generatedAt: Date.now(), findings: [], byImpact: {}, score: 100, clean: true, checks: RULES.map(function (r) { return r.id; }), note: 'no HTML in the workspace — accessibility audit not applicable' };
      if (S()) S().write('a11y-findings.json', report0);
      return report0;
    }
    htmlFiles.forEach(function (p) { findings = findings.concat(auditHtml(p, read(p), cssText)); });

    var byImpact = findings.reduce(function (m, x) { m[x.impact] = (m[x.impact] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (byImpact.critical || 0) * 20 - (byImpact.serious || 0) * 10 - (byImpact.moderate || 0) * 4 - (byImpact.minor || 0) * 1);
    var report = {
      generatedAt: Date.now(), findings: findings, byImpact: byImpact, score: score,
      clean: !(byImpact.critical || byImpact.serious),
      checks: RULES.map(function (r) { return { id: r.id, wcag: r.wcag }; }),
      standard: 'WCAG 2.1 AA (static subset)'
    };
    if (S()) {
      S().write('a11y-findings.json', report);
      S().write('a11y-report.md',
        '# Accessibility audit (WCAG 2.1 AA — static)\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Score ' + score + '/100** — ' + (byImpact.critical || 0) + ' critical, ' + (byImpact.serious || 0) + ' serious, ' + (byImpact.moderate || 0) + ' moderate, ' + (byImpact.minor || 0) + ' minor\n\n' +
        (findings.length ? findings.map(function (x) {
          return '- **' + x.impact.toUpperCase() + '** `' + x.rule + '` (WCAG ' + x.wcag + ') ' + x.file + (x.line > 1 ? ':' + x.line : '') + ' — ' + x.message;
        }).join('\n') : '_No accessibility violations found in the static audit._') + '\n');
      try {
        var ds = JSON.parse(S().read('decision-state.json') || '{}');
        ds.accessibility = { at: report.generatedAt, score: score, critical: byImpact.critical || 0, serious: byImpact.serious || 0 };
        S().write('decision-state.json', ds);
      } catch (_) {}
    }
    return report;
  }

  function load() { try { return JSON.parse((S() && S().read('a11y-findings.json')) || 'null'); } catch (_) { return null; } }

  Engine.A11y = { RULES: RULES, audit: audit, load: load, contrastRatio: contrastRatio, parseColor: parseColor };
  console.info('[A11y] WCAG accessibility audit ready — Engine.A11y');
})();
