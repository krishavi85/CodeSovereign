# REA-assisted audit, repair and release verification

Branch `fix/security-review`. Base commit `6f5c3d67c31cc7d63692ac30981ded1fd88cbc95`; the changes are committed as `005dff9`.
The packaged-build results in section 6 were produced from the working tree that became `005dff9` (source files unchanged between the final build at 14:49 and the commit; the only later edits are extra unit tests and this report). The "packaged run" results were not repeated after the commit.
Date: 2026-11-02. Windows 11 Pro 10.0.26300, Node 24.22.0, Electron 43.6.0, REA (rea-agents) 6.8.0, local model `qwen2.5-coder:7b` via Ollama.

Division of labour: REA supplied static evidence about the shipped artifacts. The code changes were made by the coding agent. Whether anything *works* was decided only by unit tests and runs of the real packaged Electron app. REA's static analysis does not prove runtime behaviour, and nothing here claims it does.

## 1. Release status: **READY WITH LIMITATIONS** (for a closed alpha/beta on Windows)

Timeline that matters: the first hardened packaged runs (before the abort moved to `did-navigate`) stalled at the interrupt/resume scenario and are **not** used as evidence. Every result in sections 5-7 comes from builds made after that fix.

Not READY, because: no OS-level command sandbox, an unsigned installer, one unresolved model-capability gap (rounding scenario), Windows-only testing, Hermes Agent never tested live, and the changes are committed locally but not pushed, CI-tested or reviewed. Nothing has been merged, published or released.

## 2. Artifacts inspected (final build)

| Artifact | SHA-256 |
|---|---|
| `release/win-unpacked/resources/app.asar` | `f573df1ab447277bc34f98796c695d6a80e114fc451e1f0c3bdfd5f03b458a51` |
| `release/win-unpacked/CodeSovereign.exe` | `e1458cd306f7cce3e5d8c798214f1c1a6f267551e57b8470c4293d3ffc1f9693` |
| `release/CodeSovereign-0.1.0-alpha.5-x64.exe` (NSIS) | `4621595fb1800960cef8a7d0d3e8380d598112829cff4f071c4083f7b49e2487` |
| `release/CodeSovereign-0.1.0-alpha.5-portable.exe` | `f6f198c6f35cdcf0e6c4ae69970a5bfda92d035510f2fae38f80b0776194d4b3` |

Earlier builds in this audit (the Oct 27 build, and several intermediate rebuilds) are superseded; their results are only cited where stated.

## 3. REA findings (static; confidence "derived"/"observed" as stated)

| # | Finding | REA evidence | Classification |
|---|---|---|---|
| R1 | Original shipped exe had `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` enabled; ASAR integrity and `OnlyLoadAppFromAsar` disabled | `inspect_electron_fuses`, observed | CONFIRMED (fixed) |
| R2 | Final exe: those three disabled; ASAR integrity validation enabled; only-load-from-asar enabled. `GrantFileProtocolExtraPrivileges` still enabled | `ev_411c3cbd…`, observed | CONFIRMED |
| R3 | All 124 `<script>` files referenced by `index.html` are in the asar; `main.js`, `preload.js`, `cmdpolicy.js`, `net.js`, `hermes-manager.js`, `cross-spawn` are packaged | asar listing (checked by script, not REA) | CONFIRMED |
| R4 | IPC: 88 literal channels, 163 renderer transmissions, 83 main handlers, 162/163 paired, 0 ambiguous, 0 unpaired literal; 2 dynamic-channel operations unresolved. Identical before and after the changes | `ev_157a56fc…`, derived | CONFIRMED (static pairing only) |
| R5 | One `contextBridge` API (`window.desktop`) with 105 members; no native addons; no utility processes | same | CONFIRMED |
| R6 | `sender_validation_observations: 0`, before **and after** adding `ipc-guard.js` | same | see 3.1 |
| R7 | Graph coverage is partial (about 51,000 semantic unknowns, mostly bundled `node_modules` such as `@ethereumjs/*`) | same | INCONCLUSIVE for those areas |
| R8 | The final analysis counts 6 browser windows (was 5): the extra one is the rogue window the acceptance harness creates | same | CONFIRMED (harness only) |

### 3.1 Limit of REA's static IPC-sender analysis

`ipc-guard.js` installs the check by replacing `ipcMain.handle`/`ipcMain.on` at runtime, so every handler is wrapped without each call site changing. REA reads inert syntax and cannot see a wrapper installed at runtime, so it keeps reporting zero sender validation. **That number is therefore not evidence either way.** The protection is established only by (a) 12 unit tests of the guard and (b) a real-Electron probe in the packaged app (section 6), which is limited to one channel (`app:info`). The wrapper is installed once in `registerIpc()`, before any handler is registered, and the only file that touches `ipcMain` is `main.js`, so all 83 handlers go through it. That last claim is from reading the source, not from testing every channel.

## 4. Defects found and repairs applied

| Defect | Root cause | Repair | Status |
|---|---|---|---|
| Error trace at `main.js:819` during model streaming (seen once in a packaged run) | Electron does not throw when sending to a disposed frame; it logs "Render frame was disposed…" and the request keeps pulling a long answer for a window that is gone | New `electron/lib/stream-relay.js`: stream ends and the upstream request is aborted when the window is destroyed, the renderer crashes, a send fails, or the page navigates (after the navigation commits). `main.js`: in-flight streams are cancelled on quit; a second stream with a live id is refused | CONFIRMED defect (seen once, mechanism inferred from Electron behaviour, not reproduced on demand); repaired and tested |
| No sender authorisation on any IPC channel | none existed | New `electron/lib/ipc-guard.js`, installed in `registerIpc()`: only the top frame of the app's own `index.html` is answered | CONFIRMED (REA + source); repaired and tested |
| Weak Electron fuses | electron-builder defaults | `package.json` `build.electronFuses` (section 3, R2) | CONFIRMED; repaired, verified in rebuilt exe |
| **Regression I introduced:** aborting the stream at `did-start-navigation` broke interrupt-and-resume (run left no resumable record; acceptance S2 stalled 3 times on packaged builds and failed 2 checks from source) | the old page was still alive and received the "aborted" result, treated it as a failed model call and closed the run | Abort on `did-navigate` (after commit) instead. Source run went from 32/34 to 34/34 | CONFIRMED for the source run; the packaged stalls were not debugged separately and share the same symptom, so the shared cause is likely, not proven |
| Acceptance judge used Electron-as-Node | harness relied on the `RunAsNode` fuse | judge now uses the system `node` | harness only |

### 4.1 Files changed (uncommitted)

Modified: `electron/main.js`, `electron/acceptance-agent.js`, `package.json`. New: `electron/lib/ipc-guard.js`, `electron/lib/stream-relay.js`, `test/ipc-guard.test.js`, `test/stream-relay.test.js`, `docs/REA_FINAL_AUDIT.md`. `main.js` also exposes `global.__csActiveStreams` only when launched with `--acceptance-agent`, so the acceptance run can prove no stream is left behind.

## 5. Unit tests

Full suite on the final built tree: **3529 passed, 0 failed** (3530 earlier; one assertion in the stream-relay test file was replaced when the abort moved to `did-navigate`). After the build, five more stream-relay lifecycle tests were added (navigation that fails or is cancelled, a new stream after navigation, concurrent streams, window closed mid-inference); the stream-relay file now has 18 checks, all passing. The full suite was re-run afterwards on the committed tree: **3534 passed, 0 failed**. New: `stream-relay` 13 checks at build time (18 now), `ipc-guard` 12 checks. `scripts/verify-installer.js`: all build-output checks passed. Its manual lifecycle checklist (install, upgrade, uninstall, portable) was **not** run for this build.

## 6. Installed-app (packaged, unpacked build) acceptance, real model

All against the final build in section 2, run with `CS_AGENT_REQUIRE_PACKAGED=1`, local `qwen2.5-coder:7b`.

### 6.1 Simple scenarios (S4 = `protected-tests`) - the run reported as the gate

| Phase | Result |
|---|---|
| Main | **39/39 passed** |
| Reopen | **10/10 passed** |

Covered: plan and approval, real streaming through the main-process proxy, file edits, test execution via the real runner, Monaco review dock, revert, interrupt + resume (S2: agent verified, judge pass), permission enforcement (npm install, git push, inline `node -e`, shell operators, path escape), project memory persistence, independent hidden-test judge, no false "verified".

New checks in this run:
- **Rogue IPC:** a window with the app's preload but a `data:` URL calling `desktop.info()` was rejected with `IPC refused: app:info is available to the application window only`; the real app window still got answers.
- **Reload during stream (S5):** with a long answer streaming and the main process tracking 1 active stream, reloading the page took active streams to 0; a new request in the reloaded page completed (HTTP 200, 4 chunks) and the page's privileged call still worked; 0 streams left afterwards.

S5 shows the relay and the guard working together across a reload; it does not test a hostile old renderer (the old renderer no longer exists after a reload), a crash mid-stream, or window close.

### 6.2 Default rounding scenario (S4 = `regression-rounding`), run separately and unchanged

Same build (the one just before S5 and the report were added, hashes in section 2 differ only by the S5 harness code). Original task, original hidden-test judge.

| Phase | Result |
|---|---|
| Main | 34/35. Agent **BLOCKED** after repair attempts; judge FAIL (0 pass / 2 fail) |
| Reopen | 5/10, all five failures follow from the blocked run (no fix on disk, task recorded as blocked) |

The 7B model did not fix the bug. The app behaved correctly: it reported BLOCKED, did not claim "verified", did not touch the tests, and the independent judge agreed it failed. This is a model-capability limit, not a pass. It was not replaced by an easier task. In earlier runs on this machine the same scenario also failed (blocked) twice.

## 7. Streaming lifecycle evidence

- 13 unit tests: destroyed window, throwing send (disposed frame), crash, abort callback that throws, missing abort callback, same-document navigation keeps the stream, committed navigation aborts.
- Real Electron: S5 above (reload mid-stream, no stream left, new request completes). No `Render frame was disposed` error appeared in the S5 run's log.
- Not tested live: window close mid-stream, renderer crash mid-stream, and quit mid-stream (covered only by unit tests / source reading).

## 8. Remaining vulnerabilities and limitations

1. **No OS-level sandbox.** Authorised commands (including agent-run tests and installs the user approves) run with the user's full permissions. The command policy and approvals reduce risk; they do not contain it. This is the largest remaining issue.
2. **Installer is unsigned** (`Get-AuthenticodeSignature` = `NotSigned` for the NSIS installer and the exe). Windows SmartScreen will warn. electron-builder's log lines mentioning signtool did not produce a signature.
3. `GrantFileProtocolExtraPrivileges` remains enabled (the app loads over `file://`); disabling it needs separate compatibility testing. `EnableCookieEncryption` remains disabled.
4. IPC guard allows the whole app page; there is no per-channel capability model. A bug that lets attacker-controlled script run inside the app page (XSS) would still reach every privileged handler. CSP and the sandbox are the defences there; this audit did not re-test the CSP.
5. REA's analysis is partial (about 51,000 unknowns) and cannot show the guard (section 3.1) or dynamic IPC channels (2 unresolved).
6. Native agent capability: the local 7B model fails the rounding scenario and has been seen to report "verified" when the hidden spec exceeds the visible tests (earlier evals in `docs/eval/`). Stronger models were not evaluated here.
7. Hermes Agent was never tested against a live Hermes install; OpenClaw only to the extent of earlier work. Phases 5-7 of the requested audit (full agent trace, integrations, UI controls) were **not** re-done with REA in this pass; they rest on `docs/NATIVE_AGENT.md`, `docs/PRODUCT_AUDIT.md` and `docs/SECURITY_REVIEW.md`.
8. Windows only. The tested build is the unpacked directory (`win-unpacked`), launched in place, not an installed copy; the NSIS install/upgrade/uninstall path and the portable exe were not executed in this pass.
9. The changes are committed (`005dff9`) but unpushed, unreviewed by a second pair of eyes, and not CI-tested; git warns that CRLF will be normalised to LF on several files.
10. Lifecycle cases covered only by unit tests (fake sender), not by real Electron runs: navigation that starts and fails, renderer crash without navigation, window closed during inference, and a stale renderer sending after a reload (a reloaded page no longer exists; the rogue-window probe is the only real-Electron evidence of rejection).

## 9. Gates for moving beyond a closed beta

- Push `fix/security-review`, open a PR, get CI and review.
- Run the NSIS install/upgrade/uninstall checklist and the portable exe.
- Sign the installer.
- Decide on an OS-level sandbox for agent commands (Windows job objects/AppContainer or a container) or ship with the risk documented to testers.
- Evaluate against a stronger model if the native agent is to be sold on repair quality.
