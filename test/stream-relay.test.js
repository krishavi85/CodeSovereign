'use strict';
/* electron/lib/stream-relay.js: streamed chunks stop, and the upstream request is aborted, when the renderer that asked
 * can no longer receive them. No exception may escape, and no chunk is sent to a disposed target. */
const { EventEmitter } = require('events');
const relay = require('../electron/lib/stream-relay');

function fakeSender() {
  const s = new EventEmitter();
  s.sent = []; s.destroyed = false; s.crashed = false; s.throwOnSend = false;
  s.isDestroyed = () => s.destroyed;
  s.isCrashed = () => s.crashed;
  s.send = (ch, m) => { if (s.throwOnSend) throw new Error('Render frame was disposed before WebFrameMain could be accessed'); s.sent.push([ch, m]); };
  return s;
}

module.exports = async function (t) {
  let s = fakeSender(), aborts = 0;
  let r = relay.create(s, 'ai:stream-chunk', 's1', () => aborts++);
  t.ok('a live renderer receives chunks tagged with the stream id', r.push('a') === true && JSON.stringify(s.sent) === '[["ai:stream-chunk",{"id":"s1","data":"a"}]]');
  r.done();
  t.ok('a finished stream aborts nothing and releases its listeners', aborts === 0 && s.listenerCount('destroyed') === 0 && s.listenerCount('did-start-navigation') === 0);

  s = fakeSender(); aborts = 0;
  r = relay.create(s, 'c', 's2', () => aborts++);
  s.destroyed = true;
  let threw = false, ok;
  try { ok = r.push('x'); } catch (_) { threw = true; }
  t.ok('a destroyed window: no throw, nothing sent, upstream aborted once', !threw && ok === false && s.sent.length === 0 && aborts === 1);
  r.push('y'); r.stop();
  t.equal('later chunks and stops do not abort twice', aborts, 1);

  s = fakeSender(); aborts = 0;
  r = relay.create(s, 'c', 's3', () => aborts++);
  s.throwOnSend = true;
  threw = false;
  try { ok = r.push('x'); } catch (_) { threw = true; }
  t.ok('a send that throws (disposed frame) ends the stream without an exception', !threw && ok === false && aborts === 1 && r.dead);

  s = fakeSender(); aborts = 0;
  r = relay.create(s, 'c', 's4', () => aborts++);
  s.emit('destroyed');
  t.ok('the window being destroyed aborts the request even if no chunk arrives', aborts === 1 && r.push('z') === false);

  s = fakeSender(); aborts = 0;
  relay.create(s, 'c', 's5', () => aborts++);
  s.emit('render-process-gone');
  t.equal('a renderer crash aborts the request', aborts, 1);

  s = fakeSender(); aborts = 0;
  relay.create(s, 'c', 's6', () => aborts++);
  s.emit('did-start-navigation', { url: 'x', isMainFrame: true, isSameDocument: false });
  t.equal('a navigation that has only started does not abort (the old page must be able to finish what it is doing)', aborts, 0);
  s.emit('did-navigate-in-page');
  t.equal('a hash change keeps the stream', aborts, 0);
  s.emit('did-navigate');
  t.equal('a committed navigation or reload of the page that asked aborts the request', aborts, 1);
  t.equal('and releases its listeners', s.listenerCount('did-navigate'), 0);

  s = fakeSender(); aborts = 0;
  r = relay.create(s, 'c', 's7', () => { aborts++; throw new Error('abort failed'); });
  threw = false;
  try { s.destroyed = true; r.push('x'); } catch (_) { threw = true; }
  t.ok('an abort callback that throws is contained', !threw && aborts === 1);

  s = fakeSender(); s.crashed = true;
  r = relay.create(s, 'c', 's8', null);
  t.ok('a crashed renderer is not sent to, and a missing abort callback is fine', r.push('x') === false && s.sent.length === 0);
};
