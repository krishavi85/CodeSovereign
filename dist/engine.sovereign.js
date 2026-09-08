/* =====================================================================
   engine.sovereign.js  —  .sovereign/ project memory + analysis pass

   Every Sovereign engine spec treats a persistent, machine + human readable
   ".sovereign/" folder as the source of truth an agent resumes from. This
   module provides:

     Engine.Sovereign.FILES        canonical file manifest (merged from all specs)
     Engine.Sovereign.read(rel)    read one .sovereign/ file  (parsed if JSON)
     Engine.Sovereign.write(rel,d) write one .sovereign/ file (stringified if obj)
     Engine.Sovereign.list()       which .sovereign/ files exist right now
     Engine.Sovereign.analyze()    run the analysis pass and persist the evidence
     Engine.Sovereign.snapshot()   timestamped copy under .sovereign/history/
     Engine.Sovereign.status()     summary for the UI

   The analysis pass ORCHESTRATES the engines that already exist
   (Graph / GraphValidate / MockDetect / Validator / Verify / Levels /
   weightedHealth / ProjectType) and adds the two inventories the specs ask
   for but the app lacked: a layer-classified component inventory and a
   per-control interaction inventory. Results are written as structured JSON
   plus readable Markdown. On the desktop build these are real files on disk
   in the open project; in the browser they live in the workspace FS.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.Engine) { console.error('[Sovereign] window.Engine missing'); return; }
  var Engine = window.Engine;
  var FS = Engine.FS;
  var ROOT = '/.sovereign';

  var FILES = {
    // continuity
    'project.json':              'Universal project spec: name, targets, archetypes, constraints',
    'decision-state.json':       'Machine-readable state: last analysis, health, open decisions',
    'changes.md':                'Append-only ledger of every analysis / repair / decision',
    'known-issues.md':           'Current issues with severity, evidence and repair status',
    'assumptions.md':            'Inferred behavior — each with evidence and confidence',
    // requirements (spec 1)
    'requirements.json':         'Detected archetypes, domain-pack mandatory checklist, contradictions',
    'requirement-traceability.json': 'requirement -> components -> tests',
    'product-brief.md':          'Derived brief: archetypes, mandatory checklist, integrations, risks',
    'risk-register.json':        'Domain risks + detected contradictions',
    // components (spec 2)
    'components.json':           'Layer-classified component inventory with dependencies',
    // architecture / connections (spec 3, 5)
    'connection-graph.json':     'Typed node/edge graph of the real wiring',
    'connection-health.json':    'Per-edge status: valid / broken / missing / circular / unused',
    'architecture.md':           'Architecture summary + system-context / component / data-flow mermaid',
    'diagrams/system-context.mmd': 'The app and the external systems it talks to',
    'diagrams/component.mmd':    'Components grouped by layer, edges = imports',
    'diagrams/dataflow.mmd':     'Client -> route -> service -> data store',
    // pipelines (spec 4)
    'pipeline-inventory.json':   'Discovered + parsed build / test / release / infra pipelines',
    'pipeline-graph.json':       'Normalized pipeline job graph (nodes + needs edges)',
    'pipeline-gaps.json':        'Missing trigger / unsafe deploy / migration race / secret exposure / ...',
    'execution-evidence.json':   'Real npm test / build / lint / typecheck results (desktop)',
    'adapters.json':             'Detected technology adapters + local vs remote build capability',
    // mockups (spec 6)
    'simulation-report.json':    'Mock / stub / fake-data / unwired-control findings',
    'production-readiness.md':   'REAL / PARTIAL / MOCK / BROKEN / UNREACHABLE per interaction',
    // interactivity (spec 7)
    'interaction-inventory.json': 'Every interactive control with a stable id + contract slots',
    'runtime-trace.json':        'Observed console / network / navigation + per-control event->effect (desktop)',
    'repairs/repair-ledger.md':  'Failed contract, root cause, patch, tests, rollback per repair',
    // rollups
    'analysis-summary.md':       'The latest full analysis in one readable page',
    // P0 pipeline (spec §55/§56/§68)
    'product-contract.json':     'Requirements with machine-checkable acceptance criteria',
    'evidence-ledger.json':      'Every claim -> evidence -> confidence, with assertion counts',
    'definition-of-done.json':   'The DoD gate: 8 criteria computed from the evidence',
    'release-certificate.md':    'Cross-gate SOVEREIGN VERIFIED certificate',
    'orchestrator-run.json':     'Last GodMode pipeline run (tasks, generators, DoD before/after)',
    'cost-analysis.json':        'Per-dependency cost tier + zero-cost alternatives (spec §30)',
    'cost-sovereignty.md':       'Readable mandatory vs optional cost breakdown',
    'requirements-ai.json':      'Model-found archetypes + implied requirements (when AI is connected)',
    'security-findings.json':    'Product security scan — injection / XSS / secrets / auth (spec §17)',
    'security-report.md':        'Readable security findings + score',
    'deployment.json':           'Last generated deployment target + IaC + preflight (spec §41)'
  };

  function rel(p) { return ROOT + '/' + String(p).replace(/^\/+/, ''); }

  // Scrub token-shaped strings before anything is written to an evidence file.
  var SECRET_PATTERNS = [
    /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g,                       // GitHub tokens
    /\b(sk-[A-Za-z0-9_-]{20,})\b/g,                            // OpenAI-style
    /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,                        // Anthropic
    /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,                     // Slack
    /\b(AKIA[0-9A-Z]{16})\b/g,                                 // AWS access key id
    /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, // JWT
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----)/g,
    /\b([A-Za-z0-9_]*(?:token|secret|password|apikey|api_key)[A-Za-z0-9_]*\s*[=:]\s*)["']?([A-Za-z0-9_\-./+]{12,})["']?/gi
  ];
  function redact(s) {
    var out = String(s == null ? '' : s);
    SECRET_PATTERNS.forEach(function (re, i) {
      out = out.replace(re, i === SECRET_PATTERNS.length - 1 ? '$1[REDACTED]' : '[REDACTED]');
    });
    return out;
  }
  function redactDeep(obj) {
    if (typeof obj === 'string') return redact(obj);
    if (Array.isArray(obj)) return obj.map(redactDeep);
    if (obj && typeof obj === 'object') { var o = {}; for (var k in obj) o[k] = redactDeep(obj[k]); return o; }
    return obj;
  }

  function read(p) {
    try {
      var raw = FS.read(rel(p));
      if (raw == null) return null;
      if (/\.json$/.test(p)) { try { return JSON.parse(raw); } catch (_) { return raw; } }
      return raw;
    } catch (_) { return null; }
  }

  // Files that can contain build/runtime output -> redact secrets on the way in.
  var RISKY_RE = /(execution-evidence|runtime-trace|diagnostics\/|known-issues|production-readiness|command-audit)/;
  function write(p, data) {
    if (RISKY_RE.test(p)) data = (typeof data === 'string') ? redact(data) : redactDeep(data);
    var body = (typeof data === 'string') ? data : JSON.stringify(data, null, 2);
    if (body.length > 4 * 1024 * 1024) body = body.slice(0, 4 * 1024 * 1024) + '\n…[truncated]…';
    FS.write(rel(p), body);
    return true;
  }

  function exists(p) { try { return FS.exists(rel(p)); } catch (_) { return false; } }

  function list() {
    var out = [];
    Object.keys(FILES).forEach(function (f) { if (exists(f)) out.push(f); });
    return out;
  }

  function appendChanges(line) {
    var prev = read('changes.md') || '# Sovereign change ledger\n\n';
    var stamp = new Date().toISOString();
    write('changes.md', prev + '- ' + stamp + ' — ' + line + '\n');
  }

  /* ---------------- analysis pass ---------------- */

  function safe(fn, fallback) { try { return fn(); } catch (e) { console.warn('[Sovereign]', e); return fallback; } }

  // Paths that are Sovereign's own bookkeeping / vendored code — never counted
  // as part of the product being analyzed.
  var SELF_RE = /^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|\.next|\.nuxt)\//;
  function isProduct(p) { return !SELF_RE.test(p); }

  var LAYER_RULES = [
    [/\.(html|htm)$/i, 'presentation'],
    [/\.(css|scss|sass|less)$/i, 'presentation'],
    [/(components?|screens?|pages?|views?|ui)\//i, 'presentation'],
    [/(routes?|controllers?|api|server|handlers?)\//i, 'backend'],
    [/(services?|use-?cases?|domain|logic)\//i, 'application'],
    [/(repositor(y|ies)|models?|schema|migrations?|db|data)\//i, 'data'],
    [/(store|state|redux|zustand|context)/i, 'application'],
    [/(workers?|jobs?|queue|cron)/i, 'backend'],
    [/\.(sql)$/i, 'data'],
    [/(test|spec|__tests__)/i, 'quality'],
    [/(\.github\/workflows|dockerfile|terraform|\.ya?ml$)/i, 'infrastructure'],
    [/\.(js|mjs|ts|tsx|jsx)$/i, 'application']
  ];
  function layerOf(path) {
    for (var i = 0; i < LAYER_RULES.length; i++) if (LAYER_RULES[i][0].test(path)) return LAYER_RULES[i][1];
    return 'other';
  }

  // Component inventory: fold the Graph's file-level facts into layer-classified
  // components with dependency lists and a necessity guess.
  function componentInventory() {
    var G = window.Graph;
    if (!G || !G.build) return { components: [], byLayer: {} };
    safe(function () { G.build(); });
    var files = (G.files || []).filter(isProduct);
    var comps = files.map(function (p) {
      var deps = (G.imports && G.imports[p]) || [];
      var exp = (G.exports && G.exports[p]) || [];
      var routes = (G.routes || []).filter(function (r) { return r.file === p; });
      var services = (G.services || []).filter(function (s) { return s.file === p; });
      var incoming = files.filter(function (q) { return ((G.imports && G.imports[q]) || []).some(function (t) { return t.indexOf(p.replace(/^\//, '')) >= 0 || t === p; }); }).length;
      var necessity = incoming > 0 || routes.length || /index\.(html|js|ts)$/.test(p) ? 'required'
        : exp.length ? 'conditional' : 'optional';
      return {
        id: p, layer: layerOf(p),
        exports: exp, dependsOn: deps,
        routes: routes.map(function (r) { return r.method + ' ' + r.path; }),
        services: services.map(function (s) { return s.name; }),
        incomingRefs: incoming,
        necessity: necessity
      };
    });
    var byLayer = {};
    comps.forEach(function (c) { (byLayer[c.layer] = byLayer[c.layer] || []).push(c.id); });
    return { components: comps, byLayer: byLayer, generatedAt: Date.now() };
  }

  // Interaction inventory: one record per interactive control, with a stable id
  // and the contract slots from spec 7 left blank for a later pass to fill.
  function interactionInventory() {
    var out = [];
    var htmlFiles = Object.keys(FS._data).filter(function (p) { return /\.html?$/.test(p) && FS.isFile(p) && isProduct(p); });
    htmlFiles.forEach(function (p) {
      var c = FS.read(p) || '';
      var idx = 0;
      var re = /<(button|a|form|input|select|textarea)\b([^>]*)>/gi;
      var m;
      while ((m = re.exec(c))) {
        var tag = m[1].toLowerCase();
        var attrs = m[2] || '';
        var handler = /on(click|submit|change|input)\s*=/.test(attrs) ||
          /\bdata-[\w-]+=/.test(attrs);
        var href = (attrs.match(/href\s*=\s*["']([^"']*)["']/) || [])[1];
        var idAttr = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/) || [])[1];
        var textAfter = c.slice(m.index + m[0].length, m.index + m[0].length + 80);
        var innerText = (textAfter.match(/^\s*([^<]{1,40})/) || [])[1];
        var label = (attrs.match(/aria-label\s*=\s*["']([^"']+)["']/) || [])[1]
          || (innerText && innerText.trim()) || idAttr || tag;
        var inert = false, reason = '';
        if (tag === 'a' && (href === '#' || /^javascript:void/.test(href || ''))) { inert = true; reason = 'dead link (' + href + ')'; }
        if ((tag === 'button' || tag === 'form') && !handler && /<script[\s>]/.test(c)) { inert = true; reason = 'no handler / data-* binding'; }
        out.push({
          id: 'INT-' + p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') + '-' + (++idx),
          file: p, control: tag, name: label,
          hasHandler: handler, href: href || null,
          status: inert ? 'MOCK' : (handler || href ? 'PARTIAL' : 'UNKNOWN'),
          note: reason,
          contract: { trigger: null, preconditions: [], effect: null, feedback: null, persistence: null, tests: [] }
        });
      }
    });
    return { interactions: out, total: out.length, generatedAt: Date.now() };
  }

  // Very light pipeline discovery: look for real CI / container / infra files.
  function pipelineInventory() {
    var files = Object.keys(FS._data).filter(function (p) { return FS.isFile(p) && isProduct(p); });
    var found = [];
    files.forEach(function (p) {
      if (/\.github\/workflows\/.+\.ya?ml$/i.test(p)) found.push({ family: 'ci', kind: 'github-actions', file: p });
      else if (/(^|\/)\.gitlab-ci\.ya?ml$/i.test(p)) found.push({ family: 'ci', kind: 'gitlab-ci', file: p });
      else if (/(^|\/)Jenkinsfile$/i.test(p)) found.push({ family: 'ci', kind: 'jenkins', file: p });
      else if (/(^|\/)Dockerfile$/i.test(p)) found.push({ family: 'container', kind: 'docker', file: p });
      else if (/docker-compose\.ya?ml$/i.test(p) || /(^|\/)compose\.ya?ml$/i.test(p)) found.push({ family: 'container', kind: 'compose', file: p });
      else if (/\.tf$/i.test(p)) found.push({ family: 'infra', kind: 'terraform', file: p });
      else if (/(migrations?|migrate)\/.+\.(sql|js|ts)$/i.test(p)) found.push({ family: 'database', kind: 'migration', file: p });
      else if (/(^|\/)package\.json$/i.test(p)) {
        var scripts = safe(function () { return JSON.parse(FS.read(p)).scripts || {}; }, {});
        Object.keys(scripts).forEach(function (s) { found.push({ family: 'development', kind: 'npm-script', file: p, name: s, command: scripts[s] }); });
      }
    });
    var parsed = safe(function () { return window.PipelineParse && window.PipelineParse.parseAll(); }, null);
    return {
      generatedAt: Date.now(),
      files: found, count: found.length,
      parsed: parsed || undefined,
      gaps: parsed ? parsed.gaps : [],
      note: found.length ? undefined : 'No CI/infra/migration files found — pipelines are undiscovered.'
    };
  }

  function shortName(p) { return String(p).split('/').slice(-2).join('/').slice(0, 40); }
  function nid(s) { return 'n_' + String(s).replace(/[^a-z0-9]/gi, '_').slice(0, 48); }
  function esc9(s) { return String(s).replace(/["\n]/g, ' '); }

  // Well-known external systems inferred from dependencies.
  var EXTERNAL_PKGS = [
    [/^@?stripe/, 'Stripe (payments)'], [/^@?supabase/, 'Supabase'], [/^(openai|@ai-sdk)/, 'OpenAI'],
    [/^@anthropic/, 'Anthropic'], [/^(pg|mysql2?|mongodb|mongoose|redis|ioredis)$/, 'Database/Cache'],
    [/^(aws-sdk|@aws-sdk)/, 'AWS'], [/^(firebase|@firebase)/, 'Firebase'], [/^(twilio)$/, 'Twilio'],
    [/^(nodemailer|@sendgrid|resend)$/, 'Email provider'], [/^(axios|node-fetch|got|undici)$/, 'HTTP client'],
    [/^(socket\.io|ws)$/, 'WebSocket'], [/^(prisma|@prisma|drizzle-orm|typeorm|sequelize|knex)$/, 'ORM']
  ];

  function detectExternals() {
    var out = {};
    var p = safe(function () { return JSON.parse(FS.read('/package.json') || 'null'); }, null);
    if (p) {
      var deps = Object.assign({}, p.dependencies || {}, p.devDependencies || {});
      Object.keys(deps).forEach(function (d) {
        EXTERNAL_PKGS.forEach(function (rule) { if (rule[0].test(d)) out[rule[1]] = 1; });
      });
    }
    // non-localhost URLs in source
    Object.keys(FS._data).forEach(function (f) {
      if (!isProduct(f) || !/\.(js|mjs|cjs|ts|tsx|jsx|json|env)$/.test(f)) return;
      var c = FS.read(f) || '';
      (c.match(/https?:\/\/([a-z0-9.-]+)/gi) || []).forEach(function (u) {
        var host = u.replace(/^https?:\/\//i, '');
        if (/localhost|127\.0\.0\.1|example\.(com|org)|schemas?\.|w3\.org|json-schema/.test(host)) return;
        out[host.split('/')[0]] = 1;
      });
    });
    return Object.keys(out);
  }

  var DIAGRAMS = {
    // component graph, grouped into layer subgraphs
    component: function (graph, components) {
      var lines = ['graph LR'];
      var byLayer = {};
      (components.components || []).forEach(function (c) { (byLayer[c.layer] = byLayer[c.layer] || []).push(c); });
      Object.keys(byLayer).forEach(function (layer) {
        lines.push('  subgraph ' + layer);
        byLayer[layer].forEach(function (c) { lines.push('    ' + nid(c.id) + '["' + esc9(shortName(c.id)) + '"]'); });
        lines.push('  end');
      });
      var edgeSeen = {};
      (graph.edges || []).forEach(function (e) {
        var k = nid(e.from) + '>' + nid(e.to);
        if (edgeSeen[k]) return; edgeSeen[k] = 1;
        var arrow = e.status === 'CONNECTED' ? '-->' : e.status === 'CIRCULAR' ? '-.->|circular|'
          : '-.->|' + String(e.status || '?').toLowerCase() + '|';
        lines.push('  ' + nid(e.from) + ' ' + arrow + ' ' + nid(e.to));
      });
      return lines.join('\n');
    },
    // request path: routes -> services -> data stores
    dataflow: function (graph) {
      var G = window.Graph || {};
      var lines = ['graph LR', '  client([Client])'];
      (G.routes || []).slice(0, 30).forEach(function (r) {
        var rn = nid('route' + r.method + r.path);
        lines.push('  ' + rn + '["' + r.method + ' ' + esc9(r.path) + '"]');
        lines.push('  client --> ' + rn);
        (G.services || []).filter(function (s) { return s.file === r.file; }).forEach(function (s) {
          lines.push('  ' + rn + ' --> ' + nid('svc' + s.name) + '(["' + esc9(s.name) + '"])');
        });
      });
      (G.database || []).slice(0, 20).forEach(function (d) {
        lines.push('  ' + nid('tbl' + d.table) + '[("' + esc9(d.table) + '")]');
      });
      if (!(G.routes || []).length) lines.push('  note["No API routes detected"]');
      return lines.join('\n');
    },
    // the app and the external systems it talks to
    systemContext: function () {
      var name = (Engine.Proj.current() && Engine.Proj.current().name) || 'Application';
      var lines = ['graph LR', '  user([User])', '  app["' + esc9(name) + '"]', '  user --> app'];
      detectExternals().slice(0, 20).forEach(function (x) {
        lines.push('  app --> ' + nid('ext' + x) + '{{"' + esc9(x) + '"}}');
      });
      return lines.join('\n');
    }
  };

  // A stable fingerprint of the wiring, for drift detection.
  function graphFingerprint(edges) {
    var s = (edges || []).map(function (e) { return e.from + '>' + e.to + ':' + (e.status || ''); }).sort().join('|');
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16) + '.' + (edges || []).length;
  }

  function analyze() {
    var t0 = Date.now();

    var projectType = safe(function () { return window.ProjectType.detect(); }, { kind: 'unknown', signals: [] });
    var validator = safe(function () { return Engine.Validator.runAll(); }, []);
    var graphHealth = safe(function () { return window.GraphValidate.run(); }, { edges: [], broken: [], healthy: false });
    var mocks = safe(function () { return window.MockDetect.run(); }, []);
    var mockScan = safe(function () { return window.MockScan.run(); }, { signals: [], byKind: {}, total: 0 });
    var build = safe(function () { return window.Verify.build(); }, { ok: false });
    var runtime = safe(function () { return window.Verify.runtime(); }, { ok: false, hazards: [] });
    var interaction = safe(function () { return window.Verify.interaction(); }, { ok: false, issues: [] });
    var levels = safe(function () { return window.Levels.run(); }, null);
    var health = safe(function () { return window.weightedHealth(); }, null);

    var components = componentInventory();
    var interactions = interactionInventory();
    var pipelines = pipelineInventory();
    var adapters = safe(function () { return window.Adapters ? window.Adapters.detect() : []; }, []);

    var errs = validator.filter(function (i) { return i.severity === 'error'; }).length;
    var warns = validator.filter(function (i) { return i.severity === 'warning'; }).length;
    var highSim = (mockScan.signals || []).filter(function (s) { return s.severity === 'high'; }).length;
    var mockCount = (mockScan.total || 0) + (interaction.issues || []).length;

    // ---- intent inference + status per control (spec 6/7) ----
    var runtimeTrace = read('runtime-trace.json');
    var observedByName = {};
    if (runtimeTrace && runtimeTrace.trace) {
      runtimeTrace.trace.forEach(function (o) {
        var k = String(o.control.name || o.control.tag || '').toLowerCase().slice(0, 40);
        if (k) observedByName[k] = o.status;
      });
    }
    var MS = window.MockScan;
    (interactions.interactions || []).forEach(function (it) {
      if (MS) {
        var intent = MS.inferIntent(it);
        it.expectedBehavior = intent.expected;
        it.confidence = intent.confidence;
        it.intentBasis = intent.basis;
        var src = safe(function () { return (FS.read(it.file) || '').slice(0, 20000); }, '');
        it.status = MS.classify(it, { observed: observedByName[String(it.name || '').toLowerCase().slice(0, 40)], source: src });
      }
    });
    write('interaction-inventory.json', interactions);

    // ---- persist structured evidence ----
    write('connection-graph.json', {
      generatedAt: Date.now(),
      nodeCount: (components.components || []).length,
      edges: graphHealth.edges || []
    });
    write('connection-health.json', {
      generatedAt: Date.now(),
      healthy: !!graphHealth.healthy,
      broken: graphHealth.broken || [],
      missing: (graphHealth.edges || []).filter(function (e) { return e.status === 'MISSING'; }),
      circular: (graphHealth.edges || []).filter(function (e) { return e.status === 'CIRCULAR'; }),
      unused: (graphHealth.edges || []).filter(function (e) { return e.status === 'UNUSED'; })
    });
    write('components.json', components);
    write('interaction-inventory.json', interactions);
    write('pipeline-inventory.json', pipelines);
    write('adapters.json', {
      generatedAt: Date.now(),
      host: (window.desktop && window.desktop.isDesktop) ? 'desktop' : 'browser',
      detected: adapters,
      primary: adapters[0] ? adapters[0].id : null,
      needsRemoteBuild: adapters.filter(function (a) { return !a.canBuildLocally; }).map(function (a) { return { id: a.id, target: a.remoteBuildTarget }; }),
      remoteBuildContract: (window.Adapters && window.Adapters.remoteBuildContract) || null
    });
    if (pipelines.parsed) {
      write('pipeline-gaps.json', { generatedAt: Date.now(), gaps: pipelines.gaps || [], byCategory: (pipelines.gaps || []).reduce(function (m, g) { m[g.kind] = (m[g.kind] || 0) + 1; return m; }, {}) });
      // normalized graph (JSON; the specs call it pipeline-graph.yaml — we keep JSON for reliable round-trip)
      write('pipeline-graph.json', pipelines.parsed.graph);
    }
    write('simulation-report.json', {
      generatedAt: Date.now(),
      total: mockCount,
      highSeverity: highSim,
      byKind: mockScan.byKind || {},
      signals: (mockScan.signals || []).slice(0, 400),
      legacySignals: mocks,                       // MockDetect's original 6-pattern set
      unwiredControls: interaction.issues || []
    });

    // ---- known-issues.md ----
    var kiLines = ['# Known issues', '', '_Generated by Sovereign analysis ' + new Date().toISOString() + '_', ''];
    validator.slice(0, 200).forEach(function (i) {
      kiLines.push('- **' + (i.severity || 'info').toUpperCase() + '** ' + (i.file || '') + ' — ' + (i.message || i.msg || 'issue'));
    });
    (graphHealth.broken || []).forEach(function (e) { kiLines.push('- **ERROR** ' + e.from + ' — broken edge to `' + e.to + '`'); });
    (mockScan.signals || []).filter(function (s) { return s.severity !== 'low'; }).slice(0, 120).forEach(function (m) {
      kiLines.push('- **' + m.severity.toUpperCase() + ' / mock** ' + m.file + ':' + m.line + ' — ' + m.why + ' (`' + (m.sample || '') + '`)');
    });
    (pipelines.gaps || []).forEach(function (g) {
      kiLines.push('- **' + String(g.severity).toUpperCase() + ' / pipeline** ' + g.file + ' — ' + g.why);
    });
    write('known-issues.md', kiLines.join('\n') + '\n');

    // ---- assumptions.md — inferred control intents (spec 6 §7) ----
    var med = (interactions.interactions || []).filter(function (it) { return it.confidence && it.confidence !== 'high'; });
    write('assumptions.md',
      '# Assumptions\n\n_Inferred behaviour for controls whose intent is not certain. ' +
      'Confirm against requirements or replace._\n\n_Generated ' + new Date().toISOString() + '_\n\n' +
      (med.length ? med.slice(0, 120).map(function (it) {
        return '- `' + it.id + '` (' + it.file + ') — assumed **' + it.expectedBehavior + '** · confidence ' +
          it.confidence + ' · basis: ' + (it.intentBasis || '?');
      }).join('\n') : '- (nothing low-confidence)') + '\n');

    // ---- production-readiness.md — the interaction traceability matrix ----
    var prCounts = {};
    interactions.interactions.forEach(function (it) { prCounts[it.status || 'UNKNOWN'] = (prCounts[it.status || 'UNKNOWN'] || 0) + 1; });
    var matrix = interactions.interactions.slice(0, 200).map(function (it) {
      return '| `' + it.id + '` | ' + esc9(it.file) + ' | ' + esc9((it.expectedBehavior || '').slice(0, 70)) +
        ' | ' + (it.confidence || '-') + ' | **' + (it.status || 'UNKNOWN') + '** |';
    }).join('\n');
    var simByKind = Object.keys(mockScan.byKind || {}).sort().map(function (k) {
      return '| ' + k + ' | ' + mockScan.byKind[k] + ' |';
    }).join('\n');
    write('production-readiness.md',
      '# Production readiness — interaction traceability\n\n_Generated ' + new Date().toISOString() + '_\n\n' +
      '## Status roll-up\n\n| Status | Count |\n|---|---|\n' +
      Object.keys(prCounts).map(function (k) { return '| ' + k + ' | ' + prCounts[k] + ' |'; }).join('\n') + '\n\n' +
      (mockCount === 0
        ? 'No simulation signals detected in source.\n\n'
        : '**' + mockCount + ' simulation signals** (' + highSim + ' high severity) — see `simulation-report.json`.\n\n' +
          '| Signal kind | Count |\n|---|---|\n' + simByKind + '\n\n') +
      '## Every interactive control\n\n| id | file | inferred intent | conf | status |\n|---|---|---|---|---|\n' + matrix + '\n\n' +
      '_REAL = wired + observed effect + error/loading handling · PARTIAL = wired, gaps · ' +
      'MOCK = decorative/simulated · BROKEN = threw · UNREACHABLE = hidden/disabled · UNKNOWN = not yet observed._\n');

    // ---- diagrams (regenerated from the real graph) ----
    var graph = { edges: graphHealth.edges };
    var dg = {
      component: DIAGRAMS.component(graph, components),
      dataflow: DIAGRAMS.dataflow(graph),
      'system-context': DIAGRAMS.systemContext()
    };
    Object.keys(dg).forEach(function (k) { write('diagrams/' + k + '.mmd', dg[k]); });

    // ---- drift detection ----
    var fp = graphFingerprint(graphHealth.edges);
    var prevState = read('decision-state.json') || {};
    var drift = !!(prevState.graphFingerprint && prevState.graphFingerprint !== fp);

    // ---- architecture.md — all diagrams inline (GitHub renders mermaid) ----
    write('architecture.md',
      '# Architecture (generated)\n\n_Sovereign analysis ' + new Date().toISOString() + '_\n\n' +
      '- Project type: **' + projectType.kind + '**' + (projectType.signals && projectType.signals.length ? ' (' + projectType.signals.join(', ') + ')' : '') + '\n' +
      '- Files: ' + (components.components || []).length + '  ·  Edges: ' + (graphHealth.edges || []).length +
      '  ·  Graph fingerprint: `' + fp + '`' + (drift ? '  ·  ⚠️ **drift since last generation**' : '') + '\n\n' +
      '## Component layers\n\n' +
      Object.keys(components.byLayer || {}).map(function (l) { return '- **' + l + '**: ' + components.byLayer[l].length; }).join('\n') + '\n\n' +
      '## System context\n\n```mermaid\n' + dg['system-context'] + '\n```\n\n' +
      '## Components (by layer)\n\n```mermaid\n' + dg.component + '\n```\n\n' +
      '## Request / data flow\n\n```mermaid\n' + dg.dataflow + '\n```\n\n' +
      '_Individual diagrams: `.sovereign/diagrams/*.mmd`_\n');

    // ---- decision-state.json ----
    var state = {
      lastAnalysisAt: Date.now(),
      projectType: projectType.kind,
      health: health ? health.score : null,
      recoveryLevel: levels ? levels.level : null,
      graphFingerprint: fp,
      driftDetected: drift,
      externals: detectExternals(),
      diagrams: Object.keys(dg).map(function (k) { return 'diagrams/' + k + '.mmd'; }),
      counts: {
        files: (components.components || []).length,
        components: (components.components || []).length,
        edges: (graphHealth.edges || []).length,
        brokenEdges: (graphHealth.broken || []).length,
        errors: errs, warnings: warns,
        mockSignals: mockCount,
        interactions: interactions.total,
        pipelines: pipelines.count,
        pipelineJobs: (pipelines.parsed && pipelines.parsed.graph.nodes.length) || 0,
        pipelineGaps: (pipelines.gaps || []).length
      },
      execution: prevState.execution || undefined,
      runtime: prevState.runtime || undefined,
      openDecisions: (prevState && prevState.openDecisions) || []
    };
    write('decision-state.json', state);
    if (drift) appendChanges('DRIFT — connection graph changed (' + prevState.graphFingerprint + ' -> ' + fp + '); diagrams regenerated');

    // ---- analysis-summary.md ----
    write('analysis-summary.md',
      '# Sovereign analysis summary\n\n_' + new Date().toISOString() + '  ·  ' + (Date.now() - t0) + ' ms_\n\n' +
      '| Metric | Value |\n|---|---|\n' +
      '| Project type | ' + projectType.kind + ' |\n' +
      '| Health score | ' + (health ? health.score : 'n/a') + ' |\n' +
      '| Recovery level | ' + (levels ? levels.level + '/5' : 'n/a') + ' |\n' +
      '| Components | ' + state.counts.components + ' |\n' +
      '| Graph edges | ' + state.counts.edges + ' (' + state.counts.brokenEdges + ' broken) |\n' +
      '| Validator | ' + errs + ' errors, ' + warns + ' warnings |\n' +
      '| Mock / simulation signals | ' + mockCount + ' |\n' +
      '| Interactive controls | ' + interactions.total + ' |\n' +
      '| Pipelines discovered | ' + pipelines.count + ' (' + ((pipelines.parsed && pipelines.parsed.graph.nodes.length) || 0) + ' jobs, ' + (pipelines.gaps || []).length + ' gaps) |\n' +
      '| Technology adapters | ' + (adapters.map(function (a) { return a.id; }).join(', ') || 'none') +
        (adapters.some(function (a) { return !a.canBuildLocally; }) ? ' (⚠ some need a remote build worker)' : '') + ' |\n' +
      '| External systems | ' + (state.externals.length ? state.externals.join(', ') : 'none detected') + ' |\n' +
      '| Graph fingerprint | `' + fp + '`' + (drift ? ' ⚠️ drift' : '') + ' |\n\n' +
      'Diagrams: `.sovereign/architecture.md` + `.sovereign/diagrams/`. Full evidence in `.sovereign/*.json`.\n');

    // ---- seed the files that need a human / later pass, only once ----
    if (!exists('repairs/repair-ledger.md')) write('repairs/repair-ledger.md', '# Repair ledger\n\n_Failed contract · evidence · root cause · patch · tests · rollback._\n');
    if (!exists('project.json')) {
      write('project.json', {
        name: (Engine.Proj.current() && Engine.Proj.current().name) || 'project',
        detectedType: projectType.kind,
        targets: projectType.signals || [],
        archetypes: [],
        constraints: {},
        note: 'Seeded by Sovereign analysis. Edit to record the real product spec.'
      });
    }

    appendChanges('analysis — health ' + (health ? health.score : '?') + ', ' + errs + ' errors, ' + mockCount + ' mock signals, ' + interactions.total + ' controls');

    // ---- requirements intelligence (archetypes + domain packs + contradictions) ----
    var reqCtx = {};
    try {
      var pj = read('project.json');
      if (pj) reqCtx = { prompt: pj.prompt || '', offline: pj.constraints && pj.constraints.offline, archetypes: pj.archetypes };
    } catch (_) {}
    safe(function () { requirements(reqCtx); });

    // ---- cost sovereignty (spec §30) ----
    safe(function () { window.Engine.Cost && window.Engine.Cost.analyze({}); });

    // ---- product security scan (spec §17) ----
    safe(function () { window.Engine.Security && window.Engine.Security.scan(); });

    // ---- P0 pipeline: refresh the ledger + DoD gate if a contract exists ----
    if (window.Engine.Contract && window.Engine.Contract.load()) {
      safe(function () { window.Engine.Ledger && window.Engine.Ledger.build(); });
      safe(function () { window.Engine.DoD && window.Engine.DoD.evaluate(); });
    }

    return {
      ok: true,
      elapsedMs: Date.now() - t0,
      summary: state.counts,
      files: list()
    };
  }

  /* ---------------- real execution evidence (desktop) ---------------- */
  // Runs the project's actual test / build / lint / typecheck via window.CSExec
  // and records structured evidence. This is what makes "verified" real: the
  // Sovereign specs demand executable proof, not "it compiled".
  function runEvidence(opts) {
    opts = opts || {};
    var X = window.CSExec;
    if (!X || !X.available()) {
      return Promise.resolve({ ok: false, reason: 'real execution needs the desktop app with a project folder open' });
    }
    var steps = opts.steps || ['test', 'build', 'lint', 'typecheck'];
    var results = {};
    var chain = Promise.resolve();
    steps.forEach(function (s) {
      chain = chain.then(function () {
        return X[s]().then(function (r) {
          results[s] = {
            code: r.code, ms: r.ms, timedOut: !!r.timedOut, skipped: !!r.skipped,
            pass: r.code === 0, tail: String(r.output || '').slice(-1500)
          };
        });
      });
    });

    return chain.then(function () {
      var detect = X.detect();
      var evidence = {
        generatedAt: Date.now(),
        packageManager: detect.pm,
        runtimes: detect.runtimes,
        steps: results,
        gates: {
          testsPass: results.test ? (results.test.pass || results.test.skipped) : null,
          buildPasses: results.build ? (results.build.pass || results.build.skipped) : null,
          lintClean: results.lint ? (results.lint.pass || results.lint.skipped) : null,
          typesClean: results.typecheck ? (results.typecheck.pass || results.typecheck.skipped) : null
        }
      };
      write('execution-evidence.json', evidence);

      // fold real gates into decision-state + production-readiness
      var ds = read('decision-state.json') || {};
      ds.execution = { at: evidence.generatedAt, gates: evidence.gates };
      write('decision-state.json', ds);

      var verdict = Object.keys(evidence.gates).map(function (k) {
        var v = evidence.gates[k];
        return '- **' + k + '**: ' + (v === null ? 'not run' : v ? 'PASS' : 'FAIL');
      }).join('\n');
      var prev = read('production-readiness.md') || '# Production readiness\n';
      write('production-readiness.md', prev + '\n## Real execution ' + new Date(evidence.generatedAt).toISOString() + '\n\n' + verdict + '\n');

      var failed = Object.keys(results).filter(function (k) { return results[k] && !results[k].pass && !results[k].skipped; });
      appendChanges('execution — ' + steps.map(function (s) {
        var r = results[s]; return s + ':' + (!r ? '?' : r.skipped ? 'skip' : r.pass ? 'pass' : 'FAIL');
      }).join(' '));

      return { ok: true, evidence: evidence, failed: failed };
    });
  }

  /* ---------------- runtime observation (desktop) ---------------- */
  // Drives the project's running app, records what every control actually does,
  // and folds the observed REAL / MOCK / BROKEN verdict back into the static
  // interaction inventory. This is the specs' "reproduce the failure / trace the
  // interaction chain" step made real.
  function observe(opts) {
    opts = opts || {};
    var O = window.CSObserve;
    if (!O || !O.available()) {
      return Promise.resolve({ ok: false, reason: 'runtime observation needs the desktop app with a project folder open' });
    }
    return O.run(opts).then(function (r) {
      if (!r.ok) return r;
      var trace = r.trace;
      write('runtime-trace.json', trace);

      // diagnostics
      write('diagnostics/console-' + new Date(trace.at).toISOString().replace(/[:.]/g, '-') + '.json', {
        url: trace.url, at: trace.at,
        consoleErrors: trace.consoleErrors || [],
        network: trace.network || []
      });

      // enrich the static interaction inventory with what was actually observed
      var inv = read('interaction-inventory.json') || interactionInventory();
      var observedByName = {};
      (trace.trace || []).forEach(function (o) {
        var key = (o.control.name || o.control.tag || '').toLowerCase().slice(0, 40);
        if (key) observedByName[key] = o;
      });
      (inv.interactions || []).forEach(function (it) {
        var key = String(it.name || it.control || '').toLowerCase().slice(0, 40);
        var o = observedByName[key];
        if (o) {
          it.observedStatus = o.status;
          it.effects = o.effects;
          it.status = o.status;                 // observed truth wins over the static guess
        }
      });
      inv.observedAt = trace.at;
      inv.observedCounts = trace.byStatus;
      write('interaction-inventory.json', inv);

      // production readiness reflects the real crawl
      var pr = read('production-readiness.md') || '# Production readiness\n';
      write('production-readiness.md', pr + '\n## Runtime crawl ' + new Date(trace.at).toISOString() + '\n\n' +
        '- URL: ' + trace.url + '\n' +
        '- controls exercised: ' + trace.controlsExercised + ' / ' + trace.controlsFound + '\n' +
        Object.keys(trace.byStatus || {}).map(function (k) { return '- ' + k + ': ' + trace.byStatus[k]; }).join('\n') + '\n' +
        (trace.consoleErrors && trace.consoleErrors.length ? '- **' + trace.consoleErrors.length + ' console errors during the crawl**\n' : ''));

      var ds = read('decision-state.json') || {};
      ds.runtime = { at: trace.at, url: trace.url, byStatus: trace.byStatus, consoleErrors: (trace.consoleErrors || []).length };
      write('decision-state.json', ds);

      appendChanges('runtime observation — ' + trace.controlsExercised + ' controls, ' +
        JSON.stringify(trace.byStatus) + ', ' + (trace.consoleErrors || []).length + ' console errors');

      return { ok: true, trace: trace };
    });
  }

  /* ---------------- requirements intelligence ---------------- */
  function requirements(ctx) {
    var R = window.Requirements;
    if (!R) return { ok: false, reason: 'Engine.Requirements not loaded' };
    ctx = ctx || {};

    var archetypes = R.detectArchetypes(ctx);
    var active = R.activate(archetypes);

    // best-effort: which mandatory items does the codebase seem to already cover?
    var haystack = (Object.keys(FS._data).join(' ') + ' ' +
      (window.Graph && (window.Graph.routes || []).map(function (r) { return r.path; }).join(' ')) + ' ' +
      (window.Graph && (window.Graph.services || []).map(function (s) { return s.name; }).join(' '))).toLowerCase();
    var checklist = active.mandatory.map(function (m) {
      var kw = m.toLowerCase().split(/[ /]/).filter(function (w) { return w.length > 3; });
      var covered = kw.some(function (w) { return haystack.indexOf(w) >= 0; });
      return { requirement: m, status: covered ? 'present-ish' : 'not-found', source: 'domain-pack' };
    });
    var missing = checklist.filter(function (c) { return c.status === 'not-found'; });

    var contradictions = R.contradictions(ctx);
    var classified = R.classify(active.mandatory.concat(ctx.extraRequirements || []), Object.assign({ archetypes: archetypes.map(function (a) { return a.archetype; }) }, ctx));

    var model = {
      generatedAt: Date.now(),
      detectedArchetypes: archetypes,
      activePacks: active.packs,
      mandatoryChecklist: checklist,
      missingCount: missing.length,
      integrations: active.integrations,
      risks: active.risks,
      compliance: active.compliance,
      contradictions: contradictions,
      classified: classified,
      openQuestions: R.questions(ctx)
    };
    write('requirements.json', model);

    // requirement -> component -> test traceability skeleton
    var comps = componentInventory();
    write('requirement-traceability.json', {
      generatedAt: Date.now(),
      rows: checklist.map(function (c) {
        return {
          requirement: c.requirement,
          components: comps.components.filter(function (x) {
            return c.requirement.toLowerCase().split(/[ /]/).some(function (w) { return w.length > 3 && x.id.toLowerCase().indexOf(w) >= 0; });
          }).map(function (x) { return x.id; }),
          tests: [],
          status: c.status
        };
      })
    });

    // human-readable
    write('product-brief.md',
      '# Product brief (derived)\n\n_Sovereign requirements analysis ' + new Date().toISOString() + '_\n\n' +
      '## Detected archetypes\n\n' + (archetypes.length ? archetypes.map(function (a) { return '- **' + a.label + '** (signal score ' + a.score + ')'; }).join('\n') : '- none — provide a product description') + '\n\n' +
      '## Mandatory for this product type — ' + missing.length + ' not found in the codebase\n\n' +
      checklist.map(function (c) { return (c.status === 'not-found' ? '- [ ] ' : '- [x] ') + c.requirement; }).join('\n') + '\n\n' +
      '## Expected integrations\n\n' + (active.integrations.map(function (i) { return '- ' + i; }).join('\n') || '- none') + '\n\n' +
      '## Domain risks to design against\n\n' + (active.risks.map(function (r) { return '- ' + r; }).join('\n') || '- none') + '\n\n' +
      '## Compliance prompts\n\n' + (active.compliance.map(function (r) { return '- ' + r; }).join('\n') || '- none') + '\n\n' +
      (contradictions.length ? '## ⚠️ Contradictions detected\n\n' + contradictions.map(function (c) { return '- **' + c.conflict + '**\n  - ' + c.resolution; }).join('\n') + '\n\n' : '') +
      (model.openQuestions.length ? '## High-impact open questions\n\n' + model.openQuestions.map(function (q) { return '- ' + q.question; }).join('\n') + '\n' : ''));

    write('risk-register.json', {
      generatedAt: Date.now(),
      domainRisks: active.risks.map(function (r) { return { risk: r, source: 'domain-pack', mitigation: null, status: 'open' }; }),
      contradictions: contradictions
    });

    var ds = read('decision-state.json') || {};
    ds.requirements = { at: model.generatedAt, archetypes: archetypes.map(function (a) { return a.archetype; }), missingMandatory: missing.length, contradictions: contradictions.length };
    write('decision-state.json', ds);
    appendChanges('requirements — archetypes [' + archetypes.map(function (a) { return a.archetype; }).join(',') + '], ' + missing.length + ' mandatory items not found, ' + contradictions.length + ' contradictions');

    // Model-assisted enrichment (non-blocking): archetypes + implied requirements
    // the prompt didn't state. Written to a supplementary file and folded back in.
    if (R.aiAssist && window.Engine.AI && window.Engine.AI.ready && window.Engine.AI.ready()) {
      R.aiAssist(reqCtxOf(ctx)).then(function (ai) {
        if (!ai || (!(ai.added || []).length && !(ai.archetypes || []).length)) return;
        var merged = Object.assign({}, model, {
          aiArchetypes: ai.archetypes || [],
          aiImpliedRequirements: ai.added || [],
          aiRisks: ai.risks || [],
          aiAt: Date.now()
        });
        write('requirements.json', merged);
        write('requirements-ai.json', { generatedAt: Date.now(), source: 'ai', archetypes: ai.archetypes || [], impliedRequirements: ai.added || [], risks: ai.risks || [] });
        appendChanges('requirements (AI) — +' + (ai.archetypes || []).length + ' archetype(s), +' + (ai.added || []).length + ' implied requirement(s)');
      }).catch(function () {});
    }

    return { ok: true, model: model };
  }
  function reqCtxOf(ctx) {
    var c = Object.assign({}, ctx || {});
    if (!c.prompt) { try { c.prompt = (FS.read('/README.md') || FS.read('/SPEC.md') || '').slice(0, 1500); } catch (_) {} }
    return c;
  }

  var HISTORY_KEEP = 15;
  function pruneHistory() {
    var stamps = {};
    Object.keys(FS._data).forEach(function (p) {
      var m = p.indexOf(ROOT + '/history/') === 0 && p.slice((ROOT + '/history/').length).split('/')[0];
      if (m) stamps[m] = 1;
    });
    var all = Object.keys(stamps).sort();
    all.slice(0, Math.max(0, all.length - HISTORY_KEEP)).forEach(function (old) {
      try { FS.remove(ROOT + '/history/' + old); } catch (_) {}
    });
  }

  function snapshot(reason) {
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var dir = 'history/' + stamp;
    var n = 0;
    list().forEach(function (f) {
      if (f.indexOf('history/') === 0) return;
      var raw = FS.read(rel(f));
      if (raw != null) { FS.write(rel(dir + '/' + f), raw); n++; }
    });
    pruneHistory();
    appendChanges('snapshot ' + stamp + ' (' + (reason || 'manual') + ') — ' + n + ' files (keeping last ' + HISTORY_KEEP + ')');
    return { id: stamp, fileCount: n };
  }

  function status() {
    var st = read('decision-state.json');
    return {
      initialized: list().length > 0,
      files: list(),
      lastAnalysisAt: st && st.lastAnalysisAt || null,
      counts: st && st.counts || null,
      health: st && st.health != null ? st.health : null
    };
  }

  Engine.Sovereign = {
    FILES: FILES, ROOT: ROOT,
    read: read, write: write, list: list, exists: exists,
    analyze: analyze, runEvidence: runEvidence, observe: observe, requirements: requirements, snapshot: snapshot, status: status,
    componentInventory: componentInventory,
    interactionInventory: interactionInventory,
    pipelineInventory: pipelineInventory,
    DIAGRAMS: DIAGRAMS, graphFingerprint: graphFingerprint, detectExternals: detectExternals
  };
  window.Sovereign = Engine.Sovereign;
  console.info('[Sovereign] project memory engine ready — Engine.Sovereign');
})();
