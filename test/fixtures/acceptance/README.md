# Acceptance fixture — Task Board

A tiny full-stack task board used to prove the eight CodeSovereign engines work
**together**, end to end. Driven by `npm run acceptance` (see `electron/acceptance.js`).

| Piece | Where |
|---|---|
| **Frontend** | `public/` — real `fetch` calls with loading / error / disabled handling |
| **Backend** | `server.js` — dependency-free HTTP API (`/api/tasks` GET/POST) on port 4319 |
| **Data layer** | `src/repository.js` — JSON-file store honouring the migration schema |
| **Database migration** | `db/migrations/001_init.sql` |
| **Unit tests** | `test/repository.test.js` (`node --test`) |
| **Build / lint scripts** | `scripts/build.js`, `scripts/lint.js` (+ `dev`, `test`) |
| **CI workflow** | `.github/workflows/ci.yml` — quality → build → deploy (environment: production) |
| **Container** | `Dockerfile` — `EXPOSE 4319` + `HEALTHCHECK` |

## Planted defects the flow must find

| Control / file | Defect | Expected finding |
|---|---|---|
| `#exportBtn` "Export CSV" | `onclick="return false"`, no implementation | **MOCK** (static + runtime) |
| `#helpLink` "Help" | `href="#"` | **MOCK** (static + runtime) |
| `#clearBtn` "Clear all" | `onclick="clearAllTasks()"` — function undefined | **BROKEN** at runtime (console error on click) |
| `public/index.html` `<img id="logo">` | no `alt` attribute | auto-repairable hygiene defect |
| `public/app.js` | a stray `console.log` | auto-repairable hygiene defect |

The mutating control (`#addBtn`, a form submit) must **not** be auto-clicked by the
observer in observe mode.

Run standalone: `npm run dev` (port 4319), `npm test`, `npm run build`, `npm run lint`.
