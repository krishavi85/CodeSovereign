'use strict';
/* electron/lib/aihost.js's ai:request used to default to a 45s timeout,
 * which killed legitimate local-LLM completions mid-request on modest
 * hardware (confirmed live earlier this session: Ollama's own log showed
 * "aborting completion request due to client closing the connection" at
 * exactly 45.0s). That was fixed by having chat()/complete() in
 * engine.llm.js always pass an explicit timeoutMs - but the service's own
 * default stayed at 45000, so any caller that forgets to pass timeoutMs
 * silently reintroduces the exact bug. Raised the default to 300000 (the
 * same generous value chat()/complete() already rely on) so the safety net
 * matches real local-inference behavior instead of just "a bit longer than
 * 45s".
 *
 * Doing that blindly would have broken testConnection() - a connectivity
 * probe that must fail fast - since it never passed its own timeoutMs and
 * so was implicitly relying on the old 45s default. It now passes an
 * explicit, short 20s timeoutMs so it stays decoupled from whatever the
 * service-level default is.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

module.exports = async function (t) {
  const aihostSrc = fs.readFileSync(path.join(__dirname, '..', 'electron', 'lib', 'aihost.js'), 'utf8');
  t.ok('the service default timeout is generous enough for real local-LLM inference (300s), not the old 45s',
    /timeout:\s*o\.timeoutMs\s*\|\|\s*300000/.test(aihostSrc));
  t.ok('...and the 45s default is gone entirely', !/\|\|\s*45000/.test(aihostSrc));

  const llmSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  const testConnBody = llmSrc.slice(llmSrc.indexOf('async function testConnection'), llmSrc.indexOf('async function testConnection') + 1200);
  t.ok('testConnection() passes its own short timeoutMs instead of inheriting the service default',
    /timeoutMs:\s*20000/.test(testConnBody));
  t.ok('...so a slow/unreachable probe still fails in seconds, not minutes',
    (function () {
      const m = testConnBody.match(/timeoutMs:\s*(\d+)/);
      return !!m && Number(m[1]) < 60000;
    })());

  // Sanity check aihost.request() still works end-to-end against a real
  // local server - this is not a timing test (that would need to actually
  // wait out a real 300s timeout, which does not belong in a fast suite).
  const aihost = require('../electron/lib/aihost.js');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const r = await aihost.request({ url: 'http://127.0.0.1:' + port + '/v1/models', method: 'GET' });
    t.ok('a real request without an explicit timeoutMs still succeeds against a fast local server', r.ok && r.status === 200);
  } finally {
    server.close();
  }
};
