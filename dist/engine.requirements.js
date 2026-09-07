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

  Engine.Requirements = {
    PACKS: PACKS, WEIGHTS: WEIGHTS,
    detectArchetypes: detectArchetypes, activate: activate,
    contradictions: contradictions, classify: classify,
    scoreStack: scoreStack, questions: questions
  };
  window.Requirements = Engine.Requirements;
  console.info('[Requirements] domain packs + contradiction detection ready — Engine.Requirements');
})();
