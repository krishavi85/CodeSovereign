/* =====================================================================
 * app.work.js
 * MCP transports, Customize, Google Workspace, Skills/Modes, Event Bus,
 * steering, Side Chats, conversation search, checkpoints, Origin/CI,
 * Bugbot, evidence, design-to-code, a11y, greenfield, Live Preview,
 * Vercel — injected into existing screens. No new pages.
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
      if (orig.__workInjected) return;
      window[name] = function () { return fn(orig.apply(this, arguments)); };
      window[name].__workInjected = true;
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
      if (orig.__workBound) return;
      window[name] = function () { orig.apply(this, arguments); extra(); };
      window[name].__workBound = true;
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
    const C = window.Engine && Engine.Customize;
    const M = window.Engine && Engine.Modes;
    const MCP = window.Engine && Engine.MCP;
    if (!C || !M || !MCP) return '';
    const active = M.active();
    return '<div class="card" style="padding:20px;margin-bottom:18px" id="workCustomizeCard">'
      + '<div><h3 class="cs-h3" style="margin-bottom:4px">Customize · MCP · Modes</h3>'
      + '<div style="font-size:12px;color:var(--muted)">Plugins, skills, MCPs, subagents, rules, commands, and hooks at user, team, and workspace scope. MCP transports: stdio, SSE, Streamable HTTP. Remote servers use OAuth.</div></div>'
      + '<div class="cs-eyebrow" style="margin-top:12px">Custom Modes (stay on for this conversation)</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + M.catalog.map(function (m) {
        const on = active.indexOf(m.id) >= 0;
        return '<button class="btn ' + (on ? 'primary' : 'ghost') + '" data-work-action="mode" data-work-id="' + m.id + '" style="padding:4px 10px;font-size:11px">' + esc(m.name.replace(/ Mode$/, '')) + '</button>';
      }).join('')
      + '</div>'
      + '<div class="cs-eyebrow" style="margin-top:14px">MCP transports</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + MCP.transports.map(function (t) {
        return '<button class="btn ghost" data-work-action="mcp-connect" data-work-id="' + t + '" style="padding:4px 10px;font-size:11px">' + esc(t) + '</button>';
      }).join('')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + C.scopes.map(function (sc) {
        return '<span style="font-size:10.5px;padding:3px 8px;border:1px solid var(--line);border-radius:8px">' + esc(sc) + '</span>';
      }).join('')
      + C.kinds.map(function (k) {
        return '<span style="font-size:10.5px;padding:3px 8px;border:1px solid var(--line);border-radius:8px">' + esc(k) + '</span>';
      }).join('')
      + '</div>'
      + '<div id="workMcpOut" style="font-size:11px;color:var(--muted);margin-top:8px">'
      + (MCP.list().length ? (MCP.list().length + ' MCP server(s) configured') : 'No MCP server connected yet')
      + '</div></div>';
  }

  function agentCard() {
    const Steer = window.Engine && Engine.Steer;
    const Side = window.Engine && Engine.SideChat;
    const Bus = window.Engine && Engine.AgentBus;
    const Search = window.Engine && Engine.ConvSearch;
    if (!Steer || !Side || !Bus) return '';
    const pending = Steer.pending();
    const sides = Side.list();
    const lastEv = (Bus.history(1)[0] || {});
    return '<div class="card" style="padding:16px;margin:0 0 16px" id="workSteerCard">'
      + '<div class="cs-eyebrow">Steer · Side chats · Event bus · Conversation search</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Send a steering message at a safe tool boundary without stopping the Agent. Side chats inherit main context. The Event Bus observes the lifecycle.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<input id="workSteerInput" placeholder="Steer the running agent…" style="flex:1;min-width:160px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font-size:12px">'
      + '<button class="btn primary" data-work-action="steer" style="padding:4px 10px;font-size:11px">Steer</button>'
      + '<button class="btn ghost" data-work-action="side" style="padding:4px 10px;font-size:11px">Open side chat</button>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'
      + '<input id="workSearchInput" placeholder="Search transcripts…" style="flex:1;min-width:160px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font-size:12px">'
      + '<button class="btn ghost" data-work-action="search" style="padding:4px 10px;font-size:11px">Search</button>'
      + '</div>'
      + '<div id="workSteerOut" style="font-size:11px;font-family:monospace;color:var(--muted);margin-top:8px">'
      + 'queue ' + pending.length + ' · side ' + sides.length + ' · last ' + esc(lastEv.name || 'idle')
      + '</div></div>';
  }

  function factoryCard() {
    const G = window.Engine && Engine.Greenfield;
    const P = window.Engine && Engine.Publish;
    const L = window.Engine && Engine.LivePreview;
    if (!G || !P || !L) return '';
    const last = G.last;
    return '<div class="card" style="padding:16px;margin-top:16px" id="workGreenCard">'
      + '<div class="cs-eyebrow">Greenfield · Live Preview · Deploy</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Start with no repository. Prompt → app → live environment → preview → Origin repo → Vercel. Source + runtime + browser + agent stay coupled. Do not accept “task completed” without evidence.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn primary" data-work-action="greenfield" style="padding:4px 10px;font-size:11px">Start from scratch</button>'
      + '<button class="btn ghost" data-work-action="origin-repo" style="padding:4px 10px;font-size:11px">Create Origin repo</button>'
      + '<button class="btn ghost" data-work-action="preview" style="padding:4px 10px;font-size:11px">Live Preview :' + L.port + '</button>'
      + '<button class="btn ghost" data-work-action="vercel" style="padding:4px 10px;font-size:11px">Publish to Vercel</button>'
      + '</div>'
      + '<div id="workGreenOut" style="font-size:11px;color:var(--muted);margin-top:8px">'
      + (last ? esc((last.name || 'app') + (last.repo ? ' · repo ' + last.repo.name : ' · no repository yet')) : 'No greenfield app yet')
      + '</div></div>';
  }

  function pipelinesCard() {
    const O = window.Engine && Engine.Origin;
    const CI = window.Engine && Engine.CI;
    const B = window.Engine && Engine.Bugbot;
    const Ck = window.Engine && Engine.Checkpoints;
    if (!O || !CI || !B || !Ck) return '';
    const prs = O.listPRs();
    const lastB = B.last;
    return '<div class="card" style="padding:16px;margin-top:16px" id="workOriginCard">'
      + '<div class="cs-eyebrow">Origin · CI wake-repair · Bugbot · Checkpoints</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">CODE CREATOR is separate from CODE REVIEWER. Agent → PR → CI → failure → Agent wakes → inspect → fix → push → PASS. Integrations: ' + O.integrations.join(', ') + '.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn primary" data-work-action="pr" style="padding:4px 10px;font-size:11px">Open PR</button>'
      + '<button class="btn ghost" data-work-action="ci" style="padding:4px 10px;font-size:11px">Watch CI</button>'
      + '<button class="btn ghost" data-work-action="bugbot" style="padding:4px 10px;font-size:11px">Run Bugbot</button>'
      + '<button class="btn ghost" data-work-action="checkpoint" style="padding:4px 10px;font-size:11px">Checkpoint</button>'
      + '<button class="btn ghost" data-work-action="restore" style="padding:4px 10px;font-size:11px">Restore</button>'
      + '</div>'
      + '<div id="workOriginOut" style="font-size:11px;color:var(--muted);margin-top:8px">'
      + 'PRs ' + prs.length + (lastB ? (' · Bugbot ' + lastB.findings.length + ' finding(s)') : '') + ' · checkpoints ' + Ck.list().length
      + '</div></div>';
  }

  function recoveryCard() {
    const A = window.Engine && Engine.A11y;
    const D = window.Engine && Engine.Design;
    const T = window.Engine && Engine.LiveTest;
    const E = window.Engine && Engine.Evidence;
    const G = window.Engine && Engine.GWorkspace;
    if (!A || !D || !T || !E || !G) return '';
    return '<div class="card" style="padding:16px;margin:16px 0" id="workProofCard">'
      + '<div class="cs-eyebrow">Evidence · Design-to-code · A11y · Live testing · Google Workspace</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin:6px 0 10px">Screenshots, videos, logs, and visual demos are required. Browser audits contrast, semantic HTML, ARIA, keyboard, and alt text, then drives real forms while reading console and network.</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="btn primary" data-work-action="evidence" style="padding:4px 10px;font-size:11px">Capture evidence</button>'
      + '<button class="btn ghost" data-work-action="design" style="padding:4px 10px;font-size:11px">Design → code</button>'
      + '<button class="btn ghost" data-work-action="a11y" style="padding:4px 10px;font-size:11px">A11y audit</button>'
      + '<button class="btn ghost" data-work-action="livetest" style="padding:4px 10px;font-size:11px">Live form test</button>'
      + '<button class="btn ghost" data-work-action="gws" style="padding:4px 10px;font-size:11px">Google Workspace</button>'
      + '</div>'
      + '<div id="workProofOut" style="font-size:11px;font-family:monospace;color:var(--muted);margin-top:8px">'
      + 'artifacts ' + E.list().length
      + '</div></div>';
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

  function bindWork(root) {
    root = root || document.getElementById('main') || document;
    if (!root || !root.addEventListener) return;
    if (root.__workRootBound) return;
    root.__workRootBound = true;
    root.addEventListener('click', function (ev) {
      const el = ev.target && ev.target.closest && ev.target.closest('[data-work-action]');
      if (!el || (typeof root.contains === 'function' && !root.contains(el))) return;
      ev.preventDefault();
      handle(el.getAttribute('data-work-action'), el.getAttribute('data-work-id'));
    });
  }

  function setOut(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  async function handle(action, id) {
    const E = window.Engine || {};
    try {
      if (action === 'mode') {
        const on = E.Modes.active().indexOf(id) >= 0;
        if (on) E.Modes.disable(id); else E.Modes.enable(id);
        toast((on ? 'Mode off · ' : 'Mode on · ') + id);
        rerender();
      } else if (action === 'mcp-connect') {
        const rec = E.MCP.connect({
          id: 'mcp-' + id,
          name: id + ' MCP',
          transport: id,
          url: id === 'stdio' ? '' : 'https://mcp.example.invalid/mcp',
          tools: E.MCP.tools
        });
        setOut('workMcpOut', rec.transport + ' · ' + rec.note);
        toast('MCP ' + rec.transport, rec.connected ? '#34d399' : '#f59e0b');
      } else if (action === 'steer') {
        const inp = document.getElementById('workSteerInput');
        const text = (inp && inp.value) || 'Prefer accessibility labels and keep going';
        const r = E.Steer.push(text);
        setOut('workSteerOut', r.ok ? ('queued · delivers at next tool boundary') : r.error);
        toast('Steering queued');
      } else if (action === 'side') {
        const c = E.SideChat.open('architecture', 'Sanity-check the current approach without interrupting the main agent.');
        E.SideChat.say(c.id, 'assistant', 'Branchable reasoning session inherited main context.');
        setOut('workSteerOut', 'side chat ' + c.id + ' · ' + c.purpose);
        toast('Side chat opened');
      } else if (action === 'search') {
        const q = (document.getElementById('workSearchInput') || {}).value || 'agent';
        const hits = E.ConvSearch.search(q);
        setOut('workSteerOut', hits.length ? (hits.length + ' hits · ' + (hits[0].snippet || '').slice(0, 80)) : 'no transcript hits');
        toast('Conversation search');
      } else if (action === 'greenfield') {
        const prompt = (window.S && window.S.agentPrompt) || 'Build me an inventory app';
        const r = await E.Greenfield.start(prompt);
        setOut('workGreenOut', r.name + ' · no repository · preview ' + (r.preview && r.preview.port));
        toast('Greenfield app ready');
        rerender();
      } else if (action === 'origin-repo') {
        const r = E.Greenfield.createRepository();
        setOut('workGreenOut', 'Origin repo ' + r.repo.name);
        toast('Origin repository created');
        rerender();
      } else if (action === 'preview') {
        const r = E.LivePreview.open();
        setOut('workGreenOut', 'Live Preview ' + r.url);
        toast('Preview forwarded :' + r.port);
      } else if (action === 'vercel') {
        const r = await E.Publish.vercel();
        setOut('workGreenOut', 'Vercel · ' + r.files + ' files');
        toast('Published to Vercel target');
      } else if (action === 'pr') {
        E.Checkpoints.auto('before-pr');
        const r = E.Origin.openPR({ title: (window.S && window.S.agentPrompt) || 'Agent changes' });
        setOut('workOriginOut', 'PR ' + r.pr.id + ' · ' + r.files + ' files');
        toast('PR opened on Origin');
      } else if (action === 'ci') {
        const prs = E.Origin.listPRs();
        const r = await E.CI.wakeRepair(prs[0] && prs[0].id);
        setOut('workOriginOut', r.cycle.join(' → '));
        toast(r.ok ? 'CI PASS' : 'CI repaired / still failing', r.ok ? '#34d399' : '#f59e0b');
      } else if (action === 'bugbot') {
        const r = E.Bugbot.review();
        setOut('workOriginOut', 'Bugbot · ' + r.findings.length + ' finding(s) · reviewer ≠ creator');
        toast('Bugbot reviewed the diff');
      } else if (action === 'checkpoint') {
        const r = E.Checkpoints.capture('manual');
        setOut('workOriginOut', 'checkpoint ' + r.id + ' · ' + r.files + ' files');
        toast('Checkpoint captured');
      } else if (action === 'restore') {
        const r = E.Checkpoints.restore();
        setOut('workOriginOut', r.ok ? ('restored ' + r.id) : r.error);
        toast(r.ok ? 'Restored checkpoint' : 'No checkpoint', r.ok ? '#34d399' : '#f59e0b');
        rerender();
      } else if (action === 'evidence') {
        E.Evidence.screenshot();
        E.Evidence.logs((E.Browser && E.Browser.console && JSON.stringify(E.Browser.console())) || 'agent log');
        E.Evidence.video();
        const g = E.Evidence.require();
        setOut('workProofOut', g.ok ? ('evidence ok · ' + g.artifacts.length + ' artifacts') : g.error);
        toast(g.ok ? 'Evidence recorded' : 'Need proof', g.ok ? '#34d399' : '#f59e0b');
      } else if (action === 'design') {
        writeDesignSeed();
        const r = await E.Design.toCode('/assets/design.svg', { title: 'Designed inventory' });
        setOut('workProofOut', r.pipeline.split(' → ').length + ' steps · compare ' + (r.compare && r.compare.ok ? 'ok' : 'iterate'));
        toast('Design-to-code ran');
      } else if (action === 'a11y') {
        const r = E.A11y.audit();
        setOut('workProofOut', 'a11y ' + (r.ok ? 'pass' : (r.findings.length + ' finding(s)')));
        toast('Accessibility audit');
      } else if (action === 'livetest') {
        const r = await E.LiveTest.run({});
        setOut('workProofOut', 'forms ' + r.forms + ' · inputs ' + r.inputs + ' · console ' + (r.console || []).length);
        toast('Live form test');
      } else if (action === 'gws') {
        E.GWorkspace.drive('create', { name: 'notes.txt', body: 'workspace file' });
        const found = E.GWorkspace.drive('search', { q: 'notes' });
        E.GWorkspace.gmail('draft', { subject: 'Status', body: 'Working' });
        E.GWorkspace.calendar('create', { title: 'Review' });
        setOut('workProofOut', 'Drive hits ' + found.hits.length + ' · Gmail/Calendar stores updated');
        toast('Google Workspace tools ran');
      }
    } catch (err) {
      toast(String(err && err.message || err), '#ef4444');
    }
  }

  function writeDesignSeed() {
    const FS = window.Engine && Engine.FS;
    if (!FS || !FS.write) return;
    FS.write('/assets/design.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#0b0d12"/><text x="40" y="200" fill="#e6e9f2" font-size="28">Inventory</text></svg>');
  }

  wrapBind('bindSettings', function () { bindWork(); });
  wrapBind('bindAgent', function () { bindWork(); });
  wrapBind('bindFactory', function () { bindWork(); });
  wrapBind('bindPipelines', function () { bindWork(); });
  wrapBind('bindRecovery', function () { bindWork(); });
  wrapBind('bindPhase8', function () { setTimeout(function () { bindWork(); }, 30); });
  window.bindWork = bindWork;
})();
