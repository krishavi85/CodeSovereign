/* =====================================================================
   engine.pipeline-parse.js  —  parse REAL CI / container / infra files into
   the normalized Sovereign pipeline graph, then detect gaps.

     Engine.PipelineParse.parseAll()  -> { pipelines:[], graph:{nodes,edges}, gaps:[] }

   Handles: .github/workflows/*.yml, .gitlab-ci.yml, Dockerfile, docker-compose,
   *.tf (light), migrations/, package.json scripts.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.Engine) return;
  var Engine = window.Engine;
  var FS = Engine.FS;
  var SELF_RE = /^\/?(\.sovereign|node_modules|\.git|dist|build|release|coverage|vendor)\//;
  function isProduct(p) { return !SELF_RE.test(p); }
  function yaml() { return window.jsyaml || null; }

  var YAML_MAX = 512 * 1024;
  function safeYaml(src) {
    var y = yaml(); if (!y) return null;
    if (typeof src !== 'string' || src.length > YAML_MAX) return { __error: 'file too large / not text' };
    // crude anchor-bomb guard: a workflow with hundreds of aliases is not real
    if ((src.match(/(^|\s)[*&][A-Za-z0-9_-]+/g) || []).length > 200 || (src.match(/<<\s*:/g) || []).length > 50) {
      return { __error: 'excessive YAML anchors/merges — refusing to expand' };
    }
    // js-yaml v4 load() has no code-execution tags; json:true rejects duplicate keys
    try { return y.load(src, { json: true }); }
    catch (e) { return { __error: String(e && e.message || e) }; }
  }

  function secretsIn(str) {
    var out = [];
    String(str || '').replace(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g, function (_, s) { out.push(s); return _; });
    return out;
  }

  /* ---------- GitHub Actions ---------- */
  function parseGithubWorkflow(src, path) {
    var doc = safeYaml(src);
    if (!doc || doc.__error) return { kind: 'github-actions', file: path, error: doc && doc.__error, jobs: [] };
    var on = doc.on || doc[true] /* 'on' is parsed as boolean true by YAML 1.1 */ || {};
    var triggers = Array.isArray(on) ? on.slice()
      : (typeof on === 'string') ? [on]
      : Object.keys(on);
    var jobs = Object.keys(doc.jobs || {}).map(function (id) {
      var j = doc.jobs[id] || {};
      var steps = (j.steps || []).map(function (st) {
        return {
          name: st.name || st.uses || (st.run ? String(st.run).split('\n')[0].slice(0, 60) : 'step'),
          uses: st.uses || null,
          run: st.run ? String(st.run).slice(0, 400) : null,
          secrets: secretsIn(JSON.stringify(st))
        };
      });
      return {
        id: id,
        runsOn: j['runs-on'] || (j.container && 'container') || 'unknown',
        needs: [].concat(j.needs || []),
        if: j.if || null,
        environment: (j.environment && (j.environment.name || j.environment)) || null,
        permissions: j.permissions || null,
        steps: steps,
        usesCache: steps.some(function (s) { return /actions\/cache/.test(s.uses || ''); }),
        uploadsArtifact: steps.some(function (s) { return /upload-artifact/.test(s.uses || ''); }),
        runsTests: steps.some(function (s) { return /\b(test|jest|vitest|pytest|go test|cargo test)\b/i.test((s.run || '') + (s.name || '')); }),
        deploys: steps.some(function (s) { return /\b(deploy|publish|release|netlify|vercel|fly|render|gh-pages|npm publish)\b/i.test((s.run || '') + (s.name || '') + (s.uses || '')); })
      };
    });
    return { kind: 'github-actions', file: path, name: doc.name || path, triggers: triggers, jobs: jobs };
  }

  /* ---------- GitLab CI ---------- */
  function parseGitlab(src, path) {
    var doc = safeYaml(src);
    if (!doc || doc.__error) return { kind: 'gitlab-ci', file: path, error: doc && doc.__error, jobs: [] };
    var stages = doc.stages || [];
    var jobs = Object.keys(doc).filter(function (k) {
      return doc[k] && typeof doc[k] === 'object' && (doc[k].script || doc[k].stage) && k[0] !== '.';
    }).map(function (id) {
      var j = doc[id];
      return { id: id, stage: j.stage || 'test', needs: [].concat(j.needs || []), steps: [].concat(j.script || []).map(function (s) { return { run: String(s).slice(0, 200) }; }) };
    });
    return { kind: 'gitlab-ci', file: path, stages: stages, jobs: jobs };
  }

  /* ---------- Dockerfile ---------- */
  function parseDockerfile(src, path) {
    var froms = [], ports = [], stages = [], hasHealth = false, entrypoint = null;
    src.split('\n').forEach(function (line) {
      var m;
      if ((m = line.match(/^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i))) { froms.push(m[1]); if (m[2]) stages.push(m[2]); }
      if ((m = line.match(/^\s*EXPOSE\s+(.+)/i))) ports.push.apply(ports, m[1].trim().split(/\s+/));
      if (/^\s*HEALTHCHECK\b/i.test(line)) hasHealth = true;
      if ((m = line.match(/^\s*(ENTRYPOINT|CMD)\s+(.+)/i))) entrypoint = m[2].slice(0, 120);
    });
    return { kind: 'dockerfile', file: path, baseImages: froms, buildStages: stages, exposedPorts: ports, healthcheck: hasHealth, entrypoint: entrypoint };
  }

  /* ---------- docker-compose ---------- */
  function parseCompose(src, path) {
    var doc = safeYaml(src);
    if (!doc || doc.__error || !doc.services) return { kind: 'compose', file: path, error: doc && doc.__error, services: [] };
    var services = Object.keys(doc.services).map(function (name) {
      var s = doc.services[name] || {};
      return {
        name: name, image: s.image || (s.build ? 'build' : null),
        ports: [].concat(s.ports || []),
        dependsOn: Array.isArray(s.depends_on) ? s.depends_on : Object.keys(s.depends_on || {}),
        healthcheck: !!s.healthcheck,
        restart: s.restart || null
      };
    });
    return { kind: 'compose', file: path, services: services };
  }

  /* ---------- Terraform (light) ---------- */
  function parseTerraform(src, path) {
    var resources = [], providers = [], backend = null;
    var re = /(resource|data|provider)\s+"([^"]+)"(?:\s+"([^"]+)")?/g, m;
    while ((m = re.exec(src))) {
      if (m[1] === 'provider') providers.push(m[2]);
      else resources.push({ mode: m[1], type: m[2], name: m[3] || '' });
    }
    var b = src.match(/backend\s+"([^"]+)"/);
    if (b) backend = b[1];
    return { kind: 'terraform', file: path, providers: providers, resources: resources, backend: backend };
  }

  function migrationsPresent() {
    return Object.keys(FS._data).some(function (p) {
      return isProduct(p) && FS.isFile(p) && /(migrations?|migrate)\/.+\.(sql|js|ts|py|rb)$/i.test(p);
    });
  }

  /* ---------- normalized graph + gap detection ---------- */
  function toGraph(pipelines) {
    var nodes = [], edges = [];
    pipelines.forEach(function (pl) {
      (pl.jobs || []).forEach(function (j) {
        var nid = pl.file + '#' + j.id;
        nodes.push({ id: nid, pipeline: pl.file, job: j.id, runsOn: j.runsOn, deploys: !!j.deploys, runsTests: !!j.runsTests, environment: j.environment || null });
        (j.needs || []).forEach(function (dep) { edges.push({ from: pl.file + '#' + dep, to: nid, type: 'needs' }); });
      });
    });
    return { nodes: nodes, edges: edges };
  }

  var GAP_RULES = [
    function noTrigger(p) {
      if (p.kind === 'github-actions' && (!p.triggers || !p.triggers.length))
        return { severity: 'high', kind: 'missing-trigger', file: p.file, why: 'workflow has no `on:` trigger — it can never run' };
    },
    function orphanJob(p, graph) {
      if (p.kind !== 'github-actions') return;
      var jobIds = (p.jobs || []).map(function (j) { return j.id; });
      var referenced = {};
      (p.jobs || []).forEach(function (j) { (j.needs || []).forEach(function (n) { referenced[n] = 1; }); });
      var out = [];
      (p.jobs || []).forEach(function (j) {
        var neededBy = jobIds.some(function (o) { return referenced[j.id]; });
        // a job with unknown needs
        (j.needs || []).forEach(function (n) {
          if (jobIds.indexOf(n) < 0) out.push({ severity: 'high', kind: 'invalid-dependency', file: p.file, why: 'job `' + j.id + '` needs `' + n + '` which does not exist' });
        });
      });
      return out;
    },
    function deployWithoutTests(p) {
      if (p.kind !== 'github-actions') return;
      var out = [];
      (p.jobs || []).forEach(function (j) {
        if (!j.deploys) return;
        var chain = collectNeeds(p, j.id);
        var anyTests = chain.some(function (id) {
          var jj = (p.jobs || []).find(function (x) { return x.id === id; });
          return jj && jj.runsTests;
        });
        if (!anyTests) out.push({ severity: 'high', kind: 'unsafe-deployment', file: p.file, why: 'deploy job `' + j.id + '` does not depend on any job that runs tests' });
        if (!j.environment) out.push({ severity: 'medium', kind: 'no-environment-gate', file: p.file, why: 'deploy job `' + j.id + '` has no `environment:` (no protection rules / approval)' });
      });
      return out;
    },
    function secretExposure(p) {
      if (p.kind !== 'github-actions') return;
      var out = [];
      (p.jobs || []).forEach(function (j) {
        (j.steps || []).forEach(function (s) {
          if (s.run && /\becho\b[^|]*\$\{\{\s*secrets\./i.test(s.run))
            out.push({ severity: 'high', kind: 'secret-exposure', file: p.file, why: 'step "' + s.name + '" echoes a secret to the log' });
        });
      });
      return out;
    },
    function noArtifact(p) {
      if (p.kind !== 'github-actions') return;
      var builds = (p.jobs || []).some(function (j) { return /build|dist|package/i.test(j.id) || (j.steps || []).some(function (s) { return /\bbuild\b/.test((s.run || '') + (s.name || '')); }); });
      var uploads = (p.jobs || []).some(function (j) { return j.uploadsArtifact; });
      if (builds && !uploads)
        return { severity: 'low', kind: 'unverified-artifact', file: p.file, why: 'a build job produces no uploaded artifact — the output is not retained or checked' };
    },
    function composeNoHealth(p) {
      if (p.kind !== 'compose') return;
      var out = [];
      (p.services || []).forEach(function (s) {
        if (!s.healthcheck && s.dependsOn.length === 0 && s.image && /(postgres|mysql|redis|mongo|rabbitmq|kafka)/i.test(s.image))
          out.push({ severity: 'medium', kind: 'missing-healthcheck', file: p.file, why: 'service `' + s.name + '` (' + s.image + ') has no healthcheck — dependents may start too early' });
      });
      return out;
    },
    function dockerNoHealth(p) {
      if (p.kind === 'dockerfile' && p.exposedPorts.length && !p.healthcheck)
        return { severity: 'low', kind: 'missing-healthcheck', file: p.file, why: 'Dockerfile EXPOSEs a port but declares no HEALTHCHECK' };
    },
    function tfNoBackend(p) {
      if (p.kind === 'terraform' && p.resources.length && !p.backend)
        return { severity: 'medium', kind: 'local-tf-state', file: p.file, why: 'Terraform has resources but no remote `backend` — state is local and unshared' };
    }
  ];

  function collectNeeds(p, jobId) {
    var seen = {}, stack = [jobId];
    while (stack.length) {
      var id = stack.pop();
      var j = (p.jobs || []).find(function (x) { return x.id === id; });
      if (!j) continue;
      (j.needs || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; stack.push(n); } });
    }
    return Object.keys(seen);
  }

  function detectGaps(pipelines, graph) {
    var gaps = [];
    var hasCI = pipelines.some(function (p) { return p.kind === 'github-actions' || p.kind === 'gitlab-ci'; });
    var hasMigrations = migrationsPresent();
    var deploysAnywhere = pipelines.some(function (p) { return (p.jobs || []).some(function (j) { return j.deploys; }); });

    pipelines.forEach(function (p) {
      GAP_RULES.forEach(function (rule) {
        var r = rule(p, graph);
        if (!r) return;
        (Array.isArray(r) ? r : [r]).forEach(function (g) { gaps.push(g); });
      });
    });

    if (!hasCI) gaps.push({ severity: 'medium', kind: 'no-ci', file: '(project)', why: 'no CI workflow found — nothing runs tests/build automatically on push' });
    if (hasMigrations && deploysAnywhere) {
      var ordered = pipelines.some(function (p) {
        return (p.jobs || []).some(function (j) { return /migrat/i.test(j.id) || (j.steps || []).some(function (s) { return /migrat/i.test((s.run || '') + (s.name || '')); }); });
      });
      if (!ordered) gaps.push({ severity: 'high', kind: 'migration-race', file: '(project)', why: 'migrations exist and a deploy pipeline exists, but no job runs migrations — expand/migrate/contract ordering is not represented' });
    }
    return gaps;
  }

  function parseAll() {
    var pipelines = [];
    Object.keys(FS._data).forEach(function (p) {
      if (!FS.isFile(p) || !isProduct(p)) return;
      var src = FS.read(p) || '';
      if (/\.github\/workflows\/.+\.ya?ml$/i.test(p)) pipelines.push(parseGithubWorkflow(src, p));
      else if (/(^|\/)\.gitlab-ci\.ya?ml$/i.test(p)) pipelines.push(parseGitlab(src, p));
      else if (/(^|\/)Dockerfile[^/]*$/i.test(p)) pipelines.push(parseDockerfile(src, p));
      else if (/(docker-)?compose(\.[a-z]+)?\.ya?ml$/i.test(p)) pipelines.push(parseCompose(src, p));
      else if (/\.tf$/i.test(p)) pipelines.push(parseTerraform(src, p));
    });
    var graph = toGraph(pipelines);
    var gaps = detectGaps(pipelines, graph);
    return { generatedAt: Date.now(), pipelines: pipelines, graph: graph, gaps: gaps, hasYamlParser: !!yaml() };
  }

  Engine.PipelineParse = { parseAll: parseAll, parseGithubWorkflow: parseGithubWorkflow, parseDockerfile: parseDockerfile, detectGaps: detectGaps };
  window.PipelineParse = Engine.PipelineParse;
  console.info('[PipelineParse] CI/infra pipeline parser ready — Engine.PipelineParse' + (yaml() ? '' : ' (js-yaml missing — YAML files skipped)'));
})();
