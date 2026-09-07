'use strict';
/*
 * Minimal test runner — no dependencies.
 *   node test/run.js            run every *.test.js in test/
 *   node test/run.js proc       run only test/proc.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];

function record(ok, name, extra) {
  if (ok) { pass++; process.stdout.write('  ✓ ' + name + '\n'); }
  else { fail++; failures.push(name); process.stdout.write('  ✗ ' + name + (extra ? '  ' + extra : '') + '\n'); }
}

const t = {
  ok(name, cond) { record(!!cond, name); },
  equal(name, actual, expected) {
    record(actual === expected, name, actual === expected ? '' : `(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
  },
  deepEqual(name, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    record(a === e, name, a === e ? '' : `(got ${a}, want ${e})`);
  },
  async throwsAsync(name, fn) {
    try { await fn(); record(false, name, '(did not throw)'); }
    catch { record(true, name); }
  }
};

(async () => {
  const only = process.argv[2];
  const dir = __dirname;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !only || f.includes(only))
    .sort();

  if (!files.length) { console.error('no test files matched'); process.exit(1); }

  for (const f of files) {
    console.log('\n' + f);
    try {
      await require(path.join(dir, f))(t);
    } catch (e) {
      fail++; failures.push(f + ' (threw)');
      console.error('  ! ' + (e && e.stack || e));
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('failed: ' + failures.join(', ')); process.exit(1); }
})();
