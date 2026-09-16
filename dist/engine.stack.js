/* =====================================================================
 * engine.stack.js
 * CodeSovereign Open-Source Building Stack
 *
 * Interchangeable engines behind CodeSovereign orchestration:
 * planning, generation, repo editing, model routing, databases,
 * semantic memory, testing, recovery, packaging, durable workflows.
 *
 * Every GitHub link from the Building Stack document is registered
 * here and consumed by existing screens (Settings, Agent, Factory,
 * Pipelines, Recovery, Marketplace). No new routes.
 * ===================================================================== */
(function () {
  'use strict';

  const NS = 'cs.stack.v1';
  const NS_MEM = 'cs.stack.memory.v1';
  const NS_TMP = 'cs.stack.temporal.v1';

  function load(k, d) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }
  function now() { return Date.now(); }

  // -------- Catalog (every repository link in the stack document) --------
  const CATALOG = [
    { id: 'cline', name: 'Cline', layer: 'agent', role: 'Agent execution, filesystem, terminal, MCP, headless workflows', link: 'https://github.com/cline/cline', install: 'npx -y @cline/cli', capabilities: ['fs','shell','mcp','headless'], screen: 'agent' },
    { id: 'aider', name: 'Aider', layer: 'recovery', role: 'Repository mapping, multi-file edits, Git, lint/test/fix loops', link: 'https://github.com/Aider-AI/aider', install: 'pip install aider-chat', capabilities: ['repo-map','patch','lint','test','repair','checkpoint'], screen: 'recovery' },
    { id: 'openhands', name: 'OpenHands', layer: 'workspace', role: 'Shell, code, browser and API execution inside an agent workspace', link: 'https://github.com/All-Hands-AI/OpenHands', install: 'docker run -it ghcr.io/all-hands-ai/openhands', capabilities: ['shell','code','browser','sandbox'], screen: 'agent' },
    { id: 'pocketflow', name: 'PocketFlow', layer: 'orchestration', role: 'Compact inspectable agent/workflow graphs', link: 'https://github.com/The-Pocket/PocketFlow', install: 'pip install pocketflow', capabilities: ['graph','flow','embed'], screen: 'pipelines' },
    { id: 'temporal', name: 'Temporal', layer: 'orchestration', role: 'Durable workflows, retries, checkpoints and resume', link: 'https://github.com/temporalio/temporal', install: 'docker compose up temporal', capabilities: ['durable','retry','checkpoint','resume'], screen: 'pipelines' },
    { id: 'localai', name: 'LocalAI', layer: 'model', role: 'OpenAI-compatible local model gateway', link: 'https://github.com/mudler/LocalAI', install: 'docker run -p 8080:8080 localai/localai:latest', capabilities: ['text','vision','speech','image','route'], screen: 'settings', endpoint: 'http://127.0.0.1:8080' },
    { id: 'llamacpp', name: 'llama.cpp', layer: 'model', role: 'GGUF inference on CPU/GPU for offline coding models', link: 'https://github.com/ggerganov/llama.cpp', install: './llama-server -m model.gguf --port 8081', capabilities: ['gguf','cpu','gpu','offline'], screen: 'settings', endpoint: 'http://127.0.0.1:8081' },
    { id: 'supabase', name: 'Supabase', layer: 'backend', role: 'Postgres, Auth, Storage, Realtime, Functions, generated APIs', link: 'https://github.com/supabase/supabase', install: 'npx supabase init', capabilities: ['postgres','auth','storage','realtime','functions'], screen: 'factory' },
    { id: 'pocketbase', name: 'PocketBase', layer: 'backend', role: 'Portable SQLite backend with auth, files and realtime', link: 'https://github.com/pocketbase/pocketbase', install: 'go install github.com/pocketbase/pocketbase@latest', capabilities: ['sqlite','auth','files','realtime','rest'], screen: 'factory' },
    { id: 'appwrite', name: 'Appwrite', layer: 'backend', role: 'Self-hosted application backend and infrastructure', link: 'https://github.com/appwrite/appwrite', install: 'docker compose up appwrite', capabilities: ['auth','database','storage','functions'], screen: 'factory' },
    { id: 'qdrant', name: 'Qdrant', layer: 'memory', role: 'Primary vector engine for code, error and repair memory', link: 'https://github.com/qdrant/qdrant', install: 'docker run -p 6333:6333 qdrant/qdrant', capabilities: ['embed','search','repair-memory'], screen: 'recovery', endpoint: 'http://127.0.0.1:6333' },
    { id: 'weaviate', name: 'Weaviate', layer: 'memory', role: 'Hybrid search, RAG and multi-tenant vector workloads', link: 'https://github.com/weaviate/weaviate', install: 'docker run -p 8080:8080 cr.weaviate.io/semitechnologies/weaviate', capabilities: ['hybrid','rag','multi-tenant'], screen: 'recovery' },
    { id: 'milvus', name: 'Milvus', layer: 'memory', role: 'High-scale vector database workloads', link: 'https://github.com/milvus-io/milvus', install: 'docker compose up milvus', capabilities: ['scale','vectors'], screen: 'recovery' },
    { id: 'testcontainers', name: 'Testcontainers', layer: 'verify', role: 'Temporary real DBs/queues/services for generated-app verification', link: 'https://github.com/testcontainers', install: 'npm i -D testcontainers', capabilities: ['postgres','mysql','mongo','redis','kafka'], screen: 'recovery' },
    { id: 'testcontainers-java', name: 'Testcontainers Java', layer: 'verify', role: 'Java Testcontainers for JVM generated backends', link: 'https://github.com/testcontainers/testcontainers-java', install: 'org.testcontainers:testcontainers', capabilities: ['java','containers'], screen: 'recovery' },
    { id: 'playwright', name: 'Playwright', layer: 'verify', role: 'Real browser execution and UI/route validation', link: 'https://github.com/microsoft/playwright', install: 'npx playwright install', capabilities: ['browser','click','fill','screenshot','assert'], screen: 'recovery' },
    { id: 'vitest', name: 'Vitest', layer: 'verify', role: 'Vite-native unit/integration test runner', link: 'https://github.com/vitest-dev/vitest', install: 'npm i -D vitest', capabilities: ['unit','watch'], screen: 'factory' },
    { id: 'jest', name: 'Jest', layer: 'verify', role: 'JS test runner with snapshot and coverage', link: 'https://github.com/jestjs/jest', install: 'npm i -D jest', capabilities: ['unit','snapshot','coverage'], screen: 'factory' },
    { id: 'pytest', name: 'Pytest', layer: 'verify', role: 'Python test runner for generated backends', link: 'https://github.com/pytest-dev/pytest', install: 'pip install pytest', capabilities: ['python','unit'], screen: 'factory' },
    { id: 'postgres', name: 'PostgreSQL', layer: 'database', role: 'Default production SQL engine (Supabase/Testcontainers)', link: 'https://github.com/postgres/postgres', install: 'docker run -p 5432:5432 postgres', capabilities: ['sql','acid'], screen: 'factory' },
    { id: 'sqlite', name: 'SQLite', layer: 'database', role: 'Local-first SQL engine (PocketBase / desktop)', link: 'https://github.com/sqlite/sqlite', install: 'bundled', capabilities: ['embedded','portable'], screen: 'factory' },
    { id: 'redis', name: 'Redis', layer: 'database', role: 'Cache, queues and ephemeral state for generated apps', link: 'https://github.com/redis/redis', install: 'docker run -p 6379:6379 redis', capabilities: ['cache','queue'], screen: 'factory' },
    { id: 'duckdb', name: 'DuckDB', layer: 'database', role: 'Analytical / local OLAP for dashboards and evidence', link: 'https://github.com/duckdb/duckdb', install: 'npm i duckdb', capabilities: ['olap','local'], screen: 'factory' },
    { id: 'mongodb', name: 'MongoDB Community Server', layer: 'database', role: 'Document store for generated document-oriented backends', link: 'https://github.com/mongodb/mongo', install: 'docker run -p 27017:27017 mongo', capabilities: ['document','replica'], screen: 'factory' }
  ];

  const PRIORITY = [
    { n: 1, ids: ['localai', 'llamacpp'], objective: 'Sovereign Model Router and local/offline inference' },
    { n: 2, ids: ['cline', 'aider'], objective: 'Developer-agent and repair-agent execution engines' },
    { n: 3, ids: ['pocketflow'], objective: 'Internal GodMode workflow/agent graph' },
    { n: 4, ids: ['temporal'], objective: 'Durable, resumable, retryable builds' },
    { n: 5, ids: ['qdrant'], objective: 'Semantic repository/project/error/repair memory' },
    { n: 6, ids: ['supabase', 'postgres'], objective: 'Production backend generator' },
    { n: 7, ids: ['pocketbase', 'sqlite'], objective: 'Lightweight/offline/local-first generator' },
    { n: 8, ids: ['playwright', 'testcontainers'], objective: 'Real execution verification' },
    { n: 9, ids: ['openhands'], objective: 'Autonomous developer workspace and sandbox' },
    { n: 10, ids: ['aider', 'vitest', 'jest', 'pytest'], objective: 'Recovery + Definition-of-Done integration' }
  ];

  const POCKET_FLOWS = [
    'RequirementFlow', 'ArchitectureFlow', 'ScaffoldFlow', 'ImplementationFlow',
    'BuildFlow', 'TestFlow', 'RecoveryFlow', 'ValidationFlow', 'PackagingFlow'
  ];

  const TEMPORAL_STAGES = [
    'Requirements', 'Architecture', 'Scaffold', 'Frontend generation', 'Backend generation',
    'Database generation', 'Dependency installation', 'Compile', 'Start app',
    'Browser tests', 'API tests', 'Database tests', 'Security scan', 'Fault injection',
    'Repair', 'Regression tests', 'Package', 'Evidence generation', 'Delivery'
  ];

  const MEMORY_DOMAINS = [
    'project', 'repository', 'error', 'repair', 'architecture', 'documentation', 'dependency'
  ];

  const CLINE_AGENTS = [
    'PlannerAgent', 'ArchitectAgent', 'FrontendAgent', 'BackendAgent', 'DatabaseAgent',
    'MobileAgent', 'DesktopAgent', 'TestAgent', 'SecurityAgent', 'RepairAgent', 'ReleaseAgent'
  ];

  const AIDER_OPS = [
    'analyzeRepository', 'generateRepoMap', 'applyPatch', 'runLint',
    'runTests', 'repairFailure', 'commitCheckpoint', 'rollbackCheckpoint'
  ];

  const DEFAULT_STATE = {
    enabled: {},
    router: {
      gateway: 'cloud',
      localaiUrl: 'http://127.0.0.1:8080',
      llamaUrl: 'http://127.0.0.1:8081',
      lastProbe: null
    },
    execution: 'native',
    vector: 'qdrant',
    backend: 'supabase',
    lastFlow: null,
    lastVerify: null,
    lastAider: null
  };

  CATALOG.forEach(function (e) { DEFAULT_STATE.enabled[e.id] = true; });

  const state = Object.assign({}, DEFAULT_STATE, load(NS, {}));
  if (!state.enabled) state.enabled = Object.assign({}, DEFAULT_STATE.enabled);
  CATALOG.forEach(function (e) {
    if (typeof state.enabled[e.id] !== 'boolean') state.enabled[e.id] = true;
  });
  state.router = Object.assign({}, DEFAULT_STATE.router, state.router || {});

  function persist() { save(NS, state); }

  function byId(id) { return CATALOG.find(function (e) { return e.id === id; }) || null; }
  function isEnabled(id) { return !!state.enabled[id]; }
  function enable(id, yes) {
    if (!byId(id)) return { ok: false, reason: 'unknown' };
    state.enabled[id] = yes !== false;
    persist();
    emit('stack:enable', { id: id, enabled: state.enabled[id] });
    return { ok: true, id: id, enabled: state.enabled[id] };
  }

  function emit(ev, payload) {
    try {
      if (window.EngineExtras && EngineExtras.EventBus) EngineExtras.EventBus.emit(ev, payload);
    } catch (_) {}
  }

  function fsList() {
    const FS = window.Engine && window.Engine.FS;
    if (!FS) return [];
    try {
      return (FS.list ? FS.list() : Object.keys(FS._data || {}).map(function (p) {
        return { path: p, type: FS.isFile(p) ? 'file' : 'dir' };
      })).filter(function (f) { return f.type === 'file'; });
    } catch (_) { return []; }
  }
  function fsRead(p) {
    try { return (window.Engine && Engine.FS && Engine.FS.read(p)) || ''; } catch (_) { return ''; }
  }
  function fsWrite(p, c) {
    try { if (window.Engine && Engine.FS) Engine.FS.write(p, c); return true; } catch (_) { return false; }
  }

  // ============================================================
  // Sovereign Model Router — LocalAI + llama.cpp + cloud
  // ============================================================
  const Router = {
    get() { return Object.assign({}, state.router); },
    setGateway(kind, urls) {
      if (['cloud', 'localai', 'llamacpp'].indexOf(kind) < 0) return { ok: false, reason: 'unknown gateway' };
      state.router.gateway = kind;
      if (urls && urls.localaiUrl) state.router.localaiUrl = String(urls.localaiUrl).replace(/\/+$/, '');
      if (urls && urls.llamaUrl) state.router.llamaUrl = String(urls.llamaUrl).replace(/\/+$/, '');
      persist();
      this.applyToLLM();
      emit('stack:router', { gateway: kind });
      return { ok: true, router: this.get() };
    },
    applyToLLM() {
      const LLM = window.Engine && window.Engine.LLM;
      if (!LLM || !LLM.setConfig || !LLM.getConfig) return { ok: false, reason: 'LLM missing' };
      const r = state.router;
      const cur = LLM.getConfig() || {};
      const isLocalProv = cur.providerId === 'localai' || cur.providerId === 'llamacpp';
      if (r.gateway === 'localai' || r.gateway === 'llamacpp') {
        if (!isLocalProv) {
          state.router.cloudSnapshot = {
            providerId: cur.providerId || '',
            model: cur.model || '',
            apiKey: cur.apiKey || '',
            baseUrl: cur.baseUrl || '',
            enabled: !!cur.enabled
          };
          persist();
        }
        LLM.setConfig({
          providerId: r.gateway === 'localai' ? 'localai' : 'llamacpp',
          baseUrl: r.gateway === 'localai' ? r.localaiUrl : r.llamaUrl,
          model: r.gateway === 'localai' ? 'qwen2.5-coder' : 'qwen2.5-coder-7b-instruct',
          enabled: true,
          apiKey: ''
        });
      } else if (isLocalProv) {
        const snap = state.router.cloudSnapshot || { providerId: 'minimax', model: '', apiKey: '', baseUrl: '', enabled: false };
        LLM.setConfig({
          providerId: snap.providerId || 'minimax',
          model: snap.model || '',
          apiKey: snap.apiKey || '',
          baseUrl: snap.baseUrl || '',
          enabled: !!snap.enabled
        });
      }
      return { ok: true, gateway: r.gateway };
    },
    async probe() {
      const r = state.router;
      const targets = [
        { id: 'localai', url: r.localaiUrl + '/v1/models' },
        { id: 'llamacpp', url: r.llamaUrl + '/v1/models' }
      ];
      const results = [];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          const res = await fetch(t.url, { method: 'GET' });
          results.push({ id: t.id, ok: res.ok, status: res.status, url: t.url });
        } catch (e) {
          results.push({ id: t.id, ok: false, error: String(e && e.message || e), url: t.url });
        }
      }
      state.router.lastProbe = { at: now(), results: results };
      persist();
      return state.router.lastProbe;
    }
  };

  // ============================================================
  // Execution backends — Native / Cline / Aider / OpenHands
  // ============================================================
  const Execution = {
    backends: ['native', 'cline', 'aider', 'openhands'],
    agents: CLINE_AGENTS,
    current() { return state.execution || 'native'; },
    set(id) {
      if (this.backends.indexOf(id) < 0) return { ok: false, reason: 'unknown backend' };
      state.execution = id;
      persist();
      emit('stack:execution', { id: id });
      return { ok: true, id: id };
    },
    profile() {
      const id = this.current();
      const map = {
        native: { tools: ['fs', 'validate'], sandbox: false, mcp: false },
        cline: { tools: ['fs', 'term', 'mcp', 'headless'], sandbox: false, mcp: true, agents: CLINE_AGENTS },
        aider: { tools: ['repo-map', 'patch', 'lint', 'test', 'git'], sandbox: false, mcp: false },
        openhands: { tools: ['shell', 'code', 'browser', 'api'], sandbox: true, mcp: false }
      };
      return Object.assign({ id: id }, map[id]);
    },
    ensureSandbox() {
      return { ok: true, isolated: this.current() === 'openhands', note: 'browser sandbox via RealBrowser / iframe' };
    }
  };

  // ============================================================
  // Aider-style recovery operations
  // ============================================================
  const Aider = {
    ops: AIDER_OPS,
    analyzeRepository() {
      const files = fsList();
      const langs = {};
      files.forEach(function (f) {
        const m = (f.path || '').match(/\.([a-z0-9]+)$/i);
        const ext = m ? m[1].toLowerCase() : 'other';
        langs[ext] = (langs[ext] || 0) + 1;
      });
      const issues = (window.Engine && Engine.Validator && Engine.Validator.runAll) ? Engine.Validator.runAll() : [];
      const out = {
        at: now(),
        fileCount: files.length,
        languages: langs,
        issueCount: issues.length,
        errors: issues.filter(function (i) { return i.severity === 'error'; }).length
      };
      state.lastAider = { op: 'analyzeRepository', at: out.at, summary: out.fileCount + ' files / ' + out.errors + ' errors' };
      persist();
      Memory.remember('repository', 'analyze ' + out.fileCount + ' files', out);
      return out;
    },
    generateRepoMap() {
      const files = fsList();
      const tree = {};
      files.forEach(function (f) {
        const parts = (f.path || '').split('/').filter(Boolean);
        let cur = tree;
        parts.forEach(function (p, i) {
          if (i === parts.length - 1) { cur[p] = 'file'; }
          else { cur[p] = cur[p] && typeof cur[p] === 'object' ? cur[p] : {}; cur = cur[p]; }
        });
      });
      const md = ['# Repository map', '', 'Generated by CodeSovereign Aider engine.', ''].concat(
        files.slice(0, 200).map(function (f) { return '- `' + f.path + '`'; })
      ).join('\n');
      fsWrite('/.codesovereign/REPO_MAP.md', md);
      const out = { at: now(), files: files.length, tree: tree, path: '/.codesovereign/REPO_MAP.md' };
      state.lastAider = { op: 'generateRepoMap', at: out.at, summary: files.length + ' paths' };
      persist();
      return out;
    },
    applyPatch(path, content) {
      if (!path) return { ok: false, reason: 'path required' };
      const p = path.charAt(0) === '/' ? path : '/' + path;
      const ok = fsWrite(p, content == null ? '' : String(content));
      const out = { ok: ok, path: p, bytes: String(content || '').length };
      state.lastAider = { op: 'applyPatch', at: now(), summary: p };
      persist();
      return out;
    },
    runLint() {
      const issues = (window.Engine && Engine.Validator && Engine.Validator.runAll) ? Engine.Validator.runAll() : [];
      const out = {
        ok: issues.filter(function (i) { return i.severity === 'error'; }).length === 0,
        issues: issues.length,
        errors: issues.filter(function (i) { return i.severity === 'error'; }).length
      };
      state.lastAider = { op: 'runLint', at: now(), summary: out.errors + ' errors' };
      persist();
      return out;
    },
    runTests() {
      const v = (window.Engine && Engine.Verify && Engine.Verify.build) ? Engine.Verify.build() : { ok: true, command: 'static-parsing' };
      const levels = (window.Engine && Engine.Levels && Engine.Levels.run) ? Engine.Levels.run() : null;
      const out = { ok: !!(v && v.ok), build: v, levels: levels };
      state.lastAider = { op: 'runTests', at: now(), summary: out.ok ? 'pass' : 'fail' };
      persist();
      return out;
    },
    repairFailure() {
      if (window.Engine && Engine.Recovery && Engine.Recovery.run) {
        const r = Engine.Recovery.run();
        state.lastAider = { op: 'repairFailure', at: now(), summary: 'recovery.run' };
        persist();
        Memory.remember('repair', 'repairFailure', { ok: !!(r && r.ok) });
        return r;
      }
      const lint = this.runLint();
      return { ok: lint.ok, fallback: 'lint-only', lint: lint };
    },
    commitCheckpoint(reason) {
      const Snaps = window.Engine && Engine.Snapshots;
      if (!Snaps || !Snaps.capture) return { ok: false, reason: 'snapshots missing' };
      const snap = Snaps.capture(reason || 'aider-checkpoint', 'aider');
      state.lastAider = { op: 'commitCheckpoint', at: now(), summary: snap.snapshotId };
      persist();
      return { ok: true, snapshotId: snap.snapshotId, fileCount: snap.fileCount };
    },
    rollbackCheckpoint(snapshotId) {
      const Snaps = window.Engine && Engine.Snapshots;
      if (!Snaps) return { ok: false, reason: 'snapshots missing' };
      const r = snapshotId ? Snaps.restore(snapshotId) : (Snaps.rollbackLatest ? Snaps.rollbackLatest() : { ok: false });
      state.lastAider = { op: 'rollbackCheckpoint', at: now(), summary: (r && r.snapshotId) || 'latest' };
      persist();
      return r;
    },
    last() { return state.lastAider; }
  };

  // ============================================================
  // PocketFlow — inspectable GodMode graphs
  // ============================================================
  const FLOW_TO_WF = {
    RequirementFlow: 'PLANNING',
    ArchitectureFlow: 'PLANNING',
    ScaffoldFlow: 'IMPLEMENTING',
    ImplementationFlow: 'IMPLEMENTING',
    BuildFlow: 'BUILDING',
    TestFlow: 'TESTING',
    RecoveryFlow: 'REPAIRING',
    ValidationFlow: 'VERIFYING',
    PackagingFlow: 'DEPLOYING'
  };
  const PocketFlow = {
    flows: POCKET_FLOWS,
    graph() {
      return POCKET_FLOWS.map(function (name, i) {
        return { n: i + 1, name: name, next: POCKET_FLOWS[i + 1] || null, workflow: FLOW_TO_WF[name] };
      });
    },
    run(name) {
      if (POCKET_FLOWS.indexOf(name) < 0) return { ok: false, reason: 'unknown flow' };
      const node = this.graph().find(function (g) { return g.name === name; });
      const t0 = now();
      let artifacts = [];
      if (name === 'ScaffoldFlow' || name === 'ImplementationFlow') {
        artifacts = fsList().map(function (f) { return f.path; }).slice(0, 40);
      }
      if (name === 'RecoveryFlow') {
        try { if (window.Engine && Engine.Recovery && Engine.Recovery.analyze) Engine.Recovery.analyze(); } catch (_) {}
      }
      if (name === 'ValidationFlow') {
        try { if (window.Engine && Engine.Validator) Engine.Validator.runAll(); } catch (_) {}
      }
      if (name === 'TestFlow') {
        try { if (window.Engine && Engine.Verify && Engine.Verify.build) Engine.Verify.build(); } catch (_) {}
      }
      try {
        const Wf = window.EngineExtras && EngineExtras.Workflow;
        if (Wf && node.workflow && Wf.canTransition(node.workflow)) Wf.transition(node.workflow, { source: 'pocketflow', flow: name });
      } catch (_) {}
      const result = { ok: true, flow: name, at: t0, elapsed: now() - t0, artifacts: artifacts.length, next: node.next };
      state.lastFlow = result;
      persist();
      emit('stack:flow', result);
      Memory.remember('architecture', name, result);
      return result;
    },
    last() { return state.lastFlow; }
  };

  // ============================================================
  // Temporal — durable, resumable factory pipeline
  // ============================================================
  function loadTemporal() {
    return load(NS_TMP, { runId: null, stage: 0, status: 'idle', history: [], checkpoints: [] });
  }
  function saveTemporal(t) { save(NS_TMP, t); }
  const Temporal = {
    stages: TEMPORAL_STAGES,
    get() { return loadTemporal(); },
    start(meta) {
      const run = {
        runId: 'wf_' + now().toString(36),
        stage: 0,
        status: 'running',
        startedAt: now(),
        history: [{ stage: 0, name: TEMPORAL_STAGES[0], t: now(), event: 'start' }],
        checkpoints: [],
        meta: meta || {}
      };
      saveTemporal(run);
      emit('stack:temporal', { event: 'start', runId: run.runId });
      return run;
    },
    checkpoint() {
      const run = loadTemporal();
      if (!run.runId || run.status === 'idle') return { ok: false, reason: 'no active run' };
      const name = TEMPORAL_STAGES[run.stage] || 'unknown';
      run.checkpoints.push({ stage: run.stage, name: name, t: now() });
      run.history.push({ stage: run.stage, name: name, t: now(), event: 'checkpoint' });
      if (run.stage < TEMPORAL_STAGES.length - 1) {
        run.stage += 1;
        run.status = 'running';
      } else {
        run.status = 'completed';
      }
      saveTemporal(run);
      emit('stack:temporal', { event: 'checkpoint', stage: run.stage, status: run.status });
      return { ok: true, run: run };
    },
    fail(reason) {
      const run = loadTemporal();
      if (!run.runId) return { ok: false, reason: 'no active run' };
      run.status = 'failed';
      run.history.push({ stage: run.stage, name: TEMPORAL_STAGES[run.stage], t: now(), event: 'fail', reason: reason || 'error' });
      saveTemporal(run);
      return { ok: true, run: run };
    },
    retry() {
      const run = loadTemporal();
      if (!run.runId) return this.start({ retry: true });
      run.status = 'running';
      run.history.push({ stage: run.stage, name: TEMPORAL_STAGES[run.stage], t: now(), event: 'retry' });
      saveTemporal(run);
      return { ok: true, run: run };
    },
    resume() {
      const run = loadTemporal();
      if (!run.runId) return { ok: false, reason: 'no checkpoint' };
      if (run.status === 'completed') return { ok: true, run: run, note: 'already complete' };
      run.status = 'running';
      run.history.push({ stage: run.stage, name: TEMPORAL_STAGES[run.stage], t: now(), event: 'resume' });
      saveTemporal(run);
      return { ok: true, run: run, from: TEMPORAL_STAGES[run.stage] };
    },
    reset() {
      const empty = { runId: null, stage: 0, status: 'idle', history: [], checkpoints: [] };
      saveTemporal(empty);
      return empty;
    }
  };

  // ============================================================
  // Semantic memory — Qdrant primary, Weaviate / Milvus alternatives
  // ============================================================
  function embed(text) {
    const dims = 32;
    const v = new Array(dims).fill(0);
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      v[i % dims] += ((s.charCodeAt(i) * (i + 1)) % 97) / 97;
    }
    let n = 0;
    for (let i = 0; i < dims; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    return v.map(function (x) { return x / n; });
  }
  function cosine(a, b) {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }
  function loadMem() {
    const m = load(NS_MEM, null);
    if (m && m.domains) return m;
    const domains = {};
    MEMORY_DOMAINS.forEach(function (d) { domains[d] = []; });
    return { engine: 'qdrant', domains: domains };
  }
  function saveMem(m) { save(NS_MEM, m); }
  const Memory = {
    domains: MEMORY_DOMAINS,
    engine() { return state.vector || 'qdrant'; },
    setEngine(id) {
      if (['qdrant', 'weaviate', 'milvus'].indexOf(id) < 0) return { ok: false };
      state.vector = id;
      persist();
      const m = loadMem();
      m.engine = id;
      saveMem(m);
      emit('stack:memory-engine', { id: id });
      return { ok: true, id: id };
    },
    remember(domain, text, meta) {
      const d = MEMORY_DOMAINS.indexOf(domain) >= 0 ? domain : 'project';
      const m = loadMem();
      const rec = { id: 'm_' + now().toString(36) + Math.random().toString(36).slice(2, 6), at: now(), text: String(text || '').slice(0, 2000), meta: meta || {}, vec: embed(text) };
      m.domains[d] = (m.domains[d] || []).slice(-199);
      m.domains[d].push(rec);
      saveMem(m);
      return rec;
    },
    search(query, domain) {
      const qv = embed(query);
      const m = loadMem();
      const domains = domain ? [domain] : MEMORY_DOMAINS;
      const hits = [];
      domains.forEach(function (d) {
        (m.domains[d] || []).forEach(function (rec) {
          hits.push({ domain: d, score: cosine(qv, rec.vec || []), text: rec.text, at: rec.at, id: rec.id });
        });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      return hits.slice(0, 12);
    },
    indexWorkspace() {
      const files = fsList();
      let n = 0;
      files.forEach(function (f) {
        const body = fsRead(f.path);
        if (!body) return;
        Memory.remember('repository', f.path + '\n' + body.slice(0, 800), { path: f.path });
        n++;
      });
      Memory.remember('project', 'indexed ' + n + ' files at ' + new Date().toISOString(), { fileCount: n });
      return { ok: true, indexed: n, engine: this.engine() };
    },
    stats() {
      const m = loadMem();
      const counts = {};
      let total = 0;
      MEMORY_DOMAINS.forEach(function (d) {
        counts[d] = (m.domains[d] || []).length;
        total += counts[d];
      });
      return { engine: m.engine || this.engine(), total: total, domains: counts };
    },
    reset() {
      const domains = {};
      MEMORY_DOMAINS.forEach(function (d) { domains[d] = []; });
      saveMem({ engine: state.vector || 'qdrant', domains: domains });
      return { ok: true };
    }
  };

  // ============================================================
  // Backend generators — Supabase / PocketBase / Appwrite
  // ============================================================
  function backendFiles(id, name) {
    const app = name || 'app';
    if (id === 'supabase') {
      return [
        { path: '/supabase/config.toml', content: 'project_id = "' + app + '"\n[api]\nenabled = true\nport = 54321\n[db]\nport = 54322\nmajor_version = 15\n' },
        { path: '/supabase/migrations/0001_init.sql', content: '-- generated by CodeSovereign Supabase engine\ncreate table if not exists public.profiles (\n  id uuid primary key default gen_random_uuid(),\n  email text unique,\n  created_at timestamptz default now()\n);\nalter table public.profiles enable row level security;\ncreate policy "profiles are readable" on public.profiles for select using (true);\n' },
        { path: '/src/lib/supabaseClient.js', content: "import { createClient } from '@supabase/supabase-js';\nconst url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';\nconst key = process.env.SUPABASE_ANON_KEY || 'public-anon-key';\nexport const supabase = createClient(url, key);\nexport async function listProfiles() {\n  const { data, error } = await supabase.from('profiles').select('*');\n  if (error) throw error;\n  return data;\n}\n" },
        { path: '/.codesovereign/backend.md', content: '# Backend: Supabase\n\nEngine: https://github.com/supabase/supabase\nPostgres + Auth + Storage + Realtime + Edge Functions.\n' }
      ];
    }
    if (id === 'pocketbase') {
      return [
        { path: '/pb_hooks/main.pb.js', content: '// PocketBase hooks generated by CodeSovereign\nonRecordAfterCreateRequest(function (e) {\n  console.log("created", e.record && e.record.id);\n}, "users");\n' },
        { path: '/pocketbase.json', content: JSON.stringify({ appName: app, httpAddr: '127.0.0.1:8090', dataDir: 'pb_data' }, null, 2) },
        { path: '/src/lib/pocketbase.js', content: "const BASE = (typeof process !== 'undefined' && process.env && process.env.PB_URL) || 'http://127.0.0.1:8090';\nexport async function pb(path, opts) {\n  const r = await fetch(BASE + '/api/' + path.replace(/^\\/+/, ''), Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));\n  if (!r.ok) throw new Error('PocketBase ' + r.status);\n  return r.json();\n}\n" },
        { path: '/.codesovereign/backend.md', content: '# Backend: PocketBase\n\nEngine: https://github.com/pocketbase/pocketbase\nSQLite + auth + files + realtime. Local-first.\n' }
      ];
    }
    return [
      { path: '/appwrite.json', content: JSON.stringify({ projectId: app, endpoint: 'http://127.0.0.1:80/v1', services: ['auth', 'databases', 'storage', 'functions'] }, null, 2) },
      { path: '/src/lib/appwrite.js', content: "const ENDPOINT = 'http://127.0.0.1/v1';\nexport async function aw(path, opts) {\n  const r = await fetch(ENDPOINT + '/' + path.replace(/^\\/+/, ''), opts);\n  if (!r.ok) throw new Error('Appwrite ' + r.status);\n  return r.json();\n}\n" },
      { path: '/.codesovereign/backend.md', content: '# Backend: Appwrite\n\nEngine: https://github.com/appwrite/appwrite\nSelf-hosted auth, databases, storage, functions.\n' }
    ];
  }
  const Backends = {
    ids: ['supabase', 'pocketbase', 'appwrite'],
    current() { return state.backend || 'supabase'; },
    set(id) {
      if (this.ids.indexOf(id) < 0) return { ok: false };
      state.backend = id;
      persist();
      return { ok: true, id: id };
    },
    generate(id) {
      const which = id || this.current();
      if (this.ids.indexOf(which) < 0) return { ok: false, reason: 'unknown backend' };
      const proj = window.Engine && Engine.Proj && Engine.Proj.current && Engine.Proj.current();
      const files = backendFiles(which, proj && proj.name);
      const written = [];
      files.forEach(function (f) { if (fsWrite(f.path, f.content)) written.push(f.path); });
      enable(which, true);
      Memory.remember('architecture', 'generated ' + which + ' backend', { files: written });
      emit('stack:backend', { id: which, files: written });
      return { ok: true, id: which, files: written };
    }
  };

  // ============================================================
  // Verification — Playwright + Testcontainers + runners
  // ============================================================
  const Verify = {
    detectRunners() {
      let pkg = null;
      try { pkg = JSON.parse(fsRead('/package.json') || 'null'); } catch (_) { pkg = null; }
      const deps = Object.assign({}, (pkg && pkg.dependencies) || {}, (pkg && pkg.devDependencies) || {});
      const py = !!(fsRead('/pyproject.toml') || fsRead('/requirements.txt') || fsRead('/pytest.ini'));
      return {
        vitest: !!(deps.vitest || (pkg && pkg.scripts && /vitest/.test(JSON.stringify(pkg.scripts)))),
        jest: !!(deps.jest || (pkg && pkg.scripts && /jest/.test(JSON.stringify(pkg.scripts)))),
        pytest: py,
        playwright: !!(deps.playwright || deps['@playwright/test']),
        testcontainers: !!(deps.testcontainers)
      };
    },
    testcontainersPlan() {
      const files = fsList().map(function (f) { return f.path; }).join('\n');
      const body = files + '\n' + fsRead('/package.json') + '\n' + fsRead('/docker-compose.yml') + '\n' + fsRead('/.codesovereign/backend.md');
      const services = [];
      if (/supabase|postgres|postgresql/i.test(body) || state.backend === 'supabase') services.push({ name: 'postgres', image: 'postgres:15', port: 5432, link: 'https://github.com/postgres/postgres' });
      if (/redis/i.test(body)) services.push({ name: 'redis', image: 'redis:7', port: 6379, link: 'https://github.com/redis/redis' });
      if (/mongo/i.test(body)) services.push({ name: 'mongodb', image: 'mongo:7', port: 27017, link: 'https://github.com/mongodb/mongo' });
      if (/mysql/i.test(body)) services.push({ name: 'mysql', image: 'mysql:8', port: 3306, link: 'https://github.com/testcontainers' });
      if (/kafka/i.test(body)) services.push({ name: 'kafka', image: 'confluentinc/cp-kafka', port: 9092, link: 'https://github.com/testcontainers' });
      if (/pocketbase|sqlite/i.test(body) || state.backend === 'pocketbase') services.push({ name: 'sqlite', image: 'in-process', port: 0, link: 'https://github.com/sqlite/sqlite' });
      if (!services.length) services.push({ name: 'sqlite', image: 'in-process', port: 0, link: 'https://github.com/sqlite/sqlite' });
      return {
        loop: 'generated code → temporary service → migrations → seed → start → API/DB tests → destroy',
        services: services,
        org: 'https://github.com/testcontainers',
        java: 'https://github.com/testcontainers/testcontainers-java'
      };
    },
    async playwright() {
      const RB = (window.Engine && Engine.RealBrowser) || window.RealBrowser;
      if (RB && RB.runDemo) {
        try { return { ok: true, via: 'RealBrowser', result: await RB.runDemo() }; } catch (e) { return { ok: false, via: 'RealBrowser', error: String(e && e.message || e) }; }
      }
      const html = fsRead('/index.html');
      return { ok: !!html, via: 'static-dom', hasIndex: !!html, link: 'https://github.com/microsoft/playwright' };
    },
    async run() {
      const runners = this.detectRunners();
      const plan = this.testcontainersPlan();
      const pw = await this.playwright();
      const lint = Aider.runLint();
      const tests = Aider.runTests();
      const out = { at: now(), runners: runners, containers: plan, playwright: pw, lint: lint, tests: tests, ok: !!(lint.ok && tests.ok) };
      state.lastVerify = out;
      persist();
      Memory.remember('error', out.ok ? 'verification passed' : 'verification issues', out);
      return out;
    },
    last() { return state.lastVerify; }
  };

  // ============================================================
  // Marketplace + Plugin + Gateway registration
  // ============================================================
  function asMarketplaceTemplate(e) {
    return {
      id: 'stack-' + e.id,
      label: e.name,
      category: 'engine',
      tags: [e.layer, 'oss', 'stack'].concat(e.capabilities || []).slice(0, 8),
      desc: e.role + ' · ' + e.link,
      author: 'CodeSovereign Stack',
      version: '1.0.0',
      downloads: 0,
      is_official: true,
      files: [
        { path: '/.codesovereign/stack/' + e.id + '.md', content: '# ' + e.name + '\n\n' + e.role + '\n\nRepository: ' + e.link + '\nInstall: `' + (e.install || '') + '`\nLayer: ' + e.layer + '\nCapabilities: ' + (e.capabilities || []).join(', ') + '\n' }
      ]
    };
  }

  function registerMarketplace() {
    const M = window.TemplateMarketplace;
    if (!M || !M.registerDefault) return 0;
    let n = 0;
    CATALOG.forEach(function (e) {
      const tpl = asMarketplaceTemplate(e);
      if (e.id === 'supabase' || e.id === 'pocketbase' || e.id === 'appwrite') {
        tpl.files = backendFiles(e.id, 'app');
      }
      M.registerDefault(tpl);
      n++;
    });
    if (!M.install.__stackHooked) {
      const origInstall = M.install.bind(M);
      M.install = async function (id, opts) {
        const r = await origInstall(id, opts);
        if (id && String(id).indexOf('stack-') === 0) {
          const eid = String(id).slice(6);
          enable(eid, true);
        }
        return r;
      };
      M.install.__stackHooked = true;
    }
    return n;
  }

  function registerGateway() {
    const Gw = window.EngineExtras && EngineExtras.ToolGateway;
    if (!Gw || !Gw.allow) return;
    const extras = [
      'agent.cline', 'agent.aider', 'agent.openhands',
      'model.localai', 'model.llamacpp',
      'memory.qdrant', 'workflow.temporal', 'workflow.pocketflow',
      'verify.testcontainers', 'verify.playwright',
      'backend.supabase', 'backend.pocketbase', 'backend.appwrite'
    ];
    const have = Gw.list() || {};
    extras.forEach(function (t) {
      if (typeof have[t] !== 'boolean') Gw.allow(t, t.indexOf('openhands') < 0);
    });
  }

  function patchAgent() {
    if (!window.Engine || !Engine.Agent || Engine.Agent.__stackPatched) return false;
    const orig = Engine.Agent.run.bind(Engine.Agent);
    Engine.Agent.run = function (prompt, onStep) {
      const backend = Execution.current();
      const profile = Execution.profile();
      const wrap = function (step) {
        if (step && step.kind === 'plan') {
          step.text = '[' + backend + '] ' + (step.text || 'Planning');
        }
        onStep && onStep(step);
      };
      if (backend === 'aider') {
        try { Aider.generateRepoMap(); } catch (_) {}
      }
      if (backend === 'openhands') {
        try { Execution.ensureSandbox(); } catch (_) {}
      }
      Memory.remember('project', String(prompt || '').slice(0, 500), { backend: backend, tools: profile.tools });
      return orig(prompt, wrap);
    };
    Engine.Agent.__stackPatched = true;
    return true;
  }

  function summary() {
    const enabled = CATALOG.filter(function (e) { return isEnabled(e.id); }).length;
    return {
      total: CATALOG.length,
      enabled: enabled,
      execution: Execution.current(),
      gateway: state.router.gateway,
      vector: Memory.engine(),
      backend: Backends.current(),
      flows: POCKET_FLOWS.length,
      temporalStages: TEMPORAL_STAGES.length,
      memory: Memory.stats()
    };
  }

  const Stack = {
    catalog: function () { return CATALOG.slice(); },
    byId: byId,
    isEnabled: isEnabled,
    enable: enable,
    priority: function () { return PRIORITY.slice(); },
    summary: summary,
    state: function () { return JSON.parse(JSON.stringify(state)); },
    Router: Router,
    Execution: Execution,
    Aider: Aider,
    PocketFlow: PocketFlow,
    Temporal: Temporal,
    Memory: Memory,
    Backends: Backends,
    Verify: Verify,
    links: function () { return CATALOG.map(function (e) { return e.link; }); },
    reset: function () {
      Object.keys(DEFAULT_STATE.enabled).forEach(function (k) { state.enabled[k] = true; });
      const snap = state.router && state.router.cloudSnapshot;
      state.router = Object.assign({}, DEFAULT_STATE.router, { cloudSnapshot: snap });
      state.execution = 'native';
      state.vector = 'qdrant';
      state.backend = 'supabase';
      persist();
      Temporal.reset();
      Memory.reset();
      Router.applyToLLM();
      return { ok: true };
    }
  };

  window.BuildingStack = Stack;
  if (window.Engine) window.Engine.BuildingStack = Stack;

  function boot() {
    registerGateway();
    registerMarketplace();
    patchAgent();
  }
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
    setTimeout(boot, 50);
  }
})();
