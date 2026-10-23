'use strict';
/* engine.requirements.js — domain packs, contradictions, classification, scoring. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.requirements.js'), 'utf8');

  const files = {
    '/package.json': JSON.stringify({ dependencies: { '@anthropic-ai/sdk': '^1', stripe: '^14' } }),
    '/README.md': 'A multi-tenant SaaS with an AI assistant. Subscription billing, prompt orchestration, and streaming chat.'
  };
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    isFile: (p) => p in files
  };
  const win = { console };
  win.window = win;
  win.Engine = { FS };
  const ctx = vm.createContext(win);
  vm.runInContext(src, ctx, { filename: 'engine.requirements.js' });
  const R = win.Engine.Requirements;

  const arch = R.detectArchetypes({});
  const kinds = arch.map((a) => a.archetype);
  t.ok('detects saas', kinds.includes('saas'));
  t.ok('detects ai_app', kinds.includes('ai_app'));

  const active = R.activate(kinds);
  t.ok('merges mandatory from both packs', active.mandatory.includes('tenant isolation') && active.mandatory.some((m) => /streaming responses/.test(m)));
  t.ok('merges risks', active.risks.includes('prompt injection'));

  // contradictions
  const c1 = R.contradictions({ offline: true, realtimeCollab: true });
  t.ok('offline vs collab contradiction', c1.some((x) => x.id === 'offline-vs-cloud-collab'));
  const c2 = R.contradictions({ architecturePref: 'microservices', teamSize: 2 });
  t.ok('microservices vs small team', c2.some((x) => x.id === 'microservices-vs-smallteam'));
  t.equal('no contradictions when compatible', R.contradictions({ offline: false }).length, 0);

  // classification
  const cls = R.classify(['tenant isolation', 'audit log', 'theme customization', 'multi-region sharding'], { archetypes: ['saas'], teamSize: 2 });
  const by = {};
  cls.forEach((x) => { by[x.requirement] = x.classification; });
  t.equal('domain-pack item -> Mandatory', by['tenant isolation'], 'Mandatory');
  t.equal('cross-cutting -> Mandatory', by['audit log'], 'Mandatory');
  t.equal('cosmetic -> Optional', by['theme customization'], 'Optional');
  t.equal('scale item for small team -> Future', by['multi-region sharding'], 'Future');

  // weighted scoring
  const ranked = R.scoreStack({}, [
    { name: 'A', factors: { requirement_fit: 0.9, platform_fit: 0.9, maintainability: 0.8 } },
    { name: 'B', factors: { requirement_fit: 0.3, complexity_penalty: 0.2 } }
  ]);
  t.equal('best-fit stack ranked first', ranked[0].stack, 'A');
  t.ok('penalty lowers score', ranked[1].score < 0.5);

  // adaptive questions
  const q = R.questions({ prompt: 'a collaborative editor', platforms: null });
  t.ok('asks about platforms', q.some((x) => x.key === 'platforms'));
  t.ok('progressive — caps at 6', q.length <= 6);

  // ---- aiAssist: confirmed live, it re-asked the model on EVERY analyze()
  // pass (~40s each on a local model, queued ahead of real generation), and
  // with a stub README ("# todo") the model answered with every archetype
  // offered — noise that then became tracked contract requirements. ----
  let aiCalls = 0;
  let reply = { archetypes: ['saas'], impliedRequirements: ['Users can reset their password'], topRisks: [] };
  win.Engine.AI = { ready: () => true, json: async () => { aiCalls++; return reply; } };
  const objective = 'A multi-tenant SaaS dashboard where teams track projects, due dates and comments, with role-based access.';
  const a1 = await R.aiAssist({ prompt: objective });
  const a2 = await R.aiAssist({ prompt: objective });
  t.equal('the same objective is asked once, then served from cache', aiCalls, 1);
  t.ok('the cached answer is the real one', a1 === a2 && a2.archetypes[0] === 'saas' && a2.added[0] === 'Users can reset their password');
  const thin = await R.aiAssist({ prompt: '# todo' });
  t.ok('a stub objective ("# todo") is skipped — the model has nothing to reason about', thin.skipped === 'objective-too-thin' && aiCalls === 1);
  reply = { archetypes: Object.keys(R.PACKS), impliedRequirements: ['x'], topRisks: [] };
  const noisy = await R.aiAssist({ prompt: objective + ' (variant two)' });
  t.equal('naming most of the catalogue is treated as noise, not a classification', noisy.archetypes.length, 0);
  reply = null;
  const obj3 = objective + ' (variant three)';
  await R.aiAssist({ prompt: obj3 });
  const before = aiCalls;
  await R.aiAssist({ prompt: obj3 });
  t.equal('a failed/empty answer is not cached — the next pass may retry', aiCalls, before + 1);
};
