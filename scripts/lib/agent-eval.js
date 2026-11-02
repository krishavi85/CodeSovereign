'use strict';
/*
 * Eval harness for the native agent (Engine.NativeAgent). It runs the agent
 * against small real projects in temp directories, with real file I/O and real
 * `npm test` execution, and judges success INDEPENDENTLY: after the run it adds
 * the task's hidden tests and runs `node --test` itself. The agent's own claim
 * of success is recorded but never counts.
 *
 *   const { loadRuntime, runTrial } = require('./lib/agent-eval');
 *
 * The model is pluggable: pass `chatStream` (e.g. a scripted mock for plumbing
 * tests) or let it use Engine.LLM.chatStream against Ollama / any
 * OpenAI-compatible endpoint.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const spawn = require('cross-spawn');

const DIST = path.join(__dirname, '..', '..', 'dist');
const SKIP = /(^|\/)(node_modules|\.git)(\/|$)/;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function loadRuntime(opts) {
  opts = opts || {};
  const store = {};
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, TextDecoder, URL, fetch,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['vendor/acorn.js', 'engine.js', 'engine.llm.js', 'app.chat.agent.js', 'engine.repointel.js', 'engine.nagent.js']) {
    vm.runInContext(fs.readFileSync(path.join(DIST, f), 'utf8'), ctx, { filename: f });
  }
  if (opts.model) {
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', baseUrl: opts.baseUrl || 'http://127.0.0.1:11434', model: opts.model, apiKey: '' });
  }
  return { win, LLM: win.Engine.LLM, NA: win.Engine.NativeAgent };
}

function writeTree(dir, files) {
  Object.keys(files).forEach((p) => {
    const abs = path.join(dir, p.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[p]);
  });
}

function listTree(dir, rel) {
  rel = rel || '';
  let out = [];
  fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).forEach((e) => {
    const r = rel + '/' + e.name;
    if (SKIP.test(r)) return;
    if (e.isDirectory()) out = out.concat(listTree(dir, r)); else out.push(r);
  });
  return out;
}

// Runs a command in dir; resolves { code, output, ms, timedOut }.
function sh(dir, cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = '', timedOut = false;
    const child = spawn(cmd, args, { cwd: dir, windowsHide: true, env: Object.assign({}, process.env, { CI: '', FORCE_COLOR: '0', NODE_OPTIONS: '' }) });
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch (_) {} }, timeoutMs || 120000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, output: String(e.message), ms: Date.now() - t0, timedOut: false }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: timedOut ? -2 : code == null ? -1 : code, output: out.replace(ANSI, ''), ms: Date.now() - t0, timedOut }); });
  });
}

function makeEnv(dir) {
  return {
    root: dir,
    list: () => listTree(dir),
    read: (p) => { try { return fs.readFileSync(path.join(dir, p.replace(/^\//, '')), 'utf8'); } catch (_) { return null; } },
    write: (p, c) => { const abs = path.join(dir, p.replace(/^\//, '')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, c); },
    remove: (p) => { try { fs.unlinkSync(path.join(dir, p.replace(/^\//, ''))); } catch (_) {} },
    isDirty: () => false,
    diffStats: (a, b) => { const A = String(a || '').split('\n'), B = String(b || '').split('\n'); return { added: B.filter((l) => A.indexOf(l) < 0).length, removed: A.filter((l) => B.indexOf(l) < 0).length }; },
    canWrite: () => true, canCommand: () => true, canNetwork: () => false,
    store: (() => { const m = {}; return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; } }; })(),
    exec: (spec, o) => {
      const t = (o && o.timeoutMs) || 120000;
      if (spec.kind === 'job' && spec.job === 'test') return sh(dir, 'npm', ['test'], t);
      if (spec.kind === 'job' && spec.job === 'build') return sh(dir, 'npm', ['run', 'build'], t);
      if (spec.kind === 'cmd') return sh(dir, spec.cmd, spec.args || [], t);
      if (spec.kind === 'script') return sh(dir, 'npm', ['run', spec.script], t);
      return Promise.resolve({ code: -1, output: 'unsupported spec', ms: 0 });
    }
  };
}

// One trial of one task. opts: { rt, task, mode, chatStream?, chatOptions?, budgets?, timeoutMs?, keepDir? }
async function runTrial(opts) {
  const task = opts.task, rt = opts.rt, NA = rt.NA;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-eval-' + task.id + '-'));
  writeTree(dir, task.files);
  const env = makeEnv(dir);
  const events = { turns: 0, toolCalls: 0, tools: {}, states: [], attempts: 0, errors: [], trace: [], policyBlocked: 0 };
  const ac = new AbortController();
  const budgets = Object.assign({ maxTurns: 12, maxToolCalls: 60, maxRepairs: 2, maxMs: opts.timeoutMs || 20 * 60 * 1000, contextChars: 20000, execTimeoutMs: 120000 }, opts.budgets || {});
  const timer = setTimeout(() => ac.abort(), budgets.maxMs + 30000);
  // resource accounting: what the agent asked of the model, and the CPU the harness process itself used
  const io = { calls: 0, promptChars: 0, replyChars: 0 };
  const baseStream = opts.chatStream || ((m, o) => rt.LLM.chatStream(m, o));
  const chatStream = (m, o) => { io.calls++; try { io.promptChars += JSON.stringify(m).length; } catch (_) {} return Promise.resolve(baseStream(m, o)).then((r) => { io.replyChars += String((r && r.text) || '').length; return r; }); };
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  let result = null, crashed = null;
  try {
    result = await NA.runTask({
      goal: task.goal, mode: opts.mode || 'auto', env, chatStream, signal: ac.signal, budgets, toolset: opts.toolset || 'compact', chatOptions: opts.chatOptions,
      hooks: {
        onState: (s) => events.states.push(s),
        onTurnStart: () => { events.turns++; },
        onToolStart: (c) => { events.toolCalls++; events.tools[c.name] = (events.tools[c.name] || 0) + 1; },
        onToolDone: (c, r) => {
          if (r && (r.status === 'blocked' || r.status === 'denied')) events.policyBlocked++;
          if (!r.ok) events.errors.push(c.name + ': ' + String(r.summary || r.text).slice(0, 100));
          if (events.trace.length < 80) events.trace.push({ tool: c.name, args: JSON.stringify(c.args).slice(0, 160), ok: r.ok, result: String(r.summary || r.text).slice(0, 160) });
        },
        onAttempt: () => { events.attempts++; },
        approvePlan: () => true, approve: () => Promise.resolve(false)
      }
    });
  } catch (e) { crashed = String((e && e.stack) || e); }
  clearTimeout(timer);
  const ms = Date.now() - t0;

  // INDEPENDENT judgement: hidden tests + the visible ones, run fresh by the harness
  writeTree(dir, task.hidden || {});
  const judge = await sh(dir, 'node', ['--test', '--test-reporter=spec'], 120000);
  const m = /ℹ pass (\d+)/.exec(judge.output), f = /ℹ fail (\d+)/.exec(judge.output);
  const out = {
    task: task.id, status: result ? result.report.status : 'crashed', success: judge.code === 0 && !!m && Number(m[1]) > 0,
    judge: { code: judge.code, pass: m ? Number(m[1]) : null, fail: f ? Number(f[1]) : null },
    ms, turns: events.turns, toolCalls: events.toolCalls, tools: events.tools, attempts: events.attempts, states: events.states,
    changed: result ? result.changes.map((c) => c.path + ' (' + c.status + ')') : [], toolErrors: events.errors.slice(0, 8),
    verification: result ? result.run.verification.map((v) => v.ok) : [], note: result ? result.run.note : '', crashed, trace: events.trace,
    report: result ? result.report.text : null, dir: opts.keepDir ? dir : null,
    // permission accounting: refused attempts are the policy working; a protected file that really changed is a violation
    policyBlocked: events.policyBlocked,
    resources: { modelCalls: io.calls, promptKChars: Math.round(io.promptChars / 100) / 10, replyKChars: Math.round(io.replyChars / 100) / 10, harnessCpuSeconds: Math.round((process.cpuUsage(cpu0).user + process.cpuUsage(cpu0).system) / 1e5) / 10 },
    violations: (result ? result.changes : []).filter((c) => /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(c.path)).map((c) => 'protected test file changed: ' + c.path),
    indexed: !!(result && result.registry && result.registry.intel)
  };
  if (!opts.keepDir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  return out;
}

module.exports = { loadRuntime, runTrial, makeEnv, writeTree, sh, listTree };
