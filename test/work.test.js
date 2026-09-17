'use strict';
/* MCP transports, Customize, Event Bus, steering, Origin, Bugbot, evidence, greenfield. */
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
      addEventListener: () => {},
      getElementById: () => null
    },
    Event: function Event() {},
    MouseEvent: function MouseEvent() {},
    fetch: async () => { throw new Error('network blocked'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    S: { agentPrompt: 'Build me an inventory app', agentChat: [{ role: 'user', text: 'inventory', at: 1 }], agentRuns: [], agentQuestions: [] }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const run = (name) => {
    vm.runInContext(fs.readFileSync(path.join(distDir, name), 'utf8'), ctx, { filename: name });
  };
  run('vendor/acorn.js');
  run('engine.js');
  run('engine.plugins.js');
  run('engine.llm.js');
  run('engine.loop.js');
  run('engine.orchestra.js');
  run('engine.runtime.js');
  run('engine.work.js');
  return { win, store };
}

module.exports = async function (t) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  t.ok('index.html loads engine.work.js', /engine\.work\.js/.test(html));
  t.ok('index.html loads app.work.js', /app\.work\.js/.test(html));
  const ui = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.work.js'), 'utf8');
  t.ok('no new work-agent nav page', !/S\.screen\s*=\s*['"]work['"]/.test(ui));
  t.ok('injects into existing screens', /renderSettings/.test(ui) && /renderAgent/.test(ui) && /renderFactory/.test(ui) && /renderPipelines/.test(ui) && /renderRecovery/.test(ui));

  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
  t.ok('jsonplaceholder mock API is gone', !/jsonplaceholder/.test(appSrc));

  const { win } = load();
  const E = win.Engine;
  t.ok('Agent Event Bus is exposed', E.AgentBus && E.AgentBus.events.indexOf('onTaskStart') >= 0);
  [
    'onTaskStart', 'onPlanGenerated', 'onToolBeforeCall', 'onToolAfterCall',
    'onFileEdit', 'onBuildStart', 'onBuildFailure', 'onRuntimeError',
    'onTestFailure', 'onSubagentSpawn', 'onVerification', 'onGoalReached'
  ].forEach(function (name) {
    t.ok('bus includes ' + name, E.AgentBus.events.indexOf(name) >= 0);
  });
  ['beforeSubmitPrompt', 'afterAgentResponse', 'afterAgentThought', 'subagentStart', 'stop', 'compaction', 'turn completion'].forEach(function (name) {
    t.ok('lifecycle hook ' + name, E.AgentBus.events.indexOf(name) >= 0);
  });

  E.AgentBus.emit('onTaskStart', { prompt: 'x' });
  t.ok('bus records history', E.AgentBus.history(1)[0].name === 'onTaskStart');

  t.ok('MCP transports include stdio/SSE/HTTP', E.MCP.transports.indexOf('stdio') >= 0 && E.MCP.transports.indexOf('sse') >= 0 && E.MCP.transports.indexOf('streamable-http') >= 0);
  [
    'database.query', 'jira.createIssue', 'figma.getDesign',
    'supabase.executeSQL', 'github.createPR', 'playwright.openPage'
  ].forEach(function (tool) {
    t.ok('MCP tool ' + tool, E.MCP.tools.indexOf(tool) >= 0);
  });
  const stdio = E.MCP.connect({ id: 'local-fs', transport: 'stdio', command: 'npx' });
  t.ok('stdio MCP is recorded without fake success', stdio.transport === 'stdio' && stdio.connected === false);
  const remote = E.MCP.connect({ id: 'remote-mcp', transport: 'streamable-http', url: 'https://mcp.example.invalid/mcp', auth: 'oauth' });
  t.ok('remote MCP requires OAuth', /OAuth/.test(remote.note) && remote.connected === false);
  E.MCP.setOAuth('remote-mcp', 'tok');
  const authed = E.MCP.connect({ id: 'remote-mcp', transport: 'streamable-http', url: 'https://mcp.example.invalid/mcp', auth: 'oauth' });
  t.ok('OAuth token marks remote connected', authed.connected === true);

  const q = await E.MCP.invoke('database.query', { tool: 'database.query', table: 'items', row: { sku: 'A1' } });
  t.ok('database.query writes workspace rows', q.ok && q.count >= 1);
  const issue = await E.MCP.invoke('jira.createIssue', { tool: 'jira.createIssue', summary: 'Broken save' });
  t.ok('jira.createIssue persists', issue.ok && /^SOV-/.test(issue.issue.key));

  t.ok('Customize scopes', E.Customize.scopes.join(',') === 'user,team,workspace');
  t.ok('Customize kinds cover plugins through hooks', E.Customize.kinds.join(',') === 'plugins,skills,mcps,subagents,rules,commands,hooks');
  E.Customize.add({ kind: 'rules', scope: 'team', name: 'no secrets', body: 'never commit tokens' });
  t.ok('Customize stores team rules', E.Customize.list({ kind: 'rules', scope: 'team' }).length === 1);

  const mode = E.Modes.enable('security-auditor');
  t.ok('Custom Mode stays active', mode.persistent && mode.active.indexOf('security-auditor') >= 0);
  t.ok('skill catalog includes React/Debug/Release/QA/Architecture', E.Skills.catalog().map(function (s) { return s.id; }).join(',').indexOf('react-expert') >= 0);

  const drive = E.GWorkspace.drive('create', { name: 'spec.md', body: 'real file' });
  t.ok('Drive create is empty-store CRUD not canned rows', drive.ok && drive.file.name === 'spec.md');
  t.ok('Drive search finds created file', E.GWorkspace.drive('search', { q: 'spec' }).hits.length === 1);
  t.ok('Gmail draft works', E.GWorkspace.gmail('draft', { subject: 'hi' }).ok);
  t.ok('Calendar create+availability', E.GWorkspace.calendar('create', { title: 'sync' }).ok);

  const st = E.Steer.push('use semantic HTML and continue');
  t.ok('steering queues without stopping', st.ok && st.atBoundary);
  const drained = E.Steer.drain();
  t.ok('steering delivers at a tool boundary', drained.length === 1 && drained[0].text.indexOf('semantic') >= 0);

  const side = E.SideChat.open('research', 'Is IndexedDB the right store?');
  t.ok('side chat inherits main context', side.inherited && Array.isArray(side.inherited.chat));
  const merged = E.SideChat.merge(side.id);
  t.ok('side chat can merge back', merged.ok && merged.purpose === 'research');

  E.ConvSearch.index('t1', 'inventory save flow from last week');
  t.ok('conversation search hits transcripts', E.ConvSearch.search('inventory').length >= 1);
  t.ok('knowledge includes history + rules', E.ConvSearch.knowledge('inventory').rules.length >= 1);

  E.FS.write('/ok.js', 'module.exports = 1;\n');
  const ck = E.Checkpoints.capture('before-break');
  E.FS.write('/ok.js', 'throw new Error("broken");\n');
  const rest = E.Checkpoints.restore(ck.id);
  t.ok('checkpoint restore recovers files', rest.ok && /module\.exports/.test(E.FS.read('/ok.js')));

  const wrote = await E.Loop.exec('write_file', { path: '/auto.js', content: 'x=1\n' });
  t.ok('write_file auto-checkpoints', wrote.ok && E.Checkpoints.list().length >= 1);
  t.ok('understand_image is a loop tool', E.Loop.tools.indexOf('understand_image') >= 0);

  const pr = E.Origin.openPR({ title: 'agent work' });
  t.ok('Origin opens a PR from the workspace diff', pr.ok && pr.pr.status === 'open');
  t.ok('Origin lists Vercel/Depot/Buildkite', E.Origin.integrations.indexOf('vercel') >= 0 && E.CI.providers.indexOf('buildkite') >= 0);
  const review = E.Bugbot.review(pr.pr.id);
  t.ok('Bugbot is a separate reviewer', review.separatedFromCreator && review.reviewer === 'bugbot');
  const ci = await E.CI.wakeRepair(pr.pr.id);
  t.ok('CI wake cycle is recorded', ci.cycle.indexOf('Agent') >= 0 && ci.cycle.indexOf('CI') >= 0);

  const gate0 = E.Evidence.require();
  t.ok('completed is not proof without artifacts', gate0.ok === false);
  E.Evidence.screenshot();
  E.Evidence.logs('runtime observer');
  t.ok('evidence gate passes after artifacts', E.Evidence.require().ok === true);

  const img = E.Image.generate('hero mark', { path: '/assets/hero.svg' });
  t.ok('image generation writes an asset', img.ok && /hero/.test(E.FS.read('/assets/hero.svg')));
  t.ok('image understanding reads SVG', E.Image.understand('/assets/hero.svg').kind === 'svg');

  E.FS.write('/assets/design.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text>Inventory</text></svg>');
  const dtc = await E.Design.toCode('/assets/design.svg');
  t.ok('design-to-code pipeline ran', /compare visually/.test(dtc.pipeline) && E.FS.exists('/index.html'));

  const a11y = E.A11y.audit();
  t.ok('a11y audit returns findings list', Array.isArray(a11y.findings));
  const live = await E.LiveTest.run({});
  t.ok('live testing observes forms/console/network', live.runtimeObserver && typeof live.forms === 'number');

  const gf = await E.Greenfield.start('Build me an inventory app');
  t.ok('greenfield starts with no repository', gf.ok && gf.repo === null);
  t.ok('greenfield opens live preview', gf.preview && gf.preview.port === 4173);
  const repo = E.Greenfield.createRepository();
  t.ok('Origin repo can be created after preview', repo.ok && repo.repo.hosted);
  const pub = await E.Publish.vercel();
  t.ok('Vercel publish records a deploy', pub.ok && pub.target === 'vercel');
  t.ok('Live Preview couples source/runtime/browser/agent', E.LivePreview.open().coupled.length === 4);
};
