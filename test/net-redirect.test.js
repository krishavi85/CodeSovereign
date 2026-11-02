'use strict';
/* net:fetch must not be a way around the private-host check by redirecting: a redirect to another host is not
 * followed (the 3xx is returned), a redirect on the same host is. Uses local servers. */
const http = require('http');
const { fetchUrl } = require('../electron/lib/net');

module.exports = async function (t) {
  let secretHits = 0;
  const target = http.createServer((req, res) => { secretHits++; res.end('internal'); });
  await new Promise((r) => target.listen(0, '127.0.0.1', r));
  const tp = target.address().port;
  const origin = http.createServer((req, res) => {
    if (req.url === '/cross') { res.writeHead(302, { location: 'http://localhost:' + tp + '/' }); return res.end(); }
    if (req.url === '/meta') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); return res.end(); }
    if (req.url === '/same') { res.writeHead(302, { location: '/final' }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end(); }
    if (req.url === '/final') return res.end(JSON.stringify({ ok: true }));
    res.end('plain');
  });
  await new Promise((r) => origin.listen(0, '127.0.0.1', r));
  const op = origin.address().port;
  const base = 'http://127.0.0.1:' + op;

  let r = await fetchUrl({ url: base + '/cross' });
  t.ok('a redirect to a different host is not followed', r.redirectBlocked === true && r.status === 302 && secretHits === 0);
  t.ok('and the blocked Location is reported to the caller', /localhost/.test(r.location));
  r = await fetchUrl({ url: base + '/meta' });
  t.ok('a redirect to the cloud metadata address is not followed', r.redirectBlocked === true && /169\.254\.169\.254/.test(r.location));
  r = await fetchUrl({ url: base + '/same' });
  t.ok('a redirect that stays on the same host is followed', r.status === 200 && r.json && r.json.ok === true);
  r = await fetchUrl({ url: base + '/loop' });
  t.ok('a redirect loop stops after a few hops instead of running forever', r.redirectBlocked === true);
  r = await fetchUrl({ url: base + '/' });
  t.equal('an ordinary response is unchanged', r.text, 'plain');
  origin.close(); target.close();
};
