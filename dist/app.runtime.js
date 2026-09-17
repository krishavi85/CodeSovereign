/* =====================================================================
 * app.runtime.js
 * Computer Use, Terminal, /goal, Cloud Agents, Snapshots, targets,
 * multi-repo — injected into existing screens. No new pages.
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
        if (tries++ < 40) { setTimeout(tryWrap, 40); return; }
        return;
      }
      if (orig.__rtInjected) return;
      window[name] = function () { return fn(orig.apply(this, arguments)); };
      window[name].__rtInjected = true;
    }
    tryWrap();
  }
  function wrapBind(name, extra) {
    let tries = 0;
    function tryWrap() {
      const orig = window[name];
      if (typeof orig !== 'function') {
        if (tries++ < 40) { setTimeout(tryWrap, 40); return; }
        return;
      }
      if (orig.__rtBound) return;
      window[name] = function () { orig.apply(this, arguments); extra(); };
      window[name].__rtBound = true;
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

  function settingsCard() {
    const R = window.Engine && Engine.Runtime;
    const T = window.Engine && Engine.TerminalX;
    const S = window.Engine && Engine.Snapshots;
    if (!R || !T || !S) return '';
    const st = R.get();
    const prof = T.profile();
    return '<div class="card" style="padding:20px;margin-bottom:18px" id="rtRuntimeCard">'
      + '<div><h3 class="cs-h3" style="margin-bottom:4px">Agent runtime</h3>'
      + '<div style="font-size:12px;color:var(--muted)">Computer Use, terminal profiles, Cloud / self-hosted workers, and warm runtime snapshots. Execution is not API-only.</div></div>'
      + '<div class="cs-eyebrow" style="margin-top:12px">Run on</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + R.targets.map(function (t) {
        return '<button class="btn ' + (st.target === t.id ? 'primary' : 'ghost') + '" data-rt-action="target" data-rt-id="' + t.id + '" style="padding:4px 10px;font-size:11px">' + esc(t.label) + '</button>';
      }).join('')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + R.providers.map(function (p) {
        const on = st.provider === p.id;
        return '<span data-rt-action="provider" data-rt-id="' + p.id + '" style="cursor:pointer;font-size:10.5px;padding:3px 8px;border-radius:8px;border:1px solid ' + (on ? 'var(--accent)' : 'var(--line)') + '">' + esc(p.label) + '</span>';
      }).join('')
      + '</div>'
      + '<div class="cs-eyebrow" style="margin-top:14px">Terminal profile</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + T.profiles.map(function (p) {
        return '<button class="btn ' + (prof === p.id ? 'primary' : 'ghost') + '" data-rt-action="profile" data-rt-id="' + p.id + '" style="padding:4px 10px;font-size:11px">' + esc(p.label) + ' · ' + p.network + '</button>';
      }).join('')
      + '</div>'
      + '<div class="cs-eyebrow" style="margin-top:14px">Sovereign Runtime Snapshots</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + S.runtimes.map(function (r) {
        return '<button class="btn ghost" data-rt-action="snap" data-rt-id="' + r.id + '" style="padding:4px 10px;font-size:11px">' + esc(r.label) + '</button>';
      }).join('')
      + '</div>'
      + '<div id="rtSnapOut" style="font-size:11px;color:var(--muted);margin-top:8px">'
      + (st.lastSnapshot ? esc(st.lastSnapshot.runtime + ' · ' + st.lastSnapshot.id) : 'No warm image yet')
      + '</div></div>';
  }

  function agentCard() {
    const G = window.Engine && Engine.Goal;
    const C = window.Engine && Engine.Computer;
    const Cloud = window.Engine && Engine.Cloud;
    if (!G || !C || !Cloud) return '';
    const last = G.last && G.last();
    return '<div class="card" style="padding:16px;margin:0 0 16px" id="rtGoalCard">'
      + '<div class="cs-eyebrow">Persistent /goal · Computer Use · Cloud Agent</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">State-oriented loop: GOAL → run tests → analyze → fix → run again until satisfied. Not a fixed number of steps. Cloud Agents plan → code → execute → test → verify → commit → PR without the laptop staying on.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn primary" data-rt-action="goal" style="padding:4px 10px;font-size:11px">Run /goal</button>'
      + '<button class="btn ghost" data-rt-action="computer" style="padding:4px 10px;font-size:11px">Computer Use preview</button>'
      + '<button class="btn ghost" data-rt-action="cloud" style="padding:4px 10px;font-size:11px">Spawn cloud agent</button>'
      + '</div>'
      + '<div id="rtGoalOut" style="font-size:11px;font-family:monospace;color:var(--muted);margin-top:8px">'
      + (last ? esc(last.status + ' · ' + last.objective + ' · rounds ' + last.rounds) : 'Prefix a prompt with /goal — e.g. /goal fix all flaky tests and make CI green')
      + '</div></div>';
  }

  function factoryCard() {
    const R = window.Engine && Engine.Repos;
    if (!R) return '';
    const cur = R.current();
    return '<div class="card" style="padding:16px;margin-top:16px" id="rtReposCard">'
      + '<div class="cs-eyebrow">Multi-repository workspace</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Application = frontend-repo + backend-repo + mobile-repo + shared-types + infrastructure. Switch when another codebase becomes necessary.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + R.list().map(function (r) {
        return '<button class="btn ' + (cur === r.id ? 'primary' : 'ghost') + '" data-rt-action="repo" data-rt-id="' + esc(r.id) + '" style="padding:4px 10px;font-size:11px">' + esc(r.label) + '</button>';
      }).join('')
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:8px">active ' + esc(cur) + ' · ' + esc(R.path(cur)) + '</div></div>';
  }

  function pipelinesCard() {
    const C = window.Engine && Engine.Cloud;
    if (!C) return '';
    const last = C.last && C.last();
    return '<div class="card" style="padding:16px;margin-top:16px" id="rtCloudCard">'
      + '<div class="cs-eyebrow">Cloud Agent pipeline</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 8px">Each cloud run gets a VM, repository, dependencies, environment, secret names, network, shell, and test environment. Prebuilt snapshots skip clone/install from scratch; a failed build keeps the last successful image.</div>'
      + '<div style="font-size:11px;color:var(--muted)">' + (last ? ('last ' + last.id + (last.ok ? ' ok' : '')) : 'No cloud run yet') + '</div></div>';
  }

  function recoveryCard() {
    return '<div class="card" style="padding:16px;margin:16px 0" id="rtHealCard">'
      + '<div class="cs-eyebrow">Self-healing development loop</div>'
      + '<div style="font:500 12px \'JetBrains Mono\',monospace;color:#c7cddb;line-height:1.7">GOAL “All tests pass”<br> → Run tests<br> → Failures? YES → Analyze → Fix → Run again<br> → NO → GOAL SATISFIED</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:8px">Web search consults docs beyond the workspace, then compare → implement → test. Live arbitrary URLs stay blocked by CSP.</div>'
      + '</div>';
  }

  wrap('renderSettings', function (html) { return insertBeforeTools(html, settingsCard()); });
  wrap('renderAgent', function (html) {
    const marker = 'id="agentPromptInput"';
    const i = html.indexOf(marker);
    if (i < 0) return agentCard() + html;
    const box = html.lastIndexOf('<div style="border:1px solid rgba(109,93,252,.4)', i);
    if (box < 0) return agentCard() + html;
    return html.slice(0, box) + agentCard() + html.slice(box);
  });
  wrap('renderFactory', function (html) { return appendInScreen(html, factoryCard()); });
  wrap('renderPipelines', function (html) { return appendInScreen(html, pipelinesCard()); });
  wrap('renderRecovery', function (html) {
    const marker = '<!-- Plugin & MCP Hub -->';
    const i = html.indexOf(marker);
    if (i < 0) return html + recoveryCard();
    return html.slice(0, i) + recoveryCard() + html.slice(i);
  });

  function bindRt(root) {
    root = root || document.getElementById('main') || document;
    if (!root || !root.addEventListener) return;
    if (root.__rtRootBound) return;
    root.__rtRootBound = true;
    root.addEventListener('click', function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-rt-action]');
      if (!el || (typeof root.contains === 'function' && !root.contains(el))) return;
      ev.preventDefault();
      handle(el.getAttribute('data-rt-action'), el.getAttribute('data-rt-id'));
    });
  }

  async function handle(action, id) {
    const E = window.Engine || {};
    try {
      if (action === 'target') { E.Runtime.setTarget(id); toast('Run on → ' + id); rerender(); }
      else if (action === 'provider') { E.Runtime.setProvider(id); toast('Provider → ' + id); rerender(); }
      else if (action === 'profile') { E.TerminalX.setProfile(id); toast('Terminal profile → ' + id); rerender(); }
      else if (action === 'snap') {
        const r = E.Snapshots.build(id);
        const out = document.getElementById('rtSnapOut');
        if (out) out.textContent = r.ok ? ('warm ' + r.image.runtime + ' · ' + r.image.id) : ((r.error || 'failed') + (r.continued ? ' · using last successful' : ''));
        toast(r.ok ? ('Snapshot ' + id) : (r.continued ? 'Using last successful ' + id : 'Snapshot failed'), r.ok ? '#34d399' : '#f59e0b');
        rerender();
      } else if (action === 'repo') { E.Repos.switchTo(id); toast('Repo → ' + id); rerender(); }
      else if (action === 'goal') {
        const prompt = (window.S && window.S.agentPrompt) || '/goal fix all flaky tests and make CI green';
        const text = /^\s*\/goal\b/i.test(prompt) ? prompt : ('/goal ' + prompt);
        const g = await E.Goal.run(text);
        toast('Goal ' + g.status + (g.notice ? ' · ' + g.notice : ''), g.status === 'satisfied' ? '#34d399' : '#f59e0b');
        rerender();
      } else if (action === 'computer') {
        await E.Computer.launch('preview');
        await E.Computer.click('#save');
        E.Computer.screenshot();
        toast('Computer Use launched preview and clicked');
      } else if (action === 'cloud') {
        const r = await E.Cloud.run((window.S && window.S.agentPrompt) || 'verify and open PR');
        toast(r.laptopRequired ? 'needs laptop' : 'Cloud agent finished', r.ok ? '#34d399' : '#f59e0b');
        rerender();
      }
    } catch (err) {
      toast(String(err && err.message || err), '#ef4444');
    }
  }

  wrapBind('bindSettings', function () { bindRt(); });
  wrapBind('bindAgent', function () { bindRt(); });
  wrapBind('bindFactory', function () { bindRt(); });
  wrapBind('bindPipelines', function () { bindRt(); });
  wrapBind('bindRecovery', function () { bindRt(); });
  wrapBind('bindPhase8', function () { setTimeout(function () { bindRt(); }, 30); });
  window.bindRuntime = bindRt;
})();
