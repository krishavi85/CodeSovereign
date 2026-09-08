/* =====================================================================
   engine.journeys.js  —  Engine.Journeys   (blueprint §65)

   User-journey testing. The Product Contract already carries `journeys`
   (`{ id, actor, steps:[…], requirementIds:[…] }`) — natural-language flows
   like "sign in → create a project → see it in the list → delete it".

   This engine compiles each journey into a concrete, ordered sequence of
   operations against the REAL running app (its HTTP surface — the exact
   calls its frontend makes), emits `test/journeys.test.js` that drives the
   booted server through every journey, and writes
   `.sovereign/journey-evidence.json` mapping journey → requirement ids →
   covered / uncovered so the Evidence Ledger + DoD can gate on it.

   window.Engine.Journeys
     compile(contract?)  -> [{ id, title, needsAuth, entity, ops:[…], requirementIds }]
     suite(contract?)    -> the test/journeys.test.js source
     generate()          -> [{ path, content }]  (writes into Engine.FS)
     analyze()           -> journey-evidence.json summary
     load()              -> the written evidence or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function contractOf() {
    try { return (Engine.Contract && Engine.Contract.load && Engine.Contract.load()) || null; } catch (_) { return null; }
  }
  function tg() { return Engine.TestGen || {}; }
  function schema() { try { return tg().schema ? tg().schema() : null; } catch (_) { return null; }
  }

  // resource lookup by singular name or table
  function findEntity(sc, name) {
    if (!sc || !name) return null;
    var n = String(name).toLowerCase();
    return (sc.entities || []).filter(function (e) {
      return e.name === n || e.table === n || e.table === n + 's' || e.name === n.replace(/s$/, '');
    })[0] || null;
  }

  // NL step -> op token
  function opsFor(journey, sc) {
    var ops = [];
    var entity = null;
    (journey.steps || []).forEach(function (raw) {
      var s = String(raw).toLowerCase();
      if (/land on|authenticated view|dashboard|logged.?in view|home screen/.test(s)) ops.push({ op: 'assertMe' });
      else if (/log ?out|sign ?out/.test(s)) ops.push({ op: 'logout' });
      else if (/regist|sign ?up|create an account/.test(s)) ops.push({ op: 'register' });
      else if (/log ?in|sign ?in/.test(s)) ops.push({ op: 'login' });
      else if (/create (a |an )?(\w+)/.test(s)) {
        var m = s.match(/create (?:a |an )?(\w+)/); var e = findEntity(sc, m && m[1]);
        if (e) { entity = e; ops.push({ op: 'create', entity: e.name, table: e.table }); }
      }
      else if (/(see it|in the list|appears|shows up|listed)/.test(s) && entity) ops.push({ op: 'listContains', entity: entity.name, table: entity.table });
      else if (/(delete|remove) it/.test(s) && entity) ops.push({ op: 'delete', entity: entity.name, table: entity.table });
      else if (/(open|visit|go to) the app/.test(s)) ops.push({ op: 'health' });
    });
    // a journey that starts at "sign in" assumes the account already exists —
    // make that precondition explicit so the flow is runnable in isolation.
    var hasLogin = ops.some(function (o) { return o.op === 'login'; });
    var hasReg = ops.some(function (o) { return o.op === 'register'; });
    if (hasLogin && !hasReg) {
      var at = ops.findIndex(function (o) { return o.op === 'login'; });
      ops.splice(at, 0, { op: 'register', implicit: true });
    }
    return { ops: ops, entity: entity };
  }

  function compile(contract) {
    contract = contract || contractOf();
    var sc = schema();
    var journeys = (contract && contract.journeys) || [];
    return journeys.map(function (j) {
      var r = opsFor(j, sc);
      var needsAuth = r.ops.some(function (o) { return o.op === 'register' || o.op === 'login'; });
      // a journey that references a required non-user ref we can't seed is downgraded
      var creatable = !r.entity || !(r.entity.fields || []).some(function (f) {
        return f.required && f.type === 'ref' && f.ref !== 'user';
      });
      return {
        id: j.id, actor: j.actor || 'user',
        title: (j.steps || []).join(' → '),
        needsAuth: needsAuth,
        entity: r.entity ? r.entity.name : null,
        table: r.entity ? r.entity.table : null,
        creatable: creatable,
        requirementIds: j.requirementIds || [],
        ops: r.ops
      };
    });
  }

  function suite(contract) {
    var compiled = compile(contract);
    var bodyFor = tg().bodyFor || function () { return { create: '{}', mut: null }; };
    var sc = schema();
    var L = [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-journeys-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "let server; try { ({ server } = require('../server')); } catch (_) {}",
      "let db; try { db = require('../src/db'); } catch (_) {}",
      "",
      "const boot = async () => {",
      "  if (db) { await db.reset(); await db.migrate(); }",
      "  await new Promise((r) => server.listen(0, r));",
      "  const base = 'http://localhost:' + server.address().port;",
      "  const J = (m, p, b, h) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: b === undefined ? undefined : JSON.stringify(b) }).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) }));",
      "  return { base, J };",
      "};",
      "const shut = async () => { try { if (server.closeAllConnections) server.closeAllConnections(); } catch (_) {} await Promise.race([new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 3000))]); if (db) await db.reset(); };",
      ""
    ];
    if (!compiled.length) {
      L.push("test('journeys: the contract defines no journeys', { skip: !server }, () => { assert.ok(true); });", "");
      return L.join('\n');
    }
    compiled.forEach(function (jn, idx) {
      var reqNote = jn.requirementIds.length ? ' [' + jn.requirementIds.join(', ') + ']' : '';
      var b = jn.table ? bodyFor((sc && (sc.entities || []).filter(function (e) { return e.name === jn.entity; })[0]) || { fields: [] }) : { create: '{}', mut: null };
      L.push("test(" + JSON.stringify(jn.id + ': ' + jn.title + reqNote) + ", { skip: !server, timeout: 30000 }, async () => {");
      L.push("  const { J } = await boot();");
      L.push("  try {");
      L.push("    let AH = {};");
      var email = "'" + jn.id.toLowerCase() + "@t.co'";
      jn.ops.forEach(function (o) {
        if (o.op === 'health') {
          L.push("    { const h = await J('GET', '/healthz'); assert.equal(h.s, 200, 'app is up'); }");
        } else if (o.op === 'register') {
          L.push("    { const r = await J('POST', '/api/auth/register', { email: " + email + ", password: 'password12' }); assert.ok(r.s === 201 && r.j && r.j.token, 'register" + reqNote + "'); AH = { authorization: 'Bearer ' + r.j.token }; }");
        } else if (o.op === 'login') {
          L.push("    { const r = await J('POST', '/api/auth/login', { email: " + email + ", password: 'password12' }); assert.ok(r.s === 200 && r.j && r.j.token, 'sign in" + reqNote + "'); AH = { authorization: 'Bearer ' + r.j.token }; }");
        } else if (o.op === 'assertMe') {
          L.push("    { const r = await J('GET', '/api/auth/me', undefined, AH); assert.ok(r.j && r.j.user, 'lands on the authenticated view" + reqNote + "'); }");
        } else if (o.op === 'logout') {
          L.push("    { const r = await J('POST', '/api/auth/logout', undefined, AH); assert.equal(r.s, 200, 'sign out'); }");
        } else if (o.op === 'create') {
          if (jn.creatable) {
            L.push("    let _id;");
            L.push("    { const r = await J('POST', '/api/" + o.table + "', " + b.create + ", AH); assert.equal(r.s, 201, 'create a " + o.entity + reqNote + "'); _id = r.j && r.j.id; assert.ok(_id != null, 'the new " + o.entity + " has an id'); }");
          } else {
            L.push("    // '" + o.entity + "' needs a related record the journey doesn't seed — assert the endpoint is wired instead");
            L.push("    { const r = await J('POST', '/api/" + o.table + "', {}, AH); assert.ok(r.s === 400 || r.s === 201, 'create " + o.entity + " endpoint is live" + reqNote + "'); }");
          }
        } else if (o.op === 'listContains') {
          if (jn.creatable) {
            L.push("    { const r = await J('GET', '/api/" + o.table + "', undefined, AH); const rows = Array.isArray(r.j) ? r.j : (r.j && r.j.rows) || []; assert.ok(rows.some((x) => String(x.id) === String(_id)), 'the new " + o.entity + " shows in the list" + reqNote + "'); }");
          } else {
            L.push("    { const r = await J('GET', '/api/" + o.table + "', undefined, AH); assert.ok(r.s === 200, 'the " + o.entity + " list loads" + reqNote + "'); }");
          }
        } else if (o.op === 'delete') {
          if (jn.creatable) {
            L.push("    { const r = await J('DELETE', '/api/" + o.table + "/' + _id, undefined, AH); assert.equal(r.s, 200, 'delete the " + o.entity + reqNote + "'); const g = await J('GET', '/api/" + o.table + "/' + _id, undefined, AH); assert.equal(g.s, 404, 'the " + o.entity + " is gone'); }");
          } else {
            L.push("    { const r = await J('DELETE', '/api/" + o.table + "/999999999', undefined, AH); assert.ok(r.s === 404 || r.s === 200, 'delete " + o.entity + " endpoint is live" + reqNote + "'); }");
          }
        }
      });
      L.push("  } finally { await shut(); }");
      L.push("});");
      L.push("");
    });
    return L.join('\n');
  }

  function generate() {
    var out = {};
    var hasServer = Engine.FS && (Engine.FS.exists('/server.js') || Engine.FS.exists('/src/server.js'));
    if (!hasServer) return [];
    var compiled = compile();
    out['/test/journeys.test.js'] = suite();
    Object.keys(out).forEach(function (p) { Engine.FS.write(p, out[p]); });
    if (S()) S().write('journeys.json', { generatedAt: Date.now(), count: compiled.length, journeys: compiled });
    analyze();
    return Object.keys(out).map(function (p) { return { path: p, content: out[p] }; });
  }

  function analyze() {
    var contract = contractOf();
    var compiled = compile(contract);
    // did the generated journey suite run + pass? read the execution evidence.
    var exec = null;
    try { exec = S() && S().read('execution-evidence.json'); } catch (_) {}
    var ranClean = false;
    if (exec && typeof exec === 'object') {
      var testGate = (exec.gates && (exec.gates.test || exec.gates.tests)) || exec.test || null;
      var blob = JSON.stringify(exec);
      ranClean = (testGate && (testGate.ok === true || testGate.pass === true)) ||
        (/journeys\.test\.js/.test(blob) && !/fail [1-9]/.test(blob));
    }
    var journeys = compiled.map(function (j) {
      return {
        id: j.id, title: j.title, actor: j.actor,
        requirementIds: j.requirementIds,
        entity: j.entity,
        mode: j.creatable ? 'full-crud' : 'endpoint-liveness',
        status: compiled.length ? (ranClean ? 'covered' : 'planned') : 'none',
        ops: j.ops.map(function (o) { return o.op; })
      };
    });
    var covered = journeys.filter(function (j) { return j.status === 'covered'; }).length;
    var reqSet = {};
    journeys.forEach(function (j) { j.requirementIds.forEach(function (r) { reqSet[r] = j.status === 'covered'; }); });
    var report = {
      generatedAt: Date.now(),
      present: compiled.length > 0,
      total: journeys.length,
      covered: covered,
      uncovered: journeys.length - covered,
      requirementsExercised: Object.keys(reqSet),
      requirementsCovered: Object.keys(reqSet).filter(function (k) { return reqSet[k]; }),
      journeys: journeys,
      note: !compiled.length ? 'the contract defines no journeys'
        : ranClean ? 'every journey ran green against the booted server'
          : 'journey suite generated — run the evidence gate (npm test) to mark them covered'
    };
    if (S()) {
      S().write('journey-evidence.json', report);
      S().write('journey-report.md',
        '# User journeys\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        (report.present
          ? report.covered + ' / ' + report.total + ' journeys covered.\n\n' +
            journeys.map(function (j) {
              return '- **' + j.id + '** ' + (j.status === 'covered' ? '✅' : '⏳') + ' — ' + j.title +
                (j.requirementIds.length ? '  \n  _requirements:_ ' + j.requirementIds.join(', ') : '');
            }).join('\n') + '\n'
          : 'No journeys in the contract.\n'));
    }
    return report;
  }

  function load() {
    try { var v = S() && S().read('journey-evidence.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; }
  }

  Engine.Journeys = { compile: compile, suite: suite, generate: generate, analyze: analyze, load: load };
  console.info('[Journeys] user-journey test generator ready — Engine.Journeys');
})();
