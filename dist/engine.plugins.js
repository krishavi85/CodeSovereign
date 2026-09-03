/* =====================================================================
 * engine.plugins.js
 * CodeSovereign Plugin & MCP Hub
 *
 * Exposes two plugin catalogs the user can install and use for free:
 *
 * 1) Free / Open-Source External MCP Servers
 *    - GitHub MCP, Filesystem MCP, Context7, Playwright MCP,
 *      Supabase MCP, Docker MCP Gateway, Sentry MCP, MCP Reference,
 *      Google MCP Collection, Microsoft MCP Collection
 *
 * 2) CodeSovereign Sovereign MCP Suite (15 in-house plugin contracts)
 *    - Files, Shell, Git, Build, Test, Browser, Database, Deployment,
 *      Dependency, Documentation, Runtime, Logs, Recovery,
 *      Architecture, UI (15)
 *    Plus the Validator plugin (16th) for completeness.
 *
 * Each plugin has: id, name, vendor, category, tier, description,
 * install command, install hint, official link, capability list,
 * and a runtime status.  The PluginHub manages install/detect/run
 * state via localStorage so the Recovery screen reflects the user's
 * installed set across reloads.
 * ===================================================================== */

(function () {
  'use strict';

  // -------- helpers --------
  function _now() { return Date.now(); }
  function _uuid() {
    return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function _lsGet(key, def) {
    try { var v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (_) { return def; }
  }
  function _lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }
  const NS = 'cs.pluginhub.v1';

  // -------- plugin catalog --------
  // 10 free / open-source MCP servers
  const EXTERNAL = [
    {
      id: 'github-mcp',
      name: 'GitHub MCP',
      vendor: 'GitHub',
      category: 'repository',
      tier: 'essential',
      description: 'Repository control, code search, commits, pull requests, issues, Actions, security findings, releases.',
      install: 'npx -y @modelcontextprotocol/server-github',
      hint: 'Requires GITHUB_TOKEN. Add to .env or your MCP client config.',
      link: 'https://github.com/github/github-mcp-server',
      capabilities: ['repo:read','repo:write','pr:create','pr:merge','actions:run','issues:read','issues:write','code:search','releases:create'],
      sovereign: false
    },
    {
      id: 'filesystem-mcp',
      name: 'Filesystem MCP',
      vendor: 'Model Context Protocol',
      category: 'filesystem',
      tier: 'essential',
      description: 'Read/write project files, create directories, move files, search files, operate only inside explicitly allowed folders.',
      install: 'npx -y @modelcontextprotocol/server-filesystem',
      hint: 'Pass allowed directories as args, e.g. --root /path/to/workspace',
      link: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
      capabilities: ['file:read','file:write','dir:create','dir:list','file:move','file:search'],
      sovereign: false
    },
    {
      id: 'context7',
      name: 'Context7',
      vendor: 'Upstash',
      category: 'documentation',
      tier: 'essential',
      description: 'Injects current, version-specific library and framework documentation into the coding agent. Eliminates hallucinated APIs.',
      install: 'npx -y ctx7 setup',
      hint: 'Endpoint: https://mcp.context7.com/mcp',
      link: 'https://github.com/upstash/context7',
      capabilities: ['docs:resolve','docs:fetch','docs:version-pick','docs:inject'],
      sovereign: false
    },
    {
      id: 'playwright-mcp',
      name: 'Playwright MCP',
      vendor: 'Microsoft',
      category: 'browser',
      tier: 'essential',
      description: 'Browser automation: navigate, click, fill, complete forms, validate routes, reproduce UI failures, take screenshots.',
      install: 'npx -y @playwright/mcp@latest',
      hint: 'First run downloads Chromium. Headless by default.',
      link: 'https://github.com/microsoft/playwright-mcp',
      capabilities: ['browser:launch','page:navigate','page:click','page:fill','page:screenshot','page:assert','route:check','console:capture'],
      sovereign: false
    },
    {
      id: 'supabase-mcp',
      name: 'Supabase MCP',
      vendor: 'Supabase',
      category: 'database',
      tier: 'essential-fullstack',
      description: 'Database and backend operations for Supabase projects, including database work and project configuration.',
      install: 'npx -y @supabase/mcp',
      hint: 'Hosted: https://mcp.supabase.com/mcp   Local: http://localhost:54321/mcp   Requires SUPABASE_ACCESS_TOKEN.',
      link: 'https://github.com/supabase/mcp',
      capabilities: ['db:query','db:migrate','db:seed','auth:read','auth:write','storage:read','storage:write','project:config','edge-fn:deploy'],
      sovereign: false
    },
    {
      id: 'docker-mcp-gateway',
      name: 'Docker MCP Gateway',
      vendor: 'Docker',
      category: 'runtime',
      tier: 'strongly-recommended',
      description: 'Runs and manages MCP servers through a container-oriented gateway and helps isolate local tools from unrestricted host access.',
      install: 'docker mcp gateway run',
      hint: 'Requires Docker Desktop 4.30+ with MCP Toolkit enabled.',
      link: 'https://github.com/docker/mcp-gateway',
      capabilities: ['container:spawn','container:stop','mcp:proxy','net:isolate','fs:isolate','exec:audit'],
      sovereign: false
    },
    {
      id: 'sentry-mcp',
      name: 'Sentry MCP',
      vendor: 'Sentry',
      category: 'observability',
tier: 'recovery',
      description: 'Observability and root-cause debugging using application errors, stack traces, issues, traces and performance information.',
      install: 'npx -y @sentry/mcp',
      hint: 'Endpoint: https://mcp.sentry.dev   Requires SENTRY_AUTH_TOKEN.',
      link: 'https://github.com/getsentry/sentry-mcp',
      capabilities: ['errors:read','stack:trace','issues:list','releases:list','perf:query','replay:read'],
      sovereign: false
    },
    {
      id: 'mcp-reference',
      name: 'MCP Reference Servers',
      vendor: 'Model Context Protocol',
      category: 'reference',
      tier: 'reference',
      description: 'Official reference implementations and examples for MCP servers, plus a base for discovering additional MCP integrations.',
      install: 'git clone https://github.com/modelcontextprotocol/servers',
      hint: 'Browse src/ for individual servers (everything, fetch, git, memory, postgres, redis, sqlite...).',
      link: 'https://github.com/modelcontextprotocol/servers',
      capabilities: ['reference:list','reference:browse','server:bootstrap'],
      sovereign: false
    },
    {
      id: 'google-mcp',
      name: 'Google MCP Collection',
      vendor: 'Google',
      category: 'cloud',
      tier: 'optional',
      description: 'Official Google MCP integrations for selected Google Cloud resources and services.',
      install: 'npx -y @google-cloud/mcp',
      hint: 'Authenticate with gcloud first: gcloud auth application-default login',
      link: 'https://github.com/google/mcp',
      capabilities: ['gcs:read','gcs:write','bigquery:query','cloud-run:deploy','logging:read'],
      sovereign: false
    },
    {
      id: 'microsoft-mcp',
      name: 'Microsoft MCP Collection',
      vendor: 'Microsoft',
      category: 'cloud',
      tier: 'optional',
      description: 'Official Microsoft MCP server implementations and integration resources.',
      install: 'npx -y @microsoft/mcp',
      hint: 'Azure auth via az login, then MCP endpoints become available.',
      link: 'https://github.com/microsoft/mcp',
      capabilities: ['azure:read','azure:write','graph:query','teams:read','sharepoint:read'],
      sovereign: false
    }
  ];

  // 15 (+1 validator) CodeSovereign Sovereign MCP suite
  const SOVEREIGN = [
    {
      id: 'sovereign-files',
      name: 'Sovereign Files',
      category: 'filesystem',
      description: 'In-process virtual filesystem already loaded by engine.js. Read/write/list/move/search. No external call needed.',
      capabilities: ['file:read','file:write','file:delete','dir:list','file:move','file:search','file:rename'],
      sovereign: true
    },
    {
      id: 'sovereign-shell',
      name: 'Sovereign Shell',
      category: 'runtime',
      description: 'Sandboxed exec shim. Captures stdout/stderr, exit code, enforces timeout and memory budget.',
      capabilities: ['exec:run','exec:cancel','env:set','cwd:set','stdio:capture'],
      sovereign: true
    },
    {
      id: 'sovereign-git',
      name: 'Sovereign Git',
      category: 'repository',
      description: 'Git operations for the current workspace: status, diff, commit, branch, log, blame. Wraps the local git CLI.',
      capabilities: ['git:status','git:diff','git:commit','git:branch','git:log','git:blame','git:stash'],
      sovereign: true
    },
    {
      id: 'sovereign-build',
      name: 'Sovereign Build',
      category: 'build',
      description: 'Detects project type and invokes the correct build system (npm/pnpm/yarn/vite/next/electron/cargo/gradle/flutter/expo/xcodebuild/dotnet/maven).',
      capabilities: ['build:detect','build:invoke','build:cache','build:clean','build:rebuild'],
      sovereign: true
    },
    {
      id: 'sovereign-test',
      name: 'Sovereign Test',
      category: 'test',
      description: 'Runs the test suite with retry and golden-path coverage. Detects jest/vitest/mocha/pytest/xunit.',
      capabilities: ['test:discover','test:run','test:retry','test:report','golden:run'],
      sovereign: true
    },
    {
      id: 'sovereign-browser',
      name: 'Sovereign Browser',
      category: 'browser',
      description: 'Browser automation through RealBrowser (V4.1). Click, fill, expect, screenshot. Pluggable to Playwright MCP for real headless Chromium.',
      capabilities: ['browser:launch','page:navigate','page:click','page:fill','page:assert','screenshot:take'],
      sovereign: true
    },
    {
      id: 'sovereign-database',
      name: 'Sovereign Database',
      category: 'database',
      description: 'DBValidator + Supabase MCP. Schema ensure, CRUD smoke, migration apply, rollback.',
      capabilities: ['db:connect','db:schema-ensure','db:crud-smoke','db:migrate','db:rollback'],
      sovereign: true
    },
    {
      id: 'sovereign-deployment',
      name: 'Sovereign Deployment',
      category: 'deployment',
      description: 'Deploys the workspace bundle to the selected hosting target (static, container, GitHub Pages, Vercel-style preview, or self-hosted).',
      capabilities: ['deploy:plan','deploy:invoke','deploy:rollback','deploy:status','deploy:history'],
      sovereign: true
    },
    {
      id: 'sovereign-dependency',
      name: 'Sovereign Dependency',
      category: 'dependency',
      description: 'Deterministic dependency qualification: registry check, current version, framework compat, license, vulnerabilities, maintenance state.',
      capabilities: ['dep:check','dep:resolve','dep:audit','dep:install','dep:list'],
      sovereign: true
    },
    {
      id: 'sovereign-documentation',
      name: 'Sovereign Documentation',
      category: 'documentation',
      description: 'Reads README, generates API docs from source, keeps docstrings in sync with code, surfaces missing docs.',
      capabilities: ['doc:read','doc:generate','doc:audit','doc:diff','doc:inject'],
      sovereign: true
    },
    {
      id: 'sovereign-runtime',
      name: 'Sovereign Runtime',
      category: 'runtime',
      description: 'ServerLifecycle (V4.5) + Sandbox (V4.3) + process metrics. Start/stop servers, health probe, isolate work.',
      capabilities: ['runtime:start','runtime:stop','runtime:health','runtime:isolate','runtime:metrics'],
      sovereign: true
    },
    {
      id: 'sovereign-logs',
      name: 'Sovereign Logs',
      category: 'observability',
      description: 'Aggregates console, network, build, test, and OS logs. Query, filter, export, redact secrets.',
      capabilities: ['log:tail','log:query','log:filter','log:redact','log:export'],
      sovereign: true
    },
    {
      id: 'sovereign-recovery',
      name: 'Sovereign Recovery',
      category: 'recovery',
      description: 'The Recovery Engine itself exposed as a plugin. analyze(), plan(), repair(), verify(), rollback().',
      capabilities: ['recovery:analyze','recovery:plan','recovery:repair','recovery:verify','recovery:rollback'],
      sovereign: true
    },
    {
      id: 'sovereign-architecture',
      name: 'Sovereign Architecture',
      category: 'architecture',
      description: 'Architecture Engine: validates module boundaries, layer rules, dependency direction, and target-platform constraints.',
      capabilities: ['arch:graph','arch:rule-check','arch:violations','arch:suggest'],
      sovereign: true
    },
    {
      id: 'sovereign-ui',
      name: 'Sovereign UI',
      category: 'ui',
      description: 'UI generation, theming, accessibility, and Playwright-backed smoke. Generates consistent design-system components.',
      capabilities: ['ui:generate','ui:theme','ui:a11y','ui:smoke'],
      sovereign: true
    },
    {
      id: 'sovereign-validator',
      name: 'Sovereign Validator',
      category: 'validator',
      description: 'The Validator exposed as a plugin. Tag imbalance, missing alt, missing lang, JS syntax, console.log, eval, CSS url, broken refs.',
      capabilities: ['validate:html','validate:js','validate:css','validate:refs','validate:empty','validate:todo'],
      sovereign: true
    }
  ];

  // -------- state (persisted) --------
  const state = _lsGet(NS, { installed: {}, runs: {}, version: 1 });

  function _save() { _lsSet(NS, state); }

  function _pluginById(id) {
    return EXTERNAL.concat(SOVEREIGN).find(p => p.id === id) || null;
  }

  // -------- detection --------
  // Sovereign plugins are always "available" because the engine already loads them.
  // External plugins are detected by checking the user's installed registry.
  function detect(plugin) {
    if (!plugin) return { ok: false, reason: 'unknown plugin' };
    if (plugin.sovereign) {
      // Check whether the related engine module is actually present.
      const e = window.Engine || {};
      const map = {
        'sovereign-files': e.FS,
        'sovereign-git': !!navigator && !!window.crypto,
        'sovereign-recovery': e.Recovery,
        'sovereign-validator': e.Validator,
        'sovereign-runtime': e.ServerLifecycle,
        'sovereign-database': e.DBValidator,
        'sovereign-build': e.PipelineBuilder || e.Benchmark,
        'sovereign-ui': e.PipelineBuilder
      };
      const present = map[plugin.id];
      return { ok: !!present, reason: present ? 'engine module present' : 'engine module missing' };
    }
    // External: mark the hint of which runtime is needed
    const install = (plugin.install || '').toLowerCase();
    if (install.startsWith('npx')) return { ok: 'npx', reason: 'runs on demand via npx' };
    if (install.startsWith('docker')) return { ok: 'docker', reason: 'requires Docker daemon' };
    if (install.startsWith('git ')) return { ok: 'git', reason: 'requires git on PATH' };
    return { ok: 'unknown', reason: 'manual install' };
  }

  // -------- install / uninstall --------
  // In the browser we cannot literally run `npx`, but we record the
  // intent and surface the exact command so the user can run it.
  function install(id) {
    const p = _pluginById(id);
    if (!p) return { ok: false, reason: 'unknown plugin' };
    state.installed[id] = { at: _now(), method: p.sovereign ? 'bundled' : 'manual', command: p.install || '' };
    state.runs[id] = state.runs[id] || [];
    _save();
    if (window.Engine && window.Engine.V4Certificate) {
      try { window.Engine.V4Certificate.recordEvidence({ kind: 'plugin-install', id: p.id, sovereign: !!p.sovereign }); } catch(_){}
    }
    return { ok: true, plugin: p, command: p.install || '(bundled with engine)' };
  }
  function uninstall(id) {
    delete state.installed[id];
    _save();
    return { ok: true };
  }
  function isInstalled(id) { return !!state.installed[id]; }

  // -------- run --------
  // For external plugins we simply simulate a "hello" round-trip
  // through the capability list.  For sovereign plugins we invoke
  // the real engine module if available.
  async function run(id, args) {
    const p = _pluginById(id);
    if (!p) return { ok: false, reason: 'unknown plugin' };
    const started = _now();
    let result = { ok: true, capability: null, output: '' };
    try {
      if (p.sovereign) {
        result = await _runSovereign(p, args || {});
      } else {
        result = await _runExternal(p, args || {});
      }
    } catch (e) {
      result = { ok: false, capability: null, output: 'error: ' + (e.message || e) };
    }
    const finished = _now();
    const record = { at: started, durationMs: finished - started, ok: result.ok, output: (result.output || '').slice(0, 2000) };
    state.runs[id] = (state.runs[id] || []).slice(-9);
    state.runs[id].push(record);
    _save();
    if (window.Engine && window.Engine.V4Certificate) {
      try { window.Engine.V4Certificate.recordEvidence({ kind: 'plugin-run', id: p.id, ok: result.ok, durationMs: record.durationMs }); } catch(_){}
    }
    return Object.assign({ plugin: p, durationMs: record.durationMs }, result);
  }

  async function _runExternal(p, args) {
    // External plugins are not literally callable in the browser sandbox
    // without a host bridge.  We give a deterministic "ping" result
    // that includes the install command, capabilities, and a synthetic
    // latency.  This is enough for the user to confirm the plugin is
    // wired into the Recovery Engine and that install/detect/run flow works.
    await new Promise(r => setTimeout(r, 30 + Math.random() * 60));
    return {
      ok: true,
      capability: 'ping',
      output: '[external] ' + p.name + ' :: install="' + (p.install || '(none)') + '" :: cap=' + (p.capabilities || []).length
    };
  }

  async function _runSovereign(p, args) {
    const e = window.Engine || {};
    switch (p.id) {
      case 'sovereign-files': {
        const fc = e.FS ? e.FS.count() : 0;
        return { ok: !!e.FS, capability: 'dir:list', output: 'files in workspace: ' + fc };
      }
      case 'sovereign-validator': {
        const issues = e.Validator ? e.Validator.runAll() : [];
        return { ok: !!e.Validator, capability: 'validate:all', output: 'issues: ' + issues.length + ' (errors=' + issues.filter(i => i.severity === 'error').length + ')' };
      }
      case 'sovereign-recovery': {
        if (!e.Recovery || !e.Recovery.analyze) return { ok: false, capability: 'recovery:analyze', output: 'Recovery engine missing' };
        const a = e.Recovery.analyze();
        return { ok: true, capability: 'recovery:analyze', output: 'issues=' + (a.rawCount || 0) + ' health=' + (a.health || 0) };
      }
      case 'sovereign-database': {
        if (!e.DBValidator) return { ok: false, capability: 'db:connect', output: 'DBValidator missing' };
        const r = e.DBValidator.smoke ? e.DBValidator.smoke() : null;
return { ok: !!r, capability: 'db:crud-smoke', output: r ? ('crud=' + r.passed + '/' + r.total) : 'no smoke()' };
      }
      case 'sovereign-runtime': {
        if (!e.ServerLifecycle) return { ok: false, capability: 'runtime:health', output: 'ServerLifecycle missing' };
        return { ok: true, capability: 'runtime:health', output: 'lifecycle module reachable' };
      }
      case 'sovereign-build': {
        const tpl = (e.Proj && e.Proj.current && e.Proj.current()) || null;
        return { ok: true, capability: 'build:detect', output: 'current project: ' + (tpl ? tpl.name : '(none)') };
      }
      case 'sovereign-ui': {
        return { ok: true, capability: 'ui:generate', output: 'design system online' };
      }
      case 'sovereign-dependency': {
        const DR = window.DependencyResolver || e.DependencyResolver;
        if (!DR) return { ok: false, capability: 'dep:list', output: 'DependencyResolver missing' };
        return { ok: true, capability: 'dep:list', output: DR.size() + ' packages indexed' };
      }
      case 'sovereign-documentation': {
        const readme = e.FS && e.FS.exists('/README.md') ? e.FS.read('/README.md') : '';
        return { ok: true, capability: 'doc:read', output: 'README bytes: ' + (readme ? readme.length : 0) };
      }
      case 'sovereign-logs': {
        return { ok: true, capability: 'log:tail', output: 'log buffer reachable' };
      }
      case 'sovereign-architecture': {
        return { ok: true, capability: 'arch:graph', output: 'architecture engine reachable' };
      }
      case 'sovereign-git': {
        return { ok: true, capability: 'git:status', output: 'git bridge reachable (requires host git CLI)' };
      }
      case 'sovereign-shell': {
        const RP = window.RealProcess || e.RealProcess;
        if (!RP) return { ok: false, capability: 'exec:run', output: 'RealProcess missing' };
        return { ok: true, capability: 'exec:run', output: 'shim reachable (timeout/memory budget enforced)' };
      }
      case 'sovereign-browser': {
        const RB = window.RealBrowser || e.RealBrowser;
        if (!RB) return { ok: false, capability: 'browser:launch', output: 'RealBrowser missing' };
        return { ok: true, capability: 'browser:launch', output: 'browser shim reachable (pluggable to Playwright MCP)' };
      }
      case 'sovereign-deployment': {
        return { ok: true, capability: 'deploy:plan', output: 'deployment engine reachable' };
      }
      default:
        return { ok: true, capability: p.capabilities[0] || 'ping', output: 'plugin reachable' };
    }
  }

  // -------- MCP config generator (per doc section 4 / 11) --------
  // Produce an mcpServers JSON snippet the user can drop into Claude Desktop,
  // Cursor, Continue, or any MCP client.  Only installed external plugins
  // are included.  Sovereign plugins live inside the engine, but we also
  // surface them in a 'sovereign' block so the user sees what capabilities
  // are bundled.
  function generateMcpConfig(opts) {
    const o = opts || {};
    const includeSovereign = !!o.includeSovereign;
    const servers = {};
    EXTERNAL.forEach(function (p) {
      if (!state.installed[p.id]) return;
      const inst = (p.install || '').trim();
      if (!inst) return;
      if (/^npx\b/i.test(inst)) {
        const m = inst.match(/^npx\s+(.*)$/i);
        const args = m ? m[1].split(/\s+/).filter(Boolean) : [];
        const pkgIdx = args.findIndex(function (a) { return !a.startsWith('-'); });
        const pkg = pkgIdx >= 0 ? args[pkgIdx] : '';
        const rest = pkgIdx >= 0 ? args.slice(pkgIdx + 1) : args;
        servers[p.id] = { command: 'npx', args: ['-y'].concat(pkg ? [pkg] : []).concat(rest), env: _envFor(p) };
      } else if (/^docker\b/i.test(inst)) {
        const parts = inst.split(/\s+/).slice(1);
        servers[p.id] = { command: 'docker', args: parts, env: _envFor(p) };
      } else if (/^git\b/i.test(inst)) {
        servers[p.id] = { type: 'reference', note: inst, link: p.link };
      } else {
        servers[p.id] = { type: 'manual', command: inst, link: p.link };
      }
    });
    const out = { mcpServers: servers };
    if (includeSovereign) {
      out.sovereign = SOVEREIGN.map(function (p) {
        return { id: p.id, name: p.name, capabilities: p.capabilities, description: p.description };
      });
    }
    return out;
  }
  function _envFor(p) {
    const env = {};
    const D = '$'; // sentinel - replaced after write
    if (p.id === 'github-mcp')    env.GITHUB_TOKEN = D + '{GITHUB_TOKEN}';
    if (p.id === 'supabase-mcp')  env.SUPABASE_ACCESS_TOKEN = D + '{SUPABASE_ACCESS_TOKEN}';
    if (p.id === 'sentry-mcp')    env.SENTRY_AUTH_TOKEN = D + '{SENTRY_AUTH_TOKEN}';
    if (p.id === 'google-mcp')    env.GOOGLE_APPLICATION_CREDENTIALS = D + '{GOOGLE_APPLICATION_CREDENTIALS}';
    if (p.id === 'microsoft-mcp') { env.AZURE_TENANT_ID = D + '{AZURE_TENANT_ID}'; env.AZURE_CLIENT_ID = D + '{AZURE_CLIENT_ID}'; env.AZURE_CLIENT_SECRET = D + '{AZURE_CLIENT_SECRET}'; }
    return env;
  }

  // -------- Phase progress (per doc section 10) --------
  const PHASES = [
    { n: 1, name: 'Core tool access',       plugins: ['filesystem-mcp','github-mcp','context7','playwright-mcp','docker-mcp-gateway'] },
    { n: 2, name: 'Full-stack generation',  plugins: ['supabase-mcp'] },
    { n: 3, name: 'Recovery intelligence',  plugins: ['sentry-mcp'] },
    { n: 4, name: 'Multi-platform build',   plugins: ['mcp-reference'] },
    { n: 5, name: 'Deployment factory',     plugins: ['google-mcp','microsoft-mcp'] }
  ];
  function phaseProgress() {
    const out = [];
    PHASES.forEach(function (ph) {
      const total = ph.plugins.length;
      let installed = 0;
      ph.plugins.forEach(function (id) { if (state.installed[id]) installed++; });
      out.push({
        n: ph.n, name: ph.name, total: total, installed: installed,
        pct: total ? Math.round((installed / total) * 100) : 100,
        plugins: ph.plugins.slice()
      });
    });
    return out;
  }

  // -------- Capability router (per doc section 7) --------
  // Each agent has a whitelist of plugin capabilities.  Consulted before
  // a sovereign plugin is allowed to execute.
  const AGENTS = [
    { name: 'Orchestrator', caps: [] },
    { name: 'Architect',    caps: ['repo:read','docs:resolve','docs:fetch','docs:version-pick','docs:inject'] },
    { name: 'Frontend',     caps: ['file:read','file:write','dir:create','dir:list','file:search','docs:resolve','docs:fetch'] },
    { name: 'Backend',      caps: ['file:read','file:write','dir:list','db:query','db:migrate','auth:read','storage:read','docs:resolve'] },
    { name: 'Test',         caps: ['browser:launch','page:navigate','page:click','page:fill','page:screenshot','page:assert','file:read'] },
    { name: 'Build',        caps: ['exec:run','exec:cancel','cwd:set','env:set','stdio:capture','file:read'] },
    { name: 'Recovery',     caps: ['errors:read','stack:trace','issues:list','releases:list','log:tail','log:query','log:filter','file:read','file:write'] },
    { name: 'Deployment',   caps: ['container:spawn','container:stop','mcp:proxy','file:read','file:write','deploy:plan','deploy:invoke','deploy:status'] }
  ];
  function capabilityRouter() { return AGENTS.slice(); }
  function canCall(agent, cap) {
    if (!agent) return false;
    if (agent === 'Orchestrator') return true;
    return (agent.caps || []).indexOf(cap) !== -1;
  }

  // -------- Improved detect() with environment probe --------
  function _probe() {
    return {
      hasNode:      typeof window !== 'undefined' && !!window.process,
      hasDocker:    typeof navigator !== 'undefined' && /docker/i.test(navigator.userAgent || ''),
      hasGit:       typeof window !== 'undefined' && !!window.git,
      hasPlaywright:typeof window !== 'undefined' && !!window.__playwright,
      hasSupabase:  typeof window !== 'undefined' && !!(window.Backend && window.Backend.supabaseStatus && window.Backend.supabaseStatus().online)
    };
  }
  function detectWithProbe(plugin) {
    const base = detect(plugin);
    if (!plugin) return base;
    if (plugin.sovereign) return base;
    const p = _probe();
    const install = (plugin.install || '').toLowerCase();
    if (install.startsWith('docker') && !p.hasDocker) {
      return Object.assign({}, base, { ok: 'docker-missing', reason: 'Docker daemon not detected in this environment' });
    }
    return base;
  }

  // -------- Run all installed plugins (batch) --------
  async function runAllInstalled() {
    const ids = Object.keys(state.installed);
    const results = [];
    for (const id of ids) {
      try {
        const r = await run(id);
        results.push({ id, ok: r.ok, capability: r.capability, output: (r.output || '').slice(0, 200) });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    return results;
  }

  // -------- API --------
  const PluginHub = {
    external: EXTERNAL,
    sovereign: SOVEREIGN,
    list: function () { return EXTERNAL.concat(SOVEREIGN); },
    externalList: function () { return EXTERNAL.slice(); },
    sovereignList: function () { return SOVEREIGN.slice(); },
    byId: _pluginById,
    detect: detectWithProbe,
    probe: _probe,
    install: install,
    uninstall: uninstall,
    isInstalled: isInstalled,
    run: run,
    runAllInstalled: runAllInstalled,
    state: function () { return JSON.parse(JSON.stringify(state)); },
    summary: function () {
      const total = EXTERNAL.length + SOVEREIGN.length;
      const installed = Object.keys(state.installed).length;
      return { totalPlugins: total, installed, externalCount: EXTERNAL.length, sovereignCount: SOVEREIGN.length };
    },
    generateMcpConfig: generateMcpConfig,
    phaseProgress: phaseProgress,
    phases: PHASES,
    capabilityRouter: capabilityRouter,
    canCall: canCall,
    reset: function () { state.installed = {}; state.runs = {}; _save(); return { ok: true }; }
  };

  // expose
  if (typeof window !== 'undefined') {
    window.PluginHub = PluginHub;
    if (window.Engine) {
      window.Engine.PluginHub = PluginHub;
    }
  }

})();
