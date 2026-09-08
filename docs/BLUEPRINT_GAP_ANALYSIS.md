# Blueprint gap analysis

Measures the current codebase against the two blueprints:

- `CodeSovereign_GodMode_Master_Blueprint.docx` — 72-section "everything it must do"
- `CodeSovereign Universal Prompt-to-Application Build Flow.docx` — the 20-stage pipeline

**Ratings:** ✅ real · 🟨 partial (works but shallow / not wired as a gate) · 🟧 stub (UI or plan only, no execution) · ⬜ missing.

---

## 0. State of the app — honest standing

The core thesis (**verified outcomes, not files**) is **done and proven**: one
prompt → contract → plan → generate → run in the right runtime → observe →
repair → 12-criterion Definition-of-Done → `SOVEREIGN VERIFIED` / `PARTIAL` /
`BLOCKED` / `FAILED`, all offline, all evidence-backed. Four acceptance harnesses
(`node test/run.js` 556, `acceptance` 38, `acceptance:build` 22,
`acceptance:ultramode` 53) prove it end to end in the real Electron renderer.

**At / near 100% for the core loop:**

| Area | Where it landed |
|---|---|
| Proof engine (contract · ledger · DoD · certificate) | **12 gates** incl. **architecture/layering** (`engine.archrules.js`), **privacy/PII** (`engine.privacy.js`), **WCAG accessibility** (`engine.a11y.js`) and **visual integrity** (`engine.visualcheck.js` — multi-breakpoint render, overflow/clipping/contrast/zero-size); zero-mock + no-fake enforced |
| Repo-scale generation | Node **and** pure-stdlib Python backends; vanilla / React / Preact / Vue / Svelte / Angular frontends (vendored VDOM); GraphQL executor; RFC 6455 WebSockets; monolith **and** microservices (gateway + per-domain services + compose) |
| Deployment IaC | 10 targets — docker · compose · **kubernetes** · **helm** · **terraform** · fly · render · railway · vps · static (does not push — needs creds, by design) |
| Ops | every generated backend: `/healthz` · `/readyz` · `/metrics` (Prometheus) · JSON access logs |
| Cross-platform packaging | Windows NSIS + portable · **macOS dmg/zip (x64+arm64)** · **Linux AppImage+deb** — CI jobs on native runners |
| **Runtime-adapter targets** | **native Android** (real APK + headless emulator), **native iOS** (staged: source + static universal, build/sim via Xcode/xcross/Theos), **EVM contracts** (bundled solc + local chain — compile/deploy/transact/assert), **ML training** (real PyTorch run + checkpoint + metric). A missing host runtime → `BLOCKED <REASON>` / `PARTIAL`, never "unsupported" |

**Genuinely still open** (roughly, by the blueprint's own sections — most are
adjacent products, not core-loop gaps):

- **Design input** (§11): UI-from-screenshot / Figma import — ⬜ (prompt-to-UI
  only). *Visual validation + screenshot fidelity (§12–13) are **done*** —
  `engine.visualcheck.js` + `observer.visualProbe()`.
- **Prompt intake breadth** (stage 1): attachments / screenshots / audio / repo
  import — 🟨 (text only).
- **Model-driven intent** (§2–3): the normalizer/classifier are keyword rules +
  a spellfix table, not a model.
- **Ops depth** (§43–46): APM / traces / crash-reporting / performance profiling
  / memory-leak detection — ⬜ (each a hosted-collector product).
- **Localization engine** (§48), **license intelligence** (§52), **dependency
  intelligence** — compare / abandoned / safe-upgrade (§10) — ⬜/🟨.
- **Delivery archive** (§19/20): a single downloadable bundle (report + cert +
  evidence + continuation state) — 🟨 (the pieces exist as separate
  `.sovereign/` files + `ultramode-report.md`).
- **Documentation factory** (§49): full README / API / DB / deploy / troubleshoot
  set from repo + runtime — 🟨 (README + DATA_MODEL + architecture diagrams).
- **Refactoring / migration / upgrade engines** (§60, §62), **feature builder /
  completion graph** (§63–64), **user-journey testing** (§65) — ⬜.
- **e2e / install / upgrade test generation** (§19) — 🟨. *(Accessibility as a
  full gate (§47) is **done** — `engine.a11y.js`.)*

None of these block the core "prompt → verified application" loop; they are
breadth. The blueprint's own guidance (§ "Recommended Build Priority") is to
**deepen the loop around the proof engine, not chase the 68 framework features** —
which is what the last several sessions did.

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
3. Ultra Mode coordinator — one closed loop: plan → implement → run → observe → repair → re-verify
4. Definition of Done — block "complete" when code exists but runtime behaviour is absent

All four now exist as a first vertical slice — `dist/engine.{contract,ledger,dod,orchestrator}.js`,
proven end-to-end by the acceptance run (`docs/ACCEPTANCE.md` §8): the DoD gate
refuses a fixture with planted MOCK/BROKEN controls, the orchestrator generates
the real slices, and the gate flips to **SOVEREIGN VERIFIED**. What remains is
breadth — richer generators, an LLM-driven front end, and P1–P3 below. The
uniqueness play stays the same: deepen the loop around the proof engine, **not**
chase the 68 framework / platform features.

---

## 2. Capability matrix — blueprint

### A. Product & Architecture (§1–5)

| § | Capability | State | Notes |
|---|---|---|---|
| 1 | Universal project creation (every surface) | 🟨 | Generation = one LLM round-trip → flat HTML/CSS/JS SPA (`engine.llm.js`) or ~15 single-page templates (`engine.js`). No repo-scale / backend / mobile / desktop output. |
| 2 | Intent engine | 🟨 | `engine-universal.js` `Normalizer` + `Classifier` — keyword rules + a `SPELLFIX` table, not model-driven; no attachment/screenshot parsing. |
| 3 | Requirement completeness (requested→implied→missing→verified) | 🟨 | `engine.requirements.js` has 13 domain packs, archetypes, contradictions, weighted scoring, progressive questions. `engine-universal.js RequirementsEngine` expands a prompt to a functional/non-functional list. Neither is tied to a per-requirement **verification** record. |
| 4 | Autonomous architecture engine | 🟧 | `engine-universal.js` produces an architecture *object* (client/gateway/backend/data components) + `architecture.md`. Rule-based; not used to drive generation. |
| 5 | Full repository generator | ✅ | `dist/engine.scaffold.js` — a spec → a **complete, runnable, tested** dependency-free full-stack repo: backend + data layer + SQL migrations + auth + frontend + unit/integration tests + build/lint/migrate scripts + CI + Dockerfile + `.env.example` + README. Proven by `npm run acceptance:build` (generate → analyze → **real npm test/build/lint** → observe → DoD **SOVEREIGN VERIFIED**, 20/20). Wired into `Engine.Orchestrator` (`task.scaffold`). **Stack breadth** (all verified by generating → running → observing, `test/stacks.test.js`): React / Preact / Vue / Svelte / Angular component frontends via a vendored ~220-line VDOM+hooks runtime, no build step (`engine.frontends.js`); a pure-standard-library **Python** HTTP backend — `http.server` + `sqlite3` + `hashlib.scrypt` + `unittest`, no pip (`engine.pybackend.js`); a zero-dependency **GraphQL** executor — queries + mutations + args + variables + nested selections (`engine.graphql.js`); a real **RFC 6455 WebSocket** server (`engine.realtime.js`); **microservices** — an API gateway + one HTTP service per domain resource + `docker-compose.prod.yml`, with a generated test that boots every service on real ports and round-trips a request through them (`engine.microservices.js`). `specFromObjective()` uses `Engine.AI` for the data model when connected. |

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
| 12 | Visual validation (render → inspect clipping/overflow/contrast) | ✅ | `dist/engine.visualcheck.js` + `observer.visualProbe()`. The observer renders the running app at **mobile (375) / tablet (768) / desktop (1280)**, measures every element's box + computed style, and reports: page horizontal overflow, elements past the viewport edge, content clipped by `overflow:hidden`, covering fixed/sticky overlays, off-screen text, **zero-size interactive controls**, computed **contrast** below AA — with a screenshot per breakpoint. A static layer (no renderer) catches `overflow:hidden` on html/body, fixed pixel widths ≥ 500px, 100vw×100vh z-indexed overlays, missing viewport meta. `analyze()` → `.sovereign/visual-findings.json` + `visual-report.md`; new DoD criterion `visualIntegrityPass` — a **critical** defect (whole-page overflow, zero-size control, full-screen overlay) blocks release. `test/stacks.test.js` §13. |
| 13 | Screenshot fidelity mode | ✅ | `Engine.VisualCheck.fidelity(a, b)` — pixel diff of two PNG data URLs (offscreen canvas) → `{ changedPixels, ratio }`. `observer.visualProbe()` captures the reference set; a re-run compares. Used for "did the repair change the layout" and drift checks. |
| 14 | Backend builder (routes / services / validation / error handling / async infra) | ✅ | `dist/engine.backend.js` — real zero-dep HTTP server: routing table, JSON body parsing, per-entity CRUD service layer, ownership scoping, structured errors, static serving, in-memory rate limiter (120/min/IP → 429). `dist/engine.jobs.js` — durable job queue (`enqueue`/`claim`/`complete`/`fail`, 5 attempts, exponential backoff, dead-letter), a polling worker (`src/worker.js`, dispatches `src/jobs/<type>.js`), and an SSE hub (`src/events.js`, `/api/events`). `Engine.Scaffold` emits all of it + a passing `test/worker.test.js` when `spec.jobs`. **Not yet**: websockets (SSE only), uploads/payments/webhooks. |
| 15 | Database architect (schema / migrations / constraints / indexes / query analysis / N+1) | ✅ | `dist/engine.schema.js` — entity model → real SQL migrations (CREATE TABLE, FK + `ON DELETE`, `CREATE [UNIQUE] INDEX`, up+down) + a schema-enforcing data layer (types, required, max, defaults, auto-inc, FK existence, unique indexes, cascade delete) + N+1 / missing-FK-index analysis. JSON-backed for portability; the SQL is the real artefact for Postgres. |
| 16 | Auth & authz engine (password + RBAC + sessions + tenant scoping) | 🟨 | `dist/engine.auth.js` — generates a real auth module: scrypt hashing (`node:crypto`, timing-safe), opaque session tokens, `requireAuth` / `requireRole`, per-request user, first-user-is-admin, a login/register UI. **Not yet**: OAuth / passkeys / MFA / authorization attack tests. |

### D. Security, Testing & Recovery (§17–24)

| § | Capability | State | Notes |
|---|---|---|---|
| 17 | Product security scanner (injection / XSS / CSRF / SSRF / secrets / headers / CORS / deps) on the *product* | ✅ | `dist/engine.security.js` — product security scanner over the workspace source: SQL/command injection, XSS (`innerHTML`/`document.write` with dynamic data), path traversal, hardcoded secrets (GitHub/OpenAI/Slack/AWS/PEM/JWT/credential literals), `eval`/`new Function`, weak crypto (md5/sha1, `Math.random` for security values), wildcard CORS, insecure cookies, committed `.env` values, **unauthenticated mutating routes**, missing rate limiting. `scan()` → `score = 100 − high·20 − medium·7 − low·2` → `.sovereign/security-findings.json` + `security-report.md`, folded into `decision-state.json`. Runs inside `Sovereign.analyze()`; `Engine.DoD` reads `bySeverity.high` as the authoritative security gate. `electron/SECURITY.md` still covers the shell's own IPC surface. |
| 18 | Privacy engine (sensitive-data flow, retention, export) | ✅ | `dist/engine.privacy.js` — PII / data-protection scan over the generated workspace: secrets or whole request bodies in logs, personal data or credentials in a query string, a credential field serialised into a response, an unsanitised user row returned where the model has a `passwordHash` column, sensitive identifiers (SSN / card / passport) stored as plain columns, server-side data egress to a third-party host, a user model with no erasure path, a PII-collecting product with no consent surface. `scan()` → `.sovereign/privacy-findings.json` + `privacy-report.md`. Runs in `Sovereign.analyze()`; HIGH findings fail the `privacyRespected` DoD criterion. |
| 19 | Testing factory (autogenerate unit/integration/e2e/a11y/install/upgrade/recovery tests) | 🟨 | `dist/engine.testgen.js` — reads the open project's route table + schema + interaction inventory and writes real `node:test` files into `test/` that `runEvidence()` then executes: one API test per detected endpoint (status + shape), an a11y suite (`<html lang>`, `<img alt>`, button text). **Not yet**: e2e / install / upgrade test generation. |
| 20 | Adversarial test engine (disconnect net / kill backend / corrupt DB / expired tokens / malformed payloads) | ✅ | `dist/engine.testgen.js` `chaosSuite()` — generates `test/chaos.test.js`: malformed JSON body, oversized body (→ 413), unknown id, wrong method, expired/bogus token must not authenticate, mutation without auth → 401, 8 concurrent writes don't corrupt. Runs under `node --test` as part of the evidence gates. |
| 21 | Autonomous debugger (evidence → hypotheses → test → repair) | 🟨 | `engine.recovery.js` `rootCauseFor()` + plan/repair; hypothesis testing is implicit, not explicit. |
| 22 | Root-cause engine (cause → cascade → fix → prevention) | 🟨 | `rootCauseFor()` produces cause/cascade/confidence; no "prevention" (add test + version gate) output. |
| 23 | Repair All (dependency-aware ordering, re-run full chain) | 🟨 | Recovery loop repairs validator findings + re-verifies levels; ordering is confidence-based, not the blueprint's build→dep→arch→backend→db→frontend→runtime→security→test→packaging order. |
| 24 | Self-healing loop until acceptance criteria met | 🟨 | Recovery `loop()` runs to convergence on validator health — **not** to "acceptance criteria satisfied", because there are no machine acceptance criteria yet. |

### E. Autonomous Agents & AI (§25–31)

| § | Capability | State | Notes |
|---|---|---|---|
| 25 | Multi-agent software company (agents + orchestrator) | ✅ | `dist/engine.agents.js` — 9 specialist agents as real implementations wrapping the engines: `product` (Contract.derive), `architect` (Scaffold spec), `scaffold` (full repo), `test` (TestGen), `security` (Security.scan), `verify` (analyze + runEvidence + observe), `repair` (Recovery.run), `deploy` (Deploy.apply), `release` (DoD + certificate). `run(id, ctx)`, `pipeline(ctx)` runs the standard product order and writes `.sovereign/agents-run.json`. Every side-effecting agent checks `Engine.Autonomy.allows(...)` first. The `engine-universal.js TaskGraph` still feeds only a plan. |
| 26 | Agent conflict resolution / arbitration | ✅ | `Engine.Agents.arbitrate(conflicts)` — resolves by the blueprint hierarchy **product contract > architecture > security > performance > UI**; returns the winning side + a resolution note per conflict. |
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
| 34 | Cross-platform build matrix (truthful per-target status) | 🟨 | electron-builder builds Windows (NSIS + portable), **macOS** (dmg + zip, x64 + arm64) and **Linux** (AppImage + deb) — CI jobs `build` / `build-mac` / `build-linux` on native runners. **Generated apps**: native Android APK via Gradle + emulator; native iOS staged via `electron/lib/ios.js` (`ProjectInspector` reports the truthful per-stage / per-host status → `.sovereign/mobile-ios-evidence.json`). No single per-target status board UI. |
| 35 | Packaging engine (EXE/MSI/DMG/AppImage/APK/IPA/Docker/npm/wheel/VST3) | 🟨 | CodeSovereign itself: NSIS + portable + dmg + zip + AppImage + deb. Generated apps: Docker/Compose/K8s/Helm/Terraform IaC; Android debug APK (`gradle assembleDebug`); iOS `.ipa` on macOS (Xcode) or via xcross/Theos + zsign off-Mac. No MSI / npm-publish / wheel / VST3. |
| 36 | Installer engineering (install/upgrade/repair/uninstall/silent/rollback + verification) | 🟨 | NSIS installer exists; lifecycle-path verification (the Phase-10 "test the downloaded installer") is still manual. |
| 37 | Release engineering (bump / changelog / tag / sign / checksums / notes / publish) | 🟨 | `release.yml` exists; no changelog/notes generation; signing disabled (unsigned alpha). |
| 38 | Git intelligence | ✅ | `electron/lib/git.js` + checkpoint/stash in exec layer. |
| 39 | GitHub automation | 🟨 | `engine.github.js` / `app.github.js` — connector + PR/issue helpers; not a full delivery workflow. |
| 40 | CI/CD generator (GH Actions / GitLab / Jenkins / Azure / Bitbucket) | 🟨 | `engine-pipeline-builder.js` generates a GitHub Actions file; `engine.pipeline-parse.js` parses & gap-checks many. Others not generated. |

### G. Deployment, Operations & Quality (§41–49)

| § | Capability | State |
|---|---|---|
| 41 | Deployment engine (VPS / Docker / K8s / Vercel / Netlify / cloud / self-host / desktop-local) | ✅ `dist/engine.deploy.js` — 10 targets (docker · compose · **kubernetes** · **helm** · **terraform** · vps · fly · render · railway · static), each with label + cost + prerequisites. `preflight()` runs 7 readiness checks. `apply(target)` generates the IaC + a runnable `deploy/<target>.sh` and writes `.sovereign/deployment.json`. **Does not push** — that needs the user's credentials. |
| 42 | Infrastructure as code (Dockerfile / compose / Terraform / K8s / proxy / TLS / DNS) | ✅ multi-stage Dockerfile (non-root, healthcheck), `docker-compose.prod.yml` (app + Postgres 16), `fly.toml`, `render.yaml`, systemd + Caddyfile (TLS) for VPS. **Kubernetes**: namespace + configmap + secret + deployment (probes, resources) + service + ingress + HPA + a postgres StatefulSet, all valid YAML. **Helm**: a templated chart (Chart.yaml + values.yaml + templates). **Terraform**: `main.tf` (uses `templatefile` for cloud-init, no fragile nested heredocs) + variables.tf + tfvars example + `deploy/terraform.sh`. Covered by `test/stacks.test.js`. |
| 43 | Monitoring (logs / metrics / traces / health / crash / uptime / audit) | 🟨 every generated backend (Node monolith + microservice gateway + domain services + pure-stdlib Python) ships `/healthz` (liveness + uptime), `/readyz` (data-layer reachability, 503 on failure), `/metrics` (Prometheus text format — uptime, request counter, responses by status class, method breakdown, RSS), and a one-line JSON access log per request (`dist/engine.backend.js`, `dist/engine.pybackend.js`, `dist/engine.microservices.js`). No traces / crash-reporting / APM integration — those are separate products needing a hosted collector. |
| 44 | Production diagnosis (correlate logs / code / version / DB / commits) | ⬜ |
| 45 | Performance engineering (profile CPU/RAM/GPU/IO/DB/render/startup/bundle) | ⬜ |
| 46 | Memory-leak detection | ⬜ |
| 47 | Accessibility as a release gate | ✅ `dist/engine.a11y.js` — a WCAG 2.1 AA static audit over the project's HTML + CSS: image alt (1.1.1), form labels (1.3.1/3.3.2 — a placeholder is not a label), heading order, **colour contrast** (1.4.3 — real relative-luminance ratio), **keyboard operability** of click handlers (2.1.1), a `<main>` landmark + skip link (2.4.1), link/button names (2.4.4/4.1.2), **visible focus indicator** (2.4.7 — flags `outline:none` with no replacement), target size (2.5.5), positive `tabindex`, duplicate ids, invalid ARIA roles/states. `audit()` → `.sovereign/a11y-findings.json` + `a11y-report.md`; runs in `Sovereign.analyze()`. New DoD criterion `accessibilityPass` — **critical** barriers (missing alt / no accessible name / unlabelled control) block any release; **serious** ones block when the contract asked for accessibility. The generators were made compliant (labels + `<main>` + skip link + focus styles + AA-contrast palette) so every stack scores ≥ 96/100. `test/stacks.test.js` §12. |
| 48 | Localization engine | ⬜ |
| 49 | Documentation factory | 🟨 `architecture.md` + `product-brief.md` + `analysis-summary.md` generated; not the full README/API/DB/deploy/troubleshooting set from real repo+runtime |

### H. Governance, Reverse Engineering & Evidence (§50–58)

| § | Capability | State | Notes |
|---|---|---|---|
| 50 | Architecture drift | ✅ | Graph fingerprint + `driftDetected` + diagram regeneration. **Contract rules** now enforced: `dist/engine.archrules.js` scans for frontend→DB / frontend→server-code imports, server env vars read in the browser layer, auth crypto in the frontend, a service opening its own DB connection, the data layer importing a higher layer (inverted dependency), one microservice importing another's filesystem, and a contract entity with no service module. HIGH findings fail the `architectureSound` DoD criterion. |
| 51 | Code-quality governance (max fn size / complexity / no circular / no dead code / no console / no TODO) | 🟨 | Validator finds some; not configurable policy, not a gate. |
| 52 | License intelligence (deps + models + fonts + assets, conflict with distribution model) | ⬜ | Vendored libs documented manually. |
| 53 | Existing-app reverse engineering (what is it / how complete / shippable?) | ✅ | This is essentially what `Engine.Sovereign.analyze()` + observe + evidence *is*, for an imported repo. |
| 54 | Completion auditor (evidence-backed per-dimension %) | 🟨 | The evidence ledger's per-category pass/fail is the substrate now; a per-dimension % roll-up still reads `engine-universal.js CompletionScorer` (plan-based). |
| 55 | Evidence ledger (CLAIM → EVIDENCE → CONFIDENCE, per claim) | ✅ | `dist/engine.ledger.js` → `.sovereign/evidence-ledger.json` — every requirement's claim with its evidence rows, assertion count, failure count and confidence. |
| 56 | Definition of Done engine | ✅ | `dist/engine.dod.js` → `.sovereign/definition-of-done.json` (9 criteria that block) + `release-certificate.md`. |
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
| 66 | Chaos mode | ✅ `dist/engine.testgen.js` `chaosSuite()` — see §20; generated `test/chaos.test.js` runs as a real gate |
| 67 | Zero-Mock release gate | 🟨 detection exists (`mockscan`); not enforced as a gate |
| 68 | Sovereign release certificate (cross-gate, evidence-backed) | 🟧 `engine.recovery.v4.js` has a "certificate" concept scoped to recovery runs; not the multi-gate SOVEREIGN VERIFIED cert |

### J. Autonomy Model & Pipeline (§69–72)

| § | Capability | State |
|---|---|---|
| 69 | Graduated control levels (Assist / Build / Engineer / Autopilot / Ultra) | ✅ `dist/engine.autonomy.js` — 5 levels, each a capability set over `write/generate/command/repair/observe/deploy/release/network`. `allows(action)` / `gate(action, fn)`. `Engine.Orchestrator.run()` checks `allows('generate'/'command'/'observe'/'repair')` before each side effect; `Engine.Agents` blocks disallowed agents; Settings → **Autonomy & Deployment** card sets the level (persisted). Default `engineer`. |
| 70 | Ultra Mode command (compact BUILD/TARGET/CONSTRAINTS/MODE declaration) | 🟨 `Engine.UltraMode.start({ prompt, answers?, bounds?, useLLM? })` is the programmatic entry; a free-text request is normalised into the machine-readable contract (BUILD/TARGET/CONSTRAINTS are all derived, incl. `contract.target` ∈ web/android/ios/evm/ml-training). A terse `BUILD:/TARGET:/CONSTRAINTS:/MODE:` DSL is not parsed as a distinct syntax. |
| 70b | Multi-runtime verification router (native mobile / ML / blockchain) | ✅ `dist/engine.runtime-router.js` + `electron/lib/adapters.js` + `electron/lib/ios.js` + `Engine.Blockchain`/`Engine.Mobile`/`Engine.MobileIOS`/`Engine.ML`. Native mobile, ML training and EVM contracts are **supported targets**, not "unsupported". **EVM**: bundled `solc` + `@ethereumjs/vm` local chain — compile → deploy → transact → assert → `.sovereign/blockchain-evidence.json`. **Android**: `gradle assembleDebug` → real APK → headless emulator → adb install/launch → screenshot → logcat. **iOS** (staged, per `CodeSovereign_Native_iOS_Cross_Platform_Runtime_Spec.md`): `sourceGeneration` + `staticValidation` on every host; `build`/`signing`/`device`/`simulator` via Xcode (macOS) / xcross (Flutter-iOS) / Theos (plain-Swift) / source-only → `.sovereign/mobile-ios-evidence.json`; off-Mac → `PARTIAL` (SOVEREIGN VERIFIED — PARTIAL), never a blanket BLOCKED. **ML**: real `python train.py` → loss curve + hashed checkpoint + metric. A missing host runtime → `BLOCKED <REASON>` / `PARTIAL` + the exact install command. `test/adapters.test.js` (53) + `acceptance:ultramode` (iOS staged + ERC-20 closed loop). See `docs/RUNTIME_ADAPTERS.md`. |
| 34a | Truthful per-target / per-stage status (native mobile) | ✅ `electron/lib/ios.js` `ProjectInspector` + `HostProbe` + the 6-stage evidence schema is exactly this for iOS; the Android adapter records each step (`gradle-assembleDebug`, `emulator-boot`, `adb-install`, `launch`, `process-alive`, `runtime-observe`) with the APK size and a screenshot. Not surfaced as a dashboard yet. |
| 71 | The Ultra Mode pipeline (one closed loop intent→…→SOVEREIGN VERIFIED) | ✅ `dist/engine.ultramode.js` `Engine.UltraMode` — one coordinator, an explicit 15-state machine persisted to `.sovereign/ultramode-run.json` (resumes after an app restart with no regeneration), bounded (max repair attempts, run timeout, cancellation), snapshot-before-mutation + rollback-when-worse. It sequences the existing engines only: `Contract.deriveFromPrompt` → `Universal.buildPlan` → `Scaffold`/`TestGen`/`Deploy` → `Sovereign.analyze`/`runEvidence`/`observe` → `Ledger` → `Recovery` → `DoD` + certificate. A plain-browser run generates then ends `BLOCKED` (execution + observation unavailable) — never falsely verified. Proven end-to-end by `npm run acceptance:ultramode` (prompt → SOVEREIGN VERIFIED + resume + two negative scenarios) and `test/ultramode.test.js` (83 checks). See `docs/ULTRAMODE_CLOSED_LOOP.md`. |
| 72 | The defining difference (verified outcomes, not files) | ✅ demonstrated for a **from-scratch product** built from one natural-language request: `acceptance:ultramode` starts from an empty workspace + the acceptance prompt, generates a ~36-file full-stack app, runs its real `npm test/build/lint`, crawls it running, injects + repairs a defect through the normal repair path, and only then emits `SOVEREIGN VERIFIED`. A requirement is `verified` only when its acceptance criteria pass against real evidence — never because a file exists. |

---

## 3. Build-flow doc — the 20 stages

| Stage | State | Gap |
|---|---|---|
| 1 Prompt intake / composer | 🟨 | free-text request → `Engine.UltraMode.start({ prompt })` or the Ultra Mode screen; still no attachments/screenshots/repos/audio |
| 2 Prompt normalization | 🟨 | keyword + spellfix rules (`Universal.Normalizer`), optional model pass; feeds `Contract.deriveFromPrompt` |
| 3 Application classifier | 🟨 | rule-based (`Universal.Classifier`); now consumed by the contract's `product.type` + stack choice |
| 4 Requirements engine | ✅ | `Contract.deriveFromPrompt` → machine-readable requirements with stable ids + machine-checkable acceptance criteria; each is **verified per-requirement** by `Engine.Ledger` against real evidence |
| 5 Feasibility & constraint analysis | 🟨 | the contract records `target` / `unsafe` / `blockingQuestions` / `assumptions`; `Ultra Mode` acts on them (routes to a runtime adapter / BLOCKED / NEEDS_INPUT / recorded default). A non-web target that this host can't run ends `BLOCKED <REASON>` at verify time with the prerequisite. Cost feasibility is still light. |
| 6 Product specification (`/project-docs/*.md`) | 🟨 | `product-contract.json` + `ultramode-plan.json` + `ultramode-report.md` are the driven spec; the older `writeProjectDocs()` markdown is not wired into `Ultra Mode` |
| 7 Architecture generation | 🟨 | `Universal.buildPlan` + the contract's entities/journeys/api table drive generation; `Sovereign.analyze` regenerates architecture diagrams from the real graph. Not enforced as contract *rules*. |
| 8 Technology stack selection | 🟨 | `Contract` picks the supported stack from the prompt (Postgres vs SQLite vs JSON, auth, jobs); `Scaffold` honours it. Not validated against the host machine. |
| 9 Project blueprint (repo structure) | ✅ | `Scaffold.generate` emits the real repo structure the plan predicts; `ultramode-plan.json` lists the files up front and the ledger checks they exist |
| 10 Multi-agent orchestration | ✅ | `Engine.UltraMode` (state machine) + `Engine.Agents` (specialist roster) + `Engine.Orchestrator` (task DAG). `Universal.buildPlan` produces the typed plan the coordinator executes against the real engines. |
| 11 Code generation | ✅ | `Engine.Scaffold.specFromContract` → `generate()` → a complete dependency-free full-stack repo (backend + data layer + real SQL migrations + auth + async queue/worker + frontend + tests + CI + Docker). Driven from the contract, offline, deterministic. Vanilla JS + JSON/pg store by design (so the generated `npm test` runs and the observer can drive it). |
| 12 Connection & wiring engine | 🟨 | `Sovereign.analyze` builds the connection graph + health; `Ledger` checks per-control runtime verdicts (REAL / MOCK / BROKEN) from the observer crawl. Deep "button→handler→endpoint→service→DB" *static* tracing of generated code is still partial. |
| 13 Build & execution | ✅ | real, via proc bridge (for projects that build) |
| 14 Automated testing | ✅ | `engine.testgen.js` generates API + chaos + a11y `node:test` files; `runEvidence()` executes them |
| 15 Repair loop | ✅ | `Engine.UltraMode` REPAIRING/REVERIFYING — snapshot → `Recovery.run` → re-execute + re-observe → re-evaluate the DoD; bounded by `maxRepairAttempts`, rolls back a repair that makes the evidence worse, stops when a repair makes no progress |
| 16 Quality gate (requirements met / no mocks / no broken routes / UX verified) | ✅ | `Engine.DoD.evaluate()` — 8 blocking criteria (implementation exists · dependencies connected · build succeeds · tests succeed · runtime action succeeds · no fake implementation · security gates · acceptance criteria) computed from real evidence; `Engine.UltraMode` will not emit `VERIFIED` without it + a real certificate. |
| 17 Packaging | ✅ | electron-builder: Windows NSIS + portable, **macOS** dmg + zip (x64 + arm64, unsigned), **Linux** AppImage + deb. `dist:win` / `dist:mac` / `dist:linux` / `dist:all` scripts; CI jobs `build`, `build-mac` (macos-latest), `build-linux` (ubuntu-latest) each upload the artifact. |
| 18 Deployment | 🟨 | `engine.deploy.js` generates IaC + deploy script + preflight for 10 targets (incl. Kubernetes / Helm / Terraform); does not push (needs creds) |
| 19/20 Delivery contract (code + build + tests + package + guide + evidence + known limits + continuation state) | 🟨 | `Engine.UltraMode` produces `ultramode-report.md` (request, state, assumptions, blocking questions, unsupported/unsafe items, the evidence timeline, requirement traceability) + the full `.sovereign/` set (contract, plan, ledger, DoD, certificate). Not yet a single downloadable delivery archive. |

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
   (**10 criteria** — implementation · dependencies · build · tests · runtime ·
   no-fake · security · **architecture/layering** · **privacy/PII** · acceptance)
   + `release-certificate.md` (SOVEREIGN VERIFIED). Judges "no fake
   implementation" from what runtime observation actually *exercised*, not from
   static guesses. A runtime-adapter target (mobile/ML/EVM) is gated on its
   `*-evidence.json` instead; iOS is split into six per-stage gates. Works on any
   open project.

4. ✅ **Ultra Mode coordinator** — `dist/engine.orchestrator.js`. Executes a task
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

5. ✅ **Zero-Mock release gate** — `Engine.DoD` `noFakeImplementation` blocks
   `SOVEREIGN VERIFIED` when the runtime crawl classified any control MOCK/BROKEN
   (proven by `acceptance` §8 and `acceptance:ultramode`). Still static-only for
   controls the crawl couldn't exercise — those are ledger coverage gaps (§67).
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
