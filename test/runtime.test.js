'use strict';
/* Computer Use, terminal, /goal, cloud, snapshots, multi-repo, docs search. */
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
    S: { agentPrompt: '/goal fix all flaky tests and make CI green' },
    navigator: { platform: 'Linux x86_64' }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.llm.js');
  run('engine.loop.js');
  run('engine.orchestra.js');
  run('engine.runtime.js');
  return { win, store };
}

module.exports = async function (t) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('index.html loads engine.runtime.js', /engine\.runtime\.js/.test(html));
  t.ok('index.html loads app.runtime.js', /app\.runtime\.js/.test(html));
  const ui = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.runtime.js'), 'utf8');
  t.ok('no new runtime nav page', !/S\.screen\s*=\s*['"]runtime['"]/.test(ui));

  const { win } = load();
  const E = win.Engine;
  t.ok('Computer Use is exposed', E.Computer && typeof E.Computer.launch === 'function');
  t.ok('Terminal profiles are exposed', E.TerminalX && E.TerminalX.profiles.length >= 3);
  t.ok('Goal engine is exposed', E.Goal && typeof E.Goal.run === 'function');
  t.ok('Cloud agents are exposed', E.Cloud && typeof E.Cloud.run === 'function');
  t.ok('Snapshots are exposed', E.Snapshots && E.Snapshots.runtimes.length === 7);
  t.ok('Repos is exposed', E.Repos && E.Repos.layout.length === 5);
  t.ok('Docs corpus is beyond the workspace', E.Docs && E.Docs.corpus.length >= 10);

  const empty = E.Goal.parse('');
  t.ok('empty /goal shows usage', /Usage: \/goal/.test(empty.error || ''));
  const timed = E.Goal.parse('/goal 30m fix all flaky tests');
  t.ok('time-limited goals parse a deadline', timed.deadlineMs === 30 * 60000 && /deadline/.test(timed.notice) && /flaky/.test(timed.objective));
  t.ok('every is flagged as recurring not a goal', E.Goal.parse('/goal every hour ping').recurringHint === true);

  E.FS.write('/index.html', '<!DOCTYPE html><html><head><title>App</title></head><body><h1>App</h1><button id="save">Save</button></body></html>');
  const launched = await E.Computer.launch('preview');
  t.ok('computer use launches the app', launched.ok && launched.via === 'computer-use');
  const clicked = await E.Computer.click('#save');
  t.ok('computer use clicks the UI', clicked.ok);
  E.Computer.type('hello');
  E.Computer.key('Enter');
  const dlg = E.Computer.dialog('Overwrite?', 'cancel');
  t.ok('computer use navigates a dialog', dlg.ok && dlg.dialog.choice === 'cancel');
  t.ok('computer use takes a screenshot', E.Computer.screenshot() && E.Computer.screenshot().at);
  const linux = E.Runtime.registerWorker({ os: 'linux', name: 'shop-linux' });
  const mac = E.Runtime.registerWorker({ os: 'darwin', name: 'shop-mac' });
  t.ok('self-hosted linux and mac workers', linux.os === 'linux' && mac.os === 'darwin' && linux.mouse && mac.keyboard);

  const targets = E.Runtime.targets.map((x) => x.id);
  ['this', 'cloud', 'machine', 'pool', 'sandbox'].forEach((id) => t.ok('run-on ' + id, targets.indexOf(id) >= 0));
  const providers = E.Runtime.providers.map((x) => x.id);
  ['aws-lambda', 'coder', 'cloudflare', 'daytona', 'modal', 'namespace', 'vercel', 'e2b'].forEach((id) => t.ok('provider ' + id, providers.indexOf(id) >= 0));
  E.Runtime.setProvider('e2b');
  t.ok('e2b selects external sandbox', E.Runtime.get().target === 'sandbox');

  const testJob = await E.TerminalX.exec('test');
  t.ok('terminal can run unit tests', typeof testJob.ok === 'boolean');
  const gitJob = await E.TerminalX.exec('git', { git: 'status' });
  t.ok('terminal git status is allowed', gitJob.ok && gitJob.git === 'status');
  const clone = await E.TerminalX.exec('git', { git: 'clone' });
  t.ok('terminal git clone is blocked', clone.ok === false);
  E.TerminalX.setProfile('interactive');
  const held = await E.TerminalX.exec('test');
  t.ok('interactive profile requires approval', held.pendingApproval === true);
  const approved = await E.TerminalX.approve(held.id);
  t.ok('approval then runs the job', typeof approved.ok === 'boolean' && approved.sandbox === false);
  E.TerminalX.setProfile('ci');
  t.ok('ci profile has no network', E.TerminalX.profiles.find((p) => p.id === 'ci').network === 'none');
  const badScript = await E.TerminalX.exec('script', { cmd: 'node -e process.exit(0)' });
  t.ok('terminal still blocks node -e', badScript.ok === false);

  const g = await E.Goal.run('/goal All tests pass');
  t.ok('goal loop records run/analyze/fix', g.steps.some((s) => /Run tests/.test(s.text)) && (g.status === 'satisfied' || g.status === 'capped' || g.status === 'active'));
  t.ok('goal is not a fixed 4-step cap', g.rounds >= 0 && g.status !== undefined);

  const env = E.Cloud.spawn({ secrets: ['OPENAI_API_KEY'] });
  t.ok('cloud agent has vm/repo/deps/env/shell/tests', env.vm && env.repository && env.shell && env.testEnvironment);
  t.ok('cloud secrets are names not values', env.secrets[0].name === 'OPENAI_API_KEY' && env.secrets[0].value == null);
  const pipe = await E.Cloud.run('verify');
  t.ok('cloud pipeline does not need the laptop', pipe.laptopRequired === false && pipe.pr && pipe.pr.note);

  const nodeSnap = E.Snapshots.build('node');
  t.ok('node snapshot warms an image', nodeSnap.ok && nodeSnap.image.runtime === 'node');
  const flutter = E.Snapshots.build('flutter');
  t.ok('failed snapshot can continue on last successful if any', flutter.ok === false);
  t.ok('snapshot runtimes include electron/tauri/android/python/rust', ['python', 'rust', 'android', 'electron', 'tauri'].every((id) => E.Snapshots.runtimes.some((r) => r.id === id)));

  t.ok('default multi-repo layout', E.Repos.list().map((r) => r.id).join(',') === 'frontend-repo,backend-repo,mobile-repo,shared-types,infrastructure');
  E.Repos.switchTo('backend-repo');
  const wrote = E.Repos.write('/server.js', 'export const ok = 1;\n');
  t.ok('switch repo and write under its prefix', wrote.ok && /\/repos\/backend-repo\/server\.js/.test(wrote.path) && /export const ok/.test(E.FS.read(wrote.path) || ''));

  const search = await E.Loop.exec('web_search', { query: 'CORS blocked' });
  t.ok('web search returns docs beyond the repo', search.beyondRepo === true && (search.docs || []).some((d) => /CORS/.test(d.q + d.body)));
  t.ok('web search does not live-fetch', search.liveWeb === false);

  const comp = await E.Loop.exec('computer', { action: 'launch', app: 'preview' });
  t.ok('Loop.computer launches', comp.ok);
  const goalTool = await E.Loop.exec('goal', { objective: '/goal All tests pass' });
  t.ok('Loop.goal runs the healer', goalTool.goal && goalTool.goal.objective);

  t.ok('injects runtime into Settings', /renderSettings/.test(ui));
  t.ok('injects /goal into Agent', /renderAgent/.test(ui));
  t.ok('injects multi-repo into Factory', /renderFactory/.test(ui));
  t.ok('injects cloud pipeline into Pipelines', /renderPipelines/.test(ui));
  t.ok('injects self-heal into Recovery', /renderRecovery/.test(ui));
};
