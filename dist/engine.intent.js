/* =====================================================================
   engine.intent.js  —  Engine.Intent   (blueprint §2 + §3)

   The intent engine, model-first with a deterministic fallback.

   When a provider is connected (Engine.AI.ready()), the model reads the request
   and returns a structured understanding — corrected typos, project goal,
   application category, target platforms, actors, capabilities, an entity-model
   hint, decisions the user still owes, and the design language. The rule-based
   Normalizer + Classifier (engine-universal.js) always runs too and is the
   backbone: the model can only *refine* the fuzzy fields, never remove a safety
   or stack decision. With no provider, the result is exactly the old rule-based
   path — deterministic, offline, no key required.

   window.Engine.Intent
     resolve(prompt, opts?)  -> Promise<{ normalized, classification, source,
                                          entitiesHint, design, corrections }>
     spellfix(prompt)        -> Promise<string>   (model typo-correction, else rules)
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  function U() { return window.Universal || Engine.Universal; }
  function AI() { return Engine.AI; }

  var CATEGORIES = ['static_website', 'web_application', 'saas_platform', 'ecommerce', 'marketplace',
    'social_platform', 'mobile_application', 'desktop_application', 'browser_extension', 'api_service',
    'ai_application', 'data_platform', 'game', 'automation_system', 'developer_tool', 'iot_application',
    'cross_platform_application'];

  function rulesOnly(prompt) {
    var u = U();
    var normalized = u ? u.Normalizer.normalize({ prompt: prompt })
      : { projectGoal: String(prompt).slice(0, 200), applicationCategory: 'web_application', targetPlatforms: ['web'], primaryActors: ['user'], coreCapabilities: [], unknownRequirements: [] };
    var classification = u ? u.Classifier.classify(normalized)
      : { primaryType: 'web_application', complexity: 'standard', riskLevel: 'low', estimatedModules: 8, secondaryTypes: [] };
    return { normalized: normalized, classification: classification };
  }

  function aiEnrich(prompt, base) {
    var ai = AI();
    if (!ai || !ai.ready || !ai.ready() || !ai.json) return Promise.resolve(null);
    var ask =
      'You are the intent analyst for a software factory. Read the request and return ONLY JSON:\n' +
      '{\n' +
      '  "corrected": "the request with typos fixed, otherwise unchanged",\n' +
      '  "projectGoal": "one plain sentence",\n' +
      '  "applicationCategory": one of ' + JSON.stringify(CATEGORIES) + ',\n' +
      '  "targetPlatforms": subset of ["web","android","ios","windows","macos","linux","cli"],\n' +
      '  "primaryActors": ["role", ...],\n' +
      '  "coreCapabilities": ["verb-noun", ...],\n' +
      '  "entitiesHint": [{"name":"singular","fields":["field", ...]}],  // the data model you infer, 1-5 besides user\n' +
      '  "unknownRequirements": ["a decision the user must still make that changes cost / security / architecture"],\n' +
      '  "designLanguage": {"tone":"e.g. minimal, playful, corporate", "density":"comfortable|compact", "darkMode": true|false|null}\n' +
      '}\n' +
      'Rules: never invent auth/payments/real-time if not asked. entitiesHint has NO id/createdAt. Be conservative.\n\n' +
      'Request: ' + String(prompt || '').slice(0, 4000);
    return ai.json(ask, { maxTokens: 1200 }).then(function (j) {
      if (!j || typeof j !== 'object') return null;
      return j;
    }).catch(function () { return null; });
  }

  function merge(base, j, prompt) {
    var n = Object.assign({}, base.normalized);
    var c = Object.assign({}, base.classification);
    var corrections = null, entitiesHint = null, design = null;

    if (j) {
      corrections = (j.corrected && j.corrected.trim() && j.corrected.trim() !== String(prompt).trim()) ? j.corrected.trim() : null;
      if (j.projectGoal && j.projectGoal.length > 5) n.projectGoal = String(j.projectGoal).slice(0, 240);
      if (j.applicationCategory && CATEGORIES.indexOf(j.applicationCategory) >= 0) {
        // trust the model's category only when the rules were unsure OR agree loosely
        if (n.applicationCategory === 'unknown' || n.applicationCategory === 'web_application' || j.applicationCategory === n.applicationCategory) {
          n.applicationCategory = j.applicationCategory;
          c.primaryType = j.applicationCategory;
        }
      }
      if (Array.isArray(j.targetPlatforms) && j.targetPlatforms.length) {
        var plats = j.targetPlatforms.filter(function (p) { return ['web', 'android', 'ios', 'windows', 'macos', 'linux', 'cli'].indexOf(p) >= 0; });
        if (plats.length) n.targetPlatforms = Array.from(new Set(n.targetPlatforms.concat(plats)));
      }
      if (Array.isArray(j.primaryActors) && j.primaryActors.length)
        n.primaryActors = Array.from(new Set(n.primaryActors.concat(j.primaryActors.map(String)))).slice(0, 8);
      if (Array.isArray(j.coreCapabilities) && j.coreCapabilities.length)
        n.coreCapabilities = Array.from(new Set(n.coreCapabilities.concat(j.coreCapabilities.map(String)))).slice(0, 24);
      if (Array.isArray(j.unknownRequirements))
        n.unknownRequirements = Array.from(new Set((n.unknownRequirements || []).concat(j.unknownRequirements.map(String)))).slice(0, 12);
      if (Array.isArray(j.entitiesHint))
        entitiesHint = j.entitiesHint.filter(function (e) { return e && e.name; }).slice(0, 6)
          .map(function (e) { return { name: String(e.name).toLowerCase().replace(/[^a-z0-9]/g, '') || 'item', fields: (e.fields || []).map(String).filter(function (f) { return ['id', 'createdat', 'updatedat'].indexOf(f.toLowerCase()) < 0; }).slice(0, 12) }; });
      if (j.designLanguage && typeof j.designLanguage === 'object') design = j.designLanguage;
    }
    return { normalized: n, classification: c, corrections: corrections, entitiesHint: entitiesHint, design: design };
  }

  function resolve(prompt, opts) {
    opts = opts || {};
    var base = rulesOnly(prompt);
    if (opts.useLLM === false) {
      return Promise.resolve({ normalized: base.normalized, classification: base.classification, source: 'rules', entitiesHint: null, design: null, corrections: null });
    }
    return aiEnrich(prompt, base).then(function (j) {
      var m = merge(base, j, prompt);
      var out = {
        normalized: m.normalized, classification: m.classification,
        source: j ? 'model+rules' : 'rules',
        entitiesHint: m.entitiesHint, design: m.design, corrections: m.corrections
      };
      try {
        if (window.Engine && Engine.Sovereign) Engine.Sovereign.write('intent.json', {
          generatedAt: Date.now(), source: out.source,
          projectGoal: out.normalized.projectGoal, category: out.normalized.applicationCategory,
          platforms: out.normalized.targetPlatforms, actors: out.normalized.primaryActors,
          capabilities: out.normalized.coreCapabilities, unknowns: out.normalized.unknownRequirements,
          entitiesHint: out.entitiesHint, design: out.design, corrections: out.corrections
        });
      } catch (_) {}
      return out;
    });
  }

  function spellfix(prompt) {
    var ai = AI();
    var rules = function () {
      var u = U();
      if (!u || !u.Normalizer) return prompt;
      var fixed = String(prompt || '');
      (u.Normalizer.SPELLFIX || []).forEach(function (pair) { fixed = fixed.replace(pair[0], pair[1]); });
      return fixed;
    };
    if (!ai || !ai.ready || !ai.ready() || !ai.chat) return Promise.resolve(rules());
    return ai.chat('Fix spelling and obvious grammar in this software request. Return ONLY the corrected text, nothing else:\n\n' + prompt, { maxTokens: 800 })
      .then(function (r) { var t = (r && (r.text || r.content || r)) || ''; return (typeof t === 'string' && t.trim().length > 3) ? t.trim() : rules(); })
      .catch(function () { return rules(); });
  }

  Engine.Intent = { resolve: resolve, spellfix: spellfix, CATEGORIES: CATEGORIES };
  console.info('[Intent] model-first intent + classifier ready — Engine.Intent');
})();
