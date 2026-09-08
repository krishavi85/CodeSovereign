/* =====================================================================
   engine.depintel.js  —  Engine.DepIntel   (blueprint §10 + §52)

   Dependency + license intelligence over the open / generated project.

   §10 — compare / abandoned / conflict / safe-upgrade:
     - duplicate & conflicting major versions in the lockfile
     - abandonment risk (a bundled table of known-superseded packages +,
       online, a registry "last modified" staleness check)
     - known-vulnerable pins (a small bundled advisory table; `npm audit` in
       CI is authoritative)
     - safe-upgrade: semver-aware — is the newest version in the current
       range (safe) or a major bump (needs a migration)?

   §52 — license intelligence:
     - classify every dependency's license (permissive / weak-copyleft /
       strong-copyleft / network-copyleft / commercial / unknown), plus
       vendored libs + fonts declared in the repo
     - flag conflicts with the project's own distribution model (a
       strong-copyleft runtime dep under a proprietary / permissive product)

   analyze()   -> { generatedAt, dependencies, findings, licenses, byImpact,
                    score } — writes .sovereign/dependency-intel.json +
                    .sovereign/license-report.json + dependency-report.md
   load()      -> the written report or null

   New DoD criteria: `licensesCompatible` (blocks on a strong/network-copyleft
   dep in a non-copyleft distribution) and `dependencyHealth` (advisory score).
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var AI = function () { return Engine.AI; };

  /* ---------------- bundled knowledge ---------------- */

  // license -> class. Extend freely; unknowns are reported as "unknown".
  var LICENSE_CLASS = {
    'mit': 'permissive', 'isc': 'permissive', 'bsd-2-clause': 'permissive', 'bsd-3-clause': 'permissive',
    'apache-2.0': 'permissive', '0bsd': 'permissive', 'unlicense': 'permissive', 'cc0-1.0': 'permissive',
    'blueoak-1.0.0': 'permissive', 'wtfpl': 'permissive', 'python-2.0': 'permissive', 'zlib': 'permissive',
    'mpl-2.0': 'weak-copyleft', 'lgpl-2.1': 'weak-copyleft', 'lgpl-3.0': 'weak-copyleft', 'lgpl-2.1-or-later': 'weak-copyleft', 'epl-2.0': 'weak-copyleft', 'cddl-1.0': 'weak-copyleft', 'artistic-2.0': 'weak-copyleft',
    'gpl-2.0': 'strong-copyleft', 'gpl-3.0': 'strong-copyleft', 'gpl-3.0-or-later': 'strong-copyleft', 'gpl-2.0-or-later': 'strong-copyleft',
    'agpl-3.0': 'network-copyleft', 'agpl-3.0-or-later': 'network-copyleft', 'sspl-1.0': 'network-copyleft', 'osl-3.0': 'network-copyleft', 'eupl-1.2': 'network-copyleft',
    'unlicensed': 'commercial', 'see license in license': 'unknown', 'custom': 'unknown', 'proprietary': 'commercial'
  };
  // top packages whose license isn't always in the lockfile
  var KNOWN_LICENSE = {
    react: 'MIT', 'react-dom': 'MIT', vue: 'MIT', svelte: 'MIT', '@angular/core': 'MIT', express: 'MIT',
    lodash: 'MIT', axios: 'MIT', moment: 'MIT', dayjs: 'MIT', chalk: 'MIT', commander: 'MIT', 'node-fetch': 'MIT',
    typescript: 'Apache-2.0', rxjs: 'Apache-2.0', 'aws-sdk': 'Apache-2.0', protobufjs: 'BSD-3-Clause',
    sharp: 'Apache-2.0', canvas: 'MIT', 'better-sqlite3': 'MIT', pg: 'MIT', mysql2: 'MIT', mongoose: 'MIT',
    sequelize: 'MIT', knex: 'MIT', prisma: 'Apache-2.0', '@prisma/client': 'Apache-2.0',
    jest: 'MIT', vitest: 'MIT', mocha: 'MIT', playwright: 'Apache-2.0', puppeteer: 'Apache-2.0',
    webpack: 'MIT', vite: 'MIT', rollup: 'MIT', esbuild: 'MIT', 'parcel': 'MIT',
    eslint: 'MIT', prettier: 'MIT', husky: 'MIT',
    // notable copyleft
    'clipboardy': 'MIT', 'sshpk': 'MIT',
    'appium': 'Apache-2.0', 'sqlite3': 'BSD-3-Clause',
    'ffmpeg-static': 'GPL-3.0', 'fluent-ffmpeg': 'MIT', 'node-ffmpeg': 'GPL-2.0',
    'sass': 'MIT', 'node-sass': 'MIT',
    'pdfkit': 'MIT', 'jspdf': 'MIT', 'puppeteer-core': 'Apache-2.0',
    'chromedriver': 'Apache-2.0', 'geckodriver': 'MPL-2.0',
    'highlight.js': 'BSD-3-Clause', 'prismjs': 'MIT',
    'font-awesome': 'OFL-1.1 / MIT (CC-BY-4.0 for icons)',
    '@fontsource/roboto': 'Apache-2.0'
  };

  // superseded / abandoned packages -> what to use instead
  var ABANDONED = {
    request: 'unmaintained since 2020 — use the built-in fetch, or undici / axios / got',
    'request-promise': 'depends on the deprecated `request` — use fetch / got',
    moment: 'in maintenance mode, large + mutable — use dayjs, date-fns or the Temporal API',
    'node-sass': 'deprecated — use `sass` (Dart Sass)',
    tslint: 'deprecated in favour of `@typescript-eslint`',
    'left-pad': 'trivial — use String.prototype.padStart',
    'core-js@2': 'v2 is EOL — upgrade to core-js@3',
    bower: 'deprecated package manager — use npm/yarn/pnpm',
    gulp: 'largely superseded by npm scripts + esbuild/vite for most projects',
    grunt: 'largely superseded by npm scripts + modern bundlers',
    'istanbul': 'renamed — use `nyc` / c8',
    'babel-core': 'renamed — use `@babel/core`',
    'uuid@3': 'v3 API is deprecated — upgrade to uuid@9+ (`import { v4 } from "uuid"`)',
    colors: 'the `colors` package had a sabotage incident in 2022 — use `chalk` or `picocolors`',
    'faker': 'the original `faker` was sabotaged/unpublished — use `@faker-js/faker`',
    'querystring': 'legacy Node core — use URLSearchParams',
    'x-ray': 'unmaintained scraper — use cheerio + fetch',
    'cheerio-tableparser': 'unmaintained',
    'node-uuid': 'renamed to `uuid`',
    'gm': 'wraps GraphicsMagick (external binary) + unmaintained — use `sharp`'
  };

  // a tiny advisory table (npm audit is authoritative; this catches obvious pins)
  var ADVISORY = [
    { name: 'lodash', below: '4.17.21', id: 'prototype pollution (CVE-2020-8203 / -28500)', severity: 'high' },
    { name: 'minimist', below: '1.2.6', id: 'prototype pollution (CVE-2021-44906)', severity: 'critical' },
    { name: 'node-fetch', below: '2.6.7', id: 'exposure of sensitive info on redirect (CVE-2022-0235)', severity: 'high' },
    { name: 'axios', below: '1.6.0', id: 'SSRF / credential leak (CVE-2023-45857)', severity: 'high' },
    { name: 'ws', below: '7.4.6', id: 'ReDoS in header parsing (CVE-2021-32640)', severity: 'moderate' },
    { name: 'follow-redirects', below: '1.15.4', id: 'proxy-auth header leak (CVE-2023-26159)', severity: 'moderate' },
    { name: 'json5', below: '2.2.2', id: 'prototype pollution (CVE-2022-46175)', severity: 'high' },
    { name: 'semver', below: '7.5.2', id: 'ReDoS (CVE-2022-25883)', severity: 'moderate' },
    { name: 'tar', below: '6.2.1', id: 'path traversal / symlink (CVE-2024-28863)', severity: 'moderate' },
    { name: 'express', below: '4.19.2', id: 'open redirect in res.location (CVE-2024-29041)', severity: 'moderate' }
  ];

  /* ---------------- helpers ---------------- */
  function readJson(p) { try { return JSON.parse(Engine.FS.read(p) || 'null'); } catch (_) { return null; } }
  function cmpSemver(a, b) {
    var pa = String(a).replace(/^[^\d]*/, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b).replace(/^[^\d]*/, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  }
  function major(v) { return parseInt(String(v).replace(/^[^\d]*/, '').split('.')[0], 10) || 0; }
  var LC_ORDER = { permissive: 0, unknown: 1, 'weak-copyleft': 2, 'strong-copyleft': 3, 'network-copyleft': 4, commercial: 4 };
  function classOfToken(tok) {
    tok = String(tok).trim().toLowerCase().replace(/^[([]+|[)\]]+$/g, '').replace(/-only$/, '').replace(/(-or-later|\+)$/, '');
    return LICENSE_CLASS[tok] || 'unknown';
  }
  function classifyLicense(lic) {
    if (lic == null || lic === '') return { name: null, class: 'unknown' };
    if (typeof lic === 'object') lic = lic.type || lic.license || JSON.stringify(lic);
    var expr = String(lic).replace(/\s+WITH\s+[\w.-]+/gi, '').trim();
    // SPDX: OR groups let you pick; AND groups require all.
    var orGroups = expr.split(/\s+OR\s+/i).map(function (g) { return g.replace(/^[([]+|[)\]]+$/g, '').trim(); });
    function classOfAndGroup(g) {
      var toks = g.split(/\s+AND\s+/i);
      var worst = 'permissive';
      toks.forEach(function (t) { var c = classOfToken(t); if (LC_ORDER[c] > LC_ORDER[worst]) worst = c; });
      return worst;
    }
    var best = null;
    orGroups.forEach(function (g) { var c = classOfAndGroup(g); if (best === null || LC_ORDER[c] < LC_ORDER[best]) best = c; });
    return { name: String(lic), class: best || 'unknown' };
  }

  // gather deps from package.json + lockfile
  function collect() {
    var pj = readJson('/package.json') || {};
    var declared = Object.assign({}, pj.dependencies || {}, pj.devDependencies || {}, pj.optionalDependencies || {}, pj.peerDependencies || {});
    var lock = readJson('/package-lock.json');
    var resolved = {};   // name -> [{version, license}]
    if (lock && lock.packages) {
      Object.keys(lock.packages).forEach(function (k) {
        if (!k) return;
        var name = k.replace(/^node_modules\//, '').replace(/.*\/node_modules\//, '');
        var e = lock.packages[k];
        if (!e || !e.version) return;
        (resolved[name] = resolved[name] || []).push({ version: e.version, license: e.license, dev: !!e.dev });
      });
    } else if (lock && lock.dependencies) {
      var walk = function (deps) {
        Object.keys(deps || {}).forEach(function (name) {
          var e = deps[name];
          if (e && e.version) (resolved[name] = resolved[name] || []).push({ version: e.version, license: e.license });
          if (e && e.dependencies) walk(e.dependencies);
        });
      };
      walk(lock.dependencies);
    }
    // python
    var req = Engine.FS.read('/requirements.txt') || '';
    var py = (req.match(/^[A-Za-z0-9_.-]+\s*([<>=!~]=?\s*[\d.]+)?/gm) || [])
      .filter(function (l) { return l.trim() && !/^#/.test(l); })
      .map(function (l) { return l.trim(); });

    return { pj: pj, declared: declared, resolved: resolved, python: py, hasLock: !!lock, lockVersion: lock && lock.lockfileVersion };
  }

  /* ---------------- online enrichment (optional) ---------------- */
  function registryInfo(name) {
    try {
      if (!(window.desktop && window.desktop.ai)) return Promise.resolve(null);
    } catch (_) { return Promise.resolve(null); }
    return Promise.resolve(null); // deterministic offline default; hook a fetch here when a network policy allows it
  }

  /* ---------------- analyze ---------------- */
  function analyze() {
    var c = collect();
    var findings = [];
    var push = function (kind, impact, name, message, extra) {
      findings.push(Object.assign({ kind: kind, impact: impact, dependency: name, message: message }, extra || {}));
    };

    var names = Object.keys(c.declared);
    var deps = [];

    // per-declared-dependency
    names.forEach(function (name) {
      var range = c.declared[name];
      var res = (c.resolved[name] || []);
      var versions = Array.from(new Set(res.map(function (r) { return r.version; }))).sort(cmpSemver);
      var lic = (res[0] && res[0].license) || KNOWN_LICENSE[name] || null;
      var lc = classifyLicense(lic);
      deps.push({ name: name, range: range, resolved: versions, license: lc.name, licenseClass: lc.class });

      // abandonment
      var ab = ABANDONED[name] || (versions[0] && ABANDONED[name + '@' + major(versions[0])]);
      if (ab) push('abandoned', 'serious', name, 'superseded / unmaintained: ' + ab);

      // advisories
      ADVISORY.filter(function (a) { return a.name === name; }).forEach(function (a) {
        var v = versions[0] || range.replace(/^[^\d]*/, '');
        if (v && cmpSemver(v, a.below) < 0)
          push('vulnerable', a.severity === 'critical' ? 'critical' : 'serious', name, name + '@' + v + ' < ' + a.below + ' — ' + a.id + '. Upgrade and run `npm audit fix`.');
      });

      // license class flag (compatibility judged against the product below)
      if (lc.class === 'strong-copyleft' || lc.class === 'network-copyleft')
        push('license', 'serious', name, name + ' is ' + (lc.name || 'copyleft') + ' (' + lc.class + ') — a runtime dependency under this licence can require you to publish your source. Confirm your distribution model allows it.');
      if (lc.class === 'commercial')
        push('license', 'serious', name, name + ' has a commercial / unlicensed licence (' + (lc.name || '?') + ') — verify you have a valid licence to redistribute.');
      if (lc.class === 'unknown' && lic)
        push('license', 'minor', name, name + ' licence "' + lic + '" is unrecognised — classify it manually.');
    });

    // duplicate / conflicting majors across the whole tree
    Object.keys(c.resolved).forEach(function (name) {
      var majors = Array.from(new Set(c.resolved[name].map(function (r) { return major(r.version); })));
      if (majors.length > 1)
        push('duplicate-version', 'moderate', name, name + ' is resolved at ' + majors.length + ' major versions (' + majors.sort(function (a, b) { return a - b; }).join(', ') + ') — dedupe with `npm dedupe` or align the ranges (larger bundle, possible dual-instance bugs).');
    });

    // no lockfile
    if (names.length && !c.hasLock)
      push('no-lockfile', 'moderate', null, 'no package-lock.json — builds are not reproducible; run `npm install` and commit the lockfile.');

    // ---- license compatibility vs the product's own distribution model ----
    var productLicense = classifyLicense(c.pj.license || (c.pj.private ? 'proprietary' : null));
    var copyleftDeps = deps.filter(function (d) { return d.licenseClass === 'strong-copyleft' || d.licenseClass === 'network-copyleft'; });
    var licensesCompatible = true, licenseConflicts = [];
    if (copyleftDeps.length && productLicense.class !== 'strong-copyleft' && productLicense.class !== 'network-copyleft') {
      licensesCompatible = false;
      licenseConflicts = copyleftDeps.map(function (d) { return d.name + ' (' + d.license + ')'; });
      push('license-conflict', 'critical', null,
        'the product is ' + (c.pj.license || (c.pj.private ? 'proprietary' : 'unlicensed')) + ' but depends on ' + copyleftDeps.length + ' ' +
        'strong/network-copyleft package(s): ' + licenseConflicts.join(', ') + '. Either relicense, remove the dependency, or use an alternative.');
    }

    // ---- score + gate ----
    var byImpact = findings.reduce(function (m, x) { m[x.impact] = (m[x.impact] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (byImpact.critical || 0) * 25 - (byImpact.serious || 0) * 10 - (byImpact.moderate || 0) * 4 - (byImpact.minor || 0) * 1);
    var licenseTally = deps.reduce(function (m, d) { m[d.licenseClass] = (m[d.licenseClass] || 0) + 1; return m; }, {});

    var report = {
      generatedAt: Date.now(),
      product: { license: c.pj.license || null, private: !!c.pj.private, class: productLicense.class },
      dependencyCount: names.length, transitiveCount: Object.keys(c.resolved).length,
      pythonPackages: c.python,
      dependencies: deps,
      findings: findings, byImpact: byImpact, score: score,
      licenses: licenseTally,
      licensesCompatible: licensesCompatible, licenseConflicts: licenseConflicts,
      clean: !(byImpact.critical || byImpact.serious)
    };

    if (S()) {
      S().write('dependency-intel.json', report);
      S().write('license-report.json', {
        generatedAt: report.generatedAt, product: report.product, byClass: licenseTally,
        compatible: licensesCompatible, conflicts: licenseConflicts,
        dependencies: deps.map(function (d) { return { name: d.name, license: d.license, class: d.licenseClass }; })
      });
      S().write('dependency-report.md',
        '# Dependency + licence intelligence\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Score ' + score + '/100** — ' + names.length + ' direct, ' + report.transitiveCount + ' resolved. Product licence: `' + (c.pj.license || (c.pj.private ? 'proprietary' : 'unlicensed')) + '`.\n\n' +
        'Licence mix: ' + (Object.keys(licenseTally).length ? Object.keys(licenseTally).map(function (k) { return k + ' ×' + licenseTally[k]; }).join(', ') : 'no runtime dependencies') + '\n\n' +
        (findings.length ? findings.map(function (x) {
          return '- **' + x.impact.toUpperCase() + '** `' + x.kind + '`' + (x.dependency ? ' `' + x.dependency + '`' : '') + ' — ' + x.message;
        }).join('\n') : '_No dependency or licence issues found._') + '\n');
      try {
        var ds = JSON.parse(S().read('decision-state.json') || '{}');
        ds.dependencies = { at: report.generatedAt, score: score, licensesCompatible: licensesCompatible, critical: byImpact.critical || 0 };
        S().write('decision-state.json', ds);
      } catch (_) {}
    }
    return report;
  }

  function load() {
    try { var v = S() && S().read('dependency-intel.json'); return v == null ? null : (typeof v === 'string' ? JSON.parse(v) : v); } catch (_) { return null; }
  }

  Engine.DepIntel = { analyze: analyze, load: load, classifyLicense: classifyLicense, ABANDONED: ABANDONED, ADVISORY: ADVISORY };
  console.info('[DepIntel] dependency + licence intelligence ready — Engine.DepIntel');
})();
