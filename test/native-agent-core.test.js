'use strict';
/* Engine.NativeAgent core (dist/engine.nagent.js): argument validation, the
 * permission policy, the command classifier, the patch engine, diagnostics
 * parsing (real `node --test` output), compaction and the persisted state
 * machine. No model or UI involved. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(extra) {
  const store = {};
  const win = Object.assign({
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout, AbortController,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }
  }, extra || {});
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['app.chat.agent.js', 'engine.nagent.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8'), ctx, { filename: f });
  return win.Engine.NativeAgent;
}

// captured from `node --test` (Node 24, spec reporter) on a failing project
const SPEC_FAIL = [
  '✖ adds (1.3607ms)', '✖ adds negatives (0.1858ms)', '✔ ok one (0.3891ms)', 'ℹ tests 3', 'ℹ suites 0', 'ℹ pass 1', 'ℹ fail 2', 'ℹ cancelled 0', 'ℹ skipped 0', 'ℹ todo 0', 'ℹ duration_ms 101.3592', '',
  '✖ failing tests:', '',
  'test at sum.test.js:4:1', '✖ adds (1.3607ms)', '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '  ', '  -1 !== 3', '  ',
  '      at TestContext.<anonymous> (C:\\Users\\krish\\AppData\\Local\\Temp\\nt\\sum.test.js:4:29)', '      at Test.runInAsyncScope (node:async_hooks:227:14)', '      at Test.run (node:internal/test_runner/test:1402:25) {',
  '    generatedMessage: true,', '    code: \'ERR_ASSERTION\'', '  }', '',
  'test at sum.test.js:5:1', '✖ adds negatives (0.1858ms)', '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', '  ', '  1 !== -3', '  ',
  '      at TestContext.<anonymous> (C:\\Users\\krish\\AppData\\Local\\Temp\\nt\\sum.test.js:5:39)', ''
].join('\n');

const TAP_FAIL = [
  'TAP version 13', '# Subtest: adds', 'not ok 1 - adds', '  ---', '  duration_ms: 1.5263', '  type: \'test\'',
  '  location: \'C:\\\\Users\\\\krish\\\\AppData\\\\Local\\\\Temp\\\\nt\\\\sum.test.js:4:1\'', '  failureType: \'testCodeFailure\'', '  error: |-', '    Expected values to be strictly equal:', '    ', '    -1 !== 3', '    ',
  '  code: \'ERR_ASSERTION\'', '  stack: |-', '    TestContext.<anonymous> (C:\\Users\\krish\\AppData\\Local\\Temp\\nt\\sum.test.js:4:29)', '    Test.run (node:internal/test_runner/test:1402:25)', '  ...',
  '# Subtest: ok one', 'ok 2 - ok one', '1..2', '# tests 2', '# pass 1', '# fail 1'
].join('\n');

module.exports = async function (t) {
  const NA = load();

  /* ---------- argument validation ---------- */
  {
    const schema = { type: 'object', properties: { path: { type: 'string' }, n: { type: 'integer' }, all: { type: 'boolean' }, items: { type: 'array' }, mode: { type: 'string', enum: ['a', 'b'] } }, required: ['path'] };
    t.deepEqual('valid arguments pass through, unknown extras are dropped', NA.validateArgs(schema, { path: '/a', extra: 1 }), { ok: true, args: { path: '/a' } });
    t.ok('a missing required argument is named', /missing required argument "path"/.test(NA.validateArgs(schema, {}).error));
    t.ok('a null required argument counts as missing', NA.validateArgs(schema, { path: null }).ok === false);
    t.deepEqual('numeric strings and boolean strings are coerced', NA.validateArgs(schema, { path: '/a', n: '3', all: 'true' }).args, { path: '/a', n: 3, all: true });
    t.ok('a non-integer is rejected', /must be an integer/.test(NA.validateArgs(schema, { path: '/a', n: 1.5 }).error));
    t.ok('a wrong type is rejected', /"items" must be an array/.test(NA.validateArgs(schema, { path: '/a', items: 'x' }).error));
    t.ok('enum values are enforced', /must be one of: a, b/.test(NA.validateArgs(schema, { path: '/a', mode: 'c' }).error));
    t.ok('non-object arguments are rejected', NA.validateArgs(schema, 'nope').ok === false && NA.validateArgs(schema, [1]).ok === false);
    t.equal('a number given for a string argument becomes a string', NA.validateArgs(schema, { path: 12 }).args.path, '12');
  }

  /* ---------- permission policy ---------- */
  {
    const allow = { allows: () => true }, none = { allows: () => false }, noNet = { allows: (a) => a !== 'network' };
    const d = (m, p, ctx) => NA.decide(m, p, ctx).action;
    t.ok('reads are allowed in every mode', NA.MODES.every((m) => d(m, 'read', { autonomy: allow }) === 'allow'));
    t.ok('plan/control tools are allowed everywhere', NA.MODES.every((m) => d(m, 'control') === 'allow'));
    t.ok('ask and plan modes refuse every change and every command', ['ask', 'plan'].every((m) => ['edit', 'exec', 'network', 'destructive'].every((p) => d(m, p, { autonomy: allow }) === 'deny')));
    t.equal('edit mode turns edits into proposals', d('edit', 'edit', { autonomy: allow }), 'propose');
    t.equal('agent and auto apply edits', d('agent', 'edit', { autonomy: allow }) + d('auto', 'edit', { autonomy: allow }), 'applyapply');
    t.equal('commands ask in edit mode', d('edit', 'exec', { autonomy: allow }), 'ask');
    t.equal('agent asks for commands until the plan is approved', d('agent', 'exec', { autonomy: allow }), 'ask');
    t.equal('...and runs them once it is', d('agent', 'exec', { autonomy: allow, planApproved: true }), 'allow');
    t.equal('auto runs project commands without asking', d('auto', 'exec', { autonomy: allow }), 'allow');
    t.ok('network and destructive actions ask even in auto', d('auto', 'network', { autonomy: allow }) === 'ask' && d('auto', 'destructive', { autonomy: allow }) === 'ask');
    t.ok('system-level changes are never allowed', NA.MODES.every((m) => m === 'ask' || m === 'plan' ? true : d(m, 'system', { autonomy: allow }) === 'deny'));
    t.ok('the autonomy level is a ceiling: no write, no command', d('auto', 'edit', { autonomy: none }) === 'deny' && d('auto', 'exec', { autonomy: none }) === 'deny' && d('agent', 'destructive', { autonomy: none }) === 'deny');
    t.equal('network is denied when the autonomy level has no network', d('auto', 'network', { autonomy: noNet }), 'deny');
    t.ok('every refusal explains itself', !!NA.decide('ask', 'edit').reason && !!NA.decide('auto', 'edit', { autonomy: none }).reason);
    t.equal('an unknown permission class is denied', d('auto', 'bogus'), 'deny');
  }

  /* ---------- command classifier ---------- */
  {
    const C = (cmd, args) => NA.classifyCommand(cmd, args);
    const perm = (cmd, args) => { const c = C(cmd, args); return c.deny ? 'DENY' : c.perm; };
    t.equal('node --test is project execution', perm('node', ['--test']), 'exec');
    t.equal('node <file>.js is project execution', perm('node', ['scripts/build.js']), 'exec');
    t.equal('node --version is read-only', perm('node', ['--version']), 'read');
    t.ok('node with inline code is refused', ['-e', '--eval', '-p', '-r', '--import', '--inspect-brk'].every((f) => perm('node', [f, 'x']) === 'DENY'));
    t.equal('node on a non-js file is refused', perm('node', ['notes.txt']), 'DENY');
    t.equal('npm test is execution', perm('npm', ['test']), 'exec');
    t.equal('npm run <script> is execution', perm('npm', ['run', 'build']), 'exec');
    t.equal('npm install is network', perm('npm', ['install']), 'network');
    t.equal('npm ci / add are network', perm('npm', ['ci']) + perm('npm', ['add', 'left-pad']), 'networknetwork');
    t.equal('npx is network (downloads and runs code)', perm('npx', ['cowsay']), 'network');
    t.ok('global installs and config changes are refused', perm('npm', ['install', '-g', 'x']) === 'DENY' && perm('npm', ['config', 'set', 'a', 'b']) === 'DENY' && perm('npm', ['install', '--registry=http://evil']) === 'DENY');
    t.ok('publish / login are refused', perm('npm', ['publish']) === 'DENY' && perm('npm', ['login']) === 'DENY');
    t.equal('npm uninstall is destructive', perm('npm', ['uninstall', 'x']), 'destructive');
    t.equal('git status is read-only', perm('git', ['status']), 'read');
    t.equal('git commit is local project execution', perm('git', ['commit', '-m', 'x']), 'exec');
    t.ok('git push / reset / clean are destructive', ['push', 'reset', 'clean', 'rebase'].every((s) => perm('git', [s]) === 'destructive'));
    t.equal('git branch -D is destructive but git branch is read-only', perm('git', ['branch', '-D', 'x']) + perm('git', ['branch']), 'destructiveread');
    t.equal('git fetch is network', perm('git', ['fetch']), 'network');
    t.equal('git -c core.x=y (config override) is refused', perm('git', ['-c', 'core.sshCommand=evil', 'status']), 'DENY');
    t.equal('python -c is refused', perm('python', ['-c', 'print(1)']), 'DENY');
    t.equal('python -m pytest is execution, pip install is network', perm('python', ['-m', 'pytest']) + perm('python', ['-m', 'pip', 'install', 'x']), 'execnetwork');
    t.equal('tsc / eslint are execution', perm('tsc', ['--noEmit']) + perm('eslint', ['.']), 'execexec');
    t.equal('watch modes are refused (they never exit)', perm('jest', ['--watch']), 'DENY');
    t.equal('vite with no subcommand is refused (server)', perm('vite', []), 'DENY');
    t.equal('cargo test is execution, cargo install is network', perm('cargo', ['test']) + perm('cargo', ['install', 'x']), 'execnetwork');
    t.equal('deno with --allow-all is refused', perm('deno', ['run', '-A', 'x.ts']), 'DENY');
    t.equal('an executable that is not on the list is refused', perm('rm', ['-rf', 'x']) + perm('curl', ['http://x']) + perm('powershell', ['-c', 'x']), 'DENYDENYDENY');
    t.ok('shell operators inside arguments are refused', ['a && b', 'a | b', 'a; b', '`x`', '$(x)', 'a > b'].every((a) => perm('node', ['--test', a]) === 'DENY'));
    t.ok('environment expansion is refused', perm('node', ['a.js', '%APPDATA%']) === 'DENY' && perm('node', ['a.js', '$HOME']) === 'DENY');
    t.ok('control characters are refused', perm('node', ['a.js\nrm']) === 'DENY');
    t.ok('paths that leave the project are refused', perm('node', ['../evil.js']) === 'DENY' && perm('node', ['C:\\Windows\\x.js']) === 'DENY' && perm('node', ['/etc/x.js']) === 'DENY' && perm('git', ['add', '~/x']) === 'DENY');
    t.ok('an approved executable name alone is not enough', perm('npm', ['totally-unknown']) === 'DENY' && perm('git', ['frobnicate']) === 'DENY');
    t.ok('the label shows what would run', C('npm', ['test']).label === 'npm test');
    t.ok('non-string arguments are refused', C('node', [1]).deny !== undefined);
    t.ok('make takes a plain target only', perm('make', ['test']) === 'exec' && perm('make', ['a;b']) === 'DENY');
  }

  /* ---------- patches ---------- */
  {
    const patch = ['--- a/src/a.js', '+++ b/src/a.js', '@@ -1,3 +1,3 @@', ' const a = 1;', '-const b = 2;', '+const b = 3;', ' const c = 4;', ''].join('\n');
    const files = NA.parsePatch(patch);
    t.ok('a unified diff is parsed into files and hunks', files.length === 1 && files[0].newPath === '/src/a.js' && files[0].hunks.length === 1 && files[0].hunks[0].lines.length === 4);
    t.equal('a patch applies', NA.applyHunks('const a = 1;\nconst b = 2;\nconst c = 4;\n', files[0].hunks).text, 'const a = 1;\nconst b = 3;\nconst c = 4;\n');
    const wrongCounts = NA.parsePatch('--- a/x.js\n+++ b/x.js\n@@ -1,99 +1,99 @@\n-old\n+new\n');
    t.equal('wrong hunk counts (common from models) do not matter', NA.applyHunks('old\nrest', wrongCounts[0].hunks).text, 'new\nrest');
    const drift = NA.parsePatch('--- a/x.js\n+++ b/x.js\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n');
    t.equal('a wrong start line is found by context', NA.applyHunks('a\nb\nc\nctx\nold\nz', drift[0].hunks).text, 'a\nb\nc\nctx\nnew\nz');
    const loose = NA.parsePatch('--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-old  \n+new\n');
    t.equal('trailing whitespace differences are tolerated', NA.applyHunks('old\n', loose[0].hunks).text, 'new\n');
    const bad = NA.applyHunks('nothing like it', NA.parsePatch('--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-absent line\n+x\n')[0].hunks);
    t.ok('a hunk that matches nothing is an error that names the line', !bad.ok && /absent line/.test(bad.errors[0]));
    const two = NA.parsePatch('--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-1\n+2\n--- /dev/null\n+++ b/new.js\n@@ -0,0 +1 @@\n+hello\n');
    t.ok('several files and /dev/null (new file) are understood', two.length === 2 && two[1].oldPath === null && two[1].newPath === '/new.js');
    t.equal('no file sections means nothing to apply', NA.parsePatch('just words').length, 0);
  }

  /* ---------- diagnostics ---------- */
  {
    const spec = NA.parseTestOutput(SPEC_FAIL);
    t.ok('node:test spec output: counts', spec.framework === 'node:test' && spec.pass === 1 && spec.fail === 2 && spec.total === 3);
    t.deepEqual('failing test names are extracted', spec.failures.map((f) => f.name), ['adds', 'adds negatives']);
    t.ok('the assertion message is extracted, without the stack', /-1 !== 3/.test(spec.failures[0].message) && !/at TestContext/.test(spec.failures[0].message));
    t.ok('file and line come from the "test at" header', spec.failures[0].file === 'sum.test.js' && spec.failures[0].line === 4);
    t.ok('stack frames skip node internals', spec.failures[0].frames.length === 1 && /sum\.test\.js/.test(spec.failures[0].frames[0].file));
    const tap = NA.parseTestOutput(TAP_FAIL);
    t.ok('TAP output: counts and failure', tap.pass === 1 && tap.fail === 1 && tap.failures.length === 1 && tap.failures[0].name === 'adds' && /-1 !== 3/.test(tap.failures[0].message));
    t.equal('TAP location is parsed', tap.failures[0].line, 4);
    // the real desktop runner (npm -> node --test) keeps ANSI colour codes in the output
    const ESC = String.fromCharCode(27), col = (c, s) => ESC + '[' + c + 'm' + s + ESC + '[39m';
    const colored = NA.parseTestOutput(col(32, '✔ ok (1ms)') + '\n' + col(34, 'ℹ tests 2') + '\n' + col(34, 'ℹ pass 1') + '\n' + col(34, 'ℹ fail 1') + '\n');
    t.ok('colour codes in real runner output do not hide the counts', colored.pass === 1 && colored.fail === 1 && colored.total === 2 && colored.framework === 'node:test');
    const passing = NA.parseTestOutput('✔ a (1ms)\nℹ tests 1\nℹ pass 1\nℹ fail 0\n');
    t.ok('a passing run has no failures', passing.fail === 0 && passing.failures.length === 0);
    const syntax = NA.parseTestOutput('/x/a.js:3\nSyntaxError: Unexpected token }\n    at wrapSafe (node:internal/modules/cjs/loader:1:1)');
    t.ok('a non-test failure keeps its error line', syntax.framework === 'unknown' && /SyntaxError/.test(syntax.failures[0].message));
    t.equal('empty output is harmless', NA.parseTestOutput('').failures.length, 0);

    const frames = NA.parseStackFrames('    at fn (C:\\proj\\src\\a.js:12:5)\n    at /home/u/b.js:3:1\n    at node:internal/x:1:1\n    at y (/p/node_modules/q/i.js:1:1)');
    t.deepEqual('stack frames: project files only, with line and column', frames.map((f) => f.file + ':' + f.line + ':' + f.col), ['C:\\proj\\src\\a.js:12:5', '/home/u/b.js:3:1']);
    t.equal('absolute paths map into the project by root', NA.toProjectPath('C:\\proj\\src\\a.js', 'C:\\proj', ['/src/a.js']), '/src/a.js');
    t.equal('...or by a unique path suffix', NA.toProjectPath('/elsewhere/src/a.js', '', ['/src/a.js', '/lib/b.js']), '/src/a.js');
    t.equal('an ambiguous suffix maps to nothing rather than a guess', NA.toProjectPath('/x/util.js', '', ['/a/util.js', '/b/util.js']), null);
    t.ok('failure signatures are stable and order-independent', NA.failureSignature([{ name: 'a', message: 'x' }, { name: 'b', message: 'y' }]) === NA.failureSignature([{ name: 'b', message: 'y' }, { name: 'a', message: 'x' }]) && NA.failureSignature([{ name: 'a', message: 'x' }]) !== NA.failureSignature([{ name: 'a', message: 'z' }]));
  }

  /* ---------- claims vs. what really changed ---------- */
  {
    const files = ['/src/format.js', '/src/text.js', '/test/a.test.js', '/README.md'];
    const U = (summary, changed) => NA.unbackedClaims(summary, changed, files);
    t.deepEqual('a claimed change to an unchanged file is flagged', U('Added slugify to text.js and updated makeUrl in src/format.js.', ['/src/text.js']), ['/src/format.js']);
    t.deepEqual('a claim that is backed by a change is fine', U('Updated src/format.js and text.js', ['/src/format.js', '/src/text.js']), []);
    t.deepEqual('merely mentioning a file is not a claim', U('I read src/format.js but did not need to touch it', []), []);
    t.deepEqual('the base name or the full path both count', U('fixed format.js', []), ['/src/format.js']);
    t.deepEqual('test files are never flagged (they are protected, not claimed)', U('updated a.test.js', []), []);
    t.deepEqual('no summary, no claims', U('', []), []);
    t.deepEqual('a file whose name merely contains another is not confused', U('modified text.json', []), []);
  }

  /* ---------- context compaction ---------- */
  {
    const big = 'x'.repeat(3000);
    const convo = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1' }] }, { role: 'tool', tool_call_id: '1', content: big },
      { role: 'assistant', content: '', tool_calls: [{ id: '2' }] }, { role: 'tool', tool_call_id: '2', content: big },
      { role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }, { role: 'assistant', content: 'e' }, { role: 'user', content: 'f' }];
    const out = NA.compactConvo(convo, 4000);
    t.ok('old bulky tool output is shortened to fit the budget', out[3].content.length < 400 && /shortened/.test(out[3].content));
    t.equal('no message is dropped (tool-call pairing stays intact)', out.length, convo.length);
    t.equal('the input is not mutated', convo[3].content.length, 3000);
    t.deepEqual('a conversation already inside the budget is untouched', NA.compactConvo(convo.slice(0, 2), 4000), convo.slice(0, 2));
  }

  /* ---------- state machine ---------- */
  {
    const store = {};
    const seen = [];
    const m = NA.createRun({ goal: 'g', mode: 'agent', store: { get: (k) => store[k], set: (k, v) => { store[k] = v; } }, onState: (s) => seen.push(s) });
    t.equal('a run starts IDLE', m.run.state, 'IDLE');
    t.ok('IDLE cannot jump to EXECUTING', m.transition('EXECUTING') === false && m.run.state === 'IDLE' && m.run.violations === 1);
    t.ok('the legal path works', ['PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'REPAIRING', 'VERIFYING', 'COMPLETED'].every((s) => m.transition(s)));
    t.deepEqual('state changes are reported in order', seen, ['PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'REPAIRING', 'VERIFYING', 'COMPLETED']);
    t.ok('COMPLETED is terminal', m.isTerminal() && m.transition('EXECUTING') === false && m.transition('PLANNING') === false);
    t.ok('every transition is recorded with a time', m.run.history.length === 7 && m.run.history.every((h) => h.at > 0));
    t.ok('the state is persisted on each change', JSON.parse(store[NA.RUN_KEY]).state === 'COMPLETED');
    t.ok('an unknown state is refused', NA.createRun({}).transition('DANCING') === false);
    t.ok('BLOCKED is resumable, FAILED and CANCELLED are not', NA.TRANSITIONS.BLOCKED.indexOf('EXECUTING') >= 0 && NA.TRANSITIONS.FAILED.length === 0 && NA.TRANSITIONS.CANCELLED.length === 0);
    const every = NA.STATES.every((s) => s === 'IDLE' || NA.STATES.some((o) => NA.TRANSITIONS[o].indexOf(s) >= 0));
    t.ok('every state except IDLE is reachable', every);
    t.ok('PLANNING can end in COMPLETED (plan-only runs)', NA.TRANSITIONS.PLANNING.indexOf('COMPLETED') >= 0);

    // interruption
    const st2 = {};
    const store2 = { get: (k) => st2[k], set: (k, v) => { st2[k] = v; } };
    const r = NA.createRun({ goal: 'g', store: store2 });
    r.transition('PLANNING'); r.transition('EXECUTING');
    const back = NA.loadRun(store2);
    t.ok('a run that was live when the app went away comes back BLOCKED and resumable', back.state === 'BLOCKED' && back.resumable === true && /interrupted while EXECUTING/.test(back.history[back.history.length - 1].reason));
    t.equal('and that is persisted, so a second load agrees', NA.loadRun(store2).state, 'BLOCKED');
    const done = {};
    const s3 = { get: (k) => done[k], set: (k, v) => { done[k] = v; } };
    const r3 = NA.createRun({ store: s3 }); r3.transition('PLANNING'); r3.transition('COMPLETED');
    t.equal('a finished run is loaded as it was', NA.loadRun(s3).state, 'COMPLETED');
    t.equal('nothing stored means no run', NA.loadRun({ get: () => null, set() {} }), null);
    t.equal('corrupt storage means no run', NA.loadRun({ get: () => '{not json', set() {} }), null);
  }
};
