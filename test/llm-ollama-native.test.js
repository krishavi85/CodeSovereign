'use strict';
/* Engine.LLM.chatStream -> Ollama's native /api/chat when a context size is
 * requested. Ollama ignores options.num_ctx on its OpenAI-compatible route and
 * silently truncates long prompts, so the agent must use the native API.
 * Tested against a fake Ollama (NDJSON). */
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

function loadLLM() {
  const store = {};
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, fetch, AbortController, TextDecoder, URL
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const n of ['vendor/acorn.js', 'engine.js', 'engine.llm.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), ctx, { filename: n });
  return win.Engine.LLM;
}
const line = (o) => JSON.stringify(o) + '\n';

module.exports = async function (t) {
  const LLM = loadLLM();

  /* ---------- NDJSON parser ---------- */
  {
    const st = LLM._sseState();
    const raw = line({ message: { role: 'assistant', content: 'Hel' }, done: false }) + line({ message: { content: 'lo' }, done: false }) +
      line({ message: { content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: '/a.js' } } }] }, done: false }) + line({ done: true, done_reason: 'stop' });
    const got = [];
    for (let i = 0; i < raw.length; i += 9) got.push(...LLM._ndjsonFeed(st, raw.slice(i, i + 9)));
    t.deepEqual('NDJSON deltas survive arbitrary chunk boundaries', got, ['Hel', 'lo']);
    t.ok('structured tool calls (arguments as an object) are captured as JSON text', st.toolCalls.length === 1 && st.toolCalls[0].name === 'read_file' && JSON.parse(st.toolCalls[0].arguments).path === '/a.js');
    t.ok('done and the finish reason are tracked', st.done === true && st.finish === 'stop' && st.text === 'Hello');
    const st2 = LLM._sseState();
    LLM._ndjsonFeed(st2, line({ error: 'model not found' }));
    t.equal('an error line is kept for the caller', st2.error, 'model not found');
  }

  /* ---------- message conversion ---------- */
  {
    const out = LLM._toOllamaMessages([
      { role: 'system', content: 'S' }, { role: 'user', content: 'U' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/a.js"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'file text' }
    ]);
    t.deepEqual('tool-call arguments become objects and tool results name their tool', out[2].tool_calls[0].function, { name: 'read_file', arguments: { path: '/a.js' } });
    t.ok('the tool message carries the tool name', out[3].role === 'tool' && out[3].tool_name === 'read_file' && out[3].content === 'file text');
    t.deepEqual('plain messages pass through', out.slice(0, 2), [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
    t.equal('malformed argument text does not throw (it becomes an empty object)', typeof LLM._toOllamaMessages([{ role: 'assistant', tool_calls: [{ id: 'x', function: { name: 'n', arguments: '{oops' } }] }])[0].tool_calls[0].function.arguments, 'object');
  }

  /* ---------- against a fake Ollama ---------- */
  {
    const hits = [];
    let mode = 'text';
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const j = JSON.parse(body || '{}');
        hits.push({ url: req.url, body: j });
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        if (mode === 'error') { res.end(line({ error: 'model "x" not found' })); return; }
        if (mode === 'tool') {
          res.write(line({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'list_dir', arguments: { path: '/' } } }] }, done: false }));
          res.end(line({ done: true, done_reason: 'stop' })); return;
        }
        const pieces = ['one ', 'two ', 'three'];
        let i = 0;
        const tick = setInterval(() => {
          if (i < pieces.length) res.write(line({ message: { role: 'assistant', content: pieces[i++] }, done: false }));
          else { res.end(line({ done: true, done_reason: 'stop' })); clearInterval(tick); }
        }, 40);
        res.on('close', () => clearInterval(tick));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      LLM.setConfig({ enabled: true, providerId: 'openai_compat', baseUrl: base, model: 'qwen-test', apiKey: '' });
      const seen = [];
      let r = await LLM.chatStream([{ role: 'user', content: 'hi' }], { ollamaNative: true, temperature: 0.1, maxTokens: 123, extraBody: { options: { num_ctx: 16384 } }, onDelta: (d) => seen.push(d) });
      t.equal('a context-size request goes to /api/chat', hits[0].url, '/api/chat');
      t.equal('num_ctx reaches Ollama in options', hits[0].body.options.num_ctx, 16384);
      t.ok('temperature and the output limit are mapped into options', hits[0].body.options.temperature === 0.1 && hits[0].body.options.num_predict === 123);
      t.ok('the model and stream flag are sent', hits[0].body.model === 'qwen-test' && hits[0].body.stream === true && hits[0].body.messages[0].content === 'hi');
      t.deepEqual('streamed NDJSON arrives as deltas', seen, ['one ', 'two ', 'three']);
      t.equal('and the full text is returned', r.text, 'one two three');

      mode = 'tool';
      r = await LLM.chatStream([{ role: 'user', content: 'x' }], { ollamaNative: true, extraBody: { options: { num_ctx: 8192 } }, tools: [{ name: 'list_dir', description: 'd', parameters: { type: 'object', properties: {} } }] });
      t.ok('tools are sent in the OpenAI function shape', hits[1].body.tools[0].type === 'function' && hits[1].body.tools[0].function.name === 'list_dir');
      t.ok('a structured tool call comes back as name + JSON arguments', r.toolCalls.length === 1 && r.toolCalls[0].name === 'list_dir' && JSON.parse(r.toolCalls[0].arguments).path === '/');

      mode = 'error';
      let err = null;
      try { await LLM.chatStream('x', { ollamaNative: true, extraBody: { options: { num_ctx: 4096 } } }); } catch (e) { err = e; }
      t.ok('an error from Ollama is thrown, not swallowed', err && /not found/.test(err.message));

      mode = 'text';
      r = await LLM.chatStream('x', {});
      t.equal('without a context size the OpenAI-compatible route is used', hits[hits.length - 1].url, '/v1/chat/completions');
      r = await LLM.chatStream('x', { extraBody: { options: { num_ctx: 4096 } } });
      t.equal('on a non-Ollama endpoint options never force the native API', hits[hits.length - 1].url, '/v1/chat/completions');
      t.ok('...and extraBody is merged into the OpenAI-style body there', hits[hits.length - 1].body.options && hits[hits.length - 1].body.options.num_ctx === 4096);

      // abort mid-stream
      const ac = new AbortController();
      const got = [];
      const pr = LLM.chatStream('x', { ollamaNative: true, extraBody: { options: { num_ctx: 4096 } }, signal: ac.signal, onDelta: (d) => { got.push(d); if (got.length === 1) ac.abort(); } });
      const ar = await pr;
      t.ok('abort works on the native stream and keeps the partial text', ar.aborted === true && ar.text.startsWith('one'));
    } finally { server.close(); }
  }
};
