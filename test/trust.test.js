'use strict';
/* electron/lib/trust.js — workspace trust + audit log, in a mocked userData. */
const os = require('os');
const fs = require('fs');
const path = require('path');
const Module = require('module');

module.exports = async function (t) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-trust-ud-'));
  // mock electron's `app.getPath('userData')`
  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => ud } };
    return origLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../electron/lib/trust')];
  const trust = require('../electron/lib/trust');
  Module._load = origLoad;

  const ws = '/some/project';
  t.ok('new folder is untrusted', !trust.isTrusted(ws));
  trust.grant(ws);
  t.ok('granted folder is trusted', trust.isTrusted(ws));
  t.ok('trust persists to disk', fs.existsSync(path.join(ud, 'trusted-workspaces.json')));
  t.ok('a different folder is still untrusted', !trust.isTrusted('/other'));
  trust.revoke(ws);
  t.ok('revoked folder is untrusted again', !trust.isTrusted(ws));
  t.ok('null/empty is never trusted', !trust.isTrusted('') && !trust.isTrusted(null));

  await trust.audit({ kind: 'run', cmd: 'npm test', cwd: ws, code: 0 });
  await trust.audit({ kind: 'run', cmd: 'npm run build', cwd: ws, code: 1 });
  const rows = await trust.readAudit(10);
  t.equal('audit records both commands', rows.length, 2);
  t.ok('audit entries have a timestamp + command', rows[0].at && rows[1].cmd === 'npm run build');
  t.ok('audit log is a real file in userData', fs.existsSync(path.join(ud, 'command-audit.log')));

  fs.rmSync(ud, { recursive: true, force: true });
  delete require.cache[require.resolve('../electron/lib/trust')];
};
