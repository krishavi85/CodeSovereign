/* =====================================================================
   app.ai.extras.js  —  Settings UI for the AI stack:
     - Local AI card: hardware summary, discovered runtimes/models, a
       host-aware recommendation, one-click "use this model".
     - Cost Sovereignty card: mandatory vs optional cost + zero-cost paths.
   Injects into the Settings screen; no-ops if the engines aren't loaded.
   ===================================================================== */
(function () {
  'use strict';
  function E() { return window.Engine || {}; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  var state = { hw: null, disc: null, rec: null, cost: null, busy: false, log: '' };

  /* ---------- Local AI ---------- */
  function localAiCardHtml() {
    var AR = E().AIRouter, HW = E().Hardware, MM = E().ModelManager;
    if (!AR || !HW || !MM) {
      return '<div class="card" style="padding:20px;margin-bottom:18px"><h3 class="cs-h3" style="margin-bottom:14px">Local AI</h3>' +
        '<div style="color:var(--muted);font-size:13px">AI router engines not loaded.</div></div>';
    }
    var hw = state.hw, disc = state.disc, rec = state.rec;
    var rows = '';
    if (disc && disc.runtimes && disc.runtimes.length) {
      rows = disc.runtimes.map(function (rt) {
        return '<div style="padding:10px 12px;border:1px solid var(--good);border-radius:8px;background:rgba(52,211,153,.05);margin-bottom:6px">' +
          '<div style="display:flex;align-items:center;gap:8px"><span style="font-weight:600">' + esc(rt.label) + '</span>' +
          '<span style="font-size:10.5px;color:var(--good)">running · ' + rt.base + '</span></div>' +
          '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">' +
          (rt.models && rt.models.length ? rt.models.slice(0, 8).map(function (m) {
            return '<button class="cs-aimodel" data-rt="' + esc(rt.id) + '" data-model="' + esc(m.id) + '" style="margin:2px 4px 2px 0;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2);color:#e6e9f2;font:11px JetBrains Mono,monospace;cursor:pointer">' + esc(m.id) + '</button>';
          }).join('') : '<span style="font-size:11px">no models loaded — <code>ollama pull …</code></span>') +
          '</div></div>';
      }).join('');
    } else if (disc) {
      rows = '<div style="font-size:12.5px;color:var(--muted)">No local runtime detected on the usual ports (Ollama 11434, LM Studio 1234, vLLM 8000, llama.cpp 8080, Jan 1337). Start one and re-scan.</div>';
    } else {
      rows = '<div style="font-size:12.5px;color:var(--muted)">Not scanned yet.</div>';
    }

    var recHtml = '';
    if (rec) {
      if (rec.fits && rec.primary) {
        recHtml = '<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--accent);border-radius:8px;background:rgba(120,160,255,.06);font-size:12.5px">' +
          '<b>Recommended for this host:</b> <code>' + esc(rec.primary) + '</code> @ ' + esc(rec.quant) +
          ' &mdash; ' + esc(rec.reason) +
          '<div style="margin-top:6px"><button id="aiPullRec" class="btn ghost" style="padding:4px 10px;font-size:11.5px">ollama pull ' + esc(rec.primary) + '</button>' +
          (rec.fallbacks && rec.fallbacks.length ? '<span style="margin-left:8px;color:var(--muted)">also fits: ' + rec.fallbacks.map(function (f) { return esc(f.id); }).join(', ') + '</span>' : '') +
          '</div></div>';
      } else {
        recHtml = '<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--warn,#f59e0b);border-radius:8px;font-size:12.5px">' +
          esc(rec.reason) + (rec.cloud ? ' &mdash; will use cloud provider <b>' + esc(rec.cloud.providerId) + '</b>.' : '') + '</div>';
      }
    }

    return '<div class="card" style="padding:20px;margin-bottom:18px"><h3 class="cs-h3" style="margin-bottom:14px">Local AI</h3>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">' + (hw ? esc(HW.summary(hw)) : 'probing host…') + '</div>' +
      rows + recHtml +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="aiScanBtn" class="btn primary" style="padding:6px 12px;font-size:12px">' + (state.busy ? 'Scanning…' : 'Scan &amp; recommend') + '</button>' +
      '<button id="aiCloudBtn" class="btn ghost" style="padding:6px 12px;font-size:12px">Fall back to cloud provider</button>' +
      '</div>' +
      (state.log ? '<pre style="margin-top:10px;font:11px JetBrains Mono,monospace;color:var(--muted);white-space:pre-wrap;max-height:120px;overflow:auto">' + esc(state.log) + '</pre>' : '') +
      '</div>';
  }

  function bindLocalAi(host) {
    var AR = E().AIRouter;
    var scan = host.querySelector('#aiScanBtn');
    if (scan) scan.onclick = function () {
      state.busy = true; rerender();
      Promise.all([E().Hardware.probe(), AR.discover()]).then(function (r) {
        state.hw = r[0]; state.disc = r[1];
        state.rec = AR.recommend(state.hw, { task: 'code' });
        state.busy = false; rerender();
        window.toast && window.toast('Scanned: ' + (state.disc.count || 0) + ' local runtime(s)', '#22d3ee');
      });
    };
    host.querySelectorAll('.cs-aimodel').forEach(function (b) {
      b.onclick = function () {
        var rt = (state.disc.runtimes || []).find(function (x) { return x.id === b.dataset.rt; });
        if (!rt) return;
        var res = AR.apply({ runtime: rt, model: b.dataset.model });
        window.toast && window.toast(res.ok ? ('Agent now uses ' + res.using + ' via ' + res.via) : ('Failed: ' + res.error), res.ok ? '#34d399' : '#ef4444');
        try { if (window.renderAll) window.renderAll(); } catch (_) {}
      };
    });
    var pull = host.querySelector('#aiPullRec');
    if (pull) pull.onclick = function () {
      if (!state.rec || !state.rec.primary) return;
      pull.disabled = true; state.log = '$ ollama pull ' + state.rec.primary + '\n'; rerender();
      E().ModelManager.pull(state.rec.primary, function (l) { state.log += l; }).then(function (r) {
        state.log += '\n[exit ' + r.code + ']\n' + (r.output || '');
        rerender();
        window.toast && window.toast(r.ok ? 'Model pulled' : 'Pull failed (is Ollama installed?)', r.ok ? '#34d399' : '#ef4444');
      });
    };
    var cloud = host.querySelector('#aiCloudBtn');
    if (cloud) cloud.onclick = function () {
      window.S && (window.S.screen = 'settings');
      var c = document.querySelector('#llmSettingsHost');
      if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.toast && window.toast('Set a cloud provider + key in the AI Provider card above', '#f59e0b');
    };
  }

  /* ---------- Cost Sovereignty ---------- */
  function costCardHtml() {
    var C = E().Cost;
    if (!C) return '';
    var r = state.cost;
    var body;
    if (!r) {
      body = '<div style="font-size:12.5px;color:var(--muted)">Not analysed yet.</div>';
    } else {
      var t = r.totals || {};
      body =
        '<div style="font-size:12.5px;margin-bottom:8px">' +
        '<b style="color:' + (r.zeroCostPathAvailable ? 'var(--good)' : 'var(--warn,#f59e0b)') + '">' +
        (r.zeroCostPathAvailable ? 'A fully zero-cost / self-hosted path exists.' : (t.mandatoryPaid + ' unavoidable paid dependenc' + (t.mandatoryPaid === 1 ? 'y' : 'ies') + '.')) + '</b></div>' +
        (r.mandatoryCost && r.mandatoryCost.length ? '<div style="margin-bottom:8px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">Mandatory cost</div>' +
          r.mandatoryCost.map(function (m) { return '<div style="font-size:12.5px">• <code>' + esc(m.name) + '</code> (' + esc(m.category) + ') — ' + esc(m.note) + '</div>'; }).join('') + '</div>' : '') +
        (r.optionalCost && r.optionalCost.length ? '<div style="margin-bottom:8px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">Optional cost — free alternative exists</div>' +
          r.optionalCost.map(function (m) {
            return '<div style="font-size:12.5px;margin-top:3px">• <code>' + esc(m.name) + '</code> (' + esc(m.category) + ', ' + esc(m.tier) + ')<div style="color:var(--muted);margin-left:12px">zero-cost: ' + esc((m.zeroCostAlternative || []).join('; ') || 'drop it') + '</div></div>';
          }).join('') + '</div>' : '') +
        (r.free && r.free.length ? '<div style="font-size:11.5px;color:var(--muted)">Already free: ' + r.free.map(esc).join(', ') + '</div>' : '');
    }
    return '<div class="card" style="padding:20px;margin-bottom:18px"><h3 class="cs-h3" style="margin-bottom:14px">Cost Sovereignty</h3>' +
      body +
      '<div style="margin-top:12px"><button id="costRunBtn" class="btn primary" style="padding:6px 12px;font-size:12px">Analyse dependencies</button></div>' +
      '</div>';
  }
  function bindCost(host) {
    var b = host.querySelector('#costRunBtn');
    if (b) b.onclick = function () {
      state.cost = E().Cost.analyze({});
      rerender();
      window.toast && window.toast('Cost analysis written to .sovereign/cost-analysis.json', '#22d3ee');
    };
  }

  /* ---------- injection ---------- */
  function fullHtml() {
    return '<div id="aiExtrasHost">' + localAiCardHtml() + costCardHtml() + '</div>';
  }
  function rerender() {
    var host = document.getElementById('aiExtrasHost');
    if (!host) return;
    host.innerHTML = localAiCardHtml() + costCardHtml();
    bindLocalAi(host); bindCost(host);
  }

  function install() {
    if (!window.renderSettings) { setTimeout(install, 40); return; }
    if (renderSettings.__aiInjected) return;
    var original = window.renderSettings;
    window.renderSettings = function () {
      var out = original.apply(this, arguments);
      var anchor = out.match(/<div class="card"[^>]*>\s*<h3[^>]*>[\s\S]*?Integrations<\/h3>/);
      if (anchor) return out.replace(anchor[0], fullHtml() + '\n      ' + anchor[0]);
      return out + fullHtml();
    };
    renderSettings.__aiInjected = true;

    if (window.renderAll && !renderAll.__aiHooked) {
      var ra = window.renderAll;
      window.renderAll = function () {
        var r = ra.apply(this, arguments);
        try {
          if (window.S && window.S.screen === 'settings') {
            var host = document.getElementById('aiExtrasHost');
            if (host && !host.__aiBound) { host.__aiBound = true; rerender(); }
          }
        } catch (_) { /* best effort */ }
        return r;
      };
      renderAll.__aiHooked = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
