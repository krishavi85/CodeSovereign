# Sovereign Engine Specs — Audit vs. current app

Reviewed 7 spec documents against the codebase on branch `desktop/electron`
(browser renderer in `dist/` + the Electron desktop layer).

**Verdict in one line:** the app has *rule-based, regex-level* implementations of
**parts of 5 of the 7 engines**, all one-shot, none persisted to a resumable
project memory, and none yet wired to the real filesystem / real process
execution the Electron layer now provides. The `.sovereign/` continuity layer
that 6 of the 7 specs treat as mandatory **does not exist**.

Legend: ✅ present · 🟡 partial / shallow · ❌ missing

---

## 1. Requirements Intelligence Engine

| Capability | Status | Where / gap |
|---|---|---|
| Intent normalization + spell-correct | ✅ | `engine-universal.js` `normalize()` |
| Product archetype classification | 🟡 | `classify()` — ~8 secondary types by keyword; spec lists 18 archetype packs |
| Requirement elicitation (adaptive questions) | ❌ | no question engine; the Welcome prompt is free-text only |
| Capability decomposition → epics/features/entities | 🟡 | `expand()` produces functional/non-functional lists from keywords |
| Constraint & contradiction / feasibility detection | 🟡 | `analyze()` returns a feasibility score; no contradiction rules (offline-vs-cloud etc.) |
| Technology scoring formula | 🟡 | `select()` picks a stack by `primaryType`; not the weighted 12-factor score |
| Exact-needs bill of requirements (Mandatory/…/Excluded) | ❌ | requirements are flat, unclassified |
| Requirement → component → test traceability matrix | 🟡 | `feature-matrix.md` lists id/priority; no component or test columns |
| Domain requirement packs (SaaS, e-commerce, music, …) | ❌ | none |
| `.sovereign/` requirement files | ❌ | writes `/project-docs/*.md` for **new** projects only, prose not schema |

## 2. Software Component Detection Engine

| Capability | Status | Where / gap |
|---|---|---|
| Component inventory from a repo | 🟡 | `engine.recovery.js` `Graph.build()` extracts imports/exports/routes/services/DB tables/custom tags via regex |
| Universal component taxonomy (presentation/app/backend/data/AI/infra/quality) | ❌ | no taxonomy; findings are file-level, not component-level with layer/owner |
| Necessity scoring (required/conditional/optional/future/duplicate/incompatible/prohibited) | ❌ | none |
| Missing / fake / duplicate / dead / insecure component detection | 🟡 | `Validator` finds TODO/eval/console.log; `GraphValidate` finds `UNUSED`/`BROKEN` edges; no "mock service", "duplicate state lib", "dead route" |
| Component contract model (`SovereignComponentDefinition`) | ❌ | none |
| Dependency graph with cycles | 🟡 | `GraphValidate` marks `CIRCULAR`; no full topological build order |
| Component graph output (`component_graph.yaml`) | ❌ | none |

## 3. Universal App Architecture

| Capability | Status | Where / gap |
|---|---|---|
| One factory, many targets | 🟡 | 29 app-type pipelines (`engine-extras.js`), template scaffolds (`engine.js` TEMPLATES) |
| Technology **adapter** contract (`detectRequirements/createProject/build/test/diagnose/repair/package/deploy`) | ❌ | `engine-pipeline-builder.js` emits file lists per app type; no adapter interface, no per-tech `build/test/deploy` |
| Installable Technology Packs | ❌ | none (plugins system is MCP-server config, not SDK packs) |
| Local vs remote build workers | ❌ | Electron layer runs `npm`/`git` locally; no remote build worker, no macOS/iOS routing |
| Intelligent stack selection Q&A | ❌ | see §1 |
| Multi-agent system with file ownership / edit locks / task graph | 🟡 | `engine-universal.js` `TaskGraph` + agent **names**; agents are personas, no concurrency control, no edit locks |
| Universal project spec (`project.yaml`) | ❌ | none |
| `.sovereign/` memory layout | ❌ | none |
| Recommended Sovereign stack (Tauri/Rust/SQLite) | n/a | app is Electron + vanilla JS — a deliberate, documented deviation |

## 4. App Pipeline Discovery Engine

| Capability | Status | Where / gap |
|---|---|---|
| Pipeline families beyond CI/CD | 🟡 | `engine-extras.js` names 8 families + per-type stage lists (`discover→plan→build→preview→deploy…`) — labels only, not discovered from the repo |
| Discover pipelines from `.github/workflows`, Dockerfile, Terraform, migrations… | ❌ | nothing parses real CI/infra files |
| Normalized pipeline graph with node metadata (trigger/inputs/outputs/secrets/retry/rollback…) | ❌ | none |
| Gap & failure detection table (missing trigger, orphan stage, artifact mismatch, migration race…) | ❌ | none |
| Isolated repair (branch/worktree), execute, verify | 🟡 | `engine.recovery.js` snapshots + repair loop, but in-memory; the Electron `git`/worktree isn't used |
| Visual Pipeline Studio (editable graph) | 🟡 | Pipelines screen shows a static `discover → plan → …` arrow strip; not editable, not from real data |
| `.sovereign/pipeline-*.json` | ❌ | none |

## 5. Connection Diagram & Flow Validation Engine

| Capability | Status | Where / gap |
|---|---|---|
| Static connection graph (nodes/edges, typed) | 🟡 | `Graph.build()` + `GraphValidate.run()` — imports, HTML refs, routes; edge status `CONNECTED/BROKEN/MISSING/UNRESOLVED/CIRCULAR/UNUSED` |
| Runtime observer (network calls, state mutations, model streams) | ❌ | none |
| Contract extractor (types, schemas, event payloads) | ❌ | none |
| Diagram generation (system/container/component/sequence/data-flow/deployment) | ❌ | no diagrams at all |
| Per-edge validation (auth, authz, timeout, retry-safety, ordering, concurrency, observability, perf, security) | 🟡 | only existence/reachability |
| AI-messaging responsiveness flow validation (input→stream→render→persist, cancel, no-dup) | ❌ | none — and `engine.llm.js` streaming isn't checked |
| Drift monitor (regen graph after edits, warn on drift) | ❌ | none |
| `.sovereign/connection-graph.yaml` + diagrams | ❌ | none |

## 6. Mockup-to-Production Engine

| Capability | Status | Where / gap |
|---|---|---|
| Simulation/mock detection (empty handlers, `setTimeout` as API, `mock*`/`dummy*`, `TODO`, `#`/`javascript:void(0)`, fake persistence, disconnected forms, synthetic dashboards, stub services, bypassed security) | 🟡 | `Validator` catches `TODO/FIXME`, `eval`, `console.log`, empty files; `Verify.interaction()` flags unwired `<button>`/`<form>`; the full mock-signal table is **not** implemented |
| Interaction inventory with stable IDs + traceability record | ❌ | `Verify.interaction()` returns counts, not per-control records |
| Intent inference rules (magnifier=search, trash=guarded delete, …) | ❌ | none |
| Mandatory state coverage (loading/empty/error/offline/conflict/…) checks | ❌ | none |
| Vertical-slice implementation (UI→validation→state→backend→DB→authz→tests) | ❌ | the agent scaffolds files; it does not "productionize" an existing mock |
| Figma / screenshot / video input connectors | ❌ | none |
| `.sovereign/mockup-inventory.json` + production-readiness report | ❌ | none |

## 7. App Interactivity Repair Engine

| Capability | Status | Where / gap |
|---|---|---|
| Interaction contract model (trigger/preconditions/effect/state-transitions/feedback/persistence/a11y/invariants) | ❌ | none |
| Runtime observer + reproduce failure + capture console/network/state | ❌ | none (browser app can't drive itself; Electron could via a hidden `BrowserWindow` — not built) |
| Event-to-effect trace | ❌ | none |
| Root-cause ranking (overlay/z-index → binding → preconditions → dispatch → store → routing → API → backend → feedback) | 🟡 | `engine.recovery.js` `rootCauseFor()` ranks by fault class, not the 9-layer interaction order |
| Framework repair adapters (React/Vue/Svelte/Angular/SwiftUI/Compose/Flutter/Tauri/Electron/…) | ❌ | repairs are generic string ops on files |
| Generated interaction tests (happy/invalid/slow/failure/offline/keyboard/back/repeat) | 🟡 | `engine.recovery.v4.js` runs planted-bug **benchmarks**; no test *generation* for the user's interactions |
| Safe auto-fix rules + checkpoint + rollback | ✅ | `engine.recovery.js` `Snapshots` + `repair()` + `rollback()` — this part is genuinely present |
| Playwright as the interaction runner | ❌ | not integrated (Playwright *is* in the repo's root `test_codesovereign.mjs` but unused by the app) |
| `.sovereign/interactions/`, `diagnostics/`, `repairs/repair-ledger.md` | ❌ | none |

---

## Cross-cutting gaps (all 7 specs)

1. **`.sovereign/` project memory** — mandated by 6/7 specs, absent. No resumable
   continuity: every scan starts from zero, decisions/assumptions/repairs aren't
   recorded, a second run can't build on the first.
2. **Real evidence** — the specs repeat "never claim success from exit code 0 /
   compilation alone; test the artifact." The engines run entirely in-browser on
   the FS mirror; the Electron layer's real `npm test` / `npm run build` / `git`
   are not called by any engine.
3. **AST-level analysis** — everything is regex. Misses re-exports, dynamic
   imports, JSX event props, framework routing, DI wiring.
4. **Runtime observation** — no engine drives the app and captures
   console/network/state. This is the single biggest "depth" gap and is what
   separates these specs from a linter.
5. **Diagrams** — zero. Specs 4 and 5 are largely about generating and
   regenerating architecture/sequence/data-flow diagrams.

## What was built in response to this audit

See PR — **`.sovereign/` Project Memory + Sovereign Analysis pass**:

- `dist/engine.sovereign.js` — the canonical `.sovereign/` file set (merged from
  all 7 specs), a read/write/snapshot API, and an **analysis runner** that
  executes the existing analyzers (`Graph`, `GraphValidate`, `Validator`,
  `Verify.build/runtime/interaction`) plus new **simulation-signal** and
  **component-inventory** passes against the **real open folder**, and writes
  structured evidence to `.sovereign/*.json` + human-readable `.md`.
- Desktop: persists to real `.sovereign/` files on disk (survives restart,
  resumable). Browser: keeps them in the FS and offers a ZIP.
- A **Project Memory** panel on the Recovery screen showing the current
  `.sovereign/` state and letting you re-run the analysis.

This is the foundation the other engines resume from. It does **not** add
runtime observation, AST analysis, diagram generation, framework repair
adapters, or the Figma/screenshot connectors — those remain on the roadmap
below.

## Roadmap — M2 (branch `desktop/m2-execution`, one commit each)

1. ✅ **Real execution loop** — `window.CSExec` + `Engine.Sovereign.runEvidence()`
   run the project's real `npm test` / `build` / `lint` / `typecheck` through the
   Electron proc bridge; `.sovereign/execution-evidence.json` with pass/fail
   gates; "Repair All" verifies with real test+build in desktop mode.
2. ✅ **AST analyzer** — `Engine.AST` (vendored acorn + acorn-loose) upgrades
   `Graph.build()` for `.js/.mjs/.cjs`: dynamic `import()`, `export * from`,
   `export {x} from`, nested route calls. Regex fallback for `.tsx`/`.jsx`.
3. ✅ **Runtime observer** — a hidden `BrowserWindow` (localhost/workspace only)
   drives the running app, wraps its console/fetch/XHR/errors/history, crawls
   every control and classifies it REAL / MOCK / BROKEN / UNREACHABLE by observed
   effect → `.sovereign/runtime-trace.json`, folded into the interaction inventory.
4. ✅ **Diagram generation + drift** — `.sovereign/diagrams/{system-context,
   component,dataflow}.mmd` regenerated from the graph every analysis, embedded
   in `architecture.md`; an order-independent graph fingerprint drives
   `driftDetected`.
5. ✅ **Simulation detection** — `Engine.MockScan` (~20-rule signal table) +
   intent inference (label + convention → expected behaviour + confidence) +
   the REAL/PARTIAL/MOCK/BROKEN/UNREACHABLE/UNKNOWN status per control;
   `production-readiness.md` is the interaction traceability matrix. *(Detection
   + specification; auto-generating the production code per MOCK item stays
   agent/human-driven with the matrix as the worklist.)*
6. ✅ **Requirements depth** — `Engine.Requirements`: 13 domain packs,
   `detectArchetypes()`, `contradictions()` (the feasibility table + resolutions),
   `classify()` (Mandatory/…/Excluded), the weighted 12-factor `scoreStack()`,
   progressive `questions()`. `Engine.Sovereign.requirements()` writes
   `requirements.json` + a derived `product-brief.md` checklist + `risk-register.json`.
7. ✅ **Pipeline parsing** — `Engine.PipelineParse` (vendored js-yaml) parses
   `.github/workflows` / GitLab CI / Dockerfile / compose / Terraform into a
   normalized job graph + the gap table (missing trigger, unsafe deploy,
   secret exposure, missing healthcheck, migration race, …).
8. ✅ **Technology adapters** — the `TechnologyAdapter` interface + 11 local
   adapters (web/node/electron/tauri/ios/android/python/rust/go/static) wired to
   the real exec layer; host-aware `canBuildLocally()`; the documented
   remote-build worker contract. *(SDK packs + an actual remote worker are
   infrastructure beyond a client session.)*

## Still not built (smaller, lower priority)

- Figma / screenshot / video **input connectors** for Mockup-to-Production.
- **Framework-specific repair adapters** (the repair engine's patches are still
  generic file ops, not React/Vue/Svelte-aware).
- **Sequence diagrams** per route (only system-context / component / data-flow so far).
- **Auto-generation** of the production vertical slice for each MOCK control
  (deliberately left to an agent/human with the traceability matrix as input).
- The **SDK technology packs** (download Android SDK, Xcode integration) and a
  **running remote build worker** (only the interface + contract exist).
