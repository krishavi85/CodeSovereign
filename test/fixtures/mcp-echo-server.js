'use strict';
/* Minimal MCP stdio echo used by electron/lib/mcp tests. */
let buf = Buffer.alloc(0);
function send(msg) {
  const json = JSON.stringify(msg);
  const len = Buffer.byteLength(json, 'utf8');
  process.stdout.write('Content-Length: ' + len + '\r\n\r\n' + json);
}
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = buf.slice(0, headerEnd).toString('utf8');
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) { buf = buf.slice(headerEnd + 4); continue; }
    const size = Number(m[1]);
    const start = headerEnd + 4;
    if (buf.length < start + size) return;
    const body = buf.slice(start, start + size).toString('utf8');
    buf = buf.slice(start + size);
    let req = {};
    try { req = JSON.parse(body); } catch (_) { continue; }
    if (req.method === 'initialize') {
      send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'echo' }, capabilities: { tools: {} } } });
    } else if (req.method === 'tools/call') {
      send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(req.params || {}) }] } });
    } else {
      send({ jsonrpc: '2.0', id: req.id, result: { ok: true, method: req.method } });
    }
  }
});
