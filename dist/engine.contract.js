/* =====================================================================
   engine.contract.js  —  Engine.Contract

   The Product Contract: turns an objective (prompt / README / detected
   archetypes / the controls that already exist) into an explicit list of
   requirements, each with MACHINE-CHECKABLE acceptance criteria that the
   Evidence Ledger and the Definition-of-Done gate verify against the
   `.sovereign/` evidence.

   window.Engine.Contract
     derive(input)   input = { prompt?, readme?, useLLM? }  -> contract object
     load()          -> the written contract or null
     write(c)        -> .sovereign/product-contract.json
     ACCEPT_KINDS    the criterion vocabulary (also what the Ledger understands)

   Criterion kinds (all checked against .sovereign/* — never re-run here):
     { kind:'execution', gate:'testsPass'|'buildPasses'|'lintClean'|'typesClean' }
     { kind:'control',   name:<label>, want:'REAL' }        control observed REAL
     { kind:'no-mock' }                                     no MOCK/BROKEN prod control
     { kind:'file',      path:'/x' }                        file present
     { kind:'ci',        want:'test+build' }                a CI file runs test & build
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine;
  if (!Engine || !Engine.FS) { console.error('[Contract] Engine.FS missing'); return; }
  var FS = Engine.FS;
  var S = function () { return Engine.Sovereign; };

  var ACCEPT_KINDS = ['execution', 'control', 'no-mock', 'file', 'ci'];

  // Pull the first balanced JSON object out of a model reply (it may be wrapped
  // in prose or a ```json fence). Brace-matched, string-aware — handles nested
  // objects, unlike a naive first-{ .. last-} slice.
  function extractJson(txt) {
    var s = String(txt == null ? '' : txt);
    var start = s.indexOf('{');
    if (start < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (_) { return null; } } }
    }
    return null;
  }

  // Sovereign.read() returns a PARSED object for *.json — never double-parse.
  function sj(p) {
    try {
      var v = S() ? S().read(p) : null;
      if (v == null) return null;
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } }
      return v;
    } catch (_) { return null; }
  }
  function readText(p) { try { return FS.read(p) || ''; } catch (_) { return ''; } }
  function has(p) { try { return FS.exists(p); } catch (_) { return false; } }
  function pkg() { try { return JSON.parse(readText('/package.json') || 'null'); } catch (_) { return null; } }

  function productIdentity(input) {
    var p = pkg() || {};
    var proj = (Engine.Proj && Engine.Proj.current && Engine.Proj.current()) || null;
    var pj = sj('project.json');
    var ds = sj('decision-state.json');
    return {
      name: p.name || (proj && proj.name) || (pj && pj.name) || 'project',
      type: (pj && pj.detectedType) || (ds && ds.projectType) || 'unknown',
      targets: (pj && pj.targets) || (ds && ds.externals) || [],
      objective: String((input && input.prompt) || (pj && pj.prompt) || firstReadmeLine() || '').slice(0, 400)
    };
  }
  function firstReadmeLine() {
    var r = readText('/README.md') || readText('/readme.md');
    return (r.split('\n').filter(function (l) { return l.trim() && !/^#/.test(l); })[0] || '').trim();
  }

  var _rid = 0;
  function req(statement, category, acceptanceCriteria, extra) {
    _rid++;
    return Object.assign({
      id: 'REQ-' + ('000' + _rid).slice(-3),
      statement: statement,
      category: category,
      acceptanceCriteria: acceptanceCriteria || [],
      dependsOn: [],
      implementationFiles: [],
      status: 'unverified'
    }, extra || {});
  }

  // ---- rule-based derivation (offline, always available) ----
  function deriveRules(identity) {
    _rid = 0;
    var out = [];
    var p = pkg() || {};
    var scripts = p.scripts || {};

    if (scripts.test) out.push(req('The project’s automated tests pass.', 'quality',
      [{ kind: 'execution', gate: 'testsPass' }]));
    if (scripts.build) out.push(req('The project builds a production artifact.', 'quality',
      [{ kind: 'execution', gate: 'buildPasses' }]));
    if (scripts.lint) out.push(req('The project passes lint with no findings.', 'quality',
      [{ kind: 'execution', gate: 'lintClean' }]));
    if (scripts.typecheck || has('/tsconfig.json')) out.push(req('The project type-checks cleanly.', 'quality',
      [{ kind: 'execution', gate: 'typesClean' }]));

    // every interactive control on a production path must do something real
    var inv = sj('interaction-inventory.json');
    var controls = (inv && inv.interactions) || [];
    controls.forEach(function (it) {
      if (it.control === 'form' || it.control === 'input' || it.control === 'select' || it.control === 'textarea') return;
      var nm = String(it.name || '').trim();
      if (!nm || nm.length > 40) return;
      out.push(req('The "' + nm + '" control performs its intended action.', 'interaction',
        [{ kind: 'control', name: nm.toLowerCase(), want: 'REAL' }],
        { control: nm, file: it.file }));
    });

    // no simulated production behaviour anywhere
    out.push(req('No production control is simulated, mocked, or broken.', 'integrity',
      [{ kind: 'no-mock' }]));

    // CI must actually run the quality gates
    var pipe = sj('pipeline-inventory.json');
    if (pipe && (pipe.count || 0) > 0) out.push(req('CI runs the test and build gates on every change.', 'delivery',
      [{ kind: 'ci', want: 'test+build' }]));

    // domain-pack mandatory items become tracked requirements (best-effort criteria)
    var rq = sj('requirements.json');
    ((rq && rq.mandatoryChecklist) || []).slice(0, 40).forEach(function (c) {
      out.push(req(c.requirement, 'domain',
        c.status === 'present-ish' ? [] : [],
        { source: 'domain-pack', note: c.status }));
    });
    // model-found implied requirements (Engine.Requirements.aiAssist)
    ((rq && rq.aiImpliedRequirements) || []).slice(0, 14).forEach(function (s) {
      out.push(req(String(s).slice(0, 200), 'functional', [{ kind: 'manual', check: String(s).slice(0, 200) }], { source: 'ai' }));
    });

    return out;
  }

  // ---- optional LLM enrichment ----
  function deriveLLM(identity) {
    var LLM = Engine.LLM;
    if (!LLM || !LLM.complete) return Promise.resolve(null);
    var ok = (LLM.isConfigured && LLM.isConfigured()) || (Engine.AI && Engine.AI.ready && Engine.AI.ready());
    if (!ok) return Promise.resolve(null);
    var ask = 'Objective: ' + (identity.objective || identity.name) + '\n' +
      'Return ONLY JSON: {"requirements":[{"statement":"...","category":"functional|quality|security|delivery",' +
      '"acceptanceCriteria":["short testable sentence", ...]}]}. 6-14 requirements, concrete and verifiable.';
    return LLM.complete(ask, { classification: { primaryType: identity.type } })
      .then(function (r) {
        var txt = (r && (r.content || r.text || r)) || '';
        var j = extractJson(txt);
        if (!j || !Array.isArray(j.requirements)) return null;
        return j.requirements.slice(0, 14).map(function (x) {
          return req(String(x.statement || '').slice(0, 200), x.category || 'functional',
            (x.acceptanceCriteria || []).slice(0, 6).map(function (s) { return { kind: 'manual', check: String(s).slice(0, 200) }; }),
            { source: 'llm' });
        });
      })
      .catch(function () { return null; });
  }

  function derive(input) {
    input = input || {};
    var identity = productIdentity(input);
    var base = deriveRules(identity);
    var finish = function (llmReqs) {
      var requirements = base;
      if (llmReqs && llmReqs.length) {
        // LLM requirements are additive but re-numbered after the rule set
        llmReqs.forEach(function (r) { r.id = 'REQ-' + ('000' + (++_rid)).slice(-3); });
        requirements = base.concat(llmReqs);
      }
      var contract = {
        generatedAt: Date.now(),
        source: llmReqs && llmReqs.length ? 'rules+llm' : 'rules',
        product: identity,
        requirements: requirements,
        totals: {
          requirements: requirements.length,
          withMachineCriteria: requirements.filter(function (r) {
            return r.acceptanceCriteria.some(function (c) { return ACCEPT_KINDS.indexOf(c.kind) >= 0; });
          }).length
        }
      };
      write(contract);
      return contract;
    };
    if (input.useLLM === false) return Promise.resolve(finish(null));
    return deriveLLM(identity).then(finish);
  }

  function write(c) { if (S()) S().write('product-contract.json', c); return c; }
  function load() { return sj('product-contract.json'); }

  /* =====================================================================
     deriveFromPrompt — build a machine-readable Product Contract from ONLY a
     natural-language request, BEFORE any code exists. Deterministic + offline;
     the optional LLM pass only adds extra functional requirements, never
     changes the machine criteria the Ledger / DoD verify against.

     This is what the Ultra Mode closed loop starts from. Every generated
     component, test and observation traces back to an id assigned here.
     ===================================================================== */

  // The stack CodeSovereign can genuinely generate AND run/observe/verify.
  // Anything outside this is recorded as `unsupported` — never faked.
  var SUPPORTED = {
    frontend: ['vanilla', 'react', 'preact', 'vue', 'svelte'],
    backend: ['node', 'python'],
    database: ['sqlite', 'postgres', 'json'],
    api: ['rest', 'graphql'],
    realtime: ['sse', 'websocket'],
    jobs: 'in-process durable queue + polling worker',
    architecture: ['monolith', 'multi-service (compose)'],
    deploy: ['docker', 'compose', 'kubernetes', 'helm', 'terraform', 'fly', 'render', 'railway', 'vps', 'static'],
    execution: 'Electron-hosted real test/build/lint + runtime observation'
  };
  // frontend framework -> internal stack key
  var FRONTEND_RE = [
    [/\bnext\.?js\b/i, 'react'], [/\breact\b/i, 'react'], [/\bpreact\b/i, 'preact'],
    [/\bvue(\.?js| 3)?\b|\bnuxt\b/i, 'vue'], [/\bsvelte(kit)?\b/i, 'svelte'],
    [/\bangular\b/i, 'svelte'] /* Angular needs its full CLI toolchain; we build the same SPA shape with Svelte and record the substitution */
  ];
  var BACKEND_RE = [
    [/\b(python|fastapi|django|flask)\b/i, 'python']
  ];
  // Native mobile / ML training / blockchain are NO LONGER "unsupported" — each
  // routes through a target-specific runtime adapter (Engine.RuntimeRouter +
  // Engine.Mobile / Engine.ML / Engine.Blockchain). See TARGET_RE below. A
  // target is fully supported even when THIS host lacks its runtime; the run
  // then ends BLOCKED with a precise reason. Only these narrow cases remain.
  var UNSUPPORTED_RE = [
    [/\b(gRPC|protobuf service)\b/i,
      'gRPC transport (the .proto + a Node service impl are generated, but cross-language stub generation via protoc is not run) — REST + GraphQL + WebSocket are fully supported'],
    [/\b(package (codesovereign|this app) (as|into)|repackage the ide)\b/i,
      'desktop packaging OF CODESOVEREIGN ITSELF (it already ships desktop; generated desktop apps ARE packaged via electron-builder)']
  ];

  // Prompt -> specialised runtime target. Non-web targets are SUPPORTED and
  // verified by their adapter; contract.target drives Engine.RuntimeRouter.
  var TARGET_RE = [
    ['extension', /\b(browser extension|chrome extension|firefox extension|edge extension|web ?extension|manifest v3|mv3 extension|content script|browser add-?on)\b/i],
    ['desktop', /\b(desktop app(?:lication)?|native desktop|tauri app|electron app|menu ?bar app|system tray app|cross-platform desktop app)\b/i],
    ['ios', /\b(swift ?ui|swiftui|\bswift\b|xcode|\.ipa\b|iphone app|ipad app|ios app|ios-only|for ios)\b/i],
    ['android', /\b(android app|android application|\.apk\b|play ?store|jetpack compose|android kotlin|kotlin android|native android|react native|flutter|expo|native mobile|mobile app(?! ?builder)|mobile-only)\b/i],
    ['evm', /\b(smart contract|solidity|\bevm\b|erc-?20|erc-?721|erc-?1155|nft (mint|contract|collection|drop)|on-chain|web3 (dapp|app|contract)|foundry|hardhat|defi protocol|dao (contract|governance)|token contract|blockchain app)\b/i],
    ['ml-training', /\b(train (a|an|the|our|my)? ?(new )?(ml |ai |deep learning )?model|model training|fine-?tun(e|ing) (a|an|the|our)? ?(model|llm|network)|from-scratch training|pre-?train(ing)? (a|an)? ?(model|llm)|train a (neural net|transformer|classifier|lstm|cnn|rnn)|\blora\b|\bqlora\b|\bsft\b|\bdpo\b|\bgrpo\b|reinforcement learning from|rlhf)\b/i]
  ];
  function detectTarget(prompt) {
    for (var i = 0; i < TARGET_RE.length; i++) if (TARGET_RE[i][1].test(prompt)) return TARGET_RE[i][0];
    return 'web';
  }
  var TARGET_META = {
    extension: { label: 'Browser extension (Manifest V3)', adapter: 'extension', runtime: 'plain build + static MV3 validation everywhere; Playwright + Chromium for load-unpacked + popup/content/SW inspection' },
    desktop: { label: 'Native desktop app (Tauri / Electron)', adapter: 'desktop', runtime: 'Tauri: `cargo check` compiles the Rust core anywhere; packaged build needs @tauri-apps/cli + a system webview. Electron: headless boot smoke + electron-forge' },
    android: { label: 'Native Android app', adapter: 'mobile', runtime: 'Android SDK + emulator + adb (Gradle build, headless AVD, logcat, screenshots)' },
    ios: { label: 'Native iOS app', adapter: 'mobile', runtime: 'macOS worker with Xcode + iOS Simulator + simctl' },
    evm: { label: 'Ethereum / EVM smart contracts', adapter: 'blockchain', runtime: 'solc + a local deterministic chain (@ethereumjs/vm, or Foundry/anvil)' },
    'ml-training': { label: 'ML model training', adapter: 'ml', runtime: 'Python + PyTorch (real training loop, checkpoint, held-out eval); GPU for large models' }
  };
  // Requests that must NOT be built — recorded and the run is BLOCKED, never verified.
  var UNSAFE_RE = [
    [/\b(without (their|the user'?s?) (knowledge|consent|permission)|covert(ly)?|secretly|hidden from the user|stealth)\b/i, 'covert behaviour hidden from the end user'],
    [/\b(keylogger|key ?logging|spyware|stalkerware|exfiltrat|credential harvest(ing)?|phish(ing)?|steal (passwords|credentials|logins))\b/i, 'credential theft / surveillance'],
    [/\b(mine (crypto|bitcoin|monero)|cryptojack|hidden miner|background mining)\b/i, 'unauthorised cryptocurrency mining'],
    [/\b(ddos|denial of service|botnet|spam(bot)?|bulk unsolicited|mass (unsolicited )?email|scrape .* personal data|harvest emails)\b/i, 'abuse / spam / DoS tooling'],
    [/\b(bypass (auth|authentication|license|paywall|drm)|crack(ing)? software|pirate)\b/i, 'circumventing access controls'],
    [/\b(fake reviews?|astroturf|manipulat(e|ing) (elections?|votes?)|disinformation)\b/i, 'coordinated deception'],
    [/\b(malware|ransomware|trojan|rootkit|exploit kit|c2 server)\b/i, 'malware development']
  ];

  var _cid;
  function nid(prefix) { _cid[prefix] = (_cid[prefix] || 0) + 1; return prefix + '-' + ('000' + _cid[prefix]).slice(-3); }

  // Which deployment IaC to generate, from the prompt. Always includes docker + compose.
  function deployTargetsFor(lc) {
    var t = ['docker', 'compose'];
    if (/\b(kubernetes|k8s)\b/.test(lc)) t.push('kubernetes');
    if (/\bhelm\b/.test(lc)) t.push('helm');
    if (/\bterraform\b/.test(lc)) t.push('terraform');
    if (/\bfly\.io|\bfly\b/.test(lc)) t.push('fly');
    if (/\brender\b/.test(lc)) t.push('render');
    if (/\brailway\b/.test(lc)) t.push('railway');
    return t;
  }

  function slugName(prompt) {
    var m = String(prompt || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    var stop = { build: 1, a: 1, an: 1, the: 1, with: 1, and: 1, for: 1, to: 1, of: 1, secure: 1, simple: 1, web: 1, app: 1, application: 1, that: 1, my: 1, me: 1, user: 1, users: 1, account: 1, accounts: 1, role: 1, roles: 1, based: 1, access: 1, using: 1, only: 1, native: 1 };
    var picked = m.filter(function (w) { return !stop[w] && w.length > 2; }).slice(0, 3);
    return (picked.join('-') || 'app').slice(0, 40);
  }

  // singular noun -> entity heuristic
  // words that read like nouns but are never domain entities
  var ENTITY_STOP = {
    app: 1, application: 1, system: 1, tool: 1, platform: 1, service: 1, website: 1, site: 1, page: 1,
    dashboard: 1, feature: 1, data: 1, database: 1, table: 1, api: 1, backend: 1, frontend: 1, ui: 1,
    account: 1, login: 1, signup: 1, auth: 1, authentication: 1, password: 1, email: 1, role: 1, permission: 1,
    user: 1, users: 1, admin: 1, customer: 1, member: 1, person: 1, people: 1, team: 1, client: 1, thing: 1,
    information: 1, detail: 1, list: 1, view: 1, screen: 1, form: 1, button: 1, report: 1, chart: 1, graph: 1,
    version: 1, way: 1, time: 1, day: 1, week: 1, month: 1, year: 1, number: 1, name: 1, title: 1, status: 1,
    web: 1, mobile: 1, desktop: 1, android: 1, ios: 1, extension: 1, browser: 1, server: 1, cloud: 1,
    test: 1, tests: 1, docker: 1, deployment: 1, environment: 1, access: 1, control: 1, management: 1,
    example: 1, everything: 1, anything: 1, someone: 1, something: 1
  };
  // very small, deterministic singulariser — good enough for domain nouns
  function singular(w) {
    w = String(w || '').toLowerCase();
    if (/(ss|us|is)$/.test(w)) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0, -2);
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/(s|e)s$/.test(w)) return w.slice(0, -1);
    if (/s$/.test(w)) return w.slice(0, -1);
    return w;
  }
  // pull domain nouns out of ordinary prose when the fixed candidate list misses
  function genericEntities(text, actors) {
    var raw = String(text || '');
    var actorSet = {}; (actors || []).forEach(function (a) { actorSet[singular(String(a).toLowerCase())] = 1; });
    var hits = {};
    var W = "([a-z][a-z-]{2,20})";
    var PATTERNS = [
      new RegExp("\\b(?:manage|managing|track|tracking|create|creating|add|adding|store|storing|storage of|list|listing|organi[sz]e|organi[sz]ing|catalog(?:ue)?|record|recording|log|logging|browse|schedule|scheduling|book|booking|assign|publish|share|upload|register)\\s+(?:their |your |my |our |the |a |an |all |multiple |new )*" + W + "(?:s|es|ies)?\\b", "gi"),
      new RegExp("\\bcrud (?:for|on|over) (?:the )?" + W + "(?:s|es|ies)?\\b", "gi"),
      new RegExp("\\blist(?:s)? of (?:their |your |all )*" + W + "(?:s|es|ies)?\\b", "gi"),
      new RegExp("\\beach " + W + "\\b(?: has| have| contains| includes| belongs| is | can )", "gi"),
      new RegExp("\\ba " + W + " (?:has|contains|includes|belongs to|can have)\\b", "gi"),
      new RegExp("\\b" + W + "(?:s|es|ies)? (?:table|entity|model|records?|collection)\\b", "gi"),
      new RegExp("\\bwhere (?:a |an |the |each )?(?:user|admin|manager|owner|customer|member|[a-z][a-z-]{2,20}) (?:can |could )?(?:create|add|manage|edit|delete|view|track)s? (?:their |your |a |an |the |all |new )*" + W + "(?:s|es|ies)?\\b", "gi")
    ];
    PATTERNS.forEach(function (re) {
      var m;
      while ((m = re.exec(raw)) !== null) {
        for (var g = 1; g < m.length; g++) {
          if (!m[g]) continue;
          var s = singular(m[g]);
          if (s.length < 3 || ENTITY_STOP[s] || actorSet[s]) continue;
          if (/^(and|the|for|with|that|this|from|into|about|their|your|all|new|some|any)$/.test(s)) continue;
          hits[s] = (hits[s] || 0) + 1;
        }
      }
    });
    return Object.keys(hits).sort(function (a, b) { return hits[b] - hits[a]; });
  }

  function entitiesFromPrompt(text, actors) {
    var lc = ' ' + String(text || '').toLowerCase() + ' ';
    var CANDIDATES = [
      ['project', /\bprojects?\b/], ['task', /\btasks?\b/], ['ticket', /\btickets?\b/],
      ['note', /\bnotes?\b/], ['document', /\bdocuments?\b/], ['post', /\bposts?\b|\barticles?\b/],
      ['comment', /\bcomments?\b/], ['order', /\borders?\b/], ['product', /\bproducts?\b|\bitems?\b(?! per)/],
      ['invoice', /\binvoices?\b/], ['event', /\bevents?\b/], ['booking', /\bbookings?\b|\breservations?\b|\bappointments?\b/],
      ['message', /\bmessages?\b/], ['contact', /\bcontacts?\b/], ['lead', /\bleads?\b/],
      ['expense', /\bexpenses?\b/], ['course', /\bcourses?\b/], ['lesson', /\blessons?\b/],
      ['review', /\breviews?\b/], ['file', /\bfiles?\b|\buploads?\b/]
    ];
    var found = CANDIDATES.filter(function (c) { return c[1].test(lc); }).map(function (c) { return c[0]; });
    // augment with domain nouns lifted straight from the prose (§3-4: the model
    // isn't the only path to a real entity model — the rules read structure too)
    genericEntities(text, actors).forEach(function (g) { if (found.indexOf(g) < 0) found.push(g); });
    if (!found.length) found = ['item'];
    found = found.slice(0, 4);

    // a hierarchy hint: "<A> with <B>" / "<A> and their <B>" -> B references A
    var ents = found.map(function (name, i) {
      var fields = [];
      if (name === 'task' || name === 'ticket') fields.push({ name: 'title', type: 'text', required: true, max: 200 }, { name: 'done', type: 'bool', default: false });
      else if (name === 'note' || name === 'comment' || name === 'message') fields.push({ name: 'body', type: 'longtext', required: true, max: 5000 });
      else if (name === 'product') fields.push({ name: 'title', type: 'text', required: true }, { name: 'priceCents', type: 'int', required: true });
      else if (name === 'order' || name === 'invoice' || name === 'expense') fields.push({ name: 'amountCents', type: 'int', required: true }, { name: 'status', type: 'text', default: 'pending', max: 40 });
      else if (name === 'event' || name === 'booking') fields.push({ name: 'title', type: 'text', required: true }, { name: 'startsAt', type: 'timestamp', required: true });
      else fields.push({ name: 'title', type: 'text', required: true, max: 200 });
      // parent ref: the previous entity, when the prompt links them
      if (i > 0 && new RegExp(found[i - 1] + '[^.]{0,40}\\b' + name, 'i').test(text)) {
        fields.push({ name: found[i - 1] + 'Id', type: 'ref', ref: found[i - 1], required: true });
      }
      return { name: name, fields: fields };
    });
    return ents;
  }

  // §70 — the terse Ultra Mode command syntax. A request that leads with a
  // `BUILD:` line (optionally followed by TARGET / CONSTRAINTS / MODE lines) is
  // parsed as a structured declaration rather than free prose: BUILD becomes the
  // objective, TARGET pins contract.target, CONSTRAINTS are folded into the text
  // AND kept as an explicit list, MODE (strict|balanced) is recorded.
  var DSL_TARGET_ALIAS = {
    web: 'web', 'web app': 'web', webapp: 'web', spa: 'web', fullstack: 'web',
    desktop: 'desktop', tauri: 'desktop', electron: 'desktop',
    extension: 'extension', 'browser extension': 'extension', 'chrome extension': 'extension', mv3: 'extension',
    ios: 'ios', iphone: 'ios', ipad: 'ios', swiftui: 'ios',
    android: 'android', apk: 'android', kotlin: 'android',
    evm: 'evm', solidity: 'evm', ethereum: 'evm', smartcontract: 'evm', 'smart contract': 'evm', web3: 'evm',
    ml: 'ml-training', 'ml-training': 'ml-training', training: 'ml-training', model: 'ml-training', pytorch: 'ml-training'
  };
  function parseUltraDSL(text) {
    var src = String(text || '');
    if (!/^\s*BUILD\s*:/i.test(src)) return null;
    var KEYS = 'BUILD|TARGET|CONSTRAINTS|CONSTRAINT|MODE|STACK|NOTES';
    function grab(key) {
      var re = new RegExp('(?:^|\\n)\\s*(?:' + key + ')\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:' + KEYS + ')\\s*:|$)', 'i');
      var m = src.match(re);
      return m ? m[1].trim() : null;
    }
    var build = grab('BUILD') || '';
    var targetRaw = (grab('TARGET') || '').toLowerCase().trim();
    var consRaw = grab('CONSTRAINTS') || grab('CONSTRAINT') || '';
    var modeRaw = (grab('MODE') || '').toLowerCase().trim();
    var stackRaw = grab('STACK') || '';
    var notes = grab('NOTES') || '';
    var target = null;
    if (targetRaw) {
      var tk = targetRaw.replace(/[_\s-]+/g, ' ').trim();
      target = DSL_TARGET_ALIAS[tk] || DSL_TARGET_ALIAS[tk.replace(/\s+/g, '')] || (TARGET_META[targetRaw] ? targetRaw : null);
    }
    var constraints = consRaw
      ? consRaw.split(/\n|;|,(?![^(]*\))/).map(function (s) { return s.replace(/^[-*\d.\s]+/, '').trim(); }).filter(Boolean)
      : [];
    var mode = /^(strict|hard|rigorous)$/.test(modeRaw) ? 'strict'
      : /^(balanced|normal|default|lenient|soft)$/.test(modeRaw) ? 'balanced' : (modeRaw || null);
    // reconstruct a natural-language prompt so the rest of the pipeline is unchanged
    var prose = build;
    if (stackRaw) prose += '. Stack: ' + stackRaw;
    if (constraints.length) prose += '. Constraints: ' + constraints.join('; ') + '.';
    if (notes) prose += ' ' + notes;
    return { isDSL: true, prompt: prose.trim(), target: target, targetRaw: targetRaw || null, constraints: constraints, mode: mode, build: build };
  }

  function deriveFromPrompt(prompt, opts) {
    opts = opts || {};
    prompt = String(prompt || '').trim();
    // §70: a terse `BUILD:/TARGET:/CONSTRAINTS:/MODE:` command is parsed to a
    // structured declaration before anything else touches the text.
    var _dsl = parseUltraDSL(prompt);
    if (_dsl) {
      prompt = _dsl.prompt || prompt;
      opts = Object.assign({}, opts, { _dsl: _dsl });
      if (_dsl.target) opts._forceTarget = _dsl.target;
    }
    // stage 1: fold an attached spec document (markdown / JSON schema / OpenAPI)
    // into the prompt so the rest of the pipeline sees it as prose intent, and
    // stash its parsed entities as an explicit hint for _derivePrompt.
    if (opts.documents && window.Engine && Engine.Intake && Engine.Intake.enrichPrompt) {
      try {
        prompt = Engine.Intake.enrichPrompt(prompt, opts.documents);
        var _de = [];
        (Array.isArray(opts.documents) ? opts.documents : [opts.documents]).forEach(function (d) {
          var r = Engine.Intake.fromDocument(typeof d === 'string' ? d : (d.text || d.content || ''), d && d.kind);
          (r.entities || []).forEach(function (e) { _de.push({ name: e.name, fields: (e.fields || []).map(function (f) { return f.name; }) }); });
        });
        if (_de.length) opts = Object.assign({}, opts, { _docEntities: _de });
        if (Engine.Intake.analyze) Engine.Intake.analyze(opts.documents);
      } catch (_) {}
    }
    // §2-3: model-first intent when a provider is connected, deterministic rules
    // otherwise. Engine.Intent runs the rule-based Normalizer/Classifier as the
    // backbone and lets the model refine only the fuzzy fields.
    var intentP = (window.Engine && Engine.Intent && Engine.Intent.resolve)
      ? Engine.Intent.resolve(prompt, { useLLM: opts.useLLM })
      : Promise.resolve(null);
    return intentP.then(function (intent) { return _derivePrompt(prompt, opts, intent); },
      function () { return _derivePrompt(prompt, opts, null); });
  }

  function _derivePrompt(prompt, opts, intent) {
    _cid = {};
    _rid = 0;

    var U = window.Universal || (Engine.Universal);
    var normalized = (intent && intent.normalized) ? intent.normalized
      : (U ? U.Normalizer.normalize({ prompt: prompt }) : { projectGoal: prompt.slice(0, 200), applicationCategory: 'web_application', targetPlatforms: ['web'], primaryActors: ['user'], coreCapabilities: [] });
    var classification = (intent && intent.classification) ? intent.classification
      : (U ? U.Classifier.classify(normalized) : { primaryType: 'web_application', complexity: 'standard', riskLevel: 'low' });
    var intentEntities = (intent && intent.entitiesHint) || null;
    // an attached spec document's entities take priority over rule inference
    if (opts._docEntities && opts._docEntities.length) {
      var _byName = {}; (intentEntities || []).forEach(function (e) { _byName[e.name] = e; });
      opts._docEntities.forEach(function (e) { _byName[e.name] = { name: e.name, fields: (e.fields || []).concat(((_byName[e.name] || {}).fields) || []) }; });
      intentEntities = Object.keys(_byName).map(function (k) { return _byName[k]; });
    }
    var intentDesign = (intent && intent.design) || null;
    var lc = prompt.toLowerCase();

    /* ---- specialised runtime target (Engine.RuntimeRouter) ---- */
    // an explicit DSL `TARGET:` pins it; otherwise infer from the prose.
    var target = (opts._forceTarget && (opts._forceTarget === 'web' || TARGET_META[opts._forceTarget]))
      ? opts._forceTarget : detectTarget(prompt);
    var targetMeta = TARGET_META[target] || null;

    /* ---- unsupported requests (recorded, never faked) ---- */
    var unsupported = [];
    UNSUPPORTED_RE.forEach(function (u) { if (u[0].test(prompt)) unsupported.push({ id: nid('UNS'), request: (prompt.match(u[0]) || [''])[0], reason: u[1] }); });

    /* ---- unsafe requests (BLOCK the run) ---- */
    var unsafe = [];
    UNSAFE_RE.forEach(function (u) { if (u[0].test(prompt)) unsafe.push({ id: nid('UNSAFE'), request: (prompt.match(u[0]) || [''])[0], reason: u[1] }); });

    /* ---- the shape of the thing ---- */
    var wantsAuth = /\b(account|accounts|sign ?up|sign ?in|log ?in|auth|users?|role|permission|rbac|tenant)\b/.test(lc);
    var wantsRBAC = /\b(role|roles|rbac|permission|admin|manager|owner|access control)\b/.test(lc);
    // §16 — authentication methods beyond password
    var wantsMFA = /\b(mfa|2fa|two[- ]?factor|multi[- ]?factor|totp|authenticator app|one[- ]?time (code|password)|otp\b)\b/.test(lc);
    var wantsOAuth = /\b(oauth|sso\b|single sign[- ]?on|social (login|sign[- ]?in|auth)|sign ?in with (google|github|apple|microsoft)|log ?in with (google|github)|google (login|sign[- ]?in)|github (login|sign[- ]?in))\b/.test(lc);
    var wantsPasskeys = /\b(passkey|passkeys|webauthn|web ?authn|fido2?|biometric (login|auth)|face ?id login|touch ?id login|security key)\b/.test(lc);
    var wantsJobs = /\b(job|jobs|queue|worker|background|reminder|reminders|email|notification|notifications|schedule|cron|digest|async)\b/.test(lc);
    var wantsApi = /\b(api|rest|endpoint|endpoints|integrat)\b/.test(lc) || classification.primaryType === 'api_service';
    var wantsA11y = /\b(accessib|a11y|wcag|screen reader)\b/.test(lc);
    var wantsDocker = /\b(docker|container|compose|deploy|deployment|kubernetes|k8s|helm|terraform|infrastructure|iac)\b/.test(lc);

    /* ---- frontend framework ---- */
    var frontend = 'vanilla', frontendNote = null;
    for (var fi = 0; fi < FRONTEND_RE.length; fi++) {
      if (FRONTEND_RE[fi][0].test(prompt)) {
        frontend = FRONTEND_RE[fi][1];
        if (/\bangular\b/i.test(prompt) && frontend === 'svelte') frontendNote = 'Angular needs its full CLI toolchain; the same SPA is generated with Svelte (Vite build) — recorded so you can swap it.';
        if (/\bnext\.?js\b/i.test(prompt) && frontend === 'react') frontendNote = 'Next.js server components / file routing are not generated; a Vite + React SPA against the same API is.';
        break;
      }
    }
    /* ---- backend language ---- */
    var backend = 'node', backendNote = null;
    for (var bi = 0; bi < BACKEND_RE.length; bi++) {
      if (BACKEND_RE[bi][0].test(prompt)) {
        backend = BACKEND_RE[bi][1];
        if (/\bdjango\b/i.test(prompt)) backendNote = 'Django admin / ORM specifics are not generated; a FastAPI + SQLModel service with the same data model is.';
        break;
      }
    }
    /* ---- API style + realtime ---- */
    var apiStyle = /\bgraphql\b/i.test(prompt) ? 'graphql' : 'rest';
    var wantsWs = /\b(web ?socket|websockets?|real-?time|live updates?|presence|collaborat(e|ive)|chat|socket\.io)\b/i.test(prompt);
    var wantsMicroservices = /\b(microservices?|multi-?service|separate services?|service-oriented|split into services)\b/i.test(prompt);
    var storage =
      /\bpostgres|postgresql|pg\b/.test(lc) ? { choice: 'postgres', reason: 'requested explicitly' }
      : /\bsqlite\b/.test(lc) ? { choice: 'sqlite', reason: 'requested explicitly' }
      : /\b(database|persist|store|storage|sql)\b/.test(lc) ? { choice: 'postgres', reason: 'relational data implied; Postgres is the safe default' }
      : { choice: 'json', reason: 'no storage engine named; a schema-enforced JSON store is generated (swap in Postgres via DATABASE_URL)' };

    var entities = entitiesFromPrompt(prompt, normalized.primaryActors);
    // §3: when the model inferred a data model, prefer it (typed, deduped) but
    // keep the rule-based fields as a floor so nothing regresses.
    if (intentEntities && intentEntities.length) {
      var ruleByName = {};
      entities.forEach(function (e) { ruleByName[e.name] = e; });
      entities = intentEntities.filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; }).slice(0, 5).map(function (e) {
        var base = ruleByName[e.name];
        var fields = (base && base.fields ? base.fields.slice() : []);
        var have = {}; fields.forEach(function (f) { have[f.name] = 1; });
        (e.fields || []).forEach(function (fn) {
          var name = String(fn).replace(/[^A-Za-z0-9]/g, '');
          if (!name || have[name] || ['id', 'createdAt', 'updatedAt'].indexOf(name) >= 0) return;
          var type = /at$|date|time/i.test(name) ? 'timestamp' : /cents|count|qty|quantity|amount|price|age|num/i.test(name) ? 'int' : /is|has|done|active|enabled/i.test(name) ? 'bool' : /body|description|content|notes?$/i.test(name) ? 'longtext' : 'text';
          fields.push({ name: name, type: type, max: type === 'text' ? 200 : undefined });
        });
        if (!fields.length) fields.push({ name: 'title', type: 'text', required: true, max: 200 });
        return { name: e.name, fields: fields };
      });
      if (!entities.length) entities = entitiesFromPrompt(prompt, normalized.primaryActors);
    }

    /* ---- roles ---- */
    var roles = [];
    if (wantsAuth) {
      roles.push({ role: 'admin', permissions: ['manage_users', 'read_all', 'write_all', 'delete_all'] });
      roles.push({ role: 'member', permissions: ['read_own', 'write_own', 'delete_own'] });
      if (/\bguest|public|anonymous|visitor\b/.test(lc)) roles.push({ role: 'guest', permissions: ['read_public'] });
    }

    /* ---- assumptions (non-blocking ambiguity -> conservative default, recorded) ---- */
    var assumptions = [];
    function assume(about, decision, def, why) { assumptions.push({ id: nid('ASM'), about: about, decision: decision, default: def, rationale: why }); }
    if (storage.choice === 'json') assume('storage engine', 'schema-enforced JSON store', 'json', 'nothing named; real SQL migrations are still emitted for Postgres');
    if (wantsAuth) assume('password policy', 'scrypt hash, minimum 8 characters, first user becomes admin', 'scrypt+8', 'no policy specified; a safe conservative default');
    if (wantsAuth) assume('session model', 'opaque server-side session tokens (no JWT)', 'opaque-session', 'simplest secure default; no third-party identity provider named');
    if (wantsJobs) assume('job delivery', 'in-process durable queue + polling worker; email send is logged, not wired to a provider', 'queue+log', 'no email/SMS provider named — wiring one needs credentials the user must supply');
    if (frontend === 'vanilla') assume('frontend', 'vanilla HTML/CSS/JS with fetch', 'vanilla', 'no framework named');
    else assume('frontend', frontend + ' component app (vendored, no build step) with fetch', frontend, frontendNote || (frontend + ' is generated as a real component app the runtime crawl can drive'));
    if (frontendNote) assume('frontend substitution', frontendNote, frontend, 'the requested framework maps to a supported one with the same app shape');
    if (backend === 'python') assume('backend', 'Python + FastAPI + SQLModel; tests run with pytest', 'python', backendNote || 'a real FastAPI service — needs Python 3.10+ on the machine that runs the verify loop');
    if (apiStyle === 'graphql') assume('API', 'GraphQL schema + resolvers over the same data model (REST endpoints are also emitted)', 'graphql', 'GraphQL requested');
    if (!wantsDocker) assume('deployment', 'Docker + Compose IaC is generated but nothing is pushed', 'compose', 'no target named; generation is safe, a real deploy needs the user\'s credentials');

    /* ---- blocking questions (only where the answer changes architecture / data-safety / money / auth) ---- */
    var blockingQuestions = [];
    function blocker(kind, question, why, options) { blockingQuestions.push({ id: nid('Q'), kind: kind, question: question, why: why, options: options || [], answered: null }); }
    if (/\b(pay|payment|payments|checkout|subscription|billing|charge|invoice)\b/.test(lc) && !/\b(stripe|paypal|braintree|adyen|square|mock payment|no real payment)\b/.test(lc)) {
      blocker('billing', 'Which payment provider should handle real charges, or should payments be recorded only (no real money movement)?',
        'Moving real money requires a specific provider + credentials and changes the data model and compliance scope.',
        ['Record payments only (no provider)', 'Stripe', 'Other (specify)']);
    }
    if (wantsAuth && /\b(multi-?tenant|organization|organisations?|companies|workspaces?|teams?)\b/.test(lc) && !/\brow-level|per-tenant|shared schema|separate database\b/.test(lc)) {
      blocker('architecture', 'Should tenants share one schema with a tenant_id column, or is stricter isolation required?',
        'Tenant isolation is a data-safety decision that is very expensive to change after generation.',
        ['Shared schema + tenant_id (default)', 'Separate database per tenant']);
    }
    if (/\b(gdpr|hipaa|pci|sox|compliance|regulated|medical records|phi|financial data)\b/.test(lc)) {
      blocker('security', 'This domain implies a formal compliance regime. Which controls are in scope for this build (audit log, encryption at rest, data export/erase)?',
        'Compliance scope changes the schema, the deployment target and what "done" means.',
        ['Audit log + data export/erase only', 'Full regime (out of scope for this generator)']);
    }

    /* ---- requirements with stable ids + machine-checkable acceptance criteria ---- */
    var reqs = [];
    var acList = [];
    function addReq(statement, category, priority, machine, journeyRef) {
      var r = { id: nid('REQ'), statement: statement, category: category, priority: priority || 'mandatory',
        acceptanceCriteria: machine || [], dependsOn: [], implementationFiles: [], traceIds: [], status: 'unverified' };
      // a human-readable Given/When/Then per requirement, linked by id
      var ac = { id: nid('AC'), requirementId: r.id, given: 'the application is generated and running',
        when: statement.replace(/^The (application|system|project)\s*/i, '').replace(/\.$/, ''),
        then: 'the behaviour is present and passes its automated evidence', machine: machine || [] };
      acList.push(ac);
      r.traceIds.push(ac.id);
      if (journeyRef) r.traceIds.push(journeyRef);
      reqs.push(r);
      return r;
    }

    addReq('The project’s automated tests pass.', 'quality', 'mandatory', [{ kind: 'execution', gate: 'testsPass' }]);
    addReq('The project builds a production artifact.', 'quality', 'mandatory', [{ kind: 'execution', gate: 'buildPasses' }]);
    addReq('The project passes lint with no findings.', 'quality', 'optional', [{ kind: 'execution', gate: 'lintClean' }]);
    addReq('No production control is simulated, mocked, or broken.', 'integrity', 'mandatory', [{ kind: 'no-mock' }]);
    addReq('A real database schema with migrations exists.', 'data', 'mandatory', [{ kind: 'file', path: '/db/migrations/001_init.sql' }]);
    addReq('CI runs the test and build gates on every change.', 'delivery', 'optional', [{ kind: 'ci', want: 'test+build' }]);

    if (wantsAuth) {
      addReq('Users can create an account and sign in.', 'functional', 'mandatory',
        [{ kind: 'file', path: '/src/auth.js' }, { kind: 'control', name: 'need an account?', want: 'REAL' }]);
      addReq('Authentication uses a password hash and server-side sessions (no secrets in source).', 'security', 'mandatory',
        [{ kind: 'file', path: '/src/auth.js' }]);
    }
    if (wantsRBAC) {
      addReq('Access is role-based: a member can only act on their own records; an admin can act on all.', 'security', 'mandatory',
        [{ kind: 'file', path: '/src/auth.js' }, { kind: 'execution', gate: 'testsPass' }]);
    }
    var svcExt = backend === 'python' ? '.py' : '.js';
    var svcDir = backend === 'python' ? '/app/services/' : '/src/services/';
    entities.forEach(function (e) {
      if (['user', 'session', 'job'].indexOf(e.name) >= 0) return;
      addReq('Users can create, list and delete ' + e.name + ' records through the ' + apiStyle.toUpperCase() + ' API.', 'functional', 'mandatory',
        [{ kind: 'file', path: svcDir + e.name + svcExt }, { kind: 'execution', gate: 'testsPass' }]);
    });
    if (wantsJobs) {
      addReq('Background jobs run on a durable queue with retry and dead-letter handling.', 'functional', 'mandatory',
        backend === 'python'
          ? [{ kind: 'file', path: '/app/queue.py' }, { kind: 'file', path: '/app/worker.py' }, { kind: 'execution', gate: 'testsPass' }]
          : [{ kind: 'file', path: '/src/queue.js' }, { kind: 'file', path: '/src/worker.js' }, { kind: 'execution', gate: 'testsPass' }]);
    }
    if (wantsApi || apiStyle === 'graphql') {
      addReq('The backend exposes a ' + (apiStyle === 'graphql' ? 'GraphQL schema + resolvers' : 'documented REST API surface') + '.', 'functional', 'mandatory',
        apiStyle === 'graphql'
          ? [{ kind: 'file', path: backend === 'python' ? '/app/schema.graphql' : '/src/graphql/schema.js' }, { kind: 'execution', gate: 'testsPass' }]
          : [{ kind: 'file', path: backend === 'python' ? '/app/main.py' : '/server.js' }]);
    }
    if (wantsWs) {
      addReq('The backend exposes a working WebSocket endpoint for real-time updates.', 'functional', 'mandatory',
        [{ kind: 'file', path: backend === 'python' ? '/app/ws.py' : '/src/ws.js' }, { kind: 'execution', gate: 'testsPass' }]);
    }
    if (frontend !== 'vanilla') {
      addReq('The frontend is a working ' + frontend + ' component app that the runtime crawl can drive.', 'functional', 'mandatory',
        [{ kind: 'file', path: '/public/app.js' }, { kind: 'control', name: frontend === 'vanilla' ? 'add' : 'need an account?', want: 'REAL' }]);
    }
    if (wantsA11y) {
      addReq('The frontend passes basic accessibility checks (lang attribute, image alt text, labelled controls).', 'quality', 'mandatory',
        [{ kind: 'file', path: '/test/a11y.test.js' }, { kind: 'execution', gate: 'testsPass' }]);
    }
    if (wantsDocker) {
      var depTargets = deployTargetsFor(lc);
      addReq('The project ships ' + depTargets.join(' + ') + ' infrastructure-as-code.', 'delivery', 'mandatory',
        [{ kind: 'file', path: '/Dockerfile' }].concat(
          depTargets.indexOf('kubernetes') >= 0 ? [{ kind: 'file', path: '/k8s/deployment.yaml' }] :
          depTargets.indexOf('helm') >= 0 ? [{ kind: 'file', path: '/chart/Chart.yaml' }] :
          depTargets.indexOf('terraform') >= 0 ? [{ kind: 'file', path: '/terraform/main.tf' }] :
          [{ kind: 'file', path: '/docker-compose.prod.yml' }]));
    }
    if (wantsMicroservices) {
      addReq('The system is split into independently-runnable services wired by Docker Compose.', 'architecture', 'mandatory',
        [{ kind: 'file', path: '/docker-compose.prod.yml' }, { kind: 'execution', gate: 'testsPass' }]);
    }

    /* ---- journeys ---- */
    var journeys = [];
    if (wantsAuth) journeys.push({ id: nid('JRN'), actor: (normalized.primaryActors[0] || 'user'),
      steps: ['open the app', 'register an account', 'sign in', 'land on the authenticated view'],
      requirementIds: reqs.filter(function (r) { return /account|sign in/i.test(r.statement); }).map(function (r) { return r.id; }) });
    entities.forEach(function (e) {
      if (['user', 'session', 'job'].indexOf(e.name) >= 0) return;
      journeys.push({ id: nid('JRN'), actor: (normalized.primaryActors[0] || 'user'),
        steps: ['sign in', 'create a ' + e.name, 'see it in the list', 'delete it'],
        requirementIds: reqs.filter(function (r) { return r.statement.indexOf(' ' + e.name + ' ') >= 0; }).map(function (r) { return r.id; }) });
    });

    /* ---- api + job requirement tables (traceable) ---- */
    var apiRequirements = [];
    if (wantsAuth) ['register', 'login', 'logout', 'me'].forEach(function (a) {
      apiRequirements.push({ id: nid('API'), method: a === 'me' ? 'GET' : 'POST', path: '/api/auth/' + a, auth: a === 'me' || a === 'logout',
        requirementId: (reqs.find(function (r) { return /account/i.test(r.statement); }) || {}).id || null });
    });
    entities.forEach(function (e) {
      if (['user', 'session', 'job'].indexOf(e.name) >= 0) return;
      var rid = (reqs.find(function (r) { return r.statement.indexOf(' ' + e.name + ' ') >= 0; }) || {}).id || null;
      [['GET', ''], ['POST', ''], ['DELETE', '/:id']].forEach(function (m) {
        apiRequirements.push({ id: nid('API'), method: m[0], path: '/api/' + e.name + 's' + m[1], auth: wantsAuth, requirementId: rid });
      });
    });
    var jobRequirements = [];
    if (wantsJobs) jobRequirements.push({ id: nid('JOB'), type: /\breminder|email|digest|notification\b/.test(lc) ? 'email-reminder' : 'background-task',
      trigger: /\bschedule|cron|daily|weekly|hourly\b/.test(lc) ? 'scheduled' : 'on-event',
      requirementId: (reqs.find(function (r) { return /background jobs/i.test(r.statement); }) || {}).id || null });

    var security = [];
    function sec(statement, rid) { security.push({ id: nid('SEC'), statement: statement, requirementId: rid || null }); }
    sec('No secret, token or credential is committed to source.');
    if (wantsAuth) sec('Passwords are stored only as a slow salted hash (scrypt).', (reqs.find(function (r) { return /password hash/i.test(r.statement); }) || {}).id);
    if (wantsAuth) sec('Every mutating API route requires an authenticated session.');
    if (wantsAuth) sec('A user can only read and modify their own rows; cross-user (IDOR) access is rejected.');
    if (wantsRBAC) sec('Privileged routes reject a non-admin session (no privilege escalation).');
    if (wantsAuth && wantsMFA) sec('When TOTP MFA is enrolled, login is not complete until a valid 6-digit code is supplied.');
    if (wantsAuth && wantsOAuth) sec('OAuth client secrets are read from the environment only, never stored in source or the database.');
    if (wantsAuth && wantsPasskeys) sec('A passkey assertion signature is verified against the stored credential public key before a session is issued.');
    sec('User input is validated at the API boundary; no SQL is built by string concatenation.');
    sec('The API applies per-IP rate limiting.');

    var mandatory = reqs.filter(function (r) { return r.priority === 'mandatory'; }).map(function (r) { return r.id; });
    var optional = reqs.filter(function (r) { return r.priority === 'optional'; }).map(function (r) { return r.id; });

    var contract = {
      schemaVersion: 1,
      generatedAt: Date.now(),
      source: 'prompt-rules',
      mode: 'from-prompt',
      dsl: (opts._dsl && opts._dsl.isDSL)
        ? { syntax: 'ultra-command', target: opts._dsl.target || null, targetRaw: opts._dsl.targetRaw,
            constraints: opts._dsl.constraints, verifyMode: opts._dsl.mode || 'balanced' }
        : null,
      product: {
        name: slugName(prompt),
        type: classification.primaryType,
        objective: normalized.projectGoal,
        prompt: prompt.slice(0, 2000)
      },
      supportedStack: {
        frontend: frontend, frontendNote: frontendNote,
        backend: backend, backendNote: backendNote,
        database: storage.choice, api: apiStyle, websocket: wantsWs,
        architecture: wantsMicroservices ? 'multi-service' : 'monolith',
        jobs: wantsJobs, auth: wantsAuth, rbac: wantsRBAC, deploy: wantsDocker,
        authMethods: { password: wantsAuth, mfa: wantsAuth && wantsMFA, oauth: wantsAuth && wantsOAuth, passkeys: wantsAuth && wantsPasskeys },
        deployTargets: deployTargetsFor(lc)
      },
      capabilitiesReference: SUPPORTED,
      scope: { mandatory: mandatory, optional: optional, deferred: [], excluded: unsupported.map(function (u) { return u.id; }) },
      entities: entities,
      roles: roles,
      journeys: journeys,
      apiRequirements: apiRequirements,
      jobRequirements: jobRequirements,
      storage: storage,
      security: security,
      deployment: { expectation: wantsDocker ? deployTargetsFor(lc).join(' + ') + ', deploy-ready' : 'Docker + Compose generated, not pushed', targets: deployTargetsFor(lc) },
      requirements: reqs,
      acceptanceCriteria: acList,
      assumptions: assumptions,
      blockingQuestions: blockingQuestions,
      unsupported: unsupported,
      unsafe: unsafe,
      target: target,
      targetLabel: targetMeta ? targetMeta.label : 'Web application',
      targetAdapter: targetMeta ? targetMeta.adapter : null,
      targetRuntime: targetMeta ? targetMeta.runtime : null,
      intent: { source: (intent && intent.source) || 'rules', corrections: (intent && intent.corrections) || null, design: intentDesign || null },
      totals: {
        requirements: reqs.length,
        withMachineCriteria: reqs.filter(function (r) { return r.acceptanceCriteria.some(function (c) { return ACCEPT_KINDS.indexOf(c.kind) >= 0; }); }).length,
        mandatory: mandatory.length,
        blockingQuestions: blockingQuestions.length,
        unsupported: unsupported.length,
        unsafe: unsafe.length
      },
      verdict: 'buildable'
    };
    // A run is only BLOCKED up front for safety, or when the request has NO
    // buildable functional core (everything asked for is outside the supported
    // stack). Partial-scope requests still build the supported part and report
    // the rest as `unsupported`.
    // Nothing functional is "unsupported" anymore — native mobile / ML training /
    // blockchain each route through a runtime adapter (contract.target). A run is
    // only BLOCKED up front for safety; a missing host runtime is discovered at
    // verification time and reported as BLOCKED with a precise reason.
    if (unsafe.length) contract.verdict = 'unsafe';
    else contract.verdict = 'buildable';
    // a non-web target is still fully supported — but a safety refusal always wins
    if (target !== 'web') {
      contract.mode = 'from-prompt';
      if (!unsafe.length) contract.verdict = 'buildable';
    }

    var finish = function (llmReqs) {
      if (llmReqs && llmReqs.length) {
        llmReqs.forEach(function (r) {
          r.id = nid('REQ'); r.priority = 'optional'; r.traceIds = []; r.source = 'llm';
          contract.requirements.push(r);
        });
        contract.source = 'prompt-rules+llm';
        contract.totals.requirements = contract.requirements.length;
      }
      write(contract);
      return contract;
    };
    if (opts.useLLM === false) return Promise.resolve(finish(null));
    return deriveLLM({ objective: normalized.projectGoal, name: contract.product.name, type: classification.primaryType })
      .then(finish);
  }

  Engine.Contract = { derive: derive, deriveFromPrompt: deriveFromPrompt, write: write, load: load, ACCEPT_KINDS: ACCEPT_KINDS, SUPPORTED: SUPPORTED, _extractJson: extractJson };
  console.info('[Contract] product-contract engine ready — Engine.Contract');
})();
