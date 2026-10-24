'use strict';
/* electron/lib/snapshots.js — crash-recovery snapshots must never blow past
 * V8's max string length on a real project (generated app + node_modules +
 * build output). Regression coverage for the size caps + directory exclusion
 * added after a RangeError: Invalid string length was observed mid-run.
 *
 * snapshots.js pulls in `require('electron')` for app.getPath('userData'); this
 * file runs under plain `node test/run.js`. The `electron` package resolves to
 * a fixed real path even outside the Electron binary (it just isn't `{app}`
 * there), so — rather than patching the module resolver, which other tests may
 * have already bypassed by caching `electron/lib/snapshots.js` itself before
 * this file runs — swap the CACHED EXPORTS at that fixed path for the duration
 * of this module only, and restore whatever was there in a finally.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-snap-userdata-'));
  const electronPath = require.resolve('electron');
  const hadEntry = Object.prototype.hasOwnProperty.call(require.cache, electronPath);
  const prevEntry = require.cache[electronPath];
  require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app: { getPath: () => userData } } };

  let snapshots, ws;
  try {
    delete require.cache[require.resolve('../electron/lib/snapshots.js')];
    snapshots = require('../electron/lib/snapshots.js');
    ws = require('../electron/lib/workspace.js');
  } finally {
    if (hadEntry) require.cache[electronPath] = prevEntry; else delete require.cache[electronPath];
    // snapshots.js captured the stub `app` in its own module-scope closure at
    // require() time; force it to re-resolve the real (broken) electron export
    // next time anything else requires it, so this test leaves no residue.
    delete require.cache[require.resolve('../electron/lib/snapshots.js')];
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-snap-ws-'));
  ws.setRoot(tmp);

  /* ---------- 1. a normal small project snapshots + restores whole ---------- */
  await ws.writeFile('/server.js', "console.log('hi')\n");
  await ws.writeFile('/public/index.html', '<h1>hi</h1>');
  let r = await snapshots.create('test');
  t.ok('create() succeeds for a small project', r.ok === true);
  t.equal('fileCount matches the authored files', r.fileCount, 2);
  t.equal('nothing skipped for a small project', r.skipped, 0);
  t.ok('not marked truncated', !r.truncated);

  const snap = await snapshots.read(r.id);
  t.ok('read() returns the payload', !!snap && !!snap.files);
  t.equal('snapshot carries the server.js content', snap.files['/server.js'], "console.log('hi')\n");

  const listed = await snapshots.list();
  t.ok('list() surfaces the new snapshot', listed.some((s) => s.id === r.id));

  await ws.removePath('/server.js');
  const restored = await snapshots.restore(r.id);
  t.ok('restore() reports ok', restored.ok === true);
  t.equal('restore() writes the file back', await ws.readFile('/server.js'), "console.log('hi')\n");

  /* ---------- 2. build-output / dependency directories are excluded ---------- */
  // node_modules is protected against workspace.writeFile (it would refuse the
  // write outright) — write it straight to disk, the way `npm install` would;
  // readTree/snapshots walk the real directory regardless of how it got there.
  fs.mkdirSync(path.join(tmp, 'node_modules', 'leftpad'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'node_modules', 'leftpad', 'index.js'), 'module.exports = 1;');
  await ws.writeFile('/dist/bundle.js', 'x'.repeat(500));
  await ws.writeFile('/build/out.js', 'x'.repeat(500));
  await ws.writeFile('/venv/lib/site.py', 'x'.repeat(500));
  await ws.writeFile('/target/debug/app', 'x'.repeat(500));
  r = await snapshots.create('test-ignored-dirs');
  const snap2 = await snapshots.read(r.id);
  t.ok('node_modules is excluded from the snapshot', !('/node_modules/leftpad/index.js' in snap2.files));
  t.ok('dist/ is excluded (readTree alone would not catch this)', !('/dist/bundle.js' in snap2.files));
  t.ok('build/ is excluded', !('/build/out.js' in snap2.files));
  t.ok('venv/ is excluded', !('/venv/lib/site.py' in snap2.files));
  t.ok('target/ (Rust/Cargo) is excluded', !('/target/debug/app' in snap2.files));
  t.ok('the authored file is still present', '/server.js' in snap2.files);
  // node_modules never reaches snapshots.js in the first place — readTree()
  // itself already excludes it — so `skipped` counts the other 4 (dist / build /
  // venv / target), the directories readTree does NOT filter.
  t.ok('skipped counts the excluded build/venv/target files', r.skipped >= 4);
  fs.rmSync(path.join(tmp, 'node_modules'), { recursive: true, force: true });
  await ws.removePath('/dist'); await ws.removePath('/build');
  await ws.removePath('/venv'); await ws.removePath('/target');

  /* ---------- 3. a single oversized file is skipped, not embedded whole ---------- */
  await ws.writeFile('/public/huge.js', 'x'.repeat(2 * 1024 * 1024)); // 2 MB > the 1 MB per-file cap
  r = await snapshots.create('test-big-file');
  const snap3 = await snapshots.read(r.id);
  t.ok('an oversized single file is skipped', !('/public/huge.js' in snap3.files));
  t.ok('everything else still snapshots', '/server.js' in snap3.files);
  await ws.removePath('/public/huge.js');

  /* ---------- 4. the total payload is capped, not left to overflow ---------- */
  // 80 files x ~900KB each ≈ 72 MB of authored content > the 64 MB total cap,
  // while each file is individually under the 1 MB per-file cap.
  const chunk = 'y'.repeat(900 * 1024);
  for (let i = 0; i < 80; i++) await ws.writeFile('/src/f' + i + '.txt', chunk);
  r = await snapshots.create('test-total-cap');
  t.ok('create() still succeeds under the total cap (never throws)', r.ok === true);
  t.ok('the run is marked truncated once the total cap is hit', !!r.truncated);
  t.ok('some files were skipped once the budget ran out', r.skipped > 0);
  const snap4 = await snapshots.read(r.id);
  let total = 0;
  Object.values(snap4.files).forEach((c) => { total += Buffer.byteLength(c, 'utf8'); });
  t.ok('the serialized payload stays at/under the ~64 MB budget', total <= 64 * 1024 * 1024);
  for (let i = 0; i < 80; i++) await ws.removePath('/src/f' + i + '.txt');

  /* ---------- 5. restore() refuses a truncated marker instead of half-writing ---------- */
  const dir = path.join(userData, 'snapshots', require('crypto').createHash('sha1').update(tmp).digest('hex').slice(0, 16));
  const markerId = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, markerId + '.json'), JSON.stringify({ id: markerId, at: Date.now(), root: tmp, reason: 'auto', fileCount: 0, skipped: 999, truncated: true, error: 'Invalid string length' }));
  const badRestore = await snapshots.restore(markerId);
  t.equal('restore() on a truncated marker refuses cleanly', badRestore.ok, false);
  t.equal('...with a named reason', badRestore.reason, 'truncated');

  /* ---------- 6. list() never throws for a project with no snapshots yet ---------- */
  const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-snap-fresh-'));
  ws.setRoot(freshRoot);
  t.deepEqual('list() on a fresh project is empty, not an error', await snapshots.list(), []);
};
