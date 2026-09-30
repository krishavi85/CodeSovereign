'use strict';
/* "I want the task-graph decomposition applied to the connected-LLM path
 * unconditionally" — the connected-LLM round loop previously always
 * regenerated the ENTIRE app in one model call per refine round, no matter
 * how substantial the request. It now routes a substantial, fresh build
 * through Engine.Orchestrator's real task graph instead: Backend generates
 * first, then Frontend generates SECOND with the backend's actual
 * already-written code as ground truth (via dependsOn), then Tests, then
 * an Integration check reading Engine.DoD's own criteria (no 4th "is it
 * done" score). Applied unconditionally once the gates are met — not
 * scaled back for a slow/local model, per explicit product decision — but
 * still gated on desktop (Orchestrator's reproof() needs real npm/runtime
 * evidence that cannot exist in a VM) and skipped for follow-ups (editing
 * "add dark mode" through a Backend/Frontend/Tests graph makes no sense).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const distDir = path.join(__dirname, '..', 'dist');
  const store = {};
  const win = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
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
    fetch: async () => { throw new Error('network blocked') }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.contract.js');
  run('engine.llm.js');
  run('engine.orchestrator.js');
  return win;
}

function chatReply(obj) {
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] })
  };
}

// Standard OpenAI-compatible tool-calls shape — what a tool-calling-capable
// provider (Ollama's OpenAI-compat endpoint, for a tool-trained model) sends
// back when it uses the write_file tool instead of answering in free text.
function chatToolCalls(files) {
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: files.map((f, i) => ({
            id: 'call_' + i,
            type: 'function',
            function: { name: 'write_file', arguments: JSON.stringify({ path: f.path, content: f.content }) }
          }))
        }
      }]
    })
  };
}

const SUBSTANTIAL_PROMPT = 'Build a project management tool with tasks, projects, and comments, with user accounts and admin roles';

function setupDesktopMocks(win, dodCriteria) {
  win.window.desktop = { isDesktop: true };
  win.Engine.FS.__hasWorkspace = () => true;
  const sovStore = {};
  win.Engine.Sovereign = {
    analyze: () => {},
    runEvidence: () => Promise.resolve({}),
    observe: () => Promise.resolve({}),
    read: (p) => (Object.prototype.hasOwnProperty.call(sovStore, p) ? sovStore[p] : null),
    write: (p, d) => { sovStore[p] = d; }
  };
  win.Engine.Ledger = { build: () => {}, load: () => ({ claims: [] }) };
  win.Engine.DoD = { evaluate: () => {}, load: () => ({ criteria: dodCriteria, PASS: Object.keys(dodCriteria).every((k) => dodCriteria[k]) }) };
}

module.exports = async function (t) {
  // ---- desktop + substantial + fresh build: routes through the task graph, backend before frontend, real hand-off ----
  {
    const win = load();
    win.Engine.Proj.create('t1', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });

    const requestsSeen = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      requestsSeen.push(sys);
      if (/BACKEND ONLY/.test(sys)) {
        return chatReply({ summary: 'real backend', files: [{ path: '/server.js', content: 'const http=require("http"); http.createServer((req,res)=>{ if(req.url==="/api/tasks") return res.end("[]"); res.end("ok"); }).listen(4319);' }] });
      }
      if (/FRONTEND ONLY/.test(sys)) {
        return chatReply({ summary: 'real frontend', files: [{ path: '/index.html', content: '<!doctype html><html><body>UI</body></html>' }] });
      }
      if (/TESTS ONLY/.test(sys)) {
        return chatReply({ summary: 'real tests', files: [{ path: '/test/server.test.js', content: "require('node:test');" }] });
      }
      return { ok: false, status: 500, text: async () => 'unexpected stage' };
    };

    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);

    const planResult = steps.find((s) => s.kind === 'plan-result' && Array.isArray(s.taskGraph));
    t.ok('a task-graph plan-result is emitted for this substantial desktop build', !!planResult);
    t.equal('the task graph has exactly 4 stages', planResult.taskGraph.length, 4);
    t.equal('stages are Backend, Frontend, Tests, Integration in that order', planResult.taskGraph.map((x) => x.id).join(','), 'T-backend,T-frontend,T-tests,T-integration');

    t.ok('backend was actually requested before frontend', requestsSeen.findIndex((s) => /BACKEND ONLY/.test(s)) < requestsSeen.findIndex((s) => /FRONTEND ONLY/.test(s)));

    // The runtime verifier must be able to START what the backend stage
    // writes. Confirmed live: llama3.1:8b chose mongoose (no MongoDB server
    // exists) and wrote no "start" script; and the prompt's own worked
    // example used to teach .listen(4319) while the observer loads :3000.
    const backendSys = requestsSeen.find((s) => /BACKEND ONLY/.test(s));
    t.ok('the backend prompt requires a package.json "start" script', backendSys.includes('"start": "node server.js"'));
    t.ok('the backend prompt forbids database servers unless the user named one', /Do NOT use MongoDB, mongoose/.test(backendSys));
    t.ok('the backend prompt requires port 3000 (what the observer loads)', backendSys.includes('process.env.PORT || 3000'));
    t.ok('the backend prompt requires serving the static frontend from the same server', /serves the static frontend files/.test(backendSys));
    t.ok('the prompt\'s own worked example no longer teaches the wrong port', !/listen\(4319\)/.test(backendSys));
    t.ok('the backend prompt requires a "test": "node --test" script (the Tests stage can\'t add one — package.json is protected)', backendSys.includes('"test": "node --test"'));
    t.ok('the backend prompt requires listening only when run directly, so tests can import the app', backendSys.includes('require.main === module') && backendSys.includes('module.exports = app'));
    const frontendSys = requestsSeen.find((s) => /FRONTEND ONLY/.test(s));
    t.ok('the frontend prompt requires real forms/buttons in index.html from an empty start (the observer needs controls to exercise)', /usable from an EMPTY start/.test(frontendSys) && /<form>s, <input>s and <button>s/.test(frontendSys));
    const testsSys = requestsSeen.find((s) => /TESTS ONLY/.test(s));
    t.ok('the tests prompt allows only node built-ins (nothing else is installed for tests)', /Use ONLY Node built-ins/.test(testsSys) && /Do NOT use jest, mocha, chai, supertest/.test(testsSys));
    t.ok('the tests prompt gives the correct relative import path from /test/', testsSys.includes("require('../server')"));
    t.ok('the tests prompt requires closing any server it starts, so node --test can exit', testsSys.includes('server.close()'));
    t.ok('the frontend request includes the REAL backend code already written, not a guess', requestsSeen.find((s) => /FRONTEND ONLY/.test(s)).includes('createServer'));

    t.ok('real files from every stage were actually written', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/server.test.js'));

    t.ok('live task-start events fired for all 4 stages', ['T-backend', 'T-frontend', 'T-tests', 'T-integration'].every((id) => steps.some((s) => s.kind === 'task-start' && s.taskId === id)));
    t.ok('done is reported when every stage verifies against the (mocked) DoD criteria', steps.some((s) => s.kind === 'done'));
  }

  // ---- tuned for small/local models: FILE: + fenced-code-block output
  // (no JSON-string-escaping of full file contents needed) is accepted,
  // and response_format:json_object is never forced on the request — a
  // provider with supportsJson:true (which is what Ollama's OpenAI-compat
  // endpoint reports as) would otherwise grammar-constrain the model into
  // pure JSON, directly fighting this exact prompt. Confirmed live: this
  // is genuinely what fixed llama3.1:8b failing to produce a parseable
  // plan under the JSON-only version of this prompt. ----
  {
    const win = load();
    win.Engine.Proj.create('t1b', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const bodiesSeen = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      bodiesSeen.push(body);
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      // Plain FILE:/fenced-code text, exactly how a small model naturally
      // responds — NOT wrapped in a JSON object at all.
      if (/BACKEND ONLY/.test(sys)) {
        return chatReply("FILE: /server.js\n```javascript\nconst http = require('http');\nhttp.createServer((req,res)=>{res.end('ok');}).listen(4319);\n```");
      }
      if (/FRONTEND ONLY/.test(sys)) {
        return chatReply("FILE: /index.html\n```html\n<!doctype html><html><body>UI</body></html>\n```");
      }
      if (/TESTS ONLY/.test(sys)) {
        return chatReply("FILE: /test/x.test.js\n```javascript\nrequire('node:test');\n```");
      }
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('plain FILE:/fenced-code output (no JSON at all) is still parsed into real files', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/x.test.js'));
    t.ok('done is reported — the small-model-friendly format is enough to succeed', steps.some((s) => s.kind === 'done'));
    t.ok('response_format:json_object is never requested for these task-graph calls (it would fight the FILE:/fence prompt)', bodiesSeen.length > 0 && bodiesSeen.every((b) => !b.response_format));
  }

  // ---- native tool-calling: when the provider actually returns structured
  // tool_calls (standard OpenAI function-calling — supported by Ollama's
  // OpenAI-compat endpoint for tool-trained models like llama3.1), those are
  // used directly instead of parsing free text. This sidesteps the whole
  // class of "model ignored the FILE:/fence instruction" failures, since the
  // provider's own tool-calling machinery constrains the output shape
  // rather than relying on the model following a text convention. ----
  {
    const win = load();
    win.Engine.Proj.create('t1g', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const bodiesSeen = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      bodiesSeen.push(body);
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      // like a real tool-calling model: once it sees its tool results, it wraps up in text
      if (body.messages.some((m) => m.role === 'tool')) return chatReply('All files written.');
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: "const http=require('http');" }, { path: '/package.json', content: '{}' }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: "require('node:test');" }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('every request declares the write_file tool', bodiesSeen.length > 0 && bodiesSeen.every((b) => Array.isArray(b.tools) && b.tools.some((t) => t.function && t.function.name === 'write_file')));
    t.ok('files from tool_calls (not text parsing) are written correctly', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/x.test.js'));
    t.equal('the real file content from the tool call arguments is preserved exactly', win.Engine.FS.read('/index.html'), '<!doctype html>');
    t.ok('the run completes successfully via tool-calling', steps.some((s) => s.kind === 'done'));
  }
  // ---- the tool loop: confirmed live, llama3.1:8b emits ONE write_file call
  // per turn and stops (finish_reason: tool_calls) waiting for the result.
  // Each result must be fed back as a role:"tool" message so it continues. ----
  {
    const win = load();
    win.Engine.Proj.create('t1i', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const backendBodies = [];
    const backendFiles = [{ path: '/server.js', content: 'srv' }, { path: '/db.js', content: 'db' }, { path: '/package.json', content: '{}' }];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const toolResults = body.messages.filter((m) => m.role === 'tool').length;
      if (/BACKEND ONLY/.test(sys)) {
        backendBodies.push(body);
        // one file per turn, then a text wrap-up
        if (toolResults < backendFiles.length) return chatToolCalls([backendFiles[toolResults]]);
        return chatReply('Backend done.');
      }
      if (toolResults) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('the backend stage kept calling the model until it stopped using tools (3 files + 1 wrap-up)', backendBodies.length, 4);
    t.ok('all three files written one-per-turn were collected', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/db.js') && win.Engine.FS.exists('/package.json'));
    const last = backendBodies[backendBodies.length - 1].messages;
    const assistantCalls = last.filter((m) => m.role === 'assistant' && Array.isArray(m.tool_calls));
    const toolMsgs = last.filter((m) => m.role === 'tool');
    t.ok('each tool result is fed back with the tool_call_id of the call it answers', toolMsgs.length === 3 && toolMsgs.every((m, i) => m.tool_call_id === assistantCalls[i].tool_calls[0].id));
    t.ok('the tool result tells the model the write succeeded', /Wrote \/server\.js successfully/.test(toolMsgs[0].content));
    t.ok('the run completes', steps.some((s) => s.kind === 'done'));
  }

  // ---- token economy, from Ollama's own timings on a CPU-only machine: each
  // turn re-read every file already written (1,755 tokens at ~4.7 tok/s — 6+
  // minutes) because history re-sent the bodies as tool-call arguments. ----
  {
    const win = load();
    win.Engine.Proj.create('t1t', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const BIG = 'x'.repeat(3000);
    const backendBodies = [];
    let imitationResult = null;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const results = body.messages.filter((m) => m.role === 'tool');
      if (/BACKEND ONLY/.test(sys)) {
        backendBodies.push(body);
        if (results.length === 0) return chatToolCalls([{ path: '/server.js', content: BIG }]);
        if (results.length === 1) return chatToolCalls([{ path: '/db.js', content: '[saved: 3000 chars]' }]); // imitating the placeholder
        if (results.length === 2) { imitationResult = results[1].content; return chatToolCalls([{ path: '/db.js', content: "'real db'" }]); }
        return chatReply('done');
      }
      if (results.length) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const secondTurn = JSON.stringify(backendBodies[1] && backendBodies[1].messages);
    t.ok('the next turn does NOT re-send the 3,000-char file body', !!backendBodies[1] && secondTurn.indexOf(BIG) < 0);
    t.ok('it carries a short placeholder instead', /\[saved: 3000 chars\]/.test(secondTurn));
    t.equal('the real file content is still what gets saved', win.Engine.FS.read('/server.js'), BIG);
    t.ok('a write that imitates the placeholder is rejected with a reason', /Rejected: .*placeholder/.test(imitationResult || ''));
    t.equal('and the model\'s real follow-up content is what lands', win.Engine.FS.read('/db.js'), "'real db'");
  }

  // ---- mixed mode, confirmed live: llama3.1:8b wrote 5 files via tool
  // calls, then put /package.json in its closing TEXT reply. The new file
  // must be kept; a text restatement of an already-tool-written file must
  // NOT overwrite it. ----
  {
    const win = load();
    win.Engine.Proj.create('t1m', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const sawResults = body.messages.some((m) => m.role === 'tool');
      if (/BACKEND ONLY/.test(sys)) {
        if (!sawResults) return chatToolCalls([{ path: '/server.js', content: "'TOOL VERSION'" }]);
        return chatReply("FILE: /package.json\n```json\n{\"name\":\"app\"}\n```\n\nFILE: /server.js\n```javascript\nRESTATED VERSION\n```\n\nThis is a basic backend.");
      }
      if (sawResults) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a new file from the closing text reply is kept, not dropped', win.Engine.FS.read('/package.json'), '{"name":"app"}');
    t.equal('a text restatement never overwrites the file the tool already wrote', win.Engine.FS.read('/server.js'), "'TOOL VERSION'");
    t.ok('the run completes', steps.some((s) => s.kind === 'done'));
  }

  // ---- confirmed live: with 2+ tool calls, Ollama sometimes parses only the
  // FIRST into tool_calls and leaves the rest as raw text in `content`, in
  // llama3.1's native {"name":..., "parameters":{...}} shape — preceded by a
  // truncated tail of the first call. Those must be recovered, not lost. ----
  {
    const win = load();
    win.Engine.Proj.create('t1n', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    let backendSecondTurn = null;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const sawResults = body.messages.some((m) => m.role === 'tool');
      if (/BACKEND ONLY/.test(sys)) {
        if (sawResults) { backendSecondTurn = body; return chatReply('done'); }
        const leftover = '}\\n"}}\n\n' + JSON.stringify({ name: 'write_file', parameters: { path: '/package.json', content: '{"scripts":{"start":"node server.js","test":"node --test"}}' } });
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({ choices: [{ message: { content: leftover, tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: '/server.js', content: 'srv' }) } }] } }] })
        };
      }
      if (sawResults) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('the structured tool call is written', win.Engine.FS.read('/server.js'), 'srv');
    t.equal('the tool call Ollama left as raw text in content is recovered and written too', win.Engine.FS.read('/package.json'), '{"scripts":{"start":"node server.js","test":"node --test"}}');
    t.equal('the model gets a tool result for BOTH calls, the recovered one included', backendSecondTurn && backendSecondTurn.messages.filter((m) => m.role === 'tool').length, 2);
    t.ok('the run completes', steps.some((s) => s.kind === 'done'));
  }
  {
    // The recovery must not misfire on ordinary JSON that merely has a
    // "name" — e.g. a package.json restated in a FILE: block.
    const win = load();
    win.Engine.Proj.create('t1o', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    let backendCalls = 0;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) { backendCalls++; return chatReply('FILE: /package.json\n```json\n{"name":"app","version":"1.0.0"}\n```'); }
      if (/FRONTEND ONLY/.test(sys)) return chatReply('FILE: /index.html\n```html\n<!doctype html>\n```');
      if (/TESTS ONLY/.test(sys)) return chatReply('FILE: /test/x.test.js\n```javascript\nok\n```');
      return { ok: false, status: 500, text: async () => '' };
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('plain JSON with a "name" field is not mistaken for a tool call (one call, parsed as a FILE: block)', backendCalls, 1);
    t.equal('and the FILE: block is still written normally', win.Engine.FS.read('/package.json'), '{"name":"app","version":"1.0.0"}');
  }

  // ---- confirmed live: Tests' second turn hit the 10-minute timeout after
  // turn 1 had already written a real test file. A later-turn failure must
  // keep earlier progress; a FIRST-turn failure must still fail honestly. ----
  {
    const win = load();
    win.Engine.Proj.create('t1p', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const sawResults = body.messages.some((m) => m.role === 'tool');
      if (/TESTS ONLY/.test(sys)) {
        if (sawResults) throw new Error('timeout');
        return chatToolCalls([{ path: '/test/project.test.js', content: "'real test'" }]);
      }
      if (sawResults) return chatReply('done');
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: 'srv' }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a file written on turn 1 survives a timeout on turn 2', win.Engine.FS.read('/test/project.test.js'), "'real test'");
    const testsDone = steps.find((s) => s.kind === 'task-done' && s.taskId === 'T-tests');
    t.ok('the stage still counts as generated, not failed', !!testsDone && /generated — verifying next/.test(testsDone.text));
  }
  {
    const win = load();
    win.Engine.Proj.create('t1q', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/TESTS ONLY/.test(sys)) throw new Error('timeout');
      if (body.messages.some((m) => m.role === 'tool')) return chatReply('done');
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: 'srv' }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const testsDone = steps.find((s) => s.kind === 'task-done' && s.taskId === 'T-tests');
    t.ok('a FIRST-turn failure (nothing written yet) still fails the stage honestly, with the real reason', !!testsDone && /stage failed \(timeout\)/.test(testsDone.text));
  }

  // ---- confirmed live: the model put the text-format heading INSIDE the
  // write_file content ("FILE: /package.json\n{...}"), making package.json
  // unparseable — so the app was treated as a static site (no install,
  // tests skipped-as-passing) and the observer crawled an unrelated server. ----
  {
    const win = load();
    win.Engine.Proj.create('t1r', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const backendResults = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const results = body.messages.filter((m) => m.role === 'tool');
      if (/BACKEND ONLY/.test(sys)) {
        backendResults.push(results.map((m) => m.content));
        if (results.length === 0) {
          return chatToolCalls([
            { path: '/package.json', content: 'FILE: /package.json\n{\n  "name": "app",\n  "scripts": { "start": "node server.js" }\n}' },
            { path: '/server.js', content: "```javascript\nconst x = 1;\n```" },
            { path: '/config.json', content: '{ name: "not json" }' }
          ]);
        }
        if (results.length === 3) return chatToolCalls([{ path: '/config.json', content: '{"name":"fixed"}' }]);
        return chatReply('done');
      }
      if (results.length) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const pkg = win.Engine.FS.read('/package.json');
    let parsed = null; try { parsed = JSON.parse(pkg); } catch (_) {}
    t.ok('an echoed "FILE: /path" heading inside tool content is stripped — package.json is valid JSON', !!parsed && parsed.scripts.start === 'node server.js');
    t.equal('a code fence wrapped around tool content is stripped', win.Engine.FS.read('/server.js'), 'const x = 1;');
    const firstResults = backendResults[1] || [];
    t.ok('invalid JSON is REJECTED with the parse error, so the model can fix it', firstResults.some((m) => /Rejected: \/config\.json is not valid JSON/.test(m)));
    t.equal('and the model\'s corrected JSON is what gets written', win.Engine.FS.read('/config.json'), '{"name":"fixed"}');
  }
  {
    // The repair evidence must name an unparseable package.json as the
    // root cause, and must say plainly when the verifier did NOT start the
    // app itself (it had crawled an unrelated server on :4173).
    const win = load();
    win.Engine.Proj.create('t1s', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win);
    win.Engine.FS.write('/package.json', 'FILE: /package.json\n{"name":"x"}');
    win.Engine.Sovereign.observe = () => {
      win.Engine.Sovereign.write('runtime-trace.json', { url: 'http://localhost:4173/', serverStartedByUs: false, title: 'CodeSovereign — AI App Factory', controlsFound: 14, controlsExercised: 8, at: Date.now() });
      return Promise.resolve({});
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const repairSys = (repairBodies[0] && repairBodies[0].messages.find((m) => m.role === 'system').content) || '';
    t.ok('the repair evidence names an invalid package.json as the root cause', /\/package\.json is NOT valid JSON/.test(repairSys));
    t.ok('the evidence says plainly the verifier did NOT start the app, and which page it actually saw', /did NOT start the app itself/.test(repairSys) && /CodeSovereign — AI App Factory/.test(repairSys));
  }

  // ---- a stage trying to rewrite an EARLIER stage's file is rejected WITH
  // a reason, and the model gets to correct itself. Confirmed live: asked
  // for TESTS ONLY, llama3.1:8b's first call rewrote the context /server.js. ----
  {
    const win = load();
    win.Engine.Proj.create('t1j', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const testsBodies = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const toolResults = body.messages.filter((m) => m.role === 'tool');
      if (/TESTS ONLY/.test(sys)) {
        testsBodies.push(body);
        if (toolResults.length === 0) return chatToolCalls([{ path: '/server.js', content: "'CLOBBERED'" }]);
        if (toolResults.length === 1) return chatToolCalls([{ path: '/test/server.test.js', content: "'real test'" }]);
        return chatReply('done');
      }
      if (toolResults.length) return chatReply('done');
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: "'REAL BACKEND'" }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('the real backend file is NOT clobbered by the tests stage', win.Engine.FS.read('/server.js'), "'REAL BACKEND'");
    const rejection = (testsBodies[1] && testsBodies[1].messages.find((m) => m.role === 'tool')) || {};
    t.ok('the model is told WHY the write was rejected', /Rejected: \/server\.js was already written by an earlier stage/.test(rejection.content || ''));
    t.equal('after the rejection, the model self-corrected and wrote a real test file', win.Engine.FS.read('/test/server.test.js'), "'real test'");
    t.ok('the run completes after the self-correction', steps.some((s) => s.kind === 'done'));
  }

  // ---- a model without tool support (Ollama answers HTTP 400 "does not
  // support tools") must not break every stage: retry once without tools,
  // and don't offer them again for the rest of the run. ----
  {
    const win = load();
    win.Engine.Proj.create('t1k', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'gemma:2b', baseUrl: 'http://localhost:11434' });
    const bodies = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      bodies.push(body);
      if (body.tools) return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'registry.ollama.ai/library/gemma:2b does not support tools' } }) };
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) return chatReply("FILE: /server.js\n```javascript\nok\n```");
      if (/FRONTEND ONLY/.test(sys)) return chatReply("FILE: /index.html\n```html\n<!doctype html>\n```");
      if (/TESTS ONLY/.test(sys)) return chatReply("FILE: /test/x.test.js\n```javascript\nok\n```");
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('a "does not support tools" 400 falls back to text and every stage still writes its files', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/x.test.js'));
    t.equal('tools are offered once, rejected, and never offered again for the rest of the run', bodies.filter((b) => b.tools).length, 1);
    t.ok('the run completes', steps.some((s) => s.kind === 'done'));
  }

  // ---- the loop is bounded: a model that keeps writing new files forever
  // stops at MAX_TOOL_TURNS (8) instead of spinning. ----
  {
    const win = load();
    win.Engine.Proj.create('t1l', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    let backendCalls = 0;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) { backendCalls++; return chatToolCalls([{ path: '/gen-' + backendCalls + '.js', content: 'x' }]); }
      if (body.messages.some((m) => m.role === 'tool')) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a never-ending tool loop is capped at 8 turns', backendCalls, 8);
    t.ok('the files written before the cap are still kept', win.Engine.FS.exists('/gen-1.js') && win.Engine.FS.exists('/gen-8.js'));
  }
  {
    // A provider/model that ignores tools and answers in plain text (no
    // tool_calls at all) must still work exactly as before — tool-calling
    // is additive, not a hard requirement.
    const win = load();
    win.Engine.Proj.create('t1h', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) return chatReply("FILE: /server.js\n```javascript\nok\n```");
      if (/FRONTEND ONLY/.test(sys)) return chatReply("FILE: /index.html\n```html\n<!doctype html>\n```");
      if (/TESTS ONLY/.test(sys)) return chatReply("FILE: /test/x.test.js\n```javascript\nok\n```");
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('a provider that never uses tool_calls still falls back to text parsing correctly', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/x.test.js'));
    t.ok('the run still completes successfully with the text fallback', steps.some((s) => s.kind === 'done'));
  }

  // ---- context scoping: Frontend/Tests only see what the PRIOR stage(s)
  // actually wrote, not every file in the workspace. Confirmed live: a real
  // desktop session's FS also holds hundreds of .sovereign/*, delivery/*,
  // CI/CD, and docs bookkeeping files from Contract/Sovereign analysis —
  // llmTaskFilesBlock() called with no paths used to dump ALL of them into
  // Frontend's context (176 files / 200K+ chars in the field), which
  // Ollama's default context window then silently truncated, losing the
  // actual FILE:/fence formatting instructions along with the noise — the
  // model fell back to prose + markdown-bold headers, which is exactly the
  // "no usable file plan came back for this stage" failure this fixes. ----
  {
    const win = load();
    win.Engine.Proj.create('t1d', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    // simulate a real desktop session's accumulated bookkeeping noise
    for (let i = 0; i < 50; i++) win.Engine.FS.write('/.sovereign/noise-' + i + '.json', JSON.stringify({ irrelevant: 'x'.repeat(500) }));
    win.Engine.FS.write('/delivery/MANIFEST.json', JSON.stringify({ irrelevant: 'x'.repeat(500) }));

    const requestsSeen = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      requestsSeen.push(sys);
      if (/BACKEND ONLY/.test(sys)) return chatReply({ summary: 'backend', files: [{ path: '/server.js', content: 'const http=require("http");' }, { path: '/package.json', content: '{}' }] });
      if (/FRONTEND ONLY/.test(sys)) return chatReply({ summary: 'frontend', files: [{ path: '/index.html', content: '<!doctype html>' }] });
      if (/TESTS ONLY/.test(sys)) return chatReply({ summary: 'tests', files: [{ path: '/test/x.test.js', content: "require('node:test');" }] });
      return { ok: false, status: 500, text: async () => '' };
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);

    const frontendSys = requestsSeen.find((s) => /FRONTEND ONLY/.test(s));
    const testsSys = requestsSeen.find((s) => /TESTS ONLY/.test(s));
    t.ok('the frontend context includes the real backend files', frontendSys.includes('FILE: /server.js') && frontendSys.includes('FILE: /package.json'));
    t.ok('the frontend context does NOT include unrelated .sovereign/delivery bookkeeping noise', !frontendSys.includes('.sovereign/noise-') && !frontendSys.includes('delivery/MANIFEST'));
    t.ok('the frontend context is reasonably small, not a whole-workspace dump', frontendSys.length < 5000);
    t.ok('the tests context includes backend AND frontend files', testsSys.includes('FILE: /server.js') && testsSys.includes('FILE: /index.html'));
    t.ok('the tests context also excludes the bookkeeping noise', !testsSys.includes('.sovereign/noise-'));
  }

  // ---- retry on a parse failure: Orchestrator's own cycle-retry never
  // fires for deferProof:true tasks (the task-graph's default), so without
  // this a single bad response permanently fails the stage. Confirmed live:
  // even with a small, well-formed prompt, llama3.1:8b sometimes ignores
  // the FILE:/fence instruction and reverts to prose + **filename** headers
  // — genuine model non-determinism, not something a prompt tweak
  // deterministically fixes. One retry, ONLY on that specific parse
  // failure, should let a transient bad roll recover without ever
  // accepting a response that doesn't actually contain a real file plan. ----
  {
    const win = load();
    win.Engine.Proj.create('t1e', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    let frontendCalls = 0;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) return chatReply({ summary: 'backend', files: [{ path: '/server.js', content: 'ok' }] });
      if (/FRONTEND ONLY/.test(sys)) {
        frontendCalls++;
        if (frontendCalls === 1) return chatReply("Here is a basic implementation:\n\n**index.html**\n```html\n<!doctype html>\n```");
        return chatReply("FILE: /index.html\n```html\n<!doctype html><html><body>real UI</body></html>\n```");
      }
      if (/TESTS ONLY/.test(sys)) return chatReply({ summary: 'tests', files: [{ path: '/test/x.test.js', content: "require('node:test');" }] });
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a malformed first response triggers exactly one retry, not more', frontendCalls, 2);
    t.ok('the retry succeeded and wrote the real (second) response, not the malformed first one', win.Engine.FS.read('/index.html').includes('real UI'));
    t.ok('the run completes successfully after the retry recovers', steps.some((s) => s.kind === 'done'));
  }
  {
    const win = load();
    win.Engine.Proj.create('t1f', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    let frontendCalls = 0;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) return chatReply({ summary: 'backend', files: [{ path: '/server.js', content: 'ok' }] });
      if (/FRONTEND ONLY/.test(sys)) { frontendCalls++; return chatReply('Here is a basic implementation:\n\n**index.html**\n```html\n<!doctype html>\n```'); }
      if (/TESTS ONLY/.test(sys)) return chatReply({ summary: 'tests', files: [{ path: '/test/x.test.js', content: "require('node:test');" }] });
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a stage that keeps failing to parse stops after exactly one retry (2 attempts total), not an infinite loop', frontendCalls, 2);
    t.ok('two genuine parse failures in a row are still reported as an honest failure, not silently accepted', steps.some((s) => s.kind === 'warn' || s.kind === 'task-done' && /stage failed/.test(s.text)));
  }

  // ---- timeout tuning: OpenClaw gets a short leash (180s) per stage, not
  // the same 300s/600s budget as the Direct fallback it hands off to; and
  // only the FIRST stage to hit a failing/slow OpenClaw pays that cost —
  // runState.forceBackend then routes every later stage straight to Direct.
  // Confirmed live: a shared 5-minute budget let OpenClaw's own agent-
  // runtime overhead consume the whole window on Frontend/Tests, leaving
  // nothing for the Direct fallback that would otherwise have succeeded. ----
  {
    const win = load();
    win.Engine.Proj.create('t1c', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434', executionBackend: 'openclaw', openclawAgentId: 'main' });
    const openClawCalls = [];
    win.Engine.AIRouter = {
      OpenClaw: {
        runAgentTurn: async (opts) => { openClawCalls.push(opts); return { ok: false, error: 'timed out' }; }
      }
    };
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) return chatReply("FILE: /server.js\n```javascript\nconst http=require('http');\n```");
      if (/FRONTEND ONLY/.test(sys)) return chatReply("FILE: /index.html\n```html\n<!doctype html><html><body>UI</body></html>\n```");
      if (/TESTS ONLY/.test(sys)) return chatReply("FILE: /test/x.test.js\n```javascript\nrequire('node:test');\n```");
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a doomed OpenClaw attempt is only ever tried ONCE for the whole run, not once per stage', openClawCalls.length, 1);
    t.equal('the task-graph OpenClaw attempt uses the short 180s leash, not the default 300s', openClawCalls[0] && openClawCalls[0].timeoutSec, 180);
    t.ok('every stage still produced real files via the Direct fallback', win.Engine.FS.exists('/server.js') && win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/x.test.js'));
    t.ok('the run completes successfully despite OpenClaw always failing', steps.some((s) => s.kind === 'done'));
  }

  // ---- verify -> repair -> re-verify. Confirmed live: the run PROVED the
  // failure (observer loaded :3000, found 0 controls — no express.static)
  // and then just stopped. The real evidence must go back to the model,
  // and the real checks must run again. ----
  function setupRepairScenario(win, opts) {
    opts = opts || {};
    setupDesktopMocks(win, {});
    const fixedNow = () => /express\.static/.test(win.Engine.FS.read('/server.js') || '');
    win.Engine.DoD = {
      evaluate: () => {},
      load: () => {
        const ok = !opts.neverPasses && fixedNow();
        return { criteria: { dependenciesConnected: ok, runtimeActionSucceeds: ok, buildSucceeds: true, testsSucceed: true }, PASS: ok };
      }
    };
    // what a real observe() records: the page at :3000 and its controls
    win.Engine.Sovereign.observe = () => {
      win.Engine.Sovereign.write('runtime-trace.json', { url: 'http://localhost:3000/', controlsFound: fixedNow() ? 6 : 0, controlsExercised: 0, at: Date.now() });
      return Promise.resolve({});
    };
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const repairBodies = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const sawResults = body.messages.some((m) => m.role === 'tool');
      if (/YOUR JOB — REPAIR/.test(sys)) {
        if (!sawResults) repairBodies.push(body);
        if (sawResults) return chatReply('Fixed.');
        return chatToolCalls([{ path: '/server.js', content: "const express=require('express');const app=express();app.use(express.static(__dirname));module.exports=app;" }]);
      }
      if (sawResults) return chatReply('done');
      if (opts.buildNothing) return { ok: false, status: 500, text: async () => 'down' };
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: "const express=require('express');const app=express();module.exports=app;" }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<form><button>Add</button></form>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'ok' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    return repairBodies;
  }
  {
    const win = load();
    win.Engine.Proj.create('r1', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win);
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('a failed end-to-end check triggers a repair round', steps.some((s) => s.kind === 'repair'));
    const repairSys = (repairBodies[0] && repairBodies[0].messages.find((m) => m.role === 'system').content) || '';
    t.ok('the repair prompt carries what the run actually observed (0 controls at :3000)', /found 0 interactive controls/.test(repairSys) && /localhost:3000/.test(repairSys));
    t.ok('the repair prompt names the failing checks', /Failing checks: dependenciesConnected, runtimeActionSucceeds/.test(repairSys));
    t.ok('the repair prompt includes the current app files to fix', /FILE: \/server\.js/.test(repairSys) && /FILE: \/index\.html/.test(repairSys));
    t.ok('the repair actually changed the file', /express\.static/.test(win.Engine.FS.read('/server.js')));
    t.equal('it stopped after the first successful repair round', repairBodies.length, 1);
    const done = steps.find((s) => s.kind === 'done');
    t.ok('the re-verified app is reported done, with the repair round counted', !!done && /4\/4 tasks satisfied/.test(done.text) && /1 repair round/.test(done.text));
  }
  {
    // Confirmed live: `npm test` died on `SyntaxError: Unexpected token
    // 'delete'`, but a blind 800-char tail kept only stack frames — the
    // repair model never saw the error and "fixed" package.json instead.
    const win = load();
    win.Engine.Proj.create('r1b', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win);
    const frames = Array.from({ length: 40 }, (_, i) => '    at Module._compile (node:internal/modules/cjs/loader:' + (1900 + i) + ':14)').join('\n');
    const realOutput = '\u001b[34m> todo-list-app@1.0.0 test\u001b[39m\n> node --test\n\n' +
      'C:\\proj\\projects.js:16\nfunction delete(id) {\n         ^^^^^^\n\nSyntaxError: Unexpected token \'delete\'\n' + frames +
      '\n\nNode.js v24.21.0\n\u001b[31m✖ test\\projects.test.js (707.18ms)\u001b[39m\n' + frames +
      '\nℹ tests 2\nℹ pass 0\nℹ fail 2\n';
    win.Engine.Sovereign.runEvidence = () => {
      win.Engine.Sovereign.write('execution-evidence.json', { generatedAt: Date.now(), steps: { test: { code: 1, pass: false, skipped: false, tail: realOutput.slice(-6000) } } });
      return Promise.resolve({});
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const repairSys = (repairBodies[0] && repairBodies[0].messages.find((m) => m.role === 'system').content) || '';
    t.ok('the repair prompt carries the ACTUAL error line, not just stack frames', repairSys.includes("SyntaxError: Unexpected token 'delete'"));
    t.ok('it keeps where the error is (file:line and the offending code)', repairSys.includes('projects.js:16') && repairSys.includes('function delete(id) {'));
    t.ok('and the test summary (how many failed)', repairSys.includes('fail 2'));
    t.ok('stack frames are stripped (pure noise for the model)', !/\n\s+at Module\._compile/.test(repairSys));
    t.ok('ANSI colour codes are stripped', !repairSys.includes('\u001b['));
  }
  {
    // Confirmed from Ollama's timings: a repair prompt with the WHOLE app
    // (2,679 tokens) was killed at 10 minutes before the model finished
    // reading it. Show what the evidence implicates; only NAME the rest.
    const win = load();
    win.Engine.Proj.create('r1c', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win);
    win.Engine.Sovereign.runEvidence = () => {
      win.Engine.Sovereign.write('execution-evidence.json', { generatedAt: Date.now(), steps: { test: { code: 1, pass: false, skipped: false, tail: 'C:\\proj\\x.test.js:3\nSyntaxError: Unexpected token' } } });
      return Promise.resolve({});
    };
    const origFetch = win.fetch;
    win.fetch = async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      const sys = ((body.messages || []).find((m) => m.role === 'system') || {}).content || '';
      if (/FRONTEND ONLY/.test(sys) && !body.messages.some((m) => m.role === 'tool')) {
        return chatToolCalls([{ path: '/index.html', content: '<form><button>Add</button></form>' }, { path: '/styles.css', content: 'body{}'.repeat(20) }, { path: '/script.js', content: 'go()' }]);
      }
      return origFetch(url, init);
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const repairSys = (repairBodies[0] && repairBodies[0].messages.find((m) => m.role === 'system').content) || '';
    t.ok('the repair shows the server entry and the page the runtime check was about', /FILE: \/server\.js/.test(repairSys) && /FILE: \/index\.html/.test(repairSys));
    t.ok('it shows the test file the evidence names', /FILE: \/test\/x\.test\.js/.test(repairSys));
    t.ok('unimplicated files are named, not dumped in full', !/FILE: \/styles\.css/.test(repairSys) && /Other files in the app \(not shown[^)]*\): .*\/styles\.css/.test(repairSys));
  }
  {
    // Confirmed live: repair round 1 took the tests 0/6 -> 5/6, round 2 then
    // rewrote the test file and fell back to 0/6 — and the build KEPT that.
    // A round that leaves the app worse must be rolled back.
    const win = load();
    win.Engine.Proj.create('r1d', 'saas-dashboard');
    setupDesktopMocks(win, {});
    win.Engine.DoD = { evaluate: () => {}, load: () => ({ criteria: { dependenciesConnected: false, runtimeActionSucceeds: false, testsSucceed: false }, PASS: false }) };
    const passCount = { v0: 0, v1: 5, v2: 0 };
    win.Engine.Sovereign.runEvidence = () => {
      const v = win.Engine.FS.read('/test/x.test.js') || 'v0';
      win.Engine.Sovereign.write('execution-evidence.json', { generatedAt: Date.now(), steps: { test: { code: 1, pass: false, skipped: false, tail: 'ℹ tests 6\nℹ pass ' + passCount[v] + '\nℹ fail ' + (6 - passCount[v]) } } });
      return Promise.resolve({});
    };
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    let repairRound = 0;
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const sawResults = body.messages.some((m) => m.role === 'tool');
      if (sawResults) return chatReply('done');
      if (/YOUR JOB — REPAIR/.test(sys)) {
        repairRound++;
        if (repairRound === 1) return chatToolCalls([{ path: '/test/x.test.js', content: 'v1' }]);
        return chatToolCalls([{ path: '/test/x.test.js', content: 'v2' }, { path: '/junk.js', content: "'created by the bad round'" }]);
      }
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: 'srv' }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'v0' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('the improving round is kept', repairRound, 2);
    t.equal('the regressing round is rolled back: the 5/6 test file is restored', win.Engine.FS.read('/test/x.test.js'), 'v1');
    t.ok('a file the regressing round CREATED is removed', !win.Engine.FS.exists('/junk.js'));
    const rb = steps.find((s) => s.kind === 'repair' && /made things worse/.test(s.text));
    t.ok('the rollback is reported with the before/after numbers', !!rb && /5 tests passing → .*0 tests passing/.test(rb.text));
  }
  {
    // Live run 2026-09-29: a repair swapped JSON storage for sequelize+sqlite
    // (driver missing) so the test FILE crashed on load: 4 tests running
    // became 1 failed file with 0 passing either way. Same failing checks,
    // same passing count — the regression was kept. Fewer tests running is
    // now a tie-breaker, and the repair prompt forbids swapping the storage.
    const win = load();
    win.Engine.Proj.create('r1f', 'saas-dashboard');
    setupDesktopMocks(win, {});
    win.Engine.DoD = { evaluate: () => {}, load: () => ({ criteria: { dependenciesConnected: false, runtimeActionSucceeds: false, testsSucceed: false }, PASS: false }) };
    const shape = { v0: [4, 0], v1: [1, 0], v2: [4, 0] };
    win.Engine.Sovereign.runEvidence = () => {
      const v = win.Engine.FS.read('/test/x.test.js') || 'v0';
      const [n, p] = shape[v] || [4, 0];
      win.Engine.Sovereign.write('execution-evidence.json', { generatedAt: Date.now(), steps: { test: { code: 1, pass: false, skipped: false, tail: 'ℹ tests ' + n + '\nℹ pass ' + p + '\nℹ fail ' + (n - p) } } });
      return Promise.resolve({});
    };
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    let repairRound = 0; let repairSys = '';
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (body.messages.some((m) => m.role === 'tool')) return chatReply('done');
      if (/YOUR JOB — REPAIR/.test(sys)) {
        repairRound++; repairSys = sys;
        return chatToolCalls([{ path: '/test/x.test.js', content: repairRound === 1 ? 'v1' : 'v2' }]);
      }
      if (/BACKEND ONLY/.test(sys)) return chatToolCalls([{ path: '/server.js', content: 'srv' }]);
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: 'v0' }]);
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const rb = steps.find((s) => s.kind === 'repair' && /made things worse/.test(s.text));
    t.ok('a round that leaves fewer tests running (same 0 passing) is rolled back', !!rb);
    t.ok('the repair prompt forbids swapping JSON storage for a database package', /do NOT switch to sequelize, sqlite, mongoose/.test(repairSys));
  }
  {
    // Confirmed live: the observer clicked all 6 buttons and every one was
    // MOCK, but the evidence only said "found 6, exercised 6".
    const win = load();
    win.Engine.Proj.create('r1e', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win, { neverPasses: true });
    win.Engine.Sovereign.observe = () => {
      win.Engine.Sovereign.write('runtime-trace.json', { url: 'http://localhost:3000/', serverStartedByUs: true, title: 'Todo List App', controlsFound: 2, controlsExercised: 2, at: Date.now(),
        trace: [{ control: { name: 'Create Todo' }, status: 'MOCK' }, { control: { name: 'Delete' }, status: 'BROKEN', threw: 'TypeError: api is not defined' }] });
      return Promise.resolve({});
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const repairSys = (repairBodies[0] && repairBodies[0].messages.find((m) => m.role === 'system').content) || '';
    t.ok('the repair is told which controls did nothing, by name', /did NOT work when clicked/.test(repairSys) && /"Create Todo" MOCK/.test(repairSys));
    t.ok('and a BROKEN control carries the error it threw', /"Delete" BROKEN \(TypeError: api is not defined\)/.test(repairSys));
  }
  {
    const win = load();
    win.Engine.Proj.create('r2', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win, { neverPasses: true });
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('repair is bounded: exactly 2 rounds when the check never passes', repairBodies.length, 2);
    const warn = steps.find((s) => s.kind === 'warn');
    t.ok('and then it reports an honest warn naming the rounds tried, never a false done', !!warn && /2 repair rounds/.test(warn.text) && !steps.some((s) => s.kind === 'done'));
  }
  {
    const win = load();
    win.Engine.Proj.create('r3', 'saas-dashboard');
    win.S = { agentStopped: true };
    const repairBodies = setupRepairScenario(win);
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.equal('a Stop press is honored — no repair round starts', repairBodies.length, 0);
  }
  {
    const win = load();
    win.Engine.Proj.create('r4', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win, { buildNothing: true });
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('when every stage failed to build anything, there is nothing to repair — no repair round', repairBodies.length === 0 && !steps.some((s) => s.kind === 'repair'));
  }

  // ---- a failing stage is reported honestly, not hidden ----
  {
    const win = load();
    win.Engine.Proj.create('t2', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: false, runtimeActionSucceeds: false, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) return chatReply({ summary: 'backend', files: [{ path: '/server.js', content: 'ok' }] });
      if (/FRONTEND ONLY/.test(sys)) return chatReply({ summary: 'frontend', files: [{ path: '/index.html', content: 'ok' }] });
      if (/TESTS ONLY/.test(sys)) return chatReply({ summary: 'tests', files: [{ path: '/test/x.test.js', content: 'ok' }] });
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('integration failure is reported as an honest warn, not a false done', steps.some((s) => s.kind === 'warn' && /did not verify/.test(s.text)));
    t.ok('does not claim done when integration criteria are not met', !steps.some((s) => s.kind === 'done'));
  }

  // ---- a real network failure on one stage fails only that stage, honestly, thanks to the Orchestrator robustness fix ----
  {
    const win = load();
    win.Engine.Proj.create('t3', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      if (/BACKEND ONLY/.test(sys)) throw new Error('model timed out');
      if (/FRONTEND ONLY/.test(sys)) return chatReply({ summary: 'frontend', files: [{ path: '/index.html', content: 'ok' }] });
      if (/TESTS ONLY/.test(sys)) return chatReply({ summary: 'tests', files: [{ path: '/test/x.test.js', content: 'ok' }] });
      return { ok: false, status: 500, text: async () => '' };
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('the run does not crash when one stage genuinely fails', steps.length > 0);
    t.ok('a real failure reason is surfaced, not swallowed', steps.some((s) => s.kind === 'warn' && /model timed out/.test(s.text)));
    t.ok('sibling stages (frontend/tests) still ran despite backend failing', win.Engine.FS.exists('/index.html') && win.Engine.FS.exists('/test/x.test.js'));

    // The intermediate per-stage status must not claim "generated" for a
    // stage whose generate() actually failed — Orchestrator's robustness
    // catch turns a rejection into an empty file list so the whole run
    // doesn't crash, but the live status line must say the stage genuinely
    // failed, not imply it produced something that's merely pending
    // verification (real live-desktop testing caught this exact gap: a
    // timed-out stage was shown as "generated — verifying next").
    const backendTaskDone = steps.find((s) => s.kind === 'task-done' && s.taskId === 'T-backend');
    t.ok('a stage whose generate() failed is reported as failed, not as "generated"', !!backendTaskDone && /stage failed/.test(backendTaskDone.text) && /model timed out/.test(backendTaskDone.text));
    const frontendTaskDone = steps.find((s) => s.kind === 'task-done' && s.taskId === 'T-frontend');
    t.ok('a stage that genuinely produced files still says "generated"', !!frontendTaskDone && /generated — verifying next/.test(frontendTaskDone.text));
  }

  // ---- NOT desktop: falls through unchanged to the existing round loop ----
  {
    const win = load();
    win.Engine.Proj.create('t4', 'saas-dashboard');
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      return chatReply({ summary: 'monolithic build', files: [{ path: '/index.html', content: '<!doctype html><html><head><title>x</title></head><body><h1>x</h1><button>Go</button></body></html>' }, { path: '/styles/main.css', content: 'body{color:red}' }, { path: '/scripts/app.js', content: 'console.log(1)' }] });
    };
    const steps = await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok('no task-graph plan-result outside desktop, even for a substantial prompt', !steps.some((s) => s.kind === 'plan-result' && Array.isArray(s.taskGraph)));
  }

  // ---- a follow-up, even desktop + substantial-looking, does not trigger the task graph ----
  {
    const win = load();
    win.Engine.Proj.create('t5', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.S = { agentBuilt: true, agentRuns: [SUBSTANTIAL_PROMPT] };
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      return chatReply({ summary: 'follow-up edit', files: [{ path: '/index.html', content: '<!doctype html><html><body>edited</body></html>' }] });
    };
    const steps = await win.Engine.Agent.run('add a dark mode toggle');
    t.ok('a follow-up never triggers the task graph, even when desktop + a prior substantial build exists', !steps.some((s) => s.kind === 'plan-result' && Array.isArray(s.taskGraph)));
  }

  // ---- a trivial, non-substantial prompt does not trigger the task graph even on desktop ----
  {
    const win = load();
    win.Engine.Proj.create('t6', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      return chatReply({ summary: 'calculator', files: [{ path: '/index.html', content: '<!doctype html><html><body><button>1</button></body></html>' }] });
    };
    const steps = await win.Engine.Agent.run('build a simple calculator');
    t.ok('a trivial single-artifact request stays on the monolithic round loop', !steps.some((s) => s.kind === 'plan-result' && Array.isArray(s.taskGraph)));
  }
  // ---- one entity + an explicit server side is a full-stack build (live run
  // 2026-09-29: this exact prompt missed the thresholds and went to the
  // single-call loop, which the local model could not handle) ----
  {
    const win = load();
    win.Engine.Proj.create('t7', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.fetch = async (url) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      return chatReply({ summary: 'stage', files: [{ path: '/index.html', content: '<!doctype html><html><head><title>Todos</title></head><body><h1>Todos</h1><form><input><button>Add</button></form></body></html>' }] });
    };
    const steps = await win.Engine.Agent.run('Build a todo list app where I can add, complete and delete todos with due dates, saved by a Node.js backend');
    t.ok('one entity + "Node.js backend" routes through the task graph on desktop', steps.some((s) => s.kind === 'plan-result' && Array.isArray(s.taskGraph)));
  }
  {
    const win = load();
    win.Engine.Proj.create('t8', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    win.fetch = async (url) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      return chatReply({ summary: 'todo', files: [{ path: '/index.html', content: '<!doctype html><html><head><title>T</title></head><body><h1>T</h1><button>Add</button></body></html>' }] });
    };
    const steps = await win.Engine.Agent.run('build a todo list');
    t.ok('the same app WITHOUT a server-side request stays on the round loop', !steps.some((s) => s.kind === 'plan-result' && Array.isArray(s.taskGraph)));
  }

  // ---- the round loop never reports "done" for a build that never passed ----
  {
    const win = load();
    win.Engine.Proj.create('t9', 'saas-dashboard');
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'lmstudio', model: 'test-model', baseUrl: 'http://127.0.0.1:1234', localToken: 'lms-token' });
    let calls = 0;
    win.fetch = async (url) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      calls++;
      if (calls === 1) return chatReply({ summary: 'empty page', files: [{ path: '/index.html', content: '<!doctype html><html><body></body></html>' }] });
      return { ok: false, status: 500, text: async () => '{"error":{"message":"prediction aborted, token repeat limit reached"}}' };
    };
    const steps = await win.Engine.Agent.run('build a simple calculator');
    const last = steps[steps.length - 1] || {};
    t.ok('a never-passing run does not end with a "done" step', !steps.some((s) => s.kind === 'done'));
    t.equal('it ends with an honest warning', last.kind, 'warn');
    t.ok('the warning counts the rounds actually run, not the safety cap (' + last.text + ')', /Stopped after 2 round\(s\) without a passing build/.test(last.text || ''));
    t.ok('the warning names the last error', /last error:/.test(last.text || ''));
  }
  // ---- JavaScript that doesn't parse is refused once, in the same turn ----
  // Live run 2026-09-29: the backend stage wrote `const todo = { title, done,
  // dueDate);` and was marked done; the SyntaxError only surfaced in npm test
  // 12 minutes later. The tool loop now hands the parse error straight back.
  for (const persist of [false, true]) {
    const win = load();
    win.Engine.Proj.create(persist ? 'sx2' : 'sx1', 'saas-dashboard');
    setupDesktopMocks(win, { dependenciesConnected: true, runtimeActionSucceeds: true, buildSucceeds: true, testsSucceed: true });
    win.Engine.LLM.setConfig({ enabled: true, providerId: 'openai_compat', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });
    const BROKEN = "const todo = { title, done, dueDate);\nmodule.exports = todo;\n";
    const FIXED = "const todo = { title: 't', done: false, dueDate: null };\nmodule.exports = todo;\n";
    const toolMsgs = [];
    win.fetch = async (url, init) => {
      if (!/chat\/completions/.test(String(url))) return { ok: false, status: 404, text: async () => '' };
      const body = JSON.parse((init && init.body) || '{}');
      const sys = (body.messages.find((m) => m.role === 'system') || {}).content || '';
      const tools = body.messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
      if (/BACKEND ONLY/.test(sys)) {
        tools.forEach((m) => { if (toolMsgs.indexOf(m) < 0) toolMsgs.push(m); });
        if (tools.length === 0) return chatToolCalls([{ path: '/server.js', content: BROKEN }]);
        if (tools.length === 1) return chatToolCalls([{ path: '/server.js', content: persist ? BROKEN : FIXED }]);
        return chatReply('done');
      }
      if (tools.length) return chatReply('done');
      if (/FRONTEND ONLY/.test(sys)) return chatToolCalls([{ path: '/index.html', content: '<!doctype html><title>T</title><h1>T</h1><button>Go</button>' }]);
      if (/TESTS ONLY/.test(sys)) return chatToolCalls([{ path: '/test/x.test.js', content: "require('node:test')('x', () => {});" }]);
      return chatReply('done');
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    t.ok((persist ? '[still broken] ' : '') + 'the first broken server.js is refused with the parse error', toolMsgs.some((m) => /Rejected: \/server\.js has a JavaScript syntax error/.test(m)));
    if (!persist) {
      t.equal('the corrected file is what gets written', win.Engine.FS.read('/server.js'), FIXED);
    } else {
      t.equal('a second broken attempt is still written (the file is never lost)', win.Engine.FS.read('/server.js'), BROKEN);
      t.ok('…with the syntax error noted back to the model', toolMsgs.some((m) => /Wrote \/server\.js\. Note: it still has a syntax error/.test(m)));
    }
  }
  {
    // A timed-out `npm test` used to reach the model as just "failed (exit
    // -2)". Live run 2026-09-29: a failing test skipped server.close() and the
    // test process never exited. The evidence now says what that means.
    const win = load();
    win.Engine.Proj.create('hung1', 'saas-dashboard');
    const repairBodies = setupRepairScenario(win, { neverPasses: true });
    win.Engine.Sovereign.runEvidence = () => {
      win.Engine.Sovereign.write('execution-evidence.json', { generatedAt: Date.now(), steps: { test: { code: -2, pass: false, skipped: false, timedOut: true, tail: 'ℹ tests 3\n✔ can add todo\n✖ can delete todo' } } });
      return Promise.resolve({});
    };
    await win.Engine.Agent.run(SUBSTANTIAL_PROMPT);
    const repairSys = (repairBodies[0] && repairBodies[0].messages.find((m) => m.role === 'system').content) || '';
    t.ok('a timed-out npm test is explained, not reported as a bare exit code', /`npm test` did not finish/.test(repairSys) && /close every server a test starts/.test(repairSys) && !/failed \(exit -2\)/.test(repairSys));
  }
};
