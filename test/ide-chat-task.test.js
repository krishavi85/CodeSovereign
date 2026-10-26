'use strict';
/* IDE chat, task modes (dist/app.chat.task.js): Plan, Agent and Autonomous run
 * the native agent runtime from the chat panel. Real runtime + chat module,
 * fake model / project FS / command runner / editor. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tc = (name, args) => ({ id: '', name, arguments: JSON.stringify(args) });

function specOut(pass, fails) {
  const L = [];
  fails.forEach((f) => L.push('✖ ' + f + ' (1ms)'));
  L.push('ℹ tests ' + (pass + fails.length), 'ℹ pass ' + pass, 'ℹ fail ' + fails.length, '');
  if (fails.length) { L.push('✖ failing tests:', ''); fails.forEach((f, i) => L.push('test at sum.test.js:' + (4 + i) + ':1', '✖ ' + f + ' (1ms)', '  AssertionError: wrong value', '')); }
  return L.join('\n');
}

function setup(opts) {
  opts = opts || {};
  const files = Object.assign({ '/package.json': '{"scripts":{"test":"node --test"}}', '/sum.js': 'function sum(a, b) { return a - b; }\n', '/sum.test.js': "test('adds', () => {});\n" }, opts.files || {});
  const flushes = [];
  const FS = {
    _data: files, isFile: (p) => Object.prototype.hasOwnProperty.call(files, p), read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    write: (p, c) => { files[p] = c; }, remove: (p) => { delete files[p]; }, __flush: () => { flushes.push(Object.assign({}, files)); return Promise.resolve(); }
  };
  const store = opts.store || {};
  const script = [], seen = [];
  const status = opts.status || { connected: true, provider: 'openai_compat', model: 'm', free: true, source: 'local (http://127.0.0.1:11434)' };
  const AI = {
    ready: () => true, status: () => status,
    chatStream: (msgs, o) => {
      seen.push({ msgs: msgs.slice(), tools: (o.tools || []).map((d) => d.name), opts: o });
      const step = script.shift() || { text: 'ok' };
      if (typeof step === 'function') return step(msgs, o);
      if (step.text) o.onDelta(step.text);
      return Promise.resolve({ text: step.text || '', toolCalls: step.calls || [] });
    }
  };
  const S = { ideFile: '/sum.js', ideBuffer: files['/sum.js'], ideDirty: false, screen: 'ide' };
  const jobs = [], reviewDock = [], renders = [];
  const CSExec = opts.noExec ? undefined : {
    available: () => true, stop() {},
    test: () => { jobs.push('test'); return Promise.resolve(/a \+ b/.test(files['/sum.js']) ? { code: 0, output: specOut(2, []), ms: 4 } : { code: 1, output: specOut(0, ['adds', 'adds negatives']), ms: 4 }); }
  };
  const Autonomy = { allows: (a) => (opts.deny || []).indexOf(a) < 0 };
  const Review = { snapshot: (f) => Object.assign({}, f._data), stats: (a, b) => ({ added: String(b).split('\n').length, removed: String(a || '').split('\n').length }) };
  const toasts = [];
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    setTimeout, clearTimeout, AbortController, document: { getElementById: () => null },
    Engine: { AI, FS, Autonomy, Review, Validator: { runAll: () => [] } },
    S, CSExec, renderAll: () => { renders.push(S.ideFile); }, toast: (m) => toasts.push(m),
    beginAgentReview: (before) => { reviewDock.push(before); }, renderReviewDock() {}
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['app.chat.agent.js', 'engine.nagent.js', 'app.chat.js', 'app.chat.task.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  const Chat = win.CSChat, x = Chat._x;
  // simulate a click on a [data-cs-task="..."] control
  const click = (action) => { const tgt = { closest: (sel) => (sel === '[data-cs-task]' ? { getAttribute: () => action } : null) }; return x.ext.click.some((fn) => fn(tgt) === true); };
  return { win, Chat, x, FS, files, S, script, seen, store, jobs, reviewDock, renders, flushes, click, toasts, task: () => Chat.task.current() };
}

const planStep = { calls: [tc('create_plan', { steps: ['read sum.js', 'fix the operator', 'run the tests'] })] };
const planDone = { text: 'plan ready' };
const fixSum = { calls: [tc('edit_file', { path: '/sum.js', old_text: 'a - b', new_text: 'a + b' })] };
const report = { calls: [tc('report_result', { summary: 'fixed', status: 'done' })] };
const rows = (Chat) => Chat.thread().messages.map((m) => m.role + (m.role === 'tool' ? ':' + m.name : '') + (m.phase ? '@' + m.phase : '') + (m.report ? '#report' : ''));

module.exports = async function (t) {
  /* ---------- modes ---------- */
  {
    const x = setup();
    t.deepEqual('five modes are offered', x.Chat.MODES.map((m) => m.id), ['ask', 'plan', 'edit', 'agent', 'auto']);
    t.ok('every mode explains itself', x.Chat.MODES.every((m) => m.tip.length > 20));
    x.Chat.setMode('auto');
    t.ok('modes switch and persist', x.Chat.mode === 'auto' && x.store['cs.chat.mode.v1'] === 'auto');
    x.Chat.setMode('nonsense');
    t.equal('an unknown mode falls back to Ask', x.Chat.mode, 'ask');
    const y = setup({ store: { 'cs.chat.mode.v1': 'agent' } });
    t.equal('a stored mode is restored', y.Chat.mode, 'agent');
    const z = setup({ store: { 'cs.chat.mode.v1': 'garbage' } });
    t.equal('a corrupt stored mode is ignored', z.Chat.mode, 'ask');
  }

  /* ---------- Plan mode ---------- */
  {
    const x = setup();
    x.Chat.setMode('plan');
    x.script.push(planStep, planDone);
    await x.Chat.send('make sum add the numbers');
    t.ok('plan mode produces a plan and a report, and changes nothing', x.task().report.status === 'planned' && x.task().plan.length === 3 && /a - b/.test(x.files['/sum.js']) && x.jobs.length === 0);
    t.ok('the planning phase is labelled on the rows', rows(x.Chat).some((r) => r === 'tool:create_plan@plan') && x.Chat.thread().messages.some((m) => m.phase === 'plan'));
    t.ok('only read tools and create_plan were offered', x.seen[0].tools.indexOf('edit_file') < 0 && x.seen[0].tools.indexOf('create_plan') >= 0);
    t.ok('the run ends COMPLETED and the panel is free again', x.task().state === 'COMPLETED' && x.Chat.busy === false);
  }

  /* ---------- Agent mode: plan approval, then a verified run ---------- */
  {
    const x = setup();
    x.Chat.setMode('agent');
    x.script.push(planStep, planDone, { calls: [tc('read_file', { path: '/sum.js' })] }, fixSum, report);
    const p = x.Chat.send('make sum add the numbers');
    await wait(80);
    const tk = x.task();
    t.ok('the run stops at the plan and waits for approval', tk.state === 'WAITING_APPROVAL' && !!tk.awaitingPlan && x.Chat.busy === true);
    t.ok('nothing has been changed or run yet', /a - b/.test(x.files['/sum.js']) && x.jobs.length === 0);
    t.deepEqual('the approval says what will be run', tk.awaitingPlan.info.verify, ['tests']);
    t.equal('the plan is shown for the user to read', tk.plan.length, 3);
    t.ok('the approval buttons are in the task card', /data-cs-task="approve"/.test(x.x.ext.tray[0]()) && /Approve and run/.test(x.x.ext.tray[0]()) && /data-cs-task="cancel"/.test(x.x.ext.tray[0]()));
    t.ok('clicking Approve is handled by the task module', x.click('approve') === true);
    const last = await p;
    t.equal('after approval the task finishes VERIFIED', x.task().report.status, 'verified');
    t.ok('the file really changed and the tests really ran', /a \+ b/.test(x.files['/sum.js']) && x.jobs.length === 1);
    t.deepEqual('the conversation has the plan, tool rows, phase labels and a report', rows(x.Chat).filter((r) => r !== 'note').join(' '), 'user tool:create_plan@plan assistant@plan tool:read_file@execute tool:edit_file@execute tool:report_result@execute assistant#report');
    t.deepEqual('tool rows know their phase', x.Chat.thread().messages.filter((m) => m.role === 'tool').map((m) => m.phase), ['plan', 'execute', 'execute', 'execute']);
    t.ok('the final message is the evidence-based report', last.report === true && /VERIFIED/.test(last.content) && /exit 0, 2 pass \/ 0 fail/.test(last.content) && /sum\.js/.test(last.content));
    t.ok('verification is narrated in the conversation', x.Chat.thread().messages.some((m) => m.role === 'note' && /Verification passed/.test(m.content)));
    t.ok('the plan is applied revertibly and the editor review dock is opened with the pre-task snapshot', x.reviewDock.length === 1 && /a - b/.test(x.reviewDock[0]['/sum.js']));
    t.ok('the file the agent edited was put in front of the user', x.renders.indexOf('/sum.js') >= 0 && x.Chat.thread().messages.some((m) => m.role === 'tool' && m.name === 'edit_file' && m.file === '/sum.js'));
    t.ok('the task card summarises the result and offers Revert', /VERIFIED/.test(x.x.ext.tray[0]()) && /data-cs-task="revert"/.test(x.x.ext.tray[0]()) && /1 file changed/.test(x.x.ext.tray[0]()));
    t.ok('commands were flushed to disk-backed storage before they ran', x.flushes.length >= 1 && /a \+ b/.test(x.flushes[0]['/sum.js']));
    t.ok('the run state is stored as COMPLETED', JSON.parse(x.store['cs.nagent.run.v1']).state === 'COMPLETED');

    // revert
    x.click('revert');
    await wait(30);
    t.ok('Revert undoes every change and says so', /a - b/.test(x.files['/sum.js']) && x.Chat.thread().messages.some((m) => m.role === 'note' && /Reverted 1 file/.test(m.content)));
    t.ok('and the card no longer offers it', !/data-cs-task="revert"/.test(x.x.ext.tray[0]()));
    t.equal('the editor buffer is refreshed after a revert', x.S.ideBuffer, 'function sum(a, b) { return a - b; }\n');
  }

  /* ---------- plan rejected / stopped while waiting ---------- */
  {
    const x = setup();
    x.Chat.setMode('agent');
    x.script.push(planStep, planDone, fixSum, report);
    const p = x.Chat.send('do it');
    await wait(60);
    x.click('cancel');
    await p;
    t.ok('cancelling the plan changes nothing', x.task().report.status === 'cancelled' && /a - b/.test(x.files['/sum.js']) && x.jobs.length === 0 && x.Chat.busy === false);

    const y = setup();
    y.Chat.setMode('agent');
    y.script.push(planStep, planDone, fixSum, report);
    const p2 = y.Chat.send('do it');
    await wait(60);
    y.Chat.stop();
    await p2;
    t.ok('Stop while the plan awaits approval cancels the task', y.task().report.status === 'cancelled' && /a - b/.test(y.files['/sum.js']));
  }

  /* ---------- Autonomous mode ---------- */
  {
    const x = setup();
    x.Chat.setMode('auto');
    x.script.push(planStep, planDone, fixSum, report);
    await x.Chat.send('fix sum');
    t.ok('autonomous mode never waits for plan approval and verifies', x.task().report.status === 'verified' && !x.task().awaitingPlan && x.task().run.history.every((h) => h.state !== 'WAITING_APPROVAL'));
    t.ok('and offers the same tool set (compact for a local model)', x.seen[2].tools.indexOf('run_tests') >= 0 && x.seen[2].tools.indexOf('edit_file') >= 0 && x.seen[2].tools.indexOf('rename_file') < 0);

    // a destructive action still asks in auto mode
    const y = setup({ files: { '/old.js': 'old' } });
    y.Chat.setMode('auto');
    y.win.Engine.NativeAgent.PROFILES.compact.push('delete_file');
    y.script.push(planStep, planDone, { calls: [tc('delete_file', { path: '/old.js' })] }, fixSum, report);
    const p = y.Chat.send('clean up and fix sum');
    await wait(120);
    const tool = y.Chat.thread().messages.filter((m) => m.role === 'tool' && m.name === 'delete_file')[0];
    t.ok('deleting a file the agent did not create asks even in auto mode', !!tool && tool.status === 'approval' && y.task().state === 'WAITING_APPROVAL' && '/old.js' in y.files);
    y.x.state.approvals[tool.id](false);
    await p;
    t.ok('a decline keeps the file, and the run carries on to a verified result', '/old.js' in y.files && y.task().report.status === 'verified');

    // the autonomy ceiling
    const z = setup({ deny: ['write'] });
    z.Chat.setMode('auto');
    z.script.push(planStep, planDone, fixSum, report);
    await z.Chat.send('fix sum');
    t.ok('the autonomy level still caps autonomous mode', /a - b/.test(z.files['/sum.js']) && z.task().report.status === 'no-changes');
  }

  /* ---------- repair is visible ---------- */
  {
    const x = setup();
    x.Chat.setMode('auto');
    const wrong = { calls: [tc('edit_file', { path: '/sum.js', old_text: 'a - b', new_text: 'a * b' })] };
    x.script.push(planStep, planDone, wrong, report, { calls: [tc('read_diagnostics', {})] }, { calls: [tc('edit_file', { path: '/sum.js', old_text: 'a * b', new_text: 'a + b' })] }, report);
    await x.Chat.send('fix sum');
    t.equal('a failed verification leads to a visible repair and a verified result', x.task().report.status, 'verified');
    t.ok('the conversation narrates the failure and the repair attempt', x.Chat.thread().messages.some((m) => m.role === 'note' && /Verification FAILED/.test(m.content)) && x.Chat.thread().messages.some((m) => m.role === 'note' && /Repair attempt 1/.test(m.content)));
    t.ok('repair rows carry their phase', x.Chat.thread().messages.some((m) => m.role === 'tool' && m.phase === 'repair 1'));
    t.ok('the report lists the repair attempt', /Repair attempts/.test(x.task().report.text) && /fixed/.test(x.task().report.text));
  }

  /* ---------- model options: Ollama needs an explicit context ---------- */
  {
    const x = setup();
    const o = x.x.chatOptions();
    t.ok('a local Ollama gets an explicit num_ctx and low temperature', o.extraBody.options.num_ctx === 16384 && o.temperature === 0.1);
    t.equal('a local model gets the compact tool set', x.x.toolset(), 'compact');
    const y = setup({ status: { connected: true, provider: 'openai', model: 'gpt', free: false, source: 'cloud (openai)' } });
    t.ok('a cloud model gets no Ollama options and the full tool set', y.x.chatOptions().extraBody === undefined && y.x.toolset() === 'full');
    x.Chat.setMode('auto');
    x.script.push(planStep, planDone, report);
    await x.Chat.send('x');
    t.ok('the options travel with every model call of a task', x.seen.every((c) => c.opts.extraBody && c.opts.extraBody.options.num_ctx === 16384));
  }

  /* ---------- interrupted runs ---------- */
  {
    const x = setup();
    x.Chat.setMode('auto');
    // the model never answers its execution turn: the app "goes away" mid-run
    x.script.push(planStep, planDone, () => new Promise(() => {}));
    x.Chat.send('fix sum');                  // intentionally not awaited
    await wait(120);
    t.equal('the run is live and persisted as EXECUTING', JSON.parse(x.store['cs.nagent.run.v1']).state, 'EXECUTING');
    // "restart": a fresh page with the same storage
    const y = setup({ store: x.store, files: { '/sum.js': x.files['/sum.js'] } });
    t.ok('after a restart the interrupted run is offered for resume, with its goal and plan', !!y.Chat.task.interrupted() && y.Chat.task.interrupted().goal === 'fix sum' && y.Chat.task.interrupted().plan.length === 3);
    const card = y.x.ext.tray[0]();
    t.ok('the card says it was cut off and offers Resume / Dismiss', /Interrupted/.test(card) && /data-cs-task="resume"/.test(card) && /data-cs-task="dismiss"/.test(card));
    y.script.push(fixSum, report);
    y.click('resume');
    await wait(200);
    t.ok('resuming skips planning, finishes the work and verifies it', y.task() && y.task().report && y.task().report.status === 'verified' && /a \+ b/.test(y.files['/sum.js']));
    t.ok('the plan from before the interruption was kept', y.task().plan.length === 3 && !y.seen.some((c) => c.tools.indexOf('create_plan') >= 0));
    t.ok('and the interrupted card is gone', y.Chat.task.interrupted() === null);

    const z = setup({ store: x.store });
    z.click('dismiss');
    t.ok('Dismiss forgets the interrupted run', z.Chat.task.interrupted() === null && setup({ store: x.store }).Chat.task.interrupted() === null);
  }

  /* ---------- failures ---------- */
  {
    const x = setup({ noExec: true });
    x.Chat.setMode('auto');
    x.script.push(planStep, planDone, fixSum, report);
    await x.Chat.send('fix sum');
    t.ok('without a command runner the result is "not verified", never "verified"', x.task().report.status !== 'verified' && /a \+ b/.test(x.files['/sum.js']) && x.Chat.busy === false);

    const y = setup();
    y.Chat.setMode('auto');
    y.script.push(() => Promise.reject(new Error('HTTP 500 model down')));
    const last = await y.Chat.send('x');
    t.ok('a model failure becomes a FAILED report and frees the panel', y.task().report.status === 'failed' && /model down/.test(last.content) && y.Chat.busy === false);

    const z = setup();
    z.Chat.setMode('ask');
    z.script.push({ text: 'just chatting' });
    await z.Chat.send('hello');
    t.ok('Ask mode is untouched: no tools, no task', z.seen[0].tools.length === 0 && z.task() === null);
  }
};
