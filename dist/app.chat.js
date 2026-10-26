/* =====================================================================
 * app.chat.js  —  IDE agent chat panel
 *
 * A Claude-style conversation docked in the IDE's right column. It talks to
 * whatever model is connected through Engine.AI (Ollama, LM Studio, OmniRoute,
 * any OpenAI-compatible endpoint) and streams the reply token by token.
 *
 *   window.CSChat
 *     mount()            paint the panel into #csChatHost (idempotent; call
 *                        after every IDE render — state lives here, not in DOM)
 *     send(text)         send a user message, stream the reply
 *     applyToFile(p, c)  open code c as a reviewable change to file p
 *     stop()             abort the in-flight reply (the partial text is kept)
 *     newThread()        start a fresh conversation
 *     core               DOM-free pieces (renderMarkdown, buildMessages, store)
 *
 * It sees the open file and the project's file list. Phase 2 adds @mentions
 * (@/path, @selection, @problems, @file) shown as chips, and an Apply button on
 * code blocks that opens the change in the editor's per-hunk review. Agent mode
 * (phase 3, tools in app.chat.agent.js) lets the model read and search files and
 * run approved package jobs; its edits are only ever PROPOSALS, reviewed hunk
 * by hunk before anything is written.
 * ===================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'cs.chat.v1';
  var MODE_KEY = 'cs.chat.mode.v1';
  var MAX_THREADS = 20;
  var MAX_MSGS = 200;
  var FILE_CHARS = 12000;      // open-file context cap
  var HISTORY_CHARS = 24000;   // conversation context cap
  var FILE_LIST_MAX = 80;

  var SYSTEM_PROMPT =
    'You are the CodeSovereign IDE assistant, working inside the user\'s project.\n' +
    'Be direct and concrete. When you show code, use fenced code blocks with a language tag. ' +
    'Refer to files by their project path. If you are not sure of something in the user\'s code, ' +
    'say so rather than guessing. You cannot edit files yourself. When a change is needed, give the code in ' +
    'ONE fenced block per file and put the file path after the language, like ```js /src/app.js — the chat then ' +
    'shows an Apply button that opens the change for the user to review hunk by hunk. A block replaces the whole ' +
    'file, so include the complete updated file; for an @selection, the block replaces just that selection.';
  var ATTACH_FILE_CHARS = 12000;   // per attached file
  var ATTACH_TOTAL_CHARS = 40000;  // all attachments together
  var MAX_PROBLEMS = 40;

  function win() { return typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}); }

  /* ---------------------------------------------------------------- core */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Small, safe markdown: everything is HTML-escaped first, then fenced code,
  // inline code, bold, and bullet lists are re-introduced. No links, no images,
  // no raw HTML — model output is untrusted. opts.applyLabel(i) -> string|null
  // adds an Apply button to code block i (the target file's label).
  function renderMarkdown(src, opts) {
    opts = opts || {};
    var text = String(src == null ? '' : src).replace(/\r\n/g, '\n');
    var blocks = [];
    // fenced code (also an unterminated fence, which is normal mid-stream)
    text = text.replace(/```([\w+-]*)[^\n]*\n([\s\S]*?)(```|$)/g, function (_m, lang, code) {
      var i = blocks.push({ lang: lang || '', code: code.replace(/\n$/, '') }) - 1;
      return '\u0000B' + i + '\u0000';
    });
    var html = esc(text);
    html = html.replace(/`([^`\n]+)`/g, '<code class="csc-ic">$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    var out = [], list = false;
    html.split('\n').forEach(function (line) {
      var li = /^\s*[-*]\s+(.*)$/.exec(line);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + li[1] + '</li>'); return; }
      if (list) { out.push('</ul>'); list = false; }
      if (/^\u0000B\d+\u0000$/.test(line.trim())) { out.push(line.trim()); return; }
      out.push(line === '' ? '<div class="csc-gap"></div>' : '<div>' + line + '</div>');
    });
    if (list) out.push('</ul>');
    return out.join('').replace(/\u0000B(\d+)\u0000/g, function (_m, i) {
      var b = blocks[Number(i)];
      var label = opts.applyLabel ? opts.applyLabel(Number(i)) : null;
      var apply = label ? '<button type="button" class="csc-apply" data-cs-apply="' + i + '" title="Open this change for review in ' + esc(label) + '">Apply → ' + esc(label) + '</button>' : '';
      return '<div class="csc-code"><div class="csc-code-bar"><span>' + esc(b.lang || 'code') +
        '</span><span class="csc-code-act">' + apply + '<button type="button" data-cs-copy="' + i + '">Copy</button></span></div><pre><code>' + esc(b.code) + '</code></pre></div>';
    });
  }

  // Every fenced block with its info string and the prose just before it.
  function codeFences(src) {
    var text = String(src == null ? '' : src).replace(/\r\n/g, '\n');
    var out = [], re = /```([^\n]*)\n([\s\S]*?)(```|$)/g, last = 0, m;
    while ((m = re.exec(text))) {
      out.push({ info: m[1].trim(), code: m[2].replace(/\n$/, ''), before: text.slice(last, m.index) });
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    return out;
  }

  function normPath(p) {
    p = String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
    return p ? (p.charAt(0) === '/' ? p : '/' + p) : '';
  }
  var PATH_RE = /^\/?[\w.@-]+(?:\/[\w.@-]+)*\.[A-Za-z0-9]{1,8}$/;

  // Which file does code block `index` belong to? Looks for a path in the
  // fence's info string, then a backticked path in the prose before it, then
  // falls back to the open file. -> { path, exists, source } | null
  function applyTarget(src, index, files, activePath) {
    var f = codeFences(src)[index];
    if (!f) return null;
    var set = {}; (files || []).forEach(function (p) { set[p] = true; });
    var pick = function (tok, source) {
      var p = normPath(tok);
      return PATH_RE.test(p) ? { path: p, exists: !!set[p], source: source } : null;
    };
    var infoToks = f.info.split(/[\s:]+/).filter(Boolean).slice(1);        // drop the language
    for (var i = 0; i < infoToks.length; i++) { var a = pick(infoToks[i].replace(/^(?:title|file|path)=/, '').replace(/["']/g, ''), 'fence'); if (a) return a; }
    var ticks = f.before.slice(-300).match(/`([^`\s]+)`/g) || [];
    for (var j = ticks.length - 1; j >= 0; j--) {
      var b = pick(ticks[j].slice(1, -1), 'text');
      if (b && b.exists) return b;
    }
    return activePath ? { path: normPath(activePath), exists: !!set[normPath(activePath)], source: 'open' } : null;
  }

  // @mentions in a draft. A mention is @ at the start or after whitespace:
  //   @selection  @problems  @file (the open file)  @/src/a.js  @a.js
  // A bare filename resolves only when exactly one project file has it.
  // -> [{ token, kind: 'selection'|'problems'|'file'|'path', path?, start, end }]
  function parseMentions(text, files) {
    text = String(text == null ? '' : text);
    var set = {}, byBase = {};
    (files || []).forEach(function (p) {
      set[p] = true;
      var b = p.slice(p.lastIndexOf('/') + 1);
      (byBase[b] = byBase[b] || []).push(p);
    });
    var out = [], re = /(^|\s)@([\w./\\-]+)/g, m;
    while ((m = re.exec(text))) {
      var raw = m[2].replace(/[.,;:)]+$/, ''), start = m.index + m[1].length, kind = null, path = null;
      if (raw === 'selection') kind = 'selection';
      else if (raw === 'problems') kind = 'problems';
      else if (raw === 'file') kind = 'file';
      else {
        var p = normPath(raw);
        if (set[p]) { kind = 'path'; path = p; }
        else if (byBase[raw] && byBase[raw].length === 1) { kind = 'path'; path = byBase[raw][0]; }
      }
      if (kind) out.push({ token: '@' + raw, kind: kind, path: path, start: start, end: start + 1 + raw.length });
    }
    return out;
  }

  // Turn a draft's mentions (plus the open file, unless excluded) into prompt
  // attachments and the chips shown for them. env: { files:[paths], read(path),
  // active:{path,content}|null, selection:{path,text,startLine,endLine}|null,
  // problems:[{severity,file,message}], includeActive }.
  // -> { blocks:[{label,body}], chips:[{kind,label,token?}], notes:[string] }
  function resolveAttachments(text, env) {
    var res = { blocks: [], chips: [], notes: [] }, used = 0, seen = {};
    var add = function (kind, label, body, token) {
      var room = ATTACH_TOTAL_CHARS - used;
      if (room <= 0) { res.notes.push(label + ' was left out (attachment budget used up)'); return; }
      var cap = Math.min(ATTACH_FILE_CHARS, room), cut = body.length > cap;
      res.blocks.push({ label: label + (cut ? ' (first ' + cap + ' characters)' : ''), body: body.slice(0, cap) });
      used += Math.min(body.length, cap);
      res.chips.push({ kind: kind, label: label, token: token || null });
    };
    var active = env.active;
    if (env.includeActive !== false && active && active.path) {
      seen[active.path] = true;
      res.chips.push({ kind: 'open', label: active.path, token: null });   // sent via the system prompt already
    }
    parseMentions(text, env.files).forEach(function (m) {
      if (m.kind === 'selection') {
        if (!env.selection || !env.selection.text) { res.notes.push('@selection: nothing is selected in the editor'); return; }
        var s = env.selection;
        add('selection', 'selection of ' + s.path + ' (lines ' + s.startLine + '–' + s.endLine + ')', s.text, m.token);
      } else if (m.kind === 'problems') {
        var ps = (env.problems || []).slice(0, MAX_PROBLEMS);
        if (!ps.length) { res.notes.push('@problems: the Problems list is empty'); return; }
        add('problems', 'problems (' + ps.length + (env.problems.length > ps.length ? ' of ' + env.problems.length : '') + ')',
          ps.map(function (p) { return (p.severity || 'info') + ' ' + (p.file || '(project)') + ': ' + p.message; }).join('\n'), m.token);
      } else {
        var path = m.kind === 'file' ? (active && active.path) : m.path;
        if (!path) { res.notes.push('@file: no file is open'); return; }
        if (seen[path] && m.kind === 'path' && active && active.path === path) {
          res.chips.push({ kind: 'path', label: path, token: m.token }); return;   // already in context as the open file
        }
        if (seen[path]) return;
        seen[path] = true;
        var body = active && active.path === path ? active.content : env.read(path);
        if (body == null) { res.notes.push(m.token + ': could not read ' + path); return; }
        add('path', path, String(body), m.token);
      }
    });
    return res;
  }

  // Plain code blocks of a message, in order — what the Copy buttons copy.
  function codeBlocks(src) {
    var out = [];
    String(src == null ? '' : src).replace(/\r\n/g, '\n').replace(/```[\w+-]*[^\n]*\n([\s\S]*?)(```|$)/g, function (_m, code) {
      out.push(code.replace(/\n$/, '')); return '';
    });
    return out;
  }

  // The messages sent to the model: system (+ project context), the most recent
  // history that fits the budget, then nothing else — the new user message is
  // already the last history entry.
  function buildMessages(history, ctx) {
    ctx = ctx || {};
    var sys = ctx.agent && ctx.systemPrompt ? ctx.systemPrompt : SYSTEM_PROMPT;
    if (ctx.pending && ctx.pending.length) sys += '\n\nChanges you already proposed that the user has not reviewed yet: ' + ctx.pending.join(', ') + '.';
    if (ctx.files && ctx.files.length) {
      sys += '\n\nProject files (' + ctx.files.length + (ctx.filesTruncated ? ', first ' + FILE_LIST_MAX + ' shown' : '') + '):\n' + ctx.files.join('\n');
    }
    if (ctx.activePath) {
      var body = String(ctx.activeContent == null ? '' : ctx.activeContent);
      var cut = body.length > FILE_CHARS;
      sys += '\n\nThe user has this file open: ' + ctx.activePath + (cut ? ' (first ' + FILE_CHARS + ' characters)' : '') +
        '\n```\n' + body.slice(0, FILE_CHARS) + '\n```';
    }
    (ctx.attachments || []).forEach(function (b) {
      sys += '\n\nAttached by the user — ' + b.label + ':\n```\n' + b.body + '\n```';
    });
    if (ctx.notes && ctx.notes.length) sys += '\n\nNote: ' + ctx.notes.join('; ') + '.';
    var kept = [], used = 0;
    for (var i = history.length - 1; i >= 0; i--) {
      var m = history[i];
      if (!m || (m.role !== 'user' && m.role !== 'assistant') || !m.content || m.error) continue;
      if (used + m.content.length > HISTORY_CHARS && kept.length) break;
      used += m.content.length;
      kept.unshift({ role: m.role, content: m.content });
    }
    return [{ role: 'system', content: sys }].concat(kept);
  }

  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

  var memStore = {};
  function storage() {
    try { var w = win(); if (w.localStorage) return w.localStorage; } catch (_) { /* blocked */ }
    return { getItem: function (k) { return memStore[k] == null ? null : memStore[k]; }, setItem: function (k, v) { memStore[k] = String(v); } };
  }
  function loadStore() {
    try {
      var j = JSON.parse(storage().getItem(STORE_KEY) || 'null');
      if (j && Array.isArray(j.threads)) {
        // a reload mid-run leaves streaming / running / awaiting-approval rows behind
        j.threads.forEach(function (th) {
          (th.messages || []).forEach(function (m) {
            if (m.streaming) m.streaming = false;
            if (m.role === 'tool' && (m.status === 'running' || m.status === 'approval')) {
              m.status = 'error'; m.summary = (m.summary || m.name) + ' — interrupted'; delete m.approval;
            }
          });
        });
        return j;
      }
    } catch (_) { /* corrupt → start over */ }
    return { threads: [], active: null };
  }
  function saveStore() {
    try {
      var s = state.store;
      s.threads = s.threads.slice(0, MAX_THREADS);
      s.threads.forEach(function (t) { if (t.messages.length > MAX_MSGS) t.messages = t.messages.slice(-MAX_MSGS); });
      storage().setItem(STORE_KEY, JSON.stringify(s));
    } catch (_) { /* quota — the chat still works in memory */ }
  }

  /* --------------------------------------------------------------- state */

  function loadMode() { try { return storage().getItem(MODE_KEY) === 'agent' ? 'agent' : 'ask'; } catch (_) { return 'ask'; } }

  var state = { store: loadStore(), busy: false, ctrl: null, draft: '', renderTimer: null, noActive: false, pop: null,
    mode: loadMode(), toolbox: null, approvals: {}, lastTool: null };

  function setMode(m) {
    state.mode = m === 'agent' ? 'agent' : 'ask';
    try { storage().setItem(MODE_KEY, state.mode); } catch (_) {}
    mount();
  }

  function thread() {
    var s = state.store, t = null;
    s.threads.forEach(function (x) { if (x.id === s.active) t = x; });
    if (!t) {
      t = { id: uid(), title: 'New chat', at: Date.now(), messages: [] };
      s.threads.unshift(t); s.active = t.id;
    }
    return t;
  }

  function newThread() {
    if (state.busy) stop();
    var t = { id: uid(), title: 'New chat', at: Date.now(), messages: [] };
    state.store.threads.unshift(t); state.store.active = t.id;
    saveStore(); mount();
    return t;
  }

  function context() {
    var w = win(), ctx = {};
    try {
      var S = w.S || {}, FS = w.Engine && w.Engine.FS;
      if (FS && FS._data) {
        var all = Object.keys(FS._data).filter(function (p) { return FS.isFile(p); }).sort();
        ctx.files = all.slice(0, FILE_LIST_MAX); ctx.filesTruncated = all.length > FILE_LIST_MAX;
      }
      if (S.ideFile && !state.noActive) {
        ctx.activePath = S.ideFile;
        ctx.activeContent = S.ideBuffer != null ? S.ideBuffer : (FS && FS.read(S.ideFile)) || '';
      }
    } catch (_) { /* context is best-effort */ }
    return ctx;
  }

  function fileList() {
    var FS = win().Engine && win().Engine.FS;
    try { return FS && FS._data ? Object.keys(FS._data).filter(function (p) { return FS.isFile(p); }).sort() : []; } catch (_) { return []; }
  }

  // The editor's current selection, from Monaco's facade or the textarea fallback.
  function currentSelection() {
    var w = win(), S = w.S || {};
    if (!S.ideFile) return null;
    var ed = (w.CSEditor && w.CSEditor.ready && w.CSEditor.current && w.CSEditor.current()) || (doc() && doc().getElementById('ideEditor'));
    if (!ed || typeof ed.value !== 'string') return null;
    var a = ed.selectionStart, b = ed.selectionEnd;
    if (!(b > a)) return null;
    var v = ed.value;
    return { path: S.ideFile, text: v.slice(a, b), startLine: v.slice(0, a).split('\n').length, endLine: v.slice(0, b).split('\n').length };
  }

  // What @mentions in `text` can resolve against right now. Selection and
  // problems are only gathered when the draft actually mentions them.
  function attachEnv(text) {
    var w = win(), S = w.S || {}, FS = w.Engine && w.Engine.FS;
    var env = {
      files: fileList(),
      read: function (p) { try { return FS && FS.isFile(p) ? FS.read(p) : null; } catch (_) { return null; } },
      active: null, selection: null, problems: [], includeActive: !state.noActive
    };
    if (S.ideFile) env.active = { path: S.ideFile, content: S.ideBuffer != null ? S.ideBuffer : (FS && FS.read(S.ideFile)) || '' };
    if (/(^|\s)@selection\b/.test(text)) env.selection = currentSelection();
    if (/(^|\s)@problems\b/.test(text)) { try { env.problems = w.Engine.Validator.runAll() || []; } catch (_) { env.problems = []; } }
    return env;
  }

  function aiReady() {
    var w = win();
    return !!(w.Engine && w.Engine.AI && w.Engine.AI.ready && w.Engine.AI.ready());
  }

  /* ------------------------------------------------------------ sending */

  function send(text) {
    text = String(text == null ? '' : text).trim();
    if (!text || state.busy) return Promise.resolve(null);
    var w = win();
    var AI = w.Engine && w.Engine.AI;
    var t = thread();
    var att = resolveAttachments(text, attachEnv(text));
    var userMsg = { id: uid(), role: 'user', content: text, at: Date.now() };
    var picked = att.chips.filter(function (c) { return c.kind !== 'open'; });
    if (picked.length) userMsg.chips = picked.map(function (c) { return { kind: c.kind, label: c.label }; });
    if (att.notes.length) userMsg.notes = att.notes;
    var selChip = att.chips.filter(function (c) { return c.kind === 'selection'; })[0];
    if (selChip) { var sel = currentSelection(); if (sel) userMsg.sel = { path: sel.path, text: sel.text.slice(0, 20000) }; }
    var botMsg = { id: uid(), role: 'assistant', content: '', at: Date.now(), streaming: true };
    t.messages.push(userMsg);
    if (t.title === 'New chat') t.title = text.replace(/\s+/g, ' ').slice(0, 48);
    state.draft = '';

    if (!AI || !AI.chatStream || !aiReady()) {
      botMsg.streaming = false; botMsg.error = true;
      botMsg.content = 'No model is connected. Connect one (Ollama, LM Studio, OmniRoute or any OpenAI-compatible endpoint) and try again.';
      t.messages.push(botMsg);
      saveStore(); mount();
      return Promise.resolve(botMsg);
    }

    if (state.mode === 'agent' && w.CSChatAgent) return sendAgent(t, att, AI);

    t.messages.push(botMsg);
    state.busy = true;
    state.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var msgs = buildMessages(t.messages.slice(0, -1), Object.assign(context(), { attachments: att.blocks, notes: att.notes }));
    saveStore(); mount();

    return AI.chatStream(msgs, {
      signal: state.ctrl && state.ctrl.signal,
      onDelta: function (d) { botMsg.content += d; paintMessage(botMsg); }
    }).then(function (r) {
      if (r && r.aborted) botMsg.stopped = true;
      if (!botMsg.content && !(r && r.aborted)) { botMsg.error = true; botMsg.content = 'The model returned an empty reply.'; }
    }, function (e) {
      botMsg.error = true;
      var msg = String((e && e.message) || e);
      botMsg.content = (botMsg.content ? botMsg.content + '\n\n' : '') + 'Request failed: ' + msg;
    }).then(function () {
      botMsg.streaming = false; state.busy = false; state.ctrl = null;
      saveStore(); mount();
      return botMsg;
    });
  }

  /* ------------------------------------------------------- agent mode */

  function S_() { return win().S || {}; }

  // What the agent's tools can see and do. Everything is read live, so the
  // open file's unsaved text is what read_file returns.
  function agentEnv() {
    var w = win(), E = w.Engine || {};
    return {
      list: fileList,
      read: function (p) {
        try {
          var S = S_();
          if (S.ideFile === p && S.ideDirty && S.ideBuffer != null) return S.ideBuffer;
          return E.FS && E.FS.isFile(p) ? E.FS.read(p) : null;
        } catch (_) { return null; }
      },
      getProblems: function () { return E.Validator ? (E.Validator.runAll() || []) : []; },
      diffStats: function (a, b) {
        if (E.Review && E.Review.stats) { var st = E.Review.stats(a, b); return { added: st.added, removed: st.removed }; }
        return { added: String(b).split('\n').length, removed: a ? String(a).split('\n').length : 0 };
      },
      canWrite: function () { return !(E.Autonomy && E.Autonomy.allows) || E.Autonomy.allows('write'); },
      canCommand: function () { return !(E.Autonomy && E.Autonomy.allows) || E.Autonomy.allows('command'); },
      jobsAvailable: function () { var X = win().CSExec; try { return !!(X && X.available && X.available()); } catch (_) { return false; } },
      runJob: function (job) { var X = win().CSExec; return X && typeof X[job] === 'function' ? X[job]() : Promise.reject(new Error('no runner for ' + job)); }
    };
  }

  function toolbox() {
    if (!state.toolbox) state.toolbox = win().CSChatAgent.createToolbox(agentEnv());
    return state.toolbox;
  }

  function pushNote(t, text) { t.messages.push({ id: uid(), role: 'note', content: text, at: Date.now() }); }

  function askApproval(req) {
    var tm = state.lastTool;
    if (!tm) return Promise.resolve(false);
    return new Promise(function (resolve) {
      tm.status = 'approval'; tm.approval = req.label || ('Run ' + req.job);
      state.approvals[tm.id] = function (yes) {
        delete state.approvals[tm.id]; delete tm.approval;
        tm.status = yes ? 'running' : 'denied';
        resolve(!!yes); mount();
      };
      mount();
    });
  }
  function settleApprovals(yes) { Object.keys(state.approvals).forEach(function (k) { try { state.approvals[k](yes); } catch (_) {} }); }

  // Agent mode send: the model may call tools; each turn and each tool call
  // becomes its own row in the conversation.
  function sendAgent(t, att, AI) {
    var w = win(), Ag = w.CSChatAgent, tb = toolbox();
    state.busy = true;
    state.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    state.lastTool = null;
    var ctx = Object.assign(context(), {
      attachments: att.blocks, notes: att.notes, agent: true, systemPrompt: Ag.SYSTEM_PROMPT, pending: Array.from(tb.proposals.keys())
    });
    var msgs = buildMessages(t.messages, ctx);
    var cur = null, said = false;
    saveStore(); mount();

    var finish = function () {
      state.busy = false; state.ctrl = null; state.lastTool = null; settleApprovals(false);
      saveStore(); mount();
      return t.messages[t.messages.length - 1];
    };

    return Ag.runLoop({
      chatStream: function (m, o) { return AI.chatStream(m, o); },
      messages: msgs, toolbox: tb, signal: state.ctrl && state.ctrl.signal, approve: askApproval,
      onTurnStart: function () {
        cur = { id: uid(), role: 'assistant', content: '', at: Date.now(), streaming: true };
        t.messages.push(cur); mount();
      },
      onText: function (d) { if (cur) { cur.content += d; paintMessage(cur); } },
      onTurnEnd: function (x) {
        if (cur) {
          cur.content = x.text == null ? cur.content : x.text; cur.streaming = false;
          if (!String(cur.content).trim()) { var i = t.messages.indexOf(cur); if (i >= 0) t.messages.splice(i, 1); }
          else { said = true; if (x.aborted) cur.stopped = true; }
        }
        saveStore(); mount();
      },
      onToolStart: function (c) {
        var tm = { id: c.id, role: 'tool', name: c.name, args: c.args, status: 'running', at: Date.now() };
        state.lastTool = tm; t.messages.push(tm); mount();
      },
      onToolDone: function (c, res) {
        var tm = t.messages.filter(function (m) { return m.role === 'tool' && m.id === c.id; })[0];
        if (tm) {
          tm.status = res.status || (res.ok ? 'done' : 'error'); tm.summary = res.summary;
          tm.result = String(res.detail || res.text || '').slice(0, 4000);
        }
        state.lastTool = null; saveStore(); mount();
      },
      onNoTools: function () { pushNote(t, 'This model or provider does not accept tools, so it is answering without them (no file access in this reply).'); }
    }).then(function (r) {
      if (r.reason === 'max-turns') pushNote(t, 'Stopped after ' + r.turns + ' steps without finishing. Ask me to continue if you want more.');
      else if (r.reason === 'repeat') pushNote(t, 'Stopped: the model kept repeating the same tool call.');
      else if (r.reason === 'aborted' && !said) pushNote(t, 'Stopped.');
      else if (r.reason === 'done' && !said) pushNote(t, 'The model returned an empty reply.');
      return finish();
    }, function (e) {
      t.messages.push({ id: uid(), role: 'assistant', content: 'Request failed: ' + String((e && e.message) || e), error: true, at: Date.now() });
      return finish();
    });
  }

  /* Proposed changes: what the agent queued with write_file. They live in the
     toolbox (this page session); each opens in the editor's hunk review. */
  function proposalList() { return state.toolbox ? Array.from(state.toolbox.proposals.values()) : []; }

  function reviewProposal(path, chain) {
    var tb = state.toolbox, p = tb && tb.proposals.get(path);
    if (!p) return { ok: false, error: 'no such proposal' };
    var next = function () { if (chain) setTimeout(reviewNext, 150); };
    var r = applyToFile(path, p.after, { persist: true, onDone: function (res) {
      var decided = res.reason === 'done' || res.reason === 'rejected' || res.reason === 'kept' || res.reason === 'direct';
      if (decided) { tb.proposals.delete(path); mount(); next(); }
      else mount();
    } });
    if (!r.ok) {
      if (/nothing to apply/.test(r.error)) { tb.proposals.delete(path); mount(); next(); }
      else toast('Could not open ' + path + ': ' + r.error, '#f59e0b');
    }
    return r;
  }
  function reviewNext() {
    var ps = proposalList();
    if (ps.length) reviewProposal(ps[0].path, true);
  }
  function discardProposal(path) { if (state.toolbox) state.toolbox.proposals.delete(path); mount(); }
  function discardAll() { if (state.toolbox) state.toolbox.proposals.clear(); mount(); }

  function stop() {
    settleApprovals(false);
    var tm = state.lastTool, X = win().CSExec;
    if (tm && tm.name === 'run_command' && tm.status === 'running' && X && X.stop) { try { X.stop(); } catch (_) {} }
    if (state.ctrl) { try { state.ctrl.abort(); } catch (_) {} }
  }

  /* ----------------------------------------------------------------- UI */

  function doc() { return typeof document !== 'undefined' ? document : null; }
  function hostEl() { var d = doc(); return d ? d.getElementById('csChatHost') : null; }

  var CSS =
    '#csChatHost{display:flex;flex:1;min-height:0;min-width:0}' +
    '.csc-chat{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;background:#0a0e17;color:#dfe3ee;font:13px/1.55 Inter,sans-serif}' +
    '.csc-chat-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);flex:none}' +
    '.csc-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.05);color:#a9b0c4;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.csc-dot{width:7px;height:7px;border-radius:50%;background:#5f6980;flex:none}.csc-dot.on{background:#34d399}' +
    '.csc-chat-bar button,.csc-send,.csc-connect{cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#c7cddb;border-radius:7px;padding:4px 10px;font:600 11.5px Inter}' +
    '.csc-chat-msgs{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:14px;min-height:0}' +
    '.csc-empty{margin:auto;text-align:center;color:#7b859c;font-size:12.5px;max-width:260px}' +
    '.csc-msg .csc-who{font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#7b859c;margin-bottom:4px}' +
    '.csc-msg.user .csc-body{background:rgba(124,111,245,.14);border:1px solid rgba(124,111,245,.28);border-radius:10px;padding:8px 11px}' +
    '.csc-msg.err .csc-body{color:#fca5a5}' +
    '.csc-body{word-wrap:break-word;overflow-wrap:anywhere}.csc-body ul{margin:4px 0 4px 18px;padding:0}.csc-gap{height:8px}' +
    '.csc-ic{background:rgba(255,255,255,.08);border-radius:4px;padding:1px 5px;font:12px "JetBrains Mono",monospace}' +
    '.csc-code{margin:8px 0;border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;background:#070a12}' +
    '.csc-code-bar{display:flex;justify-content:space-between;align-items:center;padding:3px 8px;background:rgba(255,255,255,.04);font-size:10.5px;color:#7b859c}' +
    '.csc-code-bar button{cursor:pointer;border:0;background:transparent;color:#a9b0ff;font:600 10.5px Inter}' +
    '.csc-code pre{margin:0;padding:9px 11px;overflow:auto;font:12px/1.5 "JetBrains Mono",monospace;color:#c9d1e0}' +
    '.csc-cursor{display:inline-block;width:7px;height:13px;background:#a78bfa;vertical-align:-2px;animation:csPulse 1s infinite}' +
    '.csc-stopped{font-size:11px;color:#7b859c;margin-top:4px}' +
    '.csc-chat-in{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.06);flex:none;align-items:flex-end}' +
    '.csc-chat-in textarea{flex:1;resize:none;max-height:140px;min-height:38px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#e6e9f2;padding:8px 10px;font:13px/1.45 Inter,sans-serif;outline:none}' +
    '.csc-send{background:linear-gradient(135deg,#7c6ff5,#5b4de8);border:0;color:#fff;padding:9px 14px}' +
    '.csc-send.stop{background:#3b2230;color:#fca5a5}' +
    '.csc-code-act{display:inline-flex;gap:10px;align-items:center}' +
    '.csc-code-bar button.csc-apply{background:rgba(124,111,245,.22);color:#d6d0ff;border-radius:5px;padding:2px 8px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.csc-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}' +
    '.csc-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#b9c0d4;max-width:100%}' +
    '.csc-chip.selection{border-color:rgba(34,211,238,.4)}.csc-chip.problems{border-color:rgba(245,158,11,.45)}.csc-chip.open{opacity:.75}' +
    '.csc-chip button{cursor:pointer;border:0;background:transparent;color:#7b859c;font-size:10px;padding:0 0 0 2px}' +
    '.csc-note{font-size:11px;color:#f1b863;margin-top:5px}' +
    '.csc-compose{position:relative;flex:none;border-top:1px solid rgba(255,255,255,.06)}' +
    '.csc-compose .csc-chips{margin:0;padding:8px 12px 0}.csc-compose .csc-note{padding:4px 12px 0}' +
    '.csc-compose .csc-chat-in{border-top:0}' +
    '.csc-pop{position:absolute;left:12px;right:12px;bottom:100%;margin-bottom:4px;background:#121827;border:1px solid rgba(255,255,255,.14);border-radius:9px;max-height:210px;overflow:auto;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.45)}' +
    '.csc-pop-item{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;cursor:pointer;font-size:12px;color:#c9d1e0}' +
    '.csc-pop-item.on,.csc-pop-item:hover{background:rgba(124,111,245,.22)}.csc-pop-item small{color:#7b859c;white-space:nowrap}' +
    '.csc-pop-item.off{opacity:.5}' +
    '.csc-seg{display:inline-flex;border:1px solid rgba(255,255,255,.12);border-radius:7px;overflow:hidden}' +
    '.csc-chat-bar .csc-seg button{border:0;border-radius:0;background:transparent;padding:3px 9px}' +
    '.csc-chat-bar .csc-seg button.on{background:rgba(124,111,245,.3);color:#e6e0ff}' +
    '.csc-tool{border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.025);font-size:12px;margin:-6px 0}' +
    '.csc-tool summary{cursor:pointer;padding:5px 9px;display:flex;gap:6px;align-items:baseline;list-style:none;color:#aab2c7;min-width:0}' +
    '.csc-tool summary::-webkit-details-marker{display:none}' +
    '.csc-tool-ico{color:#a78bfa;width:14px;text-align:center;flex:none}.csc-tool-sum{color:#8b93a7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
    '.csc-tool-st{font-size:10.5px;color:#f1b863;margin-left:auto;flex:none}' +
    '.csc-tool.st-error .csc-tool-st,.csc-tool.st-blocked .csc-tool-st{color:#fca5a5}.csc-tool.st-denied .csc-tool-st{color:#8b93a7}' +
    '.csc-tool pre{margin:0;padding:6px 10px 8px;max-height:220px;overflow:auto;font:11px/1.45 "JetBrains Mono",monospace;color:#9aa3b8;white-space:pre-wrap;word-break:break-word}' +
    '.csc-approve{display:flex;gap:8px;align-items:center;padding:6px 9px;border-top:1px solid rgba(255,255,255,.08);background:rgba(245,158,11,.08)}' +
    '.csc-approve span{flex:1;color:#f1d9a8}.csc-approve button{cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#e6e9f2;border-radius:6px;padding:3px 10px;font:600 11px Inter}' +
    '.csc-approve button:first-of-type{background:#2d6a4f;border-color:#2d6a4f}' +
    '.csc-note-line{font-size:11.5px;color:#8b93a7;text-align:center}' +
    '.csc-tray{flex:none;border-top:1px solid rgba(124,111,245,.35);background:rgba(124,111,245,.07);padding:6px 12px;max-height:150px;overflow:auto}' +
    '.csc-tray-h{display:flex;gap:8px;align-items:center;font-size:11px;font-weight:700;letter-spacing:.04em;color:#c4bcff;margin-bottom:4px}' +
    '.csc-prop{display:flex;gap:8px;align-items:center;padding:2px 0;font-size:12px}' +
    '.csc-prop-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dfe3ee;font-family:"JetBrains Mono",monospace;font-size:11.5px}' +
    '.csc-prop-path em{font-style:normal;color:#34d399;font-size:10px;margin-left:4px}' +
    '.csc-prop-st b{font-size:11px;font-weight:600}.csc-prop-st .a{color:#34d399}.csc-prop-st .r{color:#f87171}' +
    '.csc-tray button{cursor:pointer;border:1px solid rgba(255,255,255,.15);background:rgba(124,111,245,.25);color:#e6e0ff;border-radius:6px;padding:2px 9px;font:600 11px Inter}' +
    '.csc-tray button.quiet{background:transparent;color:#8b93a7;border-color:rgba(255,255,255,.1)}';

  function ensureStyle() {
    var d = doc();
    if (!d || d.getElementById('csChatStyle')) return;
    var s = d.createElement('style'); s.id = 'csChatStyle'; s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  function chipHtml(c, removable) {
    var icon = c.kind === 'selection' ? '✂' : c.kind === 'problems' ? '⚠' : c.kind === 'open' ? '●' : '@';
    var short = c.label.length > 34 ? '…' + c.label.slice(-33) : c.label;
    return '<span class="csc-chip ' + esc(c.kind) + '" title="' + esc(c.label) + '">' + icon + ' ' + esc(short) +
      (removable ? '<button type="button" data-cs-unchip="' + esc(c.token || '') + '" data-cs-chipkind="' + esc(c.kind) + '" title="Remove">✕</button>' : '') + '</span>';
  }

  function messageHtml(m) {
    var body;
    if (m.role === 'assistant') {
      var opts = null;
      if (!m.streaming && !m.error) {
        var files = fileList(), active = (win().S || {}).ideFile;
        opts = { applyLabel: function (i) {
          var tg = applyTarget(m.content, i, files, active);
          return tg ? tg.path + (tg.exists ? '' : ' (new)') : null;
        } };
      }
      body = renderMarkdown(m.content, opts);
    } else {
      body = '<div>' + esc(m.content).replace(/\n/g, '<br>') + '</div>';
      if (m.chips && m.chips.length) body += '<div class="csc-chips">' + m.chips.map(function (c) { return chipHtml(c, false); }).join('') + '</div>';
      if (m.notes && m.notes.length) body += '<div class="csc-note">' + m.notes.map(esc).join('<br>') + '</div>';
    }
    if (m.streaming) body += '<span class="csc-cursor"></span>';
    if (m.stopped) body += '<div class="csc-stopped">Stopped.</div>';
    return body;
  }

  var TOOL_ICON = { list_dir: '▤', read_file: '▭', grep: '⌕', get_problems: '⚠', write_file: '✎', run_command: '▶' };
  var STATUS_LABEL = { running: 'running…', approval: 'needs your OK', done: '', error: 'failed', denied: 'declined', blocked: 'blocked' };

  function toolHtml(m) {
    var st = m.status || 'done';
    var head = '<span class="csc-tool-ico">' + (TOOL_ICON[m.name] || '•') + '</span><b>' + esc(m.name) + '</b> ' +
      '<span class="csc-tool-sum">' + esc(m.summary || (m.args && (m.args.path || m.args.query || m.args.job)) || '') + '</span>' +
      (STATUS_LABEL[st] ? ' <span class="csc-tool-st">' + STATUS_LABEL[st] + '</span>' : '');
    var args = '';
    try { args = JSON.stringify(m.args || {}, null, 1); } catch (_) {}
    if (m.name === 'write_file' && m.args && typeof m.args.content === 'string') {
      args = JSON.stringify({ path: m.args.path, content: '(' + m.args.content.length + ' characters — see Proposed changes)' }, null, 1);
    }
    var body = '<pre>' + esc(args) + (m.result ? '\n— result —\n' + esc(m.result) : '') + '</pre>';
    var ask = m.status === 'approval'
      ? '<div class="csc-approve"><span>' + esc(m.approval || 'Run this command?') + '</span>' +
        '<button type="button" data-cs-approve="' + esc(m.id) + '">Run</button><button type="button" data-cs-deny="' + esc(m.id) + '">Don\'t run</button></div>' : '';
    return '<div class="csc-tool st-' + esc(st) + '" data-tool="' + esc(m.id) + '"><details' + (m.status === 'approval' ? ' open' : '') + '><summary>' + head + '</summary>' + body + '</details>' + ask + '</div>';
  }

  function trayHtml() {
    var ps = proposalList();
    if (!ps.length) return '';
    var env = agentEnv();
    var rows = ps.map(function (p) {
      var st = env.diffStats(p.before, p.after);
      return '<div class="csc-prop"><span class="csc-prop-path" title="' + esc(p.path) + '">' + esc(p.path) + (p.isNew ? ' <em>new</em>' : '') + '</span>' +
        '<span class="csc-prop-st"><b class="a">+' + st.added + '</b> <b class="r">−' + st.removed + '</b></span>' +
        '<button type="button" data-cs-review="' + esc(p.path) + '">Review</button>' +
        '<button type="button" class="quiet" data-cs-discard="' + esc(p.path) + '" title="Discard this proposal">✕</button></div>';
    }).join('');
    return '<div class="csc-tray"><div class="csc-tray-h"><span>Proposed changes · ' + ps.length + '</span><span style="flex:1"></span>' +
      (ps.length > 1 ? '<button type="button" data-cs-review-all="1">Review all</button>' : '') +
      '<button type="button" class="quiet" data-cs-discard-all="1">Discard all</button></div>' + rows + '</div>';
  }

  function threadHtml(t) {
    if (!t.messages.length) {
      return '<div class="csc-empty">' + (state.mode === 'agent'
        ? 'Agent mode: I can read and search your files, run checks you approve, and propose edits for you to review hunk by hunk.'
        : 'Ask about your project. The assistant sees the open file and your file list and answers with the model you have connected.') + '</div>';
    }
    return t.messages.map(function (m) {
      if (m.role === 'tool') return toolHtml(m);
      if (m.role === 'note') return '<div class="csc-note-line">' + esc(m.content) + '</div>';
      return '<div class="csc-msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.error ? ' err' : '') + '" data-msg="' + esc(m.id) + '">' +
        '<div class="csc-who">' + (m.role === 'user' ? 'YOU' : 'ASSISTANT') + '</div>' +
        '<div class="csc-body">' + messageHtml(m) + '</div></div>';
    }).join('');
  }

  function statusLine() {
    var w = win(), st = null;
    try { st = w.Engine && w.Engine.AI && w.Engine.AI.status(); } catch (_) {}
    if (st && st.connected) {
      return '<span class="csc-pill" title="' + esc(st.source) + '"><span class="csc-dot on"></span>' + esc(st.model || st.provider || 'model') + ' · ' + esc(st.free ? 'free/local' : st.provider) + '</span>';
    }
    return '<span class="csc-pill"><span class="csc-dot"></span>Not connected</span>' +
      '<button type="button" class="csc-connect" data-cs-connect="1">Connect</button>';
  }

  // Paint one streaming message without rebuilding the panel (throttled).
  function paintMessage(m) {
    if (state.renderTimer) return;
    state.renderTimer = setTimeout(function () {
      state.renderTimer = null;
      var h = hostEl();
      if (!h) return;
      var el = h.querySelector('[data-msg="' + m.id + '"] .csc-body');
      var box = h.querySelector('.csc-chat-msgs');
      if (!el) return;
      var near = box ? (box.scrollHeight - box.scrollTop - box.clientHeight < 80) : false;
      el.innerHTML = messageHtml(m);
      if (box && near) box.scrollTop = box.scrollHeight;
    }, 40);
  }

  function mount() {
    var h = hostEl();
    if (!h) return;
    ensureStyle();
    var t = thread();
    var prevMsgs = h.querySelector('.csc-chat-msgs');
    var keepScroll = prevMsgs ? prevMsgs.scrollTop : null;
    var wasBottom = prevMsgs ? (prevMsgs.scrollHeight - prevMsgs.scrollTop - prevMsgs.clientHeight < 80) : true;
    h.innerHTML =
      '<div class="csc-chat">' +
        '<div class="csc-chat-bar">' + statusLine() + '<span style="flex:1"></span>' +
          '<span class="csc-seg" title="Ask: answers only. Agent: can read files, run approved checks and propose edits for your review.">' +
            '<button type="button" data-cs-mode="ask" class="' + (state.mode === 'ask' ? 'on' : '') + '">Ask</button>' +
            '<button type="button" data-cs-mode="agent" class="' + (state.mode === 'agent' ? 'on' : '') + '">Agent</button></span>' +
          '<button type="button" data-cs-new="1" title="Start a new conversation">New chat</button></div>' +
        '<div class="csc-chat-msgs">' + threadHtml(t) + '</div>' +
        '<div id="csChatTray">' + trayHtml() + '</div>' +
        '<div class="csc-compose">' +
          '<div id="csChatPop" class="csc-pop" hidden></div>' +
          '<div id="csChatChips"></div>' +
          '<div class="csc-chat-in">' +
            '<textarea id="csChatInput" rows="1" placeholder="' + (state.mode === 'agent' ? 'Tell the agent what to do…  @ to attach context  (Enter sends)' : 'Ask about this project…  @ to attach a file, @selection, @problems  (Enter sends)') + '"></textarea>' +
            (state.busy ? '<button type="button" class="csc-send stop" data-cs-stop="1">Stop</button>'
                        : '<button type="button" class="csc-send" data-cs-send="1">Send</button>') +
          '</div>' +
        '</div>' +
      '</div>';
    var input = h.querySelector('#csChatInput');
    if (input) {
      input.value = state.draft || '';
      var changed = function () { state.draft = input.value; paintChips(); paintPop(); };
      input.addEventListener('input', changed);
      input.addEventListener('click', paintPop);
      input.addEventListener('keyup', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') paintPop(); });
      input.addEventListener('keydown', function (e) {
        if (state.pop && state.pop.items.length) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var n = state.pop.items.length;
            state.pop.idx = (state.pop.idx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
            return renderPop();
          }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return acceptMention(state.pop.items[state.pop.idx]); }
          if (e.key === 'Escape') { e.preventDefault(); state.pop = null; return renderPop(); }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      });
    }
    paintChips();
    // scroll last: the chips row changes the composer height, which resizes this box
    var box = h.querySelector('.csc-chat-msgs');
    if (box) box.scrollTop = (wasBottom || keepScroll == null) ? box.scrollHeight : keepScroll;
    h.onclick = onClick;
  }

  /* ----------------------------------------------- chips and @ picker */

  // Chips for what the draft will attach, plus the open-file toggle.
  function paintChips() {
    var h = hostEl(), el = h && h.querySelector('#csChatChips');
    if (!el) return;
    var att = resolveAttachments(state.draft || '', attachEnv(state.draft || ''));
    var html = att.chips.map(function (c) { return chipHtml(c, c.kind === 'open' || !!c.token); }).join('');
    if (state.noActive && (win().S || {}).ideFile) {
      html = '<span class="csc-chip open" style="opacity:.5;text-decoration:line-through" title="The open file is not being sent">● ' + esc((win().S || {}).ideFile) +
        '<button type="button" data-cs-chipkind="open-on" title="Send the open file again">+</button></span>' + html;
    }
    el.innerHTML = (html ? '<div class="csc-chips">' + html + '</div>' : '') +
      (att.notes.length ? '<div class="csc-note">' + att.notes.map(esc).join('<br>') + '</div>' : '');
  }

  // The @query being typed at the caret, or null.
  function mentionAtCaret(input) {
    var pos = input.selectionStart == null ? input.value.length : input.selectionStart;
    var m = /(^|\s)@([\w./\\-]*)$/.exec(input.value.slice(0, pos));
    return m ? { query: m[2], start: pos - m[2].length - 1, end: pos } : null;
  }

  function mentionItems(query) {
    var q = query.toLowerCase(), items = [];
    var S = win().S || {}, sel = null;
    try { sel = currentSelection(); } catch (_) {}
    var kw = [
      { insert: '@selection', label: '@selection', hint: sel ? sel.text.length + ' chars selected' : 'nothing selected', off: !sel },
      { insert: '@problems', label: '@problems', hint: 'the Problems list' },
      { insert: '@file', label: '@file', hint: S.ideFile || 'no file open', off: !S.ideFile }
    ];
    kw.forEach(function (k) { if (k.label.slice(1).indexOf(q) === 0) items.push(k); });
    var ql = q.replace(/^\//, '');
    fileList().filter(function (p) { return !ql || p.toLowerCase().indexOf(ql) >= 0; })
      .sort(function (a, b) {
        var ba = a.slice(a.lastIndexOf('/') + 1).toLowerCase().indexOf(ql) === 0 ? 0 : 1;
        var bb = b.slice(b.lastIndexOf('/') + 1).toLowerCase().indexOf(ql) === 0 ? 0 : 1;
        return ba - bb || a.length - b.length;
      })
      .slice(0, 8).forEach(function (p) { items.push({ insert: '@' + p, label: p, hint: 'file' }); });
    return items;
  }

  function paintPop() {
    var h = hostEl(), input = h && h.querySelector('#csChatInput');
    if (!input) return;
    var at = mentionAtCaret(input);
    if (!at) { state.pop = null; return renderPop(); }
    var items = mentionItems(at.query);
    state.pop = items.length ? { items: items, idx: 0, at: at } : null;
    renderPop();
  }

  function renderPop() {
    var h = hostEl(), el = h && h.querySelector('#csChatPop');
    if (!el) return;
    if (!state.pop) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = state.pop.items.map(function (it, i) {
      return '<div class="csc-pop-item' + (i === state.pop.idx ? ' on' : '') + (it.off ? ' off' : '') + '" data-cs-pick="' + i + '"><span>' + esc(it.label) + '</span><small>' + esc(it.hint) + '</small></div>';
    }).join('');
  }

  function acceptMention(item) {
    var h = hostEl(), input = h && h.querySelector('#csChatInput');
    if (!input || !state.pop || !item) return;
    var at = state.pop.at, v = input.value;
    input.value = v.slice(0, at.start) + item.insert + ' ' + v.slice(at.end);
    var caret = at.start + item.insert.length + 1;
    input.focus(); input.setSelectionRange(caret, caret);
    state.draft = input.value; state.pop = null;
    renderPop(); paintChips();
  }

  function removeMention(token) {
    var h = hostEl(), input = h && h.querySelector('#csChatInput');
    var re = new RegExp('(^|\\s)' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w./\\\\-])');
    var v = (state.draft || '').replace(re, '$1').replace(/ {2,}/g, ' ');
    state.draft = v;
    if (input) input.value = v;
    paintChips();
  }

  /* ------------------------------------------------------ apply to file */

  function toast(msg, color) { var w = win(); if (w.toast) try { w.toast(msg, color || '#7c6ff5'); } catch (_) {} }

  // Open `content` as a reviewable change to `path`: the file is shown in the
  // editor with the new text and every changed hunk can be accepted or
  // rejected (Monaco review, same as Ctrl+K). Nothing is saved to disk until
  // the user saves. opts.selection = {text}: replace that text inside the
  // open file instead of the whole file. opts.persist: once the review is
  // decided (accepted / rejected / done) write the result to the project, as
  // the agent-run review does. opts.onDone(r): called when the review ends.
  // -> { ok, error?, how: 'review'|'direct' }
  function applyToFile(path, content, opts) {
    opts = opts || {};
    var w = win(), S = w.S, FS = w.Engine && w.Engine.FS, E = w.CSEditor;
    if (!S || !FS) return { ok: false, error: 'the IDE is not available' };
    path = normPath(path);
    if (!path) return { ok: false, error: 'no target file' };
    if (E && E.reviewing && E.reviewing()) return { ok: false, error: 'finish the review that is already open first' };
    var exists = !!FS.isFile(path);
    var sameFile = S.ideFile === path;
    if (S.ideDirty && S.ideFile && !sameFile) return { ok: false, error: 'save or revert ' + S.ideFile + ' before switching files' };
    var cur = sameFile && S.ideBuffer != null ? S.ideBuffer : (exists ? FS.read(path) : '');
    var next = String(content);
    if (opts.selection && opts.selection.text && sameFile) {
      var at = cur.indexOf(opts.selection.text);
      if (at >= 0 && cur.indexOf(opts.selection.text, at + 1) < 0) {
        next = cur.slice(0, at) + String(content).replace(/\n$/, '') + cur.slice(at + opts.selection.text.length);
      }
    }
    if (next === cur) return { ok: false, error: 'the block matches the file already — nothing to apply' };
    if (!exists) FS.write(path, '');
    S.screen = 'ide'; S.ideFile = path; S.ideBuffer = cur; S.ideDirty = false;
    if (w.renderAll) w.renderAll();

    var tries = 0;
    var go = function () {
      var ed = E && E.ready && E.current ? E.current() : null;
      if (!ed || !ed.review) {
        if (tries++ < 40) return setTimeout(go, 75);
        // no Monaco: put the text in the buffer, unsaved, so nothing is lost or silently written
        S.ideBuffer = next; S.ideDirty = true; if (w.renderAll) w.renderAll();
        if (opts.onDone) { try { opts.onDone({ reason: 'direct', text: next }); } catch (_) {} }
        return toast('Applied to ' + path + ' without hunk review (the code editor did not load). Save to keep it.', '#f59e0b');
      }
      var before = cur;   // the text as it was, whatever the editor momentarily holds
      ed.value = next; S.ideBuffer = next; S.ideDirty = next !== (FS.read(path) || '');
      var rv = ed.review({ original: before, onEnd: function (r) {
        S.ideBuffer = r.text;
        var decided = r.reason === 'done' || r.reason === 'rejected' || r.reason === 'kept';
        if (!exists && r.reason === 'rejected') { FS.remove(path); S.ideFile = null; S.ideBuffer = ''; S.ideDirty = false; }
        else if (opts.persist && decided) { FS.write(path, r.text); S.ideDirty = false; }
        else S.ideDirty = r.text !== (FS.read(path) || '');
        if (opts.onDone) { try { opts.onDone(r); } catch (e) { try { console.error(e); } catch (_) {} } }
        toast(r.reason === 'rejected' ? 'Change rejected'
          : (r.rejected ? 'Reviewed — ' + r.accepted + ' kept, ' + r.rejected + ' rejected' : 'Change accepted') + (S.ideDirty ? ' — Ctrl+S to save' : ''),
          r.reason === 'rejected' ? '#f59e0b' : '#34d399');
        if (w.renderAll) w.renderAll();
      } });
      if (rv) { try { ed.focus(); } catch (_) {} toast('Review the change — Ctrl+Enter accepts all, Esc rejects', '#a78bfa'); }
    };
    setTimeout(go, 80);
    return { ok: true, how: 'review' };
  }

  function applyBlock(msgId, index) {
    var m = thread().messages.filter(function (x) { return x.id === msgId; })[0];
    if (!m) return { ok: false, error: 'message not found' };
    var code = codeBlocks(m.content)[index];
    var tg = applyTarget(m.content, index, fileList(), (win().S || {}).ideFile);
    if (code == null || !tg) return { ok: false, error: 'no target file for this block' };
    // the user message right before it may carry an @selection to replace
    var msgs = thread().messages, at = msgs.indexOf(m), prev = at > 0 ? msgs[at - 1] : null;
    var sel = prev && prev.role === 'user' && prev.sel && prev.sel.path === tg.path ? prev.sel : null;
    var r = applyToFile(tg.path, code, { selection: sel });
    if (!r.ok) toast('Could not apply: ' + r.error, '#f59e0b');
    return r;
  }

  function submit() {
    var h = hostEl(), input = h && h.querySelector('#csChatInput');
    var text = input ? input.value : state.draft;
    if (!String(text || '').trim()) return;
    send(text);
  }

  function onClick(e) {
    var tgt = e.target;
    if (!tgt || !tgt.closest) return;
    var b;
    if ((b = tgt.closest('[data-cs-send]'))) return submit();
    if ((b = tgt.closest('[data-cs-stop]'))) return stop();
    if ((b = tgt.closest('[data-cs-new]'))) return void newThread();
    if ((b = tgt.closest('[data-cs-mode]'))) return setMode(b.getAttribute('data-cs-mode'));
    if ((b = tgt.closest('[data-cs-approve]'))) { var ap = state.approvals[b.getAttribute('data-cs-approve')]; if (ap) ap(true); return; }
    if ((b = tgt.closest('[data-cs-deny]'))) { var dn = state.approvals[b.getAttribute('data-cs-deny')]; if (dn) dn(false); return; }
    if ((b = tgt.closest('[data-cs-review-all]'))) return void reviewNext();
    if ((b = tgt.closest('[data-cs-discard-all]'))) return discardAll();
    if ((b = tgt.closest('[data-cs-review]'))) return void reviewProposal(b.getAttribute('data-cs-review'), false);
    if ((b = tgt.closest('[data-cs-discard]'))) return discardProposal(b.getAttribute('data-cs-discard'));
    if ((b = tgt.closest('[data-cs-pick]'))) {
      if (state.pop) acceptMention(state.pop.items[Number(b.getAttribute('data-cs-pick'))]);
      return;
    }
    if ((b = tgt.closest('[data-cs-chipkind]'))) {
      var kind = b.getAttribute('data-cs-chipkind');
      if (kind === 'open') state.noActive = true;
      else if (kind === 'open-on') state.noActive = false;
      else removeMention(b.getAttribute('data-cs-unchip') || '');
      return paintChips();
    }
    if ((b = tgt.closest('[data-cs-apply]'))) {
      var host = b.closest('[data-msg]');
      if (host) applyBlock(host.getAttribute('data-msg'), Number(b.getAttribute('data-cs-apply')));
      return;
    }
    if ((b = tgt.closest('[data-cs-connect]'))) {
      var w = win();
      var AI = w.Engine && w.Engine.AI;
      if (AI && AI.ensure) AI.ensure().then(function (st) {
        if (st && st.connected) mount();
        else if (w.S && w.renderAll) { w.S.screen = 'settings'; w.renderAll(); }
      });
      return;
    }
    if ((b = tgt.closest('[data-cs-copy]'))) {
      var msgEl = b.closest('[data-msg]');
      var id = msgEl && msgEl.getAttribute('data-msg');
      var m = thread().messages.filter(function (x) { return x.id === id; })[0];
      var code = m ? codeBlocks(m.content)[Number(b.getAttribute('data-cs-copy'))] : null;
      if (code != null) {
        try { win().navigator.clipboard.writeText(code); b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200); }
        catch (_) { b.textContent = 'Copy failed'; }
      }
    }
  }

  win().CSChat = {
    mount: mount, send: send, stop: stop, newThread: newThread,
    applyToFile: applyToFile, applyBlock: applyBlock,
    setMode: setMode, get mode() { return state.mode; },
    reviewProposal: reviewProposal, reviewAll: reviewNext, discardProposal: discardProposal, discardAll: discardAll,
    proposals: proposalList,
    get busy() { return state.busy; },
    thread: thread,
    core: {
      renderMarkdown: renderMarkdown, codeBlocks: codeBlocks, codeFences: codeFences, buildMessages: buildMessages,
      parseMentions: parseMentions, resolveAttachments: resolveAttachments, applyTarget: applyTarget, normPath: normPath,
      loadStore: loadStore, STORE_KEY: STORE_KEY, SYSTEM_PROMPT: SYSTEM_PROMPT,
      _state: state, _reload: function () { state.store = loadStore(); state.busy = false; state.ctrl = null; state.draft = ''; }
    }
  };
})();
