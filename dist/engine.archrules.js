/* =====================================================================
   engine.archrules.js  —  Engine.ArchRules   (blueprint §5, architecture gate)

   A layering / boundary scanner over the generated workspace. Where
   Engine.Security asks "is this code dangerous", this asks "is this code
   in the right layer" — the violations that make a generated repo look
   like an app but rot the moment someone extends it:

     - presentation layer (public/**) importing server code or a DB driver
     - presentation layer doing crypto / auth / token work
     - service layer opening its own DB connection instead of the data layer
     - data layer (src/db*) importing the service/business layer (inverted dep)
     - one microservice importing another's internals (should call over HTTP)
     - an entity in the contract with no service module (missing layer)
     - hardcoded cross-origin backend URLs in the frontend

   window.Engine.ArchRules
     RULES
     scan()   -> { generatedAt, findings, bySeverity, score, layers }
                 writes .sovereign/architecture-findings.json + architecture-rules.md
     load()   -> the written report or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function isProduct(p) { return !/^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor)\//.test(p); }
  function isTest(p) { return /(^|\/)(test|tests|spec|__tests__|fixtures?|e2e|mocks?)\//i.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p); }
  function allFiles() {
    return Object.keys(Engine.FS._data).filter(function (p) { return Engine.FS.isFile(p) && isProduct(p); });
  }
  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

  function layerOf(p) {
    if (/(^|\/)public\//.test(p) || /(^|\/)(src\/)?(components|pages|views|ui)\//.test(p)) return 'presentation';
    if (/(^|\/)src\/db(\.|\/|$)|(^|\/)app\/db\.py$|(^|\/)src\/schema\.js$/.test(p)) return 'data';
    if (/(^|\/)src\/services\//.test(p) || /(^|\/)app\/services\//.test(p)) return 'service';
    if (/(^|\/)gateway\//.test(p)) return 'gateway';
    if (/(^|\/)services\/[^/]+\//.test(p)) return 'microservice';
    if (/(^|\/)(server|app|index)\.(js|ts|mjs)$|(^|\/)app\/main\.py$/.test(p)) return 'transport';
    return 'other';
  }

  // require()/import specifiers in a JS/TS source
  function imports(src) {
    var out = [], m;
    var re = /(?:require\s*\(\s*|import\s+[^'"]*from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
    while ((m = re.exec(src))) out.push({ spec: m[1], at: m.index });
    return out;
  }

  var DB_DRIVER = /^(pg|mysql2?|better-sqlite3|sqlite3|node:sqlite|mongodb|mongoose|sequelize|typeorm|knex|prisma|@prisma\/client|ioredis|redis)$/;
  var CRYPTO_AUTH = /\b(scrypt|scryptSync|pbkdf2|createHmac|createHash|randomBytes|bcrypt|argon2|jsonwebtoken|jwt\.sign|jwt\.verify)\b/;

  function scan() {
    var findings = [];
    var push = function (f) { findings.push(f); };
    var jsFiles = allFiles().filter(function (p) { return /\.(js|ts|mjs|jsx|tsx)$/.test(p) && !isTest(p); });

    jsFiles.forEach(function (p) {
      var src = read(p);
      if (src.length > 400000) return;
      var layer = layerOf(p);
      var imps = imports(src);

      // ---- presentation layer boundaries ----
      if (layer === 'presentation') {
        imps.forEach(function (im) {
          if (DB_DRIVER.test(im.spec)) push({ rule: 'frontend-imports-db-driver', severity: 'high', file: p, line: lineOf(src, im.at), layer: layer, message: 'the browser layer imports a database driver (`' + im.spec + '`) — data access must go through the API' });
          else if (/(^|\/)(\.\.\/)*src\/(db|services|auth|schema)\b/.test(im.spec) || /(^|\/)(\.\.\/)*(server|app\/main)\b/.test(im.spec)) push({ rule: 'frontend-imports-server-code', severity: 'high', file: p, line: lineOf(src, im.at), layer: layer, message: 'the browser layer imports server module `' + im.spec + '` — this ships backend code (and its secrets) to the client' });
        });
        if (/\bprocess\.env\.(DATABASE_URL|DB_|SECRET|PRIVATE|API_KEY|TOKEN)/.test(src)) push({ rule: 'frontend-reads-server-env', severity: 'high', file: p, line: lineOf(src, src.search(/process\.env\.(DATABASE_URL|DB_|SECRET|PRIVATE|API_KEY|TOKEN)/)), layer: layer, message: 'the browser layer reads a server-side env var — it will be undefined at best, a leak at worst' });
        var cm = src.match(CRYPTO_AUTH);
        if (cm && !/vendor\/|crypto-lite|subtle/.test(p)) push({ rule: 'auth-logic-in-frontend', severity: 'medium', file: p, line: lineOf(src, src.indexOf(cm[0])), layer: layer, message: 'password/token crypto (`' + cm[0] + '`) in the browser layer — hashing and signing belong on the server' });
        var abs = src.match(/['"]https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\$\{)[a-z0-9.-]+/i);
        if (abs) push({ rule: 'hardcoded-backend-origin', severity: 'low', file: p, line: lineOf(src, src.indexOf(abs[0])), layer: layer, message: 'hardcoded cross-origin URL in the frontend (' + abs[0].replace(/['"]/, '') + '…) — use a relative path or injected config' });
      }

      // ---- service layer must go through the data layer ----
      if (layer === 'service') {
        imps.forEach(function (im) {
          if (DB_DRIVER.test(im.spec)) push({ rule: 'service-opens-own-db', severity: 'medium', file: p, line: lineOf(src, im.at), layer: layer, message: 'a service module imports `' + im.spec + '` directly — every table access should go through the shared data layer (src/db)' });
        });
        if (/\bnew\s+(Client|Pool)\s*\(|createConnection\s*\(/.test(src)) push({ rule: 'service-opens-own-db', severity: 'medium', file: p, line: lineOf(src, src.search(/\bnew\s+(Client|Pool)\s*\(|createConnection\s*\(/)), layer: layer, message: 'a service module opens its own DB connection — use the shared data layer' });
      }

      // ---- data layer must not depend on the layers above it ----
      if (layer === 'data') {
        imps.forEach(function (im) {
          if (/services\//.test(im.spec) || /(^|\/)(\.\.\/)*(server|routes?|controllers?)\b/.test(im.spec)) push({ rule: 'inverted-layer-dependency', severity: 'high', file: p, line: lineOf(src, im.at), layer: layer, message: 'the data layer imports `' + im.spec + '` (a higher layer) — dependencies must point downward only' });
        });
      }

      // ---- one microservice must not reach into another's internals ----
      if (layer === 'microservice') {
        var mine = (p.match(/services\/([^/]+)\//) || [])[1];
        imps.forEach(function (im) {
          var other = (im.spec.match(/services\/([^/]+)\//) || [])[1];
          if (other && other !== mine) push({ rule: 'cross-service-import', severity: 'medium', file: p, line: lineOf(src, im.at), layer: layer, message: 'service `' + mine + '` imports service `' + other + '` code — services must talk over the network (HTTP), not the filesystem' });
        });
      }
    });

    // ---- missing layer: a contract entity with no service module ----
    var contract = Engine.Contract && Engine.Contract.load && Engine.Contract.load();
    if (contract && Array.isArray(contract.entities)) {
      var svcNames = jsFiles.filter(function (p) { return /services\//.test(p); }).map(function (p) { return (p.match(/services\/(?:[^/]+\/)?([a-z0-9_-]+)(?:\/server)?\.js$/i) || [])[1]; });
      var pyMain = allFiles().some(function (p) { return /app\/services\//.test(p); });
      contract.entities.filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; }).forEach(function (e) {
        if (!pyMain && svcNames.indexOf(e.name) < 0 && !allFiles().some(function (p) { return new RegExp('services/(?:' + e.name + '/server|' + e.name + ')\\.js$').test(p); }))
          push({ rule: 'missing-service-layer', severity: 'low', file: '(repo)', line: 0, layer: 'service', message: 'contract entity `' + e.name + '` has no service module — its route handler is talking straight to the data layer' });
      });
    }

    var bySeverity = findings.reduce(function (m, f) { m[f.severity] = (m[f.severity] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (bySeverity.high || 0) * 20 - (bySeverity.medium || 0) * 8 - (bySeverity.low || 0) * 3);
    var layers = {};
    allFiles().forEach(function (p) { var l = layerOf(p); if (l !== 'other') layers[l] = (layers[l] || 0) + 1; });
    var report = { generatedAt: Date.now(), findings: findings, bySeverity: bySeverity, score: score, clean: findings.length === 0, layers: layers };

    if (S()) {
      S().write('architecture-findings.json', report);
      S().write('architecture-rules.md',
        '# Architecture rules\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Score ' + score + '/100** — ' + (bySeverity.high || 0) + ' high, ' + (bySeverity.medium || 0) + ' medium, ' + (bySeverity.low || 0) + ' low\n\n' +
        'Layers present: ' + (Object.keys(layers).length ? Object.keys(layers).map(function (k) { return k + ' (' + layers[k] + ')'; }).join(', ') : 'none detected') + '\n\n' +
        (findings.length ? findings.map(function (f) {
          return '- **' + f.severity.toUpperCase() + '** `' + f.rule + '` ' + f.file + (f.line ? ':' + f.line : '') + ' — ' + f.message;
        }).join('\n') : '_No layering violations._') + '\n');
      try {
        var ds = JSON.parse(S().read('decision-state.json') || '{}');
        ds.architecture = { at: report.generatedAt, score: score, high: bySeverity.high || 0 };
        S().write('decision-state.json', ds);
      } catch (_) {}
    }
    return report;
  }

  function load() { try { return JSON.parse((S() && S().read('architecture-findings.json')) || 'null'); } catch (_) { return null; } }

  Engine.ArchRules = { RULES: true, scan: scan, load: load, layerOf: layerOf };
  console.info('[ArchRules] architecture / layering scanner ready — Engine.ArchRules');
})();
