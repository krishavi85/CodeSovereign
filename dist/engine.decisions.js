/* =====================================================================
   engine.decisions.js  —  Engine.Decisions   (blueprint §57-58)

   The decision ledger — ADR-style. Harvests every consequential choice the
   factory made (and the ones it deliberately did NOT make) from the
   existing evidence and turns them into Architecture Decision Records:

     - assumptions the contract chose for an ambiguous prompt
     - stack substitutions (a requested framework mapped to a supported one)
     - the runtime target + why
     - requests refused as unsafe / declined as out of scope   (rejected)
     - automated repairs that regressed the evidence and were rolled back
       (rejected approaches — the thing §57 explicitly wanted captured)
     - verification limited by the environment
     - the final release decision (VERIFIED / PARTIAL / BLOCKED)
     - deferred dependency upgrades

   Stable IDs: an existing `decision-log.json` is read first and each ADR
   keeps its number across regenerations (matched on a content key); only
   genuinely new decisions get the next number.

   window.Engine.Decisions
     harvest()   -> [ADR, …]
     record(adr) -> append a hand-written ADR (status defaults to "accepted")
     analyze()   -> writes .sovereign/decision-log.json + docs/DECISIONS.md
     load()      -> the log or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function sread(name) {
    try { var v = S() && S().read(name); return (v && typeof v === 'object') ? v : (typeof v === 'string' && /\.json$/.test(name) ? safeParse(v) : v); } catch (_) { return null; }
  }
  function safeParse(s) { try { return JSON.parse(s); } catch (_) { return null; } }
  function contractOf() { try { return (Engine.Contract && Engine.Contract.load && Engine.Contract.load()) || null; } catch (_) { return null; } }

  var STATUS = { accepted: 'Accepted', proposed: 'Proposed', rejected: 'Rejected', superseded: 'Superseded' };

  // a short stable key for an ADR (so numbers survive regeneration)
  function keyOf(adr) { return (adr.category + '|' + adr.title).toLowerCase().replace(/\s+/g, ' ').trim(); }

  function harvest() {
    var out = [];
    var contract = contractOf();
    var run = sread('ultramode-run.json');
    var dod = sread('definition-of-done.json');
    var add = function (category, title, status, context, decision, consequences, evidence) {
      out.push({ category: category, title: title, status: status, context: context, decision: decision, consequences: consequences || [], evidence: evidence || [] });
    };

    // 1) contract assumptions — ambiguity resolved with a conservative default
    ((contract && contract.assumptions) || []).forEach(function (a) {
      add('Assumption', 'Assume ' + a.about, 'accepted',
        'The request did not specify ' + a.about + '. ' + (a.rationale || ''),
        a.decision,
        ['A different requirement would change this — it is a default, not a constraint.'],
        ['product-contract.json']);
    });

    // 2) stack substitution
    var st = (contract && contract.supportedStack) || {};
    if (st && st.frontend && /svelte/i.test(JSON.stringify(contract && contract.requested || '')) && !/svelte/i.test(st.frontend)) {
      add('Architecture', 'Frontend framework substitution', 'accepted',
        'Svelte needs a compiler step; the factory generates build-free apps so the runtime crawl can drive them.',
        'Generate the app with the ' + st.frontend + ' component runtime (same app shape, vendored VDOM, no build).',
        ['The generated code is ' + st.frontend + ', not Svelte — porting later is a mechanical component rename.'],
        ['product-contract.json']);
    }
    ((contract && contract.assumptions) || []).filter(function (a) { return /substitution/i.test(a.about); }).forEach(function (a) {
      // already covered by #1, but flag it as an Architecture decision too
    });

    // 3) runtime target
    if (contract && contract.target && contract.target !== 'web') {
      var meta = { android: 'native Android', ios: 'native iOS', evm: 'EVM smart contract', 'ml-training': 'ML model training' }[contract.target] || contract.target;
      add('Architecture', 'Runtime target: ' + meta, 'accepted',
        'The request describes a ' + meta + ', which runs in a different runtime than a web app.',
        'Route generation + verification through the ' + contract.target + ' runtime adapter; a missing host toolchain yields BLOCKED/PARTIAL with the exact prerequisite, never a blanket "unsupported".',
        [], ['product-contract.json', 'ultramode-plan.json']);
    }

    // 4) declined / refused requests — rejected decisions
    var clar = (run && run.clarification) || {};
    (clar.unsupported || []).forEach(function (u) {
      add('Scope', 'Not built: ' + String(u.request).slice(0, 60), 'rejected',
        u.reason || 'Outside the supported generation stack.',
        'Excluded from this build. The rest of the request was generated normally.',
        [], ['ultramode-report.md']);
    });
    (clar.unsafe || []).forEach(function (u) {
      add('Security', 'Refused (unsafe): ' + String(u.request).slice(0, 60), 'rejected',
        u.reason || 'The request asks for functionality that must not be built.',
        'Refused. Nothing was generated for this part.',
        [], ['ultramode-report.md']);
    });

    // 5) rolled-back repairs — rejected approaches
    ((run && run.artifacts && run.artifacts.steps) || []).filter(function (s) { return s.rolledBack; }).forEach(function (s, i) {
      add('Repair', 'Rejected repair approach #' + (i + 1), 'rejected',
        'An automated repair pass was applied during the loop.',
        s.note || 'The repair regressed the evidence and was rolled back to the last good snapshot.',
        ['The underlying finding was addressed by a later pass or remains recorded in known-issues.md.'],
        ['ultramode-run.json']);
    });

    // 6) environment-limited verification
    var degraded = (run && run.degraded && run.degraded.reasons) || [];
    if (degraded.length) {
      add('Verification', 'Verification limited by the environment', 'accepted',
        'This run could not exercise: ' + degraded.join(', ') + '.',
        'The result is reported honestly (PARTIAL / BLOCKED) rather than claimed as fully verified.',
        ['Re-run on a host with the missing capability to close the gap.'],
        ['ultramode-report.md']);
    }

    // 7) deferred dependency upgrades
    var up = sread('upgrade-plan.json');
    (up && up.upgrades || []).filter(function (u) { return u.type === 'major'; }).slice(0, 6).forEach(function (u) {
      add('Dependencies', 'Deferred upgrade: ' + u.name + ' -> v' + u.targetMajor, 'proposed',
        String(u.notes || '').slice(0, 200),
        'Not applied automatically (' + u.risk + '-risk major). Run `Engine.Upgrade.apply(\'' + u.name + '\')` when ready — the proof loop verifies it.',
        [], ['upgrade-plan.json']);
    });

    // 8) the release decision
    if (dod) {
      var verdict = (run && (run.result || run.state)) ||
        (dod.PASS ? 'VERIFIED' : 'NOT VERIFIED');
      add('Release', 'Release decision: ' + verdict, dod.PASS || verdict === 'PARTIAL' ? 'accepted' : 'proposed',
        'The Definition-of-Done gate evaluated ' + (dod.criteria ? Object.keys(dod.criteria).length : 14) + ' criteria against the evidence.',
        verdict === 'VERIFIED' ? 'Shipped as SOVEREIGN VERIFIED.'
          : verdict === 'PARTIAL' ? 'Shipped as SOVEREIGN VERIFIED — PARTIAL (everything this host can verify passed).'
            : 'Not certified — failing: ' + ((dod.failing || (dod.criteria ? Object.keys(dod.criteria).filter(function (k) { return !dod.criteria[k]; }) : [])).join(', ') || 'see the DoD report') + '.',
        [], ['definition-of-done.json', 'release-certificate.md']);
    }

    return out;
  }

  function assignIds(fresh) {
    var prev = load();
    var prevByKey = {};
    var maxN = 0;
    ((prev && prev.decisions) || []).forEach(function (d) {
      prevByKey[keyOf(d)] = d;
      var n = parseInt(String(d.id).replace(/\D/g, ''), 10);
      if (n > maxN) maxN = n;
    });
    // keep manual ADRs that are no longer auto-harvested (status stays as recorded)
    var manual = ((prev && prev.decisions) || []).filter(function (d) { return d.source === 'manual'; });
    var next = maxN;
    var withIds = fresh.map(function (d) {
      var k = keyOf(d);
      var old = prevByKey[k];
      var id = old ? old.id : 'ADR-' + String(++next).padStart(3, '0');
      return Object.assign({ id: id, at: (old && old.at) || Date.now(), source: 'harvested' }, d);
    });
    // append manuals not already present
    manual.forEach(function (m) {
      if (!withIds.some(function (d) { return d.id === m.id; })) withIds.push(m);
    });
    return withIds.sort(function (a, b) {
      return parseInt(String(a.id).replace(/\D/g, ''), 10) - parseInt(String(b.id).replace(/\D/g, ''), 10);
    });
  }

  function record(adr) {
    var log = load() || { decisions: [] };
    var maxN = 0;
    log.decisions.forEach(function (d) { var n = parseInt(String(d.id).replace(/\D/g, ''), 10); if (n > maxN) maxN = n; });
    var full = Object.assign({
      id: 'ADR-' + String(maxN + 1).padStart(3, '0'), at: Date.now(), source: 'manual',
      category: 'Manual', status: 'accepted', context: '', decision: '', consequences: [], evidence: []
    }, adr || {});
    log.decisions.push(full);
    log.generatedAt = Date.now();
    if (S()) S().write('decision-log.json', log);
    writeMd(log.decisions);
    return full;
  }

  function writeMd(decisions) {
    if (!S()) return;
    var byStatus = decisions.reduce(function (m, d) { m[d.status] = (m[d.status] || 0) + 1; return m; }, {});
    var L = ['# Decision log', '',
      '_Architecture Decision Records — generated by `Engine.Decisions` from the build evidence, newest first. ' +
      'Manual records (`source: manual`) are preserved across regenerations._', '',
      '| Status | Count |', '|---|---|'];
    Object.keys(byStatus).forEach(function (s) { L.push('| ' + (STATUS[s] || s) + ' | ' + byStatus[s] + ' |'); });
    L.push('');
    decisions.slice().reverse().forEach(function (d) {
      L.push('## ' + d.id + ' — ' + d.title, '',
        '- **Status:** ' + (STATUS[d.status] || d.status) + (d.supersededBy ? ' (by ' + d.supersededBy + ')' : ''),
        '- **Category:** ' + d.category,
        '- **Date:** ' + new Date(d.at).toISOString().slice(0, 10), '',
        '**Context.** ' + (d.context || '—'), '',
        '**Decision.** ' + (d.decision || '—'), '');
      if ((d.consequences || []).length) { L.push('**Consequences.**'); d.consequences.forEach(function (c) { L.push('- ' + c); }); L.push(''); }
      if ((d.evidence || []).length) L.push('_Evidence: ' + d.evidence.map(function (e) { return '`.sovereign/' + e + '`'; }).join(', ') + '_', '');
    });
    S().write('decision-report.md', L.join('\n'));
    // also drop an ADR file into the repo docs if a product repo exists
    try {
      if (FS() && (FS().isFile('/package.json') || FS().isFile('/server.js'))) FS().write('/docs/DECISIONS.md', L.join('\n'));
    } catch (_) {}
  }

  function analyze() {
    var decisions = assignIds(harvest());
    var log = { generatedAt: Date.now(), count: decisions.length, decisions: decisions,
      byStatus: decisions.reduce(function (m, d) { m[d.status] = (m[d.status] || 0) + 1; return m; }, {}) };
    if (S()) S().write('decision-log.json', log);
    writeMd(decisions);
    return log;
  }

  function load() {
    try { var v = S() && S().read('decision-log.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; }
  }

  Engine.Decisions = { harvest: harvest, record: record, analyze: analyze, load: load, _keyOf: keyOf };
  console.info('[Decisions] decision ledger (ADR) ready — Engine.Decisions');
})();
