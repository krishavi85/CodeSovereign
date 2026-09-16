/* =====================================================================
   engine.tab.js — CodeSovereign Agent Tab (lightweight autocomplete)

   Separate from the heavyweight Agent. This layer only predicts the next
   edit from the open buffer, nearby files, recent keystrokes, and
   validator issues. It never starts a full generate/repair loop.

   Engine.Tab.suggest({ path, content, cursor, selectionStart, selectionEnd })
   Engine.Tab.apply(suggestion, content)
   Engine.Tab.applyRelated(suggestion)
   Engine.Tab.recordEdit(...)
   Engine.Tab.recent()
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});
  const recent = [];
  const MAX_RECENT = 16;

  function fsList() {
    const FS = Engine.FS;
    if (!FS || !FS._data) return [];
    return Object.keys(FS._data).filter(function (p) { return FS.isFile(p); });
  }

  function fsRead(p) {
    try { return (Engine.FS && Engine.FS.read && Engine.FS.read(p)) || ''; } catch (_) { return ''; }
  }

  function lineInfo(content, cursor) {
    content = String(content || '');
    cursor = Math.max(0, Math.min(cursor || 0, content.length));
    const lineStart = content.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
    let lineEnd = content.indexOf('\n', cursor);
    if (lineEnd < 0) lineEnd = content.length;
    const line = content.slice(lineStart, lineEnd);
    return { lineStart: lineStart, lineEnd: lineEnd, line: line, col: cursor - lineStart, lineNo: content.slice(0, lineStart).split('\n').length };
  }

  function identAt(content, cursor) {
    const left = String(content || '').slice(0, cursor).match(/[A-Za-z_$][\w$]*$/);
    const right = String(content || '').slice(cursor).match(/^[A-Za-z_$][\w$]*/);
    return ((left && left[0]) || '') + ((right && right[0]) || '');
  }

  function isDeclared(content, name) {
    if (!name) return true;
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b(?:function|class|const|let|var)\\s+' + n + '\\b').test(content)
      || new RegExp('\\bimport\\s+(?:\\{[^}]*\\b' + n + '\\b|\\*\\s+as\\s+' + n + '|' + n + ')\\b').test(content);
  }

  function findExport(name, skipPath) {
    if (!name || name.length < 2) return null;
    const re = new RegExp('\\bexport\\s+(?:default\\s+)?(?:async\\s+)?(?:function|class|const|let|var)\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    const files = fsList();
    for (let i = 0; i < files.length; i++) {
      const p = files[i];
      if (p === skipPath || !/\.(js|mjs|cjs|ts)$/.test(p)) continue;
      const src = fsRead(p);
      if (re.test(src)) return p;
    }
    return null;
  }

  function relImport(from, to) {
    const a = String(from || '/').replace(/\\/g, '/').split('/').filter(Boolean);
    const b = String(to || '/').replace(/\\/g, '/').split('/').filter(Boolean);
    a.pop();
    while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
    const prefix = a.map(function () { return '..'; }).join('/') || '.';
    let spec = prefix + '/' + b.join('/');
    spec = spec.replace(/\.js$/, '');
    if (!/^\./.test(spec)) spec = './' + spec;
    return spec;
  }

  function firstImportInsertPos(content) {
    const m = String(content || '').match(/^(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*|\s*)*/);
    return m ? m[0].length : 0;
  }

  function similarLine(content, cursor) {
    const info = lineInfo(content, cursor);
    const prefix = info.line.slice(0, info.col);
    if (prefix.trim().length < 4) return null;
    const lines = String(content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i + 1 === info.lineNo) continue;
      const t = lines[i];
      if (t.indexOf(prefix) !== 0 || t.length <= prefix.length) continue;
      const suffix = t.slice(prefix.length);
      const rest = info.line.slice(info.col);
      if (!suffix || rest.indexOf(suffix) === 0) continue;
      if (rest && suffix.indexOf(rest) !== 0 && rest.length > 0) continue;
      return {
        kind: 'line',
        label: 'Complete line from surrounding code',
        text: rest ? suffix.slice(rest.length) : suffix,
        start: cursor,
        end: cursor,
        path: null
      };
    }
    return null;
  }

  function completeStructure(content, cursor) {
    const info = lineInfo(content, cursor);
    const prefix = info.line.slice(0, info.col);
    const rest = info.line.slice(info.col);
    if (/\b(?:async\s+)?function\s+[\w$]+\s*\(\s*$/.test(prefix) && rest.indexOf(')') < 0) {
      return { kind: 'block', label: 'Complete function body', text: ') {\n  \n}', start: cursor, end: cursor, path: null };
    }
    if (/=>\s*$/.test(prefix) && !rest.trim()) {
      return { kind: 'block', label: 'Complete arrow function', text: ' {\n  \n}', start: cursor, end: cursor, path: null };
    }
    if (/{\s*$/.test(prefix) && !rest.trim()) {
      const indent = (prefix.match(/^\s*/) || [''])[0];
      return { kind: 'block', label: 'Close block', text: '\n' + indent + '  \n' + indent + '}', start: cursor, end: cursor, path: null };
    }
    const openTag = prefix.match(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(?!.*<\/\1>)\s*$/);
    if (openTag && !rest.trim()) {
      return { kind: 'line', label: 'Close tag', text: '</' + openTag[1] + '>', start: cursor, end: cursor, path: null };
    }
    return null;
  }

  function rewriteSelection(content, selStart, selEnd) {
    if (selStart == null || selEnd == null || selEnd <= selStart) return null;
    const picked = String(content || '').slice(selStart, selEnd);
    if (/^\s*var\s+/.test(picked)) {
      return { kind: 'rewrite', label: 'Rewrite var to const', text: picked.replace(/\bvar\b/, 'const'), start: selStart, end: selEnd, path: null };
    }
    if (/^\s*function\s*\(/.test(picked)) {
      return { kind: 'rewrite', label: 'Rewrite to arrow function', text: picked.replace(/function\s*\(/, '(').replace(/\)\s*\{/, ') => {'), start: selStart, end: selEnd, path: null };
    }
    return null;
  }

  function suggestImport(path, content, cursor) {
    const name = identAt(content, cursor);
    if (!name || name.length < 2 || isDeclared(content, name)) return null;
    if (!/\.(js|mjs|cjs|ts)$/.test(path || '')) return null;
    const src = findExport(name, path);
    if (!src) return null;
    const spec = relImport(path, src);
    const insert = 'import { ' + name + " } from '" + spec + "';\n";
    const at = firstImportInsertPos(content);
    if (content.indexOf("from '" + spec + "'") >= 0 || content.indexOf('from "' + spec + '"') >= 0) return null;
    return {
      kind: 'import',
      label: 'Add import for ' + name,
      text: insert,
      start: at,
      end: at,
      path: path,
      next: { path: path, reason: 'imported ' + name + ' — keep editing the call site' }
    };
  }

  function suggestLint(path, content, cursor) {
    const info = lineInfo(content, cursor);
    const line = info.line;
    if (/<img\b(?![^>]*\balt=)/i.test(line)) {
      const close = line.lastIndexOf('>');
      if (close >= 0) {
        const abs = info.lineStart + close;
        const before = line.slice(0, close);
        const pad = /\s$/.test(before) ? '' : ' ';
        return {
          kind: 'lint',
          label: 'Add missing alt',
          text: pad + 'alt=""',
          start: abs,
          end: abs,
          path: path
        };
      }
    }
    let issues = [];
    try {
      if (Engine.Validator && Engine.Validator.runAll) issues = Engine.Validator.runAll() || [];
    } catch (_) {}
    const onFile = issues.filter(function (i) { return i.file === path; });
    if (!onFile.length) return null;
    if (onFile.some(function (i) { return /eval/i.test(i.message || ''); }) && /\beval\s*\(/.test(line)) {
      const idx = content.indexOf('eval(', info.lineStart);
      if (idx >= 0 && idx < info.lineEnd) {
        return { kind: 'lint', label: 'Replace eval (linter)', text: 'void 0; /* eval removed */', start: idx, end: content.indexOf(')', idx) + 1, path: path };
      }
    }
    return null;
  }

  function suggestCrossFile(path, content, cursor) {
    const info = lineInfo(content, cursor);
    const related = [];
    let next = null;
    if (/\.html?$/i.test(path || '')) {
      const cls = info.line.match(/class=["']([^"']+)["']/);
      const names = cls ? cls[1].split(/\s+/).filter(Boolean) : [];
      const cssFiles = fsList().filter(function (p) { return /\.css$/i.test(p); }).sort(function (a, b) {
        const rank = function (p) { return /app\.css$/i.test(p) ? 0 : /styles\//.test(p) ? 1 : 2; };
        return rank(a) - rank(b);
      });
      names.forEach(function (name) {
        const needle = new RegExp('\\.' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        const missing = cssFiles.filter(function (p) { return !needle.test(fsRead(p)); });
        const target = missing[0] || cssFiles[0];
        if (!target) return;
        if (needle.test(fsRead(target))) return;
        const cur = fsRead(target);
        related.push({
          path: target,
          start: cur.length,
          end: cur.length,
          text: '\n.' + name + ' {\n  \n}\n',
          kind: 'cross-file',
          label: 'Add .' + name + ' rule'
        });
        next = { path: target, reason: 'style .' + name + ' in ' + target };
      });
    }
    if (/\.(js|mjs|cjs)$/i.test(path || '')) {
      const id = info.line.match(/getElementById\(\s*['"]([^'"]+)['"]/);
      if (id) {
        const htmlFiles = fsList().filter(function (p) { return /\.html?$/i.test(p); });
        const attr = new RegExp('\\bid=["\']' + id[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']');
        const missing = htmlFiles.filter(function (p) { return !attr.test(fsRead(p)); });
        if (missing[0]) {
          const cur = fsRead(missing[0]);
          const body = cur.lastIndexOf('</body>');
          const at = body >= 0 ? body : cur.length;
          related.push({
            path: missing[0],
            start: at,
            end: at,
            text: '<button id="' + id[1] + '">' + id[1] + '</button>\n',
            kind: 'cross-file',
            label: 'Add #' + id[1]
          });
          next = { path: missing[0], reason: 'wire #' + id[1] + ' in markup' };
        }
      }
    }
    if (!related.length) return null;
    return {
      kind: 'cross-file',
      label: next ? next.reason : 'Coordinated edit in another file',
      text: '',
      start: cursor,
      end: cursor,
      path: path,
      related: related,
      next: next
    };
  }

  function suggestFromRecent(path, content, cursor) {
    for (let i = recent.length - 1; i >= 0; i--) {
      const ed = recent[i];
      if (!ed || ed.path === path) continue;
      const fn = (ed.line || '').match(/\bfunction\s+([\w$]+)/);
      if (fn && /\.html?$/i.test(path || '') && content.indexOf(fn[1]) < 0) {
        const info = lineInfo(content, cursor);
        if (!info.line.trim()) {
          return {
            kind: 'block',
            label: 'Use recently added ' + fn[1] + '()',
            text: '<button id="' + fn[1] + '" onclick="' + fn[1] + '()">' + fn[1] + '</button>',
            start: cursor,
            end: cursor,
            path: path,
            next: { path: ed.path, reason: 'return to ' + fn[1] + ' implementation' }
          };
        }
      }
      const cls = (ed.line || '').match(/class=["']([^"']+)["']/);
      if (cls && /\.css$/i.test(path || '')) {
        const name = cls[1].split(/\s+/).filter(Boolean)[0];
        if (name && !new RegExp('\\.' + name + '\\b').test(content)) {
          return {
            kind: 'block',
            label: 'Style recently added .' + name,
            text: '.' + name + ' {\n  \n}\n',
            start: content.length,
            end: content.length,
            path: path
          };
        }
      }
    }
    return null;
  }

  function attachMeta(sug, input) {
    if (!sug) return null;
    sug.path = sug.path || input.path;
    sug.surrounding = surrounding(input.content, input.cursor);
    return sug;
  }

  function surrounding(content, cursor, radius) {
    radius = radius || 4;
    const lines = String(content || '').split('\n');
    const info = lineInfo(content, cursor);
    const from = Math.max(0, info.lineNo - 1 - radius);
    const to = Math.min(lines.length, info.lineNo + radius);
    return lines.slice(from, to).join('\n');
  }

  function suggest(input) {
    input = input || {};
    const path = input.path || '';
    const content = input.content == null ? '' : String(input.content);
    const cursor = input.cursor == null ? content.length : input.cursor;
    const selS = input.selectionStart;
    const selE = input.selectionEnd;
    const rewrite = rewriteSelection(content, selS, selE);
    if (rewrite) return attachMeta(rewrite, input);
    const lint = suggestLint(path, content, cursor);
    if (lint) return attachMeta(lint, input);
    const imp = suggestImport(path, content, cursor);
    if (imp) return attachMeta(imp, input);
    const struct = completeStructure(content, cursor);
    const sib = similarLine(content, cursor);
    const recentSug = suggestFromRecent(path, content, cursor);
    const cross = suggestCrossFile(path, content, cursor);
    const primary = struct || sib || recentSug;
    if (primary && cross) {
      primary.related = (primary.related || []).concat(cross.related || []);
      primary.next = primary.next || cross.next;
      if (cross.kind === 'cross-file' && !primary.kind) primary.kind = 'cross-file';
      return attachMeta(primary, input);
    }
    if (primary) return attachMeta(primary, input);
    if (cross) return attachMeta(cross, input);
    return null;
  }

  function apply(sug, content) {
    content = String(content || '');
    if (!sug) return { content: content, cursor: 0 };
    const start = sug.start == null ? 0 : sug.start;
    const end = sug.end == null ? start : sug.end;
    const text = sug.text == null ? '' : String(sug.text);
    const next = content.slice(0, start) + text + content.slice(end);
    return { content: next, cursor: start + text.length };
  }

  function applyRelated(sug) {
    const FS = Engine.FS;
    const out = [];
    (sug && sug.related || []).forEach(function (r) {
      const cur = fsRead(r.path);
      const next = apply(r, cur);
      if (FS && FS.write) FS.write(r.path, next.content);
      out.push({ path: r.path, content: next.content, cursor: next.cursor });
    });
    return out;
  }

  function recordEdit(entry) {
    if (!entry || !entry.path) return recent.slice();
    recent.push({
      path: entry.path,
      line: String(entry.line || ''),
      cursor: entry.cursor || 0,
      at: Date.now()
    });
    if (recent.length > MAX_RECENT) recent.shift();
    return recent.slice();
  }

  function clearRecent() { recent.length = 0; }

  function isPortal(sug) {
    return !!(sug && sug.next && sug.next.path && sug.next.path !== sug.path);
  }

  Engine.Tab = {
    suggest: suggest,
    apply: apply,
    applyRelated: applyRelated,
    recordEdit: recordEdit,
    recent: function () { return recent.slice(); },
    clearRecent: clearRecent,
    isPortal: isPortal,
    surrounding: surrounding,
    identAt: identAt,
    findExport: findExport,
    SEPARATE_FROM_AGENT: true
  };
  window.TabComplete = Engine.Tab;
})();
