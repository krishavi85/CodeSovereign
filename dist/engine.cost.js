/* =====================================================================
   engine.cost.js  —  Engine.Cost

   Cost Sovereignty (GodMode blueprint §30): for every paid dependency or
   hosted service the project pulls in, say whether the cost is MANDATORY
   or OPTIONAL, and name a zero-cost / self-hostable alternative.

   window.Engine.Cost
     DB                       the knowledge table (package / service -> tier + alts)
     classify(name)           -> entry | null
     analyze(ctx)             -> report  (also writes .sovereign/cost-analysis.json
                                          + cost-sovereignty.md)
     load()                   -> the written report or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  // tier: 'free' | 'freemium' | 'paid'      (freemium = usable free tier exists)
  // mandatory: is the cost unavoidable for the capability, or is there a real
  //            zero-cost path?
  var DB = {
    // ---- AI ----
    'openai':        { cat: 'ai', tier: 'paid', mandatory: false, alt: ['Ollama / llama.cpp (local)', 'any OpenAI-compatible self-host'], note: 'per-token API cost' },
    '@anthropic-ai/sdk': { cat: 'ai', tier: 'paid', mandatory: false, alt: ['Ollama (local)', 'OpenRouter free models'] },
    'anthropic':     { cat: 'ai', tier: 'paid', mandatory: false, alt: ['Ollama (local)'] },
    '@google/generative-ai': { cat: 'ai', tier: 'freemium', mandatory: false, alt: ['Ollama (local)'], note: 'Gemini has a free tier with limits' },
    'cohere-ai':     { cat: 'ai', tier: 'freemium', mandatory: false, alt: ['local embeddings (bge / nomic via Ollama)'] },
    'replicate':     { cat: 'ai', tier: 'paid', mandatory: false, alt: ['run the model locally', 'RunPod / self-host GPU'] },
    'openai-edge':   { cat: 'ai', tier: 'paid', mandatory: false, alt: ['Ollama (local)'] },
    // ---- databases ----
    '@supabase/supabase-js': { cat: 'database', tier: 'freemium', mandatory: false, alt: ['self-host Supabase (Docker)', 'plain PostgreSQL'], note: 'free tier pauses after inactivity' },
    'firebase':      { cat: 'database', tier: 'freemium', mandatory: false, alt: ['PocketBase (self-host)', 'PostgreSQL + your own API'] },
    'firebase-admin':{ cat: 'database', tier: 'freemium', mandatory: false, alt: ['PocketBase', 'PostgreSQL'] },
    '@planetscale/database': { cat: 'database', tier: 'paid', mandatory: false, alt: ['self-host MySQL', 'PostgreSQL on a VPS'], note: 'removed its free tier' },
    'mongodb':       { cat: 'database', tier: 'free', mandatory: false, alt: ['self-host MongoDB', 'PostgreSQL + JSONB'] },
    '@neondatabase/serverless': { cat: 'database', tier: 'freemium', mandatory: false, alt: ['self-host PostgreSQL'] },
    'pg':            { cat: 'database', tier: 'free', mandatory: false, alt: [] },
    'better-sqlite3':{ cat: 'database', tier: 'free', mandatory: false, alt: [] },
    'redis':         { cat: 'cache', tier: 'free', mandatory: false, alt: ['self-host Redis / Valkey', 'in-process LRU'] },
    '@upstash/redis':{ cat: 'cache', tier: 'freemium', mandatory: false, alt: ['self-host Redis / Valkey'] },
    // ---- auth ----
    '@clerk/nextjs': { cat: 'auth', tier: 'freemium', mandatory: false, alt: ['Auth.js / NextAuth (free)', 'Lucia', 'self-host Keycloak / Zitadel'], note: 'free up to a MAU cap' },
    '@clerk/clerk-react': { cat: 'auth', tier: 'freemium', mandatory: false, alt: ['Auth.js', 'Lucia'] },
    '@auth0/auth0-react': { cat: 'auth', tier: 'freemium', mandatory: false, alt: ['Auth.js', 'self-host Keycloak / Zitadel'] },
    'next-auth':     { cat: 'auth', tier: 'free', mandatory: false, alt: [] },
    '@auth/core':    { cat: 'auth', tier: 'free', mandatory: false, alt: [] },
    'lucia':         { cat: 'auth', tier: 'free', mandatory: false, alt: [] },
    'workos':        { cat: 'auth', tier: 'paid', mandatory: false, alt: ['self-host Keycloak (SSO/SAML)'] },
    // ---- email ----
    'resend':        { cat: 'email', tier: 'freemium', mandatory: false, alt: ['SMTP via your domain host', 'self-host Postal / Listmonk', 'AWS SES'], note: '~3k emails/mo free' },
    '@sendgrid/mail':{ cat: 'email', tier: 'freemium', mandatory: false, alt: ['SMTP', 'AWS SES', 'self-host Postal'] },
    'nodemailer':    { cat: 'email', tier: 'free', mandatory: false, alt: [], note: 'needs an SMTP server (your host usually provides one)' },
    'postmark':      { cat: 'email', tier: 'paid', mandatory: false, alt: ['SMTP', 'AWS SES'] },
    'mailgun.js':    { cat: 'email', tier: 'paid', mandatory: false, alt: ['SMTP', 'AWS SES', 'self-host Postal'] },
    // ---- payments ----
    'stripe':        { cat: 'payments', tier: 'paid', mandatory: true,  alt: [], note: 'transaction fees are unavoidable for card payments; no free alternative' },
    '@paddle/paddle-js': { cat: 'payments', tier: 'paid', mandatory: true, alt: [] },
    '@lemonsqueezy/lemonsqueezy.js': { cat: 'payments', tier: 'paid', mandatory: true, alt: [] },
    // ---- storage ----
    '@aws-sdk/client-s3': { cat: 'storage', tier: 'paid', mandatory: false, alt: ['self-host MinIO (S3 API)', 'Cloudflare R2 (no egress fee)', 'local disk for single-node'] },
    '@vercel/blob':  { cat: 'storage', tier: 'paid', mandatory: false, alt: ['MinIO', 'Cloudflare R2', 'local disk'] },
    'cloudinary':    { cat: 'storage', tier: 'freemium', mandatory: false, alt: ['self-host imgproxy / thumbor + object storage'] },
    'uploadthing':   { cat: 'storage', tier: 'freemium', mandatory: false, alt: ['MinIO', 'R2', 'direct-to-S3 presigned uploads'] },
    // ---- search ----
    'algoliasearch': { cat: 'search', tier: 'paid', mandatory: false, alt: ['self-host Meilisearch / Typesense', 'PostgreSQL full-text search'] },
    '@elastic/elasticsearch': { cat: 'search', tier: 'free', mandatory: false, alt: ['self-host', 'Meilisearch (lighter)', 'Postgres FTS'] },
    'meilisearch':   { cat: 'search', tier: 'free', mandatory: false, alt: [] },
    // ---- vector ----
    '@pinecone-database/pinecone': { cat: 'vector', tier: 'freemium', mandatory: false, alt: ['pgvector (Postgres)', 'self-host Qdrant / Chroma / Weaviate'] },
    'chromadb':      { cat: 'vector', tier: 'free', mandatory: false, alt: [] },
    '@qdrant/js-client-rest': { cat: 'vector', tier: 'free', mandatory: false, alt: ['self-host Qdrant'] },
    // ---- analytics / monitoring ----
    '@sentry/node':  { cat: 'monitoring', tier: 'freemium', mandatory: false, alt: ['self-host GlitchTip (Sentry-compatible)', 'self-host Sentry'] },
    '@sentry/react': { cat: 'monitoring', tier: 'freemium', mandatory: false, alt: ['self-host GlitchTip'] },
    'posthog-js':    { cat: 'analytics', tier: 'freemium', mandatory: false, alt: ['self-host PostHog (Docker)', 'Umami / Plausible (self-host)'] },
    '@vercel/analytics': { cat: 'analytics', tier: 'freemium', mandatory: false, alt: ['self-host Umami / Plausible'] },
    'mixpanel-browser': { cat: 'analytics', tier: 'freemium', mandatory: false, alt: ['self-host PostHog'] },
    'datadog':       { cat: 'monitoring', tier: 'paid', mandatory: false, alt: ['self-host Grafana + Prometheus + Loki'] }
  };

  // hosting / infra costs keyed by detected external or adapter, not a package
  var HOSTS = {
    vercel:   { cat: 'hosting', tier: 'freemium', mandatory: false, alt: ['self-host (Docker + Caddy on a $5 VPS)', 'Cloudflare Pages', 'Netlify'] },
    netlify:  { cat: 'hosting', tier: 'freemium', mandatory: false, alt: ['self-host', 'Cloudflare Pages'] },
    aws:      { cat: 'hosting', tier: 'paid', mandatory: false, alt: ['a single VPS (Hetzner / DO / Fly)', 'self-host'] },
    gcp:      { cat: 'hosting', tier: 'paid', mandatory: false, alt: ['a single VPS', 'self-host'] },
    azure:    { cat: 'hosting', tier: 'paid', mandatory: false, alt: ['a single VPS', 'self-host'] },
    heroku:   { cat: 'hosting', tier: 'paid', mandatory: false, alt: ['Fly.io', 'Render free tier', 'a VPS'] },
    railway:  { cat: 'hosting', tier: 'freemium', mandatory: false, alt: ['a VPS', 'Fly.io'] }
  };

  function base(name) { return String(name || '').toLowerCase().replace(/^@/, '').split('/')[0]; }

  function classify(name) {
    var n = String(name || '').toLowerCase();
    if (DB[n]) return Object.assign({ name: n, kind: 'package' }, DB[n]);
    // scoped / partial matches
    var keys = Object.keys(DB);
    for (var i = 0; i < keys.length; i++) {
      if (n === keys[i] || base(n) === base(keys[i])) return Object.assign({ name: n, kind: 'package' }, DB[keys[i]]);
    }
    for (var h in HOSTS) if (n.indexOf(h) >= 0) return Object.assign({ name: h, kind: 'host' }, HOSTS[h]);
    return null;
  }

  function readJSON(p) {
    try { var v = S() && S().read(p); return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; }
  }
  function pkg() {
    try { var raw = Engine.FS.read('/package.json'); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }

  function analyze(ctx) {
    ctx = ctx || {};
    var p = pkg() || {};
    var deps = Object.assign({}, p.dependencies, p.devDependencies, p.optionalDependencies);
    var seen = {};
    var items = [];

    Object.keys(deps).forEach(function (d) {
      var e = classify(d);
      if (e && !seen[e.name]) { seen[e.name] = 1; items.push(e); }
    });

    // externals / adapters / integrations that aren't npm packages
    var ds = readJSON('decision-state.json') || {};
    (ds.externals || []).forEach(function (x) {
      var e = classify(x);
      if (e && !seen[e.name]) { seen[e.name] = 1; items.push(e); }
    });
    var req = readJSON('requirements.json') || {};
    (req.integrations || []).forEach(function (x) {
      var e = classify(x);
      if (e && !seen[e.name]) { seen[e.name] = 1; items.push(e); }
    });
    (ctx.extra || []).forEach(function (x) {
      var e = classify(x);
      if (e && !seen[e.name]) { seen[e.name] = 1; items.push(e); }
    });

    var mandatoryPaid = items.filter(function (i) { return i.tier === 'paid' && i.mandatory; });
    var optionalPaid = items.filter(function (i) { return (i.tier === 'paid' || i.tier === 'freemium') && !i.mandatory; });
    var free = items.filter(function (i) { return i.tier === 'free'; });

    var byCat = {};
    items.forEach(function (i) { (byCat[i.cat] = byCat[i.cat] || []).push(i.name); });

    var report = {
      generatedAt: Date.now(),
      totals: {
        analyzed: items.length,
        mandatoryPaid: mandatoryPaid.length,
        optionalPaidWithFreeAlternative: optionalPaid.length,
        alreadyFree: free.length
      },
      zeroCostPathAvailable: mandatoryPaid.length === 0,
      mandatoryCost: mandatoryPaid.map(function (i) { return { name: i.name, category: i.cat, note: i.note || 'no free alternative' }; }),
      optionalCost: optionalPaid.map(function (i) { return { name: i.name, category: i.cat, tier: i.tier, zeroCostAlternative: i.alt, note: i.note || null }; }),
      free: free.map(function (i) { return i.name; }),
      byCategory: byCat
    };

    if (S()) {
      S().write('cost-analysis.json', report);
      S().write('cost-sovereignty.md',
        '# Cost sovereignty\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        (report.zeroCostPathAvailable
          ? '**A fully zero-cost / self-hosted path exists for this project.**\n\n'
          : '**' + mandatoryPaid.length + ' unavoidable paid ' + (mandatoryPaid.length === 1 ? 'dependency' : 'dependencies') + ':**\n\n' +
            mandatoryPaid.map(function (i) { return '- `' + i.name + '` (' + i.cat + ') — ' + (i.note || 'no free alternative'); }).join('\n') + '\n\n') +
        '## Optional cost — a free alternative exists\n\n' +
        (optionalPaid.length ? optionalPaid.map(function (i) {
          return '- **`' + i.name + '`** (' + i.cat + ', ' + i.tier + ')' + (i.note ? ' — ' + i.note : '') + '\n  - zero-cost: ' + (i.alt.length ? i.alt.join('; ') : 'drop it') ;
        }).join('\n') : '- none') + '\n\n' +
        '## Already free / self-hosted\n\n' + (free.length ? free.map(function (i) { return '- `' + i.name + '`'; }).join('\n') : '- none') + '\n');
    }
    return report;
  }

  function load() { return readJSON('cost-analysis.json'); }

  Engine.Cost = { DB: DB, HOSTS: HOSTS, classify: classify, analyze: analyze, load: load };
  console.info('[Cost] cost-sovereignty engine ready — Engine.Cost');
})();
