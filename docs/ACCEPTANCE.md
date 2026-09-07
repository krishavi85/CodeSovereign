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

## What the gate asserts (27 checks)

Real execution (`npm test`/`build`/`lint` exit 0, twice), a genuine runtime
classification spread (REAL / MOCK / BROKEN), the broken control caught at
runtime, the two mock controls seen doing nothing, the form-submit control **not**
auto-activated, no non-loopback requests allowed, the recovery loop applying
patches without a full rollback, a regenerated fingerprint with drift detection,
and the full evidence set present on disk.

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
