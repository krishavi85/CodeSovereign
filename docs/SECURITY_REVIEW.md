# Independent security review (manual + test-driven)

Done without Codex or Cursor Bugbot (both stopped at usage limits). Method: read the privileged boundary (`electron/main.js` IPC handlers, `electron/lib/*`), the agent's tool and permission layer (`dist/engine.nagent.js`), and the renderer-to-main surface; for each suspected hole, write a test that **fails first**, then fix. Findings marked "proved" had a failing test before the fix.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | **Symlink / junction escape.** `resolveInside` only checked the path text. A link inside the project pointing out of it (an untrusted repository can ship one) let `fs:read` return files outside the workspace. Proved: a junction `notes -> ../secret` returned `id_rsa`. | Fixed: the deepest existing part of every path is resolved with `realpath` and must stay inside the real workspace root. `test/workspace-symlink.test.js`. |
| 2 | **Critical** | **A hostile `.git` runs code just by opening the folder.** The Git panel runs `git status` on every refresh; a folder with `core.fsmonitor` in `.git/config` ran its program, and its `pre-commit` hook ran on the first commit, with the full process environment. Proved with both. | Fixed: fsmonitor forced off, hooks only after the folder is trusted, no external diff / textconv, sanitized environment (identity and ssh-agent kept). `test/git-untrusted-repo.test.js`. |
| 3 | High | **No argument enforcement in the main process.** `proc:run` / `proc:spawnAllowed` checked only the executable name; `node -e`, `python -c`, `npm install -g`, `npm publish`, `git -c core.pager=…`, `git clone ext::…` all reached `spawn`. The agent's classifier (renderer) refused them, but the renderer is the less trusted side. | Fixed: `electron/lib/cmdpolicy.js` refuses them in `proc.js` before anything starts (options judged only where they belong to the tool: `node app.js -e x` is fine, `node -e x` is not). A parity test keeps the renderer classifier at least as strict (it was missing `--script-shell`; added). `test/cmdpolicy.test.js`, 59 cases. |
| 4 | High | **`trust:grant` over IPC.** Any renderer code could call it and skip the folder-trust dialog that guards command execution. | Fixed: it now shows the native dialog in the main process. |
| 5 | High | **`mcp:start` had no trust gate** (it spawns allowlisted programs such as `npx` / `node`). | Fixed: same folder-trust prompt as any command, and the arguments pass `cmdpolicy`. |
| 6 | Medium | **`net:fetch` is a CSP bypass and an open exfiltration / SSRF primitive** (any HTTPS host, any headers and body). | Mitigated: private, link-local, metadata and integer-IP targets refused; a host not yet contacted this session needs a native OK. `test/net-policy.test.js`. Residual: an approved host can still receive data. |
| 7 | Medium | **`openclaw:openDashboard` passed a renderer-supplied URL to `shell.openExternal`** (`file:`, `ms-msdt:` and other schemes reach the OS). | Fixed: only a local `http(s)` address. |
| 8 | Medium | **Project memory could carry model text into later prompts.** A blocked run stored the model's own explanation. | Fixed: only harness-derived reasons are stored; test with an injected "IGNORE ALL PREVIOUS INSTRUCTIONS" report. Memory is per project (fixed earlier) and only memories written by the native agent are injected. |
| 9 | Medium | **Background servers the agent started outlived the task** (`stopProcesses` existed but nothing called it). | Fixed: stopped when the task ends or is cancelled. Test added. |
| 10 | Medium | **OpenRouter key stored in plain localStorage** (fixed in the audit PR). | Fixed: all four LLM secrets use the OS keychain. |

## Checked and sound
* Text-form tool calls recovered from a model's prose go through the same argument validation, offered-tool check and permission policy as structured calls.
* The agent never overwrites unsaved editor text (it becomes a proposal), detects a file changed since it was read, keeps a journal so every change can be reverted, and protects existing tests.
* The environment given to project commands is sanitized (no `*TOKEN*`, `*KEY*`, `*SECRET*`, `AUTH*`, …); `rawEnv` is not reachable from IPC.
* `webPreferences`: `contextIsolation` on, `nodeIntegration` off, `sandbox` on; navigation and `window.open` go to the system browser for `http(s)` only.
* Model-provider traffic: `ai:request` / `ai:stream` allow loopback and a fixed list of API hosts only.

## Residual risks (not fixed; the first is a release blocker for unattended autonomy)
1. **No OS-level sandbox.** Commands run as the user. The policy layers above (renderer classifier, main-process floor, folder trust) reduce what the agent can ask for, but a project script the agent is allowed to run (`npm test`, `npm run build`) executes arbitrary code with the user's rights. **Auto mode should be treated as "trusted projects only" until commands run in a sandbox (container, restricted token or VM).**
2. **Hostile git configuration beyond the cases above** (`filter.*.smudge`, `credential.helper`, merge drivers, `remote.*.uploadpack`) is not neutralised; only open folders from sources you trust, or without a `.git` directory.
3. **The renderer can read keychain secrets** (`creds:get`) by design: the UI needs them. A renderer compromise (XSS) exposes them. The page CSP allows `'unsafe-inline'` scripts, which weakens the XSS barrier.
4. **`ai:request` allows any loopback port**, so page code can talk to any local service.
5. **The interactive terminal (`proc:shell`) is an unrestricted shell by design**, behind the folder-trust prompt.
