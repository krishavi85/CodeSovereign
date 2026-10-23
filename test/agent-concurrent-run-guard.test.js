'use strict';
/* Both prompt-submit entry points (the Welcome screen's genApp() and the
 * Agent tab's runAgent()) called runAgentWith() with no guard against a
 * run already being in progress. Neither button/input disables itself
 * while S.agentRunning is true, so pressing Enter twice, clicking Run
 * again out of impatience, or submitting from the Welcome screen while
 * an Agent-tab run was still going silently reset S.agentSteps (see
 * runAgentWith(), the `else { S.agentSteps = []; }` branch) and started
 * a second, competing Engine.Agent.run() call - discarding the first
 * run's progress with no error or warning. On slow local-model hardware
 * (a single generation can take minutes) this is very easy to trigger
 * and looks exactly like "generation never finishes" - confirmed live:
 * reproduced by simulating an in-progress run and calling runAgent()
 * again, which wiped agentSteps back to empty.
 *
 * Fixed by guarding both entry points, matching the pattern the file
 * already used correctly at answerAgentQuestion() (`if (!S.agentRunning)
 * runAgentWith(...)`).
 */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');

  const genAppBody = appSrc.slice(appSrc.indexOf('function genApp()'), appSrc.indexOf('function genApp()') + 400);
  t.ok('genApp() bails out while a run is already in progress',
    /function genApp\(\)\s*\{\s*if\s*\(\s*S\.agentRunning\s*\)/.test(genAppBody));
  t.ok('...and sends the user to the Agent tab to see the run that is already happening',
    /S\.agentRunning[\s\S]{0,120}S\.screen\s*=\s*['"]agent['"]/.test(genAppBody));

  const runAgentBody = appSrc.slice(appSrc.indexOf('function runAgent()'), appSrc.indexOf('function runAgent()') + 400);
  t.ok('runAgent() bails out while a run is already in progress',
    /function runAgent\(\)\s*\{\s*if\s*\(\s*S\.agentRunning\s*\)/.test(runAgentBody));

  // Both guards must fire before runAgentWith() is reached (not after) -
  // otherwise the "clear agentSteps for a fresh run" line still executes.
  const genAppFull = appSrc.slice(appSrc.indexOf('function genApp()'), appSrc.indexOf('runAgentWith(p, ctx);', appSrc.indexOf('function genApp()')));
  t.ok('the genApp() guard sits before its runAgentWith() call', /if\s*\(\s*S\.agentRunning\s*\)/.test(genAppFull));

  const runAgentFull = appSrc.slice(appSrc.indexOf('function runAgent()'), appSrc.indexOf('function runAgentWith('));
  t.ok('the runAgent() guard sits before its runAgentWith() call', /if\s*\(\s*S\.agentRunning\s*\)/.test(runAgentFull));
};
