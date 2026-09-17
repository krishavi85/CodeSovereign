'use strict';
/* electron/lib/aihost.js — the OpenClaw readiness probe. openclawRunning()
 * is the one piece of the new start/stop/status control that's cheap and
 * deterministic to test directly (no `npx openclaw` shell-out): it must
 * report true only when something actually answers on the loopback port,
 * never guess. */
const http = require('http');
const aihost = require('../electron/lib/aihost.js');

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler);
    srv.listen(18789, '127.0.0.1', async () => {
      let err = null;
      try { await fn(); } catch (e) { err = e; }
      srv.close(() => (err ? reject(err) : resolve()));
    });
    srv.on('error', reject);
  });
}

module.exports = async function (t) {
  t.equal('openclawRunning() is false when nothing listens on :18789', await aihost.openclawRunning(), false);

  await withServer((_req, res) => { res.writeHead(200); res.end('ok'); }, async () => {
    t.equal('openclawRunning() is true once the gateway answers', await aihost.openclawRunning(), true);
  });

  t.equal('openclawRunning() is false again once the gateway stops', await aihost.openclawRunning(), false);

  // a real HTTP response of any status (not just 200) counts as "running" —
  // openclawRunning() only checks that something answered, not what it said.
  await withServer((_req, res) => { res.writeHead(500); res.end('error'); }, async () => {
    t.equal('a 500 response still counts as "running" (server is up, that is all this checks)', await aihost.openclawRunning(), true);
  });

  t.ok('openclaw() rejects an unknown action rather than guessing', (await aihost.openclaw('bogus')).ok === false);
};
