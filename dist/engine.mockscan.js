/* =====================================================================
   engine.mockscan.js  —  the full "nothing decorative may remain" scanner.

   The app already has MockDetect (6 patterns). This is the complete signal
   table from the Mockup-to-Production spec, plus intent inference for
   interactive controls.

     Engine.MockScan.run()        -> { signals:[{file,line,kind,severity,why,sample}], byKind, total }
     Engine.MockScan.inferIntent(control) -> { expected, confidence, basis }
     Engine.MockScan.classify(control, {observed, source}) -> REAL|PARTIAL|MOCK|BROKEN|UNREACHABLE|UNKNOWN
   ===================================================================== */
(function () {
  'use strict';
  if (!window.Engine) return;
  var Engine = window.Engine;
  var FS = Engine.FS;

  var SELF_RE = /^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor|\.next|\.nuxt)\//;
  function isProduct(p) { return !SELF_RE.test(p); }

  // kind, severity, regex, why
  var SIGNALS = [
    ['empty-handler', 'high', /\bon[A-Z][a-zA-Z]+\s*=\s*\{?\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}?/, 'empty arrow handler — control does nothing'],
    ['empty-handler', 'high', /\bon[a-z]+\s*=\s*["'](?:\s*|return false;?|void\(0\);?|#)["']/, 'inert inline handler'],
    ['noop-return', 'medium', /=>\s*(?:null|undefined)\s*;?\s*\}/, 'handler returns null/undefined only'],
    ['fake-async', 'high', /setTimeout\s*\(\s*(?:function|\([^)]*\)\s*=>|\(\s*\)\s*=>)[\s\S]{0,160}?(?:resolve|setState|return\b|success|done)\b[\s\S]{0,80}?,\s*\d{2,}\s*\)/i, 'setTimeout callback resolves/returns fake data — simulated async'],
    ['fake-async', 'medium', /setTimeout\s*\([^,)]+,\s*\d{3,}\s*\)\s*;?\s*(?:\/\/.*(?:api|fetch|load|fake|mock|simulat))/i, 'long setTimeout next to an api/load comment'],
    ['random-as-data', 'medium', /\bMath\.random\s*\(\s*\)/, 'Math.random fabricating product data or success'],
    ['mock-data', 'high', /\b(?:const|let|var)\s+(?:mock|dummy|fake|sample|demo|placeholder|test)[A-Z_]\w*\s*=\s*[\[{]/, 'named mock/sample data structure'],
    ['mock-data', 'medium', /\b(?:mockData|dummyData|sampleData|fakeData|DEMO_DATA|SAMPLE_[A-Z]+)\b/, 'reference to mock data'],
    ['lorem', 'low', /lorem ipsum|dolor sit amet/i, 'lorem ipsum placeholder text'],
    ['todo-marker', 'medium', /\b(?:TODO|FIXME|XXX|HACK)\b[:\s]/, 'incomplete implementation marker'],
    ['coming-soon', 'medium', /coming soon|not (?:yet )?implemented|under construction|work in progress/i, '"coming soon" placeholder'],
    ['unimplemented', 'high', /\b(?:NotImplementedException|UnsupportedOperationException)\b|todo!\s*\(|unimplemented!\s*\(|fatalError\s*\(\s*["']TODO/i, 'unimplemented-exception placeholder'],
    ['throw-placeholder', 'high', /throw new Error\s*\(\s*["'](?:not implemented|todo|placeholder|unimplemented)/i, 'throw-placeholder in an active path'],
    ['dead-link', 'medium', /href\s*=\s*["'](?:#|javascript:void\(0\);?)["']/, 'dead link (# / javascript:void(0))'],
    ['disabled-forever', 'low', /\bdisabled\s*(?:=\s*["']?(?:true|disabled)["']?)?[^>]*>(?![\s\S]{0,200}removeAttribute\(['"]disabled)/, 'control disabled with no path to enable it'],
    ['fake-persistence', 'high', /\/\/\s*(?:no|fake|mock|todo).{0,20}(?:persist|save|store|api)|persist(?:ence)?\s*(?:is\s*)?(?:not|todo|fake)/i, 'comment admits persistence is fake/missing'],
    ['hardcoded-auth', 'high', /\b(?:hardcoded|test|demo|admin)(?:User|Token|Password|Secret|Key)\b|user\s*=\s*["'](?:admin|test|demo)["']|isAdmin\s*=\s*true/i, 'hard-coded credential / client-only auth flag'],
    ['stub-service', 'high', /(?:class|const)\s+\w*(?:Service|Repository|Client|Api|Adapter)\b[\s\S]{0,120}?return\s+(?:\[\s*\]|\{\s*\}|null|mock|fake|sample)/i, 'service/repository returns a static value'],
    ['synthetic-dashboard', 'medium', /(?:chart|graph|metric|stat|kpi)[\s\S]{0,60}?(?:=\s*\[|data:\s*\[)\s*\d+\s*,\s*\d+/i, 'chart/metric driven by a constant array'],
    ['bypassed-validation', 'medium', /\/\/\s*(?:skip|no|todo).{0,20}valida|validation\s*(?:is\s*)?(?:disabled|skipped|todo)/i, 'validation admitted disabled/skipped'],
    ['console-only', 'low', /\bon[A-Z]\w+\s*=\s*\{?\s*\(?\)?\s*=>\s*console\.(?:log|warn)\([^)]*\)\s*\}?/, 'handler only logs to console']
  ];

  function scanFile(path, src) {
    var findings = [];
    if (!/\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte|html?)$/i.test(path)) return findings;
    var lines = src.split('\n');
    SIGNALS.forEach(function (sig) {
      var re = new RegExp(sig[2].source, sig[2].flags.indexOf('g') >= 0 ? sig[2].flags : sig[2].flags + 'g');
      var m, count = 0;
      while ((m = re.exec(src)) && count < 8) {
        count++;
        var line = src.slice(0, m.index).split('\n').length;
        findings.push({
          file: path, line: line, kind: sig[0], severity: sig[1], why: sig[3],
          sample: String(m[0]).replace(/\s+/g, ' ').slice(0, 100)
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
    return findings;
  }

  function run() {
    var signals = [];
    Object.keys(FS._data).forEach(function (p) {
      if (!FS.isFile(p) || !isProduct(p)) return;
      var src = FS.read(p) || '';
      if (src.length > 400000) return;
      signals = signals.concat(scanFile(p, src));
    });
    var byKind = {};
    signals.forEach(function (s) { byKind[s.kind] = (byKind[s.kind] || 0) + 1; });
    return { signals: signals, byKind: byKind, total: signals.length, generatedAt: Date.now() };
  }

  /* ---------- intent inference ---------- */
  var INTENT = [
    [/search|magnif|find|lookup|filter/i, 'Filter or search the current dataset', 'high'],
    [/(delete|remove|trash|bin)\b/i, 'Delete with a confirmation step (guarded, reversible where possible)', 'high'],
    [/save|persist|apply|update|submit|confirm/i, 'Persist the current form/state to the backend, with success/error feedback', 'high'],
    [/add|new|create|\+\s*$/i, 'Open a create flow / append a new record', 'high'],
    [/edit|rename|modify/i, 'Enter edit mode for the selected item', 'medium'],
    [/export|download|csv|pdf/i, 'Generate and download a file of the current data', 'high'],
    [/import|upload|attach/i, 'Pick a file, validate it, and ingest it', 'high'],
    [/login|sign\s?in|authenticate/i, 'Authenticate the user and start a session', 'high'],
    [/logout|sign\s?out/i, 'End the session and clear credentials', 'high'],
    [/settings|preferences|config/i, 'Navigate to settings', 'medium'],
    [/next|previous|prev|page|more/i, 'Paginate the list', 'high'],
    [/refresh|reload|sync/i, 'Re-fetch the current data from the source', 'high'],
    [/cancel|close|dismiss|back/i, 'Dismiss the current view without committing changes', 'high'],
    [/copy|share|link/i, 'Copy a value / share link to the clipboard', 'medium'],
    [/play|pause|stop|record/i, 'Transport control for media/processing', 'medium'],
    [/retry|try again/i, 'Re-attempt the failed operation', 'high']
  ];

  function inferIntent(control) {
    var name = String((control && (control.name || control.control)) || '').trim();
    if (!name) return { expected: 'unknown — no accessible label', confidence: 'low', basis: 'no label' };
    for (var i = 0; i < INTENT.length; i++) {
      if (INTENT[i][0].test(name)) {
        return { expected: INTENT[i][1], confidence: INTENT[i][2], basis: 'label + convention: "' + name + '"' };
      }
    }
    if (control && control.href) return { expected: 'Navigate to ' + control.href, confidence: 'medium', basis: 'href' };
    if (control && control.control === 'form') return { expected: 'Validate and submit the form to its endpoint', confidence: 'medium', basis: 'element type' };
    return { expected: 'Perform the action named "' + name + '" — verify against requirements', confidence: 'low', basis: 'label only' };
  }

  // status per the spec: REAL / PARTIAL / MOCK / BROKEN / UNREACHABLE / UNKNOWN
  function classify(control, ctx) {
    ctx = ctx || {};
    if (ctx.observed) {
      if (ctx.observed === 'BROKEN') return 'BROKEN';
      if (ctx.observed === 'REAL') {
        // wired + effect, but is it production-grade? downgrade to PARTIAL if no
        // error/loading handling is visible near the handler
        if (ctx.source && !/catch|\.then\(|finally|isLoading|loading|error/i.test(ctx.source)) return 'PARTIAL';
        return 'REAL';
      }
      if (ctx.observed === 'MOCK') return 'MOCK';
      if (ctx.observed === 'HIDDEN' || ctx.observed === 'DISABLED') return 'UNREACHABLE';
    }
    if (control && (control.status === 'MOCK' || (control.note && /dead link|no handler/i.test(control.note)))) return 'MOCK';
    if (control && control.hasHandler) return 'PARTIAL';
    return 'UNKNOWN';
  }

  Engine.MockScan = { run: run, inferIntent: inferIntent, classify: classify, SIGNALS: SIGNALS };
  window.MockScan = Engine.MockScan;
  console.info('[MockScan] full simulation-signal scanner ready — Engine.MockScan');
})();
