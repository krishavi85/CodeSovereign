'use strict';
/* Closes the "minor gaps" from docs/BLUEPRINT_GAP_ANALYSIS.md §4:
 *   1  orchestrator universal-DAG fallback tasks now route to real agents
 *   1b rule-based normalizer/classifier — typo fix, filler strip, sane default
 *   1c contract LLM-enrichment path exercised with a stub provider
 *   2  §35 Engine.Packaging — Python wheel files + VST3 project + honest BLOCKED
 *   3  §52 asset-manifest licence scan (fonts / images / model weights)
 *   4  §11/§48 component-framework frontends route every UI string through t()
 *   5  §57 Engine.Conventions — explicit coding-convention capture
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIST = path.join(__dirname, '..', 'dist');

function env(engines, extra) {
  const data = {}, sov = {};
  const FS = {
    _data: data,
    isFile: (p) => typeof data[p] === 'string',
    exists: (p) => typeof data[p] === 'string',
    read: (p) => (data[p] != null ? data[p] : null),
    write: (p, c) => { data[p] = String(c); },
    remove: (p) => { delete data[p]; },
    count: () => Object.keys(data).length,
    __flush: () => Promise.resolve()
  };
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, RegExp, URL, Function, Promise, Proxy, Set, Map };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  win.Engine = { FS, Sovereign: {
    write: (p, d) => { sov[p] = (/\.json$/.test(p) && typeof d === 'string') ? JSON.parse(d) : d; },
    read: (p) => (sov[p] !== undefined ? sov[p] : null)
  } };
  win._sov = sov; win._data = data;
  Object.assign(win.Engine, extra || {});
  vm.createContext(win);
  for (const n of engines) vm.runInContext(fs.readFileSync(path.join(DIST, n), 'utf8'), win, { filename: n });
  return win;
}

module.exports = async function (t) {

  /* ============ 1b — normalizer / classifier ============ */
  {
    const w = env(['engine-universal.js']);
    const U = w.Engine.Universal;
    const n = U.Normalizer.normalize({ prompt: "please build me a web app to manage projects and tasks with accounts, i'd like a dashbaord and role based access" });
    t.equal('§1b: typo "dashbaord" corrected in the goal', /dashboard/.test(n.projectGoal), true);
    t.equal('§1b: filler "please build me" stripped from the goal', /please|build me/i.test(n.projectGoal), false);
    t.equal('§1b: category resolves (not "unknown")', n.applicationCategory !== 'unknown', true);
    t.ok('§1b: actors picked up', n.primaryActors.length >= 1);
    const c = U.Classifier.classify(U.Normalizer.normalize({ prompt: 'a thing' }));
    t.equal('§1b: classifier never emits "unknown" primaryType', c.primaryType, 'web_application');
    const n2 = U.Normalizer.normalize({ prompt: 'REST API service with endpoints for orders' });
    t.equal('§1b: api prose -> api_service', n2.applicationCategory, 'api_service');
    t.ok('§1b: normalizedPrompt is exposed', typeof n.normalizedPrompt === 'string' && n.normalizedPrompt.length > 0);
  }

  /* ============ 1c — contract LLM enrichment path (stub provider) ============ */
  {
    let asked = 0;
    const AI = {
      ready: () => true,
      json: (q) => { asked++; return Promise.resolve({
        corrected: 'a recipe box app', projectGoal: 'store and search recipes',
        applicationCategory: 'web_application', targetPlatforms: ['web'],
        primaryActors: ['cook'], coreCapabilities: ['search', 'save'],
        entitiesHint: [{ name: 'recipe', fields: ['title', 'servings'] }, { name: 'ingredient', fields: ['name'] }],
        unknownRequirements: ['import source'], designLanguage: { tone: 'warm', density: 'comfortable', darkMode: null }
      }); },
      chat: () => Promise.resolve('ok')
    };
    const w = env(['engine-universal.js', 'engine.requirements.js', 'engine.intake.js', 'engine.intent.js', 'engine.contract.js'], { AI });
    const c = await w.Engine.Contract.deriveFromPrompt('a recipe box', { useLLM: true });
    t.ok('§1c: the model was consulted', asked >= 1);
    t.equal('§1c: intent.source records the model', c.intent.source, 'model+rules');
    const names = (c.entities || []).map((e) => e.name);
    t.ok('§1c: model entity "recipe" folded into the contract', names.indexOf('recipe') >= 0);
    t.ok('§1c: model entity "ingredient" folded in', names.indexOf('ingredient') >= 0);
    // and the deterministic derive({useLLM}) path still appends LLM requirements
    const LLM = { isConfigured: () => true, complete: () => Promise.resolve({ content: JSON.stringify({ requirements: [
      { statement: 'Recipes can be exported as JSON', category: 'functional', acceptanceCriteria: ['GET /api/recipes.json returns an array'] }
    ] }) }) };
    const w2 = env(['engine-universal.js', 'engine.requirements.js', 'engine.contract.js'], { LLM });
    const c2 = await w2.Engine.Contract.derive({ prompt: 'recipe manager', useLLM: true });
    t.equal('§1c: derive() marks the source rules+llm', c2.source, 'rules+llm');
    t.ok('§1c: an LLM requirement was appended + renumbered', (c2.requirements || []).some((r) => /exported as JSON/.test(r.statement) && /^REQ-\d+$/.test(r.id)));
    const w3 = env(['engine-universal.js', 'engine.requirements.js', 'engine.contract.js']);
    const c3 = await w3.Engine.Contract.derive({ prompt: 'recipe manager', useLLM: false });
    t.equal('§1c: no provider -> source stays rules', c3.source, 'rules');
  }

  /* ============ 1 — orchestrator fallback routes to real agents ============ */
  {
    const ranAgents = [];
    let W = null;
    const Agents = {
      get: (id) => (['product', 'architect', 'design', 'scaffold', 'integration', 'security', 'test', 'repair', 'deploy', 'docs', 'verify', 'release'].indexOf(id) >= 0 ? { id } : null),
      run: (id) => {
        ranAgents.push(id);
        if (id === 'scaffold' && W) { W.Engine.FS.write('/package.json', '{"name":"x"}'); W.Engine.FS.write('/server.js', '// srv'); }
        if (id === 'docs' && W) W.Engine.FS.write('/README.md', '# x');
        return Promise.resolve({ agent: id, note: 'ran ' + id, files: [] });
      }
    };
    const Universal = { TaskGraph: {
      create: () => ({ tasks: [], byId: {} }),
      buildDefault: (g) => {
        [['TASK-001', 'spec', 'product-agent'], ['TASK-004', 'db', 'database-agent'], ['TASK-010', 'tests', 'test-agent'], ['TASK-013', 'docs', 'documentation-agent']]
          .forEach(([id, name, agent]) => { const tsk = { id, name, agent, status: 'PENDING', dependsOn: [] }; g.tasks.push(tsk); g.byId[id] = tsk; });
        return g;
      }
    }, Classifier: { classify: () => ({ primaryType: 'web_application' }) }, Normalizer: { normalize: () => ({}) } };
    const Autonomy = { allows: () => true, get: () => 'engineer' };
    const Contract = { load: () => ({ product: { name: 'x' }, requirements: [] }), derive: () => Promise.resolve({}) };
    const Ledger = { build: () => {}, load: () => ({ claims: [] }) };
    const DoD = { evaluate: () => ({ PASS: false, criteria: {} }), load: () => ({ PASS: false, criteria: {} }), certificate: () => '' };
    const w = env(['engine.orchestrator.js'], { Agents, Universal, Autonomy, Contract, Ledger, DoD });
    W = w;
    const rec = await w.Engine.Orchestrator.run({ desktop: false, ctx: { objective: 'a task app' } });
    t.ok('§1: fallback produced tasks from the universal DAG', rec.tasks.length === 4);
    t.equal('§1: no task is BLOCKED for "no generator"', rec.tasks.filter((x) => (x.notes || []).some((nn) => /no generator/.test(nn))).length, 0);
    t.ok('§1: database-agent routed to the scaffold specialist', ranAgents.indexOf('scaffold') >= 0);
    t.ok('§1: documentation-agent routed to the docs specialist', ranAgents.indexOf('docs') >= 0);
    t.ok('§1: test-agent routed to the test specialist', ranAgents.indexOf('test') >= 0);
  }

  /* ============ 2 — §35 Engine.Packaging ============ */
  {
    const Contract = { load: () => ({ product: { name: 'notekeeper', objective: 'a tiny note store' } }) };
    const w = env(['engine.packaging.js'], { Contract });
    const F = w.Engine.FS;
    // a pure-stdlib python package (Engine.PyBackend shape)
    F.write('/app/__init__.py', '');
    F.write('/app/main.py', 'def run():\n    return 1\n');
    F.write('/app/db.py', 'X = 1\n');
    F.write('/tests/test_api.py', 'def test_ok():\n    assert 1\n');

    const kinds = w.Engine.Packaging.kinds();
    t.ok('§35: wheel target detected for a python package', kinds.some((k) => k.target === 'wheel' && k.applies));
    const files = w.Engine.Packaging.emit({ target: 'wheel' });
    const byPath = {}; files.forEach((f) => { byPath[f.path] = f.content; });
    t.ok('§35: pyproject.toml generated', /\[build-system\][\s\S]*setuptools/.test(byPath['/pyproject.toml'] || ''));
    t.ok('§35: build script builds + verifies in a clean venv', /-m (build|pip wheel|venv)/.test(byPath['/scripts/build-wheel.sh'] || '') && /--no-index/.test(byPath['/scripts/build-wheel.sh']));
    t.ok('§35: PACKAGING.md states PyPI publish is credential-gated', /PyPI|twine/.test(byPath['/docs/PACKAGING.md'] || ''));

    // no adapter bridge -> BLOCKED with a precise reason + files still written
    const ev = await w.Engine.Packaging.verify({ target: 'wheel' });
    t.equal('§35: no bridge -> BLOCKED (honest, not "supported")', ev.status, 'BLOCKED');
    t.ok('§35: BLOCKED names the exact need', /bridge|python -m build/i.test(ev.need || ''));
    t.ok('§35: packaging files were written to the workspace', F.isFile('/pyproject.toml'));
    t.equal('§35: evidence file persisted', typeof w._sov['packaging-evidence.json'], 'object');

    // VST3 — only when the contract asks for an audio plugin; else not offered
    const w2 = env(['engine.packaging.js'], { Contract: { load: () => ({ product: { name: 'Reverbastic', objective: 'a VST3 reverb audio plugin for a DAW' } }) } });
    t.ok('§35: vst3 target detected from an audio-plugin contract', w2.Engine.Packaging.kinds().some((k) => k.target === 'vst3' && k.applies));
    const vf = {}; w2.Engine.Packaging.emit({ target: 'vst3' }).forEach((f) => { vf[f.path] = f.content; });
    t.ok('§35: JUCE + CMake plugin project generated', /juce_add_plugin/.test(vf['/CMakeLists.txt'] || '') && /AudioProcessor/.test(vf['/src/PluginProcessor.h'] || ''));
    t.ok('§35: vst3 build recipe names the JUCE SDK requirement', /juce-framework\/JUCE/.test(vf['/scripts/build-vst3.sh'] || ''));
  }

  /* ============ 3 — §52 asset-manifest licence scan ============ */
  {
    const w = env(['engine.depintel.js']);
    const F = w.Engine.FS;
    F.write('/package.json', JSON.stringify({ name: 'app', private: true, dependencies: {} }));
    F.write('/public/fonts/Inter-Regular.woff2', 'FONTDATA');           // known family -> OFL
    F.write('/public/fonts/MysterySans.woff2', 'FONTDATA');             // unknown, no licence file -> finding
    F.write('/assets/hero.png', 'PNGDATA');                             // no attribution -> finding
    F.write('/assets/CREDITS.md', '- icon by X (CC-BY)');               // covers /assets/*
    F.write('/models/classifier.onnx', 'MODELWEIGHTS');                 // no MODEL_CARD -> moderate finding
    F.write('/public/logo.svg', '<svg/>');                              // generated -> ignored

    const rep = w.Engine.DepIntel.assetLicenses([]);
    t.equal('§52: fonts counted', rep.counts.fonts, 2);
    t.equal('§52: models counted', rep.counts.models, 1);
    t.ok('§52: the unknown font is flagged', rep.findings.some((f) => /MysterySans/.test(f.message)));
    t.ok('§52: the known font (Inter) is NOT flagged', !rep.findings.some((f) => /Inter-Regular/.test(f.message)));
    t.ok('§52: hero.png with CREDITS.md nearby is attributed', rep.assets.some((a) => /hero\.png/.test(a.path) && a.attribution));
    t.ok('§52: model with no card -> moderate finding', rep.findings.some((f) => /classifier\.onnx/.test(f.message) && f.impact === 'moderate'));
    t.ok('§52: generated logo.svg is excluded', !rep.assets.some((a) => /logo\.svg/.test(a.path)));

    // folded into the dependency report
    const full = w.Engine.DepIntel.analyze();
    t.ok('§52: analyze() carries an assets summary', full.assets && full.assets.counts && full.assets.counts.fonts === 2);
    t.equal('§52: asset-licenses.json written', typeof w._sov['asset-licenses.json'], 'object');
    t.ok('§52: license-report.json carries the asset items', (w._sov['license-report.json'].assets.items || []).length >= 3);
  }

  /* ============ 4 — §11/§48 component frontends route every string via t() ============ */
  {
    const w = env(['engine.frontends.js']);
    const spec = { name: 'Taskly', frontend: 'react', auth: true,
      entities: [{ name: 'task', fields: [{ name: 'title', type: 'text' }, { name: 'done', type: 'bool' }] }] };
    const out = w.Engine.Frontends.generate(spec);
    const app = out['public/app.js'];
    // no user-facing string sits as a bare h() text child (english defaults stay as t()'s 2nd arg)
    t.equal('§11: no bare-string h() text child', /h\(\s*'[a-z0-9]+'\s*,\s*(?:\{[^{}]*\}|null)\s*,\s*'[A-Z][a-z]+ [a-z]/.test(app), false);
    t.ok('§11: toggle label routed through t()', /t\('auth\.needAccount'/.test(app) && /t\('auth\.haveAccount'/.test(app));
    t.ok('§11: input placeholders routed through t()', /placeholder:\s*t\('auth\.(email|password)Placeholder'/.test(app));
    t.ok('§11: aria-label routed through t()', /'aria-label':\s*t\('auth\.formLabel'/.test(app));
    t.ok('§11: add button uses {entity} interpolation (not concat)', /t\('action\.add',\s*'Add \{entity\}',\s*\{\s*entity:/.test(app));
    t.equal('§11: no " + e.name + " string concat on a label', /t\('action\.add', 'Add'\) \+ ' '/.test(app), false);

    // vue variant too
    const vout = w.Engine.Frontends.generate(Object.assign({}, spec, { frontend: 'vue' }));
    const vapp = vout['public/app.js'];
    t.ok('§48: vue toggle localised', /t\('auth\.needAccount'/.test(vapp));
    t.ok('§48: vue add button uses {entity} interpolation', /t\('action\.add',\s*'Add \{entity\}'/.test(vapp));
    const vNoEnt = w.Engine.Frontends.generate({ name: 'Empty', frontend: 'vue', auth: false, entities: [] })['public/app.js'];
    t.ok('§48: vue "No entities" localised', /t\('list\.noEntities'/.test(vNoEnt));

    // localize audit now scans component app.js and would catch a regression
    const w2 = env(['engine.localize.js'], { Contract: { load: () => ({ product: {}, requirements: [] }) } });
    const F = w2.Engine.FS;
    F.write('/public/index.html', '<!doctype html><html lang="en"><body><main id="root"></main><script src="i18n.js"></script><script src="app.js"></script></body></html>');
    F.write('/public/i18n/en.json', JSON.stringify({ 'app.title': 'X' }));
    F.write('/public/i18n.js', "setAttribute('dir','ltr')");
    F.write('/public/app.js', "var h=CSDom.h; render(h('button',null,'Delete everything now'), root); h('h2',{},'Raw Heading Text');");
    const rep = w2.Engine.Localize.analyze();
    t.ok('§48: component leak detected by the audit', rep.findings.some((f) => f.rule === 'hardcoded-string-component' && f.count >= 1));
    // a clean generated app.js produces no component leak
    const w3 = env(['engine.localize.js'], { Contract: { load: () => ({ product: {}, requirements: [] }) } });
    w3.Engine.FS.write('/public/index.html', '<!doctype html><html lang="en"><body><script src="app.js"></script></body></html>');
    w3.Engine.FS.write('/public/i18n/en.json', JSON.stringify({ 'app.title': 'X' }));
    w3.Engine.FS.write('/public/i18n.js', "setAttribute('dir','ltr')");
    w3.Engine.FS.write('/public/app.js', out['public/app.js']);
    const rep3 = w3.Engine.Localize.analyze();
    t.equal('§48: the real generated react app.js has no component leak', rep3.findings.filter((f) => f.rule === 'hardcoded-string-component').length, 0);
  }

  /* ============ 5 — §57 Engine.Conventions ============ */
  {
    const w = env(['engine.conventions.js']);
    const F = w.Engine.FS;
    F.write('/package.json', JSON.stringify({ name: 'x', devDependencies: { jest: '^29' } }));
    F.write('/src/userService.js', "'use strict';\nconst db = require('./db');\nfunction getUser(id) {\n  return db.find(id);\n}\nmodule.exports = { getUser };\n");
    F.write('/src/orderService.js', "'use strict';\nconst db = require('./db');\nasync function listOrders() {\n  const rows = await db.all();\n  return rows;\n}\nmodule.exports = { listOrders };\n");
    F.write('/src/db.js', "'use strict';\nconst store = {};\nfunction find(id) {\n  return store[id];\n}\nmodule.exports = { find };\n");

    const c = w.Engine.Conventions.infer();
    t.equal('§57: indentation inferred', c.indent.value, '2');
    t.equal('§57: quote style inferred', c.quotes.value, 'single');
    t.equal('§57: semicolons inferred', c.semicolons.value, 'yes');
    t.equal('§57: module system inferred', c.moduleSystem.value, 'cjs');
    t.equal('§57: declaration keyword inferred', c.declarationKeyword.value, 'const');
    t.equal('§57: test framework from package.json', c.testFramework, 'jest');
    t.equal('§57: function naming inferred', c.functionNaming.value, 'camelCase');
    t.equal('§57: async style seen', c.asyncStyle.value, 'async-await');

    const rec = w.Engine.Conventions.analyze();
    t.ok('§57: rules() emits a flat generator-consumable list', Array.isArray(w.Engine.Conventions.rules()) && w.Engine.Conventions.rules().length >= 4);
    t.equal('§57: conventions.json written', typeof w._sov['conventions.json'], 'object');
    t.ok('§57: conventions.md written', typeof w._sov['conventions.md'] === 'string' && /Coding conventions/.test(w._sov['conventions.md']));
    t.ok('§57: folded into decision-state.json', w._sov['decision-state.json'] && w._sov['decision-state.json'].conventions && /cjs/.test(w._sov['decision-state.json'].conventions.summary));
    t.equal('§57: load() returns the inferred conventions', w.Engine.Conventions.load().indent.value, '2');

    // an empty workspace does not fabricate conventions
    const w2 = env(['engine.conventions.js']);
    const c2 = w2.Engine.Conventions.infer();
    t.equal('§57: no source -> sampledFiles 0', c2.sampledFiles, 0);
    t.equal('§57: no source -> rules() empty', w2.Engine.Conventions.rules().length, 0);
  }

  /* ============ 5b — conventions ADR harvested into the decision ledger ============ */
  {
    const w = env(['engine.decisions.js'], { Contract: { load: () => null } });
    w.Engine.Sovereign.write('conventions.json', { conventions: { sampledFiles: 5 }, rules: ['indent: 2', 'quotes: single', 'module system: cjs'] });
    const adrs = w.Engine.Decisions.harvest();
    t.ok('§57: a Conventions ADR is harvested', adrs.some((a) => a.category === 'Conventions' && /existing coding conventions/i.test(a.title)));
  }
};
