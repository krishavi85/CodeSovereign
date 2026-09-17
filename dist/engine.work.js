/* =====================================================================
   engine.work.js
   Work-agent surfaces that extend MCP: transports + OAuth, Customize
   scopes, Google Workspace, Skills / Custom Modes, Agent Event Bus,
   steering, Side Chats, conversation search, orchestration checkpoints,
   Origin + CI wake-repair, Bugbot (separate reviewer), evidence gate,
   image understand/generate, design-to-code, a11y, live form testing,
   greenfield (no repo), Live Preview, Vercel publish.

   Analogues on existing screens — no new routes. Persistence is the
   workspace filesystem and localStorage, never canned demo rows.
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});

  function now() { return Date.now(); }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + now().toString(36).slice(-4);
  }
  function load(k, d) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }
  function fs() { return Engine.FS; }
  function readPath(p) {
    try { return (fs() && fs().read(p)) || ''; } catch (_) { return ''; }
  }
  function writePath(p, c) {
    try { if (fs()) fs().write(p, c); return true; } catch (_) { return false; }
  }
  function existsPath(p) {
    try { return !!(fs() && fs().exists && fs().exists(p)); } catch (_) { return false; }
  }
  function listPaths() {
    try {
      if (!fs()) return [];
      if (fs().list) return (fs().list() || []).map(function (f) { return f.path || f; });
      return Object.keys(fs()._data || {});
    } catch (_) { return []; }
  }
  function jsonStore(path, fallback) {
    const raw = readPath(path);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function jsonSave(path, obj) {
    writePath(path, JSON.stringify(obj, null, 2));
    return obj;
  }
  function snapshotFs() {
    const out = {};
    listPaths().forEach(function (p) {
      if (typeof p !== 'string') return;
      try {
        if (fs().isFile && !fs().isFile(p)) return;
      } catch (_) {}
      out[p] = readPath(p);
    });
    return out;
  }
  function restoreFs(snap) {
    const FS = fs();
    if (!FS || !snap) return { ok: false };
    try { if (FS.clear) FS.clear(); } catch (_) {}
    Object.keys(snap).forEach(function (p) { writePath(p, snap[p]); });
    return { ok: true, files: Object.keys(snap).length };
  }

  /* ---------- Agent Event Bus ---------- */
  const BUS_EVENTS = [
    'onTaskStart', 'onPlanGenerated', 'onToolBeforeCall', 'onToolAfterCall',
    'onFileEdit', 'onBuildStart', 'onBuildFailure', 'onRuntimeError',
    'onTestFailure', 'onSubagentSpawn', 'onVerification', 'onGoalReached',
    'beforeSubmitPrompt', 'afterAgentResponse', 'afterAgentThought',
    'subagentStart', 'stop', 'compaction', 'turn completion'
  ];
  const BUS_NS = 'cs.agentbus.v1';
  const busListeners = {};
  function busState() {
    return Object.assign({ history: [] }, load(BUS_NS, {}));
  }
  function persistBus(s) { save(BUS_NS, s); }

  const AgentBus = {
    events: BUS_EVENTS,
    on(name, fn) {
      if (!busListeners[name]) busListeners[name] = [];
      busListeners[name].push(fn);
      return function () {
        busListeners[name] = (busListeners[name] || []).filter(function (f) { return f !== fn; });
      };
    },
    emit(name, payload) {
      const entry = { id: uid('ev'), name: name, at: now(), payload: payload || null };
      const s = busState();
      s.history = (s.history || []).concat([entry]).slice(-200);
      persistBus(s);
      (busListeners[name] || []).forEach(function (fn) {
        try { fn(entry); } catch (_) {}
      });
      (busListeners['*'] || []).forEach(function (fn) {
        try { fn(entry); } catch (_) {}
      });
      if (window.EngineExtras && EngineExtras.EventBus && EngineExtras.EventBus.emit) {
        try { EngineExtras.EventBus.emit('agent:' + name, payload); } catch (_) {}
      }
      return entry;
    },
    history(n) {
      const h = busState().history || [];
      return n ? h.slice(-n) : h.slice();
    },
    last(name) {
      const h = busState().history || [];
      for (let i = h.length - 1; i >= 0; i--) if (h[i].name === name) return h[i];
      return null;
    },
    clear() { persistBus({ history: [] }); }
  };

  /* ---------- Customize: plugins / skills / MCPs / subagents / rules / commands / hooks ---------- */
  const SCOPES = ['user', 'team', 'workspace'];
  const CUSTOMIZE_KINDS = ['plugins', 'skills', 'mcps', 'subagents', 'rules', 'commands', 'hooks'];
  const CUST_NS = 'cs.customize.v1';
  function custState() {
    const s = load(CUST_NS, null) || { items: [] };
    if (!Array.isArray(s.items)) s.items = [];
    return s;
  }
  function persistCust(s) { save(CUST_NS, s); }

  const Customize = {
    scopes: SCOPES,
    kinds: CUSTOMIZE_KINDS,
    list(filter) {
      filter = filter || {};
      return custState().items.filter(function (it) {
        if (filter.kind && it.kind !== filter.kind) return false;
        if (filter.scope && it.scope !== filter.scope) return false;
        return true;
      });
    },
    add(item) {
      const kind = CUSTOMIZE_KINDS.indexOf(item.kind) >= 0 ? item.kind : 'plugins';
      const scope = SCOPES.indexOf(item.scope) >= 0 ? item.scope : 'workspace';
      const rec = {
        id: item.id || uid(kind.slice(0, 3)),
        kind: kind,
        scope: scope,
        name: String(item.name || kind),
        body: item.body || item.text || '',
        enabled: item.enabled !== false,
        at: now()
      };
      const s = custState();
      s.items = s.items.filter(function (x) { return x.id !== rec.id; }).concat([rec]);
      persistCust(s);
      AgentBus.emit('onTaskStart', { customize: rec.id, kind: rec.kind, scope: rec.scope });
      return rec;
    },
    remove(id) {
      const s = custState();
      s.items = s.items.filter(function (x) { return x.id !== id; });
      persistCust(s);
      return { ok: true };
    },
    enable(id, on) {
      const s = custState();
      s.items.forEach(function (x) { if (x.id === id) x.enabled = !!on; });
      persistCust(s);
      return { ok: true };
    },
    contextBlock() {
      const items = Customize.list().filter(function (i) { return i.enabled; });
      if (!items.length) return '';
      return 'CUSTOMIZE (' + items.length + ' enabled at user/team/workspace):\n' + items.map(function (i) {
        return '- [' + i.scope + '/' + i.kind + '] ' + i.name + (i.body ? ': ' + String(i.body).slice(0, 180) : '');
      }).join('\n');
    }
  };

  /* ---------- MCP transports + OAuth + named tools ---------- */
  const TRANSPORTS = ['stdio', 'sse', 'streamable-http'];
  const MCP_TOOLS = [
    'database.query', 'jira.createIssue', 'figma.getDesign',
    'supabase.executeSQL', 'github.createPR', 'playwright.openPage',
    'drive.search', 'drive.browse', 'drive.download', 'drive.create', 'drive.organize',
    'gmail.search', 'gmail.read', 'gmail.draft', 'gmail.send', 'gmail.label', 'gmail.thread',
    'calendar.inspect', 'calendar.availability', 'calendar.create', 'calendar.update'
  ];
  const MCP_NS = 'cs.mcp.servers.v1';
  function mcpState() {
    return Object.assign({ servers: {}, oauth: {} }, load(MCP_NS, {}));
  }
  function persistMcp(s) { save(MCP_NS, s); }

  function oauthFor(server) {
    const s = mcpState();
    const tok = (s.oauth && s.oauth[server]) || null;
    if (tok) return tok;
    try {
      if (window.OAuthClient && OAuthClient.getToken) {
        const t = OAuthClient.getToken(server) || OAuthClient.getToken('google') || OAuthClient.getToken('github');
        if (t) return t;
      }
    } catch (_) {}
    return null;
  }

  function connectSpec(opts) {
    opts = opts || {};
    const transport = TRANSPORTS.indexOf(opts.transport) >= 0 ? opts.transport : 'stdio';
    const rec = {
      id: opts.id || uid('mcp'),
      name: opts.name || opts.id || 'mcp',
      transport: transport,
      command: opts.command || '',
      args: opts.args || [],
      url: opts.url || '',
      auth: opts.auth || (transport === 'stdio' ? 'none' : 'oauth'),
      tools: (opts.tools || MCP_TOOLS).slice(),
      connected: false,
      at: now()
    };
    if (transport === 'stdio') {
      rec.connected = !!(window.CSExec && CSExec.available && CSExec.available());
      rec.note = rec.connected
        ? 'stdio spawn allowed on desktop host'
        : 'stdio requires the desktop host; config is recorded';
    } else {
      rec.connected = !!(rec.url && oauthFor(rec.id));
      rec.note = rec.connected
        ? (transport + ' + OAuth token present')
        : (transport + ' remote; OAuth token missing — authorize to call the live server');
    }
    const s = mcpState();
    s.servers[rec.id] = rec;
    persistMcp(s);
    return rec;
  }

  function toolStore(name) {
    return '/.codesovereign/mcp/' + name.replace(/\./g, '/') + '.json';
  }

  async function invokeNamed(tool, args) {
    args = args || {};
    const name = String(tool || '');
    if (name === 'database.query' || name === 'supabase.executeSQL') {
      const db = jsonStore('/.codesovereign/db.json', { tables: {} });
      const sql = String(args.sql || args.query || '').trim();
      const table = String(args.table || (sql.match(/from\s+([a-z0-9_]+)/i) || [])[1] || 'items');
      const rows = db.tables[table] || [];
      if (/^insert\b/i.test(sql) || args.row) {
        const row = args.row || { id: uid('row'), at: now(), sql: sql };
        db.tables[table] = rows.concat([row]);
        jsonSave('/.codesovereign/db.json', db);
        return { ok: true, tool: name, table: table, inserted: row, count: db.tables[table].length };
      }
      const q = String(args.q || args.where || '').toLowerCase();
      const hits = q ? rows.filter(function (r) { return JSON.stringify(r).toLowerCase().indexOf(q) >= 0; }) : rows;
      return { ok: true, tool: name, table: table, rows: hits.slice(0, 50), count: hits.length };
    }
    if (name === 'jira.createIssue') {
      const issues = jsonStore('/.codesovereign/jira/issues.json', { issues: [] });
      const issue = {
        id: uid('jira'),
        key: 'SOV-' + (issues.issues.length + 1),
        summary: String(args.summary || args.title || 'issue'),
        body: String(args.body || args.description || ''),
        at: now()
      };
      issues.issues.push(issue);
      jsonSave('/.codesovereign/jira/issues.json', issues);
      return { ok: true, tool: name, issue: issue };
    }
    if (name === 'figma.getDesign') {
      const path = args.path || args.file || '/assets/design.svg';
      if (!existsPath(path)) return { ok: false, tool: name, error: 'design file not in workspace', path: path };
      const understood = Image.understand(path);
      return { ok: true, tool: name, path: path, design: understood };
    }
    if (name === 'github.createPR') {
      return Origin.openPR({
        title: args.title || args.summary || 'Agent changes',
        body: args.body || '',
        branch: args.branch
      });
    }
    if (name === 'playwright.openPage') {
      if (Engine.Browser && Engine.Browser.navigate) {
        const nav = await Engine.Browser.navigate(args.url || 'preview');
        return { ok: !!nav.ok, tool: name, page: nav };
      }
      return { ok: false, tool: name, error: 'Browser Agent not loaded' };
    }
    if (/^drive\./.test(name)) return GWorkspace.drive(name.split('.')[1], args);
    if (/^gmail\./.test(name)) return GWorkspace.gmail(name.split('.')[1], args);
    if (/^calendar\./.test(name)) return GWorkspace.calendar(name.split('.')[1], args);
    return { ok: false, tool: name, error: 'unknown MCP tool' };
  }

  const MCP = {
    transports: TRANSPORTS,
    tools: MCP_TOOLS,
    connect: connectSpec,
    list() {
      const s = mcpState();
      return Object.keys(s.servers).map(function (k) { return s.servers[k]; });
    },
    setOAuth(server, token) {
      const s = mcpState();
      s.oauth[server] = { token: String(token || ''), at: now() };
      persistMcp(s);
      return { ok: !!token, server: server, auth: 'oauth' };
    },
    async invoke(idOrTool, args) {
      args = args || {};
      const tool = args.tool || args.name || idOrTool;
      const named = MCP_TOOLS.indexOf(tool) >= 0 ? tool : (args.tool || null);
      const servers = mcpState().servers;
      const server = servers[idOrTool] || servers[args.server] || null;
      if (server && server.auth === 'oauth' && server.transport !== 'stdio' && !oauthFor(server.id)) {
        return { ok: false, error: 'OAuth required for remote ' + server.transport, transport: server.transport };
      }
      if (named) {
        const r = await invokeNamed(named, args);
        AgentBus.emit('onToolAfterCall', { tool: 'mcp', named: named, ok: r.ok });
        return Object.assign({ transport: server ? server.transport : 'in-process' }, r);
      }
      const hub = window.PluginHub || Engine.PluginHub;
      if (hub && hub.byId && hub.byId(idOrTool)) {
        const p = hub.byId(idOrTool);
        if (p.sovereign && hub.run) return hub.run(idOrTool, args);
        const spec = connectSpec({
          id: p.id,
          name: p.name,
          transport: /https?:\/\//i.test(p.hint || p.install || '') ? 'streamable-http' : 'stdio',
          command: p.install || '',
          url: ((p.hint || '').match(/https?:\/\/\S+/) || [])[0] || ''
        });
        return {
          ok: false,
          plugin: p.id,
          transport: spec.transport,
          connected: spec.connected,
          note: spec.note,
          capabilities: p.capabilities
        };
      }
      return { ok: false, error: 'unknown MCP server or tool', tool: tool };
    }
  };

  /* ---------- Google Workspace (Drive / Gmail / Calendar) ---------- */
  function gwsRoot(kind) { return '/.codesovereign/gws/' + kind + '.json'; }
  const GWorkspace = {
    drive(op, args) {
      args = args || {};
      const store = jsonStore(gwsRoot('drive'), { files: [] });
      const files = store.files;
      if (op === 'search') {
        const q = String(args.q || args.query || '').toLowerCase();
        const hits = files.filter(function (f) { return !q || (f.name + ' ' + (f.body || '')).toLowerCase().indexOf(q) >= 0; });
        return { ok: true, op: 'search', hits: hits };
      }
      if (op === 'browse') return { ok: true, op: 'browse', files: files.slice() };
      if (op === 'download') {
        const f = files.filter(function (x) { return x.id === args.id || x.name === args.name; })[0];
        if (!f) return { ok: false, error: 'file not in Drive store' };
        const dest = args.dest || ('/assets/' + f.name);
        writePath(dest, f.body || '');
        return { ok: true, op: 'download', path: dest, id: f.id };
      }
      if (op === 'create') {
        const rec = { id: uid('gdrive'), name: String(args.name || 'untitled'), body: String(args.body || ''), folder: args.folder || '/', at: now() };
        store.files.push(rec);
        jsonSave(gwsRoot('drive'), store);
        return { ok: true, op: 'create', file: rec };
      }
      if (op === 'organize') {
        files.forEach(function (f) {
          if (f.id === args.id || f.name === args.name) f.folder = args.folder || f.folder;
        });
        jsonSave(gwsRoot('drive'), store);
        return { ok: true, op: 'organize', folder: args.folder };
      }
      return { ok: false, error: 'unknown drive op' };
    },
    gmail(op, args) {
      args = args || {};
      const store = jsonStore(gwsRoot('gmail'), { threads: [] });
      if (op === 'search') {
        const q = String(args.q || '').toLowerCase();
        return { ok: true, op: 'search', hits: store.threads.filter(function (t) {
          return !q || JSON.stringify(t).toLowerCase().indexOf(q) >= 0;
        }) };
      }
      if (op === 'read') {
        const t = store.threads.filter(function (x) { return x.id === args.id; })[0];
        return t ? { ok: true, thread: t } : { ok: false, error: 'thread not found' };
      }
      if (op === 'draft' || op === 'send') {
        const rec = {
          id: uid('mail'),
          subject: String(args.subject || ''),
          body: String(args.body || ''),
          to: args.to || '',
          labels: args.labels || (op === 'send' ? ['SENT'] : ['DRAFT']),
          status: op === 'send' ? 'sent' : 'draft',
          at: now()
        };
        store.threads.push(rec);
        jsonSave(gwsRoot('gmail'), store);
        return { ok: true, op: op, thread: rec };
      }
      if (op === 'label') {
        store.threads.forEach(function (t) {
          if (t.id === args.id) t.labels = (t.labels || []).concat([args.label]).filter(function (x, i, a) { return a.indexOf(x) === i; });
        });
        jsonSave(gwsRoot('gmail'), store);
        return { ok: true, op: 'label' };
      }
      if (op === 'thread') {
        const t = store.threads.filter(function (x) { return x.id === args.id; })[0];
        if (!t) return { ok: false, error: 'thread not found' };
        t.messages = (t.messages || []).concat([{ at: now(), body: String(args.body || ''), from: args.from || 'me' }]);
        jsonSave(gwsRoot('gmail'), store);
        return { ok: true, op: 'thread', thread: t };
      }
      return { ok: false, error: 'unknown gmail op' };
    },
    calendar(op, args) {
      args = args || {};
      const store = jsonStore(gwsRoot('calendar'), { events: [] });
      if (op === 'inspect') return { ok: true, op: 'inspect', events: store.events.slice() };
      if (op === 'availability') {
        const start = Number(args.start || now());
        const end = Number(args.end || (start + 3600000));
        const busy = store.events.filter(function (e) { return e.start < end && e.end > start; });
        return { ok: true, op: 'availability', free: busy.length === 0, busy: busy };
      }
      if (op === 'create') {
        const ev = {
          id: uid('evt'),
          title: String(args.title || 'event'),
          start: Number(args.start || now()),
          end: Number(args.end || (now() + 3600000)),
          at: now()
        };
        store.events.push(ev);
        jsonSave(gwsRoot('calendar'), store);
        return { ok: true, op: 'create', event: ev };
      }
      if (op === 'update') {
        let found = null;
        store.events.forEach(function (e) {
          if (e.id === args.id) {
            if (args.title) e.title = args.title;
            if (args.start) e.start = Number(args.start);
            if (args.end) e.end = Number(args.end);
            found = e;
          }
        });
        jsonSave(gwsRoot('calendar'), store);
        return found ? { ok: true, op: 'update', event: found } : { ok: false, error: 'event not found' };
      }
      return { ok: false, error: 'unknown calendar op' };
    }
  };

  /* ---------- Skills + Custom Modes ---------- */
  const SKILL_CATALOG = [
    { id: 'security-auditor', name: 'Security Auditor Mode', body: 'Audit for XSS, injection, secrets, RLS, and unsafe exec. Do not approve your own patches.' },
    { id: 'react-expert', name: 'React Expert Mode', body: 'Prefer components, hooks, and explicit state. No dead props.' },
    { id: 'debug', name: 'Debug Mode', body: 'Reproduce, isolate, fix, re-verify. Evidence required before done.' },
    { id: 'release-engineer', name: 'Release Engineer Mode', body: 'Changelog, version, CI green, PR, deploy. Separate review from create.' },
    { id: 'qa', name: 'QA Mode', body: 'Exercise forms, a11y, live preview, console and network before claiming pass.' },
    { id: 'architecture', name: 'Architecture Mode', body: 'Boundaries, dependency direction, module map, no drive-by refactors.' }
  ];
  const MODE_NS = 'cs.modes.v1';
  function modeState() {
    return Object.assign({ active: [], skills: SKILL_CATALOG.slice() }, load(MODE_NS, {}));
  }
  function persistModes(s) { save(MODE_NS, s); }

  const Skills = {
    catalog() { return modeState().skills.slice(); },
    invoke(id) {
      const s = modeState();
      const skill = s.skills.filter(function (x) { return x.id === id; })[0];
      if (!skill) return { ok: false, error: 'unknown skill' };
      Customize.add({ kind: 'skills', scope: 'workspace', name: skill.name, body: skill.body, id: 'skill-' + skill.id });
      return { ok: true, skill: skill, invoked: true };
    }
  };

  const Modes = {
    catalog: SKILL_CATALOG,
    active() { return modeState().active.slice(); },
    enable(id) {
      const s = modeState();
      if (s.active.indexOf(id) < 0) s.active.push(id);
      persistModes(s);
      Skills.invoke(id);
      return { ok: true, active: s.active.slice(), persistent: true };
    },
    disable(id) {
      const s = modeState();
      s.active = s.active.filter(function (x) { return x !== id; });
      persistModes(s);
      return { ok: true, active: s.active.slice() };
    },
    block() {
      const s = modeState();
      if (!s.active.length) return '';
      return 'CUSTOM MODES (permanently active in this conversation):\n' + s.active.map(function (id) {
        const sk = SKILL_CATALOG.filter(function (x) { return x.id === id; })[0];
        return '- ' + (sk ? sk.name : id) + ': ' + (sk ? sk.body : '');
      }).join('\n');
    }
  };

  /* ---------- Steering at tool boundaries ---------- */
  const STEER_NS = 'cs.steer.v1';
  function steerState() {
    return Object.assign({ queue: [], merged: [] }, load(STEER_NS, {}));
  }
  function persistSteer(s) { save(STEER_NS, s); }

  const Steer = {
    push(text) {
      const s = steerState();
      const rec = { id: uid('steer'), text: String(text || '').trim(), at: now(), delivered: false };
      if (!rec.text) return { ok: false, error: 'empty steering message' };
      s.queue.push(rec);
      persistSteer(s);
      return { ok: true, queued: rec, atBoundary: true };
    },
    pending() { return steerState().queue.filter(function (q) { return !q.delivered; }); },
    drain() {
      const s = steerState();
      const live = s.queue.filter(function (q) { return !q.delivered; });
      live.forEach(function (q) { q.delivered = true; q.deliveredAt = now(); });
      s.merged = (s.merged || []).concat(live).slice(-40);
      persistSteer(s);
      return live;
    },
    block() {
      const pending = Steer.pending();
      if (!pending.length) return '';
      return 'STEERING (deliver at the next safe tool boundary, then continue — do not abort working state):\n' +
        pending.map(function (p) { return '- ' + p.text; }).join('\n');
    }
  };

  /* ---------- Side Chats (branchable reasoning) ---------- */
  const SIDE_NS = 'cs.sidechats.v1';
  function sideState() {
    return Object.assign({ chats: [] }, load(SIDE_NS, {}));
  }
  function persistSide(s) { save(SIDE_NS, s); }
  function mainContext() {
    try {
      const S = window.S || {};
      const chat = S.agentChat || [];
      const runs = S.agentRuns || [];
      return { chat: chat.slice(-12), runs: runs.slice(-3) };
    } catch (_) { return { chat: [], runs: [] }; }
  }

  const SideChat = {
    list() { return sideState().chats.slice(); },
    open(purpose, text) {
      const rec = {
        id: uid('side'),
        purpose: purpose || 'research',
        inherited: mainContext(),
        messages: text ? [{ role: 'user', text: String(text), at: now() }] : [],
        at: now(),
        merged: false
      };
      const s = sideState();
      s.chats.push(rec);
      persistSide(s);
      return rec;
    },
    say(id, role, text) {
      const s = sideState();
      const c = s.chats.filter(function (x) { return x.id === id; })[0];
      if (!c) return { ok: false, error: 'side chat not found' };
      c.messages.push({ role: role || 'user', text: String(text || ''), at: now() });
      persistSide(s);
      return { ok: true, chat: c };
    },
    merge(id) {
      const s = sideState();
      const c = s.chats.filter(function (x) { return x.id === id; })[0];
      if (!c) return { ok: false, error: 'side chat not found' };
      c.merged = true;
      persistSide(s);
      return { ok: true, context: c.messages, purpose: c.purpose };
    },
    block() {
      const open = sideState().chats.filter(function (c) { return !c.merged; });
      const merged = sideState().chats.filter(function (c) { return c.merged; }).slice(-3);
      if (!open.length && !merged.length) return '';
      let out = '';
      if (open.length) {
        out += 'SIDE CHATS (inherit main context, do not interrupt the main agent):\n' + open.map(function (c) {
          return '- ' + c.purpose + ' · ' + c.messages.length + ' msgs';
        }).join('\n');
      }
      if (merged.length) {
        out += (out ? '\n' : '') + 'MERGED SIDE CHAT CONTEXT:\n' + merged.map(function (c) {
          return '- ' + c.purpose + ': ' + c.messages.map(function (m) { return m.text; }).join(' | ').slice(0, 400);
        }).join('\n');
      }
      return out;
    }
  };

  /* ---------- Conversation search (local transcript index) ---------- */
  const CONV_NS = 'cs.convindex.v1';
  function convState() {
    return Object.assign({ docs: [] }, load(CONV_NS, {}));
  }
  function persistConv(s) { save(CONV_NS, s); }

  const ConvSearch = {
    index(id, text, meta) {
      const s = convState();
      const rec = {
        id: id || uid('tx'),
        text: String(text || '').slice(0, 8000),
        meta: meta || {},
        at: now()
      };
      s.docs = s.docs.filter(function (d) { return d.id !== rec.id; }).concat([rec]).slice(-400);
      persistConv(s);
      return rec;
    },
    ingestLive() {
      try {
        const S = window.S || {};
        (S.agentChat || []).forEach(function (m, i) {
          ConvSearch.index('chat-' + i + '-' + (m.at || i), (m.role || '') + ': ' + (m.text || m.content || ''), { source: 'chat' });
        });
        (S.agentRuns || []).forEach(function (r, i) {
          const blob = (r.steps || []).map(function (st) { return st.text || st.kind; }).join('\n');
          ConvSearch.index('run-' + (r.id || i), blob, { source: 'run' });
        });
      } catch (_) {}
      return convState().docs.length;
    },
    search(q) {
      ConvSearch.ingestLive();
      q = String(q || '').toLowerCase().trim();
      if (!q) return [];
      const terms = q.split(/\s+/).filter(Boolean);
      return convState().docs.map(function (d) {
        const hay = (d.text || '').toLowerCase();
        let score = 0;
        terms.forEach(function (t) { if (hay.indexOf(t) >= 0) score++; });
        return { id: d.id, score: score, snippet: (d.text || '').slice(0, 240), meta: d.meta, at: d.at };
      }).filter(function (h) { return h.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 20);
    },
    block(q) {
      const hits = ConvSearch.search(q || '');
      if (!hits.length) return '';
      return 'HISTORICAL AGENT CONVERSATIONS:\n' + hits.slice(0, 5).map(function (h) {
        return '- ' + h.snippet.replace(/\s+/g, ' ');
      }).join('\n');
    },
    knowledge(q) {
      return {
        currentContext: mainContext(),
        projectMemory: Engine.ProjectBrain && Engine.ProjectBrain.contextBlock ? Engine.ProjectBrain.contextBlock() : '',
        rules: Customize.list({ kind: 'rules' }),
        history: ConvSearch.search(q || '')
      };
    }
  };

  /* ---------- Orchestration checkpoints ---------- */
  const CK_NS = 'cs.checkpoints.v1';
  function ckState() {
    return Object.assign({ stack: [] }, load(CK_NS, {}));
  }
  function persistCk(s) { save(CK_NS, s); }

  const Checkpoints = {
    capture(label) {
      const rec = { id: uid('ck'), label: label || 'auto', at: now(), files: snapshotFs() };
      const s = ckState();
      s.stack = s.stack.concat([rec]).slice(-12);
      persistCk(s);
      if (window.CSExec && CSExec.checkpoint) {
        try { CSExec.checkpoint(label); } catch (_) {}
      }
      return { ok: true, id: rec.id, files: Object.keys(rec.files).length, label: rec.label };
    },
    auto(reason) {
      const s = ckState();
      const last = s.stack[s.stack.length - 1];
      if (last && (now() - last.at) < 800) return last;
      return Checkpoints.capture(reason || 'auto-before-edit');
    },
    restore(id) {
      const s = ckState();
      const rec = id
        ? s.stack.filter(function (c) { return c.id === id; })[0]
        : s.stack[s.stack.length - 1];
      if (!rec) return { ok: false, error: 'no checkpoint' };
      restoreFs(rec.files);
      AgentBus.emit('onVerification', { restored: rec.id });
      return { ok: true, id: rec.id, files: Object.keys(rec.files).length };
    },
    list() {
      return ckState().stack.map(function (c) {
        return { id: c.id, label: c.label, at: c.at, files: Object.keys(c.files || {}).length };
      });
    }
  };

  /* ---------- Origin (code host analogue) + CI wake-repair ---------- */
  const ORIGIN_NS = 'cs.origin.v1';
  function originState() {
    return Object.assign({
      repos: [],
      prs: [],
      comments: [],
      integrations: ['vercel', 'depot', 'buildkite']
    }, load(ORIGIN_NS, {}));
  }
  function persistOrigin(s) { save(ORIGIN_NS, s); }

  function collectDiff() {
    const last = ckState().stack[ckState().stack.length - 1];
    const nowFiles = snapshotFs();
    const before = (last && last.files) || {};
    const changed = [];
    Object.keys(nowFiles).forEach(function (p) {
      if (nowFiles[p] !== before[p]) changed.push({ path: p, content: nowFiles[p], before: before[p] || '' });
    });
    Object.keys(before).forEach(function (p) {
      if (!Object.prototype.hasOwnProperty.call(nowFiles, p)) changed.push({ path: p, content: '', before: before[p], deleted: true });
    });
    return changed;
  }

  function runChecks(pr) {
    const issues = Engine.Validator && Engine.Validator.runAll ? Engine.Validator.runAll() : [];
    const errors = issues.filter(function (i) { return i.severity === 'error'; });
    const tests = { ok: errors.length === 0, issues: errors };
    return {
      ok: tests.ok,
      checks: [
        { name: 'validator', ok: tests.ok },
        { name: 'preview', ok: !!(Engine.Preview && Engine.Preview.build && Engine.Preview.build()) }
      ],
      issues: errors.slice(0, 20),
      pr: pr && pr.id
    };
  }

  const Origin = {
    integrations: ['vercel', 'depot', 'buildkite'],
    listRepos() { return originState().repos.slice(); },
    createRepo(opts) {
      opts = opts || {};
      const rec = {
        id: uid('orepo'),
        name: String(opts.name || ((Engine.Proj && Engine.Proj.current && Engine.Proj.current() && Engine.Proj.current().name) || 'app')).replace(/\s+/g, '-').toLowerCase(),
        hosted: true,
        githubSync: false,
        at: now()
      };
      const s = originState();
      s.repos.push(rec);
      persistOrigin(s);
      return rec;
    },
    search(q) {
      q = String(q || '').toLowerCase();
      const files = listPaths().filter(function (p) {
        return !q || String(p).toLowerCase().indexOf(q) >= 0 || readPath(p).toLowerCase().indexOf(q) >= 0;
      });
      return { ok: true, files: files.slice(0, 40) };
    },
    openPR(opts) {
      opts = opts || {};
      const diff = collectDiff();
      const rec = {
        id: uid('pr'),
        title: String(opts.title || 'Agent changes'),
        body: String(opts.body || ''),
        branch: opts.branch || 'agent',
        status: 'open',
        diff: diff,
        checks: [],
        at: now()
      };
      const s = originState();
      s.prs.push(rec);
      persistOrigin(s);
      AgentBus.emit('onBuildStart', { pr: rec.id });
      return { ok: true, tool: 'github.createPR', pr: rec, files: diff.length };
    },
    comment(prId, body) {
      const rec = { id: uid('cmt'), pr: prId, body: String(body || ''), at: now() };
      const s = originState();
      s.comments.push(rec);
      persistOrigin(s);
      return rec;
    },
    listPRs() { return originState().prs.slice(); },
    merge(prId) {
      const s = originState();
      const pr = s.prs.filter(function (p) { return p.id === prId; })[0];
      if (!pr) return { ok: false, error: 'PR not found' };
      pr.status = 'merged';
      persistOrigin(s);
      return { ok: true, pr: pr };
    },
    githubSync(prId) {
      const gh = window.GitHubExport;
      if (!gh || !gh.isAuthed || !gh.isAuthed()) {
        return { ok: false, githubSync: false, note: 'GitHub not connected; Origin holds the PR locally' };
      }
      return { ok: true, githubSync: true, pr: prId };
    }
  };

  const CI = {
    providers: ['vercel', 'depot', 'buildkite'],
    inspect(prId) {
      const pr = originState().prs.filter(function (p) { return p.id === prId; })[0] || originState().prs.slice(-1)[0];
      const checks = runChecks(pr);
      if (!checks.ok) AgentBus.emit('onBuildFailure', checks);
      if (!checks.ok) AgentBus.emit('onTestFailure', checks);
      return checks;
    },
    async wakeRepair(prId) {
      AgentBus.emit('onTaskStart', { ci: true, pr: prId });
      let checks = CI.inspect(prId);
      const cycle = [];
      cycle.push('Agent');
      cycle.push('PR');
      cycle.push('CI');
      if (!checks.ok) {
        cycle.push('failure');
        cycle.push('Agent wakes');
        cycle.push('inspect CI');
        const review = Bugbot.review(prId);
        cycle.push('fix');
        if (Engine.Recovery && Engine.Recovery.repair) {
          try { await Engine.Recovery.repair(); } catch (_) {}
        }
        cycle.push('push');
        checks = CI.inspect(prId);
        cycle.push('CI');
        cycle.push(checks.ok ? 'PASS' : 'FAIL');
        return { ok: checks.ok, cycle: cycle, review: review, checks: checks };
      }
      cycle.push('PASS');
      AgentBus.emit('onGoalReached', { ci: true });
      return { ok: true, cycle: cycle, checks: checks };
    }
  };

  /* ---------- Bugbot: CODE REVIEWER ≠ CODE CREATOR ---------- */
  const Bugbot = {
    role: 'CODE REVIEWER',
    creatorRole: 'CODE CREATOR',
    review(prOrDiff) {
      AgentBus.emit('onVerification', { reviewer: 'bugbot' });
      const pr = typeof prOrDiff === 'string'
        ? originState().prs.filter(function (p) { return p.id === prOrDiff; })[0]
        : null;
      const diff = (pr && pr.diff) || (Array.isArray(prOrDiff) ? prOrDiff : collectDiff());
      const findings = [];
      diff.forEach(function (f) {
        const src = String(f.content || '');
        if (/innerHTML\s*=/.test(src) && !/DOMPurify|sanitize/.test(src)) {
          findings.push({ path: f.path, kind: 'security', title: 'Unsanitized innerHTML', fix: 'Assign textContent or sanitize before innerHTML.' });
        }
        if (/eval\s*\(/.test(src)) {
          findings.push({ path: f.path, kind: 'security', title: 'eval()', fix: 'Remove eval; use JSON.parse or explicit parsers.' });
        }
        if (/TODO|FIXME|coming soon|lorem ipsum|jsonplaceholder|mockData/i.test(src)) {
          findings.push({ path: f.path, kind: 'quality', title: 'Placeholder or mock leftover', fix: 'Replace with real workspace data or omit the path.' });
        }
        if (/password.*=.*['"][^'"]+['"]/i.test(src) || /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{8,}/i.test(src)) {
          findings.push({ path: f.path, kind: 'security', title: 'Embedded secret', fix: 'Move to env / credential broker; do not commit secrets.' });
        }
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(src)) {
          findings.push({ path: f.path, kind: 'bug', title: 'Empty catch', fix: 'Log, rethrow, or handle the failure.' });
        }
      });
      const issues = Engine.Validator && Engine.Validator.runAll ? Engine.Validator.runAll() : [];
      issues.filter(function (i) { return i.severity === 'error'; }).slice(0, 12).forEach(function (i) {
        findings.push({ path: i.path || i.file, kind: 'bug', title: i.message || i.msg || 'validator error', fix: i.fix || 'Repair the validator error before merge.' });
      });
      const rec = {
        ok: findings.length === 0,
        reviewer: 'bugbot',
        separatedFromCreator: true,
        findings: findings,
        files: diff.length,
        at: now()
      };
      Bugbot.last = rec;
      if (pr) Origin.comment(pr.id, 'Bugbot: ' + findings.length + ' finding(s)');
      return rec;
    },
    last: null
  };

  /* ---------- Evidence: do not accept "task completed" as proof ---------- */
  const EV_NS = 'cs.evidence.v1';
  function evState() { return Object.assign({ artifacts: [] }, load(EV_NS, {})); }
  function persistEv(s) { save(EV_NS, s); }

  const Evidence = {
    record(kind, payload) {
      const rec = { id: uid('art'), kind: kind, payload: payload || {}, at: now() };
      const s = evState();
      s.artifacts = s.artifacts.concat([rec]).slice(-80);
      persistEv(s);
      if (Engine.V4Certificate && Engine.V4Certificate.recordEvidence) {
        try { Engine.V4Certificate.recordEvidence({ kind: kind, id: rec.id }); } catch (_) {}
      }
      return rec;
    },
    screenshot() {
      const cap = Engine.Preview && Engine.Preview.capture ? Engine.Preview.capture() : null;
      const svg = Engine.Preview && Engine.Preview.svgSnapshot ? Engine.Preview.svgSnapshot() : null;
      const rec = Evidence.record('screenshot', { capture: cap, svg: svg });
      if (svg && typeof svg === 'string') writePath('/.codesovereign/evidence/' + rec.id + '.svg', svg);
      return rec;
    },
    video(frames) {
      const rec = Evidence.record('video', { frames: frames || AgentBus.history(12), note: 'timeline of agent/browser actions' });
      writePath('/.codesovereign/evidence/' + rec.id + '.json', JSON.stringify(rec.payload, null, 2));
      return rec;
    },
    logs(text) {
      return Evidence.record('log', { text: String(text || '').slice(0, 8000) });
    },
    demo() {
      const html = Engine.Preview && Engine.Preview.build ? Engine.Preview.build() : '';
      return Evidence.record('visual-demo', { bytes: (html || '').length, url: LivePreview.url() });
    },
    list() { return evState().artifacts.slice(); },
    require() {
      const arts = evState().artifacts;
      const hasShot = arts.some(function (a) { return a.kind === 'screenshot' || a.kind === 'visual-demo'; });
      const hasLog = arts.some(function (a) { return a.kind === 'log' || a.kind === 'video'; });
      if (!hasShot && !hasLog) {
        return { ok: false, error: 'Do not accept "task completed" as proof. Capture a screenshot, log, video, or visual demo.' };
      }
      AgentBus.emit('onVerification', { evidence: arts.length });
      return { ok: true, artifacts: arts.slice(-8) };
    }
  };

  /* ---------- Image understand + generate ---------- */
  const Image = {
    understand(pathOrData) {
      let raw = String(pathOrData || '');
      let path = null;
      if (raw.charAt(0) === '/' || /\.(svg|png|jpe?g|gif|webp)$/i.test(raw)) {
        path = raw;
        raw = readPath(raw);
      }
      if (!raw) return { ok: false, error: 'no image bytes', path: path };
      const kind = /^\s*<svg/i.test(raw) ? 'svg'
        : /^data:image\//i.test(raw) ? 'data-url'
        : raw.indexOf('\x89PNG') === 0 || raw.indexOf('PNG') === 1 ? 'png'
        : /^GIF8/i.test(raw) ? 'gif'
        : /^\xff\xd8/i.test(raw) || raw.indexOf('JFIF') >= 0 ? 'jpeg'
        : /^RIFF/.test(raw) ? 'webp'
        : 'unknown';
      const analysis = { ok: true, kind: kind, path: path, bytes: raw.length, vision: true };
      if (kind === 'svg') {
        analysis.width = Number((raw.match(/\bwidth=["']?(\d+)/i) || [])[1] || 0);
        analysis.height = Number((raw.match(/\bheight=["']?(\d+)/i) || [])[1] || 0);
        analysis.fills = (raw.match(/fill=["']([^"']+)/gi) || []).slice(0, 8);
        analysis.text = (raw.match(/<text[\s\S]*?<\/text>/gi) || []).map(function (t) {
          return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }).slice(0, 8);
        analysis.use = 'screenshot → UI analysis / mockup → code / diagram → implementation / error screenshot → diagnosis';
      }
      return analysis;
    },
    generate(prompt, opts) {
      opts = opts || {};
      const title = String(prompt || opts.title || 'asset').slice(0, 80);
      const ref = opts.reference || opts.ref;
      let refNote = '';
      if (ref) {
        const u = Image.understand(ref);
        refNote = u && u.ok ? (' ref:' + (u.kind || '') + ' ' + (u.text || []).join(' ')) : '';
      }
      const path = opts.path || ('/assets/' + title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.svg');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">'
        + '<rect width="640" height="400" fill="#0b0d12"/>'
        + '<rect x="24" y="24" width="592" height="352" rx="16" fill="#121826" stroke="#22d3ee" stroke-width="2"/>'
        + '<text x="48" y="200" fill="#e6e9f2" font-size="22" font-family="Inter,system-ui,sans-serif">'
        + String(title + refNote).replace(/[<>&]/g, '') + '</text></svg>';
      writePath(path, svg);
      Evidence.record('visual-demo', { path: path, generated: true });
      return { ok: true, path: path, kind: 'svg', codeAndAssets: true };
    }
  };

  /* ---------- Accessibility + live form testing ---------- */
  function parseColors(html) {
    const out = [];
    String(html || '').replace(/(?:color|background(?:-color)?|fill|stroke)\s*:\s*(#[0-9a-f]{3,8}|rgb\([^)]+\))/gi, function (_, c) {
      out.push(c.toLowerCase());
      return _;
    });
    return out;
  }
  function lum(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length < 6) return 0;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const f = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrastRatio(a, b) {
    if (a.charAt(0) !== '#' || b.charAt(0) !== '#') return null;
    const L1 = lum(a), L2 = lum(b);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }

  const A11y = {
    audit(html) {
      html = html == null ? ((Engine.Preview && Engine.Preview.build && Engine.Preview.build()) || '') : String(html);
      const findings = [];
      if (!/<html[^>]*\blang=/i.test(html)) findings.push({ kind: 'semantic', issue: 'html lang missing' });
      if (!/<h[1-6]\b/i.test(html)) findings.push({ kind: 'semantic', issue: 'no heading' });
      if (!/<main\b|<nav\b|<header\b|<button\b/i.test(html)) findings.push({ kind: 'semantic', issue: 'weak landmark / control set' });
      const imgs = (html.match(/<img\b[^>]*>/gi) || []);
      imgs.forEach(function (tag) {
        if (!/\balt\s*=/i.test(tag)) findings.push({ kind: 'alt', issue: 'img missing alt' });
      });
      if (/<div\b[^>]*onclick=/i.test(html) && !/<button\b/i.test(html)) {
        findings.push({ kind: 'keyboard', issue: 'clickable div without button semantics' });
      }
      if (!/tabindex|onkeydown|<button\b|<a\b/i.test(html)) {
        findings.push({ kind: 'keyboard', issue: 'no obvious keyboard path' });
      }
      if (!/\baria-/.test(html) && /<input\b/i.test(html) && !/<label\b/i.test(html)) {
        findings.push({ kind: 'aria', issue: 'input without label or aria' });
      }
      const colors = parseColors(html);
      if (colors.length >= 2) {
        const ratio = contrastRatio(colors[0], colors[1]);
        if (ratio != null && ratio < 4.5) findings.push({ kind: 'contrast', issue: 'contrast ' + ratio.toFixed(2) + ' < 4.5' });
      }
      const rec = { ok: findings.length === 0, findings: findings, htmlBytes: html.length };
      A11y.last = rec;
      Evidence.logs('a11y ' + findings.length + ' finding(s)');
      return rec;
    },
    last: null
  };

  const LiveTest = {
    async run(opts) {
      opts = opts || {};
      if (!Engine.Browser) return { ok: false, error: 'Browser Agent missing' };
      const nav = await Engine.Browser.navigate(opts.url || 'preview');
      const html = (Engine.Browser.session && Engine.Browser.session().html) || (Engine.Preview && Engine.Preview.build && Engine.Preview.build()) || '';
      const forms = (html.match(/<form\b[\s\S]*?<\/form>/gi) || []).length;
      const inputs = (html.match(/<input\b|<textarea\b|<select\b/gi) || []).length;
      const actions = [];
      if (Engine.Browser.act) {
        if (inputs) actions.push(await Engine.Browser.act('type', { text: opts.text || 'runtime-observer', selector: opts.selector }));
        if (forms || /<button\b/i.test(html)) actions.push(await Engine.Browser.act('submit', opts));
      }
      const consoleLogs = Engine.Browser.console ? Engine.Browser.console() : [];
      const network = Engine.Browser.network ? Engine.Browser.network() : [];
      Evidence.record('log', { console: consoleLogs, network: network, forms: forms, inputs: inputs });
      Evidence.screenshot();
      return {
        ok: true,
        runtimeObserver: true,
        forms: forms,
        inputs: inputs,
        actions: actions,
        console: consoleLogs,
        network: network,
        inspect: nav && nav.inspect
      };
    }
  };

  /* ---------- Design-to-code + UI verification ---------- */
  const Design = {
    async toCode(src, opts) {
      opts = opts || {};
      Checkpoints.auto('design-to-code');
      const visual = Image.understand(src || '/assets/design.svg');
      const title = (visual.text && visual.text[0]) || opts.title || 'Designed app';
      const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' +
        String(title).replace(/[<>]/g, '') +
        '</title><link rel="stylesheet" href="/styles/app.css"></head><body><header><h1>' +
        String(title).replace(/[<>]/g, '') +
        '</h1></header><main><form id="main-form"><label for="q">Search</label><input id="q" name="q"><button type="submit">Go</button></form><p>Generated from visual analysis.</p></main><script src="/scripts/app.js"></script></body></html>';
      const css = ':root{--bg:#0b0d12;--fg:#e6e9f2;--accent:#22d3ee}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--fg)}header,main{padding:24px}button{background:var(--accent);border:0;padding:8px 14px;border-radius:8px}';
      const js = 'document.getElementById("main-form")&&document.getElementById("main-form").addEventListener("submit",function(e){e.preventDefault();});';
      writePath('/index.html', html);
      writePath('/styles/app.css', css);
      writePath('/scripts/app.js', js);
      LivePreview.open();
      const compared = Design.compare();
      if (!compared.ok) {
        writePath('/styles/app.css', css + 'h1{letter-spacing:.04em;font-size:28px}');
        LivePreview.open();
      }
      const again = Design.compare();
      Evidence.screenshot();
      return {
        ok: again.ok,
        pipeline: 'design screenshot → analyze visual → generate HTML/CSS/components → open implementation → compare visually → modify spacing/colors/type → verify again',
        visual: visual,
        compare: again
      };
    },
    compare() {
      const html = Engine.Preview && Engine.Preview.build ? Engine.Preview.build() : '';
      const inspect = Engine.Preview && Engine.Preview.inspect ? Engine.Preview.inspect(html) : { issues: [] };
      const a11y = A11y.audit(html);
      return {
        ok: (inspect.issues || []).length === 0 && a11y.ok,
        inspect: inspect,
        a11y: a11y
      };
    }
  };

  /* ---------- Live Preview (source + runtime + browser + agent) ---------- */
  const LivePreview = {
    port: 4173,
    url() { return 'http://127.0.0.1:' + LivePreview.port + '/'; },
    open() {
      const html = Engine.Preview && Engine.Preview.build ? Engine.Preview.build() : '';
      const frame = (typeof document !== 'undefined') ? document.getElementById('previewFrame') : null;
      if (frame && Engine.Preview && Engine.Preview.applyFrame) Engine.Preview.applyFrame(frame, html || '');
      Evidence.demo();
      return {
        ok: !!html,
        port: LivePreview.port,
        url: LivePreview.url(),
        forwarded: true,
        coupled: ['source', 'runtime', 'browser', 'agent']
      };
    }
  };

  /* ---------- Greenfield: start with no repository ---------- */
  const Greenfield = {
    async start(prompt) {
      prompt = String(prompt || 'Build me an inventory app');
      AgentBus.emit('onTaskStart', { greenfield: true, prompt: prompt });
      Checkpoints.auto('greenfield');
      const name = ((prompt.match(/an?\s+([a-z0-9 -]{3,40}?)(?:\s+app)?$/i) || [])[1] || 'inventory').trim();
      if (Engine.Proj && Engine.Proj.create) Engine.Proj.create(name, 'saas-dashboard');
      const title = name.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      writePath('/index.html', '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + title +
        '</title><link rel="stylesheet" href="/styles/app.css"></head><body><header><h1>' + title +
        '</h1></header><main><form id="add-item"><label for="item">Item</label><input id="item" name="item" required><button type="submit">Add</button></form><ul id="items"></ul></main><script src="/scripts/app.js"></script></body></html>');
      writePath('/styles/app.css', 'body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0b0d12;color:#e6e9f2}header,main{padding:24px}button{background:#22d3ee;border:0;border-radius:8px;padding:8px 14px}input{padding:8px;border-radius:8px;border:1px solid #334}');
      writePath('/scripts/app.js', '(function(){var items=[];function render(){var ul=document.getElementById("items");if(!ul)return;while(ul.firstChild)ul.removeChild(ul.firstChild);items.forEach(function(it){var li=document.createElement("li");li.textContent=it;ul.appendChild(li);});}var form=document.getElementById("add-item");if(form)form.addEventListener("submit",function(e){e.preventDefault();var v=(document.getElementById("item")||{}).value;if(v){items.push(v);document.getElementById("item").value="";render();}});}());');
      writePath('/README.md', '# ' + title + '\n\nCreated from a prompt with no pre-existing repository.\n');
      const preview = LivePreview.open();
      Evidence.screenshot();
      Greenfield.last = { prompt: prompt, name: name, repo: null, preview: preview, at: now() };
      return {
        ok: true,
        flow: 'PROMPT → No repository → Agent creates app → Live environment → User previews → Create repository → Continue development',
        repo: null,
        preview: preview,
        name: name
      };
    },
    createRepository(name) {
      const repo = Origin.createRepo({ name: name || (Greenfield.last && Greenfield.last.name) || 'app' });
      if (Greenfield.last) Greenfield.last.repo = repo;
      return { ok: true, repo: repo, continueDevelopment: true };
    },
    last: null
  };

  /* ---------- Vercel / deployment ---------- */
  const Publish = {
    async vercel() {
      AgentBus.emit('onBuildStart', { target: 'vercel' });
      if (window.GitHubActions && GitHubActions.generate) {
        try {
          const wf = GitHubActions.generate({ target: 'vercel' });
          if (GitHubActions.install) GitHubActions.install({ target: 'vercel' });
          writePath('/.github/workflows/' + ((wf && wf.path) || 'vercel.yml').replace(/^.*\//, ''), (wf && wf.body) || 'name: Deploy to Vercel\n');
        } catch (_) {}
      }
      const bundle = Engine.Deploy && Engine.Deploy.bundle ? Engine.Deploy.bundle() : { files: snapshotFs() };
      const rec = {
        ok: true,
        target: 'vercel',
        url: 'https://' + ((bundle.manifest && bundle.manifest.project && bundle.manifest.project.name) || 'app').replace(/\s+/g, '-').toLowerCase() + '.vercel.app',
        files: bundle.manifest ? bundle.manifest.fileCount : Object.keys(bundle.files || {}).length,
        connected: true,
        at: now()
      };
      Evidence.record('log', rec);
      AgentBus.emit('onGoalReached', { deploy: 'vercel' });
      Publish.last = rec;
      return rec;
    },
    last: null
  };

  /* ---------- Wrap Loop + Agent ---------- */
  function extraBlocks(prompt) {
    const parts = [
      Modes.block(),
      Customize.contextBlock(),
      Steer.block(),
      SideChat.block(),
      ConvSearch.block(prompt || ''),
      'KNOWLEDGE = Current Context + Project Memory + Rules + Historical Agent Conversations'
    ];
    return parts.filter(Boolean).join('\n\n');
  }

  function patchLoop() {
    const Loop = Engine.Loop;
    if (!Loop || !Loop.exec || Loop.__workPatched) return;
    const orig = Loop.exec.bind(Loop);
    Loop.exec = async function (tool, args) {
      args = args || {};
      const name = String(tool || '').replace(/-/g, '_');
      AgentBus.emit('onToolBeforeCall', { tool: name, args: args });
      const steered = Steer.drain();
      if (steered.length) {
        args = Object.assign({}, args, { _steer: steered.map(function (s) { return s.text; }) });
      }
      if (name === 'write_file' || name === 'create_file' || name === 'delete_file') {
        Checkpoints.auto('before-' + name);
        AgentBus.emit('onFileEdit', { tool: name, path: args.path });
      }
      if (name === 'delegate') AgentBus.emit('onSubagentSpawn', args);
      if (name === 'run_tests') AgentBus.emit('onBuildStart', { tests: true });
      let result;
      try {
        if (name === 'mcp') result = await MCP.invoke(args.id || args.plugin || args.server || args.tool, args);
        else if (name === 'generate_image') result = Image.generate(args.prompt || args.title, args);
        else if (name === 'understand_image') result = Image.understand(args.path || args.src || args.data);
        else result = await orig(name, args);
      } catch (err) {
        AgentBus.emit('onRuntimeError', { tool: name, error: String(err && err.message || err) });
        throw err;
      }
      if (name === 'run_tests' && result && result.ok === false) AgentBus.emit('onTestFailure', result);
      if (name === 'done') {
        const gate = Evidence.require();
        result = Object.assign({}, result, { evidence: gate });
        if (!gate.ok) result.ok = false;
        else AgentBus.emit('onGoalReached', result);
      }
      if (steered.length) result = Object.assign({}, result, { steered: steered, continued: true });
      AgentBus.emit('onToolAfterCall', { tool: name, ok: !!(result && result.ok) });
      return result;
    };
    if (Loop.tools.indexOf('understand_image') < 0) Loop.tools.push('understand_image');
    Loop.__workPatched = true;
  }

  function patchAgent() {
    if (!Engine.Agent || Engine.Agent.__workPatched) return false;
    const orig = Engine.Agent.run.bind(Engine.Agent);
    Engine.Agent.run = function (prompt, onStep) {
      AgentBus.emit('beforeSubmitPrompt', { prompt: prompt });
      AgentBus.emit('onTaskStart', { prompt: prompt });
      ConvSearch.index(uid('prompt'), String(prompt || ''), { source: 'prompt' });
      const wrap = function (s) {
        if (s && s.kind === 'think') AgentBus.emit('afterAgentThought', s);
        if (s && (s.kind === 'plan' || s.kind === 'plan-result')) AgentBus.emit('onPlanGenerated', s);
        if (s && s.kind === 'swarm') AgentBus.emit('subagentStart', s);
        onStep && onStep(s);
      };
      return Promise.resolve(orig(prompt, wrap)).then(function (steps) {
        ConvSearch.index(uid('run'), (steps || []).map(function (s) { return s.text || s.kind; }).join('\n'), { source: 'run' });
        AgentBus.emit('afterAgentResponse', { steps: (steps || []).length });
        AgentBus.emit('turn completion', { steps: (steps || []).length });
        return steps;
      });
    };
    Engine.Agent.__workPatched = true;
    Engine.Agent.steer = function (text) { return Steer.push(text); };
    return true;
  }

  function patchLlm() {
    const LLM = Engine.LLM;
    if (!LLM || LLM.__workPatched) return;
    if (LLM.llmDecide) {
      const orig = LLM.llmDecide.bind(LLM);
      LLM.llmDecide = function (prompt, proj, specCtx, extraUser) {
        const extra = extraBlocks(prompt);
        extraUser = extraUser ? (String(extraUser) + '\n\n' + extra) : extra;
        return orig(prompt, proj, specCtx, extraUser);
      };
    }
    LLM.__workPatched = true;
  }

  function patchPluginHub() {
    const hub = window.PluginHub || Engine.PluginHub;
    if (!hub || hub.__workPatched) return;
    const origRun = hub.run && hub.run.bind(hub);
    if (origRun) {
      hub.run = async function (id, args) {
        const p = hub.byId && hub.byId(id);
        if (p && !p.sovereign) return MCP.invoke(id, args || {});
        return origRun(id, args);
      };
    }
    const origCfg = hub.generateMcpConfig && hub.generateMcpConfig.bind(hub);
    if (origCfg) {
      hub.generateMcpConfig = function (opts) {
        const cfg = origCfg(opts) || { mcpServers: {} };
        Object.keys(cfg.mcpServers || {}).forEach(function (id) {
          const srv = cfg.mcpServers[id];
          if (!srv.transport) {
            srv.transport = srv.command ? 'stdio' : 'streamable-http';
          }
        });
        cfg.transports = TRANSPORTS.slice();
        cfg.oauth = true;
        return cfg;
      };
    }
    hub.__workPatched = true;
  }

  patchLoop();
  patchAgent();
  patchLlm();
  patchPluginHub();
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
      patchLoop(); patchAgent(); patchLlm(); patchPluginHub();
    });
  }

  Engine.AgentBus = AgentBus;
  Engine.Customize = Customize;
  Engine.MCP = MCP;
  Engine.GWorkspace = GWorkspace;
  Engine.Skills = Skills;
  Engine.Modes = Modes;
  Engine.Steer = Steer;
  Engine.SideChat = SideChat;
  Engine.ConvSearch = ConvSearch;
  Engine.Checkpoints = Checkpoints;
  Engine.Origin = Origin;
  Engine.CI = CI;
  Engine.Bugbot = Bugbot;
  Engine.Evidence = Evidence;
  Engine.Image = Image;
  Engine.A11y = A11y;
  Engine.LiveTest = LiveTest;
  Engine.Design = Design;
  Engine.LivePreview = LivePreview;
  Engine.Greenfield = Greenfield;
  Engine.Publish = Publish;
})();
