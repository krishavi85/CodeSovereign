/* =====================================================================
   engine.bootstrap.js  —  Engine.Bootstrap   (blueprint §33)

   Environment bootstrapper. Reads the repo's runtime requirements
   (`package.json` engines / `.nvmrc` / `requirements.txt` / `go.mod` /
   `Cargo.toml` / a Gradle wrapper) and emits:

     /scripts/doctor.js   a dependency-free check — every required runtime
                          present + at or above the minimum version, with
                          the exact fix command when it is not
     /scripts/setup.sh    POSIX one-shot: verify → install deps → migrate
     /scripts/setup.ps1   the Windows equivalent
     /docs/DEVELOPMENT.md  the human "get a dev box ready" guide

   It never installs anything itself — it verifies and tells the user the
   exact command (`nvm install`, `pyenv`, `brew`, `apt`, `winget`).

   window.Engine.Bootstrap
     plan()      -> { runtimes:[…], steps:[…] }
     files()     -> { path: content }
     analyze()   -> writes .sovereign/bootstrap.json + report
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function read(p) { try { return (FS() && FS().read(p)) || ''; } catch (_) { return ''; } }
  function has(p) { try { return !!(FS() && FS().isFile(p)); } catch (_) { return false; } }
  function pkg() { try { return JSON.parse(read('/package.json') || 'null'); } catch (_) { return null; } }
  function keys(re) { try { return Object.keys(FS()._data || {}).filter(function (k) { return re.test(k); }); } catch (_) { return []; } }

  function plan() {
    var runtimes = [];
    var p = pkg();

    // Node
    if (p || has('/server.js') || has('/index.js')) {
      var nodeMin = (p && p.engines && p.engines.node) || read('/.nvmrc').trim() || '>=18';
      runtimes.push({
        name: 'Node.js', bin: 'node', min: String(nodeMin).replace(/[^\d.]/g, '') || '18',
        check: 'node --version',
        fix: 'install Node ' + nodeMin + ' — nvm: `nvm install ' + (String(nodeMin).replace(/[^\d]/g, '').slice(0, 2) || '20') + '`, or https://nodejs.org'
      });
      var pm = has('/pnpm-lock.yaml') ? 'pnpm' : has('/yarn.lock') ? 'yarn' : has('/bun.lockb') ? 'bun' : 'npm';
      if (pm !== 'npm') runtimes.push({ name: pm, bin: pm, min: null, check: pm + ' --version', fix: 'npm i -g ' + pm });
    }
    // Python
    if (has('/requirements.txt') || has('/pyproject.toml') || has('/app/main.py') || keys(/\.py$/).length) {
      var pyMin = read('/runtime.txt').replace(/python-/i, '').trim() || (p && p.pythonVersion) || '3.10';
      runtimes.push({ name: 'Python', bin: 'python3', min: pyMin, check: 'python3 --version',
        fix: 'install Python ' + pyMin + '+ — pyenv: `pyenv install ' + pyMin + '`, or https://python.org' });
    }
    // Go
    if (has('/go.mod')) {
      var goMin = (read('/go.mod').match(/^go\s+([\d.]+)/m) || [])[1] || '1.21';
      runtimes.push({ name: 'Go', bin: 'go', min: goMin, check: 'go version', fix: 'install Go ' + goMin + '+ — https://go.dev/dl' });
    }
    // Rust
    if (has('/Cargo.toml') || keys(/Cargo\.toml$/).length) {
      runtimes.push({ name: 'Rust', bin: 'cargo', min: null, check: 'cargo --version', fix: 'install Rust — `curl https://sh.rustup.rs -sSf | sh`' });
    }
    // Java / Gradle (Android)
    if (keys(/(build\.gradle|gradlew)$/).length) {
      runtimes.push({ name: 'JDK', bin: 'java', min: '17', check: 'java -version', fix: 'install a JDK 17+ (Temurin) — https://adoptium.net' });
      runtimes.push({ name: 'Android SDK', bin: null, min: null, check: 'echo $ANDROID_HOME', fix: 'set ANDROID_HOME + install platform-tools via Android Studio or `sdkmanager`' });
    }
    // Docker (optional — only if compose/k8s exist)
    if (has('/docker-compose.prod.yml') || has('/Dockerfile')) {
      runtimes.push({ name: 'Docker', bin: 'docker', min: null, optional: true, check: 'docker --version', fix: 'optional — needed only for the container targets: https://docs.docker.com/get-docker' });
    }

    var scr = (p && p.scripts) || {};
    var pmName = has('/pnpm-lock.yaml') ? 'pnpm' : has('/yarn.lock') ? 'yarn' : 'npm';
    var steps = [];
    steps.push({ label: 'verify toolchain', cmd: 'node scripts/doctor.js' });
    if (p) steps.push({ label: 'install dependencies', cmd: has('/package-lock.json') && pmName === 'npm' ? 'npm ci' : pmName + ' install' });
    if (has('/requirements.txt')) steps.push({ label: 'install python deps', cmd: 'pip install -r requirements.txt' });
    if (scr.migrate) steps.push({ label: 'run migrations', cmd: pmName + ' run migrate' });
    if (scr.test) steps.push({ label: 'sanity check', cmd: pmName + ' test' });

    return { generatedAt: Date.now(), runtimes: runtimes, steps: steps };
  }

  function doctorJs(pl) {
    return [
      "'use strict';",
      "/* environment doctor — generated by CodeSovereign Engine.Bootstrap (§33).",
      "   checks every required runtime is present + at/above the minimum version.",
      "   exits non-zero if a required tool is missing. Installs nothing. */",
      "const cp = require('child_process');",
      "const RT = " + JSON.stringify(pl.runtimes.map(function (r) { return { name: r.name, bin: r.bin, min: r.min || null, check: r.check, fix: r.fix, optional: !!r.optional }; }), null, 0) + ";",
      "function ver(s) { const m = String(s).match(/(\\d+)\\.(\\d+)(?:\\.(\\d+))?/); return m ? [ +m[1], +m[2], +(m[3]||0) ] : null; }",
      "function gte(a, b) { for (let i=0;i<3;i++){ if ((a[i]||0) > (b[i]||0)) return true; if ((a[i]||0) < (b[i]||0)) return false; } return true; }",
      "let bad = 0, warn = 0;",
      "for (const r of RT) {",
      "  let out = '';",
      "  try { out = cp.execSync(r.check, { stdio: ['ignore','pipe','pipe'] }).toString().trim(); }",
      "  catch (e) { out = ''; }",
      "  if (!out) { if (r.optional) { console.warn('  ? ' + r.name + ' — not found (optional). ' + r.fix); warn++; }",
      "    else { console.error('  x ' + r.name + ' — NOT FOUND. ' + r.fix); bad++; } continue; }",
      "  if (r.min) { const have = ver(out), want = ver(r.min);",
      "    if (have && want && !gte(have, want)) { console.error('  x ' + r.name + ' ' + have.join('.') + ' < required ' + r.min + '. ' + r.fix); bad++; continue; } }",
      "  console.log('  ok ' + r.name + ' — ' + out.split('\\n')[0]);",
      "}",
      "console.log(bad ? '\\n' + bad + ' required tool(s) missing or too old.' : (warn ? '\\nToolchain OK (' + warn + ' optional missing).' : '\\nToolchain OK.'));",
      "process.exit(bad ? 1 : 0);",
      ""
    ].join('\n');
  }

  function setupSh(pl) {
    return '#!/usr/bin/env bash\n' +
      '# generated by CodeSovereign Engine.Bootstrap (§33) — verify + install, no sudo\n' +
      'set -euo pipefail\ncd "$(dirname "$0")/.."\n\n' +
      pl.steps.map(function (s) { return 'echo "==> ' + s.label + '"\n' + s.cmd; }).join('\n\n') + '\n\n' +
      'echo "==> ready. next: npm run dev"\n';
  }
  function setupPs1(pl) {
    return '# generated by CodeSovereign Engine.Bootstrap (§33)\n' +
      '$ErrorActionPreference = "Stop"\nSet-Location (Join-Path $PSScriptRoot "..")\n\n' +
      pl.steps.map(function (s) { return 'Write-Host "==> ' + s.label + '"\n' + s.cmd; }).join('\n\n') + '\n\n' +
      'Write-Host "==> ready. next: npm run dev"\n';
  }
  function devMd(pl) {
    return '# Development environment\n\n' +
      '_Generated by `Engine.Bootstrap`._\n\n' +
      '## Required toolchain\n\n' +
      '| Tool | Minimum | Check | If missing |\n|---|---|---|---|\n' +
      pl.runtimes.map(function (r) {
        return '| ' + r.name + (r.optional ? ' _(optional)_' : '') + ' | ' + (r.min || '—') + ' | `' + (r.check || '—') + '` | ' + r.fix + ' |';
      }).join('\n') + '\n\n' +
      '## One-shot setup\n\n```bash\n# macOS / Linux\nbash scripts/setup.sh\n\n# Windows (PowerShell)\npwsh scripts/setup.ps1\n```\n\n' +
      'Or step by step:\n\n```bash\n' + pl.steps.map(function (s) { return s.cmd + '   # ' + s.label; }).join('\n') + '\n```\n\n' +
      '`node scripts/doctor.js` verifies the toolchain at any time (CI runs it too).\n';
  }

  function files() {
    var pl = plan();
    return {
      '/scripts/doctor.js': doctorJs(pl),
      '/scripts/setup.sh': setupSh(pl),
      '/scripts/setup.ps1': setupPs1(pl),
      '/docs/DEVELOPMENT.md': devMd(pl)
    };
  }

  function analyze() {
    if (!FS() || !(has('/package.json') || has('/server.js') || has('/app/main.py'))) {
      if (S()) S().write('bootstrap.json', { generatedAt: Date.now(), present: false, note: 'no product repo' });
      return { present: false };
    }
    var pl = plan();
    var f = files();
    var wrote = [];
    Object.keys(f).forEach(function (p) { try { FS().write(p, f[p]); wrote.push(p); } catch (_) {} });
    var report = { generatedAt: pl.generatedAt, present: true,
      runtimes: pl.runtimes.map(function (r) { return r.name + (r.min ? ' >=' + r.min : '') + (r.optional ? ' (optional)' : ''); }),
      steps: pl.steps.map(function (s) { return s.label; }), wrote: wrote };
    if (S()) {
      S().write('bootstrap.json', report);
      S().write('bootstrap-report.md',
        '# Environment bootstrap\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        'Required: ' + report.runtimes.join(', ') + '\n\nSteps: ' + report.steps.join(' → ') + '\n\n' +
        '`scripts/doctor.js` + `scripts/setup.sh` / `scripts/setup.ps1` + `docs/DEVELOPMENT.md` written.\n');
    }
    return report;
  }

  function load() { try { var v = S() && S().read('bootstrap.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Bootstrap = { plan: plan, files: files, analyze: analyze, load: load };
  console.info('[Bootstrap] environment bootstrapper ready — Engine.Bootstrap');
})();
