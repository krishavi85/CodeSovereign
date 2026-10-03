/* =====================================================================
   engine.deploy.js  —  Engine.Deploy   (blueprint §41-42)

   Separates application build from infrastructure provisioning. It does
   NOT push to a cloud (that needs your credentials) — it generates the
   infrastructure-as-code + a runnable deploy script + a preflight
   checklist for each target, so `bash deploy/<target>.sh` is all that's
   left.

   Targets: docker · compose · kubernetes · helm · terraform ·
            fly · render · railway · vps · static

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
    docker:     { label: 'Docker image', cost: 'free (your host)', needs: ['docker'] },
    compose:    { label: 'Docker Compose (app + Postgres)', cost: 'free (your host)', needs: ['docker', 'docker compose'] },
    kubernetes: { label: 'Kubernetes manifests (Deployment/Service/Ingress/HPA + Postgres StatefulSet)', cost: 'cluster cost', needs: ['kubectl', 'a cluster + ingress controller'] },
    helm:       { label: 'Helm chart', cost: 'cluster cost', needs: ['helm', 'a Kubernetes cluster'] },
    terraform:  { label: 'Terraform (DigitalOcean droplet + managed Postgres + deploy)', cost: '~$6-15/mo', needs: ['terraform', 'a DigitalOcean API token'] },
    vps:        { label: 'VPS via SSH + systemd + Caddy', cost: '~$4-6/mo (Hetzner/DO/Fly)', needs: ['ssh access', 'a domain (optional)'] },
    fly:        { label: 'Fly.io', cost: 'free allowance, then usage', needs: ['flyctl', 'a Fly account'] },
    render:     { label: 'Render', cost: 'free web service (spins down)', needs: ['a Render account', 'a Git remote'] },
    railway:    { label: 'Railway', cost: 'usage / trial', needs: ['a Railway account'] },
    static:     { label: 'Static hosting (Cloudflare Pages / Netlify)', cost: 'free', needs: ['npm run build produces dist/'] }
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

    /* ---------------- Kubernetes ---------------- */
    if (target === 'kubernetes' || target === 'helm') {
      // reused by both raw manifests and the Helm templates (Helm just swaps
      // literals for {{ .Values.* }})
      var kManifests = k8sManifests(name, port, opts);
      if (target === 'kubernetes') {
        Object.keys(kManifests).forEach(function (k) { out['k8s/' + k] = kManifests[k]; });
        out['deploy/k8s.sh'] =
          '#!/usr/bin/env bash\nset -euo pipefail\n# needs: a running cluster + an ingress controller. Set the DB password first:\n' +
          '#   kubectl create secret generic ' + name + '-db --from-literal=password="$(openssl rand -hex 16)" || true\n' +
          'kubectl apply -f k8s/namespace.yaml\nkubectl apply -f k8s/\n' +
          'kubectl -n ' + name + ' rollout status deploy/' + name + ' --timeout=120s\nkubectl -n ' + name + ' get all,ingress\n';
      } else {
        out['chart/Chart.yaml'] =
          'apiVersion: v2\nname: ' + name + '\ndescription: ' + name + ' — generated by CodeSovereign\ntype: application\nversion: 0.1.0\nappVersion: "0.1.0"\n';
        out['chart/values.yaml'] =
          'replicaCount: 2\nimage:\n  repository: ' + name + '\n  tag: latest\n  pullPolicy: IfNotPresent\n' +
          'service:\n  port: ' + port + '\ningress:\n  enabled: true\n  host: ' + name + '.example.com\n' +
          'resources:\n  requests: { cpu: 50m, memory: 96Mi }\n  limits: { cpu: 500m, memory: 256Mi }\n' +
          'autoscaling:\n  enabled: true\n  minReplicas: 2\n  maxReplicas: 6\n  targetCPUUtilizationPercentage: 70\n' +
          'postgres:\n  enabled: true\n  storage: 5Gi\n';
        out['chart/templates/deployment.yaml'] = helmDeployment(name);
        out['chart/templates/service.yaml'] =
          'apiVersion: v1\nkind: Service\nmetadata:\n  name: {{ .Release.Name }}\nspec:\n  selector:\n    app: {{ .Release.Name }}\n  ports:\n    - port: {{ .Values.service.port }}\n      targetPort: http\n';
        out['chart/templates/ingress.yaml'] =
          '{{- if .Values.ingress.enabled }}\napiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: {{ .Release.Name }}\n  annotations:\n    nginx.ingress.kubernetes.io/ssl-redirect: "true"\nspec:\n  rules:\n    - host: {{ .Values.ingress.host }}\n      http:\n        paths:\n          - path: /\n            pathType: Prefix\n            backend:\n              service:\n                name: {{ .Release.Name }}\n                port:\n                  number: {{ .Values.service.port }}\n{{- end }}\n';
        out['chart/templates/hpa.yaml'] =
          '{{- if .Values.autoscaling.enabled }}\napiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: {{ .Release.Name }}\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: {{ .Release.Name }}\n  minReplicas: {{ .Values.autoscaling.minReplicas }}\n  maxReplicas: {{ .Values.autoscaling.maxReplicas }}\n  metrics:\n    - type: Resource\n      resource:\n        name: cpu\n        target:\n          type: Utilization\n          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}\n{{- end }}\n';
        out['deploy/helm.sh'] =
          '#!/usr/bin/env bash\nset -euo pipefail\nhelm upgrade --install ' + name + ' ./chart --namespace ' + name + ' --create-namespace --wait\nkubectl -n ' + name + ' get all,ingress\n';
      }
    }

    /* ---------------- Terraform ---------------- */
    if (target === 'terraform') {
      out['terraform/main.tf'] =
        'terraform {\n  required_providers {\n    digitalocean = {\n      source  = "digitalocean/digitalocean"\n      version = "~> 2.0"\n    }\n  }\n}\n\n' +
        'provider "digitalocean" {\n  token = var.do_token\n}\n\n' +
        'resource "digitalocean_database_cluster" "pg" {\n  name       = "' + name + '-pg"\n  engine     = "pg"\n  version    = "16"\n  size       = "db-s-1vcpu-1gb"\n  region     = var.region\n  node_count = 1\n}\n\n' +
        'resource "digitalocean_droplet" "app" {\n  name     = "' + name + '"\n  image    = "docker-20-04"\n  size     = "s-1vcpu-1gb"\n  region   = var.region\n  ssh_keys = var.ssh_key_ids\n\n  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {\n    image        = var.image\n    app_port     = ' + port + '\n    database_url = digitalocean_database_cluster.pg.uri\n  })\n}\n\n' +
        'output "app_ip" {\n  value = digitalocean_droplet.app.ipv4_address\n}\n\noutput "db_uri" {\n  value     = digitalocean_database_cluster.pg.uri\n  sensitive = true\n}\n';
      out['terraform/cloud-init.yaml.tftpl'] =
        '#!/bin/bash\nset -e\nmkdir -p /opt/app && cd /opt/app\ncat > docker-compose.yml <<COMPOSE\nservices:\n  app:\n    image: ${image}\n    restart: unless-stopped\n    ports:\n      - "80:${app_port}"\n    environment:\n      - NODE_ENV=production\n      - DATABASE_URL=${database_url}\nCOMPOSE\ndocker compose up -d\n';
      out['terraform/variables.tf'] =
        'variable "do_token" {\n  type        = string\n  sensitive   = true\n  description = "DigitalOcean API token"\n}\n\n' +
        'variable "region" {\n  type    = string\n  default = "nyc3"\n}\n\n' +
        'variable "ssh_key_ids" {\n  type    = list(string)\n  default = []\n}\n\n' +
        'variable "image" {\n  type        = string\n  default     = "' + name + ':latest"\n  description = "container image (push it to a registry first)"\n}\n';
      out['terraform/terraform.tfvars.example'] = 'do_token    = "dop_v1_..."\nregion      = "nyc3"\nssh_key_ids = ["12345678"]\nimage       = "ghcr.io/you/' + name + ':latest"\n';
      out['deploy/terraform.sh'] =
        '#!/usr/bin/env bash\nset -euo pipefail\ncd terraform\n[ -f terraform.tfvars ] || { echo "cp terraform.tfvars.example terraform.tfvars and fill it in"; exit 1; }\n' +
        'terraform init\nterraform plan -out tfplan\nread -p "apply? [y/N] " a; [ "$a" = y ] && terraform apply tfplan\n';
    }

    return out;
  }

  // Raw Kubernetes manifests (namespace, ConfigMap, Secret template, app
  // Deployment/Service/Ingress/HPA, and a single-replica Postgres StatefulSet).
  function k8sManifests(name, port, opts) {
    var img = (opts && opts.image) || (name + ':latest');
    var m = {};
    m['namespace.yaml'] = 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ' + name + '\n';
    m['configmap.yaml'] =
      'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ' + name + '-config\n  namespace: ' + name + '\ndata:\n  NODE_ENV: "production"\n  PORT: "' + port + '"\n';
    m['secret.yaml'] =
      '# create the real secret out-of-band; this is a placeholder:\n#   kubectl -n ' + name + ' create secret generic ' + name + '-db --from-literal=password=CHANGEME\napiVersion: v1\nkind: Secret\nmetadata:\n  name: ' + name + '-db\n  namespace: ' + name + '\ntype: Opaque\nstringData:\n  password: "CHANGEME"\n';
    m['deployment.yaml'] =
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ' + name + '\n  namespace: ' + name + '\nspec:\n  replicas: 2\n  selector:\n    matchLabels: { app: ' + name + ' }\n  template:\n    metadata:\n      labels: { app: ' + name + ' }\n    spec:\n      securityContext: { runAsNonRoot: true, runAsUser: 1000 }\n      containers:\n        - name: app\n          image: ' + img + '\n          ports: [{ name: http, containerPort: ' + port + ' }]\n          envFrom: [{ configMapRef: { name: ' + name + '-config } }]\n          env:\n            - name: DATABASE_URL\n              value: "postgres://app:$(DB_PASSWORD)@' + name + '-db-svc:5432/' + name + '"\n            - name: DB_PASSWORD\n              valueFrom: { secretKeyRef: { name: ' + name + '-db, key: password } }\n          readinessProbe: { httpGet: { path: /, port: http }, initialDelaySeconds: 3, periodSeconds: 10 }\n          livenessProbe:  { httpGet: { path: /, port: http }, initialDelaySeconds: 10, periodSeconds: 20 }\n          resources:\n            requests: { cpu: 50m, memory: 96Mi }\n            limits:   { cpu: 500m, memory: 256Mi }\n';
    m['service.yaml'] =
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: ' + name + '\n  namespace: ' + name + '\nspec:\n  selector: { app: ' + name + ' }\n  ports: [{ port: ' + port + ', targetPort: http }]\n';
    m['ingress.yaml'] =
      'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: ' + name + '\n  namespace: ' + name + '\n  annotations:\n    nginx.ingress.kubernetes.io/ssl-redirect: "true"\nspec:\n  rules:\n    - host: ' + name + '.example.com\n      http:\n        paths:\n          - path: /\n            pathType: Prefix\n            backend: { service: { name: ' + name + ', port: { number: ' + port + ' } } }\n';
    m['hpa.yaml'] =
      'apiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: ' + name + '\n  namespace: ' + name + '\nspec:\n  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: ' + name + ' }\n  minReplicas: 2\n  maxReplicas: 6\n  metrics:\n    - type: Resource\n      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }\n';
    m['postgres.yaml'] =
      'apiVersion: apps/v1\nkind: StatefulSet\nmetadata:\n  name: ' + name + '-db\n  namespace: ' + name + '\nspec:\n  serviceName: ' + name + '-db-svc\n  replicas: 1\n  selector: { matchLabels: { app: ' + name + '-db } }\n  template:\n    metadata: { labels: { app: ' + name + '-db } }\n    spec:\n      containers:\n        - name: postgres\n          image: postgres:16-alpine\n          ports: [{ containerPort: 5432 }]\n          env:\n            - { name: POSTGRES_USER, value: app }\n            - { name: POSTGRES_DB, value: ' + name + ' }\n            - name: POSTGRES_PASSWORD\n              valueFrom: { secretKeyRef: { name: ' + name + '-db, key: password } }\n          volumeMounts: [{ name: data, mountPath: /var/lib/postgresql/data }]\n  volumeClaimTemplates:\n    - metadata: { name: data }\n      spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: 5Gi } } }\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: ' + name + '-db-svc\n  namespace: ' + name + '\nspec:\n  selector: { app: ' + name + '-db }\n  ports: [{ port: 5432 }]\n';
    return m;
  }

  function helmDeployment(name) {
    return 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Release.Name }}\nspec:\n  replicas: {{ .Values.replicaCount }}\n  selector:\n    matchLabels: { app: {{ .Release.Name }} }\n  template:\n    metadata:\n      labels: { app: {{ .Release.Name }} }\n    spec:\n      containers:\n        - name: app\n          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"\n          imagePullPolicy: {{ .Values.image.pullPolicy }}\n          ports: [{ name: http, containerPort: {{ .Values.service.port }} }]\n          readinessProbe: { httpGet: { path: /, port: http } }\n          resources: {{- toYaml .Values.resources | nindent 12 }}\n';
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
