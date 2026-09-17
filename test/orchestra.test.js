'use strict';
/* Subagents, SovereignCoordinator, Project brain, Model Router, Browser Agent. */
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
    MouseEvent: function MouseEvent() {},
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    S: { agentPrompt: 'Ship a notes app with frontend, backend, and tests using subagents', agentQuestions: [] }
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
  return { win, store };
}

module.exports = async function (t) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('index.html loads engine.orchestra.js', /engine\.orchestra\.js/.test(html));
  t.ok('index.html loads app.orchestra.js', /app\.orchestra\.js/.test(html));
  t.ok('no new orchestra nav page', !/S\.screen\s*=\s*['"]orchestra['"]/.test(fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.orchestra.js'), 'utf8')));

  const { win } = load();
  const E = win.Engine;
  t.ok('Swarm is exposed', E.Swarm && typeof E.Swarm.spawn === 'function');
  t.ok('Coordinator is exposed', E.Coordinator && typeof E.Coordinator.run === 'function');
  t.ok('ProjectBrain is exposed', E.ProjectBrain && typeof E.ProjectBrain.remember === 'function');
  t.ok('ModelRouter is exposed', E.ModelRouter && typeof E.ModelRouter.select === 'function');
  t.ok('Browser Agent is exposed', E.Browser && typeof E.Browser.experience === 'function');
  t.ok('SovereignCoordinator alias', win.SovereignCoordinator === E.Coordinator);

  const roleIds = E.Swarm.roles.map((r) => r.id);
  ['research', 'backend', 'frontend', 'testing', 'terminal', 'security'].forEach((id) => {
    t.ok('role catalog includes ' + id, roleIds.indexOf(id) >= 0);
  });

  const a = E.Swarm.spawn({ role: 'research', task: 'find save', isolation: 'shared' });
  t.ok('subagent has independent context', Array.isArray(a.context) && a.context.length === 0);
  t.ok('subagent has custom instructions', /Do not write/.test(a.instructions));
  t.ok('subagent has a separate model family', !!a.family && !!a.model);
  t.ok('research cannot write_file', a.tools.indexOf('write_file') < 0 && a.tools.indexOf('grep') >= 0);

  const denied = await E.Swarm.exec(a, 'write_file', { path: '/hack.js', content: 'x' });
  t.ok('separate tools are enforced', denied.ok === false);

  E.FS.write('/notes.js', 'function save() { return 1; }\n');
  const researched = await E.Swarm.run(a.id, 'save');
  t.ok('research agent greps the repo', researched.ok && researched.actions.some((x) => x.tool === 'grep'));

  const front = E.Swarm.spawn({ role: 'frontend', isolation: 'vm' });
  const back = E.Swarm.spawn({ role: 'backend', isolation: 'vm' });
  t.ok('vm isolation clones the project', E.Swarm.isolationCopy(front.id) && E.Swarm.isolationCopy(front.id)['/notes.js']);
  await E.Swarm.exec(front, 'write_file', { path: '/ui.js', content: 'export const ui = 1;\n' });
  await E.Swarm.exec(back, 'write_file', { path: '/api.js', content: 'export const api = 1;\n' });
  t.ok('isolated write does not collide with the live tree', !E.FS.exists('/ui.js') && !E.FS.exists('/api.js'));
  const m1 = E.Swarm.merge(front.id);
  const m2 = E.Swarm.merge(back.id);
  t.ok('merge collects frontend file', m1.ok && E.FS.exists('/ui.js'));
  t.ok('merge collects backend file without clobbering frontend', m2.ok && E.FS.exists('/ui.js') && E.FS.exists('/api.js'));

  const parallel = await E.Swarm.runParallel([front.id, back.id], 'continue');
  t.ok('subagents run in parallel', Array.isArray(parallel) && parallel.length === 2);

  t.ok('plain prompt is not auto-delegated', E.Coordinator.shouldDelegate('where is save implemented?') === false);
  t.ok('explicit swarm prompt is delegated', E.Coordinator.shouldDelegate('Use the coordinator and subagents for frontend backend and tests'));

  const planned = E.Coordinator.plan('Build the app frontend, backend, and tests');
  t.ok('coordinator breaks work into tasks', planned.length >= 3 && planned.every((x) => x.role));
  t.ok('coordinator task list includes research', planned.some((x) => x.role === 'research'));

  const run = await E.Coordinator.run('Coordinate frontend, backend, and tests with subagents', { isolation: 'shared' });
  t.ok('coordinator does not write implementation', run.coordinatorWrote === false);
  t.ok('coordinator spawned multiple agents', run.agents && run.agents.length >= 3);
  t.ok('coordinator recorded steps', run.steps.some((s) => s.kind === 'coord') && run.steps.some((s) => s.kind === 'swarm'));

  E.ProjectBrain.remember('tests', 'how to test notes', 'run npm test then click Save');
  E.ProjectBrain.sync();
  t.ok('brain stores test procedures', E.ProjectBrain.recall('test', 'tests').length >= 1);
  t.ok('brain syncs into the workspace file', /how to test notes/.test(E.FS.read('/.codesovereign/project/brain.json') || ''));
  const kinds = E.ProjectBrain.kinds.slice().sort();
  t.ok('brain kinds cover shared knowledge', kinds.join(',') === ['artifacts', 'conventions', 'instructions', 'repository', 'research', 'tests'].sort().join(','));

  const families = E.ModelRouter.families.map((f) => f.id);
  ['qwen', 'deepseek', 'glm', 'llm', 'codestral', 'devstral', 'llama', 'gemma', 'remote'].forEach((id) => {
    t.ok('router family ' + id, families.indexOf(id) >= 0);
  });
  E.ModelRouter.setPolicy('cost');
  const cheap = E.ModelRouter.select('rename a variable');
  t.ok('cost policy prefers a local cheap family', cheap.local === true && (cheap.family === 'gemma' || cheap.family === 'qwen'));
  E.ModelRouter.setPolicy('intelligence');
  const smart = E.ModelRouter.select('Build a full-stack production app with frontend, backend, and tests using the coordinator');
  t.ok('intelligence policy can pick remote or deepseek', smart.family === 'remote' || smart.family === 'deepseek' || smart.family === 'devstral');
  E.ModelRouter.setPolicy('balance');
  const ui = E.ModelRouter.select('Make the CSS layout and buttons nicer');
  t.ok('classifier tags frontend work', ui.type === 'frontend');
  t.ok('complexity estimator is 1-5', ui.complexity >= 1 && ui.complexity <= 5);

  E.FS.write('/index.html', '<!DOCTYPE html><html><head><title>Nova Notes</title></head><body><h1>Nova Notes</h1><button id="save">Save</button><input name="title"></body></html>');
  const nav = await E.Browser.navigate('preview');
  t.ok('browser opens the generated app', nav.ok && nav.inspect && /Nova Notes/.test(nav.inspect.title));
  const click = await E.Browser.act('click', { selector: '#save' });
  t.ok('browser clicks a control', click.ok);
  const typed = await E.Browser.act('type', { name: 'title', text: 'hello' });
  t.ok('browser types into a form', typed.ok);
  E.Browser.setCookie('sid', 'abc');
  E.Browser.setLocal('theme', 'dark');
  E.Browser.setIdb('drafts', { n: 1 });
  const sess = E.Browser.session();
  t.ok('browser persists cookies/localStorage/IndexedDB', sess.cookies.sid === 'abc' && sess.localStorage.theme === 'dark' && sess.indexedDB.drafts.n === 1);
  const blocked = await E.Browser.navigate('https://example.com');
  t.ok('live URL navigation is not a silent fetch', blocked.ok === false && blocked.liveWeb === false);
  const exp = await E.Browser.experience();
  t.ok('experience loop looks at the page', exp.loop && exp.loop.indexOf('look at page') >= 0 && exp.screenshot);
  t.ok('experience inspects console and network', Array.isArray(exp.console) && Array.isArray(exp.network));

  const loopBrowser = await E.Loop.exec('browser', { action: 'click', selector: '#save' });
  t.ok('Loop.browser drives the Browser Agent', loopBrowser.ok && loopBrowser.action && loopBrowser.console);
  const delegated = await E.Loop.exec('delegate', { role: 'security', task: 'scan' });
  t.ok('Loop.delegate spawns a subagent', delegated.ok && delegated.agent && delegated.agent.role === 'security');

  const orchUi = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.orchestra.js'), 'utf8');
  t.ok('injects router into Settings', /renderSettings/.test(orchUi));
  t.ok('injects subagents into Agent', /renderAgent/.test(orchUi));
  t.ok('injects project brain into Factory', /renderFactory/.test(orchUi));
  t.ok('injects browser agent into Recovery', /renderRecovery/.test(orchUi));
};
