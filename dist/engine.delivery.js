/* =====================================================================
   engine.delivery.js  —  Engine.Delivery   (blueprint §19-20)

   The delivery archive. Everything a stakeholder needs to accept a build,
   collected into ONE self-contained bundle:

     delivery/MANIFEST.json         — verdict, DoD result, file index, hash
     delivery/README.md             — human index: what this is, how to read
     delivery/release-certificate.md
     delivery/ultramode-report.md
     delivery/evidence/*.json       — contract, ledger, DoD, execution,
                                      runtime trace, a11y, visual, deps +
                                      licences, perf, security, privacy,
                                      architecture, target adapter evidence,
                                      documentation index
     delivery/continuation/         — ultramode-run.json + ultramode-plan.json
                                      (secret-scrubbed) so the run resumes
                                      on any machine
     delivery/docs/*.md             — the generated documentation set

   assemble() is pure + offline — it only reads the Sovereign store + FS.
   write() lays the bundle into Engine.FS under /delivery/ (so the desktop
   "Export ZIP" and the dedicated deliver:export IPC pick it up) and records
   `.sovereign/delivery-manifest.json`.

   window.Engine.Delivery
     manifest()   -> the summary object
     assemble()   -> { manifest, entries:[{ name, data }] }
     write()      -> { wrote:[...], manifest }   (into Engine.FS /delivery/)
     load()       -> the written delivery-manifest.json or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };
  var DIR = '/delivery';

  function sread(name) {
    try { var v = S() && S().read(name); return v == null ? null : v; } catch (_) { return null; }
  }
  function sraw(name) {
    // always return a string form (for writing into the bundle verbatim)
    var v = sread(name);
    if (v == null) return null;
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  }
  function fread(p) { try { return (FS() && FS().read(p)) || null; } catch (_) { return null; } }

  // cheap, dependency-free content hash (FNV-1a 32-bit) — an integrity check,
  // not a cryptographic one.
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // The evidence artifacts we fold in, in a sensible reading order. Each is
  // included only if it exists in the store.
  var EVIDENCE = [
    'product-contract.json',
    'evidence-ledger.json',
    'definition-of-done.json',
    'execution-evidence.json',
    'runtime-trace.json',
    'a11y-findings.json',
    'visual-findings.json',
    'visual-observations.json',
    'dependency-intel.json',
    'license-report.json',
    'perf-findings.json',
    'perf-report.json',
    'journey-evidence.json',
    'localization-findings.json',
    'security-findings.json',
    'privacy-findings.json',
    'architecture-findings.json',
    'feature-graph.json',
    'decision-log.json',
    'refactor-plan.json',
    'upgrade-plan.json',
    'cicd.json',
    'bootstrap.json',
    'release-notes.json',
    'design-spec.json',
    'mobile-evidence.json',
    'mobile-ios-evidence.json',
    'blockchain-evidence.json',
    'ml-evidence.json',
    'documentation-index.json'
  ];

  var DOC_FILES = [
    '/README.md', '/docs/API.md', '/docs/DATABASE.md',
    '/docs/DEPLOYMENT.md', '/docs/TROUBLESHOOTING.md', '/docs/DATA_MODEL.md',
    '/docs/TS_MIGRATION.md', '/docs/DECISIONS.md', '/docs/DEVELOPMENT.md',
    '/CHANGELOG.md', '/RELEASE_NOTES.md'
  ];

  function collect() {
    var out = { top: [], evidence: [], continuation: [], docs: [] };

    var cert = sraw('release-certificate.md');
    if (cert) out.top.push({ name: 'release-certificate.md', data: cert });
    var report = sraw('ultramode-report.md');
    if (report) out.top.push({ name: 'ultramode-report.md', data: report });
    var knownIssues = sraw('known-issues.md');
    if (knownIssues) out.top.push({ name: 'known-issues.md', data: knownIssues });

    // any catalogued evidence the store knows about, then our ordered list
    var seen = {};
    var extra = [];
    try { extra = (S() && S().list && S().list()) || []; } catch (_) {}
    EVIDENCE.concat(extra.filter(function (f) { return /\.json$/.test(f) && EVIDENCE.indexOf(f) < 0 && !/^ultramode-/.test(f); }))
      .forEach(function (name) {
        if (seen[name]) return; seen[name] = 1;
        var raw = sraw(name);
        if (raw != null) out.evidence.push({ name: 'evidence/' + name, data: raw });
      });

    var run = sraw('ultramode-run.json');
    if (run) out.continuation.push({ name: 'continuation/ultramode-run.json', data: run });
    var plan = sraw('ultramode-plan.json');
    if (plan) out.continuation.push({ name: 'continuation/ultramode-plan.json', data: plan });

    DOC_FILES.forEach(function (p) {
      var c = fread(p);
      if (c != null) out.docs.push({ name: 'docs/' + p.replace(/^\/(docs\/)?/, ''), data: c });
    });

    return out;
  }

  function dodSummary() {
    var dod = sread('definition-of-done.json');
    if (!dod || typeof dod === 'string') return null;
    var crit = dod.criteria || {};
    var keys = Object.keys(crit);
    var failing = dod.failing || keys.filter(function (k) { return !crit[k]; });
    return {
      pass: dod.pass === true || dod.passed === true || dod.status === 'PASS' || (keys.length > 0 && failing.length === 0),
      total: keys.length || dod.total || 0,
      passed: keys.length ? keys.length - failing.length : (dod.passed || 0),
      failing: failing,
      status: dod.status || null
    };
  }

  function verdict() {
    var run = sread('ultramode-run.json');
    if (run && typeof run === 'object' && (run.result || run.state)) return run.result || run.state;
    var cert = sread('release-certificate.md') || '';
    if (typeof cert === 'string') {
      if (/SOVEREIGN VERIFIED — PARTIAL/.test(cert)) return 'PARTIAL';
      if (/SOVEREIGN VERIFIED/.test(cert)) return 'VERIFIED';
    }
    var d = dodSummary();
    if (d) return d.pass ? 'VERIFIED' : 'INCOMPLETE';
    return 'UNKNOWN';
  }

  function manifest() {
    var parts = collect();
    var contract = sread('product-contract.json');
    var run = sread('ultramode-run.json');
    var d = dodSummary();
    var perf = sread('perf-findings.json');
    var all = parts.top.concat(parts.evidence, parts.continuation, parts.docs);
    var joined = all.map(function (e) { return e.name + '\n' + e.data; }).join('\n');
    var m = {
      kind: 'codesovereign-delivery-archive',
      version: 1,
      generatedAt: Date.now(),
      product: (contract && (contract.name || (contract.product && contract.product.name))) ||
               (run && run.contract && run.contract.name) || 'app',
      productType: (contract && contract.type) || (run && run.contract && run.contract.type) || null,
      verdict: verdict(),
      definitionOfDone: d,
      performance: (perf && perf.present) ? { p50: perf.p50, p95: perf.p95, p99: perf.p99, errors: perf.errors || 0, leak: !!perf.leak } : null,
      certificate: parts.top.some(function (e) { return e.name === 'release-certificate.md'; }),
      continuationIncluded: parts.continuation.length > 0,
      resumeState: (run && typeof run === 'object') ? (run.state || null) : null,
      counts: { evidence: parts.evidence.length, docs: parts.docs.length, continuation: parts.continuation.length },
      files: all.map(function (e) { return { path: e.name, bytes: e.data.length, sha: hash(e.data) }; }),
      contentHash: hash(joined)
    };
    return m;
  }

  function readme(m) {
    var L = [];
    L.push('# Delivery archive — ' + m.product + '\n');
    L.push('_Assembled ' + new Date(m.generatedAt).toISOString() + ' by CodeSovereign._\n');
    L.push('This is a self-contained acceptance package: the verdict, every piece of');
    L.push('verification evidence behind it, the generated documentation, and the');
    L.push('continuation state needed to resume the build on any machine.\n');
    L.push('## Verdict — **' + m.verdict + '**\n');
    if (m.definitionOfDone) {
      var d = m.definitionOfDone;
      L.push('- **Definition of Done:** ' + (d.pass ? '✅ all ' + d.total + ' criteria PASS'
        : '⚠️ ' + d.passed + '/' + d.total + ' PASS — failing: `' + (d.failing.join('`, `') || 'n/a') + '`'));
    }
    if (m.performance) L.push('- **Performance:** p50 ' + m.performance.p50 + 'ms · p95 ' + m.performance.p95 +
      'ms · p99 ' + m.performance.p99 + 'ms · ' + m.performance.errors + ' errors' + (m.performance.leak ? ' · ⚠️ memory-leak signal' : ''));
    L.push('- **Certificate:** ' + (m.certificate ? '`release-certificate.md` (in this bundle)' : 'not issued'));
    L.push('- **Content hash (FNV-1a):** `' + m.contentHash + '`');
    L.push('');
    L.push('## What is in here\n');
    L.push('| Path | Purpose |');
    L.push('|---|---|');
    L.push('| `MANIFEST.json` | machine-readable index + per-file hashes |');
    if (m.certificate) L.push('| `release-certificate.md` | the cross-gate SOVEREIGN VERIFIED certificate |');
    L.push('| `ultramode-report.md` | the full run narrative + requirement traceability |');
    L.push('| `evidence/` | every `.sovereign/` evidence file the verdict rests on (' + m.counts.evidence + ' files) |');
    L.push('| `continuation/` | `ultramode-run.json` + `ultramode-plan.json` — resume with `Engine.UltraMode.resume()` |');
    L.push('| `docs/` | generated README / API / DATABASE / DEPLOYMENT / TROUBLESHOOTING (' + m.counts.docs + ' files) |');
    L.push('');
    L.push('## How to verify this bundle\n');
    L.push('1. Read `release-certificate.md` and `evidence/definition-of-done.json`.');
    L.push('2. Cross-check the claims in `evidence/evidence-ledger.json` against the raw');
    L.push('   evidence files it references.');
    L.push('3. To re-run: drop `continuation/` back into `.sovereign/` and call');
    L.push('   `Engine.UltraMode.resume()` — it picks up from `' + (m.resumeState || 'the last state') + '`.');
    L.push('');
    L.push('Nothing here was pushed anywhere. Deployment still needs your credentials.');
    L.push('');
    return L.join('\n');
  }

  function assemble() {
    var m = manifest();
    var parts = collect();
    var entries = [];
    entries.push({ name: 'MANIFEST.json', data: JSON.stringify(m, null, 2) });
    entries.push({ name: 'README.md', data: readme(m) });
    parts.top.forEach(function (e) { entries.push(e); });
    parts.evidence.forEach(function (e) { entries.push(e); });
    parts.continuation.forEach(function (e) { entries.push(e); });
    parts.docs.forEach(function (e) { entries.push(e); });
    return { manifest: m, entries: entries };
  }

  function write() {
    var wrote = [];
    if (!FS()) return { wrote: wrote, manifest: null };
    var a = assemble();
    // clear a stale bundle first so removed evidence doesn't linger
    try { if (FS().remove) FS().remove(DIR); } catch (_) {}
    a.entries.forEach(function (e) {
      var p = DIR + '/' + e.name;
      try { FS().write(p, e.data); wrote.push(p); } catch (_) {}
    });
    if (S()) S().write('delivery-manifest.json', a.manifest);
    return { wrote: wrote, manifest: a.manifest };
  }

  function load() {
    var v = sread('delivery-manifest.json');
    return (v && typeof v === 'object') ? v : null;
  }

  Engine.Delivery = { DIR: DIR, manifest: manifest, assemble: assemble, write: write, load: load, _hash: hash };
  console.info('[Delivery] delivery-archive assembler ready — Engine.Delivery');
})();
