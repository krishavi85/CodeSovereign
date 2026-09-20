'use strict';
/* stopRun() only ever toggled S.agentStopped for display - nothing in the
 * actual generation loop (engine.llm.js's patchAgent()) reads that flag,
 * and stopRun() never touched S.agentRunning. Combined with the
 * concurrency guard added earlier this session (runAgent()/genApp() both
 * refuse to start a new run while S.agentRunning is true, and their
 * blocked-toast tells the user to "click Stop first"), this meant a user
 * whose generation genuinely hung (a browser-preview fetch() has no
 * timeout - confirmed live this session) was left permanently unable to
 * submit any new prompt: the one escape hatch the guard advertised did
 * nothing.
 *
 * Fixed with a run-token: stopRun() now bumps S.agentRunToken and frees
 * S.agentRunning immediately when stopping an active run. The abandoned
 * request can't actually be cancelled (no abort plumbing to the network
 * layer yet), so runAgentWith()'s onStep callback and completion handler
 * both check the token first and become no-ops once superseded, instead of
 * clobbering whatever the user does next.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');

  const runWithBody = appSrc.slice(appSrc.indexOf('function runAgentWith('), appSrc.indexOf('function approvePlan('));
  t.ok('runAgentWith() mints a fresh run token before starting', /S\.agentRunToken = \(S\.agentRunToken \|\| 0\) \+ 1/.test(runWithBody));
  t.ok('...captures it locally so a later run cannot be confused with this one', /const myRunToken = S\.agentRunToken/.test(runWithBody));

  const onStepIdx = runWithBody.indexOf('Engine.Agent.run(prompt, step =>');
  const onStepBody = runWithBody.slice(onStepIdx, onStepIdx + 300);
  t.ok('the onStep callback bails out once its run has been superseded', /if \(S\.agentRunToken !== myRunToken\) return;/.test(onStepBody));

  const thenIdx = runWithBody.indexOf('}).then(() => {');
  const thenBody = runWithBody.slice(thenIdx, thenIdx + 300);
  t.ok('the completion handler bails out once its run has been superseded', /if \(S\.agentRunToken !== myRunToken\) return;/.test(thenBody));

  const stopRunBody = appSrc.slice(appSrc.indexOf('function stopRun()'), appSrc.indexOf('function stopRun()') + 600);
  t.ok('stopRun() only intervenes when actually stopping an active run (not resuming, not when idle)',
    /if \(S\.agentStopped && S\.agentRunning\)/.test(stopRunBody));
  t.ok('...and it invalidates the run token', /S\.agentRunToken = \(S\.agentRunToken \|\| 0\) \+ 1/.test(stopRunBody));
  t.ok('...and it frees agentRunning immediately, so the concurrency guard\'s "click Stop first" advice actually works',
    /S\.agentRunning = false/.test(stopRunBody));
};
