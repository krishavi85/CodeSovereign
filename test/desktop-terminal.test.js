'use strict';
/* dist/desktop/desktop-terminal.js — the IDE Terminal panel: a real,
 * multi-tab PTY terminal (xterm.js + node-pty) that also keeps its old
 * plain-text "Output" sink working, since desktop-exec.js and
 * desktop-app.js already depend on window.CSTerminal.run()/.push().
 *
 * This covers what's safe and meaningful to check without a real browser
 * DOM (innerHTML here doesn't get parsed back into queryable elements in
 * a vm context, so the full mount -> tab strip -> xterm attach path isn't
 * exercised here): the backward-compatible public API, the early-return
 * guards, and the "xterm.js failed to load" fallback path. The full live
 * mount (real shell picker populated, a real PTY tab opened, real input
 * typed through xterm and real PowerShell/CMD/Git Bash/WSL output read
 * back) was verified end to end against the actual rendered Electron UI
 * in this same development session.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeWin(overrides) {
  const procRunCalls = [];
  const win = {
    console,
    document: {
      readyState: 'complete',
      addEventListener() {},
      querySelector: () => null,
      createElement: () => ({ style: {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] })
    },
    addEventListener() {},
    desktop: {
      isDesktop: true,
      proc: { run: (opts) => { procRunCalls.push(opts); return Promise.resolve({ ok: true, stdout: 'ran\n', code: 0 }); } },
      terminal: {
        listShells: () => Promise.resolve({ shells: [{ id: 'powershell', label: 'Windows PowerShell' }] }),
        create: () => Promise.resolve({ ok: true, id: 'pty1', shellId: 'powershell', shellLabel: 'Windows PowerShell' }),
        sendInput: () => {},
        resize: () => {},
        kill: () => {},
        onData: () => {},
        onExit: () => {}
      }
    },
    S: { screen: 'welcome', idePanel: 'workflow' },
    toast() {}
  };
  win.window = win;
  win.__procRunCalls = procRunCalls;
  Object.assign(win, overrides || {});
  return win;
}

function load(win) {
  vm.createContext(win);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'dist', 'desktop', 'desktop-terminal.js'), 'utf8'),
    win,
    { filename: 'desktop-terminal.js' }
  );
  return win;
}

module.exports = async function (t) {
  const win = load(makeWin());

  t.ok('window.CSTerminal is exposed', !!win.CSTerminal);
  t.equal('CSTerminal.mountIfVisible is a function', typeof win.CSTerminal.mountIfVisible, 'function');
  t.equal('CSTerminal.run is a function', typeof win.CSTerminal.run, 'function');
  t.equal('CSTerminal.push is a function', typeof win.CSTerminal.push, 'function');
  t.equal('CSTerminal.clear is a function', typeof win.CSTerminal.clear, 'function');

  // push()/clear() must never throw even with nothing mounted yet - other
  // engines call these before the user has ever opened the Terminal tab.
  t.ok('push() does not throw before any mount', (() => { try { win.CSTerminal.push('hello\n'); return true; } catch (_) { return false; } })());
  t.ok('clear() does not throw before any mount', (() => { try { win.CSTerminal.clear(); return true; } catch (_) { return false; } })());

  // run() must still go through D.proc.run (desktop-exec.js's own engine),
  // not the new PTY manager - this is the "Output" sink's unchanged path.
  win.CSTerminal.run('npm', ['test']);
  await new Promise((r) => setImmediate(r));
  t.equal('run() delegates to window.desktop.proc.run (unchanged legacy path)', win.__procRunCalls.length, 1);
  t.deepEqual('run() passes the command/args through', { cmd: win.__procRunCalls[0].cmd, args: win.__procRunCalls[0].args }, { cmd: 'npm', args: ['test'] });

  // mountIfVisible() must be a safe no-op off the IDE/Terminal panel.
  t.ok('mountIfVisible() does nothing when not on the ide screen', (() => {
    win.S.screen = 'welcome'; win.S.idePanel = 'terminal';
    try { win.CSTerminal.mountIfVisible(); return true; } catch (_) { return false; }
  })());
  t.ok('mountIfVisible() does nothing when the terminal panel is not the active idePanel', (() => {
    win.S.screen = 'ide'; win.S.idePanel = 'workflow';
    try { win.CSTerminal.mountIfVisible(); return true; } catch (_) { return false; }
  })());

  // On the real terminal tab but with no matching DOM node found yet
  // (document.querySelector returns null in this harness) - still safe.
  t.ok('mountIfVisible() does nothing when the tab node is not found', (() => {
    win.S.screen = 'ide'; win.S.idePanel = 'terminal';
    try { win.CSTerminal.mountIfVisible(); return true; } catch (_) { return false; }
  })());

  // xterm.js missing -> a friendly fallback message, not a crash.
  {
    let assignedHtml = null;
    const bodyEl = { style: {}, querySelector: () => null, querySelectorAll: () => [] };
    Object.defineProperty(bodyEl, 'innerHTML', { set(v) { assignedHtml = v; }, get() { return assignedHtml; } });
    const tabParent = { parentElement: { lastElementChild: bodyEl } };
    const tabEl = { parentElement: tabParent };
    const win2 = load(makeWin({
      S: { screen: 'ide', idePanel: 'terminal' },
      document: {
        readyState: 'complete', addEventListener() {},
        querySelector: (sel) => (sel === '[data-idepanel="terminal"]' ? tabEl : null),
        createElement: () => ({ style: {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] })
      }
    }));
    win2.CSTerminal.mountIfVisible();
    t.ok('shows a fallback message when window.XtermTerminal/XtermFitAddon are missing', /Terminal UI failed to load/.test(assignedHtml || ''));
  }
};
