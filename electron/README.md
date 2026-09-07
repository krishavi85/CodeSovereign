# CodeSovereign Desktop (Electron)

This layer packages the existing `dist/` web app as a native desktop application
and connects its UI to real desktop capabilities. The renderer (`dist/`) is
**unchanged web code** — the desktop scripts in `dist/desktop/` are no-ops in a
browser and only activate when `window.desktop` (the preload bridge) is present.

## Run

```bash
npm install
npm start          # normal
npm run dev        # + DevTools, --dev flag
npm run smoke      # headless boot check (creates window, probes renderer, exits 0)
```

The browser build still works on its own: `npm run web` (serves `dist/` on :4173).

## Build a Windows installer

```bash
npm run dist:win   # -> release/CodeSovereign-0.1.0-x64.exe (NSIS installer)
                   #    release/CodeSovereign-0.1.0-portable.exe
npm run dist:dir   # -> release/win-unpacked/  (unpacked, fast, no installer)
```

First `dist:win` downloads `winCodeSign` + `nsis` (~150 MB, cached afterwards).
Builds are **unsigned** — Windows SmartScreen will warn until a code-signing
certificate is configured (`build.win.certificateFile` / `CSC_LINK`).
No custom app icon yet: drop a 256×256 `build/icon.ico` and electron-builder
picks it up.

## Architecture

```
electron/
  main.js            app lifecycle, BrowserWindow, session hardening, all ipcMain handlers
  preload.js         the ONLY renderer<->OS channel — exposes window.desktop
  menu.js            native menu; menu clicks post {action} to the renderer
  lib/
    workspace.js     the open folder + path-safe fs ops (rejects anything outside root)
    proc.js          child_process: managed spawn (streamed), one-shot run (allowlisted), interactive shell
    git.js           system `git`, scoped to the workspace
    creds.js         API keys encrypted with safeStorage (OS keychain) -> <userData>/credentials.json
    snapshots.js     automatic crash-recovery snapshots -> <userData>/snapshots/<project>/
    zip.js           dependency-free ZIP writer for "export project"
    store.js         window bounds + recent projects -> <userData>/desktop-state.json

dist/desktop/
  desktop-fs.js       makes Engine.FS disk-backed (sync mirror + ordered write-behind queue)
  desktop-app.js      New Project / Open Folder / recents / Save / Export ZIP / menu wiring / LLM key migration
  desktop-terminal.js real terminal in the IDE "Terminal" panel (live shell + managed command runs)
  desktop-git.js      real `git status` / stage+commit in the IDE "Git" panel
```

### Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- renderer reaches the OS only through the typed `window.desktop` bridge
- every path from the renderer is resolved against the open workspace root in
  **main** and rejected if it escapes; `.git/`, `node_modules/`, etc. are
  write-protected
- `proc.run()` (the programmatic "run a command" surface) is allowlisted to
  project tooling; arbitrary commands only run in the interactive terminal the
  user drives
- external links open in the system browser; all permission requests are denied
- API keys never touch `localStorage` in desktop mode — they live in the OS
  keychain via `safeStorage`

### How the filesystem bridge works

`Engine.FS` stays fully synchronous (the whole app depends on that). In desktop
mode it becomes a working mirror of a real folder:

1. **Open** → `workspace.readTree()` bulk-loads every text file into `FS._data`.
2. **Edit / scaffold / repair** → `FS.write/remove/mkdir/rename` update memory
   *and* enqueue the matching disk op (`window.desktop.fs.*`), applied strictly
   in order, flushed on window close.
3. **localStorage** is no longer the source of truth for files (`cs.fs.v1` /
   `cs.proj.v1` are cleared on desktop start). It still holds settings, recent
   projects and UI state.

With no folder open you get a **scratch project** (memory only) and a banner
prompting New Project / Open Folder.

## Status

**Done (Milestone 1):** secure shell + bridge, real disk FS, native
open/create/save/export, recents + reopen-last, terminal & command execution,
local git panel, safeStorage credentials, auto snapshots + restore, native menu
& shortcuts, crash reload, Windows packaging.

**Next:** code signing + auto-update feed, macOS/Linux packaging, replace the
Factory "native build" animation with real per-framework build runs and parsed
logs, replace the "deploy" bundle download with real provider deploys, richer
terminal (PTY/ANSI colour).
