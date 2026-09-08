/* =====================================================================
   engine.agents.js  —  Engine.Agents   (blueprint §25, §26)

   The specialist agents, as real implementations that wrap the engines
   built elsewhere. One interface: agent.run(ctx) -> Promise<{ files?,
   report?, evidence?, note }>. The orchestrator maps a TaskGraph's
   `task.agent` to these; `pipeline()` runs the standard product order.

   Also arbitration: when agents disagree, resolve by the blueprint's
   hierarchy — product contract > architecture > security > performance > UI.

   window.Engine.Agents
     ROSTER                       [{ id, label, needs, run }]
     get(id)
     run(id, ctx)                 -> Promise<result>
     pipeline(ctx)                -> Promise<{ ran:[...], dod, certificate }>
     arbitrate(conflicts)         -> resolutions
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var FS = Engine.FS;
  function auto() { return Engine.Autonomy; }
  function allowed(action) { return !auto() || auto().allows(action); }
  function flush() { return (FS.__flush ? FS.__flush() : Promise.resolve()); }
  function writeFiles(files) {
    (files || []).forEach(function (f) { if (f && f.path && typeof f.content === 'string') FS.write(f.path.charAt(0) === '/' ? f.path : '/' + f.path, f.content); });
    return flush();
  }

  var ROSTER = [
    { id: 'product', label: 'Product', needs: [],
      run: function (ctx) {
        if (!Engine.Contract) return Promise.resolve({ note: 'Engine.Contract not loaded' });
        return Engine.Contract.derive({ useLLM: (ctx && ctx.useLLM) !== false }).then(function (c) {
          return { report: { requirements: (c.requirements || []).length, machine: c.totals && c.totals.withMachineCriteria }, note: 'product contract derived' };
        });
      } },

    { id: 'architect', label: 'Architecture', needs: ['product'],
      run: function (ctx) {
        if (!Engine.Scaffold) return Promise.resolve({ note: 'Engine.Scaffold not loaded' });
        var p = (ctx && ctx.objective)
          ? Engine.Scaffold.specFromObjective(ctx.objective)
          : Promise.resolve(Engine.Scaffold.specFromContext());
        return p.then(function (spec) { ctx && (ctx.spec = spec); return { report: { name: spec.name, entities: spec.entities.map(function (e) { return e.name; }), stack: spec.stack, auth: spec.auth, jobs: spec.jobs }, note: 'data model + stack chosen' }; });
      } },

    { id: 'scaffold', label: 'Scaffold (DB + backend + auth + frontend)', needs: ['architect'],
      run: function (ctx) {
        if (!allowed('generate')) return Promise.resolve({ blocked: 'generate' });
        if (!Engine.Scaffold) return Promise.resolve({ note: 'Engine.Scaffold not loaded' });
        var spec = (ctx && ctx.spec) || Engine.Scaffold.specFromContext();
        var files = Engine.Scaffold.generate(spec);
        return writeFiles(files).then(function () { return { files: files.map(function (f) { return f.path; }), note: 'generated ' + files.length + ' files' }; });
      } },

    { id: 'test', label: 'Testing factory', needs: ['scaffold'],
      run: function () {
        if (!allowed('generate')) return Promise.resolve({ blocked: 'generate' });
        if (!Engine.TestGen) return Promise.resolve({ note: 'Engine.TestGen not loaded' });
        var files = Engine.TestGen.generate({});
        return flush().then(function () { return { files: files.map(function (f) { return f.path; }), note: 'wrote ' + files.length + ' test file(s)' }; });
      } },

    { id: 'security', label: 'Security', needs: ['scaffold'],
      run: function () {
        if (!Engine.Security) return Promise.resolve({ note: 'Engine.Security not loaded' });
        var r = Engine.Security.scan();
        return Promise.resolve({ report: { score: r.score, high: (r.bySeverity || {}).high || 0, findings: r.findings.length }, note: 'security score ' + r.score + '/100' });
      } },

    { id: 'verify', label: 'Verify (analyze + real execution + observe)', needs: ['scaffold'],
      run: function () {
        var S = Engine.Sovereign; if (!S) return Promise.resolve({ note: 'Engine.Sovereign not loaded' });
        var chain = Promise.resolve();
        try { S.analyze(); } catch (_) {}
        if (allowed('command')) chain = chain.then(function () { return S.runEvidence({ steps: ['test', 'build', 'lint'] }).catch(function () {}); });
        if (allowed('observe')) chain = chain.then(function () { return S.observe({ max: 25 }).catch(function () {}); });
        return chain.then(function () { try { S.analyze(); } catch (_) {} return flush(); }).then(function () {
          var ev = null; try { ev = JSON.parse(S.read('execution-evidence.json') || 'null'); } catch (_) {}
          return { evidence: ev && ev.gates, note: 'verified' };
        });
      } },

    { id: 'repair', label: 'Repair', needs: ['verify'],
      run: function () {
        if (!allowed('repair')) return Promise.resolve({ blocked: 'repair' });
        if (!Engine.Recovery || !Engine.Recovery.run) return Promise.resolve({ note: 'Engine.Recovery not loaded' });
        var run = Engine.Recovery.run();
        return flush().then(function () { return { report: { status: run.status, repaired: run.repairedCount, rolledBack: !!run.rolledBack }, note: 'repair ' + run.status }; });
      } },

    { id: 'deploy', label: 'Deployment IaC', needs: ['verify'],
      run: function (ctx) {
        if (!allowed('deploy')) return Promise.resolve({ blocked: 'deploy' });
        if (!Engine.Deploy) return Promise.resolve({ note: 'Engine.Deploy not loaded' });
        var target = (ctx && ctx.deployTarget) || 'compose';
        var r = Engine.Deploy.apply(target, {});
        return flush().then(function () { return { files: r.wrote, report: { target: target, preflightOk: r.preflight.ok }, note: 'deploy artefacts for ' + target }; });
      } },

    { id: 'release', label: 'Release (Definition-of-Done + certificate)', needs: ['verify'],
      run: function () {
        if (!Engine.DoD) return Promise.resolve({ note: 'Engine.DoD not loaded' });
        try { Engine.Ledger && Engine.Ledger.build(); } catch (_) {}
        var dod = Engine.DoD.evaluate();
        var cert = ''; try { cert = Engine.DoD.certificate(); } catch (_) {}
        return Promise.resolve({ report: { pass: dod.PASS, failing: Object.keys(dod.criteria || {}).filter(function (k) { return !dod.criteria[k]; }) },
          note: dod.PASS ? 'SOVEREIGN VERIFIED' : 'not verified: ' + Object.keys(dod.criteria || {}).filter(function (k) { return !dod.criteria[k]; }).join(', ') });
      } }
  ];

  function get(id) { return ROSTER.find(function (a) { return a.id === id; }) || null; }
  function run(id, ctx) {
    var a = get(id);
    if (!a) return Promise.resolve({ note: 'no agent ' + id });
    return Promise.resolve().then(function () { return a.run(ctx || {}); })
      .then(function (r) { return Object.assign({ agent: id, at: Date.now() }, r || {}); })
      .catch(function (e) { return { agent: id, error: String(e && e.message || e) }; });
  }

  // standard product build order (respects Autonomy — blocked agents are skipped)
  function pipeline(ctx) {
    ctx = ctx || {};
    var order = ['product', 'architect', 'scaffold', 'test', 'security', 'verify', 'repair', 'release'];
    var ran = [];
    var chain = Promise.resolve();
    order.forEach(function (id) {
      chain = chain.then(function () { return run(id, ctx); }).then(function (r) { ran.push(r); });
    });
    return chain.then(function () {
      var dod = Engine.DoD && Engine.DoD.load();
      var cert = ''; try { cert = (Engine.Sovereign && Engine.Sovereign.read('release-certificate.md')) || ''; } catch (_) {}
      var rec = { at: Date.now(), autonomy: auto() && auto().get(), ran: ran, dod: dod, sovereignVerified: /SOVEREIGN VERIFIED/.test(cert) };
      try { Engine.Sovereign && Engine.Sovereign.write('agents-run.json', rec); } catch (_) {}
      return rec;
    });
  }

  // blueprint hierarchy: product contract > architecture > security > performance > UI
  var PRIORITY = ['product', 'architecture', 'security', 'performance', 'ui'];
  function arbitrate(conflicts) {
    return (conflicts || []).map(function (c) {
      var sides = (c.between || []).slice().sort(function (a, b) {
        return PRIORITY.indexOf(String(a).toLowerCase()) - PRIORITY.indexOf(String(b).toLowerCase());
      });
      var winner = sides[0];
      return { conflict: c.about || c.conflict, winner: winner,
        resolution: winner + ' takes precedence — ' + (c.resolution || 'adjust the lower-priority side to comply') };
    });
  }

  Engine.Agents = { ROSTER: ROSTER, get: get, run: run, pipeline: pipeline, arbitrate: arbitrate, PRIORITY: PRIORITY };
  console.info('[Agents] specialist agents + arbitration ready — Engine.Agents');
})();
