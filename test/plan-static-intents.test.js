'use strict';
/* Table-driven coverage for _plan()'s ~35 static keyword intents
 * (engine.js's `intents` object, engine.js:692-727). Previously only
 * 'social' and 'todo' were exercised (test/plan-social-intent.test.js);
 * this file covers the remaining ones directly against Engine.Agent._plan(),
 * checking that each prompt matches exactly the intended intent (catching
 * keyword collisions like markdown/blog or notes/markdown_md sharing a
 * trigger phrase), that wired intents produce dedicated (non-starter)
 * output, and that unwired intents are honestly flagged via
 * offlineFallback (see test/plan-offline-fallback.test.js for the
 * mechanism itself).
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

// One prompt per intent, chosen so it triggers ONLY that intent's has()
// keywords (verified by hand against engine.js's intents object). 'social'
// and 'todo' are covered by plan-social-intent.test.js. 'paint' has no
// reachable isolated prompt (see the dedicated collision test below) and is
// intentionally excluded here. All 35 static intents now have a dedicated
// generator (see dist/engine.js's writeXxx() functions) — there is no more
// "wired vs unwired" split; every matched intent must produce real output,
// never the generic starter fallback.
const WIRED = [
  { key: 'notes', prompt: 'build a notepad' },
  { key: 'dashboard', prompt: 'show me kpi metrics' },
  { key: 'calculator', prompt: 'I need something to compute numbers' },
  { key: 'chat', prompt: 'build me a chatbot' },
  { key: 'portfolio', prompt: 'build my personal site' },
  { key: 'timer', prompt: 'build a pomodoro timer' },
  { key: 'kanban', prompt: 'build a trello-like board' },
  { key: 'form', prompt: 'build a questionnaire' },
  { key: 'login', prompt: 'build an auth ui' },
  { key: 'rest', prompt: 'build an http api' },
  { key: 'ecommerce', prompt: 'build a storefront' },
  { key: 'chart', prompt: 'build me a chart' },
  { key: 'dark', prompt: 'add a theme switcher' },
  { key: 'search', prompt: 'add typeahead' },
  { key: 'game', prompt: 'build a snake game' },
  { key: 'markdown_md', prompt: 'build an md editor' },
  { key: 'markdown', prompt: 'I need a post engine for content' },
  { key: 'mobile', prompt: 'build a pwa' },
  { key: 'blog', prompt: 'I want to write a journal' },
  { key: 'clock', prompt: 'build a world clock' },
  { key: 'weather', prompt: 'build a weather forecast app' },
  { key: 'quiz', prompt: 'build a trivia app' },
  { key: 'music', prompt: 'build a music player app' },
  { key: 'expense', prompt: 'track my budget' },
  { key: 'recipe', prompt: 'help me with cooking' },
  { key: 'bookmark', prompt: 'build a pocket-like link saver' },
  { key: 'rss', prompt: 'build an rss reader' },
  { key: 'gallery', prompt: 'build a photo grid' },
  { key: 'calendar', prompt: 'build a schedule app' },
  { key: 'password', prompt: 'build a password vault' },
  { key: 'qr', prompt: 'build a qr code generator' }
];

module.exports = async function (t) {
  const win = load();
  win.Engine.Proj.create('static-intents', 'saas-dashboard');
  const proj = win.Engine.Proj.current();

  WIRED.forEach(({ key, prompt }) => {
    const plan = win.Engine.Agent._plan(prompt, proj);
    const spec = (plan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
    t.ok(`"${prompt}" matches exactly [${key}], no keyword collision`, new RegExp('Matched signals: ' + key + '\\n').test(spec));
    t.ok(`${key}: wired intent is NOT flagged as an offline fallback`, plan.offlineFallback === false);
    t.ok(`${key}: SPEC.md records it as the primary intent`, new RegExp('Primary intent: \\*\\*' + key + '\\*\\*').test(spec));
    t.ok(`${key}: SPEC.md has no offline-fallback banner`, !/OFFLINE EMERGENCY FALLBACK/.test(spec));
    t.ok(`${key}: did not fall back to the generic starter summary`, !/Scaffolded a real, working starter app/.test(plan.summary));
  });

  // 'paint' (has('paint app','drawing app')) can never be the sole match:
  // both of its trigger phrases contain a bare keyword of 'drawing'
  // (has('drawing','paint','canvas app','sketch')), and 'drawing' is
  // declared earlier in the intents object, so it always wins as primary.
  // This documents that collision rather than pretending an isolated
  // 'paint' prompt exists. Both keys now share the same dedicated
  // writeDrawing() generator, so this is no longer an offline fallback.
  {
    const plan = win.Engine.Agent._plan('build a paint app', proj);
    const spec = (plan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
    t.ok('paint/drawing collision: SPEC.md shows drawing as primary (paint can never win)', /Primary intent: \*\*drawing\*\*/.test(spec));
    t.ok('paint/drawing collision: both keys are matched', /Matched signals:.*\bdrawing\b/.test(spec) && /Matched signals:.*\bpaint\b/.test(spec));
    t.ok('paint/drawing collision: drawing has a dedicated generator now, not an offline fallback', plan.offlineFallback === false);
  }

  // Regression coverage for a landmine this table caught earlier: 'stopwatch'
  // contains mobile's bare keyword 'pwa' as a raw substring ("sto-PWA-tch").
  // Before 'mobile' had a dedicated generator this was harmless (both
  // candidates fell to the same starter scaffold); once 'mobile' got a real
  // PWA generator, this collision would have silently built the wrong app
  // for "build a stopwatch". Fixed via a word-boundary hasWord('pwa') check
  // (engine.js's intents.mobile) instead of a raw substring match — assert
  // the fix holds: 'mobile' must NOT match, and 'timer' wins cleanly.
  {
    const plan = win.Engine.Agent._plan('build a stopwatch', proj);
    const spec = (plan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
    t.ok('stopwatch/pwa collision is fixed: timer wins primary, not mobile', /Primary intent: \*\*timer\*\*/.test(spec));
    t.ok('stopwatch/pwa collision is fixed: mobile is not matched at all', !/Matched signals:.*\bmobile\b/.test(spec));
    t.ok('stopwatch still gets its dedicated timer generator, not a fallback', plan.offlineFallback === false);
  }

  // 'soundboard' contains kanban's bare keyword 'board' ("sound-BOARD"), but
  // 'music' is declared earlier and already wins primary — now that 'music'
  // has a dedicated generator (a real soundboard), this is the CORRECT
  // resolution for this prompt, not a bug to fix.
  {
    const plan = win.Engine.Agent._plan('build a soundboard app', proj);
    const spec = (plan.targets.find((f) => f.path === '/SPEC.md') || {}).content || '';
    t.ok('soundboard/board collision: music wins primary over kanban', /Primary intent: \*\*music\*\*/.test(spec));
    t.ok('soundboard/board collision: both keys are matched', /Matched signals:.*\bmusic\b/.test(spec) && /Matched signals:.*\bkanban\b/.test(spec));
    t.ok('soundboard correctly gets the dedicated music generator, not a fallback', plan.offlineFallback === false);
  }

  // A truly unmatched prompt (no keyword hits at all) is the only remaining
  // path to the generic starter scaffold now that every static intent has a
  // dedicated generator — covered by test/plan-offline-fallback.test.js's
  // first assertion, not repeated here.
};
