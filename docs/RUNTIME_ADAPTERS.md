# Runtime adapters — native mobile · ML · blockchain · desktop · extension · audio · vision · registry · signing · OTel

_Implements `CodeSovereign_Three_Blocked_Capabilities_Master_Plan` and
`CodeSovereign_Offline_Capability_Completion_Plan` (LOCAL CAPABILITY ≠
HOSTED-SERVICE DELIVERY — a capability is proven against a local / self-hosted
open-source runtime; only the final external publish step is credential-gated)._

## The principle

CodeSovereign used to mark native mobile, ML model training, and blockchain as
**permanently unsupported** — because the closed loop verifies by *running and
observing* generated software inside one web observer, and none of those three
run there.

That was the wrong abstraction. CodeSovereign now has a **multi-runtime
verification architecture**: it detects the target, routes to a target-specific
execution + verification adapter, runs the artifact in a *real compatible
runtime*, normalises the evidence, and gates it through the Definition-of-Done.

> **support ≠ environment availability.** A target is fully **supported** even
> when *this host* can't execute it. In that case the run returns **BLOCKED**
> with a precise machine-readable reason (`FOUNDRY_NOT_INSTALLED`,
> `ANDROID_SDK_REQUIRED`, `DATASET_REQUIRED`, `MACOS_RUNNER_REQUIRED`,
> `INSUFFICIENT_COMPUTE`, …) and the exact command to unblock it — never a
> blanket "we don't support this".

`Generate → Route → Run → Observe → Verify → Evidence → DoD.` The runtime
differs by target; the honesty standard does not.

## The router

`dist/engine.runtime-router.js` — `Engine.RuntimeRouter`

| API | |
|---|---|
| `targetOf(contract)` | prompt/contract → `web` \| `desktop` \| `extension` \| `android` \| `ios` \| `evm` \| `ml-training` |
| `requirements(target)` | `[{ tool, why, install }]` for that target |
| `probe(target?)` | this host's capability for the target (`available`, `canRun`, `missing[]`) |
| `route(contract)` | `{ target, adapter, engine, webPath, requirements }` |

`Engine.Contract.deriveFromPrompt` sets `contract.target` / `targetLabel` /
`targetRuntime`. Native mobile / ML / blockchain are **removed** from the
contract's `unsupported` list — their verdict is `buildable`.

`Engine.UltraMode`: when `contract.target !== 'web'` the loop routes
`PLANNING → GENERATING (adapter.generate) → VALIDATING → EXECUTING
(adapter.verify + a runtime probe) → REVERIFYING`. The adapter's status is the
verdict — `PASS` + DoD → **VERIFIED**, `FAIL` → **FAILED**, `BLOCKED` →
**BLOCKED** with the missing prerequisite.

## The adapters

`electron/lib/adapters.js` (Node, workspace-scoped) does the real execution;
`window.CSAdapters` (renderer) bridges to it over IPC (`adapter:probe`,
`adapter:run`), behind the same folder-trust prompt as any other command.

### EVM smart contracts — `Engine.Blockchain`

- **generate** — a Foundry-layout project: audited-pattern Solidity (ERC-20 /
  ERC-721 / voting / escrow, **zero external imports**), `test/*.t.sol` forge
  tests, `foundry.toml`, `script/Deploy.s.sol`, and `chain/scenario.json`
  (the deploy + transaction plan for the in-loop chain).
- **run** — `solc` (bundled) compiles every `src/*.sol`; `@ethereumjs/vm`
  (bundled) is a **local deterministic chain**. The adapter deploys the
  contract, runs the scenario transactions (transfers, approvals, reverts),
  and inspects the receipts, events, gas and storage. If Foundry is installed
  it *also* runs `forge test` (fuzz / invariant). Static analysis: Slither if
  present, else an in-JS reentrancy / `tx.origin` / `selfdestruct` lint.
- **evidence** — `.sovereign/blockchain-evidence.json`: solc version, contracts,
  deployments, every transaction with gas + status, every assertion, static
  findings.
- **BLOCKED** only if neither the bundled runtime nor Foundry can load (they
  ship with CodeSovereign, so in practice this never blocks). A Solidity
  compile error is `FAIL`, not `BLOCKED`.

### Native mobile — `Engine.Mobile`

- **generate (Android)** — a buildable Kotlin, View-based Gradle project
  (`settings.gradle.kts`, `app/build.gradle.kts` pinned to a cache-friendly
  AGP, a real `MainActivity` the emulator run drives, `AndroidManifest.xml`,
  layouts, a `.maestro/flow.yaml` UI test). **generate (iOS)** — a SwiftUI
  skeleton + `project.yml` (xcodegen).
- **run (Android)** — locate Gradle (project wrapper → PATH → a cached wrapper
  distribution), `assembleDebug` (offline first, then online for the first
  dependency fetch), boot a headless AVD, `adb install` + launch, capture a
  screenshot, scan `logcat` for `FATAL EXCEPTION`, confirm the process is alive
  and foreground, then run Maestro if installed.
- **run (iOS)** — a full **staged** model, see below.
- **evidence** — `.sovereign/mobile-evidence.json`: every step, the APK path +
  size, `applicationId`, the screenshot, a logcat tail.
- **BLOCKED reasons** — `ANDROID_SDK_REQUIRED`, `GRADLE_UNAVAILABLE`,
  `GRADLE_DEPENDENCIES_UNAVAILABLE`, `NO_EMULATOR_ACCELERATION`, `NO_AVD`,
  `EMULATOR_BOOT_TIMEOUT`. When the APK builds but the emulator can't run, that
  is called out explicitly — the build evidence is kept.

### Native iOS — staged  (`Engine.MobileIOS` + `electron/lib/ios.js`)

_Implements `CodeSovereign_Native_iOS_Cross_Platform_Runtime_Spec.md`._

iOS is **SUPPORTED WITH TARGET-SPECIFIC EXECUTION** — not one coarse
`MACOS_RUNNER_REQUIRED` flag. Verification is split into six independent stages:

| Stage | Windows / Linux | macOS |
|---|---|---|
| `sourceGeneration` | **full** — a real SwiftUI + SwiftPM + xcodegen + Theos project | full |
| `staticValidation` | **full** — `swift build` / `swiftc -typecheck` when a toolchain is present, else a real structural check (delimiter balance, `@main`, a `View`, imports) | full — type-checked against the iOS SDK |
| `build` | Flutter-iOS → **xcross**; plain-Swift lower-level → **Theos**; else stage-`BLOCKED` `MACOS_XCODE_REQUIRED` | **Xcode** (`xcodegen generate` + `xcodebuild -sdk iphonesimulator`) |
| `signing` | **zsign** with `CS_IOS_P12` (+ `CS_IOS_P12_PASS`, `CS_IOS_MOBILEPROVISION`), captured **independently of build** | Apple `codesign` identity |
| `deviceExecution` | xcross / Theos + `libimobiledevice` / `pymobiledevice3` on a real iPhone | Xcode / `ios-deploy` |
| `simulatorExecution` | stage-`BLOCKED` `MACOS_SIMULATOR_REQUIRED` (always — the Simulator is Apple-only) | `xcrun simctl boot / install / launch` + screenshot |

`electron/lib/ios.js`:

- **ProjectInspector** — `swiftui` / `flutter-ios` / `kmp` / `swift`; Xcode-only
  features (asset catalogs, storyboards, `CoreML`/`ARKit`/`WidgetKit`…, recent
  SDK gates); entitlements.
- **HostProbe** — OS, Swift toolchain + version, LLVM/clang, Xcode/xcrun/simctl,
  `xcross`, Theos (`$THEOS`), `zsign`, `libimobiledevice`/`pymobiledevice3`, a
  paired physical device, codesigning identities.
- **RuntimeRouter** — Xcode (canonical macOS) → xcross (Flutter-iOS off-Mac) →
  Theos (compatible plain-Swift) → source-only. Experimental adapters are
  **labelled** in the evidence (`experimental: ["xcross"]`).
- **Overall status** — `PASS` (build + device/simulator verified), `PARTIAL`
  (source + static pass, runtime stages host-limited — **the honest off-Mac
  outcome**, never `FAIL`, never a blanket `BLOCKED`), `FAIL` (a Swift syntax
  error or a real build failure), `BLOCKED` (project could not be generated).

Evidence: `.sovereign/mobile-ios-evidence.json` (the spec's schema — `target`,
`support`, `host`, `projectType`, per-stage results, `runtimeAdapter`,
`blockers[]` each with a stage-specific `reason`).

The DoD splits into the same stages; the certificate reads
**`SOVEREIGN VERIFIED — PARTIAL`** when build/runtime need host tooling and lists
the host-limited stages.

### ML model training — `Engine.ML`

- **generate** — a real PyTorch training project: `train.py` (a char-level LSTM
  language model, a BiLSTM text classifier, or an MLP regressor — chosen from
  the prompt), `eval.py`, `training.json` (the resolved plan), `config.yaml`
  (Axolotl-style, for the LLM fine-tune scale-up), `dataset/` (drop real data
  here; a small bundled corpus is used otherwise), `requirements.txt`.
- **DatasetInspector / HardwareProfiler / TrainingPlanner** — schema, dedup,
  contamination and PII checks run inside `train.py`; the planner picks
  from-scratch / LoRA / QLoRA / SFT / DPO from the model size vs available
  compute.
- **run** — `python train.py` for real: a decreasing loss curve, a saved +
  hashed checkpoint, a held-out eval metric (perplexity / accuracy / MSE).
- **evidence** — `.sovereign/ml-evidence.json`: framework + device, params,
  steps, seconds, the full loss curve, `loss_decreased`, the metric, the
  checkpoint (bytes + sha256), the dataset report.
- **BLOCKED reasons** — `PYTORCH_NOT_INSTALLED`, `DATASET_REQUIRED` (the prompt
  said "train on *our* data" and no data was provided — the pipeline is
  generated and ready), `INSUFFICIENT_COMPUTE` (a full fine-tune / pretrain
  needs more VRAM than the host has; `suggestedStrategy: QLoRA`),
  `AXOLOTL_NOT_INSTALLED` (for the LLM fine-tune path specifically).

## The Definition-of-Done for a target run

`Engine.DoD.evaluate()` recognises `contract.target !== 'web'` and gates on the
adapter evidence instead of the web-observer criteria:

`artifactGenerated` · `buildSucceeds` (compile / gradle / trainer exit) ·
`runtimeVerified` (adapter status `PASS`) · `testsSucceed` (every assertion /
loss decreased / every step ok) · `noFakeImplementation` · `securityGatesPass`
(product scanner + EVM static-analysis high = 0) · `architectureSound` ·
`privacyRespected`.

The certificate renders a target-specific gate table and, for EVM, the
contracts + on-chain transaction count; for ML, the model metric.

## What this host can do right now

`npm run acceptance:ultramode` proves, in the real Electron renderer:

- an **ERC-20** prompt → real `solc` compile → deploy on a local chain → real
  transfer / approve / transferFrom / revert transactions → every assertion
  passes → DoD → **SOVEREIGN VERIFIED**
- an **iOS-only** prompt → a real SwiftUI + SwiftPM + xcodegen project generated
  → `sourceGeneration: PASS`, `staticValidation: PASS`,
  `build: BLOCKED (MACOS_XCODE_REQUIRED)`, `simulator: BLOCKED
  (MACOS_SIMULATOR_REQUIRED)` → overall **`PARTIAL`** (`SOVEREIGN VERIFIED —
  PARTIAL`), never "unsupported"

`test/adapters.test.js` (53 checks) additionally proves ERC-721 + voting
contracts; a genuine char-LM / classifier / regressor training run with a
decreasing loss curve and a hashed checkpoint; and the iOS ProjectInspector +
HostProbe + staged verification (source/static PASS, build/simulator
stage-BLOCKED with precise reasons, a Swift syntax error → `staticValidation:
FAIL` → status `FAIL`). The full Android path (Gradle build → 5.7 MB APK →
headless Pixel_4 emulator → install → launch → screenshot) is exercised by the
adapter and confirmed on this machine.

## Vendored dependencies

`solc`, `@ethereumjs/vm`, `@ethereumjs/tx`, `@ethereumjs/common`,
`@ethereumjs/util` — all pure JavaScript, bundled with the desktop app, so the
local chain needs no external toolchain.

---

## Offline-capability adapters (`CodeSovereign_Offline_Capability_Completion_Plan`)

Same standard, different runtimes. Nothing hosted; a missing local runtime →
`BLOCKED <REASON>` + the install command. Only the *final external publish* is
credential-gated.

| Capability | Engine | Local runtime | Runs offline here | External-only step |
|---|---|---|---|---|
| Audio → transcript | `engine.audio.js` + `adapters.audioRun` | `ffmpeg` + whisper.cpp / faster-whisper | BLOCKED (no ffmpeg/whisper on this host) with the exact reason | — |
| Screenshot → component tree | `engine.vision.js` | offscreen-canvas CV (connected components, classification, containment tree, layout graph, HTML reconstruction) + `Engine.VisualCheck.fidelity` render-and-compare | ✅ (proven in a real browser: a synthetic 3-band image segmented exactly) | full model-grade component inference |
| npm package publish | `engine.registry.js` + `adapters.registryRun` | Verdaccio, or `npm pack` → clean-consumer `npm install <tarball>` → `require()` | ✅ real round-trip (`test/adapters-offline.test.js`) | `npm publish` to npmjs.com — `BLOCKED_CREDENTIAL_REQUIRED` |
| Artifact signing | `engine.signing.js` + `adapters.signRun` | SHA-256 + SPDX-2.3 SBOM + SLSA provenance (no tool) · `cosign sign-blob`/`verify-blob` when present | ✅ checksums + SBOM + provenance for real; PARTIAL without cosign | signed GitHub Release upload — `BLOCKED_GITHUB_TOKEN_REQUIRED` |
| OpenTelemetry | `engine.observability.js` + `adapters.otelRun` | dependency-free OTLP/HTTP exporter (`src/otel.js`) → a local OTel Collector; `/debug/traces` + `/metrics` + `logs/crashes/` are the always-on fallback | ✅ real network probe → BLOCKED with the collector command when none is up | hosted Sentry/APM DSN — `BLOCKED_CREDENTIAL_REQUIRED` |
| Native desktop | `engine.desktop.js` + `adapters.desktopRun` | Tauri: `cargo check` + `cargo test` (Rust core) · Electron: headless boot smoke + electron-forge | ✅ `cargo check` runs on this host; packaged bundle BLOCKED `<TOOL>_REQUIRED` | — |
| Browser extension | `engine.extension.js` + `adapters.extensionRun` | MV3 static validation + a store-only zip (zero deps) + Playwright + Chromium load-unpacked | ✅ validate + zip + Playwright load-unpacked | Chrome Web Store submission |

`Engine.RuntimeRouter` exposes `desktop` and `extension` as first-class targets
(`contract.target`); the DoD has a **staged** `targetEvaluate` for them (like iOS:
generation + compile/validation PASS everywhere; packaged-build / runtime-
inspection stages may be host-limited → `SOVEREIGN VERIFIED — PARTIAL`). The
non-target capabilities (audio / vision / registry / signing / otel) attach to a
web build and fold into `Sovereign.analyze()` + the `/delivery/` archive.
