'use strict';
/* Every offline generator must emit JavaScript that actually parses and runs
 * on its own. Found by loading all 35 generated apps in a real browser:
 *   - the calculator's app.js died on load — "\-" inside the generator's
 *     template literal cooked to "-", leaving /[0-9+-*...]/ (an out-of-order
 *     range: SyntaxError), so no button worked;
 *   - the typeahead search app read Engine.FS at runtime — the builder's own
 *     in-memory FS, which does not exist in the generated app or the
 *     sandboxed preview ("Engine is not defined").
 * Also covers the titles derived from the prompt ("me a chatbot" etc.). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = {};
  const win = {
    console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener: () => {},
    document: { createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener: () => {} },
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const name of ['vendor/acorn.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  return win;
}

const PROMPTS = {
  notes: 'build a notepad', dashboard: 'show me kpi metrics', calculator: 'I need something to compute numbers',
  chat: 'build me a chatbot', portfolio: 'build my personal site', timer: 'build a pomodoro timer',
  kanban: 'build a trello-like board', form: 'build a questionnaire', login: 'build an auth ui', rest: 'build an http api',
  ecommerce: 'build a storefront', chart: 'build me a chart', dark: 'add a theme switcher', search: 'add typeahead',
  game: 'build a snake game', markdown_md: 'build an md editor', markdown: 'I need a post engine for content',
  mobile: 'build a pwa', blog: 'I want to write a journal', clock: 'build a world clock', weather: 'build a weather forecast app',
  quiz: 'build a trivia app', music: 'build a music player app', expense: 'track my budget', recipe: 'help me with cooking',
  bookmark: 'build a pocket-like link saver', rss: 'build an rss reader', gallery: 'build a photo grid',
  calendar: 'build a schedule app', password: 'build a password vault', qr: 'build a qr code generator',
  todo: 'build a todo list', social: 'build a social feed', drawing: 'build a drawing app', starter: 'build something unusual xyzzy'
};

// Inline <script> bodies (no src) from generated HTML.
function inlineScripts(html) {
  const out = []; const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

module.exports = async function (t) {
  const win = load();
  const acorn = win.acorn;
  t.ok('acorn is available to parse generated code', !!(acorn && acorn.parse));

  const titles = {};
  for (const [key, prompt] of Object.entries(PROMPTS)) {
    win.Engine.Proj.create('gen-' + key, 'saas-dashboard');
    const plan = win.Engine.Agent._plan(prompt, win.Engine.Proj.current());
    const bad = []; const engineRefs = [];
    for (const f of plan.targets || []) {
      const sources = /\.m?js$/.test(f.path) ? [f.content] : /\.html$/.test(f.path) ? inlineScripts(f.content) : [];
      for (const src of sources) {
        try { acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowHashBang: true }); }
        catch (e) {
          try { acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module' }); }
          catch (e2) { bad.push(f.path + ': ' + e.message); }
        }
        // Regex literals are validated by acorn only syntactically; compile them for real.
        for (const lit of src.match(/\/(?![*/])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\n\\])+\/[gimsuy]*(?=\s*[.,;)\]])/g) || []) {
          const i = lit.lastIndexOf('/');
          try { new RegExp(lit.slice(1, i), lit.slice(i + 1)); } catch (e) { bad.push(f.path + ': ' + e.message); }
        }
        if (/\bEngine\s*\./.test(src)) engineRefs.push(f.path);
      }
      if (f.path === '/index.html') { const m = /<title>([^<]*)<\/title>/.exec(f.content); if (m) titles[key] = m[1]; }
    }
    t.ok(key + ': every generated script parses and every regex compiles' + (bad.length ? ' — ' + bad.join('; ') : ''), bad.length === 0);
    t.ok(key + ': generated code does not depend on the builder\'s Engine global' + (engineRefs.length ? ' — ' + engineRefs.join(', ') : ''), engineRefs.length === 0);
  }

  t.equal('title: "build me a chatbot" → Chatbot', titles.chat, 'Chatbot');
  t.equal('title: filler stripped repeatedly ("I need something to compute numbers")', titles.calculator, 'Compute Numbers');
  t.equal('title: no dangling word from the 6-word cut', titles.markdown, 'Post Engine For Content');
  t.equal('title: acronyms uppercased', titles.dashboard, 'KPI Metrics');
  t.equal('title: "I want to write a journal" → Journal', titles.blog, 'Journal');
  t.equal('title: plain phrase is title-cased', titles.todo, 'Todo List');
};
