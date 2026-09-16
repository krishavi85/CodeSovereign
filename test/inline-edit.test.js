'use strict';
/* Ctrl+K inline edit — local transforms, not Engine.Agent.run. */
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
  run('engine.inline.js');
  return { win, store };
}

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('index.html loads engine.inline.js', /engine\.inline\.js/.test(html));
  t.ok('IDE binds Ctrl+K inline edit', appSrc.includes('function bindInlineEdit') && appSrc.includes('bindInlineEdit(editor)'));
  t.ok('inline edit is not a new page', appSrc.includes('inlineEditInput') && !/data-screen="inline"/.test(appSrc));

  const { win } = load();
  const Inline = win.Engine.Inline;
  t.ok('Engine.Inline is exposed', Inline && typeof Inline.transformSync === 'function');
  t.ok('Inline is marked separate from the Agent', Inline.SEPARATE_FROM_AGENT === true);

  const fn = 'function add(a, b) {\n  return a + b;\n}';
  const asyncd = Inline.transformSync({ content: fn, selectionStart: 0, selectionEnd: fn.length, instruction: 'Convert this to async' });
  t.ok('convert to async rewrites the selection', /async function add/.test(asyncd.replacement));
  const applied = Inline.apply(asyncd, fn);
  t.ok('applied async stays in the selected area', /async function add/.test(applied.content));

  const handled = Inline.transformSync({ content: fn, selectionStart: 0, selectionEnd: fn.length, instruction: 'Add error handling' });
  t.ok('error handling wraps try/catch', /try \{/.test(handled.replacement) && /catch \(err\)/.test(handled.replacement));

  const documented = Inline.transformSync({ content: fn, selectionStart: 0, selectionEnd: fn.length, instruction: 'Document this function' });
  t.ok('docs add JSDoc', /\/\*\*/.test(documented.replacement) && /@param/.test(documented.replacement) && /add/.test(documented.replacement));

  const sql = 'SELECT * FROM notes WHERE starred = 1';
  const opt = Inline.transformSync({ content: sql, selectionStart: 0, selectionEnd: sql.length, instruction: 'Optimize this query' });
  t.ok('query optimize adds a limit', /LIMIT 100/.test(opt.replacement));
};
