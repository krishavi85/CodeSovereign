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
3. **`Engine.DoD.evaluate()`** → `definition-of-done.json`: 8 criteria. It
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

## `npm run acceptance:build` — repo-scale generation (20 checks)

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
5. Evidence ledger + **Definition-of-Done gate: all 8 criteria PASS** →
   `release-certificate.md` = **SOVEREIGN VERIFIED**.

This is the proof that CodeSovereign can *build* verified software from a spec,
not only verify software that already exists. CI job **Desktop → acceptance-build**.

## `npm run acceptance:ultramode` — the closed Ultra Mode loop (39 checks)

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
7. **All 8 Definition-of-Done gates PASS** → `release-certificate.md` =
   **SOVEREIGN VERIFIED**. History: `ANALYZING → … → GENERATING → VALIDATING →
   EXECUTING → OBSERVING → REPAIRING → REVERIFYING → VERIFIED`.
8. **Resume**: the persisted run is forced back to a mid-flight state and
   `resume()` completes it to `VERIFIED` **without regenerating** the project.
9. **Negative — unsafe**: a covert-keylogger request ends `BLOCKED`, nothing
   generated, explicit reason.
10. **Negative — unsupported**: a native-iOS-only request ends `BLOCKED` with a
    reason that names the supported stack.

CI job **Desktop → acceptance-ultramode**.

## `node test/run.js` — the factory layer (headless, no Electron)

Two suites cover the generation + factory engines without a renderer:

- **`test/scaffold.test.js`** — generates a full-stack app, writes it to a temp
  dir, and actually runs its `migrate` / `lint` / `node --test` / `build`.
  Also proves the **stack variants**: the `jobs` variant (queue + polling worker
  + SSE hub) generates and its `node --test` passes incl. queue/worker tests; the
  `node-pg` variant emits a `db.js` shim that picks `db.pg` when `DATABASE_URL`
  is set, plus `pg` as an `optionalDependency`.
- **`test/factory.test.js`** — over a generated repo: `Engine.Security.scan()`
  (clean score, then planted SQLi / XSS / secret / command-injection all caught,
  score drops), `Engine.Deploy` (7 targets, preflight checklist, `apply()` writes
  Dockerfile/compose/scripts, never pushes), `Engine.TestGen` (chaos + API suites
  parse and target real endpoints), `Engine.Autonomy` (5 levels, `gate()` blocks
  disallowed actions), `Engine.Agents` (roster, autonomy-gated `deploy` agent,
  arbitration by the product > architecture > security > performance > UI order).
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
