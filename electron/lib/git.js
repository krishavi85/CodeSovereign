'use strict';
/*
 * git.js — thin wrapper around the system `git`, scoped to the open workspace.
 */
const { spawn, execFile } = require('child_process');
const workspace = require('./workspace');

function available() {
  return new Promise((resolve) => {
    execFile('git', ['--version'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && /git version/i.test(stdout || ''));
    });
  });
}

function exec(args) {
  return new Promise((resolve) => {
    const root = workspace.getRoot();
    if (!root) { resolve({ code: -1, stdout: '', stderr: 'No workspace is open' }); return; }
    if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) {
      resolve({ code: -1, stdout: '', stderr: 'Invalid git arguments' });
      return;
    }
    const child = spawn('git', args, { cwd: root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => { err += String(e && e.message || e); });
    child.on('close', code => resolve({ code: code == null ? -1 : code, stdout: out, stderr: err }));
  });
}

async function status() {
  const root = workspace.getRoot();
  if (!root) return { repo: false };
  const inside = await exec(['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return { repo: false };

  const branchRes = await exec(['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.stdout.trim() || 'HEAD';

  let ahead = 0, behind = 0;
  const counts = await exec(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
  if (counts.code === 0) {
    const m = counts.stdout.trim().split(/\s+/);
    behind = parseInt(m[0], 10) || 0;
    ahead = parseInt(m[1], 10) || 0;
  }

  const porcelain = await exec(['status', '--porcelain=v1']);
  const files = porcelain.stdout.split('\n').filter(Boolean).map(line => ({
    x: line[0], y: line[1], path: line.slice(3)
  }));

  return { repo: true, branch, ahead, behind, files };
}

module.exports = { available, exec, status };
