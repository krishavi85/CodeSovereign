'use strict';
/*
 * creds.js — API keys and other secrets, encrypted at rest with the OS keychain
 * via Electron's safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on
 * Linux). Ciphertext lives in <userData>/credentials.json; plaintext never
 * touches disk and is never sent to the renderer except on an explicit get().
 */
const { app, safeStorage } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function file() { return path.join(app.getPath('userData'), 'credentials.json'); }

async function loadAll() {
  try {
    const raw = await fsp.readFile(file(), 'utf8');
    return JSON.parse(raw) || {};
  } catch { return {}; }
}

async function saveAll(map) {
  await fsp.writeFile(file(), JSON.stringify(map), { mode: 0o600 });
}

function available() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

async function get(key) {
  const all = await loadAll();
  const enc = all[key];
  if (!enc) return null;
  try {
    if (available()) return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    return Buffer.from(enc, 'base64').toString('utf8'); // fallback (not encrypted)
  } catch { return null; }
}

async function set(key, value) {
  const all = await loadAll();
  if (value == null || value === '') { delete all[key]; }
  else if (available()) all[key] = safeStorage.encryptString(String(value)).toString('base64');
  else all[key] = Buffer.from(String(value), 'utf8').toString('base64');
  await saveAll(all);
  return { ok: true, encrypted: available() };
}

async function del(key) {
  const all = await loadAll();
  delete all[key];
  await saveAll(all);
  return { ok: true };
}

async function keys() {
  return Object.keys(await loadAll());
}

module.exports = { available, get, set, del, keys };
