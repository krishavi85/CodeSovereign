'use strict';
/* The Agent picker (Settings "Agents" card) used to be 3 cosmetic labels
 * (Sovereign-1.5/-Fast/-Architect) that Engine.LLM never read at all —
 * confirmed by grep, zero references anywhere in this file. cfg.
 * executionBackend ('direct' | 'openclaw' | 'hermes') is the real switch
 * now: complete() (the single choke point every round-loop model call goes
 * through) branches on it. This locks in:
 *  - a real `hermes` provider entry (OpenRouter-hosted, its own key —
 *    reusing the Direct provider's apiKey for Hermes would silently send
 *    the wrong key to the wrong host)
 *  - completeViaOpenClaw() parses the REAL `openclaw agent --json` shape,
 *    confirmed live (openclaw 2026.7.1-2): { status, result: { payloads:
 *    [{ text }], meta: { agentMeta: { provider, model }, aborted,
 *    stopReason } } } — not a flat {reply|text|message|content} guess.
 *  - a non-"ok" status or aborted run is a thrown failure, not silently
 *    empty content
 *  - computeUseLLM() treats 'openclaw' as ready without a baseUrl/apiKey,
 *    since OpenClaw never goes through PROVIDERS/resolveProvider at all
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function env() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.llm.js'), 'utf8');
  const requests = [];
  const win = {
    console,
    setTimeout: () => 0, clearTimeout: () => {},
    document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }) },
    localStorage: { _d: {}, getItem(k) { return this._d[k] != null ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    fetch: (url, init) => {
      requests.push({ url, init });
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: 'hermes reply' } }] }))
      });
    }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'engine.llm.js' });
  return { win, requests };
}

// A response shaped exactly like the real, live-confirmed `openclaw agent
// --json` output (trimmed to the fields completeViaOpenClaw reads).
function realOpenClawReply(text) {
  return {
    status: 'ok',
    result: {
      payloads: [{ text: text, mediaUrl: null }],
      meta: {
        aborted: false,
        stopReason: 'stop',
        agentMeta: { provider: 'ollama', model: 'llama3.1:8b' },
        finalAssistantVisibleText: text
      }
    }
  };
}

module.exports = async function (t) {
  // ---- Hermes is a real provider entry ----
  {
    const { win } = env();
    const p = win.Engine.LLM.providerById('hermes');
    t.ok('a hermes provider exists', !!p);
    t.equal('hermes baseUrl is OpenRouter', p.baseUrl, 'https://openrouter.ai/api');
    t.equal('hermes default model is the flagship', p.defaultModel, 'nousresearch/hermes-4-405b');
    t.ok('hermes model options include the confirmed live OpenRouter ids', p.modelOptions.includes('nousresearch/hermes-4-70b') && p.modelOptions.includes('nousresearch/hermes-3-llama-3.1-405b'));
  }

  // ---- executionBackend: 'hermes' overrides providerId AND uses its own key ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({
      enabled: true, executionBackend: 'hermes',
      providerId: 'openai', apiKey: 'sk-openai-should-not-be-sent', model: 'gpt-4o',
      hermesApiKey: 'sk-or-real-hermes-key'
    });
    const r = await win.Engine.LLM.complete('hello', null, {});
    t.equal('exactly one HTTP call was made', requests.length, 1);
    t.ok('it went to OpenRouter, not OpenAI', requests[0].url.indexOf('openrouter.ai') >= 0);
    t.equal('it used the dedicated hermesApiKey, not the Direct providerapiKey', requests[0].init.headers.Authorization, 'Bearer sk-or-real-hermes-key');
    t.equal('complete() returns the normal {content} shape', r.content, 'hermes reply');
  }

  // ---- computeUseLLM: openclaw is ready without any baseUrl/apiKey ----
  {
    const { win } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw', providerId: '', apiKey: '' });
    t.ok('LLM.isConfigured() is true for openclaw with no HTTP provider set up at all', win.Engine.LLM.isConfigured());
  }

  // ---- executionBackend: 'openclaw' routes through Engine.AIRouter.OpenClaw
  // and parses the REAL confirmed response shape ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw', openclawAgentId: 'main' });
    let seenOpts = null;
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async (opts) => { seenOpts = opts; return { ok: true, json: realOpenClawReply('PONG') }; } } };
    const r = await win.Engine.LLM.complete('reply with exactly: PONG', null, {});
    t.equal('no HTTP call was made (OpenClaw bypasses the direct chat-completions path)', requests.length, 0);
    t.equal('runAgentTurn was called with the configured agent id', seenOpts.agentId, 'main');
    t.equal('complete() extracts payloads[0].text into content', r.content, 'PONG');
    t.equal('complete() surfaces the real provider/model from agentMeta', r.model, 'llama3.1:8b');
  }

  // ---- no OpenClaw model chosen: use the Direct backend's local Ollama
  // model instead of OpenClaw's own default (a cloud model it had no
  // credentials for on a real install, so every turn failed) ----
  for (const [label, extra, want] of [
    ['Direct on Ollama → ollama/<model>', { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1:8b' }, 'ollama/llama3.1:8b'],
    ['an explicit OpenClaw model always wins', { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1:8b', openclawModel: 'anthropic/claude-opus-4-6' }, 'anthropic/claude-opus-4-6'],
    ['a non-Ollama runtime keeps OpenClaw\'s default (null)', { baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen' }, null]
  ]) {
    const { win } = env();
    win.Engine.LLM.setConfig(Object.assign({ enabled: true, executionBackend: 'openclaw', openclawAgentId: 'main' }, extra));
    let seenOpts = null;
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async (opts) => { seenOpts = opts; return { ok: true, json: realOpenClawReply('PONG') }; } } };
    await win.Engine.LLM.complete('reply with exactly: PONG', null, {});
    t.equal('openclaw model: ' + label, seenOpts && seenOpts.model, want);
  }

  // ---- a non-"ok" / aborted OpenClaw run is a thrown failure, not silent
  // empty content ----
  {
    const { win } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw' });
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async () => ({ ok: true, json: { status: 'ok', result: { payloads: [], meta: { aborted: true, stopReason: 'user-cancelled' } } } }) } };
    let threw = null;
    try { await win.Engine.LLM.complete('hi', null, {}); } catch (e) { threw = e; }
    t.ok('an aborted OpenClaw run throws instead of returning empty content', !!threw);
    t.ok('the error names the reason', /user-cancelled|aborted|OpenClaw/i.test(String(threw && threw.message)));
  }

  // ---- a missing/unreachable OpenClaw bridge fails clearly ----
  {
    const { win } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw' });
    // No window.Engine.AIRouter at all (desktop bridge not loaded).
    let threw = null;
    try { await win.Engine.LLM.complete('hi', null, {}); } catch (e) { threw = e; }
    t.ok('missing AIRouter/OpenClaw throws a clear error', !!threw && /OpenClaw/.test(threw.message));
  }

  // ---- a runAgentTurn-level failure (e.g. CLI error, quota exceeded)
  // surfaces its real message ----
  {
    const { win } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw' });
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async () => ({ ok: false, error: 'GatewayClientRequestError: FailoverError: Token Plan usage limit reached.' }) } };
    let threw = null;
    try { await win.Engine.LLM.complete('hi', null, {}); } catch (e) { threw = e; }
    t.ok('the underlying CLI/gateway error message is surfaced, not swallowed', !!threw && /usage limit reached/.test(threw.message));
  }

  // ---- a CLI-level failure that IS valid JSON (confirmed live, openclaw
  // 2026.9.5: { ok: false, error: { type, message } } — a distinct shape
  // from the { status: 'ok', result: {...} } success shape, and from the
  // plain-text error case above) surfaces the real provider message, not
  // a generic "(unknown)" ----
  {
    const { win } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw' });
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async () => ({ ok: true, json: { ok: false, runId: 'r1', origin: 'gateway', error: { type: 'cli_error', message: 'Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)' } } }) } };
    let threw = null;
    try { await win.Engine.LLM.complete('hi', null, {}); } catch (e) { threw = e; }
    t.ok('a JSON-shaped CLI error is caught before the success-path parser runs', !!threw);
    t.ok('the real provider error message is surfaced, not a generic "(unknown)"', !!threw && /usage limit reached/.test(threw.message) && !/unknown/.test(threw.message));
  }

  // ---- OpenClaw fails (e.g. a timeout on modest hardware) and Direct is
  // actually configured (an explicit providerId, not the omniroute-by-
  // default fallback) -> falls back to Direct for this call, WITHOUT
  // persisting the switch — the user's configured backend must survive a
  // single OpenClaw timeout; only a per-run in-memory override (runState)
  // should make the REST of one Agent.run() invocation avoid retrying the
  // already-proven-slow path ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({
      enabled: true, executionBackend: 'openclaw',
      providerId: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: 'qwen-test'
    });
    let openclawCalls = 0;
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async () => { openclawCalls++; return { ok: true, json: { status: 'timeout', result: { payloads: [{ text: 'Request timed out' }], meta: { aborted: false, stopReason: 'agent_run_terminal_timeout' } } } }; } } };
    const r = await win.Engine.LLM.complete('hi', null, {});
    t.equal('falls back to the Direct HTTP path', requests.length, 1);
    t.ok('the Direct call went to the configured lmstudio baseUrl', requests[0].url.indexOf('127.0.0.1:1234') >= 0);
    t.equal('the fallback result still has the normal {content} shape', r.content, 'hermes reply');
    t.ok('the result is tagged with why the fallback happened', !!r.fallback && r.fallback.from === 'openclaw');
    t.equal('executionBackend is NOT persisted — the user\'s configured backend is untouched', win.Engine.LLM.getConfig().executionBackend, 'openclaw');

    // A brand-new complete() call with no runState (i.e. a separate,
    // later Agent.run()) must try OpenClaw again, not silently stay on
    // Direct just because a previous, unrelated call fell back.
    const r2 = await win.Engine.LLM.complete('hi again', null, {});
    t.equal('a later call with no runState tries OpenClaw again', openclawCalls, 2);
    t.equal('...and still falls back the same way, independently', r2.content, 'hermes reply');
  }

  // ---- within a SINGLE Agent.run() (one shared runState object), a fallback
  // sticks for the rest of that run — the second complete() call goes
  // straight to Direct without re-attempting the just-proven-slow OpenClaw
  // call, but nothing is persisted to config ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({
      enabled: true, executionBackend: 'openclaw',
      providerId: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: 'qwen-test'
    });
    let openclawCalls = 0;
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async () => { openclawCalls++; return { ok: true, json: { status: 'timeout', result: { payloads: [{ text: 'Request timed out' }], meta: { aborted: false, stopReason: 'agent_run_terminal_timeout' } } } }; } } };
    const runState = { forceBackend: null };
    const r1 = await win.Engine.LLM.complete('turn 1', null, { runState: runState });
    const r2 = await win.Engine.LLM.complete('turn 2', null, { runState: runState });
    t.equal('OpenClaw is only attempted once for the whole run', openclawCalls, 1);
    t.equal('the second call in the same run skipped straight to Direct', requests.length, 2);
    t.equal('runState was mutated to remember the in-run fallback', runState.forceBackend, 'direct');
    t.equal('both calls still returned real content', r1.content + '|' + r2.content, 'hermes reply|hermes reply');
    t.equal('config is still untouched after multiple in-run fallback calls', win.Engine.LLM.getConfig().executionBackend, 'openclaw');
  }

  // ---- OpenClaw fails and Direct is NOT actually configured (no explicit
  // providerId ever chosen) -> the original OpenClaw error is thrown, not
  // silently swallowed by a fallback attempt against an unset provider ----
  {
    const { win, requests } = env();
    win.Engine.LLM.setConfig({ enabled: true, executionBackend: 'openclaw' });
    win.Engine.AIRouter = { OpenClaw: { runAgentTurn: async () => ({ ok: false, error: 'timed out' }) } };
    let threw = null;
    try { await win.Engine.LLM.complete('hi', null, {}); } catch (e) { threw = e; }
    t.ok('the original OpenClaw error is thrown', !!threw && /timed out/.test(threw.message));
    t.equal('no fallback HTTP call was attempted', requests.length, 0);
    t.equal('executionBackend stays openclaw (no unwanted silent switch)', win.Engine.LLM.getConfig().executionBackend, 'openclaw');
  }
};
