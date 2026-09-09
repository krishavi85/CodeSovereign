/* =====================================================================
   engine.requirements.js  —  Requirements Intelligence depth.

   Adds what engine-universal.js lacked:
     Engine.Requirements.PACKS               domain requirement packs
     Engine.Requirements.detectArchetypes(ctx)   from repo signals + prompt
     Engine.Requirements.activate(archetypes)     -> merged mandatory checklist
     Engine.Requirements.contradictions(ctx)      -> conflicts + resolutions
     Engine.Requirements.classify(items, ctx)     -> Mandatory/.../Excluded
     Engine.Requirements.scoreStack(ctx, cands)   -> weighted 12-factor score
     Engine.Requirements.questions(ctx)           -> top high-impact open questions
   ===================================================================== */
(function () {
  'use strict';
  if (!window.Engine) return;
  var Engine = window.Engine;
  var FS = Engine.FS;

  /* ---------------- domain requirement packs ---------------- */
  var PACKS = {
    saas: {
      label: 'SaaS / multi-tenant',
      mandatory: ['tenant isolation', 'authentication + session lifecycle', 'role-based authorization', 'subscription / billing', 'usage metering & quotas', 'admin portal', 'audit log', 'onboarding flow', 'password reset + email verification', 'account deletion / data export'],
      risks: ['cross-tenant data leakage', 'billing/entitlement drift', 'noisy-neighbour resource contention'],
      integrations: ['Stripe / billing', 'transactional email', 'SSO / OIDC'],
      compliance: ['data processing agreement', 'GDPR data export & erasure']
    },
    ecommerce: {
      label: 'E-commerce / marketplace',
      mandatory: ['catalog + inventory', 'cart', 'checkout', 'payment capture + reconciliation', 'tax calculation', 'shipping / fulfilment', 'order state machine', 'refunds / returns', 'fraud controls', 'order & customer admin'],
      risks: ['double-charge on retry', 'overselling stock', 'payment webhook race', 'price/tax rounding errors'],
      integrations: ['payment provider', 'tax provider', 'shipping carrier', 'address validation'],
      compliance: ['PCI scope (use hosted fields)', 'consumer refund rights']
    },
    music: {
      label: 'Music / audio / DAW',
      mandatory: ['audio import/export + codec support', 'waveform + timeline UI', 'low-latency I/O', 'project file format', 'stem / effect pipeline', 'device (audio interface / MIDI) selection', 'crash-safe autosave', 'job progress + cancellation', 'licensing / rights metadata'],
      risks: ['audio glitches under CPU load', 'sample-rate / channel mismatch', 'data loss on crash', 'model/GPU memory exhaustion'],
      integrations: ['audio device layer', 'GPU / model runtime'],
      compliance: ['sample-clearance / licensing disclosure']
    },
    video: {
      label: 'Video / media generation',
      mandatory: ['asset pipeline', 'GPU job queue', 'transcoding', 'progress + retries', 'storage lifecycle', 'preview generation', 'moderation', 'watermark / provenance', 'cost protection / quotas'],
      risks: ['runaway GPU cost', 'storage growth', 'stuck / zombie jobs', 'unmoderated output'],
      integrations: ['object storage', 'GPU provider', 'CDN'],
      compliance: ['content moderation policy', 'AI provenance labelling']
    },
    ai_app: {
      label: 'AI application / agent',
      mandatory: ['model / provider abstraction', 'prompt + context assembly', 'streaming responses + cancellation', 'tool invocation + structured output validation', 'evaluation suite', 'safety filters', 'fallback provider', 'cost + token accounting', 'telemetry', 'no fabricated-accuracy claims'],
      risks: ['prompt injection', 'runaway cost', 'silent provider failure', 'unbounded context', 'hallucinated tool calls'],
      integrations: ['LLM provider(s)', 'vector store (if RAG)', 'observability'],
      compliance: ['data-sent-to-provider disclosure', 'output provenance']
    },
    finance: {
      label: 'Finance / accounting',
      mandatory: ['double-entry / ledger integrity', 'immutable audit trail', 'reconciliation', 'permissions + segregation of duties', 'encryption at rest', 'reporting / exports', 'regulatory retention'],
      risks: ['balance drift', 'rounding accumulation', 'unauthorized adjustment', 'incomplete audit trail'],
      integrations: ['bank / payment feeds', 'tax authority'],
      compliance: ['SOX-style controls', 'jurisdiction retention rules', 'KYC/AML if applicable']
    },
    healthcare: {
      label: 'Healthcare / sensitive records',
      mandatory: ['consent management', 'access logging (every read)', 'field-level encryption', 'retention + deletion policy', 'interoperability (FHIR/HL7 if applicable)', 'break-glass access', 'de-identification for analytics'],
      risks: ['PHI exposure', 'over-broad access', 'unlogged reads', 'insecure export'],
      integrations: ['EHR / interoperability gateway', 'identity provider'],
      compliance: ['HIPAA / GDPR-health / jurisdiction-specific', 'BAA with processors']
    },
    social: {
      label: 'Social / messaging',
      mandatory: ['identity + profiles', 'follow / connection graph', 'feed', 'messaging', 'notifications', 'moderation + reporting', 'blocking', 'privacy controls', 'abuse rate-limiting'],
      risks: ['abuse / harassment', 'spam waves', 'notification storms', 'graph-query cost at scale'],
      integrations: ['push notification service', 'content moderation', 'media storage'],
      compliance: ['minor-safety', 'content takedown process', 'data portability']
    },
    education: {
      label: 'Education / LMS',
      mandatory: ['courses + enrollment', 'progress tracking', 'assessment + grading', 'certificates', 'teacher / student roles', 'content delivery', 'accessibility (WCAG)'],
      risks: ['grade tampering', 'assessment integrity', 'minor data handling'],
      integrations: ['video hosting', 'SSO (school)', 'plagiarism check'],
      compliance: ['FERPA / minor-data rules', 'accessibility conformance']
    },
    local_first: {
      label: 'Local-first / offline-first',
      mandatory: ['local database', 'mutation queue', 'sync protocol', 'conflict resolution policy', 'device identity', 'encryption', 'schema migration', 'recovery / restore', 'connection + sync status UI'],
      risks: ['lost writes on reconnect', 'merge conflicts corrupting data', 'clock skew', 'unbounded local growth'],
      integrations: ['sync backend (optional)', 'device keychain'],
      compliance: ['local-data encryption', 'export / delete on device']
    },
    iot: {
      label: 'IoT / industrial',
      mandatory: ['device identity + provisioning', 'telemetry ingestion', 'command safety + confirmation', 'edge processing', 'firmware update channel', 'connectivity-loss handling', 'alerting'],
      risks: ['unsafe remote command', 'telemetry flood', 'firmware brick', 'fleet-wide outage'],
      integrations: ['MQTT / device gateway', 'time-series store'],
      compliance: ['device security baseline', 'safety certification']
    },
    devtool: {
      label: 'Developer tool / IDE',
      mandatory: ['workspace / project management', 'language services', 'terminal / process execution', 'build tool integration', 'plugin system + sandboxing', 'source control', 'diagnostics', 'crash recovery', 'updater'],
      risks: ['arbitrary code execution surface', 'plugin supply chain', 'workspace path escapes', 'secret leakage to plugins'],
      integrations: ['language servers', 'model providers', 'git host'],
      compliance: ['telemetry opt-in', 'plugin signing']
    },
    game: {
      label: 'Game',
      mandatory: ['game loop', 'rendering', 'input', 'state persistence / saves', 'asset pipeline', 'audio', 'settings', 'platform services'],
      risks: ['frame drops', 'save corruption', 'cheating (if multiplayer)', 'asset load stalls'],
      integrations: ['platform SDK', 'netcode (if multiplayer)', 'analytics'],
      compliance: ['age rating', 'loot-box disclosure (if applicable)']
    }
  };

  var ARCHETYPE_SIGNALS = [
    ['saas', /tenant|subscription|multi-?tenant|saas|billing|plan|seat/i, ['stripe', '@supabase', 'clerk', 'auth0']],
    ['ecommerce', /\b(shop|store|cart|checkout|catalog|ecommerce|e-commerce|marketplace|inventory)\b/i, ['shopify', 'medusa', '@commercelayer', 'swell', 'saleor']],
    ['music', /audio|daw|stem|waveform|midi|beat|mixer|mastering/i, ['tone', 'wavesurfer', 'web-audio', 'howler']],
    ['video', /video|transcode|ffmpeg|render.*(clip|frame)|gpu.*job/i, ['ffmpeg', 'fluent-ffmpeg']],
    ['ai_app', /\b(llm|prompt|embedding|rag|agent|chat.?bot|inference)\b/i, ['openai', '@anthropic', '@ai-sdk', 'langchain', 'llamaindex']],
    ['finance', /ledger|invoice|accounting|reconcil|double-?entry|transaction.*balance/i, ['dinero', 'currency.js', 'decimal.js']],
    ['healthcare', /patient|clinical|\bphi\b|\bhl7\b|\bfhir\b|medical record/i, ['fhir', 'hl7']],
    ['social', /\bfeed\b|follow(er|ing)|timeline|\bdm\b|direct message|social/i, ['socket.io', 'stream-chat']],
    ['education', /course|lesson|enroll|student|teacher|grade|assessment|\blms\b/i, []],
    ['local_first', /offline|local-?first|sync engine|conflict resolution|crdt/i, ['yjs', 'automerge', 'rxdb', 'watermelondb', 'dexie']],
    ['iot', /telemetry|\bmqtt\b|firmware|device fleet|sensor/i, ['mqtt', 'aws-iot']],
    ['devtool', /\bide\b|editor|language server|workspace|terminal|repl/i, ['monaco-editor', 'codemirror', 'xterm', 'node-pty']],
    ['game', /game loop|sprite|render loop|physics|matchmaking|\benemy\b/i, ['phaser', 'three', 'babylonjs', 'pixi.js']]
  ];

  function pkg() { try { return JSON.parse(FS.read('/package.json') || 'null'); } catch (e) { return null; } }

  function detectArchetypes(ctx) {
    ctx = ctx || {};
    var text = (ctx.prompt || '') + ' ';
    Object.keys(FS._data).forEach(function (p) {
      if (/\.(md|txt)$/i.test(p) && /readme|spec|requirement/i.test(p)) text += (FS.read(p) || '').slice(0, 4000) + ' ';
    });
    var p = pkg() || {};
    var deps = Object.keys(Object.assign({}, p.dependencies || {}, p.devDependencies || {}));

    var hits = [];
    ARCHETYPE_SIGNALS.forEach(function (rule) {
      var score = 0;
      if (rule[1].test(text)) score += 2;
      rule[2].forEach(function (d) { if (deps.some(function (x) { return x.indexOf(d) >= 0; })) score += 2; });
      if (score > 0) hits.push({ archetype: rule[0], label: PACKS[rule[0]].label, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits;
  }

  function activate(archetypes) {
    var list = (archetypes || []).map(function (a) { return typeof a === 'string' ? a : a.archetype; });
    var out = { mandatory: [], risks: [], integrations: [], compliance: [], packs: [] };
    list.forEach(function (a) {
      var pk = PACKS[a]; if (!pk) return;
      out.packs.push({ archetype: a, label: pk.label });
      ['mandatory', 'risks', 'integrations', 'compliance'].forEach(function (k) {
        pk[k].forEach(function (item) { if (out[k].indexOf(item) < 0) out[k].push(item); });
      });
    });
    return out;
  }

  /* ---------------- contradiction / feasibility ---------------- */
  var CONTRADICTIONS = [
    { id: 'offline-vs-cloud-collab', when: function (c) { return c.offline && c.realtimeCollab; },
      conflict: '100% offline vs real-time cloud collaboration',
      resolution: 'Define explicit sync boundaries and a conflict policy (CRDT / OT), or mark real-time collab as online-only.' },
    { id: 'nologin-vs-private-sync', when: function (c) { return c.noLogin && c.privateSyncedData; },
      conflict: 'No login vs private synchronized per-user data',
      resolution: 'Require identity, or a device/cryptographic ownership model (keypair-per-device).' },
    { id: 'zerobudget-vs-gpu', when: function (c) { return c.budgetTier === 'low' && c.gpuIntensive; },
      conflict: 'Minimal budget vs GPU-intensive generation',
      resolution: 'Use local hardware with a job queue, cap concurrency, or a metered pay-as-you-go provider with hard cost limits.' },
    { id: 'privacy-vs-thirdparty', when: function (c) { return c.maxPrivacy && (c.thirdPartyAnalytics || c.cloudAI); },
      conflict: 'Maximum privacy vs third-party analytics / cloud AI',
      resolution: 'Use self-hosted analytics and local models, or get explicit consent and document every data flow.' },
    { id: 'microservices-vs-smallteam', when: function (c) { return c.architecturePref === 'microservices' && (c.teamSize || 1) <= 3; },
      conflict: 'Microservices with a 1–3 person team',
      resolution: 'Apply an operational-complexity penalty; recommend a modular monolith unless independent scaling/ownership is proven.' },
    { id: 'instant-vs-broadscope', when: function (c) { return c.deadlineDays && c.deadlineDays < 21 && (c.featureCount || 0) > 15; },
      conflict: 'Fast delivery vs broad scope',
      resolution: 'Separate an MVP from later releases; expose the critical-path dependency chain.' },
    { id: 'ai-guaranteed-correct', when: function (c) { return c.guaranteedAiAccuracy; },
      conflict: 'Guaranteed AI correctness',
      resolution: 'Replace with an evaluation suite, confidence thresholds, human review for high-stakes actions, and a fallback path.' },
    { id: 'crossplatform-native', when: function (c) { return c.crossPlatform && c.nativeOnlyCapability; },
      conflict: 'One shared codebase vs a requested native-only capability',
      resolution: 'Use a native module / platform adapter for that capability; keep the shared code for the rest.' }
  ];

  function contradictions(ctx) {
    ctx = ctx || {};
    return CONTRADICTIONS.filter(function (r) { try { return r.when(ctx); } catch (e) { return false; } })
      .map(function (r) { return { id: r.id, conflict: r.conflict, resolution: r.resolution }; });
  }

  /* ---------------- exact-needs classification ---------------- */
  function classify(items, ctx) {
    ctx = ctx || {};
    var active = activate(ctx.archetypes || detectArchetypes(ctx));
    return (items || []).map(function (it) {
      var name = typeof it === 'string' ? it : (it.statement || it.name || '');
      var cls = 'Recommended', why = 'good practice';
      if (active.mandatory.some(function (m) { return name.toLowerCase().indexOf(m.split(' ')[0]) >= 0 || m.toLowerCase().indexOf(name.toLowerCase().split(' ')[0]) >= 0; })) { cls = 'Mandatory'; why = 'required by an active domain pack'; }
      else if (/audit|encryption|authoriz|permission|validation|backup|rollback/i.test(name)) { cls = 'Mandatory'; why = 'cross-cutting production requirement'; }
      else if (/theme|customi[sz]ation|animation|nice.to.have|cosmetic/i.test(name)) { cls = 'Optional'; why = 'enhancement'; }
      else if (/scale|shard|multi-?region|microservice/i.test(name) && (ctx.teamSize || 1) <= 3) { cls = 'Future'; why = 'not justified at current scale/team'; }
      else if (/\boffline\b/i.test(name) && !ctx.offline) { cls = 'Conditional'; why = 'only if offline use is required'; }
      return { requirement: name, classification: cls, rationale: why };
    });
  }

  /* ---------------- weighted stack scoring ---------------- */
  var WEIGHTS = { requirement_fit: 0.28, platform_fit: 0.16, maintainability: 0.12, ecosystem_maturity: 0.10, team_fit: 0.10, performance_fit: 0.08, security_fit: 0.06, cost_fit: 0.05, offline_fit: 0.03, migration_flexibility: 0.02 };
  function scoreStack(ctx, candidates) {
    return (candidates || []).map(function (cand) {
      var f = cand.factors || {};
      var score = 0;
      Object.keys(WEIGHTS).forEach(function (k) { score += (f[k] == null ? 0.5 : f[k]) * WEIGHTS[k]; });
      score -= (f.complexity_penalty || 0) + (f.vendor_lock_in_penalty || 0) + (f.operational_burden_penalty || 0);
      return { stack: cand.name, score: Math.round(score * 100) / 100, factors: f };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* ---------------- adaptive questions ---------------- */
  var QUESTIONS = [
    ['platforms', function (c) { return !c.platforms; }, 'Which platforms must ship on day one (web / iOS / Android / Windows / macOS / Linux)?'],
    ['offline', function (c) { return c.offline == null; }, 'Must the product work with no network connection?'],
    ['auth', function (c) { return c.auth == null; }, 'How do users authenticate, and what roles/permissions exist?'],
    ['sensitiveData', function (c) { return c.sensitiveData == null; }, 'Does it store personal, sensitive, or regulated data?'],
    ['realtimeCollab', function (c) { return c.realtimeCollab == null && /collaborat|multiplayer|shared|team/i.test(c.prompt || ''); }, 'Is real-time multi-user collaboration required? What happens on a concurrent edit?'],
    ['scale', function (c) { return !c.expectedUsers; }, 'Expected users / tenants / requests, and acceptable response times?'],
    ['budget', function (c) { return !c.budgetTier; }, 'Budget tier for hosting / APIs / build infra (low / medium / premium)?'],
    ['ai', function (c) { return c.localAI == null && /\bai\b|model|llm/i.test(c.prompt || ''); }, 'Will AI models run locally, remotely, or hybrid? What is the cost ceiling?'],
    ['mvp', function (c) { return !c.mvpDefinition; }, 'What is the minimum viable release, and what evidence proves it is ready?'],
    ['compliance', function (c) { return !c.jurisdictions && c.sensitiveData; }, 'Which jurisdictions / policies apply (GDPR, HIPAA, PCI, accessibility)?']
  ];
  function questions(ctx) {
    ctx = ctx || {};
    return QUESTIONS.filter(function (q) { try { return q[1](ctx); } catch (e) { return false; } })
      .slice(0, 6).map(function (q) { return { key: q[0], question: q[2] }; });
  }

  // Model-assisted enrichment: given the objective, name the domain archetype(s)
  // and the requirements a competent engineer would add that the prompt implied
  // but did not state. Rule-based detection stays the source of truth; this only
  // adds. Resolves to { archetypes:[id...], added:[...], notes } — or nulls.
  function aiAssist(ctx) {
    ctx = ctx || {};
    var AI = Engine.AI;
    if (!AI || !AI.ready || !AI.ready() || !AI.json) return Promise.resolve({ archetypes: [], added: [], skipped: 'ai-not-connected' });
    var known = Object.keys(PACKS).join(', ');
    var objective = ctx.prompt || ctx.objective || '';
    if (!objective) { try { objective = (FS.read('/README.md') || FS.read('/SPEC.md') || '').slice(0, 1500); } catch (_) {} }
    var ask = 'Software objective:\n' + objective + '\n\n' +
      'Return ONLY JSON: {"archetypes":[<subset of: ' + known + '>],' +
      '"impliedRequirements":["specific, testable requirement the objective implies but does not state", ...],' +
      '"topRisks":["risk to design against", ...]}. Be concrete, 6-12 impliedRequirements.';
    return AI.json(ask, { maxTokens: 1000 }).then(function (j) {
      if (!j) return { archetypes: [], added: [] };
      var arch = (j.archetypes || []).filter(function (a) { return PACKS[a]; });
      return {
        archetypes: arch,
        added: (j.impliedRequirements || []).slice(0, 14).map(function (s) { return String(s).slice(0, 200); }),
        risks: (j.topRisks || []).slice(0, 10),
        source: 'ai'
      };
    }).catch(function () { return { archetypes: [], added: [] }; });
  }

  /* ---------------- §3 per-requirement verification record ---------------- */
  // requested → implied → missing → verified, as ONE durable record tied to the
  // contract and the Evidence Ledger. Every requirement carries its origin, its
  // machine-checkable criteria, the evidence refs behind each, a status, and a
  // last-checked timestamp; the run's coverage is appended to a bounded history.
  function S() { return Engine.Sovereign; }
  function sovJSON(p) {
    try { var v = S() && S().read(p); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
    catch (_) { return null; }
  }
  function verificationRecord(contract) {
    contract = contract || (Engine.Contract && Engine.Contract.load && Engine.Contract.load());
    if (!contract || !Array.isArray(contract.requirements)) {
      return { ok: false, reason: 'no product contract' };
    }
    var ledger = sovJSON('evidence-ledger.json');
    var claimByReq = {};
    ((ledger && ledger.claims) || []).forEach(function (c) { claimByReq[c.requirementId] = c; });
    var reqsModel = sovJSON('requirements.json');
    var prev = sovJSON('requirements-verification.json') || {};
    var now = Date.now();

    var mandatoryIds = (contract.scope && Array.isArray(contract.scope.mandatory) && contract.scope.mandatory)
      || contract.requirements.filter(function (r) { return r.priority === 'mandatory' || r.priority === 'must'; }).map(function (r) { return r.id; });

    var STATUS_OF = function (conf, mandatory) {
      if (conf === 'VERIFIED') return 'verified';
      if (conf === 'PARTIAL') return 'partial';
      if (conf === 'FAILING') return 'failing';
      // no machine criteria fired — unproven; for a mandatory req that is "unmet"
      return mandatory ? 'unmet' : 'unverified';
    };

    var records = contract.requirements.map(function (r) {
      var c = claimByReq[r.id] || null;
      var mandatory = mandatoryIds.indexOf(r.id) >= 0;
      var conf = c ? c.confidence : (r.status ? String(r.status).toUpperCase() : 'UNVERIFIED');
      var evidence = c ? (c.evidence || []) : (r.acceptanceCriteria || []).map(function (x) { return { kind: x.kind, check: x.check || null, ref: null, result: 'NA' }; });
      return {
        id: r.id,
        statement: r.statement,
        category: r.category || null,
        priority: r.priority || (mandatory ? 'mandatory' : 'optional'),
        origin: r.source === 'llm' ? 'implied' : 'requested',
        dependsOn: r.dependsOn || [],
        status: STATUS_OF(conf, mandatory),
        confidence: conf,
        assertions: c ? c.assertions : evidence.filter(function (e) { return e.result !== 'NA'; }).length,
        failures: c ? c.failures : 0,
        criteria: evidence.map(function (e) { return { kind: e.kind, check: e.check || null, ref: e.ref || null, result: e.result }; }),
        evidenceRefs: evidence.filter(function (e) { return e.ref; }).map(function (e) { return e.ref; }),
        lastCheckedAt: now
      };
    });

    // "missing": domain-pack mandatory items with no matching contract requirement
    // AND not visible in the codebase (from requirements.json's checklist).
    var reqText = records.map(function (r) { return String(r.statement).toLowerCase(); }).join(' | ');
    var missing = (((reqsModel && reqsModel.mandatoryChecklist) || [])
      .filter(function (m) { return m.status === 'not-found'; })
      .filter(function (m) {
        var kw = String(m.requirement).toLowerCase().split(/[ /]+/).filter(function (w) { return w.length > 3; });
        return !kw.some(function (w) { return reqText.indexOf(w) >= 0; });
      })
      .map(function (m) { return { requirement: m.requirement, source: m.source || 'domain-pack', why: 'implied by the detected domain but neither specified nor found in the build' }; }));

    var by = function (s) { return records.filter(function (r) { return r.status === s; }).length; };
    var totals = {
      total: records.length,
      requested: records.filter(function (r) { return r.origin === 'requested'; }).length,
      implied: records.filter(function (r) { return r.origin === 'implied'; }).length,
      missing: missing.length,
      verified: by('verified'), partial: by('partial'), failing: by('failing'),
      unverified: by('unverified'), unmet: by('unmet'),
      mandatory: mandatoryIds.length,
      mandatoryVerified: records.filter(function (r) { return mandatoryIds.indexOf(r.id) >= 0 && r.status === 'verified'; }).length
    };
    totals.coverage = totals.total ? Math.round((totals.verified + 0.5 * totals.partial) / totals.total * 100) : 0;
    totals.mandatoryCoverage = totals.mandatory ? Math.round(totals.mandatoryVerified / totals.mandatory * 100) : 100;

    var history = Array.isArray(prev.history) ? prev.history.slice(-19) : [];
    history.push({ at: now, verified: totals.verified, total: totals.total, coverage: totals.coverage, mandatoryCoverage: totals.mandatoryCoverage });

    var record = {
      generatedAt: now,
      product: contract.product && contract.product.name,
      totals: totals,
      requirements: records,
      missing: missing,
      history: history,
      allMandatoryVerified: totals.mandatory > 0 && totals.mandatoryVerified === totals.mandatory && missing.length === 0,
      summary: totals.verified + '/' + totals.total + ' requirements verified against real evidence (' + totals.coverage + '% coverage)' +
        (missing.length ? ', ' + missing.length + ' domain-implied requirement(s) missing' : '') +
        (by('unmet') ? ', ' + by('unmet') + ' mandatory requirement(s) unmet' : '') + '.'
    };
    if (S()) S().write('requirements-verification.json', record);
    return record;
  }

  function loadVerification() { return sovJSON('requirements-verification.json'); }

  Engine.Requirements = {
    PACKS: PACKS, WEIGHTS: WEIGHTS, __aiAssist: true,
    detectArchetypes: detectArchetypes, activate: activate, aiAssist: aiAssist,
    contradictions: contradictions, classify: classify,
    scoreStack: scoreStack, questions: questions,
    verificationRecord: verificationRecord, loadVerification: loadVerification
  };
  window.Requirements = Engine.Requirements;
  console.info('[Requirements] domain packs + contradiction detection ready — Engine.Requirements');
})();
