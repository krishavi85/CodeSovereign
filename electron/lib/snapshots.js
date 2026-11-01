'use strict';
/*
 * snapshots.js — automatic crash-recovery snapshots of the open workspace.
 *
 * Every snapshot is a single JSON file with the text contents of the project
 * (binary files are recorded by path only). Stored under
 *   <userData>/snapshots/<slug-of-root>/<timestamp>.json
 * so they survive an app crash, a bad edit, or a botched repair.
 */
const { app } = require('electron');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const workspace = require('./workspace');

const KEEP = 25;
// snapshot ids are timestamps: 2026-09-07T12-00-00-000Z
const ID_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9-]{12,16}Z$/;

// A snapshot is only ever meant to hold the *authored* project. Directories that
// hold installed dependencies or build output can dwarf the source by orders of
// magnitude — a generated app after `npm install` + `npm run build` easily blows
// past V8's max string length in JSON.stringify. Exclude them by path segment
// (readTree only filters some of these, and only at the top level).
const SNAP_IGNORE_SEGMENTS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.cache', '.parcel-cache', '.turbo',
  'dist', 'dist-electron', 'build', 'out', 'release', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.output', '.vercel', '.netlify',
  'vendor', 'venv', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache',
  'target', '.gradle', '.terraform', '.cs-snapshots'
]);
const SNAP_MAX_FILE_BYTES = 1024 * 1024;        // skip any single file over ~1 MB
const SNAP_MAX_TOTAL_BYTES = 64 * 1024 * 1024;  // cap the whole payload at ~64 MB

function ignoredSnapshotPath(p) {
  return String(p).split('/').some(seg => SNAP_IGNORE_SEGMENTS.has(seg));
}

function slug(root) {
  return crypto.createHash('sha1').update(root).digest('hex').slice(0, 16);
}
function dirFor(root) {
  return path.join(app.getPath('userData'), 'snapshots', slug(root));
}

async function create(reason) {
  const root = workspace.getRoot();
  if (!root) return { ok: false, reason: 'no-workspace' };
  const tree = await workspace.readTree();
  const files = {};
  let total = 0;
  let skipped = 0;
  let capped = tree.truncated || false;
  for (const f of tree.files) {
    if (f.binary || f.content == null) continue;
    if (ignoredSnapshotPath(f.path)) { skipped++; continue; }
    const bytes = Buffer.byteLength(f.content, 'utf8');
    if (bytes > SNAP_MAX_FILE_BYTES) { skipped++; continue; }
    if (total + bytes > SNAP_MAX_TOTAL_BYTES) { capped = true; skipped++; continue; }
    files[f.path] = f.content;
    total += bytes;
  }

  const dir = dirFor(root);
  await fsp.mkdir(dir, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = {
    id, at: Date.now(), root, reason: reason || 'auto',
    fileCount: Object.keys(files).length, skipped, truncated: capped || undefined,
    files
  };
  const file = path.join(dir, id + '.json');
  try {
    await fsp.writeFile(file, JSON.stringify(payload));
  } catch (e) {
    // Last-resort guard: if the payload still can't be serialized (e.g. V8's max
    // string length), leave a visible marker instead of a silently missing snapshot.
    const marker = {
      id, at: payload.at, root, reason: payload.reason,
      fileCount: payload.fileCount, skipped, truncated: true,
      error: String(e && e.message || e)
    };
    await fsp.writeFile(file, JSON.stringify(marker));
    return { ok: true, id, fileCount: 0, truncated: true, error: marker.error };
  }

  // prune
  const all = (await fsp.readdir(dir)).filter(n => n.endsWith('.json')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
    await fsp.rm(path.join(dir, old), { force: true });
  }
  return { ok: true, id, fileCount: payload.fileCount, skipped, truncated: capped || undefined };
}

async function list() {
  const root = workspace.getRoot();
  if (!root) return [];
  const dir = dirFor(root);
  let names = [];
  try { names = (await fsp.readdir(dir)).filter(n => n.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const n of names.sort().reverse()) {
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(dir, n), 'utf8'));
      out.push({ id: meta.id, at: meta.at, reason: meta.reason, fileCount: meta.fileCount });
    } catch { /* skip corrupt */ }
  }
  return out;
}

async function read(id) {
  const root = workspace.getRoot();
  if (!root || typeof id !== 'string' || !ID_RE.test(id)) return null;
  try {
    const raw = await fsp.readFile(path.join(dirFor(root), id + '.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

/** Restore: write every file from the snapshot back to disk. Returns the file map. */
async function restore(id) {
  const snap = await read(id);
  if (!snap) return { ok: false, reason: 'not-found' };
  if (!snap.files) return { ok: false, reason: 'truncated' };
  await create('pre-restore');
  for (const [p, content] of Object.entries(snap.files || {})) {
    try { await workspace.writeFile(p, content); } catch { /* keep going */ }
  }
  return { ok: true, files: snap.files };
}

module.exports = { create, list, read, restore, ID_RE };
