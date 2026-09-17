'use strict';
/*
 * Renderer-initiated HTTPS (or localhost HTTP) fetch. Bypasses page CSP so
 * desktop can reach remote MCP / Google / Vercel / GitHub APIs.
 */
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
    const r = await fetch(u.toString(), init);
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

module.exports = { fetchUrl };
