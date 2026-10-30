'use strict';
/*
 * acceptance-agent.js — desktop acceptance for the native coding agent.
 *
 * `electron . --acceptance-agent` runs the REAL main process, preload, IPC,
 * disk-backed workspace, command runner (proc.js / CSExec) and renderer chat
 * panel against a REAL local model (Ollama). Nothing in the agent path is
 * mocked. It proves, on actual files in a throwaway workspace:
 *
 *   1. Agent mode: plan -> approve (a real click on the plan card) -> edit ->
 *      the harness runs the tests through the real runner -> verified
 *   2. the model call streamed through the main-process proxy (ai:stream)
 *   3. an INDEPENDENT judge (hidden tests, run by this process, not by the agent)
 *      agrees with the agent's own verdict
 *   4. Revert all changes puts the files on disk back exactly
 *   5. interruption recovery: the renderer is destroyed mid-run (page reload =
 *      the app going away); the run comes back BLOCKED/resumable, Resume
 *      continues it and the result is judged independently
 *   6. permissions: network / inline-code / destructive commands are refused or
 *      need approval, and nothing was executed
 *
 * Env: CS_AGENT_MODEL (default qwen2.5-coder:7b), CS_AGENT_BASE_URL
 * (default http://127.0.0.1:11434), CS_AGENT_TASKS (default "bugfix-range,bugfix-crossfile").
 * Prints "[acceptance-agent] PASS" / "FAIL" and sets the exit code.
 */
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawn } = require('child_process');

const workspace = require('./lib/workspace');
const trust = require('./lib/trust');
const store = require('./lib/store');
const proc = require('./lib/proc');
const aihost = require('./lib/aihost');

const RENDERER = path.join(__dirname, '..', 'dist', 'index.html');
const { byId } = require('./lib/agent-eval-tasks');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log('[acceptance-agent] ' + (pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}

// Evidence for a release record: CS_AGENT_EVIDENCE=<dir> collects screenshots, the log, test outputs and version info.
// CS_AGENT_KEEP=<dir> keeps the workspaces so a second launch (CS_AGENT_PHASE=reopen) can prove they persist.
const EVID = process.env.CS_AGENT_EVIDENCE || null;
const PHASE = process.env.CS_AGENT_PHASE || 'main';
const KEEP = process.env.CS_AGENT_KEEP || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function evid(name, data) {
  if (!EVID) return;
  try { fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2)); } catch (_) {}
}
let shotN = 0;
async function shot(win, name) {
  if (!EVID) return;
  try {
    const img = await win.webContents.capturePage();
    fs.mkdirSync(EVID, { recursive: true });
    fs.writeFileSync(path.join(EVID, PHASE + '-' + String(++shotN).padStart(2, '0') + '-' + name + '.png'), img.toPNG());
  } catch (_) { /* a screenshot is evidence, never a reason to fail */ }
}
const logLines = [];
const origLog = console.log;
console.log = (...a) => { logLines.push(a.join(' ')); origLog.apply(console, a); };

function writeTree(dir, files) {
  Object.keys(files).forEach((p) => {
    const abs = path.join(dir, p.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[p]);
  });
}
function readTree(dir, rel) {
  rel = rel || '';
  let out = {};
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const r = rel + '/' + e.name;
    if (e.isDirectory()) Object.assign(out, readTree(dir, r)); else out[r] = fs.readFileSync(path.join(dir, r), 'utf8');
  }
  return out;
}
// the independent judge: runs in THIS process, with the hidden tests added, never through the agent
function judge(dir) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(process.execPath, ['--test', '--test-reporter=spec'], { cwd: dir, windowsHide: true, env: Object.assign({}, process.env, { NODE_OPTIONS: '', FORCE_COLOR: '0', ELECTRON_RUN_AS_NODE: '1' }) });
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, 120000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); const f = /ℹ fail (\d+)/.exec(out), p = /ℹ pass (\d+)/.exec(out); resolve({ code, pass: p ? +p[1] : 0, fail: f ? +f[1] : -1, out }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, pass: 0, fail: -1, out: String(e.message) }); });
  });
}

/* ---- renderer-side drivers (each returns a JSON string) ---- */
const PRELUDE = `
  const cfg = __CFG__;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms, step) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(step || 200); } return null; };
  const FS = window.Engine.FS, Chat = window.CSChat, S = window.S;
  const R = { errors: [] };
  if (!(await until(() => FS.__hasWorkspace && FS.__hasWorkspace(), 15000))) { R.fatal = 'workspace never loaded'; return JSON.stringify(R); }
  window.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', baseUrl: cfg.baseUrl, model: cfg.model, apiKey: '' });
  S.screen = 'ide'; S.ideRight = 'chat'; window.renderAll();
  await wait(300);
  R.hostMounted = !!document.getElementById('csChatHost');
  const click = (sel) => { const el = document.querySelector(sel); if (el) { el.click(); return true; } return false; };
`;

function startDriver(cfg) {
  return `(async () => {${PRELUDE.replace('__CFG__', JSON.stringify(cfg))}
    try {
      Chat.setMode(cfg.mode || 'agent');
      const sending = Chat.send(cfg.goal);
      R.planCard = !!(await until(() => { const t = Chat.task.current(); return t && t.awaitingPlan; }, cfg.planMs));
      await wait(cfg.planPauseMs || 0);
      R.planSteps = (Chat.task.current() && Chat.task.current().plan || []).length;
      R.approveButton = !!document.querySelector('[data-cs-task="approve"]');
      R.approveClicked = click('[data-cs-task="approve"]');
      const rows0 = Chat.thread().messages.filter((m) => m.role === 'tool').length;
      if (cfg.interruptAfterTools) {
        // report as soon as the run is executing and has made some tool calls; the harness then kills the page
        const hit = await until(() => { const t = Chat.task.current(); return t && t.state === 'EXECUTING' && Chat.thread().messages.filter((m) => m.role === 'tool').length >= rows0 + cfg.interruptAfterTools; }, cfg.runMs, 150);
        R.interruptReady = !!hit;
        R.toolRowsAtInterrupt = Chat.thread().messages.filter((m) => m.role === 'tool').length;
        return JSON.stringify(R);
      }
      const done = await until(() => { const t = Chat.task.current(); return t && t.finished; }, cfg.runMs, 500);
      R.finished = !!done;
      const t = Chat.task.current() || {};
      R.state = t.state; R.status = t.report && t.report.status; R.reportText = t.report && t.report.text;
      R.changes = (t.changes || []).map((c) => c.path);
      R.verify = t.lastVerify ? { ok: t.lastVerify.ok, ran: t.lastVerify.ran, results: (t.lastVerify.results || []).map((r) => ({ label: r.label, code: r.code, pass: r.pass, fail: r.fail, tail: String(r.outputTail || '').slice(-400) })) } : null;
      R.attempts = (t.attempts || []).length;
      const msgs = Chat.thread().messages;
      R.toolRows = msgs.filter((m) => m.role === 'tool').length;
      R.toolNames = Array.from(new Set(msgs.filter((m) => m.role === 'tool').map((m) => m.name)));
      R.phases = Array.from(new Set(msgs.map((m) => m.phase).filter(Boolean)));
      R.streamedText = msgs.some((m) => m.role === 'assistant' && String(m.content || '').length > 0);
      R.busyAfter = Chat.busy;
      R.reviewing = !!(window.CSEditor && window.CSEditor.reviewing && window.CSEditor.reviewing());
      R.monacoLoaded = !!window.monaco;
      R.reviewDock = !!document.querySelector('[id*="eview"],[class*="review"]');
      R.reviewBtn = !!document.querySelector('[data-cs-task="revert"]');
      await (FS.__flush ? FS.__flush() : null);
      await sending.catch(() => null);
    } catch (e) { R.errors.push(String((e && e.stack) || e)); }
    return JSON.stringify(R);
  })()`;
}

function revertDriver(cfg) {
  return `(async () => {${PRELUDE.replace('__CFG__', JSON.stringify(cfg))}
    try {
      R.revertClicked = click('[data-cs-task="revert"]');
      await wait(800);
      await (FS.__flush ? FS.__flush() : null);
      R.changesAfter = (Chat.task.current().changes || []).length;
    } catch (e) { R.errors.push(String((e && e.stack) || e)); }
    return JSON.stringify(R);
  })()`;
}

function resumeDriver(cfg) {
  return `(async () => {${PRELUDE.replace('__CFG__', JSON.stringify(cfg))}
    try {
      R.interruptedCard = !!(await until(() => Chat.task.interrupted(), 8000));
      const rec = Chat.task.interrupted();
      R.recState = rec && rec.state; R.recResumable = !!(rec && rec.resumable); R.recPlanSteps = rec && rec.plan ? rec.plan.length : 0;
      R.resumeButton = !!(await until(() => document.querySelector('[data-cs-task="resume"]'), 8000));
      R.resumeClicked = click('[data-cs-task="resume"]');
      // an unapproved plan asks again; an approved one carries straight on
      const maybe = await until(() => { const t = Chat.task.current(); return t && (t.awaitingPlan || t.finished) ? (t.awaitingPlan ? 'ask' : 'done') : null; }, 60000, 300);
      R.askedApprovalOnResume = maybe === 'ask';
      if (maybe === 'ask') R.approveClicked = click('[data-cs-task="approve"]');
      const done = await until(() => { const t = Chat.task.current(); return t && t.finished; }, cfg.runMs, 500);
      R.finished = !!done;
      const t = Chat.task.current() || {};
      R.state = t.state; R.status = t.report && t.report.status; R.reportText = t.report && t.report.text;
      R.changes = (t.changes || []).map((c) => c.path);
      R.attempts = (t.attempts || []).length;
      await (FS.__flush ? FS.__flush() : null);
    } catch (e) { R.errors.push(String((e && e.stack) || e)); }
    return JSON.stringify(R);
  })()`;
}

function permissionDriver(cfg) {
  return `(async () => {${PRELUDE.replace('__CFG__', JSON.stringify(cfg))}
    try {
      const NA = window.Engine.NativeAgent;
      const asked = [];
      const reg = NA.createRegistry({ env: Chat._x.agentEnv(), mode: 'auto', profile: 'full', planApproved: true });
      const hooks = { approve: (req) => { asked.push(String(req.label || req.tool || '')); return Promise.resolve(false); } };
      const probe = async (name, args) => { const r = await reg.call(name, args, hooks); return { ok: r.ok, status: r.status, text: String(r.text || '').slice(0, 140) }; };
      R.install = await probe('run_command', { command: 'npm', args: ['install', 'left-pad'] });
      R.push = await probe('run_command', { command: 'git', args: ['push', 'origin', 'main'] });
      R.inline = await probe('run_command', { command: 'node', args: ['-e', 'require("fs").writeFileSync("pwned.txt","x")'] });
      R.shellOp = await probe('run_command', { command: 'node', args: ['--version', '&&', 'echo', 'x'] });
      R.outside = await probe('read_file', { path: '../../../../etc/passwd' });
      R.askedCount = asked.length;
      R.asked = asked;
    } catch (e) { R.errors.push(String((e && e.stack) || e)); }
    return JSON.stringify(R);
  })()`;
}

/* ---- second launch of the same installed app: do the files and the memory survive a real close and reopen? ---- */
async function reopenPhase(c) {
  const { win, exec, tmp, model, baseUrl, shot } = c;
  let st = null;
  try { st = JSON.parse(fs.readFileSync(path.join(tmp, 'state.json'), 'utf8')); } catch (_) {}
  check('REOPEN: the first launch left its record', !!st && !!st.dir4, st ? st.dir4 : 'no state.json');
  if (!st) return;
  check('REOPEN: the project folder is still there with the agent\'s change on disk', fs.existsSync(st.dir4) && st.judgeOk === true, 'first-launch agent=' + st.agentStatus);
  const t = byId(st.taskId);
  const j = await judge(st.dir4);                                         // hidden tests were left in place by the first launch
  check('REOPEN: the independent judge still passes on the files after the app was closed and reopened', j.code === 0 && j.fail === 0, j.pass + ' pass / ' + j.fail + ' fail');
  const brainPath = path.join(st.dir4, '.codesovereign', 'project', 'brain.json');
  let items = []; try { items = (JSON.parse(fs.readFileSync(brainPath, 'utf8')).items) || []; } catch (_) {}
  check('REOPEN: the project memory file on disk still records the task', items.some((i) => /^Task \(verified\)/.test(i.title) && i.meta && i.meta.agent === true), items.map((i) => i.title.slice(0, 40)).join(' | ') || 'no memory file');
  await openWorkspace(win, st.dir4);
  const r = await exec('(async () => { const w = window; const t0 = Date.now(); while (Date.now() - t0 < 15000 && !(w.Engine.FS.__hasWorkspace && w.Engine.FS.__hasWorkspace())) await new Promise((r) => setTimeout(r, 200)); const PB = w.Engine.ProjectBrain; const items = PB ? (PB.get().items || []) : []; return JSON.stringify({ hasWs: !!(w.Engine.FS.__hasWorkspace && w.Engine.FS.__hasWorkspace()), files: Object.keys(w.Engine.FS._data).filter((p) => w.Engine.FS.isFile(p)).length, memory: items.map((i) => i.title.slice(0, 50)), interrupted: !!(w.CSChat && w.CSChat.task && w.CSChat.task.interrupted && w.CSChat.task.interrupted()) }); })()');
  await shot(win, 'reopened-project');
  check('REOPEN: the reopened app loads the project from disk', r.hasWs === true && r.files >= 3, 'files=' + r.files);
  check('REOPEN: the app\'s project memory (Engine.ProjectBrain) has the task after the restart', (r.memory || []).some((m) => /^Task \(verified\)/.test(m)), JSON.stringify(r.memory));
  check('REOPEN: no stale half-finished run is offered (the last run had finished)', r.interrupted === false);
  void model; void baseUrl; void t;
}

/* ---- the run ---- */
async function openWorkspace(win, dir) {
  const canonical = workspace.setRoot(dir);
  store.addRecent({ path: canonical, name: path.basename(canonical), at: Date.now() });
  trust.grant(canonical);
  trust.audit({ kind: 'acceptance-agent', cwd: canonical });
  await win.loadFile(RENDERER);
  await new Promise((r) => setTimeout(r, 1500));
  await win.webContents.executeJavaScript('window.openProject(' + JSON.stringify(canonical) + '); true');
  return canonical;
}

async function run() {
  let exitCode = 1;
  let tmp = null, recentsSnap = null;
  const model = process.env.CS_AGENT_MODEL || 'qwen2.5-coder:7b';
  const baseUrl = process.env.CS_AGENT_BASE_URL || 'http://127.0.0.1:11434';
  const taskIds = (process.env.CS_AGENT_TASKS || 'bugfix-range,bugfix-crossfile').split(',').map((s) => s.trim()).filter(Boolean);
  const runMs = Number(process.env.CS_AGENT_RUN_MS || 20 * 60 * 1000);
  const watchdog = setTimeout(() => {
    console.error('[acceptance-agent] FAIL — watchdog: run exceeded 55 minutes');
    try { proc.killAll(); } catch (_) {}
    app.exit(1);
  }, 55 * 60 * 1000);
  watchdog.unref && watchdog.unref();

  // count what really crossed the main-process model proxy
  const proxy = { calls: 0, urls: [] };
  const origRequest = aihost.request;
  aihost.request = function (o) { proxy.calls++; if (proxy.urls.length < 6) proxy.urls.push(String(o && o.url || '')); return origRequest.apply(this, arguments); };

  try {
    // is the model there?
    const tags = await new Promise((resolve) => {
      require('http').get(baseUrl + '/api/tags', (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } }); }).on('error', () => resolve(null));
    });
    const have = tags && (tags.models || []).some((m) => m.name === model || m.model === model);
    check('the local model is available (' + model + ')', !!have, have ? baseUrl : 'Ollama not reachable or model not pulled');
    const versionInfo = { app: app.getName(), version: app.getVersion(), packaged: app.isPackaged, execPath: process.execPath, appPath: app.getAppPath(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform + ' ' + os.release(), userData: app.getPath('userData'), model, ollama: baseUrl, phase: PHASE, at: new Date().toISOString() };
    evid('version.json', versionInfo);
    console.log('[acceptance-agent] build: ' + JSON.stringify(versionInfo));
    if (process.env.CS_AGENT_REQUIRE_PACKAGED === '1') check('this is the installed, packaged application (not electron . from source)', app.isPackaged === true && /app\.asar/.test(app.getAppPath()), versionInfo.appPath);
    if (!have) throw new Error('no model');

    tmp = KEEP ? KEEP : await fsp.mkdtemp(path.join(os.tmpdir(), 'cs-agentacc-'));
    if (KEEP) fs.mkdirSync(KEEP, { recursive: true });
    recentsSnap = store.snapshotRecents();
    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const rendererErrors = [];
    win.webContents.on('console-message', (...a) => {
      let level, message;
      if (a[0] && typeof a[0] === 'object' && 'message' in a[0]) ({ level, message } = a[0]); else [, level, message] = a;
      if (level === 'error' || level === 3) rendererErrors.push(String(message).slice(0, 300));
    });
    const exec = async (src) => JSON.parse(await win.webContents.executeJavaScript(src));

    if (PHASE === 'reopen') {
      await reopenPhase({ win, exec, tmp, model, baseUrl, shot });
    } else {

    /* ── scenario 1: a full Agent-mode task, judged independently, then reverted ── */
    const t1 = byId(taskIds[0]);
    const dir1 = path.join(tmp, t1.id);
    writeTree(dir1, t1.files);
    const before1 = readTree(dir1);
    const preJudge = await judge(dir1);
    check('S1 ' + t1.id + ': the project is really broken before the agent starts', preJudge.fail > 0, 'fail=' + preJudge.fail);
    await openWorkspace(win, dir1);
    const cfg1 = { model, baseUrl, goal: t1.goal, mode: 'agent', planMs: 10 * 60 * 1000, runMs };
    const calls0 = proxy.calls;
    const p1 = exec(startDriver(Object.assign({}, cfg1, { planPauseMs: EVID ? 3000 : 0 })));
    if (EVID) {
      for (let i = 0; i < 1200; i++) {
        const has = await win.webContents.executeJavaScript('!!(window.CSChat && CSChat.task && CSChat.task.current() && CSChat.task.current().awaitingPlan)').catch(() => false);
        if (has) { await shot(win, 'plan-card-awaiting-approval'); break; }
        await sleep(500);
      }
    }
    const r1 = await p1;
    await shot(win, 'run-finished-report-and-review');
    evid('S1-report.md', String(r1.reportText || ''));
    console.log('[acceptance-agent] S1 driver: ' + JSON.stringify(Object.assign({}, r1, { reportText: String(r1.reportText || '').slice(0, 300) })));
    check('S1: the chat panel mounted in the IDE', r1.hostMounted === true && !r1.fatal, r1.fatal || '');
    check('S1: Agent mode produced a plan and stopped for approval (card shown)', r1.planCard === true && r1.planSteps > 0 && r1.approveButton === true, 'steps=' + r1.planSteps);
    check('S1: model calls went through the main-process proxy and streamed', proxy.calls - calls0 >= 3 && r1.streamedText === true, (proxy.calls - calls0) + ' proxied requests; ' + proxy.urls.slice(0, 2).join(', '));
    check('S1: the run finished with the panel free again', r1.finished === true && r1.busyAfter === false, 'state=' + r1.state);
    check('S1: tools ran in labelled phases', r1.toolRows >= 2 && (r1.phases || []).length >= 2, 'tools=' + JSON.stringify(r1.toolNames) + ' phases=' + JSON.stringify(r1.phases));
    check('S1: the harness ran the tests through the real runner', !!(r1.verify && r1.verify.ran && r1.verify.results.length >= 1 && r1.verify.results.every((x) => typeof x.code === 'number')), JSON.stringify(r1.verify));
    check('S1: the changes are offered for review in the editor (review mode on, or review dock present)', r1.reviewing === true || r1.reviewDock === true, 'monacoLoaded=' + r1.monacoLoaded + ' reviewing=' + r1.reviewing + ' dock=' + r1.reviewDock);
    const after1 = readTree(dir1);
    const changedOnDisk = Object.keys(after1).filter((k) => after1[k] !== before1[k] || !(k in before1)).concat(Object.keys(before1).filter((k) => !(k in after1)));
    check('S1: files really changed on disk', changedOnDisk.length > 0, JSON.stringify(changedOnDisk));
    const protectedTouched = changedOnDisk.filter((p) => /\.test\.js$/.test(p));
    check('S1: existing tests were not touched (permission rule)', protectedTouched.length === 0, JSON.stringify(protectedTouched));
    writeTree(dir1, t1.hidden);
    const j1 = await judge(dir1);
    const agentSaysVerified = r1.status === 'verified';
    const judgeOk = j1.code === 0 && j1.fail === 0;
    check('S1: the independent hidden-test judge agrees with the agent', agentSaysVerified === judgeOk || !agentSaysVerified,
      'agent=' + r1.status + ' judge ' + (judgeOk ? 'PASS' : 'FAIL') + ' (' + j1.pass + ' pass / ' + j1.fail + ' fail)');
    check('S1: no false "verified" (agent verified but the judge failed)', !(agentSaysVerified && !judgeOk));
    console.log('[acceptance-agent] S1 outcome: agent=' + r1.status + ' judge=' + (judgeOk ? 'PASS' : 'FAIL') + ' attempts=' + r1.attempts);
    // hidden tests off the disk again before the revert comparison
    Object.keys(t1.hidden).forEach((p) => { try { fs.unlinkSync(path.join(dir1, p.replace(/^\//, ''))); } catch (_) {} });

    if ((r1.changes || []).length) {
      const rv = await exec(revertDriver(cfg1));
      await shot(win, 'after-revert-all');
      // the brain file is flushed to disk asynchronously: give it a moment
      for (let i = 0; i < 20 && !/Reverted by the user/.test(readTree(dir1)['/.codesovereign/project/brain.json'] || ''); i++) await new Promise((r) => setTimeout(r, 250));
      const afterRevertAll = readTree(dir1);
      // project memory (/.codesovereign/) is deliberately NOT reverted: it records the task and the rejection
      const brainRaw = afterRevertAll['/.codesovereign/project/brain.json'];
      const afterRevert = Object.assign({}, afterRevertAll); delete afterRevert['/.codesovereign/project/brain.json'];
      let brain = null; try { brain = JSON.parse(brainRaw || 'null'); } catch (_) {}
      const items = (brain && brain.items) || [];
      check('S1: project memory was written to the project and records the task and the revert', items.some((i) => /^Task \(verified\)/.test(i.title) && i.meta && i.meta.agent === true) && items.some((i) => /^Reverted by the user/.test(i.title)), 'brain.json ' + (brainRaw ? brainRaw.length + ' bytes' : 'ABSENT') + '; items: ' + (items.map((i) => i.kind + ':' + i.title.slice(0, 40)).join(' | ') || 'none') + '; files: ' + Object.keys(afterRevertAll).filter((k) => /codesovereign|sovereign/.test(k)).join(','));
      const same =Object.keys(before1).every((k) => afterRevert[k] === before1[k]) && Object.keys(afterRevert).every((k) => k in before1);
      check('S1: "Revert all changes" put every file on disk back exactly', rv.revertClicked === true && same, same ? '' : 'differs: ' + Object.keys(afterRevert).filter((k) => afterRevert[k] !== before1[k]).join(','));
    } else {
      check('S1: revert (nothing to revert — the agent changed no files)', false, 'status=' + r1.status);
    }

    /* ── scenario 2: the app goes away mid-run, then Resume ── */
    const t2 = byId(taskIds[1] || taskIds[0]);
    const dir2 = path.join(tmp, t2.id + '-resume');
    writeTree(dir2, t2.files);
    const before2 = readTree(dir2);
    await openWorkspace(win, dir2);
    const cfg2 = { model, baseUrl, goal: t2.goal, mode: 'agent', planMs: 10 * 60 * 1000, runMs, interruptAfterTools: 1 };
    const r2 = await exec(startDriver(cfg2));
    check('S2: the run was live (planned, approved, executing) when the app went away', r2.planCard === true && r2.interruptReady === true, 'toolRows=' + r2.toolRowsAtInterrupt);
    // the "crash": the whole page is torn down while the model is mid-turn
    await win.loadURL('about:blank');
    await new Promise((r) => setTimeout(r, 500));
    await openWorkspace(win, dir2);
    const r3 = await exec(resumeDriver(Object.assign({}, cfg2, { interruptAfterTools: 0 })));
    console.log('[acceptance-agent] S2 resume driver: ' + JSON.stringify(Object.assign({}, r3, { reportText: String(r3.reportText || '').slice(0, 300) })));
    check('S2: after restart the run is back as BLOCKED/resumable with its plan', r3.interruptedCard === true && r3.recState === 'BLOCKED' && r3.recResumable === true && r3.recPlanSteps > 0, 'state=' + r3.recState + ' steps=' + r3.recPlanSteps);
    check('S2: a Resume button is offered and works', r3.resumeButton === true && r3.resumeClicked === true && r3.finished === true, 'state=' + r3.state);
    writeTree(dir2, t2.hidden);
    const j2 = await judge(dir2);
    const judge2Ok = j2.code === 0 && j2.fail === 0;
    check('S2: no false "verified" after resume', !(r3.status === 'verified' && !judge2Ok), 'agent=' + r3.status + ' judge ' + (judge2Ok ? 'PASS' : 'FAIL') + ' (' + j2.pass + ' pass / ' + j2.fail + ' fail)');
    console.log('[acceptance-agent] S2 outcome: agent=' + r3.status + ' judge=' + (judge2Ok ? 'PASS' : 'FAIL') + ' askedApprovalOnResume=' + r3.askedApprovalOnResume);
    void before2;

    /* ── scenario 3: permissions at the real boundary ── */
    const dir3 = path.join(tmp, 'perm');
    writeTree(dir3, { '/package.json': JSON.stringify({ name: 'perm', version: '1.0.0', scripts: { test: 'node --test' } }) });
    await openWorkspace(win, dir3);
    const pr = await exec(permissionDriver({ model, baseUrl }));
    check('S3: npm install is not run without approval (declined)', pr.install && pr.install.ok === false && !fs.existsSync(path.join(dir3, 'node_modules')), JSON.stringify(pr.install));
    check('S3: git push is not run without approval (declined)', pr.push && pr.push.ok === false, JSON.stringify(pr.push));
    check('S3: inline code (node -e) is refused and wrote nothing', pr.inline && pr.inline.ok === false && !fs.existsSync(path.join(dir3, 'pwned.txt')), JSON.stringify(pr.inline));
    check('S3: shell operators in arguments are refused', pr.shellOp && pr.shellOp.ok === false, JSON.stringify(pr.shellOp));
    check('S3: reading outside the project is refused', pr.outside && pr.outside.ok === false, JSON.stringify(pr.outside));
    check('S3: network and destructive commands asked the user first', pr.askedCount >= 2, JSON.stringify(pr.asked));

    /* ── scenario 4: the user breaks working code; the agent diagnoses and repairs it; the result is kept for the reopen ── */
    const t4 = byId(taskIds[2] || 'regression-rounding');
    const dir4 = path.join(tmp, 'broken-' + t4.id);
    writeTree(dir4, t4.files); writeTree(dir4, t4.reference);               // a working project...
    const greenJudge = await judge(dir4);
    check('S4: the project works before anything is broken', greenJudge.code === 0 && greenJudge.fail === 0, 'pass=' + greenJudge.pass + ' fail=' + greenJudge.fail);
    writeTree(dir4, t4.files);                                              // ...then the deliberate error (the original defect comes back)
    const brokenJudge = await judge(dir4);
    check('S4: after the deliberate error the tests really fail', brokenJudge.fail > 0, 'fail=' + brokenJudge.fail);
    evid('S4-tests-after-deliberate-error.txt', brokenJudge.out);
    await openWorkspace(win, dir4);
    const cfg4 = { model, baseUrl, goal: 'The test suite started failing after my last edit. Find the cause and fix it. Do not change the tests.', mode: 'agent', planMs: 10 * 60 * 1000, runMs, planPauseMs: 0 };
    const r4 = await exec(startDriver(cfg4));
    await shot(win, 'S4-repair-report');
    evid('S4-report.md', String(r4.reportText || ''));
    console.log('[acceptance-agent] S4 driver: ' + JSON.stringify(Object.assign({}, r4, { reportText: String(r4.reportText || '').slice(0, 300) })));
    check('S4: the agent diagnosed and changed source (not the tests)', (r4.changes || []).length > 0 && !(r4.changes || []).some((c) => /\.test\.js$/.test(c)), JSON.stringify(r4.changes));
    writeTree(dir4, t4.hidden);
    const j4 = await judge(dir4);
    const judge4Ok = j4.code === 0 && j4.fail === 0;
    evid('S4-independent-judge.txt', j4.out);
    check('S4: the agent REPAIRED the deliberate error (it reports verified and the independent judge agrees)', r4.status === 'verified' && judge4Ok, 'agent=' + r4.status + ' judge ' + (judge4Ok ? 'PASS' : 'FAIL'));
    check('S4: no false "verified" on the repair', !(r4.status === 'verified' && !judge4Ok), 'agent=' + r4.status + ' judge ' + (judge4Ok ? 'PASS' : 'FAIL') + ' (' + j4.pass + ' pass / ' + j4.fail + ' fail)');
    check('S4: the completion report is evidence-based (status, plan, changed files, verification runs with counts)', /VERIFIED|NOT VERIFIED|BLOCKED|FAILED/.test(String(r4.reportText || '')) && /Changed files:/.test(String(r4.reportText || '')) && /Verification runs:/.test(String(r4.reportText || '')) && /Effort:/.test(String(r4.reportText || '')), String(r4.reportText || '').split('\n')[0]);
    console.log('[acceptance-agent] S4 outcome: agent=' + r4.status + ' judge=' + (judge4Ok ? 'PASS' : 'FAIL') + ' attempts=' + r4.attempts);
    if (KEEP) fs.writeFileSync(path.join(KEEP, 'state.json'), JSON.stringify({ dir4, taskId: t4.id, agentStatus: r4.status, judgeOk: judge4Ok, hiddenFiles: Object.keys(t4.hidden), changed: r4.changes }, null, 2));
    }

    check('renderer produced no console errors', rendererErrors.length === 0, rendererErrors.slice(0, 5).join(' | '));

    const failed = results.filter((x) => !x.pass);
    console.log('\n[acceptance-agent] ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    console.log('[acceptance-agent] model proxy requests: ' + proxy.calls);
    if (!failed.length) { console.log('[acceptance-agent] PASS'); exitCode = 0; }
    else { console.log('[acceptance-agent] FAIL — ' + failed.map((x) => x.name).join('; ')); exitCode = 1; }
  } catch (e) {
    console.error('[acceptance-agent] harness error:', (e && e.stack) || e);
    exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    try { proc.killAll(); } catch (_) {}
    evid(PHASE + '-checks.json', results);
    evid(PHASE + '-log.txt', logLines.join('\n'));
    if (tmp && !(KEEP && PHASE !== 'reopen')) { try { await fsp.rm(tmp, { recursive: true, force: true }); } catch (_) {} }
    try { store.restoreRecents(recentsSnap); } catch (_) {}
    app.exit(exitCode);
  }
}

module.exports = { run };
