'use strict';
/* Guard: every renderer script must parse. Cheap stand-in for a browser build. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const distDir = path.join(__dirname, '..', 'dist');
  const roots = [distDir, path.join(distDir, 'desktop')];
  let checked = 0;
  for (const dir of roots) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      const p = path.join(dir, name);
      const src = fs.readFileSync(p, 'utf8');
      try {
        new vm.Script(src, { filename: p });
        checked++;
      } catch (e) {
        t.ok('parse ' + path.relative(distDir, p) + ' -> ' + e.message, false);
      }
    }
  }
  t.ok('parsed ' + checked + ' renderer scripts', checked > 20);

  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  t.ok('index.html loads the desktop layer', /desktop\/desktop-app\.js/.test(html));
  t.ok('index.html has no frame-ancestors in meta CSP', !/frame-ancestors/.test(html));
};
