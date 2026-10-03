/* =====================================================================
   engine.security.js  —  Engine.Security   (blueprint §17)

   A product security scanner over the workspace source (not the Electron
   shell — that is covered by electron/SECURITY.md). Static + AST rules for
   the things that actually get shipped:

     - SQL / command injection   (string-built queries / exec)
     - XSS                       (innerHTML / document.write with dynamic data)
     - path traversal            (req input -> fs path)
     - hardcoded secrets         (keys / tokens / passwords in source)
     - missing auth on mutating routes
     - weak crypto / eval / new Function
     - permissive CORS (`*`) / missing rate limiting
     - secrets committed to .env (not .env.example)

   window.Engine.Security
     RULES
     scan()      -> { generatedAt, findings:[...], bySeverity, score }  (writes
                    .sovereign/security-findings.json + security-report.md)
     load()      -> the written report or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function isProduct(p) { return !/^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor)\//.test(p); }
  function files(re) {
    return Object.keys(Engine.FS._data).filter(function (p) {
      return Engine.FS.isFile(p) && isProduct(p) && re.test(p);
    });
  }
  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

  // secret shapes (kept in sync with engine.sovereign redaction)
  var SECRET_RES = [
    { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/, what: 'GitHub token' },
    { re: /\bsk-(?:ant-)?[A-Za-z0-9-_]{20,}/, what: 'OpenAI/Anthropic key' },
    { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, what: 'Slack token' },
    { re: /\bAKIA[0-9A-Z]{16}\b/, what: 'AWS access key id' },
    { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, what: 'private key' },
    { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, what: 'JWT' },
    { re: /(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, what: 'credential literal', weak: true }
  ];
  // obvious placeholder / fixture values the credential-literal heuristic should ignore
  var PLACEHOLDER = /^(?:password\d*|passw0rd|changeme|secret\d*|test\d*|example|your[-_]?\w+|xx+|placeholder|dummy|s3cr3t|hunter2|admin123|topsecret)$/i;
  function isTestFile(p) { return /(^|\/)(test|tests|spec|__tests__|fixtures?|e2e|mocks?)\//i.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p); }

  var RULES = [
    { id: 'sql-injection', sev: 'high', glob: /\.(js|ts|mjs)$/,
      // fires on SQL text concatenated with a REQUEST-shaped value or an unguarded
      // ${…}. Interpolating an identifier (table / column / schema name) or using
      // $1/$2 placeholders + a params array is the safe pattern and is NOT flagged.
      re: /(?:query|execute|exec|raw)\s*\(\s*[`'"][^`'"]*(?:SELECT|INSERT|UPDATE|DELETE|DROP)[^`'"]*[`'"]?\s*\+\s*(?:req\b|request\b|ctx\.|[a-z$_][\w$]*?(?:[Ii]nput|[Pp]aram|[Qq]uery|[Bb]ody|[Uu]ser))|(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b[^;\n]*(?:\$\{(?!\s*(?:table|column|schema|tbl|col|e\.table|e\.name)\b)|['"]\s*\+\s*(?:req\b|request\b|ctx\.|params\b|query\b|body\b|[a-z$_][\w$]*?(?:[Ii]nput|[Pp]aram|[Qq]uery|[Bb]ody|[Uu]ser)))/i,
      msg: 'SQL text concatenated with request input — use parameterised queries ($1/$2 + a values array)' },
    { id: 'command-injection', sev: 'high', glob: /\.(js|ts|mjs)$/,
      re: /(?:exec|execSync)\s*\(\s*[`'"][^`'"]*\$\{|\bexec\s*\(\s*[^,)]*\+/,
      msg: 'shell command built from a variable — use execFile with an argv array' },
    { id: 'xss-innerhtml', sev: 'high', glob: /\.(js|ts|html)$/,
      re: /\.innerHTML\s*=\s*(?:[^;'"`]*(?:req\.|params|query|input|value|user|data)[^;]*|`[^`]*\$\{)|document\.write\s*\(/,
      msg: 'dynamic value written to innerHTML / document.write — sanitise or use textContent' },
    { id: 'path-traversal', sev: 'high', glob: /\.(js|ts|mjs)$/,
      re: /(?:readFile|readFileSync|createReadStream|sendFile|writeFile)\s*\([^)]*(?:req\.(?:url|params|query|body)|params\.|\.\.)/,
      msg: 'filesystem path derived from request input — resolve + assert containment first' },
    { id: 'eval', sev: 'medium', glob: /\.(js|ts|mjs|html)$/,
      re: /\beval\s*\(|new\s+Function\s*\(/,
      msg: 'eval / new Function — avoid dynamic code execution' },
    { id: 'weak-crypto', sev: 'medium', glob: /\.(js|ts|mjs)$/,
      re: /createHash\s*\(\s*["'](?:md5|sha1)["']\)|\bMath\.random\s*\(\s*\)[^;]{0,40}(?:token|secret|password|id|salt|nonce)/i,
      msg: 'weak hash (md5/sha1) or Math.random used for a security value — use scrypt/argon2 + crypto.randomBytes' },
    { id: 'cors-wildcard', sev: 'medium', glob: /\.(js|ts|mjs)$/,
      re: /['"]Access-Control-Allow-Origin['"]\s*[,:]\s*['"]\*['"]|cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/,
      msg: 'CORS Access-Control-Allow-Origin: * — scope to known origins' },
    { id: 'insecure-cookie', sev: 'low', glob: /\.(js|ts|mjs)$/,
      re: /set-cookie[^;\n]*=(?![^;\n]*(?:HttpOnly))/i,
      msg: 'cookie set without HttpOnly / Secure flags' }
  ];

  function findRoutes(src) {
    // very small route detector for the generated / common styles
    var out = [];
    var re = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]|req\.method\s*===\s*['"](GET|POST|PUT|PATCH|DELETE)['"][\s\S]{0,120}?req\.url|method\s*===\s*['"](POST|PUT|PATCH|DELETE)['"]/gi;
    var m;
    while ((m = re.exec(src))) out.push({ method: (m[1] || m[3] || m[4] || 'POST').toUpperCase(), at: m.index });
    return out;
  }

  function scan() {
    var findings = [];
    var push = function (f) { findings.push(f); };

    // rule sweep
    files(/\.(js|ts|mjs|jsx|tsx|html|json|env)$/).forEach(function (p) {
      var src = read(p);
      if (src.length > 400000) return;
      RULES.forEach(function (r) {
        if (!r.glob.test(p)) return;
        var m = r.re.exec(src);
        if (m) push({ rule: r.id, severity: r.sev, file: p, line: lineOf(src, m.index), message: r.msg, sample: String(m[0]).slice(0, 120).replace(/\s+/g, ' ') });
      });
      // secrets in real source (not the *.example template)
      if (!/\.example$/.test(p) && !/\/(README|CHANGELOG)/i.test(p)) {
        var testFile = isTestFile(p);
        SECRET_RES.forEach(function (s) {
          var mm = s.re.exec(src);
          if (!mm) return;
          // the weak "password: '...'" heuristic is noise in test fixtures and on
          // obvious placeholder values — downgrade to low / skip.
          if (s.weak) {
            var val = (mm[0].match(/["']([^"']+)["']\s*$/) || [])[1] || '';
            if (testFile || PLACEHOLDER.test(val)) {
              push({ rule: 'weak-credential-literal', severity: 'low', file: p, line: lineOf(src, mm.index), message: 'credential-shaped literal (' + (testFile ? 'test fixture' : 'placeholder value') + ') — confirm it is not real', sample: '[redacted]' });
              return;
            }
          }
          push({ rule: 'hardcoded-secret', severity: 'high', file: p, line: lineOf(src, mm.index), message: 'possible ' + s.what + ' committed in source', sample: '[redacted]' });
        });
      }
    });

    // committed .env (values, not .env.example)
    files(/(^|\/)\.env$/).forEach(function (p) {
      var body = read(p);
      if (/^[A-Z_]+=.+\S/m.test(body)) push({ rule: 'committed-env', severity: 'high', file: p, line: 1, message: '.env with real values is in the workspace — only commit .env.example' });
    });

    // missing auth on mutating routes
    files(/(server|app|index|routes?\/.+)\.(js|ts|mjs)$/).forEach(function (p) {
      var src = read(p);
      var hasAuth = /requireAuth|isAuthenticated|ensureAuth|passport|authorize|req\.user|Authorization|Bearer/.test(src);
      var mut = findRoutes(src).filter(function (r) { return r.method !== 'GET'; });
      if (mut.length && !hasAuth) {
        // heuristic ("no *visible* auth check") — legitimately intentional for
        // demo / internal / deliberately-public write endpoints, so medium not
        // high: it should be reviewed, not block a release on its own.
        push({ rule: 'unauthenticated-mutation', severity: 'medium', file: p, line: lineOf(src, mut[0].at),
          message: mut.length + ' mutating route(s) with no visible auth check — confirm this endpoint is meant to be public' });
      }
      if (mut.length && !/rate.?limit|throttle|slow.?down|express-rate/i.test(src)) {
        push({ rule: 'missing-rate-limit', severity: 'low', file: p, line: 1, message: 'no rate limiting on the API surface' });
      }
    });

    var bySeverity = findings.reduce(function (m, f) { m[f.severity] = (m[f.severity] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (bySeverity.high || 0) * 20 - (bySeverity.medium || 0) * 7 - (bySeverity.low || 0) * 2);
    var report = { generatedAt: Date.now(), findings: findings, bySeverity: bySeverity, score: score, clean: findings.length === 0 };

    if (S()) {
      S().write('security-findings.json', report);
      S().write('security-report.md',
        '# Security scan (product)\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Score ' + score + '/100** — ' + (bySeverity.high || 0) + ' high, ' + (bySeverity.medium || 0) + ' medium, ' + (bySeverity.low || 0) + ' low\n\n' +
        (findings.length ? findings.map(function (f) {
          return '- **' + f.severity.toUpperCase() + '** `' + f.rule + '` ' + f.file + ':' + f.line + ' — ' + f.message + (f.sample && f.sample !== '[redacted]' ? '\n  `' + f.sample + '`' : '');
        }).join('\n') : '_No product-security findings._') + '\n');
      try {
        var ds = JSON.parse(S().read('decision-state.json') || '{}');
        ds.security = { at: report.generatedAt, score: score, high: bySeverity.high || 0 };
        S().write('decision-state.json', ds);
      } catch (_) {}
    }
    return report;
  }

  function load() { try { return JSON.parse((S() && S().read('security-findings.json')) || 'null'); } catch (_) { return null; } }

  Engine.Security = { RULES: RULES, scan: scan, load: load };
  console.info('[Security] product security scanner ready — Engine.Security');
})();
