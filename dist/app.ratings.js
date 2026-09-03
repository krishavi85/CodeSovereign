/* ============================================================
   app.ratings.js — Template Ratings & Reviews UI
   ------------------------------------------------------------
   Embedded in the Marketplace. When a template card is clicked,
   a modal shows:
     - Star rating widget (1-5)
     - Title + body fields for new review
     - List of existing reviews with helpful-vote button
     - Distribution histogram
     - Average + total counts

   Also provides a top-level "ratings" screen at S.screen === 'ratings'
   that shows top-rated templates, recent reviews, and search.

   Exposes:
     window.RatingsUI = {
       render(),                 // screen renderer
       renderCard(templateId),   // returns inner HTML for modal
       bindModal(templateId),    // attach handlers after modal mount
       mount()                   // global click delegation
     }
   ============================================================ */
(function() {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = (now - d) / 1000;
      if (diff < 60) return Math.floor(diff) + 's ago';
      if (diff < 3600) return Math.floor(diff/60) + 'm ago';
      if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
      if (diff < 86400*7) return Math.floor(diff/86400) + 'd ago';
      return d.toLocaleDateString();
    } catch (_) { return iso; }
  }
  function stars(n, size) {
    size = size || 14;
    n = Math.max(0, Math.min(5, n|0));
    let out = '';
    for (let i = 1; i <= 5; i++) {
      const fill = i <= n ? '#fbbf24' : 'rgba(255,255,255,.1)';
      out += '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + fill + '" stroke="#fbbf24" stroke-width="1.2"><path d="M12 2l3 7 7 .8-5.3 4.8 1.6 7L12 17.8 5.7 21.6l1.6-7L2 9.8 9 9z"/></svg>';
    }
    return '<span style="display:inline-flex;gap:2px;vertical-align:middle">' + out + '</span>';
  }
  function starPicker(current, target) {
    let out = '<div data-starpicker="' + esc(target) + '" style="display:inline-flex;gap:4px;cursor:pointer">';
    for (let i = 1; i <= 5; i++) {
      const fill = i <= current ? '#fbbf24' : 'rgba(255,255,255,.12)';
      out += '<span data-setstar="' + target + '" data-val="' + i + '" style="display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;cursor:pointer;transition:transform .15s" onmouseover="this.style.transform=\'scale(1.15)\'" onmouseout="this.style.transform=\'scale(1)\'"><svg width="22" height="22" viewBox="0 0 24 24" fill="' + fill + '" stroke="#fbbf24" stroke-width="1.2"><path d="M12 2l3 7 7 .8-5.3 4.8 1.6 7L12 17.8 5.7 21.6l1.6-7L2 9.8 9 9z"/></svg></span>';
    }
    return out + '</div>';
  }
  function histogram(dist) {
    const total = dist.reduce((a, b) => a + b, 0) || 1;
    let out = '<div style="display:flex;flex-direction:column;gap:4px">';
    for (let i = 4; i >= 0; i--) {
      const pct = Math.round((dist[i] / total) * 100);
      out += '<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#c7cddb">';
      out += '<span style="min-width:32px;text-align:right">' + (i+1) + '★</span>';
      out += '<div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden">';
      out += '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#fbbf24,#f59e0b);border-radius:4px"></div>';
      out += '</div>';
      out += '<span style="min-width:30px;text-align:right;color:#8b93a7">' + dist[i] + '</span>';
      out += '</div>';
    }
    return out + '</div>';
  }

  function render() {
    if (!window.TemplateRatings) return '<div style="padding:24px;color:#8b93a7">Ratings engine not loaded.</div>';
    const TR = window.TemplateRatings;
    const top = TR.top(10);
    const recent = TR.recent(15);

    function reviewItem(r) {
      return `
        <div style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px">
            ${stars(r.stars, 13)}
            <span style="font-size:12px;font-weight:600;color:#e6e9f2">${esc(r.title || 'Review')}</span>
            <span style="font-size:10.5px;color:#8b93a7;margin-left:auto">${fmtTime(r.ts)}</span>
          </div>
          <div style="font-size:12.5px;color:#c7cddb;line-height:1.5;margin-bottom:5px">${esc(r.body || '')}</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:10.5px;color:#8b93a7">
            <span>Template: <code style="color:#22d3ee">${esc(r.templateId)}</code></span>
            <button data-rating-helpful="${esc(r.id)}" class="cs-btn cs-btn-ghost" style="font-size:10.5px;padding:3px 7px">👍 ${r.helpful||0}</button>
          </div>
        </div>
      `;
    }

    return `
      <div style="padding:20px;max-width:1180px;margin:0 auto">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
          <h2 style="margin:0;font-size:22px;font-weight:700;color:#e6e9f2">★ Ratings & Reviews</h2>
          <input id="rv-search" type="text" placeholder="Search reviews…" style="flex:1;max-width:340px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:8px 12px;font-size:13px;color:#e6e9f2">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
          <div class="card" style="padding:18px">
            <h3 style="margin:0 0 12px;font-size:14px;color:#e6e9f2">🏆 Top-rated templates</h3>
            ${top.length === 0 ? '<div style="color:#8b93a7;font-size:13px;padding:14px 0">No ratings yet. Be the first to review a template from the Marketplace.</div>' :
              top.map(t => `
                <div style="display:flex;align-items:center;gap:11px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">
                  <div style="font-size:16px;font-weight:700;color:#fbbf24;min-width:34px">${t.avg.toFixed(1)}</div>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600;color:#e6e9f2">${esc(t.templateId)}</div>
                    <div style="font-size:11px;color:#8b93a7">${t.count} review${t.count===1?'':'s'}</div>
                  </div>
                  <button data-rv-goto="${esc(t.templateId)}" class="cs-btn cs-btn-ghost" style="font-size:11px;padding:4px 9px">View</button>
                </div>
              `).join('')
            }
          </div>

          <div class="card" style="padding:18px">
            <h3 style="margin:0 0 12px;font-size:14px;color:#e6e9f2">🕒 Recent reviews</h3>
            <div id="rv-recent" style="max-height:520px;overflow:auto">${recent.length === 0 ? '<div style="color:#8b93a7;font-size:13px;padding:14px 0">No reviews yet.</div>' : recent.map(reviewItem).join('')}</div>
          </div>
        </div>
      </div>
    `;
  }

  // ------- card / modal panel injected into the marketplace template preview -------
  function renderCard(templateId) {
    if (!window.TemplateRatings) return '';
    const TR = window.TemplateRatings;
    const stats = TR.stats(templateId);
    const reviews = TR.list(templateId);
    const mine = TR.mine(templateId);

    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
          <div>
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px">
              <span style="font-size:24px;font-weight:700;color:#fbbf24">${stats.avg.toFixed(1)}</span>
              <div>
                ${stars(stats.avg, 14)}
                <div style="font-size:11px;color:#8b93a7;margin-top:2px">${stats.count} review${stats.count===1?'':'s'}</div>
              </div>
            </div>
            ${histogram(stats.distribution)}
          </div>
          <div>
            <h4 style="margin:0 0 7px;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">Your review</h4>
            <div id="rv-mine">
              <div style="font-size:11.5px;color:#8b93a7;margin-bottom:4px">Rating</div>
              <div id="rv-picker-wrap">${starPicker(mine ? mine.stars : 0, templateId)}</div>
              <input id="rv-title-${esc(templateId)}" type="text" placeholder="Review title (optional)" value="${esc(mine?mine.title:'')}" style="width:100%;margin-top:7px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12.5px;color:#e6e9f2">
              <textarea id="rv-body-${esc(templateId)}" placeholder="Share what you liked or what could be better…" style="width:100%;margin-top:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12.5px;color:#e6e9f2;resize:vertical;min-height:60px">${esc(mine?mine.body:'')}</textarea>
              <div style="display:flex;gap:6px;margin-top:6px">
                <button data-rv-submit="${esc(templateId)}" class="cs-btn cs-btn-primary" style="font-size:12px">${mine ? 'Update' : 'Submit'} review</button>
                ${mine ? '<button data-rv-delete="' + esc(mine.id) + '" class="cs-btn cs-btn-ghost" style="font-size:12px;color:#ef4444">Delete</button>' : ''}
              </div>
            </div>
          </div>
        </div>

        <h4 style="margin:18px 0 8px;font-size:12px;color:#8b93a7;text-transform:uppercase;letter-spacing:1.2px">All reviews</h4>
        <div id="rv-list-${esc(templateId)}" style="max-height:260px;overflow:auto;border-top:1px solid rgba(255,255,255,.05)">
          ${reviews.length === 0 ? '<div style="color:#8b93a7;font-size:12.5px;padding:14px 0">No reviews yet.</div>' :
            reviews.map(r => `
              <div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04)">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  ${stars(r.stars, 12)}
                  <span style="font-size:12px;font-weight:600;color:#e6e9f2">${esc(r.title||'Review')}</span>
                  <span style="font-size:10.5px;color:#8b93a7;margin-left:auto">${fmtTime(r.ts)}</span>
                </div>
                <div style="font-size:12px;color:#c7cddb;line-height:1.5;margin-bottom:4px">${esc(r.body||'')}</div>
                <div style="display:flex;align-items:center;gap:7px">
                  <button data-rv-helpful="${esc(r.id)}" class="cs-btn cs-btn-ghost" style="font-size:10.5px;padding:3px 8px">👍 ${r.helpful||0}</button>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  let _pickedStars = {};
  function bindModal(templateId) {
    // nothing special; click delegation handles it
    _pickedStars[templateId] = _pickedStars[templateId] || 0;
  }

  function mount() {
    if (window._rvMounted) return;
    window._rvMounted = true;

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-setstar],[data-rv-submit],[data-rv-delete],[data-rv-helpful],[data-rv-goto],[data-rating-helpful]');
      if (!t) return;
      const TR = window.TemplateRatings;
      if (!TR) return;

      const setStar = t.getAttribute('data-setstar');
      if (setStar) {
        const val = parseInt(t.getAttribute('data-val'), 10);
        const wrap = t.closest('[data-starpicker]');
        if (!wrap) return;
        _pickedStars[setStar] = val;
        // re-render picker inline
        wrap.outerHTML = starPicker(val, setStar);
        return;
      }
      const submit = t.getAttribute('data-rv-submit');
      if (submit) {
        const stars = _pickedStars[submit] || 0;
        if (!stars) { alert('Please pick a star rating (1-5).'); return; }
        const titleEl = document.getElementById('rv-title-' + submit);
        const bodyEl = document.getElementById('rv-body-' + submit);
        TR.add({
          templateId: submit,
          stars: stars,
          title: titleEl ? titleEl.value.trim() : '',
          body: bodyEl ? bodyEl.value.trim() : ''
        });
        rerender();
        return;
      }
      const del = t.getAttribute('data-rv-delete');
      if (del) {
        if (!confirm('Delete your review?')) return;
        TR.remove(del);
        rerender();
        return;
      }
      const helpful = t.getAttribute('data-rv-helpful') || t.getAttribute('data-rating-helpful');
      if (helpful) {
        TR.helpful(helpful);
        rerender();
        return;
      }
      const goto = t.getAttribute('data-rv-goto');
      if (goto) {
        if (window.S) window.S.screen = 'marketplace';
        rerender();
        // optionally open the template — left to marketplace UI
        return;
      }
    });

    // search
    document.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'rv-search') {
        const q = e.target.value;
        const list = document.getElementById('rv-recent');
        if (!list) return;
        const results = q ? TR.search(q) : TR.recent(15);
        list.innerHTML = results.length === 0
          ? '<div style="color:#8b93a7;font-size:13px;padding:14px 0">No results.</div>'
          : results.map(r => `
            <div style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05)">
              <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px">
                ${stars(r.stars, 13)}
                <span style="font-size:12px;font-weight:600;color:#e6e9f2">${esc(r.title||'Review')}</span>
                <span style="font-size:10.5px;color:#8b93a7;margin-left:auto">${fmtTime(r.ts)}</span>
              </div>
              <div style="font-size:12.5px;color:#c7cddb;line-height:1.5;margin-bottom:5px">${esc(r.body||'')}</div>
              <div style="display:flex;align-items:center;gap:9px;font-size:10.5px;color:#8b93a7">
                <span>Template: <code style="color:#22d3ee">${esc(r.templateId)}</code></span>
                <button data-rating-helpful="${esc(r.id)}" class="cs-btn cs-btn-ghost" style="font-size:10.5px;padding:3px 7px">👍 ${r.helpful||0}</button>
              </div>
            </div>
          `).join('');
      }
    });
  }

  function rerender() {
    if (window._csRender) window._csRender();
    else if (window.renderAll) window.renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.RatingsUI = { render, renderCard, bindModal, mount };
})();
