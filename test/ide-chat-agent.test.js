'use strict';
/* IDE chat, phase 3: the agent's tools and loop (dist/app.chat.agent.js).
 * Read tools see the project plus the agent's own pending proposals;
 * write_file only QUEUES a proposal; run_command is gated and approved. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAgent() {
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.chat.agent.js'), 'utf8'), vm.createContext(win), { filename: 'app.chat.agent.js' });
  return win.CSChatAgent;
}

function envFor(files, over) {
  const d = Object.assign({}, files);
  const calls = { read: 0, jobs: [] };
  return Object.assign({
    _d: d, calls,
    list: () => Object.keys(d),
    read: (p) => (Object.prototype.hasOwnProperty.call(d, p) ? d[p] : null),
    getProblems: () => [{ severity: 'error', file: '/a.js', message: 'JS syntax error: x' }],
    diffStats: (a, b) => ({ added: b.split('\n').length, removed: a ? a.split('\n').length : 0 }),
    canWrite: () => true, canCommand: () => true, jobsAvailable: () => true,
    runJob: (job) => { calls.jobs.push(job); return Promise.resolve({ code: 0, output: 'all good\n' }); }
  }, over || {});
}

module.exports = async function (t) {
  const A = loadAgent();
  const FILES = { '/index.html': '<h1>hi</h1>\n', '/src/app.js': 'const a = 1;\nfunction go() { return a; }\n', '/src/util.js': 'exports.x = 1;\n', '/node_modules/q/i.js': 'junk', '/package.json': '{}' };

  /* ---------- read tools ---------- */
  {
    const tb = A.createToolbox(envFor(FILES));
    let r = await tb.call('list_dir', { path: '/' });
    t.ok('list_dir shows folders and files, hides node_modules', /src\//.test(r.text) && /index\.html/.test(r.text) && !/node_modules/.test(r.text));
    r = await tb.call('list_dir', { path: 'src' });
    t.ok('list_dir accepts a path without a leading slash and shows line counts', /app\.js\s+\(3 lines\)/.test(r.text) && /util\.js/.test(r.text));
    r = await tb.call('list_dir', { path: '/nope' });
    t.ok('list_dir on a missing folder is an error that points the way', r.ok === false && /list_dir with path "\/"/.test(r.text));

    r = await tb.call('read_file', { path: '/src/app.js' });
    t.ok('read_file returns the content with its line count', r.ok && /app\.js \(3 lines\)/.test(r.text) && /function go/.test(r.text));
    r = await tb.call('read_file', { path: 'src/app.js', start_line: 2, end_line: 2 });
    t.ok('read_file supports a line range', /showing 2–2/.test(r.text) && /function go/.test(r.text) && !/const a = 1/.test(r.text));
    r = await tb.call('read_file', { path: '/missing.js' });
    t.ok('read_file on a missing file says so', r.ok === false && /not found/i.test(r.text));
    r = await tb.call('read_file', { path: '/../etc/passwd' });
    t.ok('".." paths are refused', r.ok === false && /\.\./.test(r.text));
    r = await tb.call('read_file', { path: '/node_modules/q/i.js' });
    t.ok('node_modules is off limits', r.ok === false && /may not touch/.test(r.text));
    const big = A.createToolbox(envFor({ '/big.txt': 'x'.repeat(50000) }));
    r = await big.call('read_file', { path: '/big.txt' });
    t.ok('a large file is truncated with a note', r.text.length < 13000 && /more characters/.test(r.text));

    r = await tb.call('grep', { query: 'function' });
    t.ok('grep finds matches as path:line: text', /\/src\/app\.js:2: function go/.test(r.text) && r.summary.includes('1 match'));
    r = await tb.call('grep', { query: 'EXPORTS', glob: '*.js' });
    t.ok('grep is case-insensitive and honours a glob', /\/src\/util\.js:1/.test(r.text));
    r = await tb.call('grep', { query: 'exports', glob: '*.html' });
    t.ok('a glob that excludes everything finds nothing', /No matches/.test(r.text));
    r = await tb.call('grep', { query: '(', regex: true });
    t.ok('a bad regex is reported, not thrown', r.ok === false && /Invalid regular expression/.test(r.text));
    r = await tb.call('grep', { query: 'junk' });
    t.ok('grep does not search node_modules', /No matches/.test(r.text));

    r = await tb.call('get_problems', {});
    t.ok('get_problems lists validator problems', /error \/a\.js: JS syntax error/.test(r.text) && r.summary === '1 problem');
    r = await tb.call('frobnicate', {});
    t.ok('an unknown tool names the real ones', r.ok === false && /Available: list_dir/.test(r.text));
  }

  /* ---------- write_file queues a proposal ---------- */
  {
    const env = envFor(FILES);
    const tb = A.createToolbox(env);
    let r = await tb.call('write_file', { path: '/src/util.js', content: 'exports.x = 2;\n' });
    t.ok('write_file queues a proposal and says it is not applied', r.ok && /NOT applied/.test(r.text) && tb.proposals.size === 1);
    t.equal('nothing is written to the project', env._d['/src/util.js'], 'exports.x = 1;\n');
    const p = tb.proposals.get('/src/util.js');
    t.ok('the proposal keeps the original and the new text', p.before === 'exports.x = 1;\n' && p.after === 'exports.x = 2;\n' && p.isNew === false);
    r = await tb.call('read_file', { path: '/src/util.js' });
    t.ok('read_file shows the agent its own proposal, labelled', /exports\.x = 2/.test(r.text) && /not yet applied/.test(r.text));
    r = await tb.call('grep', { query: 'x = 2' });
    t.ok('grep sees proposed content too', /util\.js:1/.test(r.text));

    r = await tb.call('write_file', { path: '/new/b.js', content: 'hi' });
    t.ok('a new file is flagged new and appears in list_dir', r.ok && tb.proposals.get('/new/b.js').isNew === true && /b\.js/.test((await tb.call('list_dir', { path: '/new' })).text));
    r = await tb.call('write_file', { path: '/src/util.js', content: 'exports.x = 3;\n' });
    t.ok('a second proposal for the same file replaces the first but keeps the disk original as "before"', tb.proposals.get('/src/util.js').after === 'exports.x = 3;\n' && tb.proposals.get('/src/util.js').before === 'exports.x = 1;\n');
    r = await tb.call('write_file', { path: '/src/util.js', content: 'exports.x = 1;\n' });
    t.ok('proposing the file\'s current disk content clears the proposal', r.ok === false && /No change/.test(r.text) && !tb.proposals.has('/src/util.js'));
    r = await tb.call('write_file', { path: '/x.js' });
    t.ok('content is required', r.ok === false && /content/.test(r.text));
    r = await tb.call('write_file', { path: '/../x.js', content: 'a' });
    t.ok('write_file refuses ".." paths', r.ok === false);
    r = await tb.call('write_file', { path: '/.git/config', content: 'a' });
    t.ok('write_file refuses .git', r.ok === false && /may not touch/.test(r.text));
    r = await tb.call('write_file', { path: '/huge.txt', content: 'x'.repeat(400000) });
    t.ok('write_file refuses a huge file', r.ok === false && /too large/.test(r.text));
    const ro = A.createToolbox(envFor(FILES, { canWrite: () => false }));
    r = await ro.call('write_file', { path: '/a.js', content: 'a' });
    t.ok('writing is blocked when the autonomy level forbids it', r.ok === false && r.status === 'blocked' && ro.proposals.size === 0);
  }

  /* ---------- run_command gating ---------- */
  {
    const env = envFor(FILES);
    const tb = A.createToolbox(env);
    let asked = null;
    let r = await tb.call('run_command', { job: 'test' }, { approve: (req) => { asked = req; return Promise.resolve(true); } });
    t.ok('an approved job runs and reports its exit code and output', r.ok && /exit code 0/.test(r.text) && /all good/.test(r.text) && env.calls.jobs.join() === 'test');
    t.ok('the approval request names the job', asked && asked.kind === 'command' && asked.job === 'test');
    r = await tb.call('run_command', { job: 'build' }, { approve: () => Promise.resolve(false) });
    t.ok('a declined job does not run and tells the model not to retry', r.status === 'denied' && /declined/.test(r.text) && env.calls.jobs.join() === 'test');
    r = await tb.call('run_command', { job: 'build' }, {});
    t.ok('with no way to ask, nothing runs', r.status === 'denied' && env.calls.jobs.length === 1);
    r = await tb.call('run_command', { job: 'rm -rf /' }, { approve: () => Promise.resolve(true) });
    t.ok('only the fixed job names are accepted (no arbitrary commands)', r.ok === false && /must be one of/.test(r.text) && env.calls.jobs.length === 1);
    const web = A.createToolbox(envFor(FILES, { jobsAvailable: () => false }));
    r = await web.call('run_command', { job: 'test' }, { approve: () => Promise.resolve(true) });
    t.ok('without the desktop app commands are blocked, and the user is not even asked', r.status === 'blocked' && /desktop app/.test(r.text));
    let asked2 = false;
    const lowAuto = A.createToolbox(envFor(FILES, { canCommand: () => false }));
    r = await lowAuto.call('run_command', { job: 'test' }, { approve: () => { asked2 = true; return Promise.resolve(true); } });
    t.ok('the autonomy level blocks commands before any approval prompt', r.status === 'blocked' && asked2 === false);
    const failing = A.createToolbox(envFor(FILES, { runJob: () => Promise.resolve({ code: 1, output: 'x'.repeat(20000) + 'TAIL' }) }));
    r = await failing.call('run_command', { job: 'test' }, { approve: () => Promise.resolve(true) });
    t.ok('a failing job is an error and keeps the END of the output', r.ok === false && /exit code 1/.test(r.text) && /TAIL$/.test(r.text) && r.text.length < 7000);
    const skip = A.createToolbox(envFor(FILES, { runJob: () => Promise.resolve({ code: -3, skipped: true, output: 'no test script found' }) }));
    r = await skip.call('run_command', { job: 'test' }, { approve: () => Promise.resolve(true) });
    t.ok('a skipped job is reported as skipped, not as a failure', r.ok && /skipped/.test(r.text));
    const boom = A.createToolbox(envFor(FILES, { runJob: () => Promise.reject(new Error('spawn failed')) }));
    r = await boom.call('run_command', { job: 'test' }, { approve: () => Promise.resolve(true) });
    t.ok('a job that cannot start is an error result, not a crash', r.ok === false && /spawn failed/.test(r.text));
  }

  /* ---------- text-form tool calls ---------- */
  {
    const names = A.DEFS.map((d) => d.name);
    let r = A.recoverTextToolCalls('Let me look.\n{"name": "read_file", "parameters": {"path": "/a.js"}}', names);
    t.ok('a llama-style JSON call in plain text is recovered', r.calls.length === 1 && r.calls[0].name === 'read_file' && JSON.parse(r.calls[0].arguments).path === '/a.js' && r.rest === 'Let me look.');
    r = A.recoverTextToolCalls('```json\n{"name":"grep","arguments":{"query":"x"}}\n```', names);
    t.ok('a call inside a code fence is recovered and the empty fence removed', r.calls.length === 1 && r.rest === '');
    r = A.recoverTextToolCalls('{"name":"read_file","parameters":{"path":"/a"}} {"name":"list_dir","parameters":{"path":"/"}}', names);
    t.ok('several calls in one reply are all recovered', r.calls.map((c) => c.name).join() === 'read_file,list_dir');
    r = A.recoverTextToolCalls('{"name":"launch_missiles","parameters":{}}', names);
    t.ok('a name that is not a tool is left alone', r.calls.length === 0);
    r = A.recoverTextToolCalls('Use {"a": 1} as the config; {"name":"read_file"} is incomplete', names);
    t.ok('ordinary JSON and calls without arguments are not mistaken for tool calls', r.calls.length === 0 && /config/.test(r.rest));
    r = A.recoverTextToolCalls('{"name":"write_file","parameters":{"path":"/a.js","content":"if (x) { y(); }\\n"}}', names);
    t.ok('braces and escapes inside string arguments do not confuse the scan', r.calls.length === 1 && JSON.parse(r.calls[0].arguments).content === 'if (x) { y(); }\n');
  }

  /* ---------- the loop ---------- */
  {
    const mkStream = (script) => {
      const seen = [];
      let i = 0;
      return { seen, fn: (msgs, o) => { seen.push({ msgs: msgs.slice(), tools: o.tools }); const step = script[Math.min(i++, script.length - 1)]; return typeof step === 'function' ? step(msgs, o) : Promise.resolve(step); } };
    };
    const tc = (name, args, id) => ({ id: id || '', name, arguments: JSON.stringify(args) });

    // read, then write, then answer
    {
      const tb = A.createToolbox(envFor(FILES));
      const s = mkStream([
        { text: 'Looking.', toolCalls: [tc('read_file', { path: '/src/app.js' }, 'c1')] },
        { text: '', toolCalls: [tc('write_file', { path: '/src/app.js', content: 'const a = 2;\n' }, 'c2')] },
        { text: 'Done: changed a to 2.', toolCalls: [] }
      ]);
      const ev = [];
      const res = await A.runLoop({
        chatStream: s.fn, messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'set a to 2' }], toolbox: tb,
        onTurnStart: (n) => ev.push('turn' + n), onToolStart: (c) => ev.push('start:' + c.name), onToolDone: (c, r) => ev.push('done:' + c.name + ':' + r.ok),
        onTurnEnd: (x) => ev.push('end:' + x.calls.length)
      });
      t.equal('the loop ends when the model answers without tool calls', res.reason, 'done');
      t.equal('and returns the final text', res.text, 'Done: changed a to 2.');
      t.deepEqual('events arrive in order', ev, ['turn1', 'end:1', 'start:read_file', 'done:read_file:true', 'turn2', 'end:1', 'start:write_file', 'done:write_file:true', 'turn3', 'end:0']);
      t.ok('tools are offered every turn', s.seen.every((x) => Array.isArray(x.tools) && x.tools.length === 6));
      const third = s.seen[2].msgs;
      const asst = third.filter((m) => m.role === 'assistant');
      t.ok('the assistant tool_calls and the matching tool results are fed back', asst[0].tool_calls[0].id === 'c1' && asst[0].tool_calls[0].function.name === 'read_file' && third.some((m) => m.role === 'tool' && m.tool_call_id === 'c1' && /const a = 1/.test(m.content)));
      t.ok('the write result went back as a tool message too', third.some((m) => m.role === 'tool' && m.tool_call_id === 'c2' && /NOT applied/.test(m.content)));
      t.equal('the proposal exists once the loop is over', tb.proposals.size, 1);
    }

    // a model that emits the call as text
    {
      const tb = A.createToolbox(envFor(FILES));
      const s = mkStream([
        { text: '{"name":"list_dir","parameters":{"path":"/src"}}', toolCalls: [] },
        { text: 'There are two files.', toolCalls: [] }
      ]);
      const ends = [];
      const res = await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb, onTurnEnd: (x) => ends.push(x.text + '|' + x.calls.length) });
      t.ok('a text-form call is executed as a real one', res.turns === 2 && ends[0] === '|1' && s.seen[1].msgs.some((m) => m.role === 'tool' && /app\.js/.test(m.content)));
    }

    // malformed args, then repeated calls
    {
      const tb = A.createToolbox(envFor(FILES));
      const s = mkStream([
        { text: '', toolCalls: [{ id: 'a', name: 'read_file', arguments: '{path: /oops' }] },
        { text: 'ok', toolCalls: [] }
      ]);
      await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb });
      t.ok('invalid JSON arguments come back as a tool error the model can fix', s.seen[1].msgs.some((m) => m.role === 'tool' && /not valid JSON/.test(m.content)));
    }
    {
      const tb = A.createToolbox(envFor(FILES));
      const same = { text: '', toolCalls: [tc('read_file', { path: '/src/app.js' })] };
      const s = mkStream([same]);
      const res = await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb, maxTurns: 30 });
      t.ok('the same call over and over is cut off, not run forever', res.reason === 'repeat' && res.turns <= 6);
      t.ok('the model was told it repeated itself', s.seen[s.seen.length - 1].msgs.some((m) => m.role === 'tool' && /exact call/.test(m.content)));
    }
    {
      const tb = A.createToolbox(envFor(FILES));
      let n = 0;
      const s = mkStream([() => Promise.resolve({ text: '', toolCalls: [tc('grep', { query: 'q' + (++n) })] })]);
      const res = await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb, maxTurns: 4 });
      t.ok('a hard turn limit stops a run that never settles', res.reason === 'max-turns' && res.turns === 4);
    }

    // abort
    {
      const tb = A.createToolbox(envFor(FILES));
      const ac = new AbortController();
      const s = mkStream([{ text: '', toolCalls: [tc('list_dir', { path: '/' })] }, { text: 'never', toolCalls: [] }]);
      const res = await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb, signal: ac.signal, onToolDone: () => ac.abort() });
      t.ok('aborting while a tool finished stops before another model call', res.reason === 'aborted' && s.seen.length === 1);
      const s2 = mkStream([{ text: 'partial', toolCalls: [], aborted: true }]);
      const r2 = await A.runLoop({ chatStream: s2.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb });
      t.equal('a stream that reports aborted ends the run', r2.reason, 'aborted');
    }

    // approval inside the loop
    {
      const env = envFor(FILES);
      const tb = A.createToolbox(env);
      const s = mkStream([{ text: '', toolCalls: [tc('run_command', { job: 'lint' })] }, { text: 'skipped it', toolCalls: [] }]);
      const reqs = [];
      await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb, approve: (r) => { reqs.push(r.job); return Promise.resolve(false); } });
      t.ok('the loop routes a command to the approval hook, and a decline reaches the model', reqs.join() === 'lint' && env.calls.jobs.length === 0 && s.seen[1].msgs.some((m) => m.role === 'tool' && /declined/.test(m.content)));
    }

    // provider rejects tools
    {
      const tb = A.createToolbox(envFor(FILES));
      const s = mkStream([() => Promise.reject(new Error('HTTP 400 tools not supported')), { text: 'plain answer', toolCalls: [] }]);
      let notified = 0;
      const res = await A.runLoop({ chatStream: s.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb, onNoTools: () => { notified++; } });
      t.ok('a provider that rejects tools is retried once without them, and the UI is told', res.reason === 'done' && res.text === 'plain answer' && notified === 1 && s.seen[0].tools && s.seen[1].tools === undefined);
      const s2 = mkStream([() => Promise.reject(new Error('HTTP 500 boom'))]);
      let threw = null;
      try { await A.runLoop({ chatStream: s2.fn, messages: [{ role: 'user', content: 'x' }], toolbox: tb }); } catch (e) { threw = e; }
      t.ok('other errors still surface', threw && /HTTP 500/.test(threw.message));
    }
  }
};
