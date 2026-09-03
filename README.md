# CodeSovereign — AI App Factory

A fully client-side "AI app factory" workspace: describe an app, and the built-in
engine plans, scaffolds, builds, validates, repairs, packages and documents it —
all in the browser. State persists to IndexedDB (with a localStorage fallback);
Supabase sync is optional.

## Run locally

Any static file server pointed at [`dist/`](dist/) works:

```bash
npx serve dist
```

Then open the printed URL. There is no build step — `dist/` is the deployable
artifact as-is. (`.claude/launch.json` defines a `codesovereign-dist` preview
server on port 4173.)

## Layout

| Path | What it is |
|------|------------|
| `dist/` | The application. `index.html` loads the engine + UI modules in order. |
| `dist/oauth-callback.html` | Standalone OAuth redirect handler (used by the OAuth screen). |
| `dist/_init_marketplace.sql`, `dist/_init_phase8.sql` | Supabase schema for the optional marketplace / workspaces / ratings sync. |
| `CodeSovereign.dc.html` | Original Claude Design canvas mock-up (design reference only). |
| `test_codesovereign.mjs` | Playwright smoke test — **targets a remote deployment URL**, edit `BASE_URL` before use. |
| `screenshots/` | Output of the smoke test. |
| `_archive/` | Superseded material moved out during cleanup (old `app/` tree, dev scripts, venv). Safe to delete. |

## Screens

Top nav: Welcome · Agent · IDE · Factory · Pipelines · Marketplace · Workspaces ·
Ratings · Actions · GitHub · OAuth. Left rail: Welcome · Universal · Agent · IDE ·
Factory · Recovery · Settings.

## Backend / Supabase

`dist/backend.js` has a hardcoded Supabase project URL and **publishable** anon
key. The app is fully functional without it (offline-first). To use your own
sync backend, replace `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `dist/backend.js`
and apply the two `_init_*.sql` files to your project.

## Deploy

`dist/` is a static bundle — deploy it to any static host (the CSP `connect-src`
already allows `*.supabase.co`, OpenAI, Anthropic and MiniMax endpoints for the
LLM/agent features). `oauth-callback.html` must be served from the same origin.

## Fixes applied in this pass

- Repaired UTF-8 mojibake throughout `dist/app.js` — em dashes, ellipses, arrows,
  check marks, middle dots and curly quotes had been replaced by `?` / `�`
  (~110 occurrences across toasts, labels, the terminal panel and the 19-stage
  spec view).
- Removed the `frame-ancestors` directive from the `<meta>` CSP in
  `dist/index.html` (ignored in `<meta>`, only valid as an HTTP header — it was
  logging a console error on every screen).
- Fixed the Phase-8 screen router: **Workspaces, Ratings, Actions and OAuth**
  never painted because their modules return an HTML string that the delegator
  discarded. Screen dispatch + `mount()` are now handled in the core `renderAll()`.
- Factory screen: `S.buildSubPhase` defaulted to `'components'` (no such key —
  the buckets are `component` / `logic` / `data`), so the artifact counter showed
  "undefined files" and no sub-phase was highlighted. Defaulted to `'all'` and
  hardened the counter.
- Minor: "1 file" vs "1 files" pluralization in the Modules panel.
