/* =====================================================================
   engine.problemfix.js — the Problems tab's "Fix" / "Fix all" buttons.

   Two kinds of fix:
   - QUICK (instant, no AI): problems with a mechanical, meaning-preserving
     fix — an <img> without alt text, <html> without lang, console.log left
     in browser code. Reuses UnresolvedInspector.applyWorkaround for those.
     Its other workarounds (eval -> JSON.parse, "// TODO" -> "// done", …)
     hide a problem instead of fixing it, so they are deliberately not used.
   - AI: everything else, as ONE focused request per file
     (Engine.LLM.fixProblems) — that file, its problems and directly related
     files, never the whole app.
   A problem only counts as fixed when the validators no longer report it.
   ===================================================================== */
(function () {
  'use strict';
  var QUICK = { 'html.alt': true, 'html.lang': true, 'js.console': true };

  function E() { return window.Engine || {}; }
  function validate() { try { return (E().Validator && E().Validator.runAll()) || []; } catch (_) { return []; } }
  // Identity for "is it still there": class + file, plus the message for
  // per-require problems (a file can have several missing modules).
  function same(a, b) {
    return a.faultClass === b.faultClass && a.file === b.file &&
      (a.faultClass !== 'js.missing-module' || a.message === b.message);
  }
  function stillThere(issue) { return validate().some(function (n) { return same(n, issue); }); }

  function canQuickFix(issue) { return !!(issue && QUICK[issue.faultClass] && issue.file && E().UnresolvedInspector); }
  function aiReady() {
    var L = E().LLM;
    try { return !!(L && L.fixProblems && L.isConfigured && L.isConfigured()); } catch (_) { return false; }
  }
  function canFix(issue) { return !!(issue && issue.file) && (canQuickFix(issue) || aiReady()); }

  function quickFix(issue) {
    var r;
    if (issue.faultClass === 'js.console') {
      // Remove whole console.log statement lines (the shared workaround leaves
      // a "/* console.log removed */" comment in their place).
      var FS = E().FS, c = FS && FS.exists(issue.file) ? (FS.read(issue.file) || '') : null;
      var n = c == null ? null : c.replace(/^[ \t]*console\.log\s*\((?:[^;\n]|\([^;\n]*\))*\);?[ \t]*\r?\n?/gm, '');
      if (n != null && n !== c) FS.write(issue.file, n);
      r = { ok: n != null && n !== c };
    } else {
      r = E().UnresolvedInspector.applyWorkaround({ faultClass: issue.faultClass, issue: issue });
    }
    var fixed = !!(r && r.ok) && !stillThere(issue);
    return { ok: fixed, how: 'quick', error: fixed ? null : 'the automatic fix did not clear it' };
  }

  function aiFixFile(file, issues) {
    return E().LLM.fixProblems(file, issues).then(function (r) {
      var left = issues.filter(stillThere);
      return { ok: !!(r && r.ok) && left.length === 0, how: 'ai', fixed: issues.length - left.length, left: left, error: (r && r.error) || (left.length ? left.length + ' problem(s) remain in ' + file : null) };
    });
  }

  // One problem. Resolves { ok, how, error }.
  function fixOne(issue) {
    if (!issue || !issue.file) return Promise.resolve({ ok: false, error: 'this problem is not tied to a file' });
    if (canQuickFix(issue)) return Promise.resolve(quickFix(issue));
    if (!aiReady()) return Promise.resolve({ ok: false, error: 'connect an AI model in Settings to fix this kind of problem' });
    return aiFixFile(issue.file, [issue]);
  }

  // Every fixable problem: quick fixes first (instant), then one AI request
  // per remaining file. onProgress(text) reports each step.
  // Resolves { fixed, remaining, errors:[…] }.
  function fixAll(issues, onProgress) {
    var say = function (t) { try { onProgress && onProgress(t); } catch (_) {} };
    var list = (issues || []).filter(function (i) { return i && i.file; });
    var errors = [];
    var quick = list.filter(canQuickFix);
    quick.forEach(function (i) { var r = quickFix(i); if (!r.ok) errors.push(i.file + ': ' + r.error); });
    if (quick.length) say('Applied ' + quick.length + ' quick fix' + (quick.length === 1 ? '' : 'es'));
    var rest = list.filter(function (i) { return !canQuickFix(i) && stillThere(i); });
    if (rest.length && !aiReady()) {
      errors.push(rest.length + ' problem(s) need an AI model — connect one in Settings');
      rest = [];
    }
    var byFile = {};
    rest.forEach(function (i) { (byFile[i.file] = byFile[i.file] || []).push(i); });
    var files = Object.keys(byFile);
    return files.reduce(function (p, file, n) {
      return p.then(function () {
        say('Fixing ' + file + ' with AI (' + (n + 1) + '/' + files.length + ')…');
        return aiFixFile(file, byFile[file]).then(function (r) { if (!r.ok && r.error) errors.push(file + ': ' + r.error); });
      });
    }, Promise.resolve()).then(function () {
      var before = list.length;
      var remaining = list.filter(stillThere).length;
      return { fixed: before - remaining, remaining: remaining, errors: errors };
    });
  }

  window.Engine = window.Engine || {};
  window.Engine.ProblemFix = { canQuickFix: canQuickFix, canFix: canFix, aiReady: aiReady, fixOne: fixOne, fixAll: fixAll, QUICK: QUICK };
})();
