'use strict';
/* IDE agent chat panel, phase 1: streaming chat.
 *   - Engine.LLM.chatStream + its SSE parser (against a real local SSE server)
 *   - electron aihost.request onData / onAbort hooks
 *   - dist/app.chat.js core: safe markdown, context building, send/stop flow */
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const DIST = path.join(__dirname, '..', 'dist');

function ctxWith(extra) {
  const store = {};
  const win = Object.assign({
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {},
    document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch, AbortController, TextDecoder, URL
  }, extra || {});
  win.window = win;
  win._store = store;
  return { win, ctx: vm.createContext(win) };
}
function run(ctx, file) { vm.runInContext(fs.readFileSync(path.join(DIST, file), 'utf8'), ctx, { filename: file }); }

function loadLLM() {
  const { win, ctx } = ctxWith();
  for (const n of ['vendor/acorn.js', 'engine.js', 'engine.llm.js']) run(ctx, n);
  return { win, LLM: win.Engine.LLM };
}

function loadChat(extra) {
  const { win, ctx } = ctxWith(extra);
  run(ctx, 'app.chat.js');
  return { win, Chat: win.CSChat };
}

function sse(obj) { return 'data: ' + JSON.stringify(obj) + '\n\n'; }
function delta(text) { return sse({ choices: [{ delta: { content: text } }] }); }

module.exports = async function (t) {
  /* ---------- SSE parser ---------- */
  {
    const { LLM } = loadLLM();
    const st = LLM._sseState();
    const all = [];
    const raw = delta('Hel') + delta('lo') + sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
    // feed in awkward slices: split mid-line and mid-JSON
    for (let i = 0; i < raw.length; i += 7) all.push(...LLM._sseFeed(st, raw.slice(i, i + 7)));
    t.deepEqual('SSE deltas survive arbitrary chunk boundaries', all, ['Hel', 'lo']);
    t.ok('SSE state tracks text, finish reason and [DONE]', st.text === 'Hello' && st.finish === 'stop' && st.done === true);

    const st2 = LLM._sseState();
    LLM._sseFeed(st2, sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read_file', arguments: '{"pa' } }] } }] }));
    LLM._sseFeed(st2, sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"/a.js"}' } }] } }] }));
    t.deepEqual('tool-call fragments are assembled by index', st2.toolCalls, [{ id: 'c1', name: 'read_file', arguments: '{"path":"/a.js"}' }]);
    const st3 = LLM._sseState();
    t.deepEqual('comments, blank lines and bad JSON are ignored', LLM._sseFeed(st3, ': ping\n\ndata: {oops\n\n' + delta('ok')), ['ok']);
  }

  /* ---------- chatStream against a real SSE server ---------- */
  {
    const hits = [];
    let sseMode = 'finish';
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => {
        hits.push({ url: req.url, body: JSON.parse(body || '{}') });
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const pieces = ['one ', 'two ', 'three'];
        let i = 0;
        const tick = setInterval(() => {
          if (i < pieces.length) { res.write(delta(pieces[i++])); }
          else if (sseMode === 'hang') { /* keep open until the client aborts */ }
          else { res.write('data: [DONE]\n\n'); res.end(); clearInterval(tick); }
        }, 60);
        res.on('close', () => clearInterval(tick));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      const { LLM } = loadLLM();
      LLM.setConfig({ enabled: true, providerId: 'openai_compat', baseUrl: base, model: 'test-model', apiKey: '' });

      const stamps = [];
      const seen = [];
      const t0 = Date.now();
      const r = await LLM.chatStream([{ role: 'user', content: 'hi' }], { onDelta: (d) => { seen.push(d); stamps.push(Date.now() - t0); } });
      t.deepEqual('chatStream delivers each delta in order', seen, ['one ', 'two ', 'three']);
      t.equal('chatStream returns the full text', r.text, 'one two three');
      t.ok('deltas arrive incrementally, not all at the end', stamps.length === 3 && stamps[2] - stamps[0] >= 60);
      t.ok('the request asked for stream:true with the configured model', hits[0].body.stream === true && hits[0].body.model === 'test-model');

      // abort mid-stream keeps the partial text
      sseMode = 'hang';
      const ac = new AbortController();
      const partial = [];
      const pr = LLM.chatStream([{ role: 'user', content: 'x' }], { signal: ac.signal, onDelta: (d) => { partial.push(d); if (partial.length === 2) ac.abort(); } });
      const ar = await pr;
      t.ok('abort resolves with aborted:true and the text received so far', ar.aborted === true && ar.text.startsWith('one two'));

    } finally { server.close(); }

    // plain-JSON and error responses
    const mode = { v: 'plain' };
    const server2 = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (mode.v === 'plain') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'plain reply' } }] })); }
        else { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"bad key"}'); }
      });
    });
    await new Promise((r) => server2.listen(0, '127.0.0.1', r));
    try {
      const { LLM } = loadLLM();
      LLM.setConfig({ enabled: true, providerId: 'openai_compat', baseUrl: 'http://127.0.0.1:' + server2.address().port, model: 'm', apiKey: '' });
      const got = [];
      const pr = await LLM.chatStream('hello', { onDelta: (d) => got.push(d) });
      t.ok('a provider that ignores stream:true still works (one delta)', pr.text === 'plain reply' && got.length === 1 && got[0] === 'plain reply');
      mode.v = 'deny';
      let err = null;
      try { await LLM.chatStream('hello', {}); } catch (e) { err = e; }
      t.ok('an HTTP error surfaces as a thrown error with the status', err && /HTTP 401/.test(err.message));
    } finally { server2.close(); }
  }

  /* ---------- electron aihost: onData / onAbort ---------- */
  {
    const origLoad = Module._load;
    Module._load = function (request) {
      if (request === 'electron') return { app: { getPath: () => require('os').tmpdir() } };
      return origLoad.apply(this, arguments);
    };
    const p = require.resolve('../electron/lib/aihost');
    delete require.cache[p];
    const aihost = require(p);
    Module._load = origLoad;

    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"a":1}\n\n');
      // a multi-byte character split across two TCP writes
      const euro = Buffer.from('€');
      res.write(Buffer.from('data: {"b":"').slice(0));
      res.write(euro.slice(0, 1)); setTimeout(() => { res.write(euro.slice(1)); res.write('"}\n\n'); if (!req.url.endsWith('/hang')) res.end(); }, 30);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      let streamed = '';
      const r = await aihost.request({ url: base + '/done', method: 'POST', body: '{}', timeoutMs: 5000, onData: (s) => { streamed += s; } });
      t.ok('onData receives the same text the final body holds', r.ok && streamed === r.body);
      t.ok('a multi-byte character split across chunks is decoded intact', streamed.includes('€') && !streamed.includes('�'));

      let abort = null, got = '';
      const pending = aihost.request({ url: base + '/hang', method: 'POST', body: '{}', timeoutMs: 20000, onData: (s) => { got += s; if (abort && got.includes('"a":1')) abort(); }, onAbort: (fn) => { abort = fn; } });
      const ar = await pending;
      t.ok('onAbort cancels an in-flight request promptly', ar.ok === false && ar.error === 'aborted');
    } finally { server.close(); }
  }

  /* ---------- chat panel core ---------- */
  {
    const { Chat } = loadChat();
    const md = Chat.core.renderMarkdown;
    const evil = md('<img src=x onerror=alert(1)> and <script>x()</script>');
    t.ok('markdown escapes raw HTML from the model', !/<img|<script/.test(evil) && evil.includes('&lt;script&gt;'));
    const fenced = md('Here:\n```js\nconst a = "<b>";\n```\nDone `x` **bold**');
    t.ok('fenced code becomes a code block with a language label and Copy button', /class="csc-code"/.test(fenced) && /<span>js<\/span>/.test(fenced) && /data-cs-copy="0"/.test(fenced));
    t.ok('code inside a fence is escaped', fenced.includes('&lt;b&gt;') && !fenced.includes('<b>'));
    t.ok('inline code and bold render', /<code class="csc-ic">x<\/code>/.test(fenced) && /<strong>bold<\/strong>/.test(fenced));
    t.ok('an unterminated fence (mid-stream) still renders as code', /class="csc-code"/.test(md('```py\nprint(1)')));
    t.ok('bullet lists render as a list', /<ul><li>a<\/li><li>b<\/li><\/ul>/.test(md('- a\n- b')));
    t.deepEqual('codeBlocks returns the raw code per fence', Chat.core.codeBlocks('x\n```a\n1\n```\ny\n```b\n2\n```'), ['1', '2']);

    const hist = [
      { role: 'user', content: 'first' }, { role: 'assistant', content: 'oops', error: true },
      { role: 'assistant', content: 'reply' }, { role: 'user', content: 'second' }
    ];
    const msgs = Chat.core.buildMessages(hist, { files: ['/a.js', '/b.js'], activePath: '/a.js', activeContent: 'let x = 1;' });
    t.equal('system message comes first', msgs[0].role, 'system');
    t.ok('system message lists project files and the open file with its content', /\/b\.js/.test(msgs[0].content) && /open: \/a\.js/.test(msgs[0].content) && /let x = 1;/.test(msgs[0].content));
    t.deepEqual('history keeps order and drops errored replies', msgs.slice(1).map((m) => m.content), ['first', 'reply', 'second']);
    const big = Chat.core.buildMessages([{ role: 'user', content: 'a'.repeat(20000) }, { role: 'assistant', content: 'b'.repeat(20000) }, { role: 'user', content: 'last' }], {});
    t.ok('old history is dropped to fit the budget but the newest message always stays', big[big.length - 1].content === 'last' && big.length < 4);
    const longFile = Chat.core.buildMessages([{ role: 'user', content: 'q' }], { activePath: '/big.js', activeContent: 'z'.repeat(50000) });
    t.ok('a huge open file is truncated in the prompt', longFile[0].content.length < 20000 && /first 12000 characters/.test(longFile[0].content));
  }

  /* ---------- chat panel send / stop / persistence ---------- */
  {
    let calls = [];
    let behavior = 'ok';
    const AI = {
      ready: () => behavior !== 'offline',
      status: () => ({ connected: true, provider: 'ollama', model: 'llama3', free: true, source: 'local' }),
      chatStream: (msgs, o) => {
        calls.push(msgs);
        if (behavior === 'fail') return Promise.reject(new Error('boom'));
        return new Promise((resolve, reject) => {
          const parts = ['Hel', 'lo'];
          let i = 0, acc = '';
          const step = () => {
            if (o.signal && o.signal.aborted) { resolve({ text: acc, aborted: true }); return; }
            if (i < parts.length) { acc += parts[i]; o.onDelta(parts[i++]); setTimeout(step, behavior === 'slow' ? 40 : 1); }
            else resolve({ text: acc, aborted: false });
          };
          setTimeout(step, 1);
        });
      }
    };
    const FS = { _data: { '/a.js': 'x', '/b.js': 'y' }, isFile: () => true, read: (p) => (p === '/a.js' ? 'let a;' : '') };
    const { win, Chat } = loadChat({ Engine: { AI, FS }, S: { ideFile: '/a.js', ideBuffer: 'let a = 2;' }, document: { getElementById: () => null } });

    const bot = await Chat.send('  what does this do?  ');
    t.equal('send streams the reply into the assistant message', bot.content, 'Hello');
    const th = Chat.thread();
    t.deepEqual('the thread holds the user message then the reply', th.messages.map((m) => m.role + ':' + m.content), ['user:what does this do?', 'assistant:Hello']);
    t.equal('the thread is titled from the first message', th.title, 'what does this do?');
    t.ok('the open buffer (unsaved text) and file list reach the model', /let a = 2;/.test(calls[0][0].content) && /\/b\.js/.test(calls[0][0].content));
    t.ok('streaming flags are cleared once done', bot.streaming === false && Chat.busy === false);
    t.ok('the conversation is persisted', /what does this do/.test(win._store['cs.chat.v1'] || ''));

    await Chat.send('and now?');
    const second = calls[1].filter((m) => m.role !== 'system').map((m) => m.content);
    t.deepEqual('a follow-up carries the earlier turns', second, ['what does this do?', 'Hello', 'and now?']);

    behavior = 'slow';
    const pending = Chat.send('long one');
    t.ok('a second send while busy is ignored', (await Chat.send('ignored')) === null && Chat.busy === true);
    await new Promise((r) => setTimeout(r, 55));
    Chat.stop();
    const stopped = await pending;
    t.ok('stop aborts, keeps the partial text and marks it stopped', stopped.stopped === true && stopped.content.length > 0 && Chat.busy === false);

    behavior = 'fail';
    const failed = await Chat.send('will fail');
    t.ok('a failed request is shown as an error message, not thrown', failed.error === true && /Request failed: boom/.test(failed.content) && Chat.busy === false);
    behavior = 'ok';
    await Chat.send('retry');
    t.ok('errored replies are excluded from the next prompt', !calls[calls.length - 1].some((m) => /Request failed/.test(m.content)));

    behavior = 'offline';
    const off = await Chat.send('anyone there?');
    t.ok('with no model connected the reply explains how to connect, without calling the model', off.error === true && /No model is connected/.test(off.content) && calls.length === 5);

    const before = Chat.thread().id;
    Chat.newThread();
    t.ok('newThread starts an empty conversation and keeps the old one', Chat.thread().id !== before && Chat.thread().messages.length === 0);
  }
};
