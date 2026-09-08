# End-to-end acceptance test

`npm run acceptance` (`electron/acceptance.js`, CI job **Desktop → acceptance**)
is the proof that the eight Sovereign engines work **together**, not merely that
each passes its own unit test.

It copies `test/fixtures/acceptance/` (a real full-stack task board — see that
folder's README) to a throwaway workspace, trusts it, opens it in the **real
renderer**, and drives the whole flow:

```
detect → classify → execute → observe → repair → retest → regenerate evidence → readiness gate
```

| Stage | What actually runs | Evidence artefact |
|---|---|---|
| **detect** | `Engine.Sovereign.analyze()` — graph, components, interactions, pipelines, requirements, adapters | `.sovereign/*.json`, `analysis-summary.md` |
| **classify** | `MockScan` + intent inference per control | `interaction-inventory.json`, `production-readiness.md` |
| **execute** | `runEvidence()` → **real** `npm test` / `build` / `lint` / `typecheck` via the proc bridge | `execution-evidence.json` |
| **observe** | `observe()` → starts the dev server, crawls every control in the isolated observer window | `runtime-trace.json` |
| **repair** | `Engine.Recovery.run()` — autonomous analyze/plan/patch/verify loop | recovery run record, patched source |
| **retest** | `runEvidence()` again — real build/test still green after the patches | `execution-evidence.json` |
| **regenerate** | `analyze()` again — new graph fingerprint + drift check vs. the pre-repair fingerprint | `decision-state.json` |
| **readiness gate** | 9 boolean criteria computed from the artefacts above | `[acceptance] READINESS GATE PASSES` |

### Stage 8 — the P0 pipeline (closed Ultra Mode loop on generated code)

After the readiness gate, the harness exercises the P0 pipeline
(`docs/BLUEPRINT_GAP_ANALYSIS.md`):

1. **`Engine.Contract.derive()`** builds `product-contract.json` — requirements
   with machine-checkable acceptance criteria (execution gates, per-control
   "observed REAL", no-mock, file-exists, CI-runs-test+build).
2. **`Engine.Ledger.build()`** checks every criterion against the `.sovereign/`
   evidence → `evidence-ledger.json` (claim → evidence → confidence + assertion
   count).
3. **`Engine.DoD.evaluate()`** → `definition-of-done.json`: 14 criteria (adds architecture/layering, privacy/PII, WCAG accessibility, visual-integrity, licence-compatibility and performance-health gates). It
   **refuses** while the fixture's planted MOCK `Export CSV`, MOCK `Help` and
   BROKEN `Clear all` controls exist.
4. **`Engine.Orchestrator.run()`** executes a 3-task DAG. Each task's generator
   (a built-in template here; `Engine.LLM` when a provider is configured) writes
   the real slice — a `/api/tasks.csv` endpoint + wired button, a `DELETE`
   endpoint for `Clear all`, a real `Help` panel — then the loop re-runs
   `analyze → runEvidence → observe → Recovery` until each control is observed
   **REAL**.
5. The DoD gate flips to **PASS** and `Engine.DoD.certificate()` writes
   `release-certificate.md` — **SOVEREIGN VERIFIED**.

This is the proof the eight engines close the loop on *generated* code, not only
on imported repos: **intent → contract → generate → execute → observe → repair →
prove → certify**.

## What the gate asserts (38 checks)

Real execution (`npm test`/`build`/`lint` exit 0, twice), a genuine runtime
classification spread (REAL / MOCK / BROKEN), the broken control caught at
runtime, the two mock controls seen doing nothing, the form-submit control **not**
auto-activated, no non-loopback requests allowed, the recovery loop applying
patches without a full rollback, a regenerated fingerprint with drift detection,
and the full evidence set present on disk.

## `npm run acceptance:build` — repo-scale generation (22 checks)

`electron/acceptance-build.js` starts from an **empty** workspace and proves the
build half of the loop:

1. `Engine.Scaffold.generate(spec)` writes a complete full-stack app — `server.js`
   (zero-dep HTTP, routing, CRUD), `src/db.js` (schema-enforcing data layer),
   `src/auth.js` (scrypt + sessions + RBAC), `db/migrations/*.sql` (real SQL with
   FK + indexes), `public/` (real fetch UI), `test/*.test.js`, CI, Dockerfile.
2. `Engine.Sovereign.analyze()` + `Engine.Contract.derive()` on the generated code.
3. **Real `npm test` + `npm run build` + `npm run lint`** — all exit 0.
4. `observe()` boots the generated server and crawls it — a real control observed,
   nothing observed fake.
5. Evidence ledger + **Definition-of-Done gate: all 14 criteria PASS** →
   `release-certificate.md` = **SOVEREIGN VERIFIED**.

This is the proof that CodeSovereign can *build* verified software from a spec,
not only verify software that already exists. CI job **Desktop → acceptance-build**.

## `npm run acceptance:ultramode` — the closed Ultra Mode loop (53 checks)

`electron/acceptance-ultramode.js` starts from an **empty** workspace and **one
natural-language request** and drives `Engine.UltraMode` through the entire real
flow — see `docs/ULTRAMODE_CLOSED_LOOP.md`:

1. `Engine.Contract.deriveFromPrompt` → a machine-readable contract (14 requirements,
   all with machine-checkable acceptance criteria; entities `project` + `task`;
   auth + jobs inferred).
2. `Universal.buildPlan` → a typed plan (scaffold · testgen · security-scan ·
   deploy-iac); **every mandatory requirement traces to a real artifact**.
3. `Engine.Scaffold.specFromContract` → `generate()` → a **36-file** full-stack
   project (backend + JSON/pg data layer + real SQL migrations + auth + durable
   queue + worker + per-entity REST services + frontend + tests + CI + Docker +
   Compose).
4. A **repairable defect** (an `<img>` with no `alt`) is injected into the
   generated output.
5. `analyze` → **real `npm test` + `npm run build` + `npm run lint`** (all pass)
   → runtime observation (app booted, a control observed REAL, nothing fake).
6. The defect is detected (validator findings), a **snapshot** is taken
   (`pre-generate`, `pre-repair-N`), `Recovery.run()` repairs it, the checks
   re-run, warnings drop.
7. **All 14 Definition-of-Done gates PASS** → `release-certificate.md` =
   **SOVEREIGN VERIFIED**. History: `ANALYZING → … → GENERATING → VALIDATING →
   EXECUTING → OBSERVING → REPAIRING → REVERIFYING → VERIFIED (web); PLANNING → GENERATING → VALIDATING → EXECUTING → REVERIFYING → VERIFIED (runtime target)`.
8. **Resume**: the persisted run is forced back to a mid-flight state and
   `resume()` completes it to `VERIFIED` **without regenerating** the project.
9. **Negative — unsafe**: a covert-keylogger request ends `BLOCKED`, nothing
   generated, explicit reason.
10. **Runtime target — iOS (staged)**: a native-iOS-only request is detected as
    the `ios` target; a real SwiftUI + SwiftPM + xcodegen project is generated;
    `electron/lib/ios.js` runs `sourceGeneration` + `staticValidation` (PASS on
    every host), and `build` + `simulator` are **stage-BLOCKED** with
    `MACOS_XCODE_REQUIRED` / `MACOS_SIMULATOR_REQUIRED` — the overall run is
    **`PARTIAL`** (`SOVEREIGN VERIFIED — PARTIAL`), never a blanket BLOCKED, never
    "unsupported". A Swift syntax error would instead be `FAILED`.
11. **Runtime target — EVM**: an ERC-20 request is detected as the `evm` target;
    `Engine.Blockchain` generates a real Solidity contract; `electron/lib/adapters.js`
    compiles it with `solc` and deploys it on a `@ethereumjs/vm` local chain, runs
    the transfer / approve / transferFrom / revert transactions, and every
    assertion passes; the target DoD gate passes → **SOVEREIGN VERIFIED**.

CI job **Desktop → acceptance-ultramode**.

## `node test/run.js` — the factory layer (headless, no Electron)

These suites cover the generation + factory engines without a renderer:

- **`test/scaffold.test.js`** — generates a full-stack app, writes it to a temp
  dir, and actually runs its `migrate` / `lint` / `node --test` / `build`.
  Also proves the **stack variants**: the `jobs` variant (queue + polling worker
  + SSE hub) generates and its `node --test` passes incl. queue/worker tests; the
  `node-pg` variant emits a `db.js` shim that picks `db.pg` when `DATABASE_URL`
  is set, plus `pg` as an `optionalDependency`.
- **`test/stacks.test.js`** — the stack-breadth engines, each verified by
  generating a repo to a temp dir and **really running its suite**: React + Vue
  component frontends (vendored VDOM runtime, `node:test` DOM shim); a zero-dep
  GraphQL executor (round-trips a mutation with variables + a query); an RFC 6455
  WebSocket server (raw-socket handshake + echo + broadcast); a pure-stdlib
  **Python** backend (`compileall` + `unittest`); **microservices** (boots the
  gateway + every domain service on real ports, round-trips register→create→list
  through the gateway, asserts the 401-before-proxy boundary); Kubernetes / Helm /
  Terraform IaC (valid YAML, balanced `{{ }}` / HCL braces); `Universal.buildPlan`
  reflecting the real contract stack; `/healthz` + `/readyz` + `/metrics` on a
  booted generated server; cross-platform packaging config; and the
  architecture-rules + privacy scanners (clean repos score 100, injected
  violations are caught and fail the corresponding DoD criterion).
- **`test/adapters.test.js`** (40 checks) — the runtime adapters. `Engine.RuntimeRouter`
  target detection; **blockchain end to end** — ERC-20 / ERC-721 / voting contracts
  generated, compiled with the bundled `solc`, deployed on a `@ethereumjs/vm` local
  chain, real transactions run, every assertion passes, `.sovereign/blockchain-evidence.json`
  written; a Solidity compile error is `FAIL` not `BLOCKED`. **ML end to end** — a real
  `python train.py` run (char-LM / classifier / regressor) with a decreasing loss curve
  and a hashed checkpoint; "train on our data" with no dataset → `BLOCKED DATASET_REQUIRED`.
  Native mobile — the Android Gradle project + SwiftUI skeleton are generated; the probe
  returns a coherent capability map.
- **`test/factory.test.js`** — over a generated repo: `Engine.Security.scan()`
  (clean score, then planted SQLi / XSS / secret / command-injection all caught,
  score drops), `Engine.Deploy` (10 targets incl. K8s/Helm/Terraform, preflight
  checklist, `apply()` writes Dockerfile/compose/scripts, never pushes),
  `Engine.TestGen` (chaos + API suites parse and target real endpoints),
  `Engine.Autonomy` (5 levels, `gate()` blocks disallowed actions), `Engine.Agents`
  (roster, autonomy-gated `deploy` agent, arbitration by the product > architecture
  > security > performance > UI order).
- **`test/ultramode.test.js`** (83 checks) — the Ultra Mode state machine with the real
  Contract / Universal / Scaffold / TestGen / Deploy engines and stubbed
  verification engines: happy path → `VERIFIED`; defect → bounded repair →
  `VERIFIED`; repair budget exhausted → `FAILED`; rollback of a worsening repair;
  cancellation (paused + mid-run); resume after a simulated crash with no
  regeneration; unsafe → `BLOCKED`; unsupported → `BLOCKED`; blocking-question →
  `NEEDS_INPUT` → answer → continue; browser-mode degradation; deterministic ids;
  traceability; secret redaction.

## Known limitations surfaced by the run (non-gating diagnostics)

- The in-renderer static validator's `new Function()` JS parse is blocked by the
  app's own strict CSP, so its `JS syntax error` findings are not load-bearing —
  `runEvidence()` (real `npm`) is authoritative and supersedes them.
- `connection-health.json` flags Node core modules (`require('fs')` …) and some
  relative specifiers as broken edges; the harness reports the count excluding
  Node core but does not gate on graph health.
- `runEvidence()` / `observe()` rewrite `decision-state.json` down to their own
  slice; the harness captures `counts` / `graphFingerprint` immediately after
  each `analyze()` instead of reading them back later.
- `desktop-observe.ensureServer()` reuses a dev server that is *already* listening
  on the detected port. If a previous crashed/killed run left its `node server.js`
  alive, the observer would crawl that stale (possibly already-repaired) workspace
  and silently invalidate the run. Both harnesses now call
  `electron/lib/freeport.js` `freePort(4319)` at startup to kill any stray
  listener first — if a run ever prints `freed port 4319 (killed …)`, a prior run
  did not shut down cleanly.
