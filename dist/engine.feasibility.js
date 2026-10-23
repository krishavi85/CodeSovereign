/* =====================================================================
   engine.feasibility.js  —  Engine.Feasibility   (blueprint §5 + §8)

   Feasibility & constraint analysis with two parts the contract lacked:

   §8 — host capability check: does THIS machine have the toolchain the
        chosen stack needs (node · npm · git · docker · python · a
        Postgres client)? Uses the desktop probe when available; without
        it every tool is reported `unknown`, never silently OK.

   §5 — effort / cost estimate: from the contract's shape (entities,
        requirements, auth, jobs, microservices, target) derive a
        complexity tier, a rough build-effort band, and a monthly hosting
        cost band. Plus the contract's own contradictions
        (Engine.Requirements.contradictions).

   Writes .sovereign/feasibility.json. Never blocks — it's advice.

   window.Engine.Feasibility
     analyze(contract?)  -> feasibility object (also writes the evidence)
     load()              -> the written feasibility or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function sovJSON(p) {
    try { var v = S() && S().read(p); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
    catch (_) { return null; }
  }

  // what each stack choice needs on the host to build + run locally
  var STACK_NEEDS = {
    node:     [{ tool: 'node', why: 'run the generated server + tests', install: 'https://nodejs.org' },
               { tool: 'npm',  why: 'install + run scripts', install: 'ships with node' }],
    python:   [{ tool: 'python', why: 'run the generated FastAPI/Flask backend', install: 'https://python.org' }],
    postgres: [{ tool: 'psql', why: 'apply the real SQL migrations against Postgres', install: 'https://postgresql.org/download' },
               { tool: 'docker', why: 'or run Postgres in a container (docker compose up)', install: 'https://docker.com' }],
    docker:   [{ tool: 'docker', why: 'build the image + run docker-compose', install: 'https://docker.com' }],
    git:      [{ tool: 'git', why: 'version.json stamping + the release workflow', install: 'https://git-scm.com' }]
  };

  function hostProbe() {
    var desktop = window.desktop && window.desktop.isDesktop;
    if (desktop && window.CSAdapters && window.CSAdapters.probe) {
      return Promise.resolve().then(function () { return window.CSAdapters.probe(); })
        .then(function (p) {
          var h = p && (p.host || (p.data && p.data.host));
          // a real probe reports several tools; an empty {} means the bridge
          // answered but couldn't run — treat that as "not probed".
          return (h && Object.keys(h).length >= 3) ? h : null;
        })
        .catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  function effort(contract) {
    var st = contract.supportedStack || {};
    var ents = (contract.entities || []).filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; }).length;
    var reqs = (contract.requirements || []).length;
    var points = ents * 2 + Math.ceil(reqs / 2)
      + (st.auth ? 3 : 0) + (st.rbac ? 1 : 0) + (st.jobs ? 3 : 0)
      + (st.websocket ? 2 : 0) + (st.architecture === 'multi-service' ? 5 : 0)
      + (st.api === 'graphql' ? 2 : 0)
      + ((contract.authMethods && (contract.authMethods.oauth || contract.authMethods.passkeys || contract.authMethods.mfa)) ? 2 : 0)
      + ((contract.target && contract.target !== 'web') ? 4 : 0);
    var tier = points <= 8 ? 'small' : points <= 20 ? 'standard' : points <= 36 ? 'large' : 'complex';
    var band = points <= 8 ? '~1–2 days for a competent engineer'
      : points <= 20 ? '~1–2 weeks'
      : points <= 36 ? '~3–6 weeks'
      : '~2+ months, best split into milestones';
    return { points: points, tier: tier, effortBand: band, entities: ents, requirements: reqs };
  }

  function hostingCost(contract) {
    var st = contract.supportedStack || {};
    // the generated app is dependency-free Node + a JSON/Postgres store
    if (st.architecture === 'multi-service') return { band: 'medium', monthly: '$25–80', note: 'multiple services + a managed Postgres + a queue' };
    if (st.database === 'postgres' || st.jobs) return { band: 'low', monthly: '$7–25', note: 'one small instance + a managed Postgres (or a $0 free tier to start)' };
    return { band: 'free', monthly: '$0–7', note: 'a single small instance or a free tier; the JSON store needs no database' };
  }

  function analyze(contract) {
    contract = contract || (Engine.Contract && Engine.Contract.load && Engine.Contract.load());
    if (!contract || !contract.supportedStack) return Promise.resolve({ ok: false, reason: 'no product contract' });
    var st = contract.supportedStack;

    var needKeys = ['node'];
    if (st.backend === 'python') needKeys.push('python');
    if (st.database === 'postgres') needKeys.push('postgres');
    if (st.deploy) needKeys.push('docker');
    needKeys.push('git');
    var needed = [];
    needKeys.forEach(function (k) { (STACK_NEEDS[k] || []).forEach(function (n) { if (!needed.some(function (x) { return x.tool === n.tool; })) needed.push(n); }); });

    return hostProbe().then(function (host) {
      var checks = needed.map(function (n) {
        var present = host ? (host[n.tool] === true) : null;
        return { tool: n.tool, why: n.why, present: present, install: n.install };
      });
      var haveHost = !!host;
      var missing = checks.filter(function (c) { return c.present === false; });
      // docker OR psql covers Postgres — don't count both as missing
      var pgOk = st.database !== 'postgres' || !host || host.psql === true || host.docker === true;
      var blockingMissing = missing.filter(function (c) {
        if (!pgOk) return true;
        return !(c.tool === 'psql' || c.tool === 'docker');
      });
      var hostReady = !haveHost ? 'unknown' : (blockingMissing.length === 0 ? 'ready' : 'missing-tools');

      var eff = effort(contract);
      var cost = hostingCost(contract);
      var contradictions = [];
      try {
        if (Engine.Requirements && Engine.Requirements.contradictions) {
          contradictions = Engine.Requirements.contradictions({
            offline: /offline|local-first/i.test(JSON.stringify(contract)),
            realtimeCollab: !!st.websocket,
            noLogin: !st.auth,
            privateSyncedData: !!st.auth && !!st.websocket,
            architecturePref: st.architecture === 'multi-service' ? 'microservices' : 'monolith'
          }) || [];
        }
      } catch (_) {}

      var report = {
        generatedAt: Date.now(),
        capability: 'feasibility',
        product: contract.product && contract.product.name,
        host: { probed: haveHost, ready: hostReady, checks: checks, missing: missing.map(function (m) { return m.tool; }) },
        effort: eff,
        hostingCost: cost,
        contradictions: contradictions,
        buildable: contract.verdict === 'buildable',
        summary: 'Complexity: ' + eff.tier + ' (' + eff.effortBand + '). Hosting: ' + cost.band + ' (' + cost.monthly + '/mo). '
          + (hostReady === 'ready' ? 'This machine has the toolchain to build + run it locally.'
             : hostReady === 'missing-tools' ? 'Missing on this machine: ' + blockingMissing.map(function (c) { return c.tool; }).join(', ') + '.'
             : 'Host toolchain not probed (open the desktop app to check).')
          + (contradictions.length ? ' ' + contradictions.length + ' constraint conflict(s) to resolve.' : '')
      };
      if (S()) S().write('feasibility.json', report);
      return report;
    });
  }

  function load() { return sovJSON('feasibility.json'); }

  Engine.Feasibility = { analyze: analyze, load: load, _effort: effort, _hostingCost: hostingCost };
  console.info('[Feasibility] host-capability + effort/cost estimate ready — Engine.Feasibility');
})();
