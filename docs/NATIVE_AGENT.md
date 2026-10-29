# CodeSovereign native agent

CodeSovereign has its own coding agent, `Engine.NativeAgent`. It does not embed
or call Cursor, Claude Code or any other agent product: it is a runtime that
drives whatever model you have connected (Ollama, LM Studio, OmniRoute, any
OpenAI-compatible endpoint) through CodeSovereign's own tools, permission
policy, workspace and editor review.

This document says what is built, how it behaves, how it was measured, and —
explicitly — what is **not** done yet.

| Piece | File |
|---|---|
| Runtime: state machine, modes, policy, command classifier, tools, task runner | `dist/engine.nagent.js` |
| Tool loop, toolbox primitives, text-form tool-call recovery (Phase 3) | `dist/app.chat.agent.js` |
| Repository intelligence: symbol index, import graph, references, impact, context selection (M5) | `dist/engine.repointel.js` |
| Chat panel (Ask / Plan / Edit modes, `@` context, Apply, proposals) | `dist/app.chat.js` |
| Task modes in the panel (Agent / Auto): plan card, approvals, revert, resume | `dist/app.chat.task.js` |
| Provider adapter incl. Ollama-native streaming | `dist/engine.llm.js` (`chatStream`) |
| Real-model evaluation | `scripts/eval-agent.js`, `scripts/lib/agent-eval*.js`, results in `docs/eval/` |
| Desktop acceptance (real Electron + real model) | `electron/acceptance-agent.js` (`npm run acceptance:agent`) |

## Modes

| Mode | What it does | Changes files? | Runs commands? |
|---|---|---|---|
| **Ask** | Answers questions about the project (sees the open file and the file list; `@` adds context). No tools. | no | no |
| **Plan** | Reads the project and writes a plan. | no | no |
| **Edit** | Reads, searches, and *proposes* edits. Every change waits for your hunk-by-hunk review. | only after you accept | asks first, every time |
| **Agent** | Runs a whole task: **plan → you approve → edit → run the tests → repair failures → report.** Changes are applied but revertible and shown in the review dock. | yes, revertibly, after plan approval | the verification commands in the approved plan; everything else asks |
| **Auto** | Like Agent without the plan-approval step. | yes, revertibly | project commands without asking |

**Autonomous does not mean unrestricted.** In every mode, deleting a file the
agent did not create, network access (installs, `npx`, `git fetch`…), and
destructive commands (`git push`, `reset`, `clean`…) ask for approval; system-level
changes are refused outright. `Engine.Autonomy` (the app's existing autonomy
level) is a ceiling on top: if it forbids writing or commands, no mode can do them.

## Permission policy

Every tool belongs to a permission class; the policy is
`decide(mode, class, { autonomy, planApproved })` in `engine.nagent.js`.

| Class | ask / plan | edit | agent | auto |
|---|---|---|---|---|
| read | allow | allow | allow | allow |
| control (plan, report) | allow | allow | allow | allow |
| edit | deny | **propose** | apply (checkpointed) | apply (checkpointed) |
| exec | deny | ask | allow once the plan is approved, else ask | allow |
| network | deny | ask | ask | ask |
| destructive | deny | ask | ask | ask |
| system | deny | deny | deny | deny |

### Commands are judged by their arguments

The Electron main process only allowlists the *executable* (`npm`, `node`, `git`…).
`classifyCommand(cmd, args)` decides what a particular argument list *means* before
anything runs: it refuses shell operators and environment expansion in arguments,
paths that leave the project, inline code (`node -e`, `python -c`), global installs
and package-manager config changes, and watch/serve modes that never exit; it
classifies `npm install`/`npx`/`git fetch` as network and `git push`/`reset`/`clean`/
branch deletion as destructive. An approved executable name is never enough.

## Tools

All tools have a JSON-schema argument check (also applied to tool calls recovered
from plain text), a timeout, a permission class and a structured result
(`ok`, `status`, `text`, `summary`). Each phase offers only the tools it needs.

| Group | Tools |
|---|---|
| Repository | `list_dir`, `list_files`, `read_file`, `grep` |
| Edit | `edit_file` (exact text → new text, unique match, whitespace-tolerant, CRLF-safe), `create_file`, `write_file`, `apply_patch` (unified diff, hunks located by context, all-or-nothing), `rename_file`, `delete_file` |
| Run | `run_tests`, `build_project`, `run_acceptance_tests`, `run_command` (job or classified command), `start_dev_server`, `stop_process`, `inspect_process`, `inspect_logs` |
| Debug | `read_diagnostics`, `get_problems`, `analyze_stack_trace`, `inspect_diff` |
| Navigate (full toolset) | `find_symbol`, `find_references`, `file_dependencies` |
| Control | `create_plan`, `update_plan`, `request_approval`, `report_result` |

Small local models get a compact set (9–10 tools) because long tool menus hurt them.

## Repository intelligence (M5)

`Engine.RepoIntel` builds, from the project's files (including the agent's own unsaved/proposed edits), a **symbol index** (functions, classes, variables, types, methods; exported or not; JavaScript/TypeScript and Python) and an **import graph** (relative imports resolved to project files, packages kept as external). It is incremental (a file is re-parsed only when its content changes), bounded (skips `node_modules`, build output, files over 200 KB, more than 2,500 files) and never throws on malformed code. Parsing is line/regex based: a navigation aid for a model, not a compiler (it does not follow dynamic `require(variable)`, re-export chains or type-only resolution).

What the agent does with it:

* **Context selection.** The planning and execution prompts include the files most relevant to the goal (named files, files defining symbols the goal mentions, path/word matches, files already changed) plus their neighbours in the graph, each with its exports and *who uses it*, so a feature that spans two files is seen as one change.
* **Repair.** The repair brief names *linked files the agent did not change* (importers of what it changed) and the project code the failing test loads.
* **Tools** (full toolset only; small models keep their short menu and get the same information automatically): `find_symbol`, `find_references`, `file_dependencies`.

## Project memory (M6)

The agent reads and writes the project's long-term memory (`Engine.ProjectBrain`, stored with the project). It records only facts it can state from evidence: the user's goal, the files that really changed, what the harness verified, why a run was BLOCKED, and the verification recipe. It never stores the model's free-text summary, and only entries the native agent wrote are ever injected into a prompt, so a memory cannot carry instructions into later runs. A user's **Revert all changes** is remembered as a rejection ("the approach was not accepted"). Later tasks are shown the few memories relevant to their goal or files (size-bounded, marked as hints: the code is the truth). A failing memory store never breaks a run.

## The task lifecycle

```
IDLE → PLANNING → WAITING_APPROVAL → EXECUTING → VERIFYING → COMPLETED
                                          ↑            │
                                          └─ REPAIRING ←┘ (bounded attempts)
            any live state → BLOCKED (resumable) | FAILED | CANCELLED
```

* The state machine refuses illegal transitions and **persists every change**.
  A run that was live when the app went away is reloaded as `BLOCKED
  (interrupted)`, shown with a **Resume** button, and continues from its saved plan.
* **The harness verifies, not the model.** After execution the harness itself runs
  the project's tests (and build, if there is one) and parses the output. The
  model's own "I'm done" is never evidence. With no tests or build, the result is
  reported as **COMPLETED — NOT VERIFIED**, never as verified.
* **Repair:** failures are parsed into structured diagnostics (names, messages,
  source locations from stack frames). The repair prompt includes the failing
  output, the source around the failing frames, and the code the agent already
  changed. Attempts are bounded; a repair that makes things *worse* is reverted;
  the same failure persisting stops the run (`BLOCKED`) instead of looping.
* **Existing test files are read-only** for a task unless the goal is about tests,
  so the agent cannot "fix" a failure by weakening the test.
* If the model quits having changed nothing, and did not honestly report
  `blocked`, it is nudged (twice) with the last tool errors quoted. A provider
  error caused by a malformed tool call is retried instead of ending the run.
* Budgets: model turns, tool calls, wall-clock time, repair attempts. Cancelling
  stops the run; applied changes stay recoverable.

## Recoverability

Every applied change is recorded in a **journal** (persisted) with checkpoints
(`mark`/`revertTo`/`revertAll`). **Revert all changes** in the task card puts every
file back — including renames and deletions — and closes any open editor review
first. A desktop snapshot is taken at the start of each task. The agent never
overwrites unsaved editor edits (they become proposals), and detects when a file
changed after it read it (conflict instead of overwrite).

## Models

* The agent works with structured tool calls **and** with models that write the
  call as text (`{"name": …, "arguments": …}`): recovered calls go through the same
  schema and permission checks.
* **Ollama:** its OpenAI-compatible route ignores the requested context size and
  silently truncates long prompts (observed: a 12k-token prompt cut to ~2k). When a
  context size is requested for an Ollama endpoint, `chatStream` therefore uses the
  native `/api/chat` (NDJSON, structured tool calls, `options.num_ctx`); the agent
  asks for 16k.
* On a CPU-only machine a 7B model is slow, so prompts are kept small (compacted
  conversation, focused project summary).

## Evaluation

`npm run eval:agent` runs the agent against small real projects in temp
directories with real `npm test`, against the model you have connected. **Success is
judged by an independent run after the agent finishes, with hidden tests the agent
never saw**; the agent's own claim does not count. The harness is itself tested
(`test/native-agent-eval-harness.test.js`): each task fails at the start, its
reference solution passes, and a do-nothing model, a model that edits the tests, and a
"fix" that only satisfies the visible tests are all scored as failures.

### Real-model results (qwen2.5-coder:7b on Ollama, CPU only: 16 cores, no GPU)

Mode `auto`, compact toolset, 16k context, 3 trials per task. Six runs, each after a
change prompted by the failures of the one before (raw data in `docs/eval/`):

| Run | Change since the previous run | bugfix-range | bugfix-crossfile | feature-slugify | Overall |
|---|---|---|---|---|---|
| 1 | first real run on the native Ollama adapter | 3/3 | 2/3 | 0/3 | **5/9** |
| 2 | recover from malformed tool calls; nudge a model that quit with nothing changed; honest "blocked" respected | 3/3 | 2/3 | 0/3 | **5/9** |
| 3 | small models told to use `write_file` for short files | 3/3 | 3/3 | 0/3 | **6/9** |
| 4 | the harness checks "I changed X" claims against what changed and tells the model | 3/3 | 3/3 | 1/3 | **7/9** |
| 5 | M5 repository index in the prompts, M6 memory (`2026-10-27T04-22-35`) | 3/3 | 3/3 | 1/3 | **7/9** (no change) |
| 6 | + imported-name-not-exported check, in the edit result and the repair brief (`2026-10-27T05-12-23`) | 3/3 | 3/3 | 2/3 | **8/9** |

What this does and does not show:

* **Verification honesty held:** in all 54 trials the agent never reported *verified*
  for a result that failed the independent hidden-test judge (0 false successes).
  The failures were reported as `BLOCKED` or `NO CHANGES`.
* The single-file and two-file bug fixes pass reliably with this model (6/6 in each of
  the last two runs; typically 30–95 s once the model is loaded, one cold-start trial
  took 254 s). The multi-file *feature* task is at the edge of what a 7B model can do
  here (1/3 in the best run). A typical failure: the model's summary says it updated a
  second file that it never touched. The harness catches this by running the tests,
  and since run 4 it also names the contradiction in the repair prompt.
* The numbers come from **9 trials per run on three tiny JavaScript projects**.
  Improvements between runs are small-sample and partly noise; the stable findings are
  the failure modes (mis-copied `edit_file` text, quitting early, malformed tool calls,
  false completion claims) and that each mitigation addressed one of them.

## Desktop acceptance (real app, real model)

`npm run acceptance:agent` (`electron . --acceptance-agent`) runs the actual Electron main process, preload, IPC proxy, disk-backed workspace, command runner and renderer chat panel against a real local model, with nothing in the agent path mocked. It checks, on files in a throwaway workspace: the plan card is shown and approved with a real click; model calls cross the main-process proxy and stream; the harness runs the tests through the real runner; files really change on disk; protected tests stay untouched; an **independent** hidden-test judge (run by the harness, not the agent) agrees with the agent's verdict; **Revert all changes** restores every file byte for byte; the renderer is torn down mid-run and, after restart, the run comes back BLOCKED/resumable and Resume finishes it; and network, destructive, inline-code and shell-operator commands are refused or need approval and execute nothing.

It also found a real bug the mocks could not: the desktop runner's test output carries ANSI colour codes, which made the harness read "unknown" pass/fail counts and would have discarded failure details in repair prompts. Fixed and covered by a test.

Scope: this proves the real Electron app run from source (`electron .`). It has **not** been run from an installed/packaged build (`electron-builder` output).

## Not done yet (honest list)

* **No OS-level isolation.** Commands run as the user, in the project folder, with a
  sanitized environment (no tokens/keys). The argument classifier lives in the
  renderer; the main-process allowlist still checks only the executable, so a
  compromised renderer could bypass it. Project code the agent writes and runs can
  do anything user-level code can, including network access.
* **Repository intelligence is syntactic.** Symbols and imports come from line-level parsing of JavaScript/TypeScript and Python. No type-aware resolution, no call graph, no framework detection, no embeddings/semantic search, other languages are file-listed and `grep`-able only.
* **Memory is simple.** Relevance is keyword and file overlap; there is no summarisation or forgetting beyond the brain's 200-item cap, and memory is only as good as the evidence recorded (task outcomes, verification recipe, reverts).
* **No specialist/multi-agent roles**, and the App Factory generator does not yet
  run on this runtime — they are two systems sharing the editor, not one runtime.
* **No live in-editor decorations while the agent edits**: the edited file is
  brought to the front and the existing review dock lists the changes afterwards.
* **Not run from an installed (packaged) build.** The real Electron app (`electron .`) is covered by `acceptance:agent` for plan/approve/edit/verify/revert/resume/permissions; `start_dev_server`, the interactive approval dialogs and a packaged installer run are not.
* **The evaluation is small:** three tiny JavaScript tasks, one 7B model, CPU
  inference. It measures the harness and the failure modes; it is not a benchmark and
  says nothing about large repositories or other languages.
