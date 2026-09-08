/* =====================================================================
   engine.upgrade.js  —  Engine.Upgrade   (blueprint §62)

   Autonomous dependency-upgrade engine. Offline, rules-driven: a bundled
   table of well-known upgrades, each with a risk rating, release notes,
   and — where the change is mechanical — a codemod (pure string/AST
   transforms). It never runs a package manager; it edits `package.json`
   + source and hands back the diff for the proof loop to verify.

   window.Engine.Upgrade
     RULES
     plan()                       -> { upgrades:[…], safeCount, majorCount }
     apply(name, { dryRun })      -> { applied, edits:[{path,before,after}], notes }
     analyze()                    -> writes .sovereign/upgrade-plan.json
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  // major of a semver range ("^4.18.2" -> 4, "~5" -> 5, "5.x" -> 5)
  function major(range) {
    var m = String(range || '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function codemodExpress5(src) {
    return src
      .replace(/\bapp\.del\(/g, 'app.delete(')
      .replace(/\breq\.param\(\s*(['"][^'"]+['"])\s*\)/g, '(req.params[$1] || req.body[$1] || req.query[$1])');
  }
  function codemodReact18(src) {
    var out = src
      .replace(/ReactDOM\.render\(\s*([\s\S]*?),\s*([A-Za-z0-9_.$]+)\s*\)/g,
        'ReactDOM.createRoot($2).render($1)')
      .replace(/import\s+ReactDOM\s+from\s+'react-dom'/g, "import ReactDOM from 'react-dom/client'")
      .replace(/require\('react-dom'\)/g, "require('react-dom/client')");
    return out;
  }
  function codemodChalk5(src) {
    // chalk 5 is ESM-only; the safe mechanical hint is to switch to a dynamic import
    return src.replace(/const\s+chalk\s*=\s*require\('chalk'\)/g,
      "const chalk = (await import('chalk')).default /* chalk@5 is ESM-only */");
  }
  function codemodNodeFetch(src) {
    return src
      .replace(/const\s+fetch\s*=\s*require\('node-fetch'\)\s*;?\n?/g, '')
      .replace(/import\s+fetch\s+from\s+'node-fetch'\s*;?\n?/g, '');
  }

  var RULES = [
    { name: 'express', fromMajor: 4, toMajor: 5, risk: 'medium',
      notes: 'Express 5: `app.del` removed (use `app.delete`), `req.param()` removed, path-route regex changes, promise-rejection handling improved.',
      codemodFiles: /\.(js|mjs|ts)$/, codemod: codemodExpress5 },
    { name: 'react', fromMajor: 17, toMajor: 18, risk: 'medium',
      notes: 'React 18: `ReactDOM.render` -> `ReactDOM.createRoot(el).render(...)`, automatic batching, StrictMode double-invokes effects in dev.',
      codemodFiles: /\.(jsx?|tsx?|mjs)$/, codemod: codemodReact18 },
    { name: 'react-dom', fromMajor: 17, toMajor: 18, risk: 'medium',
      notes: 'Bump with `react`. Import from `react-dom/client` for `createRoot`.',
      codemodFiles: /\.(jsx?|tsx?|mjs)$/, codemod: codemodReact18 },
    { name: 'chalk', fromMajor: 4, toMajor: 5, risk: 'high',
      notes: 'chalk 5 is pure ESM — `require(\'chalk\')` no longer works in CommonJS. Either stay on 4.x or convert the file to ESM / dynamic import.',
      codemodFiles: /\.(js|mjs)$/, codemod: codemodChalk5 },
    { name: 'node-fetch', fromMajor: 2, toMajor: 3, risk: 'low',
      notes: 'Node 18+ has global `fetch` — you can drop `node-fetch` entirely. This codemod removes the import; verify no v3-only APIs are used.',
      codemodFiles: /\.(js|mjs)$/, codemod: codemodNodeFetch },
    { name: 'uuid', fromMajor: 8, toMajor: 9, risk: 'low',
      notes: 'uuid 9 drops the deep `uuid/v4` import path — use `import { v4 as uuidv4 } from \'uuid\'`. No runtime behaviour change.',
      codemodFiles: /\.(js|mjs|ts)$/, codemod: function (s) { return s.replace(/require\('uuid\/v4'\)/g, "require('uuid').v4").replace(/from\s+'uuid\/v4'/g, "from 'uuid'"); } },
    { name: 'dotenv', fromMajor: 8, toMajor: 16, risk: 'low',
      notes: 'dotenv 16: no API change for `config()`; `.env` multiline values now need quotes. Safe bump.',
      codemodFiles: null, codemod: null },
    { name: 'jsonwebtoken', fromMajor: 8, toMajor: 9, risk: 'medium',
      notes: 'jsonwebtoken 9: drops Node < 12, stricter `algorithms` requirement on `verify`, `null`/`undefined` secrets now throw. Audit every `jwt.verify` call.',
      codemodFiles: null, codemod: null }
  ];

  function pkg() {
    try { return JSON.parse(FS().read('/package.json') || 'null'); } catch (_) { return null; }
  }
  function repoFiles(re) {
    try {
      return Object.keys(FS()._data).filter(function (p) {
        return FS().isFile(p) && re.test(p) && !/\/(node_modules|dist|build|vendor|\.sovereign)\//.test(p);
      });
    } catch (_) { return []; }
  }

  function plan() {
    var p = pkg();
    var deps = Object.assign({}, (p && p.dependencies) || {}, (p && p.devDependencies) || {});
    var advisories = null;
    try { advisories = (S() && S().read('dependency-intel.json')) || null; } catch (_) {}
    var advList = (advisories && advisories.advisories) || (advisories && advisories.vulnerabilities) || [];

    var upgrades = [];
    Object.keys(deps).forEach(function (name) {
      var cur = major(deps[name]);
      var rule = RULES.filter(function (r) { return r.name === name; })[0];
      var advisory = advList.filter(function (a) { return (a.name || a.module || a.dependency) === name; })[0];
      if (rule && cur != null && cur <= rule.fromMajor) {
        upgrades.push({
          name: name, current: deps[name], targetMajor: rule.toMajor,
          type: 'major', risk: rule.risk, hasCodemod: !!rule.codemod,
          notes: rule.notes, security: !!advisory
        });
      } else if (advisory) {
        upgrades.push({
          name: name, current: deps[name], targetMajor: cur,
          type: 'security', risk: 'security', hasCodemod: false,
          notes: 'Advisory: ' + (advisory.title || advisory.detail || advisory.severity || 'vulnerable version') + ' — bump to a patched release.',
          security: true
        });
      }
    });
    // sort: security first, then low-risk mechanical, then the rest
    var order = { security: 0, low: 1, medium: 2, high: 3 };
    upgrades.sort(function (a, b) { return (order[a.risk] || 9) - (order[b.risk] || 9); });
    return {
      generatedAt: Date.now(),
      dependencyCount: Object.keys(deps).length,
      upgrades: upgrades,
      safeCount: upgrades.filter(function (u) { return u.risk === 'low' || u.risk === 'security'; }).length,
      majorCount: upgrades.filter(function (u) { return u.type === 'major'; }).length
    };
  }

  function bumpVersion(range, toMajor) {
    var prefix = (String(range).match(/^[\^~]/) || [''])[0] || '^';
    return prefix + toMajor + '.0.0';
  }

  function apply(name, opts) {
    opts = opts || {};
    var rule = RULES.filter(function (r) { return r.name === name; })[0];
    if (!rule) return { applied: false, reason: 'NO_RULE_FOR_' + name };
    var p = pkg();
    if (!p) return { applied: false, reason: 'NO_PACKAGE_JSON' };
    var field = (p.dependencies && p.dependencies[name]) ? 'dependencies' : (p.devDependencies && p.devDependencies[name]) ? 'devDependencies' : null;
    if (!field) return { applied: false, reason: 'DEP_NOT_INSTALLED' };

    var edits = [];
    // 1) package.json version bump
    var before = JSON.stringify(p, null, 2) + '\n';
    p[field][name] = bumpVersion(p[field][name], rule.toMajor);
    var after = JSON.stringify(p, null, 2) + '\n';
    edits.push({ path: '/package.json', before: before, after: after });

    // 2) codemod every matching source file that references the package
    if (rule.codemod && rule.codemodFiles) {
      repoFiles(rule.codemodFiles).forEach(function (fp) {
        var src = FS().read(fp) || '';
        if (src.indexOf(name) < 0 && !/react-dom|createRoot|ReactDOM/.test(src)) return;
        var out = rule.codemod(src);
        if (out !== src) edits.push({ path: fp, before: src, after: out });
      });
    }

    if (!opts.dryRun) {
      edits.forEach(function (e) { try { FS().write(e.path, e.after); } catch (_) {} });
    }
    return {
      applied: !opts.dryRun, dryRun: !!opts.dryRun,
      name: name, from: JSON.parse(before)[field][name], to: p[field][name],
      edits: edits.map(function (e) { return { path: e.path, changed: e.before !== e.after }; }),
      fileEdits: edits,
      notes: rule.notes,
      followUp: 'run `npm install` then the evidence gates (npm test / build) — the loop verifies the upgrade'
    };
  }

  function analyze() {
    var p = plan();
    if (S()) {
      S().write('upgrade-plan.json', p);
      S().write('upgrade-report.md',
        '# Dependency upgrades\n\n_Generated ' + new Date(p.generatedAt).toISOString() + '_\n\n' +
        p.upgrades.length + ' upgrade(s) across ' + p.dependencyCount + ' dependencies — ' +
        p.safeCount + ' low-risk / security, ' + p.majorCount + ' major.\n\n' +
        (p.upgrades.length
          ? '| Package | Current | Target | Risk | Codemod | Notes |\n|---|---|---|---|---|---|\n' +
            p.upgrades.map(function (u) {
              return '| `' + u.name + '` | ' + u.current + ' | ' + (u.type === 'major' ? 'v' + u.targetMajor : 'patch') + ' | ' + u.risk + ' | ' + (u.hasCodemod ? 'yes' : '—') + ' | ' + String(u.notes).replace(/\|/g, '/').slice(0, 90) + ' |';
            }).join('\n') + '\n\n_Apply one with `Engine.Upgrade.apply(\'<name>\')` — it edits package.json + runs the codemod, then the proof loop verifies._\n'
          : '_Everything is current (no bundled rule or advisory matched)._\n'));
    }
    return p;
  }

  Engine.Upgrade = { RULES: RULES, plan: plan, apply: apply, analyze: analyze, _major: major, _bumpVersion: bumpVersion };
  console.info('[Upgrade] autonomous dependency-upgrade engine ready — Engine.Upgrade');
})();
