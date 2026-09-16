'use strict';
/* Lightweight Agent Tab — autocomplete / predictive edits, not Engine.Agent.run. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = {};
  const win = {
    console,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    addEventListener: () => {},
    document: {
      createElement: () => ({ style: {}, appendChild() {}, click() {}, remove() {}, addEventListener() {} }),
      body: { appendChild() {} },
      readyState: 'complete',
      addEventListener: () => {}
    },
    Event: function Event() {},
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.tab.js');
  return { win, store };
}

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('index.html loads engine.tab.js', /engine\.tab\.js/.test(html));
  t.ok('IDE binds Agent Tab on the editor', appSrc.includes('function bindAgentTab') && appSrc.includes('bindAgentTab(editor)'));
  t.ok('IDE shows a predictive portal, not a new page', appSrc.includes('tabPortal') && appSrc.includes('acceptTabPortal'));
  t.ok('Agent Tab never starts Engine.Agent.run', !/\bAgent\.run\b/.test(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.tab.js'), 'utf8')));

  const { win } = load();
  const Tab = win.Engine.Tab;
  t.ok('Engine.Tab is exposed', Tab && typeof Tab.suggest === 'function');
  t.ok('Tab is marked separate from the heavyweight Agent', Tab.SEPARATE_FROM_AGENT === true);

  const fnSrc = 'function save(';
  const fnSug = Tab.suggest({ path: '/scripts/app.js', content: fnSrc, cursor: fnSrc.length });
  t.ok('completes an individual function line into a block', fnSug && fnSug.kind === 'block' && /\)\s*\{/.test(fnSug.text));
  const fnNext = Tab.apply(fnSug, fnSrc).content;
  t.ok('applied completion inserts a multi-line body', /\{\n/.test(fnNext) && /\}/.test(fnNext));

  const sib = 'document.getElementById("saveButton")\ndocument.getElementById("';
  const sibSug = Tab.suggest({ path: '/scripts/app.js', content: sib, cursor: sib.length });
  t.ok('completes a line from surrounding code', sibSug && sibSug.kind === 'line' && /saveButton/.test(sibSug.text));

  const picked = 'var notes = []';
  const rw = Tab.suggest({ path: '/scripts/app.js', content: picked, cursor: 0, selectionStart: 0, selectionEnd: picked.length });
  t.ok('rewrites a var selection to const', rw && rw.kind === 'rewrite' && /const/.test(rw.text));

  win.Engine.FS.write('/lib/dates.js', 'export function formatDate(d) { return d; }\n');
  win.Engine.FS.write('/scripts/app.js', 'formatDate();\n');
  const imp = Tab.suggest({ path: '/scripts/app.js', content: 'formatDate();\n', cursor: 10 });
  t.ok('adds an import for an identifier declared in another file', imp && imp.kind === 'import' && /formatDate/.test(imp.text) && /dates/.test(imp.text));

  const img = '<img src="cover.png">';
  const lint = Tab.suggest({ path: '/index.html', content: img, cursor: img.length - 1 });
  t.ok('reacts to a missing-alt linter issue', lint && lint.kind === 'lint' && /alt=/.test(lint.text));

  win.Engine.FS.write('/styles/app.css', 'body{color:#fff}\n');
  const htmlSrc = '<div class="note-card">';
  const cross = Tab.suggest({ path: '/index.html', content: htmlSrc, cursor: htmlSrc.length });
  t.ok('anticipates a coordinated CSS edit', cross && cross.related && /\.css$/.test(cross.related[0].path));
  t.ok('portal points at the other file', Tab.isPortal(cross) && cross.next.path !== '/index.html' && /\.css$/.test(cross.next.path));
  const related = Tab.applyRelated(cross);
  t.ok('coordinated apply writes the other file', /note-card/.test(win.Engine.FS.read(cross.related[0].path) || ''));
  t.ok('related patch was returned', related.length >= 1);

  Tab.clearRecent();
  Tab.recordEdit({ path: '/scripts/app.js', line: 'function archive() {', cursor: 18 });
  const fromRecent = Tab.suggest({ path: '/index.html', content: '\n', cursor: 0 });
  t.ok('uses recent edits to suggest the next location', fromRecent && /archive/.test(fromRecent.text || ''));
  t.ok('surrounding code is attached to the suggestion', fromRecent && typeof fromRecent.surrounding === 'string');
};
