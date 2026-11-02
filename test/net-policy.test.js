'use strict';
/* net:fetch bypasses the page CSP, so private / link-local targets are refused in the main process. */
const { isPrivateHost } = require('../electron/lib/net');
module.exports = async function (t) {
  const priv = ['10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.169.254', '127.0.0.2', '0.0.0.0', '100.64.0.1', '::1', '[::1]', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'metadata.google.internal', 'printer.local', 'db.internal', 'nas.lan', '2130706433', '0x7f000001', ''];
  for (const h of priv) t.ok('private: ' + JSON.stringify(h), isPrivateHost(h) === true);
  const pub = ['api.github.com', 'example.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', 'mcp.vercel.com', '2606:4700::1111'];
  for (const h of pub) t.ok('public: ' + h, isPrivateHost(h) === false);
};
