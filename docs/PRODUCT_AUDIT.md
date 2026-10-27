# Product audit: does the app do what it says?

Method: for every control or claim, find what behaviour it actually changes (grep the consumers of the state it writes), then try the real thing where the machine allows. A control whose state nothing reads was removed from the UI, not left as decoration. The engines behind removed cards are untouched.

## Agent connections

| Connection | Verdict | Evidence |
|---|---|---|
| **OpenClaw** | **Real.** | Real CLI and gateway lifecycle code. Run live on this machine (OpenClaw 2026.10.6, Microsoft Store build): `detect()` finds it, `getStatus()` returns the real service/gateway state (gateway on port 54092, not 18789; the Store app does not register the Scheduled Task), and a real `openclaw agent --json` turn reached the real gateway and came back with a run id and OpenClaw's own error ("The AI service needs a short break" = the model OpenClaw is configured with was rate-limited). The app already turns that exact reply shape into a readable error and falls back to Direct. |
| **Hermes Agent** | **Was not connected; now implemented, not yet proven live.** | The old "Hermes" entry only used Nous Research's Hermes *models* through OpenRouter. It sat in the Agents list next to OpenClaw, which implied the Hermes *Agent*. Now there are two honest entries: **Hermes Agent** (the local agent, through its documented OpenAI-compatible API server on `127.0.0.1:8642`; status is a real `GET /v1/models`) and **Hermes models** (hosted, OpenRouter key). 18 tests cover our side of the protocol against a spec-shaped test server. Hermes Agent is **not installed on the development machine, so it has not been run against a live one.** |
| Direct | Real. | Real local-model runs: `npm run eval:agent`, `npm run acceptance:agent`. |

## Defects found and fixed while checking

| Defect | Fix |
|---|---|
| OpenRouter key (Hermes models) sat in plain localStorage while other keys were in the OS keychain. | All four LLM secrets (API key, local token, OpenRouter key, Hermes Agent key) now go through the keychain; test added. |
| A slow OpenClaw call that was killed on timeout was reported as `spawn openclaw ENOENT` (Node emits a bogus ENOENT when it kills a Store-alias process), so the Settings pill could show a stale "unknown". `gateway status` takes ~25-30 s here, longer than the 15 s limit. | Timeout reported as a timeout; limit raised to 60 s; test added. |
| The desktop runner's test output carries ANSI colour codes; the agent could not read pass/fail counts or failure details. | Stripped before parsing (found by the real-Electron acceptance run). |
| "Deploy" in the top bar only packaged a downloadable bundle and then said "Deployed". | Renamed **Export**, tooltip and toast say what it does. |
| "LLM • local" pill appeared even when no model was connected; Welcome said "Engine online" unconditionally. | Pill removed; the top bar and Welcome show the model that is actually connected, or "No model connected". |
| "AI wiring: 9/9 consumers connected" was `!!Engine.X` presence checks, shown as connected with no model. | Heading now says whether a model is connected and that the marks mean "built to use it". |
| A hard-coded avatar letter implied a signed-in user. | Removed. |
| README described screens that no longer exist (Factory, Pipelines, Marketplace...) and a built-in Supabase key that the code no longer has. | Rewritten to match. |

## Controls removed because nothing reads them

| Control | Why |
|---|---|
| Environment (dev / staging / prod), top bar and Settings | Only changed a label. |
| Agent runtime: "run on AWS Lambda / Coder / Cloudflare / Daytona / Modal / Namespace / Vercel / E2B", "CodeSovereign Cloud", "Team Worker Pool" | Stored a flag; no code ran anything anywhere but this computer. |
| Tool switches (Filesystem, Terminal, Search, Git, Web fetch, Database), Agent screen and Settings | The switches were not read by the agent. |
| Temperature and Max tokens sliders, Agent screen | Not read by any model call. |
| Open-Source Building Stack: "vector engine Qdrant / Weaviate / Milvus", "24/24 engines" | The "vector memory" is a local hash-embedding store in localStorage; the Qdrant/Weaviate/Milvus choice was a label. |
| Customize · MCP · Modes: custom modes, scope and kind chips | Custom modes never reach a prompt; MCP servers feed no agent. (The stdio MCP bridge code remains.) |

## Settings, reorganised

One 6,100 px scroll of 15 cards (plus 2 collapsible panels) became six sections (Project, AI & Models, Agents, Integrations, Advanced, About), one at a time. Five cards were removed; ten remain.

## Checked and fine

* Autonomy levels: gate real writes, commands, repair and network in the native agent (tests + acceptance).
* Cost Sovereignty: a real static scan of `package.json` against a table of known paid services.
* Local model discovery, OmniRoute start, manual endpoint: real HTTP / process calls through the main process.
* CI: unit tests (Linux and Windows), Electron smoke, 8-engine acceptance and repo-scale generation pass.

## Left as it is, and why

* `CodeSovereign.dc.html` (a Claude Design mock-up, 188 KB), `test_codesovereign.mjs` (a Playwright smoke test that targets a remote URL) and `screenshots/` (six images of an older UI) are still in the repository. None is packaged into the app (`package.json` `build.files` is `electron/**`, `dist/**`). They are not part of the product; removing them is a deletion the user should confirm.
* The runtime-adapter targets in the README (Android emulator, iOS, EVM, Tauri...) are honest about environment: with no toolchain the run ends BLOCKED with the missing prerequisite. They were not re-run here.
