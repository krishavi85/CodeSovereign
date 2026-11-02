'use strict';
/* The empty hooks directory used for untrusted folders must not be a fixed, pre-creatable path in shared temp. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const git = require('../electron/lib/git');

module.exports = async function (t) {
  const untrusted = path.join(os.tmpdir(), 'cs-never-trusted-' + Date.now());
  const env = git.gitEnv(untrusted);
  const keys = Object.keys(env).filter((k) => /^GIT_CONFIG_KEY_/.test(k));
  const hp = keys.map((k) => ({ k, v: env[k.replace('KEY', 'VALUE')] })).find((x) => env[x.k] === 'core.hooksPath');
  t.ok('an untrusted folder gets a core.hooksPath override', !!hp && !!hp.v);
  const dir = hp && hp.v;
  t.ok('it is not the old fixed shared path', dir !== path.join(os.tmpdir(), 'cs-no-hooks') && /cs-no-hooks-[A-Za-z0-9]{6}$/.test(dir));
  t.ok('it exists and is empty (nothing to run)', fs.existsSync(dir) && fs.readdirSync(dir).length === 0);
  t.equal('the same directory is reused within the process', git.gitEnv(untrusted)['GIT_CONFIG_VALUE_1'], dir);
  t.equal('core.fsmonitor stays off', env['GIT_CONFIG_VALUE_0'], 'false');
};
