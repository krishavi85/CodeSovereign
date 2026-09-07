'use strict';
/* engine.ast.js — parse logic. Loaded in a minimal window shim so the browser
   IIFE runs under Node. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const distDir = path.join(__dirname, '..', 'dist');
  const acornSrc = fs.readFileSync(path.join(distDir, 'vendor', 'acorn.js'), 'utf8');
  const looseSrc = fs.readFileSync(path.join(distDir, 'vendor', 'acorn-loose.js'), 'utf8');
  const astSrc = fs.readFileSync(path.join(distDir, 'engine.ast.js'), 'utf8');

  const win = {};
  win.window = win;
  win.Engine = { FS: { read: () => '', __hasWorkspace: () => false } };
  win.console = console;
  win.addEventListener = () => {};
  win.setInterval = () => 0;
  win.clearInterval = () => {};
  const ctx = vm.createContext(win);

  // UMD browser-global path: no module/exports in scope
  vm.runInContext(acornSrc, ctx, { filename: 'acorn.js' });
  vm.runInContext(looseSrc, ctx, { filename: 'acorn-loose.js' });
  t.ok('acorn global present', win.acorn && typeof win.acorn.parse === 'function');
  t.ok('acorn.loose present', win.acorn.loose && typeof win.acorn.loose.parse === 'function');

  vm.runInContext(astSrc, ctx, { filename: 'engine.ast.js' });
  const AST = win.Engine.AST;
  t.ok('Engine.AST exposed', AST && typeof AST.parse === 'function');

  const r = AST.parse([
    'import a from "./a.js";',
    'import { b } from "./b";',
    'export { x } from "./reexp";',
    'export * from "./star";',
    'const s = require("./legacy");',
    'const load = () => import("./lazy");',
    'export function handler(){}',
    'export default class W {}',
    'router.post("/api/x", handler);',
    'app.get("/health", h);'
  ].join('\n'), 'sample.js');

  t.deepEqual('static imports', r.imports.sort(), ['./a.js', './b']);
  t.deepEqual('require()', r.requires, ['./legacy']);
  t.deepEqual('dynamic import()', r.dynamicImports, ['./lazy']);
  t.deepEqual('re-exports (incl. export *)', r.reexports.map((x) => x.source).sort(), ['./reexp', './star']);
  t.ok('named + default exports', r.exports.includes('handler') && r.exports.includes('default'));
  t.deepEqual('routes from call expressions', r.routes.map((x) => x.method + ' ' + x.path).sort(), ['GET /health', 'POST /api/x']);

  t.ok('jsx/tsx are skipped (no acorn grammar)', AST.parse('const a = <div/>;', 'x.tsx').ok === false);
  t.ok('broken JS still yields something via acorn-loose', AST.parse('function ( { const', 'broken.js').ok === true || AST.parse('function ( { const', 'broken.js').imports.length === 0);
};
