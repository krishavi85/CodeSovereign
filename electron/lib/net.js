'use strict';
/*
 * Renderer-initiated HTTPS (or localhost HTTP) fetch. Bypasses page CSP so
 * desktop can reach remote MCP / Google / Vercel / GitHub APIs.
 */
const dns = require('dns');

const MAX_HOPS = 5;

// A redirect must stay on the host the caller asked for (and the user confirmed). A cross-host redirect is not
// followed: the 3xx answer is returned with its Location so the caller can decide. Without this, an allowed host
// could bounce the request to loopback, an internal address or the cloud metadata service.
async function assertPublicResolution(host, local) {
  if (local) return;
  let addrs;
  try { addrs = await dns.promises.lookup(host, { all: true }); } catch (e) { throw new Error('could not resolve ' + host); }
  for (const a of addrs) if (isPrivateHost(a.address)) throw new Error(host + ' resolves to a private or link-local address');
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
  const headers = Object.assign({}, opts.headers || {});
  const init = { method: String(opts.method || 'GET').toUpperCase(), headers };
  if (opts.body != null && init.method !== 'GET' && init.method !== 'HEAD') {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(opts.timeoutMs || 20000));
  init.signal = ctrl.signal;
  try {
    init.redirect = 'manual';
    const startHost = host;
    let cur = u, r = null;
    for (let hop = 0; ; hop++) {
      const curHost = String(cur.hostname || '').toLowerCase();
      await assertPublicResolution(curHost, curHost === '127.0.0.1' || curHost === 'localhost');
      r = await fetch(cur.toString(), init);
      if (!(r.status >= 300 && r.status < 400 && r.headers.get('location'))) break;
      let next;
      try { next = new URL(r.headers.get('location'), cur); } catch (_) { break; }
      const nh = String(next.hostname || '').toLowerCase();
      const okScheme = next.protocol === 'https:' || (next.protocol === 'http:' && (nh === '127.0.0.1' || nh === 'localhost'));
      if (nh !== startHost || !okScheme || hop >= MAX_HOPS) {
        return { status: r.status, ok: false, text: '', json: null, redirectBlocked: true, location: next.toString() };
      }
      cur = next;
      if (r.status === 303 || ((r.status === 301 || r.status === 302) && init.method === 'POST')) { init.method = 'GET'; delete init.body; }
    }
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return {
      status: r.status,
      ok: r.ok,
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
