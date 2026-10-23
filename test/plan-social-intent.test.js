'use strict';
/* Engine.Agent._plan()'s deterministic synthesizer (the no-LLM fallback
 * used whenever no AI provider is connected, or the LLM path fails
 * before writing anything) matches a prompt against ~30 declared intents
 * - but until now "facebook" / "social network" / "social media" style
 * prompts matched none of them, so they silently fell through to
 * writeStarter()'s generic Counter+List+Notes scaffold: the exact same
 * three sections regardless of what was actually asked for, with only
 * the page title and a single "Source prompt: ..." recap line reflecting
 * the request. Found live from a real user report ("the same UI every
 * time... only writing one line from the prompt").
 *
 * This adds a real "social" intent with its own generator (a working
 * feed: composer, posts, likes, friends list - all localStorage
 * persisted, verified live with real clicks in a browser) instead of
 * falling through to the generic starter.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const win = {
    console,
    localStorage: (() => {
      const store = {};
      return {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
      };
    })(),
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
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  return win;
}

module.exports = async function (t) {
  const win = load();
  win.Engine.Proj.create('test', 'saas-dashboard');

  const steps = await win.Engine.Agent.run('Build a website like Facebook', () => {});
  const planResult = steps.find((s) => s.kind === 'plan-result');
  t.ok('a "Facebook" prompt gets a plan result', !!planResult);
  t.ok('...and it is the social feed generator, not the generic starter',
    /social feed/i.test(planResult.text) && !/starter app from your prompt/i.test(planResult.text));

  const html = win.Engine.FS.read('/index.html');
  const css = win.Engine.FS.read('/styles/main.css');
  const js = win.Engine.FS.read('/scripts/app.js');

  t.ok('the generated page has a post composer', /id="composer"/.test(html) && /id="postText"/.test(html));
  t.ok('the generated page has a friends sidebar', /id="friends"/.test(html));
  t.ok('the generated page does NOT contain the generic starter sections', !/id="addForm"/.test(html) && !/Write notes here/.test(html));
  t.ok('a real stylesheet was written', css.length > 500);
  t.ok('the generated app.js is syntactically valid JS', (() => {
    try { new Function(js); return true; } catch (_) { return false; }
  })());
  t.ok('likes and posts are persisted to localStorage, not faked', /localStorage\.setItem\(K\.posts/.test(js));

  // A few other social-style phrasings should route the same way.
  win.Engine.FS.clear();
  win.Engine.Proj.create('test2', 'saas-dashboard');
  const steps2 = await win.Engine.Agent.run('I want a social media app like instagram', () => {});
  const planResult2 = steps2.find((s) => s.kind === 'plan-result');
  t.ok('"social media app like instagram" also routes to the social generator', /social feed/i.test((planResult2 || {}).text || ''));

  // Existing, already-wired intents must still work (no regression from
  // adding a new intent key to the detection map).
  win.Engine.FS.clear();
  win.Engine.Proj.create('test3', 'saas-dashboard');
  const todoSteps = await win.Engine.Agent.run('Build a todo list app', () => {});
  const todoResult = todoSteps.find((s) => s.kind === 'plan-result');
  t.ok('an unrelated, already-wired intent (todo) is unaffected', /todo/i.test((todoResult || {}).text || ''));
};
