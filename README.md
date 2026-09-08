# CodeSovereign — AI App Factory

An "AI app factory" workspace: describe an app, and the built-in engine plans,
scaffolds, builds, validates, repairs, packages and documents it. Runs two ways:

- **Desktop app** (primary) — Electron, real folders on disk, real command
  execution, OS-keychain credentials. See [`electron/README.md`](electron/README.md).
- **Browser** (secondary) — the same UI as a static site; files live in
  IndexedDB, Supabase sync is optional.

## Run — desktop

```bash
npm install
npm start            # launch the desktop app
npm run dist:win     # build a Windows installer -> release/
```

Milestone 1 is in place: install on Windows, create or open a real local
project, generate / edit / preview files, run commands in a real terminal,
validate, save straight to disk, and reopen later. Details and roadmap in
[`electron/README.md`](electron/README.md).

## Run — browser

Any static file server pointed at [`dist/`](dist/) works:

```bash
npm run web          # or: npx serve dist
```

There is no build step for the browser build — `dist/` is the deployable
artifact as-is. The `dist/desktop/` scripts are inert without Electron.

## Layout

| Path | What it is |
|------|------------|
| `electron/` | Desktop shell: `main.js`, secure `preload.js`, native menu, and `lib/` (workspace fs, process exec, git, keychain, snapshots, zip). |
| `dist/` | The renderer / browser app. `index.html` loads the engine + UI modules in order. |
| `dist/desktop/` | Renderer-side desktop integration (disk-backed FS, real terminal, real git panel). No-ops in a browser. |
| `package.json` | Electron app manifest + `electron-builder` config. |
| `dist/oauth-callback.html` | Standalone OAuth redirect handler (used by the OAuth screen). |
| `dist/_init_marketplace.sql`, `dist/_init_phase8.sql` | Supabase schema for the optional marketplace / workspaces / ratings sync. |
| `CodeSovereign.dc.html` | Original Claude Design canvas mock-up (design reference only). |
| `test_codesovereign.mjs` | Playwright smoke test — **targets a remote deployment URL**, edit `BASE_URL` before use. |
| `screenshots/` | Output of the smoke test. |
| `_archive/` | Superseded material moved out during cleanup (old `app/` tree, dev scripts, venv). Safe to delete. |

## Screens

Top nav: Welcome · Agent · IDE · Factory · Pipelines · Marketplace · Workspaces ·
Ratings · Actions · GitHub · OAuth. Left rail: Welcome · Universal · Agent · IDE ·
Factory · Recovery · **Ultra Mode** · Settings.

**Ultra Mode** is the closed loop: one natural-language request →
`Engine.UltraMode` derives a machine-readable contract, generates a real
project, runs its real tests/build, observes it running, repairs what fails, and
returns **SOVEREIGN VERIFIED** or an honest blocked/failed result, gated on a
14-criterion Definition-of-Done (adds accessibility, visual-integrity, licence-compatibility and performance-health gates).

**Web targets** — generated → run → verified: vanilla **or**
React/Preact/Vue/Svelte/Angular frontends (vendored VDOM runtime, no build);
Node **or** pure-stdlib Python backends; REST **and/or** a zero-dep GraphQL
executor; RFC 6455 WebSockets; monolith **or** microservices (gateway +
per-domain services + compose); SQLite/Postgres/JSON; Docker/Compose/Kubernetes/
Helm/Terraform IaC.

**Runtime-adapter targets** — native **Android** (`gradle assembleDebug` + a
headless emulator + adb install/launch/screenshot/logcat), native **iOS**
(xcodebuild + simulator on a macOS worker), **EVM smart contracts** (bundled
`solc` + `@ethereumjs/vm` local deterministic chain — compile, deploy, run
transactions, inspect receipts), and **ML model training** (a real `python
train.py` run with a decreasing loss curve + a hashed checkpoint). Each
generates a real artifact and verifies it in a real runtime; if this host lacks
the runtime the run ends **BLOCKED** with the exact prerequisite —
`support ≠ environment availability`. See
[`docs/RUNTIME_ADAPTERS.md`](docs/RUNTIME_ADAPTERS.md) and
[`docs/ULTRAMODE_CLOSED_LOOP.md`](docs/ULTRAMODE_CLOSED_LOOP.md).

## Backend / Supabase

`dist/backend.js` has a hardcoded Supabase project URL and **publishable** anon
key. The app is fully functional without it (offline-first). To use your own
sync backend, replace `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `dist/backend.js`
and apply the two `_init_*.sql` files to your project.

## Deploy

`dist/` is a static bundle — deploy it to any static host (the CSP `connect-src`
already allows `*.supabase.co`, OpenAI, Anthropic and MiniMax endpoints for the
LLM/agent features). `oauth-callback.html` must be served from the same origin.

## Fixes applied in this pass

- Repaired UTF-8 mojibake throughout `dist/app.js` — em dashes, ellipses, arrows,
  check marks, middle dots and curly quotes had been replaced by `?` / `�`
  (~110 occurrences across toasts, labels, the terminal panel and the 19-stage
  spec view).
- Removed the `frame-ancestors` directive from the `<meta>` CSP in
  `dist/index.html` (ignored in `<meta>`, only valid as an HTTP header — it was
  logging a console error on every screen).
- Fixed the Phase-8 screen router: **Workspaces, Ratings, Actions and OAuth**
  never painted because their modules return an HTML string that the delegator
  discarded. Screen dispatch + `mount()` are now handled in the core `renderAll()`.
- Factory screen: `S.buildSubPhase` defaulted to `'components'` (no such key —
  the buckets are `component` / `logic` / `data`), so the artifact counter showed
  "undefined files" and no sub-phase was highlighted. Defaulted to `'all'` and
  hardened the counter.
- Minor: "1 file" vs "1 files" pluralization in the Modules panel.
