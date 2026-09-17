'use strict';
/*
 * Long-lived MCP stdio sessions. JSON-RPC with Content-Length framing.
 * Spawn is restricted to the same allowlist as proc.spawnAllowed (npx/node/…).
 */
const proc = require('./proc');

const sessions = new Map();

function encode(msg) {
  const json = JSON.stringify(msg);
  const len = Buffer.byteLength(json, 'utf8');
  return 'Content-Length: ' + len + '\r\n\r\n' + json;
}

function onBytes(rec, chunk) {
  rec.buf = Buffer.concat([rec.buf, Buffer.from(chunk)]);
  while (true) {
    const headerEnd = rec.buf.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = rec.buf.slice(0, headerEnd).toString('utf8');
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) {
      rec.buf = rec.buf.slice(headerEnd + 4);
      continue;
    }
    const size = Number(m[1]);
    const start = headerEnd + 4;
    if (rec.buf.length < start + size) return;
    const body = rec.buf.slice(start, start + size).toString('utf8');
    rec.buf = rec.buf.slice(start + size);
    let msg = null;
    try { msg = JSON.parse(body); } catch (_) { continue; }
    if (msg && msg.id != null && rec.pending[msg.id]) {
      const p = rec.pending[msg.id];
      clearTimeout(p.timer);
      delete rec.pending[msg.id];
      p.resolve(msg);
    }
  }
}

function start(opts) {
  opts = opts || {};
  const cmd = String(opts.cmd || opts.command || '');
  const args = Array.isArray(opts.args) ? opts.args.map(String) : [];
  if (!cmd) throw new Error('cmd required');
  const rec = { buf: Buffer.alloc(0), pending: {}, seq: 0, dead: false };
  const spawned = proc.spawnAllowed({ cmd: cmd, args: args, cwd: opts.cwd || '.' }, (evt) => {
    if (evt.stream === 'stdout' && evt.data) onBytes(rec, evt.data);
    if (evt.stream === 'exit') {
      rec.dead = true;
      Object.keys(rec.pending).forEach((k) => {
        const p = rec.pending[k];
        clearTimeout(p.timer);
        p.resolve({ jsonrpc: '2.0', id: Number(k), error: { message: 'stdio MCP exited' } });
      });
      rec.pending = {};
    }
  });
  rec.id = spawned.id;
  rec.pid = spawned.pid;
  sessions.set(spawned.id, rec);
  return { id: spawned.id, pid: spawned.pid };
}

function request(id, method, params, timeoutMs) {
  const rec = sessions.get(id);
  if (!rec || rec.dead) return Promise.resolve({ error: { message: 'mcp session gone' } });
  const rpcId = ++rec.seq;
  const msg = { jsonrpc: '2.0', id: rpcId, method: String(method || ''), params: params || {} };
  return new Promise((resolve) => {
    rec.pending[rpcId] = {
      resolve: resolve,
      timer: setTimeout(() => {
        delete rec.pending[rpcId];
        resolve({ jsonrpc: '2.0', id: rpcId, error: { message: 'mcp timeout' } });
      }, timeoutMs || 20000)
    };
    proc.write(id, encode(msg));
  });
}

function stop(id) {
  const rec = sessions.get(id);
  if (rec) {
    rec.dead = true;
    sessions.delete(id);
  }
  proc.kill(id);
  return { ok: true };
}

module.exports = { start, request, stop, encode, _sessions: sessions };
