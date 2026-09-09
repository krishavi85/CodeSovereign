/* =====================================================================
   engine.registry.js  —  Engine.Registry   (offline-plan §5)

   Prove a generated npm package really publishes + installs — without
   npmjs.com. A local registry (Verdaccio) is the full path; a tarball
   round-trip (`npm pack` → clean-consumer `npm install <tarball>`) is
   the always-available fallback.

       generate package
         → npm test
         → npm pack
         → [Verdaccio] npm publish --registry <local>
         → clean consumer project
         → npm install <package>
         → import + smoke test
         → PASS

   Status model (offline-plan §5):
       PACKAGE_BUILD          = PASS
       LOCAL_REGISTRY_PUBLISH = PASS  (Verdaccio) | LOCAL_TARBALL_INSTALL = PASS
       LOCAL_CONSUMER_INSTALL = PASS
       NPMJS_EXTERNAL_PUBLISH = BLOCKED_CREDENTIAL_REQUIRED

   window.Engine.Registry
     plan()             -> { runtime, stages, install }
     verify(opts?)      -> Promise<{ status, stages, reason?, need? }>
     analyze()          -> writes .sovereign/registry-evidence.json
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function adapters() { return window.CSAdapters || null; }
  function isLib() {
    try {
      var p = JSON.parse((FS() && FS().read('/package.json')) || 'null');
      return !!(p && (p.main || p.exports || p.bin) && p.name && !/^(app|server|server\.js)$/.test(p.name) && !(p.scripts && p.scripts.dev && /server\.js/.test(p.scripts.dev)));
    } catch (_) { return false; }
  }

  function plan() {
    return {
      capability: 'npm-package-publish',
      support: 'SUPPORTED',
      runtime: 'Verdaccio (local registry) with an `npm pack` tarball round-trip fallback',
      stages: ['npm test', 'npm pack', 'publish to a local registry', 'clean-consumer install', 'import + smoke'],
      install: { verdaccio: 'npm i -g verdaccio  (https://github.com/verdaccio/verdaccio)' },
      external: { NPMJS_EXTERNAL_PUBLISH: 'BLOCKED_CREDENTIAL_REQUIRED — needs an npm account + token' }
    };
  }

  function persist(res) {
    if (!S()) return;
    S().write('registry-evidence.json', {
      generatedAt: Date.now(), capability: 'npm-package-publish', support: 'SUPPORTED',
      status: res.status, reason: res.reason || null, need: res.need || null,
      registry: res.registry || null,
      stages: res.stages || null,
      packageName: res.packageName || null, version: res.version || null,
      external: { NPMJS_EXTERNAL_PUBLISH: 'BLOCKED_CREDENTIAL_REQUIRED' }
    });
  }

  function verify(opts) {
    opts = opts || {};
    if (!isLib()) {
      var na = { status: 'BLOCKED', reason: 'NOT_A_LIBRARY_PACKAGE', need: 'a package.json with `main` / `exports` / `bin` and a real package name (this looks like an application, not a publishable library)' };
      persist(na); return Promise.resolve(na);
    }
    var A = adapters();
    if (!A || !A.run) {
      var b = { status: 'BLOCKED', reason: 'RUNTIME_BRIDGE_UNAVAILABLE', need: 'the desktop app with a folder open — npm pack / Verdaccio run through the local process bridge' };
      persist(b); return Promise.resolve(b);
    }
    return Promise.resolve(A.run('registry', { useVerdaccio: opts.useVerdaccio !== false })).then(function (r) {
      r = r || { status: 'FAIL', reason: 'ADAPTER_NO_RESULT' };
      persist(r); return r;
    }, function (e) {
      var f = { status: 'FAIL', reason: 'ADAPTER_ERROR', detail: String(e && e.message || e) };
      persist(f); return f;
    });
  }

  function analyze() {
    if (!isLib()) {
      var none = { generatedAt: Date.now(), present: false, capability: 'npm-package-publish', support: 'SUPPORTED', note: 'the generated project is an application, not a publishable library — nothing to publish' };
      if (S()) S().write('registry-evidence.json', none);
      return none;
    }
    var prev = load();
    return prev || { generatedAt: Date.now(), present: true, capability: 'npm-package-publish', support: 'SUPPORTED', status: 'PENDING', note: 'run Engine.Registry.verify() to prove the publish + install round-trip' };
  }

  function load() { try { var v = S() && S().read('registry-evidence.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Registry = { plan: plan, verify: verify, analyze: analyze, load: load, _isLib: isLib };
  console.info('[Registry] local npm publish proof (Verdaccio / tarball) ready — Engine.Registry');
})();
