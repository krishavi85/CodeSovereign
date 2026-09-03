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
  function modelOptionsFor(p, currentModel) {
    if (!p) return "";
    if (Array.isArray(p.modelOptions) && p.modelOptions.length) {
      return p.modelOptions.map(m =>
        `<option value="${esc(m)}" ${m === currentModel ? "selected" : ""}>${esc(m)}</option>`
      ).join("");
    }
    return "";
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
    const modelSel = modelOptionsFor(p, cfg.model);

    return `
      <div class="card" style="padding:20px;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <h3 class="cs-h3" style="margin:0">AI Provider</h3>
          <span id="llmStatusPill" style="margin-left:auto;font:600 11px Inter;padding:3px 9px;border-radius:10px;background:${st.configured ? "rgba(52,211,153,.12)" : "rgba(139,147,167,.18)"};color:${statusColor};border:1px solid ${statusColor}">${esc(statusText)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">
          Wire the agent to a real LLM. Your key is stored only in this browser's localStorage and is sent only to the provider you pick.
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">Provider</div>
            <select id="llmProvider" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter">${providerOptions(cfg.providerId)}</select>
          </div>
          <div>
            <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">Model</div>
            <select id="llmModel" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter">${modelSel}</select>
            <input id="llmModelCustom" placeholder="Custom model id" value="${esc(cfg.model)}" style="display:none;width:100%;margin-top:6px;padding:8px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter"/>
          </div>
        </div>

        <div id="llmBaseUrlRow" style="display:${cfg.providerId === "openai_compat" ? "block" : "none"};margin-bottom:12px">
          <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">Base URL</div>
          <input id="llmBaseUrl" placeholder="https://api.together.xyz" value="${esc(cfg.baseUrl || "")}" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter"/>
        </div>

        <div style="margin-bottom:12px">
          <div style="font:600 11px Inter;letter-spacing:.05em;color:#7b859c;text-transform:uppercase;margin-bottom:5px">API Key</div>
          <input id="llmKey" type="password" placeholder="paste key here" value="${esc(cfg.apiKey || "")}" style="width:100%;padding:9px 10px;background:#0d1220;color:#e6e9f2;border:1px solid var(--line);border-radius:8px;font:13px Inter" autocomplete="off"/>
          <div id="llmKeyHint" style="font-size:11.5px;color:var(--muted);margin-top:5px">${esc(p && p.notes || "")}</div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input id="llmEnabled" type="checkbox" ${st.enabled ? "checked" : ""}/>
            <span style="font:600 12.5px Inter">Use real LLM for the Agent</span>
          </label>
          <span style="flex:1"></span>
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
    const keyEl = document.getElementById("llmKey");
    const enabledEl = document.getElementById("llmEnabled");
    const testBtn = document.getElementById("llmTestBtn");
    const saveBtn = document.getElementById("llmSaveBtn");
    const testOut = document.getElementById("llmTestOut");
    const keyHint = document.getElementById("llmKeyHint");
    const statusPill = document.getElementById("llmStatusPill");

    function refreshModelList() {
      const cfg = llm.getConfig();
      const p = llm.providerById(providerEl.value);
      const opts = modelOptionsFor(p, "");
      if (opts) {
        modelEl.innerHTML = opts;
        modelEl.style.display = "";
        if (modelCustomEl) modelCustomEl.style.display = "none";
      } else {
        modelEl.style.display = "none";
        if (modelCustomEl) {
          modelCustomEl.style.display = "";
          modelCustomEl.value = cfg.model || "";
        }
      }
      if (baseUrlRow) baseUrlRow.style.display = (providerEl.value === "openai_compat") ? "block" : "none";
      if (keyHint && p) keyHint.textContent = p.notes || "";
    }

    if (providerEl) {
      providerEl.onchange = refreshModelList;
      refreshModelList();
    }

    function collect() {
      const data = {
        providerId: providerEl ? providerEl.value : "",
        model: (modelEl && modelEl.style.display !== "none") ? modelEl.value : ((modelCustomEl && modelCustomEl.value) || ""),
        apiKey: keyEl ? keyEl.value.trim() : "",
        baseUrl: baseUrlEl ? baseUrlEl.value.trim() : "",
        enabled: !!(enabledEl && enabledEl.checked)
      };
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
        const next = llm.setConfig(collect());
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
          testOut.textContent = JSON.stringify(r, null, 2);
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
  }

  // ---------- Inject the card into the Settings screen ----------
  // We patch renderSettings to add a host div + bind it.
  function installIntoSettings() {
    if (!window.renderSettings) { setTimeout(installIntoSettings, 30); return; }
    if (renderSettings.__llmInjected) return;

    const original = window.renderSettings;
    window.renderSettings = function () {
      const out = original.apply(this, arguments);
      // Insert host right after the Agents card.
      const host = '<div id="llmSettingsHost"></div>';
      // Place it after the Agents card by finding the Environment card.
      // Simpler: append at end of card stack.
      return out.replace(
        /<div class="card" style="padding:20px;margin-bottom:18px">\s*<h3 class="cs-h3" style="margin-bottom:14px">\$\{I\.gear\} Environment<\/h3>/,
        '<div class="card" style="padding:20px;margin-bottom:18px">__LLM_HOST__</div>$&'
      ).replace("__LLM_HOST__", renderLlmSettingsCard());
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
          if (host) {
            host.outerHTML = '<div id="llmSettingsHost">' + renderLlmSettingsCard().replace(/^<div class="card".*?>/, "").replace(/<\/div>$/, "") + '</div>';
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
