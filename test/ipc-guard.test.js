'use strict';
/* electron/lib/ipc-guard.js: IPC handlers answer only the app's own top-level page; checked in the main process. */
const path = require('path');
const { pathToFileURL } = require('url');
const guard = require('../electron/lib/ipc-guard');

module.exports = async function (t) {
  const RENDERER = path.join(__dirname, '..', 'dist', 'index.html');
  const good = pathToFileURL(RENDERER).href;
  const handlers = {}, ons = {};
  const ipcMain = { handle: (c, f) => { handlers[c] = f; }, on: (c, f) => { ons[c] = f; } };
  const refused = [];
  guard.install(ipcMain, guard.makeTrust(RENDERER), (c) => refused.push(c));
  let ran = 0;
  ipcMain.handle('fs:read', (_e, a) => { ran++; return 'data:' + a; });
  ipcMain.on('terminal:input', () => { ran++; });
  const ev = (url, parent) => ({ senderFrame: url == null ? null : { url, parent: parent || null } });

  t.equal('the app page is served', await handlers['fs:read'](ev(good), 'x'), 'data:x');
  t.equal('a hash or query on the app page is still the app page', await handlers['fs:read'](ev(good + '#/ide?x=1'), 'y'), 'data:y');
  if (process.platform === 'win32') t.equal('drive-letter case differences do not lock the app out (Windows)', await handlers['fs:read'](ev(good.replace(/file:\/\/\/(.)/, (m, d) => 'file:///' + d.toUpperCase())), 'z'), 'data:z');

  let err = null;
  try { await handlers['fs:read'](ev('https://evil.example/'), 'x'); } catch (e) { err = e; }
  t.ok('a web page is refused with an error', !!err && /IPC refused/.test(err.message));
  err = null; try { await handlers['fs:read'](ev('file:///C:/Users/x/other.html'), 'x'); } catch (e) { err = e; }
  t.ok('another local file is refused', !!err);
  err = null; try { await handlers['fs:read'](ev(good, { url: good }), 'x'); } catch (e) { err = e; }
  t.ok('a sub-frame of the app page is refused', !!err);
  err = null; try { await handlers['fs:read'](ev(null), 'x'); } catch (e) { err = e; }
  t.ok('a destroyed or missing frame is refused', !!err);
  err = null; try { await handlers['fs:read']({}, 'x'); } catch (e) { err = e; }
  t.ok('an event with no frame information is refused', !!err);
  t.equal('refused calls never reached the handler (only the accepted calls ran)', ran, process.platform === 'win32' ? 3 : 2);
  const before = ran;
  ons['terminal:input'](ev('https://evil.example/'));
  t.equal('a fire-and-forget channel from an untrusted page is dropped silently', ran, before);
  ons['terminal:input'](ev(good));
  t.equal('and runs for the app page', ran, before + 1);
  t.ok('every refusal was reported', refused.length >= 5);
};
