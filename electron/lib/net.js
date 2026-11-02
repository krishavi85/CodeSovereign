'use strict';
/*
 * Renderer-initiated HTTPS (or localhost HTTP) fetch. Bypasses page CSP so
 * desktop can reach remote MCP / Google / Vercel / GitHub APIs.
 *
 * The destination is bound to what was checked: the host is resolved ONCE, every address is vetted against the
 * private / link-local rules, and the connection is made to that vetted address (TLS still validates the
 * hostname). A second, independent lookup at connect time (DNS rebinding) cannot change where the request goes.
 */
const dns = require('dns');
const http = require('http');
const https = require('https');
const netmod = require('net');

const MAX_HOPS = 5;
const MAX_BODY = 2 * 1024 * 1024;

// A redirect must stay on the host the caller asked for (and the user confirmed). A cross-host redirect is not
// followed: the 3xx answer is returned with its Location so the caller can decide. Without this, an allowed host
// could bounce the request to loopback, an internal address or the cloud metadata service.
async function resolvePinned(host, local) {
  let addrs;
  try { addrs = await dns.promises.lookup(host, { all: true }); } catch (e) { throw new Error('could not resolve ' + host); }
  if (!addrs.length) throw new Error('could not resolve ' + host);
  if (!local) for (const a of addrs) if (isPrivateHost(a.address)) throw new Error(host + ' resolves to a private or link-local address');
  return addrs[0];
}

function requestPinned(u, init, pin, signal) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const hostname = String(u.hostname || '').replace(/^\[|\]$/g, '');
    const headers = Object.assign({}, init.headers || {});
    if (init.body != null && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-length')) headers['content-length'] = Buffer.byteLength(init.body);
    const req = mod.request({
      protocol: u.protocol, hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: init.method, headers, signal,
      servername: netmod.isIP(hostname) ? undefined : hostname,
      lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: pin.address, family: pin.family }]) : cb(null, pin.address, pin.family))
    }, (res) => {
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n <= MAX_BODY) chunks.push(c); else res.destroy(); });
      const done = () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') });
      res.on('end', done);
      res.on('close', done);
      res.on('error', reject);
    });
    req.on('error', reject);
    if (init.body != null) req.write(init.body);
    req.end();
  });
}

async function fetchUrl(opts) {
  opts = opts || {};
  const raw = String(opts.url || '');
  let u;
  try { u = new URL(raw); } catch (e) { throw new Error('bad url'); }
  const host = String(u.hostname || '').toLowerCase();
  const local = host === '127.0.0.1' || host === 'localhost';
  if (u.protocol === 'http:') {
    if (!local) throw new Error('http only allowed on localhost');
  } else if (u.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
  const init = { method: String(opts.method || 'GET').toUpperCase(), headers: Object.assign({}, opts.headers || {}) };
  if (opts.body != null && init.method !== 'GET' && init.method !== 'HEAD') {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(opts.timeoutMs || 20000));
  try {
    const startHost = host;
    let cur = u, r = null;
    for (let hop = 0; ; hop++) {
      const curHost = String(cur.hostname || '').toLowerCase();
      const pin = await resolvePinned(curHost.replace(/^\[|\]$/g, ''), curHost === '127.0.0.1' || curHost === 'localhost');
      r = await requestPinned(cur, init, pin, ctrl.signal);
      const loc = r.headers && r.headers.location;
      if (!(r.status >= 300 && r.status < 400 && loc)) break;
      let next;
      try { next = new URL(loc, cur); } catch (_) { break; }
      const nh = String(next.hostname || '').toLowerCase();
      const okScheme = next.protocol === 'https:' || (next.protocol === 'http:' && (nh === '127.0.0.1' || nh === 'localhost'));
      if (nh !== startHost || !okScheme || hop >= MAX_HOPS) {
        return { status: r.status, ok: false, text: '', json: null, redirectBlocked: true, location: next.toString() };
      }
      cur = next;
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && init.method === 'POST')) { init.method = 'GET'; delete init.body; }
    }
    const text = r.text;
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      text: text.length > 500000 ? text.slice(0, 500000) : text,
      json: json
    };
  } finally {
    clearTimeout(t);
  }
}

// Private, loopback-alias, link-local (cloud metadata) and unspecified addresses: never a legitimate target
// for a renderer-initiated request to a remote service.
function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost.localdomain' || /\.(local|internal|lan|home|corp)$/.test(h) || h === 'metadata.google.internal') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.indexOf(':') >= 0) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || /^::ffff:/.test(h);
  return /^\d+$/.test(h) || /^0x[0-9a-f]+$/.test(h);   // decimal / hex integer IPs
}

module.exports = { fetchUrl, isPrivateHost };
