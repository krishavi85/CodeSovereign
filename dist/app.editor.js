/* =====================================================================
   app.editor.js — Monaco code editor for the IDE tab, plus inline
   accept / reject review of AI edits.

   The IDE used to be a bare <textarea>. This module loads Monaco (vendored
   under vendor/monaco, no CDN) lazily and keeps ONE editor alive across the
   app's innerHTML re-renders: the render emits an empty host <div
   id="ideEditor" data-monaco="1"> and CSEditor.mount() moves the persistent
   editor into it.

   mount() returns a small facade with the textarea surface the rest of
   app.js already uses (value, selectionStart/End, addEventListener,
   oninput, focus) so Ctrl+K / Tab suggestions keep working unchanged.

   CSEditor.ensure(cb)            load Monaco once, then cb()
   CSEditor.ready                 true once it is usable
   CSEditor.mount(host, {path, value})  -> facade (or null if not ready)
   facade.review({ original, onEnd })   show the model's text as hunks
                                        against `original`; per-hunk
                                        Accept / Reject, Accept all / Reject all
   CSEditor.reviewing()           true while a review is open
   ===================================================================== */
(function () {
  'use strict';

  const BASE = 'vendor/monaco/vs';
  const CSS = [
    '.cs-monaco-root{position:absolute;inset:0}',
    '.cs-rv-add{background:rgba(52,211,153,.13)}',
    '.cs-rv-gutter-add{background:#34d399;width:3px!important;margin-left:3px}',
    '.cs-rv-zone{background:rgba(239,68,68,.10);border-top:1px solid rgba(239,68,68,.25);border-bottom:1px solid rgba(239,68,68,.25);font:400 13px/21px "JetBrains Mono",monospace;color:#f0a3a3;overflow:hidden;white-space:pre}',
    '.cs-rv-bar{display:flex;align-items:center;gap:6px;height:22px;padding:0 10px;font:600 11px Inter,sans-serif;color:#9aa3b8;background:rgba(10,14,23,.85)}',
    '.cs-rv-bar button,.cs-rv-top button{font:600 11px Inter,sans-serif;border-radius:5px;padding:1px 8px;cursor:pointer;border:1px solid rgba(255,255,255,.14);background:transparent;color:#c9d1e0}',
    '.cs-rv-bar .acc,.cs-rv-top .acc{border-color:rgba(52,211,153,.5);color:#34d399}',
    '.cs-rv-bar .rej,.cs-rv-top .rej{border-color:rgba(239,68,68,.5);color:#f87171}',
    '.cs-rv-old{padding-left:14px;text-decoration:line-through;text-decoration-color:rgba(239,68,68,.45)}',
    '.cs-rv-top{position:absolute;top:8px;right:22px;z-index:30;display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:9px;background:#141a29;border:1px solid rgba(167,139,250,.4);font:600 11.5px Inter,sans-serif;color:#c9d1e0;box-shadow:0 6px 24px rgba(0,0,0,.45)}',
    '.cs-rv-top kbd{font:500 10px "JetBrains Mono",monospace;color:#7b859c}'
  ].join('');

  let loading = null, monaco = null, editor = null, root = null, ctxTab = null, ctxReview = null, ctxInline = null;
  let facade = null;
  let curPath = null;                  // path of the file in the editor
  const models = new Map();            // path -> { model, view }
  const handlers = { input: [], keydown: [], keyup: [], click: [], scroll: [] };
  let suppress = 0;                    // programmatic edits must not fire 'input'
  let review = null;                   // the open review, if any

  function addStyle() {
    if (document.getElementById('csMonacoStyle')) return;
    const s = document.createElement('style');
    s.id = 'csMonacoStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function ensure(cb) {
    if (CSEditor.ready) { if (cb) cb(); return; }
    if (CSEditor.failed) return;
    if (!loading) {
      loading = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = BASE + '/loader.js';
        s.onerror = function () { reject(new Error('monaco loader missing')); };
        s.onload = function () {
          try {
            // Refuse worker creation up front: the CSP blocks blob workers, and Monaco
            // then runs the (small) editor worker on the main thread without a console error.
            window.MonacoEnvironment = { getWorker: function () { throw new Error('workers are not available here'); } };
            window.require.config({ paths: { vs: BASE } });
            window.require(['vs/editor/editor.main'], function () { monaco = window.monaco; resolve(); }, reject);
          } catch (e) { reject(e); }
        };
        document.head.appendChild(s);
      }).then(function () {
        addStyle();
        // No language-service workers: the app's CSP and file:// origin cannot
        // start them, and the TypeScript service on the main thread would
        // freeze the UI. Highlighting (Monarch) and editing features stay.
        try {
          const ts = monaco.languages.typescript;
          const off = { completionItems: false, hovers: false, documentSymbols: false, definitions: false, references: false, documentHighlights: false, rename: false, diagnostics: false, documentRangeFormattingEdits: false, signatureHelp: false, onTypeFormattingEdits: false, codeActions: false, inlayHints: false };
          ts.javascriptDefaults.setModeConfiguration(off);
          ts.typescriptDefaults.setModeConfiguration(off);
        } catch (_) {}
        monaco.editor.defineTheme('cs-dark', {
          base: 'vs-dark', inherit: true, rules: [],
          colors: { 'editor.background': '#0a0e17', 'editorGutter.background': '#0a0e17', 'minimap.background': '#0a0e17' }
        });
        CSEditor.ready = true;
      }).catch(function (e) {
        CSEditor.failed = true;
        try { console.warn('[editor] Monaco unavailable, using the plain editor:', e && e.message || e); } catch (_) {}
      });
    }
    loading.then(function () { if (CSEditor.ready && cb) cb(); });
  }

  function fire(type, ev) {
    (handlers[type] || []).slice().forEach(function (fn) { try { fn(ev); } catch (e) { try { console.error(e); } catch (_) {} } });
    if (type === 'input' && facade && typeof facade._oninput === 'function') { try { facade._oninput(ev); } catch (_) {} }
  }

  function create() {
    root = document.createElement('div');
    root.className = 'cs-monaco-root';
    editor = monaco.editor.create(root, {
      theme: 'cs-dark', automaticLayout: true, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 21,
      minimap: { enabled: true, scale: 1 }, scrollBeyondLastLine: false, tabSize: 2, insertSpaces: true,
      renderWhitespace: 'selection', smoothScrolling: true, padding: { top: 8 }, fixedOverflowWidgets: true,
      quickSuggestions: false, acceptSuggestionOnEnter: 'smart', wordBasedSuggestions: 'currentDocument',
      glyphMargin: false, folding: true, bracketPairColorization: { enabled: true }, model: null
    });
    ctxTab = editor.createContextKey('csTabSuggestion', false);
    ctxReview = editor.createContextKey('csReviewing', false);
    ctxInline = editor.createContextKey('csInlineOpen', false);

    editor.onDidChangeModelContent(function () {
      if (suppress) return;
      fire('input', { target: facade, type: 'input' });
    });
    // Ctrl+K opens the inline-edit box. Monaco treats Ctrl+K as the start of a
    // chord (Ctrl+K Ctrl+C ...), so take it before Monaco sees it.
    root.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') {
        e.preventDefault(); e.stopPropagation();
        fire('keydown', e);
      }
    }, true);
    editor.onKeyUp(function (e) { fire('keyup', e.browserEvent); });
    editor.onMouseUp(function (e) { fire('click', e.event && e.event.browserEvent || {}); });
    editor.onDidScrollChange(function () { fire('scroll', {}); });

    const K = monaco.KeyCode, M = monaco.KeyMod;
    const pass = function (key, extra) {
      return function () { fire('keydown', Object.assign({ key: key, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault: function () {}, stopPropagation: function () {} }, extra || {})); };
    };
    // Tab accepts the Agent-Tab suggestion only while one is showing (and the
    // completion popup is closed); otherwise Monaco indents as usual.
    editor.addCommand(K.Tab, pass('Tab'), 'csTabSuggestion && !suggestWidgetVisible && !inSnippetMode');
    editor.addCommand(K.Escape, function () {
      if (review) { review.rejectAll(); return; }
      fire('keydown', { key: 'Escape', preventDefault: function () {}, stopPropagation: function () {} });
    }, 'csReviewing || csTabSuggestion || csInlineOpen');
    editor.addCommand(M.CtrlCmd | K.KeyS, function () { fire('keydown', { key: 's', ctrlKey: true, shiftKey: false, preventDefault: function () {}, stopPropagation: function () {} }); });
    editor.addCommand(M.CtrlCmd | K.Enter, function () { if (review) review.acceptAll(); }, 'csReviewing');
  }

  function modelFor(path, value) {
    const key = String(path || '(untitled)');
    let rec = models.get(key);
    if (!rec || rec.model.isDisposed()) {
      const uri = monaco.Uri.parse('inmemory://cs/' + encodeURI(key.replace(/^\/+/, '')));
      const existing = monaco.editor.getModel(uri);
      rec = { model: existing || monaco.editor.createModel(String(value == null ? '' : value), undefined, uri), view: null };
      models.set(key, rec);
    }
    return rec;
  }

  function replaceAll(model, text) {
    suppress++;
    try {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: text }], function () { return null; });
      model.pushStackElement();
    } finally { suppress--; }
  }

  // ---- the facade the rest of app.js talks to -----------------------------
  function makeFacade() {
    const f = {
      dataset: {},
      get value() { const m = editor && editor.getModel(); return m ? m.getValue() : ''; },
      set value(v) { const m = editor && editor.getModel(); if (m && m.getValue() !== v) replaceAll(m, String(v)); },
      get selectionStart() { const m = editor.getModel(), s = editor.getSelection(); return m && s ? Math.min(m.getOffsetAt(s.getStartPosition()), m.getOffsetAt(s.getEndPosition())) : 0; },
      set selectionStart(o) { f._setSel(o, f.selectionEnd); },
      get selectionEnd() { const m = editor.getModel(), s = editor.getSelection(); return m && s ? Math.max(m.getOffsetAt(s.getStartPosition()), m.getOffsetAt(s.getEndPosition())) : 0; },
      set selectionEnd(o) { f._setSel(f.selectionStart, o); },
      get clientWidth() { return root ? root.clientWidth : 0; },
      get oninput() { return f._oninput || null; },
      set oninput(fn) { f._oninput = fn; },
      _setSel: function (a, b) {
        const m = editor.getModel(); if (!m) return;
        const pa = m.getPositionAt(a), pb = m.getPositionAt(Math.max(a, b));
        editor.setSelection(new monaco.Selection(pa.lineNumber, pa.column, pb.lineNumber, pb.column));
      },
      addEventListener: function (type, fn) { if (handlers[type]) handlers[type].push(fn); },
      focus: function () { try { editor.focus(); } catch (_) {} },
      setTabActive: function (on) { if (ctxTab) ctxTab.set(!!on); },
      setInlineOpen: function (on) { if (ctxInline) ctxInline.set(!!on); },
      // Pixel position of a text offset, shaped for the overlay code in app.js,
      // which adds the 16px / 8px editor padding back.
      caretPixel: function (pos) {
        const m = editor.getModel(); if (!m) return { x: 0, y: 0 };
        const p = editor.getScrolledVisiblePosition(m.getPositionAt(pos));
        return p ? { x: p.left - 16, y: p.top - 8 } : { x: 0, y: 0 };
      },
      review: function (opts) { return startReview(opts); }
    };
    return f;
  }

  function mount(host, opts) {
    if (!CSEditor.ready || !host) return null;
    opts = opts || {};
    if (!editor) { create(); facade = makeFacade(); }
    if (root.parentNode !== host) host.appendChild(root);
    const path = String(opts.path || '(untitled)');
    curPath = path;
    const rec = modelFor(path, opts.value);
    const cur = editor.getModel();
    if (review && review.path !== path) review.end('left');
    if (cur !== rec.model) {
      const prev = cur && [...models.values()].find(function (r) { return r.model === cur; });
      if (prev) prev.view = editor.saveViewState();
      editor.setModel(rec.model);
      if (rec.view) editor.restoreViewState(rec.view);
    }
    // The app owns the buffer (it reloads files from disk / the agent): follow
    // it unless a review is rewriting the text right now.
    if (!review && opts.value != null && rec.model.getValue() !== String(opts.value)) replaceAll(rec.model, String(opts.value));
    editor.layout();
    return facade;
  }

  // ---- inline review of an AI edit ----------------------------------------
  function startReview(opts) {
    const R = window.Engine && window.Engine.Review;
    const model = editor && editor.getModel();
    if (!R || !model) return null;
    if (review) review.end('replaced');
    const original = String(opts.original == null ? '' : opts.original);
    const hs = R.hunks(original, model.getValue());
    if (!hs.length) return null;
    const lineH = editor.getOption(monaco.editor.EditorOption.lineHeight);
    const states = [];
    let done = false;
    let accepted = 0, rejected = 0;

    const maxCol = function (ln) { return model.getLineMaxColumn(ln); };

    function layoutZones() {
      editor.changeViewZones(function (acc) {
        states.forEach(function (s) {
          if (s.resolved) return;
          const r = model.getDecorationRange(s.deco);
          if (!r) return;
          const after = s.eof ? r.startLineNumber : s.empty ? Math.max(0, r.startLineNumber - 1) : r.startLineNumber - 1;
          if (s.zone.afterLineNumber !== after) { s.zone.afterLineNumber = after; acc.layoutZone(s.zoneId); }
        });
      });
    }

    function drop(s) {
      if (s.resolved) return;
      s.resolved = true;
      model.deltaDecorations([s.deco], []);
      editor.changeViewZones(function (acc) { acc.removeZone(s.zoneId); });
    }

    function finish(reason) {
      if (done) return;
      done = true;
      states.forEach(drop);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      ctxReview.set(false);
      sub.dispose();
      if (review === api) review = null;
      if (opts.onEnd) { try { opts.onEnd({ text: model.getValue(), accepted: accepted, rejected: rejected, reason: reason || 'done' }); } catch (e) { try { console.error(e); } catch (_) {} } }
    }

    function remaining() { return states.filter(function (s) { return !s.resolved; }).length; }
    function refreshBar() {
      const n = remaining();
      label.textContent = n + ' change' + (n === 1 ? '' : 's') + ' to review';
      if (!n) finish('done');
    }

    function rejectHunk(s) {
      if (s.resolved) return;
      const r = model.getDecorationRange(s.deco);
      const h = s.h, lines = model.getLineCount();
      let edit;
      if (h.newLines.length) {
        const a = r.startLineNumber, b = r.endLineNumber;
        if (h.oldLines.length) edit = { range: new monaco.Range(a, 1, b, maxCol(b)), text: h.oldLines.join('\n') };
        else if (b < lines) edit = { range: new monaco.Range(a, 1, b + 1, 1), text: '' };
        else if (a > 1) edit = { range: new monaco.Range(a - 1, maxCol(a - 1), b, maxCol(b)), text: '' };
        else edit = { range: new monaco.Range(1, 1, b, maxCol(b)), text: '' };
      } else {
        const a = r.startLineNumber;
        if (s.eof) edit = { range: new monaco.Range(lines, maxCol(lines), lines, maxCol(lines)), text: '\n' + h.oldLines.join('\n') };
        else if (a <= lines) edit = { range: new monaco.Range(a, 1, a, 1), text: h.oldLines.join('\n') + '\n' };
        else edit = { range: new monaco.Range(lines, maxCol(lines), lines, maxCol(lines)), text: '\n' + h.oldLines.join('\n') };
      }
      drop(s);
      suppress++;
      try { model.pushEditOperations([], [edit], function () { return null; }); model.pushStackElement(); } finally { suppress--; }
      rejected++;
      fire('input', { target: facade, type: 'input' });
      layoutZones();
      refreshBar();
    }
    function acceptHunk(s) {
      if (s.resolved) return;
      drop(s);
      accepted++;
      refreshBar();
    }

    // overlay bar
    const bar = document.createElement('div');
    bar.className = 'cs-rv-top';
    const label = document.createElement('span');
    const accAll = document.createElement('button'); accAll.className = 'acc'; accAll.textContent = 'Accept all';
    const rejAll = document.createElement('button'); rejAll.className = 'rej'; rejAll.textContent = 'Reject all';
    const hint = document.createElement('kbd'); hint.textContent = 'Ctrl+Enter / Esc';
    bar.appendChild(label); bar.appendChild(accAll); bar.appendChild(rejAll); bar.appendChild(hint);
    root.appendChild(bar);

    const api = {
      path: String(opts.path || curPath || '(untitled)'),
      acceptAll: function () { states.slice().forEach(acceptHunk); },
      rejectAll: function () {
        if (done) return;
        rejected += remaining();
        states.forEach(drop);
        const cur = model.getValue();
        if (cur !== original) { replaceAll(model, original); fire('input', { target: facade, type: 'input' }); }
        finish('rejected');
      },
      end: function (reason) { finish(reason); },
      remaining: remaining
    };
    accAll.onclick = function () { api.acceptAll(); };
    rejAll.onclick = function () { api.rejectAll(); };

    // decorations + zones, one per hunk
    const decos = model.deltaDecorations([], hs.map(function (h) {
      const a = h.newStart + 1, b = h.newStart + h.newLines.length;
      // a deletion at the very end has no line to anchor on: pin it to the end of the last line
      if (!h.newLines.length && a > model.getLineCount()) {
        const last = model.getLineCount();
        return { range: new monaco.Range(last, maxCol(last), last, maxCol(last)), options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } };
      }
      return h.newLines.length
        ? { range: new monaco.Range(a, 1, b, maxCol(b)), options: { isWholeLine: true, className: 'cs-rv-add', linesDecorationsClassName: 'cs-rv-gutter-add', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } }
        : { range: new monaco.Range(a, 1, a, 1), options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } };
    }));
    editor.changeViewZones(function (acc) {
      hs.forEach(function (h, i) {
        const s = { h: h, deco: decos[i], empty: !h.newLines.length, resolved: false, eof: !h.newLines.length && h.newStart >= model.getLineCount() };
        const dom = document.createElement('div');
        dom.className = 'cs-rv-zone';
        const tools = document.createElement('div');
        tools.className = 'cs-rv-bar';
        const accB = document.createElement('button'); accB.className = 'acc'; accB.textContent = 'Accept';
        const rejB = document.createElement('button'); rejB.className = 'rej'; rejB.textContent = 'Reject';
        const note = document.createElement('span');
        note.textContent = (h.oldLines.length ? '−' + h.oldLines.length : '') + (h.oldLines.length && h.newLines.length ? ' ' : '') + (h.newLines.length ? '+' + h.newLines.length : '');
        tools.appendChild(accB); tools.appendChild(rejB); tools.appendChild(note);
        dom.appendChild(tools);
        h.oldLines.forEach(function (l) {
          const row = document.createElement('div');
          row.className = 'cs-rv-old';
          row.style.height = lineH + 'px';
          row.textContent = l === '' ? ' ' : l;
          dom.appendChild(row);
        });
        accB.onclick = function () { acceptHunk(s); };
        rejB.onclick = function () { rejectHunk(s); };
        s.zone = { afterLineNumber: h.newStart, heightInPx: 22 + h.oldLines.length * lineH, domNode: dom, suppressMouseDown: false };
        s.zoneId = acc.addZone(s.zone);
        states.push(s);
      });
    });
    const sub = editor.onDidChangeModelContent(layoutZones);
    ctxReview.set(true);
    review = api;
    refreshBar();
    // jump to the first change
    try { editor.revealLineInCenterIfOutsideViewport(hs[0].newStart + 1); } catch (_) {}
    return api;
  }

  const CSEditor = window.CSEditor = {
    ready: false, failed: false,
    ensure: ensure, mount: mount,
    reviewing: function () { return !!review; },
    current: function () { return facade; },
    endReview: function (why) { if (review) review.end(why || 'ended'); }
  };
})();
