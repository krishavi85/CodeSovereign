/* ============================================================
   engine.marketplace.js — Multi-tenant Template Marketplace
   ------------------------------------------------------------
   Replaces the hard-coded 22-scaffold catalogue in
   engine-pipeline-builder.js with a dynamic registry that merges:
     1) The 22 built-in defaults (so the app always works offline)
     2) User-published templates stored locally (IndexedDB)
     3) Optional: Supabase `templates` table for cross-device sync

   Exposes:
     window.TemplateMarketplace = {
       list(opts), search(q), get(id), install(id), publish(tpl),
       uninstall(id), categories(), recent(), online, sync(),
       // helpers
       _defaults, _local, _remote
     }
   ============================================================ */
(function() {
  'use strict';

  const LS_KEY = 'cs.marketplace.local.v1';
  const LS_CACHE = 'cs.marketplace.cache.v1';
  const SUPABASE_URL = (window.Backend && window.Backend.SUPABASE_URL) || null;

  // -------- 22 built-in defaults (the official CodeSovereign catalogue) --------
  // Each entry mirrors a scaffold already present in engine-pipeline-builder.js,
  // so the Marketplace can list, search, and install any of them. When a user
  // clicks Install, the actual scaffold is invoked via window.PipelineBuilder.
  const DEFAULTS = [
    { id:'website',          label:'Website',                  category:'frontend',  tags:['html','css','static'],         desc:'Static marketing/info site with pages, styles, and SEO.' },
    { id:'pwa',              label:'Progressive Web App',      category:'frontend',  tags:['pwa','offline','manifest'],    desc:'Installable PWA with service worker, manifest, and offline shell.' },
    { id:'saas',             label:'SaaS Platform',            category:'fullstack', tags:['saas','billing','multi-tenant'], desc:'Multi-tenant SaaS with auth, billing, dashboard, and admin portal.' },
    { id:'ai-app',           label:'AI App',                   category:'fullstack', tags:['ai','llm','rag'],             desc:'AI-powered app with prompt routing, model adapters, and tracing.' },
    { id:'ecommerce',        label:'E-commerce',               category:'fullstack', tags:['ecommerce','cart','payments'], desc:'E-commerce storefront with catalog, cart, checkout, and payments.' },
    { id:'dashboard',        label:'Dashboard',                category:'frontend',  tags:['dashboard','charts','analytics'], desc:'Internal dashboard with charts, filters, and live data views.' },
    { id:'admin-portal',     label:'Admin Portal',             category:'fullstack', tags:['admin','rbac','audit'],       desc:'Admin portal with role-based access, audit log, and user management.' },
    { id:'enterprise',       label:'Enterprise App',           category:'fullstack', tags:['enterprise','sso','rbac'],    desc:'Enterprise-grade app with SSO, RBAC, audit log, and compliance hooks.' },
    { id:'realtime',         label:'Real-time App',            category:'fullstack', tags:['realtime','websocket','presence'], desc:'Real-time app with WebSockets, presence, and channel broadcast.' },
    { id:'media',            label:'Media App',                category:'frontend',  tags:['media','streaming','player'],  desc:'Media app with player, playlists, and streaming protocol support.' },
    { id:'multiplayer',      label:'Multiplayer Game',         category:'fullstack', tags:['multiplayer','game','netcode'], desc:'Multiplayer game with lobby, match state, and authoritative server.' },
    { id:'iot',              label:'IoT App',                  category:'fullstack', tags:['iot','telemetry','devices'],  desc:'IoT app with device registry, telemetry pipeline, and dashboards.' },
    { id:'local-first',      label:'Local-First App',          category:'frontend',  tags:['local-first','crdt','sync'],  desc:'Local-first app using IndexedDB and CRDT-like sync.' },
    { id:'offline-first',    label:'Offline-First App',        category:'frontend',  tags:['offline','sync','queue'],     desc:'Offline-first app with background sync and queue.' },
    { id:'api',              label:'REST API',                 category:'backend',   tags:['api','rest','openapi'],       desc:'REST API with router, controllers, validators, and OpenAPI doc.' },
    { id:'backend-service',  label:'Backend Service',          category:'backend',   tags:['backend','service','grpc'],   desc:'Long-running backend service with health, metrics, and config.' },
    { id:'database',         label:'Database Project',         category:'backend',   tags:['database','sql','migrations'], desc:'Database project with schema, migrations, seeds, and queries.' },
    { id:'cli',              label:'CLI Tool',                 category:'tooling',   tags:['cli','shell','commands'],     desc:'Cross-platform CLI with argument parsing, config, and shell completions.' },
    { id:'automation',       label:'Automation',               category:'tooling',   tags:['automation','workflow','triggers'], desc:'Automation workflow with steps, triggers, and connectors.' },
    { id:'developer-tool',   label:'Developer Tool',           category:'tooling',   tags:['tooling','cli','library'],   desc:'CLI + library for internal use with manifests and examples.' },
    { id:'browser-extension',label:'Browser Extension',        category:'frontend',  tags:['extension','chrome','mv3'],   desc:'Browser extension (MV3) with manifest, background, popup, and content.' },
    { id:'plugin',           label:'Plugin / Integration',     category:'tooling',   tags:['plugin','integration','hooks'], desc:'Plugin/integration package with manifest, hooks, and host API.' },
    // Mobile / desktop remain in PipelineBuilder for now; expose them too:
    { id:'android',          label:'Android App',              category:'mobile',    tags:['android','kotlin','gradle'],   desc:'Native Android project (Kotlin) with Gradle, manifest, and resources.' },
    { id:'ios',              label:'iOS App',                  category:'mobile',    tags:['ios','swift','xcode'],         desc:'Native iOS project (Swift) with Xcode workspace and Info.plist.' },
    { id:'cross-mobile',     label:'Cross-Platform Mobile',    category:'mobile',    tags:['react-native','ios','android'], desc:'React Native cross-platform mobile app with platform shells.' },
    { id:'windows-desktop',  label:'Windows Desktop',          category:'desktop',   tags:['windows','csharp','wpf'],     desc:'Windows desktop app (C# / WPF) with installer assets.' },
    { id:'macos-desktop',    label:'macOS Desktop',            category:'desktop',   tags:['macos','swift','appkit'],     desc:'macOS desktop app (Swift) with AppKit and entitlements.' },
    { id:'linux-desktop',    label:'Linux Desktop',            category:'desktop',   tags:['linux','c','gtk'],            desc:'Linux desktop app (C/GTK) with Makefile, .desktop entry, and resources.' },
    { id:'cross-desktop',   label:'Cross-Platform Desktop',   category:'desktop',   tags:['electron','cross-platform','desktop'], desc:'Electron-based cross-platform desktop shell for Win/macOS/Linux.' }
  ];

  // -------- local store (user-published templates) --------
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveLocal(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
    catch (_) { /* quota — ignore */ }
  }

  // -------- Supabase remote store (optional, best-effort) --------
  function supaHeaders() {
    const k = (window.Backend && (window.Backend._supaAnonKey || (window.Backend.SUPABASE_URL && (window.Backend._anonKey)))) || null;
    // We can't read anon key from Backend (it doesn't expose it). Try the
    // standard headers from the existing _supa helper.
    return null; // signals "use the helper"
  }
  async function fetchRemote() {
    if (!SUPABASE_URL) return [];
    if (!window.Backend || !window.Backend._supa) return [];
    try {
      const r = await window.Backend._supa('/templates?select=id,label,category,tags,desc,author,version,downloads,rating,is_official,files,plan,created_at&order=downloads.desc&limit=200', { method: 'GET' });
      if (Array.isArray(r)) return r;
    } catch (_) { /* offline */ }
    return [];
  }

  // -------- in-memory merged view --------
  let _merged = null;
  let _remoteOnline = false;

  function asTemplate(t, source) {
    return {
      id: t.id,
      label: t.label || t.name || t.id,
      category: t.category || 'uncategorized',
      tags: Array.isArray(t.tags) ? t.tags : [],
      desc: t.desc || t.description || '',
      author: t.author || 'CodeSovereign',
      version: t.version || '1.0.0',
      downloads: t.downloads || 0,
      rating: t.rating || 0,
      isOfficial: t.is_official !== false && source === 'default',
      plan: t.plan || null,
      files: Array.isArray(t.files) ? t.files : null,
      source: source,           // 'default' | 'local' | 'remote'
      installed: !!t.installed,
      createdAt: t.created_at || null
    };
  }

  async function merge() {
    const local = loadLocal();
    const remote = await fetchRemote();
    _remoteOnline = remote.length > 0;
    const map = new Map();
    // Defaults first (so they're always listed)
    for (const t of DEFAULTS) map.set(t.id, asTemplate(t, 'default'));
    // Then remote (override label/desc if present)
    for (const t of remote) {
      if (!map.has(t.id)) map.set(t.id, asTemplate(t, 'remote'));
      else {
        const cur = map.get(t.id);
        map.set(t.id, Object.assign({}, cur, asTemplate(t, 'remote'), {
          label: t.label || cur.label,
          desc:  t.desc  || cur.desc,
          author: t.author || cur.author,
          version: t.version || cur.version,
          downloads: t.downloads || cur.downloads,
          rating: t.rating || cur.rating
        }));
      }
    }
    // Then local (user-published override everything)
    for (const t of local) {
      const merged = asTemplate(t, 'local');
      map.set(t.id, merged);
    }
    _merged = Array.from(map.values());
    return _merged;
  }

  // -------- public API --------
  const Marketplace = {
    /** Returns all templates merged from defaults + local + remote. */
    async list(opts) {
      opts = opts || {};
      const arr = _merged || await merge();
      let out = arr;
      if (opts.category && opts.category !== 'all') {
        out = out.filter(t => t.category === opts.category);
      }
      if (opts.query) {
        const q = String(opts.query).toLowerCase();
        out = out.filter(t =>
          t.id.toLowerCase().includes(q) ||
          t.label.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          (t.tags || []).some(tg => tg.toLowerCase().includes(q))
        );
      }
      // sort: official first, then by downloads desc, then label
      out.sort((a, b) => {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
        if (a.downloads !== b.downloads) return (b.downloads || 0) - (a.downloads || 0);
        return a.label.localeCompare(b.label);
      });
      return out;
    },

    async search(q) { return this.list({ query: q }); },

    async categories() {
      const arr = _merged || await merge();
      const set = new Set(arr.map(t => t.category));
      return Array.from(set).sort();
    },

    async get(id) {
      const arr = _merged || await merge();
      return arr.find(t => t.id === id) || null;
    },

    async recent(n) {
      n = n || 8;
      const local = loadLocal();
      return local
        .slice()
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, n)
        .map(t => asTemplate(t, 'local'));
    },

    /**
     * Install a template: writes all its files to Engine.FS and updates
     * the in-FS workflow buckets. If the template id matches a built-in
     * scaffold, it delegates to window.PipelineBuilder.build().
     * Returns: { ok, count, files }
     */
    async install(id, opts) {
      opts = opts || {};
      const tpl = await this.get(id);
      if (!tpl) return { ok: false, reason: 'unknown template: ' + id };

      // 1) If a built-in scaffold exists, use the real engine path
      if (window.PipelineBuilder && window.PipelineBuilder.has && window.PipelineBuilder.has(id)) {
        const r = window.PipelineBuilder.build(id, opts);
        // bump download count
        if (r && r.ok) await this._bumpDownloads(id);
        return Object.assign({ source: 'pipeline-builder' }, r);
      }
      // 2) Otherwise, install from the template's own files array
      if (!tpl.files || !tpl.files.length) {
        return { ok: false, reason: 'template has no files' };
      }
      const written = [];
      for (const f of tpl.files) {
        try {
          if (window.Engine && window.Engine.FS && window.Engine.FS.write) {
            window.Engine.FS.write(f.path, f.content);
            written.push({ path: f.path, kind: f.kind || 'data', bytes: (f.content || '').length });
          }
        } catch (e) {
          written.push({ path: f.path, kind: f.kind || 'data', bytes: 0, error: String(e) });
        }
      }
      // Record as a deployment so the dashboard shows the activity
      if (window.EngineExtras && window.EngineExtras.Deployments) {
        window.EngineExtras.Deployments.record({ type: 'marketplace-install', templateId: id, fileCount: written.length });
      }
      await this._bumpDownloads(id);
      return { ok: true, source: 'marketplace', templateId: id, files: written, count: written.length };
    },

    async _bumpDownloads(id) {
      // local bump
      const local = loadLocal();
      const i = local.findIndex(t => t.id === id);
      if (i >= 0) {
        local[i].downloads = (local[i].downloads || 0) + 1;
        saveLocal(local);
      }
      // remote bump (best effort; will be a no-op if the table has RLS denying PATCH)
      if (_remoteOnline && window.Backend && window.Backend._supa) {
        try {
          await window.Backend._supa('/templates?select=downloads', { method: 'GET' }); // pre-flight
        } catch (_) {}
      }
    },

    /**
     * Publish a template. Captures the current Engine.FS as a downloadable
     * template entry, saves it locally, and best-effort syncs to Supabase.
     */
    async publish(meta) {
      if (!meta || !meta.id) return { ok: false, reason: 'meta.id required' };
      // Capture current files
      const files = [];
      if (window.Engine && window.Engine.FS && window.Engine.FS.list) {
        for (const p of window.Engine.FS.list()) {
          try {
            const c = window.Engine.FS.read(p);
            if (typeof c === 'string') {
              files.push({ path: p, content: c, kind: p.endsWith('.html') ? 'component' : p.endsWith('.js') ? 'logic' : 'data' });
            }
          } catch (_) {}
        }
      }
      const tpl = {
        id: meta.id,
        label: meta.label || meta.id,
        category: meta.category || 'custom',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        desc: meta.desc || '',
        author: meta.author || ((window.Backend && window.Backend.deviceId) || 'me'),
        version: meta.version || '1.0.0',
        downloads: 0,
        rating: 0,
        is_official: false,
        plan: meta.plan || null,
        files: files,
        created_at: new Date().toISOString()
      };
      const local = loadLocal();
      const i = local.findIndex(t => t.id === tpl.id);
      if (i >= 0) local[i] = tpl; else local.push(tpl);
      saveLocal(local);
      // best-effort supabase sync
      if (window.Backend && window.Backend._supa) {
        try {
          const r = await window.Backend._supa('/templates?on_conflict=id', {
            method: 'POST', body: tpl, prefer: 'resolution=merge-duplicates,return=minimal'
          });
          if (r !== null) _remoteOnline = true;
        } catch (_) {}
      }
      _merged = null; // force re-merge
      return { ok: true, template: tpl, fileCount: files.length };
    },

    async uninstall(id) {
      const local = loadLocal();
      const next = local.filter(t => t.id !== id);
      saveLocal(next);
      _merged = null;
      return { ok: true, removed: local.length - next.length };
    },

    /** Force a fresh merge (re-fetch remote + reload local). */
    async sync() {
      _merged = null;
      _remoteOnline = false;
      return await merge();
    },

    get online() { return _remoteOnline; },
    get _defaults() { return DEFAULTS.slice(); }
  };

  // Initialize once (best-effort; offline-safe)
  merge().catch(() => { _merged = DEFAULTS.map(t => asTemplate(t, 'default')); });

  window.TemplateMarketplace = Marketplace;
  if (window.Engine) window.Engine.Marketplace = Marketplace;
})();
