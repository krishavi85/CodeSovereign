'use strict';
/* engine.pipeline-parse.js — GH Actions / Dockerfile / compose parsing + gaps. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const yamlSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'vendor', 'js-yaml.min.js'), 'utf8');
  const ppSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.pipeline-parse.js'), 'utf8');

  const files = {
    '/.github/workflows/ci.yml': [
      'name: CI',
      'on: [push, pull_request]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm ci',
      '      - run: npm test',
      '  deploy:',
      '    needs: [test]',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run deploy'
    ].join('\n'),
    '/.github/workflows/bad.yml': [
      'name: Bad',
      'jobs:',
      '  ship:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run deploy',
      '      - run: echo ${{ secrets.TOKEN }}'
    ].join('\n'),
    '/Dockerfile': 'FROM node:20 AS build\nEXPOSE 3000\nCMD ["node","server.js"]\n',
    '/docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n  api:\n    build: .\n    depends_on: [db]\n'
  };
  const FS = {
    _data: Object.keys(files).reduce((m, k) => (m[k] = { type: 'file', content: files[k] }, m), {}),
    read: (p) => (files[p] == null ? null : files[p]),
    isFile: (p) => p in files
  };
  const win = { console };
  win.window = win;
  win.Engine = { FS };
  const ctx = vm.createContext(win);
  vm.runInContext(yamlSrc, ctx, { filename: 'js-yaml.min.js' });
  t.ok('js-yaml global present', typeof win.jsyaml === 'object' && typeof win.jsyaml.load === 'function');
  vm.runInContext(ppSrc, ctx, { filename: 'engine.pipeline-parse.js' });

  const PP = win.Engine.PipelineParse;
  const r = PP.parseAll();

  t.equal('parsed 4 pipeline files', r.pipelines.length, 4);
  const ci = r.pipelines.find((p) => /ci\.yml/.test(p.file));
  t.deepEqual('CI triggers', ci.triggers.sort(), ['pull_request', 'push']);
  t.equal('CI has 2 jobs', ci.jobs.length, 2);
  t.ok('test job runs tests', ci.jobs.find((j) => j.id === 'test').runsTests);
  t.ok('deploy job flagged as deploy + needs test', ci.jobs.find((j) => j.id === 'deploy').deploys && ci.jobs.find((j) => j.id === 'deploy').needs.includes('test'));

  t.ok('graph has a needs edge', r.graph.edges.some((e) => /#test$/.test(e.from) && /#deploy$/.test(e.to)));

  const kinds = new Set(r.gaps.map((g) => g.kind));
  t.ok('gap: unsafe-deployment (bad.yml deploy with no tests upstream)', kinds.has('unsafe-deployment'));
  t.ok('gap: secret-exposure (echo of secret)', kinds.has('secret-exposure'));
  t.ok('gap: no-environment-gate', kinds.has('no-environment-gate'));

  const dockerfile = r.pipelines.find((p) => p.kind === 'dockerfile');
  t.ok('Dockerfile: EXPOSE 3000, no HEALTHCHECK', dockerfile.exposedPorts.includes('3000') && !dockerfile.healthcheck);
  t.ok('gap: missing-healthcheck for Dockerfile', r.gaps.some((g) => g.kind === 'missing-healthcheck' && /Dockerfile/.test(g.file)));

  const compose = r.pipelines.find((p) => p.kind === 'compose');
  t.ok('compose: api depends_on db', compose.services.find((s) => s.name === 'api').dependsOn.includes('db'));
};
