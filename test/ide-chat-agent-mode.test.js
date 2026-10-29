'use strict';
/* IDE chat, phase 3: Agent mode through the chat panel (dist/app.chat.js +
 * app.chat.agent.js) — conversation rows, approvals, Stop, the proposed-changes
 * tray and its hand-off to the editor review. Fakes: model, FS, editor, CSExec. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tc = (name, args, id) => ({ id: id || '', name, arguments: JSON.stringify(args) });

function setup(opts) {
  opts = opts || {};
  const files = Object.assign({ '/a.js': 'let a = 1;\n', '/b.js': 'let b = 2;\n' }, opts.files || {});
  const FS = {
    _data: files,
    isFile: (p) => Object.prototype.hasOwnProperty.call(files, p),
    read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    write: (p, c) => { files[p] = c; }, remove: (p) => { delete files[p]; }
  };
  const store = opts.store || {};
  const script = [];
  const seen = [];
  const AI = {
    ready: () => true, status: () => ({ connected: true }),
    chatStream: (msgs, o) => {
      seen.push({ msgs: msgs.slice(), tools: o.tools, signal: o.signal });
      const step = script.shift();
      if (!step) return Promise.resolve({ text: 'ok', toolCalls: [] });
      if (typeof step === 'function') return step(msgs, o);
      if (step.text) o.onDelta(step.text);
      return Promise.resolve(step);
    }
  };
  const S = { ideFile: '/a.js', ideBuffer: 'let a = 1;\n', ideDirty: false, screen: 'ide' };
  const reviews = [];
  const ed = { value: 'let a = 1;\n', focus() {}, review(o) { reviews.push(o); return {}; } };
  const E = { ready: true, current: () => ed, reviewing: () => false };
  const jobs = [];
  const CSExec = opts.noExec ? undefined : {
    available: () => true,
    test: () => { jobs.push('test'); return Promise.resolve({ code: 0, output: 'pass\n' }); },
    build: () => { jobs.push('build'); return Promise.resolve({ code: 0, output: 'built\n' }); },
    stop: () => { jobs.push('stop'); }
  };
  const Autonomy = { allows: (a) => (opts.deny || []).indexOf(a) < 0 };
  const toasts = [];
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    setTimeout, clearTimeout, AbortController,
    document: { getElementById: () => null },
    Engine: { AI, FS, Autonomy, Validator: { runAll: () => [] } },
    S, CSEditor: E, CSExec, renderAll() {}, toast: (m) => toasts.push(m)
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['app.chat.agent.js', 'engine.repointel.js', 'engine.nagent.js', 'app.chat.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  return { win, Chat: win.CSChat, FS, files, S, ed, E, reviews, jobs, script, seen, store, toasts, st: win.CSChat.core._state };
}

const roles = (Chat) => Chat.thread().messages.map((m) => m.role + (m.role === 'tool' ? ':' + m.name : ''));

module.exports = async function (t) {
  /* ---------- mode ---------- */
  {
    const x = setup();
    t.equal('Ask is the default mode', x.Chat.mode, 'ask');
    x.Chat.setMode('edit');
    t.ok('the mode is switchable and remembered', x.Chat.mode === 'edit' && x.store['cs.chat.mode.v1'] === 'edit');
    const y = setup({ store: x.store });
    t.equal('a reload comes back in the same mode', y.Chat.mode, 'edit');

    const z = setup();
    z.script.push({ text: 'plain answer', toolCalls: [] });
    await z.Chat.send('hello');
    t.ok('in Ask mode no tools are offered to the model', z.seen[0].tools === undefined);
  }

  /* ---------- a read + propose run ---------- */
  {
    const x = setup();
    x.Chat.setMode('edit');
    x.script.push(
      { text: 'Let me look.', toolCalls: [tc('read_file', { path: '/a.js' }, 'c1')] },
      { text: '', toolCalls: [tc('write_file', { path: '/a.js', content: 'let a = 2;\n' }, 'c2')] },
      { text: 'Changed a to 2 — review it below.', toolCalls: [] }
    );
    const last = await x.Chat.send('make a equal 2');
    t.deepEqual('the conversation shows each turn and each tool call as its own row', roles(x.Chat), ['user', 'assistant', 'tool:read_file', 'tool:write_file', 'assistant']);
    t.ok('send resolves with the final answer', last.role === 'assistant' && /Changed a to 2/.test(last.content));
    const tools = x.Chat.thread().messages.filter((m) => m.role === 'tool');
    t.ok('tool rows record status, a summary and the result', tools.every((m) => m.status === 'done') && /\/a\.js/.test(tools[0].summary) && /let a = 1/.test(tools[0].result));
    const offered = x.seen[0].tools.map((d) => d.name);
    t.ok('the edit-mode system prompt is used and the original six tools are offered', /write_file/.test(x.seen[0].msgs[0].content) && ['list_dir', 'read_file', 'grep', 'get_problems', 'write_file', 'run_command'].every((n) => offered.indexOf(n) >= 0));
    t.ok('...together with the new targeted-edit tools (and nothing that could run unasked)', ['edit_file', 'create_file', 'apply_patch'].every((n) => offered.indexOf(n) >= 0) && offered.length === 9 && offered.indexOf('run_tests') < 0);
    t.ok('the user\'s question is in the prompt', x.seen[0].msgs[x.seen[0].msgs.length - 1].content === 'make a equal 2');
    t.equal('write_file only queued a proposal: the project is unchanged', x.files['/a.js'], 'let a = 1;\n');
    t.deepEqual('the proposal is available for review', x.Chat.proposals().map((p) => p.path + ':' + p.after.trim()), ['/a.js:let a = 2;']);
    t.ok('the busy flag and approvals are cleared at the end', x.Chat.busy === false && Object.keys(x.st.approvals).length === 0);
    t.ok('the conversation is saved', /tool/.test(x.store['cs.chat.v1']) && /read_file/.test(x.store['cs.chat.v1']));

    // next turn knows about the pending proposal
    x.script.push({ text: 'Anything else?', toolCalls: [] });
    await x.Chat.send('thanks');
    t.ok('the next run tells the model which proposals are still unreviewed', /not reviewed yet: \/a\.js/.test(x.seen[x.seen.length - 1].msgs[0].content));
    t.ok('tool rows are not replayed as chat history', !x.seen[x.seen.length - 1].msgs.some((m) => m.role === 'tool'));
  }

  /* ---------- reviewing proposals ---------- */
  {
    const x = setup();
    x.Chat.setMode('edit');
    x.script.push({ text: '', toolCalls: [tc('write_file', { path: '/a.js', content: 'let a = 2;\n' }, 'w1'), tc('write_file', { path: '/c.js', content: 'new\n' }, 'w2')] }, { text: 'done', toolCalls: [] });
    await x.Chat.send('do two things');
    t.equal('two proposals are queued', x.Chat.proposals().length, 2);

    const r = x.Chat.reviewProposal('/a.js', false);
    await wait(160);
    t.ok('Review opens the change in the editor review', r.ok && x.reviews.length === 1 && x.ed.value === 'let a = 2;\n' && x.reviews[0].original === 'let a = 1;\n');
    x.reviews[0].onEnd({ reason: 'left', text: 'let a = 2;\n', accepted: 0, rejected: 0 });
    t.ok('leaving the review without deciding keeps the proposal pending', x.Chat.proposals().length === 2 && x.files['/a.js'] === 'let a = 1;\n');
    x.reviews[0].onEnd({ reason: 'done', text: 'let a = 2;\n', accepted: 1, rejected: 0 });
    t.ok('deciding writes the result to the project, saves it, and clears the proposal', x.files['/a.js'] === 'let a = 2;\n' && x.S.ideDirty === false && x.Chat.proposals().map((p) => p.path).join() === '/c.js');

    x.Chat.reviewProposal('/c.js', false);
    await wait(160);
    t.ok('a new file is created empty for the review', x.FS.isFile('/c.js') && x.files['/c.js'] === '' && x.reviews[1].original === '');
    x.reviews[1].onEnd({ reason: 'rejected', text: '', accepted: 0, rejected: 1 });
    t.ok('rejecting a new file removes it and clears the proposal', !x.FS.isFile('/c.js') && x.Chat.proposals().length === 0);

    // chained review of several
    const y = setup();
    y.Chat.setMode('edit');
    y.script.push({ text: '', toolCalls: [tc('write_file', { path: '/a.js', content: 'A2\n' }, 'w1'), tc('write_file', { path: '/b.js', content: 'B2\n' }, 'w2')] }, { text: 'ok', toolCalls: [] });
    await y.Chat.send('both');
    y.Chat.reviewAll();
    await wait(160);
    t.equal('Review all opens the first proposal', y.reviews.length, 1);
    y.reviews[0].onEnd({ reason: 'done', text: 'A2\n', accepted: 1, rejected: 0 });
    await wait(450);
    t.ok('and moves on to the next one when it is decided', y.reviews.length === 2 && y.ed.value === 'B2\n' && y.files['/a.js'] === 'A2\n');
    y.reviews[1].onEnd({ reason: 'done', text: 'B2\n', accepted: 1, rejected: 0 });
    await wait(300);
    t.ok('the chain ends when nothing is left', y.reviews.length === 2 && y.Chat.proposals().length === 0);

    const z = setup();
    z.Chat.setMode('edit');
    z.script.push({ text: '', toolCalls: [tc('write_file', { path: '/a.js', content: 'Z\n' })] }, { text: 'ok', toolCalls: [] });
    await z.Chat.send('x');
    z.Chat.discardProposal('/a.js');
    t.ok('Discard drops a proposal without touching the file', z.Chat.proposals().length === 0 && z.files['/a.js'] === 'let a = 1;\n');
    z.script.push({ text: '', toolCalls: [tc('write_file', { path: '/a.js', content: 'Y\n' })] }, { text: 'ok', toolCalls: [] });
    await z.Chat.send('again');
    z.Chat.discardAll();
    t.equal('Discard all empties the tray', z.Chat.proposals().length, 0);

    const d = setup();
    d.Chat.setMode('edit');
    d.S.ideDirty = true; d.S.ideBuffer = 'edited\n';
    d.script.push({ text: '', toolCalls: [tc('write_file', { path: '/b.js', content: 'B3\n' })] }, { text: 'ok', toolCalls: [] });
    await d.Chat.send('x');
    d.Chat.reviewProposal('/b.js', false);
    t.ok('reviewing is refused while another file has unsaved edits, and the proposal survives', d.Chat.proposals().length === 1 && d.reviews.length === 0 && d.toasts.some((m) => /save or revert/.test(m)));
  }

  /* ---------- the agent sees unsaved edits ---------- */
  {
    const x = setup();
    x.Chat.setMode('edit');
    x.S.ideDirty = true; x.S.ideBuffer = 'let a = 99; // unsaved\n';
    x.script.push({ text: '', toolCalls: [tc('read_file', { path: '/a.js' })] }, { text: 'seen', toolCalls: [] });
    await x.Chat.send('read it');
    t.ok('read_file returns the open file\'s unsaved text, not stale disk content', /unsaved/.test(x.Chat.thread().messages.filter((m) => m.role === 'tool')[0].result));
  }

  /* ---------- run_command approval ---------- */
  {
    const x = setup();
    x.Chat.setMode('edit');
    x.script.push({ text: '', toolCalls: [tc('run_command', { job: 'test' }, 'r1')] }, { text: 'tests pass', toolCalls: [] });
    const p = x.Chat.send('run the tests');
    await wait(60);
    const tm = x.Chat.thread().messages.filter((m) => m.role === 'tool')[0];
    t.ok('the run pauses on an approval row and runs nothing yet', tm.status === 'approval' && /test/.test(tm.approval) && x.jobs.length === 0 && x.Chat.busy === true);
    x.st.approvals.r1(true);
    const last = await p;
    t.ok('approving runs the job and the run continues', x.jobs.join() === 'test' && tm.status === 'done' && /exit 0/.test(tm.summary) && last.content === 'tests pass');

    const y = setup();
    y.Chat.setMode('edit');
    y.script.push({ text: '', toolCalls: [tc('run_command', { job: 'build' }, 'r2')] }, { text: 'skipped', toolCalls: [] });
    const p2 = y.Chat.send('build it');
    await wait(60);
    y.st.approvals.r2(false);
    await p2;
    const tm2 = y.Chat.thread().messages.filter((m) => m.role === 'tool')[0];
    t.ok('declining runs nothing and the model is told', tm2.status === 'denied' && y.jobs.length === 0 && y.seen[1].msgs.some((m) => m.role === 'tool' && /declined/.test(m.content)));

    const z = setup();
    z.Chat.setMode('edit');
    z.script.push({ text: '', toolCalls: [tc('run_command', { job: 'test' }, 'r3')] }, { text: 'never', toolCalls: [] });
    const p3 = z.Chat.send('run');
    await wait(60);
    z.Chat.stop();
    await p3;
    t.ok('Stop while waiting for approval declines it and ends the run', z.jobs.length === 0 && z.Chat.busy === false && z.Chat.thread().messages.filter((m) => m.role === 'tool')[0].status === 'denied');

    const web = setup({ noExec: true });
    web.Chat.setMode('edit');
    web.script.push({ text: '', toolCalls: [tc('run_command', { job: 'test' }, 'r4')] }, { text: 'ok', toolCalls: [] });
    await web.Chat.send('run');
    const wm = web.Chat.thread().messages.filter((m) => m.role === 'tool')[0];
    t.ok('without the desktop app the command is blocked without asking', wm.status === 'blocked' && Object.keys(web.st.approvals).length === 0);

    const lo = setup({ deny: ['write', 'command'] });
    lo.Chat.setMode('edit');
    lo.script.push({ text: '', toolCalls: [tc('write_file', { path: '/a.js', content: 'x' }, 'w'), tc('run_command', { job: 'test' }, 'c')] }, { text: 'ok', toolCalls: [] });
    await lo.Chat.send('go');
    t.ok('the autonomy level is honoured for writes and commands', lo.Chat.proposals().length === 0 && lo.jobs.length === 0 && lo.Chat.thread().messages.filter((m) => m.role === 'tool').every((m) => m.status === 'blocked'));
  }

  /* ---------- failure modes ---------- */
  {
    const x = setup();
    x.Chat.setMode('edit');
    x.script.push(() => Promise.reject(new Error('HTTP 400 tools unsupported')), { text: 'I can only chat.', toolCalls: [] });
    const last = await x.Chat.send('hi');
    t.ok('a model that rejects tools still answers, with a note saying why', last.content === 'I can only chat.' && x.Chat.thread().messages.some((m) => m.role === 'note' && /does not accept tools/.test(m.content)));

    const y = setup();
    y.Chat.setMode('edit');
    y.script.push(() => Promise.reject(new Error('HTTP 500 down')));
    const e = await y.Chat.send('hi');
    t.ok('a hard failure becomes an error message and frees the panel', e.error === true && /HTTP 500/.test(e.content) && y.Chat.busy === false);

    const z = setup();
    z.Chat.setMode('edit');
    let n = 0;
    z.script.push(...Array.from({ length: 20 }, () => () => Promise.resolve({ text: '', toolCalls: [tc('grep', { query: 'q' + (++n) })] })));
    await z.Chat.send('loop forever');
    t.ok('a run that never settles is stopped with a visible note', z.Chat.thread().messages.some((m) => m.role === 'note' && /Stopped after 12 steps/.test(m.content)) && z.Chat.busy === false);

    const w = setup();
    w.Chat.setMode('edit');
    w.script.push((msgs, o) => new Promise((resolve) => { o.signal.addEventListener('abort', () => resolve({ text: 'par', toolCalls: [], aborted: true })); setTimeout(() => w.Chat.stop(), 20); }));
    const s = await w.Chat.send('stop me');
    t.ok('Stop mid-reply keeps the partial text and ends cleanly', w.Chat.busy === false && w.Chat.thread().messages.some((m) => m.role === 'assistant' && m.content === 'par' && m.stopped));
  }

  /* ---------- reload hygiene ---------- */
  {
    const store = { 'cs.chat.v1': JSON.stringify({ active: 't', threads: [{ id: 't', title: 'x', messages: [
      { id: 'u', role: 'user', content: 'hi' }, { id: 'a', role: 'assistant', content: 'par', streaming: true },
      { id: 'r', role: 'tool', name: 'run_command', status: 'approval', approval: 'Run test', summary: 'test' },
      { id: 'q', role: 'tool', name: 'read_file', status: 'running' }, { id: 'd', role: 'tool', name: 'grep', status: 'done' }] }] }) };
    const x = setup({ store });
    const m = x.Chat.thread().messages;
    t.ok('rows left mid-run by a reload are settled, not stuck', m[1].streaming === false && m[2].status === 'error' && /interrupted/.test(m[2].summary) && !m[2].approval && m[3].status === 'error' && m[4].status === 'done');
  }
};
