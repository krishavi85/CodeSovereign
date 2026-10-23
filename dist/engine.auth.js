/* =====================================================================
   engine.auth.js  —  Engine.Auth   (blueprint §16)

   Emits a real, dependency-free auth system:
     - src/auth.js : register / login / logout / verify, scrypt password
       hashing (node:crypto, timing-safe compare), opaque session tokens,
       requireAuth + requireRole middleware, per-request user.
     - db entities  : user (email, passwordHash, role), session (token, userId, expiresAt)
     - routes       : POST /api/auth/register|login|logout, GET /api/auth/me
     - a login/register UI fragment for the generated frontend.

   §16 — authentication methods beyond password, switched on by the contract
   (contract.supportedStack.authMethods → spec.authMethods):
     - mfa       : RFC 6238 TOTP (node:crypto HMAC-SHA1) + one-time backup codes.
                   Login is not complete until a valid 6-digit code is supplied.
     - oauth     : server-side Authorization Code + PKCE for google / github.
                   Client id/secret are read from the ENVIRONMENT only — a route
                   with no configured secret answers 501 with the exact env var.
     - passkeys  : WebAuthn (FIDO2). Registration stores the COSE public key
                   (CBOR-decoded, no dependency); login verifies the assertion
                   signature (ES256 / RS256) with crypto.verify before a session.

   window.Engine.Auth
     entities(spec?)            -> [{name:'user',...},{name:'session',...}, …]
     module(spec?)              -> src/auth.js source
     routes()                   -> route entries the backend wiring consumes
     uiFragment(spec?)          -> { html, js } for public/
     features(spec)             -> { mfa, oauth, passkeys }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function features(spec) {
    var am = (spec && spec.authMethods) || {};
    return { mfa: !!am.mfa, oauth: !!am.oauth, passkeys: !!am.passkeys };
  }

  function entities(spec) {
    var f = features(spec);
    var userFields = [
      { name: 'email', type: 'text', required: true, max: 200 },
      // an OAuth-only account has no password, so passwordHash is optional there
      { name: 'passwordHash', type: 'text', required: !f.oauth, max: 300 },
      { name: 'role', type: 'text', required: true, max: 40, default: 'user' }
    ];
    if (f.mfa) userFields.push(
      { name: 'totpSecret', type: 'text', required: false, max: 64 },
      { name: 'totpEnabled', type: 'bool', required: false, default: false },
      { name: 'backupCodes', type: 'longtext', required: false, max: 800 }
    );
    if (f.oauth) userFields.push(
      { name: 'oauthProvider', type: 'text', required: false, max: 40 },
      { name: 'oauthSubject', type: 'text', required: false, max: 200 }
    );
    var list = [
      { name: 'user', ownable: false, fields: userFields, indexes: [{ fields: ['email'], unique: true }] },
      { name: 'session', ownable: false, fields: [
        { name: 'token', type: 'text', required: true, max: 120 },
        { name: 'userId', type: 'ref', ref: 'user', required: true },
        { name: 'expiresAt', type: 'timestamp', required: true }
      ], indexes: [{ fields: ['token'], unique: true }] }
    ];
    if (f.passkeys) {
      list.push({ name: 'webauthn_credential', ownable: false, fields: [
        { name: 'userId', type: 'ref', ref: 'user', required: true },
        { name: 'credentialId', type: 'text', required: true, max: 400 },
        { name: 'publicKeyPem', type: 'longtext', required: true, max: 1200 },
        { name: 'alg', type: 'int', required: true },
        { name: 'counter', type: 'int', required: false, default: 0 }
      ], indexes: [{ fields: ['credentialId'], unique: true }] });
    }
    return list;
  }

  /* ---------------- the base auth module ---------------- */
  function baseModule() {
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
      "async function login(email, password, code) {",
      "  email = String(email || '').trim().toLowerCase();",
      "  const user = (await db.list('user', { where: { email } })).rows[0];",
      "  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) throw Object.assign(new Error('invalid credentials'), { status: 401 });",
      "  if (user.totpEnabled) {",
      "    if (!code) throw Object.assign(new Error('mfa code required'), { status: 401, code: 'MFA_REQUIRED' });",
      "    if (!(typeof verifyTotpForUser === 'function' && await verifyTotpForUser(user, code))) throw Object.assign(new Error('invalid mfa code'), { status: 401, code: 'MFA_INVALID' });",
      "  }",
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
      "function safe(u) { return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt, mfa: !!u.totpEnabled, via: u.oauthProvider || 'password' }; }",
      "function bearer(req) { const h = req.headers['authorization'] || ''; return h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-session'] || null); }",
      "",
      "// middleware: attaches req.user; throws 401 unless optional",
      "async function attachUser(req) { req.user = await userFromToken(bearer(req)); return req.user; }",
      "function requireAuth(req) { if (!req.user) throw Object.assign(new Error('authentication required'), { status: 401 }); return req.user; }",
      "function requireRole(req, role) { requireAuth(req); if (req.user.role !== role && req.user.role !== 'admin') throw Object.assign(new Error('forbidden'), { status: 403 }); return req.user; }",
      "// authorization helper: a row is the caller's iff it has no owner column or the owner matches (admins bypass)",
      "function ownsRow(user, row, ownerField) {",
      "  ownerField = ownerField || 'ownerId';",
      "  if (!row || row[ownerField] == null) return true;",
      "  return user && (user.role === 'admin' || String(row[ownerField]) === String(user.id));",
      "}"
    ];
  }

  /* ---------------- TOTP (RFC 6238) — MFA ---------------- */
  function totpCode() {
    return [
      "",
      "/* ---- TOTP MFA (RFC 6238, HMAC-SHA1, 30s step) ---- */",
      "const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';",
      "function b32encode(buf) {",
      "  let bits = 0, val = 0, out = '';",
      "  for (const byte of buf) { val = (val << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }",
      "  if (bits > 0) out += B32[(val << (5 - bits)) & 31];",
      "  return out;",
      "}",
      "function b32decode(str) {",
      "  str = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\\s/g, '');",
      "  let bits = 0, val = 0; const out = [];",
      "  for (const c of str) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }",
      "  return Buffer.from(out);",
      "}",
      "function hotp(secretBuf, counter) {",
      "  const buf = Buffer.alloc(8); buf.writeBigInt64BE(BigInt(counter));",
      "  const h = crypto.createHmac('sha1', secretBuf).update(buf).digest();",
      "  const off = h[h.length - 1] & 0xf;",
      "  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];",
      "  return String(bin % 1000000).padStart(6, '0');",
      "}",
      "function totp(secretB32, atMs) {",
      "  const step = Math.floor((atMs || Date.now()) / 1000 / 30);",
      "  return hotp(b32decode(secretB32), step);",
      "}",
      "function totpVerify(secretB32, token, atMs) {",
      "  token = String(token || '').replace(/\\s/g, '');",
      "  if (!/^\\d{6}$/.test(token)) return false;",
      "  const now = atMs || Date.now();",
      "  for (let w = -1; w <= 1; w++) { if (crypto.timingSafeEqual(Buffer.from(totp(secretB32, now + w * 30000)), Buffer.from(token))) return true; }",
      "  return false;",
      "}",
      "function newBackupCodes(n) { const c = []; for (let i = 0; i < (n || 8); i++) c.push(crypto.randomBytes(5).toString('hex')); return c; }",
      "async function verifyTotpForUser(user, code) {",
      "  if (!user || !user.totpSecret) return false;",
      "  if (totpVerify(user.totpSecret, code)) return true;",
      "  // one-time backup code",
      "  let codes = []; try { codes = JSON.parse(user.backupCodes || '[]'); } catch (_) {}",
      "  const idx = codes.indexOf(String(code || '').trim());",
      "  if (idx >= 0) { codes.splice(idx, 1); await db.update('user', user.id, { backupCodes: JSON.stringify(codes) }); return true; }",
      "  return false;",
      "}",
      "async function mfaSetup(user) {",
      "  const secret = b32encode(crypto.randomBytes(20));",
      "  await db.update('user', user.id, { totpSecret: secret, totpEnabled: false });",
      "  const label = encodeURIComponent((process.env.APP_NAME || 'app') + ':' + user.email);",
      "  return { secret, otpauthUrl: 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent(process.env.APP_NAME || 'app') };",
      "}",
      "async function mfaEnable(user, code) {",
      "  const fresh = await db.get('user', user.id);",
      "  if (!fresh || !fresh.totpSecret) throw Object.assign(new Error('run mfa setup first'), { status: 400 });",
      "  if (!totpVerify(fresh.totpSecret, code)) throw Object.assign(new Error('code did not verify'), { status: 400 });",
      "  const backup = newBackupCodes(8);",
      "  await db.update('user', user.id, { totpEnabled: true, backupCodes: JSON.stringify(backup) });",
      "  return { enabled: true, backupCodes: backup };",
      "}",
      "async function mfaDisable(user, code) {",
      "  const fresh = await db.get('user', user.id);",
      "  if (fresh && fresh.totpEnabled && !(await verifyTotpForUser(fresh, code))) throw Object.assign(new Error('code required to disable MFA'), { status: 400 });",
      "  await db.update('user', user.id, { totpEnabled: false, totpSecret: null, backupCodes: null });",
      "  return { enabled: false };",
      "}"
    ];
  }

  /* ---------------- OAuth 2.0 (Authorization Code + PKCE) ---------------- */
  function oauthCode() {
    return [
      "",
      "/* ---- OAuth 2.0 — Authorization Code + PKCE (google / github) ---- */",
      "const OAUTH_PROVIDERS = {",
      "  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',",
      "    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile', emailField: 'email', subField: 'sub' },",
      "  github: { authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token',",
      "    userinfo: 'https://api.github.com/user', scope: 'read:user user:email', emailField: 'email', subField: 'id' }",
      "};",
      "const _oauthState = new Map();  // state -> { verifier, provider, at }",
      "function _redirectUri(req, provider) {",
      "  const proto = (req.headers['x-forwarded-proto'] || 'http');",
      "  const host = req.headers['host'] || ('localhost:' + (process.env.PORT || 4319));",
      "  return process.env.OAUTH_REDIRECT_BASE ? (process.env.OAUTH_REDIRECT_BASE.replace(/\\/$/, '') + '/api/auth/oauth/' + provider + '/callback')",
      "    : (proto + '://' + host + '/api/auth/oauth/' + provider + '/callback');",
      "}",
      "function _oauthCfg(provider) {",
      "  const P = OAUTH_PROVIDERS[provider]; if (!P) return null;",
      "  const id = process.env['OAUTH_' + provider.toUpperCase() + '_CLIENT_ID'];",
      "  const secret = process.env['OAUTH_' + provider.toUpperCase() + '_CLIENT_SECRET'];",
      "  return { P, id, secret };",
      "}",
      "function oauthStart(req, res, provider, send) {",
      "  const c = _oauthCfg(provider);",
      "  if (!c) { send(res, 404, { error: 'unknown oauth provider' }); return true; }",
      "  if (!c.id || !c.secret) { send(res, 501, { error: 'oauth not configured', need: ['OAUTH_' + provider.toUpperCase() + '_CLIENT_ID', 'OAUTH_' + provider.toUpperCase() + '_CLIENT_SECRET'] }); return true; }",
      "  const verifier = crypto.randomBytes(32).toString('base64url');",
      "  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');",
      "  const state = crypto.randomBytes(16).toString('hex');",
      "  _oauthState.set(state, { verifier, provider, at: Date.now() });",
      "  for (const [k, v] of _oauthState) if (Date.now() - v.at > 600000) _oauthState.delete(k);",
      "  const u = new URL(c.P.authorize);",
      "  u.searchParams.set('client_id', c.id);",
      "  u.searchParams.set('redirect_uri', _redirectUri(req, provider));",
      "  u.searchParams.set('response_type', 'code');",
      "  u.searchParams.set('scope', c.P.scope);",
      "  u.searchParams.set('state', state);",
      "  u.searchParams.set('code_challenge', challenge);",
      "  u.searchParams.set('code_challenge_method', 'S256');",
      "  res.writeHead(302, { location: u.toString() }); res.end(); return true;",
      "}",
      "function _postForm(urlStr, form) {",
      "  return new Promise((resolve, reject) => {",
      "    const u = new URL(urlStr); const lib = u.protocol === 'https:' ? require('https') : require('http');",
      "    const body = new URLSearchParams(form).toString();",
      "    const rq = lib.request(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'content-length': Buffer.byteLength(body) } }, (rs) => {",
      "      let d = ''; rs.on('data', (c) => d += c); rs.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve(Object.fromEntries(new URLSearchParams(d))); } });",
      "    });",
      "    rq.on('error', reject); rq.end(body);",
      "  });",
      "}",
      "function _getJson(urlStr, token) {",
      "  return new Promise((resolve, reject) => {",
      "    const u = new URL(urlStr); const lib = u.protocol === 'https:' ? require('https') : require('http');",
      "    const rq = lib.request(u, { headers: { authorization: 'Bearer ' + token, accept: 'application/json', 'user-agent': 'codesovereign-app' } }, (rs) => {",
      "      let d = ''; rs.on('data', (c) => d += c); rs.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({}); } });",
      "    });",
      "    rq.on('error', reject); rq.end();",
      "  });",
      "}",
      "async function oauthCallback(req, res, provider, query, send) {",
      "  const c = _oauthCfg(provider);",
      "  if (!c || !c.id || !c.secret) { send(res, 501, { error: 'oauth not configured' }); return true; }",
      "  const st = _oauthState.get(query.state);",
      "  if (!st || st.provider !== provider) { send(res, 400, { error: 'invalid oauth state' }); return true; }",
      "  _oauthState.delete(query.state);",
      "  if (!query.code) { send(res, 400, { error: 'missing code' }); return true; }",
      "  let tok;",
      "  try {",
      "    tok = await _postForm(c.P.token, { client_id: c.id, client_secret: c.secret, code: query.code,",
      "      redirect_uri: _redirectUri(req, provider), grant_type: 'authorization_code', code_verifier: st.verifier });",
      "  } catch (e) { send(res, 502, { error: 'token exchange failed: ' + e.message }); return true; }",
      "  if (!tok || !tok.access_token) { send(res, 502, { error: 'no access token', detail: tok && tok.error }); return true; }",
      "  let profile = {};",
      "  try { profile = await _getJson(c.P.userinfo, tok.access_token); } catch (_) {}",
      "  const sub = String(profile[c.P.subField] || profile.sub || profile.id || '');",
      "  let email = String(profile[c.P.emailField] || profile.email || '').toLowerCase();",
      "  if (!email && provider === 'github') { try { const es = await _getJson('https://api.github.com/user/emails', tok.access_token); const p = (Array.isArray(es) ? es : []).find((x) => x.primary) || (Array.isArray(es) ? es[0] : null); if (p) email = String(p.email).toLowerCase(); } catch (_) {} }",
      "  if (!sub) { send(res, 502, { error: 'oauth profile had no subject id' }); return true; }",
      "  let user = (await db.list('user', { where: { oauthProvider: provider, oauthSubject: sub } })).rows[0];",
      "  if (!user && email) user = (await db.list('user', { where: { email } })).rows[0];",
      "  if (!user) {",
      "    const first = (await db.list('user', { limit: 1 })).total === 0;",
      "    user = await db.create('user', { email: email || (provider + '_' + sub + '@oauth.local'), role: first ? 'admin' : 'user', oauthProvider: provider, oauthSubject: sub });",
      "  } else if (!user.oauthProvider) {",
      "    await db.update('user', user.id, { oauthProvider: provider, oauthSubject: sub });",
      "  }",
      "  const sess = await sessionFor(user);",
      "  const dest = (process.env.OAUTH_SUCCESS_REDIRECT || '/') + '#token=' + sess.token;",
      "  res.writeHead(302, { location: dest }); res.end(); return true;",
      "}"
    ];
  }

  /* ---------------- WebAuthn (FIDO2 passkeys) ---------------- */
  function webauthnCode() {
    return [
      "",
      "/* ---- WebAuthn / passkeys (FIDO2) — dependency-free CBOR + crypto.verify ---- */",
      "const _waChallenges = new Map();  // b64url challenge -> { userId?, email?, at }",
      "function _rpId(req) { return process.env.WEBAUTHN_RP_ID || String(req.headers['host'] || 'localhost').split(':')[0]; }",
      "function _origin(req) { return process.env.WEBAUTHN_ORIGIN || ((req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers['host'] || 'localhost')); }",
      "function _newChallenge(meta) { const ch = crypto.randomBytes(32).toString('base64url'); _waChallenges.set(ch, Object.assign({ at: Date.now() }, meta || {})); for (const [k, v] of _waChallenges) if (Date.now() - v.at > 300000) _waChallenges.delete(k); return ch; }",
      "// minimal CBOR decoder — WebAuthn attestation objects only need maps / byte-strings / text / ints / arrays",
      "function cborDecode(buf) {",
      "  let p = 0;",
      "  function read() {",
      "    const b = buf[p++]; const major = b >> 5; let len = b & 31;",
      "    if (len === 24) len = buf[p++]; else if (len === 25) { len = buf.readUInt16BE(p); p += 2; } else if (len === 26) { len = buf.readUInt32BE(p); p += 4; } else if (len === 27) { len = Number(buf.readBigUInt64BE(p)); p += 8; }",
      "    if (major === 0) return len;",
      "    if (major === 1) return -1 - len;",
      "    if (major === 2) { const v = buf.slice(p, p + len); p += len; return v; }",
      "    if (major === 3) { const v = buf.slice(p, p + len).toString('utf8'); p += len; return v; }",
      "    if (major === 4) { const a = []; for (let i = 0; i < len; i++) a.push(read()); return a; }",
      "    if (major === 5) { const m = new Map(); for (let i = 0; i < len; i++) { const k = read(); m.set(k, read()); } return m; }",
      "    if (major === 7) { if (len === 20) return false; if (len === 21) return true; if (len === 22) return null; return len; }",
      "    throw new Error('cbor: unsupported major ' + major);",
      "  }",
      "  return read();",
      "}",
      "function _parseAuthData(ad) {",
      "  const rpIdHash = ad.slice(0, 32); const flags = ad[32];",
      "  const counter = ad.readUInt32BE(33);",
      "  const out = { rpIdHash, flags, counter, userPresent: !!(flags & 1), userVerified: !!(flags & 4) };",
      "  if (flags & 64) {  // attested credential data present",
      "    let o = 37; o += 16; // aaguid",
      "    const idLen = ad.readUInt16BE(o); o += 2;",
      "    out.credentialId = ad.slice(o, o + idLen); o += idLen;",
      "    out.coseKey = cborDecode(ad.slice(o));",
      "  }",
      "  return out;",
      "}",
      "function _coseToPem(cose) {",
      "  const kty = cose.get(1); const alg = cose.get(3);",
      "  if (kty === 2) {  // EC2 / P-256",
      "    const x = cose.get(-2), y = cose.get(-3);",
      "    const jwk = { kty: 'EC', crv: 'P-256', x: Buffer.from(x).toString('base64url'), y: Buffer.from(y).toString('base64url') };",
      "    return { pem: crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }), alg: alg || -7 };",
      "  }",
      "  if (kty === 3) {  // RSA",
      "    const n = cose.get(-1), e = cose.get(-2);",
      "    const jwk = { kty: 'RSA', n: Buffer.from(n).toString('base64url'), e: Buffer.from(e).toString('base64url') };",
      "    return { pem: crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }), alg: alg || -257 };",
      "  }",
      "  throw new Error('unsupported COSE key type ' + kty);",
      "}",
      "async function passkeyRegisterOptions(user, req) {",
      "  const challenge = _newChallenge({ userId: user.id });",
      "  return { challenge, rp: { id: _rpId(req), name: process.env.APP_NAME || 'app' },",
      "    user: { id: Buffer.from(String(user.id)).toString('base64url'), name: user.email, displayName: user.email },",
      "    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],",
      "    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }, timeout: 60000, attestation: 'none' };",
      "}",
      "async function passkeyRegisterVerify(user, req, body) {",
      "  const clientData = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf8'));",
      "  const meta = _waChallenges.get(clientData.challenge);",
      "  if (!meta || meta.userId !== user.id) throw Object.assign(new Error('unknown or expired challenge'), { status: 400 });",
      "  _waChallenges.delete(clientData.challenge);",
      "  if (clientData.type !== 'webauthn.create') throw Object.assign(new Error('wrong clientData type'), { status: 400 });",
      "  if (clientData.origin !== _origin(req)) throw Object.assign(new Error('origin mismatch'), { status: 400 });",
      "  const att = cborDecode(Buffer.from(body.response.attestationObject, 'base64url'));",
      "  const parsed = _parseAuthData(att.get('authData'));",
      "  if (!parsed.userPresent) throw Object.assign(new Error('user not present'), { status: 400 });",
      "  if (parsed.rpIdHash.toString('hex') !== crypto.createHash('sha256').update(_rpId(req)).digest('hex')) throw Object.assign(new Error('rpId hash mismatch'), { status: 400 });",
      "  const { pem, alg } = _coseToPem(parsed.coseKey);",
      "  const credentialId = Buffer.from(parsed.credentialId).toString('base64url');",
      "  const existing = (await db.list('webauthn_credential', { where: { credentialId } })).rows[0];",
      "  if (existing) throw Object.assign(new Error('credential already registered'), { status: 409 });",
      "  await db.create('webauthn_credential', { userId: user.id, credentialId, publicKeyPem: pem, alg, counter: parsed.counter });",
      "  return { registered: true, credentialId };",
      "}",
      "async function passkeyLoginOptions(email, req) {",
      "  email = String(email || '').trim().toLowerCase();",
      "  const user = (await db.list('user', { where: { email } })).rows[0];",
      "  const creds = user ? (await db.list('webauthn_credential', { where: { userId: user.id } })).rows : [];",
      "  const challenge = _newChallenge({ email });",
      "  return { challenge, rpId: _rpId(req), timeout: 60000, userVerification: 'preferred',",
      "    allowCredentials: creds.map((c) => ({ type: 'public-key', id: c.credentialId })) };",
      "}",
      "async function passkeyLoginVerify(req, body) {",
      "  const clientData = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf8'));",
      "  const meta = _waChallenges.get(clientData.challenge);",
      "  if (!meta) throw Object.assign(new Error('unknown or expired challenge'), { status: 400 });",
      "  _waChallenges.delete(clientData.challenge);",
      "  if (clientData.type !== 'webauthn.get') throw Object.assign(new Error('wrong clientData type'), { status: 400 });",
      "  if (clientData.origin !== _origin(req)) throw Object.assign(new Error('origin mismatch'), { status: 400 });",
      "  const credentialId = String(body.id || body.rawId || '');",
      "  const cred = (await db.list('webauthn_credential', { where: { credentialId } })).rows[0];",
      "  if (!cred) throw Object.assign(new Error('unknown credential'), { status: 400 });",
      "  const authData = Buffer.from(body.response.authenticatorData, 'base64url');",
      "  const parsed = _parseAuthData(authData);",
      "  if (!parsed.userPresent) throw Object.assign(new Error('user not present'), { status: 400 });",
      "  if (parsed.rpIdHash.toString('hex') !== crypto.createHash('sha256').update(_rpId(req)).digest('hex')) throw Object.assign(new Error('rpId hash mismatch'), { status: 400 });",
      "  const signedData = Buffer.concat([authData, crypto.createHash('sha256').update(Buffer.from(body.response.clientDataJSON, 'base64url')).digest()]);",
      "  const sig = Buffer.from(body.response.signature, 'base64url');",
      "  const algo = cred.alg === -257 ? 'RSA-SHA256' : 'sha256';",
      "  const ok = crypto.verify(algo, signedData, cred.publicKeyPem, sig);",
      "  if (!ok) throw Object.assign(new Error('assertion signature invalid'), { status: 401 });",
      "  if (parsed.counter > 0 && cred.counter > 0 && parsed.counter <= cred.counter) throw Object.assign(new Error('possible cloned authenticator (counter did not advance)'), { status: 401 });",
      "  await db.update('webauthn_credential', cred.id, { counter: parsed.counter });",
      "  const user = await db.get('user', cred.userId);",
      "  return sessionFor(user);",
      "}"
    ];
  }

  /* ---------------- the /api/auth/* dispatcher for the extra endpoints ---------------- */
  function routeDispatcher(f) {
    var L = [
      "",
      "/* ---- extra /api/auth/* endpoints (mfa / oauth / passkeys). Returns true if it handled the response. ---- */",
      "async function route(seg, req, res, ctx) {",
      "  // seg = ['api','auth', …];  ctx = { readBody, send, query }",
      "  const send = ctx.send, readBody = ctx.readBody, query = ctx.query || {};",
      "  const sub = seg.slice(2);",
      "  try {"
    ];
    if (f.mfa) {
      L.push(
        "    if (sub[0] === 'mfa') {",
        "      const me = requireAuth(req);",
        "      const fresh = await db.get('user', me.id);",
        "      if (sub[1] === 'setup' && req.method === 'POST') { send(res, 200, await mfaSetup(fresh)); return true; }",
        "      if (sub[1] === 'enable' && req.method === 'POST') { const b = await readBody(); send(res, 200, await mfaEnable(fresh, b.code)); return true; }",
        "      if (sub[1] === 'disable' && req.method === 'POST') { const b = await readBody(); send(res, 200, await mfaDisable(fresh, b.code)); return true; }",
        "      send(res, 404, { error: 'not found' }); return true;",
        "    }"
      );
    }
    if (f.oauth) {
      L.push(
        "    if (sub[0] === 'oauth' && sub[1]) {",
        "      const provider = sub[1];",
        "      if (sub[2] === 'callback') return oauthCallback(req, res, provider, query, send);",
        "      if (req.method === 'GET') return oauthStart(req, res, provider, send);",
        "      send(res, 405, { error: 'method not allowed' }); return true;",
        "    }"
      );
    }
    if (f.passkeys) {
      L.push(
        "    if (sub[0] === 'webauthn') {",
        "      if (sub[1] === 'register' && sub[2] === 'options' && req.method === 'POST') { const me = requireAuth(req); send(res, 200, await passkeyRegisterOptions(await db.get('user', me.id), req)); return true; }",
        "      if (sub[1] === 'register' && sub[2] === 'verify' && req.method === 'POST') { const me = requireAuth(req); const b = await readBody(); send(res, 200, await passkeyRegisterVerify(await db.get('user', me.id), req, b)); return true; }",
        "      if (sub[1] === 'login' && sub[2] === 'options' && req.method === 'POST') { const b = await readBody(); send(res, 200, await passkeyLoginOptions(b.email, req)); return true; }",
        "      if (sub[1] === 'login' && sub[2] === 'verify' && req.method === 'POST') { const b = await readBody(); send(res, 200, await passkeyLoginVerify(req, b)); return true; }",
        "      send(res, 404, { error: 'not found' }); return true;",
        "    }"
      );
    }
    L.push(
      "    return false;",
      "  } catch (e) {",
      "    send(res, e.status || 500, { error: e.message, code: e.code || undefined });",
      "    return true;",
      "  }",
      "}"
    );
    return L;
  }

  function exportsLine(f) {
    var names = ['register', 'login', 'logout', 'userFromToken', 'attachUser', 'requireAuth', 'requireRole',
      'hash', 'verifyPassword', 'bearer', 'ownsRow', 'route'];
    if (f.mfa) names.push('totp', 'totpVerify', 'verifyTotpForUser', 'mfaSetup', 'mfaEnable', 'mfaDisable');
    if (f.oauth) names.push('oauthStart', 'oauthCallback', 'OAUTH_PROVIDERS');
    if (f.passkeys) names.push('passkeyRegisterOptions', 'passkeyRegisterVerify', 'passkeyLoginOptions', 'passkeyLoginVerify', 'cborDecode');
    return 'module.exports = { ' + names.join(', ') + ' };';
  }

  function module(spec) {
    var f = features(spec);
    var lines = baseModule();
    if (f.mfa) lines = lines.concat(totpCode());
    if (f.oauth) lines = lines.concat(oauthCode());
    if (f.passkeys) lines = lines.concat(webauthnCode());
    lines = lines.concat(routeDispatcher(f));
    // stub `route` when no feature is active so the backend can always call it
    if (!f.mfa && !f.oauth && !f.passkeys) {
      lines.push("", "// no extra auth methods enabled for this app", "async function route() { return false; }");
    }
    lines.push("", exportsLine(f), "");
    return lines.join('\n');
  }

  function routes() {
    return [
      { method: 'POST', path: '/api/auth/register', handler: 'auth.register', body: ['email', 'password'], returns: 201, public: true },
      { method: 'POST', path: '/api/auth/login', handler: 'auth.login', body: ['email', 'password', 'code'], returns: 200, public: true },
      { method: 'POST', path: '/api/auth/logout', handler: 'auth.logout', returns: 200, public: true },
      { method: 'GET', path: '/api/auth/me', handler: 'auth.me', returns: 200, public: true }
    ];
  }

  function uiFragment(spec) {
    var f = features(spec);
    var oauthBtns = f.oauth
      ? '    <div class="oauth-buttons">\n' +
        '      <a class="oauth-btn" href="/api/auth/oauth/google">Continue with Google</a>\n' +
        '      <a class="oauth-btn" href="/api/auth/oauth/github">Continue with GitHub</a>\n' +
        '    </div>\n'
      : '';
    var mfaField = f.mfa
      ? '      <label for="authCode" id="authCodeLabel" hidden>Authenticator code</label>\n' +
        '      <input id="authCode" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" aria-label="authenticator code" hidden>\n'
      : '';
    var passkeyBtn = f.passkeys
      ? '      <button type="button" id="passkeyBtn">Sign in with a passkey</button>\n'
      : '';
    var appBarExtra = (f.mfa || f.passkeys)
      ? '    <div class="security-actions">' +
        (f.mfa ? '<button id="mfaSetupBtn" type="button">Set up two-factor auth</button>' : '') +
        (f.passkeys ? '<button id="addPasskeyBtn" type="button">Add a passkey</button>' : '') +
        '</div>\n'
      : '';
    return {
      html:
        '  <section id="authPanel" class="card" aria-labelledby="authHeading">\n' +
        '    <h2 id="authHeading" data-i18n="auth.heading">Sign in</h2>\n' +
        oauthBtns +
        '    <form id="authForm">\n' +
        '      <label for="authEmail" data-i18n="auth.email">Email</label>\n' +
        '      <input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required aria-label="email" data-i18n-attr="aria-label:auth.email">\n' +
        '      <label for="authPass" data-i18n="auth.password">Password</label>\n' +
        '      <input id="authPass" type="password" autocomplete="current-password" placeholder="password (8+ chars)" required aria-label="password" data-i18n-attr="aria-label:auth.password">\n' +
        mfaField +
        '      <button type="submit" id="authSubmit" data-i18n="auth.signIn">Sign in</button>\n' +
        '      <button type="button" id="authToggle" data-i18n="auth.register">Need an account?</button>\n' +
        passkeyBtn +
        '    </form>\n' +
        '    <div id="authError" class="error" hidden></div>\n' +
        '  </section>\n' +
        '  <section id="appPanel" hidden>\n' +
        '    <div class="userbar"><span id="whoami"></span> <button id="logoutBtn" type="button" data-i18n="auth.signOut">Log out</button></div>\n' +
        appBarExtra +
        '  </section>\n',
      js: [
        "const AUTH = { token: localStorage.getItem('token') || null, mode: 'login' };",
        "// OAuth success redirects back with #token=… — pick it up",
        "if (location.hash.indexOf('token=') >= 0) { try { const t = new URLSearchParams(location.hash.slice(1)).get('token'); if (t) { AUTH.token = t; localStorage.setItem('token', t); history.replaceState(null, '', location.pathname); } } catch (_) {} }",
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
        "  const codeEl = document.getElementById('authCode');",
        "  try {",
        "    const payload = { email: document.getElementById('authEmail').value, password: document.getElementById('authPass').value };",
        "    if (codeEl && codeEl.value) payload.code = codeEl.value;",
        "    const res = await fetch('/api/auth/' + AUTH.mode, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });",
        "    const j = await res.json();",
        "    if (!res.ok) {",
        "      if (j.code === 'MFA_REQUIRED' && codeEl) { codeEl.hidden = false; document.getElementById('authCodeLabel').hidden = false; codeEl.focus(); throw new Error('Enter your authenticator code'); }",
        "      throw new Error(j.error || 'failed');",
        "    }",
        "    AUTH.token = j.token; localStorage.setItem('token', j.token);",
        "    if (codeEl) { codeEl.hidden = true; codeEl.value = ''; document.getElementById('authCodeLabel').hidden = true; }",
        "    await refreshAuth();",
        "  } catch (e2) { err.textContent = e2.message; err.hidden = false; } finally { btn.disabled = false; }",
        "});",
        "document.getElementById('logoutBtn').addEventListener('click', async () => {",
        "  await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});",
        "  AUTH.token = null; localStorage.removeItem('token'); await refreshAuth();",
        "});",
        f.mfa
          ? "const _mfaBtn = document.getElementById('mfaSetupBtn'); if (_mfaBtn) _mfaBtn.addEventListener('click', async () => {\n" +
            "  const s = await fetch('/api/auth/mfa/setup', { method: 'POST', headers: authHeaders() }).then((r) => r.json());\n" +
            "  const code = prompt('Add this secret to your authenticator app, then enter the 6-digit code:\\n\\n' + s.secret);\n" +
            "  if (!code) return;\n" +
            "  const r = await fetch('/api/auth/mfa/enable', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ code }) }).then((x) => x.json());\n" +
            "  alert(r.enabled ? ('Two-factor auth is on. Backup codes:\\n' + (r.backupCodes || []).join('\\n')) : ('Could not enable: ' + (r.error || 'unknown')));\n" +
            "});"
          : "",
        f.passkeys
          ? "function _b64urlToBuf(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)); }\n" +
            "function _bufToB64url(b) { return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }\n" +
            "const _addPk = document.getElementById('addPasskeyBtn'); if (_addPk) _addPk.addEventListener('click', async () => {\n" +
            "  try {\n" +
            "    const opt = await fetch('/api/auth/webauthn/register/options', { method: 'POST', headers: authHeaders() }).then((r) => r.json());\n" +
            "    opt.challenge = _b64urlToBuf(opt.challenge); opt.user.id = _b64urlToBuf(opt.user.id);\n" +
            "    const cred = await navigator.credentials.create({ publicKey: opt });\n" +
            "    const body = { id: cred.id, rawId: _bufToB64url(cred.rawId), type: cred.type, response: {\n" +
            "      clientDataJSON: _bufToB64url(cred.response.clientDataJSON), attestationObject: _bufToB64url(cred.response.attestationObject) } };\n" +
            "    const r = await fetch('/api/auth/webauthn/register/verify', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }).then((x) => x.json());\n" +
            "    alert(r.registered ? 'Passkey added.' : ('Failed: ' + (r.error || 'unknown')));\n" +
            "  } catch (e) { alert('Passkey registration failed: ' + e.message); }\n" +
            "});\n" +
            "const _pkBtn = document.getElementById('passkeyBtn'); if (_pkBtn) _pkBtn.addEventListener('click', async () => {\n" +
            "  try {\n" +
            "    const email = document.getElementById('authEmail').value;\n" +
            "    const opt = await fetch('/api/auth/webauthn/login/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).then((r) => r.json());\n" +
            "    opt.challenge = _b64urlToBuf(opt.challenge);\n" +
            "    (opt.allowCredentials || []).forEach((c) => { c.id = _b64urlToBuf(c.id); });\n" +
            "    const asr = await navigator.credentials.get({ publicKey: opt });\n" +
            "    const body = { id: asr.id, rawId: _bufToB64url(asr.rawId), type: asr.type, response: {\n" +
            "      clientDataJSON: _bufToB64url(asr.response.clientDataJSON), authenticatorData: _bufToB64url(asr.response.authenticatorData),\n" +
            "      signature: _bufToB64url(asr.response.signature), userHandle: asr.response.userHandle ? _bufToB64url(asr.response.userHandle) : null } };\n" +
            "    const r = await fetch('/api/auth/webauthn/login/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());\n" +
            "    if (r.token) { AUTH.token = r.token; localStorage.setItem('token', r.token); await refreshAuth(); } else { throw new Error(r.error || 'failed'); }\n" +
            "  } catch (e) { const err = document.getElementById('authError'); err.textContent = 'Passkey sign-in failed: ' + e.message; err.hidden = false; }\n" +
            "});"
          : "",
        "refreshAuth();"
      ].filter(Boolean).join('\n')
    };
  }

  Engine.Auth = { entities: entities, module: module, routes: routes, uiFragment: uiFragment, features: features };
  console.info('[Auth] auth + RBAC + MFA/OAuth/passkeys generator ready — Engine.Auth');
})();
