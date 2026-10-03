'use strict';
/*
 * trust.js — workspace trust + a tamper-resistant command audit log.
 *
 * An untrusted project's package.json can run arbitrary code through
 * `npm test` / `npm run build`. Nothing that spawns a process may run in an
 * untrusted workspace until the user has explicitly granted trust for that
 * exact folder. Trust and the audit log live in <userData>, never in the
 * project, so a malicious project can't pre-trust itself or edit the log.
 */
const { app } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function trustFile() { return path.join(app.getPath('userData'), 'trusted-workspaces.json'); }
function auditFile() { return path.join(app.getPath('userData'), 'command-audit.log'); }

let _trusted = null;
function loadTrusted() {
  if (_trusted) return _trusted;
  try { _trusted = new Set(JSON.parse(fs.readFileSync(trustFile(), 'utf8'))); }
  catch { _trusted = new Set(); }
  return _trusted;
}
function saveTrusted() {
  try { fs.writeFileSync(trustFile(), JSON.stringify(Array.from(loadTrusted())), { mode: 0o600 }); } catch { /* ignore */ }
}

function norm(dir) { return path.resolve(String(dir || '')); }

function isTrusted(dir) {
  if (!dir) return false;
  return loadTrusted().has(norm(dir));
}
function grant(dir) { loadTrusted().add(norm(dir)); saveTrusted(); }
function revoke(dir) { loadTrusted().delete(norm(dir)); saveTrusted(); }
function list() { return Array.from(loadTrusted()); }

async function audit(entry) {
  const line = JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry)) + '\n';
  try { await fsp.appendFile(auditFile(), line, { mode: 0o600 }); } catch { /* ignore */ }
}

async function readAudit(limit) {
  try {
    const raw = await fsp.readFile(auditFile(), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(-(limit || 200)).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch { return []; }
}

module.exports = { isTrusted, grant, revoke, list, audit, readAudit, norm };
