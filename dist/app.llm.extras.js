/* =================================================================
   app.llm.extras.js
   -----------------------------------------------------------------
   Settings UI + top-nav status for the real LLM provider layer
   (engine.llm.js).

   - Renders an "AI Provider" card inside the Settings screen.
   - Renders a small status pill in the top nav showing whether
     the LLM is configured.
   - Wires controls to Engine.LLM.{getConfig,setConfig,testConnection}.
   - Falls back gracefully when engine.llm.js is not loaded yet.
   ================================================================= */
(function () {
  "use strict";

  const LLM = () => (window.Engine && window.Engine.LLM) || null;

  // ---------- DOM helpers ----------
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(k => {
        if (k === "style") Object.assign(e.style, attrs[k]);
        else if (k === "class") e.className = attrs[k];
        else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") e[k.toLowerCase()] = attrs[k];
        else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(c => {
      if (c == null) return;
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Status helpers ----------
  function providerOptions(selected) {
    const llm = LLM();
    if (!llm) return "";
    return llm.providers.map(p =>
      `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${esc(p.label)}</option>`
    ).join("");
  }
  function knownModelIds(llm, p, currentModel) {
    const seen = {};
    const opts = [];
    function add(m) {
      const v = String(m || "").trim();
      if (!v || seen[v]) return;
      seen[v] = true;
      opts.push(v);
    }
    (p && p.modelOptions || []).forEach(add);
    try {
      const cfg = llm && llm.getConfig && llm.getConfig() || {};
      if (llm && llm.cachedModels) {
        (llm.cachedModels(p && p.id, cfg.baseUrl || (p && p.baseUrl) || "") || []).forEach(add);
      }
    } catch (_) {}
    try {
      ((llm && llm.Gguf && llm.Gguf.list && llm.Gguf.list()) || []).forEach(function (g) {
        add(g.name);
        add(String(g.name).replace(/\.gguf$/i, ""));
      });
    } catch (_) {}
    add(currentModel);
    return opts;
  }
  function modelOptionsFor(llm, p, currentModel) {
    return knownModelIds(llm, p, currentModel).map(function (m) {
      return `<option value="${esc(m)}" ${m === currentModel ? "selected" : ""}>${esc(m)}</option>`;
    }).join("");
  }

  // ---------- AI Provider card (Settings) ----------
  function renderLlmSettingsCard() {
    const llm = LLM();
    if (!llm) {
      return `<div class="card" style="padding:20px;margin-bottom:18px">
        <h3 class="cs-h3" style="margin-bottom:14px">AI Provider</h3>
        <div style="color:var(--muted);font-size:13px">Engine.LLM is not loaded. Make sure engine.llm.js is included in index.html.</div>
      </div>`;
    }

    const cfg = llm.getConfig();
    const st = llm.status();
    const statusColor = st.configured ? "var(--good)" : "var(--muted)";
    const statusText = st.configured
      ? ("Connected \u2022 " + st.providerId + (st.model ? " \u2022 " + st.model : ""))
      : "Not configured \u2014 Agent uses the built-in deterministic synthesizer.";

    const p = llm.resolveProvider(cfg);
    const isLocal = llm.isLocalEndpoint ? llm.isLocalEndpoint(p, cfg) : !!(p && p.local);
    const modelSel = modelOptionsFor(llm, p, cfg.model);
    const ggufs = (llm.Gguf && llm.Gguf.list && llm.Gguf.list()) || [];
    const ggufRows = ggufs.length
      ? ggufs.map(function (g) {
          const size = g.bytes ? (g.bytes >= 1073741824 ? (g.bytes / 1073741824).toFixed(1) + " GB" : (g.bytes / 1048576).toFixed(0) + " MB") : "";
          return '<div class="llm-gguf-row" data-gguf-id="' + esc(g.id) + '" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)">'
            + '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(g.name) + '</div>'
            + '<div class="cs-muted" style="font-size:11px">' + esc(g.gateway || "lmstudio") + (size ? " · " + size : "") + (g.path ? " · " + esc(g.path) : "") + '</div></div>'
            + '<button type="button" class="btn primary llm-gguf-use" data-gguf-id="' + esc(g.id) + '" style="padding:4px 8px;font-size:11px">Use</button>'
            + '<button type="button" class="btn ghost llm-gguf-remove" data-gguf-id="' + esc(g.id) + '" style="padding:4px 8px;font-size:11px">Remove</button>'
            + '</div>';
        }).join("")
      : '<div class="cs-muted" style="font-size:12px;padding:6px 0">No GGUF files registered yet. Pick a .gguf from disk — CodeSovereign stores the filename and routes inference through LM Studio or llama.cpp.</div>';

    return `
      <div class="card" style="padding:20px;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <h3 class="cs-h3" style="margin:0">AI Provider</h3>
          <span id="llmStatusPill" style="margin-left:auto;font:600 11px Inter;padding:3px 9px;border-radius:10px;background:${st.configured ? "rgba(52,211,153,.12)" : "rgba(139,147,167,.18)"};color:${statusColor};border:1px solid ${statusColor}">${esc(statusText)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">
          Wire the agent to a cloud LLM or a local one (LM Studio, llama.cpp, LocalAI). Local keys stay off the wire. GGUF weights stay on disk — this app only stores the filename and talks to the local OpenAI-compatible server.
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">Provider</div>
            <select id="llmProvider" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter">${providerOptions(cfg.providerId)}</select>
          </div>
          <div>
            <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">Model</div>
            <select id="llmModel" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter">${modelSel || '<option value="">(type any loaded model id)</option>'}</select>
            <input id="llmModelCustom" placeholder="Any LM Studio / GGUF / custom model id" value="${esc(cfg.model)}" style="display:block;width:100%;margin-top:6px;padding:8px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter"/>
            <div style="font-size:11px;color:var(--muted);margin-top:5px">Type any id the local server has loaded. Refresh models pulls /v1/models and keeps this list.</div>
          </div>
        </div>

        <div id="llmBaseUrlRow" style="display:${(cfg.providerId === "openai_compat" || isLocal) ? "block" : "none"};margin-bottom:12px">
          <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">Base URL</div>
          <input id="llmBaseUrl" placeholder="http://127.0.0.1:1234" value="${esc(cfg.baseUrl || (p && p.baseUrl) || "")}" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter"/>
        </div>

        <div id="llmKeyRow" style="margin-bottom:12px;display:block">
          <div id="llmKeyLabel" style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">${isLocal ? "API token (optional)" : "API Key"}</div>
          <input id="llmKey" type="password" placeholder="${isLocal ? "paste local server token if required" : "paste key here"}" value="${esc(isLocal ? (cfg.localToken || "") : (cfg.apiKey || ""))}" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter" autocomplete="off"/>
        </div>
        <div id="llmKeyHint" style="font-size:11.5px;color:var(--muted);margin:-6px 0 12px">${esc(p && p.notes || "")}</div>

        <div id="llmGgufBox" style="margin-bottom:14px;padding:12px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.02)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="font:600 12px Inter">Local GGUF models</div>
            <span class="cs-muted" style="font-size:11.5px;flex:1">Integrates .gguf files through LM Studio (port 1234) or llama.cpp (port 8081)</span>
            <label class="btn ghost" style="padding:4px 10px;font-size:11px;cursor:pointer">
              Add GGUF
              <input id="llmGgufFile" type="file" accept=".gguf" style="display:none"/>
            </label>
          </div>
          <div id="llmGgufList">${ggufRows}</div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input id="llmEnabled" type="checkbox" ${st.enabled ? "checked" : ""}/>
            <span style="font:600 12.5px Inter">Use real LLM for the Agent</span>
          </label>
          <span style="flex:1"></span>
          <button id="llmRefreshModelsBtn" class="btn ghost" type="button">Refresh models</button>
          <button id="llmTestBtn" class="btn ghost" type="button">Test connection</button>
          <button id="llmSaveBtn" class="btn primary" type="button">Save</button>
        </div>
        <div id="llmTestOut" style="margin-top:12px;font:12px JetBrains Mono,monospace;color:var(--muted);white-space:pre-wrap;word-break:break-word;display:none"></div>
      </div>
    `;
  }

  // ---------- Wire the AI Provider card ----------
  function bindLlmSettings() {
    const root = document.getElementById("llmSettingsHost");
    if (!root) return;
    const llm = LLM();
    if (!llm) return;

    const providerEl = document.getElementById("llmProvider");
    const modelEl = document.getElementById("llmModel");
    const modelCustomEl = document.getElementById("llmModelCustom");
    const baseUrlRow = document.getElementById("llmBaseUrlRow");
    const baseUrlEl = document.getElementById("llmBaseUrl");
    const keyRow = document.getElementById("llmKeyRow");
    const keyLabel = document.getElementById("llmKeyLabel");
    const keyEl = document.getElementById("llmKey");
    const enabledEl = document.getElementById("llmEnabled");
    const testBtn = document.getElementById("llmTestBtn");
    const saveBtn = document.getElementById("llmSaveBtn");
    const refreshBtn = document.getElementById("llmRefreshModelsBtn");
    const testOut = document.getElementById("llmTestOut");
    const keyHint = document.getElementById("llmKeyHint");
    const statusPill = document.getElementById("llmStatusPill");
    const ggufFile = document.getElementById("llmGgufFile");

    function currentProvider() {
      return llm.providerById(providerEl ? providerEl.value : "") || llm.resolveProvider(llm.getConfig());
    }

    function formIsLocal() {
      const p = currentProvider();
      const url = baseUrlEl ? baseUrlEl.value : "";
      if (llm.isLocalEndpoint) return llm.isLocalEndpoint(p, { baseUrl: url });
      return !!(p && p.local);
    }

    let lastLocality = null;

    function mergeModelOptions(p, currentModel) {
      return modelOptionsFor(llm, p, currentModel);
    }

    function refreshModelList(opts) {
      const fromProviderChange = !!(opts && opts.fromProviderChange);
      const cfg = llm.getConfig();
      const p = currentProvider();
      if (fromProviderChange && baseUrlEl) {
        const known = {
          "http://127.0.0.1:8080": 1, "http://localhost:8080": 1,
          "http://127.0.0.1:8081": 1, "http://localhost:8081": 1,
          "http://127.0.0.1:1234": 1, "http://localhost:1234": 1
        };
        const cur = String(baseUrlEl.value || "").replace(/\/+$/, "");
        const loopback = /127\.0\.0\.1|localhost/i.test(cur);
        if (p && p.local && p.baseUrl) {
          // Remap empty, stock local ports, and leftover cloud URLs — keep a custom loopback port.
          if (!cur || known[cur] || !loopback) baseUrlEl.value = p.baseUrl;
        } else if (p && p.id !== "openai_compat" && loopback) {
          // Named cloud provider: drop leftover LM Studio URL before collect() runs.
          baseUrlEl.value = p.baseUrl || "";
        }
      }
      const local = formIsLocal();
      const optsHtml = mergeModelOptions(p, (modelCustomEl && modelCustomEl.value) || cfg.model || "");
      if (modelEl) {
        modelEl.innerHTML = optsHtml || '<option value="">(type any loaded model id)</option>';
        modelEl.style.display = "";
      }
      if (modelCustomEl) modelCustomEl.style.display = "block";
      if (baseUrlRow) baseUrlRow.style.display = (local || (providerEl && providerEl.value === "openai_compat")) ? "block" : "none";
      if (keyRow) keyRow.style.display = "block";
      if (keyLabel) keyLabel.textContent = local ? "API token (optional)" : "API Key";
      if (keyEl) {
        keyEl.placeholder = local ? "paste local server token if required" : "paste key here";
        if (fromProviderChange) {
          // Never copy leftover cloud apiKey into localToken, or localToken into apiKey.
          keyEl.value = local ? (cfg.localToken || "") : (cfg.apiKey || "");
        }
      }
      if (keyHint && p) keyHint.textContent = p.notes || "";
      lastLocality = local;
    }

    if (providerEl) {
      providerEl.onchange = function () { refreshModelList({ fromProviderChange: true }); };
      refreshModelList();
    }
    if (baseUrlEl) {
      baseUrlEl.oninput = function () {
        const p = currentProvider();
        if (!p || p.id !== "openai_compat") return;
        const local = formIsLocal();
        if (keyLabel) keyLabel.textContent = local ? "API token (optional)" : "API Key";
        if (keyEl) keyEl.placeholder = local ? "paste local server token if required" : "paste key here";
        // Only swap the key when loopback vs remote actually flips — not on every URL keystroke.
        if (local === lastLocality) return;
        lastLocality = local;
        const cfg = llm.getConfig();
        if (keyEl) keyEl.value = local ? (cfg.localToken || "") : (cfg.apiKey || "");
      };
    }
    if (modelEl) {
      modelEl.onchange = function () {
        if (modelCustomEl) modelCustomEl.value = modelEl.value;
      };
    }

    function collect() {
      const p = currentProvider();
      const local = formIsLocal();
      const compat = !!(p && p.id === "openai_compat");
      const custom = modelCustomEl && modelCustomEl.value.trim();
      const selected = modelEl && modelEl.value;
      const data = {
        providerId: providerEl ? providerEl.value : "",
        model: custom || selected || "",
        // Named cloud providers do not keep a leftover loopback baseUrl.
        baseUrl: (local || compat) ? (baseUrlEl ? baseUrlEl.value.trim() : "") : "",
        enabled: !!(enabledEl && enabledEl.checked)
      };
      if (local) {
        if (keyEl) data.localToken = keyEl.value.trim();
      } else if (keyEl) {
        data.apiKey = keyEl.value.trim();
      }
      return data;
    }

    function paintStatus(st) {
      if (!statusPill) return;
      const color = st.configured ? "var(--good)" : "var(--muted)";
      const text = st.configured
        ? ("Connected \u2022 " + st.providerId + (st.model ? " \u2022 " + st.model : ""))
        : "Not configured";
      statusPill.style.background = st.configured ? "rgba(52,211,153,.12)" : "rgba(139,147,167,.18)";
      statusPill.style.color = color;
      statusPill.style.border = "1px solid " + color;
      statusPill.textContent = text;
    }

    if (saveBtn) {
      saveBtn.onclick = () => {
        const data = collect();
        const next = llm.setConfig(data);
        try {
          if (llm.rememberModels && data.model) {
            const p = currentProvider();
            const prev = (llm.cachedModels && llm.cachedModels(data.providerId, data.baseUrl || (p && p.baseUrl) || "")) || [];
            llm.rememberModels(prev.concat([data.model]), data.providerId, data.baseUrl || (p && p.baseUrl) || "");
          }
        } catch (_) {}
        paintStatus(llm.status());
        try { window.csToast && window.csToast("AI provider saved", "#34d399"); } catch (_) {}
        // also refresh top-nav pill
        try { renderTopNavLlmPill(); } catch (_) {}
      };
    }
    if (testBtn) {
      testBtn.onclick = async () => {
        // save first so the test uses the latest values
        llm.setConfig(collect());
        testOut.style.display = "block";
        testOut.textContent = "Testing connection to " + (providerEl.value) + " ...";
        try {
          const r = await llm.testConnection();
          let msg = JSON.stringify(r, null, 2);
          if (r.hint) msg += "\n\n" + r.hint;
          testOut.textContent = msg;
          if (r.ok) {
            testOut.style.color = "var(--good)";
            try { window.csToast && window.csToast("LLM connection OK", "#34d399"); } catch (_) {}
          } else {
            testOut.style.color = "var(--err)";
            try { window.csToast && window.csToast("LLM connection failed", "#ef4444"); } catch (_) {}
          }
        } catch (e) {
          testOut.style.color = "var(--err)";
          testOut.textContent = "Error: " + (e && e.message || e);
        }
      };
    }
    async function pullRemoteModels(silent) {
      if (!llm.listModels) return;
      const p = currentProvider();
      const local = formIsLocal();
      if (!local && !(p && p.id === "openai_compat")) return;
      try {
        const r = await llm.listModels();
        const ids = (r && r.models) || [];
        try {
          const current = (modelCustomEl && modelCustomEl.value.trim()) || (llm.getConfig().model) || "";
          if (current && llm.rememberModels) {
            const merged = (r.cached || ids).concat([current]);
            llm.rememberModels(merged, p && p.id, (baseUrlEl && baseUrlEl.value) || (p && p.baseUrl) || "");
          }
        } catch (_) {}
        refreshModelList();
        if (!silent && testOut) {
          testOut.style.display = "block";
          testOut.style.color = r.ok ? "var(--good)" : "var(--err)";
          testOut.textContent = r.ok ? ("Models: " + (ids.join(", ") || "(none loaded — type any id below)")) : (r.error || ("HTTP " + r.status));
        }
        if (!silent) {
          try { window.csToast && window.csToast(r.ok ? ("Found " + ids.length + " local model(s)") : "Could not list models", r.ok ? "#34d399" : "#f59e0b"); } catch (_) {}
        }
        return r;
      } catch (e) {
        if (!silent && testOut) { testOut.style.display = "block"; testOut.style.color = "var(--err)"; testOut.textContent = String(e && e.message || e); }
      }
    }

    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        llm.setConfig(collect());
        if (testOut) { testOut.style.display = "block"; testOut.textContent = "Listing /v1/models …"; }
        await pullRemoteModels(false);
      };
    }
    // Local servers: pull currently loaded models so the dropdown is not stuck at 1–2 GGUF names.
    if (formIsLocal() || (providerEl && providerEl.value === "openai_compat")) {
      pullRemoteModels(true);
    }
    if (ggufFile) {
      ggufFile.onchange = function () {
        const f = ggufFile.files && ggufFile.files[0];
        ggufFile.value = "";
        if (!f) return;
        const p = currentProvider();
        const gateway = (p && (p.id === "llamacpp" || p.id === "localai")) ? p.id : "lmstudio";
        const r = llm.Gguf.add({ name: f.name, path: f.path || "", bytes: f.size, gateway: gateway });
        if (!r.ok) {
          try { window.csToast && window.csToast(r.reason || "Could not add GGUF", "#ef4444"); } catch (_) {}
          return;
        }
        llm.Gguf.select(r.model.id);
        try { window.csToast && window.csToast("Registered " + r.model.name, "#34d399"); } catch (_) {}
        try { if (typeof renderAll === "function") renderAll(); } catch (_) {}
      };
    }
    root.querySelectorAll(".llm-gguf-use").forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.preventDefault();
        const r = llm.Gguf.select(btn.getAttribute("data-gguf-id"));
        try { window.csToast && window.csToast(r.ok ? ("Using " + r.model.name) : (r.reason || "failed"), r.ok ? "#34d399" : "#ef4444"); } catch (_) {}
        try { if (typeof renderAll === "function") renderAll(); } catch (_) {}
      };
    });
    root.querySelectorAll(".llm-gguf-remove").forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.preventDefault();
        llm.Gguf.remove(btn.getAttribute("data-gguf-id"));
        try { window.csToast && window.csToast("Removed GGUF", "#7c6ff5"); } catch (_) {}
        try { if (typeof renderAll === "function") renderAll(); } catch (_) {}
      };
    });
  }

  // ---------- Inject the card into the Settings screen ----------
  // We patch renderSettings to add a host div + bind it.
  function installIntoSettings() {
    if (!window.renderSettings) { setTimeout(installIntoSettings, 30); return; }
    if (renderSettings.__llmInjected) return;

    const original = window.renderSettings;
    window.renderSettings = function () {
      const out = original.apply(this, arguments);
      const card = '<div id="llmSettingsHost">' + renderLlmSettingsCard() + '</div>';
      // Find the Integrations heading *text*, then the card that contains it.
      // A /card[\s\S]*?Integrations/ (or even /h3[\s\S]*?Integrations/) regex
      // starts at the first card/heading and drops the host at the top of the
      // stack. slice() so '$' in earlier cards cannot be String.replace tokens.
      const headingEnd = out.indexOf('Integrations</h3>');
      if (headingEnd >= 0) {
        const cardStart = out.lastIndexOf('<div class="card"', headingEnd);
        if (cardStart >= 0) {
          return out.slice(0, cardStart) + card + '\n      ' + out.slice(cardStart);
        }
      }
      const close = out.lastIndexOf('</div>');
      if (close >= 0) return out.slice(0, close) + card + '\n    ' + out.slice(close);
      return out + card;
    };
    renderSettings.__llmInjected = true;
  }

  // ---------- Top-nav pill ----------
  function renderTopNavLlmPill() {
    const llm = LLM();
    if (!llm) return;
    const st = llm.status();
    let pill = document.getElementById("llmTopNavPill");
    if (!pill) {
      const topnav = document.getElementById("topnav");
      if (!topnav) return;
      pill = document.createElement("div");
      pill.id = "llmTopNavPill";
      pill.style.cssText = "display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:9px;font:600 11px Inter;cursor:pointer;border:1px solid var(--line);background:rgba(255,255,255,.02)";
      pill.title = "AI Provider status \u2014 click to open Settings";
      pill.onclick = () => { try { window.S && (window.S.screen = "settings"); if (typeof renderAll === "function") renderAll(); } catch (_) {} };
      // Insert before the settings button if present
      const settingsBtn = document.getElementById("settingsBtnTop");
      if (settingsBtn && settingsBtn.parentNode) settingsBtn.parentNode.insertBefore(pill, settingsBtn);
      else topnav.appendChild(pill);
    }
    if (st.configured) {
      pill.style.background = "rgba(52,211,153,.10)";
      pill.style.color = "var(--good)";
      pill.style.borderColor = "rgba(52,211,153,.45)";
      pill.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:var(--good)"></span>LLM \u2022 ' + esc(st.providerId);
    }else {
      pill.style.background = "rgba(139,147,167,.08)";
      pill.style.color = "var(--muted)";
      pill.style.borderColor = "var(--line)";
      pill.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:var(--muted)"></span>LLM \u2022 local';
    }
  }

  // ---------- Hook into renderAll to keep things in sync ----------
  function installHooks() {
    if (!window.renderAll) { setTimeout(installHooks, 30); return; }
    if (renderAll.__llmHooked) return;
    const original = window.renderAll;
    window.renderAll = function () {
      const r = original.apply(this, arguments);
      try { renderTopNavLlmPill(); } catch (_) {}
      try {
        if (window.S && window.S.screen === "settings") {
          const host = document.getElementById("llmSettingsHost");
          if (host && !host.__llmBound) {
            host.innerHTML = renderLlmSettingsCard();
            host.__llmBound = true;
            bindLlmSettings();
          }
        }
      } catch (e) {
        // best-effort
      }
      return r;
    };
    renderAll.__llmHooked = true;
  }

  // ---------- Boot ----------
  function boot() {
    installIntoSettings();
    installHooks();
    // Try to render the pill now and after DOMContentLoaded
    try { renderTopNavLlmPill(); } catch (_) {}
    document.addEventListener("DOMContentLoaded", () => { try { renderTopNavLlmPill(); } catch (_) {} });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
