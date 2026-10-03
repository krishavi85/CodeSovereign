/* =====================================================================
   engine.privacy.js  —  Engine.Privacy   (blueprint §18)

   A PII / data-protection scanner over the generated workspace. Tracks
   where personal data can leak or be mishandled:

     - PII or secrets written to logs (console.* / logger with req.body,
       password, token, email, ssn, …)
     - PII placed in a URL / query string (ends up in access logs, history,
       Referer headers)
     - a password hash or raw password reachable in an API response
       (a user object sent without a sanitiser)
     - sensitive identifiers (SSN, card number, passport) stored as plain
       text columns
     - personal data leaving the system to a third-party host (server-side
       fetch/http to an external origin) with no disclosure
     - a user entity with no erasure path (right to be forgotten)
     - a web product collecting PII with no consent / privacy surface

   window.Engine.Privacy
     scan()  -> { generatedAt, findings, bySeverity, score, piiFields }
                writes .sovereign/privacy-findings.json + privacy-report.md
     load()  -> the written report or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function isProduct(p) { return !/^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor)\//.test(p); }
  function isTest(p) { return /(^|\/)(test|tests|spec|__tests__|fixtures?|e2e|mocks?)\//i.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p); }
  function srcFiles() {
    return Object.keys(Engine.FS._data).filter(function (p) {
      return Engine.FS.isFile(p) && isProduct(p) && !isTest(p) && /\.(js|ts|mjs|jsx|tsx|py)$/.test(p);
    });
  }
  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

  var SECRETY = /\b(password|passwordHash|pwd|passwd|token|apiKey|api_key|secret|privateKey|sessionToken|refreshToken|creditCard|cardNumber|cvv|ssn)\b/i;
  var PII_FIELD = /\b(email|phone|phoneNumber|firstName|lastName|fullName|dob|dateOfBirth|address|street|zip|postalCode|ssn|socialSecurity|passport|nationalId|driverLicense|ipAddress|lat|lng|latitude|longitude|creditCard|cardNumber)\b/i;
  var SENSITIVE_ID = /\b(ssn|socialSecurity|passport|nationalId|driverLicense|creditCard|cardNumber|cvv|bankAccount|iban|routingNumber)\b/i;

  function scan() {
    var findings = [];
    var push = function (f) { findings.push(f); };
    var files = srcFiles();

    // known PII columns from the contract / schema
    var piiFields = {};
    var contract = Engine.Contract && Engine.Contract.load && Engine.Contract.load();
    if (contract && Array.isArray(contract.entities)) {
      contract.entities.forEach(function (e) {
        (e.fields || []).forEach(function (f) { if (f && f.name && PII_FIELD.test(f.name)) piiFields[f.name] = e.name; });
      });
    }

    files.forEach(function (p) {
      var src = read(p);
      if (src.length > 400000) return;
      var isFrontend = /(^|\/)public\//.test(p);
      var isServer = !isFrontend;

      // ---- 1. PII / secrets in logs ----
      var logRe = /(?:console\.(?:log|info|warn|error|debug)|logger\.\w+|print)\s*\(([^;]{0,240})/g;
      var lm;
      while ((lm = logRe.exec(src))) {
        var args = lm[1];
        if (/\breq\.body\b|\breq\.headers\b|\bpayload\b/.test(args) || SECRETY.test(args)) {
          push({ rule: 'pii-in-logs', severity: 'high', file: p, line: lineOf(src, lm.index),
            message: 'log statement includes a secret or a whole request body — redact before logging', sample: args.slice(0, 90).replace(/\s+/g, ' ') });
        } else if (PII_FIELD.test(args) && !/\.length|\.id\b|count|\bexists\b/.test(args)) {
          push({ rule: 'pii-in-logs', severity: 'medium', file: p, line: lineOf(src, lm.index),
            message: 'log statement includes personal data (' + (args.match(PII_FIELD) || [])[0] + ') — log an id or a hash instead', sample: args.slice(0, 90).replace(/\s+/g, ' ') });
        }
      }

      // ---- 2. PII in a URL / query string ----
      var urlRe = /[`'"][^`'"]*[?&](email|password|token|ssn|phone|dob|api[_-]?key)=/gi;
      var um;
      while ((um = urlRe.exec(src))) {
        push({ rule: 'pii-in-url', severity: 'high', file: p, line: lineOf(src, um.index),
          message: 'personal data / a credential is put in a query string (' + um[1] + '=) — it lands in server logs, browser history and Referer headers; use a POST body or a header', sample: String(um[0]).slice(0, 90) });
      }

      // ---- 3. a credential serialised into a response ----
      if (isServer) {
        // an inline object literal carrying a secret key, handed to a responder
        var litRe = /(?:res\.(?:json|send)|\bsend\s*\(\s*res\b)[^;]{0,200}?\{[^{}();]*\b(password|passwordHash|passwd|secret|privateKey|apiKey|refreshToken)\b\s*:/g;
        var rm;
        while ((rm = litRe.exec(src))) {
          push({ rule: 'secret-in-response', severity: 'high', file: p, line: lineOf(src, rm.index),
            message: 'a response body includes a `' + rm[1] + '` field — never send a credential (or its hash) to a client' });
        }
        // a raw DB row / user object sent back where the model has a passwordHash
        // column and the file has no visible field allow-list
        if (/passwordHash/.test(src) && !/\bsafe\s*\(|sanitiz|pick\s*\(|omit\s*\(|publicUser|allow(?:ed)?Fields|toPublic/i.test(src)) {
          var rawRe = /(?:res\.(?:json|send)\s*\(|\bsend\s*\(\s*res\s*,[^,]+,\s*)(await\s+)?(db\.get\s*\(\s*['"]user['"]|[a-z_$][\w$]*Row|\buser\b(?!\s*[.:]))\s*[),]/g;
          var qm;
          while ((qm = rawRe.exec(src))) {
            push({ rule: 'unsanitised-user-response', severity: 'medium', file: p, line: lineOf(src, qm.index),
              message: 'a user record is sent in a response with no field allow-list — strip passwordHash and other internal columns first' });
          }
        }
      }

      // ---- 5. third-party data egress from the server ----
      if (isServer) {
        var egRe = /(?:fetch|axios(?:\.\w+)?|https?\.(?:get|request)|got|request)\s*\(\s*[`'"]https?:\/\/([a-z0-9.-]+)/gi;
        var em;
        while ((em = egRe.exec(src))) {
          var host = em[1].toLowerCase();
          if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)$/.test(host)) continue;
          push({ rule: 'third-party-egress', severity: 'medium', file: p, line: lineOf(src, em.index),
            message: 'server sends a request to an external host (' + host + ') — if any personal data is included this needs a processor agreement + a privacy-policy disclosure', sample: em[0].slice(0, 90) });
        }
      }
    });

    // ---- 4. sensitive identifiers stored as plain text ----
    Object.keys(piiFields).forEach(function (f) {
      if (SENSITIVE_ID.test(f)) {
        push({ rule: 'sensitive-id-plaintext', severity: 'medium', file: '(schema)', line: 0,
          message: '`' + f + '` on `' + piiFields[f] + '` is a highly sensitive identifier — store it encrypted or tokenised, not as a plain column' });
      }
    });

    // ---- 6. erasure path for user data ----
    var hasUser = contract && (contract.entities || []).some(function (e) { return e.name === 'user'; });
    if (hasUser) {
      var anyErasure = files.some(function (p) {
        var s = read(p);
        return /remove\s*\(\s*['"]user['"]|delete\s*\(\s*['"]user['"]|deleteAccount|eraseUser|\/api\/(account|users?)\b[^\n]*DELETE|method\s*===\s*['"]DELETE['"][\s\S]{0,80}user/i.test(s);
      });
      if (!anyErasure) push({ rule: 'no-erasure-path', severity: 'low', file: '(repo)', line: 0,
        message: 'the app stores user accounts but exposes no delete-my-data path (right to erasure)' });
    }

    // ---- 7. consent / privacy surface for a web product collecting PII ----
    if (Object.keys(piiFields).length) {
      var anyConsent = Object.keys(Engine.FS._data).some(function (p) {
        if (!Engine.FS.isFile(p) || !isProduct(p)) return false;
        return /privacy|consent|gdpr|ccpa|cookie|data-retention|\bdpa\b/i.test(p) || /privacy policy|consent|gdpr|right to erasure|data retention/i.test(read(p));
      });
      if (!anyConsent) push({ rule: 'no-consent-surface', severity: 'low', file: '(repo)', line: 0,
        message: 'the product collects personal data (' + Object.keys(piiFields).slice(0, 4).join(', ') + ') with no privacy-policy or consent surface anywhere in the repo' });
    }

    var bySeverity = findings.reduce(function (m, f) { m[f.severity] = (m[f.severity] || 0) + 1; return m; }, {});
    var score = Math.max(0, 100 - (bySeverity.high || 0) * 20 - (bySeverity.medium || 0) * 8 - (bySeverity.low || 0) * 3);
    var report = { generatedAt: Date.now(), findings: findings, bySeverity: bySeverity, score: score, clean: findings.length === 0, piiFields: piiFields };

    if (S()) {
      S().write('privacy-findings.json', report);
      S().write('privacy-report.md',
        '# Privacy / PII scan\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        '**Score ' + score + '/100** — ' + (bySeverity.high || 0) + ' high, ' + (bySeverity.medium || 0) + ' medium, ' + (bySeverity.low || 0) + ' low\n\n' +
        'Personal-data columns: ' + (Object.keys(report.piiFields).length ? Object.keys(report.piiFields).map(function (k) { return '`' + k + '` (' + report.piiFields[k] + ')'; }).join(', ') : 'none detected') + '\n\n' +
        (findings.length ? findings.map(function (f) {
          return '- **' + f.severity.toUpperCase() + '** `' + f.rule + '` ' + f.file + (f.line ? ':' + f.line : '') + ' — ' + f.message;
        }).join('\n') : '_No PII-handling findings._') + '\n');
      try {
        var ds = JSON.parse(S().read('decision-state.json') || '{}');
        ds.privacy = { at: report.generatedAt, score: score, high: bySeverity.high || 0 };
        S().write('decision-state.json', ds);
      } catch (_) {}
    }
    return report;
  }

  function load() { try { return JSON.parse((S() && S().read('privacy-findings.json')) || 'null'); } catch (_) { return null; } }

  Engine.Privacy = { scan: scan, load: load };
  console.info('[Privacy] PII / data-protection scanner ready — Engine.Privacy');
})();
