'use strict';
/* Engine.ProblemFix — the Problems tab's Fix / Fix all buttons.
 * Quick fixes run instantly without AI; everything else is one focused AI
 * request per file; a problem only counts as fixed when the validators stop
 * reporting it; the model may only write the problem's file (and a module the
 * problem names as missing). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const store = {};
  const win = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    addEventListener() {}, document: { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), body: { appendChild() {} }, readyState: 'complete', addEventListener() {} },
    fetch: async () => { throw new Error('blocked'); }, setTimeout, clearTimeout, setInterval, clearInterval
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const n of ['vendor/acorn.js', 'engine.js', 'engine.mockscan.js', 'engine.recovery.v4.js', 'engine.llm.js', 'engine.problemfix.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), ctx, { filename: n });
  }
  win.Engine.Proj.create('pf', 'saas-dashboard');
  const FS = win.Engine.FS;
  Object.keys(FS._data).forEach((p) => { if (FS.isFile(p)) delete FS._data[p]; });
  return win;
}

function chatToolCalls(files) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: null, tool_calls: files.map((f, i) => ({ id: 'c' + i, type: 'function', function: { name: 'write_file', arguments: JSON.stringify(f) } })) } }] }) };
}
function chatReply(text) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: text } }] }) };
}
const classesOf = (win, file) => (win.Engine.Validator.runAll() || []).filter((i) => !file || i.file === file).map((i) => i.faultClass);

module.exports = async function (t) {
  const PF = load().Engine.ProblemFix;
  t.ok('Engine.ProblemFix loads', !!(PF && PF.fixOne && PF.fixAll));

  // ---- quick fixes: instant, no AI ----
  {
    const win = load();
    win.Engine.FS.write('/index.html', '<!doctype html><html><head><title>T</title></head><body><h1>T</h1><img src="/img/team-photo.png"><script src="/app.js"></script></body></html>');
    win.Engine.FS.write('/app.js', "document.title = 'x';\nconsole.log('debug');\nconsole.log('more');\n");
    let fetched = 0; win.fetch = async () => { fetched++; throw new Error('no AI in this test'); };
    const issues = win.Engine.Validator.runAll();
    const alt = issues.find((i) => i.faultClass === 'html.alt');
    const lang = issues.find((i) => i.faultClass === 'html.lang');
    const cons = issues.find((i) => i.faultClass === 'js.console');
    t.ok('fixture has alt, lang and console.log problems', !!(alt && lang && cons));
    t.ok('they are quick-fixable', win.Engine.ProblemFix.canQuickFix(alt) && win.Engine.ProblemFix.canQuickFix(lang) && win.Engine.ProblemFix.canQuickFix(cons));
    const r1 = await win.Engine.ProblemFix.fixOne(alt);
    t.ok('alt fix: ok, instant, problem gone', r1.ok && r1.how === 'quick' && !classesOf(win, '/index.html').includes('html.alt'));
    t.ok('alt text is derived from the file name', /<img alt="team photo"/.test(win.Engine.FS.read('/index.html')));
    await win.Engine.ProblemFix.fixOne(lang);
    t.ok('lang fix adds lang="en"', /<html lang="en"/.test(win.Engine.FS.read('/index.html')) && !classesOf(win).includes('html.lang'));
    await win.Engine.ProblemFix.fixOne(cons);
    t.ok('console.log fix removes the logs from browser code', !/console\.log/.test(win.Engine.FS.read('/app.js')) && !classesOf(win).includes('js.console'));
    t.equal('quick fixes never call the AI', fetched, 0);
  }

  // ---- AI fix: one focused request, restricted writes ----
  {
    const win = load();
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'qwen', baseUrl: 'http://127.0.0.1:1234', localToken: '' });
    win.Engine.FS.write('/package.json', JSON.stringify({ name: 'x', scripts: { start: 'node server.js' } }));
    win.Engine.FS.write('/server.js', "const { createApp } = require('./app');\nmodule.exports = createApp();\n");
    const issue = win.Engine.Validator.runAll().find((i) => i.faultClass === 'js.missing-module');
    t.ok('fixture reports the missing ./app module', !!issue);
    t.ok('it needs the AI (not quick-fixable)', !win.Engine.ProblemFix.canQuickFix(issue) && win.Engine.ProblemFix.canFix(issue));
    const bodies = [];
    win.fetch = async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}'); bodies.push(body);
      if (body.messages.some((m) => m.role === 'tool')) return chatReply('done');
      // the model tries to write a file it was not allowed to touch, too
      return chatToolCalls([{ path: '/app.js', content: "exports.createApp = () => ({ ok: true });\n" }, { path: '/package.json', content: '{"hijacked":true}' }]);
    };
    const r = await win.Engine.ProblemFix.fixOne(issue);
    const sys = (bodies[0].messages.find((m) => m.role === 'system') || {}).content || '';
    t.ok('AI fix succeeds and the missing module now exists', r.ok && r.how === 'ai' && /createApp/.test(win.Engine.FS.read('/app.js') || ''));
    t.ok('the problem is gone after the fix', !classesOf(win).includes('js.missing-module'));
    t.ok('a file outside the allowed set is NOT written', !/hijacked/.test(win.Engine.FS.read('/package.json')));
    t.ok('the request is focused: the problem, the file, and only related files', /PROBLEMS IN \/server\.js/.test(sys) && /js\.missing-module/.test(sys) && /FILE: \/server\.js/.test(sys));
  }

  // ---- Fix all: quick first, then AI per file; honest totals ----
  {
    const win = load();
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'qwen', baseUrl: 'http://127.0.0.1:1234', localToken: '' });
    win.Engine.FS.write('/index.html', '<!doctype html><html><head><title>T</title></head><body><img src="/a.png"></body></html>');
    win.Engine.FS.write('/a.png', 'png');
    win.Engine.FS.write('/server.js', "const db = require('./db');\nmodule.exports = db;\n");
    let aiCalls = 0;
    win.fetch = async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      if (body.messages.some((m) => m.role === 'tool')) return chatReply('done');
      aiCalls++;
      return chatToolCalls([{ path: '/db.js', content: 'module.exports = {};\n' }]);
    };
    const progress = [];
    const r = await win.Engine.ProblemFix.fixAll(win.Engine.Validator.runAll(), (s) => progress.push(s));
    t.ok('fix all clears every problem', r.remaining === 0 && r.fixed >= 3);
    t.equal('one AI request for the one file that needed it', aiCalls, 1);
    t.ok('progress is reported (quick fixes, then the AI file)', progress.some((p) => /quick fix/.test(p)) && progress.some((p) => /Fixing \/server\.js with AI/.test(p)));
  }

  // ---- no AI configured: honest refusal, quick fixes still work ----
  {
    const win = load();
    win.Engine.FS.write('/server.js', "const db = require('./db');\nmodule.exports = db;\n");
    const issue = win.Engine.Validator.runAll().find((i) => i.faultClass === 'js.missing-module');
    t.ok('without an AI model the problem is not offered as fixable', !win.Engine.ProblemFix.canFix(issue));
    const r = await win.Engine.ProblemFix.fixOne(issue);
    t.ok('and asking anyway explains what is needed', !r.ok && /connect an AI model/.test(r.error));
  }
};
