'use strict';
/* electron/lib/store.js — recents never point at deleted folders ("Folder not found"
   on every launch), and harnesses can put the user's recents back untouched. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const Module = require('module');

module.exports = async function (t) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-store-ud-'));
  const live = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-store-live-'));
  const gone1 = path.join(os.tmpdir(), 'cs-store-gone-' + process.pid + '-a');
  const gone2 = path.join(os.tmpdir(), 'cs-store-gone-' + process.pid + '-b');
  // The exact broken state seen on a real install: lastWorkspace and the
  // head of the recents list both point at folders that were deleted.
  fs.writeFileSync(path.join(ud, 'desktop-state.json'), JSON.stringify({
    recents: [
      { path: gone1, name: 'todo-live6' },
      { path: live, name: 'real' },
      { path: gone2, name: 'taskboard' },
      null,
      { name: 'no-path' }
    ],
    lastWorkspace: gone1,
    windowBounds: null
  }));

  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') return { app: { getPath: () => ud } };
    return origLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../electron/lib/store')];
  const store = require('../electron/lib/store');
  Module._load = origLoad;

  const pruned = store.pruneMissing();
  t.deepEqual('pruneMissing keeps only folders that exist', pruned.map(r => r.path), [live]);
  t.equal('a deleted lastWorkspace is cleared', store.get('lastWorkspace'), null);
  const onDisk = JSON.parse(fs.readFileSync(path.join(ud, 'desktop-state.json'), 'utf8'));
  t.deepEqual('the pruned list is persisted', onDisk.recents.map(r => r.path), [live]);

  store.set('lastWorkspace', live);
  store.pruneMissing();
  t.equal('an existing lastWorkspace is kept', store.get('lastWorkspace'), live);

  // Harness pattern: snapshot → addRecent(temp) → delete temp → restore.
  const snap = store.snapshotRecents();
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-accept-'));
  store.addRecent({ path: tmpWs, name: 'taskboard' });
  t.equal('addRecent puts the temp folder first', store.get('recents')[0].path, tmpWs);
  fs.rmSync(tmpWs, { recursive: true, force: true });
  store.restoreRecents(snap);
  t.deepEqual('restoreRecents drops the harness temp folder', store.get('recents').map(r => r.path), [live]);
  t.equal('restoreRecents restores lastWorkspace', store.get('lastWorkspace'), live);
  snap.recents.length = 0;
  t.equal('the snapshot is a copy, not a live reference', store.get('recents').length, 1);
  store.restoreRecents(null);
  t.equal('restoreRecents(null) is a no-op', store.get('recents').length, 1);

  fs.rmSync(ud, { recursive: true, force: true });
  fs.rmSync(live, { recursive: true, force: true });
  delete require.cache[require.resolve('../electron/lib/store')];
};
