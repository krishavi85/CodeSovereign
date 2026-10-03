/* =====================================================================
   engine.features.js  —  Engine.Features   (blueprint §63-64)

   Feature builder + feature-completion graph. Turns the Product Contract's
   entities + requirements into a graph of features, each with the ordered
   set of facets a feature needs to be genuinely done — data model →
   migration → service → REST surface → UI → automated test → user journey
   — and checks every facet against what is actually in the repo.

   The output answers, per feature: what % is built, what the single next
   actionable gap is, and (topologically ordered) what to build after that.

   window.Engine.Features
     FACETS
     graph(contract?)  -> [{ id, kind, name, facets:[…], requirementIds }]
     status(contract?) -> { features:[{…, facets:{name:bool}, completion, nextGap}], overall }
     nextTask()        -> { feature, facet, why } | null
     analyze()         -> writes .sovereign/feature-graph.json + report
     load()            -> the written graph or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function fread(p) { try { return (FS() && FS().read(p)) || ''; } catch (_) { return ''; } }
  function fexists(p) { try { return !!(FS() && FS().isFile(p)); } catch (_) { return false; } }
  function fkeys() { try { return Object.keys(FS()._data || {}); } catch (_) { return []; } }
  function sread(n) { try { var v = S() && S().read(n); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  function contractOf() {
    try { return (Engine.Contract && Engine.Contract.load && Engine.Contract.load()) || null; } catch (_) { return null; }
  }
  function schema() {
    try { return (Engine.TestGen && Engine.TestGen.schema && Engine.TestGen.schema()) || null; } catch (_) { return null; }
  }

  // the ordered facets of a "complete" entity feature. `dep` = the facet that
  // must exist first (topological build order).
  var FACETS = [
    { id: 'dataModel', label: 'data model', dep: null },
    { id: 'migration', label: 'migration', dep: 'dataModel' },
    { id: 'service', label: 'service layer', dep: 'migration' },
    { id: 'restApi', label: 'REST endpoints', dep: 'service' },
    { id: 'ui', label: 'UI surface', dep: 'restApi' },
    { id: 'test', label: 'automated test', dep: 'restApi' },
    { id: 'journey', label: 'user journey', dep: 'ui' }
  ];

  function tableFor(name, sc) {
    var e = sc && (sc.entities || []).filter(function (x) { return x.name === name; })[0];
    return e ? e.table : (/s$/.test(name) ? name : name + 's');
  }

  function detectFacet(id, name, table, sc) {
    switch (id) {
      case 'dataModel': {
        var sch = fread('/src/schema.js') + fread('/src/schema.py');
        return new RegExp("['\"]?" + name + "['\"]?\\s*[:{]").test(sch) || (!!sc && (sc.entities || []).some(function (e) { return e.name === name; }));
      }
      case 'migration':
        return fkeys().some(function (p) { return /\/db\/migrations\/.+\.sql$/.test(p) && new RegExp('\\b' + table + '\\b').test(fread(p)); });
      case 'service':
        return fexists('/src/services/' + name + '.js') || fexists('/services/' + name + '/service.js') ||
          new RegExp("ENTITY\\s*=\\s*['\"]" + name + "['\"]").test(fread('/server.js'));
      case 'restApi': {
        var srv = fread('/server.js') + fread('/gateway/server.js');
        // generated servers route every service generically; also accept an explicit path
        return new RegExp("/api/'\\s*\\+\\s*r\\.ent|/api/" + table + "\\b").test(srv) ||
          (detectFacet('service', name, table, sc) && /seg\[0\]\s*===\s*'api'/.test(srv));
      }
      case 'ui': {
        var html = fkeys().filter(function (p) { return /\/public\/.*\.(html|js)$/.test(p); }).map(fread).join('\n');
        var comp = fkeys().filter(function (p) { return /\/(src|app|components)\/.*\.(jsx?|tsx?|vue|svelte)$/.test(p); }).map(fread).join('\n');
        return new RegExp('data-entity="' + name + '"|/api/' + table + '\\b').test(html + comp);
      }
      case 'test':
        return fkeys().some(function (p) {
          return /\/(test|tests|__tests__|spec|e2e)\/.+\.(test|spec)\.[cm]?jsx?$/.test(p) &&
            new RegExp('\\b(' + name + '|' + table + ')\\b').test(fread(p));
        });
      case 'journey': {
        var je = sread('journey-evidence.json');
        if (!je || !je.journeys) return false;
        return je.journeys.some(function (j) { return j.entity === name && j.status === 'covered'; });
      }
      default: return false;
    }
  }

  function graph(contract) {
    contract = contract || contractOf();
    var sc = schema();
    var entities = (contract && contract.entities) || (sc && sc.entities) || [];
    var reqs = (contract && contract.requirements) || [];
    return entities
      .filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; })
      .map(function (e) {
        return {
          id: 'FEAT-' + e.name,
          kind: 'entity',
          name: e.name,
          table: tableFor(e.name, sc),
          requirementIds: reqs.filter(function (r) { return new RegExp('\\b' + e.name + '\\b', 'i').test(r.statement || ''); }).map(function (r) { return r.id; }),
          facets: FACETS.map(function (f) { return f.id; })
        };
      });
  }

  function status(contract) {
    var sc = schema();
    var g = graph(contract);
    var features = g.map(function (feat) {
      var facetState = {};
      FACETS.forEach(function (f) { facetState[f.id] = !!detectFacet(f.id, feat.name, feat.table, sc); });
      var done = FACETS.filter(function (f) { return facetState[f.id]; }).length;
      // next gap = first facet (in build order) that is missing AND whose dep is met
      var nextGap = null;
      for (var i = 0; i < FACETS.length; i++) {
        var f = FACETS[i];
        if (facetState[f.id]) continue;
        if (f.dep && !facetState[f.dep]) { nextGap = { facet: f.id, label: f.label, blockedBy: f.dep }; break; }
        nextGap = { facet: f.id, label: f.label, blockedBy: null };
        break;
      }
      return {
        id: feat.id, name: feat.name, requirementIds: feat.requirementIds,
        facets: facetState,
        built: done, total: FACETS.length,
        completion: Math.round(done / FACETS.length * 100) / 100,
        nextGap: nextGap
      };
    });
    var totalFacets = features.length * FACETS.length;
    var builtFacets = features.reduce(function (a, f) { return a + f.built; }, 0);
    return {
      generatedAt: Date.now(),
      features: features,
      overall: {
        featureCount: features.length,
        complete: features.filter(function (f) { return f.completion === 1; }).length,
        facetCompletion: totalFacets ? Math.round(builtFacets / totalFacets * 100) / 100 : 1
      }
    };
  }

  function nextTask() {
    var st = status();
    // the incomplete feature that is furthest along (finish what's started),
    // then its next actionable facet
    var candidates = st.features.filter(function (f) { return f.completion < 1 && f.nextGap && !f.nextGap.blockedBy; });
    if (!candidates.length) {
      var blocked = st.features.filter(function (f) { return f.completion < 1 && f.nextGap; })[0];
      if (!blocked) return null;
      return { feature: blocked.name, facet: blocked.nextGap.facet, why: 'blocked — build ' + blocked.nextGap.blockedBy + ' first' };
    }
    candidates.sort(function (a, b) { return b.completion - a.completion; });
    var pick = candidates[0];
    return { feature: pick.name, facet: pick.nextGap.facet, why: 'closest to done (' + Math.round(pick.completion * 100) + '%) — next facet is "' + pick.nextGap.label + '"' };
  }

  // §63 — actually build the next actionable facet for a feature by routing to
  // the generator that owns it. Returns what ran + the before/after completion.
  function build(featureName, opts) {
    opts = opts || {};
    var st = status();
    var feat = st.features.filter(function (f) { return f.name === featureName; })[0] ||
      (opts.auto ? st.features.filter(function (f) { return f.completion < 1 && f.nextGap && !f.nextGap.blockedBy; }).sort(function (a, b) { return b.completion - a.completion; })[0] : null);
    if (!feat) return { built: false, reason: featureName ? 'FEATURE_NOT_FOUND' : 'NOTHING_ACTIONABLE' };
    if (feat.completion === 1) return { built: false, reason: 'ALREADY_COMPLETE', feature: feat.name };
    var gap = feat.nextGap;
    if (gap.blockedBy) return { built: false, reason: 'BLOCKED_BY_' + gap.blockedBy, feature: feat.name };

    var contract = contractOf();
    var ran = [];
    if (['dataModel', 'migration', 'service', 'restApi', 'ui'].indexOf(gap.facet) >= 0) {
      if (Engine.Scaffold && Engine.Scaffold.generate) {
        var spec = Engine.Scaffold.specFromContract ? Engine.Scaffold.specFromContract(contract) : null;
        (Engine.Scaffold.generate(spec) || []).forEach(function (f) { try { FS().write(f.path, f.content); } catch (_) {} });
        ran.push('Engine.Scaffold.generate');
      }
    } else if (gap.facet === 'test') {
      if (Engine.TestGen && Engine.TestGen.generate) { Engine.TestGen.generate({}); ran.push('Engine.TestGen.generate'); }
    } else if (gap.facet === 'journey') {
      if (Engine.Journeys && Engine.Journeys.generate) { Engine.Journeys.generate(); ran.push('Engine.Journeys.generate'); }
    }
    var after = status().features.filter(function (f) { return f.name === feat.name; })[0];
    return {
      built: ran.length > 0,
      feature: feat.name,
      facet: gap.facet,
      ran: ran,
      completionBefore: feat.completion,
      completionAfter: after ? after.completion : feat.completion,
      note: gap.facet === 'journey' || gap.facet === 'test'
        ? 'suite generated — run the evidence gate (npm test) to mark it covered'
        : 'artefacts (re)generated'
    };
  }

  function analyze() {
    var st = status();
    var next = nextTask();
    var out = { generatedAt: st.generatedAt, overall: st.overall, features: st.features, nextTask: next };
    if (S()) {
      S().write('feature-graph.json', out);
      S().write('feature-graph.md',
        '# Feature completion graph\n\n_Generated ' + new Date(out.generatedAt).toISOString() + '_\n\n' +
        (st.features.length
          ? st.overall.complete + ' / ' + st.overall.featureCount + ' features complete · ' +
            Math.round(st.overall.facetCompletion * 100) + '% of all facets built.\n\n' +
            '| Feature | ' + ['data', 'migr', 'svc', 'api', 'ui', 'test', 'jrny'].join(' | ') + ' | % | Next |\n' +
            '|---|' + '---|'.repeat(8) + '\n' +
            st.features.map(function (f) {
              var cells = ['dataModel', 'migration', 'service', 'restApi', 'ui', 'test', 'journey']
                .map(function (k) { return f.facets[k] ? '✅' : '·'; });
              return '| **' + f.name + '** | ' + cells.join(' | ') + ' | ' + Math.round(f.completion * 100) + '% | ' +
                (f.nextGap ? (f.nextGap.blockedBy ? '⛔ ' + f.nextGap.label : f.nextGap.label) : '—') + ' |';
            }).join('\n') + '\n\n' +
            (next ? '**Next task:** ' + next.feature + ' → ' + next.facet + ' (' + next.why + ')\n' : '**All features complete.**\n')
          : '_No features in the contract._\n'));
    }
    return out;
  }

  function load() { return sread('feature-graph.json'); }

  Engine.Features = { FACETS: FACETS, graph: graph, status: status, nextTask: nextTask, build: build, analyze: analyze, load: load, _detectFacet: detectFacet };
  console.info('[Features] feature builder + completion graph ready — Engine.Features');
})();
