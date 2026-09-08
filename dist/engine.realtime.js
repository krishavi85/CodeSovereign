/* =====================================================================
   engine.realtime.js  —  Engine.Realtime   (blueprint §14 — realtime)

   A zero-dependency WebSocket server (RFC 6455: Sec-WebSocket-Accept
   handshake + text frame parse/build + ping/pong + close) mounted on the
   generated HTTP server's `upgrade` event, a tiny pub/sub hub that
   broadcasts entity changes, a browser client helper, and
   `test/ws.test.js` that opens a real socket and round-trips a message.

   window.Engine.Realtime
     generate(spec)  -> { 'src/ws.js', 'public/ws-client.js', 'test/ws.test.js' }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function wsModule() {
    return [
      "'use strict';",
      "// Zero-dep WebSocket server (RFC 6455). Attach with wsAttach(httpServer).",
      "const crypto = require('crypto');",
      "const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';",
      "const clients = new Set();",
      "",
      "function accept(key) { return crypto.createHash('sha1').update(key + GUID).digest('base64'); }",
      "",
      "function encodeText(str) {",
      "  const payload = Buffer.from(str, 'utf8');",
      "  const len = payload.length;",
      "  let header;",
      "  if (len < 126) { header = Buffer.from([0x81, len]); }",
      "  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }",
      "  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }",
      "  return Buffer.concat([header, payload]);",
      "}",
      "",
      "function decodeFrames(buf, onText, onClose, onPing) {",
      "  let off = 0;",
      "  while (off + 2 <= buf.length) {",
      "    const b0 = buf[off], b1 = buf[off + 1];",
      "    const opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;",
      "    let len = b1 & 0x7f; let p = off + 2;",
      "    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }",
      "    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }",
      "    let mask; if (masked) { if (p + 4 > buf.length) break; mask = buf.slice(p, p + 4); p += 4; }",
      "    if (p + len > buf.length) break;",
      "    let data = buf.slice(p, p + len);",
      "    if (masked) { const u = Buffer.alloc(len); for (let i = 0; i < len; i++) u[i] = data[i] ^ mask[i & 3]; data = u; }",
      "    off = p + len;",
      "    if (opcode === 0x8) { onClose(); return off; }",
      "    if (opcode === 0x9) { onPing(data); continue; }",
      "    if (opcode === 0x1) onText(data.toString('utf8'));",
      "  }",
      "  return off;",
      "}",
      "",
      "function wsAttach(server, opts) {",
      "  opts = opts || {};",
      "  server.on('upgrade', (req, socket) => {",
      "    if ((req.url || '').split('?')[0] !== (opts.path || '/ws')) { socket.destroy(); return; }",
      "    const key = req.headers['sec-websocket-key'];",
      "    if (!key) { socket.destroy(); return; }",
      "    socket.write('HTTP/1.1 101 Switching Protocols\\r\\n' + 'Upgrade: websocket\\r\\n' + 'Connection: Upgrade\\r\\n' + 'Sec-WebSocket-Accept: ' + accept(key) + '\\r\\n\\r\\n');",
      "    const client = {",
      "      socket,",
      "      send: (obj) => { try { socket.write(encodeText(typeof obj === 'string' ? obj : JSON.stringify(obj))); } catch (_) {} }",
      "    };",
      "    clients.add(client);",
      "    let acc = Buffer.alloc(0);",
      "    socket.on('data', (chunk) => {",
      "      acc = Buffer.concat([acc, chunk]);",
      "      const used = decodeFrames(acc,",
      "        (text) => { let m; try { m = JSON.parse(text); } catch (_) { m = { type: 'text', text }; } if (opts.onMessage) opts.onMessage(m, client); if (m && m.type === 'echo') client.send({ type: 'echo', text: m.text }); },",
      "        () => { clients.delete(client); socket.end(); },",
      "        (payload) => { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); });",
      "      acc = acc.slice(used);",
      "    });",
      "    socket.on('close', () => clients.delete(client));",
      "    socket.on('error', () => clients.delete(client));",
      "    client.send({ type: 'hello', ts: Date.now() });",
      "  });",
      "}",
      "",
      "function broadcast(event, data) {",
      "  const msg = JSON.stringify({ type: 'event', event, data, ts: Date.now() });",
      "  for (const c of clients) c.send(msg);",
      "}",
      "",
      "module.exports = { wsAttach, broadcast, clients, accept, encodeText, decodeFrames };",
      ""
    ].join('\n');
  }

  function wsClient() {
    return [
      "// tiny browser WebSocket client used by the generated frontend for live updates.",
      "(function (global) {",
      "  function connectWS(onEvent) {",
      "    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';",
      "    var ws = new WebSocket(proto + '//' + location.host + '/ws');",
      "    ws.addEventListener('message', function (e) {",
      "      var m; try { m = JSON.parse(e.data); } catch (_) { return; }",
      "      if (m.type === 'event' && onEvent) onEvent(m.event, m.data);",
      "    });",
      "    ws.addEventListener('close', function () { setTimeout(function () { connectWS(onEvent); }, 2000); });",
      "    return ws;",
      "  }",
      "  global.connectWS = connectWS;",
      "})(typeof window !== 'undefined' ? window : globalThis);",
      ""
    ].join('\n');
  }

  function test() {
    return [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-ws-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const http = require('http');",
      "const crypto = require('crypto');",
      "const { wsAttach, encodeText, broadcast } = require('../src/ws');",
      "",
      "test('websocket: handshake + echo + broadcast round-trip', { timeout: 15000 }, async () => {",
      "  const server = http.createServer((req, res) => res.end('ok'));",
      "  const openSockets = new Set();",
      "  server.on('connection', (s) => { openSockets.add(s); s.on('close', () => openSockets.delete(s)); });",
      "  wsAttach(server, { path: '/ws' });",
      "  await new Promise((r) => server.listen(0, r));",
      "  const port = server.address().port;",
      "",
      "  const key = crypto.randomBytes(16).toString('base64');",
      "  const sock = require('net').connect(port, '127.0.0.1');",
      "  await new Promise((r) => sock.once('connect', r));",
      "  sock.write('GET /ws HTTP/1.1\\r\\nHost: x\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Key: ' + key + '\\r\\nSec-WebSocket-Version: 13\\r\\n\\r\\n');",
      "",
      "  const frames = [];",
      "  let buf = Buffer.alloc(0);",
      "  sock.on('data', (d) => {",
      "    buf = Buffer.concat([buf, d]);",
      "    if (!frames._handshook) {",
      "      const hEnd = buf.indexOf('\\r\\n\\r\\n');",
      "      if (hEnd < 0) return;",
      "      frames._handshook = true; frames._headers = buf.slice(0, hEnd).toString(); buf = buf.slice(hEnd + 4);",
      "    }",
      "    // parse unmasked server text frames",
      "    while (buf.length >= 2) {",
      "      let len = buf[1] & 0x7f; let p = 2;",
      "      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); p = 4; }",
      "      if (buf.length < p + len) break;",
      "      if ((buf[0] & 0x0f) === 0x1) frames.push(buf.slice(p, p + len).toString('utf8'));",
      "      buf = buf.slice(p + len);",
      "    }",
      "  });",
      "  await new Promise((r) => setTimeout(r, 150));",
      "  assert.match(frames._headers, /101 Switching Protocols/, 'server upgraded the connection');",
      "  assert.match(frames._headers, /Sec-WebSocket-Accept:/, 'accept header present');",
      "  assert.ok(frames.some((f) => /\"type\":\"hello\"/.test(f)), 'server sent the hello frame');",
      "",
      "  // client sends a masked echo frame",
      "  const payload = Buffer.from(JSON.stringify({ type: 'echo', text: 'ping' }));",
      "  const mask = crypto.randomBytes(4);",
      "  const masked = Buffer.alloc(payload.length); for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];",
      "  sock.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));",
      "  await new Promise((r) => setTimeout(r, 150));",
      "  assert.ok(frames.some((f) => /\"type\":\"echo\".*\"text\":\"ping\"/.test(f)), 'server echoed the message back');",
      "",
      "  broadcast('changed', { id: 1 });",
      "  await new Promise((r) => setTimeout(r, 100));",
      "  assert.ok(frames.some((f) => /\"type\":\"event\".*\"event\":\"changed\"/.test(f)), 'broadcast reached the client');",
      "",
      "  sock.destroy();",
      "  for (const s of openSockets) s.destroy();",
      "  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}",
      "  await Promise.race([ new Promise((r) => server.close(r)), new Promise((r) => setTimeout(r, 2000)) ]);",
      "});",
      ""
    ].join('\n');
  }

  function generate(spec) {
    return {
      'src/ws.js': wsModule(),
      'public/ws-client.js': wsClient(),
      'test/ws.test.js': test()
    };
  }

  Engine.Realtime = { generate: generate };
  console.info('[Realtime] zero-dep WebSocket generator ready — Engine.Realtime');
})();
