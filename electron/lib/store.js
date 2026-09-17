'use strict';
/* store.js — a tiny JSON settings file in <userData>/desktop-state.json.
   Holds window bounds, recent projects, and the last-open workspace. */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let cache = null;
function file() { return path.join(app.getPath('userData'), 'desktop-state.json'); }

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); }
  catch { cache = { recents: [], lastWorkspace: null, windowBounds: null }; }
  if (!Array.isArray(cache.recents)) cache.recents = [];
  return cache;
}

function save() {
  try {
    const f = file();
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(load(), null, 2));
    fs.renameSync(tmp, f);
  } catch { /* ignore */ }
}

function get(key) { return load()[key]; }
function set(key, value) { load()[key] = value; save(); }

function addRecent(entry) {
  const s = load();
  s.recents = [entry, ...s.recents.filter(r => r.path !== entry.path)].slice(0, 12);
  s.lastWorkspace = entry.path;
  save();
}

function removeRecent(p) {
  const s = load();
  s.recents = s.recents.filter(r => r.path !== p);
  if (s.lastWorkspace === p) s.lastWorkspace = null;
  save();
}

module.exports = { get, set, addRecent, removeRecent, load, save };
