'use strict';
/* A repository's own config can name programs git runs: clean / smudge filters, merge drivers, ssh commands. In a
 * folder that is not trusted, git:exec must not run them (it reports needsTrust instead), and git:exec applies the
 * same argument floor as every other command (transport helpers such as --upload-pack). Needs a real git. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ws = require('../electron/lib/workspace');
const git = require('../electron/lib/git');
const trust = require('../electron/lib/trust');

const fwd = (p) => p.split(path.sep).join('/');

module.exports = async function (t) {
  if (!(await git.available())) { t.ok('(git is not installed here: skipped)', true); return; }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-gitcfg-'));
  const mk = (name) => { const d = path.join(base, name); fs.mkdirSync(d); spawnSync('git', ['init', '-q'], { cwd: d }); return d; };
  const cfg = (d, k, v) => spawnSync('git', ['config', '--local', k, v], { cwd: d });
  const marker = path.join(base, 'FILTER-RAN');
  const evil = path.join(base, 'evil.js');
  fs.writeFileSync(evil, "require('fs').writeFileSync(" + JSON.stringify(marker) + ", 'x');\n");

  const hostile = mk('hostile');
  fs.writeFileSync(path.join(hostile, 'a.txt'), 'x');
  fs.writeFileSync(path.join(hostile, '.gitattributes'), '* filter=evil\n');
  cfg(hostile, 'filter.evil.clean', 'node ' + fwd(evil));
  cfg(hostile, 'filter.evil.smudge', 'node ' + fwd(evil));
  ws.setRoot(hostile);
  let r = await git.exec(['add', '-A']);
  t.ok('add -A in an untrusted repo with a clean filter does not run it', r.needsTrust === true && !fs.existsSync(marker));
  t.ok('the answer names the offending setting', (r.keys || []).some((k) => /^filter\.evil\.clean$/i.test(k)));
  r = await git.exec(['status']);
  t.ok('status reports needsTrust too (no filter run)', r.needsTrust === true && !fs.existsSync(marker));
  const st = await git.status();
  t.ok('the Git panel status says needsTrust instead of running anything', st.repo === false && st.needsTrust === true && !fs.existsSync(marker));

  const ssh = mk('ssh');
  cfg(ssh, 'core.sshCommand', 'node ' + fwd(evil));
  ws.setRoot(ssh);
  r = await git.exec(['fetch', 'origin']);
  t.ok('a repository-local core.sshCommand is flagged', r.needsTrust === true && !fs.existsSync(marker));

  const merge = mk('merge');
  cfg(merge, 'merge.evil.driver', 'node ' + fwd(evil));
  ws.setRoot(merge);
  t.ok('a repository-local merge driver is flagged', (await git.exec(['merge', 'x'])).needsTrust === true);

  const benign = mk('benign');
  cfg(benign, 'user.name', 'n'); cfg(benign, 'user.email', 'a@b.c'); cfg(benign, 'core.autocrlf', 'false');
  ws.setRoot(benign);
  r = await git.exec(['status']);
  t.ok('ordinary local settings do not trigger the check', !r.needsTrust && r.code === 0);

  // fail closed: a config the scan cannot read (here: padded far past the output buffer) is not "safe"
  const padded = mk('padded');
  const lines = [];
  for (let i = 0; i < 400000; i++) lines.push('\tpad' + i + ' = v');
  fs.appendFileSync(path.join(padded, '.git', 'config'), '[padding]\n' + lines.join('\n') + '\n');
  ws.setRoot(padded);
  r = await git.exec(['status']);
  t.ok('a repository config the scan cannot read pauses git instead of running it', r.needsTrust === true && /could not be checked/.test((r.keys || []).join(' ')));
  r = await git.exec(['status']);
  t.ok('and the failed scan is not cached as "clean"', r.needsTrust === true);

  // trusting the folder is the user's decision; after it git proceeds
  ws.setRoot(hostile);
  trust.grant(hostile);
  r = await git.exec(['rev-parse', '--is-inside-work-tree']);
  t.ok('once the folder is trusted git runs normally', !r.needsTrust && r.code === 0);
  trust.revoke(hostile);

  // the argument floor applies to git:exec as well
  ws.setRoot(benign);
  for (const args of [['clone', '--upload-pack=calc', 'x', 'y'], ['fetch', '--upload-pack=calc'], ['fetch', 'ext::sh -c calc'], ['config', 'core.pager', 'calc']]) {
    r = await git.exec(args);
    t.ok('git ' + args.join(' ') + ' is refused before anything starts', r.code === -1 && !/fatal/.test(r.stderr));
  }
};
