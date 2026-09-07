# Desktop security review — preload IPC surface

Reviewed at PR #1 (Milestone 1). Threat model: the renderer is a large web app
with `'unsafe-inline'` scripts and, via the LLM/agent features, it processes
untrusted text. Assume renderer JS can be induced to call any `window.desktop`
method with attacker-chosen arguments. Main must not allow that to become
filesystem access outside the project, code execution, or secret exfiltration
beyond what the user explicitly enabled.

## Window / session hardening

| Control | State |
|---|---|
| `contextIsolation` | **on** |
| `nodeIntegration` | **off** |
| `sandbox` | **on** |
| `webviewTag` | off |
| Preload API | typed allowlist only (`electron/preload.js`), no raw `ipcRenderer` |
| New windows | `setWindowOpenHandler` → `deny`; `https:` → system browser |
| Navigation | `will-navigate` allows **only** the app's own `index.html`; everything else is prevented (stray `file://` cannot be pointed at other local files) |
| Permissions | `setPermissionRequestHandler` → deny all |
| Preview `<iframe>`s | `sandbox="allow-scripts"` (no `allow-same-origin`) → opaque origin, cannot reach `window.desktop` |
| Single-instance lock | on |

## Per-endpoint findings & mitigations

### Filesystem (`fs:*`, `ws:*`)

- **`ws:open(dir)` accepted an arbitrary path** → renderer could set the
  workspace to `C:\` and then read/write the whole drive via `fs:*`.
  **Fixed:** `ws:open` only accepts a path already present in the recents list
  (recents are populated exclusively by the native dialogs). New folders always
  go through `ws:pickAndOpen`.
- **`ws:createProject({parentDir})` accepted an arbitrary parent** → files could
  be scaffolded into `C:\Windows`, Startup, etc.
  **Fixed:** `parentDir` must be `null` (→ `~/CodeSovereign/Projects`) or a
  directory the user picked in the "choose where to create" dialog **this
  session** (`approvedParents` set).
- **Symlink escape** — a `link → C:\Windows` checked into a project would let
  `/link/x` resolve back inside root by prefix but write outside.
  **Fixed:** `assertRealInside()` realpaths the nearest existing ancestor before
  every write/delete/rename/mkdir and checks containment with `path.relative`
  (not string-prefix — see below); `readTree` skips symlinked entries; the root
  is canonicalized on open.
- **Path normalization** (CI-found): `resolveInside` now normalizes both `/` and
  `\` (Linux does not treat `\` as a separator, so `..\..\x` previously slipped
  through as a filename) and rejects any `.`/`..` segment outright before
  resolving.
- **Containment check** (CI-found): comparisons use `path.relative(root, abs)`
  rather than `abs.startsWith(root + sep)`, so an 8.3 short path on a CI runner
  (`C:\Users\RUNNER~1\…`) no longer mismatches its canonical long form. Both
  sides are `fs.realpathSync.native`-canonicalized.
- `.git/`, `node_modules/`, build dirs are **write-protected** (still readable).
  Deleting the workspace root is refused.
- Non-string arguments are rejected at the IPC boundary.
- Residual, accepted: within the chosen project folder the renderer has full
  read/write. That is the product ("edit my project"). `readTree` caps at
  8 000 files / 2 MB per text file.

### Process execution (`proc:*`)

- **Removed `proc:spawn`** (arbitrary `{cmd,args}`) from the bridge entirely —
  it was an unrestricted RCE surface.
- `proc:run` (one-shot) and `proc:spawnAllowed` (streamed, for long jobs like
  `npm install` / `npm run build`) both enforce the **same allowlist** —
  project tooling only (`npm/npx/pnpm/yarn/node/git/python/tsc/eslint/vite/jest/
  vitest/playwright/…`), workspace-scoped `cwd`, args coerced to strings.
  `npm run <script>` can still execute whatever the **project's own**
  `package.json` defines — inherent to "run my project", documented, not a
  main-process escalation.
- `proc:shell` — spawns **only** the OS shell (`cmd.exe` / `$SHELL`) in the
  workspace; the user then types into it. Same trust model as VS Code's
  integrated terminal. Accepted.
- `proc:write` caps input at 100 KB/chunk; `proc:kill` only touches tracked pids;
  all children are killed on quit.

### Runtime observer (`obs:*`)

- Drives the project's running app in a **separate hidden `BrowserWindow`**
  (own `partition:'observer'`, own preload, `contextIsolation`,
  `nodeIntegration:false`) so it can never touch the app window or `window.desktop`.
- **URL policy** (`observer.assertAllowedUrl`): only
  `http(s)://localhost|127.0.0.1|[::1]:*` and `file://` paths **inside the open
  workspace**. The renderer cannot point the observer at an external site.
- The observer window's own `setWindowOpenHandler` denies popups.
- `observer-preload.js` only *reads* (console/network/nav buffers) and exposes a
  read-only `window.__obs`; it sends nothing anywhere.
- `sandbox:false` on this window only (the preload needs `require('electron')`);
  acceptable because it loads localhost dev content the user is already running.

### Git (`git:*`)

- **`git:exec(args)` was arbitrary** → `git -c core.pager=… status`,
  `-c core.sshCommand=…`, `--exec-path=…`, hooks, etc. = code execution.
  **Fixed:** `validateArgs()` requires an allowlisted subcommand, forbids global
  flags before it (`-c`, `-C`, `--exec-path`, `--git-dir`, `--work-tree`,
  `--upload-pack`, `--receive-pack`, …), forbids `-c` anywhere, and blocks
  `git config` writes to `alias.*` / `core.*Command` / `core.pager` /
  `core.editor` / `core.sshCommand` / `core.fsmonitor`. Runs with
  `GIT_TERMINAL_PROMPT=0` and `GIT_CONFIG_NOSYSTEM=1`.
- Residual: `git push`/`pull`/`fetch` use the user's configured credential
  helper (by design). `git clone`/`remote add` of an attacker URL is possible
  from a compromised renderer — low impact (clones into the project dir), on the
  M2 list to gate behind a confirmation.

### Credentials (`creds:*`)

- `creds:get` returns a **decrypted** secret to the renderer — required for the
  LLM key to be usable. Mitigations: key names are validated
  (`/^[a-z0-9][a-z0-9._-]{0,63}$/i`, no traversal/slashes), values are strings
  ≤ 8 KB, ciphertext is `safeStorage` (DPAPI/Keychain/libsecret) in
  `<userData>/credentials.json` (mode 600). The renderer can enumerate and read
  the keys it wrote — acceptable given it is the trusted app UI and the
  alternative defeats the feature.

### Snapshots (`snap:*`)

- **`snap:restore(id)` / `read(id)` path-joined a renderer string** → arbitrary
  `*.json` disclosure. **Fixed:** `id` must match the timestamp format
  `YYYY-MM-DDThh-mm-ss-mmmZ`. The write-back side was already workspace-scoped.

### Dialogs (`dialog:*`)

- Renderer controls dialog text → could show an alarming OS dialog (social
  engineering), no escalation. Title truncated. Accepted.

### `app:*`

- **Removed `app:relaunch`** (unused, let the renderer restart the app).
- `app:setTitle` truncates to 120 chars. `app:recents` returns only the user's
  own project paths.

## Supply chain

`npm audit` is **clean (0 vulnerabilities)** as of this review:

- **Runtime:** the only runtime dependency is `electron`. Bumped `33.4.11 → 43.6.0`
  to clear GHSA-vmqv-hx8q-j7mg (ASAR integrity bypass, patched `< 35.7.5`). The
  macOS AppleScript advisory does not apply to the Windows target.
- **Build-time only** (`electron-builder` tree — never shipped, runs on the build
  machine): bumped `electron-builder 25 → 26.15.3` and added `overrides` for
  `tar → ^7.5.1` and `extract-zip → ^2.0.1`, which removed the remaining 13
  advisories (node-tar hardlink traversal, extract-zip symlink traversal,
  `electron-updater` credential-leak-on-redirect — the latter also unused, as
  auto-update is an M2 item).

## Known / accepted risk

- The renderer CSP is `script-src 'self' 'unsafe-inline'` (pre-existing; the app
  relies on inline handlers). Not made worse by this change. A stricter
  main-injected CSP is an M2 item.
- Interactive terminal = arbitrary command execution by the user, by design.
- `proc:run` of `npm`/build tools executes the project's own scripts.

## Tests

`test/security.test.js` covers the git allowlist (8 reject / 6 allow cases),
credential key validation, snapshot id validation, the 8.3-short-path
containment regression, and the symlink write/scan defence.
`test/workspace.test.js` covers path normalization (`/`, `\`, `.`, `..`) and
protected dirs.
