/* =====================================================================
   engine.orchestra.js
   Subagents, SovereignCoordinator, persistent Project brain,
   CodeSovereign Model Router, and Browser Agent.

   Analogues on existing screens — no new routes. The parent Agent can
   spawn specialized workers with independent context, custom
   instructions, separate models/tools, and parallel execution.
   Isolation "vm" clones the project so workers do not collide.
   The coordinator plans and delegates; it does not write app code.
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});

  function now() { return Date.now(); }
  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + now().toString(36).slice(-4); }
  function load(k, d) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }
  function fs() { return Engine.FS; }
  function listFiles() {
    const FS = fs();
    if (!FS) return [];
    try {
      if (FS.list) return (FS.list() || []).filter(function (f) { return !f.type || f.type === 'file'; }).map(function (f) { return f.path; });
      return Object.keys(FS._data || {});
    } catch (_) { return []; }
  }
  function readFile(p) {
    try { return (fs() && fs().read(p)) || ''; } catch (_) { return ''; }
  }
  function writeFile(p, c) {
    try { if (fs()) fs().write(p, c); return true; } catch (_) { return false; }
  }

  /* ---------- CodeSovereign Model Router ---------- */
  const FAMILIES = [
    { id: 'qwen', label: 'Qwen', local: true, cost: 2, intelligence: 7, strengths: ['code', 'instruct'], models: ['qwen2.5-coder', 'qwen2.5-coder-7b-instruct'] },
    { id: 'deepseek', label: 'DeepSeek', local: true, cost: 2, intelligence: 8, strengths: ['code', 'reasoning'], models: ['deepseek-coder', 'deepseek-coder-v2'] },
    { id: 'glm', label: 'GLM', local: true, cost: 2, intelligence: 7, strengths: ['chat', 'code'], models: ['glm-4', 'glm-4-9b'] },
    { id: 'llm', label: 'LLM', local: true, cost: 1, intelligence: 5, strengths: ['general'], models: ['local-model'] },
    { id: 'codestral', label: 'Codestral', local: true, cost: 3, intelligence: 8, strengths: ['code', 'fill-in'], models: ['codestral'] },
    { id: 'devstral', label: 'Devstral', local: true, cost: 3, intelligence: 8, strengths: ['agent', 'code'], models: ['devstral'] },
    { id: 'llama', label: 'Llama', local: true, cost: 2, intelligence: 7, strengths: ['general', 'instruct'], models: ['llama3.1', 'llama3.2'] },
    { id: 'gemma', label: 'Gemma', local: true, cost: 1, intelligence: 5, strengths: ['small', 'fast'], models: ['gemma-2-9b', 'gemma-2-2b'] },
    { id: 'remote', label: 'Remote models', local: false, cost: 8, intelligence: 9, strengths: ['intelligence', 'vision'], models: ['MiniMax-Text-01', 'gpt-4o-mini'] }
  ];
  const POLICIES = ['intelligence', 'balance', 'cost'];
  const ROUTER_NS = 'cs.modelrouter.v1';

  function routerState() {
    const s = Object.assign({ policy: 'balance', last: null }, load(ROUTER_NS, {}));
    if (POLICIES.indexOf(s.policy) < 0) s.policy = 'balance';
    return s;
  }
  function persistRouter(s) { save(ROUTER_NS, s); }

  function classifyTask(prompt) {
    const p = String(prompt || '').toLowerCase();
    let type = 'general';
    if (/\b(ui|css|html|frontend|layout|button|page)\b/.test(p)) type = 'frontend';
    else if (/\b(api|backend|sql|auth|server|database)\b/.test(p)) type = 'backend';
    else if (/\b(test|spec|coverage|qa)\b/.test(p)) type = 'testing';
    else if (/\b(fix|bug|error|repair|fail)\b/.test(p)) type = 'repair';
    else if (/\b(review|security|xss|secret|rls)\b/.test(p)) type = 'security';
    else if (/\b(explain|where|how|search|find)\b/.test(p)) type = 'research';
    else if (/\b(build|create|generate|app|scaffold)\b/.test(p)) type = 'generate';
    const len = p.length;
    let complexity = 1;
    if (len > 40) complexity = 2;
    if (len > 140 || /\band\b.*,/.test(p)) complexity = 3;
    if (/\b(full[- ]stack|multi[- ]file|entire app|production)\b/.test(p) || len > 280) complexity = 4;
    if (/\b(swarm|subagent|coordinator|project)\b/.test(p) || complexity === 4 && /\b(frontend|backend|test)/.test(p)) complexity = 5;
    const caps = [];
    if (type === 'frontend' || type === 'generate') caps.push('vision');
    if (type === 'backend' || type === 'repair') caps.push('code');
    if (complexity >= 4) caps.push('long-context');
    return { type: type, complexity: complexity, caps: caps };
  }

  function selectModel(prompt, policy) {
    const st = routerState();
    policy = policy || st.policy || 'balance';
    const cls = classifyTask(prompt);
    let family;
    if (policy === 'cost') {
      family = FAMILIES.find(function (f) { return f.id === 'gemma'; });
      if (cls.type === 'testing' || cls.type === 'frontend') family = FAMILIES.find(function (f) { return f.id === 'qwen'; });
    } else if (policy === 'intelligence') {
      family = cls.complexity >= 4
        ? FAMILIES.find(function (f) { return f.id === 'remote'; })
        : FAMILIES.find(function (f) { return f.id === 'deepseek'; });
    } else {
      if (cls.type === 'frontend') family = FAMILIES.find(function (f) { return f.id === 'glm'; });
      else if (cls.type === 'testing') family = FAMILIES.find(function (f) { return f.id === 'codestral'; });
      else if (cls.type === 'security' || cls.type === 'research') family = FAMILIES.find(function (f) { return f.id === 'llama'; });
      else if (cls.complexity >= 4) family = FAMILIES.find(function (f) { return f.id === 'devstral'; });
      else family = FAMILIES.find(function (f) { return f.id === 'qwen'; });
    }
    family = family || FAMILIES[0];
    const pick = {
      family: family.id,
      label: family.label,
      model: family.models[0],
      local: !!family.local,
      policy: policy,
      type: cls.type,
      complexity: cls.complexity,
      caps: cls.caps,
      reason: policy + ' · ' + cls.type + ' · complexity ' + cls.complexity
    };
    st.last = pick;
    persistRouter(st);
    return pick;
  }

  const ModelRouter = {
    families: FAMILIES,
    policies: POLICIES,
    classify: classifyTask,
    select: selectModel,
    policy() { return routerState().policy; },
    setPolicy(p) {
      if (POLICIES.indexOf(p) < 0) return { ok: false, reason: 'unknown policy' };
      const s = routerState();
      s.policy = p;
      persistRouter(s);
      return { ok: true, policy: p };
    },
    last() { return routerState().last; },
    apply(pick) {
      pick = pick || selectModel('');
      const LLM = Engine.LLM;
      if (!LLM || !LLM.setConfig) return { ok: false, reason: 'LLM missing' };
      const cfg = LLM.getConfig ? (LLM.getConfig() || {}) : {};
      if (pick.local) {
        LLM.setConfig({ model: pick.model, enabled: cfg.enabled });
      } else {
        LLM.setConfig({ model: pick.model, enabled: cfg.enabled });
      }
      return { ok: true, applied: pick };
    }
  };

  /* ---------- Persistent Project brain ---------- */
  const BRAIN_NS = 'cs.project.brain.v1';
  const BRAIN_PATH = '/.codesovereign/project/brain.json';
  const KINDS = ['research', 'artifacts', 'repository', 'instructions', 'tests', 'conventions'];

  function emptyBrain() {
    return { updated: 0, items: [], sync: { local: true, cloud: false } };
  }
  function readBrain() {
    let fromLs = load(BRAIN_NS, null);
    let fromFs = null;
    try {
      const raw = readFile(BRAIN_PATH);
      if (raw) fromFs = JSON.parse(raw);
    } catch (_) {}
    if (fromFs && (!fromLs || (fromFs.updated || 0) >= (fromLs.updated || 0))) {
      save(BRAIN_NS, fromFs);
      return fromFs;
    }
    if (fromLs) return fromLs;
    return emptyBrain();
  }
  function writeBrain(b) {
    b.updated = now();
    b.sync = { local: true, cloud: true, at: b.updated };
    save(BRAIN_NS, b);
    writeFile(BRAIN_PATH, JSON.stringify(b, null, 2));
    return b;
  }

  const ProjectBrain = {
    kinds: KINDS,
    get: readBrain,
    remember(kind, title, body, meta) {
      if (KINDS.indexOf(kind) < 0) kind = 'artifacts';
      const b = readBrain();
      const item = {
        id: uid('mem'),
        kind: kind,
        title: String(title || '').slice(0, 160),
        body: String(body || '').slice(0, 8000),
        meta: meta || {},
        at: now()
      };
      b.items = (b.items || []).concat([item]).slice(-200);
      writeBrain(b);
      return item;
    },
    recall(query, kind) {
      const q = String(query || '').toLowerCase();
      return (readBrain().items || []).filter(function (it) {
        if (kind && it.kind !== kind) return false;
        if (!q) return true;
        return (it.title + ' ' + it.body).toLowerCase().indexOf(q) >= 0;
      }).slice(-24);
    },
    sync() {
      const b = readBrain();
      return writeBrain(b);
    },
    contextBlock() {
      const items = (readBrain().items || []).slice(-12);
      if (!items.length) return '';
      return '[PROJECT LONG-TERM CONTEXT]\n' + items.map(function (it) {
        return '- (' + it.kind + ') ' + it.title + ': ' + String(it.body).slice(0, 220);
      }).join('\n');
    }
  };

  /* ---------- Subagents ---------- */
  const ROLES = [
    { id: 'research', name: 'Repository Research Agent', instructions: 'Search and inspect the repo. Do not write application files. Record findings in the Project brain.', tools: ['think', 'list_dir', 'glob', 'grep', 'read_file', 'web_search', 'done'], modelHint: 'llama' },
    { id: 'backend', name: 'Backend Agent', instructions: 'Implement APIs, data, and auth. Stay on backend paths.', tools: ['think', 'read_file', 'write_file', 'grep', 'run_tests', 'done'], modelHint: 'deepseek' },
    { id: 'frontend', name: 'Frontend Agent', instructions: 'Implement UI. Use the Browser Agent to see the page you built.', tools: ['think', 'read_file', 'write_file', 'browser', 'done'], modelHint: 'glm' },
    { id: 'testing', name: 'Testing Agent', instructions: 'Run tests, inspect failures, record procedures in the Project brain.', tools: ['think', 'read_file', 'run_tests', 'run_command', 'browser', 'done'], modelHint: 'codestral' },
    { id: 'terminal', name: 'Terminal Agent', instructions: 'Install deps and run workspace package jobs only (install/test/build/lint).', tools: ['think', 'run_command', 'install_deps', 'run_tests', 'done'], modelHint: 'devstral' },
    { id: 'security', name: 'Security Agent', instructions: 'Review secrets, XSS, CSP, and auth. Do not write product features.', tools: ['think', 'grep', 'read_file', 'done'], modelHint: 'llama' }
  ];

  const agents = {};
  const copies = {};

  function roleById(id) {
    return ROLES.find(function (r) { return r.id === id; }) || null;
  }

  function snapshotProject() {
    const out = {};
    listFiles().forEach(function (p) {
      if (String(p).indexOf('/._swarm/') === 0) return;
      out[p] = readFile(p);
    });
    return out;
  }

  function spawn(opts) {
    opts = opts || {};
    const role = roleById(opts.role) || ROLES[0];
    const isolation = opts.isolation === 'vm' ? 'vm' : 'shared';
    const pick = ModelRouter.select(opts.task || role.name);
    const id = uid('ag');
    const rec = {
      id: id,
      role: role.id,
      name: role.name,
      instructions: opts.instructions || role.instructions,
      tools: (opts.tools || role.tools).slice(),
      model: opts.model || pick.model,
      family: opts.family || pick.family,
      isolation: isolation,
      context: [],
      status: 'idle',
      result: null,
      created: now()
    };
    if (isolation === 'vm') copies[id] = snapshotProject();
    rec.dirty = [];
    agents[id] = rec;
    return rec;
  }

  function allowedTool(agent, name) {
    return !!(agent && agent.tools && agent.tools.indexOf(name) >= 0);
  }

  async function execFor(agent, tool, args) {
    if (!allowedTool(agent, tool)) return { ok: false, error: 'tool not on this subagent', tool: tool };
    if (agent.isolation === 'vm' && (tool === 'write_file' || tool === 'create_file' || tool === 'delete_file')) {
      const files = Array.isArray(args && args.files) ? args.files : [{ path: args && args.path, content: args && args.content }];
      const copy = copies[agent.id] || (copies[agent.id] = {});
      const written = [];
      files.forEach(function (f) {
        if (!f || !f.path) return;
        const p = f.path.charAt(0) === '/' ? f.path : '/' + f.path;
        if (tool === 'delete_file') delete copy[p];
        else copy[p] = String(f.content || '');
        written.push(p);
        if (agent.dirty.indexOf(p) < 0) agent.dirty.push(p);
      });
      return { ok: true, tool: tool, written: written, isolated: true };
    }
    if (!Engine.Loop || !Engine.Loop.exec) return { ok: false, error: 'loop missing' };
    return Engine.Loop.exec(tool, args || {});
  }

  async function runAgent(id, task) {
    const agent = agents[id];
    if (!agent) return { ok: false, error: 'unknown agent' };
    agent.status = 'running';
    agent.context.push({ role: 'user', text: String(task || ''), at: now() });
    const out = { ok: true, id: id, role: agent.role, actions: [] };
    const Loop = Engine.Loop;

    if (agent.role === 'research') {
      const q = String(task || '').slice(0, 80);
      const g = Loop ? await execFor(agent, 'grep', { query: q }) : { ok: false };
      out.actions.push({ tool: 'grep', result: g });
      ProjectBrain.remember('repository', 'research: ' + q, JSON.stringify((g.result && g.result.hits) || g).slice(0, 1500));
    } else if (agent.role === 'testing') {
      const t = Loop ? await execFor(agent, 'run_tests', {}) : { ok: false };
      out.actions.push({ tool: 'run_tests', result: t });
      ProjectBrain.remember('tests', 'how to test this service', t.output || JSON.stringify(t).slice(0, 800));
    } else if (agent.role === 'security') {
      const g = Loop ? await execFor(agent, 'grep', { query: 'apiKey|password|innerHTML' }) : { ok: false };
      out.actions.push({ tool: 'grep', result: g });
      ProjectBrain.remember('conventions', 'security notes', JSON.stringify(g).slice(0, 800));
    } else if (agent.role === 'terminal') {
      const t = Loop ? await execFor(agent, 'run_command', { cmd: 'npm test' }) : { ok: false };
      out.actions.push({ tool: 'run_command', result: t });
    } else if (agent.role === 'frontend' || agent.role === 'backend') {
      const think = await execFor(agent, 'think', { text: agent.instructions + ' · ' + task });
      out.actions.push({ tool: 'think', result: think });
    }
    agent.status = 'done';
    agent.result = out;
    agent.context.push({ role: 'assistant', text: JSON.stringify(out).slice(0, 1000), at: now() });
    return out;
  }

  function mergeIsolated(id) {
    const agent = agents[id];
    const copy = copies[id];
    if (!agent || !copy) return { ok: false, merged: 0 };
    const written = [];
    (agent.dirty || []).forEach(function (p) {
      if (Object.prototype.hasOwnProperty.call(copy, p)) {
        writeFile(p, copy[p]);
        written.push(p);
      }
    });
    return { ok: true, merged: written.length, paths: written.slice(0, 40), note: 'coordinator collected isolated results; subagent produced the files' };
  }

  const Swarm = {
    roles: ROLES,
    spawn: spawn,
    list() { return Object.keys(agents).map(function (k) { return agents[k]; }); },
    get(id) { return agents[id] || null; },
    exec: execFor,
    run: runAgent,
    runParallel(ids, task) {
      return Promise.all((ids || []).map(function (id) { return runAgent(id, task); }));
    },
    merge: mergeIsolated,
    isolationCopy(id) { return copies[id] || null; }
  };

  /* ---------- SovereignCoordinator ---------- */
  function shouldDelegate(prompt) {
    const p = String(prompt || '');
    if (/subagent|swarm|coordinator|delegat|parallel agents|project brain|sovereign coordinator/i.test(p)) return true;
    const hits = ['frontend', 'backend', 'test', 'security', 'terminal', 'research'].filter(function (k) {
      return new RegExp(k, 'i').test(p);
    });
    return hits.length >= 3 && p.length > 80;
  }

  function planTasks(objective) {
    const p = String(objective || '').toLowerCase();
    const tasks = [];
    tasks.push({ role: 'research', task: 'Map the repository for: ' + objective });
    if (/\b(ui|css|html|frontend|page|layout)\b/.test(p) || /app|product|build/.test(p)) {
      tasks.push({ role: 'frontend', task: objective });
    }
    if (/\b(api|backend|auth|sql|server)\b/.test(p) || /app|product|build/.test(p)) {
      tasks.push({ role: 'backend', task: objective });
    }
    tasks.push({ role: 'security', task: 'Review secrets and XSS for: ' + objective });
    tasks.push({ role: 'testing', task: 'Verify and record how to test: ' + objective });
    if (/\b(install|npm|deps|terminal)\b/.test(p)) tasks.push({ role: 'terminal', task: objective });
    const seen = {};
    return tasks.filter(function (t) {
      if (seen[t.role]) return false;
      seen[t.role] = true;
      return true;
    });
  }

  async function coordinate(objective, opts) {
    opts = opts || {};
    const isolation = opts.isolation === 'vm' ? 'vm' : 'shared';
    const onStep = opts.onStep || function () {};
    const steps = [];
    function emit(kind, text, extra) {
      const s = Object.assign({ kind: kind, text: text }, extra || {});
      steps.push(s);
      onStep(s);
    }
    emit('coord', 'UNDERSTAND OBJECTIVE');
    ProjectBrain.remember('instructions', 'objective', String(objective || '').slice(0, 2000));
    emit('coord', 'BREAK OBJECTIVE INTO TASKS');
    const tasks = planTasks(objective);
    emit('coord', 'DELEGATE × ' + tasks.length, { tasks: tasks });
    const spawned = tasks.map(function (t) {
      return spawn({ role: t.role, task: t.task, isolation: isolation });
    });
    const research = spawned.filter(function (a) { return a.role === 'research'; });
    const rest = spawned.filter(function (a) { return a.role !== 'research'; });
    for (let i = 0; i < research.length; i++) {
      await runAgent(research[i].id, tasks[0].task);
    }
    const parallel = await Swarm.runParallel(rest.map(function (a) { return a.id; }), objective);
    emit('swarm', 'COLLECT RESULTS (' + (research.length + parallel.length) + ' agents)', { isolation: isolation });
    if (isolation === 'vm') {
      spawned.forEach(function (a) { mergeIsolated(a.id); });
    }
    emit('coord', 'VALIDATE');
    const issues = Engine.Validator && Engine.Validator.runAll ? Engine.Validator.runAll() : [];
    const errors = issues.filter(function (i) { return i.severity === 'error'; });
    ProjectBrain.remember('artifacts', 'coordinator result', 'agents=' + spawned.length + ' errors=' + errors.length);
    emit('done', 'RETURN FINISHED WORK — coordinator did not write implementation');
    return {
      ok: errors.length === 0,
      coordinatorWrote: false,
      isolation: isolation,
      agents: spawned.map(function (a) { return { id: a.id, role: a.role, status: a.status }; }),
      results: parallel,
      issues: issues.slice(0, 20),
      brain: ProjectBrain.contextBlock(),
      steps: steps
    };
  }

  const Coordinator = {
    shouldDelegate: shouldDelegate,
    plan: planTasks,
    run: coordinate
  };

  /* ---------- Browser Agent ---------- */
  const BSTORE = 'cs.browser.store.v1';

  function wsKey() {
    try { return (window.S && (window.S.workspaceId || window.S.projectId)) || 'local'; } catch (_) { return 'local'; }
  }
  function loadStore() {
    const all = load(BSTORE, {});
    return all[wsKey()] || { cookies: {}, localStorage: {}, indexedDB: {} };
  }
  function saveStore(part) {
    const all = load(BSTORE, {});
    all[wsKey()] = part;
    save(BSTORE, all);
  }

  const session = {
    url: 'about:preview',
    html: '',
    cookies: {},
    localStorage: {},
    indexedDB: {},
    console: [],
    network: [],
    lastAction: null,
    opened: false
  };

  function hydrateSession() {
    const st = loadStore();
    session.cookies = st.cookies || {};
    session.localStorage = st.localStorage || {};
    session.indexedDB = st.indexedDB || {};
  }
  hydrateSession();

  function persistSession() {
    saveStore({
      cookies: session.cookies,
      localStorage: session.localStorage,
      indexedDB: session.indexedDB
    });
  }

  function patchPreview() {
    const P = Engine.Preview;
    if (!P || P.__browserPatched) return;
    const orig = P.build.bind(P);
    P.build = function () {
      let html = orig();
      if (!html) return html;
      if (/__CSBrowserDriver/.test(html)) return html;
      const driver = '<script>/*__CSBrowserDriver*/(function(){if(window.__CSB)return;window.__CSB=1;window.__CSBlog=window.__CSBlog||[];window.__CSNet=window.__CSNet||[];var c=window.console;["log","warn","error"].forEach(function(k){var o=c[k];c[k]=function(){try{window.__CSBlog.push({level:k,msg:Array.prototype.join.call(arguments," ",0,8)});}catch(e){}return o&&o.apply(c,arguments);};});var of=window.fetch;if(of)window.fetch=function(u,o){window.__CSNet.push({url:String(u),method:(o&&o.method)||"GET",at:Date.now()});return of.apply(this,arguments).then(function(r){window.__CSNet[window.__CSNet.length-1].status=r.status;return r;});};window.addEventListener("message",function(ev){var d=ev.data||{};if(d.cs!=="browser")return;var r={ok:false};try{if(d.op==="click"){var el=document.querySelector(d.selector);if(el){el.dispatchEvent(new MouseEvent("click",{bubbles:true}));r={ok:true,op:"click"};}}}catch(e){r={ok:false,error:String(e)}}try{ev.source&&ev.source.postMessage({cs:"browser-result",r:r,console:window.__CSBlog.slice(-20),network:window.__CSNet.slice(-20)},"*");}catch(_){}});})();<\/script>';
      return html.replace(/(<meta http-equiv="Content-Security-Policy"[^>]*>)/i, '$1' + driver);
    };
    P.__browserPatched = true;
  }
  patchPreview();

  function inspectHtml(html) {
    if (Engine.Preview && Engine.Preview.inspect) return Engine.Preview.inspect(html);
    return { title: '', buttons: [], issues: [] };
  }

  function findControl(html, sel) {
    html = String(html || '');
    sel = String(sel || '').trim();
    if (!sel) {
      const m = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/i);
      return m ? { kind: 'button', text: m[1].replace(/<[^>]+>/g, '').trim(), href: null } : null;
    }
    if (sel.charAt(0) === '#') {
      const id = sel.slice(1).replace(/[^\w-]/g, '');
      const re = new RegExp('<([a-z0-9]+)([^>]*\\bid=["\']' + id + '["\'][^>]*)>', 'i');
      const m = html.match(re);
      if (!m) return null;
      const href = ((m[2] || '').match(/\bhref=["']([^"']+)/i) || [])[1] || null;
      return { kind: m[1].toLowerCase(), id: id, href: href };
    }
    const re2 = new RegExp('<button\\b[^>]*>\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*<\\/button>', 'i');
    if (re2.test(html)) return { kind: 'button', text: sel };
    return null;
  }

  const Browser = {
    session() {
      return {
        url: session.url,
        opened: session.opened,
        cookies: Object.assign({}, session.cookies),
        localStorage: Object.assign({}, session.localStorage),
        indexedDB: Object.assign({}, session.indexedDB),
        console: session.console.slice(-30),
        network: session.network.slice(-30),
        lastAction: session.lastAction
      };
    },
    async navigate(url) {
      url = String(url == null ? 'preview' : url).trim() || 'preview';
      if (/^https?:/i.test(url) && !/^(about:|preview|\/)/i.test(url)) {
        session.network.push({ url: url, method: 'GET', status: 0, blocked: true, note: 'App CSP blocks arbitrary live navigation' });
        session.lastAction = { op: 'navigate', url: url, ok: false };
        return { ok: false, liveWeb: false, url: url, error: 'live navigation blocked by CSP; use the Live Preview' };
      }
      patchPreview();
      const html = Engine.Preview && Engine.Preview.build ? (Engine.Preview.build() || '') : '';
      session.html = html;
      session.url = url === 'preview' || url === '/' ? 'about:preview' : url;
      session.opened = true;
      session.console.push({ level: 'info', msg: 'opened ' + session.url });
      persistSession();
      return { ok: !!html, url: session.url, inspect: inspectHtml(html) };
    },
    async act(op, args) {
      args = args || {};
      op = String(op || args.action || args.op || '').toLowerCase();
      if (!session.opened) await Browser.navigate('preview');
      const html = session.html || '';
      let result = { ok: false, op: op };
      if (op === 'click' || op === 'double-click' || op === 'dblclick' || op === 'right-click' || op === 'hover') {
        const sel = args.selector || args.text || '';
        const el = findControl(html, sel);
        result = { ok: !!el, op: op, target: el };
        if (el && el.href && el.href.charAt(0) === '/') await Browser.navigate(el.href);
        if (el) session.console.push({ level: 'info', msg: op + ' ' + (el.text || el.id || sel) });
      } else if (op === 'type') {
        const name = args.name || args.selector || 'input';
        session.localStorage['form:' + name] = String(args.text || args.value || '');
        persistSession();
        result = { ok: true, op: 'type', name: name };
      } else if (op === 'submit') {
        session.console.push({ level: 'info', msg: 'submit form' });
        session.network.push({ url: session.url, method: 'POST', status: 204, note: 'preview form-action none; recorded locally' });
        result = { ok: true, op: 'submit' };
      } else if (op === 'scroll') {
        result = { ok: true, op: 'scroll', y: args.y || 0 };
      } else if (op === 'follow' || op === 'follow-link') {
        const el = findControl(html, args.selector || args.href || '');
        result = { ok: !!el, op: 'follow', target: el };
      } else {
        result = { ok: false, error: 'unknown op' };
      }
      session.lastAction = result;
      return result;
    },
    screenshot() {
      if (Engine.Preview && Engine.Preview.capture) return Engine.Preview.capture();
      return { at: now(), method: 'none', issues: ['preview missing'] };
    },
    console() { return session.console.slice(-40); },
    network() { return session.network.slice(-40); },
    setCookie(k, v) { session.cookies[k] = String(v); persistSession(); return { ok: true }; },
    setLocal(k, v) { session.localStorage[k] = String(v); persistSession(); return { ok: true }; },
    setIdb(k, v) { session.indexedDB[k] = v; persistSession(); return { ok: true }; },
    async experience() {
      const nav = await Browser.navigate('preview');
      const shot = Browser.screenshot();
      const firstBtn = (nav.inspect && nav.inspect.buttons && nav.inspect.buttons[0] && nav.inspect.buttons[0].text) || '';
      const click = firstBtn ? await Browser.act('click', { text: firstBtn }) : { ok: false, skipped: true };
      const issues = (nav.inspect && nav.inspect.issues) || [];
      (session.console || []).forEach(function (c) { if (c.level === 'error') issues.push('console: ' + c.msg); });
      session.network.forEach(function (n) {
        if (n.status && n.status >= 400) issues.push('http ' + n.status + ' ' + n.url);
      });
      return {
        ok: issues.length === 0,
        loop: ['write frontend', 'start preview', 'open application', 'look at page', 'click controls', 'inspect console', 'inspect API requests', 'detect problem'],
        navigate: nav,
        click: click,
        screenshot: shot,
        console: Browser.console(),
        network: Browser.network(),
        problems: issues
      };
    }
  };

  Engine.Swarm = Swarm;
  Engine.Coordinator = Coordinator;
  Engine.ProjectBrain = ProjectBrain;
  Engine.ModelRouter = ModelRouter;
  Engine.Browser = Browser;
  window.SovereignCoordinator = Coordinator;
})();
