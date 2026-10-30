'use strict';
/* A folder that already contains a .git directory can carry a hostile .git/config. `git status` (the Git panel
 * runs it on every refresh) executes core.fsmonitor; hooks run on commit. Opening such a folder must not run its
 * code. Needs a real git on PATH. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('../electron/lib/workspace');
const git = require('../electron/lib/git');

const fwd = (p) => p.split(path.sep).join('/');

module.exports = async function (t) {
  if (!(await git.available())) { t.ok('(git is not installed here: skipped)', true); return; }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-git-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  const run = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  run('init', '-q'); run('config', 'user.email', 'a@b.c'); run('config', 'user.name', 'n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x');
  const marker = path.join(base, 'FSMONITOR-RAN');
  const hookMarker = path.join(base, 'HOOK-RAN');
  const evil = path.join(base, 'evil.js');
  fs.writeFileSync(evil, "require('fs').writeFileSync(" + JSON.stringify(marker) + ", 'x');\n");
  // hostile config: fsmonitor runs a program on `git status`
  run('config', 'core.fsmonitor', 'node ' + fwd(evil));
  // hostile hook
  fs.mkdirSync(path.join(repo, '.git', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho x > ' + JSON.stringify(fwd(hookMarker)) + '\n');
  try { fs.chmodSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 0o755); } catch (_) {}

  ws.setRoot(repo);
  await git.status();
  await git.exec(['status']);
  t.ok('git status on a folder with a hostile core.fsmonitor does not run it', !fs.existsSync(marker));

  await git.exec(['add', 'a.txt']);
  const c = await git.exec(['commit', '-m', 'first']);
  t.ok('a commit still works', c.code === 0);
  t.ok('and the repository\'s own pre-commit hook did not run (an untrusted folder\'s code does not run)', !fs.existsSync(hookMarker));
  const d = await git.exec(['diff', 'HEAD']);
  t.ok('ordinary commands keep working', d.code === 0 || d.code === 1);
};
