'use strict';
const { app, Menu, shell } = require('electron');
const store = require('./lib/store');

/** Build the application menu. `send(action, payload)` posts to the focused renderer. */
function buildMenu(send) {
  const isMac = process.platform === 'darwin';
  const recents = (store.get('recents') || []).slice(0, 10);

  const recentItems = recents.length
    ? recents.map(r => ({ label: r.name + '  —  ' + r.path, click: () => send('open-recent', r.path) }))
    : [{ label: 'No recent projects', enabled: false }];

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('open-settings') },
        { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => send('new-project') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => send('open-folder') },
        { label: 'Open Recent', submenu: [
          ...recentItems,
          { type: 'separator' },
          { label: 'Clear Recent', enabled: recents.length > 0, click: () => send('clear-recents') }
        ] },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Alt+S', click: () => send('save-all') },
        { type: 'separator' },
        { label: 'Export Project as ZIP…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export-zip') },
        { label: 'Reveal in File Manager', click: () => send('reveal') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'Project',
      submenu: [
        { label: 'Run Command…', accelerator: 'CmdOrCtrl+Shift+R', click: () => send('run-command') },
        { label: 'Open Terminal', accelerator: 'CmdOrCtrl+`', click: () => send('open-terminal') },
        { label: 'Validate Workspace', accelerator: 'CmdOrCtrl+Shift+V', click: () => send('validate') },
        { type: 'separator' },
        { label: 'Take Snapshot Now', click: () => send('snapshot-now') },
        { label: 'Restore Snapshot…', click: () => send('restore-snapshot') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { role: 'toggleDevTools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])]
    },
    {
      role: 'help',
      submenu: [
        { label: 'CodeSovereign on GitHub', click: () => shell.openExternal('https://github.com/krishavi85/CodeSovereign') },
        { label: 'About', click: () => send('about') }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

function applyMenu(send) {
  Menu.setApplicationMenu(buildMenu(send));
}

module.exports = { buildMenu, applyMenu };
