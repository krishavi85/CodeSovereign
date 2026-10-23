'use strict';
/* "I want my app to have a brain and I need to see what it is thinking" —
 * the offline deterministic path (engine.js's _plan()) has no model to
 * reason with, so it now honestly surfaces the actual decision it made
 * (which intent matched, and that it's a template match, not AI reasoning)
 * as a `thinking` step, plus curated, intent-specific follow-up ideas as a
 * `suggestions` step after a clean `done`. Neither is fabricated: the
 * reasoning describes the real keyword-match decision, and the suggestions
 * are a fixed per-intent lookup table, not invented AI chatter.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const win = {
    console,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {}
    },
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  run('vendor/acorn.js');
  run('engine.js');
  return win;
}

module.exports = async function (t) {
  // ---- a wired intent gets an honest "this is a template match" reasoning + real suggestions ----
  {
    const win = load();
    win.Engine.Proj.create('t1', 'saas-dashboard');
    const plan = win.Engine.Agent._plan('build a todo list app', win.Engine.Proj.current());
    t.ok('reasoning names the actual matched intent', /Matched "todo"/.test(plan.reasoning));
    t.ok('reasoning is honest that this is a template match, not AI reasoning', /deterministic template.*no AI call needed/.test(plan.reasoning));
    t.ok('suggestions are non-empty and todo-specific', Array.isArray(plan.suggestions) && plan.suggestions.length >= 2);
    t.ok('suggestions are genuinely relevant to a todo app, not generic filler', plan.suggestions.some((s) => /due date|categor|priorit/i.test(s)));

    const steps = await win.Engine.Agent.run('build a todo list app');
    const thinkStep = steps.find((s) => s.kind === 'thinking');
    t.ok('a thinking step is emitted before the plan', !!thinkStep && steps.indexOf(thinkStep) < steps.findIndex((s) => s.kind === 'plan-result'));
    const suggStep = steps.find((s) => s.kind === 'suggestions');
    t.ok('a suggestions step is emitted after done', !!suggStep && steps.indexOf(suggStep) > steps.findIndex((s) => s.kind === 'done'));
    t.ok('the suggestions step carries the real items array', Array.isArray(suggStep.items) && suggStep.items.length >= 2);
  }

  // ---- the generic starter fallback gets honest reasoning too, but no suggestions (nothing specific to suggest) ----
  {
    const win = load();
    win.Engine.Proj.create('t2', 'saas-dashboard');
    const plan = win.Engine.Agent._plan('generate a quantum flux capacitor UI', win.Engine.Proj.current());
    t.ok('unmatched prompt gets an honest "no template matched" reasoning', /No built-in template matched/.test(plan.reasoning));
    t.equal('the generic starter scaffold has no curated suggestions to offer', plan.suggestions.length, 0);

    const steps = await win.Engine.Agent.run('generate a quantum flux capacitor UI');
    t.ok('no suggestions step is emitted for the generic fallback', !steps.some((s) => s.kind === 'suggestions'));
  }

  // ---- a matched-but-unwired-style case (now none exist, but verify the reasoning path for a second wired intent) ----
  {
    const win = load();
    win.Engine.Proj.create('t3', 'saas-dashboard');
    const plan = win.Engine.Agent._plan('build a weather forecast app', win.Engine.Proj.current());
    t.ok('weather reasoning names the matched intent', /Matched "weather"/.test(plan.reasoning));
    t.ok('weather suggestions are specific to weather', plan.suggestions.some((s) => /forecast|cit(y|ies)|alert/i.test(s)));
  }
};
