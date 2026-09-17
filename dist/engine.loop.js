/* =====================================================================
   engine.loop.js — THINK → ACT → OBSERVE → DIAGNOSE → ACT AGAIN → VERIFY

   Tools the Agent can call on its own. There is no product limit on how
   many calls a task may make; SAFETY_CAP is only a runaway guard.

   Engine.Loop.exec(tool, args)
   Engine.Loop.parse(text)
   Engine.Loop.planCommand(cmd) / assertSafeCommand(cmd)
   Engine.Loop.tools
   Engine.Loop.NO_FIXED_LIMIT
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});
  const TOOLS = [
    'think', 'list_dir', 'glob', 'grep', 'read_file',
    'write_file', 'create_file', 'delete_file',
    'run_command', 'install_deps', 'run_tests',
    'observe', 'web_search', 'browser', 'mcp',
    'generate_image', 'ask_user', 'delegate', 'done'
  ];
  const SAFETY_CAP = 48;
  const DENY_CMD = /rm\s+-rf|curl\s+|wget\s+|powershell|invoke-webrequest|safeStorage|localStorage\.|\/etc\/passwd|child_process/i;
  const SHELL_META = /[;&|`$<>(){}[\]\\'"\n\r]/;
  const EVAL_FLAG = /^(-e|-c|-p|--eval|--print|--exec)$/i;
  const ABS_OR_URL = /^(?:\/|[A-Za-z]:[\\/]|\\\\|file:|git\+|ssh:|https?:|ftp:)/i;
  const ESCAPE = /\.\.(?:[\\/]|$)|(?:^|[\\/])\.\./;
  const SAFE_SCRIPT = /^[A-Za-z][A-Za-z0-9:_-]*$/;
  const JOB_SCRIPTS = {
    test: true, tests: true, 'test:unit': true, 'test:ci': true,
    build: true, 'build:prod': true, compile: true, dist: true,
    lint: true, 'lint:js': true, eslint: true,
    typecheck: true, 'type-check': true, tsc: true, types: true
  };

  function scriptJob(name) {
    const key = String(name || '').toLowerCase();
    if (key === 'test' || key === 'tests' || key === 'test:unit' || key === 'test:ci') return 'test';
    if (key === 'build' || key === 'build:prod' || key === 'compile' || key === 'dist') return 'build';
    if (key === 'lint' || key === 'lint:js' || key === 'eslint') return 'lint';
    if (key === 'typecheck' || key === 'type-check' || key === 'tsc' || key === 'types') return 'typecheck';
    return null;
  }

  function basenameCmd(tok) {
    return String(tok || '').replace(/^.*[\\/]/, '').replace(/\.(cmd|exe|bat|ps1)$/i, '').toLowerCase();
  }

  function argvUnsafe(parts) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (EVAL_FLAG.test(p)) return true;
      if (ABS_OR_URL.test(p) || ESCAPE.test(p) || p.indexOf('..') >= 0) return true;
      if (/^(--prefix|--cwd|--workdir|--dir|-C|--global|--prefix=)/i.test(p)) return true;
    }
    return false;
  }

  function planCommand(cmd) {
    const raw = String(cmd == null ? '' : cmd).trim();
    if (!raw) return { ok: false, error: 'cmd required' };
    if (SHELL_META.test(raw) || DENY_CMD.test(raw)) return { ok: false, error: 'command blocked' };
    const parts = raw.split(/\s+/).filter(Boolean);
    if (!parts.length || argvUnsafe(parts)) return { ok: false, error: 'command blocked' };
    const bin = basenameCmd(parts[0]);
    const args = parts.slice(1);
    if (bin === 'npm' || bin === 'pnpm' || bin === 'yarn' || bin === 'bun') {
      const a0 = String(args[0] || '').toLowerCase();
      if ((a0 === 'install' || a0 === 'ci' || (bin === 'yarn' && args.length === 0)) && args.length <= 1) {
        return { ok: true, job: 'install', pm: bin, argv: args.length ? [bin, a0] : [bin] };
      }
      if (a0 === 'test' && args.length === 1) {
        return { ok: true, job: 'test', pm: bin, argv: [bin, 'test'] };
      }
      if ((a0 === 'run' || a0 === 'run-script') && args.length === 2 && SAFE_SCRIPT.test(args[1]) && JOB_SCRIPTS[args[1].toLowerCase()]) {
        const job = scriptJob(args[1]);
        return { ok: true, job: job, pm: bin, script: args[1], argv: [bin, 'run', args[1]] };
      }
      if (bin === 'yarn' && args.length === 1 && SAFE_SCRIPT.test(args[0]) && JOB_SCRIPTS[args[0].toLowerCase()]) {
        const job = scriptJob(args[0]);
        return { ok: true, job: job, pm: bin, script: args[0], argv: [bin, args[0]] };
      }
      return { ok: false, error: 'command not in workspace job allowlist' };
    }
    if (bin === 'npx') {
      const rest = args.filter(function (a) { return a !== '--yes' && a !== '-y'; });
      if (rest[0] === 'eslint' && rest.length <= 2 && (rest.length === 1 || rest[1] === '.')) {
        return { ok: true, job: 'lint', pm: 'npx', argv: ['npx', 'eslint', '.'] };
      }
      if (rest[0] === 'tsc' && rest.length === 2 && rest[1] === '--noEmit') {
        return { ok: true, job: 'typecheck', pm: 'npx', argv: ['npx', 'tsc', '--noEmit'] };
      }
      return { ok: false, error: 'command not in workspace job allowlist' };
    }
    return { ok: false, error: 'command not in workspace job allowlist' };
  }

  function assertSafeCommand(cmd) {
    const plan = planCommand(cmd);
    if (!plan.ok) {
      const err = new Error(plan.error || 'command blocked');
      err.code = 'ECMD';
      throw err;
    }
    return plan;
  }

  function llm() { return Engine.LLM || {}; }

  function parse(text) {
    const LLM = llm();
    const parsed = LLM.extractJson ? LLM.extractJson(text) : null;
    const filesParsed = LLM.extractFilesFromText ? LLM.extractFilesFromText(text) : null;
    if (filesParsed && filesParsed.files && filesParsed.files.length) {
      return { kind: 'files', think: parsed && parsed.think, plan: filesParsed };
    }
    if (parsed && parsed.tool) {
      const tool = String(parsed.tool).replace(/[A-Z]/g, function (ch) { return '_' + ch.toLowerCase(); }).replace(/^_/, '');
      const alias = tool === 'write_files' ? 'write_file' : (tool === 'mcp_call' ? 'mcp' : tool);
      return { kind: 'tool', think: parsed.think || '', tool: alias, args: parsed.args || parsed };
    }
    return { kind: 'invalid', think: parsed && parsed.think };
  }

  function clip(s, n) {
    s = String(s == null ? '' : s);
    n = n || 4000;
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  async function exec(tool, args) {
    args = args || {};
    const LLM = llm();
    const FS = Engine.FS;
    const name = String(tool || '').replace(/-/g, '_');

    if (name === 'think') {
      return { ok: true, tool: name, think: String(args.text || args.think || '') };
    }
    if (name === 'list_dir') {
      const r = LLM.listDir ? LLM.listDir(args.path || args.dir || '/') : { entries: [] };
      return { ok: true, tool: name, result: r };
    }
    if (name === 'glob') {
      const r = LLM.glob ? LLM.glob(args.pattern || args.glob || '**/*') : { paths: [] };
      return { ok: true, tool: name, result: r };
    }
    if (name === 'grep') {
      const r = LLM.grep ? LLM.grep(args.query || args.pattern || '', args) : { hits: [] };
      return { ok: true, tool: name, result: r };
    }
    if (name === 'read_file') {
      const r = LLM.readFile ? LLM.readFile(args.path, args) : { content: FS && FS.read && FS.read(args.path) };
      return { ok: true, tool: name, path: args.path, result: r };
    }
    if (name === 'write_file' || name === 'create_file') {
      const files = Array.isArray(args.files) ? args.files : [{ path: args.path, content: args.content }];
      const written = [];
      files.forEach(function (f) {
        if (!f || !f.path || typeof f.content !== 'string') return;
        const p = f.path.charAt(0) === '/' ? f.path : '/' + f.path;
        try { FS.write(p, f.content); written.push(p); } catch (e) { written.push({ path: p, error: String(e.message || e) }); }
      });
      return { ok: written.length > 0, tool: name, written: written };
    }
    if (name === 'delete_file') {
      const p = args.path;
      if (!p) return { ok: false, tool: name, error: 'path required' };
      try { FS.remove(p); return { ok: true, tool: name, deleted: p }; }
      catch (e) { return { ok: false, tool: name, error: String(e.message || e) }; }
    }
    if (name === 'run_command') {
      const cmd = String(args.cmd || args.command || '').trim();
      let plan;
      try { plan = assertSafeCommand(cmd); }
      catch (e) { return { ok: false, tool: name, error: String(e.message || e), cmd: cmd }; }
      const ex = window.CSExec;
      const desktop = !!(ex && ex.available && ex.available());
      async function viaJob(fn, fallback) {
        if (desktop && typeof ex[fn] === 'function') {
          const r = await ex[fn]();
          return { ok: r.code === 0, tool: name, job: plan.job, code: r.code, output: clip(r.output, 6000) };
        }
        return fallback();
      }
      if (plan.job === 'install') {
        return viaJob('install', function () {
          return { ok: true, tool: name, job: 'install', skipped: true, note: 'recorded install; desktop npm install when available' };
        });
      }
      if (plan.job === 'test') {
        return viaJob('test', function () {
          const issues = Engine.Validator ? Engine.Validator.runAll() : [];
          return { ok: !issues.filter(function (i) { return i.severity === 'error'; }).length, tool: name, job: 'test', output: 'in-browser tests: ' + issues.length + ' issue(s)', issues: issues.slice(0, 20) };
        });
      }
      if (plan.job === 'build') {
        return viaJob('build', function () {
          return { ok: false, tool: name, job: 'build', error: 'no desktop shell; command not run', cmd: cmd };
        });
      }
      if (plan.job === 'lint') {
        return viaJob('lint', function () {
          return { ok: false, tool: name, job: 'lint', error: 'no desktop shell; command not run', cmd: cmd };
        });
      }
      if (plan.job === 'typecheck') {
        return viaJob('typecheck', function () {
          return { ok: false, tool: name, job: 'typecheck', error: 'no desktop shell; command not run', cmd: cmd };
        });
      }
      return { ok: false, tool: name, error: 'command not in workspace job allowlist', cmd: cmd };
    }
    if (name === 'install_deps') {
      const deps = LLM.scanDeps ? LLM.scanDeps() : null;
      if (window.CSExec && window.CSExec.install && window.CSExec.available && window.CSExec.available()) {
        const r = await window.CSExec.install();
        return { ok: r.code === 0, tool: name, output: clip(r.output, 4000), deps: deps };
      }
      return { ok: true, tool: name, skipped: true, deps: deps, note: 'recorded install strategy; desktop npm install when available' };
    }
    if (name === 'run_tests') {
      if (window.CSExec && window.CSExec.test && window.CSExec.available && window.CSExec.available()) {
        const r = await window.CSExec.test();
        return { ok: r.code === 0, tool: name, code: r.code, output: clip(r.output, 6000) };
      }
      const issues = Engine.Validator ? Engine.Validator.runAll() : [];
      const mocks = Engine.MockScan && Engine.MockScan.run ? Engine.MockScan.run() : null;
      const errors = issues.filter(function (i) { return i.severity === 'error'; });
      return { ok: errors.length === 0, tool: name, issues: issues.slice(0, 30), mocks: mocks, output: errors.length ? (errors.length + ' error(s)') : 'validators clean' };
    }
    if (name === 'observe') {
      const obs = LLM.observeRuntime ? LLM.observeRuntime([]) : {};
      const judged = LLM.evaluateBuild ? LLM.evaluateBuild([], obs, obs.quality || { score: 0, pass: false, reasons: [] }) : { quality: obs.quality };
      return { ok: true, tool: name, observation: obs, judged: judged };
    }
    if (name === 'web_search') {
      const q = String(args.query || args.q || '');
      const grep = LLM.grep ? LLM.grep(q, { maxHits: 12 }) : { hits: [] };
      const catalog = (Engine.BuildingStack && Engine.BuildingStack.catalog)
        ? Engine.BuildingStack.catalog().filter(function (e) {
          return (e.name + e.link + (e.role || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0;
        }).slice(0, 6).map(function (e) { return { name: e.name, link: e.link, role: e.role }; })
        : [];
      return {
        ok: true,
        tool: name,
        query: q,
        liveWeb: false,
        note: 'App CSP does not allow arbitrary web search; results are repo hits plus the local engine catalog.',
        hits: grep.hits || [],
        catalog: catalog
      };
    }
    if (name === 'browser') {
      const B = Engine.Browser;
      if (B && B.experience) {
        if (args.action || args.op) {
          if (!B.session().opened) await B.navigate(args.url || 'preview');
          const act = await B.act(args.action || args.op, args);
          return { ok: !!act.ok, tool: name, action: act, console: B.console(), network: B.network(), screenshot: B.screenshot() };
        }
        const nav = await B.navigate(args.url || args.href || 'preview');
        return { ok: !!nav.ok, tool: name, inspect: nav.inspect, capture: B.screenshot(), console: B.console(), network: B.network(), cookies: B.session().cookies };
      }
      const html = Engine.Preview && Engine.Preview.build ? Engine.Preview.build() : '';
      const inspect = Engine.Preview && Engine.Preview.inspect ? Engine.Preview.inspect(html) : null;
      const capture = Engine.Preview && Engine.Preview.capture ? Engine.Preview.capture() : null;
      return { ok: !!html, tool: name, inspect: inspect, capture: capture };
    }
    if (name === 'delegate') {
      const Swarm = Engine.Swarm;
      if (!Swarm || !Swarm.spawn) return { ok: false, tool: name, error: 'swarm not loaded' };
      const rec = Swarm.spawn({ role: args.role || args.agent, task: args.task || args.text, isolation: args.isolation, instructions: args.instructions, model: args.model });
      const r = await Swarm.run(rec.id, args.task || args.text || '');
      return { ok: !!r.ok, tool: name, agent: rec, result: r };
    }
    if (name === 'mcp') {
      const hub = window.PluginHub || Engine.PluginHub;
      if (!hub || !hub.run) return { ok: false, tool: name, error: 'Plugin hub not loaded' };
      const id = args.id || args.plugin || args.server;
      const r = await hub.run(id, args.args || args);
      return { ok: !!(r && r.ok), tool: name, result: r };
    }
    if (name === 'generate_image') {
      const title = String(args.title || args.prompt || 'image').slice(0, 80);
      const path = args.path || ('/assets/' + title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.svg');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">'
        + '<rect width="640" height="400" fill="#0b0d12"/>'
        + '<text x="32" y="200" fill="#e6e9f2" font-size="22" font-family="Inter,system-ui,sans-serif">'
        + String(title).replace(/[<>&]/g, '') + '</text></svg>';
      try { FS.write(path, svg); } catch (e) { return { ok: false, tool: name, error: String(e.message || e) }; }
      return { ok: true, tool: name, path: path, kind: 'svg' };
    }
    if (name === 'ask_user') {
      const q = String(args.question || args.text || '').trim();
      if (!q) return { ok: false, tool: name, error: 'question required' };
      const item = { id: 'q_' + Date.now().toString(36), question: q, answer: null, at: Date.now() };
      try {
        const S = window.S || (window.S = {});
        S.agentQuestions = (S.agentQuestions || []).concat([item]).slice(-12);
      } catch (_) {}
      return { ok: true, tool: name, asked: true, continued: true, id: item.id, question: q };
    }
    if (name === 'done') {
      return { ok: true, tool: name, summary: String(args.summary || args.text || 'done') };
    }
    return { ok: false, tool: name, error: 'unknown tool' };
  }

  function pendingAnswers() {
    try {
      return (window.S && window.S.agentQuestions || []).filter(function (q) { return q && q.answer; });
    } catch (_) { return []; }
  }

  Engine.Loop = {
    tools: TOOLS,
    exec: exec,
    parse: parse,
    planCommand: planCommand,
    assertSafeCommand: assertSafeCommand,
    pendingAnswers: pendingAnswers,
    NO_FIXED_LIMIT: true,
    SAFETY_CAP: SAFETY_CAP
  };
})();
