# CodeSovereign — AI App Factory

An "AI app factory" workspace: describe an app (or hand it a Figma export),
and the built-in engine plans, scaffolds, builds, validates, repairs, packages
and documents it. Runs two ways:

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

The app has four screens, reached from the icon rail on the left:

- **Home** — describe an app (or attach a spec / Figma export) and generate it, or start from a template.
- **Agent** — watch a generation run: plan, files, logs, evidence.
- **IDE** — your project's files in an editor, with a chat panel on the right (Ask, Plan, Edit, Agent, Auto modes — see [`docs/NATIVE_AGENT.md`](docs/NATIVE_AGENT.md)), a terminal, git and a live preview.
- **Settings** — Project, AI & Models, Agents, Integrations, Advanced, About.

The top bar shows the model that is actually connected (it says so when none is) plus Run Preview and Export (packages the project as a downloadable bundle; nothing is published anywhere). Controls that were not connected to any behaviour (an environment switch, "run on AWS Lambda" targets, tool switches, sampling sliders, a vector-database choice) have been removed rather than left as decoration.

**Welcome** (which absorbed the former Universal and Ultra Mode tabs) runs the
closed loop: one natural-language request →
the engine derives a machine-readable contract, generates a real
project, runs its real tests/build, observes it running, repairs what fails, and
returns **SOVEREIGN VERIFIED** or an honest blocked/failed result, gated on a
14-criterion Definition-of-Done (adds accessibility, visual-integrity, licence-compatibility and performance-health gates).

Every run also produces, offline: the **documentation set** (`README` + `docs/API`
+ `DATABASE` + `DEPLOYMENT` + `TROUBLESHOOTING`), generated **e2e / install /
upgrade / user-journey** test suites, per-request **tracing + crash capture +
p50/p95/p99** in the backend, a **localization** substrate (`i18n/` catalogue +
`window.t()` runtime + pseudo-locale), a **feature-completion graph**, **refactor**
(AST-safe rename) + **dependency-upgrade** plans, and one downloadable
**delivery archive** (`/delivery/` — manifest + certificate + all evidence +
continuation state), CHANGELOG + release notes + SHA-256 checksums, an
environment `doctor.js`, CI for 5 providers, and an ADR **decision log**
(every choice + every rejected approach). It also ingests an attached spec
(Markdown / JSON Schema / OpenAPI) or a Figma export. Engines: `engine.intake.js`,
`engine.design.js`, `engine.docs.js`, `engine.testgen.js`, `engine.journeys.js`,
`engine.localize.js`, `engine.features.js`, `engine.refactor.js`, `engine.upgrade.js`,
`engine.cicd.js`, `engine.bootstrap.js`, `engine.release.js`, `engine.decisions.js`,
`engine.delivery.js`, `engine.perfcheck.js`, `engine.a11y.js`, `engine.visualcheck.js`,
`engine.depintel.js`.

**Web targets** — generated → run → verified: vanilla **or**
React/Preact/Vue/Svelte/Angular frontends (vendored VDOM runtime, no build);
Node **or** pure-stdlib Python backends; REST **and/or** a zero-dep GraphQL
executor; RFC 6455 WebSockets; monolith **or** microservices (gateway +
per-domain services + compose); SQLite/Postgres/JSON; Docker/Compose/Kubernetes/
Helm/Terraform IaC.

**Runtime-adapter targets** — native **Android** (`gradle assembleDebug` + a
headless emulator + adb install/launch/screenshot/logcat), native **iOS**
(staged: source + static everywhere, xcodebuild/xcross/Theos for build/runtime),
**EVM smart contracts** (bundled `solc` + `@ethereumjs/vm` local chain), **ML
model training** (a real `python train.py` run), **native desktop** (Tauri —
`cargo check` the Rust core; Electron — headless boot smoke + electron-forge),
and **browser extensions** (MV3 — WXT / Plasmo / plain, static-validated +
Playwright load-unpacked). Each generates a real artifact and verifies it in a
real runtime; if this host lacks the runtime the run ends **BLOCKED** with the
exact prerequisite — `support ≠ environment availability`.

**Local proof, not hosted delivery** — `LOCAL CAPABILITY ≠ HOSTED-SERVICE
DELIVERY`. Offline: local **Whisper** speech-to-text (`engine.audio.js`),
**screenshot → component tree** by CV (`engine.vision.js`), **npm publish**
proven via `npm pack` round-trip / Verdaccio (`engine.registry.js`), **artifact
signing** — SHA-256 + SPDX SBOM + SLSA provenance + Cosign (`engine.signing.js`),
**OpenTelemetry** to a local collector (`engine.observability.js`). Only the
*final external publish* — npmjs.com, a signed GitHub Release, a hosted
Sentry/APM account — needs the user's credentials. See
[`docs/RUNTIME_ADAPTERS.md`](docs/RUNTIME_ADAPTERS.md) and
[`docs/ULTRAMODE_CLOSED_LOOP.md`](docs/ULTRAMODE_CLOSED_LOOP.md).

## Backend / Supabase

Optional and off by default. The app is fully functional without it (offline-first): projects live in your project folder (desktop) or browser storage. To mirror saves to your own Supabase project, paste its URL and publishable key in **Settings → Integrations** and apply the two `dist/_init_*.sql` files to that project. No project is built in.

## Agents and models

Generation goes to the model you connect in **Settings → AI & Models** (a local model through Ollama / LM Studio / llama.cpp, OmniRoute, or any OpenAI-compatible cloud endpoint), or through a local agent you choose in **Settings → Agents**:

| Option | What it is | Verified |
|---|---|---|
| Direct | Calls your configured model over HTTP. | Yes, against a real local model (`npm run eval:agent`, `npm run acceptance:agent`). |
| OpenClaw | Local OpenClaw agent: install, onboarding, gateway lifecycle and sessions through its CLI and gateway (`127.0.0.1:18789`). | Lifecycle verified live against OpenClaw 2026.7.x; the in-app status reads the real CLI and gateway. Needs OpenClaw installed and its gateway running. |
| Hermes Agent | Local Hermes Agent (Nous Research) through its OpenAI-compatible API server (`127.0.0.1:8642`). **Settings → Agents installs and runs it in four steps** (each asks first): run the vendor's installer, choose a model in a terminal (`hermes setup`), enable the API server with a random key (kept in the OS keychain), start the gateway. The status is a real `GET /v1/models`. | Lifecycle and protocol tested with scripted fakes and a local HTTP server; **never run against a real Hermes Agent install** (none on the development machine). The installer is the vendor's own script, so it is as trustworthy as that script. |
| Hermes models | Nous Research's Hermes *models* hosted on OpenRouter (your OpenRouter key, kept in the OS keychain). | Same request path as Direct. These are models, not the Hermes Agent. |

## Deploy

`dist/` is a static bundle — deploy it to any static host. The CSP `connect-src` allows loopback model servers and the listed API hosts; `oauth-callback.html` must be served from the same origin.

## Checks you can run

| Command | What it proves |
|---|---|
| `npm test` | the unit / integration / security suites |
| `npm run smoke` | the Electron app boots with no renderer errors |
| `npm run acceptance` | the closed loop on a real project (detect → run → observe → repair → gate) |
| `npm run acceptance:agent` | the native agent in the real desktop app against a real local model |
| `npm run eval:agent` | the native agent on benchmark tasks, judged by hidden tests |
