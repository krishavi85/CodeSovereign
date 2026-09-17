/* =====================================================================
   engine.inline.js — Ctrl+K inline code edit (not the heavyweight Agent)

   Select a region, instruct a transform ("convert this to async",
   "add error handling", "document this function", "optimize this query").
   The selected area is rewritten in place. Required imports / docs can
   be generated with the change.

   Engine.Inline.transform(opts)      Promise
   Engine.Inline.transformSync(opts)  local heuristics only
   Engine.Inline.apply(result, content)
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});

  function firstImportPos(content) {
    const m = String(content || '').match(/^(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*|\s*)*/);
    return m ? m[0].length : 0;
  }

  function toAsync(sel) {
    let s = String(sel || '');
    if (/^\s*async\b/.test(s) || /\basync\s+function\b/.test(s)) {
      return { replacement: s, note: 'already async' };
    }
    if (/\bfunction\b/.test(s)) {
      s = s.replace(/\bfunction(\s+\w+|\s*\()/, 'async function$1');
    } else if (/=>/.test(s)) {
      s = s.replace(/(\b(?:const|let|var)\s+\w+\s*=\s*)(?!async\b)/, '$1async ');
      if (!/\basync\b/.test(s)) s = s.replace(/(\([^)]*\)|\w+)\s*=>/, 'async $1 =>');
    } else {
      s = 'async function run() {\n  ' + s.replace(/\n/g, '\n  ') + '\n}\n';
    }
    return { replacement: s };
  }

  function addErrorHandling(sel) {
    const s = String(sel || '');
    if (/\btry\s*\{/.test(s)) return { replacement: s, note: 'already has try/catch' };
    const indent = (s.match(/^(\s*)/) || ['', ''])[1];
    const body = s.replace(/^\s+/, '').replace(/\s+$/, '');
    const inner = body.split('\n').map(function (line) { return indent + '  ' + line; }).join('\n');
    return {
      replacement: indent + 'try {\n' + inner + '\n' + indent + '} catch (err) {\n' +
        indent + '  console.error(err);\n' + indent + '  throw err;\n' + indent + '}\n'
    };
  }

  function documentFunction(sel) {
    const s = String(sel || '');
    if (/^\s*\/\*\*/.test(s)) return { replacement: s, note: 'already documented' };
    const name = (s.match(/function\s+(\w+)/) || s.match(/(?:const|let|var)\s+(\w+)/) || [])[1] || 'fn';
    const argStr = (s.match(/function(?:\s+\w+)?\s*\(([^)]*)\)/) || s.match(/\(([^)]*)\)\s*(?:=>|\{)/) || [])[1] || '';
    const params = argStr.split(',').map(function (p) { return p.trim().replace(/=[\s\S]*/, '').trim(); }).filter(Boolean);
    const tags = params.map(function (p) { return ' * @param {*} ' + p; });
    const doc = '/**\n * ' + name + '\n' + (tags.length ? tags.join('\n') + '\n' : '') + ' * @returns {*}\n */\n';
    return { replacement: doc + s.replace(/^\s+/, ''), documentation: doc };
  }

  function optimizeQuery(sel) {
    let s = String(sel || '');
    if (/\bselect\b/i.test(s) && !/\blimit\b/i.test(s)) {
      s = s.replace(/\s*;?\s*$/, ' LIMIT 100');
    }
    s = s.replace(/\.find\(([^)]+)\)\.filter\(([^)]+)\)/, '.filter($2).find($1)');
    s = s.replace(/for\s*\(\s*let\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*(\w+)\.length\s*;\s*\1\+\+\s*\)\s*\{\s*([^\n]+)\s*\}/,
      '$2.forEach(function (_item, $1) { $3 })');
    return { replacement: s };
  }

  function neededImports(instruction, replacement, content) {
    const imports = [];
    const hay = (instruction + '\n' + replacement).toLowerCase();
    if (/\bfetch\s*\(/.test(replacement) && !/\bfetch\s*\(/.test(content.slice(0, 400)) && !/from ['"]node-fetch['"]/.test(content)) {
      if (/\bnode\b/.test(hay)) imports.push("import fetch from 'node-fetch';");
    }
    return imports;
  }

  function classify(instruction) {
    const t = String(instruction || '').toLowerCase();
    if (/\basync\b|await/.test(t) && /convert|make|turn|to /.test(t)) return 'async';
    if (/error handling|try\/?catch|handle errors|catch errors/.test(t)) return 'errors';
    if (/document|jsdoc|add comments|docstring/.test(t)) return 'docs';
    if (/optimiz|faster|performance|this query/.test(t)) return 'query';
    return 'generic';
  }

  function transformSync(opts) {
    opts = opts || {};
    const content = String(opts.content == null ? '' : opts.content);
    const start = Math.max(0, opts.selectionStart || 0);
    const end = Math.max(start, opts.selectionEnd == null ? start : opts.selectionEnd);
    let sel = content.slice(start, end);
    if (!sel) {
      const ls = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      let le = content.indexOf('\n', start);
      if (le < 0) le = content.length;
      sel = content.slice(ls, le);
      opts = Object.assign({}, opts, { selectionStart: ls, selectionEnd: le });
    }
    const instruction = String(opts.instruction || '');
    const kind = classify(instruction);
    let out;
    if (kind === 'async') out = toAsync(sel);
    else if (kind === 'errors') out = addErrorHandling(sel);
    else if (kind === 'docs') out = documentFunction(sel);
    else if (kind === 'query') out = optimizeQuery(sel);
    else out = { replacement: sel, note: 'no local heuristic; LLM can still rewrite' };
    out.kind = kind;
    out.imports = neededImports(instruction, out.replacement, content);
    out.selectionStart = opts.selectionStart != null ? opts.selectionStart : start;
    out.selectionEnd = opts.selectionEnd != null ? opts.selectionEnd : end;
    return out;
  }

  function apply(result, content) {
    content = String(content || '');
    if (!result) return { content: content, cursor: 0 };
    const start = result.selectionStart || 0;
    const end = result.selectionEnd == null ? start : result.selectionEnd;
    let next = content.slice(0, start) + String(result.replacement == null ? '' : result.replacement) + content.slice(end);
    const extra = (result.imports || []).filter(function (im) {
      return im && next.indexOf(im) < 0;
    });
    if (extra.length) {
      const at = firstImportPos(next);
      next = next.slice(0, at) + extra.join('\n') + '\n' + next.slice(at);
    }
    return { content: next, cursor: start + String(result.replacement || '').length + (extra.length ? extra.join('\n').length + 1 : 0) };
  }

  async function transform(opts) {
    const local = transformSync(opts);
    const LLM = Engine.LLM;
    if (!LLM || !LLM.complete || !LLM.llmAvailable || !LLM.llmAvailable()) return local;
    if (local.kind !== 'generic' && local.replacement && local.note !== 'no local heuristic; LLM can still rewrite') return local;
    try {
      const sel = String(opts.content || '').slice(local.selectionStart, local.selectionEnd);
      const res = await LLM.complete(
        'Instruction: ' + String(opts.instruction || '') + '\n\nSelected code:\n' + sel,
        null,
        {
          system: 'Rewrite ONLY the selected code. Return JSON: {"replacement":"...","imports":["import ..."],"documentation":"optional"}. No markdown. Keep the same language.'
        }
      );
      const parsed = LLM.extractJson ? LLM.extractJson(res.content) : null;
      if (parsed && typeof parsed.replacement === 'string' && parsed.replacement.length) {
        return {
          kind: 'llm',
          replacement: parsed.replacement,
          imports: Array.isArray(parsed.imports) ? parsed.imports : [],
          documentation: parsed.documentation || '',
          selectionStart: local.selectionStart,
          selectionEnd: local.selectionEnd
        };
      }
    } catch (_) {}
    return local;
  }

  Engine.Inline = {
    SEPARATE_FROM_AGENT: true,
    transform: transform,
    transformSync: transformSync,
    apply: apply,
    classify: classify
  };
})();
