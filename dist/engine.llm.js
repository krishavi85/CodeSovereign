/* =================================================================
   engine.llm.js
   -----------------------------------------------------------------
   Real LLM provider integration for CodeSovereign.

   - Provider registry: OpenAI / MiniMax / Anthropic-compat / Custom
   - Each provider stores: id, label, baseUrl, chatPath, defaultModel,
     supportsJson, headerStyle, keyHeader, keyPrefix
   - Persists config in localStorage under cs.llm.v1
   - Patches Engine.Agent.run so that when an LLM is configured AND
     reachable, the LLM is asked to produce a JSON file plan; the
     response is parsed, validated, and written to the FS exactly
     like the template-based synthesizer.  When no key is configured
     OR the LLM call fails, the existing deterministic synthesizer
     keeps working — so the app stays 100% responsive with or
     without a key.

   - Exposes:
       Engine.LLM.providers        -> array
       Engine.LLM.getConfig()      -> {providerId, model, apiKey, baseUrl}
       Engine.LLM.setConfig(...)
       Engine.LLM.testConnection() -> Promise<{ok,status,text,model}>
       Engine.LLM.complete(prompt, ctx) -> Promise<{summary, files}>
       Engine.LLM.llmPlan(prompt, ctx)  -> the new _plan-style result
       Engine.LLM.status()         -> {configured,providerId,model,ok,error}
   ================================================================= */
(function () {
  "use strict";

  // ----- Provider registry (OpenAI-compatible chat completions) -----
  const PROVIDERS = [
    {
      id: "minimax",
      label: "MiniMax (recommended)",
      baseUrl: "https://api.minimaxi.chat",
      chatPath: "/v1/chat/completions",
      defaultModel: "MiniMax-Text-01",
      modelOptions: ["MiniMax-Text-01", "minimax-text-01", "abab6.5s-chat", "abab6.5-chat"],
      supportsJson: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "Sovereign provider. Use a key issued for api.minimaxi.chat."
    },
    {
      id: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com",
      chatPath: "/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
      modelOptions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-3.5-turbo"],
      supportsJson: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "OpenAI chat completions."
    },
    {
      id: "openai_compat",
      label: "OpenAI-compatible (custom base URL)",
      baseUrl: "",
      chatPath: "/v1/chat/completions",
      defaultModel: "",
      modelOptions: [],
      supportsJson: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "Use for any OpenAI-compatible endpoint (Together, Groq, OpenRouter, LM Studio, Ollama, vLLM...)."
    }
  ];

  // ----- Persisted config -----
  const STORE_KEY = "cs.llm.v1";
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && typeof c === "object") return c;
      }
    } catch (_) {}
    return { providerId: "", model: "", apiKey: "", baseUrl: "", enabled: false };
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg || {})); } catch (_) {}
  }

  function getConfig() { return loadConfig(); }
  function setConfig(patch) {
    const cur = loadConfig();
    const next = Object.assign({}, cur, patch || {});
    saveConfig(next);
    return next;
  }
  function providerById(id) {
    return PROVIDERS.find(p => p.id === id) || null;
  }
  function resolveProvider(cfg) {
    let p = providerById(cfg.providerId);
    if (!p) p = PROVIDERS[0];
    // custom base URL override
    if (p.id === "openai_compat" && cfg.baseUrl) {
      p = Object.assign({}, p, { baseUrl: cfg.baseUrl.replace(/\/+$/, "") });
    }
    return p;
  }

  // ----- Build a code-generation system prompt -----
  function buildSystemPrompt(specCtx) {
    const stack = (specCtx && specCtx.stack) || "vanilla-html-css-js";
    const arch = (specCtx && specCtx.architecture) || "";
    const mods = (specCtx && (specCtx.modules || (specCtx.classification && specCtx.classification.estimatedModules))) || 0;
    const cls = (specCtx && specCtx.classification && specCtx.classification.primaryType) || "web_application";
    const ctxBlk = (specCtx && specCtx.classification)
      ? "\n\n[PROJECT CONTEXT FROM UNIVERSAL COMPOSER]\n" +
        "primaryType: " + cls + "\n" +
        "modules: " + mods + "\n" +
        "stack: " + JSON.stringify(stack) + "\n" +
        (arch ? "architecture: " + JSON.stringify(arch) + "\n" : "")
      : "";
    return [
      "You are CodeSovereign's Real Code Synthesizer — an expert full-stack engineer.",
      "You write production-quality, fully working source files. No placeholders, no TODOs, no pseudo-code.",
      "Always produce a single JSON object (no prose, no markdown fences) with this exact shape:",
      '{ "summary": "<one-line summary of what you built>",',
      '  "files": [ { "path": "/index.html", "content": "<full file contents>" }, ... ] }',
      "Constraints:",
      "- The output MUST be valid JSON. Escape newlines as \\n, quotes as \\\", etc.",
      "- Always include at minimum: /index.html and any required /scripts/*.js /styles/*.css.",
      "- index.html must reference styles and scripts via /styles/... and /scripts/... paths.",
      "- Use plain HTML/CSS/JS unless the project context requires a framework.",
      "- All file paths start with /. Keep paths short and ASCII.",
      "- Every file must be complete and runnable on its own.",
      "- If the app calls an AI model, put it behind a small vendor-neutral provider",
      "  module (local Ollama first, then an API key) — never hard-code one vendor.",
      "- Prefer zero-cost / self-hostable services; list required keys in /.env.example.",
      ctxBlk
    ].join("\n");
  }

  // ----- HTTP transport -----
  // In the desktop app the renderer CSP blocks localhost + several API hosts;
  // route through the vetted main-process proxy (loopback / allow-listed API
  // hosts only). In a plain browser, use fetch directly.
  async function httpText(url, init) {
    const D = window.desktop;
    if (D && D.isDesktop && D.ai && D.ai.request) {
      const r = await D.ai.request({
        url: url, method: (init && init.method) || "GET",
        headers: (init && init.headers) || {}, body: (init && init.body) || null
      });
      if (r && r.ok) return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body };
      throw new Error((r && r.error) || "request failed");
    }
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status, text: () => res.text() };
  }

  // ----- HTTP call (OpenAI-compatible chat completions) -----
  function buildRequest(provider, cfg, systemPrompt, userPrompt) {
    const url = provider.baseUrl.replace(/\/+$/, "") + (provider.chatPath || "/v1/chat/completions");
    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) {
      if (provider.keyHeader === "Authorization") {
        headers["Authorization"] = (provider.keyPrefix || "Bearer ") + cfg.apiKey;
      } else {
        headers[provider.keyHeader] = cfg.apiKey;
      }
    }
    const body = {
      model: cfg.model || provider.defaultModel || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4096
    };
    if (provider.supportsJson) {
      // Most OpenAI-compatible providers honor either of these.
      body.response_format = { type: "json_object" };
    }
    return { url, headers, body };
  }

  async function complete(prompt, ctx) {
    const cfg = loadConfig();
    if (!cfg.enabled || !cfg.apiKey) {
      throw new Error("LLM not configured. Set provider + key in Settings.");
    }
    const provider = resolveProvider(cfg);
    if (!provider.baseUrl) {
      throw new Error("Provider has no baseUrl. Set a custom base URL in Settings.");
    }
    const systemPrompt = buildSystemPrompt(ctx || null);
    const userPrompt = String(prompt || "").trim();
    const req = buildRequest(provider, cfg, systemPrompt, userPrompt);
    const res = await httpText(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body)
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " " + (text || "").slice(0, 240));
    }
    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = null; }
    const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || text;
    return { raw: data, content: String(content || ""), model: req.body.model };
  }

  // ----- Robust JSON parser: handles ```json fences and prose wrapping -----
  function extractJson(text) {
    if (!text) return null;
    const trimmed = String(text).trim();
    // Direct JSON object?
    if (trimmed.charCodeAt(0) === 123 /* { */) {
      try { return JSON.parse(trimmed); } catch (_) {}
    }
    // Strip ```json fences
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try { return JSON.parse(fence[1]); } catch (_) {}
    }
    // Last-resort: first balanced { ... } block
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch (_) {}
    }
    return null;
  }

  // ----- Build the LLM plan in the shape _plan() returns -----
  function llmPlan(prompt, proj, specCtx) {
    return complete(prompt, specCtx).then(({ content, model }) => {
      const parsed = extractJson(content);
      if (!parsed || !Array.isArray(parsed.files) || !parsed.files.length) {
        throw new Error("LLM response did not contain a valid file plan.");
      }
      const targets = [];
      for (const f of parsed.files) {
        if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
        let p = f.path.trim();
        if (!p.startsWith("/")) p = "/" + p;
        targets.push({ path: p, content: f.content });
      }
      if (!targets.length) throw new Error("LLM plan had no usable files.");
      return {
        summary: parsed.summary || ("Generated " + targets.length + " file(s) via " + (model || "LLM")),
        targets: targets,
        source: "llm",
        model: model || ""
      };
    });
  }

  // ----- Connection test -----
  async function testConnection() {
    const cfg = loadConfig();
    if (!cfg.apiKey) return { ok: false, error: "No API key set." };
    const provider = resolveProvider(cfg);
    if (!provider.baseUrl) return { ok: false, error: "No base URL set." };
    const req = buildRequest(
      provider,
      cfg,
      "You are a connectivity probe. Reply with JSON: {\"ok\":true}",
      "ping"
    );
    try {
      const res = await httpText(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body)
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        text: text.slice(0, 200),
        model: req.body.model,
        url: req.url,
        provider: provider.id
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e), url: req.url, provider: provider.id };
    }
  }

  function status() {
    const cfg = loadConfig();
    return {
      configured: !!(cfg.enabled && cfg.apiKey),
      providerId: cfg.providerId || "",
      model: cfg.model || "",
      baseUrl: cfg.baseUrl || "",
      hasKey: !!cfg.apiKey,
      enabled: !!cfg.enabled
    };
  }

  // ----- Patch Engine.Agent.run: try LLM first, fall back to template -----
  function patchAgent() {
    if (!window.Engine || !window.Engine.Agent) return false;
    const Agent = window.Engine.Agent;
    if (Agent.__llmPatched) return true;

    const originalRun = Agent.run.bind(Agent);
    const originalPlan = Agent._plan.bind(Agent);

    Agent.run = function (prompt, onStep) {
      const cfg = loadConfig();
      const useLLM = !!(cfg.enabled && cfg.apiKey);
      if (!useLLM) {
        return originalRun(prompt, onStep);
      }
      // LLM path: same step shape, but _plan is async
      const steps = [];
      const proj = window.Engine.Proj.current();
      if (!proj) {
        steps.push({ kind: "error", text: "No active project. Create one first." });
        onStep && onStep(steps[steps.length - 1]);
        return Promise.resolve(steps);
      }
      steps.push({ kind: "plan", text: "Calling LLM provider to draft a file plan…" });
      onStep && onStep(steps[steps.length - 1]);

      // Build a minimal ctx from S.univ.state if present
      let ctx = null;
      try {
        if (window.S && window.S.univ && window.S.univ.state) {
          const bs = window.S.univ.state;
          ctx = {
            source: "universal-composer",
            classification: bs.classification,
            requirements: bs.requirements,
            stack: bs.stack,
            architecture: bs.architecture,
            taskGraph: bs.taskGraph,
            modules: (bs.classification && bs.classification.estimatedModules) || 0
          };
        }
      } catch (_) {}

      return llmPlan(prompt, proj, ctx)
        .then(plan => {
          steps.push({ kind: "plan-result", text: "Plan: " + plan.summary, files: plan.targets });
          onStep && onStep(steps[steps.length - 1]);

          return new Promise(resolve => {
            let i = 0;
            const FS = window.Engine.FS;
            const apply = () => {
              if (i >= plan.targets.length) {
                steps.push({ kind: "validate", text: "Running validators…" });
                onStep && onStep(steps[steps.length - 1]);
                const v = window.Engine.Validator.runAll();
                steps.push({ kind: "validate-result", issues: v });
                onStep && onStep(steps[steps.length - 1]);
                steps.push({ kind: "done", text: "Run complete (LLM)." });
                onStep && onStep(steps[steps.length - 1]);
                resolve(steps);
                return;
              }
              const t = plan.targets[i++];
              steps.push({ kind: "write", path: t.path, text: "Writing " + t.path });
              onStep && onStep(steps[steps.length - 1]);
              try { FS.write(t.path, t.content); } catch (_) {}
              setTimeout(apply, 80);
            };
            apply();
          });
        })
        .catch(err => {
          // LLM path failed — surface error, then fall back to template path
          const msg = "LLM call failed: " + (err && err.message || err) + " — falling back to local synthesizer.";
          steps.push({ kind: "error", text: msg });
          onStep && onStep(steps[steps.length - 1]);
          return originalRun(prompt, onStep);
        });
    };

    Agent.__llmPatched = true;
    Agent._llmPlan = llmPlan;
    return true;
  }

  // ----- Public surface -----
  window.Engine = window.Engine || {};
  window.Engine.LLM = {
    providers: PROVIDERS,
    getConfig,
    setConfig,
    providerById,
    resolveProvider,
    complete,
    llmPlan,
    testConnection,
    status,
    patchAgent,
    STORE_KEY
  };

  // Patch as soon as Engine + Agent exist; if not yet, retry.
  function tryPatch() {
    if (patchAgent()) return;
    setTimeout(tryPatch, 30);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryPatch);
  } else {
    tryPatch();
  }
})();
