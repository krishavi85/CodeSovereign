/* =====================================================================
   engine.jobs.js  —  Engine.Jobs   (blueprint §14 — async infra)

   Generates dependency-free async infrastructure for a scaffolded app:
     - src/queue.js  : a durable job queue backed by the data layer
                       (enqueue / claim / complete / fail, exponential
                       backoff, max attempts, dead-letter).
     - src/worker.js : polls the queue and dispatches to src/jobs/<type>.js
                       (run with `npm run worker`).
     - src/jobs/*.js : one sample handler.
     - src/events.js : Server-Sent-Events hub (real-time, zero-dep).
   Plus the `job` entity, the routes, and a worker test.

   window.Engine.Jobs
     entity()            -> the `job` entity for Engine.Schema
     queueModule()       -> src/queue.js
     workerModule()      -> src/worker.js
     eventsModule()      -> src/events.js
     sampleJob()         -> src/jobs/welcome.js
     routes()            -> route descriptors
     workerTest()        -> test/worker.test.js
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function entity() {
    return { name: 'job', ownable: false, fields: [
      { name: 'type', type: 'text', required: true, max: 80 },
      { name: 'payload', type: 'json' },
      { name: 'status', type: 'text', required: true, max: 20, default: 'queued' },
      { name: 'attempts', type: 'int', default: 0 },
      { name: 'runAfter', type: 'timestamp', default: 'now' },
      { name: 'lastError', type: 'text', max: 500 }
    ], indexes: [{ fields: ['status', 'runAfter'] }] };
  }

  function queueModule() {
    return [
      "'use strict';",
      "// Durable job queue over the data layer. enqueue -> claim -> complete/fail",
      "// with exponential backoff and a dead-letter status.",
      "const db = require('./db');",
      "const MAX_ATTEMPTS = 5;",
      "",
      "async function enqueue(type, payload, delayMs) {",
      "  return db.create('job', {",
      "    type: String(type), payload: payload == null ? null : JSON.stringify(payload),",
      "    status: 'queued', attempts: 0,",
      "    runAfter: new Date(Date.now() + (delayMs || 0)).toISOString()",
      "  });",
      "}",
      "async function claim() {",
      "  const now = Date.now();",
      "  const { rows } = await db.list('job', { where: { status: 'queued' }, limit: 50 });",
      "  const due = rows.filter((j) => new Date(j.runAfter).getTime() <= now).sort((a, b) => a.id - b.id)[0];",
      "  if (!due) return null;",
      "  const claimed = await db.update('job', due.id, { status: 'running', attempts: due.attempts + 1 });",
      "  return claimed && claimed.status === 'running' ? claimed : null;",
      "}",
      "async function complete(id) { return db.update('job', id, { status: 'done', lastError: null }); }",
      "async function fail(id, err) {",
      "  const job = await db.get('job', id);",
      "  if (!job) return null;",
      "  if (job.attempts >= MAX_ATTEMPTS) return db.update('job', id, { status: 'dead', lastError: String(err).slice(0, 500) });",
      "  const backoff = Math.min(60000, 1000 * Math.pow(2, job.attempts));",
      "  return db.update('job', id, { status: 'queued', lastError: String(err).slice(0, 500), runAfter: new Date(Date.now() + backoff).toISOString() });",
      "}",
      "async function stats() {",
      "  const s = {};",
      "  for (const st of ['queued', 'running', 'done', 'dead']) s[st] = (await db.list('job', { where: { status: st }, limit: 1 })).total;",
      "  return s;",
      "}",
      "module.exports = { enqueue, claim, complete, fail, stats, MAX_ATTEMPTS };",
      ""
    ].join('\n');
  }

  function workerModule() {
    return [
      "'use strict';",
      "// Job worker — `npm run worker`. Polls the queue and dispatches to",
      "// src/jobs/<type>.js exporting `module.exports = async (payload) => {...}`.",
      "const fs = require('fs');",
      "const path = require('path');",
      "const queue = require('./queue');",
      "",
      "const JOBS = path.join(__dirname, 'jobs');",
      "const handlers = {};",
      "if (fs.existsSync(JOBS)) for (const f of fs.readdirSync(JOBS)) if (f.endsWith('.js')) handlers[f.replace(/\\.js$/, '')] = require(path.join(JOBS, f));",
      "",
      "async function tick() {",
      "  const job = await queue.claim();",
      "  if (!job) return false;",
      "  const h = handlers[job.type];",
      "  try {",
      "    if (!h) throw new Error('no handler for job type: ' + job.type);",
      "    await h(job.payload ? JSON.parse(job.payload) : null, job);",
      "    await queue.complete(job.id);",
      "  } catch (e) {",
      "    await queue.fail(job.id, e.message || e);",
      "  }",
      "  return true;",
      "}",
      "",
      "async function loop(intervalMs) {",
      "  for (;;) { const worked = await tick(); if (!worked) await new Promise((r) => setTimeout(r, intervalMs || 500)); }",
      "}",
      "",
      "if (require.main === module) {",
      "  require('./db').migrate().then(() => { console.log('worker up'); return loop(); });",
      "}",
      "module.exports = { tick, loop };",
      ""
    ].join('\n');
  }

  function eventsModule() {
    return [
      "'use strict';",
      "// Server-Sent Events hub — real-time push with zero dependencies.",
      "const clients = new Set();",
      "",
      "function subscribe(res) {",
      "  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });",
      "  res.write(': connected\\n\\n');",
      "  clients.add(res);",
      "  const ping = setInterval(() => { try { res.write(': ping\\n\\n'); } catch (_) {} }, 25000);",
      "  res.on('close', () => { clearInterval(ping); clients.delete(res); });",
      "}",
      "function publish(event, data) {",
      "  const frame = 'event: ' + event + '\\ndata: ' + JSON.stringify(data == null ? {} : data) + '\\n\\n';",
      "  for (const res of clients) { try { res.write(frame); } catch (_) { clients.delete(res); } }",
      "}",
      "module.exports = { subscribe, publish, count: () => clients.size };",
      ""
    ].join('\n');
  }

  function sampleJob() {
    return [
      "'use strict';",
      "// Sample job handler. Enqueue with: queue.enqueue('welcome', { email })",
      "const events = require('../events');",
      "module.exports = async (payload) => {",
      "  // ... send an email, call an API, crunch numbers ...",
      "  events.publish('job:welcome', { email: (payload && payload.email) || null, at: Date.now() });",
      "};",
      ""
    ].join('\n');
  }

  function routes() {
    return [
      { method: 'GET', path: '/api/events', kind: 'sse', handler: 'events.subscribe', public: true },
      { method: 'POST', path: '/api/jobs', kind: 'enqueue', handler: 'queue.enqueue', body: ['type', 'payload'], auth: true, returns: 202 },
      { method: 'GET', path: '/api/jobs/stats', kind: 'stats', handler: 'queue.stats', public: true }
    ];
  }

  function workerTest() {
    return [
      "'use strict';",
      "process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), 'test-worker-' + process.pid);",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const db = require('../src/db');",
      "const queue = require('../src/queue');",
      "const worker = require('../src/worker');",
      "",
      "test('queue: enqueue -> worker processes -> done', async () => {",
      "  await db.reset(); await db.migrate();",
      "  await queue.enqueue('welcome', { email: 'a@b.co' });",
      "  const worked = await worker.tick();",
      "  assert.equal(worked, true);",
      "  const s = await queue.stats();",
      "  assert.equal(s.done, 1);",
      "  await db.reset();",
      "});",
      "",
      "test('queue: failing job retries then dead-letters', async () => {",
      "  await db.reset(); await db.migrate();",
      "  const j = await db.create('job', { type: 'nope', status: 'queued', attempts: queue.MAX_ATTEMPTS });",
      "  await worker.tick();",
      "  const after = await db.get('job', j.id);",
      "  assert.equal(after.status, 'dead');",
      "  await db.reset();",
      "});",
      ""
    ].join('\n');
  }

  Engine.Jobs = { entity: entity, queueModule: queueModule, workerModule: workerModule, eventsModule: eventsModule, sampleJob: sampleJob, routes: routes, workerTest: workerTest };
  console.info('[Jobs] async infra (queue + worker + SSE) generator ready — Engine.Jobs');
})();
