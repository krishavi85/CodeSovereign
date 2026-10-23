'use strict';
/*
 * hardware.js — read-only host inventory for the AI router / build matrix.
 *
 * Everything here is passive: `os` module facts, Electron's own GPU report, and
 * a couple of well-known read-only vendor probes (`nvidia-smi -q`, `wmic`,
 * `system_profiler`). No writes, no downloads, no arbitrary commands.
 */
const os = require('os');
const { execFile } = require('child_process');

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const child = execFile(cmd, args, { timeout: timeoutMs || 4000, windowsHide: true, maxBuffer: 1 << 20 },
      (err, stdout) => { if (done) return; done = true; resolve(err ? null : String(stdout || '')); });
    child.on('error', () => { if (!done) { done = true; resolve(null); } });
  });
}

async function nvidiaVram() {
  // nvidia-smi is read-only. --query-gpu is the stable machine-readable form.
  const out = await run('nvidia-smi',
    ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], 4000);
  if (!out) return null;
  const line = out.split('\n').map((l) => l.trim()).filter(Boolean)[0];
  if (!line) return null;
  const [name, memMiB, driver] = line.split(',').map((s) => s.trim());
  const vramGB = Number(memMiB) > 0 ? Math.round((Number(memMiB) / 1024) * 10) / 10 : null;
  return { vendor: 'nvidia', name: name || 'NVIDIA GPU', vramGB, driver: driver || null, cuda: true };
}

async function appleGpu() {
  const out = await run('system_profiler', ['SPDisplaysDataType', '-json'], 6000);
  if (!out) return null;
  try {
    const j = JSON.parse(out);
    const g = (j.SPDisplaysDataType || [])[0] || {};
    return {
      vendor: /apple/i.test(g.spdisplays_vendor || g._name || '') ? 'apple' : (g.spdisplays_vendor || 'apple'),
      name: g.sppci_model || g._name || 'Apple GPU',
      vramGB: null,            // unified memory — see ram.totalGB
      driver: null, metal: true, unifiedMemory: true
    };
  } catch (_) { return null; }
}

async function electronGpu(app) {
  try {
    const info = await app.getGPUInfo('basic');
    const d = (info && info.gpuDevice && info.gpuDevice[0]) || null;
    if (!d) return null;
    const vendor = ({ 0x10de: 'nvidia', 0x1002: 'amd', 0x8086: 'intel', 0x106b: 'apple' })[d.vendorId] || ('0x' + Number(d.vendorId || 0).toString(16));
    return { vendor: vendor, name: d.deviceString || info.auxAttributes && info.auxAttributes.glRenderer || 'GPU', vramGB: null, driver: (info.auxAttributes && info.auxAttributes.driverVersion) || null };
  } catch (_) { return null; }
}

async function toolchains() {
  const probes = {
    node: ['node', ['--version']], npm: ['npm', ['--version']], pnpm: ['pnpm', ['--version']],
    python: ['python', ['--version']], python3: ['python3', ['--version']],
    rustc: ['rustc', ['--version']], cargo: ['cargo', ['--version']],
    go: ['go', ['version']], java: ['java', ['-version']], docker: ['docker', ['--version']],
    git: ['git', ['--version']], ollama: ['ollama', ['--version']], cmake: ['cmake', ['--version']]
  };
  const out = {};
  await Promise.all(Object.keys(probes).map(async (k) => {
    const r = await run(probes[k][0], probes[k][1], 3000);
    if (r) out[k] = (r.match(/[\d]+\.[\d]+(\.[\d]+)?/) || [r.trim().split('\n')[0]])[0];
  }));
  return out;
}

async function probe(app) {
  const cpus = os.cpus() || [];
  const totalGB = Math.round((os.totalmem() / 1073741824) * 10) / 10;
  const freeGB = Math.round((os.freemem() / 1073741824) * 10) / 10;

  let gpu = null;
  if (process.platform === 'win32' || process.platform === 'linux') gpu = await nvidiaVram();
  if (!gpu && process.platform === 'darwin') gpu = await appleGpu();
  if (!gpu && app) gpu = await electronGpu(app);

  // On Apple silicon the model can use a large fraction of unified memory.
  const effectiveVramGB = gpu && gpu.vramGB != null ? gpu.vramGB
    : (gpu && gpu.unifiedMemory ? Math.round(totalGB * 0.6 * 10) / 10 : 0);

  return {
    at: Date.now(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cpu: {
      model: (cpus[0] && cpus[0].model || 'unknown').replace(/\s+/g, ' ').trim(),
      cores: cpus.length,
      speedMHz: cpus[0] && cpus[0].speed || null
    },
    ram: { totalGB, freeGB },
    gpu: gpu || { vendor: 'none', name: 'no discrete GPU detected', vramGB: 0 },
    effectiveVramGB,
    toolchains: await toolchains()
  };
}

module.exports = { probe };
