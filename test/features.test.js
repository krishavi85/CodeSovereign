'use strict';
/* engine.features.js (§63-64) — feature-completion graph.
 * Generates a real scaffold, then checks per-feature facet detection,
 * completion %, and next-task selection at increasing levels of build-out. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngines(names) {
  const dist = path.join(__dirname, '..', 'dist');
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: {
      _data: data, isFile: (p) => !!data[p] && data[p].type !== 'dir', exists: (p) => p in data,
      read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}
    },
    Sovereign: {
      read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null),
      write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov)
    }
  };
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(dist, n), 'utf8'), win, { filename: n });
  return win;
}

module.exports = async function (t) {
  const win = loadEngines(['engine-universal.js', 'engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.localize.js', 'engine.scaffold.js', 'engine.intent.js', 'engine.contract.js', 'engine.testgen.js', 'engine.journeys.js', 'engine.features.js']);
  const FS = win.Engine.FS;

  const contract = await win.Engine.Contract.deriveFromPrompt('A tracker where a user signs in, creates projects and tasks, and deletes them', { useLLM: false });
  win.Engine.Sovereign.write('product-contract.json', contract);

  // ---- empty repo: nothing built ----
  let st = win.Engine.Features.status(contract);
  t.ok('features: a graph node per non-system entity', st.features.length >= 2 && st.features.every((f) => f.total === 7));
  t.ok('features: with an empty repo, completion is ~0 and next gap is the data model', st.features.every((f) => f.completion === 0) && st.features.every((f) => f.nextGap.facet === 'dataModel'));
  const first = win.Engine.Features.nextTask();
  t.ok('features: nextTask points at a data model', first && first.facet === 'dataModel');

  // ---- generate the full scaffold + the testgen suites (the real pipeline) ----
  const spec = win.Engine.Scaffold.specFromContract(contract);
  win.Engine.Scaffold.generate(spec).forEach((f) => FS.write(f.path, f.content));
  win.Engine.TestGen.generate({});
  st = win.Engine.Features.status(contract);
  const proj = st.features.find((f) => f.name === 'project') || st.features[0];
  t.ok('features: after scaffold+testgen, data/migration/service/api/ui/test facets are detected', proj.facets.dataModel && proj.facets.migration && proj.facets.service && proj.facets.restApi && proj.facets.ui && proj.facets.test);
  t.ok('features: journey facet is still open (no covered journey evidence yet)', proj.facets.journey === false && proj.completion < 1);
  t.equal('features: the only remaining gap for the root feature is the user journey', proj.nextGap.facet, 'journey');

  // ---- add covered journey evidence for every feature ----
  win.Engine.Sovereign.write('journey-evidence.json', {
    present: true, total: st.features.length, covered: st.features.length, uncovered: 0,
    journeys: st.features.map((f) => ({ id: 'JRN-' + f.name, entity: f.name, status: 'covered', requirementIds: [] }))
  });
  // and make sure every feature has a test facet (the api contract suite covers all endpoints)
  FS.write('/test/generated-api.test.js', "// covers " + st.features.map((f) => f.name).join(', ') + "\n");
  st = win.Engine.Features.status(contract);
  t.ok('features: journey + test evidence completes the features', st.features.every((f) => f.completion === 1) && st.overall.complete === st.overall.featureCount);
  t.equal('features: nextTask is null when everything is built', win.Engine.Features.nextTask(), null);

  // ---- analyze() persists the graph + a readable matrix ----
  win.Engine.Features.analyze();
  t.ok('features: analyze persists feature-graph.json', win.Engine.Features.load() && win.Engine.Features.load().overall.facetCompletion === 1);
  t.ok('features: the markdown matrix renders a row per feature', /Feature completion graph/.test(win.Engine.Sovereign.read('feature-graph.md')) && /\*\*project\*\*/.test(win.Engine.Sovereign.read('feature-graph.md')));

  // ---- §63: build() routes the next facet to its generator ----
  {
    const w2 = loadEngines(['engine-universal.js', 'engine.schema.js', 'engine.auth.js', 'engine.backend.js', 'engine.frontends.js', 'engine.graphql.js', 'engine.realtime.js', 'engine.pybackend.js', 'engine.microservices.js', 'engine.localize.js', 'engine.scaffold.js', 'engine.intent.js', 'engine.contract.js', 'engine.testgen.js', 'engine.journeys.js', 'engine.features.js']);
    const c2 = await w2.Engine.Contract.deriveFromPrompt('A tracker where a user signs in and manages projects', { useLLM: false });
    w2.Engine.Sovereign.write('product-contract.json', c2);
    const b0 = w2.Engine.Features.build(null, { auto: true });
    t.ok('features.build(auto): first actionable facet is the data model, routed to Scaffold', b0.built && b0.facet === 'dataModel' && b0.ran.includes('Engine.Scaffold.generate'));
    t.ok('features.build: completion jumped after scaffolding', b0.completionAfter > b0.completionBefore);
    // keep building until only the journey remains
    let guard = 0, b;
    do { b = w2.Engine.Features.build(null, { auto: true }); guard++; } while (b.built && b.facet !== 'journey' && guard < 8);
    t.ok('features.build: converges to the journey facet', w2.Engine.Features.status(c2).features.every((f) => f.nextGap === null || f.nextGap.facet === 'journey'));
    const bj = w2.Engine.Features.build(null, { auto: true });
    t.ok('features.build: journey gap routes to Engine.Journeys + emits test/journeys.test.js', (bj.ran || []).includes('Engine.Journeys.generate') && w2.Engine.FS.isFile('/test/journeys.test.js'));
  }

  // ---- partial build: remove the UI, confirm the graph notices ----
  Object.keys(FS._data).filter((p) => /\/public\//.test(p)).forEach((p) => delete FS._data[p]);
  delete win.Engine.Sovereign._noop; // no-op
  win.Engine.Sovereign.write('journey-evidence.json', { present: true, total: 0, covered: 0, uncovered: 0, journeys: [] });
  st = win.Engine.Features.status(contract);
  const p2 = st.features.find((f) => f.name === 'project') || st.features[0];
  t.ok('features: removing the UI drops completion + the journey facet becomes blocked', !p2.facets.ui && p2.completion < 1 && (p2.nextGap.facet === 'ui' || p2.nextGap.blockedBy === 'ui'));
};
