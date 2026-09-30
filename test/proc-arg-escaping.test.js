'use strict';
/* SECURITY regression: electron/lib/proc.js runs allowlisted project tooling
 * (npm, npx, …). On Windows those are .cmd shims, and they used to be
 * launched with `shell: true` — which concatenates the args into one cmd.exe
 * command line UNESCAPED. The allowlist only checks the executable, never its
 * args, and args arrive from the renderer (including model-chosen commands).
 * Confirmed on this codebase before the fix:
 *   runManaged({ cmd: 'npm', args: ['--version', '&', 'echo', 'X'] })
 * made cmd.exe run `echo X` as a second command — `& del …` would have run
 * just the same. Arguments must reach the program literally.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ws = require('../electron/lib/workspace');
const proc = require('../electron/lib/proc');

module.exports = async function (t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-argesc-'));
  ws.setRoot(tmp);
  try {
    const inj = await proc.runManaged({ cmd: 'npm', args: ['--version', '&', 'echo', 'INJECTED_BY_ARG'] });
    const injOut = (inj.stdout || '') + (inj.stderr || '');
    t.ok('an `&` in an argument is never executed as a second shell command', !/^INJECTED_BY_ARG\s*$/m.test(injOut));
    t.ok('npm itself still resolves and runs (the .cmd shim is found)', /\d+\.\d+\.\d+/.test(injOut));

    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'argesc', version: '1.0.0', scripts: { show: 'node show.js' } }));
    fs.writeFileSync(path.join(tmp, 'show.js'), 'console.log("ARGV=" + JSON.stringify(process.argv.slice(2)));');
    const r = await proc.runManaged({ cmd: 'npm', args: ['run', 'show', '--', 'hello world', 'a&b'] });
    const m = /ARGV=(\[.*\])/.exec((r.stdout || '') + (r.stderr || ''));
    const argv = m ? JSON.parse(m[1]) : null;
    t.ok('an argument with a space arrives as ONE argument', !!argv && argv[0] === 'hello world');
    t.ok('an argument containing & arrives literally', !!argv && argv[1] === 'a&b');
    t.equal('and the command exits cleanly', r.code, 0);
  } finally {
    proc.killAll();
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  }
};
