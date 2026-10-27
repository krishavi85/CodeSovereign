'use strict';
/* IDE agent chat panel, phase 2: @mentions + context chips, and Apply-to-file
 * feeding the editor's per-hunk review. Loads dist/app.chat.js in a vm with a
 * fake FS / S / CSEditor, so the review hand-off is checked without Monaco. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function load(extra) {
  const store = {};
  const win = Object.assign({
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    setTimeout, clearTimeout, AbortController,
    document: { getElementById: () => null }
  }, extra || {});
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.chat.js'), 'utf8'), vm.createContext(win), { filename: 'app.chat.js' });
  return { win, Chat: win.CSChat, core: win.CSChat.core };
}

function makeFS(files) {
  const d = Object.assign({}, files);
  return {
    _data: d,
    isFile: (p) => Object.prototype.hasOwnProperty.call(d, p),
    read: (p) => (Object.prototype.hasOwnProperty.call(d, p) ? d[p] : null),
    write: (p, c) => { d[p] = c; },
    remove: (p) => { delete d[p]; }
  };
}

module.exports = async function (t) {
  const FILES = ['/index.html', '/src/app.js', '/src/util.js', '/lib/util.js', '/README.md'];

  /* ---------- mention parsing ---------- */
  {
    const { core } = load();
    const kinds = (txt) => core.parseMentions(txt, FILES).map((m) => m.kind + ':' + (m.path || m.token));
    t.deepEqual('keyword mentions are recognised', kinds('look at @selection and @problems and @file'), ['selection:@selection', 'problems:@problems', 'file:@file']);
    t.deepEqual('a full path resolves, with or without the leading slash', kinds('see @/src/app.js and @src/app.js'), ['path:/src/app.js', 'path:/src/app.js']);
    t.deepEqual('a unique bare filename resolves', kinds('open @README.md'), ['path:/README.md']);
    t.deepEqual('an ambiguous bare filename (two util.js) is not guessed', kinds('open @util.js'), []);
    t.deepEqual('unknown names and emails are not mentions', kinds('mail me@example.com or @nothing.js'), []);
    t.deepEqual('trailing punctuation is not part of the mention', kinds('is it in @/src/app.js?'), ['path:/src/app.js']);
    const m = core.parseMentions('x @selection y', FILES)[0];
    t.ok('mention offsets point at the token', 'x @selection y'.slice(m.start, m.end) === '@selection');
  }

  /* ---------- attachments ---------- */
  {
    const { core } = load();
    const env = {
      files: FILES, read: (p) => ({ '/src/app.js': 'console.log(1);', '/README.md': '# hi' }[p] || null),
      active: { path: '/index.html', content: '<html></html>' }, includeActive: true,
      selection: { path: '/index.html', text: '<html>', startLine: 3, endLine: 4 },
      problems: [{ severity: 'error', file: '/src/app.js', message: 'JS syntax error' }]
    };
    const r = core.resolveAttachments('why @/src/app.js with @selection and @problems?', env);
    t.deepEqual('blocks hold each attachment in mention order', r.blocks.map((b) => b.label.split(' (')[0]), ['/src/app.js', 'selection of /index.html', 'problems']);
    t.ok('file content, selection text and problems text are attached', r.blocks[0].body === 'console.log(1);' && r.blocks[1].body === '<html>' && /error \/src\/app\.js: JS syntax error/.test(r.blocks[2].body));
    t.ok('the selection label carries its line range', /lines 3–4/.test(r.blocks[1].label));
    t.deepEqual('chips: the open file first, then each mention', r.chips.map((c) => c.kind), ['open', 'path', 'selection', 'problems']);
    t.ok('mention chips remember their token so they can be removed', r.chips[1].token === '@/src/app.js');

    const dup = core.resolveAttachments('@/index.html and @file', env);
    t.equal('mentioning the already-open file does not attach it twice', dup.blocks.length, 0);

    const off = core.resolveAttachments('hi', Object.assign({}, env, { includeActive: false }));
    t.equal('the open-file chip disappears when excluded', off.chips.length, 0);

    const none = core.resolveAttachments('@selection @problems', Object.assign({}, env, { selection: null, problems: [] }));
    t.ok('an empty selection / empty Problems list attach nothing and say why', none.blocks.length === 0 && none.notes.length === 2 && /nothing is selected/.test(none.notes[0]));

    const big = core.resolveAttachments('@/src/app.js @README.md', Object.assign({}, env, { read: () => 'x'.repeat(30000) }));
    t.ok('each attachment is capped, and the total is budgeted', big.blocks[0].body.length === 12000 && /first 12000/.test(big.blocks[0].label) && big.blocks.length + big.notes.length === 2);

    const msgs = core.buildMessages([{ role: 'user', content: 'q' }], { attachments: r.blocks, notes: ['careful'] });
    t.ok('attachments and notes reach the system prompt', /Attached by the user — \/src\/app\.js/.test(msgs[0].content) && /console\.log\(1\);/.test(msgs[0].content) && /Note: careful/.test(msgs[0].content));
  }

  /* ---------- apply targets ---------- */
  {
    const { core } = load();
    const T = (src, i, active) => core.applyTarget(src, i, FILES, active === undefined ? '/index.html' : active);
    t.deepEqual('a path after the language in the fence wins', T('```js /src/app.js\nx\n```', 0), { path: '/src/app.js', exists: true, source: 'fence' });
    t.equal('title=path style info strings work', T('```js title="src/util.js"\nx\n```', 0).path, '/src/util.js');
    t.deepEqual('a path in the fence that does not exist yet is a new file', T('```js /src/new.js\nx\n```', 0), { path: '/src/new.js', exists: false, source: 'fence' });
    t.deepEqual('else a backticked existing file in the prose before it', T('Update `/README.md` like this:\n```md\n# x\n```', 0), { path: '/README.md', exists: true, source: 'text' });
    t.deepEqual('else the open file', T('```js\nx\n```', 0), { path: '/index.html', exists: true, source: 'open' });
    t.equal('no hints and no open file means no target', T('```js\nx\n```', 0, null), null);
    t.equal('the language alone is never taken for a path', T('```js\nx\n```', 0, null), null);
    t.equal('each block is matched with its own prose', T('Edit `/README.md`:\n```md\na\n```\nand `/src/app.js`:\n```js\nb\n```', 1).path, '/src/app.js');
    t.equal('an index past the last block has no target', T('```js\nx\n```', 3), null);
    const html = core.renderMarkdown('```js /src/app.js\nlet a;\n```', { applyLabel: () => '/src/app.js' });
    t.ok('an Apply button appears only when a label is given', /data-cs-apply="0"/.test(html) && !/data-cs-apply/.test(core.renderMarkdown('```js\nlet a;\n```')));
    t.ok('the Apply label is escaped', !/<img/.test(core.renderMarkdown('```js\nx\n```', { applyLabel: () => '<img src=x>' })));
  }

  /* ---------- send() carries mentions ---------- */
  {
    let seen = null;
    const FS = makeFS({ '/a.js': 'let a = 1;', '/b.js': 'let b = 2;' });
    const AI = { ready: () => true, status: () => ({ connected: true }), chatStream: (msgs, o) => { seen = msgs; o.onDelta('ok'); return Promise.resolve({ text: 'ok' }); } };
    const editor = { value: 'let a = 1;', selectionStart: 4, selectionEnd: 5 };
    const { Chat } = load({
      Engine: { AI, FS, Validator: { runAll: () => [{ severity: 'warning', file: '/b.js', message: 'unused b' }] } },
      S: { ideFile: '/a.js', ideBuffer: 'let a = 1;' }, CSEditor: { ready: true, current: () => editor }
    });
    const bot = await Chat.send('explain @/b.js, this @selection and @problems');
    const sys = seen[0].content;
    t.ok('the mentioned file, the selection and the problems are in the prompt', /Attached by the user — \/b\.js[^]*let b = 2;/.test(sys) && /selection of \/a\.js \(lines 1–1\)[^]*\na\n/.test(sys) && /warning \/b\.js: unused b/.test(sys));
    const um = Chat.thread().messages[0];
    t.deepEqual('the user message records its chips (not the open-file chip)', um.chips.map((c) => c.kind), ['path', 'selection', 'problems']);
    t.deepEqual('and the selection it referred to, for Apply later', um.sel, { path: '/a.js', text: 'a' });
    t.ok('the question text is stored exactly as typed', um.content === 'explain @/b.js, this @selection and @problems' && bot.content === 'ok');
    Chat.newThread();
    await Chat.send('hello');
    t.ok('a message with no mentions attaches nothing extra', !/Attached by the user/.test(seen[0].content));
  }

  /* ---------- applyToFile -> review ---------- */
  {
    const make = (files, ideFile, buffer, edOver) => {
      const FS = makeFS(files);
      const S = { ideFile, ideBuffer: buffer, ideDirty: false, screen: 'welcome' };
      const reviews = [];
      const ed = Object.assign({ value: buffer || '', focus() {}, review(o) { reviews.push(o); return { ok: true }; } }, edOver || {});
      const E = { ready: true, current: () => ed, reviewing: () => false };
      const toasts = [];
      const { win, Chat } = load({ Engine: { FS, AI: {} }, S, CSEditor: E, renderAll: () => { win._renders = (win._renders || 0) + 1; }, toast: (m) => toasts.push(m) });
      return { win, Chat, FS, S, ed, E, reviews, toasts };
    };

    // existing open file
    let x = make({ '/a.js': 'let a = 1;\n' }, '/a.js', 'let a = 1;\n');
    let r = x.Chat.applyToFile('/a.js', 'let a = 2;\n');
    await wait(160);
    t.ok('apply to the open file starts a review and shows the new text in the editor', r.ok && x.reviews.length === 1 && x.ed.value === 'let a = 2;\n');
    t.equal('the review compares against the text as it was', x.reviews[0].original, 'let a = 1;\n');
    t.equal('nothing is written to disk by applying', x.FS.read('/a.js'), 'let a = 1;\n');
    t.ok('the IDE is switched to that file and re-rendered', x.S.ideFile === '/a.js' && x.S.screen === 'ide' && x.win._renders >= 1);
    x.reviews[0].onEnd({ reason: 'done', text: 'let a = 2;\n', accepted: 1, rejected: 0 });
    t.ok('accepting leaves the buffer dirty (saved with Ctrl+S, like Ctrl+K)', x.S.ideBuffer === 'let a = 2;\n' && x.S.ideDirty === true);
    x.reviews[0].onEnd({ reason: 'done', text: 'let a = 1;\n', accepted: 0, rejected: 1 });
    t.ok('rejecting every hunk leaves the file clean', x.S.ideDirty === false);

    // identical content
    x = make({ '/a.js': 'same' }, '/a.js', 'same');
    r = x.Chat.applyToFile('/a.js', 'same');
    t.ok('applying identical text is refused with a reason', r.ok === false && /nothing to apply/.test(r.error) && x.reviews.length === 0);

    // new file, rejected -> removed
    x = make({ '/a.js': 'a' }, '/a.js', 'a');
    r = x.Chat.applyToFile('/new/b.js', 'brand new');
    t.ok('a new file is created empty so it has an editor model', r.ok && x.FS.isFile('/new/b.js') && x.FS.read('/new/b.js') === '');
    await wait(160);
    t.ok('the new file is shown as all-added against an empty original', x.reviews[0].original === '' && x.ed.value === 'brand new' && x.S.ideFile === '/new/b.js');
    x.reviews[0].onEnd({ reason: 'rejected', text: '', accepted: 0, rejected: 1 });
    t.ok('rejecting a new file removes it again', !x.FS.isFile('/new/b.js') && x.S.ideFile === null);

    // switching from a dirty file is refused
    x = make({ '/a.js': 'a', '/b.js': 'b' }, '/a.js', 'a edited');
    x.S.ideDirty = true;
    r = x.Chat.applyToFile('/b.js', 'b2');
    t.ok('switching files while the open one has unsaved edits is refused', r.ok === false && /save or revert/.test(r.error) && x.S.ideFile === '/a.js');

    // a review already open
    x = make({ '/a.js': 'a' }, '/a.js', 'a');
    x.E.reviewing = () => true;
    r = x.Chat.applyToFile('/a.js', 'b');
    t.ok('applying during another review is refused', r.ok === false && /review/.test(r.error));

    // selection replacement
    x = make({ '/a.js': 'one\ntwo\nthree\n' }, '/a.js', 'one\ntwo\nthree\n');
    r = x.Chat.applyToFile('/a.js', 'TWO\n', { selection: { text: 'two' } });
    await wait(160);
    t.equal('with a selection only that text is replaced', x.ed.value, 'one\nTWO\nthree\n');

    x = make({ '/a.js': 'dup dup' }, '/a.js', 'dup dup');
    x.Chat.applyToFile('/a.js', 'NEW', { selection: { text: 'dup' } });
    await wait(160);
    t.equal('an ambiguous selection (appears twice) falls back to replacing the whole file', x.ed.value, 'NEW');

    // no Monaco: buffer is filled, unsaved, with a visible warning
    x = make({ '/a.js': 'a' }, '/a.js', 'a', { review: undefined });
    r = x.Chat.applyToFile('/a.js', 'b');
    await wait(4500);
    t.ok('without a reviewable editor the text goes to the buffer unsaved and the user is told', x.S.ideBuffer === 'b' && x.S.ideDirty === true && x.FS.read('/a.js') === 'a' && x.toasts.some((m) => /without hunk review/.test(m)));
  }

  /* ---------- applyBlock picks target + selection from the conversation ---------- */
  {
    const FS = makeFS({ '/a.js': 'let x = 1;\nlet y = 2;\n' });
    const S = { ideFile: '/a.js', ideBuffer: 'let x = 1;\nlet y = 2;\n', ideDirty: false };
    const reviews = [];
    const ed = { value: S.ideBuffer, focus() {}, review(o) { reviews.push(o); return {}; } };
    const AI = { ready: () => true, status: () => ({ connected: true }), chatStream: (m, o) => { const r = '```js\nlet y = 3;\n```'; o.onDelta(r); return Promise.resolve({ text: r }); } };
    const { Chat } = load({ Engine: { AI, FS }, S, CSEditor: { ready: true, current: () => Object.assign(ed, { selectionStart: 11, selectionEnd: 21 }), reviewing: () => false }, renderAll() {}, toast() {} });
    const bot = await Chat.send('change @selection to 3');
    // selection was "let y = 2;" (offsets 11..21)
    const out = Chat.applyBlock(bot.id, 0);
    await wait(160);
    t.ok('Apply uses the @selection the question was about', out.ok && ed.value === 'let x = 1;\nlet y = 3;\n');
    t.ok('Apply on an unknown message is a clean error', Chat.applyBlock('nope', 0).ok === false);
  }
};
