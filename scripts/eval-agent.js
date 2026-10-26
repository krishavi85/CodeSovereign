#!/usr/bin/env node
'use strict';
/*
 * Real-model evaluation of the native agent.
 *
 *   node scripts/eval-agent.js [--model qwen2.5-coder:7b] [--base http://127.0.0.1:11434]
 *        [--tasks bugfix-range,feature-slugify] [--trials 3] [--mode auto|agent]
 *        [--ctx 16384] [--timeout-min 20] [--toolset compact|full] [--out docs/eval]
 *
 * Needs a running local model server (Ollama / LM Studio / any OpenAI-compatible
 * endpoint). Each trial runs the agent on a fresh temp project and is judged by
 * an independent test run with hidden tests (see scripts/lib/agent-eval.js).
 * Results go to <out>/agent-eval-<timestamp>.json and .md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadRuntime, runTrial } = require('./lib/agent-eval');
const { TASKS } = require('./lib/agent-eval-tasks');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 && process.argv[i + 1] && !/^--/.test(process.argv[i + 1]) ? process.argv[i + 1] : def; }

async function main() {
  const model = arg('model', 'qwen2.5-coder:7b'), base = arg('base', 'http://127.0.0.1:11434');
  const trials = parseInt(arg('trials', '3'), 10), mode = arg('mode', 'auto'), ctx = parseInt(arg('ctx', '16384'), 10);
  const timeoutMin = parseFloat(arg('timeout-min', '20')), toolset = arg('toolset', 'compact'), outDir = arg('out', path.join(__dirname, '..', 'docs', 'eval'));
  const ids = arg('tasks', TASKS.map((t) => t.id).join(',')).split(',');
  const tasks = TASKS.filter((t) => ids.indexOf(t.id) >= 0);
  if (!tasks.length) { console.error('no such task. Available: ' + TASKS.map((t) => t.id).join(', ')); process.exit(2); }

  const rt = loadRuntime({ model, baseUrl: base });
  // refuse to evaluate against nothing
  try { const r = await fetch(base.replace(/\/+$/, '') + '/v1/models'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error('Cannot reach the model server at ' + base + ' (' + e.message + ').'); process.exit(2); }

  const isOllama = /:11434/.test(base);
  const chatOptions = { temperature: 0.1, maxTokens: 1536, timeoutMs: 15 * 60 * 1000, extraBody: isOllama ? { options: { num_ctx: ctx } } : undefined };
  const startedAt = new Date().toISOString();
  console.log('[eval] model=' + model + ' base=' + base + ' ctx=' + ctx + ' mode=' + mode + ' toolset=' + toolset + ' trials=' + trials + ' tasks=' + tasks.map((t) => t.id).join(','));
  const results = [];
  for (const task of tasks) {
    for (let n = 1; n <= trials; n++) {
      const t0 = Date.now();
      process.stdout.write('[eval] ' + task.id + ' trial ' + n + '/' + trials + ' … ');
      const r = await runTrial({ rt, task, mode, toolset, chatOptions, timeoutMs: timeoutMin * 60 * 1000, keepDir: process.argv.indexOf('--keep') >= 0 });
      r.trial = n; results.push(r);
      console.log((r.success ? 'PASS' : 'FAIL') + '  status=' + r.status + '  ' + Math.round(r.ms / 1000) + 's  turns=' + r.turns + '  tools=' + r.toolCalls + '  repairs=' + r.attempts + (r.crashed ? '  CRASH' : ''));
      if (!r.success) console.log('        ' + (r.toolErrors.slice(0, 3).join(' | ') || (r.report || '').split('\n')[0]));
    }
  }

  const summary = tasks.map((t) => {
    const rs = results.filter((r) => r.task === t.id), ok = rs.filter((r) => r.success);
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    return { task: t.id, title: t.title, trials: rs.length, passed: ok.length, rate: rs.length ? ok.length / rs.length : 0,
      medianSeconds: med(rs.map((r) => Math.round(r.ms / 1000))), medianTurns: med(rs.map((r) => r.turns)), medianToolCalls: med(rs.map((r) => r.toolCalls)),
      trialsThatRepaired: rs.filter((r) => r.attempts > 0).length, claimedVerifiedButFailedJudge: rs.filter((r) => r.status === 'verified' && !r.success).length };
  });
  const total = results.length, passed = results.filter((r) => r.success).length;
  const env = { node: process.version, platform: os.platform() + ' ' + os.release(), cpus: os.cpus().length + '× ' + (os.cpus()[0] || {}).model, ramGB: Math.round(os.totalmem() / 1e9) };
  const doc = { startedAt, finishedAt: new Date().toISOString(), model, base, ctx, mode, toolset, trialsPerTask: trials, environment: env, overall: { trials: total, passed, rate: total ? passed / total : 0 }, summary, results };

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-').slice(0, 19);
  fs.writeFileSync(path.join(outDir, 'agent-eval-' + stamp + '.json'), JSON.stringify(doc, null, 2));
  const md = ['# Native agent eval — ' + model, '',
    '- Started: ' + startedAt, '- Mode: `' + mode + '`, toolset `' + toolset + '`, context ' + ctx + ' tokens, ' + trials + ' trial(s) per task',
    '- Host: ' + env.cpus + ', ' + env.ramGB + ' GB RAM, ' + env.platform + ', Node ' + env.node,
    '- Success = hidden tests + visible tests pass in an independent run after the agent finished (the agent\'s own report does not count).', '',
    '**Overall: ' + passed + ' / ' + total + ' trials passed (' + Math.round(100 * doc.overall.rate) + '%)**', '',
    '| Task | Passed | Median time | Median turns | Median tool calls | Trials that needed repair | Claimed verified but failed judge |', '|---|---|---|---|---|---|---|']
    .concat(summary.map((s) => '| ' + s.task + ' | ' + s.passed + '/' + s.trials + ' | ' + s.medianSeconds + 's | ' + s.medianTurns + ' | ' + s.medianToolCalls + ' | ' + s.trialsThatRepaired + ' | ' + s.claimedVerifiedButFailedJudge + ' |'))
    .concat(['', '## Trials', '', '| Task | # | Result | Agent status | Time | Turns | Tools | Repairs | Changed |', '|---|---|---|---|---|---|---|---|---|'])
    .concat(results.map((r) => '| ' + r.task + ' | ' + r.trial + ' | ' + (r.success ? 'pass' : 'FAIL') + ' | ' + r.status + ' | ' + Math.round(r.ms / 1000) + 's | ' + r.turns + ' | ' + r.toolCalls + ' | ' + r.attempts + ' | ' + (r.changed.join(', ') || '—') + ' |'));
  fs.writeFileSync(path.join(outDir, 'agent-eval-' + stamp + '.md'), md.join('\n') + '\n');
  console.log('\n[eval] ' + passed + '/' + total + ' passed. Wrote ' + path.join(outDir, 'agent-eval-' + stamp + '.{json,md}'));
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
