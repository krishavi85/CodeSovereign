/* =====================================================================
   engine.buildmatrix.js  —  Engine.BuildMatrix   (blueprint §34)

   ONE truthful per-target status board. Reads the target-verification
   evidence every adapter already wrote and reduces it to a row per
   target: what was requested, what this host could actually run, the
   per-stage result, the blockers, and the honest verdict —
   PASS / PARTIAL / BLOCKED / NOT_REQUESTED (never a blanket "supported").

   window.Engine.BuildMatrix
     compute()  -> { generatedAt, requestedTarget, rows:[...], summary }
                   (also writes .sovereign/build-matrix.json)
     load()     -> the written matrix or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  function j(p) { try { var v = S() && S().read(p); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; } }

  var TARGETS = [
    { key: 'web',        label: 'Web (Node/Python)',          ev: 'execution-evidence.json',   web: true },
    { key: 'desktop',    label: 'Native desktop (Tauri/Electron)', ev: 'desktop-evidence.json' },
    { key: 'extension',  label: 'Browser extension (MV3)',     ev: 'extension-evidence.json' },
    { key: 'android',    label: 'Native Android',              ev: 'mobile-evidence.json' },
    { key: 'ios',        label: 'Native iOS',                  ev: 'mobile-ios-evidence.json' },
    { key: 'evm',        label: 'EVM smart contracts',         ev: 'blockchain-evidence.json' },
    { key: 'ml-training',label: 'ML training',                 ev: 'ml-evidence.json' }
  ];

  function webRow() {
    var ex = j('execution-evidence.json');
    var dod = j('definition-of-done.json');
    if (!ex && !dod) return { target: 'web', label: 'Web (Node/Python)', status: 'NOT_RUN', host: 'this host', stages: {}, blockers: ['no execution evidence — run the desktop app / a full analyze'], evidenceFile: null };
    var g = (ex && ex.gates) || {};
    var stages = { test: g.testsPass === true ? 'PASS' : g.testsPass === false ? 'FAIL' : 'NOT_RUN',
      build: g.buildPasses === true ? 'PASS' : g.buildPasses === false ? 'FAIL' : 'NOT_RUN',
      lint: g.lintClean === true ? 'PASS' : g.lintClean === false ? 'FAIL' : 'NOT_RUN' };
    var vals = Object.keys(stages).map(function (k) { return stages[k]; });
    var status = vals.indexOf('FAIL') >= 0 ? 'FAIL' : vals.every(function (v) { return v === 'PASS'; }) ? 'PASS' : 'PARTIAL';
    return { target: 'web', label: 'Web (Node/Python)', status: status, host: 'this host', stages: stages,
      blockers: vals.indexOf('NOT_RUN') >= 0 ? ['some gates not run'] : [], evidenceFile: 'execution-evidence.json' };
  }

  function adapterRow(t, requested) {
    var ev = j(t.ev);
    if (!ev || ev.present === false) {
      return { target: t.key, label: t.label, status: requested ? 'NOT_RUN' : 'NOT_REQUESTED',
        host: null, stages: {}, blockers: requested ? ['requested but no evidence yet'] : [], evidenceFile: null };
    }
    var stages = ev.stages || ev.iosStages || {};
    var status = ev.status || (ev.support === 'SUPPORTED' ? 'GENERATED' : 'UNKNOWN');
    // normalise to the board vocabulary
    var norm = /PASS|VERIFIED/i.test(status) ? 'PASS'
      : /PARTIAL/i.test(status) ? 'PARTIAL'
      : /BLOCKED|CREDENTIAL|REQUIRED/i.test(status) ? 'BLOCKED'
      : /FAIL|ERROR/i.test(status) ? 'FAIL'
      : /GENERATED|VALID/i.test(status) ? 'GENERATED' : 'UNKNOWN';
    var blockers = [];
    if (ev.reason) blockers.push(ev.reason + (ev.need ? ' — ' + ev.need : ''));
    (ev.blockers || []).forEach(function (b) { blockers.push(typeof b === 'string' ? b : (b.stage + ': ' + b.reason)); });
    return { target: t.key, label: t.label, status: norm,
      host: ev.framework || ev.platform || null, stages: stages, blockers: blockers, evidenceFile: t.ev };
  }

  function compute() {
    var contract = Engine.Contract && Engine.Contract.load && Engine.Contract.load();
    var requested = (contract && contract.target) || 'web';
    var rows = [webRow()];
    TARGETS.filter(function (t) { return !t.web; }).forEach(function (t) {
      rows.push(adapterRow(t, requested === t.key));
    });
    var reqRow = rows.filter(function (r) { return r.target === requested; })[0] || rows[0];
    var summary = 'Requested target: ' + requested + ' → ' + (reqRow ? reqRow.status : 'UNKNOWN') + '. '
      + rows.filter(function (r) { return r.status !== 'NOT_REQUESTED' && r.status !== 'NOT_RUN'; })
          .map(function (r) { return r.target + '=' + r.status; }).join(', ') + '.';
    var matrix = { generatedAt: Date.now(), capability: 'build-matrix', requestedTarget: requested,
      requestedStatus: reqRow ? reqRow.status : 'UNKNOWN', rows: rows, summary: summary };
    if (S()) S().write('build-matrix.json', matrix);
    return matrix;
  }

  function load() { return j('build-matrix.json'); }

  Engine.BuildMatrix = { compute: compute, load: load, TARGETS: TARGETS };
  console.info('[BuildMatrix] per-target status board ready — Engine.BuildMatrix');
})();
