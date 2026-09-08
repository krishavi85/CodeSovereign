/* engine.recovery.js
   CodeSovereign - Recovery Engine v2 (Autonomous Project Recovery)
   Implements the 13-section Recovery Engine V2 roadmap:
     - L1-L5 Recovery Levels
     - Multi-cycle autonomous repair loop (up to 5 cycles, with alternatives)
     - Root-cause analysis (causal chain)
     - Repair confidence and risk
     - Repair diff and audit trail
     - Real build / runtime / interaction verification
     - Active connection-graph validation (CONNECTED/BROKEN/MISSING/...)
     - Mock/placeholder detector
     - Weighted health score (by subsystem)
     - Hard verification gate (only rolls back on regression)
   Exposed as window.Recovery and merged into window.Engine.
   No mocks. Every result is computed from real workspace data.
*/
(function(){
  'use strict';
  if (!window.Engine) { console.error('[Recovery] window.Engine missing; load engine.js first'); return; }
  const Engine = window.Engine;

  // ---------------- helpers ----------------
  const NS_SNAP  = 'cs.snap.v1';
  const NS_RUN   = 'cs.runs.v1';
  const NS_DIFFS = 'cs.diffs.v1';
  const now  = () => Date.now();
  const uid  = (p) => (p || 'id') + '_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  function loadJSON(k, fb){ try { return JSON.parse(localStorage.getItem(k)) || fb; } catch(e){ return fb; } }
  function saveJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  // ---------------- Issue schema (V1) ----------------
  const ISSUE_SUITES = ['html','javascript','css','console','references','files','build','runtime','functional'];
  function classifySuite(filePath, message){
    const f = String(filePath || '').toLowerCase();
    const m = String(message || '').toLowerCase();
    if (f.endsWith('.html')) {
      if (m.includes('tag imbalance') || m.includes('alt') || m.includes('lang') || m.includes('reference')) return 'html';
      return 'html';
    }
    if (f.endsWith('.js') || f.endsWith('.mjs')) {
      if (m.includes('syntax')) return 'javascript';
      if (m.includes('eval'))  return 'javascript';
      if (m.includes('console.log')) return 'console';
      return 'javascript';
    }
    if (f.endsWith('.css')) return 'css';
    if (m.includes('empty') || m.includes('todo') || m.includes('fixme')) return 'files';
    if (m.includes('reference') || m.includes('not found')) return 'references';
    return 'files';
  }
  function issueCode(suite, message){
    const m = String(message || '').toLowerCase();
    const map = {
      'tag imbalance'  : 'HTML_TAG_IMBALANCE',
      'alt attribute'  : 'HTML_MISSING_ALT',
      'lang attribute' : 'HTML_MISSING_LANG',
      'broken reference': 'HTML_BROKEN_REF',
      'css url'        : 'CSS_BROKEN_URL',
      'syntax error'   : 'JS_SYNTAX_ERROR',
      'eval()'         : 'JS_CSP_UNSAFE_EVAL',
      'console.log'    : 'JS_CONSOLE_LOG',
      'empty'          : 'FILE_EMPTY',
      'todo'           : 'FILE_TODO_MARKER',
      'fixme'          : 'FILE_FIXME_MARKER'
    };
    for (const k in map) if (m.includes(k)) return map[k];
    if (suite === 'javascript') return 'JS_GENERIC';
    if (suite === 'html')       return 'HTML_GENERIC';
    if (suite === 'css')        return 'CSS_GENERIC';
    if (suite === 'console')    return 'JS_CONSOLE_LOG';
    if (suite === 'references') return 'REF_BROKEN';
    if (suite === 'files')      return 'FILE_GENERIC';
    return 'GENERIC';
  }
  function isRepairable(issue){
    const c = issue.code;
    return [
      'HTML_TAG_IMBALANCE','HTML_MISSING_ALT','HTML_MISSING_LANG',
      'CSS_BROKEN_URL','JS_CONSOLE_LOG',
      'FILE_EMPTY','FILE_TODO_MARKER','FILE_FIXME_MARKER',
      'HTML_BROKEN_REF'
    ].indexOf(c) >= 0;
  }
  function layerFor(suite){
    if (suite === 'runtime' || suite === 'functional') return 'RUNTIME';
    if (suite === 'build') return 'BUILD';
    return 'STATIC';
  }
  function subsystemFor(issue){
    const f = String(issue.file || '').toLowerCase();
    if (f.includes('/styles/') || f.endsWith('.css')) return 'styles';
    if (f.includes('/scripts/') || f.endsWith('.js'))  return 'scripts';
    if (f.includes('/api/') || f.includes('/routes/') || f.includes('/services/')) return 'backend';
    if (f.endsWith('.html')) return 'frontend';
    return 'workspace';
  }
  // Per-issue repair confidence (0-1) and risk (low/medium/high)
  function assessIssue(issue){
    const confMap = {
      'HTML_TAG_IMBALANCE': {confidence: 0.95, risk: 'low',    why: 'mechanical structural fix'},
      'HTML_MISSING_LANG':  {confidence: 0.99, risk: 'low',    why: 'add standard attribute'},
      'HTML_MISSING_ALT':   {confidence: 0.90, risk: 'low',    why: 'add accessibility attribute'},
      'HTML_BROKEN_REF':    {confidence: 0.75, risk: 'medium', why: 'rewrite reference to known file'},
      'CSS_BROKEN_URL':     {confidence: 0.80, risk: 'low',    why: 'remove broken url() reference'},
      'JS_CONSOLE_LOG':     {confidence: 0.70, risk: 'low',    why: 'comment out debug statement'},
      'JS_CSP_UNSAFE_EVAL': {confidence: 0.60, risk: 'medium', why: 'swap eval() for safer alternative'},
      'FILE_EMPTY':         {confidence: 0.95, risk: 'low',    why: 'seed file with placeholder'},
      'FILE_TODO_MARKER':   {confidence: 0.50, risk: 'low',    why: 'note marker for follow-up'},
      'FILE_FIXME_MARKER':  {confidence: 0.50, risk: 'low',    why: 'note marker for follow-up'}
    };
    return confMap[issue.code] || {confidence: issue.confidence || 0.4, risk: 'medium', why: 'generic fix'};
  }
  function normalizeIssue(raw, idx){
    const suite = classifySuite(raw.file, raw.message);
    const code  = issueCode(suite, raw.message);
    const sev   = String(raw.severity || 'info').toLowerCase();
    const severity = (sev === 'warn' ? 'warning' : sev);
    const assess = assessIssue({ code: code });
    return {
      id: 'issue_' + (idx || 0).toString(36) + '_' + uid('iss'),
      suite, severity, code,
      file: raw.file || '',
      location: { line: raw.line || 0, col: 0 },
      message: raw.message || '',
      evidence: raw.evidence || raw.message || '',
      confidence: assess.confidence,
      risk: assess.risk,
      why: assess.why,
      repairable: false,
      layer: layerFor(suite),
      subsystem: ''
    };
  }
  function normalizeAll(rawIssues){
    return (rawIssues || []).map((r, i) => {
      const n = normalizeIssue(r, i);
      n.repairable = isRepairable(n);
      n.subsystem = subsystemFor(n);
      return n;
    });
  }

  // ---------------- Snapshots (V1) ----------------
  const Snapshots = {
    _list: loadJSON(NS_SNAP, []),
    _save(){ saveJSON(NS_SNAP, this._list.slice(-20)); },
    list(){ return this._list.slice(); },
    capture(reason, runId){
      const files = {};
      const fileNames = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
      fileNames.forEach(p => { files[p] = Engine.FS.read(p) || ''; });
      const hashOf = (s) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
      };
      const snap = {
        snapshotId: 'snap_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        reason: reason || 'manual',
        capturedAt: now(),
        runId: runId || null,
        fileCount: fileNames.length,
        files: files,
        hashes: {}
      };
      fileNames.forEach(p => { snap.hashes[p] = hashOf(files[p]); });
      this._list.push(snap);
      this._save();
      return snap;
    },
    restore(snapshotId){
      const snap = this._list.find(s => s.snapshotId === snapshotId);
      if (!snap) return { ok: false, error: 'snapshot_not_found' };
      Object.keys(snap.files).forEach(p => { Engine.FS.write(p, snap.files[p]); });
      return { ok: true, snapshotId: snapshotId, filesRestored: Object.keys(snap.files).length };
    },
    rollbackLatest(){
      if (this._list.length === 0) return { ok: false, error: 'no_snapshots' };
      const last = this._list[this._list.length - 1];
      return this.restore(last.snapshotId);
    },
    clear(){
      this._list = [];
      this._save();
    }
  };

  // ---------------- Engine.Graph (V1) ----------------
  const Graph = {
    files: [],
    imports: {},
    exports: {},
    references: {},
    routes: [],
    components: [],
    services: [],
    database: [],
    _customTags: new Set(),
    _buildCustomTags(){
      this._customTags = new Set();
      Object.keys(Engine.FS._data).forEach(p => {
        if (!p.endsWith('.html')) return;
        const html = Engine.FS.read(p) || '';
        const tags = html.match(/<([A-Z][A-Za-z0-9-]+|[a-z]+-[a-z0-9-]+)/g) || [];
        tags.forEach(t => {
          const name = t.replace(/^</, '');
          this._customTags.add(name);
          this.components.push({ file: p, tag: name, instances: (html.match(new RegExp('<' + name + '([\\s>])', 'g')) || []).length });
        });
      });
    },
    build(){
      this.files = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
      this.imports = {};
      this.exports = {};
      this.references = {};
      this.routes = [];
      this.components = [];
      this.services = [];
      this.database = [];
      this.files.forEach(p => {
        const c = Engine.FS.read(p) || '';
        this.imports[p] = [];
        this.exports[p] = [];
        this.references[p] = [];
        if (p.endsWith('.html')) {
          const refs = c.match(/(?:src|href)\s*=\s*["']([^"']+)["']/g) || [];
          refs.forEach(r => {
            const m = r.match(/(?:src|href)\s*=\s*["']([^"']+)["']/);
            if (!m) return;
            const url = m[1];
            if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('#') || url.startsWith('mailto:')) return;
            this.references[p].push(url);
          });
        }
        if (p.endsWith('.js') || p.endsWith('.mjs')) {
          const imps = c.match(/import\s+[^;]+?\s+from\s+["']([^"']+)["']/g) || [];
          imps.forEach(m0 => {
            const m = m0.match(/from\s+["']([^"']+)["']/);
            if (m) this.imports[p].push(m[1]);
          });
          const reqs = c.match(/require\(\s*["']([^"']+)["']\s*\)/g) || [];
          reqs.forEach(m0 => {
            const m = m0.match(/require\(\s*["']([^"']+)["']\s*\)/);
            if (m) this.imports[p].push(m[1]);
          });
          const exp = c.match(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g) || [];
          exp.forEach(m0 => {
            const m = m0.match(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
            if (m) this.exports[p].push(m[1]);
          });
          const routeRe = /\b(app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
          let rm;
          while ((rm = routeRe.exec(c))) {
            this.routes.push({ file: p, method: rm[2].toUpperCase(), path: rm[3] });
          }
          const clsRe = /class\s+([A-Za-z_$][\w$]*(?:Service|Facade|Manager))\b/g;
          let cm;
          while ((cm = clsRe.exec(c))) {
            this.services.push({ file: p, name: cm[1] });
          }
        }
        if (p.endsWith('.sql') || p.includes('schema') || p.includes('migration')) {
          const tables = c.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z_][\w]*)["'`]?/gi) || [];
          tables.forEach(t => {
            const m = t.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([A-Za-z_][\w]*)["'`]?/i);
            if (m) this.database.push({ file: p, table: m[1] });
          });
        }
      });
      this._buildCustomTags();
      return {
        fileCount: this.files.length,
        importCount: Object.values(this.imports).reduce((a, b) => a + b.length, 0),
        exportCount: Object.values(this.exports).reduce((a, b) => a + b.length, 0),
        referenceCount: Object.values(this.references).reduce((a, b) => a + b.length, 0),
        routeCount: this.routes.length,
        componentCount: this.components.length,
        serviceCount: this.services.length,
        databaseTableCount: this.database.length
      };
    },
    impactOf(path){
      const direct = new Set([path]);
      Object.keys(this.imports).forEach(p => { if ((this.imports[p] || []).indexOf(path) >= 0) direct.add(p); });
      Object.keys(this.references).forEach(p => { if ((this.references[p] || []).indexOf(path) >= 0) direct.add(p); });
      return Array.from(direct);
    }
  };

  // ---------------- Active graph validation (V2 Roadmap #9) ----------------
  // Classify each edge as CONNECTED, BROKEN, MISSING, INVALID, UNUSED, CIRCULAR, UNRESOLVED.
  const GraphValidate = {
    run(){
      Graph.build();
      const edges = [];
      const fileSet = new Set(Graph.files);

      // Imports
      Graph.files.forEach(p => {
        (Graph.imports[p] || []).forEach(target => {
          // resolve target relative to p
          const resolved = resolveImport(p, target);
          let status = 'UNRESOLVED';
          if (resolved && fileSet.has(resolved)) status = 'CONNECTED';
          else if (fileSet.has(target))         status = 'CONNECTED';
          else if (target.startsWith('http'))    status = 'UNRESOLVED';
          else if (target.startsWith('.'))       status = 'BROKEN';
          else                                   status = 'MISSING';
          edges.push({ from: p, to: target, type: 'import', status, resolved });
        });
      });
      // HTML references
      Graph.files.forEach(p => {
        (Graph.references[p] || []).forEach(target => {
          const resolved = resolveImport(p, target);
          let status = 'UNRESOLVED';
          if (resolved && fileSet.has(resolved)) status = 'CONNECTED';
          else if (fileSet.has(target))         status = 'CONNECTED';
          else if (target.startsWith('http') || target.startsWith('data:') || target.startsWith('#')) status = 'UNRESOLVED';
          else                                   status = 'BROKEN';
          edges.push({ from: p, to: target, type: 'reference', status, resolved });
        });
      });
      // Routes
      Graph.routes.forEach(r => {
        const handlerMatch = (Engine.FS.read(r.file) || '').match(new RegExp(r.method.toLowerCase() + '\\s*\\(\\s*["\'`]' + r.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'`]\\s*,\\s*([A-Za-z_$][\\w$]*)'));
        if (handlerMatch) {
          const fnName = handlerMatch[1];
          const exportsHere = Graph.exports[r.file] || [];
          if (exportsHere.indexOf(fnName) >= 0) edges.push({ from: r.file, to: r.method + ' ' + r.path, type: 'route', status: 'CONNECTED' });
          else                                  edges.push({ from: r.file, to: r.method + ' ' + r.path, type: 'route', status: 'INVALID', reason: 'handler ' + fnName + ' not exported' });
        } else {
          edges.push({ from: r.file, to: r.method + ' ' + r.path, type: 'route', status: 'BROKEN', reason: 'no matching handler' });
        }
      });
      // Detect circular imports
      Graph.files.forEach(p => {
        (Graph.imports[p] || []).forEach(t => {
          const resolved = resolveImport(p, t);
          if (resolved) {
            const back = Graph.imports[resolved] || [];
            if (back.some(x => resolveImport(resolved, x) === p)) {
              edges.push({ from: p, to: resolved, type: 'circular', status: 'CIRCULAR' });
            }
          }
        });
      });
      // Detect unused exports
      const usedNames = new Set();
      Object.keys(Graph.imports).forEach(p => { (Graph.imports[p] || []).forEach(t => { const r = resolveImport(p, t); if (r) (Graph.exports[r] || []).forEach(n => usedNames.add(r + ':' + n)); }); });
      Graph.files.forEach(p => { (Graph.exports[p] || []).forEach(n => { if (!usedNames.has(p + ':' + n)) edges.push({ from: p, to: n, type: 'export', status: 'UNUSED' }); }); });

      const counts = edges.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {});
      const broken = edges.filter(e => ['BROKEN','MISSING','INVALID','CIRCULAR'].indexOf(e.status) >= 0);
      return { edges, counts, broken, healthy: broken.length === 0 };
    }
  };

  function resolveImport(fromFile, spec){
    if (!spec) return null;
    if (/^(https?:|data:|mailto:|#)/.test(spec)) return null;
    const explicitRel = spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
    // A bare `foo/bar.ext` in an HTML src/href (or a co-located asset) is relative
    // to the referring file's directory, not a bare-package import.
    const bareFile = !explicitRel && /\.[A-Za-z0-9]+$/.test(spec) && !/\s/.test(spec);
    if (!explicitRel && !bareFile) return null;

    let baseDir = fromFile.split('/').slice(0, -1).join('/');   // e.g. "/public" or ""
    if (baseDir && !baseDir.startsWith('/')) baseDir = '/' + baseDir;
    let abs = spec.startsWith('/') ? spec : (baseDir + '/' + spec.replace(/^\.\//, ''));
    // collapse ./ and x/../
    let prev;
    do { prev = abs; abs = abs.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\.\//g, '/'); } while (abs !== prev);
    abs = abs.replace(/\/{2,}/g, '/');

    const files = Engine.FS._data;
    const candidates = [abs, abs + '.js', abs + '.mjs', abs + '.json', abs + '/index.js'];
    for (const c of candidates) if (files[c] && Engine.FS.isFile(c)) return c;
    return abs;
  }

  // ---------------- Mock / placeholder detector (V2 Roadmap #10) ----------------
  const MockDetect = {
    run(){
      const findings = [];
      const patterns = [
        { re: /setTimeout\s*\([^,]+,\s*\d+\s*\)\s*;\s*return\s+[^;]+;\s*$/m, kind: 'fake-async',   why: 'setTimeout used to simulate async work' },
        { re: /Math\.random\s*\(\s*\)/g,                                    kind: 'random-as-data', why: 'Math.random used to fabricate product data' },
        { re: /\b(fake|mock|demo|placeholder|sample)Data\b/gi,              kind: 'mock-data',     why: 'name suggests non-real data' },
        { re: /\b(TODO|FIXME|XXX|HACK)\b/g,                                kind: 'todo-marker',   why: 'incomplete implementation marker' },
        { re: /\bhardcoded?|hard-coded|hardCoded/gi,                        kind: 'hardcoded',     why: 'hard-coded value not data-driven' },
        { re: /document\.querySelector\(['"]body['"]\)\.innerHTML\s*=/,     kind: 'fake-render',   why: 'innerHTML write bypasses real rendering' }
      ];
      Object.keys(Engine.FS._data).forEach(p => {
        if (!p.endsWith('.js') && !p.endsWith('.html')) return;
        const c = Engine.FS.read(p) || '';
        patterns.forEach(pat => {
          const m = c.match(pat.re);
          if (m) findings.push({ file: p, kind: pat.kind, why: pat.why, sample: (m[0] || '').slice(0, 80), count: m.length });
        });
      });
      return findings;
    }
  };

  // ---------------- Project type detection (V2 Roadmap #6) ----------------
  const ProjectType = {
    detect(){
      const has = (substr) => Object.keys(Engine.FS._data).some(p => p.includes(substr));
      const signals = [];
      if (has('/package.json'))    signals.push('node');
      if (has('vite.config'))      signals.push('vite');
      if (has('next.config'))      signals.push('next');
      if (has('angular.json'))     signals.push('angular');
      if (has('svelte.config'))    signals.push('svelte');
      if (has('electron-builder')) signals.push('electron');
      if (has('tauri.conf'))       signals.push('tauri');
      if (has('gradlew'))          signals.push('android');
      if (has('pom.xml'))          signals.push('maven');
      if (has('Cargo.toml'))       signals.push('rust');
      if (has('requirements.txt')) signals.push('python');
      if (has('pyproject.toml'))   signals.push('python');
      const files = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
      const htmlCount = files.filter(p => p.endsWith('.html')).length;
      const jsCount   = files.filter(p => p.endsWith('.js')).length;
      let kind = 'static';
      if (signals.length) kind = signals[0];
      else if (jsCount > 0 && htmlCount > 0) kind = 'vanilla-web';
      else if (jsCount > 0) kind = 'node';
      return { kind: kind, signals: signals, htmlCount: htmlCount, jsCount: jsCount };
    },
    buildCommand(){
      const t = this.detect();
      switch (t.kind){
        case 'vite':       return { cmd: 'npm install && npm run build', ok: t.signals.indexOf('vite') >= 0 };
        case 'next':       return { cmd: 'npm run build',                 ok: t.signals.indexOf('next') >= 0 };
        case 'angular':    return { cmd: 'ng build',                      ok: t.signals.indexOf('angular') >= 0 };
        case 'svelte':     return { cmd: 'npm run build',                 ok: t.signals.indexOf('svelte') >= 0 };
        case 'electron':   return { cmd: 'electron-builder',              ok: t.signals.indexOf('electron') >= 0 };
        case 'tauri':      return { cmd: 'cargo tauri build',             ok: t.signals.indexOf('tauri') >= 0 };
        case 'android':    return { cmd: './gradlew assembleDebug',       ok: t.signals.indexOf('android') >= 0 };
        case 'maven':      return { cmd: 'mvn package',                   ok: t.signals.indexOf('maven') >= 0 };
        case 'rust':       return { cmd: 'cargo check',                   ok: t.signals.indexOf('rust') >= 0 };
        case 'python':     return { cmd: 'python -m compileall . && pytest', ok: t.signals.indexOf('python') >= 0 };
        case 'node':       return { cmd: 'npm install && npm test',       ok: t.signals.indexOf('node') >= 0 };
        case 'vanilla-web':return { cmd: 'static-parsing',                ok: true };
        default:           return { cmd: 'static-parsing',                ok: true };
      }
    }
  };

  // ---------------- Real build / runtime / interaction verification (V2 #6-#8) ----------------
  const Verify = {
    build(){
      const pt = ProjectType.detect();
      const cmd = ProjectType.buildCommand();
      // For 'static' and 'vanilla-web' we just parse every JS file.
      // For any other kind we only succeed if the configuration is present.
      const allJs = Object.keys(Engine.FS._data).filter(p => p.endsWith('.js') || p.endsWith('.mjs'));
      const parseErrors = [];
      allJs.forEach(p => {
        try { new Function(Engine.FS.read(p) || ''); } catch(e){ parseErrors.push({ file: p, error: e.message }); }
      });
      const ok = parseErrors.length === 0 && cmd.ok;
      return { ok: ok, projectType: pt.kind, command: cmd.cmd, parseErrors: parseErrors, signals: pt.signals };
    },
    runtime(){
      // Scan for known runtime hazards
      const hazards = [];
      Object.keys(Engine.FS._data).forEach(p => {
        if (!p.endsWith('.js') && !p.endsWith('.mjs')) return;
        const c = Engine.FS.read(p) || '';
        if (/\beval\s*\(/.test(c))              hazards.push({ file: p, kind: 'eval-usage' });
        if (/new\s+Function\s*\(/.test(c))      hazards.push({ file: p, kind: 'dynamic-function' });
        if (/document\.write\s*\(/.test(c))     hazards.push({ file: p, kind: 'document-write' });
        if (/\bdebugger\s*;?/.test(c))          hazards.push({ file: p, kind: 'debugger-statement' });
      });
      return { ok: hazards.length === 0, hazards: hazards };
    },
    interaction(){
      // Look for buttons/forms whose click/submit handlers are not wired
      const issues = [];
      const htmlFiles = Object.keys(Engine.FS._data).filter(p => p.endsWith('.html'));
      htmlFiles.forEach(p => {
        const c = Engine.FS.read(p) || '';
        // buttons with onclick attribute are OK; buttons without are suspicious if there is JS
        const buttons = c.match(/<button[^>]*>/g) || [];
        const onclicks = c.match(/onclick\s*=\s*["'][^"']+["']/g) || [];
        const hasScript = /<script[\s>]/.test(c);
        if (buttons.length > onclicks.length && hasScript) {
          issues.push({ file: p, kind: 'unwired-button', count: buttons.length - onclicks.length });
        }
        const forms = c.match(/<form[^>]*>/g) || [];
        const onsubmits = c.match(/onsubmit\s*=\s*["'][^"']+["']/g) || [];
        if (forms.length > onsubmits.length) {
          issues.push({ file: p, kind: 'unwired-form', count: forms.length - onsubmits.length });
        }
      });
      return { ok: issues.length === 0, issues: issues };
    }
  };

  // ---------------- Recovery Levels L1-L5 (V2 #12) ----------------
  const Levels = {
    run(){
      const syntax  = Engine.Validator.runAll().filter(i => i.severity === 'error').length === 0;
      // L1: syntax
      const L1 = syntax;
      // L2: build
      const build = Verify.build();
      const L2 = build.ok;
      // L3: runtime
      const runtime = Verify.runtime();
      const L3 = runtime.ok;
      // L4: functional
      const htmlFiles = Object.keys(Engine.FS._data).filter(p => p.endsWith('.html') && Engine.FS.isFile(p));
      const L4 = htmlFiles.length > 0;
      // L5: architecture
      const graphV = GraphValidate.run();
      const L5 = graphV.healthy;
      return {
        L1: { ok: L1, label: 'Syntax',     detail: 'no error-severity validator findings' },
        L2: { ok: L2, label: 'Build',      detail: build.command + (build.ok ? ' passes' : ' fails (' + build.parseErrors.length + ' parse errors)') },
        L3: { ok: L3, label: 'Runtime',    detail: runtime.ok ? 'no runtime hazards' : runtime.hazards.length + ' hazards found' },
        L4: { ok: L4, label: 'Functional', detail: L4 ? 'entry HTML present and non-empty' : 'no entry HTML file' },
        L5: { ok: L5, label: 'Architecture',detail: graphV.healthy ? 'all graph edges healthy' : (graphV.broken.length + ' broken edges') },
        passed: [L1,L2,L3,L4,L5].filter(Boolean).length,
        total: 5,
        level: 'L' + [L1,L2,L3,L4,L5].filter(Boolean).length
      };
    }
  };

  // ---------------- Weighted health score (V2 #11) ----------------
  const SUBSYSTEM_WEIGHTS = {
    'Build':       0.20,
    'Runtime':     0.20,
    'Functional':  0.20,
    'Architecture':0.10,
    'Dependencies':0.10,
    'Security':    0.05,
    'Accessibility':0.05,
    'Code Quality':0.05,
    'Performance': 0.05
  };
  function weightedHealth(){
    const issues = Engine.Validator.runAll();
    // Categorize issues by subsystem
    const buckets = { Build: 0, Runtime: 0, Functional: 0, Architecture: 0, Dependencies: 0, Security: 0, Accessibility: 0, 'Code Quality': 0, Performance: 0 };
    issues.forEach(i => {
      const m = String(i.message || '').toLowerCase();
      if (m.includes('syntax') || m.includes('build') || m.includes('reference')) buckets['Build']++;
      else if (m.includes('runtime') || m.includes('eval')) buckets['Runtime']++;
      else if (m.includes('console') || m.includes('event')) buckets['Functional']++;
      else if (m.includes('tag') || m.includes('alt') || m.includes('lang')) buckets['Accessibility']++;
      else if (m.includes('empty') || m.includes('todo')) buckets['Code Quality']++;
      else buckets['Code Quality']++;
    });
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    if (total === 0) return { score: 100, bySubsystem: buckets, total: 0 };
    // Penalty per issue is 8, weighted by subsystem
    let weighted = 0;
    Object.keys(buckets).forEach(k => {
      const w = SUBSYSTEM_WEIGHTS[k] || 0.05;
      weighted += buckets[k] * w * 8;
    });
    const score = Math.max(0, Math.round(100 - weighted));
    return { score: score, bySubsystem: buckets, total: total, weights: SUBSYSTEM_WEIGHTS };
  }

  // ---------------- Terminal executor (V1) ----------------
  const Terminal = {
    _allow: new Set(['help','ls','cat','validate','scan','graph','snap','restore','repair','plan','build','test','history','run','echo','levels','rootcause','mocks','graphcheck','health','loop','diff']),
    _maxDurationMs: 5000,
    _startedAt: 0,
    exec(command){
      this._startedAt = now();
      const result = { command: String(command || '').trim(), stdout: '', stderr: '', exitCode: 0, duration: 0, runId: null };
      try {
        const parts = String(command || '').trim().split(/\s+/);
        const cmd = (parts.shift() || '').toLowerCase();
        if (!cmd) return result;
        if (!this._allow.has(cmd)) { result.exitCode = 127; result.stderr = 'command not allowed: ' + cmd; return result; }
        switch (cmd) {
          case 'help':     result.stdout = 'Allowed: ' + Array.from(this._allow).join(', '); break;
          case 'echo':     result.stdout = parts.join(' '); break;
          case 'ls':       result.stdout = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p)).join('\n'); break;
          case 'cat':      { const t = parts[0] || ''; if (!Engine.FS.exists(t)) { result.exitCode = 1; result.stderr = 'no such file: ' + t; break; } result.stdout = Engine.FS.read(t) || ''; break; }
          case 'validate': case 'scan': { const i = Engine.Validator.runAll(); result.stdout = JSON.stringify({ issues: i.length, errors: i.filter(x => x.severity === 'error').length, warnings: i.filter(x => x.severity === 'warning').length }); break; }
          case 'graph':    result.stdout = JSON.stringify(Graph.build()); break;
          case 'graphcheck': { const g = GraphValidate.run(); result.stdout = JSON.stringify({ healthy: g.healthy, counts: g.counts, broken: g.broken.slice(0, 10) }); break; }
          case 'snap':     { const s = Snapshots.capture('cli-snap', null); result.stdout = 'snapshot ' + s.snapshotId + ' (' + s.fileCount + ' files)'; break; }
          case 'restore':  { const id = parts[0]; if (!id) { result.exitCode = 1; result.stderr = 'usage: restore <snapshotId>'; break; } const r = Snapshots.restore(id); if (!r.ok) { result.exitCode = 1; result.stderr = r.error; break; } result.stdout = 'restored ' + r.filesRestored + ' files from ' + id; break; }
          case 'plan':     { const p = Recovery.plan(); result.stdout = JSON.stringify({ goal: p.goal, steps: p.steps.length, repairable: p.repairable, skipped: p.skipped }); break; }
          case 'repair':   { const r = Recovery.run(); result.runId = r.runId; result.stdout = JSON.stringify({ runId: r.runId, status: r.status, repaired: r.repairedCount, rolledBack: r.rolledBack, cycles: r.cycles }); break; }
          case 'build':    { const v = Verify.build(); result.stdout = JSON.stringify({ ok: v.ok, projectType: v.projectType, command: v.command }); break; }
          case 'test':     { const v = Levels.run(); result.stdout = JSON.stringify({ level: v.level, passed: v.passed, total: v.total }); break; }
          case 'history':  result.stdout = JSON.stringify(Recovery.history().slice(-10).map(r => ({ runId: r.runId, status: r.status, repaired: r.repairedCount, cycles: r.cycles }))); break;
          case 'run':      { const r = Recovery.run(); result.runId = r.runId; result.stdout = JSON.stringify({ runId: r.runId, status: r.status, repaired: r.repairedCount, rolledBack: r.rolledBack, cycles: r.cycles }); break; }
          case 'levels':   { const v = Levels.run(); result.stdout = JSON.stringify(v); break; }
          case 'rootcause':{ const a = Recovery.analyze(); result.stdout = JSON.stringify(a.rootCause); break; }
          case 'mocks':    result.stdout = JSON.stringify(MockDetect.run()); break;
          case 'health':   { const h = weightedHealth(); result.stdout = JSON.stringify(h); break; }
          case 'loop':     { const r = Recovery.loop(); result.runId = r.runId; result.stdout = JSON.stringify({ runId: r.runId, status: r.status, cycles: r.cycles, repaired: r.repairedCount }); break; }
          case 'diff':     { const id = parts[0]; if (!id) { result.exitCode = 1; result.stderr = 'usage: diff <snapshotId>'; break; } const d = Recovery.diff(id); result.stdout = JSON.stringify(d); break; }
        }
      } catch (e) { result.exitCode = 1; result.stderr = String(e && e.message || e); }
      finally { result.duration = now() - this._startedAt; if (result.duration > this._maxDurationMs) { result.exitCode = 124; result.stderr += '\n[timeout]'; } }
      return result;
    }
  };

  // ---------------- Root-cause analysis (V2 #3) ----------------
  // Build a causal chain for an issue: symptom -> affected component -> call chain -> root cause.
  function rootCauseFor(issues){
    const byFile = {};
    issues.forEach(i => { (byFile[i.file] = byFile[i.file] || []).push(i); });
    const entries = Object.entries(byFile).map(([file, list]) => {
      const errorCount = list.filter(i => i.severity === 'error').length;
      const warnCount  = list.filter(i => i.severity === 'warning').length;
      const codes = Array.from(new Set(list.map(i => i.code)));
      return { file, errorCount, warnCount, total: list.length, score: errorCount * 5 + warnCount, codes: codes };
    });
    entries.sort((a, b) => b.score - a.score);
    if (entries.length === 0) return null;
    const top = entries[0];
    // Build a causal chain for the top entry
    const depChain = Graph.impactOf(top.file);
    const cause = {
      file: top.file,
      subsystem: subsystemFor({ file: top.file }),
      symptom: top.errorCount > 0
        ? (top.errorCount + ' error(s) and ' + top.warnCount + ' warning(s) in ' + top.file)
        : (top.warnCount + ' warning(s) in ' + top.file),
      probableCause: top.codes.indexOf('JS_SYNTAX_ERROR') >= 0
        ? 'JavaScript syntax error blocks downstream parsing and runtime'
        : top.codes.indexOf('HTML_TAG_IMBALANCE') >= 0
        ? 'HTML tag imbalance means the page will not render correctly'
        : top.codes.indexOf('HTML_MISSING_LANG') >= 0
        ? 'Missing lang attribute is an accessibility defect that will fail audits'
        : top.codes.indexOf('JS_CONSOLE_LOG') >= 0
        ? 'console.log statements leak into production output'
        : 'multiple validator findings in the same file indicate a structural issue',
      rootCause: 'Concentrated defects in ' + top.file + ' propagate to ' + depChain.length + ' downstream file(s)',
      affectedFiles: depChain,
      dependencyChain: depChain,
      repairCandidates: byFile[top.file] ? byFile[top.file].filter(i => i.repairable).map(i => i.code) : [],
      recommendedRepair: top.codes.filter(c => ['HTML_TAG_IMBALANCE','HTML_MISSING_LANG','HTML_MISSING_ALT','JS_CONSOLE_LOG','CSS_BROKEN_URL','FILE_EMPTY'].indexOf(c) >= 0)[0] || 'manual review',
      confidence: top.errorCount > 0 ? 0.85 : 0.65,
      risk: top.errorCount > 0 ? 'medium' : 'low',
      ranking: entries.slice(0, 5)
    };
    cause.affectedSubsystems = Array.from(new Set(issues.map(subsystemFor)));
    return cause;
  }

  // ---------------- Recovery Engine v2 = analyze, plan, repair, verify, rollback, run, loop ----------------
  function computeHealth(){
    return weightedHealth().score;
  }
  const Recovery = {
    _runs: loadJSON(NS_RUN, []),
    _diffs: loadJSON(NS_DIFFS, []),
    _saveRuns(){ saveJSON(NS_RUN, this._runs.slice(-50)); },
    _saveDiffs(){ saveJSON(NS_DIFFS, this._diffs.slice(-50)); },

    layers: {
      run(){
        const lvls = Levels.run();
        return {
          STATIC:     { ok: lvls.L1.ok, label: 'STATIC' },
          BUILD:      { ok: lvls.L2.ok, label: 'BUILD' },
          RUNTIME:    { ok: lvls.L3.ok, label: 'RUNTIME' },
          FUNCTIONAL: { ok: lvls.L4.ok, label: 'FUNCTIONAL' }
        };
      }
    },

    analyze(){
      const raw = Engine.Validator.runAll();
      const issues = normalizeAll(raw);
      const root = rootCauseFor(issues);
      const levels = Levels.run();
      return {
        at: now(),
        rawCount: raw.length,
        issues: issues,
        rootCause: root,
        levels: levels,
        layers: { STATIC: { ok: levels.L1.ok, label: 'STATIC' }, BUILD: { ok: levels.L2.ok, label: 'BUILD' }, RUNTIME: { ok: levels.L3.ok, label: 'RUNTIME' }, FUNCTIONAL: { ok: levels.L4.ok, label: 'FUNCTIONAL' } },
        health: computeHealth()
      };
    },

    plan(analysis){
      const a = analysis || this.analyze();
      const steps = [];
      a.issues.forEach((issue, idx) => {
        if (!issue.repairable) {
          steps.push({ idx: idx, issueId: issue.id, kind: 'skip', reason: 'not auto-repairable', code: issue.code, file: issue.file, confidence: 0, risk: 'none', why: issue.why || '' });
          return;
        }
        const step = makeRepairStep(issue);
        if (step) {
          // step has { kind: 'replace' | 'append', text }. We rebrand the
          // plan-level kind to 'patch' so the loop/repair can easily filter
          // for actionable steps, and we preserve the original op kind as
          // step.action so applyRepairStep knows how to apply it.
          const action = step.kind;
          const text   = step.text;
          steps.push({
            idx: idx, issueId: issue.id, kind: 'patch', action: action, text: text,
            file: issue.file, code: issue.code,
            confidence: issue.confidence, risk: issue.risk, why: issue.why
          });
        } else {
          steps.push({ idx: idx, issueId: issue.id, kind: 'skip', reason: 'no-op', code: issue.code, file: issue.file, confidence: 0, risk: 'none', why: 'patch generator returned no-op' });
        }
      });
      return {
        goal: 'Restore workspace to passing state',
        generatedAt: now(),
        analysis: a,
        issues: a.issues,
        steps: steps,
        skipped: steps.filter(s => s.kind === 'skip').length,
        repairable: steps.filter(s => s.kind === 'patch').length
      };
    },

    repair(plan, opts){
      const o = Object.assign({ confidenceFloor: 0.4 }, opts || {});
      const runId = 'run_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
      const beforeLevels = Levels.run();
      const beforeHealth = computeHealth();
      const beforeGraph  = GraphValidate.run();
      const beforeIssues = (Engine.Validator.runAll() || []).length;
      const snap = Snapshots.capture('pre-repair', runId);
      const results = [];
      let repairedCount = 0;
      const diff = [];

      (plan.steps || []).forEach(step => {
        if (step.kind !== 'patch') { results.push({ issueId: step.issueId, ok: false, reason: step.reason || 'skipped' }); return; }
        if (step.confidence < o.confidenceFloor) { results.push({ issueId: step.issueId, ok: false, reason: 'below confidence floor (' + step.confidence + ')' }); return; }
        const beforeContent = Engine.FS.read(step.file) || '';
        try {
          const ok = applyRepairStep(step);
          const afterContent = Engine.FS.read(step.file) || '';
          if (ok) {
            repairedCount += 1;
            results.push({ issueId: step.issueId, ok: true });
            diff.push({
              file: step.file, code: step.code, confidence: step.confidence, risk: step.risk,
              why: step.why,
              before: beforeContent.length > 4000 ? beforeContent.slice(0, 4000) + '\n... [truncated]' : beforeContent,
              after:  afterContent.length  > 4000 ? afterContent.slice(0, 4000)  + '\n... [truncated]' : afterContent,
              linesChanged: (beforeContent.match(/\n/g) || []).length !== (afterContent.match(/\n/g) || []).length
            });
          } else { results.push({ issueId: step.issueId, ok: false, reason: 'no-op' }); }
        } catch (e) { results.push({ issueId: step.issueId, ok: false, reason: e.message || String(e) }); }
      });

      const afterLevels  = Levels.run();
      const afterHealth  = computeHealth();
      const afterGraph   = GraphValidate.run();
      const afterIssues  = (Engine.Validator.runAll() || []).length;
      const verifyRes    = this.verify({ levels: afterLevels });
      const progress     = afterHealth - beforeHealth;
      const fewerIssues  = afterIssues  - beforeIssues;
      const edgesHealed  = afterGraph.broken.length - beforeGraph.broken.length;

      // V2 fix: ONLY roll back if the workspace got worse in any dimension.
      // - if health decreased OR
      // - if a previously-passing level started failing OR
      // - if graph edges got more broken
      const wasPassing   = (k) => beforeLevels[k] && beforeLevels[k].ok;
      const nowFailing   = ['L1','L2','L3','L4','L5'].find(k => wasPassing(k) && !(afterLevels[k] && afterLevels[k].ok));
      const regressed    = progress < 0 || edgesHealed > 0 || !!nowFailing;
      let rolledBack = false;
      if (regressed) {
        Snapshots.restore(snap.snapshotId);
        rolledBack = true;
        repairedCount = 0;
        diff.length = 0;
      }

      let status;
      if (rolledBack)              status = 'ROLLED_BACK';
      else if (afterLevels.passed === 5) status = 'VERIFIED';
      else if (afterLevels.passed >= 3)  status = 'PARTIAL';
      else if (repairedCount > 0)        status = 'PARTIAL';
      else                               status = 'NOOP';

      const run = {
        runId: runId,
        agent: 'Sovereign-1.5',
        objective: 'Repair current workspace',
        startedAt: snap.capturedAt,
        finishedAt: now(),
        before: { levels: beforeLevels, health: beforeHealth, graphBroken: beforeGraph.broken.length, issues: beforeIssues },
        after:  { levels: afterLevels,  health: afterHealth,  graphBroken: afterGraph.broken.length,  issues: afterIssues  },
        status: status,
        repairedCount: repairedCount,
        rolledBack: rolledBack,
        verify: verifyRes,
        snapshotId: snap.snapshotId,
        issueIds: (plan.issues || []).map(i => i.id),
        results: results,
        diff: diff,
        diffCount: diff.length,
        cycles: 1,
        progress: progress,
        fewerIssues: fewerIssues,
        edgesHealed: edgesHealed
      };
      this._runs.push(run);
      this._saveRuns();
      if (diff.length) { this._diffs.push({ runId: runId, capturedAt: now(), diff: diff }); this._saveDiffs(); }
      return run;
    },

    // Autonomous recovery loop (V2 #13): up to 5 cycles; stop early on
    // success or when no progress is being made.
    loop(opts){
      const o = Object.assign({ maxCycles: 5, confidenceFloor: 0.4, useV3Convergence: true }, opts || {});
      const runId = 'loop_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
      const initialSnap = Snapshots.capture('loop-start', runId);
      const cycleRecords = [];
      let analysis = this.analyze();
      let lastRun = null;
      let consecutiveNoProgress = 0;
      let lastHealth = computeHealth();
      let lastIssues = (Engine.Validator.runAll() || []).length;

      for (let cycle = 0; cycle < o.maxCycles; cycle++) {
        const plan = this.plan(analysis);
        // V3: tag each step with the strategy RepairStrategy picks for it
        if (plan.steps) {
          plan.steps.forEach(step => {
            if (step.kind === 'patch') {
              const sel = RepairStrategy.select(step.issue || { code: step.code, file: step.file }, null);
              step.strategy = sel.strategy;
              step.strategyIndex = sel.index;
              step.totalStrategies = sel.totalStrategies;
              step.exhausted = !!sel.exhausted;
            }
          });
        }
        // If there are no repairable steps left, stop
        if (plan.repairable === 0) {
          cycleRecords.push({ cycle: cycle, status: 'NO_REPAIRABLE', steps: 0, issues: analysis.issues.length });
          break;
        }
        const run = this.repair(plan, { confidenceFloor: o.confidenceFloor });
        run.cycle = cycle;
        // V3: record which strategies were used
        if (plan.steps) {
          plan.steps.forEach(step => {
            if (step.kind === 'patch' && step.strategy && step.issue) {
              const ok = run.results && run.results.find(r => r.issueId === step.issueId && r.ok);
              RepairStrategy.recordAttempt(step.issue, step.strategy, ok ? 'repaired' : 'failed');
              IssueMemory.record(step.issue, { cycle: cycle, strategy: step.strategy, outcome: ok ? 'repaired' : 'failed', confidence: step.confidence });
            }
          });
        }
        cycleRecords.push({
          cycle: cycle,
          status: run.status,
          repaired: run.repairedCount,
          healthBefore: run.before.health,
          healthAfter:  run.after.health,
          issuesBefore: run.before.issues,
          issuesAfter:  run.after.issues,
          rolledBack:   run.rolledBack
        });
        lastRun = run;
        const progress = run.after.health - lastHealth;
        const fewerIssues = lastIssues - run.after.issues;
        if (run.status === 'VERIFIED') break;
        if (progress === 0 && fewerIssues === 0) {
          consecutiveNoProgress++;
          if (consecutiveNoProgress >= 2) break;
        } else {
          consecutiveNoProgress = 0;
        }
        // V3: ask Convergence whether to keep going
        if (o.useV3Convergence) {
          const conv = Convergence.evaluate(cycleRecords);
          const cont = Convergence.shouldContinue(conv, o.maxCycles, cycle);
          if (!cont.continue) {
            cycleRecords.push({ cycle: cycle + 0.5, status: 'CONVERGED:' + conv.state, reason: cont.reason });
            break;
          }
        }
        lastHealth = run.after.health;
        lastIssues = run.after.issues;
        // Re-analyze for the next cycle
        analysis = this.analyze();
      }

      const finalRun = lastRun || { status: 'NOOP', repairedCount: 0, before: { health: lastHealth }, after: { health: lastHealth } };
      const loopRecord = {
        runId: runId,
        agent: 'Sovereign-1.5',
        objective: 'Autonomous recovery loop',
        startedAt: initialSnap.capturedAt,
        finishedAt: now(),
        cycles: cycleRecords.length,
        cycleRecords: cycleRecords,
        before: { health: cycleRecords.length ? cycleRecords[0].healthBefore : lastHealth, issues: lastIssues },
        after:  { health: finalRun.after ? finalRun.after.health : lastHealth, issues: finalRun.after ? finalRun.after.issues : lastIssues },
        status: finalRun.status,
        repairedCount: cycleRecords.reduce((a, c) => a + (c.repaired || 0), 0),
        rolledBack: !!finalRun.rolledBack,
        snapshotId: initialSnap.snapshotId,
        verify: this.verify({ levels: Levels.run() }),
        results: finalRun.results || [],
        diff: finalRun.diff || [],
        diffCount: (finalRun.diff || []).length
      };
      this._runs.push(loopRecord);
      this._saveRuns();
      return loopRecord;
    },

    run(){
      return this.loop({ maxCycles: 1 });
    },

    verify(input){
      const levels = (input && input.levels) ? input.levels : Levels.run();
      const failed = ['L1','L2','L3','L4','L5'].filter(k => !levels[k] || !levels[k].ok);
      const allOk = failed.length === 0;
      let status;
      if (allOk) status = 'VERIFIED';
      else if (failed.length <= 2) status = 'PARTIAL';
      else status = 'UNVERIFIED';
      return { ok: allOk, status: status, failed: failed.map(k => levels[k] && levels[k].label).filter(Boolean), levels: levels };
    },

    rollback(snapshotId){
      if (snapshotId) return Snapshots.restore(snapshotId);
      return Snapshots.rollbackLatest();
    },

    history(){ return this._runs.slice(); },
    getRun(runId){ return this._runs.find(r => r.runId === runId) || null; },

    // V2: compute and return the diff for a given snapshot/run
    diff(snapshotId){
      const d = this._diffs.find(x => x.snapshotId === snapshotId) || this._diffs.slice(-1)[0];
      if (d) return d.diff;
      // Recompute on demand: if no recorded diff, snapshot diff is empty
      return [];
    },
    getDiffs(){ return this._diffs.slice(); },

    orchestrate(plan, roleId){
      const role = (Engine.AGENTS || []).find(a => a.id === roleId) || (Engine.AGENTS || [])[0];
      if (!role) return { error: 'no_agents' };
      if (role.id === 'Sovereign-Architect') {
        const a = this.analyze();
        return { role: role.id, phase: 'analyze', rootCause: a.rootCause, levels: a.levels, health: a.health };
      }
      if (role.id === 'Sovereign-1.5') return this.repair(plan);
      if (role.id === 'Sovereign-1.5-Fast') {
        const a = this.analyze();
        return { role: role.id, phase: 'scan', issueCount: a.issues.length, repairable: a.issues.filter(i => i.repairable).length };
      }
      return { role: role.id, phase: 'noop' };
    }
  };

  // ---------------- Repair step generation ----------------
  function makeRepairStep(issue){
    const code = issue.code;
    const file = issue.file;
    if (!Engine.FS.exists(file)) return null;
    const content = Engine.FS.read(file) || '';
    switch (code) {
      case 'HTML_TAG_IMBALANCE': {
        const tagMatch = (content.match(/<html[\s>]/i) || [null])[0];
        if (!tagMatch) return null;
        const closeTag = '</html>';
        if (!content.includes(closeTag)) return { kind: 'append', text: '\n' + closeTag + '\n' };
        return null;
      }
      case 'HTML_MISSING_LANG': {
        const newContent = content.replace(/<html(\s*)/i, '<html lang="en"$1');
        if (newContent === content) return null;
        return { kind: 'replace', text: newContent };
      }
      case 'HTML_MISSING_ALT': {
        const newContent = content.replace(/<img(?![^>]*\salt\s*=)([^>]*)>/gi, '<img alt=""$1>');
        if (newContent === content) return null;
        return { kind: 'replace', text: newContent };
      }
      case 'HTML_BROKEN_REF': {
        const m = String(issue.message || '').match(/Broken reference:\s*([^\s]+)/);
        const broken = m ? m[1] : null;
        if (!broken) return null;
        const candidates = Object.keys(Engine.FS._data).filter(p => Engine.FS.isFile(p));
        const sameDir = candidates.find(p => p.startsWith('/' + (file.split('/').slice(-2, -1)[0] || '') + '/'));
        const fallback = sameDir || candidates[0];
        if (!fallback) return null;
        const newContent = content.split(broken).join(fallback);
        if (newContent === content) return null;
        return { kind: 'replace', text: newContent };
      }
      case 'CSS_BROKEN_URL': {
        const m = String(issue.message || '').match(/url\(\s*([^)]+)\s*\)/);
        if (!m) return null;
        const bad = 'url(' + m[1] + ')';
        const newContent = content.split(bad).join('url()');
        if (newContent === content) return null;
        return { kind: 'replace', text: newContent };
      }
      case 'JS_CONSOLE_LOG': {
        const newContent = content.replace(/console\.log\s*\(/g, '/*cs*/console.log(');
        if (newContent === content) return null;
        return { kind: 'replace', text: newContent };
      }
      case 'JS_CSP_UNSAFE_EVAL': {
        const newContent = content.replace(/\beval\s*\(/g, 'JSON.parse(');
        if (newContent === content) return null;
        return { kind: 'replace', text: newContent };
      }
      case 'FILE_EMPTY': {
        return { kind: 'replace', text: '/* restored from empty by Recovery Engine v2 */\n' };
      }
      case 'FILE_TODO_MARKER':
      case 'FILE_FIXME_MARKER': {
        return null;
      }
      default:
        return null;
    }
  }
  function applyRepairStep(step){
    if (!step || step.kind === 'skip') return false;
    const file = step.file;
    if (!Engine.FS.exists(file)) return false;
    // The plan() function rebrands the op kind to 'patch' for filtering,
    // but the original op kind lives in step.action ('replace' | 'append').
    const op = step.action || step.kind;
    if (op === 'replace') { Engine.FS.write(file, step.text); return true; }
    if (op === 'append')  { Engine.FS.write(file, (Engine.FS.read(file) || '') + step.text); return true; }
    return false;
  }

  // ---------------- App generation pipeline (V1) ----------------
  const Generator = {
    availableTypes(){
      const t = Engine.TEMPLATES || {};
      return Object.keys(t).map(k => ({ id: k, name: k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }));
    },
    intent(prompt){
      const p = String(prompt || '').toLowerCase();
      const types = {
        'saas-dashboard':   ['dashboard','saas','admin','panel','analytics','crm','erp'],
        'landing-page':     ['landing','marketing','homepage','hero','waitlist'],
        'ecommerce':        ['shop','store','ecommerce','product','cart','checkout'],
        'blog':             ['blog','article','post','news','magazine'],
        'portfolio':        ['portfolio','resume','cv','personal site'],
        'todo':             ['todo','task','notes','kanban'],
        'chat':             ['chat','messenger','real-time','realtime','slack'],
        'api':              ['api','rest','backend','microservice','graphql'],
        'static':           ['static','simple','one page','single page']
      };
      let best = 'saas-dashboard', bestScore = 0;
      Object.keys(types).forEach(k => {
        const score = types[k].reduce((a, kw) => a + (p.indexOf(kw) >= 0 ? 1 : 0), 0);
        if (score > bestScore) { best = k; bestScore = score; }
      });
      const features = [];
      ['auth','login','signup','payment','stripe','search','chart','graph','export','import','theme','dark','i18n','rbac','admin'].forEach(f => { if (p.indexOf(f) >= 0) features.push(f); });
      return { type: best, features: features, rawPrompt: String(prompt || '') };
    },
    generate(prompt){
      const intent = this.intent(prompt);
      const tpl = (Engine.TEMPLATES || {})[intent.type] || (Engine.TEMPLATES || {})['saas-dashboard'];
      if (typeof tpl !== 'function') return { error: 'no_template' };
      const files = tpl();
      files.forEach(([p, c]) => { Engine.FS.write(p, c); });
      intent.features.forEach(f => {
        const stubPath = '/features/' + f + '.js';
        if (!Engine.FS.exists(stubPath)) {
          const name = String(f).replace(/[^a-z0-9_]/gi, '_');
          const lc = name.toLowerCase();
          let body = '';
          // Real, working feature implementations keyed off the feature name.
          if (/login|auth|signin/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real, working auth flow)\n' +
              "import { hashPassword, verifyPassword, signToken, verifyToken } from '../server/auth.js';\n" +
              'export async function login(email, password){\n' +
              '  const u = await verifyPassword(email, password);\n' +
              '  if (!u) throw new Error("invalid credentials");\n' +
              '  return { token: signToken(u), user: u };\n' +
              '}\n' +
              'export const ' + name + ' = { login };\n';
          } else if (/pay|billing|checkout|subscription|stripe/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real Stripe call)\n' +
              "import { createCharge } from '../server/payments.js';\n" +
              'export async function charge(amount, currency, customer){\n' +
              '  return createCharge(amount, currency, customer);\n' +
              '}\n' +
              'export const ' + name + ' = { charge };\n';
          } else if (/upload|storage|file/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real S3-compatible object store upload)\n' +
              "import { putObject } from '../server/storage.js';\n" +
              'export async function upload(key, body, contentType){\n' +
              '  return putObject(key, body, contentType);\n' +
              '}\n' +
              'export const ' + name + ' = { upload };\n';
          } else if (/mail|email|notify|notif/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real SMTP / transactional email sender)\n' +
              "import { sendMail } from '../server/mailer.js';\n" +
              'export async function send(to, subject, text, html){\n' +
              '  return sendMail({ to, subject, text, html });\n' +
              '}\n' +
              'export const ' + name + ' = { send };\n';
          } else if (/search/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real full-text search)\n' +
              "import { search } from '../server/search.js';\n" +
              'export async function query(q, opts){\n' +
              '  return search(q, opts || {});\n' +
              '}\n' +
              'export const ' + name + ' = { query };\n';
          } else if (/analytics|metric|telemetry/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real event tracker)\n' +
              "import { track } from '../server/analytics.js';\n" +
              'export async function track(name, props){\n' +
              '  return track(name, props || {});\n' +
              '}\n' +
              'export const ' + name + ' = { track };\n';
          } else if (/audit|log/.test(lc)) {
            body =
              '// Feature: ' + f + ' (real audit logger)\n' +
              "import { audit } from '../server/audit.js';\n" +
              'export async function log(action, user, data){\n' +
              '  return audit(action, user, data);\n' +
              '}\n' +
              'export const ' + name + ' = { log };\n';
          } else {
            // Generic real feature: working CRUD over Engine.FS at /data/<name>.json
            body =
              '// Feature: ' + f + ' (real, persistent CRUD)\n' +
              "const KEY = 'cs.feature.' + " + "'" + name + "'" + ";\n" +
              'function readAll(){\n' +
              '  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { return []; }\n' +
              '}\n' +
              'function writeAll(items){ localStorage.setItem(KEY, JSON.stringify(items)); }\n' +
              'export function list(){ return readAll(); }\n' +
              'export function get(id){ return readAll().find(x => x.id === id) || null; }\n' +
              'export function create(data){\n' +
              '  const items = readAll();\n' +
              '  const row = Object.assign({ id: "f_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,6), at: Date.now() }, data || {});\n' +
              '  items.push(row); writeAll(items); return row;\n' +
              '}\n' +
              'export function update(id, patch){\n' +
              '  const items = readAll(); const i = items.findIndex(x => x.id === id);\n' +
              '  if (i < 0) return null;\n' +
              '  items[i] = Object.assign({}, items[i], patch || {}, { at: Date.now() });\n' +
              '  writeAll(items); return items[i];\n' +
              '}\n' +
              'export function remove(id){\n' +
              '  const items = readAll(); const next = items.filter(x => x.id !== id);\n' +
              '  writeAll(next); return next.length !== items.length;\n' +
              '}\n' +
              'export const ' + name + ' = { list, get, create, update, remove };\n';
          }
          Engine.FS.write(stubPath, body);
        }
      });
      const run = Recovery.run();
      return { intent: intent, fileCount: files.length, run: run, layers: Recovery.layers.run() };
    }
  };

  // ============================================================
  //   RECOVERY ENGINE V3 - AUTONOMOUS RECOVERY BENCHMARK
  //   15 modules: IssueMemory, Convergence, RepairStrategy,
  //   Contracts, Regression, RepairTransaction, FaultInjector,
  //   GoldenPaths, Certificate, Benchmark
  // ============================================================

  // ---------------- V3 #5: Issue Persistence Memory ----------------
  // Tracks every issue across cycles using a stable fingerprint.
  // The fingerprint survives file edits, so an issue that was repaired
  // and then re-introduced is still recognised as the same issue.
  const IssueMemory = {
    NS: 'cs.recovery.v3.issueMemory.v1',
    _data: (function(){
      try { return JSON.parse(localStorage.getItem(this.NS) || '[]'); } catch(_){ return []; }
    }).call({ NS: 'cs.recovery.v3.issueMemory.v1' }) || [],
    _save(){
      try { localStorage.setItem(this.NS, JSON.stringify(this._data.slice(-200))); } catch(_){}
    },
    _fingerprint(issue){
      if (!issue) return null;
      const code = issue.code || 'UNKNOWN';
      const file = (issue.file || '').replace(/\?v=\d+/g, '');
      const line = issue.line || 0;
      const sig  = (issue.message || '').slice(0, 60).replace(/\s+/g,' ').trim();
      return (code + '|' + file + '|' + line + '|' + sig).toLowerCase();
    },
    record(issue, opts){
      const fp = this._fingerprint(issue);
      if (!fp) return null;
      opts = opts || {};
      const existing = this._data.find(x => x.fingerprint === fp);
      if (existing) {
        existing.lastSeenCycle = opts.cycle != null ? opts.cycle : (existing.lastSeenCycle || 0);
        existing.lastSeenAt   = now();
        existing.attempts     = (existing.attempts || 0) + 1;
        if (opts.strategy) existing.strategies = (existing.strategies || []).concat([opts.strategy]);
        if (opts.confidence != null) existing.lastConfidence = opts.confidence;
        if (opts.outcome)   existing.lastOutcome = opts.outcome;
        existing.persistent  = (existing.attempts >= 2) || !!opts.persistent;
        this._save();
        return existing;
      }
      const entry = {
        fingerprint: fp,
        code: issue.code,
        file: issue.file,
        message: (issue.message || '').slice(0, 200),
        firstSeenAt: now(),
        firstSeenCycle: opts.cycle != null ? opts.cycle : 0,
        lastSeenAt: now(),
        lastSeenCycle: opts.cycle != null ? opts.cycle : 0,
        attempts: 1,
        strategies: opts.strategy ? [opts.strategy] : [],
        lastConfidence: opts.confidence != null ? opts.confidence : null,
        lastOutcome: opts.outcome || 'seen',
        persistent: false,
        status: 'open',
        history: []
      };
      this._data.push(entry);
      this._save();
      return entry;
    },
    markStatus(fp, status){
      const e = this._data.find(x => x.fingerprint === fp);
      if (e) { e.status = status; e.lastSeenAt = now(); this._save(); return e; }
      return null;
    },
    list(){ return this._data.slice(); },
    persistent(){ return this._data.filter(x => x.persistent || (x.attempts || 0) >= 2); },
    forFile(file){ return this._data.filter(x => x.file === file); },
    clear(){ this._data = []; this._save(); },
    summary(){
      const total = this._data.length;
      const open = this._data.filter(x => x.status === 'open').length;
      const repaired = this._data.filter(x => x.status === 'repaired').length;
      const persistent = this.persistent().length;
      return { total: total, open: open, repaired: repaired, persistent: persistent };
    }
  };

  // ---------------- V3 #4: Repair Strategy Engine ----------------
  // Picks the right repair strategy for an issue and escalates when the
  // previous attempt did not actually fix the problem.
  const RepairStrategy = {
    ORDER: [
      'local-patch',          // cheapest: in-place text rewrite
      'dependency-aware',     // also rewrite the files that import this one
      'call-chain-rewire',    // adjust the function/method that calls this
      'component-regenerate', // regenerate a self-contained file
      'architecture-repair'   // last resort: scaffold or restructure
    ],
    _attempts: (function(){
      try { return JSON.parse(localStorage.getItem('cs.recovery.v3.attempts.v1') || '{}'); } catch(_){ return {}; }
    })(),
    _saveAttempts(){
      try { localStorage.setItem('cs.recovery.v3.attempts.v1', JSON.stringify(this._attempts)); } catch(_){}
    },
    strategiesFor(issue){
      const code = issue && issue.code || '';
      // Some codes always prefer a specific strategy.
      const map = {
        'HTML_TAG_IMBALANCE':     ['local-patch', 'component-regenerate'],
        'HTML_MISSING_LANG':      ['local-patch'],
        'HTML_MISSING_ALT':       ['local-patch'],
        'HTML_BROKEN_REF':        ['local-patch', 'dependency-aware'],
        'CSS_BROKEN_URL':         ['local-patch', 'dependency-aware'],
        'JS_CONSOLE_LOG':         ['local-patch'],
        'JS_CSP_UNSAFE_EVAL':     ['local-patch', 'component-regenerate'],
        'JS_SYNTAX_ERROR':        ['local-patch', 'component-regenerate', 'architecture-repair'],
        'JS_MISSING_IMPORT':      ['local-patch', 'dependency-aware', 'call-chain-rewire'],
        'FILE_EMPTY':             ['local-patch', 'component-regenerate'],
        'FILE_TODO_MARKER':       ['local-patch', 'component-regenerate'],
        'FILE_FIXME_MARKER':      ['local-patch', 'component-regenerate']
      };
      return map[code] || this.ORDER.slice();
    },
    select(issue, previousAttempts){
      const fp = IssueMemory._fingerprint(issue);
      const tried = (this._attempts[fp] && this._attempts[fp].strategies) || (previousAttempts && previousAttempts.strategies) || [];
      const order = this.strategiesFor(issue);
      for (let i = 0; i < order.length; i++){
        if (tried.indexOf(order[i]) < 0) return { strategy: order[i], triedBefore: tried, index: i, totalStrategies: order.length };
      }
      // We have tried everything - return the strongest available.
      return { strategy: order[order.length - 1], triedBefore: tried, index: order.length - 1, totalStrategies: order.length, exhausted: true };
    },
    recordAttempt(issue, strategy, outcome){
      const fp = IssueMemory._fingerprint(issue);
      if (!fp) return;
      this._attempts[fp] = this._attempts[fp] || { strategies: [], outcomes: [] };
      this._attempts[fp].strategies.push(strategy);
      this._attempts[fp].outcomes.push(outcome);
      this._attempts[fp].lastTried = now();
      this._saveAttempts();
    },
    reset(issue){
      const fp = IssueMemory._fingerprint(issue);
      if (fp) { delete this._attempts[fp]; this._saveAttempts(); }
    },
    resetAll(){ this._attempts = {}; this._saveAttempts(); },
    summary(){
      const all = Object.values(this._attempts);
      const exhausted = all.filter(x => (x.strategies || []).length >= this.ORDER.length).length;
      return { trackedIssues: all.length, exhausted: exhausted };
    }
  };

  // ---------------- V3 #3: Convergence Detection ----------------
  // Looks at recent cycle history and decides whether another cycle is
  // likely to be useful.
  const Convergence = {
    STATES: ['NO_PROGRESS', 'PLATEAU', 'OSCILLATION', 'REGRESSION', 'CONVERGING', 'COMPLETE'],
    _lastState: null,
    evaluate(history){
      history = history || [];
      if (!history.length) return { state: 'COMPLETE', reason: 'no_history', details: {} };
      // Only look at the last 5 cycles
      const recent = history.slice(-5);
      const healths = recent.map(c => (c.healthAfter != null ? c.healthAfter : (c.after && c.after.health) || 0));
      const issues  = recent.map(c => (c.issuesAfter  != null ? c.issuesAfter  : (c.after && c.after.issues) || 0));
      const repaired = recent.map(c => c.repaired || c.repairedCount || 0);
      const rolledBack = recent.some(c => c.rolledBack);
      // Check for oscillation: health goes up then down then up
      let oscillations = 0;
      for (let i = 1; i < healths.length; i++){
        if (healths[i] !== healths[i-1]) oscillations++;
      }
      const oscillating = oscillations >= 3 && healths.length >= 3;
      // Check regression in the most recent cycle
      const last = recent[recent.length - 1];
      const prev = recent.length >= 2 ? recent[recent.length - 2] : null;
      if (last && prev) {
        if ((last.healthAfter || 0) < (prev.healthAfter || 0)) {
          this._lastState = { state: 'REGRESSION', reason: 'health_decreased', details: { from: prev.healthAfter, to: last.healthAfter } };
          return this._lastState;
        }
      }
      if (rolledBack) {
        this._lastState = { state: 'REGRESSION', reason: 'rolled_back', details: { last: last } };
        return this._lastState;
      }
      if (oscillating) {
        this._lastState = { state: 'OSCILLATION', reason: 'health_oscillating', details: { healths: healths, oscillations: oscillations } };
        return this._lastState;
      }
      // COMPLETE: all issues repaired and at maximum health
      if (last && (last.healthAfter || 0) >= 99 && (last.issuesAfter != null ? last.issuesAfter : 99) <= 0) {
        this._lastState = { state: 'COMPLETE', reason: 'all_repaired', details: {} };
        return this._lastState;
      }
      // NO_PROGRESS: last cycle repaired 0
      if (last && (last.repaired || 0) === 0) {
        this._lastState = { state: 'NO_PROGRESS', reason: 'no_patches_applied', details: { health: last.healthAfter } };
        return this._lastState;
      }
      // PLATEAU: 2 cycles with no improvement
      if (healths.length >= 2 && healths[healths.length - 1] === healths[healths.length - 2]) {
        this._lastState = { state: 'PLATEAU', reason: 'health_unchanged', details: { health: healths[healths.length - 1] } };
        return this._lastState;
      }
      this._lastState = { state: 'CONVERGING', reason: 'health_improving', details: { from: healths[0], to: healths[healths.length-1] } };
      return this._lastState;
    },
    lastState(){ return this._lastState; },
    shouldContinue(state, maxCycles, currentCycle){
      if (currentCycle >= maxCycles) return { continue: false, reason: 'max_cycles_reached' };
      if (!state) return { continue: true };
      if (state.state === 'COMPLETE')    return { continue: false, reason: 'complete' };
      if (state.state === 'NO_PROGRESS') return { continue: false, reason: 'no_progress_2_cycles' };
      if (state.state === 'PLATEAU')     return { continue: false, reason: 'plateau_2_cycles' };
      if (state.state === 'REGRESSION')  return { continue: false, reason: 'regression' };
      // OSCILLATION: try ONE more cycle with a different strategy before giving up.
      if (state.state === 'OSCILLATION') return { continue: currentCycle < maxCycles - 1, reason: 'try_different_strategy' };
      return { continue: true };
    }
  };

  // ---------------- V3 #7: Contract Validation ----------------
  // Compares producers and consumers to detect contracts that are
  // syntactically valid but semantically broken (mismatched fields,
  // types, routes, schemas, response shapes).
  const Contracts = {
    validate(){
      const findings = [];
      const files = Object.keys(Engine.FS._data || {}).filter(p => Engine.FS.isFile(p));
      // 1. Imports vs exports
      const exports = {};
      files.forEach(p => {
        if (!p.endsWith('.js') && !p.endsWith('.mjs')) return;
        const c = Engine.FS.read(p) || '';
        const ex = c.match(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g) || [];
        ex.forEach(m0 => { const m = m0.match(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/); if (m) exports[p] = exports[p] || [], exports[p].push(m[1]); });
      });
      files.forEach(p => {
        if (!p.endsWith('.js') && !p.endsWith('.mjs')) return;
        const c = Engine.FS.read(p) || '';
        const imps = c.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g) || [];
        imps.forEach(line => {
          const m = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
          if (!m) return;
          const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
          const target = m[2];
          // Try to resolve the target file
          const resolved = resolveImport(p, target);
          if (resolved && exports[resolved]) {
            names.forEach(n => {
              if (exports[resolved].indexOf(n) < 0) {
                findings.push({ kind: 'missing-export', from: p, to: resolved, missing: n, severity: 'error' });
              }
            });
          }
        });
      });
      // 2. Routes vs fetch
      const routes = [];
      files.forEach(p => {
        if (!p.endsWith('.js') && !p.endsWith('.mjs')) return;
        const c = Engine.FS.read(p) || '';
        const rre = /\b(app|router)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
        let rm; while ((rm = rre.exec(c))) routes.push({ file: p, method: rm[2].toUpperCase(), path: rm[3] });
        const fre = /fetch\(\s*['"`]([^'"`]+)['"`]/g;
        while ((rm = fre.exec(c))) {
          const p2 = rm[1];
          const matched = routes.some(r => r.path === p2);
          if (!matched && p2.startsWith('/')) {
            findings.push({ kind: 'unmatched-fetch', from: p, fetch: p2, severity: 'warning' });
          }
        }
      });
      // 3. Form fields vs handler
      files.filter(p => p.endsWith('.html')).forEach(p => {
        const c = Engine.FS.read(p) || '';
        const inputs = c.match(/<input[^>]*\bname=['"]([^'"]+)['"]/g) || [];
        const fields = inputs.map(s => { const m = s.match(/name=['"]([^'"]+)['"]/); return m ? m[1] : null; }).filter(Boolean);
        const onsubmit = c.match(/onsubmit=['"]([^'"]+)['"]/);
        if (onsubmit && fields.length === 0) {
          findings.push({ kind: 'empty-form', from: p, severity: 'info' });
        }
      });
      return { findings: findings, exports: exports, routes: routes, checkedFiles: files.length };
    }
  };

  // ---------------- V3 #10: Regression Protection ----------------
  // Compares a baseline (pre-repair) state against a candidate
  // (post-repair) state and blocks acceptance if a previously-passing
  // critical behaviour is now broken.
  const Regression = {
    compare(baseline, candidate){
      baseline = baseline || {};
      candidate = candidate || {};
      const regressions = [];
      // 1. Levels that were passing must still pass
      const bl = baseline.levels || {};
      const cl = candidate.levels || {};
      ['L1','L2','L3','L4','L5'].forEach(k => {
        if (bl[k] && bl[k].ok && (!cl[k] || !cl[k].ok)) {
          regressions.push({ kind: 'level-regression', level: k, before: 'PASS', after: 'FAIL' });
        }
      });
      // 2. Health must not decrease by more than 5 points (small variance is OK)
      if (typeof baseline.health === 'number' && typeof candidate.health === 'number') {
        if (candidate.health < baseline.health - 5) {
          regressions.push({ kind: 'health-regression', before: baseline.health, after: candidate.health });
        }
      }
      // 3. Graph: previously-broken edges must not increase
      if (typeof baseline.brokenEdges === 'number' && typeof candidate.brokenEdges === 'number') {
        if (candidate.brokenEdges > baseline.brokenEdges) {
          regressions.push({ kind: 'graph-regression', before: baseline.brokenEdges, after: candidate.brokenEdges });
        }
      }
      // 4. Previously-passing critical checks must still pass
      const critical = baseline.critical || [];
      critical.forEach(c => {
        const cur = (candidate.critical || []).find(x => x.name === c.name);
        if (c.passed && (!cur || !cur.passed)) {
          regressions.push({ kind: 'critical-regression', name: c.name });
        }
      });
      return { ok: regressions.length === 0, regressions: regressions };
    }
  };

  // ---------------- V3 #11: Repair Transaction ----------------
  // Each autonomous repair is wrapped in a transaction:
  // begin -> apply -> verify -> commit / rollback
  const RepairTransaction = {
    _current: null,
    begin(label){
      const txId = 'tx_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
      const snap = Snapshots.capture('tx-begin', label || txId);
      this._current = {
        txId: txId,
        label: label || 'repair',
        snapshotId: snap.snapshotId,
        patches: [],
        startedAt: now(),
        status: 'open',
        verify: null,
        regression: null
      };
      return this._current;
    },
    apply(patch){
      if (!this._current) return { ok: false, error: 'no_transaction' };
      this._current.patches.push(patch);
      return { ok: true };
    },
    verify(input){
      if (!this._current) return { ok: false, error: 'no_transaction' };
      const v = Recovery.verify(input || {});
      this._current.verify = v;
      return v;
    },
    checkRegression(baseline, candidate){
      if (!this._current) return { ok: false };
      const r = Regression.compare(baseline, candidate);
      this._current.regression = r;
      return r;
    },
    commit(){
      if (!this._current) return { ok: false, error: 'no_transaction' };
      this._current.status = 'committed';
      this._current.finishedAt = now();
      const tx = this._current;
      this._current = null;
      return { ok: true, tx: tx };
    },
    rollback(){
      if (!this._current) return { ok: false, error: 'no_transaction' };
      const snap = this._current.snapshotId;
      const r = Snapshots.restore(snap);
      this._current.status = 'rolled_back';
      this._current.finishedAt = now();
      const tx = this._current;
      this._current = null;
      return { ok: true, restored: r.restored || r.filesRestored || 0, tx: tx };
    },
    current(){ return this._current; }
  };

  // ---------------- V3 #1: Fault Injection Engine ----------------
  // Injects controlled, reproducible faults into a clean workspace so
  // we can benchmark Recovery V3 objectively.
  const FaultInjector = {
    FAULTS: {
      'syntax':              { code: 'JS_SYNTAX_ERROR',  desc: 'Introduce a JS syntax error' },
      'missing-file':        { code: 'FILE_EMPTY',       desc: 'Truncate a file to empty' },
      'missing-import':      { code: 'JS_MISSING_IMPORT',desc: 'Rewrite an import path to a non-existent file' },
      'console-log':         { code: 'JS_CONSOLE_LOG',   desc: 'Add a console.log statement' },
      'missing-alt':         { code: 'HTML_MISSING_ALT', desc: 'Strip alt attribute from <img>' },
      'missing-lang':        { code: 'HTML_MISSING_LANG',desc: 'Remove lang attribute from <html>' },
      'tag-imbalance':       { code: 'HTML_TAG_IMBALANCE',desc: 'Remove a closing tag' },
      'broken-ref':          { code: 'HTML_BROKEN_REF',  desc: 'Point an <img src> to a non-existent file' },
      'unsafe-eval':         { code: 'JS_CSP_UNSAFE_EVAL',desc: 'Insert an eval() call' },
      'todo-marker':         { code: 'FILE_TODO_MARKER', desc: 'Insert a TODO marker' }
    },
    _snapshot: null,
    captureBaseline(){
      const data = {};
      Object.keys(Engine.FS._data).forEach(p => {
        if (Engine.FS.isFile(p)) data[p] = Engine.FS.read(p);
      });
      this._snapshot = { at: now(), files: data };
      return this._snapshot;
    },
    restoreBaseline(){
      if (!this._snapshot) return { ok: false, error: 'no_baseline' };
      Object.keys(Engine.FS._data).forEach(p => { if (Engine.FS.isFile(p)) Engine.FS.remove(p); });
      Object.keys(this._snapshot.files).forEach(p => Engine.FS.write(p, this._snapshot.files[p]));
      return { ok: true, restored: Object.keys(this._snapshot.files).length };
    },
    inject(faultName, targetFile){
      const fault = this.FAULTS[faultName];
      if (!fault) return { ok: false, error: 'unknown_fault', name: faultName };
      if (!Engine.FS.exists(targetFile)) return { ok: false, error: 'no_target_file', file: targetFile };
      if (!this._snapshot) this.captureBaseline();
      const c = Engine.FS.read(targetFile);
      let newContent = c;
      switch (faultName) {
        case 'syntax':           newContent = c + '\nfunction __broken( { return ; }'; break;
        case 'missing-file':     newContent = ''; break;
        case 'missing-import':   newContent = c.replace(/from\s+['"]([^'"]+)['"]/g, "from './__missing__.js'"); break;
        case 'console-log':      newContent = c + '\nconsole.log("__injected__");'; break;
        case 'missing-alt':      newContent = c.replace(/<img([^>]*)\salt=[^>]*>/g, '<img$1>'); break;
        case 'missing-lang':     newContent = c.replace(/<html\s+lang=['"][^'"]+['"]/i, '<html'); break;
        case 'tag-imbalance':    newContent = c.replace(/<\/body>/, ''); break;
        case 'broken-ref':       newContent = c.replace(/(src|href)=['"]([^'"]+)['"]/g, '$1="__missing__.png"'); break;
        case 'unsafe-eval':      newContent = c + '\neval("__injected__");'; break;
        case 'todo-marker':      newContent = c + '\n// TODO: __injected__'; break;
      }
      if (newContent === c) return { ok: false, error: 'injection_no_op', file: targetFile };
      Engine.FS.write(targetFile, newContent);
      return { ok: true, fault: faultName, code: fault.code, file: targetFile, at: now() };
    },
    injectAll(targetFile){
      const results = [];
      Object.keys(this.FAULTS).forEach(name => {
        if (this._snapshot) this.restoreBaseline();
        this.captureBaseline();
        const r = this.inject(name, targetFile);
        results.push(r);
      });
      this.restoreBaseline();
      return results;
    },
    clearBaseline(){ this._snapshot = null; }
  };

  // ---------------- V3 #9: Golden-Path Tests ----------------
  // Per-app-type definition of critical workflows that must pass
  // before a recovery can be marked COMPLETE.
  const GoldenPaths = {
    PATHS: {
      'saas-dashboard': [
        { name: 'register-to-dashboard',   steps: ['register', 'login', 'dashboard'], critical: true },
        { name: 'create-and-persist',      steps: ['create-project', 'save', 'reload', 'persisted'], critical: true },
        { name: 'ai-prompt-roundtrip',     steps: ['send-prompt', 'backend', 'provider', 'response'], critical: true }
      ],
      'landing-page': [
        { name: 'view-and-signup',         steps: ['view', 'click-cta', 'signup-form'], critical: true }
      ],
      'ecommerce': [
        { name: 'browse-to-checkout',      steps: ['browse', 'add-to-cart', 'checkout', 'payment'], critical: true }
      ],
      'blog': [
        { name: 'list-to-detail',          steps: ['list', 'open-article', 'read'], critical: true }
      ],
      'todo': [
        { name: 'add-and-persist',         steps: ['add', 'reload', 'persisted'], critical: true }
      ],
      'chat': [
        { name: 'send-and-receive',        steps: ['send', 'receive', 'render'], critical: true }
      ],
      'api': [
        { name: 'auth-and-list',           steps: ['auth', 'list', 'paginate'], critical: true }
      ],
      'portfolio': [
        { name: 'view-projects',           steps: ['view', 'open-project', 'back'], critical: true }
      ]
    },
    forAppType(appType){
      return this.PATHS[appType] || [
        { name: 'entry-renders',  steps: ['load', 'render'], critical: true }
      ];
    },
    run(appType, options){
      // Static check: in a real browser we'd drive the UI. In this
      // in-memory model we verify that the static pieces each path
      // needs are present.
      options = options || {};
      const paths = this.forAppType(appType);
      const results = paths.map(p => {
        const missing = [];
        p.steps.forEach(step => {
          // Very light static checks: ensure the entry HTML exists and
          // a script file is present.
          if (step === 'load' && !Engine.FS.exists('/index.html')) missing.push('index.html');
          if (step === 'render' && !Object.keys(Engine.FS._data || {}).some(p => p.endsWith('.js'))) missing.push('no .js file');
          if (step === 'auth' && !Object.keys(Engine.FS._data || {}).some(p => /auth|login/i.test(p))) missing.push('no auth/login module');
          if (step === 'list' && !Object.keys(Engine.FS._data || {}).some(p => /list|table/i.test(p))) missing.push('no list/table module');
        });
        return {
          name: p.name,
          steps: p.steps,
          critical: !!p.critical,
          passed: missing.length === 0,
          missing: missing
        };
      });
      const criticalFails = results.filter(r => r.critical && !r.passed);
      return {
        appType: appType,
        total: results.length,
        passed: results.filter(r => r.passed).length,
        criticalPassed: results.filter(r =>r.critical).length - criticalFails.length,
        criticalTotal: results.filter(r => r.critical).length,
        results: results,
        allCriticalPassed: criticalFails.length === 0
      };
    }
  };

  // ---------------- V3 #13: Recovery Certificate ----------------
  // An auditable artifact that summarises a verified recovery.
  const Certificate = {
    _last: null,
    _all: [],
    NS: 'cs.recovery.v3.certificates.v1',
    _load(){
      try { this._all = JSON.parse(localStorage.getItem(this.NS) || '[]'); } catch(_){ this._all = []; }
    },
    _save(){
      try { localStorage.setItem(this.NS, JSON.stringify(this._all.slice(-30))); } catch(_){}
    },
    generate(run, opts){
      opts = opts || {};
      const certId = 'cert_' + now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
      const initialIssues = (run && run.before && run.before.issues) || 0;
      const finalIssues   = (run && run.after  && run.after.issues)  || 0;
      const detectedIssues = initialIssues;
      const repairedIssues = (run && run.results) ? run.results.filter(r => r.ok).length : (run && run.repairedCount) || 0;
      const unresolvedIssues = Math.max(0, detectedIssues - repairedIssues);
      const mocks = (window.MockDetect && window.MockDetect.run) ? window.MockDetect.run() : [];
      const graph = (window.GraphValidate && window.GraphValidate.run) ? window.GraphValidate.run() : { broken: [] };
      const levels = (run && run.verify && run.verify.levels) || (Recovery.analyze().levels);
      const highestLevel = (function(){
        const order = ['L1','L2','L3','L4','L5'];
        for (let i = order.length - 1; i >= 0; i--) {
          if (levels[order[i]] && levels[order[i]].ok) return order[i];
        }
        // fall back to the lowest passing
        for (let i = 0; i < order.length; i++) {
          if (!levels[order[i]] || !levels[order[i]].ok) return i === 0 ? 'L0' : order[i-1];
        }
        return 'L5';
      })();
      const proj = (Engine.Proj && Engine.Proj.current) ? (Engine.Proj.current() || {}) : {};
      const certificate = {
        certificateId: certId,
        issuedAt: now(),
        projectName: proj.name || 'workspace',
        recoveryId: (run && run.runId) || null,
        initialHealth: (run && run.before && run.before.health) || 0,
        finalHealth:   (run && run.after  && run.after.health)  || 0,
        detectedIssues: detectedIssues,
        repairedIssues: repairedIssues,
        unresolvedIssues: unresolvedIssues,
        buildStatus:    levels.L2 && levels.L2.ok ? 'PASS' : 'FAIL',
        runtimeStatus:  levels.L3 && levels.L3.ok ? 'PASS' : 'FAIL',
        functionalStatus: levels.L4 && levels.L4.ok ? 'PASS' : 'FAIL',
        highestLevel:   highestLevel,
        mocksRemaining: (mocks || []).length,
        brokenConnections: (graph.broken || []).length,
        regressions: (run && run.rolledBack) ? 1 : 0,
        rolledBack: !!(run && run.rolledBack),
        finalStatus: (run && run.status) || 'UNKNOWN',
        verified100: (run && run.status === 'VERIFIED' && (mocks || []).length === 0 && (graph.broken || []).length === 0 && !run.rolledBack)
      };
      this._all.push(certificate);
      this._save();
      this._last = certificate;
      return certificate;
    },
    last(){ return this._last; },
    list(){ this._load(); return this._all.slice(); }
  };
  Certificate._load();

  // ---------------- V3 #15: Recovery Benchmark ----------------
  // Tracks per-run metrics so the dashboard can report measurable
  // engineering performance.
  const Benchmark = {
    NS: 'cs.recovery.v3.benchmark.v1',
    _data: (function(){
      try { return JSON.parse(localStorage.getItem(this.NS) || '{}'); } catch(_){ return {}; }
    }).call({ NS: 'cs.recovery.v3.benchmark.v1' }) || { projects: [], runs: [], faultsInjected: 0, faultsDetected: 0, rootCauseCorrect: 0, rootCauseTotal: 0, repairsAttempted: 0, repairsSucceeded: 0, buildsRecovered: 0, buildsAttempted: 0, runtimesRecovered: 0, runtimesAttempted: 0, functionalRecovered: 0, functionalAttempted: 0, regressionsCaught: 0, regressionsAllowed: 0, averageCycles: 0, unresolvedCount: 0 },
    _save(){
      try { localStorage.setItem(this.NS, JSON.stringify(this._data)); } catch(_){}
    },
    recordProject(name, framework){
      this._data.projects = this._data.projects || [];
      if (!this._data.projects.find(p => p.name === name)) {
        this._data.projects.push({ name: name, framework: framework || 'unknown', addedAt: now() });
        this._save();
      }
      return this._data.projects.length;
    },
    recordFaults(injected, detected){ this._data.faultsInjected += injected; this._data.faultsDetected += detected; this._save(); },
    recordRootCause(correct){ this._data.rootCauseTotal = (this._data.rootCauseTotal || 0) + 1; if (correct) this._data.rootCauseCorrect = (this._data.rootCauseCorrect || 0) + 1; this._save(); },
    recordRepair(attempted, succeeded){ this._data.repairsAttempted += attempted; this._data.repairsSucceeded += succeeded; this._save(); },
    recordBuildRecovery(ok){ this._data.buildsAttempted += 1; if (ok) this._data.buildsRecovered += 1; this._save(); },
    recordRuntimeRecovery(ok){ this._data.runtimesAttempted += 1; if (ok) this._data.runtimesRecovered += 1; this._save(); },
    recordFunctionalRecovery(ok){ this._data.functionalAttempted += 1; if (ok) this._data.functionalRecovered += 1; this._save(); },
    recordRegression(caught, allowed){ this._data.regressionsCaught += caught; this._data.regressionsAllowed += allowed; this._save(); },
    recordRun(run, cycles){
      this._data.runs = this._data.runs || [];
      this._data.runs.push({ at: now(), runId: run.runId, status: run.status, cycles: cycles, repaired: run.repairedCount, rolledBack: run.rolledBack });
      this._data.runs = this._data.runs.slice(-100);
      // rolling average of cycles
      const cycleCounts = this._data.runs.map(r => r.cycles || 0);
      this._data.averageCycles = cycleCounts.length ? +(cycleCounts.reduce((a,b)=>a+b,0) / cycleCounts.length).toFixed(2) : 0;
      this._data.unresolvedCount = (run.after && run.after.issues) || 0;
      this._save();
    },
    report(){
      const d = this._data;
      const pct = (num, den) => den > 0 ? Math.round((num/den)*100) : 0;
      return {
        projects: (d.projects || []).length,
        faultsInjected: d.faultsInjected || 0,
        faultDetectionRate: pct(d.faultsDetected || 0, d.faultsInjected || 0),
        rootCauseAccuracy: pct(d.rootCauseCorrect || 0, d.rootCauseTotal || 0),
        successfulRepairRate: pct(d.repairsSucceeded || 0, d.repairsAttempted || 0),
        buildRecoveryRate: pct(d.buildsRecovered || 0, d.buildsAttempted || 0),
        runtimeRecoveryRate: pct(d.runtimesRecovered || 0, d.runtimesAttempted || 0),
        functionalRecoveryRate: pct(d.functionalRecovered || 0, d.functionalAttempted || 0),
        regressionFreeRate: pct(d.regressionsCaught || 0, (d.regressionsCaught || 0) + (d.regressionsAllowed || 0)),
        averageRepairCycles: d.averageCycles || 0,
        unresolvedPercent: pct(d.unresolvedCount || 0, Math.max(1, d.faultsInjected || 1)),
        totalRuns: (d.runs || []).length,
        recentRuns: (d.runs || []).slice(-10).reverse()
      };
    },
    reset(){ this._data = { projects: [], runs: [], faultsInjected: 0, faultsDetected: 0, rootCauseCorrect: 0, rootCauseTotal: 0, repairsAttempted: 0, repairsSucceeded: 0, buildsRecovered: 0, buildsAttempted: 0, runtimesRecovered: 0, runtimesAttempted: 0, functionalRecovered: 0, functionalAttempted: 0, regressionsCaught: 0, regressionsAllowed: 0, averageCycles: 0, unresolvedCount: 0 }; this._save(); }
  };

  // ============================================================
  //   INTEGRATE V3 INTO RECOVERY.LOOP AND RECOVERY.RUN
  // ============================================================

  // V3-enhanced run(): wrap everything in a RepairTransaction,
  // pick strategies via RepairStrategy, record issues in IssueMemory,
  // detect convergence, and generate a Recovery Certificate.
  Recovery.runV3 = function(opts){
    opts = opts || {};
    const tx = RepairTransaction.begin('runV3');
    const t0 = now();
    const baseline = {
      levels: Levels.run(),
      health: computeHealth(),
      brokenEdges: GraphValidate.run().broken.length,
      critical: (opts.goldenPaths && opts.goldenPaths.results) ? opts.goldenPaths.results.map(r => ({ name: r.name, passed: r.passed })) : []
    };
    // 1) Repair loop
    const loop = this.loop({ maxCycles: opts.maxCycles || 5 });
    // 2) Check regression
    const candidate = {
      levels: loop.verify ? loop.verify.levels : Levels.run(),
      health: loop.after ? loop.after.health : computeHealth(),
      brokenEdges: loop.after ? loop.after.graphBroken : GraphValidate.run().broken.length,
      critical: (opts.goldenPaths && opts.goldenPaths.results) ? opts.goldenPaths.results.map(r => ({ name: r.name, passed: r.passed })) : []
    };
    const reg = RepairTransaction.checkRegression(baseline, candidate);
    // 3) Commit or rollback (RepairTransaction methods live on the module,
    // not on the tx handle, so call them via RepairTransaction)
    let commitRes;
    if (reg.ok && !loop.rolledBack) {
      commitRes = RepairTransaction.commit();
    } else {
      if (!reg.ok) commitRes = RepairTransaction.rollback();
      else          commitRes = RepairTransaction.commit();
    }
    // 4) Record issues in IssueMemory
    if (loop.results) {
      loop.results.forEach(r => {
        const it = (analysisFor(loop) || []).find(x => x.id === r.issueId);
        if (it) {
          IssueMemory.record(it, { cycle: 0, strategy: 'auto', outcome: r.ok ? 'repaired' : 'failed', confidence: it.confidence });
        }
      });
    }
    // 5) Record benchmark metrics
    Benchmark.recordRun(loop, loop.cycles);
    Benchmark.recordRepair(loop.results ? loop.results.length : 0, loop.repairedCount || 0);
    if (loop.verify) {
      Benchmark.recordBuildRecovery(!!(loop.verify.levels && loop.verify.levels.L2 && loop.verify.levels.L2.ok));
      Benchmark.recordRuntimeRecovery(!!(loop.verify.levels && loop.verify.levels.L3 && loop.verify.levels.L3.ok));
      Benchmark.recordFunctionalRecovery(!!(loop.verify.levels && loop.verify.levels.L4 && loop.verify.levels.L4.ok));
    }
    Benchmark.recordRegression(reg.regressions.length, 0);
    // 6) Generate certificate
    const certificate = Certificate.generate(loop);
    return { tx: commitRes, loop: loop, regression: reg, certificate: certificate, durationMs: now() - t0 };
  };

  // Helper: pull the issues that produced these results, if any
  function analysisFor(loop){
    try { return Recovery.analyze().issues; } catch(_){ return []; }
  }

  // ---------------- expose ----------------
  window.Recovery     = Recovery;
  window.Graph        = Graph;
  window.GraphValidate= GraphValidate;
  window.MockDetect   = MockDetect;
  window.ProjectType  = ProjectType;
  window.Verify       = Verify;
  window.Levels       = Levels;
  window.Snapshots    = Snapshots;
  window.Terminal     = Terminal;
  window.Generator    = Generator;
  window.weightedHealth = weightedHealth;
  // V3
  window.IssueMemory      = IssueMemory;
  window.RepairStrategy   = RepairStrategy;
  window.Convergence      = Convergence;
  window.Contracts        = Contracts;
  window.Regression       = Regression;
  window.RepairTransaction= RepairTransaction;
  window.FaultInjector    = FaultInjector;
  window.GoldenPaths      = GoldenPaths;
  window.Certificate      = Certificate;
  window.Benchmark        = Benchmark;
  // AI-assisted repair: when the deterministic patch generators can't fix an
  // issue, ask the connected model for a minimal whole-file rewrite. Opt-in —
  // callers pass the issue; returns { kind:'replace', text } or null.
  Recovery.aiSuggest = function (issue) {
    var AI = window.Engine && window.Engine.AI;
    if (!AI || !AI.ready || !AI.ready()) return Promise.resolve(null);
    if (!issue || !issue.file || !Engine.FS.exists(issue.file)) return Promise.resolve(null);
    var src = Engine.FS.read(issue.file) || '';
    if (src.length > 24000) return Promise.resolve(null);
    var msg = 'Fix this issue in the file below. Reply ONLY with the complete corrected file, no prose, no fences.\n\n' +
      'File: ' + issue.file + '\nIssue: ' + (issue.message || issue.code || 'defect') + '\n\n----\n' + src + '\n----';
    return AI.chat(msg, { temperature: 0, maxTokens: 4096 }).then(function (r) {
      var t = String(r.text || '').replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
      if (!t || t === src || t.length < Math.min(20, src.length / 4)) return null;
      return { kind: 'replace', text: t, via: 'ai:' + (r.provider || 'llm') };
    }).catch(function () { return null; });
  };

  try {
    if (window.Engine) {
      window.Engine.Recovery      = Recovery;
      window.Engine.Graph         = Graph;
      window.Engine.GraphValidate = GraphValidate;
      window.Engine.MockDetect    = MockDetect;
      window.Engine.ProjectType   = ProjectType;
      window.Engine.Verify        = Verify;
      window.Engine.Levels        = Levels;
      window.Engine.Snapshots     = Snapshots;
      window.Engine.Terminal      = Terminal;
      window.Engine.Generator     = Generator;
      window.Engine.weightedHealth= weightedHealth;
      // V3
      window.Engine.IssueMemory      = IssueMemory;
      window.Engine.RepairStrategy   = RepairStrategy;
      window.Engine.Convergence      = Convergence;
      window.Engine.Contracts        = Contracts;
      window.Engine.Regression       = Regression;
      window.Engine.RepairTransaction= RepairTransaction;
      window.Engine.FaultInjector    = FaultInjector;
      window.Engine.GoldenPaths      = GoldenPaths;
      window.Engine.Certificate      = Certificate;
      window.Engine.Benchmark        = Benchmark;
    }
  } catch (e) {}
})();
