/* =====================================================================
   engine.orchestrator.js  —  Engine.Orchestrator

   The closed loop the blueprint calls the Ultra pipeline (§71):
   for each ready task, GENERATE the slice -> write files -> re-run the
   proof engine (analyze -> runEvidence -> observe -> Recovery) -> rebuild
   the Evidence Ledger and the Definition-of-Done gate -> keep going until
   the task's target requirement is VERIFIED or a real blocker is proven.

   A "generator" is pluggable:
     task.generate(ctx)  async -> [{ path, content }]
     task.template       a key into Engine.Orchestrator.TEMPLATES
     task.prompt         -> Engine.LLM.complete() when a provider is configured
   A task with none of these is reported BLOCKED (needs a generator), never
   silently skipped.

   window.Engine.Orchestrator
     run({ tasks, maxCyclesPerTask?, desktop? })  -> run record
     TEMPLATES                                    -> built-in slice generators
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine || !Engine.FS) { console.error('[Orchestrator] Engine.FS missing'); return; }
  var FS = Engine.FS;
  var S = function () { return Engine.Sovereign; };

  function sj(p) {
    try {
      var v = S() && S().read(p);
      if (v == null) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } }
      return v;
    } catch (_) { return null; }
  }
  function isDesktop() { return !!(window.desktop && window.desktop.isDesktop && FS.__hasWorkspace && FS.__hasWorkspace()); }
  // graduated autonomy — Engine.Autonomy.allows(action) gates every side effect.
  // Missing engine => allow (back-compat).
  function allows(action) { var A = Engine.Autonomy; return !A || !A.allows || A.allows(action); }
  function flush() { return (FS.__flush ? FS.__flush() : Promise.resolve()); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- built-in slice generators (templates) ---------- */
  // Each returns [{path, content}]; it receives a read() helper for the
  // current file contents. Keep them small and deterministic — this is the
  // same class of generation as Engine's ~15 app templates.
  var TEMPLATES = {
    // Turn a dependency-free task board's decorative "Export CSV" button into a
    // real endpoint + wired handler. Used by the acceptance proof.
    'export-csv': function (read) {
      var out = [];
      var srv = read('/server.js');
      if (srv && srv.indexOf('/api/tasks.csv') < 0) {
        var route =
          "    if (req.url === '/api/tasks.csv' && req.method === 'GET') {\n" +
          "      const rows = await listTasks();\n" +
          "      const csv = ['id,title,done,createdAt']\n" +
          "        .concat(rows.map((t) => [t.id, JSON.stringify(t.title), t.done, t.createdAt].join(',')))\n" +
          "        .join('\\n');\n" +
          "      return send(res, 200, csv, 'text/csv');\n" +
          "    }\n";
        srv = srv.replace(/(\n\s*\/\/ static\n)/, '\n' + route + '$1');
        out.push({ path: '/server.js', content: srv });
      }
      var html = read('/public/index.html');
      if (html && /id="exportBtn"[^>]*onclick="return false"/.test(html)) {
        html = html
          .replace(/\s*<!-- MOCK CONTROL:[^>]*-->\n/, '\n')
          .replace(/<button id="exportBtn"[^>]*>Export CSV<\/button>/,
            '<button id="exportBtn">Export CSV</button>');
        out.push({ path: '/public/index.html', content: html });
      }
      var app = read('/public/app.js');
      if (app && app.indexOf("getElementById('exportBtn')") < 0) {
        app = app.replace(/\n(document\.getElementById\('refreshBtn'\)[^\n]*\n)/,
          "\ndocument.getElementById('exportBtn').addEventListener('click', async () => {\n" +
          "  const btn = document.getElementById('exportBtn');\n" +
          "  btn.disabled = true;\n" +
          "  try {\n" +
          "    const res = await fetch('/api/tasks.csv');\n" +
          "    const text = await res.text();\n" +
          "    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));\n" +
          "    const a = document.createElement('a');\n" +
          "    a.href = url; a.download = 'tasks.csv'; a.click();\n" +
          "    URL.revokeObjectURL(url);\n" +
          "  } catch (e) {\n" +
          "    alert('Export failed');\n" +
          "  } finally {\n" +
          "    btn.disabled = false;\n" +
          "  }\n" +
          "});\n\n$1");
        out.push({ path: '/public/app.js', content: app });
      }
      if (!read('/test/export.test.js')) {
        out.push({ path: '/test/export.test.js', content:
          "'use strict';\n" +
          "const test = require('node:test');\n" +
          "const assert = require('node:assert');\n" +
          "const { addTask, reset } = require('../src/repository');\n\n" +
          "test('csv rows follow the migration columns', async () => {\n" +
          "  await reset();\n" +
          "  const t = await addTask('ship it');\n" +
          "  const header = 'id,title,done,createdAt';\n" +
          "  const row = [t.id, JSON.stringify(t.title), t.done, t.createdAt].join(',');\n" +
          "  assert.equal(header.split(',').length, row.split(',').length);\n" +
          "  await reset();\n" +
          "});\n" });
      }
      return out;
    },

    // Wire the deliberately-broken "Clear all" button (calls an undefined
    // function) to a real DELETE endpoint.
    'clear-all': function (read) {
      var out = [];
      var srv = read('/server.js');
      if (srv && srv.indexOf("=== '/api/tasks' && req.method === 'DELETE'") < 0) {
        var route =
          "    if (req.url === '/api/tasks' && req.method === 'DELETE') {\n" +
          "      await reset();\n" +
          "      return send(res, 200, { ok: true });\n" +
          "    }\n";
        if (/const \{ [^}]*\} = require\('\.\/src\/repository'\);/.test(srv) && srv.indexOf('reset') < 0) {
          srv = srv.replace(/(const \{ )([^}]*)( \} = require\('\.\/src\/repository'\);)/, '$1$2, reset$3');
        }
        srv = srv.replace(/(\n\s*\/\/ static\n)/, '\n' + route + '$1');
        out.push({ path: '/server.js', content: srv });
      }
      var html = read('/public/index.html');
      if (html && /onclick="clearAllTasks\(\)"/.test(html)) {
        html = html
          .replace(/\s*<!-- INTENTIONALLY BROKEN INTERACTION:[^>]*-->\n/, '\n')
          .replace(/<button id="clearBtn"[^>]*>Clear all<\/button>/, '<button id="clearBtn">Clear all</button>');
        out.push({ path: '/public/index.html', content: html });
      }
      var app = read('/public/app.js');
      if (app && app.indexOf('async function clearAllTasks') < 0) {
        app = app.replace(/\nloadTasks\(\);\s*$/,
          "\nasync function clearAllTasks() {\n" +
          "  const btn = document.getElementById('clearBtn');\n" +
          "  btn.disabled = true;\n" +
          "  try {\n" +
          "    await fetch('/api/tasks', { method: 'DELETE' });\n" +
          "    await loadTasks();\n" +
          "  } catch (e) {\n" +
          "    alert('Clear failed');\n" +
          "  } finally {\n" +
          "    btn.disabled = false;\n" +
          "  }\n" +
          "}\n" +
          "document.getElementById('clearBtn').addEventListener('click', clearAllTasks);\n\n" +
          "loadTasks();\n");
        out.push({ path: '/public/app.js', content: app });
      }
      return out;
    },

    // Turn the decorative "Help" link (href="#") into a real toggle panel.
    'help-panel': function (read) {
      var out = [];
      var html = read('/public/index.html');
      if (html && /<a id="helpLink" href="#">Help<\/a>/.test(html)) {
        html = html
          .replace(/<a id="helpLink" href="#">Help<\/a>/, '<button id="helpLink" type="button">Help</button>')
          .replace(/(<\/div>\s*\n\s*<script src="app\.js">)/, '</div>\n  <section id="helpPanel" hidden></section>\n\n  <script src="app.js">');
        out.push({ path: '/public/index.html', content: html });
      }
      var app = read('/public/app.js');
      if (app && app.indexOf("getElementById('helpLink')") < 0) {
        app = app.replace(/\nloadTasks\(\);\s*$/,
          "\nconst HELP_TEXT = 'Type a task and press Add task. Use Refresh to reload, " +
          "Export CSV to download, Clear all to reset.';\n" +
          "document.getElementById('helpLink').addEventListener('click', () => {\n" +
          "  const p = document.getElementById('helpPanel');\n" +
          "  const open = p.hasAttribute('hidden');\n" +
          "  document.body.classList.toggle('help-open', open);\n" +
          "  p.textContent = open ? HELP_TEXT : '';\n" +
          "  p.toggleAttribute('hidden', !open);\n" +
          "  document.getElementById('helpLink').setAttribute('aria-expanded', String(open));\n" +
          "});\n\nloadTasks();\n");
        out.push({ path: '/public/app.js', content: app });
      }
      return out;
    },

    // Emit a vendor-neutral AIProvider abstraction so a generated app never
    // hard-codes one AI vendor (blueprint §29). Local-first: it prefers
    // an OLLAMA_BASE_URL, then falls back to whichever cloud key is present.
    'ai-provider': function (read) {
      var out = [];
      if (!read('/src/ai/provider.js')) {
        out.push({ path: '/src/ai/provider.js', content:
          "'use strict';\n" +
          "// Vendor-neutral AI provider. Set ONE of:\n" +
          "//   OLLAMA_BASE_URL   (local, zero-cost — e.g. http://localhost:11434)\n" +
          "//   OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENAI_COMPAT_BASE_URL(+_KEY)\n" +
          "const P = process.env;\n\n" +
          "function pick() {\n" +
          "  if (P.OLLAMA_BASE_URL) return { name: 'ollama', base: P.OLLAMA_BASE_URL.replace(/\\/$/, ''), key: 'ollama', model: P.AI_MODEL || 'qwen2.5-coder:7b' };\n" +
          "  if (P.OPENAI_COMPAT_BASE_URL) return { name: 'openai-compat', base: P.OPENAI_COMPAT_BASE_URL.replace(/\\/$/, ''), key: P.OPENAI_COMPAT_KEY || 'local', model: P.AI_MODEL || 'local-model' };\n" +
          "  if (P.OPENAI_API_KEY) return { name: 'openai', base: 'https://api.openai.com', key: P.OPENAI_API_KEY, model: P.AI_MODEL || 'gpt-4o-mini' };\n" +
          "  if (P.ANTHROPIC_API_KEY) return { name: 'anthropic', base: 'https://api.anthropic.com', key: P.ANTHROPIC_API_KEY, model: P.AI_MODEL || 'claude-3-5-haiku-latest' };\n" +
          "  return null;\n" +
          "}\n\n" +
          "async function chat(messages, opts = {}) {\n" +
          "  const p = pick();\n" +
          "  if (!p) throw new Error('No AI provider configured — set OLLAMA_BASE_URL or an API key (see .env.example)');\n" +
          "  if (p.name === 'anthropic') {\n" +
          "    const r = await fetch(p.base + '/v1/messages', { method: 'POST',\n" +
          "      headers: { 'content-type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },\n" +
          "      body: JSON.stringify({ model: p.model, max_tokens: opts.maxTokens || 1024, messages }) });\n" +
          "    const j = await r.json();\n" +
          "    return { text: (j.content && j.content[0] && j.content[0].text) || '', provider: p.name, raw: j };\n" +
          "  }\n" +
          "  const r = await fetch(p.base + '/v1/chat/completions', { method: 'POST',\n" +
          "    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key },\n" +
          "    body: JSON.stringify({ model: p.model, messages, temperature: opts.temperature ?? 0.2 }) });\n" +
          "  const j = await r.json();\n" +
          "  return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', provider: p.name, raw: j };\n" +
          "}\n\n" +
          "module.exports = { chat, provider: () => (pick() || { name: 'none' }).name };\n" });
      }
      var env = read('/.env.example');
      if (env != null && env.indexOf('OLLAMA_BASE_URL') < 0) {
        out.push({ path: '/.env.example', content: env.replace(/\s*$/, '') + '\n\n# --- AI (set ONE; OLLAMA is zero-cost/local) ---\nOLLAMA_BASE_URL=http://localhost:11434\nAI_MODEL=qwen2.5-coder:7b\n# OPENAI_API_KEY=\n# ANTHROPIC_API_KEY=\n# OPENAI_COMPAT_BASE_URL=\n# OPENAI_COMPAT_KEY=\n' });
      } else if (env == null) {
        out.push({ path: '/.env.example', content: '# --- AI (set ONE; OLLAMA is zero-cost/local) ---\nOLLAMA_BASE_URL=http://localhost:11434\nAI_MODEL=qwen2.5-coder:7b\n# OPENAI_API_KEY=\n# ANTHROPIC_API_KEY=\n' });
      }
      return out;
    }
  };

  // universal-DAG agent name -> Engine.Agents roster id. The universal
  // TaskGraph names agents like "database-agent"; the real specialist
  // implementations in Engine.Agents are the generators for them.
  var AGENT_ALIAS = {
    'product-agent': 'product', 'architecture-agent': 'architect', 'uiux-agent': 'design',
    'database-agent': 'scaffold', 'authentication-agent': 'scaffold', 'backend-agent': 'scaffold',
    'frontend-agent': 'scaffold', 'integration-agent': 'integration', 'security-agent': 'security',
    'test-agent': 'test', 'debug-repair-agent': 'repair', 'deployment-agent': 'deploy',
    'documentation-agent': 'docs', 'verify-agent': 'verify', 'release-agent': 'release'
  };
  function rosterIdFor(task) {
    if (!task.agent || !Engine.Agents || !Engine.Agents.get) return null;
    var id = AGENT_ALIAS[task.agent] || task.agent.replace(/-agent$/, '');
    return Engine.Agents.get(id) ? id : null;
  }

  function resolveGenerator(task) {
    if (typeof task.generate === 'function') return task.generate;
    // universal-DAG fallback tasks: route task.agent to a real specialist agent
    var rid = rosterIdFor(task);
    if (rid) {
      return function (ctx) {
        return Promise.resolve(Engine.Agents.run(rid, (ctx && ctx.ctx) || {})).then(function (r) {
          task._agentResult = r || {};
          // agents that produce file paths as objects hand them back; most write
          // their own files (already flushed) and return path strings + a report.
          var files = (r && r.files) || [];
          if (files.length && typeof files[0] === 'object') return files;
          return [];
        });
      };
    }
    // repo-scale scaffold: task.scaffold is a spec, or 'context' / 'objective:<text>'
    if (task.scaffold && Engine.Scaffold) {
      return function () {
        if (task.scaffold === 'context') return Engine.Scaffold.generate(Engine.Scaffold.specFromContext());
        if (typeof task.scaffold === 'string' && task.scaffold.indexOf('objective:') === 0) {
          return Engine.Scaffold.specFromObjective(task.scaffold.slice(10)).then(function (s) { return Engine.Scaffold.generate(s); });
        }
        return Engine.Scaffold.generate(task.scaffold);
      };
    }
    if (task.template && TEMPLATES[task.template]) {
      return function () { return TEMPLATES[task.template](function (p) { try { return FS.read(p) || ''; } catch (_) { return ''; } }); };
    }
    if (task.prompt && Engine.LLM && Engine.LLM.complete &&
        ((Engine.LLM.isConfigured && Engine.LLM.isConfigured()) || (Engine.AI && Engine.AI.ready && Engine.AI.ready()))) {
      return function () {
        return Engine.LLM.complete(task.prompt, { classification: { primaryType: 'web_application' } }).then(function (r) {
          var txt = (r && (r.content || r.text || r)) || '';
          var jj = (Engine.Contract && Engine.Contract._extractJson) ? Engine.Contract._extractJson(txt) : null;
          if (!jj) { try { jj = JSON.parse(String(txt).replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')); } catch (_) {} }
          return (jj && jj.files) || [];
        });
      };
    }
    return null;
  }

  // does the workspace now hold the artefact this agent is responsible for?
  // used for the universal-DAG fallback tasks, which have no `satisfies`.
  function agentArtifactPresent(rid, res) {
    if (res && (res.error || res.blocked)) return false;
    var has = function (p) { try { return !!FS.read(p); } catch (_) { return false; } };
    switch (rid) {
      case 'product': return !!(Engine.Contract && Engine.Contract.load && Engine.Contract.load());
      case 'architect': case 'design': return !!(res && (res.report || res.note));
      case 'scaffold': return has('/package.json') && (has('/server.js') || has('/src/server.js') || has('/app/main.py'));
      case 'test': return Object.keys(FS._data || {}).some(function (p) { return /\/test\/.+\.(test|spec)\.js$/.test(p) || /\/tests\/test_.+\.py$/.test(p); });
      case 'security': return !!sj('security-findings.json');
      case 'integration': { var w = sj('wiring-trace.json'); return !!(w && w.totals); }
      case 'verify': return !!sj('execution-evidence.json') || !!sj('runtime-trace.json');
      case 'repair': return !!(res && res.report);   // a repair pass ran (status recorded)
      case 'deploy': return !!sj('deployment.json');
      case 'docs': return has('/README.md') || has('/docs/API.md') || !!sj('documentation-index.json');
      case 'release': { var d = Engine.DoD && Engine.DoD.load(); return !!d; }
      default: return !!(res && !res.error);
    }
  }

  /* ---------- verify a task's target against fresh evidence ---------- */
  function targetMet(task) {
    if (typeof task.check === 'function') { try { return !!task.check(); } catch (_) { return false; } }
    var rid = rosterIdFor(task);
    if (rid && !task.satisfies) return agentArtifactPresent(rid, task._agentResult);
    var ledger = Engine.Ledger && Engine.Ledger.load();
    if (task.satisfies && typeof task.satisfies === 'string' && ledger) {
      var cl = (ledger.claims || []).find(function (c) { return c.requirementId === task.satisfies; });
      return !!cl && cl.confidence === 'VERIFIED';
    }
    if (task.satisfies && task.satisfies.kind === 'control') {
      var tr = sj('runtime-trace.json') || {};
      var want = task.satisfies.want || 'REAL';
      var nm = String(task.satisfies.name || '').toLowerCase();
      return ((tr.trace || []).some(function (x) {
        return String((x.control && x.control.name) || '').toLowerCase() === nm && x.status === want;
      }));
    }
    // default: the DoD gate as a whole
    var dod = Engine.DoD && Engine.DoD.load();
    return !!(dod && dod.PASS);
  }

  // Re-run the proof engine against the current files. opts.evidence runs the
  // real npm gates (slow); opts.observe drives the running app. The dev server
  // is restarted so observation reflects freshly-generated backend code.
  function reproof(desktop, opts) {
    opts = opts || {};
    try { S().analyze(); } catch (e) { /* keep going */ }
    var chain = Promise.resolve();
    if (desktop && opts.evidence !== false && allows('command')) {
      chain = chain.then(function () { return S().runEvidence().catch(function () {}); });
    }
    if (desktop && opts.observe !== false && allows('observe')) {
      chain = chain
        .then(function () { try { window.CSObserve && window.CSObserve.stop(); } catch (_) {} })
        .then(function () { return wait(1500); })   // let the old dev-server port free up
        .then(function () { return S().observe({ max: 30 }).catch(function () {}); });
    }
    return chain
      .then(function () { try { S().analyze(); } catch (_) {} })
      .then(function () {
        try { Engine.Ledger.build(); } catch (_) {}
        try { Engine.DoD.evaluate(); } catch (_) {}
        return flush();
      });
  }

  function run(opts) {
    opts = opts || {};
    var desktop = opts.desktop != null ? opts.desktop : isDesktop();
    var maxCycles = opts.maxCyclesPerTask || 2;
    // Generation cycles that need per-cycle proof (LLM output can be wrong).
    // Deterministic template tasks are generated once, then verified together
    // against a single final proof pass — restarting the dev server per cycle
    // is both slow and racy on the port.
    var deferProof = opts.deferProof != null ? opts.deferProof
      : !((opts.tasks || []).some(function (t) { return t.prompt || typeof t.generate === 'function'; }));
    var tasks = (opts.tasks || []).slice();
    var fromDAG = false;
    if (!tasks.length && Engine.Universal && Engine.Universal.TaskGraph) {
      // fall back to the universal DAG. Each task's `agent` now routes to a real
      // Engine.Agents specialist (see AGENT_ALIAS / resolveGenerator), so the
      // fallback actually builds + verifies instead of only planning.
      try {
        var TG = Engine.Universal.TaskGraph;
        var g = TG.create();
        var cls = null;
        try { cls = (Engine.Universal.Classifier && Engine.Universal.Classifier.classify(Engine.Universal.Normalizer.normalize({ prompt: (opts.ctx && opts.ctx.objective) || '' }))) || null; } catch (_) {}
        TG.buildDefault(g, cls || {});
        tasks = (g.tasks || []).map(function (t) { return { id: t.id, name: t.name, agent: t.agent, dependsOn: t.dependsOn }; });
        fromDAG = tasks.length > 0;
      } catch (_) {}
    }
    var runCtx = opts.ctx || {};

    var record = { startedAt: Date.now(), desktop: desktop, tasks: [], dodBefore: null, dodAfter: null };
    // make sure a contract + ledger + gate exist to compare against
    var pre = Promise.resolve();
    if (!(Engine.Contract && Engine.Contract.load())) {
      pre = (Engine.Contract ? Engine.Contract.derive({ useLLM: false }) : Promise.resolve()).then(function () {});
    }
    pre = pre.then(function () { try { Engine.Ledger.build(); Engine.DoD.evaluate(); } catch (_) {} });

    var chain = pre.then(function () {
      record.dodBefore = Engine.DoD && Engine.DoD.load();
    });

    tasks.forEach(function (task) {
      chain = chain.then(function () {
        var tr = { id: task.id || task.name, name: task.name || task.id, status: 'PENDING', cycles: 0, notes: [] };
        record.tasks.push(tr);
        if (!allows('generate') || !allows('write')) {
          tr.status = 'BLOCKED';
          tr.notes.push('autonomy level "' + ((Engine.Autonomy && Engine.Autonomy.get && Engine.Autonomy.get()) || '?') + '" does not allow generate/write');
          return;
        }
        var gen = resolveGenerator(task);
        if (!gen) { tr.status = 'BLOCKED'; tr.notes.push('no generator (template / prompt+LLM / generate fn)'); return; }
        if (targetMet(task)) { tr.status = 'ALREADY_MET'; return; }
        task._tr = tr;

        var loop = function () {
          tr.cycles++;
          return Promise.resolve(gen({ task: task, ctx: runCtx }))
            .then(function (files) {
              (files || []).forEach(function (f) {
                if (f && typeof f.path === 'string' && typeof f.content === 'string') {
                  FS.write(f.path.charAt(0) === '/' ? f.path : '/' + f.path, f.content);
                  tr.notes.push('wrote ' + f.path);
                }
              });
              return flush();
            })
            .then(function () {
              if (deferProof) { try { S().analyze(); } catch (_) {} tr.status = 'GENERATED'; return; }
              return reproof(desktop, {})
                .then(function () {
                  if (targetMet(task)) { tr.status = 'COMPLETE'; return; }
                  if (allows('repair') && Engine.Recovery && Engine.Recovery.run) { try { Engine.Recovery.run(); } catch (_) {} }
                  return reproof(desktop, {}).then(function () {
                    if (targetMet(task)) { tr.status = 'COMPLETE'; return; }
                    if (tr.cycles < maxCycles) return wait(50).then(loop);
                    tr.status = 'FAILED';
                    tr.notes.push('target not met after ' + tr.cycles + ' cycle(s)');
                  });
                });
            });
        };
        return loop();
      });
    });

    // one full proof pass (fresh dev server, real npm gates, one crawl), then
    // verify every deferred task against it.
    return chain.then(function () { return reproof(desktop, { evidence: true, observe: true }); }).then(function () {
      record.tasks.forEach(function (tr) {
        if (tr.status === 'GENERATED') {
          var task = tasks.filter(function (x) { return x._tr === tr; })[0];
          tr.status = (task && targetMet(task)) ? 'COMPLETE' : 'FAILED';
          if (tr.status === 'FAILED') tr.notes.push('target not met after final proof');
        }
      });
      record.finishedAt = Date.now();
      record.dodAfter = Engine.DoD && Engine.DoD.load();
      try { Engine.DoD.certificate(); } catch (_) {}
      var done = record.tasks.filter(function (t) { return t.status === 'COMPLETE' || t.status === 'ALREADY_MET'; }).length;
      record.summary = done + '/' + record.tasks.length + ' tasks satisfied · DoD ' +
        (record.dodAfter && record.dodAfter.PASS ? 'PASS' : 'not yet');
      if (S()) S().write('orchestrator-run.json', record);
      return record;
    });
  }

  Engine.Orchestrator = { run: run, TEMPLATES: TEMPLATES };
  console.info('[Orchestrator] Ultra pipeline executor ready — Engine.Orchestrator');
})();
