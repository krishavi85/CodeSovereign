/* =====================================================================
   engine.contract.js  —  Engine.Contract

   The Product Contract: turns an objective (prompt / README / detected
   archetypes / the controls that already exist) into an explicit list of
   requirements, each with MACHINE-CHECKABLE acceptance criteria that the
   Evidence Ledger and the Definition-of-Done gate verify against the
   `.sovereign/` evidence.

   window.Engine.Contract
     derive(input)   input = { prompt?, readme?, useLLM? }  -> contract object
     load()          -> the written contract or null
     write(c)        -> .sovereign/product-contract.json
     ACCEPT_KINDS    the criterion vocabulary (also what the Ledger understands)

   Criterion kinds (all checked against .sovereign/* — never re-run here):
     { kind:'execution', gate:'testsPass'|'buildPasses'|'lintClean'|'typesClean' }
     { kind:'control',   name:<label>, want:'REAL' }        control observed REAL
     { kind:'no-mock' }                                     no MOCK/BROKEN prod control
     { kind:'file',      path:'/x' }                        file present
     { kind:'ci',        want:'test+build' }                a CI file runs test & build
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine || !Engine.FS) { console.error('[Contract] Engine.FS missing'); return; }
  var FS = Engine.FS;
  var S = function () { return Engine.Sovereign; };

  var ACCEPT_KINDS = ['execution', 'control', 'no-mock', 'file', 'ci'];

  // Sovereign.read() returns a PARSED object for *.json — never double-parse.
  function sj(p) {
    try {
      var v = S() ? S().read(p) : null;
      if (v == null) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } }
      return v;
    } catch (_) { return null; }
  }
  function readText(p) { try { return FS.read(p) || ''; } catch (_) { return ''; } }
  function has(p) { try { return FS.exists(p); } catch (_) { return false; } }
  function pkg() { try { return JSON.parse(readText('/package.json') || 'null'); } catch (_) { return null; } }

  function productIdentity(input) {
    var p = pkg() || {};
    var proj = (Engine.Proj && Engine.Proj.current && Engine.Proj.current()) || null;
    var pj = sj('project.json');
    var ds = sj('decision-state.json');
    return {
      name: p.name || (proj && proj.name) || (pj && pj.name) || 'project',
      type: (pj && pj.detectedType) || (ds && ds.projectType) || 'unknown',
      targets: (pj && pj.targets) || (ds && ds.externals) || [],
      objective: String((input && input.prompt) || (pj && pj.prompt) || firstReadmeLine() || '').slice(0, 400)
    };
  }
  function firstReadmeLine() {
    var r = readText('/README.md') || readText('/readme.md');
    return (r.split('\n').filter(function (l) { return l.trim() && !/^#/.test(l); })[0] || '').trim();
  }

  var _rid = 0;
  function req(statement, category, acceptanceCriteria, extra) {
    _rid++;
    return Object.assign({
      id: 'REQ-' + ('000' + _rid).slice(-3),
      statement: statement,
      category: category,
      acceptanceCriteria: acceptanceCriteria || [],
      dependsOn: [],
      implementationFiles: [],
      status: 'unverified'
    }, extra || {});
  }

  // ---- rule-based derivation (offline, always available) ----
  function deriveRules(identity) {
    _rid = 0;
    var out = [];
    var p = pkg() || {};
    var scripts = p.scripts || {};

    if (scripts.test) out.push(req('The project’s automated tests pass.', 'quality',
      [{ kind: 'execution', gate: 'testsPass' }]));
    if (scripts.build) out.push(req('The project builds a production artifact.', 'quality',
      [{ kind: 'execution', gate: 'buildPasses' }]));
    if (scripts.lint) out.push(req('The project passes lint with no findings.', 'quality',
      [{ kind: 'execution', gate: 'lintClean' }]));
    if (scripts.typecheck || has('/tsconfig.json')) out.push(req('The project type-checks cleanly.', 'quality',
      [{ kind: 'execution', gate: 'typesClean' }]));

    // every interactive control on a production path must do something real
    var inv = sj('interaction-inventory.json');
    var controls = (inv && inv.interactions) || [];
    controls.forEach(function (it) {
      if (it.control === 'form' || it.control === 'input' || it.control === 'select' || it.control === 'textarea') return;
      var nm = String(it.name || '').trim();
      if (!nm || nm.length > 40) return;
      out.push(req('The "' + nm + '" control performs its intended action.', 'interaction',
        [{ kind: 'control', name: nm.toLowerCase(), want: 'REAL' }],
        { control: nm, file: it.file }));
    });

    // no simulated production behaviour anywhere
    out.push(req('No production control is simulated, mocked, or broken.', 'integrity',
      [{ kind: 'no-mock' }]));

    // CI must actually run the quality gates
    var pipe = sj('pipeline-inventory.json');
    if (pipe && (pipe.count || 0) > 0) out.push(req('CI runs the test and build gates on every change.', 'delivery',
      [{ kind: 'ci', want: 'test+build' }]));

    // domain-pack mandatory items become tracked requirements (best-effort criteria)
    var rq = sj('requirements.json');
    ((rq && rq.mandatoryChecklist) || []).slice(0, 40).forEach(function (c) {
      out.push(req(c.requirement, 'domain',
        c.status === 'present-ish' ? [] : [],
        { source: 'domain-pack', note: c.status }));
    });
    // model-found implied requirements (Engine.Requirements.aiAssist)
    ((rq && rq.aiImpliedRequirements) || []).slice(0, 14).forEach(function (s) {
      out.push(req(String(s).slice(0, 200), 'functional', [{ kind: 'manual', check: String(s).slice(0, 200) }], { source: 'ai' }));
    });

    return out;
  }

  // ---- optional LLM enrichment ----
  function deriveLLM(identity) {
    var LLM = Engine.LLM;
    if (!LLM || !LLM.complete) return Promise.resolve(null);
    var ok = (LLM.isConfigured && LLM.isConfigured()) || (Engine.AI && Engine.AI.ready && Engine.AI.ready());
    if (!ok) return Promise.resolve(null);
    var ask = 'Objective: ' + (identity.objective || identity.name) + '\n' +
      'Return ONLY JSON: {"requirements":[{"statement":"...","category":"functional|quality|security|delivery",' +
      '"acceptanceCriteria":["short testable sentence", ...]}]}. 6-14 requirements, concrete and verifiable.';
    return LLM.complete(ask, { classification: { primaryType: identity.type } })
      .then(function (r) {
        var txt = (r && (r.content || r)) || '';
        var j = null; try { j = JSON.parse(String(txt).replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')); } catch (_) {}
        if (!j || !Array.isArray(j.requirements)) return null;
        return j.requirements.slice(0, 14).map(function (x) {
          return req(String(x.statement || '').slice(0, 200), x.category || 'functional',
            (x.acceptanceCriteria || []).slice(0, 6).map(function (s) { return { kind: 'manual', check: String(s).slice(0, 200) }; }),
            { source: 'llm' });
        });
      })
      .catch(function () { return null; });
  }

  function derive(input) {
    input = input || {};
    var identity = productIdentity(input);
    var base = deriveRules(identity);
    var finish = function (llmReqs) {
      var requirements = base;
      if (llmReqs && llmReqs.length) {
        // LLM requirements are additive but re-numbered after the rule set
        llmReqs.forEach(function (r) { r.id = 'REQ-' + ('000' + (++_rid)).slice(-3); });
        requirements = base.concat(llmReqs);
      }
      var contract = {
        generatedAt: Date.now(),
        source: llmReqs && llmReqs.length ? 'rules+llm' : 'rules',
        product: identity,
        requirements: requirements,
        totals: {
          requirements: requirements.length,
          withMachineCriteria: requirements.filter(function (r) {
            return r.acceptanceCriteria.some(function (c) { return ACCEPT_KINDS.indexOf(c.kind) >= 0; });
          }).length
        }
      };
      write(contract);
      return contract;
    };
    if (input.useLLM === false) return Promise.resolve(finish(null));
    return deriveLLM(identity).then(finish);
  }

  function write(c) { if (S()) S().write('product-contract.json', c); return c; }
  function load() { return sj('product-contract.json'); }

  Engine.Contract = { derive: derive, write: write, load: load, ACCEPT_KINDS: ACCEPT_KINDS };
  console.info('[Contract] product-contract engine ready — Engine.Contract');
})();
