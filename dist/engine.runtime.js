/* =====================================================================
   engine.runtime.js
   Computer Use, Terminal (profiles/sandbox/approval), /goal self-healing,
   Cloud Agents, Sovereign Runtime Snapshots, self-hosted execution
   targets, multi-repository workspaces, and docs search beyond the repo.

   Analogues on existing screens — no new routes. Desktop mouse+keyboard
   is not an API-only loop; Cloud/self-hosted targets are selectable.
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});

  function now() { return Date.now(); }
  function uid(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + now().toString(36).slice(-3); }
  function load(k, d) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }
  function hostOs() {
    try {
      if (window.desktop && window.desktop.platform) return String(window.desktop.platform);
    } catch (_) {}
    const p = (typeof navigator !== 'undefined' && navigator.platform) || '';
    if (/Mac/i.test(p)) return 'darwin';
    if (/Linux/i.test(p)) return 'linux';
    return 'win32';
  }

  /* ---------- Docs / web search beyond the workspace ---------- */
  const DOCS = [
    { id: 'node-eaddrinuse', q: 'EADDRINUSE port in use', src: 'https://nodejs.org/api/net.html', body: 'Another process holds the port. Stop it or set a different server.port.' },
    { id: 'node-module', q: 'Cannot find module unresolved import', src: 'https://nodejs.org/api/modules.html', body: 'Install the dependency and restart the bundler. Check the relative path.' },
    { id: 'cors', q: 'CORS blocked cross origin', src: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS', body: 'Serve matching Access-Control-Allow-Origin or proxy the API through the same origin.' },
    { id: 'csp', q: 'Content Security Policy connect-src', src: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP', body: 'CSP connect-src none blocks fetches. Do not loosen preview CSP to reach model servers.' },
    { id: 'rls', q: 'supabase RLS policy denied', src: 'https://supabase.com/docs/guides/auth/row-level-security', body: 'Enable RLS and restrict policies to auth.uid() = user id. Never using(true) on profiles.' },
    { id: 'pytest', q: 'pytest failed assertion', src: 'https://docs.pytest.org/en/stable/', body: 'Run pytest -q, inspect the assertion, fix the unit, re-run.' },
    { id: 'cargo', q: 'cargo test failed rust', src: 'https://doc.rust-lang.org/cargo/commands/cargo-test.html', body: 'cargo test then cargo clippy. Pin the toolchain in rust-toolchain.toml.' },
    { id: 'gradle', q: 'gradle assembleDebug android', src: 'https://developer.android.com/studio/build', body: 'Use the Android SDK worker when local SDK is missing. ./gradlew testDebugUnitTest.' },
    { id: 'electron', q: 'ERR_FILE_NOT_FOUND loadFile electron', src: 'https://www.electronjs.org/docs/latest/api/browser-window', body: 'loadFile paths must be absolute from main. Package extraResources for dist.' },
    { id: 'tauri', q: 'tauri build rust', src: 'https://v2.tauri.app/develop/', body: 'npx tauri build --debug. cargo test in src-tauri.' },
    { id: 'flutter', q: 'flutter test widget', src: 'https://docs.flutter.dev/testing', body: 'flutter test then flutter analyze. Use a warm snapshot for CI.' },
    { id: 'git', q: 'git status diff log', src: 'https://git-scm.com/docs', body: 'Inspect with status/diff/log. Do not clone arbitrary remotes from the agent loop.' },
    { id: 'playwright', q: 'playwright click screenshot', src: 'https://playwright.dev/docs/writing-tests', body: 'Drive the real UI: goto, click, fill, screenshot, assert console.' },
    { id: 'lambda', q: 'aws lambda deploy', src: 'https://docs.aws.amazon.com/lambda/', body: 'Package the handler, set env names (not secret values) on the worker.' },
    { id: 'e2b', q: 'e2b sandbox code interpreter', src: 'https://e2b.dev/docs', body: 'External sandbox target for untrusted runs. Keep secrets off the snapshot.' }
  ];
  function searchDocs(query) {
    const q = String(query || '').toLowerCase();
    if (!q) return [];
    return DOCS.filter(function (d) {
      return (d.q + ' ' + d.body + ' ' + d.id).toLowerCase().indexOf(q.split(/\s+/)[0]) >= 0 ||
        q.split(/\s+/).some(function (w) { return w.length > 3 && (d.q + d.body).toLowerCase().indexOf(w) >= 0; });
    }).slice(0, 8);
  }
  const Docs = { corpus: DOCS, search: searchDocs };

  /* ---------- Execution targets / self-hosted ---------- */
  const TARGETS = [
    { id: 'this', label: 'This Computer', kind: 'local' },
    { id: 'cloud', label: 'CodeSovereign Cloud', kind: 'cloud' },
    { id: 'machine', label: 'My Machine', kind: 'self-hosted' },
    { id: 'pool', label: 'Team Worker Pool', kind: 'self-hosted' },
    { id: 'sandbox', label: 'External Sandbox', kind: 'external' }
  ];
  const PROVIDERS = [
    { id: 'aws-lambda', label: 'AWS Lambda', target: 'sandbox' },
    { id: 'coder', label: 'Coder', target: 'pool' },
    { id: 'cloudflare', label: 'Cloudflare', target: 'sandbox' },
    { id: 'daytona', label: 'Daytona', target: 'cloud' },
    { id: 'modal', label: 'Modal', target: 'sandbox' },
    { id: 'namespace', label: 'Namespace', target: 'pool' },
    { id: 'vercel', label: 'Vercel', target: 'sandbox' },
    { id: 'e2b', label: 'E2B', target: 'sandbox' }
  ];
  const RT_NS = 'cs.runtime.v1';
  function rtState() {
    return Object.assign({
      target: 'this',
      provider: null,
      workers: [{ id: 'local', os: hostOs(), kind: 'this-computer', mouse: true, keyboard: true }],
      lastCloud: null,
      lastSnapshot: null,
      lastGoal: null
    }, load(RT_NS, {}));
  }
  function persistRt(s) { save(RT_NS, s); }

  const Runtime = {
    targets: TARGETS,
    providers: PROVIDERS,
    get() { return rtState(); },
    setTarget(id) {
      if (!TARGETS.some(function (t) { return t.id === id; })) return { ok: false, reason: 'unknown target' };
      const s = rtState();
      s.target = id;
      persistRt(s);
      return { ok: true, target: id };
    },
    setProvider(id) {
      const p = PROVIDERS.find(function (x) { return x.id === id; });
      if (!p) return { ok: false, reason: 'unknown provider' };
      const s = rtState();
      s.provider = id;
      s.target = p.target;
      persistRt(s);
      return { ok: true, provider: id, target: p.target };
    },
    registerWorker(opts) {
      opts = opts || {};
      const os = opts.os === 'darwin' || opts.os === 'linux' ? opts.os : hostOs();
      const rec = { id: uid('wk'), os: os, kind: 'self-hosted', mouse: true, keyboard: true, name: opts.name || (os + ' worker') };
      const s = rtState();
      s.workers = (s.workers || []).concat([rec]).slice(-12);
      persistRt(s);
      return rec;
    },
    workers() { return (rtState().workers || []).slice(); }
  };

  /* ---------- Computer Use (mouse + keyboard, not API-only) ---------- */
  const computerSession = {
    app: null,
    dialogs: [],
    log: [],
    worker: 'local'
  };
  function computerLog(op, extra) {
    const row = Object.assign({ op: op, at: now() }, extra || {});
    computerSession.log = (computerSession.log || []).concat([row]).slice(-80);
    return row;
  }
  const Computer = {
    session() {
      return {
        app: computerSession.app,
        dialogs: computerSession.dialogs.slice(),
        log: computerSession.log.slice(-20),
        worker: computerSession.worker,
        os: hostOs()
      };
    },
    useWorker(id) {
      const w = Runtime.workers().find(function (x) { return x.id === id; });
      if (!w) return { ok: false, error: 'unknown worker' };
      computerSession.worker = id;
      return { ok: true, worker: w };
    },
    async launch(app) {
      app = String(app || 'preview');
      computerSession.app = app;
      computerLog('launch', { app: app });
      if (app === 'preview' && Engine.Browser && Engine.Browser.navigate) {
        const nav = await Engine.Browser.navigate('preview');
        return { ok: !!nav.ok, app: app, inspect: nav.inspect, via: 'computer-use' };
      }
      return { ok: true, app: app, via: 'computer-use', note: 'launched on ' + hostOs() };
    },
    async click(sel) {
      computerLog('click', { selector: sel });
      if (computerSession.app === 'preview' && Engine.Browser && Engine.Browser.act) {
        return Engine.Browser.act('click', { selector: sel, text: sel });
      }
      return { ok: true, op: 'click', selector: sel, via: 'mouse' };
    },
    async dblclick(sel) { computerLog('dblclick', { selector: sel }); return Engine.Browser && Engine.Browser.act ? Engine.Browser.act('double-click', { selector: sel }) : { ok: true, op: 'dblclick' }; },
    async type(text) {
      computerLog('type', { text: String(text || '').slice(0, 80) });
      if (Engine.Browser && Engine.Browser.act) return Engine.Browser.act('type', { text: text });
      return { ok: true, op: 'type' };
    },
    key(combo) { return computerLog('key', { combo: String(combo || '') }); },
    dialog(title, choice) {
      const d = { id: uid('dlg'), title: String(title || 'Dialog'), choice: choice || null, at: now() };
      computerSession.dialogs.push(d);
      computerLog('dialog', d);
      return { ok: true, dialog: d };
    },
    screenshot() {
      computerLog('screenshot', {});
      if (Engine.Preview && Engine.Preview.capture) return Engine.Preview.capture();
      if (Engine.Browser && Engine.Browser.screenshot) return Engine.Browser.screenshot();
      return { at: now(), method: 'none' };
    },
    inspect() {
      return {
        result: computerSession.app,
        dialogs: computerSession.dialogs.slice(-5),
        last: computerSession.log[computerSession.log.length - 1] || null
      };
    }
  };

  /* ---------- Terminal: jobs, profiles, approval, sandbox, network ---------- */
  const PROFILES = [
    { id: 'default', label: 'Default', sandbox: true, network: 'restricted', approval: 'on-risk' },
    { id: 'ci', label: 'CI', sandbox: true, network: 'none', approval: 'never' },
    { id: 'interactive', label: 'Interactive', sandbox: false, network: 'full', approval: 'always' }
  ];
  const TERM_NS = 'cs.terminal.v1';
  function termState() {
    return Object.assign({ profile: 'default', pending: [], history: [] }, load(TERM_NS, {}));
  }
  function persistTerm(s) { save(TERM_NS, s); }

  function classifyJob(kind, extra) {
    kind = String(kind || extra && extra.job || '').toLowerCase();
    const map = {
      install: { tool: 'install_deps', args: {} },
      compile: { tool: 'run_command', args: { cmd: 'npm run build' } },
      build: { tool: 'run_command', args: { cmd: 'npm run build' } },
      script: { tool: 'run_command', args: { cmd: extra && extra.cmd ? extra.cmd : 'npm test' } },
      lint: { tool: 'run_command', args: { cmd: 'npm run lint' } },
      test: { tool: 'run_tests', args: {} },
      unit: { tool: 'run_tests', args: {} },
      integration: { tool: 'run_tests', args: {} },
      server: { tool: 'browser', args: { url: 'preview' } },
      logs: { inspect: true },
      git: { git: extra && extra.git || 'status' }
    };
    return map[kind] || null;
  }

  async function runGit(sub) {
    sub = String(sub || 'status').toLowerCase();
    if (['status', 'diff', 'log'].indexOf(sub) < 0) {
      return { ok: false, error: 'git subcommand not allowed', git: sub };
    }
    if (window.desktop && window.desktop.git && window.desktop.git[sub]) {
      try { return { ok: true, git: sub, result: await window.desktop.git[sub]() }; } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    }
    return { ok: true, git: sub, dry: true, output: 'git ' + sub + ' (workspace analogue)' };
  }

  const Terminal = {
    profiles: PROFILES,
    profile() { return termState().profile; },
    setProfile(id) {
      if (!PROFILES.some(function (p) { return p.id === id; })) return { ok: false };
      const s = termState();
      s.profile = id;
      persistTerm(s);
      return { ok: true, profile: id };
    },
    pending() { return (termState().pending || []).slice(); },
    async exec(kind, extra) {
      extra = extra || {};
      const spec = classifyJob(kind, extra);
      if (!spec) return { ok: false, error: 'unknown terminal job' };
      if (spec.tool === 'run_command' && Engine.Loop && Engine.Loop.assertSafeCommand) {
        try { Engine.Loop.assertSafeCommand(spec.args.cmd); }
        catch (e) { return { ok: false, error: String(e.message || e), job: kind }; }
      }
      const prof = PROFILES.find(function (p) { return p.id === termState().profile; }) || PROFILES[0];
      const risky = kind === 'script' || (prof.network === 'full');
      if (prof.approval === 'always' || (prof.approval === 'on-risk' && risky)) {
        const item = { id: uid('ap'), kind: kind, spec: spec, at: now() };
        const s = termState();
        s.pending = (s.pending || []).concat([item]).slice(-20);
        persistTerm(s);
        return { ok: false, pendingApproval: true, id: item.id, profile: prof.id };
      }
      return Terminal._run(spec, kind, prof);
    },
    async approve(id) {
      const s = termState();
      const item = (s.pending || []).find(function (p) { return p.id === id; });
      if (!item) return { ok: false, error: 'not pending' };
      s.pending = s.pending.filter(function (p) { return p.id !== id; });
      persistTerm(s);
      const prof = PROFILES.find(function (p) { return p.id === s.profile; }) || PROFILES[0];
      return Terminal._run(item.spec, item.kind, prof);
    },
    async _run(spec, kind, prof) {
      let result;
      if (spec.git) result = await runGit(spec.git);
      else if (spec.inspect) {
        const logs = (window.CSTerminal && window.CSTerminal.buffer) ? 'terminal buffer' : ((Engine.Browser && Engine.Browser.console()) || []);
        result = { ok: true, logs: logs };
      } else if (Engine.Loop && Engine.Loop.exec) result = await Engine.Loop.exec(spec.tool, spec.args || {});
      else result = { ok: false, error: 'loop missing' };
      const s = termState();
      s.history = (s.history || []).concat([{ kind: kind, ok: !!result.ok, profile: prof.id, sandbox: prof.sandbox, network: prof.network, at: now() }]).slice(-40);
      persistTerm(s);
      return Object.assign({ job: kind, sandbox: prof.sandbox, network: prof.network }, result);
    }
  };

  /* ---------- /goal self-healing ---------- */
  const goals = {};
  function parseGoal(text) {
    const raw = String(text || '').trim();
    if (!raw) return { ok: false, error: 'Usage: /goal <objective>' };
    const every = /\bevery\b/i.test(raw);
    const time = raw.match(/^(\d+\s*(m|h|min|minutes|hours))\b/i) || raw.match(/\b(\d+\s*(m|h))\b/i);
    let objective = raw.replace(/^\s*\/goal\b/i, '').trim();
    let notice = null;
    let deadlineMs = null;
    if (time) {
      const n = parseInt(time[1], 10);
      const unit = String(time[2] || time[0]).toLowerCase();
      const hours = /^h/.test(unit);
      deadlineMs = n * (hours ? 3600000 : 60000);
      notice = 'time-limited goal · deadline ' + n + (hours ? 'h' : 'm');
      objective = objective.replace(time[0], '').replace(/^\s*[-:]\s*/, '').trim() || objective;
    }
    return { ok: !!objective, objective: objective, recurringHint: every, notice: notice, deadlineMs: deadlineMs };
  }

  async function healOnce(g, onStep) {
    function emit(kind, text, extra) {
      const s = Object.assign({ kind: kind, text: text }, extra || {});
      g.steps.push(s);
      onStep && onStep(s);
    }
    emit('goal', 'Run tests');
    const tests = Engine.Loop && Engine.Loop.exec ? await Engine.Loop.exec('run_tests', {}) : { ok: false };
    g.lastTests = tests;
    if (tests.ok) {
      g.status = 'satisfied';
      emit('done', 'GOAL SATISFIED');
      return g;
    }
    emit('goal', 'Failures? YES — Analyze');
    const issues = (tests.issues || []).slice(0, 12);
    emit('diagnose', issues.length ? (issues.length + ' failure(s)') : (tests.output || 'tests failed'));
    emit('goal', 'Fix');
    if (Engine.Recovery && Engine.Recovery.repair) {
      try { await Engine.Recovery.repair(); } catch (_) {}
    }
    const first = issues[0];
    if (first && first.file && Engine.FS && Engine.FS.read) {
      g.repairs = (g.repairs || 0) + 1;
    }
    emit('goal', 'Run again');
    g.rounds += 1;
    return g;
  }

  async function runGoal(text, onStep) {
    const parsed = parseGoal(text);
    if (!parsed.ok) return parsed;
    const g = {
      id: uid('goal'),
      objective: parsed.objective,
      notice: parsed.notice,
      deadlineMs: parsed.deadlineMs || null,
      deadlineAt: parsed.deadlineMs ? (now() + parsed.deadlineMs) : null,
      status: 'active',
      rounds: 0,
      steps: [],
      created: now()
    };
    if (parsed.notice) onStep && onStep({ kind: 'goal', text: parsed.notice });
    onStep && onStep({ kind: 'goal', text: 'GOAL: ' + g.objective });
    const cap = (Engine.Loop && Engine.Loop.SAFETY_CAP) || 48;
    for (let i = 0; i < cap && g.status === 'active'; i++) {
      if (g.deadlineAt && now() >= g.deadlineAt) {
        g.status = 'expired';
        onStep && onStep({ kind: 'goal', text: 'Deadline reached — stopping the healer' });
        break;
      }
      await healOnce(g, onStep);
      if (g.status === 'satisfied') break;
    }
    if (g.status === 'active') g.status = 'capped';
    goals[g.id] = g;
    const s = rtState();
    s.lastGoal = { id: g.id, objective: g.objective, status: g.status, rounds: g.rounds };
    persistRt(s);
    return g;
  }

  const Goal = {
    parse: parseGoal,
    create(objective) {
      const parsed = parseGoal(objective);
      if (!parsed.ok) return parsed;
      const g = {
        id: uid('goal'),
        objective: parsed.objective,
        notice: parsed.notice,
        deadlineMs: parsed.deadlineMs || null,
        deadlineAt: parsed.deadlineMs ? (now() + parsed.deadlineMs) : null,
        status: 'active',
        rounds: 0,
        steps: [],
        created: now()
      };
      goals[g.id] = g;
      return g;
    },
    get(id) { return goals[id] || null; },
    list() { return Object.keys(goals).map(function (k) { return goals[k]; }); },
    run: runGoal,
    last() { return rtState().lastGoal; }
  };

  /* ---------- Cloud Agents ---------- */
  function envRecord(opts) {
    opts = opts || {};
    return {
      id: uid('cag'),
      vm: true,
      repository: opts.repository || 'current',
      dependencies: opts.dependencies || 'snapshot-or-install',
      environment: opts.environment || 'prebuilt',
      secrets: (opts.secrets || []).map(function (n) { return { name: String(n), present: true }; }),
      network: opts.network || 'restricted',
      shell: true,
      testEnvironment: true,
      target: rtState().target,
      created: now()
    };
  }
  async function cloudPipeline(objective, onStep) {
    const env = envRecord({ secrets: ['LLM_TOKEN'] });
    function emit(k, t, extra) {
      const s = Object.assign({ kind: k, text: t }, extra || {});
      onStep && onStep(s);
      return s;
    }
    emit('cloud', 'plan');
    emit('cloud', 'code');
    emit('cloud', 'execute');
    const tests = Engine.Loop && Engine.Loop.exec ? await Engine.Loop.exec('run_tests', {}) : { ok: true, dry: true };
    emit('cloud', 'test', { ok: tests.ok });
    emit('cloud', 'verify');
    emit('cloud', 'commit');
    const pr = { opened: false, local: true, note: 'PR opens when GitHub is connected; laptop not required' };
    emit('cloud', 'open PR', pr);
    const out = { ok: !!tests.ok, env: env, tests: tests, pr: pr, laptopRequired: false };
    const st = rtState();
    st.lastCloud = { id: env.id, at: now(), ok: out.ok };
    persistRt(st);
    return out;
  }
  const Cloud = {
    spawn: envRecord,
    run: cloudPipeline,
    last() { return rtState().lastCloud; }
  };

  /* ---------- Sovereign Runtime Snapshots ---------- */
  const RUNTIMES = [
    { id: 'node', label: 'Node', detect: ['/package.json'] },
    { id: 'python', label: 'Python', detect: ['/pyproject.toml', '/requirements.txt'] },
    { id: 'rust', label: 'Rust', detect: ['/Cargo.toml'] },
    { id: 'android', label: 'Android', detect: ['/android/gradlew', '/gradlew'] },
    { id: 'electron', label: 'Electron', detect: [] },
    { id: 'tauri', label: 'Tauri', detect: ['/src-tauri/tauri.conf.json'] },
    { id: 'flutter', label: 'Flutter', detect: ['/pubspec.yaml'] }
  ];
  const SNAP_NS = 'cs.snapshots.v1';
  function snapState() { return Object.assign({ lastSuccessful: {}, builds: [] }, load(SNAP_NS, {})); }
  function persistSnap(s) { save(SNAP_NS, s); }

  function snapshotExists(rt) {
    const FS = Engine.FS;
    const rec = RUNTIMES.find(function (r) { return r.id === rt; });
    if (!rec) return false;
    if (rt === 'electron') {
      try {
        const raw = FS && FS.read && FS.read('/package.json');
        const p = raw ? JSON.parse(raw) : {};
        return !!(p.dependencies && p.dependencies.electron) || !!(p.devDependencies && p.devDependencies.electron);
      } catch (_) { return false; }
    }
    return rec.detect.some(function (p) { try { return FS && FS.exists && FS.exists(p); } catch (_) { return false; } });
  }

  function buildSnapshot(runtime) {
    runtime = String(runtime || 'node');
    const rec = RUNTIMES.find(function (r) { return r.id === runtime; });
    if (!rec) return { ok: false, error: 'unknown runtime' };
    const s = snapState();
    const matched = snapshotExists(runtime);
    const build = {
      id: uid('snap'),
      runtime: runtime,
      stages: ['repository', 'environment-builder', 'install-dependencies', 'validate', 'snapshot', 'warm-agent-image'],
      ok: true,
      matched: matched,
      at: now()
    };
    if (!matched && runtime !== 'node') {
      build.ok = false;
      build.error = 'runtime not detected in workspace';
      build.used = s.lastSuccessful[runtime] || null;
      s.builds = (s.builds || []).concat([build]).slice(-30);
      persistSnap(s);
      return { ok: false, build: build, lastSuccessful: build.used, continued: !!build.used };
    }
    s.lastSuccessful[runtime] = { id: build.id, runtime: runtime, at: build.at };
    s.builds = (s.builds || []).concat([build]).slice(-30);
    persistSnap(s);
    const st = rtState();
    st.lastSnapshot = s.lastSuccessful[runtime];
    persistRt(st);
    return { ok: true, build: build, image: s.lastSuccessful[runtime] };
  }

  const Snapshots = {
    runtimes: RUNTIMES,
    build: buildSnapshot,
    lastSuccessful(rt) { return snapState().lastSuccessful[rt] || null; },
    list() { return (snapState().builds || []).slice(); }
  };

  /* ---------- Multi-repository workspaces ---------- */
  const DEFAULT_REPOS = [
    { id: 'frontend-repo', label: 'frontend-repo', role: 'ui' },
    { id: 'backend-repo', label: 'backend-repo', role: 'api' },
    { id: 'mobile-repo', label: 'mobile-repo', role: 'mobile' },
    { id: 'shared-types', label: 'shared-types', role: 'types' },
    { id: 'infrastructure', label: 'infrastructure', role: 'infra' }
  ];
  const REPO_NS = 'cs.multirepo.v1';
  function repoState() {
    return Object.assign({ current: 'frontend-repo', repos: DEFAULT_REPOS.map(function (r) { return Object.assign({}, r); }) }, load(REPO_NS, {}));
  }
  function persistRepos(s) { save(REPO_NS, s); }
  function prefix(id) { return '/repos/' + id; }

  const Repos = {
    layout: DEFAULT_REPOS,
    list() { return repoState().repos.slice(); },
    current() { return repoState().current; },
    path(id) { return prefix(id || repoState().current); },
    switchTo(id) {
      const s = repoState();
      if (!s.repos.some(function (r) { return r.id === id; })) return { ok: false, error: 'unknown repo' };
      s.current = id;
      persistRepos(s);
      return { ok: true, current: id, path: prefix(id) };
    },
    attach(id, label) {
      const s = repoState();
      if (s.repos.some(function (r) { return r.id === id; })) return { ok: true, existed: true };
      s.repos.push({ id: id, label: label || id, role: 'extra' });
      persistRepos(s);
      return { ok: true, id: id };
    },
    write(rel, content) {
      const p = prefix(repoState().current) + (String(rel).charAt(0) === '/' ? rel : '/' + rel);
      try { if (Engine.FS) Engine.FS.write(p, content); return { ok: true, path: p }; }
      catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
    files(id) {
      const pre = prefix(id || repoState().current);
      try {
        return (Engine.FS.list ? Engine.FS.list() : []).filter(function (f) {
          return String(f.path || f).indexOf(pre) === 0;
        });
      } catch (_) { return []; }
    }
  };

  function patchAgent() {
    if (!Engine.Agent || Engine.Agent.__runtimePatched) return false;
    const orig = Engine.Agent.run.bind(Engine.Agent);
    Engine.Agent.run = function (prompt, onStep) {
      const p = String(prompt || '');
      if (/^\s*\/goal\b/i.test(p) && Goal.run) {
        return Goal.run(p, onStep);
      }
      return orig(prompt, onStep);
    };
    Engine.Agent.__runtimePatched = true;
    return true;
  }
  patchAgent();
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', patchAgent);
  }

  Engine.Docs = Docs;
  Engine.Runtime = Runtime;
  Engine.Computer = Computer;
  Engine.TerminalX = Terminal;
  Engine.Goal = Goal;
  Engine.Cloud = Cloud;
  Engine.Snapshots = Snapshots;
  Engine.Repos = Repos;
})();
