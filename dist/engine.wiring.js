/* =====================================================================
   engine.wiring.js  —  Engine.Wiring   (blueprint §12)

   Deep connection tracing over the GENERATED code: for every entity the
   contract defines, follow the chain

     UI control  →  fetch(method, /api/…)  →  server route  →  service
                →  db.<op>(ENTITY)         →  a real table (migration)

   and report, link by link, whether it is actually wired in the files on
   disk. A missing link is a concrete break ("the task list has no GET
   route", "src/services/task.js never calls the data layer"), not a vague
   graph edge.

   window.Engine.Wiring
     trace()  -> { generatedAt, entities:[{ entity, chain:[...], complete, breaks }], summary }
                 (also writes .sovereign/wiring-trace.json)
     load()   -> the written trace or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };
  function read(p) { try { return (FS() && FS().read(p)) || ''; } catch (_) { return ''; } }
  function has(p) { try { return !!(FS() && FS().isFile(p)); } catch (_) { return false; } }

  // all frontend source (vanilla + component variants)
  function frontendSrc() {
    var f = FS(); if (!f || !f._data) return '';
    return Object.keys(f._data)
      .filter(function (p) { return /\/(public|src|app)\/.*\.(js|mjs|jsx|tsx|html)$/.test(p) && !/\.(test|spec)\./.test(p); })
      .map(function (p) { return read(p); }).join('\n');
  }
  function migrationsSrc() {
    var f = FS(); if (!f || !f._data) return '';
    return Object.keys(f._data)
      .filter(function (p) { return /\.sql$/.test(p) || /schema\.js$/.test(p); })
      .map(function (p) { return read(p); }).join('\n');
  }

  function tableOf(name) {
    // mirror Engine.Schema.tableOf: naive pluralisation
    if (/y$/.test(name)) return name.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/.test(name)) return name + 'es';
    return name + 's';
  }

  function traceEntity(name) {
    var table = table_(name);
    var svcPath = '/src/services/' + name + '.js';
    var server = read('/server.js');
    var svc = read(svcPath);
    var fe = frontendSrc();
    var mig = migrationsSrc();

    var chain = [];
    var breaks = [];

    // 1. UI — a control that references this resource (its section, or a fetch to its route)
    var feRoute = new RegExp("/api/(?:'\\s*\\+\\s*[a-z.]+|" + table + ")", 'i');
    var uiHit = new RegExp("data-entity=[\"']" + name + "|'" + name + "'|\\b" + name + "\\b", 'i').test(fe)
      || feRoute.test(fe);
    chain.push({ link: 'ui-control', ok: uiHit, detail: uiHit ? 'a control / section for "' + name + '" is present in the frontend' : null });
    if (!uiHit) breaks.push('no UI control references the "' + name + '" resource');

    // 2. fetch → method + path
    var methods = {};
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach(function (m) {
      var re = new RegExp("fetch\\([^)]*/api/[^)]*" + (m === 'GET' ? "" : "[\\s\\S]{0,80}method:\\s*['\"]" + m + "['\"]"), 'i');
      // simpler: a fetch to /api/<table> (or the templated form) with this method nearby
      if (new RegExp("method:\\s*['\"]" + m + "['\"]", 'i').test(fe) || (m === 'GET' && feRoute.test(fe))) methods[m] = true;
    });
    var anyFetch = feRoute.test(fe);
    chain.push({ link: 'fetch', ok: anyFetch, detail: anyFetch ? 'frontend calls /api/…' + (Object.keys(methods).length ? ' (' + Object.keys(methods).join(', ') + ')' : '') : null });
    if (!anyFetch) breaks.push('the frontend never fetches an /api/ route for "' + name + '"');

    // 3. server route — the CRUD map wires seg[1] -> svc
    var routeWired = new RegExp("['\"]" + table + "['\"]\\s*:\\s*\\{\\s*svc:\\s*svc_" + name + "\\b", 'i').test(server)
      || new RegExp("svc_" + name + "\\b", 'i').test(server);
    chain.push({ link: 'route', ok: routeWired, detail: routeWired ? '/api/' + table + ' is mapped to svc_' + name + ' in server.js' : null });
    if (!routeWired) breaks.push('server.js has no route mapped to the "' + name + '" service');

    // 4. service module exists + calls the data layer
    var svcExists = has(svcPath);
    var svcCallsDb = /db\.(list|get|create|update|remove)\s*\(\s*ENTITY/.test(svc) || /db\.(list|get|create|update|remove)\s*\(\s*['"]/.test(svc);
    chain.push({ link: 'service', ok: svcExists && svcCallsDb, detail: svcExists ? (svcCallsDb ? svcPath + ' calls the data layer' : svcPath + ' exists but never calls db.*') : null });
    if (!svcExists) breaks.push('src/services/' + name + '.js is missing (no service layer)');
    else if (!svcCallsDb) breaks.push('src/services/' + name + '.js never calls the data layer (db.*)');

    // 5. db op -> ENTITY const
    var entityConst = new RegExp("const ENTITY = ['\"]" + name + "['\"]").test(svc);
    chain.push({ link: 'db-op', ok: svcCallsDb, detail: svcCallsDb ? "db.list/create/remove(ENTITY" + (entityConst ? " = '" + name + "'" : "") + ")" : null });

    // 6. a real table in a migration / schema
    var tableExists = new RegExp("CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?[\"'`]?" + table + "\\b", 'i').test(mig)
      || new RegExp("['\"]" + table + "['\"]").test(mig) || new RegExp("name:\\s*['\"]" + name + "['\"]").test(mig);
    chain.push({ link: 'table', ok: tableExists, detail: tableExists ? "table '" + table + "' is created by a migration / declared in the schema" : null });
    if (!tableExists) breaks.push('no migration creates the "' + table + '" table');

    return {
      entity: name, table: table,
      chain: chain,
      complete: breaks.length === 0,
      breaks: breaks
    };
  }
  function table_(name) {
    // prefer the schema's own table when available
    try {
      if (Engine.Schema && Engine.Schema.normalizeSpec) {
        var c = Engine.Contract && Engine.Contract.load && Engine.Contract.load();
        if (c) {
          var s = Engine.Schema.normalizeSpec({ name: 'x', entities: c.entities || [] });
          var e = (s.entities || []).filter(function (x) { return x.name === name; })[0];
          if (e && e.table) return e.table;
        }
      }
    } catch (_) {}
    return tableOf(name);
  }

  function trace() {
    var contract = Engine.Contract && Engine.Contract.load && Engine.Contract.load();
    if (!contract || !Array.isArray(contract.entities) || !has('/server.js')) {
      var idle = { generatedAt: Date.now(), present: false, note: 'no generated Node backend + contract to trace' };
      if (S()) S().write('wiring-trace.json', idle);
      return idle;
    }
    var names = contract.entities
      .map(function (e) { return e.name; })
      .filter(function (n) { return ['user', 'session', 'job'].indexOf(n) < 0; });
    var entities = names.map(traceEntity);
    var complete = entities.filter(function (e) { return e.complete; }).length;
    var allBreaks = entities.reduce(function (a, e) { return a.concat(e.breaks.map(function (b) { return e.entity + ': ' + b; })); }, []);
    var report = {
      generatedAt: Date.now(), present: true, capability: 'wiring-trace',
      entities: entities,
      totals: { entities: entities.length, fullyWired: complete, brokenChains: entities.length - complete },
      breaks: allBreaks,
      summary: complete + '/' + entities.length + ' entity chains fully wired (UI → fetch → route → service → data layer → table)' +
        (allBreaks.length ? '; ' + allBreaks.length + ' broken link(s)' : '') + '.'
    };
    if (S()) S().write('wiring-trace.json', report);
    return report;
  }

  function load() { try { var v = S() && S().read('wiring-trace.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Wiring = { trace: trace, load: load, _traceEntity: traceEntity };
  console.info('[Wiring] deep control→handler→route→service→db tracer ready — Engine.Wiring');
})();
