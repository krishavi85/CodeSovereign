/* =====================================================================
   engine.autonomy.js  —  Engine.Autonomy   (blueprint §69)

   Graduated control levels. The orchestrator / agents check
   Engine.Autonomy.allows(action) before doing anything with side effects,
   so the user picks how much runs without a prompt.

     assist    — analysis + advice only; no file writes, no commands
     build     — implement explicitly-named work; no auto-repair, no deploy
     engineer  — + implementation decisions within the contract; auto-repair
     autopilot — + plan, generate, test and repair in a loop
     ultra     — + package + deploy + release, fully autonomous

   window.Engine.Autonomy
     LEVELS
     get() / set(level)
     allows(action)   action ∈ generate|write|command|repair|observe|deploy|release|network
     gate(action, fn) — run fn only if allowed, else return { blocked: action }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var KEY = 'cs.autonomy.v1';

  var LEVELS = ['assist', 'build', 'engineer', 'autopilot', 'ultra'];
  var ALIASES = { godmode: 'ultra' };   // migrate any previously-saved value
  var CAPS = {
    assist:    { write: false, generate: false, command: false, repair: false, observe: true,  deploy: false, release: false, network: false },
    build:     { write: true,  generate: true,  command: true,  repair: false, observe: true,  deploy: false, release: false, network: false },
    engineer:  { write: true,  generate: true,  command: true,  repair: true,  observe: true,  deploy: false, release: false, network: true },
    autopilot: { write: true,  generate: true,  command: true,  repair: true,  observe: true,  deploy: false, release: true,  network: true },
    ultra:     { write: true,  generate: true,  command: true,  repair: true,  observe: true,  deploy: true,  release: true,  network: true }
  };

  function get() {
    try {
      var v = localStorage.getItem(KEY);
      if (ALIASES[v]) v = ALIASES[v];
      if (LEVELS.indexOf(v) >= 0) return v;
    } catch (_) {}
    return 'engineer';
  }
  function set(level) {
    if (ALIASES[level]) level = ALIASES[level];
    if (LEVELS.indexOf(level) < 0) return { ok: false, error: 'unknown level' };
    try { localStorage.setItem(KEY, level); } catch (_) {}
    return { ok: true, level: level };
  }
  function caps(level) {
    var l = level ? (ALIASES[level] || level) : get();
    return CAPS[l] || CAPS.engineer;
  }
  function allows(action) { return !!caps()[action]; }
  function gate(action, fn) {
    if (!allows(action)) return { blocked: action, level: get() };
    return fn();
  }
  function describe() {
    var lvl = get();
    return { level: lvl, index: LEVELS.indexOf(lvl), caps: caps(lvl),
      summary: { assist: 'advice only', build: 'do what I name', engineer: 'decide within the contract + repair',
        autopilot: 'plan → build → test → repair loop', ultra: 'everything incl. deploy + release' }[lvl] };
  }

  Engine.Autonomy = { LEVELS: LEVELS, CAPS: CAPS, get: get, set: set, caps: caps, allows: allows, gate: gate, describe: describe };
  console.info('[Autonomy] graduated control levels ready — Engine.Autonomy (' + get() + ')');
})();
