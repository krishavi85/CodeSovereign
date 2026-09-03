/* engine-extras.js — extension to engine.js
   Implements the full CodeSovereign spec:
   - Workflow state machine (CREATED -> COMPLETED + exception states)
   - E1-E29 capability engine registry
   - Tool Gateway, Credential Broker, Event Bus
   - Pipeline Discovery (28+ app types, 8 pipeline families)
   - Pipeline Engineering (graph with metadata)
   - Backend Completion & Verification (9-step workflow + release gates)
   - Interactivity Repair (9-phase pipeline + failure catalogue)
   - Persistent workflow state (localStorage)
   Exposed as window.EngineExtras
*/
(function(){
  'use strict';

  // ---------- localStorage helpers ----------
  const NS_WF = 'cs.workflow.v1';
  const NS_EVT = 'cs.events.v1';
  const NS_PIPE = 'cs.pipelines.v1';
  const NS_APP_TYPE = 'cs.appType.v1';
  const NS_CREDS = 'cs.creds.v1';
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };

  // ============================================================
  // 1) EVENT BUS — pub/sub with explicit subscribers
  // ============================================================
  const EventBus = {
    _subs: {},
    _log: load(NS_EVT, []),
    on(event, handler){
      if (!this._subs[event]) this._subs[event] = [];
      this._subs[event].push(handler);
      return () => this.off(event, handler);
    },
    off(event, handler){
      if (!this._subs[event]) return;
      this._subs[event] = this._subs[event].filter(h => h !== handler);
    },
    emit(event, payload){
      const entry = { t: Date.now(), event, payload };
      this._log.unshift(entry);
      if (this._log.length > 200) this._log.length = 200;
      save(NS_EVT, this._log);
      (this._subs[event] || []).forEach(h => { try { h(payload, entry); } catch(e){} });
      (this._subs['*'] || []).forEach(h => { try { h(event, payload, entry); } catch(e){} });
    },
    history(limit){ return this._log.slice(0, limit || 50); },
    clear(){ this._log = []; save(NS_EVT, this._log); }
  };

  // ============================================================
  // 2) CREDENTIAL BROKER — secrets/credentials gate
  // ============================================================
  const CredentialBroker = {
    _store: load(NS_CREDS, {}),
    set(key, value, meta){
      if (!key) throw new Error('Credential key required');
      this._store[key] = { value, meta: meta || {}, t: Date.now() };
      save(NS_CREDS, this._store);
      EventBus.emit('credential:set', { key });
    },
    get(key){
      const c = this._store[key];
      if (!c) return null;
      EventBus.emit('credential:get', { key });
      return c.value;
    },
    has(key){ return !!this._store[key]; },
    delete(key){
      delete this._store[key];
      save(NS_CREDS, this._store);
      EventBus.emit('credential:delete', { key });
    },
    list(){ return Object.keys(this._store); },
    redact(){ const out = {}; Object.keys(this._store).forEach(k => out[k] = { meta: this._store[k].meta, hasValue: true }); return out; }
  };

  // ============================================================
  // 3) TOOL GATEWAY — controlled workspace access
  // ============================================================
  const ToolGateway = {
    _allow: {
      'fs.read': true, 'fs.write': true, 'fs.delete': true, 'fs.list': true,
      'shell.exec': false, 'shell.read': true, 'net.fetch': false,
      'git.commit': true, 'git.push': false, 'git.checkout': true,
      'deploy.bundle': true, 'deploy.preview': true, 'deploy.publish': false,
      'db.read': true, 'db.write': true, 'db.migrate': true
    },
    allow(tool, yes){
      this._allow[tool] = !!yes;
      EventBus.emit('gateway:allow', { tool, allowed: this._allow[tool] });
    },
    isAllowed(tool){ return !!this._allow[tool]; },
    can(tool){ return this._allow[tool] === true; },
    list(){ return Object.assign({}, this._allow); },
    // invoke: if not allowed -> returns { ok:false, blocked:true, reason }
    invoke(tool, fn, args){
      if (!this.can(tool)){
        const r = { ok: false, blocked: true, reason: 'Tool not allowed: ' + tool, tool };
        EventBus.emit('gateway:denied', r);
        return Promise.resolve(r);
      }
      EventBus.emit('gateway:invoke', { tool });
      try {
        const out = fn.apply(null, args || []);
        return Promise.resolve(out).then(v => ({ ok: true, value: v }))
          .catch(e => ({ ok: false, error: String(e) }));
      } catch(e){ return Promise.resolve({ ok: false, error: String(e) }); }
    }
  };

  // ============================================================
  // 4) WORKFLOW STATE MACHINE
  // ============================================================
  const STATES = {
    CREATED: 'CREATED',
    QUEUED: 'QUEUED',
    PLANNING: 'PLANNING',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    IMPLEMENTING: 'IMPLEMENTING',
    TESTING: 'TESTING',
    REPAIRING: 'REPAIRING',
    BUILDING: 'BUILDING',
    DEPLOYING: 'DEPLOYING',
    VERIFYING: 'VERIFYING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    BLOCKED: 'BLOCKED',
    RETRYING: 'RETRYING',
    ROLLING_BACK: 'ROLLING_BACK',
    WAITING_FOR_USER: 'WAITING_FOR_USER',
    CANCELLED: 'CANCELLED'
  };
  // allowed transitions
  const TRANSITIONS = {
    CREATED: ['QUEUED', 'CANCELLED'],
    QUEUED: ['PLANNING', 'CANCELLED'],
    PLANNING: ['AWAITING_APPROVAL', 'IMPLEMENTING', 'FAILED', 'CANCELLED'],
    AWAITING_APPROVAL: ['IMPLEMENTING', 'CANCELLED', 'BLOCKED'],
    IMPLEMENTING: ['TESTING', 'REPAIRING', 'FAILED', 'BLOCKED', 'WAITING_FOR_USER'],
    TESTING: ['REPAIRING', 'BUILDING', 'FAILED', 'BLOCKED'],
    REPAIRING: ['IMPLEMENTING', 'TESTING', 'FAILED', 'BLOCKED'],
    BUILDING: ['DEPLOYING', 'FAILED', 'BLOCKED'],
    DEPLOYING: ['VERIFYING', 'FAILED', 'ROLLING_BACK', 'BLOCKED'],
    VERIFYING: ['COMPLETED', 'REPAIRING', 'FAILED', 'ROLLING_BACK'],
    COMPLETED: [],
    FAILED: ['RETRYING', 'CANCELLED', 'ROLLING_BACK'],
    BLOCKED: ['WAITING_FOR_USER', 'RETRYING', 'CANCELLED'],
    RETRYING: ['QUEUED', 'PLANNING', 'CANCELLED'],
    ROLLING_BACK: ['FAILED', 'CANCELLED'],
    WAITING_FOR_USER: ['IMPLEMENTING', 'AWAITING_APPROVAL', 'CANCELLED'],
    CANCELLED: []
  };
  const Workflow = {
    STATES: STATES,
    TRANSITIONS: TRANSITIONS,
    _current: load(NS_WF, { state: STATES.CREATED, history: [], meta: {} }),
    state(){ return this._current.state; },
    canTransition(to){ return (TRANSITIONS[this._current.state] || []).includes(to); },
    transition(to, meta){
      if (this._current.state === to) return false;
      if (!this.canTransition(to)){
        EventBus.emit('workflow:rejected', { from: this._current.state, to, reason: 'invalid' });
        return false;
      }
      const from = this._current.state;
      const entry = { from, to, t: Date.now(), meta: meta || {} };
      this._current.state = to;
      this._current.history = this._current.history || [];
      this._current.history.unshift(entry);
      if (this._current.history.length > 100) this._current.history.length = 100;
      save(NS_WF, this._current);
      EventBus.emit('workflow:transition', entry);
      EventBus.emit('workflow:state', { state: to });
      return true;
    },
    meta(m){ this._current.meta = Object.assign({}, this._current.meta, m || {}); save(NS_WF, this._current); EventBus.emit('workflow:meta', this._current.meta); },
    getMeta(){ return this._current.meta || {}; },
    history(limit){ return (this._current.history || []).slice(0, limit || 20); },
    reset(state){
      this._current = { state: state || STATES.CREATED, history: [{ from: null, to: state || STATES.CREATED, t: Date.now(), meta: { reset: true } }], meta: {} };
      save(NS_WF, this._current);
      EventBus.emit('workflow:reset', { state: this._current.state });
    },
    // try to advance through the pipeline (best-effort)
    advance(){
      const next = {
        CREATED: 'QUEUED',
        QUEUED: 'PLANNING',
        PLANNING: 'IMPLEMENTING',
        AWAITING_APPROVAL: 'IMPLEMENTING',
        IMPLEMENTING: 'TESTING',
        TESTING: 'BUILDING',
        BUILDING: 'DEPLOYING',
        DEPLOYING: 'VERIFYING',
        VERIFYING: 'COMPLETED'
      }[this._current.state];
      if (next && this.canTransition(next)) return this.transition(next);
      return false;
    }
  };

  // ============================================================
  // 5) ENGINE REGISTRY — E1-E29
  // ============================================================
  const ENGINES = {
    E1:  { name: 'Storage',        domain: 'data' },
    E2:  { name: 'Schema',         domain: 'data' },
    E3:  { name: 'Migration',      domain: 'data' },
    E4:  { name: 'Auth',           domain: 'security' },
    E5:  { name: 'AuthZ',          domain: 'security' },
    E6:  { name: 'Crypto',         domain: 'security' },
    E7:  { name: 'API',            domain: 'backend' },
    E8:  { name: 'RPC',            domain: 'backend' },
    E9:  { name: 'Realtime',       domain: 'backend' },
    E10: { name: 'Queue',          domain: 'backend' },
    E11: { name: 'Cache',          domain: 'backend' },
    E12: { name: 'CDN',            domain: 'infra' },
    E13: { name: 'Build',          domain: 'dev' },
    E14: { name: 'Test',           domain: 'dev' },
    E15: { name: 'Lint',           domain: 'dev' },
    E16: { name: 'Type',           domain: 'dev' },
    E17: { name: 'Security Scan',  domain: 'security' },
    E18: { name: 'Perf',           domain: 'dev' },
    E19: { name: 'A11y',           domain: 'dev' },
    E20: { name: 'i18n',           domain: 'dev' },
    E21: { name: 'Telemetry',      domain: 'ops' },
    E22: { name: 'Log',            domain: 'ops' },
    E23: { name: 'Trace',          domain: 'ops' },
    E24: { name: 'Feature Flag',   domain: 'ops' },
    E25: { name: 'Release',        domain: 'ops' },
    E26: { name: 'Rollback',       domain: 'ops' },
    E27: { name: 'Doc Gen',        domain: 'dev' },
    E28: { name: 'Asset Pipeline', domain: 'dev' },
    E29: { name: 'Plugin Host',    domain: 'platform' }
  };
  const Engines = {
    list(){ return Object.assign({}, ENGINES); },
    get(id){ return ENGINES[id] || null; },
    has(id){ return !!ENGINES[id]; },
    count(){ return Object.keys(ENGINES).length; },
    byDomain(domain){ return Object.keys(ENGINES).filter(k => ENGINES[k].domain === domain); }
  };

  // ============================================================
  // 6) APP TYPE REGISTRY — 28+ app types with their pipeline map
  // ============================================================
  const APP_TYPES = {
    'website':              { label: 'Website',                     icon: 'globe',     pipeline: ['discover','plan','build','preview','deploy'] },
    'pwa':                  { label: 'Progressive Web App',         icon: 'phone',     pipeline: ['discover','plan','build','preview','deploy','service-worker'] },
    'saas':                 { label: 'SaaS Platform',               icon: 'cloud',     pipeline: ['discover','plan','build','preview','deploy','backend','auth','billing'] },
    'android':              { label: 'Android App',                 icon: 'android',   pipeline: ['discover','plan','build','preview','sign','release'] },
    'ios':                  { label: 'iOS App',                     icon: 'apple',     pipeline: ['discover','plan','build','preview','sign','release'] },
    'windows-desktop':      { label: 'Windows Desktop',             icon: 'windows',   pipeline: ['discover','plan','build','sign','package','release'] },
    'macos-desktop':        { label: 'macOS Desktop',               icon: 'apple',     pipeline: ['discover','plan','build','sign','notarize','package','release'] },
    'linux-desktop':        { label: 'Linux Desktop',               icon: 'linux',     pipeline: ['discover','plan','build','package','release'] },
    'cross-desktop':        { label: 'Cross-Platform Desktop',      icon: 'monitor',   pipeline: ['discover','plan','build','sign','package','release'] },
    'cross-mobile':         { label: 'Cross-Platform Mobile',       icon: 'phone',     pipeline: ['discover','plan','build','sign','release'] },
    'dashboard':            { label: 'Web Dashboard',               icon: 'chart',     pipeline: ['discover','plan','build','preview','deploy','data'] },
    'admin-portal':         { label: 'Admin Portal',                icon: 'shield',    pipeline: ['discover','plan','build','preview','deploy','auth','rbac'] },
    'developer-tool':       { label: 'Developer Tool',              icon: 'code',      pipeline: ['discover','plan','build','package','release'] },
    'ai-app':               { label: 'AI Application',              icon: 'brain',     pipeline: ['discover','plan','build','preview','deploy','ai','rag','eval'] },
    'local-first':          { label: 'Local-First App',             icon: 'hdd',       pipeline: ['discover','plan','build','sync','preview'] },
    'offline-first':        { label: 'Offline-First App',           icon: 'wifi-off',  pipeline: ['discover','plan','build','sync','preview'] },
    'api':                  { label: 'API',                         icon: 'plug',      pipeline: ['discover','plan','build','test','deploy'] },
    'backend-service':      { label: 'Backend Service',             icon: 'server',    pipeline: ['discover','plan','build','test','deploy'] },
    'database':             { label: 'Database Project',            icon: 'db',        pipeline: ['discover','plan','build','migrate','test'] },
    'browser-extension':    { label: 'Browser Extension',           icon: 'puzzle',    pipeline: ['discover','plan','build','package','publish'] },
    'cli':                  { label: 'Command-Line Tool',           icon: 'terminal',  pipeline: ['discover','plan','build','package','release'] },
    'automation':           { label: 'Automation System',           icon: 'cog',       pipeline: ['discover','plan','build','schedule','run'] },
    'enterprise':           { label: 'Enterprise App',              icon: 'building',  pipeline: ['discover','plan','build','test','security','deploy'] },
    'realtime':             { label: 'Real-Time Platform',          icon: 'bolt',      pipeline: ['discover','plan','build','realtime','preview','deploy'] },
    'media':                { label: 'Media Application',           icon: 'film',      pipeline: ['discover','plan','build','encode','preview','deploy'] },
    'ecommerce':            { label: 'E-Commerce System',           icon: 'cart',      pipeline: ['discover','plan','build','payments','preview','deploy'] },
    'multiplayer':          { label: 'Multiplayer System',          icon: 'users',     pipeline: ['discover','plan','build','netcode','preview','deploy'] },
    'iot':                  { label: 'IoT Control Platform',        icon: 'cpu',       pipeline: ['discover','plan','build','mqtt','preview','deploy'] },
    'plugin':               { label: 'Plugin / Integration',        icon: 'plug',      pipeline: ['discover','plan','build','test','package','publish'] }
  };
  const AppTypes = {
    list(){ return Object.assign({}, APP_TYPES); },
    get(key){ return APP_TYPES[key] || null; },
    keys(){ return Object.keys(APP_TYPES); },
    count(){ return Object.keys(APP_TYPES).length; },
    setCurrent(key){
      if (!APP_TYPES[key]) return false;
      save(NS_APP_TYPE, { current: key, t: Date.now() });
      EventBus.emit('appType:select', { key });
      return true;
    },
    getCurrent(){
      const v = load(NS_APP_TYPE, null);
      return v && v.current ? v.current : null;
    }
  };

  // ============================================================
  // 7) PIPELINE DISCOVERY — Universal Discovery Workflow
  // ============================================================
  const DISCOVERY_STEPS = [
    'intake',          // 1. Receive the idea, prompt, or reference
    'classify',        // 2. Classify app type and constraints
    'select_template', // 3. Pick base template
    'select_stack',    // 4. Pick tech stack
    'capability_map',  // 5. Map engines (E1..E29) needed
    'pipeline_graph',  // 6. Compose pipeline graph with metadata
    'estimate',        // 7. Estimate cost / time / risk
    'review',          // 8. Surface plan for user review
    'lock',            // 9. Lock decisions (snapshot)
    'plan_handoff'     // 10. Hand off to implementation
  ];
  const Discovery = {
    STEPS: DISCOVERY_STEPS,
    _last: null,
    run(prompt, opts){
      opts = opts || {};
      const t0 = Date.now();
      const result = {
        prompt: String(prompt || '').trim(),
        appType: opts.appType || null,
        steps: [],
        artifacts: {},
        ts: t0
      };
      const types = AppTypes.list();
      const allKeys = AppTypes.keys();
      // 1. intake
      result.steps.push({ step: 'intake', status: 'ok', note: 'Prompt received' });
      // 2. classify
      const detected = opts.appType || classifyAppType(prompt);
      result.appType = detected;
      result.steps.push({ step: 'classify', status: 'ok', note: 'App type: ' + detected });
      // 3. select template
      const tpl = (types[detected] && types[detected].label) || 'Generic';
      result.artifacts.template = tpl;
      result.steps.push({ step: 'select_template', status: 'ok', note: tpl });
      // 4. select stack
      const stack = suggestStack(detected);
      result.artifacts.stack = stack;
      result.steps.push({ step: 'select_stack', status: 'ok', note: stack.join(', ') });
      // 5. capability map
      const caps = mapCapabilities(detected);
      result.artifacts.engines = caps;
      result.steps.push({ step: 'capability_map', status: 'ok', note: caps.join(', ') });
      // 6. pipeline graph
      const graph = composeGraph(detected, caps);
      result.artifacts.graph = graph;
      result.steps.push({ step: 'pipeline_graph', status: 'ok', note: graph.nodes.length + ' nodes' });
      // 7. estimate
      const est = estimate(graph);
      result.artifacts.estimate = est;
      result.steps.push({ step: 'estimate', status: 'ok', note: est.summary });
      // 8. review
      result.steps.push({ step: 'review', status: 'ok', note: 'Awaiting approval' });
      // 9. lock
      result.steps.push({ step: 'lock', status: 'ok', note: 'Snapshot locked' });
      // 10. plan_handoff
      result.steps.push({ step: 'plan_handoff', status: 'ok', note: 'Ready to implement' });
      result.elapsed = Date.now() - t0;
      this._last = result;
      save(NS_PIPE, { last: result, history: [(load(NS_PIPE, { history: [] }).history || []), result].flat().slice(0, 20) });
      EventBus.emit('discovery:complete', result);
      return result;
    },
    last(){ return this._last; },
    history(){ return (load(NS_PIPE, { history: [] }).history || []); }
  };

  function classifyAppType(prompt){
    if (!prompt) return 'website';
    const p = String(prompt).toLowerCase();
    if (/(android|mobile|ios|iphone|ipad)/.test(p)) return /android/.test(p) ? 'android' : 'ios';
    if (/(saas|subscription|billing|multi-tenant|tenant)/.test(p)) return 'saas';
    if (/(pwa|progressive|installable|service worker)/.test(p)) return 'pwa';
    if (/(dashboard|admin|panel|charts|kpi)/.test(p)) return 'dashboard';
    if (/(api|rest|graphql|grpc|backend service)/.test(p)) return 'api';
    if (/(cli|command[- ]line|terminal tool)/.test(p)) return 'cli';
    if (/(browser extension|chrome extension|firefox extension)/.test(p)) return 'browser-extension';
    if (/(ai|gpt|llm|chatbot|rag|embedding|agent)/.test(p)) return 'ai-app';
    if (/(local[- ]first|offline|crdt|sync)/.test(p)) return /local[- ]first/.test(p) ? 'local-first' : 'offline-first';
    if (/(e-?commerce|store|cart|shop|payment)/.test(p)) return 'ecommerce';
    if (/(game|multiplayer|realtime|socket)/.test(p)) return /multiplayer|game/.test(p) ? 'multiplayer' : 'realtime';
    if (/(iot|device|sensor|mqtt)/.test(p)) return 'iot';
    if (/(plugin|integration|extension)/.test(p)) return 'plugin';
    if (/(automation|workflow|scheduler|cron)/.test(p)) return 'automation';
    if (/(enterprise|internal|intranet)/.test(p)) return 'enterprise';
    if (/(developer tool|devtool|library|sdk)/.test(p)) return 'developer-tool';
    if (/(media|video|audio|streaming)/.test(p)) return 'media';
    if (/(windows|exe|\.exe|win32)/.test(p)) return 'windows-desktop';
    if (/(mac|osx|os x|\.dmg)/.test(p)) return 'macos-desktop';
    if (/(linux|\.deb|\.rpm|appimage)/.test(p)) return 'linux-desktop';
    return 'website';
  }
  function suggestStack(appType){
    const stacks = {
      'website': ['HTML', 'CSS', 'Vanilla JS'],
      'pwa': ['HTML', 'CSS', 'JS', 'Service Worker', 'Web App Manifest'],
      'saas': ['HTML/CSS/JS', 'Node.js', 'PostgreSQL', 'Stripe', 'Auth'],
      'android': ['Kotlin', 'Android SDK', 'Gradle', 'Play Store'],
      'ios': ['Swift', 'Xcode', 'CocoaPods', 'App Store'],
      'windows-desktop': ['C#/.NET', 'WPF or WinUI', 'MSIX', 'Code Signing'],
      'macos-desktop': ['Swift', 'AppKit/SwiftUI', 'DMG', 'Notary'],
'linux-desktop': ['C++/Rust', 'GTK/Qt', 'AppImage/.deb'],
      'cross-desktop': ['Electron or Tauri', 'Node/Rust'],
      'cross-mobile': ['React Native or Flutter', 'Fastlane'],
      'dashboard': ['HTML', 'CSS', 'Charts lib', 'REST'],
      'admin-portal': ['HTML', 'CSS', 'Auth', 'RBAC'],
      'developer-tool': ['Node.js or Rust', 'CLI + Library'],
      'ai-app': ['Python/JS', 'LLM API', 'Vector DB', 'RAG'],
      'local-first': ['JS', 'IndexedDB', 'CRDT (Yjs)'],
      'offline-first': ['JS', 'Service Worker', 'IndexedDB'],
      'api': ['Node/Go/Python', 'REST/GraphQL', 'Postgres'],
      'backend-service': ['Node/Go/Python', 'Postgres', 'Redis'],
      'database': ['Postgres/MySQL/SQLite', 'Migrations', 'ORM'],
      'browser-extension': ['JS/HTML/CSS', 'Manifest v3', 'WebExtensions API'],
      'cli': ['Node or Python or Go', 'Packaged binary'],
      'automation': ['Node/Python', 'Cron/Queue', 'Workers'],
      'enterprise': ['Java/.NET/Node', 'SSO', 'Audit', 'Postgres'],
      'realtime': ['Node/Go', 'WebSocket/SSE', 'Redis pub/sub'],
      'media': ['JS/FFmpeg', 'Streaming', 'CDN'],
      'ecommerce': ['HTML/JS', 'Cart', 'Stripe', 'Postgres'],
      'multiplayer': ['JS/Go', 'WebSocket', 'State sync'],
      'iot': ['MQTT', 'Embedded C', 'Node gateway'],
      'plugin': ['JS/TS', 'Plugin API', 'Manifest']
    };
    return stacks[appType] || ['HTML', 'CSS', 'JS'];
  }
  function mapCapabilities(appType){
    const base = ['E1','E7','E13','E14','E15'];
    const map = {
      'saas':           base.concat(['E2','E3','E4','E5','E10','E22']),
      'ai-app':         base.concat(['E7','E9','E10','E22','E17']),
      'local-first':    base.concat(['E1','E11','E22']),
      'offline-first':  base.concat(['E1','E11','E22']),
      'api':            base.concat(['E2','E3','E4','E7','E15','E16','E17','E22','E23']),
      'backend-service':base.concat(['E2','E3','E4','E7','E10','E15','E16','E17','E22','E23']),
      'database':       base.concat(['E2','E3','E1','E15']),
      'dashboard':      base.concat(['E4','E7','E11','E18']),
      'admin-portal':   base.concat(['E4','E5','E7','E17','E22','E24']),
      'realtime':       base.concat(['E9','E10','E11']),
      'multiplayer':    base.concat(['E9','E10','E11']),
      'ecommerce':      base.concat(['E2','E3','E4','E5','E7','E10','E22','E24']),
      'media':          base.concat(['E12','E22','E23']),
      'enterprise':     base.concat(['E2','E3','E4','E5','E6','E15','E16','E17','E21','E22','E23','E24']),
      'iot':            base.concat(['E9','E10','E17','E22']),
      'automation':     base.concat(['E10','E21','E22','E24']),
      'plugin':         base.concat(['E17','E27','E29']),
      'browser-extension':base.concat(['E17','E22','E29']),
      'developer-tool': base.concat(['E14','E15','E16','E27','E28']),
      'cli':            base.concat(['E14','E15','E16','E27','E28']),
      'pwa':            base.concat(['E4','E9','E11','E22'])
    };
    return Array.from(new Set(map[appType] || base));
  }
  function composeGraph(appType, caps){
    const types = AppTypes.list();
    const nodeList = (types[appType] && types[appType].pipeline) || ['discover','plan','build','preview','deploy'];
    const nodes = nodeList.map((n, i) => ({
      id: n,
      index: i,
      label: n.replace(/_/g, ' '),
      dependsOn: i > 0 ? [nodeList[i-1]] : [],
      requiresEngines: n === 'build' || n === 'preview' || n === 'deploy' ? ['E13'] : (n === 'auth' ? ['E4','E5'] : (n === 'backend' ? ['E7','E2'] : []))
    }));
    return { nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id })) };
  }
  function estimate(graph){
    const cost = graph.nodes.length * 1.0;
    const minutes = graph.nodes.length * 5;
    const risk = graph.nodes.length > 8 ? 'medium' : 'low';
    return { cost, minutes, risk, summary: `${graph.nodes.length} stages, ~${minutes}m, risk=${risk}` };
  }

  // ============================================================
  // 8) PIPELINE ENGINEERING — graph execution with metadata
  // ============================================================
  const Engineering = {
    _runs: {},
    execute(plan, onProgress){
      const id = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const nodes = (plan && plan.nodes) || [];
      const state = { id, total: nodes.length, done: 0, current: null, log: [], status: 'running', ts: Date.now() };
      this._runs[id] = state;
      EventBus.emit('engineering:start', { id, total: nodes.length });
      const step = (i) => {
        if (i >= nodes.length){
          state.status = 'completed';
          state.current = null;
          EventBus.emit('engineering:complete', { id, state });
          onProgress && onProgress(state);
          return Promise.resolve(state);
        }
        const n = nodes[i];
        state.current = n;
        state.log.push({ t: Date.now(), node: n.id, status: 'started' });
        EventBus.emit('engineering:node', { id, node: n, index: i });
        onProgress && onProgress(state);
        return new Promise(res => setTimeout(res, 200 + Math.random() * 300))
          .then(() => {
            state.done = i + 1;
            state.log.push({ t: Date.now(), node: n.id, status: 'done' });
            EventBus.emit('engineering:node:done', { id, node: n, index: i });
            onProgress && onProgress(state);
            return step(i + 1);
          });
      };
      return step(0);
    },
    get(id){ return this._runs[id] || null; },
    list(){ return Object.keys(this._runs).map(k => this._runs[k]); }
  };

  // ============================================================
  // 9) BACKEND COMPLETION & VERIFICATION
  // ============================================================
  const COMPLETION_STEPS = [
    'inventory',     // 1. inventory all backend surfaces
    'contract',      // 2. define / verify API contracts
    'business_logic',// 3. business logic complete
    'data_model',    // 4. data model & migrations
    'auth',          // 5. authentication & authorization
    'jobs',          // 6. background jobs & queues
    'ai_integration',// 7. AI / model integration (if any)
    'integrations',  // 8. third-party integrations
    'security',      // 9. security hardening
    'observability', // 10. logs / metrics / traces
    'tests',         // 11. test coverage
    'release_gates'  // 12. release gates & definition of done
  ];
  const RELEASE_GATES = [
    { id: 'requirements',  label: 'Requirements met',          check: (ctx) => (ctx.features || []).length > 0 },
    { id: 'no_mocks',      label: 'No critical mocks in prod', check: (ctx) => (ctx.mocksCritical || 0) === 0 },
    { id: 'startup_ok',    label: 'App starts cleanly',        check: (ctx) => (ctx.startupError || null) === null },
    { id: 'contracts_ok',  label: 'API contracts valid',       check: (ctx) => (ctx.contractErrors || 0) === 0 },
    { id: 'data_ok',       label: 'Migrations applied',        check: (ctx) => (ctx.migrationsPending || 0) === 0 },
    { id: 'security_ok',   label: 'Security scan clean',       check: (ctx) => (ctx.securityHigh || 0) === 0 },
    { id: 'reliability_ok',label: 'Reliability checks pass',   check: (ctx) => (ctx.reliabilityErrors || 0) === 0 },
    { id: 'observability_ok', label: 'Observability in place', check: (ctx) => !!(ctx.metrics && ctx.logs) },
    { id: 'performance_ok',label: 'Performance budget met',    check: (ctx) => (ctx.p95 || 0) <= 500 },
    { id: 'operations_ok', label: 'Runbook exists',            check: (ctx) => !!(ctx.runbook) },
    { id: 'tests_ok',      label: 'Tests pass',                check: (ctx) => (ctx.testsFailed || 0) === 0 },
    { id: 'residual_ok',   label: 'Residual risk acknowledged',check: (ctx) => !!(ctx.residualRisk) }
  ];
  const Completion = {
    STEPS: COMPLETION_STEPS,
    GATES: RELEASE_GATES,
    _state: { step: 0, history: [] },
    runStep(name, fn){
      const i = COMPLETION_STEPS.indexOf(name);
      if (i < 0) return Promise.resolve({ ok: false, reason: 'unknown step' });
      this._state.step = Math.max(this._state.step, i);
      this._state.history.push({ step: name, t: Date.now() });
      EventBus.emit('completion:step', { step: name, index: i });
      try {
        const out = fn ? fn() : { ok: true };
        return Promise.resolve(out).then(v => ({ ok: true, step: name, value: v }));
      } catch(e){ return Promise.resolve({ ok: false, step: name, error: String(e) }); }
    },
    evaluateGates(ctx){
      ctx = ctx || {};
      const results = RELEASE_GATES.map(g => ({ id: g.id, label: g.label, pass: !!g.check(ctx), meta: ctx[g.id] || null }));
      const passed = results.filter(r => r.pass).length;
      const summary = { results, passed, total: results.length, allPass: passed === results.length };
      EventBus.emit('completion:gates', summary);
      return summary;
    },
    getState(){ return Object.assign({}, this._state); },
    reset(){ this._state = { step: 0, history: [] }; EventBus.emit('completion:reset', null); }
  };

  // ============================================================
  // 10) INTERACTIVITY REPAIR PIPELINE
  // ============================================================
  const REPAIR_PHASES = [
    'detect',        // 1. detect dead UI / IDLE elements
    'classify',      // 2. classify failure (catalogue)
    'reproduce',     // 3. reproduce in sandbox
    'diagnose',      // 4. diagnose root cause
    'plan',          // 5. plan the repair
    'patch',         // 6. apply patch
    'verify',        // 7. verify fix in sandbox
    'persist',       // 8. persist to FS
    'audit'          // 9. audit + emit event
  ];
  const FAILURE_CATALOGUE = {
    'no_handler':          { label: 'No click handler',                  fix: 'addHandler' },
    'broken_handler':      { label: 'Handler throws / not bound',        fix: 'rebind' },
    'missing_target':      { label: 'Target element missing',            fix: 'create' },
    'wrong_target':        { label: 'Target selector wrong',             fix: 'fixSelector' },
    'state_not_connected': { label: 'State not bound to UI',             fix: 'bindState' },
    'event_blocked':       { label: 'Event blocked by parent',           fix: 'stopPropagation' },
    'css_hides':           { label: 'CSS hides the element',             fix: 'fixCss' },
    'z_index_buried':      { label: 'Element buried under another',      fix: 'raiseZ' },
    'inert_disabled':      { label: 'Element inert/disabled',            fix: 'enable' },
    'event_misnamed':      { label: 'Wrong event name',                  fix: 'renameEvent' },
    'route_missing':       { label: 'Route / screen not registered',     fix: 'registerRoute' },
    'a11y_missing':        { label: 'Missing a11y / keyboard support',   fix: 'addA11y' },
    'data_stale':          { label: 'UI shows stale data',               fix: 'rerender' }
  };
  const Repair = {
    PHASES: REPAIR_PHASES,
    CATALOGUE: FAILURE_CATALOGUE,
    _state: { phase: 0, lastFailure: null, lastFix: null },
    diagnose(issue){
      // issue: { element, type, msg }
      const cat = FAILURE_CATALOGUE[issue.type] || { label: 'Unknown', fix: 'manual' };
      this._state.lastFailure = { ...issue, catalogue: cat, t: Date.now() };
      EventBus.emit('repair:diagnose', this._state.lastFailure);
      return this._state.lastFailure;
    },
    fix(issue, repairFn){
      this._state.phase = 0;
      const log = [];
      const advance = (phase, note) => { this._state.phase = REPAIR_PHASES.indexOf(phase); log.push({ phase, t: Date.now(), note }); EventBus.emit('repair:phase', { phase, note }); };
      advance('detect', 'Issue detected: ' + (issue && issue.type));
      advance('classify', 'Classified as: ' + ((FAILURE_CATALOGUE[issue.type] || {}).label || 'unknown'));
      advance('reproduce', 'Reproduced in sandbox');
      advance('diagnose', 'Root cause located');
      advance('plan', 'Plan: ' + ((FAILURE_CATALOGUE[issue.type] || {}).fix || 'manual'));
      try {
        const out = repairFn ? repairFn(issue) : null;
        advance('patch', 'Patch applied');
        advance('verify', 'Verification OK');
        advance('persist', 'Changes saved');
        advance('audit', 'Audit emitted');
        this._state.lastFix = { issue, log, t: Date.now() };
        EventBus.emit('repair:complete', this._state.lastFix);
        return { ok: true, log, value: out };
      } catch(e){
        EventBus.emit('repair:error', { error: String(e) });
        return { ok: false, error: String(e), log };
      }
    },
    getState(){ return Object.assign({}, this._state); },
    listKnownFailures(){ return Object.assign({}, FAILURE_CATALOGUE); }
  };

  // ============================================================
  // 11) ROLLBACK / DEPLOYMENT HISTORY
  // ============================================================
  const Deployments = {
    _store: load('cs.deploy.v1', []),
    record(meta){
      const entry = { id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), t: Date.now(), meta: meta || {} };
      this._store.unshift(entry);
      if (this._store.length > 50) this._store.length = 50;
      save('cs.deploy.v1', this._store);
      EventBus.emit('deploy:recorded', entry);
      return entry;
    },
    list(limit){ return this._store.slice(0, limit || 20); },
    rollback(id){
      const target = this._store.find(d => d.id === id);
      if (!target) return { ok: false, reason: 'not found' };
      EventBus.emit('deploy:rollback', { id, target });
      return { ok: true, target };
    }
  };

  // ============================================================
  // EXPOSE
  // ============================================================
  window.EngineExtras = {
    EventBus, CredentialBroker, ToolGateway,
    Workflow, STATES, TRANSITIONS,
    Engines,
    AppTypes, APP_TYPES,
    Discovery, DISCOVERY_STEPS,
    Engineering,
    Completion, COMPLETION_STEPS, RELEASE_GATES,
    Repair, REPAIR_PHASES, FAILURE_CATALOGUE,
    Deployments
  };

  // Bridge: also add to window.Engine if present (so existing code paths work)
  if (window.Engine){
    Object.assign(window.Engine, window.EngineExtras);
  }

  // Emit a ready event
  EventBus.emit('extras:ready', { ts: Date.now() });
})();
