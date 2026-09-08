/* =====================================================================
   engine.deploy.js  —  Engine.Deploy   (GodMode blueprint §41-42)

   Separates application build from infrastructure provisioning. It does
   NOT push to a cloud (that needs your credentials) — it generates the
   infrastructure-as-code + a runnable deploy script + a preflight
   checklist for each target, so `bash deploy/<target>.sh` is all that's
   left.

   Targets: docker · compose · fly · render · vps · static · railway

   window.Engine.Deploy
     TARGETS
     preflight(project)            -> { ok, checks:[{name,ok,detail}] }
     artifacts(target, opts)       -> [{ path, content }]
     plan(target)                  -> { target, needs:[...], generates:[...], cost }
     apply(target, opts)           -> writes artifacts into Engine.FS, returns paths
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function read(p) { try { return Engine.FS.read(p) || ''; } catch (_) { return ''; } }
  function has(p) { try { return Engine.FS.exists(p); } catch (_) { return false; } }
  function pkg() { try { return JSON.parse(read('/package.json') || 'null'); } catch (_) { return null; } }
  function detectPort() {
    var srv = read('/server.js') + read('/src/server.js') + read('/index.js') + read('/app.js');
    var m = srv.match(/--port[= ](\d{2,5})|PORT\s*\|\|\s*(\d{2,5})|listen\((\d{2,5})/);
    return (m && (m[1] || m[2] || m[3])) || '4319';
  }
  function projectName() { var p = pkg(); return (p && p.name) || 'app'; }

  var TARGETS = {
    docker:  { label: 'Docker image', cost: 'free (your host)', needs: ['docker'] },
    compose: { label: 'Docker Compose (app + Postgres)', cost: 'free (your host)', needs: ['docker', 'docker compose'] },
    vps:     { label: 'VPS via SSH + systemd + Caddy', cost: '~$4-6/mo (Hetzner/DO/Fly)', needs: ['ssh access', 'a domain (optional)'] },
    fly:     { label: 'Fly.io', cost: 'free allowance, then usage', needs: ['flyctl', 'a Fly account'] },
    render:  { label: 'Render', cost: 'free web service (spins down)', needs: ['a Render account', 'a Git remote'] },
    railway: { label: 'Railway', cost: 'usage / trial', needs: ['a Railway account'] },
    static:  { label: 'Static hosting (Cloudflare Pages / Netlify)', cost: 'free', needs: ['npm run build produces dist/'] }
  };

  function preflight(project) {
    var p = pkg() || {};
    var scripts = p.scripts || {};
    var checks = [
      { name: 'has a start command', ok: !!(scripts.start || scripts.dev || has('/server.js') || has('/index.js')),
        detail: scripts.start || scripts.dev || 'server.js' },
      { name: 'port is configurable (env / --port)', ok: /PORT|--port/.test(read('/server.js') + read('/src/server.js') + read('/index.js')),
        detail: 'port ' + detectPort() },
      { name: 'production build defined', ok: !!scripts.build, detail: scripts.build || 'none — ok for a plain node service' },
      { name: 'secrets are templated in .env.example', ok: has('/.env.example'), detail: has('/.env.example') ? '.env.example present' : 'add .env.example' },
      { name: 'no real .env committed', ok: !(has('/.env') && /^[A-Z_]+=.+\S/m.test(read('/.env'))), detail: has('/.env') ? '.env present — check it' : 'clean' },
      { name: 'healthcheck endpoint or "/" responds', ok: /\/health|\bok\b|200/.test(read('/server.js') + read('/src/server.js')), detail: 'used by Docker / load balancers' },
      { name: 'migrations run on deploy', ok: !!scripts.migrate || !has('/db/migrations'), detail: scripts.migrate || 'no migrations' }
    ];
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks };
  }

  function plan(target) {
    var t = TARGETS[target];
    if (!t) return { error: 'unknown target ' + target + ' (' + Object.keys(TARGETS).join(', ') + ')' };
    return { target: target, label: t.label, cost: t.cost, needs: t.needs, generates: Object.keys(artifactMap(target, {})) };
  }

  function artifactMap(target, opts) {
    opts = opts || {};
    var name = projectName();
    var port = detectPort();
    var out = {};

    // shared
    out['.dockerignore'] = 'node_modules\n.git\ndist\n.data\n*.log\n.env\n';

    if (target === 'docker' || target === 'compose' || target === 'fly' || target === 'railway') {
      if (!has('/Dockerfile') || opts.force) {
        out['Dockerfile'] =
          'FROM node:20-alpine AS deps\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev || npm install --omit=dev\n\n' +
          'FROM node:20-alpine\nWORKDIR /app\nENV NODE_ENV=production PORT=' + port + '\n' +
          'COPY --from=deps /app/node_modules ./node_modules\nCOPY . .\n' +
          (pkg() && pkg().scripts && pkg().scripts.build ? 'RUN npm run build\n' : '') +
          (has('/db/migrations') ? 'RUN node scripts/migrate.js || true\n' : '') +
          'EXPOSE ' + port + '\n' +
          'HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://localhost:' + port + '/ || exit 1\n' +
          'USER node\nCMD ["node", "server.js", "--port=' + port + '"]\n';
      }
    }

    if (target === 'compose') {
      out['docker-compose.prod.yml'] =
        'services:\n' +
        '  app:\n    build: .\n    ports: ["' + port + ':' + port + '"]\n    environment:\n      - NODE_ENV=production\n      - PORT=' + port + '\n' +
        '      - DATABASE_URL=postgres://app:app@db:5432/' + name + '\n    depends_on:\n      db:\n        condition: service_healthy\n    restart: unless-stopped\n' +
        '  db:\n    image: postgres:16-alpine\n    environment:\n      - POSTGRES_USER=app\n      - POSTGRES_PASSWORD=app\n      - POSTGRES_DB=' + name + '\n' +
        '    volumes: ["pgdata:/var/lib/postgresql/data"]\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U app"]\n      interval: 5s\n      retries: 10\n' +
        'volumes:\n  pgdata:\n';
      out['deploy/compose.sh'] = '#!/usr/bin/env bash\nset -euo pipefail\ndocker compose -f docker-compose.prod.yml up -d --build\ndocker compose -f docker-compose.prod.yml ps\n';
    }

    if (target === 'fly') {
      out['fly.toml'] =
        'app = "' + name + '"\nprimary_region = "iad"\n\n[build]\n\n[env]\n  PORT = "' + port + '"\n\n' +
        '[http_service]\n  internal_port = ' + port + '\n  force_https = true\n  auto_stop_machines = true\n  auto_start_machines = true\n  min_machines_running = 0\n\n' +
        '[[http_service.checks]]\n  interval = "15s"\n  timeout = "2s"\n  method = "GET"\n  path = "/"\n';
      out['deploy/fly.sh'] = '#!/usr/bin/env bash\nset -euo pipefail\ncommand -v flyctl >/dev/null || { echo "install flyctl: https://fly.io/docs/hands-on/install-flyctl/"; exit 1; }\nflyctl deploy --now\n';
    }

    if (target === 'render') {
      out['render.yaml'] =
        'services:\n  - type: web\n    name: ' + name + '\n    runtime: node\n    plan: free\n    buildCommand: npm install' + (pkg() && pkg().scripts && pkg().scripts.build ? ' && npm run build' : '') + '\n' +
        '    startCommand: node server.js --port=$PORT\n    healthCheckPath: /\n    envVars:\n      - key: NODE_ENV\n        value: production\n';
    }

    if (target === 'vps') {
      out['deploy/' + name + '.service'] =
        '[Unit]\nDescription=' + name + '\nAfter=network.target\n\n[Service]\nType=simple\nUser=' + name + '\nWorkingDirectory=/opt/' + name + '\n' +
        'Environment=NODE_ENV=production\nEnvironmentFile=-/opt/' + name + '/.env\nExecStart=/usr/bin/node server.js --port=' + port + '\nRestart=on-failure\nRestartSec=3\n\n[Install]\nWantedBy=multi-user.target\n';
      out['deploy/Caddyfile'] = '# replace example.com with your domain\nexample.com {\n  reverse_proxy 127.0.0.1:' + port + '\n}\n';
      out['deploy/vps.sh'] =
        '#!/usr/bin/env bash\n# usage: HOST=user@1.2.3.4 bash deploy/vps.sh\nset -euo pipefail\n: "${HOST:?set HOST=user@ip}"\nNAME=' + name + '\n' +
        'ssh "$HOST" "sudo mkdir -p /opt/$NAME && sudo chown \\$USER /opt/$NAME"\n' +
        'rsync -az --delete --exclude node_modules --exclude .git --exclude .data ./ "$HOST:/opt/$NAME/"\n' +
        'ssh "$HOST" "cd /opt/$NAME && npm ci --omit=dev && (node scripts/migrate.js || true) && sudo cp deploy/$NAME.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now $NAME && sudo systemctl restart $NAME && systemctl --no-pager status $NAME"\n';
    }

    if (target === 'static') {
      out['deploy/static.sh'] = '#!/usr/bin/env bash\nset -euo pipefail\nnpm run build\necho "upload ./dist to Cloudflare Pages / Netlify / any static host"\n';
      out['_headers'] = '/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n';
    }

    return out;
  }

  function artifacts(target, opts) {
    var m = artifactMap(target, opts || {});
    return Object.keys(m).sort().map(function (p) { return { path: '/' + p, content: m[p] }; });
  }

  function apply(target, opts) {
    var a = artifacts(target, opts);
    a.forEach(function (f) { Engine.FS.write(f.path, f.content); });
    var pf = preflight();
    if (Engine.Sovereign) {
      Engine.Sovereign.write('deployment.json', {
        generatedAt: Date.now(), target: target, artifacts: a.map(function (f) { return f.path; }),
        preflight: pf, plan: plan(target)
      });
    }
    return { target: target, wrote: a.map(function (f) { return f.path; }), preflight: pf };
  }

  Engine.Deploy = { TARGETS: TARGETS, preflight: preflight, plan: plan, artifacts: artifacts, apply: apply };
  console.info('[Deploy] deployment IaC + preflight ready — Engine.Deploy');
})();
