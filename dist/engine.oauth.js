/* ============================================================
   engine.oauth.js — OAuth Callback Handler
   ------------------------------------------------------------
   Generic OAuth 2.0 (Authorization Code with PKCE) flow for
   any provider. Handles:
     1) Building the authorize URL with PKCE challenge
     2) Storing verifier/state in sessionStorage
     3) Catching the redirect (?code=…&state=…)
     4) Exchanging the code for an access token
     5) Persisting the token + profile (in-memory + localStorage)
     6) Refreshing tokens when supported

   Pre-configured providers:
     - github
     - google
     - microsoft
     - gitlab
     - generic (any OAuth2 endpoint)

   Exposes:
     window.OAuthClient = {
       // Provider config
       providers(): { github, google, microsoft, gitlab, generic },
       // PKCE helpers
       generateVerifier(), challengeFromVerifier(verifier),
       randomState(),
       // URL building
       buildAuthorizeUrl({provider, clientId, redirectUri, scope, state, codeChallenge, additionalParams}),
       // State persistence
       saveState({provider, verifier, state, redirectUri}),
       loadState(), clearState(),
       // Code exchange
       exchangeCode({provider, clientId, clientSecret, code, redirectUri, codeVerifier}),
       // Refresh
       refresh({provider, clientId, clientSecret, refreshToken}),
       // Handle incoming redirect
       handleRedirect(),
       // Profile / token store
       getToken(provider), setToken(provider, tok), clearToken(provider),
       getProfile(provider), setProfile(provider, profile),
       whoami(provider), isAuthed(provider), listAuthed(), clearAll(),
       // Misc
       parseFragment()  // also handles #access_token=…  (implicit)
     }
   ============================================================ */
(function() {
  'use strict';

  const LS_TOK = 'cs.oauth.tokens.v1';
  const LS_PROF = 'cs.oauth.profiles.v1';
  const SS_STATE = 'cs.oauth.state.v1';

  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function generateVerifier() {
    const arr = new Uint8Array(48);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return b64url(arr);
  }

  async function challengeFromVerifier(verifier) {
    if (window.crypto && window.crypto.subtle) {
      const data = new TextEncoder().encode(verifier);
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return b64url(new Uint8Array(buf));
    }
    // fallback (no PKCE) — challenge = verifier
    return verifier;
  }

  function randomState() {
    return generateVerifier();
  }

  function providers() {
    return {
      github: {
        label: 'GitHub',
        authorize: 'https://github.com/login/oauth/authorize',
        token: 'https://github.com/login/oauth/access_token',
        scope: 'repo read:user user:email',
        profileUrl: 'https://api.github.com/user',
        supportsPKCE: true
      },
      google: {
        label: 'Google',
        authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
        profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        supportsPKCE: true
      },
      microsoft: {
        label: 'Microsoft',
        authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scope: 'openid email profile User.Read',
        profileUrl: 'https://graph.microsoft.com/v1.0/me',
        supportsPKCE: true
      },
      gitlab: {
        label: 'GitLab',
        authorize: 'https://gitlab.com/oauth/authorize',
        token: 'https://gitlab.com/oauth/token',
        scope: 'api read_user',
        profileUrl: 'https://gitlab.com/api/v4/user',
        supportsPKCE: true
      },
      generic: {
        label: 'Generic OAuth2',
        authorize: '',
        token: '',
        scope: 'openid email profile',
        profileUrl: '',
        supportsPKCE: true
      }
    };
  }

  function buildAuthorizeUrl(opts) {
    opts = opts || {};
    const cfg = providers()[opts.provider];
    if (!cfg) throw new Error('unknown provider: ' + opts.provider);
    const authorizeUrl = opts.authorizeUrl || cfg.authorize;
    if (!authorizeUrl) throw new Error('no authorize URL configured');
    const params = new URLSearchParams();
    params.set('client_id', opts.clientId);
    params.set('redirect_uri', opts.redirectUri);
    params.set('response_type', 'code');
    params.set('scope', opts.scope || cfg.scope);
    params.set('state', opts.state);
    if (opts.codeChallenge) params.set('code_challenge', opts.codeChallenge);
    if (opts.codeChallenge) params.set('code_challenge_method', 'S256');
    if (opts.prompt) params.set('prompt', opts.prompt);
    if (opts.accessType) params.set('access_type', opts.accessType);
    if (opts.provider === 'google' && opts.includeGrantedScopes) {
      params.set('include_granted_scopes', 'true');
    }
    if (opts.additionalParams && typeof opts.additionalParams === 'object') {
      Object.keys(opts.additionalParams).forEach(k => params.set(k, opts.additionalParams[k]));
    }
    return authorizeUrl + (authorizeUrl.indexOf('?') === -1 ? '?' : '&') + params.toString();
  }

  function saveState(state) {
    try { sessionStorage.setItem(SS_STATE, JSON.stringify(state)); } catch (_) {}
  }
  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(SS_STATE) || 'null'); }
    catch (_) { return null; }
  }
  function clearState() {
    try { sessionStorage.removeItem(SS_STATE); } catch (_) {}
    return true;
  }

  async function exchangeCode(opts) {
    opts = opts || {};
    const cfg = providers()[opts.provider];
    const tokenUrl = opts.tokenUrl || (cfg && cfg.token);
    if (!tokenUrl) throw new Error('no token URL configured');
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', opts.code);
    body.set('redirect_uri', opts.redirectUri);
    body.set('client_id', opts.clientId);
    if (opts.clientSecret) body.set('client_secret', opts.clientSecret);
    if (opts.codeVerifier) body.set('code_verifier', opts.codeVerifier);
    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    let tok = null;
    const text = await r.text();
    try { tok = JSON.parse(text); }
    catch (_) {
      // GitHub returns URL-encoded form
      const sp = new URLSearchParams(text);
      tok = {};
      sp.forEach((v, k) => tok[k] = v);
    }
    if (!r.ok) {
      throw new Error('token exchange failed: ' + (tok.error_description || tok.error || r.status));
    }
    if (opts.provider) setToken(opts.provider, tok);
    return tok;
  }

  async function refresh(opts) {
    opts = opts || {};
    const cfg = providers()[opts.provider];
    const tokenUrl = opts.tokenUrl || (cfg && cfg.token);
    if (!tokenUrl) throw new Error('no token URL configured');
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', opts.refreshToken);
    body.set('client_id', opts.clientId);
    if (opts.clientSecret) body.set('client_secret', opts.clientSecret);
    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const text = await r.text();
    let tok = null;
    try { tok = JSON.parse(text); }
    catch (_) {
      const sp = new URLSearchParams(text);
      tok = {};
      sp.forEach((v, k) => tok[k] = v);
    }
    if (!r.ok) throw new Error('refresh failed: ' + (tok.error_description || tok.error || r.status));
    setToken(opts.provider, tok);
    return tok;
  }

  function loadTokens() {
    try { return JSON.parse(localStorage.getItem(LS_TOK) || '{}'); } catch (_) { return {}; }
  }
  function saveTokens(o) {
    try { localStorage.setItem(LS_TOK, JSON.stringify(o)); } catch (_) {}
  }
  function loadProfiles() {
    try { return JSON.parse(localStorage.getItem(LS_PROF) || '{}'); } catch (_) { return {}; }
  }
  function saveProfiles(o) {
    try { localStorage.setItem(LS_PROF, JSON.stringify(o)); } catch (_) {}
  }

  function getToken(provider) {
    const all = loadTokens();
    return all[provider] || null;
  }
  function setToken(provider, tok) {
    const all = loadTokens();
    all[provider] = Object.assign({}, all[provider] || {}, tok, { _storedAt: new Date().toISOString() });
    saveTokens(all);
    return all[provider];
  }
  function clearToken(provider) {
    const all = loadTokens();
    delete all[provider];
    saveTokens(all);
    return true;
  }
  function getProfile(provider) {
    const all = loadProfiles();
    return all[provider] || null;
  }
  function setProfile(provider, profile) {
    const all = loadProfiles();
    all[provider] = Object.assign({}, all[provider] || {}, profile);
    saveProfiles(all);
    return all[provider];
  }

  function isAuthed(provider) {
    const t = getToken(provider);
    return !!(t && (t.access_token || t.token));
  }
  function listAuthed() {
    const t = loadTokens();
    return Object.keys(t).filter(k => isAuthed(k));
  }
  function clearAll() {
    saveTokens({});
    saveProfiles({});
  }

  async function whoami(provider) {
    const cfg = providers()[provider];
    if (!cfg) throw new Error('unknown provider');
    const t = getToken(provider);
    if (!t || !(t.access_token || t.token)) throw new Error('not authenticated');
    const token = t.access_token || t.token;
    const r = await fetch(cfg.profileUrl, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'User-Agent': 'CodeSovereign'
      }
    });
    if (!r.ok) throw new Error('profile fetch failed: ' + r.status);
    const profile = await r.json();
    setProfile(provider, profile);
    return profile;
  }

  // -------- handle incoming redirect --------
  function handleRedirect() {
    // try query string first
    let params = null;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('code') || sp.get('error')) params = sp;
    } catch (_) {}
    if (!params) {
      try {
        const sp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        if (sp.get('access_token') || sp.get('error')) params = sp;
      } catch (_) {}
    }
    if (!params) return null;
    const state = loadState();
    const result = {
      code: params.get('code'),
      error: params.get('error'),
      state: params.get('state'),
      accessToken: params.get('access_token'),
      tokenType: params.get('token_type'),
      expiresIn: params.get('expires_in'),
      scope: params.get('scope'),
      provider: state ? state.provider : null,
      stateValid: state ? (state.state === params.get('state')) : null
    };
    if (result.code && state && state.provider) {
      result.provider = state.provider;
      // try to exchange; will set token if clientId present in state
      if (state.clientId) {
        exchangeCode({
          provider: state.provider,
          clientId: state.clientId,
          clientSecret: state.clientSecret || null,
          code: result.code,
          redirectUri: state.redirectUri,
          codeVerifier: state.codeVerifier || null,
          tokenUrl: state.tokenUrl || null
        }).then(tok => {
          result.token = tok;
          result.ok = true;
          if (state.redirectUri) {
            // strip ?code=… from URL so a reload doesn't re-trigger
            try { history.replaceState(null, '', state.redirectUri); } catch (_) {}
          }
          // notify
          subscribers.forEach(fn => { try { fn(result); } catch (_) {} });
        }).catch(err => {
          result.ok = false;
          result.error = err.message;
          subscribers.forEach(fn => { try { fn(result); } catch (_) {} });
        });
      }
    } else if (result.accessToken) {
      // implicit flow
      setToken(result.provider || 'unknown', {
        access_token: result.accessToken,
        token_type: result.tokenType,
        expires_in: result.expiresIn,
        scope: result.scope
      });
      result.ok = true;
    }
    clearState();
    subscribers.forEach(fn => { try { fn(result); } catch (_) {} });
    return result;
  }

  function parseFragment() { return handleRedirect(); }

  // auto-handle on load
  try { window.addEventListener('DOMContentLoaded', () => { handleRedirect(); }); } catch (_) {}

  // -------- pub/sub --------
  const subscribers = new Set();
  function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }

  const api = {
    providers,
    generateVerifier, challengeFromVerifier, randomState,
    buildAuthorizeUrl,
    saveState, loadState, clearState,
    exchangeCode, refresh,
    handleRedirect, parseFragment,
    getToken, setToken, clearToken,
    getProfile, setProfile,
    whoami, isAuthed, listAuthed, clearAll,
    subscribe
  };
  window.OAuthClient = api;
  if (window.Engine) window.Engine.OAuthClient = api;
})();
