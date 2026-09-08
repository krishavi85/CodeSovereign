'use strict';
/*
 * aihost.js — talk to LOCAL model runtimes, and proxy LLM calls the renderer
 * CSP would otherwise block.
 *
 * `discover()` probes the well-known local endpoints (Ollama, LM Studio, vLLM,
 * llama.cpp server, Jan, text-generation-webui) and lists their models.
 *
 * `request()` is a deliberately narrow HTTP client:
 *   - only http(s) to a loopback host (any port), OR
 *   - https to one of the LLM API hosts the app already allow-lists in its CSP
 *   - 45s timeout, 8 MB response cap, no redirects to other hosts, no file://
 * The renderer never gets a general fetch — this is the whole surface.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const API_HOSTS = new Set([
  'api.openai.com', 'api.anthropic.com', 'api.minimaxi.chat', 'api.minimax.chat',
  'openrouter.ai', 'api.together.xyz', 'api.groq.com', 'api.mistral.ai', 'api.deepseek.com',
  'generativelanguage.googleapis.com'
]);
const MAX_BYTES = 8 * 1024 * 1024;

function allowed(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol === 'http:') return LOOPBACK.has(url.hostname);
  if (url.protocol === 'https:') return LOOPBACK.has(url.hostname) || API_HOSTS.has(url.hostname);
  return false;
}

function request(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    if (!allowed(o.url)) { resolve({ ok: false, error: 'host not allowed: ' + o.url }); return; }
    let url;
    try { url = new URL(o.url); } catch { resolve({ ok: false, error: 'bad url' }); return; }
    const lib = url.protocol === 'https:' ? https : http;
    const body = o.body == null ? null : (typeof o.body === 'string' ? o.body : JSON.stringify(o.body));
    const headers = Object.assign({ 'content-type': 'application/json' }, o.headers || {});
    if (body) headers['content-length'] = Buffer.byteLength(body);

    const req = lib.request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method: (o.method || 'GET').toUpperCase(), headers,
      timeout: o.timeoutMs || 45000
    }, (res) => {
      // never follow a redirect off the vetted host
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (!allowed(new URL(res.headers.location, o.url).href)) {
          res.destroy(); resolve({ ok: false, status: res.statusCode, error: 'blocked cross-host redirect' }); return;
        }
      }
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n <= MAX_BYTES) chunks.push(c); if (n > MAX_BYTES) { res.destroy(); } });
      res.on('end', () => resolve({
        ok: true, status: res.statusCode,
        headers: { 'content-type': res.headers['content-type'] || '' },
        body: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES),
        truncated: n > MAX_BYTES
      }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: String(e && e.code || e && e.message || e) }));
    if (body) req.write(body);
    req.end();
  });
}

async function getJSON(url, timeoutMs) {
  const r = await request({ url, method: 'GET', timeoutMs: timeoutMs || 2500 });
  if (!r.ok || r.status >= 400) return null;
  try { return JSON.parse(r.body); } catch { return null; }
}

/* ---- local runtime probes ---- */
const RUNTIMES = [
  {
    id: 'ollama', label: 'Ollama', base: 'http://127.0.0.1:11434',
    async models() {
      const j = await getJSON('http://127.0.0.1:11434/api/tags');
      return j && Array.isArray(j.models) ? j.models.map((m) => ({
        id: m.name, sizeBytes: m.size || null,
        params: (m.details && m.details.parameter_size) || null,
        quant: (m.details && m.details.quantization_level) || null
      })) : null;
    },
    openaiBase: 'http://127.0.0.1:11434'
  },
  {
    id: 'lmstudio', label: 'LM Studio', base: 'http://127.0.0.1:1234',
    async models() {
      const j = await getJSON('http://127.0.0.1:1234/v1/models');
      return j && Array.isArray(j.data) ? j.data.map((m) => ({ id: m.id })) : null;
    },
    openaiBase: 'http://127.0.0.1:1234'
  },
  {
    id: 'vllm', label: 'vLLM', base: 'http://127.0.0.1:8000',
    async models() {
      const j = await getJSON('http://127.0.0.1:8000/v1/models');
      return j && Array.isArray(j.data) ? j.data.map((m) => ({ id: m.id })) : null;
    },
    openaiBase: 'http://127.0.0.1:8000'
  },
  {
    id: 'llamacpp', label: 'llama.cpp server', base: 'http://127.0.0.1:8080',
    async models() {
      const j = await getJSON('http://127.0.0.1:8080/v1/models') || await getJSON('http://127.0.0.1:8080/props');
      if (!j) return null;
      if (Array.isArray(j.data)) return j.data.map((m) => ({ id: m.id }));
      if (j.default_generation_settings && j.default_generation_settings.model) return [{ id: String(j.default_generation_settings.model).split(/[\\/]/).pop() }];
      return [{ id: 'loaded-model' }];
    },
    openaiBase: 'http://127.0.0.1:8080'
  },
  {
    id: 'jan', label: 'Jan', base: 'http://127.0.0.1:1337',
    async models() {
      const j = await getJSON('http://127.0.0.1:1337/v1/models');
      return j && Array.isArray(j.data) ? j.data.map((m) => ({ id: m.id })) : null;
    },
    openaiBase: 'http://127.0.0.1:1337'
  }
];

async function discover() {
  const found = [];
  await Promise.all(RUNTIMES.map(async (rt) => {
    try {
      const models = await rt.models();
      if (models) found.push({ id: rt.id, label: rt.label, base: rt.base, openaiBase: rt.openaiBase, models: models });
    } catch (_) { /* not running */ }
  }));
  return { at: Date.now(), runtimes: found, count: found.length };
}

module.exports = { discover, request, allowed, RUNTIMES };
