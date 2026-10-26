'use strict';
/* The eval harness (scripts/lib/agent-eval.js) must itself be trustworthy:
 * every task fails at the start, its reference solution passes the independent
 * judge, and a model that does nothing, lies about success, or edits the tests
 * is scored as a failure. Uses real temp projects and real `npm test` / `node
 * --test` runs, with a scripted model instead of a real one. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRuntime, runTrial, writeTree, sh } = require('../scripts/lib/agent-eval');
const { TASKS } = require('../scripts/lib/agent-eval-tasks');

function scripted(steps) {
  let i = 0;
  return (msgs, o) => {
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step.text) o.onDelta(step.text);
    return Promise.resolve({ text: step.text || '', toolCalls: (step.calls || []).map((c) => ({ id: '', name: c.name, arguments: JSON.stringify(c.args) })) });
  };
}
const planSteps = [{ calls: [{ name: 'create_plan', args: { steps: ['look', 'fix', 'test'] } }] }, { text: 'ok' }];
const report = { calls: [{ name: 'report_result', args: { summary: 'done', status: 'done' } }] };
const solve = (task) => Object.keys(task.reference).map((p) => ({ calls: [{ name: 'write_file', args: { path: p, content: task.reference[p] } }] }));

module.exports = async function (t) {
  const rt = loadRuntime();

  for (const task of TASKS) {
    // 1. the task really is broken at the start (visible tests fail)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-evalchk-'));
    writeTree(dir, task.files);
    const before = await sh(dir, 'node', ['--test'], 60000);
    t.ok(task.id + ': the visible tests fail before the agent does anything', before.code !== 0 && /ℹ fail [1-9]/.test(before.output));
    // 2. the reference solution passes visible AND hidden tests
    writeTree(dir, task.reference); writeTree(dir, task.hidden);
    const after = await sh(dir, 'node', ['--test'], 60000);
    t.ok(task.id + ': the reference solution passes visible and hidden tests', after.code === 0 && /ℹ fail 0/.test(after.output));
    // 3. hidden tests are NOT enough to pass without the real fix
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-evalchk-'));
    writeTree(dir2, task.files); writeTree(dir2, task.hidden);
    t.ok(task.id + ': the hidden tests also fail on the broken project', (await sh(dir2, 'node', ['--test'], 60000)).code !== 0);
    [dir, dir2].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  }

  const task = TASKS[0];

  // a correct solution is a verified success, judged independently
  let r = await runTrial({ rt, task, mode: 'auto', chatStream: scripted(planSteps.concat(solve(task), [report])), timeoutMs: 120000 });
  t.ok('a model that applies the reference fix: agent says verified and the judge agrees', r.status === 'verified' && r.success === true && r.judge.fail === 0 && r.judge.pass >= 4);
  t.ok('the trial records effort and the changed file', r.turns >= 3 && r.toolCalls >= 2 && r.changed.join() === '/src/range.js (modified)' && r.verification.join() === 'true');

  // a model that does nothing is a failure, not a pass
  r = await runTrial({ rt, task, mode: 'auto', chatStream: scripted(planSteps.concat([report])), timeoutMs: 120000 });
  t.ok('a model that changes nothing is a failure (no-changes)', r.success === false && r.status === 'no-changes' && r.changed.length === 0);

  // a model that edits the existing tests to "pass" is stopped, and is a failure
  const cheat = [{ calls: [{ name: 'write_file', args: { path: '/test/range.test.js', content: "const test = require('node:test');\ntest('x', () => {});\n" } }] }, report];
  r = await runTrial({ rt, task, mode: 'auto', chatStream: scripted(planSteps.concat(cheat)), timeoutMs: 120000 });
  t.ok('editing the existing tests is blocked and the task is not passed', r.success === false && r.changed.length === 0 && r.toolErrors.some((e) => /read-only/.test(e)));

  // a plausible-looking but wrong fix: the agent\'s own tests may pass, the hidden ones do not
  const halfFix = [{ calls: [{ name: 'write_file', args: { path: '/src/range.js', content: "function range(start, end) {\n  const out = [];\n  if (start === end) return [start];\n  for (let i = start; i < end; i++) out.push(i);\n  out.push(end);\n  return out.length > 0 ? out : [];\n}\n\nmodule.exports = { range };\n" } }] }, report];
  r = await runTrial({ rt, task, mode: 'auto', chatStream: scripted(planSteps.concat(halfFix)), timeoutMs: 120000 });
  t.ok('a fix that satisfies the visible tests but not the hidden ones is judged a FAILURE even though the agent verified it', r.status === 'verified' && r.success === false && r.judge.fail >= 1);

  // a crashing model is reported, not thrown
  r = await runTrial({ rt, task, mode: 'auto', chatStream: () => Promise.reject(new Error('HTTP 500 down')), timeoutMs: 60000 });
  t.ok('a model that crashes yields a failed trial with a report', r.success === false && r.status === 'failed');

  // the temp project is cleaned up
  r = await runTrial({ rt, task, mode: 'auto', chatStream: scripted(planSteps.concat([report])), timeoutMs: 60000, keepDir: true });
  t.ok('keepDir leaves the project for inspection', !!r.dir && fs.existsSync(r.dir));
  try { fs.rmSync(r.dir, { recursive: true, force: true }); } catch (_) {}
};
