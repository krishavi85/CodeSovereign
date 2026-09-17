'use strict';
/*
 * workspace.js -- the single source of truth for "which real folder is open".
 *
 * The renderer speaks in virtual absolute paths ("/index.html", "/src/app.js").
 * Everything here maps those onto a real directory on disk and refuses to touch
 * anything outside it.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.cache', '.next', '.nuxt',
  'dist-electron', 'release', '.cs-snapshots', '.DS_Store'
]);
const TEXT_MAX_BYTES = 2 * 1024 * 1024; // files larger than this are listed but not loaded
const TREE_MAX_FILES = 8000;
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tif', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar', '.mp3', '.mp4', '.mov', '.avi',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.exe', '.dll', '.so',
  '.dylib', '.class', '.jar', '.node', '.bin', '.db', '.sqlite'
]);

let currentRoot = null;

function getRoot() { return currentRoot; }

/** Canonicalize a path (long form, resolved symlinks) when it exists on disk. */
function canonical(p) {
  try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
}

function setRoot(dir) { currentRoot = dir ? canonical(path.resolve(dir)) : null; return currentRoot; }
function name() { return currentRoot ? path.basename(currentRoot) : null; }

/**
 * True when `abs` is `root` itself or lives underneath it. Uses path.relative so
 * it is immune to 8.3 short names vs long names and other string-level noise
 * (both sides should already be canonical()).
 */
function isInside(root, abs) {
  const rel = path.relative(root, abs);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function defaultProjectsDir() {
  return path.join(os.homedir(), 'CodeSovereign', 'Projects');
}

function sanitizeFolderName(input) {
  let s = String(input || 'project');
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code < 32) continue;                                  // control chars
    if ('<>:"/\\|?*'.indexOf(ch) !== -1) { out += '-'; continue; } // reserved on Windows
    if (ch === ' ') { out += '-'; continue; }
    out += ch;
  }
  out = out.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return out || 'project';
}

/**
 * Turn a renderer path into workspace-relative segments. Normalizes BOTH slash
 * styles (Linux does not treat "\" as a separator, so "..\..\x" would otherwise
 * sneak through as a filename) and rejects any "." / ".." segment outright.
 */
function normalizeVirtual(virtualPath) {
  const raw = String(virtualPath == null ? '' : virtualPath).replace(/\\/g, '/');
  const parts = raw.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) {
    throw new Error('Path contains a ".." segment: ' + virtualPath);
  }
  return parts;
}

/** Map a virtual path ("/a/b.js" or "a/b.js") to a real absolute path inside the workspace. */
function resolveInside(virtualPath) {
  if (!currentRoot) throw new Error('No workspace is open');
  const abs = path.resolve(currentRoot, ...normalizeVirtual(virtualPath));
  if (!isInside(currentRoot, abs)) {
    throw new Error('Path escapes the workspace: ' + virtualPath);
  }
  return abs;
}

/** Real absolute path -> virtual "/relative" path. */
function toVirtual(abs) {
  const rel = path.relative(currentRoot, abs).split(path.sep).join('/');
  return '/' + rel;
}

function isProtected(virtualPath) {
  let parts;
  try { parts = normalizeVirtual(virtualPath); } catch { return true; }
  const top = parts[0];
  return top === '.git' || IGNORED_DIRS.has(top);
}

async function pathExists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

/**
 * Defence in depth against symlinks: resolve the nearest existing ancestor of
 * `abs` through the real filesystem and make sure it still lands inside the
 * workspace. Both sides are canonicalized (long form) so an 8.3 short path on a
 * CI runner (C:\Users\RUNNER~1\...) still compares equal to its long form.
 * Blocks e.g. a "link -> C:\Windows" checked into the project.
 */
async function assertRealInside(abs) {
  const rootReal = canonical(currentRoot);
  let probe = abs;
  for (let i = 0; i < 60; i++) {
    if (await pathExists(probe)) {
      const real = await fsp.realpath(probe);
      if (!isInside(rootReal, real)) {
        throw new Error('Path resolves outside the workspace (symlink?): ' + abs);
      }
      return;
    }
    const parent = path.dirname(probe);
    if (parent === probe) return;
    probe = parent;
  }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

/* ---------- reads ---------- */

async function readFile(virtualPath) {
  const abs = resolveInside(virtualPath);
  try {
    const buf = await fsp.readFile(abs);
    return buf.toString('utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Walk the workspace and return { files: [{path, content|null, binary, size}], truncated }. */
async function readTree() {
  if (!currentRoot) return { files: [], truncated: false };
  const out = [];
  let truncated = false;

  async function walk(dir) {
    if (out.length >= TREE_MAX_FILES) { truncated = true; return; }
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
      if (out.length >= TREE_MAX_FILES) { truncated = true; return; }
      if (ent.name.startsWith('.git')) continue;
      if (ent.name.includes('.cs-tmp-')) continue;      // in-flight atomic write
      if (ent.isSymbolicLink()) continue;               // never follow links out of the tree
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (IGNORED_DIRS.has(ent.name)) continue;
        await walk(abs);
      } else if (ent.isFile()) {
        let stat;
        try { stat = await fsp.stat(abs); } catch { continue; }
        const ext = path.extname(ent.name).toLowerCase();
        const binary = BINARY_EXT.has(ext);
        let content = null;
        if (!binary && stat.size <= TEXT_MAX_BYTES) {
          try { content = (await fsp.readFile(abs)).toString('utf8'); } catch { content = null; }
        }
        out.push({ path: toVirtual(abs), content, binary, size: stat.size });
      }
    }
  }

  await walk(currentRoot);
  return { files: out, truncated };
}

/* ---------- writes ---------- */

async function writeFile(virtualPath, content) {
  if (isProtected(virtualPath)) throw new Error('Refusing to write inside a protected directory: ' + virtualPath);
  const abs = resolveInside(virtualPath);
  await assertRealInside(abs);
  await ensureDir(path.dirname(abs));
  // atomic: write to a sibling temp file, then rename over the target
  const tmp = abs + '.cs-tmp-' + process.pid + '-' + Date.now();
  const body = String(content == null ? '' : content);
  try {
    await fsp.writeFile(tmp, body, 'utf8');
    await fsp.rename(tmp, abs);
  } catch (e) {
    try { await fsp.rm(tmp, { force: true }); } catch { /* ignore */ }
    throw e;
  }
  return { ok: true, path: toVirtual(abs) };
}

async function removePath(virtualPath) {
  if (isProtected(virtualPath)) throw new Error('Refusing to delete a protected directory: ' + virtualPath);
  const abs = resolveInside(virtualPath);
  if (abs === currentRoot) throw new Error('Refusing to delete the workspace root');
  await assertRealInside(abs);
  await fsp.rm(abs, { recursive: true, force: true });
  return { ok: true };
}

async function mkdirPath(virtualPath) {
  if (isProtected(virtualPath)) throw new Error('Refusing to create inside a protected directory: ' + virtualPath);
  const abs = resolveInside(virtualPath);
  await assertRealInside(abs);
  await ensureDir(abs);
  return { ok: true };
}

async function renamePath(fromVirtual, toVirtualPath) {
  if (isProtected(fromVirtual) || isProtected(toVirtualPath)) throw new Error('Refusing to touch a protected directory');
  const a = resolveInside(fromVirtual);
  const b = resolveInside(toVirtualPath);
  await assertRealInside(a);
  await assertRealInside(b);
  await ensureDir(path.dirname(b));
  await fsp.rename(a, b);
  return { ok: true };
}

/* ---------- open / create ---------- */

async function open(dir) {
  const resolved = path.resolve(dir);
  if (!(await pathExists(resolved))) throw new Error('Folder not found: ' + resolved);
  const st = await fsp.stat(resolved);
  if (!st.isDirectory()) throw new Error('Not a folder: ' + resolved);
  const real = setRoot(resolved);                 // setRoot canonicalizes
  const tree = await readTree();
  return { root: real, name: path.basename(real), files: tree.files, truncated: tree.truncated };
}

async function createProject({ parentDir, folderName, files }) {
  const parent = parentDir ? path.resolve(parentDir) : defaultProjectsDir();
  await ensureDir(parent);
  const safeName = sanitizeFolderName(folderName);
  let dir = path.join(parent, safeName);
  let n = 2;
  while (await pathExists(dir)) { dir = path.join(parent, safeName + '-' + n); n++; }
  await ensureDir(dir);
  setRoot(dir);
  for (const f of (files || [])) {
    try { await writeFile(f.path, f.content); } catch (e) { /* keep going */ }
  }
  const tree = await readTree();
  return { root: dir, name: path.basename(dir), files: tree.files, truncated: tree.truncated };
}

module.exports = {
  IGNORED_DIRS, TEXT_MAX_BYTES, sanitizeFolderName,
  getRoot, setRoot, name, defaultProjectsDir,
  resolveInside, toVirtual, isProtected, pathExists, ensureDir,
  readFile, readTree, writeFile, removePath, mkdirPath, renamePath,
  open, createProject
};
