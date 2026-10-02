'use strict';
/* electron/lib/aihost.js request(): a streamed model answer cut at the time
 * limit returns what arrived ({ ok, partial:true, body }) when the caller
 * opts in — live 2026-10-02 a 30-minute local-model answer was cut and all of
 * it was lost. Without the flag a timeout is still an error, and a normal
 * request is unchanged. Uses a real local HTTP server. */
const http = require('http');
const Module = require('module');

function loadAihost() {
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') return { app: { getPath: () => require('os').tmpdir() } };
    return origLoad.apply(this, arguments);
  };
  const p = require.resolve('../electron/lib/aihost');
  delete require.cache[p];
  const mod = require(p);
  Module._load = origLoad;
  return mod;
}

module.exports = async function (t) {
  const aihost = loadAihost();
  // /stall streams two SSE chunks, then never finishes; /ok answers normally.
  const server = http.createServer((req, res) => {
    if (req.url === '/stall') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"FILE: /a.js\\n"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"const a = 1;"}}]}\n\n');
      return; // hang
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const t0 = Date.now();
    const cut = await aihost.request({ url: base + '/stall', method: 'POST', body: '{}', timeoutMs: 700, partialOnTimeout: true });
    t.ok('a stream cut at the time limit resolves ok + partial', cut.ok === true && cut.partial === true);
    t.ok('the partial body holds everything that arrived', /FILE: \/a\.js/.test(cut.body) && /const a = 1;/.test(cut.body));
    t.ok('the limit is a total deadline (fires even while the socket is open)', Date.now() - t0 < 5000);

    const err = await aihost.request({ url: base + '/stall', method: 'POST', body: '{}', timeoutMs: 700 });
    t.ok('without partialOnTimeout a timeout is still an error', err.ok === false && /timeout/.test(err.error));

    const ok = await aihost.request({ url: base + '/ok', method: 'POST', body: '{}', timeoutMs: 5000, partialOnTimeout: true });
    t.ok('a normal response is unchanged (not partial)', ok.ok === true && !ok.partial && ok.body === '{"ok":true}');
  } finally {
    server.close();
  }
};
