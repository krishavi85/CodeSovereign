'use strict';
/* electron/lib/openclaw-manager.js — the parts safe to exercise in an
 * automated suite: probe() (a plain loopback HTTP check, no shell-out) and
 * detect()'s contract shape (read-only `openclaw --version`, safe to call
 * for real, but its result depends on whether the CLI happens to be
 * installed on the machine running the tests — so only the shape is
 * asserted, never a specific installed/not-installed value).
 *
 * gatewayInstall/gatewayStart/gatewayStop/gatewayRestart/install/
 * openOnboarding all mutate real system state (install a package, register
 * an OS service, spawn a terminal) and are deliberately NOT called here —
 * they were verified live, manually, against the real openclaw CLI:
 *   - `gateway status|start|stop|probe --json` all parse as expected
 *   - phase derivation ('stopped' -> 'starting'/'running' -> 'stopped')
 *     matches the real service transition, confirmed against actual
 *     service.runtime.status / port.status / rpc.ok values
 */
const http = require('http');
const mgr = require('../electron/lib/openclaw-manager.js');

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler);
    srv.listen(mgr.GATEWAY_PORT, '127.0.0.1', async () => {
      let err = null;
      try { await fn(); } catch (e) { err = e; }
      srv.close(() => (err ? reject(err) : resolve()));
    });
    srv.on('error', reject);
  });
}

module.exports = async function (t) {
  t.equal('probe() is not ready when nothing listens on the gateway port', (await mgr.probe()).ready, false);

  await withServer((_req, res) => { res.writeHead(200); res.end('ok'); }, async () => {
    t.equal('probe() is ready once something answers', (await mgr.probe()).ready, true);
  });

  t.equal('probe() is not ready again once the listener stops', (await mgr.probe()).ready, false);

  // any HTTP response (not just 200) counts as "ready" — probe() only
  // checks that something answered, not what it said.
  await withServer((_req, res) => { res.writeHead(500); res.end('error'); }, async () => {
    t.equal('a 500 response still counts as ready (something is listening, that is all this checks)', (await mgr.probe()).ready, true);
  });

  const d = await mgr.detect();
  t.ok('detect() always returns an installed boolean', typeof d.installed === 'boolean');
  if (d.installed) {
    t.ok('detect() reports a version string when installed', typeof d.version === 'string' && d.version.length > 0);
  }

  t.equal('GATEWAY_PORT is the documented OpenClaw Gateway port', mgr.GATEWAY_PORT, 18789);
};
