/* =====================================================================
   engine.frontends.js  —  Engine.Frontends   (blueprint §11)

   Component-framework frontends for the generated app. Each variant emits
   a REAL, RUNNABLE `public/` the runtime observer can drive and a
   `test/frontend.test.js` that `runEvidence()` executes. No build step —
   the framework runtime is vendored into `public/vendor/`.

     react / preact  — a vendored React-compatible VDOM + hooks runtime
                       (`h` / `render` / `useState` / `useEffect` / …).
                       The component code is API-compatible with React and
                       Preact — `npm i preact` + change one import to swap.
     vue             — Vue 3 (Options + Composition API shape) on a small
                       vendored reactive runtime; `createApp({...})`.
     svelte / vanilla — handled by Engine.Scaffold (Svelte via the Vite
                        variant; vanilla is the default).

   window.Engine.Frontends
     KINDS
     generate(spec)   -> { 'public/…': content, 'test/frontend.test.js': … }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  var KINDS = ['react', 'preact', 'vue'];

  // Shared i18n bridge. Engine.Localize always ships public/i18n.js + the
  // per-locale catalogues; the component frontends load that runtime and route
  // every user-facing string through t(key, englishDefault). Before it resolves
  // (or with JS-disabled fallbacks) the English default renders — never a raw key.
  var I18N_BRIDGE =
    "var __w = (typeof window !== 'undefined') ? window : {};\n" +
    "function t(key, en) { try { return (__w.i18n && __w.t) ? (__w.t(key) || en) : en; } catch (_) { return en; } }\n" +
    "var i18nReady = (__w.i18n && __w.i18n.load) ? __w.i18n.load() : Promise.resolve();";

  /* ---------------------------------------------------------------- *
   *  Vendored React-compatible VDOM + hooks runtime (~220 lines).     *
   *  MIT — authored for CodeSovereign. Drop-in shape: `h`, Fragment,  *
   *  render, useState/useEffect/useRef/useMemo/useCallback.           *
   * ---------------------------------------------------------------- */
  function vdomRuntime() {
    return [
      "/* CodeSovereign vendored VDOM + hooks — React/Preact-compatible surface. MIT. */",
      "(function (global) {",
      "  'use strict';",
      "  var Fragment = function (p) { return p.children; };",
      "  function h(type, props) {",
      "    var children = [].slice.call(arguments, 2);",
      "    props = props || {};",
      "    if (children.length) props.children = children.length === 1 ? children[0] : children;",
      "    return { type: type, props: props, key: props.key != null ? props.key : null };",
      "  }",
      "  var _cur = null, _idx = 0;",
      "  function mkHooks() { return { state: [], effects: [], cleanups: [], mounted: false }; }",
      "  function useState(init) {",
      "    var c = _cur, i = _idx++;",
      "    if (c.hooks.state.length <= i) c.hooks.state[i] = typeof init === 'function' ? init() : init;",
      "    var set = function (v) {",
      "      var nv = typeof v === 'function' ? v(c.hooks.state[i]) : v;",
      "      if (nv === c.hooks.state[i]) return;",
      "      c.hooks.state[i] = nv; scheduleRender(c);",
      "    };",
      "    return [c.hooks.state[i], set];",
      "  }",
      "  function useRef(init) { var c = _cur, i = _idx++; if (c.hooks.state.length <= i) c.hooks.state[i] = { current: init }; return c.hooks.state[i]; }",
      "  function depsChanged(a, b) { if (!a || !b || a.length !== b.length) return true; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return true; return false; }",
      "  function useMemo(fn, deps) {",
      "    var c = _cur, i = _idx++; var prev = c.hooks.state[i];",
      "    if (!prev || depsChanged(prev.deps, deps)) c.hooks.state[i] = { deps: deps, value: fn() };",
      "    return c.hooks.state[i].value;",
      "  }",
      "  function useCallback(fn, deps) { return useMemo(function () { return fn; }, deps); }",
      "  function useEffect(fn, deps) {",
      "    var c = _cur, i = _idx++;",
      "    var prev = c.hooks.effects[i];",
      "    if (!prev || depsChanged(prev.deps, deps)) c.hooks.effects[i] = { deps: deps, fn: fn, run: true };",
      "    else c.hooks.effects[i] = { deps: deps, fn: fn, run: false };",
      "  }",
      "  var _queue = [], _scheduled = false;",
      "  function scheduleRender(inst) {",
      "    if (_queue.indexOf(inst) < 0) _queue.push(inst);",
      "    if (_scheduled) return; _scheduled = true;",
      "    (typeof queueMicrotask === 'function' ? queueMicrotask : function (f) { setTimeout(f, 0); })(flush);",
      "  }",
      "  function flush() {",
      "    _scheduled = false; var q = _queue.slice(); _queue.length = 0;",
      "    q.forEach(function (inst) { if (inst.dom && inst.dom.parentNode) rerender(inst); });",
      "  }",
      "  function runEffects(inst) {",
      "    inst.hooks.effects.forEach(function (e, i) {",
      "      if (!e || !e.run) return;",
      "      var cl = inst.hooks.cleanups[i]; if (typeof cl === 'function') { try { cl(); } catch (_) {} }",
      "      var r = e.fn(); inst.hooks.cleanups[i] = typeof r === 'function' ? r : null;",
      "    });",
      "  }",
      "  function unmount(inst) {",
      "    if (!inst) return;",
      "    (inst.hooks.cleanups || []).forEach(function (cl) { if (typeof cl === 'function') { try { cl(); } catch (_) {} } });",
      "    (inst.children || []).forEach(unmount);",
      "  }",
      "  function setProp(el, k, v, old) {",
      "    if (k === 'children' || k === 'key') return;",
      "    if (k === 'ref') { if (typeof v === 'function') v(el); else if (v) v.current = el; return; }",
      "    if (/^on[A-Z]/.test(k)) { var ev = k.slice(2).toLowerCase(); if (old) el.removeEventListener(ev, old); if (v) el.addEventListener(ev, v); return; }",
      "    if (k === 'className') k = 'class';",
      "    if (k === 'style' && v && typeof v === 'object') { el.style.cssText = ''; for (var s in v) el.style[s] = v[s]; return; }",
      "    if (k === 'value' || k === 'checked') { el[k] = v; return; }",
      "    if (v == null || v === false) el.removeAttribute(k); else el.setAttribute(k, v === true ? '' : v);",
      "  }",
      "  function create(vnode, parentInst) {",
      "    if (vnode == null || vnode === false || vnode === true) return document.createComment('');",
      "    if (typeof vnode === 'string' || typeof vnode === 'number') return document.createTextNode(String(vnode));",
      "    if (Array.isArray(vnode)) { var f = document.createDocumentFragment(); vnode.forEach(function (c) { f.appendChild(create(c, parentInst)); }); return f; }",
      "    if (typeof vnode.type === 'function') {",
      "      var inst = { fn: vnode.type, props: vnode.props, hooks: mkHooks(), dom: null, tree: null, children: [], parent: parentInst };",
      "      var prevCur = _cur, prevIdx = _idx; _cur = inst; _idx = 0;",
      "      var out = vnode.type(vnode.props);",
      "      _cur = prevCur; _idx = prevIdx;",
      "      inst.tree = out;",
      "      var dom = create(out, inst); inst.dom = dom;",
      "      inst.hooks.mounted = true; runEffects(inst);",
      "      return dom;",
      "    }",
      "    var el = document.createElement(vnode.type);",
      "    for (var k in vnode.props) setProp(el, k, vnode.props[k]);",
      "    var kids = vnode.props.children;",
      "    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) { el.appendChild(create(c, parentInst)); });",
      "    return el;",
      "  }",
      "  function rerender(inst) {",
      "    var prevCur = _cur, prevIdx = _idx; _cur = inst; _idx = 0;",
      "    var out = inst.fn(inst.props);",
      "    _cur = prevCur; _idx = prevIdx;",
      "    inst.tree = out;",
      "    var fresh = create(out, inst);",
      "    if (inst.dom && inst.dom.parentNode) { inst.dom.parentNode.replaceChild(fresh, inst.dom); }",
      "    inst.dom = fresh;",
      "    runEffects(inst);",
      "  }",
      "  var _root = null;",
      "  function render(vnode, container) {",
      "    if (_root) unmount(_root);",
      "    container.innerHTML = '';",
      "    var inst = { fn: function () { return vnode; }, props: {}, hooks: mkHooks(), dom: null };",
      "    _cur = inst; _idx = 0;",
      "    var dom = create(vnode, inst); inst.dom = dom;",
      "    container.appendChild(dom);",
      "    _root = inst; _cur = null;",
      "  }",
      "  var api = { h: h, Fragment: Fragment, render: render, useState: useState, useEffect: useEffect, useRef: useRef, useMemo: useMemo, useCallback: useCallback, createElement: h };",
      "  global.CSDom = api;",
      "  if (typeof module !== 'undefined' && module.exports) module.exports = api;",
      "})(typeof window !== 'undefined' ? window : globalThis);",
      ""
    ].join('\n');
  }

  // A tiny Vue-3-shaped reactive runtime: `createApp({ setup, template })`.
  function vueRuntime() {
    return [
      "/* CodeSovereign vendored reactive runtime — Vue-3-shaped surface. MIT. */",
      "(function (global) {",
      "  'use strict';",
      "  var activeEffect = null;",
      "  function reactive(obj) {",
      "    var deps = {};",
      "    return new Proxy(obj, {",
      "      get: function (t, k) { if (activeEffect) { (deps[k] = deps[k] || new Set()).add(activeEffect); } var v = t[k]; return (v && typeof v === 'object') ? reactive(v) : v; },",
      "      set: function (t, k, v) { t[k] = v; (deps[k] || new Set()).forEach(function (fn) { fn(); }); return true; }",
      "    });",
      "  }",
      "  function ref(v) { var r = reactive({ value: v }); return r; }",
      "  function computed(getter) { var r = ref(undefined); watchEffect(function () { r.value = getter(); }); return r; }",
      "  function watchEffect(fn) { var run = function () { activeEffect = run; try { fn(); } finally { activeEffect = null; } }; run(); }",
      "  function h(tag, props, children) {",
      "    props = props || {}; children = children == null ? [] : (Array.isArray(children) ? children : [children]);",
      "    return { tag: tag, props: props, children: children };",
      "  }",
      "  function mountVNode(vn, parent) {",
      "    if (vn == null || vn === false) return;",
      "    if (typeof vn === 'string' || typeof vn === 'number') { parent.appendChild(document.createTextNode(String(vn))); return; }",
      "    var el = document.createElement(vn.tag);",
      "    for (var k in vn.props) {",
      "      var val = vn.props[k];",
      "      if (/^on[A-Z]/.test(k)) el.addEventListener(k.slice(2).toLowerCase(), val);",
      "      else if (k === 'class') el.className = val;",
      "      else if (k === 'value') el.value = val;",
      "      else if (val != null && val !== false) el.setAttribute(k, val === true ? '' : val);",
      "    }",
      "    vn.children.forEach(function (c) { mountVNode(c, el); });",
      "    parent.appendChild(el);",
      "  }",
      "  function createApp(options) {",
      "    return {",
      "      mount: function (sel) {",
      "        var root = typeof sel === 'string' ? document.querySelector(sel) : sel;",
      "        var ctx = options.setup ? options.setup() : {};",
      "        var renderFn = options.render || function () { return options.template ? options.template(ctx, h) : h('div', {}, ['(no template)']); };",
      "        watchEffect(function () { root.innerHTML = ''; var tree = renderFn(ctx, h); mountVNode(tree, root); });",
      "        return ctx;",
      "      }",
      "    };",
      "  }",
      "  global.CSVue = { createApp: createApp, reactive: reactive, ref: ref, computed: computed, h: h, watchEffect: watchEffect };",
      "  if (typeof module !== 'undefined' && module.exports) module.exports = global.CSVue;",
      "})(typeof window !== 'undefined' ? window : globalThis);",
      ""
    ].join('\n');
  }

  /* ---------------- React/Preact app ---------------- */
  function reactApp(s) {
    var ents = s.entities.filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; });
    var auth = !!s.auth;
    var html =
      '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + s.name + '</title>\n' +
      '<link rel="stylesheet" href="design-tokens.css">\n<link rel="stylesheet" href="app.css">\n</head>\n<body>\n' +
      '<a href="#root" class="skip-link" data-i18n="app.skipToContent">Skip to content</a>\n' +
      '<header><img src="logo.svg" alt="' + s.name + ' logo" width="40" height="40"></header>\n' +
      '<main id="root"></main>\n' +
      '<script src="i18n.js"></script>\n<script src="vendor/vdom.js"></script>\n<script src="app.js"></script>\n</body>\n</html>\n';
    var js = [
      "'use strict';",
      "/* " + s.name + " — a " + (s.frontend || 'react') + " component app on the vendored React-compatible runtime. */",
      "var h = CSDom.h, Fragment = CSDom.Fragment, render = CSDom.render, useState = CSDom.useState, useEffect = CSDom.useEffect;",
      I18N_BRIDGE,
      "",
      "function api(path, opts) {",
      "  opts = opts || {};",
      "  var headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});",
      "  var tok = localStorage.getItem('token');",
      "  if (tok) headers.authorization = 'Bearer ' + tok;",
      "  return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) {",
      "    return r.text().then(function (bt) { var j = null; try { j = JSON.parse(bt); } catch (_) {} return { ok: r.ok, status: r.status, body: j }; });",
      "  });",
      "}",
      "",
      auth ? authComponent() : "",
      ents.map(entityComponent).join('\n'),
      "",
      "function App() {",
      auth
        ? "  var s = useState(!!localStorage.getItem('token')); var authed = s[0], setAuthed = s[1];\n" +
          "  if (!authed) return h(Auth, { onAuthed: function () { setAuthed(true); } });\n" +
          "  return h(Fragment, null,\n" +
          "    h('header', { className: 'bar' }, h('h1', null, t('app.title', '" + s.name + "')), h('button', { onClick: function () { localStorage.removeItem('token'); setAuthed(false); } }, t('auth.signOut', 'Sign out'))),\n" +
          "    " + ents.map(function (e) { return "h(" + cap(e.name) + "Panel, null)"; }).join(',\n    ') + "\n  );"
        : "  return h(Fragment, null,\n    h('h1', null, t('app.title', '" + s.name + "')),\n    " + ents.map(function (e) { return "h(" + cap(e.name) + "Panel, null)"; }).join(',\n    ') + "\n  );",
      "}",
      "",
      "function __mount() { render(h(App, null), document.getElementById('root')); }",
      "__w.i18n ? i18nReady.then(__mount) : __mount();",
      ""
    ].filter(Boolean).join('\n');
    var css = frameworkCss();
    return { 'public/index.html': html, 'public/app.js': js, 'public/app.css': css, 'public/design-tokens.css': designTokens(), 'public/vendor/vdom.js': vdomRuntime(), 'public/logo.svg': logoSvg(s.name) };
  }

  function authComponent() {
    return [
      "function Auth(props) {",
      "  var m = useState('login'), mode = m[0], setMode = m[1];",
      "  var e = useState(''), email = e[0], setEmail = e[1];",
      "  var p = useState(''), pass = p[0], setPass = p[1];",
      "  var er = useState(null), err = er[0], setErr = er[1];",
      "  function submit(ev) {",
      "    ev.preventDefault(); setErr(null);",
      "    api('/api/auth/' + mode, { method: 'POST', body: JSON.stringify({ email: email, password: pass }) }).then(function (r) {",
      "      if (!r.ok) { setErr((r.body && r.body.error) || 'failed'); return; }",
      "      localStorage.setItem('token', r.body.token); props.onAuthed();",
      "    });",
      "  }",
      "  return h('section', { className: 'card auth', 'aria-label': 'sign in' },",
      "    h('h2', null, t('auth.heading', 'Sign in')),",
      "    h('form', { onSubmit: submit },",
      "      h('label', { htmlFor: 'fEmail' }, t('auth.email', 'Email')),",
      "      h('input', { id: 'fEmail', type: 'email', autocomplete: 'email', 'aria-label': t('auth.email', 'email'), placeholder: 'you@example.com', value: email, required: true, onInput: function (ev) { setEmail(ev.target.value); } }),",
      "      h('label', { htmlFor: 'fPass' }, t('auth.password', 'Password')),",
      "      h('input', { id: 'fPass', type: 'password', autocomplete: 'current-password', 'aria-label': t('auth.password', 'password'), placeholder: 'password (8+)', value: pass, required: true, onInput: function (ev) { setPass(ev.target.value); } }),",
      "      h('button', { type: 'submit' }, mode === 'login' ? t('auth.signIn', 'Sign in') : t('auth.register', 'Create account')),",
      "      h('button', { type: 'button', id: 'authToggle', onClick: function () { setMode(mode === 'login' ? 'register' : 'login'); } }, mode === 'login' ? 'Need an account?' : 'Have an account?')",
      "    ),",
      "    err ? h('div', { className: 'err' }, err) : null",
      "  );",
      "}",
      ""
    ].join('\n');
  }

  function entityComponent(e) {
    var fields = (e.fields || []).filter(function (f) { return ['id', 'timestamp'].indexOf(f.type) < 0 && !(f.type === 'ref' && f.ref === 'user'); });
    var C = cap(e.name);
    return [
      "function " + C + "Panel() {",
      "  var l = useState([]), rows = l[0], setRows = l[1];",
      "  var f = useState({}), form = f[0], setForm = f[1];",
      "  var er = useState(null), err = er[0], setErr = er[1];",
      "  function load() { api('/api/" + e.table + "?limit=100').then(function (r) { setRows((r.body && r.body.rows) || []); }); }",
      "  useEffect(function () { load(); }, []);",
      "  function add(ev) {",
      "    ev.preventDefault(); setErr(null);",
      "    api('/api/" + e.table + "', { method: 'POST', body: JSON.stringify(form) }).then(function (r) {",
      "      if (!r.ok) { setErr((r.body && r.body.error) || 'failed'); return; }",
      "      setForm({}); load();",
      "    });",
      "  }",
      "  function del(id) { api('/api/" + e.table + "/' + id, { method: 'DELETE' }).then(load); }",
      "  return h('section', { className: 'card', 'data-entity': '" + e.name + "' },",
      "    h('h2', null, t('entity." + e.name + "', '" + e.name + "')),",
      "    h('form', { className: 'create', onSubmit: add },",
      fields.map(function (fl) {
        var ftype = (fl.type === 'int' || fl.type === 'float') ? 'number' : (fl.type === 'bool' ? 'checkbox' : 'text');
        var lblKey = "field." + e.name + "." + fl.name;
        if (ftype === 'checkbox') return "      h('label', null, h('input', { type: 'checkbox', checked: !!form." + fl.name + ", onChange: function (ev) { setForm(Object.assign({}, form, { " + fl.name + ": ev.target.checked })); } }), ' ' + t('" + lblKey + "', '" + fl.name + "')),";
        return "      h('input', { type: '" + ftype + "', 'aria-label': t('" + lblKey + "', '" + fl.name + "'), placeholder: t('" + lblKey + "', '" + fl.name + "'), value: form." + fl.name + " || '', " + (fl.required ? "required: true, " : "") + "onInput: function (ev) { setForm(Object.assign({}, form, { " + fl.name + ": ev.target.value })); } }),";
      }).join('\n'),
      "      h('button', { type: 'submit' }, t('action.add', 'Add') + ' " + e.name + "')",
      "    ),",
      "    err ? h('div', { className: 'err' }, err) : null,",
      "    h('ul', { className: 'list' }, rows.length",
      "      ? rows.map(function (r) { return h('li', { key: r.id }, String(" + (fields[0] ? "r." + fields[0].name + " || ('#' + r.id)" : "'#' + r.id") + "), h('button', { onClick: function () { del(r.id); } }, t('action.delete', 'Delete'))); })",
      "      : h('li', { className: 'empty' }, t('list.empty', 'Nothing yet')))",
      "  );",
      "}",
      ""
    ].join('\n');
  }

  /* ---------------- Vue app ---------------- */
  function vueApp(s) {
    var ents = s.entities.filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; });
    var auth = !!s.auth;
    var first = ents[0];
    var firstFields = first ? (first.fields || []).filter(function (f) { return ['id', 'timestamp'].indexOf(f.type) < 0 && !(f.type === 'ref' && f.ref === 'user'); }) : [];
    var html =
      '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + s.name + '</title>\n<link rel="stylesheet" href="design-tokens.css">\n<link rel="stylesheet" href="app.css">\n</head>\n<body>\n' +
      '<a href="#app" class="skip-link" data-i18n="app.skipToContent">Skip to content</a>\n' +
      '<header><img src="logo.svg" alt="' + s.name + ' logo" width="40" height="40"></header>\n<main id="app"></main>\n' +
      '<script src="i18n.js"></script>\n<script src="vendor/vue-lite.js"></script>\n<script src="app.js"></script>\n</body>\n</html>\n';
    var js = [
      "'use strict';",
      "/* " + s.name + " — a Vue-shaped component app on the vendored reactive runtime. */",
      "var createApp = CSVue.createApp, reactive = CSVue.reactive, h = CSVue.h;",
      I18N_BRIDGE,
      "function api(path, opts) {",
      "  opts = opts || {}; var headers = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});",
      "  var tok = localStorage.getItem('token'); if (tok) headers.authorization = 'Bearer ' + tok;",
      "  return fetch(path, Object.assign({}, opts, { headers: headers })).then(function (r) { return r.text().then(function (bt) { var j = null; try { j = JSON.parse(bt); } catch (_) {} return { ok: r.ok, status: r.status, body: j }; }); });",
      "}",
      "var __app = createApp({",
      "  setup: function () {",
      "    var st = reactive({ authed: " + (auth ? "!!localStorage.getItem('token')" : "true") + ", mode: 'login', email: '', pass: '', err: null, rows: [], form: {} });",
      "    function load() { " + (first ? "api('/api/" + first.table + "?limit=100').then(function (r) { st.rows = (r.body && r.body.rows) || []; });" : "") + " }",
      "    function auth_() { st.err = null; api('/api/auth/' + st.mode, { method: 'POST', body: JSON.stringify({ email: st.email, password: st.pass }) }).then(function (r) { if (!r.ok) { st.err = (r.body && r.body.error) || 'failed'; return; } localStorage.setItem('token', r.body.token); st.authed = true; load(); }); }",
      "    function add() { st.err = null; " + (first ? "api('/api/" + first.table + "', { method: 'POST', body: JSON.stringify(st.form) }).then(function (r) { if (!r.ok) { st.err = (r.body && r.body.error) || 'failed'; return; } st.form = {}; load(); });" : "") + " }",
      "    function del(id) { " + (first ? "api('/api/" + first.table + "/' + id, { method: 'DELETE' }).then(load);" : "") + " }",
      "    function logout() { localStorage.removeItem('token'); st.authed = false; }",
      "    if (st.authed) load();",
      "    return { st: st, auth_: auth_, add: add, del: del, logout: logout };",
      "  },",
      "  render: function (ctx, h) {",
      "    var st = ctx.st;",
      auth
        ? "    if (!st.authed) return h('div', {}, [ h('section', { class: 'card auth', 'aria-label': 'sign in' }, [\n" +
          "      h('h2', {}, [t('auth.heading', 'Sign in')]),\n" +
          "      h('form', { onSubmit: function (e) { e.preventDefault(); ctx.auth_(); } }, [\n" +
          "        h('label', { for: 'vEmail' }, [t('auth.email', 'Email')]),\n" +
          "        h('input', { id: 'vEmail', type: 'email', autocomplete: 'email', 'aria-label': t('auth.email', 'email'), placeholder: 'you@example.com', value: st.email, onInput: function (e) { st.email = e.target.value; } }),\n" +
          "        h('label', { for: 'vPass' }, [t('auth.password', 'Password')]),\n" +
          "        h('input', { id: 'vPass', type: 'password', autocomplete: 'current-password', 'aria-label': t('auth.password', 'password'), placeholder: 'password (8+)', value: st.pass, onInput: function (e) { st.pass = e.target.value; } }),\n" +
          "        h('button', { type: 'submit' }, [st.mode === 'login' ? t('auth.signIn', 'Sign in') : t('auth.register', 'Create account')]),\n" +
          "        h('button', { type: 'button', id: 'authToggle', onClick: function () { st.mode = st.mode === 'login' ? 'register' : 'login'; } }, [st.mode === 'login' ? 'Need an account?' : 'Have an account?'])\n" +
          "      ]),\n" +
          "      st.err ? h('div', { class: 'err' }, [st.err]) : null\n" +
          "    ]) ]);\n"
        : "",
      "    return h('div', {}, [",
      auth ? "      h('header', { class: 'bar' }, [h('h1', {}, [t('app.title', '" + s.name + "')]), h('button', { onClick: ctx.logout }, [t('auth.signOut', 'Sign out')])])," : "      h('h1', {}, [t('app.title', '" + s.name + "')]),",
      first
        ? "      h('section', { class: 'card', 'data-entity': '" + first.name + "' }, [\n" +
          "        h('h2', {}, [t('entity." + first.name + "', '" + first.name + "')]),\n" +
          "        h('form', { class: 'create', onSubmit: function (e) { e.preventDefault(); ctx.add(); } }, [\n" +
          firstFields.map(function (f) {
            var ftype = (f.type === 'int' || f.type === 'float') ? 'number' : 'text';
            var lblKey = "field." + first.name + "." + f.name;
            return "          h('input', { type: '" + ftype + "', 'aria-label': t('" + lblKey + "', '" + f.name + "'), placeholder: t('" + lblKey + "', '" + f.name + "'), value: st.form." + f.name + " || '', onInput: function (e) { st.form." + f.name + " = e.target.value; } }),";
          }).join('\n') + "\n" +
          "          h('button', { type: 'submit' }, [t('action.add', 'Add') + ' " + first.name + "'])\n" +
          "        ]),\n" +
          "        st.err ? h('div', { class: 'err' }, [st.err]) : null,\n" +
          "        h('ul', { class: 'list' }, (st.rows.length ? st.rows.map(function (r) { return h('li', {}, [String(" + (firstFields[0] ? "r." + firstFields[0].name + " || ('#' + r.id)" : "'#' + r.id") + "), h('button', { onClick: function () { ctx.del(r.id); } }, [t('action.delete', 'Delete')])]); }) : [h('li', { class: 'empty' }, [t('list.empty', 'Nothing yet')])]))\n" +
          "      ])"
        : "      h('p', {}, ['No entities'])",
      "    ]);",
      "  }",
      "});",
      "function __mount() { __app.mount('#app'); }",
      "__w.i18n ? i18nReady.then(__mount) : __mount();",
      ""
    ].filter(Boolean).join('\n');
    return { 'public/index.html': html, 'public/app.js': js, 'public/app.css': frameworkCss(), 'public/design-tokens.css': designTokens(), 'public/vendor/vue-lite.js': vueRuntime(), 'public/logo.svg': logoSvg(s.name) };
  }

  // design tokens — the same contract as the vanilla scaffold's
  // public/design-tokens.css, so Engine.Design.applyTokens() (a Figma / HTML
  // reference) drives every framework frontend identically.
  function designTokens() {
    return ':root {\n  /* design tokens — overwrite via Engine.Design.applyTokens() from a Figma/HTML reference */\n' +
      '  --color-bg: #ffffff;\n  --color-surface: #ffffff;\n  --color-accent: #1d4ed8;\n  --color-text: #111111;\n' +
      '  --color-border: #dddddd;\n  --color-danger: #b91c1c;\n  --color-muted: #6b6b6b;\n' +
      '  --font-sans: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;\n  --text-base: 15px;\n  --radius: 7px;\n  --space: 8px;\n}\n';
  }

  function frameworkCss() {
    return "*{box-sizing:border-box}body{font:var(--text-base,15px)/1.5 var(--font-sans,system-ui,sans-serif);max-width:780px;margin:24px auto;padding:0 16px;color:var(--color-text,#111);background:var(--color-bg,#fff)}" +
      "h1{margin:0 0 16px}h2{margin:0 0 10px;font-size:16px;text-transform:capitalize}" +
      "label{font-size:12px;color:var(--color-muted,#444);width:100%;margin-bottom:-4px}" +
      ".card{border:1px solid var(--color-border,#ddd);border-radius:calc(var(--radius,7px) + 3px);padding:16px;margin-bottom:16px;background:var(--color-surface,#fff)}.bar{display:flex;justify-content:space-between;align-items:center}" +
      "form{display:flex;gap:var(--space,8px);flex-wrap:wrap;margin-bottom:10px}input:not([type=checkbox]){flex:1;min-width:120px;padding:8px 10px;border:1px solid #767676;border-radius:var(--radius,7px);min-height:24px}" +
      "button{padding:9px 14px;border:1px solid var(--color-accent,#1d4ed8);background:var(--color-accent,#1d4ed8);color:#fff;border-radius:var(--radius,7px);cursor:pointer;min-height:24px}" +
      "ul{list-style:none;padding:0;margin:0}li{padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}" +
      ".err{color:var(--color-danger,#b91c1c)}.empty{color:var(--color-muted,#6b6b6b)}li button{background:transparent;color:var(--color-danger,#b91c1c);border-color:var(--color-danger,#b91c1c);font-size:12px;padding:6px 10px}" +
      ".skip-link{position:absolute;left:-9999px;top:0;background:#000;color:#fff;padding:8px 12px;z-index:10}.skip-link:focus{left:8px}" +
      "a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid var(--color-accent,#1d4ed8);outline-offset:2px}\n";
  }
  function logoSvg(name) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#2563eb"/><text x="20" y="27" font-size="20" fill="#fff" text-anchor="middle" font-family="system-ui">' + (name[0] || 'A').toUpperCase() + '</text></svg>\n';
  }
  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }

  /* ---------------- frontend test (runs under node:test via jsdom-free DOM shim) ---------------- */
  function frontendTest(s, kind) {
    var runtimeFile = kind === 'vue' ? 'vue-lite.js' : 'vdom.js';
    return [
      "'use strict';",
      "// Verifies the vendored " + kind + " runtime renders the component tree without a browser.",
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const fs = require('fs'); const path = require('path');",
      "",
      "// minimal DOM so the runtime can mount head-lessly",
      "function mkEl(tag) {",
      "  return { tagName: (tag || '').toUpperCase(), children: [], attributes: {}, style: {}, _text: '',",
      "    appendChild(c) { this.children.push(c); return c; },",
      "    setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },",
      "    addEventListener() {}, removeEventListener() {},",
      "    replaceChild(n, o) { const i = this.children.indexOf(o); if (i >= 0) this.children[i] = n; },",
      "    get textContent() { return this._text + this.children.map((c) => c.textContent || c._text || (typeof c === 'string' ? c : '')).join(''); },",
      "    set textContent(v) { this._text = v; this.children = []; },",
      "    set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },",
      "    querySelector() { return null; }, get parentNode() { return this._parent || null; } };",
      "}",
      "global.document = {",
      "  createElement: mkEl, createTextNode: (t) => ({ nodeType: 3, textContent: String(t), _text: String(t), children: [] }),",
      "  createComment: () => ({ nodeType: 8, textContent: '', children: [] }),",
      "  createDocumentFragment: () => mkEl('#fragment'),",
      "  querySelector: () => null",
      "};",
      "global.queueMicrotask = global.queueMicrotask || ((f) => Promise.resolve().then(f));",
      "global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };",
      "global.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{\"rows\":[]}'), json: () => Promise.resolve({ rows: [] }) });",
      "",
      "test('the " + kind + " frontend runtime + app render without throwing', () => {",
      "  const runtime = fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', '" + runtimeFile + "'), 'utf8');",
      "  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');",
      "  const root = mkEl('div'); root._parent = mkEl('body');",
      "  global.document.getElementById = () => root;",
      "  global.document.querySelector = () => root;",
      "  eval(runtime);",
      "  assert.ok(" + (kind === 'vue' ? "global.CSVue && typeof global.CSVue.createApp === 'function'" : "global.CSDom && typeof global.CSDom.h === 'function'") + ", 'runtime global present');",
      "  assert.doesNotThrow(() => { eval(app); }, 'app.js executes + mounts');",
      "  assert.ok(root.children.length > 0 || root._text, 'something was rendered into the root');",
      "});",
      "",
      "test('index.html loads the framework runtime + app', () => {",
      "  const idx = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');",
      "  assert.match(idx, /vendor\\/" + runtimeFile.replace('.', '\\.') + "/);",
      "  assert.match(idx, /app\\.js/);",
      "  assert.match(idx, /<html[^>]*\\blang=/);",
      "  assert.doesNotMatch(idx, /<img(?![^>]*\\balt=)[^>]*>/);",
      "});",
      "",
      "test('the frontend is themed by design tokens and localised via i18n.js', () => {",
      "  const dir = path.join(__dirname, '..', 'public');",
      "  const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');",
      "  assert.match(idx, /design-tokens\\.css/, 'links the design-token stylesheet');",
      "  assert.match(idx, /i18n\\.js/, 'loads the i18n runtime');",
      "  const tokens = fs.readFileSync(path.join(dir, 'design-tokens.css'), 'utf8');",
      "  assert.match(tokens, /:root\\s*\\{[^}]*--color-accent/, 'declares design tokens on :root');",
      "  const css = fs.readFileSync(path.join(dir, 'app.css'), 'utf8');",
      "  assert.match(css, /var\\(--color-accent/, 'app.css consumes the accent token');",
      "  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');",
      "  assert.match(app, /\\bt\\(\\s*['\\\"][a-z]+\\.[a-zA-Z.]+['\\\"]/, 'strings routed through t(key, default)');",
      "});",
      ""
    ].join('\n');
  }

  function generate(spec) {
    var s = spec || {};
    var kind = s.frontend === 'preact' ? 'preact' : s.frontend === 'vue' ? 'vue' : 'react';
    var out = kind === 'vue' ? vueApp(s) : reactApp(s);
    out['test/frontend.test.js'] = frontendTest(s, kind);
    return out;
  }

  Engine.Frontends = { KINDS: KINDS, generate: generate, vdomRuntime: vdomRuntime, vueRuntime: vueRuntime };
  console.info('[Frontends] component-framework frontends ready — Engine.Frontends');
})();
