# GodMode gap analysis

Measures the current codebase against the two blueprints:

- `CodeSovereign_GodMode_Master_Blueprint.docx` — 72-section "everything it must do"
- `CodeSovereign Universal Prompt-to-Application Build Flow.docx` — the 20-stage pipeline

**Ratings:** ✅ real · 🟨 partial (works but shallow / not wired as a gate) · 🟧 stub (UI or plan only, no execution) · ⬜ missing.

---

## 1. The thesis — what actually makes it unique

Most AI builders stop at *prompt → files*. This codebase already has the one
thing they lack and the blueprint calls the "defining differentiator": a **real,
offline, evidence-based verification substrate**.

| Already real and rare | Where |
|---|---|
| Runs the user's project for real — `npm test / build / lint / typecheck` through a trust-gated proc bridge, structured evidence per gate | `electron/lib/proc.js`, `dist/desktop/desktop-exec.js`, `.sovereign/execution-evidence.json` |
| Drives the *running* app in an isolated window, crawls every control, classifies each **REAL / MOCK / BROKEN / SKIPPED** | `electron/lib/observer.js`, `dist/desktop/desktop-observe.js`, `.sovereign/runtime-trace.json` |
| Aggressive simulation / fake-feature detection (~20-rule signal table + intent inference) | `dist/engine.mockscan.js` |
| Repository-scale AST + connection graph + drift fingerprint | `dist/engine.ast.js`, `dist/engine.sovereign.js` |
| Autonomous repair loop with checkpoint + rollback + level verification | `dist/engine.recovery*.js` |
| Persistent project memory + interaction-traceability matrix | `.sovereign/` file set |
| **End-to-end acceptance proof** the eight engines work together | `electron/acceptance.js`, `docs/ACCEPTANCE.md` |

**What the blueprint says uniqueness still requires** (its own P0 list, § "Recommended Build Priority"):

1. Product Contract + Requirement DAG — turn intent into explicit, testable requirements with dependencies
2. Evidence Ledger — every PASS/FAIL claim traceable to a test / runtime observation / file / artifact
3. GodMode Orchestrator — one closed loop: plan → implement → run → observe → repair → re-verify
4. Definition of Done — block "complete" when code exists but runtime behaviour is absent

All four now exist as a first vertical slice — `dist/engine.{contract,ledger,dod,orchestrator}.js`,
proven end-to-end by the acceptance run (`docs/ACCEPTANCE.md` §8): the DoD gate
refuses a fixture with planted MOCK/BROKEN controls, the orchestrator generates
the real slices, and the gate flips to **SOVEREIGN VERIFIED**. What remains is
breadth — richer generators, an LLM-driven front end, and P1–P3 below. The
uniqueness play stays the same: deepen the loop around the proof engine, **not**
chase the 68 framework / platform features.

---

## 2. Capability matrix — GodMode blueprint

### A. Product & Architecture (§1–5)

| § | Capability | State | Notes |
|---|---|---|---|
| 1 | Universal project creation (every surface) | 🟨 | Generation = one LLM round-trip → flat HTML/CSS/JS SPA (`engine.llm.js`) or ~15 single-page templates (`engine.js`). No repo-scale / backend / mobile / desktop output. |
| 2 | Intent engine | 🟨 | `engine-universal.js` `Normalizer` + `Classifier` — keyword rules + a `SPELLFIX` table, not model-driven; no attachment/screenshot parsing. |
| 3 | Requirement completeness (requested→implied→missing→verified) | 🟨 | `engine.requirements.js` has 13 domain packs, archetypes, contradictions, weighted scoring, progressive questions. `engine-universal.js RequirementsEngine` expands a prompt to a functional/non-functional list. Neither is tied to a per-requirement **verification** record. |
| 4 | Autonomous architecture engine | 🟧 | `engine-universal.js` produces an architecture *object* (client/gateway/backend/data components) + `architecture.md`. Rule-based; not used to drive generation. |
| 5 | Full repository generator | ⬜ | Generator writes a flat SPA, not `/apps /packages /services /database /tests /infrastructure`. |

### B. Execution & Runtime Truth (§6–9)

| § | Capability | State | Notes |
|---|---|---|---|
| 6 | Real execution engine (install/lint/typecheck/test/build/run + evidence) | ✅ | `runEvidence()` + proc bridge. Missing: `install` and `run/serve` as recorded gates; artifact packaging as a gate. |
| 7 | Runtime truth engine (enumerate + exercise + classify controls) | ✅ | `observer.js` crawl → REAL/MOCK/BROKEN/SKIPPED/DISABLED/HIDDEN. Missing: API/IPC/workflow-transition exercising; "every production control must have an observable effect" as a **release gate**. |
| 8 | Simulation / fake-feature detection | ✅ | `engine.mockscan.js`. Missing: wired as a hard **Zero-Mock release gate** (§67). |
| 9 | AST & semantic code intelligence | ✅ | `engine.ast.js` (acorn) + connection graph. |

### C. UI, Backend & Data (§10–16)

| § | Capability | State | Notes |
|---|---|---|---|
| 10 | Dependency intelligence (compare / abandoned / vuln / license / dedupe / safe-upgrade) | 🟨 | `npm audit` surfaced in CI; license notes in `dist/vendor/README.md`; requirements pack flags some. No comparison / abandonment / conflict / safe-upgrade engine. |
| 11 | UI generation from prompt / screenshot / Figma / wireframe | 🟨 | Prompt-to-UI only (LLM/templates). No vision input, no reconstruction. |
| 12 | Visual validation (render → inspect clipping/overflow/contrast) | ⬜ | Not built. The observer window could host this. |
| 13 | Screenshot fidelity mode | ⬜ | Not built. |
| 14 | Backend builder (routes / workers / queues / auth / uploads / payments / webhooks / websockets) | ⬜ | `dist/backend.js` is an in-page mock API console, not a backend generator. |
| 15 | Database architect (schema / migrations / constraints / indexes / query analysis / N+1) | 🟧 | Pipeline/SQL files are *detected*; no design, migration authoring, or query analysis. |
| 16 | Auth & authz engine (passwordless / OAuth / passkeys / MFA / RBAC / tenant isolation / attack tests) | ⬜ | Not built (there is an OAuth *connector* screen for CodeSovereign itself, not a generator). |

### D. Security, Testing & Recovery (§17–24)

| § | Capability | State | Notes |
|---|---|---|---|
| 17 | Security GodMode (injection / XSS / CSRF / SSRF / secrets / headers / CORS / deps) on the *product* | 🟨 | Secret redaction in `.sovereign`; CSP checks + `eval` findings in recovery/validator; `electron/SECURITY.md` covers the shell's own IPC surface. No product-wide security scanner. |
| 18 | Privacy engine (sensitive-data flow, retention, export) | ⬜ | Requirements pack names GDPR; no flow analysis. |
| 19 | Testing factory (autogenerate unit/integration/e2e/a11y/install/upgrade/recovery tests) | ⬜ | `runEvidence` runs *existing* tests; nothing generates them. |
| 20 | Adversarial test engine (disconnect net / kill backend / corrupt DB / expired tokens / malformed payloads) | ⬜ | Not built. |
| 21 | Autonomous debugger (evidence → hypotheses → test → repair) | 🟨 | `engine.recovery.js` `rootCauseFor()` + plan/repair; hypothesis testing is implicit, not explicit. |
| 22 | Root-cause engine (cause → cascade → fix → prevention) | 🟨 | `rootCauseFor()` produces cause/cascade/confidence; no "prevention" (add test + version gate) output. |
| 23 | Repair All (dependency-aware ordering, re-run full chain) | 🟨 | Recovery loop repairs validator findings + re-verifies levels; ordering is confidence-based, not the blueprint's build→dep→arch→backend→db→frontend→runtime→security→test→packaging order. |
| 24 | Self-healing loop until acceptance criteria met | 🟨 | Recovery `loop()` runs to convergence on validator health — **not** to "acceptance criteria satisfied", because there are no machine acceptance criteria yet. |

### E. Autonomous Agents & AI (§25–31)

| § | Capability | State | Notes |
|---|---|---|---|
| 25 | Multi-agent software company (17 agents + orchestrator) | 🟧 | `engine-universal.js TaskGraph` *names* agents and builds a dependency DAG with `PENDING` tasks — **no executor**, no agents, tasks never run. |
| 26 | Agent conflict resolution / arbitration | ⬜ | Not built. |
| 27 | AI/ML development — model lifecycle, quantization, VRAM | 🟨 | `dist/engine.modelmanager.js`: `estimate(params, quant, ctx)` (real GGUF byte-per-weight table + KV cache), `canRun(model, hw)`, a curated 26-model catalogue, real `ollama pull` via the proc bridge. Model *conversion* still needs a llama.cpp toolchain (contract only). |
| 28 | Local AI router (Ollama / llama.cpp / LM Studio / vLLM / Jan / **OmniRoute**) | ✅ | `dist/engine.airouter.js` + `electron/lib/aihost.js`: discovers running local runtimes + their models over the vetted main-process proxy, `recommend(hw, task)` picks the largest model that fits (GPU vs CPU aware), `apply()` wires it into `Engine.LLM`, `route()` does the whole flow. **OmniRoute** (github.com/diegosouzapw/OmniRoute) is a first-class runtime + provider — one-click "Enable free AI" installs + starts `npx omniroute serve` and wires `model:"auto"` (no key, ~150 free provider tiers). Settings → **Local AI** card (model catalogue with per-host fit + `pull`, manual endpoint, wiring audit). |
| 29 | AI provider abstraction | ✅ | `engine.llm.js` registry (incl. keyless OmniRoute) + keychain + main-process proxy so **local** endpoints work despite CSP. `Engine.AI` is a single facade the app talks to: `ready()`, `ensure()` (auto-connect: local → OmniRoute), `chat()`, and `consumers()` — a live audit of every AI touch-point. For *generated apps*: `Engine.Orchestrator` `ai-provider` template emits a vendor-neutral `src/ai/provider.js` (Ollama-first) + `.env.example`; the LLM system prompt forbids hard-coding a vendor. **All 7 AI touch-points wired**: Agent, Orchestrator, Contract, Recovery (`aiSuggest` — model-drafted patch when deterministic generators no-op), Router, Requirements (`aiAssist` — folds AI archetypes + implied requirements into `requirements.json` / `requirements-ai.json`, and into the product contract), Universal normalizer (`aiNormalize` / `buildStateAsync` — an LLM reads the objective when connected, keyword rules otherwise). |
| 30 | Cost sovereignty engine (mandatory vs optional cost, zero-cost alternative) | ✅ | `dist/engine.cost.js`: ~50-entry knowledge table (AI / db / auth / email / payments / storage / search / vector / analytics / monitoring / hosting) → tier + `mandatory` + zero-cost alternatives. `analyze()` scans `package.json` + `.sovereign` externals → `.sovereign/cost-analysis.json` + `cost-sovereignty.md`; run in `Sovereign.analyze()`. Settings → **Cost Sovereignty** card. The **AI** row of the table points every paid model API at OmniRoute / local Ollama. |
| 31 | Offline development | ✅ | Whole app is offline: vendored parsers, local FS, local exec, local LLM option. |

### F. Hardware, Build & Release (§32–40)

| § | Capability | State | Notes |
|---|---|---|---|
| 32 | Hardware intelligence (CPU / RAM / GPU / VRAM / toolchains) | ✅ | `electron/lib/hardware.js` + `dist/engine.hardware.js`: `os` facts, `nvidia-smi` / `system_profiler` / Electron GPU report for the GPU + VRAM, `--version` probes for node/npm/pnpm/python/rust/go/java/docker/ollama/cmake. Read-only, cached. Browser mode falls back to `navigator` + WebGL renderer string. Feeds the AI router and (next) the build matrix. |
| 33 | Environment bootstrapper (detect/install Node/Python/Rust/Android SDK/…) | 🟨 | `engine.adapters.js` *detects* runtimes from lockfiles/manifests; no install/verify. |
| 34 | Cross-platform build matrix (truthful per-target status) | 🟨 | electron-builder configured for win/mac/linux; only **Windows** built & tested in CI. No Android/iOS. No per-target status board. |
| 35 | Packaging engine (EXE/MSI/DMG/AppImage/APK/IPA/Docker/npm/wheel/VST3) | 🟨 | Windows NSIS + portable only. |
| 36 | Installer engineering (install/upgrade/repair/uninstall/silent/rollback + verification) | 🟨 | NSIS installer exists; lifecycle-path verification (the Phase-10 "test the downloaded installer") is still manual. |
| 37 | Release engineering (bump / changelog / tag / sign / checksums / notes / publish) | 🟨 | `release.yml` exists; no changelog/notes generation; signing disabled (unsigned alpha). |
| 38 | Git intelligence | ✅ | `electron/lib/git.js` + checkpoint/stash in exec layer. |
| 39 | GitHub automation | 🟨 | `engine.github.js` / `app.github.js` — connector + PR/issue helpers; not a full delivery workflow. |
| 40 | CI/CD generator (GH Actions / GitLab / Jenkins / Azure / Bitbucket) | 🟨 | `engine-pipeline-builder.js` generates a GitHub Actions file; `engine.pipeline-parse.js` parses & gap-checks many. Others not generated. |

### G. Deployment, Operations & Quality (§41–49)

| § | Capability | State |
|---|---|---|
| 41 | Deployment engine (VPS / Docker / K8s / Vercel / Netlify / cloud / self-host / desktop-local) | ⬜ |
| 42 | Infrastructure as code (Dockerfile / compose / Terraform / K8s / proxy / TLS / DNS) | 🟨 generation of a Dockerfile only |
| 43 | Monitoring (logs / metrics / traces / health / crash / uptime / audit) | ⬜ (the *shell* has a command-audit log; nothing generated for the product) |
| 44 | Production diagnosis (correlate logs / code / version / DB / commits) | ⬜ |
| 45 | Performance engineering (profile CPU/RAM/GPU/IO/DB/render/startup/bundle) | ⬜ |
| 46 | Memory-leak detection | ⬜ |
| 47 | Accessibility as a release gate | 🟨 validator flags missing alt/lang; not a gate, no keyboard/focus/ARIA/contrast audit |
| 48 | Localization engine | ⬜ |
| 49 | Documentation factory | 🟨 `architecture.md` + `product-brief.md` + `analysis-summary.md` generated; not the full README/API/DB/deploy/troubleshooting set from real repo+runtime |

### H. Governance, Reverse Engineering & Evidence (§50–58)

| § | Capability | State | Notes |
|---|---|---|---|
| 50 | Architecture drift | ✅ | Graph fingerprint + `driftDetected` + diagram regeneration. Missing: contract *rules* (frontend↔DB direct access, unapproved service). |
| 51 | Code-quality governance (max fn size / complexity / no circular / no dead code / no console / no TODO) | 🟨 | Validator finds some; not configurable policy, not a gate. |
| 52 | License intelligence (deps + models + fonts + assets, conflict with distribution model) | ⬜ | Vendored libs documented manually. |
| 53 | Existing-app reverse engineering (what is it / how complete / shippable?) | ✅ | This is essentially what `Engine.Sovereign.analyze()` + observe + evidence *is*, for an imported repo. |
| 54 | Completion auditor (evidence-backed per-dimension %) | 🟨 | The evidence ledger's per-category pass/fail is the substrate now; a per-dimension % roll-up still reads `engine-universal.js CompletionScorer` (plan-based). |
| 55 | Evidence ledger (CLAIM → EVIDENCE → CONFIDENCE, per claim) | ✅ | `dist/engine.ledger.js` → `.sovereign/evidence-ledger.json` — every requirement's claim with its evidence rows, assertion count, failure count and confidence. |
| 56 | Definition of Done engine | ✅ | `dist/engine.dod.js` → `.sovereign/definition-of-done.json` (8 criteria that block) + `release-certificate.md`. |
| 57 | Sovereign memory (arch decisions / user decisions / rejected approaches / conventions / design language / security rules) | 🟨 | `.sovereign/decision-state.json` + `project.json` + `changes.md` + `assumptions.md`. No ADR ledger, no "rejected approaches", no conventions capture. |
| 58 | Decision ledger (ADR-style) | ⬜ | `decisions.md` is referenced by the build-flow doc; not produced. |

### I. Evolution, Feature Completion & Chaos (§59–68)

| § | Capability | State |
|---|---|---|
| 59 | Change impact analysis / blast radius | 🟨 `Graph.impactOf()` exists; no user-facing "N files, M tests, migrations, installer" report |
| 60 | Safe refactoring / staged migration (JS→TS, Electron→Tauri, …) | ⬜ |
| 61 | Failure rollback (checkpoint → modify → verify → rollback) | ✅ `Snapshots` + git stash checkpoint in Recovery |
| 62 | Autonomous upgrade engine (framework/runtime/SDK w/ migration) | ⬜ (we did this *by hand* for electron 33→43 this session) |
| 63 | Feature builder (implement the entire functional dependency surface) | ⬜ |
| 64 | Feature completion graph | ⬜ |
| 65 | User-journey testing | ⬜ |
| 66 | Chaos mode | ⬜ |
| 67 | Zero-Mock release gate | 🟨 detection exists (`mockscan`); not enforced as a gate |
| 68 | Sovereign release certificate (cross-gate, evidence-backed) | 🟧 `engine.recovery.v4.js` has a "certificate" concept scoped to recovery runs; not the multi-gate SOVEREIGN VERIFIED cert |

### J. Autonomy Model & Pipeline (§69–72)

| § | Capability | State |
|---|---|---|
| 69 | Graduated control levels (Assist / Build / Engineer / Autopilot / GodMode) | ⬜ |
| 70 | GodMode command (compact BUILD/TARGET/CONSTRAINTS/MODE declaration) | ⬜ |
| 71 | The GodMode pipeline (one closed loop intent→…→SOVEREIGN VERIFIED) | 🟨 the P0 slice (`engine.orchestrator.js`) closes the loop for a task DAG with generators; the 20-stage `engine-universal.js` front end still feeds it only a plan |
| 72 | The defining difference (verified outcomes, not files) | 🟨 now demonstrated on **generated** code too (acceptance §8), for template/LLM-task slices; not yet for a full from-scratch product |

---

## 3. Build-flow doc — the 20 stages

| Stage | State | Gap |
|---|---|---|
| 1 Prompt intake / composer | 🟨 | text + platform + budget only; no attachments/screenshots/repos/audio |
| 2 Prompt normalization | 🟨 | keyword + spellfix rules, no model |
| 3 Application classifier | 🟨 | rule-based; `estimatedModules` is a heuristic |
| 4 Requirements engine | 🟨 | list produced; not verified per-requirement |
| 5 Feasibility & constraint analysis | 🟧 | returns mostly hard-coded "pass" checks |
| 6 Product specification (`/project-docs/*.md`) | 🟧 | `writeProjectDocs()` emits markdown; not driven into the build |
| 7 Architecture generation | 🟧 | object + `architecture.md`; not enforced |
| 8 Technology stack selection | 🟨 | `StackSelector` picks by rules; not validated against the machine |
| 9 Project blueprint (repo structure) | 🟧 | a structure *list*; generator ignores it |
| 10 Multi-agent orchestration | 🟧 | DAG of `PENDING` tasks, **no executor / agents** |
| 11 Code generation | 🟨 | one LLM call → flat SPA, or templates |
| 12 Connection & wiring engine | 🟨 | `engine-universal.js` produces wiring *contracts* + a simple issue list; no deep "button→handler→endpoint→service→DB" verification of generated code |
| 13 Build & execution | ✅ | real, via proc bridge (for projects that build) |
| 14 Automated testing | 🟨 | runs existing tests; none generated |
| 15 Repair loop | 🟨 | Recovery loop; not requirement-driven |
| 16 Quality gate (requirements met / no mocks / no broken routes / UX verified) | 🟧 | the ingredients exist; not assembled into one gate |
| 17 Packaging | 🟨 | Windows only |
| 18 Deployment | ⬜ | |
| 19/20 Delivery contract (code + build + tests + package + guide + evidence + known limits + continuation state) | 🟨 | `.sovereign/` covers evidence + continuation; no assembled delivery bundle |

---

## 4. What to fix to make it unique — prioritised

Aligned to the blueprint's own P0→P3. Each builds on the proof substrate that
already exists; none requires new frameworks.

### P0 — close the loop around the proof engine  ✅ built · proven by `docs/ACCEPTANCE.md` §8

1. ✅ **Product Contract** — `dist/engine.contract.js` → `.sovereign/product-contract.json`.
   Requirements with machine-checkable `acceptanceCriteria` (execution gate,
   control-observed-REAL, no-mock, file-exists, CI-runs-test+build). Rule-derived
   offline; `Engine.LLM` enrichment when a provider is configured.

2. ✅ **Evidence Ledger** — `dist/engine.ledger.js` → `.sovereign/evidence-ledger.json`.
   Every requirement → `{claim, evidence:[{kind, ref, result}], assertions,
   failures, confidence}`, checked against the existing `.sovereign/` evidence.
   A requirement blocks DONE only when **demonstrably failing**; merely-unproven
   criteria are coverage gaps, not failures.

3. ✅ **Definition-of-Done gate** — `dist/engine.dod.js` → `.sovereign/definition-of-done.json`
   (8 criteria) + `release-certificate.md` (SOVEREIGN VERIFIED). Judges "no fake
   implementation" from what runtime observation actually *exercised*, not from
   static guesses. Works on any open project.

4. ✅ **GodMode Orchestrator** — `dist/engine.orchestrator.js`. Executes a task
   DAG: per task, run a generator (built-in template, or `Engine.LLM` prompt),
   write the slice, then loop `analyze → runEvidence → observe → Recovery →
   re-verify` until the task's target is met. The acceptance run proves it turns
   the fixture's 3 planted MOCK/BROKEN controls into REAL ones and flips the DoD
   gate red → green.

Fixes shipped alongside so the loop is trustworthy: the static validator and the
recovery graph now resolve HTML `src`/`href` and relative import specifiers
relative to the referring file (was flagging every co-located `app.js`/`app.css`
as a broken ref, which recovery then "repaired" into breakage); the runtime
observer polls for a settled effect and double-resets between controls so an
effect is attributed to the control that caused it; `observer-preload`
re-attaches its MutationObserver once `<body>` exists.

**Still open in P0:** the orchestrator's `Engine.Universal.TaskGraph` fallback
tasks have no generators (only templates + LLM prompts do); the rule-based
normalizer/classifier is unchanged; the contract's LLM path is untested against a
live provider.

### P1 — make the verdicts binding

5. **Zero-Mock release gate** — wire `mockscan` results into the DoD gate: any
   MOCK/BROKEN control on a production path blocks release (§67).
6. **Completion Auditor from evidence** — rewrite `CompletionScorer` to read
   `.sovereign/*` instead of the plan; per-dimension %, evidence-backed (§54).
7. **Sovereign Release Certificate** — one cross-gate cert (compile / tests /
   runtime controls / security / mock detection / architecture / packaging) with
   the evidence-ledger assertion count (§68).
8. **Root-cause "prevention" output** + **dependency-ordered Repair All**
   (§22–23).

### P2 — expand the truth surface

9. **Product security scan** — an engine that scans *generated/imported* code for
   injection / XSS / CSRF / SSRF / secrets / unsafe upload / CORS, feeding the
   ledger (§17). Reuse the AST layer.
10. **Testing factory** — generate unit + e2e + a11y tests per requirement so
    `runEvidence` has something real to run (§19).
11. **Visual validation** + **user-journey testing** in the observer window
    (§12, §65).
12. **Adversarial / chaos harness** — the observer already blocks the network and
    isolates a session; add "kill backend / corrupt data / expired token" and
    assert recovery (§20, §66).

### P3 — breadth (only after P0–P2)

Real backend/DB/auth generators, deployment adapters, cross-platform build
matrix, graduated control levels, model conversion/quantization tooling.

**Done ahead of order** (§27–32): hardware intelligence, the local-AI router +
model lifecycle, cost sovereignty, the generated-app AI abstraction —
`dist/engine.{hardware,modelmanager,airouter,cost}.js`, `electron/lib/{hardware,aihost}.js`.
Tests: `test/ai.test.js`. UI: Settings → *Local AI* + *Cost Sovereignty*.

---

## 5. Recommended next slice

**P0 #1–#4 as one vertical**, proven with the existing acceptance fixture:

1. `product-contract.json` from the fixture's prompt (or its README) with
   machine-checkable acceptance criteria.
2. `evidence-ledger.json` populated from the run the acceptance harness already does.
3. `definition-of-done.json` gate — generalise `electron/acceptance.js`'s
   9-criterion gate to read any project's `.sovereign/`.
4. `orchestrator.js` executing the task DAG for **one** generated slice
   (e.g. "add a working Export CSV endpoint" — turning the fixture's planted MOCK
   into a REAL control) and looping until the DoD gate passes.

That single slice demonstrates the whole blueprint thesis end to end —
**intent → contract → generate → execute → observe → repair → prove → certify** —
on generated code, which is the one thing the current build can't yet claim.
