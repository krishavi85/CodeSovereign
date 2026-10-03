'use strict';
/* electron/lib/git.js against a real temporary repository.
 * A fresh `git init` (no commits yet) used to report its branch as "HEAD":
 * `rev-parse --abbrev-ref HEAD` fails on an unborn branch. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const workspace = require('../electron/lib/workspace');
const git = require('../electron/lib/git');

module.exports = async function (t) {
  if (!(await git.available())) { t.ok('git not installed — skipped', true); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-git-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    workspace.setRoot(dir);

    t.deepEqual('not a repo before init', await git.status(), { repo: false });
    t.equal('init runs', (await git.exec(['init'])).code, 0);
    const expected = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: dir }).toString().trim();
    const s1 = await git.status();
    t.ok('fresh repo reports its real branch name, not "HEAD" (got ' + s1.branch + ')', s1.repo === true && s1.branch === expected && s1.branch !== 'HEAD');
    t.ok('untracked file listed', s1.files.some((f) => f.path === 'a.txt' && f.x === '?'));

    await git.exec(['add', '-A']);
    // identity via env so the test never depends on (or touches) global config
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'CS Test';
    process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'cs@test.invalid';
    const c = await git.exec(['commit', '-m', 'initial']);
    t.equal('commit succeeds', c.code, 0);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
    const s2 = await git.status();
    t.ok('after a commit the branch name is unchanged', s2.branch === expected);
    t.ok('modified file shows as M', s2.files.some((f) => f.path === 'a.txt' && f.y === 'M'));

    const bad = await git.exec(['-c', 'core.pager=calc', 'log']);
    t.ok('config injection (-c) is refused with a non-zero code', bad.code !== 0 && /not permitted|Disallowed/.test(bad.stderr));
  } finally {
    for (const k of ['GIT_AUTHOR_NAME', 'GIT_COMMITTER_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_EMAIL']) delete process.env[k];
    workspace.setRoot(null);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
};
