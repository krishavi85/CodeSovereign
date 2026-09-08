# Ultra Mode closed loop

`Engine.UltraMode` is the single coordinator that turns **one natural-language
request** into a **real, generated, executed, observed and repaired project** with
evidence proving whether the result satisfies the original request — or an honest
`BLOCKED` / `FAILED` result if it does not.

It does **not** re-implement any engine. It sequences the ones that already exist.

```
prompt
  → Engine.Contract.deriveFromPrompt   (machine-readable Product Contract)
  → progressive clarification           (only for genuinely blocking questions)
  → Universal.buildPlan                 (typed, executable plan — stages 5-12)
  → Engine.Scaffold.generate            (the real repo)
  → Engine.TestGen.generate             (API + chaos + a11y suites)
  → Engine.Deploy.apply                 (Docker + Compose IaC — never pushed)
  → Engine.Sovereign.analyze            (static graph + validator + security scan)
  → Engine.Sovereign.runEvidence        (REAL npm test / build / lint)
  → Engine.Sovereign.observe            (runtime crawl of the running app)
  → Engine.Ledger.build                 (claim → evidence → confidence)
  → Engine.Recovery.run                 (snapshot → repair → verify)
  → Engine.DoD.evaluate + certificate   (8 blocking gates)
  → SOVEREIGN VERIFIED  |  BLOCKED  |  FAILED
```

## State machine

Persisted to `.sovereign/ultramode-run.json` (schema-versioned, written after every
transition through `Sovereign.write`, which is an atomic temp-file + rename on
disk). A run **resumes safely after an application restart** — reopen the project,
call `Engine.UltraMode.resume()`.

| State | Meaning |
|---|---|
| `RECEIVED` | prompt captured (secret-scrubbed), degraded-mode detected |
| `ANALYZING` | contract derived; safety + supported-stack + blocking-question checks |
| `NEEDS_INPUT` | parked — waiting for `answer({ QID: "…" })` |
| `CONTRACT_READY` | contract is buildable, nothing blocking |
| `PLANNING` | `Universal.buildPlan` → `ultramode-plan.json` |
| `GENERATING` | snapshot `pre-generate` → Scaffold + TestGen + Deploy write files |
| `VALIDATING` | `Sovereign.analyze` (graph, validator, security, mockscan) + baseline ledger/DoD |
| `EXECUTING` | `Sovereign.runEvidence(['test','build','lint'])` (real npm) |
| `OBSERVING` | `Sovereign.observe` (isolated hidden window crawl of the running app) |
| `REPAIRING` | snapshot `pre-repair-N` → `Recovery.run` → re-analyze; roll back if worse |
| `REVERIFYING` | re-run execution + observation + analyze; evaluate the DoD gate |
| `VERIFIED` | every DoD gate passed **with a real certificate** |
| `BLOCKED` | safety refusal, out-of-scope request, unanswered blocking question, or the environment cannot verify (browser mode) |
| `FAILED` | the DoD gate did not pass after the repair budget, or an internal error |
| `CANCELLED` | `Engine.UltraMode.cancel()` |

### Bounded behaviour

- **`bounds.maxRepairAttempts`** (default 3) — hard cap; exhausting it → `FAILED`, never a false `VERIFIED`.
- **`bounds.runTimeoutMs`** (default 25 min) — overall wall-clock budget → `FAILED (run timeout)`.
- **Per-command timeouts** — enforced by `window.CSExec` / `electron/lib/proc.js`.
- **Cancellation** — `cancel()` sets a module flag + persists; the driver checks it between every state; process-tree cleanup is `observer.stop()` + `proc.killAll()` in the harness `finally`.
- **Snapshot before every mutation** — an in-memory copy of every workspace file (for exact rollback) plus the desktop's durable `snapshots.create('ultramode:<phase>')`.
- **Rollback when a repair makes evidence worse** — `worse(before, after)` = strictly more failing requirements, or the DoD lost passing criteria, or new validator errors. On a worse reading the captured files are restored and files added by the repair are removed.
- **No endless loop** — `REVERIFYING` only re-enters `REPAIRING` while there is budget **and** the last attempt made real progress (`repaired > 0`, not rolled back).

## The Product Contract  (`Engine.Contract.deriveFromPrompt`)

Deterministic and offline (an optional LLM pass only appends extra *optional*
functional requirements). Written to `.sovereign/product-contract.json`.

Carries: `product` · `supportedStack` · `scope` (mandatory / optional / deferred /
excluded) · `entities` · `roles` · `journeys` · `apiRequirements` ·
`jobRequirements` · `storage` · `security` · `deployment` · `requirements`
(stable `REQ-###`, each with machine-checkable `acceptanceCriteria`) ·
`acceptanceCriteria` (stable `AC-###`, Given/When/Then, linked to a requirement) ·
`assumptions` (stable `ASM-###`) · `blockingQuestions` (stable `Q-###`) ·
`unsupported` (`UNS-###`) · `unsafe` (`UNSAFE-###`) · `verdict`.

**Stable ids** — the same prompt always produces the same `REQ-`/`AC-`/`ASM-`
ids and the same entities (proven in `test/ultramode.test.js`). Every plan step,
generated artifact, ledger claim and DoD result traces back to these ids.

**A requirement is never "done" because a file exists** — the Evidence Ledger
checks each acceptance criterion against real evidence (`execution-evidence.json`
gates, `runtime-trace.json` control verdicts, `no-mock`, file presence, CI).

### Clarification vs assumption

- **Blocking question** (→ `NEEDS_INPUT`) only when the answer changes
  architecture, data-safety, money movement or the auth model — e.g. "which
  payment provider handles *real* charges?", "shared schema + tenant_id or a
  database per tenant?", "which compliance controls are in scope?".
- **Everything else** → a recorded assumption with a conservative default
  (JSON store when no DB is named, scrypt + 8-char password policy, opaque
  sessions, email-send is *logged* not wired to a provider, Docker generated
  but not pushed). Shown in the final report.

The deterministic path needs **no API key**. A configured LLM can only *improve*
planning / repair, never gate them.

## Trust boundaries

Generated projects are **untrusted workspaces**.

- `Sovereign.runEvidence` runs package scripts only through `window.CSExec` →
  `proc:run` / `proc:spawnAllowed`, which require an explicitly **trusted**
  workspace, show the exact command + cwd, never auto-run on folder-open, strip
  CodeSovereign API keys / GitHub tokens / deploy credentials from the child
  environment, enforce timeouts and kill the process tree.
- `Sovereign.observe` uses an **isolated Electron session**: all permissions
  denied, downloads blocked, external navigation + redirects blocked, only
  loopback / workspace-file requests allowed. It never activates a
  destructive-looking control in `observe` mode (submits, deletes, payments,
  account changes, outbound messages) — those are `SKIPPED`. Every observer
  action is logged in `runtime-trace.json`.
- `Engine.Deploy.apply` **generates** infrastructure-as-code and a deploy script.
  It never pushes anything — that needs the user's credentials.
- Secrets: the coordinator scrubs token-shaped strings from the prompt before it
  is persisted, and `Sovereign.write` additionally redacts
  `ultramode-run` / `ultramode-report` / `ultramode-plan` / `product-contract` /
  `execution-evidence` / `runtime-trace` / … on the way in.

## Evidence model

Every reading is appended to `run.evidence.timeline` and rendered in
`ultramode-report.md`: DoD pass/fail, DoD criteria count, failing requirement ids,
ledger assertion count, validator errors/warnings. The successive readings
(`post-validate` → `post-execute` → `post-observe` → `post-repair-N` →
`post-reverify`) show the loop's real progress — there are no simulated
percentages or timings anywhere.

## Supported stack

Generated today, and nothing else is claimed:

| Layer | What is generated |
|---|---|
| Frontend | vanilla HTML/CSS/JavaScript, real `fetch` with loading/error/empty states |
| Backend | Node.js zero-dependency HTTP server, routing table, JSON-body parsing, per-entity CRUD service layer, structured errors, in-memory rate limiter |
| Database | schema-enforced JSON store **or** `node-pg` adapter (chosen by `DATABASE_URL`); real SQL migrations (`CREATE TABLE`, FK + `ON DELETE`, `CREATE [UNIQUE] INDEX`) are always emitted |
| Auth | scrypt hashing (`node:crypto`, timing-safe), opaque server-side sessions, `requireAuth` / `requireRole`, first-user-is-admin |
| API | REST (+ SSE for jobs) |
| Async | durable in-process queue (retry, exponential backoff, dead-letter) + polling worker + SSE hub |
| Tests | generated unit + API-contract + adversarial chaos + a11y `node:test` suites, run by `runEvidence()` |
| CI | GitHub Actions (`lint` → `migrate` → `test` → `build`) |
| Deploy | multi-stage `Dockerfile`, `docker-compose.prod.yml` (app + Postgres 16), `.dockerignore`, `deploy/compose.sh` |

## Not supported (recorded as `unsupported`, never faked)

React / Vue / Angular / Svelte / Next / Nuxt and other front-end frameworks ·
React Native / Flutter / native mobile · desktop packaging of the generated
product · Kubernetes / Terraform / Pulumi · GraphQL / gRPC / raw WebSockets ·
multi-service / microservice architectures · ML training pipelines · blockchain /
smart contracts · non-Node backend languages (Python / Ruby / Go / Java / .NET /
PHP).

A request whose **core** is outside this list ends `BLOCKED` with a specific
reason. A request that is mostly buildable with an unsupported *extra* still
builds the supported part and lists the rest under "not generated".

## Refused (recorded as `unsafe`, run ends `BLOCKED`)

Covert behaviour hidden from the end user · credential theft / surveillance /
keylogging · unauthorised cryptocurrency mining · spam / DoS / bulk-unsolicited
tooling · circumventing access controls / DRM / paywalls · coordinated
deception / fake reviews / vote manipulation · malware.

## Browser-mode degradation

In a plain browser (`window.desktop` absent) the project is still **generated**,
but `EXECUTING` and `OBSERVING` are skipped with `degraded.execution` /
`degraded.observation` set, and the run ends **`BLOCKED`** — "re-run in the
desktop app to complete real execution + runtime observation." It is **never**
falsely `VERIFIED`.

## Verification

```bash
node test/run.js               # 420 checks incl. test/ultramode.test.js (82)
npm run smoke                   # renderer boots clean
npm run smoke:observer          # observer classifies REAL / MOCK / BROKEN / SKIPPED
npm run acceptance              # 38/38 — the 8 engines together on a fixture
npm run acceptance:build        # 20/20 — repo-scale generation from a spec
npm run acceptance:ultramode      # the closed loop: prompt -> SOVEREIGN VERIFIED,
                                #   + resume-after-interrupt, + two negative scenarios
```

`test/ultramode.test.js` exercises the state machine exhaustively with the real
Contract / Universal / Scaffold / TestGen / Deploy engines and stubbed
verification engines (driven by a mutable world): happy path → `VERIFIED`;
defect → bounded repair → `VERIFIED`; repair budget exhausted → `FAILED`;
rollback of a worsening repair; cancellation (paused + mid-run); resume after a
simulated crash with no regeneration; unsafe → `BLOCKED`; unsupported →
`BLOCKED`; blocking-question → `NEEDS_INPUT` → answer → continue; browser-mode
degradation; deterministic ids; requirement traceability; secret redaction.

`npm run acceptance:ultramode` proves the **real** integration end to end: an empty
workspace, the acceptance prompt, a repairable defect injected into the generated
output, real `npm test/build/lint`, a real runtime crawl, a real `Recovery`
repair, DoD `PASS`, `SOVEREIGN VERIFIED` — then a resumed run and the two
negative scenarios.

## Honest remaining limitations

- The generated frontend is intentionally vanilla JS + a JSON/pg store so the
  generated `npm test` runs offline and the observer can drive it. Real
  React/Next/mobile output is a separate generation backend, not this loop.
- Email/SMS job *delivery* is logged, not wired to a provider — that needs the
  user's credentials.
- Deployment stops at generated IaC + a deploy script. Nothing is pushed.
- The LLM enrichment path (extra optional requirements, model-assisted repair)
  is available but off by default and never required.
- `acceptance:ultramode` runs Electron and real `npm`; it needs a machine that can
  run the desktop app (CI: the `Desktop` job).
