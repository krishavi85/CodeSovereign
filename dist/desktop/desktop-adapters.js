/* =====================================================================
   desktop-adapters.js  —  renderer bridge to the runtime adapters.

   window.CSAdapters:
     available()      -> desktop + a workspace open
     probe()          -> Promise<{ evm, android, ios, ml, host }>
     evm(opts)        -> Promise<result>   (solidity compile + local chain / forge)
     android(opts)    -> Promise<result>   (gradle build + emulator + adb)
     ios(opts)        -> Promise<result>   (xcodebuild + simulator; BLOCKED off-macOS)
     ml(opts)         -> Promise<result>   (real pytorch training run)

   result shape: { status: 'PASS'|'FAIL'|'BLOCKED', evidence?, reason?, need?, ... }
   No-op stub in a plain browser (returns a BLOCKED "desktop required").
   ===================================================================== */
(function () {
  'use strict';
  var D = window.desktop;
  var desktop = !!(D && D.isDesktop && D.adapters);

  function hasWorkspace() {
    try { return !!(window.Engine && window.Engine.FS && window.Engine.FS.__hasWorkspace && window.Engine.FS.__hasWorkspace()); }
    catch (_) { return false; }
  }

  function blocked(reason, need) {
    return Promise.resolve({ status: 'BLOCKED', reason: reason, need: need });
  }

  function unwrap(p) {
    return p.then(function (r) {
      // main returns { ok, data } for ok(), or { ok:false, error } for fail()
      if (r && r.ok === false) return { status: 'BLOCKED', reason: 'ADAPTER_ERROR', need: r.error || 'adapter call failed' };
      return (r && r.data !== undefined) ? r.data : r;
    }).catch(function (e) {
      return { status: 'BLOCKED', reason: 'ADAPTER_ERROR', need: String(e && e.message || e) };
    });
  }

  var CSAdapters = {
    available: function () { return desktop && hasWorkspace(); },
    isDesktop: function () { return desktop; },

    probe: function () {
      if (!desktop) return Promise.resolve({ host: { platform: 'browser' }, evm: { available: false }, android: { available: false }, ios: { available: false }, ml: { available: false } });
      return unwrap(D.adapters.probe());
    },

    evm: function (opts) {
      if (!desktop) return blocked('DESKTOP_REQUIRED', 'the blockchain adapter (solidity compile + local chain) runs in the desktop app');
      if (!hasWorkspace()) return blocked('NO_WORKSPACE', 'open the generated project folder first');
      return unwrap(D.adapters.run('evm', opts || {}));
    },
    android: function (opts) {
      if (!desktop) return blocked('DESKTOP_REQUIRED', 'the Android adapter (gradle + emulator) runs in the desktop app');
      if (!hasWorkspace()) return blocked('NO_WORKSPACE', 'open the generated project folder first');
      return unwrap(D.adapters.run('android', opts || {}));
    },
    ios: function (opts) {
      if (!desktop) return blocked('DESKTOP_REQUIRED', 'the iOS adapter runs in the desktop app (and needs a macOS worker)');
      if (!hasWorkspace()) return blocked('NO_WORKSPACE', 'open the generated project folder first');
      return unwrap(D.adapters.run('ios', opts || {}));
    },
    ml: function (opts) {
      if (!desktop) return blocked('DESKTOP_REQUIRED', 'the ML training adapter (pytorch) runs in the desktop app');
      if (!hasWorkspace()) return blocked('NO_WORKSPACE', 'open the generated project folder first');
      return unwrap(D.adapters.run('ml', opts || {}));
    },

    // generic dispatch — used by the offline-capability adapters
    // (audio / registry / sign / otel / extension / desktop) and any future kind
    run: function (kind, opts) {
      if (!desktop) return blocked('DESKTOP_REQUIRED', 'the "' + kind + '" runtime adapter runs in the desktop app through the local process bridge');
      if (!hasWorkspace()) return blocked('NO_WORKSPACE', 'open the generated project folder first');
      return unwrap(D.adapters.run(String(kind), opts || {}));
    }
  };

  window.CSAdapters = CSAdapters;
  console.info('[desktop-adapters] runtime adapter bridge ready — window.CSAdapters (' + (desktop ? 'desktop' : 'browser stub') + ')');
})();
