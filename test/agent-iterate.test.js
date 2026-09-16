'use strict';
/* Agent quality loop, LM Studio model cache, IDE Problems/preview labels. */
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
    clearInterval,
    navigator: { clipboard: null }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  return { win, store };
}

function chatReply(obj) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }]
    })
  };
}

const THIN = {
  summary: 'Simple notepad',
  files: [
    {
      path: '/index.html',
      content: '<!DOCTYPE html><html lang="en"><head><title>Simple Notepad</title><link rel="stylesheet" href="/styles/app.css"></head><body><h1>Simple Notepad</h1><textarea placeholder="Start writing your notes here..."></textarea><button id="saveButton">Save Manually</button><button>Clear All Content</button><script src="/scripts/app.js"></script></body></html>'
    },
    {
      path: '/styles/app.css',
      content: 'body{font-family:sans-serif}textarea{width:100%;height:200px}'
    },
    {
      path: '/scripts/app.js',
      content: 'document.getElementById("saveButton").onclick=function(){localStorage.setItem("n",document.querySelector("textarea").value)};'
    }
  ]
};

const RICH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Nova Notes</title>
  <link rel="stylesheet" href="/styles/app.css"/>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">Nova Notes</div>
      <nav>
        <button data-view="all">All notes</button>
        <button data-view="starred">Starred</button>
        <button data-view="archive">Archive</button>
      </nav>
      <button id="newNote">New note</button>
    </aside>
    <main>
      <header class="app-nav">
        <input id="search" placeholder="Search notes" aria-label="Search notes"/>
        <div class="meta">Esc to blur · Ctrl+N new</div>
      </header>
      <section class="editor-wrap">
        <input id="title" placeholder="Untitled"/>
        <textarea id="body" placeholder="Write in markdown. Autosaves."></textarea>
      </section>
      <div class="empty" hidden>No notes yet — create one to begin.</div>
    </main>
  </div>
  <script src="/scripts/app.js"></script>
</body>
</html>` + '<!-- layout ' + 'n'.repeat(900) + ' -->';

const RICH_CSS = `:root{--bg:#0b1020;--panel:#12182b;--line:rgba(255,255,255,.08);--text:#e8ecff;--accent:#7c6ff5}
body{margin:0;background:linear-gradient(180deg,#0b1020,#151a2e);color:var(--text);font-family:Inter,system-ui,sans-serif}
.app-shell{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
.sidebar{background:var(--panel);border-right:1px solid var(--line);padding:18px}
.app-nav{display:flex;gap:12px;padding:16px;border-bottom:1px solid var(--line)}
textarea,input{width:100%;background:#0d1220;color:var(--text);border:1px solid var(--line);border-radius:10px}
button{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:8px 12px}` +
  '\n/* tokens ' + 'c'.repeat(700) + ' */';

const RICH_JS = `const KEY='nova.notes.v1';
let notes=[];
try{notes=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){notes=[]}
const save=()=>localStorage.setItem(KEY,JSON.stringify(notes));
document.getElementById('newNote').onclick=()=>{notes.unshift({id:Date.now(),title:'Untitled',body:''});save();};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();document.getElementById('newNote').click();}});
`;

const RICH = {
  summary: 'Polished notes app',
  files: [
    { path: '/index.html', content: RICH_HTML },
    { path: '/styles/app.css', content: RICH_CSS },
    { path: '/scripts/app.js', content: RICH_JS }
  ]
};

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  t.ok('Problems panel reads message not only msg', appSrc.includes('p.message || p.msg'));
  t.ok('Live Preview no longer fake-binds the iframe once', !appSrc.includes("dataset.bound !== '1'"));
  t.ok('preview epoch invalidates stale srcdoc', appSrc.includes('_previewEpoch'));
  t.ok('IDE chrome does not pretend a Vite 5173 server is running', !/http:\/\/localhost:5173/.test(appSrc));

  const { win, store } = load();
  const LLM = win.Engine.LLM;

  const fromJson = LLM.extractFilesFromText(JSON.stringify(THIN));
  t.ok('extractFilesFromText reads JSON files', fromJson && fromJson.files.length === 3 && fromJson.files[0].path === '/index.html');

  const fenced = [
    'FILE: /index.html',
    '```html',
    '<html lang="en"><body>Hi</body></html>',
    '```',
    'FILE: /styles/app.css',
    '```css',
    'body{color:red}',
    '```'
  ].join('\n');
  const fromFence = LLM.extractFilesFromText(fenced);
  t.ok('extractFilesFromText reads FILE fences', fromFence && fromFence.files.length === 2 && fromFence.files[1].path === '/styles/app.css');

  const thinScore = LLM.scoreBuild(THIN.files, []);
  t.ok('thin Simple Notepad fails the quality gate', thinScore.pass === false && thinScore.score < 55);
  t.ok('thin UI reason mentions placeholder notepad', thinScore.reasons.some(function (r) { return /notepad/i.test(r); }));

  const richScore = LLM.scoreBuild(RICH.files, []);
  t.ok('polished notes UI passes the quality gate', richScore.pass === true && richScore.score >= 55);

  const leftoverErr = [{ severity: 'error', file: '/evil.js', message: 'Use of eval() detected' }];
  t.ok('leftover workspace errors do not fail a good plan score', LLM.scoreBuild(RICH.files, leftoverErr).pass === true);
  const thinNoCss = [
    { path: '/index.html', content: '<html lang="en"><body><h1>Notes</h1><textarea></textarea><script src="/scripts/app.js"></script></body></html>' },
    { path: '/scripts/app.js', content: 'void 0;' },
    { path: '/styles/legacy.css', content: RICH_CSS }
  ];
  t.ok('leftover themed CSS is ignored when scoring only the written files', LLM.scoreBuild(thinNoCss.slice(0, 2), []).pass === false);

  const prose = 'Sure, here is the file:\n```html\n<html lang="en"><body>Hi</body></html>\n```\nHope this helps.';
  t.equal('stripFence drops surrounding model prose', LLM.stripFence(prose, '/index.html').trim(), '<html lang="en"><body>Hi</body></html>');
  const proseFn = 'Here is the function that saves notes:\n```javascript\nconst save = () => localStorage.setItem("n", body.value);\n```\nHope this helps; ping me.';
  t.equal(
    'stripFence unwraps a fence after an English sentence that mentions function',
    LLM.stripFence(proseFn, '/scripts/app.js').trim(),
    'const save = () => localStorage.setItem("n", body.value);'
  );
  const jsWithInnerFence = 'function demo(){\n  return `\n```html\n<div>hi</div>\n```\n`;\n}\n' + 'console.log("ok");\n'.repeat(8);
  t.ok('stripFence does not truncate JS that contains an inner fence', LLM.stripFence(jsWithInnerFence, '/scripts/app.js') === jsWithInnerFence.trim());
  const jsCommentInner = '// app.js — notes helper\nfunction demo(){\n  return `\n```html\n<div>hi</div>\n```\n`;\n}\n' + 'console.log("ok");\n'.repeat(4);
  t.ok('stripFence does not unwrap a JS file that starts with a // comment', LLM.stripFence(jsCommentInner, '/scripts/app.js') === jsCommentInner.trim());
  const cssWithHtml = 'body{color:red}\n/* <html lang="en"><body>nope</body></html> */\n' + '.x{display:block}\n'.repeat(12);
  t.ok('stripFence does not extract HTML out of a CSS file', LLM.stripFence(cssWithHtml, '/styles/app.css') === cssWithHtml.trim());

  const leftoverIssue = { severity: 'error', file: '/evil.js', message: 'Use of eval() detected' };
  const planIssue = { severity: 'warning', file: '/index.html', message: '<img> missing alt attribute' };
  const refine = LLM.buildRefinePrompt('notepad', RICH.files, [leftoverIssue, planIssue], { score: 40, reasons: ['CSS is too thin'] });
  t.ok('refine prompt includes issues from written files', /missing alt/.test(refine));
  t.ok('refine prompt omits leftover workspace validator errors', !/eval/.test(refine));

  LLM.setConfig({
    providerId: 'lmstudio',
    enabled: true,
    model: 'gemma-4-E4B-it-Q4_K_M',
    baseUrl: 'http://127.0.0.1:1234',
    localToken: 'lms-token'
  });

  win.fetch = async function (url) {
    t.ok('listModels still hits /v1/models', /\/v1\/models$/.test(String(url)));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          { id: 'gemma-4-E4B-it-Q4_K_M' },
          { id: 'qwen2.5-coder-7b' },
          { id: 'llama-3.2-3b' }
        ]
      })
    };
  };
  LLM.rememberModels(['custom-anything-i-typed'], 'lmstudio', 'http://127.0.0.1:1234');
  const listed = await LLM.listModels();
  t.equal('listModels returns every loaded id', listed.models.length, 3);
  t.ok('listModels persists loaded ids', LLM.cachedModels('lmstudio', 'http://127.0.0.1:1234').indexOf('qwen2.5-coder-7b') >= 0);
  t.ok('listModels keeps previously typed custom ids', LLM.cachedModels('lmstudio', 'http://127.0.0.1:1234').indexOf('custom-anything-i-typed') >= 0);
  t.ok('model cache is stored under cs.llm.models.v1', !!store['cs.llm.models.v1']);

  const beforeFail = win.Engine.FS.read('/index.html') || '';
  let posts = 0;
  win.fetch = async function () {
    posts++;
    throw new Error('ECONNREFUSED');
  };
  const failSteps = await win.Engine.Agent.run('create a notepad app');
  t.ok('failed LLM does not fall back to the template synthesizer', !failSteps.some(function (s) {
    return /falling back to local synthesizer/i.test(s.text || '');
  }));
  t.ok('failed LLM tells the user to keep prompting', failSteps.some(function (s) {
    return s.kind === 'error' && /synthesizer was not used/i.test(s.text || '');
  }));
  t.ok('failed LLM does not overwrite the workspace with a template notepad', (win.Engine.FS.read('/index.html') || '') === beforeFail);
  t.equal('failed LLM does not sequential-retry a down server', posts, 1);
  t.ok('connection errors are not described as a JSON-plan miss', !failSteps.some(function (s) {
    return /JSON plan failed/i.test(s.text || '');
  }));

  win.Engine.FS.write('/evil.js', 'eval("x")');
  let chatCalls = 0;
  win.fetch = async function (url, opts) {
    if (!/chat\/completions/.test(String(url))) {
      return { ok: false, status: 404, text: async () => '' };
    }
    const body = JSON.parse(opts.body);
    t.ok('chat completions omit a fake cloud model when using the selected id', body.model === 'gemma-4-E4B-it-Q4_K_M');
    chatCalls++;
    return chatReply(chatCalls === 1 ? THIN : RICH);
  };
  const steps = await win.Engine.Agent.run('create an advanced notepad app');
  t.ok('agent iterates after a weak first pass', chatCalls >= 2);
  t.ok('second round mentions refining', steps.some(function (s) {
    return /refining round/i.test(s.text || '');
  }));
  t.ok('quality gate eventually passes or finishes with a score', steps.some(function (s) {
    return s.kind === 'done' && /quality/i.test(s.text || '');
  }));
  t.ok('final index.html is not Simple Notepad', !/Simple Notepad/i.test(win.Engine.FS.read('/index.html') || ''));
  t.ok('final app has an app shell', /app-shell|sidebar/i.test(win.Engine.FS.read('/index.html') || ''));
  t.ok('engine source no longer falls back to the local synthesizer', !fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8').includes('falling back to local synthesizer'));
};
