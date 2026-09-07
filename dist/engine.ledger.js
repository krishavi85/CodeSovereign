/* =====================================================================
   engine.ledger.js  —  Engine.Ledger

   The Evidence Ledger: for every requirement in the Product Contract,
   check its acceptance criteria against the `.sovereign/` evidence that
   analyze() / runEvidence() / observe() already produced, and record a
   CLAIM -> EVIDENCE -> CONFIDENCE row. Never re-runs anything.

   window.Engine.Ledger
     build(contract?)   -> ledger object (also writes .sovereign/evidence-ledger.json)
     load()             -> the written ledger or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine || !Engine.FS) { console.error('[Ledger] Engine.FS missing'); return; }
  var S = function () { return Engine.Sovereign; };
  // Sovereign.read() returns a PARSED object for *.json — never double-parse.
  function sovJSON(p) {
    try {
      var v = S() && S().read(p);
      if (v == null) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } }
      return v;
    } catch (_) { return null; }
  }
  function sovText(p) { try { var v = S() && S().read(p); return typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v)); } catch (_) { return ''; } }
  function has(p) { try { return Engine.FS.exists(p); } catch (_) { return false; } }

  // Only RUNTIME-observed controls carry a verdict. A static-only "MOCK" guess
  // (a button wired via addEventListener, a form with no inline onsubmit) is an
  // observation gap, not a confirmed fake, and must not fail a requirement. The
  // one thing the static scanner IS sure about: a dead `href="#"` link.
  function controlIndex() {
    var idx = {};
    var inv = sovJSON('interaction-inventory.json');
    ((inv && inv.interactions) || []).forEach(function (it) {
      var k = String(it.name || '').toLowerCase().trim();
      if (!k) return;
      if (it.control === 'a' && (it.href === '#' || /^javascript:void/.test(it.href || ''))) idx[k] = 'MOCK';
    });
    var tr = sovJSON('runtime-trace.json');
    ((tr && tr.trace) || []).forEach(function (t) {
      var k = String((t.control && t.control.name) || '').toLowerCase().trim();
      if (k) idx[k] = t.status;                  // observed truth always wins
    });
    return idx;
  }

  function checkCriterion(c, ctx) {
    // -> { kind, check, ref, result: 'PASS'|'FAIL'|'NA' }
    var out = { kind: c.kind, check: c.check || null, ref: null, result: 'NA' };
    if (c.kind === 'execution') {
      var g = (ctx.evidence && ctx.evidence.gates) || {};
      out.ref = 'execution-evidence.json#gates.' + c.gate;
      out.check = 'gate ' + c.gate + ' passes';
      out.result = g[c.gate] === true ? 'PASS' : (c.gate in g ? 'FAIL' : 'NA');
    } else if (c.kind === 'control') {
      var st = ctx.controls[String(c.name || '').toLowerCase().trim()] || null;
      out.ref = 'interaction-inventory.json / runtime-trace.json';
      out.check = 'control "' + c.name + '" observed ' + (c.want || 'REAL');
      // PASS only on the wanted status; FAIL only when demonstrably fake/broken;
      // anything else (wired-but-not-observed, skipped, unknown) is unproven (NA).
      if (st == null) out.result = 'NA';
      else if (st === (c.want || 'REAL')) out.result = 'PASS';
      else if (st === 'MOCK' || st === 'BROKEN') out.result = 'FAIL';
      else out.result = 'NA';
    } else if (c.kind === 'no-mock') {
      var bad = Object.keys(ctx.controls).filter(function (k) {
        return ctx.controls[k] === 'MOCK' || ctx.controls[k] === 'BROKEN';
      });
      out.ref = 'interaction-inventory.json';
      out.check = 'no MOCK/BROKEN production control';
      out.result = Object.keys(ctx.controls).length === 0 ? 'NA' : (bad.length === 0 ? 'PASS' : 'FAIL');
      if (bad.length) out.detail = bad.slice(0, 8);
    } else if (c.kind === 'file') {
      out.ref = c.path;
      out.check = 'file ' + c.path + ' exists';
      out.result = has(c.path) ? 'PASS' : 'FAIL';
    } else if (c.kind === 'ci') {
      var pipe = sovJSON('pipeline-inventory.json');
      var gaps = sovJSON('pipeline-gaps.json');
      out.ref = 'pipeline-inventory.json / pipeline-gaps.json';
      out.check = 'CI runs test + build';
      if (!pipe || !(pipe.count > 0)) { out.result = 'NA'; }
      else {
        var txt = JSON.stringify(pipe).toLowerCase();
        var runsTest = /test/.test(txt), runsBuild = /build|dist/.test(txt);
        var missing = ((gaps && gaps.gaps) || []).some(function (g) { return /trigger|test|build/i.test(g.kind || g.why || ''); });
        out.result = (runsTest && runsBuild && !missing) ? 'PASS' : 'FAIL';
      }
    }
    return out;
  }

  function build(contract) {
    contract = contract || (Engine.Contract && Engine.Contract.load());
    if (!contract || !Array.isArray(contract.requirements)) {
      return { ok: false, reason: 'no product contract — run Engine.Contract.derive() first' };
    }
    var ctx = {
      evidence: sovJSON('execution-evidence.json') || {},
      controls: controlIndex()
    };
    var claims = [];
    var totals = { verified: 0, partial: 0, unverified: 0, failures: 0, assertions: 0 };

    contract.requirements.forEach(function (r) {
      var evidence = (r.acceptanceCriteria || []).map(function (c) { return checkCriterion(c, ctx); });
      var machine = evidence.filter(function (e) { return e.result !== 'NA'; });
      var pass = machine.filter(function (e) { return e.result === 'PASS'; }).length;
      var fail = machine.filter(function (e) { return e.result === 'FAIL'; }).length;
      totals.assertions += machine.length;
      totals.failures += fail;

      var confidence;
      if (machine.length === 0) confidence = 'UNVERIFIED';          // only manual / no criteria
      else if (fail === 0) confidence = 'VERIFIED';
      else if (pass > 0) confidence = 'PARTIAL';
      else confidence = 'FAILING';

      if (confidence === 'VERIFIED') totals.verified++;
      else if (confidence === 'PARTIAL') totals.partial++;
      else totals.unverified++;

      r.status = confidence.toLowerCase();
      claims.push({
        requirementId: r.id,
        claim: r.statement,
        category: r.category,
        evidence: evidence,
        assertions: machine.length,
        failures: fail,
        confidence: confidence
      });
    });

    var ledger = {
      generatedAt: Date.now(),
      contractGeneratedAt: contract.generatedAt,
      product: contract.product,
      totals: Object.assign({ requirements: contract.requirements.length }, totals),
      claims: claims
    };
    if (S()) {
      S().write('evidence-ledger.json', ledger);
      S().write('product-contract.json', contract);   // persist updated per-requirement status
    }
    return ledger;
  }

  function load() { return sovJSON('evidence-ledger.json'); }

  Engine.Ledger = { build: build, load: load };
  console.info('[Ledger] evidence ledger ready — Engine.Ledger');
})();
