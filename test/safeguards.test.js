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
