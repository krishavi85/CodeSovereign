'use strict';
/* Every headless Electron check (smoke and the acceptance modes) must disable the GPU: CI runners and servers have
 * no display, and the GPU process fails before a single assertion runs. A new mode that is left out of the block
 * breaks on exactly those machines. */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const flags = [...main.matchAll(/^const (\w+) = process\.argv\.includes\('--([\w-]+)'\);/gm)].map((m) => ({ name: m[1], arg: m[2] }));
  const headless = flags.filter((f) => /^(smoke|smoke-observer|acceptance|acceptance-build|acceptance-agent)$/.test(f.arg));
  t.ok('the headless modes are all declared', headless.length === 5, headless.map((f) => f.arg).join(','));
  const start = main.indexOf('app.disableHardwareAcceleration()');
  const ifLine = main.lastIndexOf('if (', start);
  const cond = main.slice(ifLine, start);
  for (const f of headless) t.ok('--' + f.arg + ' disables the GPU', cond.indexOf(f.name) >= 0);
  t.ok('and it also forces the in-process GPU', /in-process-gpu/.test(main.slice(start, start + 200)));
};
