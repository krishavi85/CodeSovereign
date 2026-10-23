'use strict';
/* engine.review.js — hunk diff + accept/reject for AI edits (pure logic). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const win = {};
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.review.js'), 'utf8'), vm.createContext(win), { filename: 'engine.review.js' });
  return win.Engine.Review;
}

module.exports = async function (t) {
  const R = load();
  const A = 'a\nb\nc\nd\ne\nf\ng';

  t.deepEqual('identical texts have no hunks', R.hunks(A, A), []);

  // one replaced line
  const B = 'a\nb\nC\nd\ne\nf\ng';
  const h1 = R.hunks(A, B);
  t.ok('a single changed line is one hunk', h1.length === 1 && h1[0].oldLines.join() === 'c' && h1[0].newLines.join() === 'C');
  t.ok('hunk positions are 0-based line indexes', h1[0].oldStart === 2 && h1[0].newStart === 2);
  t.equal('accepting it gives the new text', R.apply(A, B, [0]), B);
  t.equal('rejecting it gives the old text', R.apply(A, B, []), A);

  // two separate hunks, accept one reject the other
  const C = 'a\nB\nc\nd\ne\nF\nF2\ng';
  const h2 = R.hunks(A, C);
  t.equal('two changes separated by unchanged lines are two hunks', h2.length, 2);
  t.equal('accept only the first hunk', R.apply(A, C, [0]), 'a\nB\nc\nd\ne\nf\ng');
  t.equal('accept only the second hunk', R.apply(A, C, [1]), 'a\nb\nc\nd\ne\nF\nF2\ng');
  t.equal('accept all', R.apply(A, C, h2.map((h) => h.id)), C);
  t.equal('a predicate chooses hunks too', R.apply(A, C, (h) => h.newLines.length > 1), 'a\nb\nc\nd\ne\nF\nF2\ng');

  // pure insertion and pure deletion
  const ins = 'a\nb\nNEW1\nNEW2\nc\nd\ne\nf\ng';
  const hi = R.hunks(A, ins);
  t.ok('an insertion has no old lines', hi.length === 1 && hi[0].oldLines.length === 0 && hi[0].newLines.length === 2);
  t.equal('rejecting an insertion removes it', R.apply(A, ins, []), A);
  const del = 'a\nb\nf\ng';
  const hd = R.hunks(A, del);
  t.ok('a deletion has no new lines', hd.length === 1 && hd[0].newLines.length === 0 && hd[0].oldLines.join() === 'c,d,e');
  t.equal('rejecting a deletion restores it', R.apply(A, del, []), A);
  t.equal('accepting a deletion drops it', R.apply(A, del, [0]), del);

  // edges: first line, last line, empty texts
  t.equal('first-line change round-trips', R.apply(A, 'X\n' + A.slice(2), [0]), 'X\n' + A.slice(2));
  t.equal('last-line change round-trips', R.apply(A, A.slice(0, -1) + 'Z', [0]), A.slice(0, -1) + 'Z');
  t.equal('empty original: accept gives the new text', R.apply('', 'x\ny', [0]), 'x\ny');
  t.equal('empty modified: reject keeps the original', R.apply('x\ny', '', []), 'x\ny');
  t.equal('trailing newline is preserved', R.apply('a\nb\n', 'a\nB\n', [0]), 'a\nB\n');

  // invariants over a batch of random edits
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let ok = true;
  for (let i = 0; i < 60 && ok; i++) {
    const base = Array.from({ length: 5 + rnd(30) }, (_, k) => 'line' + k);
    const mod = base.slice();
    for (let e = 0; e < 1 + rnd(6); e++) {
      const at = rnd(mod.length + 1), r = rnd(3);
      if (r === 0) mod.splice(at, 1);
      else if (r === 1) mod.splice(at, 0, 'new' + rnd(100));
      else if (at < mod.length) mod[at] = 'chg' + rnd(100);
    }
    const o = base.join('\n'), m = mod.join('\n');
    const hs = R.hunks(o, m);
    const all = hs.map((h) => h.id);
    if (R.apply(o, m, all) !== m || R.apply(o, m, []) !== o) ok = false;
    // any subset must keep every line of either side in order: apply never loses a hunk's text
    if (hs.length > 1 && R.apply(o, m, [hs[0].id]).split('\n').length !== o.split('\n').length - hs[0].oldLines.length + hs[0].newLines.length) ok = false;
  }
  t.ok('random edits: accept-all = modified, reject-all = original, partial accepts add up', ok);

  // large middles fall back to one hunk instead of a huge trace
  const big1 = Array.from({ length: 4000 }, (_, i) => 'p' + i).join('\n');
  const big2 = Array.from({ length: 4000 }, (_, i) => 'q' + i).join('\n');
  const hb = R.hunks(big1, big2);
  t.ok('a huge rewrite is a single hunk', hb.length === 1 && R.apply(big1, big2, [0]) === big2 && R.apply(big1, big2, []) === big1);

  t.deepEqual('stats counts added / removed lines', R.stats(A, C), { hunks: 2, added: 3, removed: 2 });

  // collect / reject against an FS-shaped object
  const FS = { _data: {}, write(p, c) { this._data[p] = { type: 'file', content: c }; }, remove(p) { delete this._data[p]; } };
  FS.write('/keep.js', 'same'); FS.write('/edit.js', 'v1\nv1b'); FS.write('/gone.js', 'bye');
  FS._data['/dir'] = { type: 'dir' };
  const before = R.snapshot(FS);
  t.ok('snapshot holds files only', Object.keys(before).sort().join() === '/edit.js,/gone.js,/keep.js');
  FS.write('/edit.js', 'v2\nv1b'); FS.write('/new.js', 'hello'); FS.remove('/gone.js');
  const ch = R.collect(before, FS);
  t.deepEqual('collect reports added / modified / deleted, sorted',
    ch.map((c) => c.path + ':' + c.status), ['/edit.js:modified', '/gone.js:deleted', '/new.js:added']);
  t.ok('modified file has line counts', ch[0].added === 1 && ch[0].removed === 1);
  ch.forEach((c) => R.reject(FS, c));
  t.deepEqual('rejecting every change restores the snapshot', R.snapshot(FS), before);
};
