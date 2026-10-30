'use strict';
/* In the browser build every model call is a fetch(), so the page CSP decides which loopback servers can be reached.
 * Every local server the app can talk to must be listed, or it fails with a misleading "is it running?" error. */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const dist = (f) => fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8');
  const html = dist('index.html');
  const csp = /connect-src([^;]*);/.exec(html)[1];
  const listed = (port) => csp.indexOf('http://127.0.0.1:' + port) >= 0 && csp.indexOf('http://localhost:' + port) >= 0;

  // every loopback base URL a provider declares in engine.llm.js
  const llm = dist('engine.llm.js');
  const ports = new Set([...llm.matchAll(/baseUrl:\s*"http:\/\/(?:localhost|127\.0\.0\.1):(\d+)"/g)].map((m) => m[1]));
  t.ok('the provider table has loopback providers to check', ports.size >= 3, [...ports].join(','));
  for (const p of ports) t.ok('CSP allows the provider on port ' + p, listed(p));

  // the local agents and servers that are not in the provider table
  t.ok('Hermes Agent API server (8642) is allowed', listed('8642'));
  t.ok('OpenClaw gateway (18789) is allowed', listed('18789'));
  t.ok('Ollama (11434) is allowed', listed('11434'));
  t.ok('OmniRoute (20128) is allowed', listed('20128'));

  // the honest label survives the failure path too
  const app = dist('app.js');
  t.ok('a failed bundle export says Export, not Deploy', !/Deploy failed/.test(app) && /Export failed/.test(app));
};
