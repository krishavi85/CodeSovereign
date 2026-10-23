/* =====================================================================
   engine.cicd.js  —  Engine.CICD   (blueprint §40)

   CI/CD generator. GitHub Actions is emitted by the scaffold; this fills
   in the rest of the providers from the same detected stack:

     /.gitlab-ci.yml            install → lint → test → build stages
     /Jenkinsfile               declarative pipeline, same stages
     /azure-pipelines.yml       Azure DevOps
     /bitbucket-pipelines.yml   Bitbucket

   Commands come from `Engine.Adapters.detect()` (npm / pnpm / yarn,
   python, go, rust, …) with a sane npm fallback.

   window.Engine.CICD
     PROVIDERS
     pipeline(provider, cmds?)  -> the YAML / Groovy string
     files(opts?)               -> { path: content } for the repo
     analyze()                  -> writes .sovereign/cicd.json + report
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  var FS = function () { return Engine.FS; };

  function has(p) { try { return !!(FS() && FS().isFile(p)); } catch (_) { return false; } }
  function pkg() { try { return JSON.parse((FS() && FS().read('/package.json')) || 'null'); } catch (_) { return null; } }

  var PROVIDERS = ['gitlab', 'jenkins', 'azure', 'bitbucket'];

  function commands() {
    var det = null;
    try { det = (Engine.Adapters && Engine.Adapters.detect && Engine.Adapters.detect()) || []; } catch (_) {}
    var c = (det[0] && det[0].commands) || {};
    var p = pkg() || {};
    var scr = p.scripts || {};
    var pm = has('/pnpm-lock.yaml') ? 'pnpm' : has('/yarn.lock') ? 'yarn' : 'npm';
    return {
      runtime: (det[0] && det[0].id) || (has('/app/main.py') || has('/requirements.txt') ? 'python' : 'node'),
      install: c.install || (pm === 'npm' ? (has('/package-lock.json') ? 'npm ci' : 'npm install') : pm + ' install'),
      migrate: scr.migrate ? pm + ' run migrate' : null,
      lint: c.lint || (scr.lint ? pm + ' run lint' : null),
      test: c.test || (scr.test ? pm + ' test' : null),
      build: c.build || (scr.build ? pm + ' run build' : null),
      nodeVersion: '20',
      pythonVersion: '3.12'
    };
  }

  function gitlab(c) {
    var L = ['stages: [setup, verify, build]', ''];
    var img = c.runtime === 'python' ? 'python:' + c.pythonVersion : 'node:' + c.nodeVersion;
    L.push('default:', '  image: ' + img, '');
    if (c.runtime !== 'python') L.push('cache:', '  key: { files: [package-lock.json, pnpm-lock.yaml, yarn.lock] }', '  paths: [node_modules/, .npm/]', '');
    L.push('setup:', '  stage: setup', '  script:', '    - ' + c.install,
      '  artifacts: { paths: [node_modules/], expire_in: 1 hour }', '');
    var verify = ['verify:', '  stage: verify', '  needs: [setup]', '  script:'];
    if (c.migrate) verify.push('    - ' + c.migrate);
    if (c.lint) verify.push('    - ' + c.lint);
    if (c.test) verify.push('    - ' + c.test);
    if (!c.lint && !c.test) verify.push('    - echo "no lint/test scripts"');
    L.push.apply(L, verify); L.push('');
    if (c.build) L.push('build:', '  stage: build', '  needs: [verify]', '  script:', '    - ' + c.build,
      '  artifacts: { paths: [dist/], expire_in: 1 week }', '');
    return L.join('\n') + '\n';
  }

  function jenkins(c) {
    var steps = function (arr) { return arr.map(function (s) { return "        sh '" + s.replace(/'/g, "\\'") + "'"; }).join('\n'); };
    var tool = c.runtime === 'python' ? '' :
      "  tools { nodejs 'node" + c.nodeVersion + "' }\n";
    var verify = [];
    if (c.migrate) verify.push(c.migrate);
    if (c.lint) verify.push(c.lint);
    if (c.test) verify.push(c.test);
    return 'pipeline {\n' +
      '  agent any\n' + tool +
      '  options { timestamps(); disableConcurrentBuilds() }\n' +
      '  stages {\n' +
      '    stage(\'Setup\') {\n      steps {\n' + steps([c.install]) + '\n      }\n    }\n' +
      (verify.length ? '    stage(\'Verify\') {\n      steps {\n' + steps(verify) + '\n      }\n    }\n' : '') +
      (c.build ? '    stage(\'Build\') {\n      steps {\n' + steps([c.build]) + '\n      }\n' +
        '      post { success { archiveArtifacts artifacts: \'dist/**\', allowEmptyArchive: true } }\n    }\n' : '') +
      '  }\n' +
      '  post { always { cleanWs() } }\n' +
      '}\n';
  }

  function azure(c) {
    var L = ['trigger: [main]', '', 'pool:', '  vmImage: ubuntu-latest', '', 'steps:'];
    if (c.runtime === 'python') L.push('  - task: UsePythonVersion@0', '    inputs: { versionSpec: "' + c.pythonVersion + '" }');
    else L.push('  - task: NodeTool@0', '    inputs: { versionSpec: "' + c.nodeVersion + '.x" }');
    L.push('  - script: ' + c.install + '\n    displayName: Install');
    if (c.migrate) L.push('  - script: ' + c.migrate + '\n    displayName: Migrate');
    if (c.lint) L.push('  - script: ' + c.lint + '\n    displayName: Lint');
    if (c.test) L.push('  - script: ' + c.test + '\n    displayName: Test');
    if (c.build) {
      L.push('  - script: ' + c.build + '\n    displayName: Build');
      L.push('  - publish: dist\n    artifact: dist');
    }
    return L.join('\n') + '\n';
  }

  function bitbucket(c) {
    var img = c.runtime === 'python' ? 'python:' + c.pythonVersion : 'node:' + c.nodeVersion;
    var script = [c.install];
    if (c.migrate) script.push(c.migrate);
    if (c.lint) script.push(c.lint);
    if (c.test) script.push(c.test);
    if (c.build) script.push(c.build);
    return 'image: ' + img + '\n\n' +
      'pipelines:\n' +
      '  default:\n' +
      '    - step:\n' +
      '        name: Verify\n' +
      (c.runtime !== 'python' ? '        caches: [node]\n' : '') +
      '        script:\n' +
      script.map(function (s) { return '          - ' + s; }).join('\n') + '\n' +
      (c.build ? '        artifacts:\n          - dist/**\n' : '');
  }

  function pipeline(provider, cmds) {
    var c = cmds || commands();
    switch (provider) {
      case 'gitlab': return gitlab(c);
      case 'jenkins': return jenkins(c);
      case 'azure': return azure(c);
      case 'bitbucket': return bitbucket(c);
      default: return null;
    }
  }

  function files(opts) {
    opts = opts || {};
    var c = commands();
    var only = opts.providers || PROVIDERS;
    var map = {
      gitlab: '/.gitlab-ci.yml',
      jenkins: '/Jenkinsfile',
      azure: '/azure-pipelines.yml',
      bitbucket: '/bitbucket-pipelines.yml'
    };
    var out = {};
    only.forEach(function (p) { if (map[p]) out[map[p]] = pipeline(p, c); });
    return out;
  }

  function analyze() {
    if (!FS() || !(has('/package.json') || has('/server.js') || has('/app/main.py'))) {
      if (S()) S().write('cicd.json', { generatedAt: Date.now(), present: false, note: 'no product repo' });
      return { present: false };
    }
    var c = commands();
    var f = files();
    var wrote = [];
    Object.keys(f).forEach(function (p) { try { FS().write(p, f[p]); wrote.push(p); } catch (_) {} });
    // sanity-check every generated pipeline parses, if the parser is available
    var parseOk = {};
    try {
      if (Engine.PipelineParse && Engine.PipelineParse.parseOne) {
        Object.keys(f).forEach(function (p) { try { parseOk[p] = !!Engine.PipelineParse.parseOne(p, f[p]); } catch (_) { parseOk[p] = false; } });
      }
    } catch (_) {}
    var report = { generatedAt: Date.now(), present: true, runtime: c.runtime, stages: ['setup', 'verify' + (c.build ? ', build' : '')], providers: PROVIDERS, wrote: wrote, parseOk: parseOk };
    if (S()) {
      S().write('cicd.json', report);
      S().write('cicd-report.md',
        '# CI/CD pipelines\n\n_Generated ' + new Date(report.generatedAt).toISOString() + '_\n\n' +
        'Runtime: **' + c.runtime + '** · commands: `' + [c.install, c.migrate, c.lint, c.test, c.build].filter(Boolean).join('` · `') + '`\n\n' +
        'Generated for: GitHub Actions (by the scaffold), GitLab CI, Jenkins, Azure Pipelines, Bitbucket Pipelines.\n');
    }
    return report;
  }

  function load() { try { var v = S() && S().read('cicd.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.CICD = { PROVIDERS: PROVIDERS, pipeline: pipeline, files: files, analyze: analyze, load: load, _commands: commands };
  console.info('[CICD] multi-provider CI/CD generator ready — Engine.CICD');
})();
