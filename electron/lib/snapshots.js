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
  for (const f of tree.files) if (!f.binary && f.content != null) files[f.path] = f.content;

  const dir = dirFor(root);
  await fsp.mkdir(dir, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = { id, at: Date.now(), root, reason: reason || 'auto', fileCount: Object.keys(files).length, files };
  await fsp.writeFile(path.join(dir, id + '.json'), JSON.stringify(payload));

  // prune
  const all = (await fsp.readdir(dir)).filter(n => n.endsWith('.json')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
    await fsp.rm(path.join(dir, old), { force: true });
  }
  return { ok: true, id, fileCount: payload.fileCount };
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
  if (!root) return null;
  try {
    const raw = await fsp.readFile(path.join(dirFor(root), id + '.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

/** Restore: write every file from the snapshot back to disk. Returns the file map. */
async function restore(id) {
  const snap = await read(id);
  if (!snap) return { ok: false, reason: 'not-found' };
  await create('pre-restore');
  for (const [p, content] of Object.entries(snap.files || {})) {
    try { await workspace.writeFile(p, content); } catch { /* keep going */ }
  }
  return { ok: true, files: snap.files };
}

module.exports = { create, list, read, restore };
