/* =====================================================================
   engine.auth.js  —  Engine.Auth   (blueprint §16)

   Emits a real, dependency-free auth system:
     - src/auth.js : register / login / logout / verify, scrypt password
       hashing (node:crypto, timing-safe compare), opaque session tokens,
       requireAuth + requireRole middleware, per-request user.
     - db entities  : user (email, passwordHash, role), session (token, userId, expiresAt)
     - routes       : POST /api/auth/register|login|logout, GET /api/auth/me
     - a login/register UI fragment for the generated frontend.

   window.Engine.Auth
     entities()                 -> [{name:'user',...},{name:'session',...}]
     module()                   -> src/auth.js source
     routes()                   -> route entries the backend wiring consumes
     uiFragment()               -> { html, js } for public/
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function entities() {
    return [
      { name: 'user', ownable: false, fields: [
        { name: 'email', type: 'text', required: true, max: 200 },
        { name: 'passwordHash', type: 'text', required: true, max: 300 },
        { name: 'role', type: 'text', required: true, max: 40, default: 'user' }
      ], indexes: [{ fields: ['email'], unique: true }] },
      { name: 'session', ownable: false, fields: [
        { name: 'token', type: 'text', required: true, max: 120 },
        { name: 'userId', type: 'ref', ref: 'user', required: true },
        { name: 'expiresAt', type: 'timestamp', required: true }
      ], indexes: [{ fields: ['token'], unique: true }] }
    ];
  }

  function module() {
    return [
      "'use strict';",
      "// Auth — scrypt password hashing, opaque session tokens, RBAC middleware.",
      "const crypto = require('crypto');",
      "const db = require('./db');",
      "",
      "const SESSION_MS = 7 * 24 * 60 * 60 * 1000;",
      "",
      "function hash(password) {",
      "  const salt = crypto.randomBytes(16).toString('hex');",
      "  const dk = crypto.scryptSync(String(password), salt, 32).toString('hex');",
      "  return 'scrypt$' + salt + '$' + dk;",
      "}",
      "function verifyPassword(password, stored) {",
      "  const parts = String(stored || '').split('$');",
      "  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;",
      "  const dk = crypto.scryptSync(String(password), parts[1], 32);",
      "  const want = Buffer.from(parts[2], 'hex');",
      "  return dk.length === want.length && crypto.timingSafeEqual(dk, want);",
      "}",
      "",
      "async function register(email, password, role) {",
      "  email = String(email || '').trim().toLowerCase();",
      "  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) throw Object.assign(new Error('valid email required'), { status: 400 });",
      "  if (String(password || '').length < 8) throw Object.assign(new Error('password must be at least 8 characters'), { status: 400 });",
      "  const existing = (await db.list('user', { where: { email } })).rows[0];",
      "  if (existing) throw Object.assign(new Error('email already registered'), { status: 409 });",
      "  const first = (await db.list('user', { limit: 1 })).total === 0;",
      "  const user = await db.create('user', { email, passwordHash: hash(password), role: role || (first ? 'admin' : 'user') });",
      "  return sessionFor(user);",
      "}",
      "async function login(email, password) {",
      "  email = String(email || '').trim().toLowerCase();",
      "  const user = (await db.list('user', { where: { email } })).rows[0];",
      "  if (!user || !verifyPassword(password, user.passwordHash)) throw Object.assign(new Error('invalid credentials'), { status: 401 });",
      "  return sessionFor(user);",
      "}",
      "async function sessionFor(user) {",
      "  const token = crypto.randomBytes(24).toString('hex');",
      "  await db.create('session', { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_MS).toISOString() });",
      "  return { token, user: safe(user) };",
      "}",
      "async function logout(token) {",
      "  const s = (await db.list('session', { where: { token } })).rows[0];",
      "  if (s) await db.remove('session', s.id);",
      "  return { ok: true };",
      "}",
      "async function userFromToken(token) {",
      "  if (!token) return null;",
      "  const s = (await db.list('session', { where: { token } })).rows[0];",
      "  if (!s || new Date(s.expiresAt).getTime() < Date.now()) return null;",
      "  const u = await db.get('user', s.userId);",
      "  return u ? safe(u) : null;",
      "}",
      "function safe(u) { return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }; }",
      "function bearer(req) { const h = req.headers['authorization'] || ''; return h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-session'] || null); }",
      "",
      "// middleware: attaches req.user; throws 401 unless optional",
      "async function attachUser(req) { req.user = await userFromToken(bearer(req)); return req.user; }",
      "function requireAuth(req) { if (!req.user) throw Object.assign(new Error('authentication required'), { status: 401 }); return req.user; }",
      "function requireRole(req, role) { requireAuth(req); if (req.user.role !== role && req.user.role !== 'admin') throw Object.assign(new Error('forbidden'), { status: 403 }); return req.user; }",
      "",
      "module.exports = { register, login, logout, userFromToken, attachUser, requireAuth, requireRole, hash, verifyPassword, bearer };",
      ""
    ].join('\n');
  }

  function routes() {
    return [
      { method: 'POST', path: '/api/auth/register', handler: 'auth.register', body: ['email', 'password'], returns: 201, public: true },
      { method: 'POST', path: '/api/auth/login', handler: 'auth.login', body: ['email', 'password'], returns: 200, public: true },
      { method: 'POST', path: '/api/auth/logout', handler: 'auth.logout', returns: 200, public: true },
      { method: 'GET', path: '/api/auth/me', handler: 'auth.me', returns: 200, public: true }
    ];
  }

  function uiFragment() {
    return {
      html:
        '  <section id="authPanel" class="card" aria-labelledby="authHeading">\n' +
        '    <h2 id="authHeading" data-i18n="auth.heading">Sign in</h2>\n' +
        '    <form id="authForm">\n' +
        '      <label for="authEmail" data-i18n="auth.email">Email</label>\n' +
        '      <input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required aria-label="email" data-i18n-attr="aria-label:auth.email">\n' +
        '      <label for="authPass" data-i18n="auth.password">Password</label>\n' +
        '      <input id="authPass" type="password" autocomplete="current-password" placeholder="password (8+ chars)" required aria-label="password" data-i18n-attr="aria-label:auth.password">\n' +
        '      <button type="submit" id="authSubmit" data-i18n="auth.signIn">Sign in</button>\n' +
        '      <button type="button" id="authToggle" data-i18n="auth.register">Need an account?</button>\n' +
        '    </form>\n' +
        '    <div id="authError" class="error" hidden></div>\n' +
        '  </section>\n' +
        '  <section id="appPanel" hidden>\n' +
        '    <div class="userbar"><span id="whoami"></span> <button id="logoutBtn" type="button" data-i18n="auth.signOut">Log out</button></div>\n' +
        '  </section>\n',
      js: [
        "const AUTH = { token: localStorage.getItem('token') || null, mode: 'login' };",
        "function authHeaders() { return AUTH.token ? { 'authorization': 'Bearer ' + AUTH.token, 'content-type': 'application/json' } : { 'content-type': 'application/json' }; }",
        "async function refreshAuth() {",
        "  const me = AUTH.token ? await fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})) : {};",
        "  const on = !!(me && me.user);",
        "  document.getElementById('authPanel').hidden = on;",
        "  document.getElementById('appPanel').hidden = !on;",
        "  if (on) { document.getElementById('whoami').textContent = me.user.email + ' (' + me.user.role + ')'; if (window.onSignedIn) window.onSignedIn(me.user); }",
        "}",
        "const _t = (k, en) => (window.t && window.i18n) ? window.t(k) : en;",
        "document.getElementById('authToggle').addEventListener('click', () => {",
        "  AUTH.mode = AUTH.mode === 'login' ? 'register' : 'login';",
        "  document.getElementById('authSubmit').textContent = AUTH.mode === 'login' ? _t('auth.signIn', 'Sign in') : _t('auth.register', 'Create account');",
        "  document.getElementById('authToggle').textContent = AUTH.mode === 'login' ? _t('auth.register', 'Need an account?') : _t('auth.signIn', 'Have an account?');",
        "});",
        "document.getElementById('authForm').addEventListener('submit', async (e) => {",
        "  e.preventDefault();",
        "  const err = document.getElementById('authError'); err.hidden = true;",
        "  const btn = document.getElementById('authSubmit'); btn.disabled = true;",
        "  try {",
        "    const res = await fetch('/api/auth/' + AUTH.mode, { method: 'POST', headers: { 'content-type': 'application/json' },",
        "      body: JSON.stringify({ email: document.getElementById('authEmail').value, password: document.getElementById('authPass').value }) });",
        "    const j = await res.json();",
        "    if (!res.ok) throw new Error(j.error || 'failed');",
        "    AUTH.token = j.token; localStorage.setItem('token', j.token);",
        "    await refreshAuth();",
        "  } catch (e2) { err.textContent = e2.message; err.hidden = false; } finally { btn.disabled = false; }",
        "});",
        "document.getElementById('logoutBtn').addEventListener('click', async () => {",
        "  await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});",
        "  AUTH.token = null; localStorage.removeItem('token'); await refreshAuth();",
        "});",
        "refreshAuth();"
      ].join('\n')
    };
  }

  Engine.Auth = { entities: entities, module: module, routes: routes, uiFragment: uiFragment };
  console.info('[Auth] auth + RBAC generator ready — Engine.Auth');
})();
