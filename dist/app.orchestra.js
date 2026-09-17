/* =====================================================================
 * app.orchestra.js
 * Subagents, Coordinator, Model Router, Project brain, Browser Agent
 * injected into existing screens. No new pages or nav items.
 * ===================================================================== */
(function () {
  'use strict';

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
      if (orig.__orchInjected) return;
      window[name] = function () {
        return fn(orig.apply(this, arguments));
      };
      window[name].__orchInjected = true;
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
      if (orig.__orchBound) return;
      window[name] = function () {
        orig.apply(this, arguments);
        extra();
      };
      window[name].__orchBound = true;
    }
    tryWrap();
  }
  function appendInScreen(html, card) {
    const last = html.lastIndexOf('</div>');
    if (last < 0) return html + card;
    return html.slice(0, last) + card + html.slice(last);
  }
  function insertBeforeTools(html, card) {
    const tools = html.indexOf('Tools</h3>');
    if (tools < 0) return html + card;
    const cardStart = html.lastIndexOf('<div class="card"', tools);
    if (cardStart < 0) return html + card;
    return html.slice(0, cardStart) + card + html.slice(cardStart);
  }

  function settingsCard() {
    const R = window.Engine && Engine.ModelRouter;
    if (!R) return '';
    const policy = R.policy();
    const last = R.last();
    return '<div class="card" style="padding:20px;margin-bottom:18px" id="orchRouterCard">'
      + '<div><h3 class="cs-h3" style="margin-bottom:4px">CodeSovereign Router</h3>'
      + '<div style="font-size:12px;color:var(--muted)">Classifies the request, estimates complexity, then picks Qwen / DeepSeek / GLM / LLM / Codestral / Devstral / Llama / Gemma / remote. Works on desktop, web, and the Agent SDK path.</div></div>'
      + '<div class="cs-eyebrow" style="margin-top:12px">Optimization</div>'
      + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      + ['intelligence', 'balance', 'cost'].map(function (p) {
        return '<button class="btn ' + (policy === p ? 'primary' : 'ghost') + '" data-orch-action="policy" data-orch-id="' + p + '" style="padding:4px 10px;font-size:11px">' + p + '</button>';
      }).join('')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'
      + R.families.map(function (f) {
        const on = last && last.family === f.id;
        return '<span style="font-size:10.5px;padding:3px 8px;border-radius:8px;border:1px solid ' + (on ? 'var(--accent)' : 'var(--line)') + ';color:' + (on ? '#c4b5fd' : 'var(--muted)') + '">' + esc(f.label) + (f.local ? '' : ' · remote') + '</span>';
      }).join('')
      + '</div>'
      + '<div id="orchRouteOut" style="font-size:11px;color:var(--muted);margin-top:10px">'
      + (last ? esc(last.label + ' · ' + last.reason) : 'No route yet — Agent prompts classify automatically.')
      + '</div></div>';
  }

  function agentCard() {
    const Swarm = window.Engine && Engine.Swarm;
    const Coord = window.Engine && Engine.Coordinator;
    if (!Swarm || !Coord) return '';
    const roles = Swarm.roles || [];
    const live = Swarm.list ? Swarm.list() : [];
    return '<div class="card" style="padding:16px;margin:0 0 16px" id="orchSwarmCard">'
      + '<div class="cs-eyebrow">Parent Agent · subagents</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Independent context, custom instructions, separate models and tools, parallel execution. Isolation <b>vm</b> clones the project so workers do not collide.</div>'
      + '<div style="font:500 12px \'JetBrains Mono\',monospace;color:#c7cddb;line-height:1.7;margin-bottom:10px">Parent Agent<br>'
      + roles.map(function (r, i) {
        const branch = i === roles.length - 1 ? ' └── ' : ' ├── ';
        return branch + esc(r.name);
      }).join('<br>')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'
      + '<button class="btn primary" data-orch-action="coord" style="padding:4px 10px;font-size:11px">Run coordinator</button>'
      + '<button class="btn ghost" data-orch-action="coord-vm" style="padding:4px 10px;font-size:11px">Run on isolated copies</button>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted)">Live workers: ' + live.length + ' · coordinator plans and validates; it does not write the implementation.</div>'
      + '<div id="orchCoordOut" style="font-size:11px;font-family:monospace;color:var(--muted);margin-top:8px"></div>'
      + '</div>';
  }

  function factoryCard() {
    const B = window.Engine && Engine.ProjectBrain;
    if (!B) return '';
    const items = (B.get() && B.get().items) || [];
    const kinds = B.kinds || [];
    return '<div class="card" style="padding:16px;margin-top:16px" id="orchBrainCard">'
      + '<div class="cs-eyebrow">Project long-term context</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Shared Project brain: research, artifacts, repository knowledge, development instructions, test procedures, conventions. Syncs between local and cloud agent environments via <span class="cs-mono">/.codesovereign/project/brain.json</span>.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'
      + kinds.map(function (k) {
        const n = items.filter(function (it) { return it.kind === k; }).length;
        return '<span style="font-size:10.5px;padding:3px 8px;border:1px solid var(--line);border-radius:8px">' + esc(k) + ' · ' + n + '</span>';
      }).join('')
      + '</div>'
      + '<button class="btn ghost" data-orch-action="brain-sync" style="padding:4px 10px;font-size:11px">Sync brain</button>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:8px">' + items.length + ' memories · Agent short-term + Project long-term + rules + history + repo</div>'
      + '</div>';
  }

  function recoveryCard() {
    const B = window.Engine && Engine.Browser;
    if (!B) return '';
    const s = B.session();
    return '<div class="card" style="padding:16px;margin:16px 0" id="orchBrowserCard">'
      + '<div class="cs-eyebrow">Browser Agent</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Navigate, follow links, click / double-click / right-click / hover, type, submit, scroll, screenshot, inspect console and network. Cookies, localStorage and IndexedDB persist per workspace. The agent must experience the app it created.</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">url ' + esc(s.url) + ' · console ' + (s.console || []).length + ' · network ' + (s.network || []).length + '</div>'
      + '<button class="btn primary" data-orch-action="experience" style="padding:4px 10px;font-size:11px">Experience the app</button>'
      + '<div id="orchBrowserOut" style="font-size:11px;font-family:monospace;color:var(--muted);margin-top:8px"></div>'
      + '</div>';
  }

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
  wrap('renderRecovery', function (html) {
    const marker = '<!-- Plugin & MCP Hub -->';
    const i = html.indexOf(marker);
    if (i < 0) return html + recoveryCard();
    return html.slice(0, i) + recoveryCard() + html.slice(i);
  });

  function bindOrch(root) {
    root = root || document.getElementById('main') || document;
    if (!root || !root.addEventListener) return;
    if (root.__orchRootBound) return;
    root.__orchRootBound = true;
    root.addEventListener('click', function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-orch-action]');
      if (!el || (typeof root.contains === 'function' && !root.contains(el))) return;
      ev.preventDefault();
      handle(el.getAttribute('data-orch-action'), el.getAttribute('data-orch-id'));
    });
  }

  async function handle(action, id) {
    const Eng = window.Engine || {};
    try {
      if (action === 'policy') {
        Eng.ModelRouter.setPolicy(id);
        toast('Router policy → ' + id);
        rerender();
      } else if (action === 'coord' || action === 'coord-vm') {
        const out = document.getElementById('orchCoordOut');
        if (out) out.textContent = 'delegating…';
        const prompt = (window.S && window.S.agentPrompt) || 'Ship a polished app with frontend, backend, and tests.';
        const r = await Eng.Coordinator.run(prompt, { isolation: action === 'coord-vm' ? 'vm' : 'shared' });
        if (out) out.textContent = (r.ok ? 'ok' : 'issues') + ' · agents ' + (r.agents || []).map(function (a) { return a.role; }).join(', ');
        toast(r.coordinatorWrote ? 'unexpected write' : 'Coordinator collected ' + ((r.agents || []).length) + ' agents', r.ok ? '#34d399' : '#f59e0b');
        rerender();
      } else if (action === 'brain-sync') {
        Eng.ProjectBrain.sync();
        toast('Project brain synced to workspace');
        rerender();
      } else if (action === 'experience') {
        const host = document.getElementById('orchBrowserOut');
        if (host) host.textContent = 'opening preview…';
        const r = await Eng.Browser.experience();
        if (host) host.textContent = (r.ok ? 'OK' : 'PROBLEMS') + ' · ' + (r.problems || []).slice(0, 4).join(' · ');
        toast(r.ok ? 'Browser Agent experienced the app' : 'Browser Agent found problems', r.ok ? '#34d399' : '#f59e0b');
      }
    } catch (err) {
      toast(String(err && err.message || err), '#ef4444');
    }
  }

  wrapBind('bindSettings', function () { bindOrch(); });
  wrapBind('bindAgent', function () { bindOrch(); });
  wrapBind('bindFactory', function () { bindOrch(); });
  wrapBind('bindRecovery', function () { bindOrch(); });
  wrapBind('bindPhase8', function () { setTimeout(function () { bindOrch(); }, 30); });
  window.bindOrchestra = bindOrch;
})();
