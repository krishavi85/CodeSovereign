'use strict';
/* Parser & memory safeguards (M2 hardening). */
const os = require('os');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  // ---- atomic write in workspace.js ----
  {
    delete require.cache[require.resolve('../electron/lib/workspace')];
    const ws = require('../electron/lib/workspace');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-atomic-'));
    ws.setRoot(tmp);
    await ws.writeFile('/a.json', '{"x":1}');
    t.equal('atomic write lands the content', await ws.readFile('/a.json'), '{"x":1}');
    const stray = fs.readdirSync(tmp).filter((f) => f.includes('.cs-tmp-'));
    t.equal('no temp file left behind', stray.length, 0);
    const tree = await ws.readTree();
    t.ok('readTree ignores any in-flight temp file', !tree.files.some((f) => f.path.includes('.cs-tmp-')));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ---- observer destructive classifier ----
  {
    delete require.cache[require.resolve('../electron/lib/observer')];
    const observer = require('../electron/lib/observer');
    const D = observer.DESTRUCTIVE;
    for (const label of ['Delete account', 'Send message', 'Publish now', 'Pay $9', 'Confirm order', 'Deploy to prod', 'Revoke access']) {
      t.ok('destructive: "' + label + '"', D.test(label));
    }
    for (const label of ['View details', 'Open settings', 'Next page', 'Refresh', 'Search']) {
      t.ok('safe: "' + label + '"', !D.test(label));
    }

    // planControl: observe never submits a form; verify (the build's own
    // freshly started app) fills and submits creating forms; destructive
    // names are skipped in both. Live 2026-10-02: a todo app's only control
    // on an empty page was "+ Add Task", so it could never pass.
    const P = observer.planControl;
    const add = { name: '+ Add Task', tag: 'button', type: 'submit', inForm: true };
    const implicitSubmit = { name: 'Save', tag: 'button', type: '', inForm: true };
    const del = { name: 'Delete', tag: 'button', type: 'button', inForm: false };
    const sendForm = { name: 'Send message', tag: 'button', type: 'submit', inForm: true };
    const refresh = { name: 'Refresh', tag: 'button', type: 'button', inForm: false };
    t.equal('observe: a creating form is not submitted', P(add, 'observe'), 'skip');
    t.equal('verify: a creating form is filled and submitted', P(add, 'verify'), 'fill');
    t.equal('verify: a button that submits its form implicitly counts as a form submit', P(implicitSubmit, 'verify'), 'fill');
    t.equal('verify: a destructive-named button is still skipped', P(del, 'verify'), 'skip');
    t.equal('verify: a destructive-named form submit is still skipped', P(sendForm, 'verify'), 'skip');
    t.equal('verify/observe: a plain button is clicked', P(refresh, 'verify') + '/' + P(refresh, 'observe'), 'click/click');
    t.equal('interactive (user confirmed): destructive controls are clicked', P(del, 'interactive'), 'click');

    // FILL_FORM_JS on a minimal fake page
    const vm = require('vm');
    const field = (tag, type, extra) => Object.assign({ tagName: tag, value: '', disabled: false, readOnly: false, events: [],
      getAttribute: (k) => (k === 'type' ? type : null), dispatchEvent(e) { this.events.push(e.type); } }, extra || {});
    const fields = {
      title: field('INPUT', 'text'), due: field('INPUT', 'date'), email: field('INPUT', 'email'),
      count: field('INPUT', 'number', { min: '3' }), hidden: field('INPUT', 'hidden'), done: field('INPUT', 'checkbox'),
      prefilled: field('INPUT', 'text', { value: 'keep me' }), notes: field('TEXTAREA', null),
      pick: field('SELECT', null, { options: [{ value: '' }, { value: 'high' }] })
    };
    const form = { querySelectorAll: () => Object.values(fields) };
    const btn = { form };
    const ctx = vm.createContext({ document: { querySelector: (s) => (s === '[data-cs-obs="4"]' ? btn : null) }, Event: function (type) { this.type = type; }, Date });
    const filled = vm.runInContext(observer.FILL_FORM_JS(4), ctx);
    t.equal('fill: text fields get a sample value', fields.title.value, 'Test item');
    t.ok('fill: date fields get today (ISO)', /^\d{4}-\d{2}-\d{2}$/.test(fields.due.value));
    t.equal('fill: email fields get an email', fields.email.value, 'test@example.com');
    t.equal('fill: number fields respect min', fields.count.value, '3');
    t.equal('fill: textarea and select are filled', fields.notes.value + '|' + fields.pick.value, 'Test item|high');
    t.ok('fill: hidden, checkbox and already-filled fields are left alone', fields.hidden.value === '' && fields.done.value === '' && fields.prefilled.value === 'keep me');
    t.ok('fill: frameworks hear input and change events', fields.title.events.join() === 'input,change');
    t.equal('fill: reports how many fields it filled', filled, 6);
  }

  // ---- engine.sovereign redaction ----
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.sovereign.js'), 'utf8');
    const win = { console };
    win.window = win;
    win.Engine = { FS: { _data: {}, read: () => null, write: (p, c) => { win.__last = { p, c }; }, isFile: () => false, exists: () => false }, Proj: { current: () => null } };
    const ctx = vm.createContext(win);
    vm.runInContext(src, ctx, { filename: 'engine.sovereign.js' });
    const S = win.Engine.Sovereign;
    // write() redacts risky paths
    S.write('execution-evidence.json', { steps: { test: { tail: 'export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz012345 && npm test' } } });
    t.ok('GitHub token redacted in evidence file', /REDACTED/.test(win.__last.c) && !/ghp_abcdefghijklmnopqrstuvwxyz/.test(win.__last.c));
    S.write('known-issues.md', 'Found key sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF in config');
    t.ok('Anthropic key redacted', !/sk-ant-api03-AAAA/.test(win.__last.c));
    // non-risky path is untouched
    S.write('components.json', { note: 'password: hunter2 is a weak example' });
    t.ok('non-risky file left alone', /hunter2/.test(win.__last.c));
  }

  // ---- js-yaml anchor-bomb guard ----
  {
    const yamlSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'vendor', 'js-yaml.min.js'), 'utf8');
    const ppSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.pipeline-parse.js'), 'utf8');
    const bomb = 'a: &a [1,1]\n' + Array.from({ length: 300 }, (_, i) => `b${i}: *a`).join('\n');
    const win = { console };
    win.window = win;
    win.Engine = { FS: { _data: { '/.github/workflows/x.yml': { type: 'file', content: bomb } }, read: (p) => (p === '/.github/workflows/x.yml' ? bomb : null), isFile: () => true, exists: () => false } };
    const ctx = vm.createContext(win);
    vm.runInContext(yamlSrc, ctx, { filename: 'js-yaml.min.js' });
    vm.runInContext(ppSrc, ctx, { filename: 'engine.pipeline-parse.js' });
    const r = win.Engine.PipelineParse.parseAll();
    const p = r.pipelines[0];
    t.ok('anchor bomb is refused, not expanded', p && /anchor/i.test(p.error || ''));
  }
};
