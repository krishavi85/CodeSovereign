# Vendored libraries

Loaded as plain `<script>` in `dist/index.html`. The renderer CSP is
`script-src 'self'` — no CDN — so these are committed here. All MIT-licensed;
license texts are in this folder.

| File | Package | Version | Purpose | License |
|------|---------|---------|---------|---------|
| `acorn.js` | [acorn](https://github.com/acornjs/acorn) | 8.18.0 | ECMAScript parser — `engine.ast.js` uses it to replace the regex import/export/route extraction | MIT (`LICENSE-acorn.txt`) |
| `acorn-loose.js` | [acorn-loose](https://github.com/acornjs/acorn) | 8.5.2 | error-tolerant fallback parser for files with syntax errors | MIT (`LICENSE-acorn.txt`) |
| `js-yaml.min.js` | [js-yaml](https://github.com/nodeca/js-yaml) | 5.4.1 (UMD browser build) | YAML parser — `engine.pipeline-parse.js` uses it for GitHub Actions / GitLab CI / docker-compose. `load()` in this version has no code-execution tags. | MIT (`LICENSE-js-yaml.txt`) |

## Safeguards applied by the callers

- **acorn**: files > 1.5 MB are skipped (proxy for a time limit); `.sovereign/`,
  `node_modules/`, `vendor/`, `dist/`, `build/` are never parsed.
- **js-yaml**: files > 512 KB are rejected; a workflow with > 200 anchors/aliases
  or > 50 merge keys is refused before expansion; `json: true` rejects duplicate
  keys; malformed files return `{ __error }` and are handled, never thrown.

## Updating

```bash
npm pack acorn acorn-loose            # -> extract dist/browser or dist/*.js (UMD)
npm pack js-yaml                       # -> dist/browser/js-yaml.umd.min.js
```
Copy the UMD build here, update the table above, re-run `npm test`.
