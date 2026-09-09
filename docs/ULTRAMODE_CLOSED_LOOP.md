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
  → Engine.TestGen.generate             (API + chaos + a11y + e2e + install + upgrade + journey suites)
  → Engine.Deploy.apply                 (Docker + Compose IaC — never pushed)
  → Engine.Docs.generate                (README + docs/API/DATABASE/DEPLOYMENT/TROUBLESHOOTING)
  → Engine.Sovereign.analyze            (static graph + validator + security + a11y + visual + deps/licences
                                         + perf + localization + journeys + features + refactor + upgrade
                                         + design + docs + CI/CD + bootstrap + release + ADR ledger + delivery)
  → Engine.Sovereign.runEvidence        (REAL npm test / build / lint)
  → Engine.Sovereign.observe            (runtime crawl of the running app)
  → Engine.Ledger.build                 (claim → evidence → confidence)
  → Engine.Recovery.run                 (snapshot → repair → verify)
  → Engine.DoD.evaluate + certificate   (14 blocking gates)
  → Engine.Delivery.write               (one /delivery/ bundle: manifest + cert + evidence + continuation + docs)
  → SOVEREIGN VERIFIED  |  PARTIAL  |  BLOCKED  |  FAILED
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
| `GENERATING` | snapshot `pre-generate` → Scaffold + TestGen + Deploy + Docs (README + docs/API/DATABASE/DEPLOYMENT/TROUBLESHOOTING) write files |
| `VALIDATING` | `Sovereign.analyze` (graph, validator, security, mockscan) + baseline ledger/DoD |
| `EXECUTING` | `Sovereign.runEvidence(['test','build','lint'])` (real npm) |
| `OBSERVING` | `Sovereign.observe` (isolated hidden window crawl of the running app) |
| `REPAIRING` | snapshot `pre-repair-N` → `Recovery.run` → re-analyze; roll back if worse |
| `REVERIFYING` | re-run execution + observation + analyze; evaluate the DoD gate |
| `VERIFIED` | every DoD gate passed **with a real certificate** |
| `PARTIAL` | a staged runtime-adapter target (iOS off-macOS · **native desktop** — Tauri `cargo check` passes, packaged bundle needs `@tauri-apps/cli` · **browser extension** — MV3 validated + built, load-unpacked needs Playwright) where every stage this host **can** run passed and the rest are stage-`BLOCKED` on host tooling. `SOVEREIGN VERIFIED — PARTIAL`. Not a FAIL, not a blanket BLOCKED |
| `BLOCKED` | safety refusal, unanswered blocking question, a required runtime prerequisite is entirely missing, or the environment cannot verify (browser mode) |
| `FAILED` | the DoD gate did not pass after the repair budget, a static-validation / build failure, or an internal error |
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

## Delivery archive

At every terminal state (`VERIFIED` / `PARTIAL` / `BLOCKED` / `FAILED` /
`CANCELLED`) `Engine.Delivery.write()` assembles a single self-contained bundle
under `/delivery/`: `MANIFEST.json` (verdict, DoD summary, per-file + whole-bundle
FNV-1a hashes), a human `README.md`, the certificate + run report, every
`.sovereign/` evidence file under `evidence/`, `continuation/ultramode-run.json` +
`ultramode-plan.json` (so `Engine.UltraMode.resume()` works on any machine), and
the generated `docs/`. The desktop `ws:exportDelivery` IPC zips it to a file the
user chooses. Nothing is pushed.

## Supported stack

Generated today, and nothing else is claimed:

Every entry below is verified the same way — the loop generates it, runs it,
and observes it. Nothing is claimed that a generated test does not exercise
(`test/stacks.test.js`).

| Layer | What is generated |
|---|---|
| Frontend | vanilla HTML/CSS/JavaScript **or** a **React / Preact / Vue / Svelte / Angular** component app on a vendored ~220-line VDOM+hooks runtime (no build step); real `fetch` with loading/error/empty states; a `node:test` DOM-shim suite that renders it |
| Backend | **Node.js** zero-dependency HTTP server (routing table, JSON-body parsing, per-entity CRUD service layer, structured errors, rate limiter) **or** a pure-standard-library **Python 3** backend — `http.server` + `sqlite3` + `hashlib.scrypt` + `unittest`, no pip |
| Database | schema-enforced JSON store **or** `node-pg` adapter (chosen by `DATABASE_URL`) **or** SQLite (Python); real SQL migrations are always emitted |
| Auth | scrypt hashing (timing-safe), opaque server-side sessions, `requireAuth` / `requireRole`, first-user-is-admin — on both backends |
| API | REST **and/or** a zero-dependency **GraphQL** executor (queries + mutations + args + variables + nested selections), mounted at `POST /graphql` (+ SSE for jobs) |
| Realtime | a real **RFC 6455 WebSocket** server (handshake + masked-frame parse + text frames + ping/pong + broadcast) with a raw-socket round-trip test |
| Architecture | monolith **or** **microservices** — an API gateway (public port, owns auth + rate-limit + session verification) + one HTTP service per domain resource, wired by `docker-compose.prod.yml`; a generated test boots every service on real ports and round-trips a request through them |
| Async | durable in-process queue (retry, backoff, dead-letter) + polling worker + SSE hub (Node) |
| Ops | `/healthz` + `/readyz` + `/metrics` (Prometheus text) + one-line JSON access logs on every generated backend |
| Tests | generated unit + API-contract + adversarial chaos + a11y + frontend + graphql + ws + microservices `node:test` / `unittest` suites, run for real by `runEvidence()` |
| CI | GitHub Actions (`lint` → `migrate` → `test` → `build`; Python variant runs `compileall` + `unittest`) |
| Deploy | multi-stage `Dockerfile`, `docker-compose.prod.yml` (app + Postgres 16), and — on request — **Kubernetes** manifests (deployment/service/ingress/HPA/StatefulSet), a **Helm** chart, or **Terraform** (`main.tf` + variables + tfvars + `deploy/terraform.sh`) |

## Runtime-adapter targets (native mobile · ML training · EVM contracts)

These are **supported targets**, not "unsupported". When `contract.target` is
not `web` the loop routes through `Engine.RuntimeRouter` to a target-specific
execution + verification adapter. Full detail: **[`RUNTIME_ADAPTERS.md`](RUNTIME_ADAPTERS.md)**.

| Target | Generated | Verified by | If the host lacks the runtime |
|---|---|---|---|
| **EVM smart contracts** | ERC-20 / ERC-721 / voting / escrow Solidity (audited patterns, zero imports) + Foundry layout + a local-chain scenario | bundled `solc` + `@ethereumjs/vm` local deterministic chain — compile → deploy → run the transactions → inspect receipts/events/gas/state → static analysis (`+ forge test` when Foundry is installed) | never blocks — the runtime ships with CodeSovereign; a Solidity error is `FAIL` |
| **Native Android** | a buildable Kotlin/View Gradle project + a Maestro UI flow | `gradle assembleDebug` → headless AVD → `adb install` + launch → screenshot → `logcat` crash scan → Maestro | `BLOCKED ANDROID_SDK_REQUIRED` / `NO_EMULATOR_ACCELERATION` / … — the APK build evidence is kept |
| **Native iOS** (staged — see [`RUNTIME_ADAPTERS.md`](RUNTIME_ADAPTERS.md#native-ios--staged)) | SwiftUI + SwiftPM + xcodegen + Theos project | `sourceGeneration` + `staticValidation` on **every host**; then Xcode (macOS) / xcross (Flutter-iOS) / Theos (plain-Swift) / source-only. `simctl` on macOS | per-stage: `build` / `simulator` return `MACOS_XCODE_REQUIRED` / `MACOS_SIMULATOR_REQUIRED`; the run is **`PARTIAL`** (SOVEREIGN VERIFIED — PARTIAL), not BLOCKED |
| **ML model training** | a real PyTorch project (char-LM / classifier / regressor) + dataset inspector + `config.yaml` for the LLM scale-up | `python train.py` for real → decreasing loss curve + hashed checkpoint + held-out metric | `BLOCKED PYTORCH_NOT_INSTALLED` / `DATASET_REQUIRED` / `INSUFFICIENT_COMPUTE (suggestedStrategy: QLoRA)` |

`BLOCKED` always names the exact missing prerequisite and the command to install
it. **support ≠ environment availability** — the capability is fully supported;
this host just can't run it right now.

Still genuinely narrow: **gRPC** (a `.proto` + a Node implementation are generated,
but cross-language stub generation via `protoc` is not run) and **repackaging
CodeSovereign itself**.

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
node test/run.js               # 781 checks incl. ultramode.test.js (101) + stacks.test.js (§1-20) + adapters.test.js
npm run smoke                   # renderer boots clean
npm run smoke:observer          # observer classifies REAL / MOCK / BROKEN / SKIPPED
npm run acceptance              # 38/38 — the 8 engines together on a fixture
npm run acceptance:build        # 26/26 — repo-scale generation from a spec, DoD 14/14
npm run acceptance:ultramode    # 57/57 — the closed loop: prompt -> SOVEREIGN VERIFIED,
                                #   + resume-after-interrupt, + negative + iOS-staged + EVM scenarios
```

`test/ultramode.test.js` exercises the state machine exhaustively with the real
Contract / Universal / Scaffold / TestGen / Deploy / RuntimeRouter / Blockchain /
Mobile / ML engines and stubbed verification engines (driven by a mutable
world): happy path → `VERIFIED`; defect → bounded repair → `VERIFIED`; repair
budget exhausted → `FAILED`; rollback of a worsening repair; cancellation; resume
after a simulated crash with no regeneration; unsafe → `BLOCKED`; **runtime
target iOS on a non-macOS host → `PARTIAL` (source + static verified; build/simulator host-limited)**;
**blockchain adapter PASS → `VERIFIED`**; **ML adapter FAIL → `FAILED`**;
blocking-question → `NEEDS_INPUT` → answer → continue; browser-mode degradation;
deterministic ids; requirement traceability; secret redaction.

`npm run acceptance:ultramode` proves the **real** integration end to end: an empty
workspace, the acceptance prompt, a repairable defect injected into the generated
output, real `npm test/build/lint`, a real runtime crawl, a real `Recovery`
repair, DoD `PASS`, `SOVEREIGN VERIFIED` — then a resumed run, an unsafe →
`BLOCKED`, an iOS request → `PARTIAL` (SwiftUI + SwiftPM project
generated), and an **ERC-20 request → real `solc` compile → deploy on a local
chain → real transactions → SOVEREIGN VERIFIED**.

## Honest remaining limitations

- The component-framework frontends (React/Vue/…) run on a vendored VDOM
  runtime, not the real framework's toolchain — chosen so the generated
  `npm test` runs offline with no `npm install` and the observer can drive the
  DOM. Svelte/Angular map to the same runtime with a recorded substitution.
- Microservices share one database (`DATABASE_URL`). The split is at the API and
  deployment boundary — each service scales, deploys and fails independently —
  not data isolation; per-service schema separation is a follow-on migration.
- Native mobile / ML training / EVM contracts are **supported targets** with
  runtime adapters (see [`RUNTIME_ADAPTERS.md`](RUNTIME_ADAPTERS.md)). When the
  host lacks the runtime (no Android SDK, no macOS worker, no PyTorch, no GPU for
  a large model) the run ends `BLOCKED` with the exact prerequisite — the
  artifact is still generated. iOS build/simulator stages need macOS or a compatible xcross/Theos target (source + static verification run everywhere → PARTIAL); large-model
  fine-tuning always needs a GPU.
- Email/SMS job *delivery* is logged, not wired to a provider — that needs the
  user's credentials.
- Deployment stops at generated IaC + a deploy script. Nothing is pushed.
- The LLM enrichment path (extra optional requirements, model-assisted repair)
  is available but off by default and never required.
- `acceptance:ultramode` runs Electron and real `npm`; it needs a machine that can
  run the desktop app (CI: the `Desktop` job).
