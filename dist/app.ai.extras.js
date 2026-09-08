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
  function fitBadge(run) {
    if (!run) return '';
    var c = run.ok ? (run.where === 'gpu' ? 'var(--good)' : '#22d3ee') : 'var(--muted)';
    var txt = run.ok ? (run.where === 'gpu' ? 'GPU ' : 'CPU ') + '~' + run.estGB + ' GB' : "won't fit";
    return '<span style="font-size:10px;color:' + c + ';border:1px solid ' + c + ';border-radius:5px;padding:1px 5px;margin-left:6px">' + txt + '</span>';
  }

  function localAiCardHtml() {
    var AR = E().AIRouter, HW = E().Hardware, MM = E().ModelManager, AI = E().AI;
    if (!AR || !HW || !MM) {
      return '<div class="card" style="padding:20px;margin-bottom:18px"><h3 class="cs-h3" style="margin-bottom:14px">Local AI</h3>' +
        '<div style="color:var(--muted);font-size:13px">AI router engines not loaded.</div></div>';
    }
    var hw = state.hw, disc = state.disc, rec = state.rec;
    var st = AI ? AI.status() : { connected: false };

    // active connection banner
    var banner = '<div style="padding:9px 12px;border-radius:8px;margin-bottom:12px;font-size:12.5px;border:1px solid ' +
      (st.connected ? 'var(--good)' : 'var(--line)') + ';background:' + (st.connected ? 'rgba(52,211,153,.06)' : 'transparent') + '">' +
      (st.connected
        ? '<b style="color:var(--good)">AI connected</b> — ' + esc(st.source) + (st.model ? ' · <code>' + esc(st.model) + '</code>' : '') + (st.free ? ' · <span style="color:var(--good)">free</span>' : '')
        : '<b>Not connected</b> — the app uses its built-in deterministic generator. Connect one below.') + '</div>';

    // OmniRoute — the unlimited-free option
    var omni = '<div style="padding:10px 12px;border:1px solid #7c5cff;border-radius:8px;background:rgba(124,92,255,.06);margin-bottom:8px">' +
      '<div style="font-weight:600">OmniRoute — free AI gateway <span style="font-size:10px;color:var(--muted);font-weight:400">no key · ~150 free provider tiers · MIT</span></div>' +
      '<div style="font-size:11.5px;color:var(--muted);margin:4px 0 8px">Runs <code>npx omniroute serve</code> locally and routes <code>model:"auto"</code> across free tiers with automatic fallback.</div>' +
      '<button id="aiOmniBtn" class="btn primary" style="padding:5px 12px;font-size:12px">' + (state.omniBusy ? 'Starting…' : 'Enable free AI (OmniRoute)') + '</button>' +
      (state.omniLog ? '<pre style="margin-top:8px;font:10.5px JetBrains Mono,monospace;color:var(--muted);white-space:pre-wrap;max-height:100px;overflow:auto">' + esc(state.omniLog) + '</pre>' : '') +
      '</div>';

    // discovered running runtimes
    var rows = '';
    if (disc && disc.runtimes && disc.runtimes.length) {
      rows = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:6px 0 4px">Running locally</div>' +
        disc.runtimes.map(function (rt) {
          return '<div style="padding:9px 12px;border:1px solid var(--good);border-radius:8px;background:rgba(52,211,153,.05);margin-bottom:6px">' +
            '<span style="font-weight:600">' + esc(rt.label) + '</span> <span style="font-size:10.5px;color:var(--good)">' + rt.base + '</span>' +
            (rt.free ? ' <span style="font-size:10px;color:var(--good)">free</span>' : '') +
            '<div style="margin-top:4px">' +
            (rt.models && rt.models.length ? rt.models.slice(0, 10).map(function (m) {
              return '<button class="cs-aimodel" data-rt="' + esc(rt.id) + '" data-model="' + esc(m.id) + '" style="margin:2px 4px 2px 0;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg-2);color:#e6e9f2;font:11px JetBrains Mono,monospace;cursor:pointer">use ' + esc(m.id) + '</button>';
            }).join('') : '<span style="font-size:11px;color:var(--muted)">no model loaded</span>') +
            '</div></div>';
        }).join('');
    } else if (disc) {
      rows = '<div style="font-size:12px;color:var(--muted);margin:6px 0">No local runtime running (Ollama 11434, LM Studio 1234, vLLM 8000, llama.cpp 8080, Jan 1337, OmniRoute 20128).</div>';
    }

    // model catalogue — visible even with nothing running
    var cat = '';
    if (hw) {
      var installedIds = {};
      (disc && disc.runtimes || []).forEach(function (rt) { (rt.models || []).forEach(function (m) { installedIds[String(m.id).split(':')[0]] = rt.id; }); });
      cat = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:12px 0 4px">Open models for this host (' + esc(HW.summary(hw)) + ')</div>' +
        '<div style="max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px">' +
        MM.CATALOG.map(function (m) {
          var run = MM.canRun(m, hw);
          var have = installedIds[m.id.split(':')[0]];
          return '<div style="display:flex;align-items:center;gap:6px;padding:3px 4px;font-size:12px">' +
            '<code style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(m.id) + '</code>' +
            (m.coding ? '<span style="font-size:9.5px;color:#22d3ee">code</span>' : '') + fitBadge(run) +
            (have ? '<button class="cs-aimodel" data-rt="' + esc(have) + '" data-model="' + esc(m.id) + '" style="padding:2px 8px;font-size:10.5px;border:1px solid var(--good);border-radius:5px;background:transparent;color:var(--good);cursor:pointer">use</button>'
              : '<button class="cs-aipull" data-model="' + esc(m.id) + '" ' + (run.ok ? '' : 'disabled') + ' style="padding:2px 8px;font-size:10.5px;border:1px solid var(--line);border-radius:5px;background:var(--bg-2);color:#e6e9f2;cursor:pointer;opacity:' + (run.ok ? '1' : '.4') + '">pull</button>') +
            '</div>';
        }).join('') + '</div>';
    }

    var recHtml = '';
    if (rec && rec.fits && rec.primary) {
      recHtml = '<div style="margin-top:10px;padding:9px 12px;border:1px solid var(--accent);border-radius:8px;background:rgba(120,160,255,.06);font-size:12px">' +
        '<b>Best for this host:</b> <code>' + esc(rec.primary) + '</code> @ ' + esc(rec.quant) + ' — ' + esc(rec.reason) +
        ' <button id="aiPullRec" class="btn ghost" style="padding:3px 9px;font-size:11px;margin-left:6px">pull it</button></div>';
    } else if (rec && !rec.fits) {
      recHtml = '<div style="margin-top:10px;padding:9px 12px;border:1px solid var(--warn,#f59e0b);border-radius:8px;font-size:12px">' + esc(rec.reason) + ' — use OmniRoute or a cloud key.</div>';
    }

    // manual endpoint
    var manual = '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Manual endpoint (any OpenAI-compatible URL)</summary>' +
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' +
      '<input id="aiManualUrl" placeholder="http://localhost:1234" value="' + esc(state.manualUrl || '') + '" style="flex:1;min-width:160px;padding:6px 9px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:7px;font:12px JetBrains Mono,monospace"/>' +
      '<input id="aiManualModel" placeholder="model id" value="' + esc(state.manualModel || '') + '" style="width:130px;padding:6px 9px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:7px;font:12px JetBrains Mono,monospace"/>' +
      '<input id="aiManualKey" type="password" placeholder="key (optional)" style="width:110px;padding:6px 9px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:7px;font:12px Inter"/>' +
      '<button id="aiManualBtn" class="btn ghost" style="padding:6px 12px;font-size:12px">Connect</button></div></details>';

    return '<div class="card" style="padding:20px;margin-bottom:18px"><h3 class="cs-h3" style="margin-bottom:14px">Local AI</h3>' +
      banner + omni + rows + cat + recHtml + manual +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="aiScanBtn" class="btn primary" style="padding:6px 12px;font-size:12px">' + (state.busy ? 'Scanning…' : 'Scan &amp; recommend') + '</button>' +
      '<button id="aiAutoBtn" class="btn ghost" style="padding:6px 12px;font-size:12px">Auto-connect</button>' +
      '</div>' +
      (state.log ? '<pre style="margin-top:10px;font:11px JetBrains Mono,monospace;color:var(--muted);white-space:pre-wrap;max-height:120px;overflow:auto">' + esc(state.log) + '</pre>' : '') +
      wiringHtml() +
      '</div>';
  }

  function wiringHtml() {
    var AI = E().AI;
    if (!AI || !AI.wiring) return '';
    var w = AI.wiring();
    return '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">AI wiring — ' + w.wiredCount + '/' + w.total + ' consumers connected</summary>' +
      '<div style="margin-top:6px">' + w.consumers.map(function (c) {
        return '<div style="font-size:11.5px;padding:3px 0;display:flex;gap:8px">' +
          '<span style="color:' + (c.wired ? 'var(--good)' : 'var(--muted)') + '">' + (c.wired ? '&#x2713;' : '&#x25CB;') + '</span>' +
          '<span style="flex:1"><b>' + esc(c.label) + '</b><br><span style="color:var(--muted)">' + esc(c.how) + '</span></span></div>';
      }).join('') + '</div></details>';
  }

  function scan() {
    state.busy = true; rerender();
    return Promise.all([E().Hardware.probe(), E().AIRouter.discover()]).then(function (r) {
      state.hw = r[0]; state.disc = r[1];
      state.rec = E().AIRouter.recommend(state.hw, { task: 'code' });
      state.busy = false; rerender();
    });
  }

  function bindLocalAi(host) {
    var AR = E().AIRouter, AI = E().AI;

    var sb = host.querySelector('#aiScanBtn');
    if (sb) sb.onclick = function () { scan().then(function () { window.toast && window.toast('Scanned: ' + (state.disc.count || 0) + ' runtime(s)', '#22d3ee'); }); };

    var ob = host.querySelector('#aiOmniBtn');
    if (ob) ob.onclick = function () {
      state.omniBusy = true; state.omniLog = 'starting OmniRoute…\n'; rerender();
      AR.ensureOmniRoute(function (s) { state.omniLog += s + '\n'; rerender(); }).then(function (r) {
        state.omniBusy = false;
        state.omniLog += (r && r.ok) ? ('\nready on ' + r.base + ' — wired as `auto` (free)') : ('\nfailed: ' + ((r && r.error) || 'unknown'));
        return scan();
      }).then(function () {
        window.toast && window.toast(AI.ready() ? 'Free AI connected via OmniRoute' : 'OmniRoute not reachable', AI.ready() ? '#34d399' : '#ef4444');
        try { window.renderAll && window.renderAll(); } catch (_) {}
      });
    };

    var auto = host.querySelector('#aiAutoBtn');
    if (auto) auto.onclick = function () {
      auto.disabled = true; state.log = 'auto-connecting…\n'; rerender();
      AI.ensure({ onStatus: function (s) { state.log += s + '\n'; rerender(); } }).then(function (s) {
        state.log += s.connected ? ('connected: ' + s.source) : 'no provider available';
        rerender();
        window.toast && window.toast(s.connected ? ('AI connected — ' + s.source) : 'Could not auto-connect', s.connected ? '#34d399' : '#f59e0b');
        try { window.renderAll && window.renderAll(); } catch (_) {}
      });
    };

    host.querySelectorAll('.cs-aimodel').forEach(function (b) {
      b.onclick = function () {
        var rt = (state.disc && state.disc.runtimes || []).find(function (x) { return x.id === b.dataset.rt; });
        if (!rt) { window.toast && window.toast('That runtime is not running — start it or hit Scan', '#f59e0b'); return; }
        var res = AR.apply({ runtime: rt, model: b.dataset.model });
        window.toast && window.toast(res.ok ? ('Connected — ' + res.using + ' via ' + res.via + (res.free ? ' (free)' : '')) : ('Failed: ' + res.error), res.ok ? '#34d399' : '#ef4444');
        rerender(); try { window.renderAll && window.renderAll(); } catch (_) {}
      };
    });

    host.querySelectorAll('.cs-aipull').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.model;
        b.disabled = true; state.log = '$ ollama pull ' + id + '\n'; rerender();
        E().ModelManager.pull(id, function (l) { state.log += l; }).then(function (r) {
          state.log += '\n[exit ' + r.code + ']\n' + (r.output || '');
          window.toast && window.toast(r.ok ? ('Pulled ' + id) : 'Pull failed — is Ollama installed & running?', r.ok ? '#34d399' : '#ef4444');
          return scan();
        });
      };
    });

    var pr = host.querySelector('#aiPullRec');
    if (pr && state.rec) pr.onclick = function () {
      pr.disabled = true; state.log = '$ ollama pull ' + state.rec.primary + '\n'; rerender();
      E().ModelManager.pull(state.rec.primary, function (l) { state.log += l; }).then(function (r) {
        state.log += '\n[exit ' + r.code + ']\n' + (r.output || ''); return scan();
      });
    };

    var mb = host.querySelector('#aiManualBtn');
    if (mb) mb.onclick = function () {
      var url = (host.querySelector('#aiManualUrl').value || '').trim();
      var model = (host.querySelector('#aiManualModel').value || '').trim();
      var key = (host.querySelector('#aiManualKey').value || '').trim();
      state.manualUrl = url; state.manualModel = model;
      if (!url || !model) { window.toast && window.toast('Need a base URL and a model id', '#f59e0b'); return; }
      E().LLM.setConfig({ providerId: 'openai_compat', baseUrl: url, model: model, apiKey: key, enabled: true });
      window.toast && window.toast('Connected to ' + url + ' (' + model + ')', '#34d399');
      rerender(); try { window.renderAll && window.renderAll(); } catch (_) {}
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
            if (host && !host.__aiBound) {
              host.__aiBound = true;
              rerender();
              // populate the hardware summary + model-fit column on first view
              if (!state.hw && E().Hardware) E().Hardware.probe().then(function (hw) { state.hw = hw; rerender(); });
            }
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
