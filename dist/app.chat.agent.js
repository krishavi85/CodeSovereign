/* =====================================================================
 * app.chat.agent.js  —  tools + loop for the IDE chat panel's Agent mode
 *
 * DOM-free. The chat panel (app.chat.js) owns the UI; this file owns what the
 * model may DO and how a run proceeds:
 *
 *   window.CSChatAgent
 *     createToolbox(env)   -> { defs, proposals, call(name,args,hooks) }
 *     runLoop(opts)        -> Promise<{ reason, turns, text }>
 *     recoverTextToolCalls(text, names) -> { calls, rest }
 *     SYSTEM_PROMPT
 *
 * Tools: list_dir, read_file, grep, get_problems (read-only), write_file
 * (QUEUES a proposal — nothing is written; the user reviews it hunk by hunk),
 * run_command (package jobs only, each run needs the user's approval).
 * ===================================================================== */
(function () {
  'use strict';

  var MAX_TURNS = 12;
  var READ_CHARS = 12000;
  var OUT_CHARS = 6000;       // command output kept (the tail)
  var WRITE_MAX = 300000;
  var GREP_MAX = 60;
  var LIST_MAX = 200;
  var JOBS = ['install', 'test', 'build', 'lint', 'typecheck'];
  var SKIP = /(^|\/)(node_modules|\.git)(\/|$)/;

  var SYSTEM_PROMPT =
    'You are the CodeSovereign IDE agent, working inside the user\'s project.\n' +
    'You have tools: list_dir, read_file, grep, get_problems, write_file and run_command. ' +
    'Look before you change things: list and read the relevant files, then make the edit. ' +
    'write_file takes the COMPLETE new content of one file. It does not change anything yet — it queues a proposal ' +
    'that the user reviews hunk by hunk and may reject, so propose the smallest correct change and say what you changed and why. ' +
    'run_command runs one package job (install, test, build, lint, typecheck) and always asks the user first; ' +
    'use it to check your work when that is useful, not by default. ' +
    'Be concise. If a tool returns an error, read it and adjust instead of repeating the same call. ' +
    'When you are done, answer in plain language without calling more tools.';

  function normPath(p) {
    p = String(p == null ? '' : p).trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (!p) return '';
    return p.charAt(0) === '/' ? p : '/' + p;
  }
  function badPath(p) {
    if (!p) return 'a file path is required';
    if (/(^|\/)\.\.(\/|$)/.test(p)) return 'paths may not contain ".."';
    if (p.slice(-1) === '/') return 'that is a folder, not a file';
    if (SKIP.test(p)) return p + ' is in a folder tools may not touch (node_modules / .git)';
    return null;
  }
  function lineCount(s) { return s === '' ? 0 : String(s).split('\n').length; }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\n… (' + (s.length - n) + ' more characters)' : s; }
  function globRe(g) {
    var re = String(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0001/g, '.*');
    return new RegExp('^' + (String(g).indexOf('/') < 0 ? '(?:.*/)?' : '') + re + '$', 'i');
  }
  function fail(text, status) { return { ok: false, status: status || 'error', text: text, summary: text }; }

  /* ------------------------------------------------------------- tool defs */

  var DEFS = [
    { name: 'list_dir', description: 'List the files and folders directly inside a project folder.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Folder path, e.g. "/" or "/src".' } } } },
    { name: 'read_file', description: 'Read a project file (optionally a line range). Returns the current content, including any change you already proposed.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, start_line: { type: 'integer' }, end_line: { type: 'integer' } }, required: ['path'] } },
    { name: 'grep', description: 'Search project files for text (or a regex). Returns path:line: text.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, glob: { type: 'string', description: 'Optional file filter, e.g. "*.js" or "src/**".' }, regex: { type: 'boolean' } }, required: ['query'] } },
    { name: 'get_problems', description: 'List the problems the project validators currently report.',
      parameters: { type: 'object', properties: {} } },
    { name: 'write_file', description: 'Propose the COMPLETE new content of a file (creating it if new). Nothing is written until the user reviews and accepts it.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'run_command', description: 'Run one package job in the project. The user is asked to approve each run. Desktop app only.',
      parameters: { type: 'object', properties: { job: { type: 'string', enum: JOBS } }, required: ['job'] } }
  ];

  /* --------------------------------------------------------------- toolbox */

  // env: { list():[paths], read(path):string|null, getProblems():[{severity,file,message}],
  //        diffStats(a,b):{added,removed}, canWrite():bool, canCommand():bool,
  //        jobsAvailable():bool, runJob(job):Promise<{code,output,skipped?,timedOut?}> }
  function createToolbox(env) {
    var proposals = new Map();   // path -> { path, before, after, isNew }

    function paths() {
      var set = {};
      (env.list() || []).forEach(function (p) { if (!SKIP.test(p)) set[p] = true; });
      proposals.forEach(function (_v, p) { set[p] = true; });
      return Object.keys(set).sort();
    }
    function current(path) {
      var pr = proposals.get(path);
      if (pr) return pr.after;
      var c = env.read(path);
      return c == null ? null : String(c);
    }

    function listDir(a) {
      var dir = normPath(a.path || '/') || '/';
      if (dir.length > 1 && dir.slice(-1) === '/') dir = dir.slice(0, -1);
      var prefix = dir === '/' ? '/' : dir + '/', kids = {};
      paths().forEach(function (p) {
        if (p.indexOf(prefix) !== 0) return;
        var rest = p.slice(prefix.length), name = rest.split('/')[0];
        var isDir = rest.indexOf('/') >= 0;
        kids[name] = isDir ? { dir: true } : { lines: lineCount(current(p) || ''), proposed: proposals.has(p) };
      });
      var names = Object.keys(kids).sort();
      if (!names.length) return fail('No such folder or it is empty: ' + dir + '. Try list_dir with path "/".');
      var out = names.slice(0, LIST_MAX).map(function (n) {
        var k = kids[n];
        return k.dir ? n + '/' : n + '  (' + k.lines + ' lines' + (k.proposed ? ', changed by your proposal' : '') + ')';
      });
      var more = names.length > LIST_MAX ? '\n… ' + (names.length - LIST_MAX) + ' more' : '';
      return { ok: true, status: 'done', text: dir + ':\n' + out.join('\n') + more, summary: dir + ' — ' + names.length + ' entr' + (names.length === 1 ? 'y' : 'ies') };
    }

    function readFile(a) {
      var path = normPath(a.path), bad = badPath(path);
      if (bad) return fail(bad);
      var c = current(path);
      if (c == null) return fail('File not found: ' + path + '. Use list_dir or grep to find the right path.');
      var all = c.split('\n'), s = Math.max(1, parseInt(a.start_line, 10) || 1), e = Math.min(all.length, parseInt(a.end_line, 10) || all.length);
      var body = all.slice(s - 1, e).join('\n');
      var partial = s > 1 || e < all.length;
      var note = proposals.has(path) ? ' [includes your proposed change, not yet applied]' : '';
      return { ok: true, status: 'done',
        text: path + ' (' + all.length + ' lines' + (partial ? ', showing ' + s + '–' + e : '') + ')' + note + '\n' + clip(body, READ_CHARS),
        summary: path + ' — ' + (e - s + 1) + ' lines' };
    }

    function grep(a) {
      var q = String(a.query == null ? '' : a.query);
      if (!q) return fail('query is required');
      var re;
      try { re = new RegExp(a.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
      catch (e) { return fail('Invalid regular expression: ' + e.message); }
      var gre = a.glob ? globRe(a.glob) : null, hits = [], truncated = false;
      paths().forEach(function (p) {
        if (truncated || (gre && !gre.test(p.replace(/^\//, '')) && !gre.test(p))) return;
        var lines = String(current(p) || '').split('\n');
        for (var i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            if (hits.length >= GREP_MAX) { truncated = true; return; }
            hits.push(p + ':' + (i + 1) + ': ' + lines[i].trim().slice(0, 200));
          }
        }
      });
      return { ok: true, status: 'done',
        text: hits.length ? hits.join('\n') + (truncated ? '\n… more matches not shown (narrow the query or add a glob)' : '') : 'No matches for ' + JSON.stringify(q) + '.',
        summary: JSON.stringify(q) + ' — ' + hits.length + (truncated ? '+' : '') + ' match' + (hits.length === 1 ? '' : 'es') };
    }

    function getProblems() {
      var ps = [];
      try { ps = env.getProblems() || []; } catch (_) {}
      if (!ps.length) return { ok: true, status: 'done', text: 'No problems reported.', summary: 'no problems' };
      return { ok: true, status: 'done',
        text: ps.slice(0, 40).map(function (p) { return (p.severity || 'info') + ' ' + (p.file || '(project)') + ': ' + p.message; }).join('\n') + (ps.length > 40 ? '\n… ' + (ps.length - 40) + ' more' : ''),
        summary: ps.length + ' problem' + (ps.length === 1 ? '' : 's') };
    }

    function writeFile(a) {
      if (!env.canWrite()) return fail('Writing is turned off at the current autonomy level, so no change can be proposed.', 'blocked');
      var path = normPath(a.path), bad = badPath(path);
      if (bad) return fail(bad);
      if (typeof a.content !== 'string') return fail('content must be the complete new text of the file, as a string.');
      if (a.content.length > WRITE_MAX) return fail('content is too large (' + a.content.length + ' characters; the limit is ' + WRITE_MAX + ').');
      var disk = env.read(path), isNew = disk == null;
      var before = isNew ? '' : String(disk);
      if (!isNew && a.content === before) { proposals.delete(path); return fail('No change: that is already the file\'s content.'); }
      proposals.set(path, { path: path, before: before, after: a.content, isNew: isNew });
      var st = env.diffStats ? env.diffStats(before, a.content) : { added: lineCount(a.content), removed: lineCount(before) };
      return { ok: true, status: 'done',
        text: 'Proposed ' + (isNew ? 'new file ' : 'change to ') + path + ' (+' + st.added + ' −' + st.removed + '). It is NOT applied yet: the user will review it and may reject parts. Do not assume it exists on disk.',
        summary: path + (isNew ? ' (new)' : '') + ' +' + st.added + ' −' + st.removed };
    }

    function runCommand(a, hooks) {
      var job = String(a.job || '').toLowerCase();
      if (JOBS.indexOf(job) < 0) return Promise.resolve(fail('job must be one of: ' + JOBS.join(', ') + '. Arbitrary commands are not allowed.'));
      if (!env.jobsAvailable()) return Promise.resolve(fail('Commands run only in the desktop app with a project folder open.', 'blocked'));
      if (!env.canCommand()) return Promise.resolve(fail('Running commands is turned off at the current autonomy level.', 'blocked'));
      var ask = hooks && hooks.approve ? hooks.approve({ kind: 'command', job: job, label: 'Run the project\'s "' + job + '" job' }) : Promise.resolve(false);
      return Promise.resolve(ask).then(function (yes) {
        if (!yes) return { ok: false, status: 'denied', text: 'The user declined to run "' + job + '". Do not retry it; continue without, or explain what you wanted to check.', summary: job + ' — declined' };
        return env.runJob(job).then(function (r) {
          if (r && r.skipped) return { ok: true, status: 'done', text: job + ': skipped — ' + clip(r.output || 'nothing to run', 500), summary: job + ' — skipped' };
          var out = String((r && r.output) || ''), tail = out.length > OUT_CHARS ? '… (earlier output omitted)\n' + out.slice(-OUT_CHARS) : out;
          var code = r ? r.code : -1;
          return { ok: code === 0, status: code === 0 ? 'done' : 'error',
            text: job + ' finished with exit code ' + code + (r && r.timedOut ? ' (timed out)' : '') + '.\n' + tail,
            summary: job + ' — exit ' + code, detail: tail };
        }, function (e) { return fail(job + ' could not run: ' + ((e && e.message) || e)); });
      });
    }

    function call(name, args, hooks) {
      args = args && typeof args === 'object' ? args : {};
      try {
        switch (name) {
          case 'list_dir': return Promise.resolve(listDir(args));
          case 'read_file': return Promise.resolve(readFile(args));
          case 'grep': return Promise.resolve(grep(args));
          case 'get_problems': return Promise.resolve(getProblems());
          case 'write_file': return Promise.resolve(writeFile(args));
          case 'run_command': return runCommand(args, hooks);
          default: return Promise.resolve(fail('Unknown tool "' + name + '". Available: ' + DEFS.map(function (d) { return d.name; }).join(', ') + '.'));
        }
      } catch (e) { return Promise.resolve(fail('Tool "' + name + '" crashed: ' + ((e && e.message) || e))); }
    }

    return { defs: DEFS, proposals: proposals, call: call };
  }

  /* ------------------------------------------- tool calls written as text */

  // Some local models answer with the call as plain text — {"name":"read_file",
  // "parameters":{...}} — instead of a structured tool call. Pull those out.
  function recoverTextToolCalls(text, names) {
    text = String(text == null ? '' : text);
    var calls = [], rest = text, i = 0;
    var spans = [];
    while (i < text.length) {
      var open = text.indexOf('{', i);
      if (open < 0) break;
      var depth = 0, inStr = false, esc = false, end = -1;
      for (var j = open; j < text.length; j++) {
        var ch = text.charAt(j);
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end < 0) break;
      var obj = null;
      try { obj = JSON.parse(text.slice(open, end + 1)); } catch (_) { obj = null; }
      var args = obj && (obj.parameters != null ? obj.parameters : obj.arguments != null ? obj.arguments : obj.args);
      if (obj && typeof obj.name === 'string' && names.indexOf(obj.name) >= 0 && args !== undefined) {
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) { args = null; } }
        if (args && typeof args === 'object') {
          calls.push({ id: '', name: obj.name, arguments: JSON.stringify(args) });
          spans.push([open, end + 1]);
        }
      }
      i = end + 1;
    }
    for (var k = spans.length - 1; k >= 0; k--) rest = rest.slice(0, spans[k][0]) + rest.slice(spans[k][1]);
    // drop code fences that held only a recovered call
    rest = rest.replace(/```[a-z]*\s*```/gi, '').trim();
    return { calls: calls, rest: calls.length ? rest : text };
  }

  /* ----------------------------------------------------------------- loop */

  var idN = 0;
  function callId() { return 'call_' + Date.now().toString(36) + '_' + (++idN); }

  // opts: { chatStream(msgs,o), messages, toolbox, signal, maxTurns,
  //         approve(req)->Promise<bool>,
  //         onTurnStart(n), onText(delta), onTurnEnd({text,calls,aborted}),
  //         onToolStart(call), onToolDone(call,result), onNoTools() }
  function runLoop(opts) {
    var max = opts.maxTurns || MAX_TURNS, tb = opts.toolbox;
    var names = tb.defs.map(function (d) { return d.name; });
    var convo = opts.messages.slice(), seen = {}, turns = 0, repeats = 0, useTools = true;
    var cb = function (n) { return typeof opts[n] === 'function' ? opts[n] : function () {}; };
    var aborted = function () { return !!(opts.signal && opts.signal.aborted); };

    function turn() {
      if (aborted()) return Promise.resolve({ reason: 'aborted', turns: turns, text: '' });
      if (turns >= max) return Promise.resolve({ reason: 'max-turns', turns: turns, text: '' });
      turns++;
      cb('onTurnStart')(turns);
      return opts.chatStream(convo, { tools: useTools ? tb.defs : undefined, signal: opts.signal, onDelta: cb('onText') }).then(function (r) {
        return r;
      }, function (e) {
        // a provider that rejects the tools parameter: retry this turn without tools, once
        if (useTools && turns === 1 && /HTTP 4\d\d/.test(String((e && e.message) || e)) && !aborted()) {
          useTools = false; cb('onNoTools')();
          cb('onTurnEnd')({ text: '', calls: [], aborted: false, retry: true });
          turns--;
          return null;
        }
        throw e;
      }).then(function (r) {
        if (r === null) return turn();
        var text = r.text || '', calls = (r.toolCalls || []).slice();
        if (!calls.length && useTools) {
          var rec = recoverTextToolCalls(text, names);
          if (rec.calls.length) { calls = rec.calls; text = rec.rest; }
        }
        calls.forEach(function (c) { if (!c.id) c.id = callId(); });
        cb('onTurnEnd')({ text: text, calls: calls, aborted: !!r.aborted });
        if (r.aborted || aborted()) return { reason: 'aborted', turns: turns, text: text };
        if (!calls.length) return { reason: 'done', turns: turns, text: text };
        convo.push({ role: 'assistant', content: text, tool_calls: calls.map(function (c) { return { id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } }; }) });
        return calls.reduce(function (p, c) {
          return p.then(function (stop) {
            if (stop) return stop;
            var args = null;
            try { args = c.arguments ? JSON.parse(c.arguments) : {}; } catch (_) { args = null; }
            var shown = { id: c.id, name: c.name, args: args || {} };
            cb('onToolStart')(shown);
            var key = c.name + ' ' + JSON.stringify(args);
            seen[key] = (seen[key] || 0) + 1;
            var run;
            if (args === null) run = Promise.resolve(fail('The arguments were not valid JSON. Send a JSON object.'));
            else if (seen[key] > 2) { repeats++; run = Promise.resolve(fail('You have made this exact call ' + seen[key] + ' times already. Use a different approach or finish and explain.')); }
            else run = tb.call(c.name, args, { approve: opts.approve });
            return run.then(function (res) {
              cb('onToolDone')(shown, res);
              convo.push({ role: 'tool', tool_call_id: c.id, content: res.text });
              if (aborted()) return { reason: 'aborted', turns: turns, text: '' };
              if (repeats >= 2) return { reason: 'repeat', turns: turns, text: '' };
              return null;
            });
          });
        }, Promise.resolve(null)).then(function (stop) { return stop || turn(); });
      });
    }
    return turn();
  }

  window.CSChatAgent = {
    createToolbox: createToolbox, runLoop: runLoop, recoverTextToolCalls: recoverTextToolCalls,
    SYSTEM_PROMPT: SYSTEM_PROMPT, JOBS: JOBS, MAX_TURNS: MAX_TURNS, DEFS: DEFS
  };
})();
