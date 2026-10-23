'use strict';
/*
 * freeport.js — make sure a TCP port is not already held by a stray process
 * before a run that expects to start its own server there.
 *
 * The acceptance harnesses drive a hidden observer window against a dev server
 * on a fixed port. If a PREVIOUS run timed out or crashed, its `node server.js`
 * can survive and keep listening — and `desktop-observe.ensureServer()` will
 * happily reuse "a server that is already running", crawling the wrong (stale,
 * possibly already-repaired) workspace. That silently invalidates the whole run.
 *
 * This kills whatever is listening on `port` (loopback only) so the next run
 * starts from a clean slate. Best-effort and platform-aware; never throws.
 */
const net = require('net');
const { execFileSync } = require('child_process');

function isListening(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(400, () => { s.destroy(); resolve(false); });
  });
}

function pidsOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', timeout: 5000 });
      out.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      });
    } else {
      const out = execFileSync('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 5000 });
      out.split(/\s+/).filter(Boolean).forEach((p) => pids.add(p));
    }
  } catch (_) { /* nothing listening, or the tool is missing */ }
  return [...pids];
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/PID', String(pid), '/T'], { stdio: 'ignore', timeout: 5000 });
    else process.kill(Number(pid), 'SIGKILL');
  } catch (_) { /* already gone */ }
}

async function freePort(port) {
  const held = (await isListening(port, '127.0.0.1')) || (await isListening(port, '::1'));
  if (!held) return { port, wasHeld: false, killed: [] };
  const pids = pidsOnPort(port);
  pids.forEach(killPid);
  // give the OS a moment to release the socket
  await new Promise((r) => setTimeout(r, 600));
  const stillHeld = (await isListening(port, '127.0.0.1')) || (await isListening(port, '::1'));
  return { port, wasHeld: true, killed: pids, stillHeld };
}

module.exports = { freePort, isListening };
