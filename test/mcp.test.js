'use strict';
/* Live MCP stdio JSON-RPC + desktop net fetch guards. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const ws = require('../electron/lib/workspace');
const mcp = require('../electron/lib/mcp');
const net = require('../electron/lib/net');
const proc = require('../electron/lib/proc');

module.exports = async function (t) {
  t.ok('stdio is not a fake success without a session', typeof mcp.start === 'function' && typeof mcp.request === 'function');

  await t.throwsAsync('net.fetchUrl rejects remote http', async () =>
    net.fetchUrl({ url: 'http://example.com/' }));
  await t.throwsAsync('net.fetchUrl rejects unknown protocol', async () =>
    net.fetchUrl({ url: 'file:///etc/passwd' }));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-mcp-'));
  ws.setRoot(tmp);
  const echo = path.join(__dirname, 'fixtures', 'mcp-echo-server.js');
  const started = mcp.start({ cmd: 'node', args: [echo], cwd: '.' });
  t.ok('stdio MCP session starts', !!(started && started.id && started.pid));
  const init = await mcp.request(started.id, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' }
  });
  t.ok('initialize JSON-RPC round-trip', !!(init && init.result && init.result.serverInfo && init.result.serverInfo.name === 'echo'));
  const call = await mcp.request(started.id, 'tools/call', { name: 'echo', arguments: { n: 7 } });
  t.ok('tools/call echoes arguments', /"n":7/.test(JSON.stringify(call && call.result)));
  mcp.stop(started.id);
  proc.killAll();
  fs.rmSync(tmp, { recursive: true, force: true });
};
