/* ============================================================
   app.oauth.js — OAuth Settings UI
   ------------------------------------------------------------
   Centralized UI to manage OAuth client configs for every
   supported provider, generate authorize URLs (with PKCE),
   and view connected accounts. Hooks into S.screen === 'oauth'.

   Exposes:
     window.OAuthUI = { render(), mount() }
   ============================================================ */
(function() {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const LS_CONFIGS = 'cs.oauth.configs.v1';
  function loadConfigs() {
    try { return JSON.parse(localStorage.getItem(LS_CONFIGS) || '{}'); } catch (_) { return {}; }
  }
  function saveConfigs(o) { try { localStorage.setItem(LS_CONFIGS, JSON.stringify(o)); } catch (_) {} }

  function render() {
    if (!window.OAuthClient) return '<div style="padding:24px;color:#8b93a7">OAuth engine not loaded.</div>';
    const O = window.OAuthClient;
    const providers = O.providers();
    const configs = loadConfigs();
    const authed = O.listAuthed();

    function providerCard(key, p) {
      const cfg = configs[key] || {};
      const isAuthed = authed.indexOf(key) !== -1;
      const profile = O.getProfile(key);
      const token = O.getToken(key);

      return `
        <div class="card" style="padding:18px;margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:14px">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#22d3ee">${esc(p.label.slice(0,2))}</div>
            <div style="flex:1;min-width:0">
              <h3 style="margin:0;font-size:15px;font-weight:700;color:#e6e9f2">${esc(p.label)}</h3>
              <div style="font-size:11.5px;color:#8b93a7;margin-top:2px">${esc(p.scope)}</div>
            </div>
            <span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:7px;background:${isAuthed?'rgba(52,211,153,.15)':'rgba(255,255,255,.05)'};color:${isAuthed?'#34d399':'#8b93a7'}">${isAuthed ? '● Connected' : '○ Not connected'}</span>
          </div>

          ${profile ? `<div style="display:flex;align-items:center;gap:9px;padding:8px 11px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.2);border-radius:8px;margin-bottom:12px;font-size:12px">
            <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#6d5dfc,#22d3ee);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:12px">${esc((profile.login || profile.name || profile.email || '?').toString().slice(0,1).toUpperCase())}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;color:#e6e9f2">${esc(profile.login || profile.name || profile.email || 'Unknown')}</div>
              <div style="font-size:10.5px;color:#8b93a7">${esc(profile.email || '')}</div>
            </div>
            <button data-oa-clear="${esc(key)}" class="cs-btn cs-btn-ghost" style="font-size:11px;color:#ef4444">Disconnect</button>
          </div>` : ''}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px">
            <div>
              <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Client ID</label>
              <input data-oa-field="clientId" data-oa-key="${esc(key)}" type="text" value="${esc(cfg.clientId||'')}" placeholder="your-oauth-app-client-id" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12.5px;color:#e6e9f2;font-family:monospace">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Client Secret (optional, kept local)</label>
              <input data-oa-field="clientSecret" data-oa-key="${esc(key)}" type="password" value="${esc(cfg.clientSecret||'')}" placeholder="${p.supportsPKCE?'not required with PKCE':'required for confidential apps'}" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12.5px;color:#e6e9f2;font-family:monospace">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:12px">
            <div>
              <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Redirect URI</label>
              <input data-oa-field="redirectUri" data-oa-key="${esc(key)}" type="text" value="${esc(cfg.redirectUri||(window.location.origin + window.location.pathname))}" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12px;color:#e6e9f2;font-family:monospace">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:#8b93a7;margin-bottom:4px">Scope (override)</label>
              <input data-oa-field="scope" data-oa-key="${esc(key)}" type="text" value="${esc(cfg.scope||p.scope)}" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:12px;color:#e6e9f2;font-family:monospace">
            </div>
          </div>

          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <button data-oa-login="${esc(key)}" class="cs-btn cs-btn-primary" style="font-size:12px" ${cfg.clientId ? '' : 'disabled style="opacity:.5;cursor:not-allowed"'}>🔑 Login with ${esc(p.label)}</button>
            <button data-oa-copyurl="${esc(key)}" class="cs-btn cs-btn-ghost" style="font-size:12px" ${cfg.clientId ? '' : 'disabled'}>Copy authorize URL</button>
            <button data-oa-save="${esc(key)}" class="cs-btn cs-btn-ghost" style="font-size:12px">Save config</button>
            ${isAuthed ? '<button data-oa-whoami="' + esc(key) + '" class="cs-btn cs-btn-ghost" style="font-size:12px">Test / Fetch profile</button>' : ''}
            ${isAuthed && token && token.refresh_token ? '<button data-oa-refresh="' + esc(key) + '" class="cs-btn cs-btn-ghost" style="font-size:12px">Refresh token</button>' : ''}
          </div>

          <details style="margin-top:11px">
            <summary style="font-size:11px;color:#8b93a7;cursor:pointer">Raw authorize URL (advanced)</summary>
            <pre id="oa-url-${esc(key)}" style="margin-top:7px;padding:10px;background:#0a0e1a;border-radius:6px;font:10.5px/1.4 'JetBrains Mono',monospace;color:#c7cddb;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-all">${esc((cfg.clientId ? buildUrl(key, cfg) : '(enter Client ID to preview)'))}</pre>
          </details>
        </div>
      `;
    }

    function buildUrl(key, cfg) {
      try {
        const state = O.randomState();
        return O.buildAuthorizeUrl({
          provider: key,
          clientId: cfg.clientId,
          redirectUri: cfg.redirectUri || (window.location.origin + window.location.pathname),
          scope: cfg.scope || providers[key].scope,
          state: state
        });
      } catch (e) { return '(error: ' + e.message + ')'; }
    }

    return `
      <div style="padding:20px;max-width:1080px;margin:0 auto">
        <h2 style="margin:0 0 18px;font-size:22px;font-weight:700;color:#e6e9f2">🔐 OAuth Settings</h2>

        <div class="card" style="padding:14px;margin-bottom:18px;background:rgba(34,211,238,.05);border-color:rgba(34,211,238,.2)">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:14px;color:#22d3ee">ℹ</span>
            <div style="flex:1;font-size:12.5px;color:#c7cddb;line-height:1.55">
              Configure OAuth clients for any provider. After saving, the <b>Login</b> button generates a PKCE-secured URL and redirects to the provider. When the provider sends you back to the redirect URI with <code style="color:#22d3ee">?code=…</code>, the engine automatically exchanges it for a token and stores the profile.
              <br><br>
              Need a custom callback page? Use <a href="oauth-callback.html" style="color:#22d3ee"><code>oauth-callback.html</code></a> (deployed alongside this app) which handles the exchange and posts the result back to the opener window.
            </div>
          </div>
        </div>

        ${Object.keys(providers).map(k => providerCard(k, providers[k])).join('')}
      </div>
    `;
  }

  function mount() {
    if (window._oaMounted) return;
    window._oaMounted = true;

    document.addEventListener('input', (e) => {
      const t = e.target.closest('[data-oa-field]');
      if (!t) return;
      const key = t.getAttribute('data-oa-key');
      const field = t.getAttribute('data-oa-field');
      const configs = loadConfigs();
      configs[key] = configs[key] || {};
      configs[key][field] = t.value;
      saveConfigs(configs);
    });

    document.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-oa-login],[data-oa-copyurl],[data-oa-save],[data-oa-clear],[data-oa-whoami],[data-oa-refresh]');
      if (!t) return;
      const O = window.OAuthClient;
      if (!O) return;
      const key = t.getAttribute('data-oa-login') || t.getAttribute('data-oa-copyurl') || t.getAttribute('data-oa-save') || t.getAttribute('data-oa-clear') || t.getAttribute('data-oa-whoami') || t.getAttribute('data-oa-refresh');
      const configs = loadConfigs();
      const cfg = configs[key] || {};
      const providers = O.providers();
      const p = providers[key];

      if (t.hasAttribute('data-oa-login')) {
        if (!cfg.clientId) { alert('Please enter a Client ID first.'); return; }
        const verifier = O.generateVerifier();
        const challenge = await O.challengeFromVerifier(verifier);
        const state = O.randomState();
        O.saveState({
          provider: key,
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret || null,
          redirectUri: cfg.redirectUri || (window.location.origin + window.location.pathname),
          scope: cfg.scope || p.scope,
          codeVerifier: verifier,
          state: state
        });
        const url = O.buildAuthorizeUrl({
          provider: key,
          clientId: cfg.clientId,
          redirectUri: cfg.redirectUri || (window.location.origin + window.location.pathname),
          scope: cfg.scope || p.scope,
          state: state,
          codeChallenge: challenge
        });
        window.location.href = url;
        return;
      }
      if (t.hasAttribute('data-oa-copyurl')) {
        if (!cfg.clientId) { alert('Please enter a Client ID first.'); return; }
        const state = O.randomState();
        const url = O.buildAuthorizeUrl({
          provider: key,
          clientId: cfg.clientId,
          redirectUri: cfg.redirectUri || (window.location.origin + window.location.pathname),
          scope: cfg.scope || p.scope,
          state: state
        });
        try { navigator.clipboard.writeText(url); alert('Authorize URL copied.'); } catch (_) {}
        return;
      }
      if (t.hasAttribute('data-oa-save')) {
        rerender();
        alert('Saved.');
        return;
      }
      if (t.hasAttribute('data-oa-clear')) {
        if (!confirm('Disconnect ' + p.label + '? This will remove the stored token and profile.')) return;
        O.clearToken(key);
        rerender();
        return;
      }
      if (t.hasAttribute('data-oa-whoami')) {
        try {
          const prof = await O.whoami(key);
          alert('✓ Profile loaded: ' + (prof.login || prof.name || prof.email || 'OK'));
          rerender();
        } catch (err) { alert('Failed: ' + err.message); }
        return;
      }
      if (t.hasAttribute('data-oa-refresh')) {
        const tok = O.getToken(key);
        if (!tok || !tok.refresh_token) { alert('No refresh token stored.'); return; }
        try {
          await O.refresh({ provider: key, clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken: tok.refresh_token });
          alert('✓ Token refreshed.');
          rerender();
        } catch (err) { alert('Failed: ' + err.message); }
        return;
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

  window.OAuthUI = { render, mount };
})();
