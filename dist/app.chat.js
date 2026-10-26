/* =====================================================================
 * app.chat.js  —  IDE agent chat panel (phase 1: streaming chat)
 *
 * A Claude-style conversation docked in the IDE's right column. It talks to
 * whatever model is connected through Engine.AI (Ollama, LM Studio, OmniRoute,
 * any OpenAI-compatible endpoint) and streams the reply token by token.
 *
 *   window.CSChat
 *     mount()            paint the panel into #csChatHost (idempotent; call
 *                        after every IDE render — state lives here, not in DOM)
 *     send(text)         send a user message, stream the reply
 *     stop()             abort the in-flight reply (the partial text is kept)
 *     newThread()        start a fresh conversation
 *     core               DOM-free pieces (renderMarkdown, buildMessages, store)
 *
 * The panel is read-only in this phase: it answers and explains, and it sees the
 * open file + the project's file list. Editing tools come in a later phase.
 * ===================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'cs.chat.v1';
  var MAX_THREADS = 20;
  var MAX_MSGS = 200;
  var FILE_CHARS = 12000;      // open-file context cap
  var HISTORY_CHARS = 24000;   // conversation context cap
  var FILE_LIST_MAX = 80;

  var SYSTEM_PROMPT =
    'You are the CodeSovereign IDE assistant, working inside the user\'s project.\n' +
    'Be direct and concrete. When you show code, use fenced code blocks with a language tag. ' +
    'Refer to files by their project path. If you are not sure of something in the user\'s code, ' +
    'say so rather than guessing. You can read the context below but you cannot change files yet; ' +
    'when a change is needed, show the exact code and name the file it belongs in.';

  function win() { return typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}); }

  /* ---------------------------------------------------------------- core */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Small, safe markdown: everything is HTML-escaped first, then fenced code,
  // inline code, bold, and bullet lists are re-introduced. No links, no images,
  // no raw HTML — model output is untrusted.
  function renderMarkdown(src) {
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
      return '<div class="csc-code"><div class="csc-code-bar"><span>' + esc(b.lang || 'code') +
        '</span><button type="button" data-cs-copy="' + i + '">Copy</button></div><pre><code>' + esc(b.code) + '</code></pre></div>';
    });
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
    var sys = SYSTEM_PROMPT;
    if (ctx.files && ctx.files.length) {
      sys += '\n\nProject files (' + ctx.files.length + (ctx.filesTruncated ? ', first ' + FILE_LIST_MAX + ' shown' : '') + '):\n' + ctx.files.join('\n');
    }
    if (ctx.activePath) {
      var body = String(ctx.activeContent == null ? '' : ctx.activeContent);
      var cut = body.length > FILE_CHARS;
      sys += '\n\nThe user has this file open: ' + ctx.activePath + (cut ? ' (first ' + FILE_CHARS + ' characters)' : '') +
        '\n```\n' + body.slice(0, FILE_CHARS) + '\n```';
    }
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
      if (j && Array.isArray(j.threads)) return j;
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

  var state = { store: loadStore(), busy: false, ctrl: null, draft: '', renderTimer: null };

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
      if (S.ideFile) {
        ctx.activePath = S.ideFile;
        ctx.activeContent = S.ideBuffer != null ? S.ideBuffer : (FS && FS.read(S.ideFile)) || '';
      }
    } catch (_) { /* context is best-effort */ }
    return ctx;
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
    var userMsg = { id: uid(), role: 'user', content: text, at: Date.now() };
    var botMsg = { id: uid(), role: 'assistant', content: '', at: Date.now(), streaming: true };
    t.messages.push(userMsg, botMsg);
    if (t.title === 'New chat') t.title = text.replace(/\s+/g, ' ').slice(0, 48);
    state.draft = '';

    if (!AI || !AI.chatStream || !aiReady()) {
      botMsg.streaming = false; botMsg.error = true;
      botMsg.content = 'No model is connected. Connect one (Ollama, LM Studio, OmniRoute or any OpenAI-compatible endpoint) and try again.';
      saveStore(); mount();
      return Promise.resolve(botMsg);
    }

    state.busy = true;
    state.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var msgs = buildMessages(t.messages.slice(0, -1), context());
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

  function stop() {
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
    '.csc-send.stop{background:#3b2230;color:#fca5a5}';

  function ensureStyle() {
    var d = doc();
    if (!d || d.getElementById('csChatStyle')) return;
    var s = d.createElement('style'); s.id = 'csChatStyle'; s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  function messageHtml(m) {
    var body = m.role === 'assistant' ? renderMarkdown(m.content) : '<div>' + esc(m.content).replace(/\n/g, '<br>') + '</div>';
    if (m.streaming) body += '<span class="csc-cursor"></span>';
    if (m.stopped) body += '<div class="csc-stopped">Stopped.</div>';
    return body;
  }

  function threadHtml(t) {
    if (!t.messages.length) {
      return '<div class="csc-empty">Ask about your project. The assistant sees the open file and your file list' +
        ' and answers with the model you have connected.</div>';
    }
    return t.messages.map(function (m) {
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
          '<button type="button" data-cs-new="1" title="Start a new conversation">New chat</button></div>' +
        '<div class="csc-chat-msgs">' + threadHtml(t) + '</div>' +
        '<div class="csc-chat-in">' +
          '<textarea id="csChatInput" rows="1" placeholder="Ask about this project…  (Enter to send, Shift+Enter for a new line)"></textarea>' +
          (state.busy ? '<button type="button" class="csc-send stop" data-cs-stop="1">Stop</button>'
                      : '<button type="button" class="csc-send" data-cs-send="1">Send</button>') +
        '</div>' +
      '</div>';
    var box = h.querySelector('.csc-chat-msgs');
    if (box) box.scrollTop = (wasBottom || keepScroll == null) ? box.scrollHeight : keepScroll;
    var input = h.querySelector('#csChatInput');
    if (input) {
      input.value = state.draft || '';
      input.addEventListener('input', function () { state.draft = input.value; });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      });
    }
    h.onclick = onClick;
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
    get busy() { return state.busy; },
    thread: thread,
    core: {
      renderMarkdown: renderMarkdown, codeBlocks: codeBlocks, buildMessages: buildMessages,
      loadStore: loadStore, STORE_KEY: STORE_KEY, SYSTEM_PROMPT: SYSTEM_PROMPT,
      _state: state, _reload: function () { state.store = loadStore(); state.busy = false; state.ctrl = null; state.draft = ''; }
    }
  };
})();
