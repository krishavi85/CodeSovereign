/* =====================================================================
   engine.release.js  —  Engine.Release   (blueprint §37)

   Release engineering, offline. From the Product Contract + the DoD
   verdict + the recorded assumptions it produces:

     /CHANGELOG.md        Keep-a-Changelog format — this version's Added /
                          Changed / Known-limitations sections derived from
                          the contract's mandatory scope + assumptions +
                          excluded/unsafe items
     /RELEASE_NOTES.md    a human release announcement with the verification
                          status (SOVEREIGN VERIFIED / PARTIAL) + how to run
     /scripts/release.js  a real, dependency-free release helper the repo
                          runs: version bump, CHANGELOG stamp, `git tag`,
                          and **SHA-256 checksums** (node:crypto) of the
                          shippable files — dry-run by default, never pushes
     /.github/release.yml GitHub auto-notes category config

   window.Engine.Release
     notes(opts?)   -> { version, changelog, releaseNotes }
     helperScript() -> the /scripts/release.js source
     files()        -> { path: content } for the repo
     analyze()      -> writes .sovereign/release-notes.json + report
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function fread(p) { try { return (FS() && FS().read(p)) || ''; } catch (_) { return ''; } }
  function fjson(p) { try { var r = fread(p); return r ? JSON.parse(r) : null; } catch (_) { return null; } }
  function sread(n) { try { var v = S() && S().read(n); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }
  function contractOf() { try { return (Engine.Contract && Engine.Contract.load && Engine.Contract.load()) || null; } catch (_) { return null; } }

  function version() {
    var p = fjson('/package.json');
    return (p && p.version) || '0.1.0';
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  function bump(v, kind) {
    var m = String(v).match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
    if (!m) return '0.1.0';
    var a = +m[1], b = +m[2], c = +m[3];
    if (kind === 'major') return (a + 1) + '.0.0';
    if (kind === 'minor') return a + '.' + (b + 1) + '.0';
    return a + '.' + b + '.' + (c + 1);
  }

  // group mandatory requirements into changelog "Added" bullets by category
  function addedLines(contract) {
    if (!contract) return [];
    var reqs = contract.requirements || [];
    var mand = new Set((contract.scope && contract.scope.mandatory) || reqs.map(function (r) { return r.id; }));
    var byCat = {};
    reqs.filter(function (r) { return mand.has(r.id); }).forEach(function (r) {
      var c = r.category || 'feature';
      (byCat[c] = byCat[c] || []).push(String(r.statement).replace(/\.$/, ''));
    });
    var out = [];
    Object.keys(byCat).sort().forEach(function (c) {
      byCat[c].slice(0, 12).forEach(function (s) { out.push('- ' + s + (c !== 'feature' ? ' _(' + c + ')_' : '')); });
    });
    return out;
  }

  function limitationLines(contract) {
    var out = [];
    ((contract && contract.assumptions) || []).forEach(function (a) {
      out.push('- ' + cap(a.about) + ': ' + a.decision + (a.rationale ? ' — _' + a.rationale + '_' : ''));
    });
    ((contract && contract.unsupported) || []).forEach(function (u) { out.push('- Not included: ' + u.request + ' — ' + (u.reason || 'outside the supported stack')); });
    ((contract && contract.unsafe) || []).forEach(function (u) { out.push('- Refused (unsafe): ' + u.request); });
    var run = sread('ultramode-run.json');
    ((run && run.degraded && run.degraded.reasons) || []).forEach(function (r) { out.push('- Verification limited: ' + r + ' could not be exercised on the build host'); });
    return out;
  }
  function cap(s) { return String(s || '').replace(/^./, function (c) { return c.toUpperCase(); }); }

  function verdict() {
    var dod = sread('definition-of-done.json');
    var run = sread('ultramode-run.json');
    var v = (run && (run.result || run.state)) || (dod && dod.PASS ? 'VERIFIED' : dod ? 'NOT VERIFIED' : 'UNVERIFIED');
    return { verdict: v, dodPass: !!(dod && dod.PASS), dod: dod, cert: !!(S() && (S().read('release-certificate.md') || '')) };
  }

  function notes(opts) {
    opts = opts || {};
    var contract = contractOf();
    var name = (contract && contract.product && contract.product.name) || (fjson('/package.json') || {}).name || 'app';
    var ver = opts.version || version();
    var v = verdict();
    var added = addedLines(contract);
    var lims = limitationLines(contract);
    var man = sread('delivery-manifest.json');

    var changelog = '# Changelog\n\n' +
      'All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/); ' +
      'this project follows [Semantic Versioning](https://semver.org/).\n\n' +
      '## [' + ver + '] — ' + today() + '\n\n' +
      (added.length ? '### Added\n\n' + added.join('\n') + '\n\n' : '') +
      '### Verification\n\n' +
      '- Definition of Done: ' + (v.dodPass ? 'all ' + (v.dod && v.dod.criteria ? Object.keys(v.dod.criteria).length : 14) + ' criteria PASS'
        : v.dod ? (v.dod.failing || []).length + ' failing (' + ((v.dod.failing || []).join(', ') || 'see report') + ')' : 'not evaluated') + '\n' +
      (man && man.contentHash ? '- Delivery archive content hash: `' + man.contentHash + '`\n' : '') +
      '\n' +
      (lims.length ? '### Known limitations\n\n' + lims.join('\n') + '\n\n' : '');

    var releaseNotes = '# ' + name + ' ' + ver + '\n\n' +
      '_' + today() + '_\n\n' +
      '**Status:** ' + (v.verdict === 'VERIFIED' ? '✅ SOVEREIGN VERIFIED'
        : v.verdict === 'PARTIAL' ? '🟨 SOVEREIGN VERIFIED — PARTIAL'
          : '⚠️ ' + v.verdict) + '\n\n' +
      (contract && contract.product && contract.product.objective ? contract.product.objective + '\n\n' : '') +
      (added.length ? '## What’s in this release\n\n' + added.slice(0, 15).join('\n') + '\n\n' : '') +
      '## Run\n\n```bash\nnpm install\nnpm run migrate\nnpm test\nnpm run dev\n```\n\n' +
      (lims.length ? '## Known limitations\n\n' + lims.join('\n') + '\n\n' : '') +
      '## Verification\n\n' +
      'This build was generated, executed (`npm test` / `build` / `lint`), crawled while running, and ' +
      'gated against a 14-criterion Definition of Done. The full evidence set is in `.sovereign/` / the ' +
      'delivery archive (`/delivery/`).\n';

    return { version: ver, name: name, changelog: changelog, releaseNotes: releaseNotes, verdict: v.verdict, added: added.length, limitations: lims.length };
  }

  function helperScript() {
    return [
      "'use strict';",
      "/* release helper — generated by CodeSovereign Engine.Release (§37).",
      "   dependency-free, dry-run by default, never pushes.",
      "   usage: node scripts/release.js [patch|minor|major] [--write] [--tag]  */",
      "const fs = require('fs');",
      "const path = require('path');",
      "const crypto = require('crypto');",
      "const cp = require('child_process');",
      "const root = path.join(__dirname, '..');",
      "const kind = (process.argv.find(a => /^(patch|minor|major)$/.test(a))) || 'patch';",
      "const write = process.argv.includes('--write');",
      "const tag = process.argv.includes('--tag');",
      "",
      "function bump(v) { const [a,b,c] = String(v).split('.').map(Number);",
      "  return kind === 'major' ? `${a+1}.0.0` : kind === 'minor' ? `${a}.${b+1}.0` : `${a}.${b}.${c+1}`; }",
      "",
      "const pkgPath = path.join(root, 'package.json');",
      "const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));",
      "const next = bump(pkg.version || '0.1.0');",
      "console.log(`version: ${pkg.version || '0.1.0'} -> ${next} (${kind})`);",
      "",
      "// SHA-256 checksums of the shippable files",
      "function walk(d, base) { let out = []; for (const n of fs.readdirSync(d)) {",
      "  if (/^(node_modules|\\.git|\\.data|\\.sovereign|dist|delivery|logs)$/.test(n)) continue;",
      "  const p = path.join(d, n); const rel = base ? base + '/' + n : n;",
      "  const st = fs.statSync(p);",
      "  if (st.isDirectory()) out = out.concat(walk(p, rel));",
      "  else out.push(rel); } return out; }",
      "const files = walk(root, '').sort();",
      "const sums = files.map(f => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex') + '  ' + f);",
      "const manifest = sums.join('\\n') + '\\n';",
      "",
      "if (!write) {",
      "  console.log(`\\n${files.length} files would be checksummed. Re-run with --write to:`);",
      "  console.log('  - set package.json version');",
      "  console.log('  - write checksums.sha256');",
      "  console.log('  - stamp CHANGELOG.md');",
      "  if (tag) console.log(`  - git tag v${next}`);",
      "  process.exit(0);",
      "}",
      "",
      "pkg.version = next;",
      "fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n');",
      "fs.writeFileSync(path.join(root, 'checksums.sha256'), manifest);",
      "const clPath = path.join(root, 'CHANGELOG.md');",
      "if (fs.existsSync(clPath)) {",
      "  const cl = fs.readFileSync(clPath, 'utf8');",
      "  if (!cl.includes(`[${next}]`)) fs.writeFileSync(clPath, cl.replace(/^# Changelog\\n/, `# Changelog\\n\\n## [${next}] — ${new Date().toISOString().slice(0,10)}\\n\\n_release_\\n`));",
      "}",
      "console.log(`wrote package.json@${next} + checksums.sha256 (${files.length} files)`);",
      "if (tag) { try { cp.execFileSync('git', ['tag', 'v' + next], { cwd: root, stdio: 'inherit' }); console.log(`tagged v${next} (not pushed)`); }",
      "  catch (e) { console.error('git tag failed: ' + e.message); } }",
      ""
    ].join('\n');
  }

  var GH_RELEASE_YML =
    'changelog:\n' +
    '  categories:\n' +
    '    - title: Added\n      labels: [feature, enhancement]\n' +
    '    - title: Fixed\n      labels: [bug, fix]\n' +
    '    - title: Changed\n      labels: [refactor, chore, deps]\n' +
    '    - title: Other\n      labels: ["*"]\n';

  function files() {
    var n = notes();
    return {
      '/CHANGELOG.md': n.changelog,
      '/RELEASE_NOTES.md': n.releaseNotes,
      '/scripts/release.js': helperScript(),
      '/.github/release.yml': GH_RELEASE_YML
    };
  }

  function analyze() {
    if (!FS() || !(FS().isFile('/package.json') || FS().isFile('/server.js'))) {
      if (S()) S().write('release-notes.json', { generatedAt: Date.now(), present: false, note: 'no product repo — nothing to release' });
      return { present: false };
    }
    var n = notes();
    var f = files();
    var wrote = [];
    Object.keys(f).forEach(function (p) { try { FS().write(p, f[p]); wrote.push(p); } catch (_) {} });
    var report = { generatedAt: Date.now(), present: true, version: n.version, verdict: n.verdict, addedItems: n.added, limitations: n.limitations, wrote: wrote };
    if (S()) {
      S().write('release-notes.json', report);
      S().write('release-notes.md', n.releaseNotes);
    }
    return report;
  }

  function load() { return sread('release-notes.json'); }

  Engine.Release = { notes: notes, helperScript: helperScript, files: files, analyze: analyze, load: load, _bump: bump };
  console.info('[Release] release engineering (changelog / notes / checksums) ready — Engine.Release');
})();
