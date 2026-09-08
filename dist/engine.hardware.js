/* =====================================================================
   engine.hardware.js  —  Engine.Hardware

   Host inventory for the AI router and the cross-platform build matrix
   (GodMode blueprint §32). Desktop: the real probe over the preload
   bridge. Browser: the little the platform exposes.

   window.Engine.Hardware
     probe()      -> Promise<hw>   (cached ~60s)
     get()        -> last hw or null
     summary()    -> one-line string
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var cache = null;

  function browserProbe() {
    var nav = window.navigator || {};
    var cores = nav.hardwareConcurrency || null;
    var ramGB = nav.deviceMemory || null;               // coarse, capped at 8 by the spec
    var gpu = { vendor: 'unknown', name: 'not available in browser', vramGB: 0 };
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          gpu = { vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || 'gpu',
                  name: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'gpu', vramGB: null };
        }
      }
    } catch (_) { /* ignore */ }
    return {
      at: Date.now(), host: 'browser',
      platform: (nav.platform || 'web'), arch: 'unknown', osRelease: null,
      cpu: { model: 'unknown', cores: cores, speedMHz: null },
      ram: { totalGB: ramGB, freeGB: null, approx: true },
      gpu: gpu, effectiveVramGB: gpu.vramGB || 0,
      toolchains: {}, partial: true
    };
  }

  function probe() {
    if (cache && Date.now() - cache.at < 60000) return Promise.resolve(cache);
    var D = window.desktop;
    if (D && D.isDesktop && D.hardware && D.hardware.probe) {
      return D.hardware.probe().then(function (hw) {
        if (hw && hw.ok === false) { cache = browserProbe(); return cache; }
        hw.host = 'desktop';
        cache = hw;
        return hw;
      }).catch(function () { cache = browserProbe(); return cache; });
    }
    cache = browserProbe();
    return Promise.resolve(cache);
  }

  function get() { return cache; }

  function summary(hw) {
    hw = hw || cache;
    if (!hw) return 'hardware not probed';
    var g = hw.gpu || {};
    var vram = hw.effectiveVramGB ? (hw.effectiveVramGB + ' GB' + (g.unifiedMemory ? ' unified' : ' VRAM'))
      : (g.vendor === 'none' || !g.vendor ? 'no GPU accel' : 'VRAM unknown');
    return (hw.cpu && hw.cpu.cores ? hw.cpu.cores + '-core ' : '') +
      (hw.cpu && hw.cpu.model && hw.cpu.model !== 'unknown' ? hw.cpu.model + ' · ' : '') +
      (hw.ram && hw.ram.totalGB ? hw.ram.totalGB + ' GB RAM · ' : '') +
      (g.name && g.name !== 'no discrete GPU detected' ? g.name + ' (' + vram + ')' : vram);
  }

  Engine.Hardware = { probe: probe, get: get, summary: summary };
  console.info('[Hardware] host inventory ready — Engine.Hardware');
})();
