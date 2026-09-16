/* =====================================================================
   engine.loop.js — THINK → ACT → OBSERVE → DIAGNOSE → ACT AGAIN → VERIFY

   Tools the Agent can call on its own. There is no product limit on how
   many calls a task may make; SAFETY_CAP is only a runaway guard.

   Engine.Loop.exec(tool, args)
   Engine.Loop.parse(text)
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
    'generate_image', 'ask_user', 'done'
  ];
  const SAFETY_CAP = 48;
  const DENY_CMD = /rm\s+-rf|curl\s+|wget\s+|powershell|invoke-webrequest|safeStorage|localStorage\.|\/etc\/passwd|child_process/i;

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
      if (!cmd) return { ok: false, tool: name, error: 'cmd required' };
      if (DENY_CMD.test(cmd)) return { ok: false, tool: name, error: 'command blocked' };
      if (window.CSExec && window.CSExec.available && window.CSExec.available() && window.CSExec.run) {
        const parts = cmd.split(/\s+/);
        const r = await window.CSExec.run(parts[0], parts.slice(1), { label: cmd });
        return { ok: r.code === 0, tool: name, code: r.code, output: clip(r.output, 6000) };
      }
      if (/^npm\s+test\b|^npm\s+run\s+test\b/.test(cmd)) {
        const issues = Engine.Validator ? Engine.Validator.runAll() : [];
        return { ok: !issues.filter(function (i) { return i.severity === 'error'; }).length, tool: name, output: 'in-browser tests: ' + issues.length + ' issue(s)', issues: issues.slice(0, 20) };
      }
      return { ok: false, tool: name, error: 'no desktop shell; command not run', cmd: cmd };
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
      const html = Engine.Preview && Engine.Preview.build ? Engine.Preview.build() : '';
      const inspect = Engine.Preview && Engine.Preview.inspect ? Engine.Preview.inspect(html) : null;
      const capture = Engine.Preview && Engine.Preview.capture ? Engine.Preview.capture() : null;
      return { ok: !!html, tool: name, inspect: inspect, capture: capture };
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
    pendingAnswers: pendingAnswers,
    NO_FIXED_LIMIT: true,
    SAFETY_CAP: SAFETY_CAP
  };
})();
