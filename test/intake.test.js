'use strict';
/* engine.intake.js — non-text prompt intake (spec docs / JSON schema / OpenAPI). */
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
    FS: { _data: data, isFile: (p) => !!data[p], exists: (p) => p in data, read: (p) => (data[p] ? data[p].content : null), write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {} },
    Sovereign: { read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null), write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov) }
  };
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(dist, n), 'utf8'), win, { filename: n });
  return win;
}

const MD_SPEC = [
  '# Bug Tracker',
  '',
  'A tool for teams to file and triage bugs.',
  '',
  '## Data model',
  '',
  '- **Bug**: title:text, severity:int, resolved:bool, reporterId:ref',
  '- **Comment**: body:text, bugId:ref',
  '',
  '## Requirements',
  '',
  '- A user must be able to file a bug with a title and severity.',
  '- The system shall email the assignee when a bug is created.',
  '- Users should be able to comment on a bug.',
  '',
  '## API',
  '',
  '- POST /api/bugs',
  '- GET /api/bugs/{id}'
].join('\n');

const JSON_SCHEMA = JSON.stringify({
  title: 'Inventory API',
  components: { schemas: {
    Product: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, price: { type: 'number' }, inStock: { type: 'boolean' } } },
    Warehouse: { type: 'object', properties: { name: { type: 'string' }, capacity: { type: 'integer' } } }
  } },
  paths: { '/products': { get: {}, post: {} }, '/products/{id}': { get: {}, delete: {} } }
});

module.exports = async function (t) {
  const win = loadEngines(['engine.intake.js']);
  const IN = win.Engine.Intake;

  /* ---------- markdown ---------- */
  {
    const r = IN.fromDocument(MD_SPEC);
    t.equal('intake(md): kind detected', r.kind, 'markdown');
    t.ok('intake(md): entities Bug + Comment with typed fields', r.entities.some((e) => e.name === 'bug' && e.fields.some((f) => f.name === 'severity' && f.type === 'int')) && r.entities.some((e) => e.name === 'comment'));
    t.ok('intake(md): requirements captured (must / shall / should)', r.requirements.length >= 3 && r.requirements.some((s) => /file a bug/.test(s)));
    t.ok('intake(md): API routes captured', r.apis.some((a) => a.method === 'POST' && a.path === '/api/bugs'));
  }

  /* ---------- json schema / openapi ---------- */
  {
    const r = IN.fromDocument(JSON_SCHEMA, 'json');
    t.equal('intake(json): kind', r.kind, 'json');
    t.ok('intake(json): entities from components.schemas', r.entities.some((e) => e.name === 'product' && e.fields.some((f) => f.name === 'sku' && f.required)) && r.entities.some((e) => e.name === 'warehouse'));
    t.ok('intake(json): APIs from paths', r.apis.length === 4 && r.apis.some((a) => a.method === 'DELETE' && a.path === '/products/{id}'));
  }

  /* ---------- enrichPrompt ---------- */
  {
    const enriched = IN.enrichPrompt('Build me a bug tracker', [{ name: 'spec.md', text: MD_SPEC }]);
    t.ok('intake: enrichPrompt appends a distilled brief', /Build me a bug tracker/.test(enriched) && /Entities: bug/.test(enriched) && /Requirements:/.test(enriched));
    t.equal('intake: enrichPrompt with no docs is a no-op', IN.enrichPrompt('x', []), 'x');
  }

  /* ---------- analyze ---------- */
  {
    const rep = IN.analyze([{ name: 'spec.md', text: MD_SPEC }, { name: 'api.json', text: JSON_SCHEMA }]);
    t.ok('intake: analyze persists a per-document summary', rep.present && rep.documents.length === 2 && win.Engine.Intake.load().documents[0].entities >= 2);
  }

  /* ---------- deriveFromPrompt folds a document in ---------- */
  {
    const win2 = loadEngines(['engine-universal.js', 'engine.intake.js', 'engine.intent.js', 'engine.contract.js']);
    const c = await win2.Engine.Contract.deriveFromPrompt('A small internal tool', { useLLM: false, documents: [{ name: 'spec.md', text: MD_SPEC }] });
    t.ok('contract: uses the entities from the attached spec', (c.entities || []).some((e) => e.name === 'bug') && (c.entities || []).some((e) => e.name === 'comment'));
    t.ok('contract: still deterministic + buildable', c.verdict === 'buildable' && (c.requirements || []).length > 0);
  }
};
