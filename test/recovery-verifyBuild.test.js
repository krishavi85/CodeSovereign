'use strict';
/* Engine.Recovery.verifyBuild() composes the three previously-independent
 * "is this build actually done" checks (Engine.LLM.evaluateBuild's quality
 * score, Engine.Evidence.require's screenshot/log gate, and a supplied test
 * result) into one decision, instead of each caller enforcing only one of
 * them. See the engine.llm.js `done` tool handler and engine.work.js's
 * patchLoop(), which both now read from this instead of computing/enforcing
 * their own piece in isolation.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env(over) {
  const data = {};
  const FS = {
    _data: data,
    isFile: (p) => typeof data[p] === 'string',
    exists: (p) => typeof data[p] === 'string',
    read: (p) => (data[p] != null ? data[p] : null),
    write: (p, c) => { data[p] = String(c); },
    remove: (p) => { delete data[p]; }, count: () => Object.keys(data).length
  };
  const sov = {};
  const win = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, RegExp, URL, Function };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  win.Engine = {
    FS,
    Sovereign: { write: (p, d) => { sov[p] = d; }, read: (p) => (sov[p] !== undefined ? sov[p] : null) },
    Validator: { runAll: () => (win.__issues || []) }
  };
  win._sov = sov;
  Object.assign(win.Engine, over || {});
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.recovery.js'), 'utf8'), win, { filename: 'engine.recovery.js' });
  return win;
}

function llmStub(pass) {
  return {
    evaluateBuild: (files, observation, quality) => ({ quality: { pass: pass, score: pass ? 80 : 20 }, issues: observation.issues || [] }),
    scoreBuild: () => ({ pass: pass, score: pass ? 80 : 20 })
  };
}

module.exports = async function (t) {
  /* ---------- all pass ---------- */
  {
    const w = env({ LLM: llmStub(true), Evidence: { require: () => ({ ok: true, artifacts: [] }) } });
    const r = w.Engine.Recovery.verifyBuild([], { issues: [] }, { testResult: { ok: true } });
    t.ok('all-pass: ok is true', r.ok === true);
    t.ok('all-pass: no reasons', r.reasons.length === 0);
  }

  /* ---------- build score fails only ---------- */
  {
    const w = env({ LLM: llmStub(false), Evidence: { require: () => ({ ok: true, artifacts: [] }) } });
    const r = w.Engine.Recovery.verifyBuild([], { issues: [] }, { testResult: { ok: true } });
    t.ok('build-fail-only: ok is false', r.ok === false);
    t.ok('build-fail-only: reason mentions build/quality', r.reasons.some((x) => /build score\/quality/.test(x)));
    t.ok('build-fail-only: exactly one reason', r.reasons.length === 1);
  }

  /* ---------- evidence missing only ---------- */
  {
    const w = env({ LLM: llmStub(true), Evidence: { require: () => ({ ok: false, error: 'Do not accept "task completed" as proof.' }) } });
    const r = w.Engine.Recovery.verifyBuild([], { issues: [] }, { testResult: { ok: true } });
    t.ok('evidence-missing-only: ok is false', r.ok === false);
    t.ok('evidence-missing-only: reason mentions evidence', r.reasons.some((x) => /missing evidence/.test(x)));
    t.ok('evidence-missing-only: exactly one reason', r.reasons.length === 1);
  }

  /* ---------- tests failing only ---------- */
  {
    const w = env({ LLM: llmStub(true), Evidence: { require: () => ({ ok: true, artifacts: [] }) } });
    const r = w.Engine.Recovery.verifyBuild([], { issues: [] }, { testResult: { ok: false } });
    t.ok('tests-fail-only: ok is false', r.ok === false);
    t.ok('tests-fail-only: reason mentions tests', r.reasons.some((x) => /tests failing/.test(x)));
    t.ok('tests-fail-only: exactly one reason', r.reasons.length === 1);
  }

  /* ---------- no test result supplied (null = not run in this context) ---------- */
  {
    const w = env({ LLM: llmStub(true), Evidence: { require: () => ({ ok: true, artifacts: [] }) } });
    const r = w.Engine.Recovery.verifyBuild([], { issues: [] });
    t.ok('no-test-result: testsOk is null, not treated as a failure', r.testsOk === null && r.ok === true);
  }

  /* ---------- combined failures produce combined reasons ---------- */
  {
    const w = env({ LLM: llmStub(false), Evidence: { require: () => ({ ok: false, error: 'no artifacts' }) } });
    const r = w.Engine.Recovery.verifyBuild([], { issues: [] }, { testResult: { ok: false } });
    t.ok('combined: ok is false', r.ok === false);
    t.ok('combined: all three reasons present', r.reasons.length === 3);
  }
};
