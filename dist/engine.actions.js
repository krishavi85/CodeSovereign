/* ============================================================
   engine.actions.js — GitHub Actions Auto-Deploy Webhook
   ------------------------------------------------------------
   After pushing a repo to GitHub, the user can opt-in to a
   GitHub Actions workflow that auto-builds and auto-deploys
   the app. This engine:
     1) Generates the .github/workflows/deploy.yml content
        (tunable: target=pages|netlify|vercel|static)
     2) Stores the workflow in the current Engine.FS so the
        next GitHub push includes it
     3) Maintains a list of registered webhooks (URL + secret)
        that the user can paste into their repo's Webhooks tab
     4) Provides a tiny in-app webhook receiver simulator
        (since CodeSovereign has no public endpoint) that
        records incoming events for inspection.

   Exposes:
     window.GitHubActions = {
       // Workflow generation
       generate({target, branch, buildCmd, publishDir, nodeVersion}),
       install(),         // writes workflow into Engine.FS
       // Webhooks
       listWebhooks(), addWebhook({url,events,secret}),
       removeWebhook(id), updateWebhook(id, patch),
       // Simulated receiver
       deliveries(), trigger(webhookId, event, payload),
       // History
       history(), clearHistory(),
       // Presets
       presets(): { pages, netlify, vercel, static, docker }
     }
   ============================================================ */
(function() {
  'use strict';

  const LS_HOOKS = 'cs.actions.webhooks.v1';
  const LS_HIST = 'cs.actions.history.v1';
  const DEFAULT_BRANCH = 'main';

  function loadHooks() {
    try { return JSON.parse(localStorage.getItem(LS_HOOKS) || '[]'); }
    catch (_) { return []; }
  }
  function saveHooks(arr) {
    try { localStorage.setItem(LS_HOOKS, JSON.stringify(arr)); } catch (_) {}
  }
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); }
    catch (_) { return []; }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(LS_HIST, JSON.stringify(arr)); } catch (_) {}
  }
  function uid() { return 'wh_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function nowIso() { return new Date().toISOString(); }

  // -------- workflow templates --------
  function presets() {
    return {
      pages: {
        label: 'GitHub Pages',
        file: 'pages.yml',
        body: (o) => {
          o = o || {};
          const branch = o.branch || DEFAULT_BRANCH;
          const dir = o.publishDir || './';
          return [
            'name: Deploy to GitHub Pages',
            'on:',
            '  push:',
            '    branches: [' + branch + ']',
            '  workflow_dispatch:',
            '',
            'permissions:',
            '  contents: read',
            '  pages: write',
            '  id-token: write',
            '',
            'concurrency:',
            '  group: pages',
            '  cancel-in-progress: false',
            '',
            'jobs:',
            '  build:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '      - uses: actions/configure-pages@v4',
            '      - uses: actions/upload-pages-artifact@v3',
            '        with:',
            '          path: ' + dir,
            '  deploy:',
            '    needs: build',
            '    runs-on: ubuntu-latest',
            '    environment:',
            '      name: github-pages',
            '      url: ${{ steps.deployment.outputs.page_url }}',
            '    steps:',
            '      - id: deployment',
            '        uses: actions/deploy-pages@v4'
          ].join('\n');
        }
      },
      netlify: {
        label: 'Netlify',
        file: 'netlify.yml',
        body: (o) => {
          o = o || {};
          const branch = o.branch || DEFAULT_BRANCH;
          const dir = o.publishDir || 'dist';
          return [
            'name: Deploy to Netlify',
            'on:',
            '  push:',
            '    branches: [' + branch + ']',
            '  workflow_dispatch:',
            '',
            'jobs:',
            '  deploy:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '      - name: Build',
            '        run: ' + (o.buildCmd || 'echo "no build step"'),
            '      - name: Deploy to Netlify',
            '        uses: nwtgck/actions-netlify@v3.0',
            '        with:',
            '          publish-dir: ' + dir,
            '          production-deploy: true',
            '          deploy-message: "Auto-deploy from CodeSovereign"',
            '          netlify-config-path: ./netlify.toml',
            '        env:',
            '          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}',
            '          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}'
          ].join('\n');
        }
      },
      vercel: {
        label: 'Vercel',
        file: 'vercel.yml',
        body: (o) => {
          o = o || {};
          const branch = o.branch || DEFAULT_BRANCH;
          return [
            'name: Deploy to Vercel',
            'on:',
            '  push:',
            '    branches: [' + branch + ']',
            '  workflow_dispatch:',
            '',
            'jobs:',
            '  deploy:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '      - name: Install Vercel CLI',
            '        run: npm install --global vercel@latest',
            '      - name: Pull Vercel Environment',
            '        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}',
            '      - name: Build',
            '        run: ' + (o.buildCmd || 'vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}'),
            '      - name: Deploy',
            '        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}'
          ].join('\n');
        }
      },
      static: {
        label: 'Static / S3 / Generic',
        file: 'static.yml',
        body: (o) => {
          o = o || {};
          const branch = o.branch || DEFAULT_BRANCH;
          return [
            'name: Build & Upload Artifact',
            'on:',
            '  push:',
            '    branches: [' + branch + ']',
            '  workflow_dispatch:',
            '',
            'jobs:',
            '  build:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '      - name: Build',
            '        run: ' + (o.buildCmd || 'echo "no build step"'),
            '      - name: Upload artifact',
            '        uses: actions/upload-artifact@v4',
            '        with:',
            '          name: build-output',
            '          path: ' + (o.publishDir || 'dist') + '/',
            '          retention-days: 14'
          ].join('\n');
        }
      },
      docker: {
        label: 'Docker Image',
        file: 'docker.yml',
        body: (o) => {
          o = o || {};
          const branch = o.branch || DEFAULT_BRANCH;
          return [
            'name: Build & Push Docker Image',
            'on:',
            '  push:',
            '    branches: [' + branch + ']',
            '  workflow_dispatch:',
            '',
            'jobs:',
            '  docker:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '      - name: Set up Docker Buildx',
            '        uses: docker/setup-buildx-action@v3',
            '      - name: Login to registry',
            '        uses: docker/login-action@v3',
            '        with:',
            '          registry: ${{ secrets.REGISTRY }}',
            '          username: ${{ secrets.REGISTRY_USER }}',
            '          password: ${{ secrets.REGISTRY_PASS }}',
            '      - name: Build & push',
            '        uses: docker/build-push-action@v5',
            '        with:',
            '          push: true',
            '          tags: ${{ secrets.REGISTRY }}/${{ github.repository }}:latest'
          ].join('\n');
        }
      }
    };
  }

  // -------- generate / install --------
  function generate(opts) {
    opts = opts || {};
    const target = opts.target || 'pages';
    const p = presets()[target];
    if (!p) throw new Error('unknown target: ' + target);
    const body = p.body(opts);
    return {
      target: target,
      label: p.label,
      path: '.github/workflows/' + p.file,
      body: body
    };
  }

  function install(opts) {
    const wf = generate(opts);
    // write to Engine.FS so next push includes it
    if (window.Engine && window.Engine.FS && window.Engine.FS.write) {
      try {
        window.Engine.FS.write(wf.path, wf.body);
        return { ok: true, path: wf.path, body: wf.body, label: wf.label };
      } catch (e) {
        return { ok: false, error: String(e), path: wf.path, body: wf.body, label: wf.label };
      }
    }
    return { ok: false, error: 'no Engine.FS available', path: wf.path, body: wf.body, label: wf.label };
  }

  // -------- webhooks --------
  function listWebhooks() { return loadHooks(); }
  function addWebhook(opts) {
    opts = opts || {};
    if (!opts.url) throw new Error('url required');
    const wh = {
      id: uid(),
      url: opts.url,
      events: Array.isArray(opts.events) ? opts.events : ['push'],
      secret: opts.secret || '',
      active: opts.active !== false,
      created: nowIso(),
      lastTriggered: null
    };
    const all = loadHooks();
    all.unshift(wh);
    saveHooks(all);
    return wh;
  }
  function updateWebhook(id, patch) {
    const all = loadHooks();
    const idx = all.findIndex(w => w.id === id);
    if (idx === -1) return null;
    all[idx] = Object.assign({}, all[idx], patch);
    saveHooks(all);
    return all[idx];
  }
  function removeWebhook(id) {
    saveHooks(loadHooks().filter(w => w.id !== id));
    return true;
  }
  function trigger(webhookId, event, payload) {
    const wh = loadHooks().find(w => w.id === webhookId);
    if (!wh) return null;
    event = event || 'push';
    const delivery = {
      id: 'del_' + Math.random().toString(36).slice(2, 12),
      webhookId: webhookId,
      event: event,
      ts: nowIso(),
      payload: payload || { ref: 'refs/heads/' + DEFAULT_BRANCH },
      status: 'simulated',  // we can't actually POST cross-origin from GitHub
      ok: true
    };
    const hist = loadHistory();
    hist.unshift(delivery);
    if (hist.length > 100) hist.length = 100;
    saveHistory(hist);
    updateWebhook(webhookId, { lastTriggered: nowIso() });
    return delivery;
  }
  function deliveries() { return loadHistory(); }
  function history() { return loadHistory(); }
  function clearHistory() { saveHistory([]); return true; }

  // -------- external receiver endpoint helper --------
  // The user can copy this URL pattern to point GitHub webhooks at any
  // reachable endpoint. CodeSovereign has no public endpoint, so this
  // returns a sample URL format the user can adapt to their own server.
  function receiverUrlTemplate() {
    return 'https://<your-host>/api/webhook?secret=<your-secret>';
  }

  const api = {
    generate, install,
    listWebhooks, addWebhook, updateWebhook, removeWebhook,
    trigger, deliveries, history, clearHistory,
    presets, receiverUrlTemplate
  };
  window.GitHubActions = api;
  if (window.Engine) window.Engine.GitHubActions = api;
})();
