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

  for (const [name, key, val] of [['worktree', 'core.worktree', '/'], ['tls', 'http.sslVerify', 'false'], ['ca', 'http.sslCAInfo', '/tmp/evil.pem'], ['proxy', 'http.proxy', 'http://evil:1'], ['rewrite', 'url.file:///evil/.insteadOf', 'https://github.com/']]) {
    const d = mk('k-' + name); cfg(d, key, val); ws.setRoot(d);
    const rr = await git.exec(['status']);
    t.ok('a repository-local ' + key + ' is flagged', rr.needsTrust === true);
  }
  // layout that sends git to another repository: gitfile / commondir / alternates
  const elsewhere = mk('elsewhere');
  const gf = path.join(base, 'gitfile');
  fs.mkdirSync(gf);
  fs.writeFileSync(path.join(gf, '.git'), 'gitdir: ' + path.join(elsewhere, '.git') + '\n');
  ws.setRoot(gf);
  r = await git.exec(['status']);
  t.ok('a .git file pointing at another repository is flagged', r.needsTrust === true && (r.keys || []).some((k) => /points outside/.test(k)));
  const gfIn = path.join(base, 'gitfile-in');
  fs.mkdirSync(path.join(gfIn, 'data'), { recursive: true });
  spawnSync('git', ['init', '-q', '--separate-git-dir', path.join(gfIn, 'data', 'g'), gfIn]);
  ws.setRoot(gfIn);
  r = await git.exec(['rev-parse', '--is-inside-work-tree']);
  t.ok('a .git file pointing INSIDE the folder is fine', !r.needsTrust);
  // links inside the folder that lead to another repository (symlink / junction)
  const linkTo = (target, p) => { try { fs.symlinkSync(target, p, process.platform === 'win32' ? 'junction' : 'dir'); return true; } catch (_) { return false; } };
  const gl = path.join(base, 'gitfile-link');
  fs.mkdirSync(gl);
  if (linkTo(path.join(elsewhere, '.git'), path.join(gl, 'inner'))) {
    fs.writeFileSync(path.join(gl, '.git'), 'gitdir: ./inner\n');
    ws.setRoot(gl);
    r = await git.exec(['status']);
    t.ok('a .git file whose in-folder path is a link to another repository is flagged', r.needsTrust === true && (r.keys || []).some((k) => /points outside/.test(k)));
  }
  const dl = path.join(base, 'gitdir-link');
  fs.mkdirSync(dl);
  if (linkTo(path.join(elsewhere, '.git'), path.join(dl, '.git'))) {
    ws.setRoot(dl);
    r = await git.exec(['status']);
    t.ok('a .git that is itself a link is flagged', r.needsTrust === true);
  }
  const ol = mk('objects-link');
  fs.renameSync(path.join(ol, '.git', 'objects'), path.join(base, 'objects-moved'));
  if (linkTo(path.join(elsewhere, '.git', 'objects'), path.join(ol, '.git', 'objects'))) {
    ws.setRoot(ol);
    r = await git.exec(['status']);
    t.ok('.git/objects that is a link elsewhere is flagged', r.needsTrust === true && (r.keys || []).some((k) => /objects/.test(k)));
  }
  // clone / init destinations are judged on real paths
  const proj = mk('proj');
  const outside = path.join(base, 'outside-dest');
  fs.mkdirSync(outside);
  const lk = path.join(proj, 'notes');
  let linked = false;
  try { fs.symlinkSync(outside, lk, process.platform === 'win32' ? 'junction' : 'dir'); linked = true; } catch (_) {}
  ws.setRoot(proj);
  trust.grant(ws.getRoot());
  if (linked) {
    r = await git.exec(['init', 'notes']);
    t.ok('git init into a link that leads outside the folder is refused', r.code === -1 && /resolves outside/.test(r.stderr) && !fs.existsSync(path.join(outside, '.git')));
    r = await git.exec(['init', 'notes/sub']);
    t.ok('and so is a path below that link', r.code === -1 && /resolves outside/.test(r.stderr));
  }
  r = await git.exec(['init', 'inside-ok']);
  t.ok('a plain relative destination still works', r.code === 0 && fs.existsSync(path.join(proj, 'inside-ok', '.git')));
  trust.revoke(ws.getRoot());
  const alt = mk('alt');
  fs.mkdirSync(path.join(alt, '.git', 'objects', 'info'), { recursive: true });
  fs.writeFileSync(path.join(alt, '.git', 'objects', 'info', 'alternates'), path.join(elsewhere, '.git', 'objects') + '\n');
  ws.setRoot(alt);
  r = await git.exec(['status']);
  t.ok('objects/info/alternates is flagged', r.needsTrust === true && (r.keys || []).some((k) => /alternates/.test(k)));
  const cd = mk('commondir');
  fs.writeFileSync(path.join(cd, '.git', 'commondir'), path.join(elsewhere, '.git') + '\n');
  ws.setRoot(cd);
  r = await git.exec(['status']);
  t.ok('.git/commondir is flagged', r.needsTrust === true && (r.keys || []).some((k) => /commondir/.test(k)));

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
  const grantedRoot = ws.getRoot();   // the canonical path (on Windows CI the temp dir is an 8.3 short name until resolved)
  trust.grant(grantedRoot);
  r = await git.exec(['rev-parse', '--is-inside-work-tree']);
  t.ok('once the folder is trusted git runs normally', !r.needsTrust && r.code === 0);
  trust.revoke(grantedRoot);

  // the argument floor applies to git:exec as well
  ws.setRoot(benign);
  for (const args of [['clone', '--upload-pack=calc', 'x', 'y'], ['fetch', '--upload-pack=calc'], ['fetch', 'ext::sh -c calc'], ['config', 'core.pager', 'calc']]) {
    r = await git.exec(args);
    t.ok('git ' + args.join(' ') + ' is refused before anything starts', r.code === -1 && !/fatal/.test(r.stderr));
  }
};
