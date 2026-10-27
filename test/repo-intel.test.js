'use strict';
/* Engine.RepoIntel (dist/engine.repointel.js): symbol index, import graph,
 * references, impact analysis and goal-driven context selection. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const win = { console: { log() {}, info() {}, warn() {}, error() {}, debug() {} } };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.repointel.js'), 'utf8'), ctx, { filename: 'engine.repointel.js' });
  return win.Engine.RepoIntel;
}
const RI = load();
const mk = (files) => { const d = Object.assign({}, files); const env = { _d: d, list: () => Object.keys(d), read: (p) => (p in d ? d[p] : null) }; return env; };

const SHOP = {
  '/package.json': '{"name":"shop"}',
  '/src/text.js': "function capitalize(s) {\n  return s.charAt(0).toUpperCase() + s.slice(1);\n}\n\nfunction slugify(text) {\n  return String(text).toLowerCase();\n}\n\nmodule.exports = { capitalize, slugify };\n",
  '/src/format.js': "const { capitalize } = require('./text');\nconst path = require('node:path');\n\nfunction heading(title) {\n  return capitalize(title);\n}\n\nfunction makeUrl(title) {\n  return '/posts/' + title;\n}\n\nmodule.exports = { heading, makeUrl };\n",
  '/src/cart.js': "import { items } from './catalog';\nimport lodash from 'lodash';\nexport function cartTotal(list) { return list.length; }\nexport const TAX = 0.2;\nexport default class Cart {\n  total() { return 1; }\n}\n",
  '/src/catalog.ts': "export interface Item { name: string }\nexport const items = [];\n",
  '/test/format.test.js': "const { makeUrl } = require('../src/format');\ntest('url', () => makeUrl('x'));\n",
  '/node_modules/dep/index.js': 'function ignored() {}\n',
  '/README.md': '# shop\n',
  '/py/app.py': "from .util import helper\nimport os\n\nclass App:\n    def run(self):\n        return helper()\n\ndef main():\n    pass\n",
  '/py/util.py': "def helper():\n    return 1\n\ndef _private():\n    pass\n"
};

module.exports = async function (t) {
  /* ---------- symbols ---------- */
  {
    const idx = RI.create(mk(SHOP));
    const st = idx.refresh();
    t.ok('node_modules and non-code files are not parsed, code files are', st.files === 9 && st.parsed === 7);
    const s = idx.findSymbol('slugify');
    t.ok('a function is found with its file, line and signature', s.length === 1 && s[0].path === '/src/text.js' && s[0].line === 5 && /function slugify/.test(s[0].signature) && s[0].exported === true && s[0].kind === 'function');
    t.ok('a module.exports list marks symbols exported, others are not', idx.exportsOf('/src/text.js').join() === 'capitalize,slugify' && idx.findSymbol('heading')[0].exported === true);
    t.equal('ES exports, classes, consts and TS types are indexed', ['cartTotal', 'TAX', 'Cart', 'Item'].map((n) => { const m = idx.findSymbol(n).filter((x) => x.name === n); return m.length === 1 && m[0].exported; }).join(), 'true,true,true,true');
    t.equal('class methods are indexed as methods', idx.findSymbol('total').filter((x) => x.kind === 'method').length, 1);
    t.ok('python defs and classes are indexed, underscore names are not exported', idx.findSymbol('helper')[0].exported === true && idx.findSymbol('_private')[0].exported === false && idx.findSymbol('App')[0].kind === 'class');
    t.ok('an inexact name finds partial matches, exact first', idx.findSymbol('slug')[0].name === 'slugify' && idx.findSymbol('SLUGIFY')[0].name === 'slugify');
    t.deepEqual('unknown or empty names find nothing', [idx.findSymbol('nothingHere').length, idx.findSymbol('').length], [0, 0]);
  }

  /* ---------- import graph ---------- */
  {
    const idx = RI.create(mk(SHOP));
    const d = idx.deps('/src/format.js');
    t.ok('require() is resolved to a project file with the imported names', d.imports.some((i) => i.path === '/src/text.js' && i.names.join() === 'capitalize'));
    t.ok('a bare package is external, not a project file', d.external.indexOf('node:path') >= 0 && d.imports.every((i) => i.path !== 'node:path'));
    t.deepEqual('importedBy lists the files that import this one (tests included)', idx.deps('/src/format.js').importedBy, ['/test/format.test.js']);
    t.deepEqual('importedBy for text.js is format.js', idx.deps('/src/text.js').importedBy, ['/src/format.js']);
    t.ok('ES import resolves an extensionless path to a .ts file', idx.deps('/src/cart.js').imports.some((i) => i.path === '/src/catalog.ts') && idx.deps('/src/cart.js').external.indexOf('lodash') >= 0);
    t.ok('python relative imports resolve', idx.deps('/py/app.py').imports.some((i) => i.path === '/py/util.py') && idx.deps('/py/util.py').importedBy[0] === '/py/app.py');
    t.deepEqual('a file nobody imports has no importers', idx.deps('/src/cart.js').importedBy, []);
  }

  /* ---------- impact ---------- */
  {
    const idx = RI.create(mk(SHOP));
    t.deepEqual('changing text.js points at format.js, which imports it and was not changed', idx.impacted(['/src/text.js']).map((x) => [x.path, x.because]), [['/src/format.js', ['/src/text.js']]]);
    t.deepEqual('a dependent that was also changed is not reported', idx.impacted(['/src/text.js', '/src/format.js', '/test/format.test.js']), []);
    t.deepEqual('changing a test file impacts nothing', idx.impacted(['/test/format.test.js']), []);
    const imp = idx.impacted(['/src/format.js']);
    t.ok('tests that import a changed source file are flagged as tests', imp.length === 1 && imp[0].test === true);
  }

  /* ---------- references ---------- */
  {
    const idx = RI.create(mk(SHOP));
    const r = idx.references('capitalize');
    t.ok('references skip the definition and are word-bounded', r.every((x) => !(x.path === '/src/text.js' && x.line === 1)) && r.some((x) => x.path === '/src/format.js') && r.every((x) => /capitalize/.test(x.text)));
    t.equal('a name that is only a part of another identifier is not a reference', RI.create(mk({ '/a.js': 'function slug() {}\nconst slugify = 1;\n' })).references('slug').length, 0);
    t.equal('a non-identifier query is refused', idx.references('a b; rm').length, 0);
  }

  /* ---------- incremental refresh ---------- */
  {
    const env = mk(SHOP), idx = RI.create(env);
    idx.refresh();
    let st = idx.refresh();
    t.ok('an unchanged project is not re-parsed', st.parsed === 0 && st.reused === 7);
    env._d['/src/text.js'] += 'function extra() {}\n';
    st = idx.refresh();
    t.ok('only the changed file is re-parsed and the new symbol is found', st.parsed === 1 && idx.findSymbol('extra').length === 1);
    env._d['/src/new.js'] = "const { extra } = require('./text');\n";
    idx.refresh();
    t.ok('a new file joins the graph', idx.deps('/src/text.js').importedBy.indexOf('/src/new.js') >= 0);
    delete env._d['/src/format.js'];
    idx.refresh();
    t.ok('a deleted file leaves the graph', idx.findSymbol('heading').length === 0 && idx.deps('/src/text.js').importedBy.indexOf('/src/format.js') < 0);
    env._d['/src/bad.js'] = 'function ((( {{{ require(\n';
    t.ok('malformed source never throws', (() => { try { idx.refresh(); return true; } catch (_) { return false; } })());
    env._d['/src/huge.js'] = 'function hugeFn() {}\n' + 'x'.repeat(250000);
    idx.refresh();
    t.ok('huge files are skipped, not parsed', idx.findSymbol('hugeFn').length === 0);
  }

  /* ---------- imports that do not line up ---------- */
  {
    const half = mk({
      '/src/text.js': "function capitalize(s) { return s; }\nfunction slugify(t) { return t; }\nmodule.exports = { capitalize };\n",
      '/src/format.js': "const { capitalize, slugify } = require('./text');\nmodule.exports = { f: () => slugify(capitalize('x')) };\n"
    });
    let p = RI.create(half).importProblems();
    t.deepEqual('a helper defined in one file but not exported, imported by another, is found', p.map((x) => [x.from, x.to, x.name, x.why]), [['/src/format.js', '/src/text.js', 'slugify', 'declared-not-exported']]);
    half._d['/src/text.js'] = half._d['/src/text.js'].replace('{ capitalize }', '{ capitalize, slugify }');
    t.deepEqual('...and gone once it is exported', RI.create(half).importProblems(), []);
    const ex = mk({ '/a.js': "module.exports = { one };\nfunction one() {}\n", '/b.js': "const { one, two } = require('./a');\n" });
    t.deepEqual('a name the target does not provide at all (explicit export list) is found', RI.create(ex).importProblems().map((x) => [x.name, x.why]), [['two', 'not-provided']]);
    const dotted = mk({ '/a.js': "function one() {}\nfunction two() {}\nmodule.exports.one = one;\nmodule.exports.two = two;\n", '/b.js': "const { one, two } = require('./a');\n" });
    t.deepEqual('module.exports.x = ... counts as exporting', RI.create(dotted).importProblems(), []);
    const opaque = [
      "module.exports = require('./impl');\n", "export * from './impl';\n", "module.exports = { ...require('./impl'), a };\nfunction a() {}\n", "Object.assign(module.exports, require('./impl'));\nfunction a() {}\n"
    ];
    t.ok('anything that can supply names we cannot see is left alone (no false alarm)', opaque.every((src) => RI.create(mk({ '/a.js': src, '/impl.js': 'exports.zzz = 1;\n', '/b.js': "const { zzz } = require('./a');\n" })).importProblems().filter((x) => x.why === 'not-provided').length === 0));
    t.ok('importProblems can be limited to given files', RI.create(half).importProblems(['/src/text.js']).length === 0 && (() => { half._d['/src/text.js'] = half._d['/src/text.js'].replace('{ capitalize, slugify }', '{ capitalize }'); return RI.create(half).importProblems(['/src/format.js']).length === 1; })());
    const esm = mk({ '/a.js': "export function one() {}\nfunction hidden() {}\n", '/b.js': "import { one, hidden } from './a';\n" });
    t.deepEqual('ES modules: a declared but un-exported name is found', RI.create(esm).importProblems().map((x) => x.name), ['hidden']);
  }

  /* ---------- ranking and context ---------- */
  {
    const idx = RI.create(mk(SHOP));
    let r = idx.rank('Add a slugify(text) function and use it in makeUrl so URLs are slugs');
    t.ok('the file defining a named symbol ranks first, its importer follows', r[0].path === '/src/text.js' && r.slice(0, 3).some((x) => x.path === '/src/format.js'));
    t.ok('reasons explain why a file was picked', r[0].reasons.some((x) => /slugify/.test(x)));
    r = idx.rank('fix the bug in src/cart.js');
    t.equal('a file named in the request ranks first', r[0].path, '/src/cart.js');
    r = idx.rank('something unrelated like weather');
    t.equal('nothing relevant returns nothing rather than noise', r.length, 0);
    r = idx.rank('tidy up', { focus: ['/src/catalog.ts'] });
    t.equal('focus files (open / failing / changed) are always candidates', r[0].path, '/src/catalog.ts');
    const block = idx.contextBlock('Add slugify and use it in makeUrl');
    t.ok('the context block names the files, their exports and how they connect', /src\/text\.js/.test(block) && /exports capitalize, slugify/.test(block) && /used by src\/format\.js/.test(block) && /uses src\/text\.js \(capitalize\)/.test(block));
    t.ok('the block includes declaration lines for the top files', /function slugify\(text\) \{  \(line 5\)/.test(block));
    t.ok('the block respects its size limit', idx.contextBlock('Add slugify and use it in makeUrl', { maxChars: 300 }).length <= 330);
    t.equal('no relevant file means an empty block', idx.contextBlock('weather forecast'), '');
    t.ok('camelCase and snake_case are split into words', RI.words('slugifyText').indexOf('text') >= 0 && RI.words('slugifyText').indexOf('slugifytext') >= 0 && RI.words('cart_total').join() === 'cart,total');
  }
};
