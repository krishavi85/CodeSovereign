/* =====================================================================
   engine.intake.js  —  Engine.Intake   (blueprint / build-flow stage 1)

   Non-text prompt intake. Turns an attached spec document into structured
   build intent that the existing contract pipeline can consume, offline:

     - Markdown / plain-text spec  → entities (from "Entities" / "Data
       model" sections + tables), requirements (must / shall / should
       sentences), API routes, a distilled objective
     - JSON Schema / OpenAPI       → entities from `properties` /
       `components.schemas`, API requirements from `paths`
     - package.json / a repo tree  → detected stack + existing entities

   `enrichPrompt()` distils the document into a compact brief appended to
   the user's prompt, so `Engine.Contract.deriveFromPrompt` sees it with
   no change to that engine.

   window.Engine.Intake
     fromDocument(text, kind?)   -> { kind, objective, entities, requirements, apis, notes }
     enrichPrompt(prompt, docs)  -> a single string for deriveFromPrompt
     analyze(docs)               -> writes .sovereign/intake.json
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  function detectKind(text, hint) {
    if (hint && /json|schema|openapi/i.test(hint)) return 'json';
    var t = String(text || '').trim();
    if (t[0] === '{' || t[0] === '[') { try { JSON.parse(t); return 'json'; } catch (_) {} }
    if (/^#{1,6}\s|\n#{1,6}\s|\n[-*]\s/.test(t)) return 'markdown';
    return 'text';
  }

  var STOP = { the: 1, a: 1, an: 1, of: 1, and: 1, or: 1, to: 1, for: 1, with: 1, as: 1, is: 1, are: 1, be: 1, that: 1, this: 1, it: 1, in: 1, on: 1, by: 1, user: 1, users: 1, system: 1, application: 1, app: 1, page: 1, screen: 1 };
  function singular(w) { return w.replace(/ies$/, 'y').replace(/s$/, ''); }
  function normEntity(w) {
    return singular(String(w).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).replace(/\s+([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  /* ---------------- markdown / text ---------------- */
  function fromMarkdown(text) {
    var out = { kind: 'markdown', objective: '', entities: [], requirements: [], apis: [], notes: [] };
    var lines = String(text).split('\n');

    // objective — first non-heading paragraph, or the first heading
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      if (/^#{1,6}\s/.test(l)) { if (!out.objective) out.objective = l.replace(/^#{1,6}\s/, ''); continue; }
      out.objective = (out.objective ? out.objective + ' — ' : '') + l.slice(0, 200);
      break;
    }

    // sections
    var section = null;
    lines.forEach(function (raw) {
      var l = raw.trim();
      var h = l.match(/^#{1,6}\s+(.*)/);
      if (h) { section = h[1].toLowerCase(); return; }

      // entity section — bullet items ("- **Name**: field:type, …") / table rows
      if (section && /(entit|data model|\bmodel\b|schema|resource|object)/.test(section)) {
        var b = l.match(/^[-*]\s+(?:\*\*|__)?\s*([A-Z][A-Za-z0-9 _-]*?)\s*(?:\*\*|__)?\s*[:—–-]\s*(.+)$/);
        if (b) {
          var en = normEntity(b[1]);
          if (en && en.length > 1) {
            var fields = [];
            var TYPEWORD = /^(text|string|int|integer|number|float|bool|boolean|date|datetime|json|ref|id|email|uuid)$/i;
            (b[2].match(/`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s*(?::|\()\s*(text|string|int|integer|number|float|bool(?:ean)?|date|datetime|json|ref|id|email)/gi) || [])
              .forEach(function (m) { var p = m.split(/[:(]/); fields.push({ name: p[0].replace(/`/g, '').trim(), type: mapType(p[1]) }); });
            if (!fields.length) {
              (b[2].match(/\b([a-z][a-zA-Z0-9_]*)\b/g) || []).slice(0, 8).forEach(function (n) {
                if (n.length > 1 && !STOP[n] && !TYPEWORD.test(n) && !fields.some(function (f) { return f.name === n; })) fields.push({ name: n, type: /id$/i.test(n) ? 'ref' : 'text' });
              });
            }
            out.entities.push({ name: en, fields: fields });
          }
        }
        var row = l.match(/^\|\s*`?([a-zA-Z_]\w*)`?\s*\|\s*([a-zA-Z()0-9 ]+)\s*\|/);
        if (row && out.entities.length) {
          out.entities[out.entities.length - 1].fields.push({ name: row[1], type: mapType(row[2]) });
        }
      }

      // API section
      if (section && /(api|endpoint|route)/.test(section)) {
        var api = l.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/:{}-]*)/i);
        if (api) out.apis.push({ method: api[1].toUpperCase(), path: api[2] });
      }

      // requirements — anywhere
      if (/\b(must|shall|should|will|needs? to|is able to|can)\b/i.test(l) && l.length > 12 && l.length < 240 && !/^#{1,6}/.test(l)) {
        out.requirements.push(l.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim());
      }
    });

    dedupeEntities(out);
    out.requirements = uniq(out.requirements).slice(0, 40);
    return out;
  }

  function mapType(s) {
    s = String(s || '').toLowerCase();
    if (/int|number|float|decimal|count/.test(s)) return 'int';
    if (/bool/.test(s)) return 'bool';
    if (/date|time/.test(s)) return 'date';
    if (/json|object|array/.test(s)) return 'json';
    if (/ref|relation|fk|foreign/.test(s)) return 'ref';
    if (/id\b/.test(s)) return 'id';
    return 'text';
  }

  /* ---------------- json schema / openapi ---------------- */
  function fromJson(text) {
    var out = { kind: 'json', objective: '', entities: [], requirements: [], apis: [], notes: [] };
    var doc;
    try { doc = typeof text === 'string' ? JSON.parse(text) : text; } catch (_) { out.notes.push('document is not valid JSON'); return out; }

    out.objective = (doc.info && (doc.info.title || doc.info.description)) || doc.title || doc.description || 'imported JSON schema';

    // OpenAPI paths
    if (doc.paths) {
      Object.keys(doc.paths).forEach(function (p) {
        Object.keys(doc.paths[p]).forEach(function (m) {
          if (/^(get|post|put|patch|delete)$/i.test(m)) out.apis.push({ method: m.toUpperCase(), path: p });
        });
      });
    }
    // schemas -> entities
    var schemas = (doc.components && doc.components.schemas) || doc.definitions ||
      (doc.type === 'object' && doc.properties ? { root: doc } : null);
    if (schemas) {
      Object.keys(schemas).forEach(function (name) {
        var sc = schemas[name];
        var props = sc.properties || {};
        var fields = Object.keys(props).map(function (k) {
          var pr = props[k] || {};
          return { name: k, type: pr.$ref ? 'ref' : mapType(pr.format || pr.type), required: (sc.required || []).indexOf(k) >= 0 };
        });
        if (fields.length) out.entities.push({ name: normEntity(name), fields: fields });
      });
    }
    dedupeEntities(out);
    return out;
  }

  function dedupeEntities(out) {
    var seen = {};
    out.entities = out.entities.filter(function (e) {
      if (!e.name || seen[e.name]) return false; seen[e.name] = 1;
      var fs = {}; e.fields = (e.fields || []).filter(function (f) { if (!f.name || fs[f.name] || f.name === 'id') return false; fs[f.name] = 1; return true; }).slice(0, 12);
      return true;
    }).slice(0, 8);
  }
  function uniq(a) { var s = {}; return a.filter(function (x) { var k = x.toLowerCase().replace(/\s+/g, ' '); if (s[k]) return false; s[k] = 1; return true; }); }

  function fromDocument(text, kind) {
    var k = detectKind(text, kind);
    var r = k === 'json' ? fromJson(text) : fromMarkdown(text);
    return r;
  }

  /* ---------------- prompt enrichment ---------------- */
  function enrichPrompt(prompt, docs) {
    prompt = String(prompt || '').trim();
    docs = Array.isArray(docs) ? docs : (docs ? [docs] : []);
    if (!docs.length) return prompt;
    var parts = [];
    docs.forEach(function (d) {
      var text = typeof d === 'string' ? d : (d.text || d.content || '');
      var name = (d && d.name) || 'spec';
      var r = fromDocument(text, d && d.kind);
      var b = ['From the attached ' + r.kind + ' "' + name + '":'];
      if (r.objective) b.push('Goal: ' + r.objective);
      if (r.entities.length) b.push('Entities: ' + r.entities.map(function (e) {
        return e.name + (e.fields.length ? ' (' + e.fields.map(function (f) { return f.name; }).join(', ') + ')' : '');
      }).join('; '));
      if (r.apis.length) b.push('API: ' + r.apis.slice(0, 10).map(function (a) { return a.method + ' ' + a.path; }).join(', '));
      if (r.requirements.length) b.push('Requirements:\n' + r.requirements.slice(0, 20).map(function (s) { return '- ' + s; }).join('\n'));
      parts.push(b.join('\n'));
    });
    return (prompt ? prompt + '\n\n' : '') + parts.join('\n\n');
  }

  function analyze(docs) {
    docs = Array.isArray(docs) ? docs : (docs ? [docs] : []);
    var parsed = docs.map(function (d) {
      var r = fromDocument(typeof d === 'string' ? d : (d.text || d.content || ''), d && d.kind);
      return { name: (d && d.name) || 'spec', kind: r.kind, objective: r.objective,
        entities: r.entities.length, requirements: r.requirements.length, apis: r.apis.length };
    });
    var report = { generatedAt: Date.now(), present: parsed.length > 0, documents: parsed };
    if (S()) S().write('intake.json', report);
    return report;
  }

  function load() { try { var v = S() && S().read('intake.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Intake = { fromDocument: fromDocument, enrichPrompt: enrichPrompt, analyze: analyze, load: load, _detectKind: detectKind };
  console.info('[Intake] non-text prompt intake (spec docs / JSON schema) ready — Engine.Intake');
})();
