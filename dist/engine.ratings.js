/* ============================================================
   engine.ratings.js — Template Ratings & Reviews
   ------------------------------------------------------------
   5-star ratings + text reviews for every template in the
   marketplace. Each review is:
     - bound to a template_id
     - attributed to a device id (anonymous stable)
     - stores star rating (1-5), title, body, helpful count
   Local-first (localStorage) with optional Supabase sync.

   Exposes:
     window.TemplateRatings = {
       list(templateId), get(reviewId), add({templateId, stars, title, body}),
       update(reviewId, patch), remove(reviewId), helpful(reviewId),
       stats(templateId),  // {count, avg, distribution}
       mine(templateId),   // current device's review
       recent(limit), top(limit), search(q)
     }
   ============================================================ */
(function() {
  'use strict';

  const LS_RATINGS = 'cs.ratings.v1';
  const LS_HELPFUL = 'cs.ratings.helpful.v1';
  const SUPABASE_URL = (window.Backend && window.Backend.SUPABASE_URL) || null;
  const _devId = () => (window.Workspaces && window.Workspaces.getDeviceId) ? window.Workspaces.getDeviceId() : ('dev_' + (localStorage.getItem('cs.workspaces.deviceId.v1') || 'anon'));

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_RATINGS) || '[]'); }
    catch (_) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(LS_RATINGS, JSON.stringify(arr)); } catch (_) {}
  }
  function loadHelpful() {
    try { return JSON.parse(localStorage.getItem(LS_HELPFUL) || '{}'); }
    catch (_) { return {}; }
  }
  function saveHelpful(obj) {
    try { localStorage.setItem(LS_HELPFUL, JSON.stringify(obj)); } catch (_) {}
  }
  function uid() { return 'rv_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function nowIso() { return new Date().toISOString(); }

  function list(templateId) {
    const all = load();
    return all
      .filter(r => !templateId || r.templateId === templateId)
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  }

  function get(reviewId) {
    return load().find(r => r.id === reviewId) || null;
  }

  function add(opts) {
    opts = opts || {};
    if (!opts.templateId) throw new Error('templateId required');
    const stars = Math.max(1, Math.min(5, parseInt(opts.stars, 10) || 0));
    if (!stars) throw new Error('stars must be 1-5');
    const all = load();
    const devId = _devId();
    // one review per device per template; update if exists
    const existing = all.find(r => r.templateId === opts.templateId && r.authorId === devId);
    if (existing) {
      existing.stars = stars;
      existing.title = opts.title || existing.title || '';
      existing.body = opts.body || existing.body || '';
      existing.updated = nowIso();
      save(all);
      tryRemote('update', existing);
      return existing;
    }
    const r = {
      id: uid(),
      templateId: opts.templateId,
      stars: stars,
      title: opts.title || '',
      body: opts.body || '',
      authorId: devId,
      authorName: opts.authorName || (window.Workspaces ? '' : 'Anonymous'),
      ts: nowIso(),
      helpful: 0,
      flagged: false
    };
    all.unshift(r);
    save(all);
    tryRemote('create', r);
    return r;
  }

  function update(reviewId, patch) {
    const all = load();
    const idx = all.findIndex(r => r.id === reviewId);
    if (idx === -1) return null;
    all[idx] = Object.assign({}, all[idx], patch, { updated: nowIso() });
    save(all);
    tryRemote('update', all[idx]);
    return all[idx];
  }

  function remove(reviewId) {
    const all = load().filter(r => r.id !== reviewId);
    save(all);
    tryRemote('delete', { id: reviewId });
    return true;
  }

  function helpful(reviewId) {
    const helpful = loadHelpful();
    const devId = _devId();
    helpful[reviewId] = helpful[reviewId] || {};
    if (helpful[reviewId][devId]) {
      // toggle off
      delete helpful[reviewId][devId];
      const all = load();
      const idx = all.findIndex(r => r.id === reviewId);
      if (idx !== -1) {
        all[idx].helpful = Math.max(0, (all[idx].helpful || 0) - 1);
        save(all);
        tryRemote('update', all[idx]);
        saveHelpful(helpful);
        return all[idx];
      }
    } else {
      helpful[reviewId][devId] = true;
      const all = load();
      const idx = all.findIndex(r => r.id === reviewId);
      if (idx !== -1) {
        all[idx].helpful = (all[idx].helpful || 0) + 1;
        save(all);
        tryRemote('update', all[idx]);
        saveHelpful(helpful);
        return all[idx];
      }
    }
    return null;
  }

  function hasHelped(reviewId) {
    const helpful = loadHelpful();
    return !!(helpful[reviewId] && helpful[reviewId][_devId()]);
  }

  function stats(templateId) {
    const reviews = list(templateId);
    const out = { count: reviews.length, avg: 0, distribution: [0, 0, 0, 0, 0] };
    if (!reviews.length) return out;
    let total = 0;
    reviews.forEach(r => {
      total += r.stars;
      const idx = Math.max(0, Math.min(4, r.stars - 1));
      out.distribution[idx]++;
    });
    out.avg = +(total / reviews.length).toFixed(2);
    return out;
  }

  function mine(templateId) {
    return list(templateId).find(r => r.authorId === _devId()) || null;
  }

  function recent(limit) {
    limit = limit || 10;
    return load().slice(0, limit);
  }

  function top(limit) {
    limit = limit || 10;
    // aggregate avg per template, return templates sorted
    const all = load();
    const map = {};
    all.forEach(r => {
      if (!map[r.templateId]) map[r.templateId] = { templateId: r.templateId, total: 0, count: 0, sum: 0 };
      map[r.templateId].count++;
      map[r.templateId].sum += r.stars;
    });
    return Object.values(map)
      .map(x => ({ templateId: x.templateId, avg: +(x.sum / x.count).toFixed(2), count: x.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, limit);
  }

  function search(q) {
    if (!q) return [];
    const needle = String(q).toLowerCase();
    return load().filter(r =>
      (r.title && r.title.toLowerCase().indexOf(needle) !== -1) ||
      (r.body && r.body.toLowerCase().indexOf(needle) !== -1) ||
      (r.templateId && r.templateId.toLowerCase().indexOf(needle) !== -1)
    );
  }

  function tryRemote(op, review) {
    if (!SUPABASE_URL || !window.Backend || !window.Backend._supa) return;
    try {
      const t = 'template_reviews';
      if (op === 'delete') {
        window.Backend._supa('/' + t + '?id=eq.' + encodeURIComponent(review.id), { method: 'DELETE' }).catch(()=>{});
      } else {
        window.Backend._supa('/' + t, { method: 'POST', body: review, headers: { 'Prefer': 'resolution=merge-duplicates' } }).catch(()=>{});
      }
    } catch (_) {}
  }

  const api = {
    list, get, add, update, remove, helpful, hasHelped,
    stats, mine, recent, top, search
  };
  window.TemplateRatings = api;
  if (window.Engine) window.Engine.TemplateRatings = api;
})();
