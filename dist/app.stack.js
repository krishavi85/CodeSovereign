/* =====================================================================
 * app.stack.js
 * Injects the Open-Source Building Stack into existing screens.
 * No new pages or nav items.
 * ===================================================================== */
(function () {
  'use strict';

  function Stack() { return window.BuildingStack || (window.Engine && Engine.BuildingStack) || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(msg, color) {
    if (window.toast) window.toast(msg, color || '#7c6ff5');
  }
  function rerender() { if (window.renderAll) window.renderAll(); }

  function wrap(name, fn) {
    let tries = 0;
    function tryWrap() {
      const orig = window[name];
      if (typeof orig !== 'function') {
        if (tries++ < 40) setTimeout(tryWrap, 40);
        return;
      }
      if (orig.__stackInjected) return;
      window[name] = function () {
        return fn(orig.apply(this, arguments));
      };
      window[name].__stackInjected = true;
    }
    tryWrap();
  }
  function wrapBind(name, extra) {
    let tries = 0;
    function tryWrap() {
      const orig = window[name];
      if (typeof orig !== 'function') {
        if (tries++ < 40) setTimeout(tryWrap, 40);
        return;
      }
      if (orig.__stackBound) return;
      window[name] = function () {
        orig.apply(this, arguments);
        extra();
      };
      window[name].__stackBound = true;
    }
    tryWrap();
  }

  function insertBeforeTools(html, card) {
    const tools = html.indexOf('Tools</h3>');
    if (tools < 0) return html + card;
    const cardStart = html.lastIndexOf('<div class="card"', tools);
    if (cardStart < 0) return html + card;
    return html.slice(0, cardStart) + card + html.slice(cardStart);
  }
  function appendInScreen(html, card) {
    const last = html.lastIndexOf('</div>');
    if (last < 0) return html + card;
    return html.slice(0, last) + card + html.slice(last);
  }

  function engineChip(e, compact) {
    const on = Stack() && Stack().isEnabled(e.id);
    return '<div style="padding:10px 12px;border:1px solid ' + (on ? 'var(--good)' : 'var(--line)') + ';border-radius:8px;background:' + (on ? 'rgba(52,211,153,.05)' : 'var(--bg-2)') + '">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      + '<span style="font-weight:600;font-size:12.5px">' + esc(e.name) + '</span>'
      + '<span style="font-size:10px;color:var(--muted)">' + esc(e.layer) + '</span>'
      + '<span style="margin-left:auto;font-size:10px;font-weight:600;color:' + (on ? '#34d399' : '#94a3b8') + '">' + (on ? 'ON' : 'OFF') + '</span>'
      + '</div>'
      + (compact ? '' : '<div style="font-size:11px;color:var(--muted);line-height:1.4;margin-bottom:6px">' + esc(e.role) + '</div>')
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      + '<button class="btn ghost" data-stack-action="toggle" data-stack-id="' + esc(e.id) + '" style="padding:2px 8px;font-size:10.5px">' + (on ? 'Disable' : 'Enable') + '</button>'
      + '<a href="' + esc(e.link) + '" target="_blank" rel="noopener" style="font-size:11px;color:#60a5fa">GitHub ↗</a>'
      + '</div></div>';
  }

  function settingsCard() {
    const S = Stack();
    if (!S) return '';
    const sum = S.summary();
    const r = S.Router.get();
    const engines = S.catalog();
    const layers = [];
    engines.forEach(function (e) { if (layers.indexOf(e.layer) < 0) layers.push(e.layer); });
    return '<div class="card" style="padding:20px;margin-bottom:18px" id="stackSettingsCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;gap:10px;flex-wrap:wrap">'
      + '<div><h3 class="cs-h3" style="margin-bottom:4px">Open-Source Building Stack</h3>'
      + '<div style="font-size:12px;color:var(--muted)">' + sum.enabled + '/' + sum.total + ' engines · interchangeable behind CodeSovereign orchestration</div></div>'
      + '<button class="btn ghost" data-stack-action="reset" style="padding:4px 10px;font-size:11px">Reset stack</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">'
      + '<div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2)">'
      + '<div class="cs-eyebrow">Model router</div>'
      + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      + [['cloud', 'Cloud LLM'], ['localai', 'LocalAI'], ['llamacpp', 'llama.cpp']].map(function (p) {
        const on = r.gateway === p[0];
        return '<button class="btn ' + (on ? 'primary' : 'ghost') + '" data-stack-action="router" data-stack-id="' + p[0] + '" style="padding:4px 10px;font-size:11px">' + p[1] + '</button>';
      }).join('')
      + '</div>'
      + '<div style="font-size:10.5px;color:var(--muted);margin-top:8px">LocalAI ' + esc(r.localaiUrl) + ' · llama.cpp ' + esc(r.llamaUrl) + '</div>'
      + '<button class="btn ghost" data-stack-action="probe" style="margin-top:8px;padding:4px 10px;font-size:11px">Probe local gateways</button>'
      + '<div id="stackProbeOut" style="font-size:10.5px;font-family:monospace;color:var(--muted);margin-top:6px">' + (r.lastProbe ? esc(JSON.stringify(r.lastProbe.results)) : '') + '</div>'
      + '</div>'
      + '<div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2)">'
      + '<div class="cs-eyebrow">Vector memory</div>'
      + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      + ['qdrant', 'weaviate', 'milvus'].map(function (id) {
        const on = S.Memory.engine() === id;
        return '<button class="btn ' + (on ? 'primary' : 'ghost') + '" data-stack-action="vector" data-stack-id="' + id + '" style="padding:4px 10px;font-size:11px">' + id + '</button>';
      }).join('')
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:8px">' + (sum.memory ? sum.memory.total : 0) + ' memories across 7 domains</div>'
      + '</div>'
      + '<div style="padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2)">'
      + '<div class="cs-eyebrow">Generated backend</div>'
      + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      + ['supabase', 'pocketbase', 'appwrite'].map(function (id) {
        const on = S.Backends.current() === id;
        return '<button class="btn ' + (on ? 'primary' : 'ghost') + '" data-stack-action="backend" data-stack-id="' + id + '" style="padding:4px 10px;font-size:11px">' + id + '</button>';
      }).join('')
      + '</div>'
      + '<button class="btn primary" data-stack-action="generate-backend" style="margin-top:8px;padding:4px 10px;font-size:11px">Generate into workspace</button>'
      + '</div></div>'
      + layers.map(function (layer) {
        const items = engines.filter(function (e) { return e.layer === layer; });
        return '<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">' + esc(layer) + ' · ' + items.length + '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + items.map(function (e) { return engineChip(e, false); }).join('') + '</div></div>';
      }).join('')
      + '</div>';
  }

  function agentCard() {
    const S = Stack();
    if (!S) return '';
    const cur = S.Execution.current();
    const prof = S.Execution.profile();
    return '<div class="card" style="padding:16px;margin:0 0 16px" id="stackAgentCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<div><div class="cs-eyebrow">Execution backend</div>'
      + '<div style="font-size:13px;color:var(--muted);margin-top:4px">Cline / Aider / OpenHands sit behind the Agent screen — CodeSovereign owns the loop.</div></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + [['native', 'Native'], ['cline', 'Cline'], ['aider', 'Aider'], ['openhands', 'OpenHands']].map(function (p) {
        return '<button class="btn ' + (cur === p[0] ? 'primary' : 'ghost') + '" data-stack-action="execution" data-stack-id="' + p[0] + '" style="padding:4px 10px;font-size:11px">' + p[1] + '</button>';
      }).join('')
      + '</div></div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:10px">Tools: ' + esc((prof.tools || []).join(' · ')) + (prof.sandbox ? ' · sandboxed' : '') + (prof.mcp ? ' · MCP' : '') + '</div>'
      + '</div>';
  }

  function factoryCard() {
    const S = Stack();
    if (!S) return '';
    const flows = S.PocketFlow.graph();
    const last = S.PocketFlow.last();
    const backend = S.Backends.current();
    return '<div class="card" style="padding:20px;margin-top:18px" id="stackFactoryCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h3 class="cs-h3">GodMode generation flows</h3>'
      + '<span style="font-size:12px;color:var(--muted)">PocketFlow graphs · ' + backend + ' backend</span></div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">'
      + flows.map(function (f) {
        return '<button class="btn ghost" data-stack-action="flow" data-stack-id="' + esc(f.name) + '" style="padding:4px 10px;font-size:11px">' + esc(f.name.replace('Flow', '')) + '</button>';
      }).join('')
      + '</div>'
      + (last ? '<div style="font-size:11px;color:#34d399;margin-bottom:12px">Last flow: ' + esc(last.flow) + ' · ' + last.elapsed + 'ms</div>' : '')
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + ['supabase', 'pocketbase', 'appwrite'].map(function (id) {
        return '<button class="btn ' + (backend === id ? 'primary' : 'ghost') + '" data-stack-action="backend" data-stack-id="' + id + '" style="padding:4px 10px;font-size:11px">' + id + '</button>';
      }).join('')
      + '<button class="btn primary" data-stack-action="generate-backend" style="padding:4px 10px;font-size:11px">Generate backend</button>'
      + '</div></div>';
  }

  function pipelinesCard() {
    const S = Stack();
    if (!S) return '';
    const run = S.Temporal.get();
    const stages = S.Temporal.stages;
    const pct = run && run.status !== 'idle' ? Math.round(((run.stage + (run.status === 'completed' ? 1 : 0)) / stages.length) * 100) : 0;
    return '<div class="card" style="padding:20px;margin-top:18px" id="stackPipelinesCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h3 class="cs-h3">Durable build pipeline</h3>'
      + '<span style="font-size:12px;color:var(--muted)">Temporal checkpoints · PocketFlow graphs</span></div>'
      + '<div style="height:8px;background:var(--bg-2);border-radius:6px;overflow:hidden;margin-bottom:12px"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div></div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Status <b style="color:#22d3ee">' + esc(run.status || 'idle') + '</b>'
      + (run.runId ? ' · ' + esc(run.runId) : '') + ' · stage ' + ((run.stage || 0) + 1) + '/' + stages.length
      + (run.status !== 'idle' ? ' · ' + esc(stages[run.stage] || '') : '') + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;max-height:120px;overflow:auto">'
      + stages.map(function (st, i) {
        const done = run.status === 'completed' || i < (run.stage || 0);
        const cur = run.status !== 'idle' && i === run.stage && run.status !== 'completed';
        return '<span style="padding:3px 8px;border-radius:6px;font-size:10.5px;border:1px solid ' + (cur ? 'var(--accent)' : 'var(--line)') + ';background:' + (done ? 'rgba(52,211,153,.12)' : (cur ? 'rgba(124,111,245,.14)' : 'var(--bg-2)')) + '">' + (i + 1) + ' ' + esc(st) + '</span>';
      }).join('')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn primary" data-stack-action="temporal-start" style="padding:4px 10px;font-size:11px">Start</button>'
      + '<button class="btn ghost" data-stack-action="temporal-checkpoint" style="padding:4px 10px;font-size:11px">Checkpoint / next</button>'
      + '<button class="btn ghost" data-stack-action="temporal-fail" style="padding:4px 10px;font-size:11px">Mark failed</button>'
      + '<button class="btn ghost" data-stack-action="temporal-retry" style="padding:4px 10px;font-size:11px">Retry</button>'
      + '<button class="btn ghost" data-stack-action="temporal-resume" style="padding:4px 10px;font-size:11px">Resume</button>'
      + '</div>'
      + '<div style="margin-top:14px;font-size:11px;color:var(--muted);margin-bottom:6px">PocketFlow</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
      + S.PocketFlow.flows.map(function (f) {
        return '<button class="btn ghost" data-stack-action="flow" data-stack-id="' + esc(f) + '" style="padding:4px 8px;font-size:10.5px">' + esc(f.replace('Flow', '')) + '</button>';
      }).join('')
      + '</div></div>';
  }

  function recoveryCards() {
    const S = Stack();
    if (!S) return '';
    const lastA = S.Aider.last();
    const mem = S.Memory.stats();
    const plan = S.Verify.testcontainersPlan();
    const runners = S.Verify.detectRunners();
    return '<div class="card" style="padding:20px;margin-top:18px" id="stackAiderCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h3 class="cs-h3">Aider recovery engine</h3>'
      + '<a href="https://github.com/Aider-AI/aider" target="_blank" rel="noopener" style="font-size:11px;color:#60a5fa">GitHub ↗</a></div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'
      + S.Aider.ops.map(function (op) {
        return '<button class="btn ghost" data-stack-action="aider" data-stack-id="' + esc(op) + '" style="padding:4px 10px;font-size:11px">' + esc(op) + '</button>';
      }).join('')
      + '</div>'
      + (lastA ? '<div style="font-size:11px;color:#34d399">Last: ' + esc(lastA.op) + ' — ' + esc(lastA.summary) + '</div>' : '<div style="font-size:11px;color:var(--muted)">Analyze the repo, map files, lint, test, repair, checkpoint.</div>')
      + '</div>'
      + '<div class="card" style="padding:20px;margin-top:18px" id="stackMemoryCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h3 class="cs-h3">Semantic memory</h3>'
      + '<span style="font-size:12px;color:var(--muted)">' + esc(mem.engine) + ' · ' + mem.total + ' records</span></div>'
      + '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:12px">'
      + Object.keys(mem.domains || {}).map(function (d) {
        return '<div style="padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2);text-align:center"><div style="font-size:10px;color:var(--muted)">' + esc(d) + '</div><div style="font-weight:700">' + (mem.domains[d] || 0) + '</div></div>';
      }).join('')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      + ['qdrant', 'weaviate', 'milvus'].map(function (id) {
        return '<button class="btn ' + (mem.engine === id ? 'primary' : 'ghost') + '" data-stack-action="vector" data-stack-id="' + id + '" style="padding:4px 10px;font-size:11px">' + id + '</button>';
      }).join('')
      + '<button class="btn primary" data-stack-action="memory-index" style="padding:4px 10px;font-size:11px">Index workspace</button>'
      + '<input data-stack-search placeholder="Search memory…" style="flex:1;min-width:160px;padding:6px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:6px;color:inherit;font-size:12px">'
      + '<button class="btn ghost" data-stack-action="memory-search" style="padding:4px 10px;font-size:11px">Search</button>'
      + '</div>'
      + '<div id="stackMemoryHits" style="margin-top:10px;font-size:11px;color:var(--muted)"></div>'
      + '</div>'
      + '<div class="card" style="padding:20px;margin-top:18px" id="stackVerifyCard">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<h3 class="cs-h3">Real verification</h3>'
      + '<span style="font-size:12px;color:var(--muted)">Playwright · Testcontainers · Vitest/Jest/Pytest</span></div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + esc(plan.loop) + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'
      + (plan.services || []).map(function (s) {
        return '<a href="' + esc(s.link) + '" target="_blank" rel="noopener" style="padding:4px 8px;border:1px solid var(--line);border-radius:6px;font-size:11px;background:var(--bg-2)">' + esc(s.name) + (s.port ? ':' + s.port : '') + '</a>';
      }).join('')
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Runners — vitest:' + (runners.vitest ? 'yes' : 'no') + ' · jest:' + (runners.jest ? 'yes' : 'no') + ' · pytest:' + (runners.pytest ? 'yes' : 'no') + ' · playwright:' + (runners.playwright ? 'yes' : 'no') + '</div>'
      + '<button class="btn primary" data-stack-action="verify" style="padding:4px 10px;font-size:11px">Run verification loop</button>'
      + '<div id="stackVerifyOut" style="margin-top:8px;font-size:11px;font-family:monospace;color:var(--muted)"></div>'
      + '</div>';
  }

  function marketplaceBannerHtml() {
    const S = Stack();
    if (!S) return '';
    const engines = S.catalog();
    return '<div class="card" style="padding:16px" id="stackMarketplaceBanner">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
      + '<div><div class="cs-h3">Open-source engines</div>'
      + '<div class="cs-muted" style="margin-top:4px">Install a stack engine into this workspace. All ' + engines.length + ' Building Stack repositories are listed below and under category <b>engine</b>.</div></div></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">'
      + engines.map(function (e) {
        return '<div style="padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2)">'
          + '<div style="font-weight:600;font-size:12.5px">' + esc(e.name) + '</div>'
          + '<div style="font-size:10.5px;color:var(--muted);margin:4px 0 8px;min-height:32px">' + esc(e.role) + '</div>'
          + '<div style="display:flex;gap:6px;align-items:center">'
          + '<button class="btn primary" data-stack-action="mp-install" data-stack-id="' + esc(e.id) + '" style="padding:3px 8px;font-size:10.5px">Install</button>'
          + '<a href="' + esc(e.link) + '" target="_blank" rel="noopener" style="font-size:11px;color:#60a5fa">GitHub ↗</a>'
          + '</div></div>';
      }).join('')
      + '</div></div>';
  }

  // ---- inject into existing screens ----
  wrap('renderSettings', function (html) {
    return insertBeforeTools(html, settingsCard());
  });

  wrap('renderAgent', function (html) {
    const marker = 'id="agentPromptInput"';
    const i = html.indexOf(marker);
    if (i < 0) return agentCard() + html;
    const box = html.lastIndexOf('<div style="border:1px solid rgba(109,93,252,.4)', i);
    if (box < 0) return agentCard() + html;
    return html.slice(0, box) + agentCard() + html.slice(box);
  });

  wrap('renderFactory', function (html) {
    return appendInScreen(html, factoryCard());
  });

  wrap('renderPipelines', function (html) {
    return appendInScreen(html, pipelinesCard());
  });

  wrap('renderRecovery', function (html) {
    const marker = '<!-- Plugin & MCP Hub -->';
    const i = html.indexOf(marker);
    if (i < 0) return html + recoveryCards();
    return html.slice(0, i) + recoveryCards() + html.slice(i);
  });

  window.renderStackMarketplaceBanner = marketplaceBannerHtml;

  function bindStack(root) {
    root = root || document.getElementById('main') || document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-stack-action]').forEach(function (el) {
      if (el.__stackBound) return;
      el.__stackBound = true;
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        handleAction(el.getAttribute('data-stack-action'), el.getAttribute('data-stack-id'), el);
      });
    });
  }

  async function handleAction(action, id, el) {
    const S = Stack();
    if (!S) { toast('Building stack not loaded', '#ef4444'); return; }
    try {
      if (action === 'toggle') {
        const next = !S.isEnabled(id);
        S.enable(id, next);
        toast((next ? 'Enabled ' : 'Disabled ') + id);
        rerender();
      } else if (action === 'reset') {
        S.reset();
        toast('Stack reset');
        rerender();
      } else if (action === 'router') {
        S.Router.setGateway(id);
        toast('Model router → ' + id);
        rerender();
      } else if (action === 'probe') {
        const out = document.getElementById('stackProbeOut');
        if (out) out.textContent = 'probing…';
        const r = await S.Router.probe();
        if (out) out.textContent = (r.results || []).map(function (x) { return x.id + ':' + (x.ok ? 'up' : (x.error || x.status)); }).join(' · ');
        toast('Probe complete');
      } else if (action === 'vector') {
        S.Memory.setEngine(id);
        toast('Vector engine → ' + id);
        rerender();
      } else if (action === 'backend') {
        S.Backends.set(id);
        toast('Backend → ' + id);
        rerender();
      } else if (action === 'generate-backend') {
        const r = S.Backends.generate();
        toast(r.ok ? ('Wrote ' + r.files.length + ' ' + r.id + ' files') : (r.reason || 'failed'), r.ok ? '#34d399' : '#ef4444');
        rerender();
      } else if (action === 'execution') {
        S.Execution.set(id);
        toast('Execution backend → ' + id);
        rerender();
      } else if (action === 'flow') {
        const r = S.PocketFlow.run(id);
        toast(r.ok ? ('Flow ' + id + ' · ' + r.elapsed + 'ms') : r.reason);
        rerender();
      } else if (action === 'temporal-start') {
        S.Temporal.start({ source: 'ui' });
        toast('Durable pipeline started');
        rerender();
      } else if (action === 'temporal-checkpoint') {
        const r = S.Temporal.checkpoint();
        toast(r.ok ? ('Checkpoint → ' + (r.run.status === 'completed' ? 'complete' : S.Temporal.stages[r.run.stage])) : r.reason);
        rerender();
      } else if (action === 'temporal-fail') {
        S.Temporal.fail('operator');
        toast('Pipeline marked failed', '#f59e0b');
        rerender();
      } else if (action === 'temporal-retry') {
        S.Temporal.retry();
        toast('Retry from checkpoint');
        rerender();
      } else if (action === 'temporal-resume') {
        const r = S.Temporal.resume();
        toast(r.ok ? ('Resumed at ' + (r.from || 'checkpoint')) : r.reason);
        rerender();
      } else if (action === 'aider') {
        const fn = S.Aider[id];
        const r = typeof fn === 'function' ? fn.call(S.Aider) : { ok: false };
        toast(id + (r && r.ok === false ? ' failed' : ' done'));
        rerender();
      } else if (action === 'memory-index') {
        const r = S.Memory.indexWorkspace();
        toast('Indexed ' + r.indexed + ' files into ' + r.engine);
        rerender();
      } else if (action === 'memory-search') {
        const inp = document.querySelector('[data-stack-search]');
        const q = inp ? inp.value : '';
        const hits = S.Memory.search(q);
        const host = document.getElementById('stackMemoryHits');
        if (host) {
          host.innerHTML = hits.length === 0
            ? 'No matches. Index the workspace first.'
            : hits.map(function (h) {
              return '<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>' + esc(h.domain) + '</b> · ' + (h.score * 100).toFixed(0) + '% · ' + esc((h.text || '').slice(0, 160)) + '</div>';
            }).join('');
        }
      } else if (action === 'verify') {
        const host = document.getElementById('stackVerifyOut');
        if (host) host.textContent = 'running…';
        const r = await S.Verify.run();
        if (host) host.textContent = (r.ok ? 'OK' : 'ISSUES') + ' · lint errors ' + (r.lint && r.lint.errors) + ' · services ' + ((r.containers && r.containers.services) || []).map(function (s) { return s.name; }).join(',');
        toast(r.ok ? 'Verification passed' : 'Verification reported issues', r.ok ? '#34d399' : '#f59e0b');
      } else if (action === 'mp-install') {
        const M = window.TemplateMarketplace;
        if (id === 'supabase' || id === 'pocketbase' || id === 'appwrite') {
          const r = S.Backends.generate(id);
          toast(r.ok ? ('Generated ' + id) : (r.reason || 'failed'), r.ok ? '#34d399' : '#ef4444');
        } else if (M && M.install) {
          const r = await M.install('stack-' + id);
          if (!r || !r.ok) {
            const e = S.byId(id);
            if (e) S.Backends && Engine && Engine.FS && Engine.FS.write('/.codesovereign/stack/' + id + '.md', '# ' + e.name + '\n\n' + e.role + '\n\n' + e.link + '\n');
            S.enable(id, true);
            toast('Installed ' + id + ' engine contract');
          } else {
            S.enable(id, true);
            toast('Installed ' + id);
          }
        } else {
          S.enable(id, true);
          toast('Enabled ' + id);
        }
        rerender();
      }
    } catch (err) {
      toast(String(err && err.message || err), '#ef4444');
    }
  }

  wrapBind('bindSettings', function () { bindStack(); });
  wrapBind('bindAgent', function () { bindStack(); });
  wrapBind('bindFactory', function () { bindStack(); });
  wrapBind('bindPipelines', function () { bindStack(); });
  wrapBind('bindRecovery', function () { bindStack(); });
  wrapBind('bindPhase8', function () {
    setTimeout(function () { bindStack(); }, 30);
  });

  window.bindBuildingStack = bindStack;
  window.stackAction = handleAction;
})();
