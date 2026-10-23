/* =====================================================================
   engine.review.js — line diff + hunk accept/reject for AI edits

   The editor shows an AI edit (Ctrl+K, agent run) as hunks the user can
   accept or reject one by one. This file is the pure part: no DOM, no
   Monaco, so the same logic is unit-tested in Node.

   Engine.Review.diffLines(a, b)            -> [{ t: 'eq'|'del'|'add', line }]
   Engine.Review.hunks(original, modified)  -> [{ id, oldStart, oldLines,
                                                   newStart, newLines }]
       oldStart / newStart are 0-based line indexes into each text.
   Engine.Review.apply(original, modified, accepted)
       accepted: array / Set of hunk ids, or a function (hunk) => boolean.
       Accepted hunks take the new lines, the rest keep the old ones.
   Engine.Review.stats(original, modified)  -> { hunks, added, removed }
   Engine.Review.snapshot(FS)               -> { path: content }
   Engine.Review.collect(before, FS)        -> changed files since `before`
   Engine.Review.reject(FS, change)         restore one file to `before`
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});

  // Past this many lines (after trimming the common head and tail) Myers'
  // trace gets large; one hunk for the whole middle is the honest fallback.
  const MAX_MIDDLE = 6000;

  function lines(text) { return String(text == null ? '' : text).split('\n'); }

  function myers(a, b) {
    const n = a.length, m = b.length, max = n + m;
    if (!max) return [];
    const off = max;
    let v = new Int32Array(2 * max + 2);
    const trace = [];
    let found = false;
    for (let d = 0; d <= max && !found; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) { found = true; break; }
      }
    }
    const ops = [];
    let x = n, y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vv = trace[d];
      const k = x - y;
      let pk;
      if (k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1])) pk = k + 1; else pk = k - 1;
      const px = vv[off + pk], py = px - pk;
      while (x > px && y > py) { ops.push({ t: 'eq', line: a[x - 1] }); x--; y--; }
      if (d > 0) {
        if (x === px) { ops.push({ t: 'add', line: b[y - 1] }); y--; }
        else { ops.push({ t: 'del', line: a[x - 1] }); x--; }
      }
    }
    return ops.reverse();
  }

  function diffLines(aText, bText) {
    const a = lines(aText), b = lines(bText);
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    const ma = a.slice(head, a.length - tail), mb = b.slice(head, b.length - tail);
    const ops = [];
    for (let i = 0; i < head; i++) ops.push({ t: 'eq', line: a[i] });
    if (ma.length + mb.length > MAX_MIDDLE) {
      ma.forEach(function (l) { ops.push({ t: 'del', line: l }); });
      mb.forEach(function (l) { ops.push({ t: 'add', line: l }); });
    } else {
      myers(ma, mb).forEach(function (o) { ops.push(o); });
    }
    for (let i = a.length - tail; i < a.length; i++) ops.push({ t: 'eq', line: a[i] });
    return ops;
  }

  function hunks(original, modified) {
    const ops = diffLines(original, modified);
    const out = [];
    let oi = 0, ni = 0, cur = null;
    ops.forEach(function (op) {
      if (op.t === 'eq') {
        if (cur) { out.push(cur); cur = null; }
        oi++; ni++;
        return;
      }
      if (!cur) cur = { id: out.length, oldStart: oi, oldLines: [], newStart: ni, newLines: [] };
      if (op.t === 'del') { cur.oldLines.push(op.line); oi++; }
      else { cur.newLines.push(op.line); ni++; }
    });
    if (cur) out.push(cur);
    return out;
  }

  function acceptedFn(accepted) {
    if (typeof accepted === 'function') return accepted;
    const set = accepted instanceof Set ? accepted : new Set(accepted || []);
    return function (h) { return set.has(h.id); };
  }

  function apply(original, modified, accepted) {
    const keep = acceptedFn(accepted);
    const a = lines(original);
    const out = [];
    let pos = 0;
    hunks(original, modified).forEach(function (h) {
      for (; pos < h.oldStart; pos++) out.push(a[pos]);
      (keep(h) ? h.newLines : h.oldLines).forEach(function (l) { out.push(l); });
      pos = h.oldStart + h.oldLines.length;
    });
    for (; pos < a.length; pos++) out.push(a[pos]);
    return out.join('\n');
  }

  function stats(original, modified) {
    const hs = hunks(original, modified);
    let added = 0, removed = 0;
    hs.forEach(function (h) { added += h.newLines.length; removed += h.oldLines.length; });
    return { hunks: hs.length, added: added, removed: removed };
  }

  function snapshot(FS) {
    const out = {};
    const data = (FS && FS._data) || {};
    Object.keys(data).forEach(function (p) {
      const e = data[p];
      if (e && e.type === 'file') out[p] = String(e.content == null ? '' : e.content);
    });
    return out;
  }

  // Files that differ between a snapshot taken before an agent run and now.
  function collect(before, FS) {
    const now = snapshot(FS);
    const out = [];
    Object.keys(now).forEach(function (p) {
      if (!(p in before)) {
        const s = stats('', now[p]);
        out.push({ path: p, status: 'added', before: null, after: now[p], added: s.added, removed: 0 });
      } else if (before[p] !== now[p]) {
        const s = stats(before[p], now[p]);
        out.push({ path: p, status: 'modified', before: before[p], after: now[p], added: s.added, removed: s.removed });
      }
    });
    Object.keys(before).forEach(function (p) {
      if (!(p in now)) {
        const s = stats(before[p], '');
        out.push({ path: p, status: 'deleted', before: before[p], after: null, added: 0, removed: s.removed });
      }
    });
    out.sort(function (x, y) { return x.path < y.path ? -1 : x.path > y.path ? 1 : 0; });
    return out;
  }

  // Put a file back the way it was before the run.
  function reject(FS, change) {
    if (!change) return;
    if (change.status === 'added') FS.remove(change.path);
    else FS.write(change.path, change.before);
  }

  Engine.Review = {
    diffLines: diffLines, hunks: hunks, apply: apply, stats: stats,
    snapshot: snapshot, collect: collect, reject: reject
  };
})();
