# CodeSovereign 0.1.0-alpha.5: release-readiness report

Date: 2026-10-27. Scope: the native agent and the app around it, built from the stacked PRs #13 → #14 → #15 → #16 → #17 (head `7968f4d`+). Every claim below points at execution evidence in this repository.

## Decision

**NOT ready for release.** It is ready for continued alpha use **on projects you trust**, with the native agent as the primary engine. Two critical blockers remain (below). Nothing here claims more than the evidence supports.

## Phase A: integration

| Item | State |
|---|---|
| PR #13, #14 | Open, CI green on their heads (unit Linux + Windows, Electron smoke, 8-engine acceptance, repo-scale generation, installers for 3 OSes). |
| PR #15, #16, #17 | Open. **No CI has run**: the workflows trigger only for pull requests into `main`, and these target their parent branches. |
| Merging | **Not done.** My attempt to merge #13 was refused by the auto-mode classifier ("Merge Without Review"); I did not work around it. Merging needs your go-ahead or a permission rule. |
| Plan | Merge #13 → #14 (merge commits, keep branches), then retarget #15 to `main` and close/reopen it so CI runs, merge, repeat for #16 and #17. Re-run the full suite on `main` afterwards. |

## Phase B: independent review (no Codex / Bugbot; both hit usage limits)

Full list in [`docs/SECURITY_REVIEW.md`](SECURITY_REVIEW.md). Two **critical** findings were proved with failing tests and fixed (workspace symlink/junction escape; a hostile `.git` running code on open), plus a main-process command floor, trust and network gates, memory and process-lifetime fixes. **Residual and still critical: no OS-level sandbox.**

## Phase C: installed desktop acceptance (Windows)

The real NSIS installer (118 MB, built from the final code) was installed silently into a clean folder with a fresh user-data directory, run against the local `qwen2.5-coder:7b`, and uninstalled cleanly afterwards (no files or shortcuts left). Evidence: [`docs/release/evidence/`](release/evidence) (screenshots, logs, per-check results, version info).

| # | Step | Evidence | Result |
|---|---|---|---|
| 1 | Launch the installed app | `version.json`: packaged, `app.asar`, Electron 43, Windows | Pass |
| 2 | Connect the local Ollama model | model proxy requests; top bar shows the model | Pass |
| 3 | Create a project | A project folder with files, opened in the app. **The New Project dialog / templates were not exercised** (they write to your home folder). | Partial |
| 4 | Ask the agent to implement a change | S1: plan card shown, approved by a real click, edit applied | Pass |
| 5 | Review in Monaco | Monaco loaded, review dock present. **Accepting/rejecting individual hunks was not driven.** | Partial |
| 6 | Run the project's tests | Real runner, 2 pass / 0 fail, independent hidden-test judge agrees (4 pass) | Pass |
| 7-8 | Deliberate error, diagnose and repair | S4: tests fail after the injected error; the agent repaired it (1 repair attempt); judge 3 pass / 0 fail | Pass, **but see the note below** |
| 9 | Interrupt and resume | The page is torn down mid-run; after restart the run is BLOCKED/resumable; Resume finishes it; judge agrees | Pass |
| 10-11 | Close and reopen; files and memory persist | Second launch of the installed app: judge still passes, memory file and Engine.ProjectBrain hold the task, no stale run offered (10/10) | Pass |
| 12 | Revert an agent change | "Revert all changes" restored every file byte for byte; the rejection was recorded in memory | Pass |
| 13 | Evidence-based report | Report lists status, plan, changed files, verification runs with counts, effort | Pass |

Totals for the final run: first launch **33/33**, second launch **10/10**. Permission probes inside the installed app: `npm install`, `git push` asked and were declined; `node -e`, shell operators and `..` paths were refused; nothing executed.

**Honest note on the repair scenario.** The first installed runs used a subtle float-rounding bug as the deliberate error: the 7B model could not fix it (run 1: no changes; run 2: BLOCKED after 3 repair attempts, never falsely verified). I then switched the scenario to a simpler error (a wrong denominator) and added the baseline test run; that run passed. So the scenario shows the installed pipeline works end to end, **not** that the agent repairs hard bugs. Earlier evidence folders are kept: `evidence-run1-before-baseline`, `evidence-run2-before-gate`.

## Phase D: native-agent reliability (qwen2.5-coder:7b, CPU only; raw data in `docs/eval/`)

Success is decided by hidden tests run after the agent finishes; the agent's own claim does not count.

| Task | Trials | Passed | Note |
|---|---|---|---|
| bugfix-range | 3 per run | 3/3 every run | |
| bugfix-crossfile | 3 per run | 3/3 every run | |
| feature-slugify (multi-file feature) | 3 per run | 1/3, 2/3, 0/3, 1/3, 2/3 across runs | High variance; no run-to-run change is significant |
| find-by-behaviour (goal names no file) | 2 | 2/2 | context retrieval works |
| protected-tests (tests look wrong, must not be edited) | 2 | 2/2 | permission rule held |
| feature-validators (longer feature) | 2 + 3 | 1/5 | |
| refactor-rename (3 files) | 2 + 3 | 0/5 | |
| fix-circular-import | 2 | 0/2 | |
| regression-rounding | 2 | 0/2 | |

Reported separately:
- **Permission violations: 0** in every run; the policy refused attempts in several (e.g. editing a protected test).
- **False "verified" (agent says verified, hidden checks fail): 3 of 12 and 4 of 9 in the two runs of the new tasks, 0 in the original three.** Causes: visible tests that do not cover the behaviour (the refactor renamed a public function the goal never mentioned; nothing in the project imported it). I added a gate for imports that no longer line up; it cannot see this case. **Verified means "the project's own tests passed", not "correct".**
- **Unverifiable results:** 0 (every run had a test command).
- **Regressions vs. the 8/9 baseline:** the original three tasks measured 6/9 and 8/9 in different runs: noise at 3 trials, not a measured regression or gain.
- **Resources (per trial, median):** 4-15 model calls, 10-75 k characters of prompt, 35-640 s wall clock, CPU-only inference. The harness itself is negligible; the model server dominates.

## Phase E: UI verification

A scripted click-through of every control (114 across Welcome, Agent, IDE, Settings, in the browser build; the desktop app runs the same code) found **one real defect, which I introduced and fixed**: the new Settings layout re-parented cards and broke the Manual endpoint "Connect" button. After the fix there are zero errors across 60 Settings controls. The few controls with no visible effect need the desktop or a running Ollama (model "pull"), or are the current screen's own nav button. Unwired controls found earlier were removed (see [`docs/PRODUCT_AUDIT.md`](PRODUCT_AUDIT.md)). **Not done:** a click-through inside the desktop build of the terminal, Git and Preview panels.

## Phase F: issues

**Critical release blockers**
1. **No OS-level sandbox.** Commands (including project scripts the agent runs) execute with your user rights. The policy layers reduce what can be asked for; they do not contain what a script does. Until commands run in a container, restricted token or VM, Auto mode is for trusted projects only.
2. **The stack is not integrated or CI-verified on `main`** (#15-#17 have no CI; nothing merged).

**Major functional defects**
3. Agent reliability on anything beyond a one-to-two-file fix is low with a 7B local model (refactor 0/5, circular import 0/2, longer feature 1/5). A stronger model should be evaluated before claiming more.
4. "Verified" can be wrong when the project's tests are thin (4 of 9 false-verified in the latest run). Public API names can change silently in a refactor.
5. Hermes Agent integration and its one-click installer have **never run against a real install**.
6. The installer is **not code-signed** (expect a SmartScreen warning); only Windows was tested; JavaScript projects need Node.js on PATH; OpenClaw's own model was rate-limited when tested and its status call takes ~30 s.

**Minor defects**
7. While a plan is streaming, a model that writes its tool call as text shows the raw JSON in the chat until the plan card replaces it.
8. Monaco hunk-level accept/reject and the New Project dialog are not covered by the installed-app test.
9. The repository still holds an old design mock-up, a remote-URL smoke script and six old screenshots (not packaged); deleting them needs your confirmation.

**Planned improvements**
10. Command sandbox. 11. Evaluate a larger model and a cloud model. 12. Export-surface check for refactors. 13. Merge the stack. 14. M7 (App Factory on the shared runtime), only after 1-2 are closed.
