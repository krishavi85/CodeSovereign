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
    },
    {
      id: "lmstudio",
      label: "LM Studio (local)",
      baseUrl: "http://127.0.0.1:1234",
      chatPath: "/v1/chat/completions",
      defaultModel: "",
      modelOptions: [],
      supportsJson: false,
      local: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "LM Studio OpenAI-compatible server. Start the server in LM Studio (Developer → Local Server) on http://127.0.0.1:1234. If it asks for an API token, paste it below — it is sent only to this local URL, never as your cloud key. Load a GGUF there, or register one below."
    },
    {
      id: "localai",
      label: "LocalAI (Sovereign Model Gateway)",
      baseUrl: "http://127.0.0.1:8080",
      chatPath: "/v1/chat/completions",
      defaultModel: "qwen2.5-coder",
      modelOptions: ["qwen2.5-coder", "llama3.1", "mistral", "phi-3"],
      supportsJson: true,
      local: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "OpenAI-compatible local gateway. Default http://127.0.0.1:8080. Leave the token blank unless your LocalAI server requires one. https://github.com/mudler/LocalAI"
    },
    {
      id: "llamacpp",
      label: "llama.cpp (local GGUF)",
      baseUrl: "http://127.0.0.1:8081",
      chatPath: "/v1/chat/completions",
      defaultModel: "qwen2.5-coder-7b-instruct",
      modelOptions: ["qwen2.5-coder-7b-instruct", "codellama-7b-instruct", "deepseek-coder"],
      supportsJson: false,
      local: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "llama-server OpenAI-compatible endpoint. Default http://127.0.0.1:8081. Leave the token blank unless the server was started with --api-key. Point it at a registered GGUF: llama-server -m model.gguf --port 8081"
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
    return { providerId: "", model: "", apiKey: "", localToken: "", baseUrl: "", enabled: false };
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
  // Desktop wraps Engine.LLM.getConfig to inject keychain secrets. Runtime
  // calls must go through that public getter, not the unwrapped loadConfig.
  function liveConfig() {
    try {
      const pub = window.Engine && window.Engine.LLM && window.Engine.LLM.getConfig;
      if (typeof pub === "function" && pub !== getConfig) return pub() || loadConfig();
    } catch (_) {}
    return loadConfig();
  }
  function providerById(id) {
    return PROVIDERS.find(p => p.id === id) || null;
  }
  function resolveProvider(cfg) {
    let p = providerById(cfg.providerId);
    if (!p) p = PROVIDERS[0];
    // custom base URL override for openai_compat and local gateways
    if (cfg.baseUrl && (p.id === "openai_compat" || p.local)) {
      p = Object.assign({}, p, { baseUrl: cfg.baseUrl.replace(/\/+$/, "") });
    }
    return p;
  }

  function isLocalEndpoint(provider, cfg) {
    if (provider && provider.local) return true;
    const id = provider && provider.id;
    // Named cloud providers stay cloud even if cfg.baseUrl still holds a leftover loopback URL.
    if (id && id !== "openai_compat") return false;
    const url = String((cfg && cfg.baseUrl) || (provider && provider.baseUrl) || "").toLowerCase();
    return /127\.0\.0\.1|localhost/.test(url);
  }

  function needsApiKey(provider, cfg) {
    return !isLocalEndpoint(provider, cfg);
  }

  // Local servers never receive the cloud apiKey (Electron keychain still
  // injects it into getConfig). Optional localToken is the only localhost auth.
  function authToken(provider, cfg) {
    if (isLocalEndpoint(provider, cfg)) return String((cfg && cfg.localToken) || "");
    return String((cfg && cfg.apiKey) || "");
  }

  function applyAuthHeaders(headers, provider, cfg) {
    const token = authToken(provider, cfg);
    if (!token) return headers;
    if (!provider || !provider.keyHeader || provider.keyHeader === "Authorization") {
      headers["Authorization"] = ((provider && provider.keyPrefix) || "Bearer ") + token;
    } else {
      headers[provider.keyHeader] = token;
    }
    return headers;
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
      ctxBlk
    ].join("\n");
  }

  // ----- HTTP call (OpenAI-compatible chat completions) -----
  function buildRequest(provider, cfg, systemPrompt, userPrompt) {
    const url = provider.baseUrl.replace(/\/+$/, "") + (provider.chatPath || "/v1/chat/completions");
    const headers = { "Content-Type": "application/json" };
    applyAuthHeaders(headers, provider, cfg);
    const body = {
      model: cfg.model || provider.defaultModel || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4096
    };
    // LM Studio / llama.cpp set supportsJson: false; LocalAI still requests JSON mode.
    if (provider.supportsJson) {
      body.response_format = { type: "json_object" };
    }
    return { url, headers, body };
  }

  async function listModels() {
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    if (!provider.baseUrl) return { ok: false, models: [], error: "No base URL set." };
    const url = provider.baseUrl.replace(/\/+$/, "") + "/v1/models";
    const headers = {};
    applyAuthHeaders(headers, provider, cfg);
    try {
      const res = await fetch(url, { method: "GET", headers: headers });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (_) { data = null; }
      const rows = (data && (data.data || data.models)) || [];
      const models = rows.map(function (m) {
        if (!m) return "";
        if (typeof m === "string") return m;
        return m.id || m.name || "";
      }).filter(Boolean);
      return { ok: res.ok, models: models, url: url, status: res.status };
    } catch (e) {
      return { ok: false, models: [], error: String(e && e.message || e), url: url };
    }
  }

  async function complete(prompt, ctx) {
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    if (!cfg.enabled) {
      throw new Error("LLM not configured. Set provider + key in Settings.");
    }
    if (needsApiKey(provider, cfg) && !cfg.apiKey) {
      throw new Error("LLM not configured. Set provider + key in Settings.");
    }
    if (!provider.baseUrl) {
      throw new Error("Provider has no baseUrl. Set a custom base URL in Settings.");
    }
    const systemPrompt = buildSystemPrompt(ctx || null);
    const userPrompt = String(prompt || "").trim();
    const req = buildRequest(provider, cfg, systemPrompt, userPrompt);
    const res = await fetch(req.url, {
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
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    if (needsApiKey(provider, cfg) && !cfg.apiKey) return { ok: false, error: "No API key set." };
    if (!provider.baseUrl) return { ok: false, error: "No base URL set." };
    const req = buildRequest(
      provider,
      cfg,
      "You are a connectivity probe. Reply with JSON: {\"ok\":true}",
      "ping"
    );
    try {
      const res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body)
      });
      const text = await res.text();
      const out = {
        ok: res.ok,
        status: res.status,
        text: text.slice(0, 200),
        model: req.body.model,
        url: req.url,
        provider: provider.id
      };
      if (!res.ok && res.status === 401 && isLocalEndpoint(provider, cfg)) {
        out.hint = cfg.localToken
          ? "The local server rejected this token. In LM Studio open Developer → Local Server and copy the current API token."
          : "This local server requires a Bearer token. Paste the LM Studio API token in the field above — it is sent only to localhost, never as your cloud key.";
      }
      return out;
    } catch (e) {
      return { ok: false, error: String(e && e.message || e), url: req.url, provider: provider.id };
    }
  }

  function status() {
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    const ready = !!cfg.enabled && !!provider.baseUrl && (!needsApiKey(provider, cfg) || !!cfg.apiKey);
    return {
      configured: ready,
      providerId: cfg.providerId || "",
      model: cfg.model || "",
      baseUrl: cfg.baseUrl || provider.baseUrl || "",
      hasKey: isLocalEndpoint(provider, cfg) ? !!cfg.localToken : !!cfg.apiKey,
      enabled: !!cfg.enabled,
      local: isLocalEndpoint(provider, cfg)
    };
  }

  // ----- Registered GGUF files (metadata only — never the weights) -----
  const GGUF_KEY = "cs.llm.gguf.v1";
  function ggufBasename(p) {
    return String(p == null ? "" : p).replace(/\\/g, "/").split("/").pop() || "";
  }
  function ggufSafeName(name) {
    const base = ggufBasename(name).replace(/[^\w.\- +()[\]]+/g, "_").slice(0, 180);
    return base;
  }
  function loadGgufs() {
    try {
      const raw = localStorage.getItem(GGUF_KEY);
      const c = raw ? JSON.parse(raw) : null;
      if (c && Array.isArray(c.models)) return c.models.filter(function (m) { return m && m.id && m.name; });
    } catch (_) {}
    return [];
  }
  function saveGgufs(models) {
    try { localStorage.setItem(GGUF_KEY, JSON.stringify({ models: models || [] })); } catch (_) {}
  }
  const Gguf = {
    STORE_KEY: GGUF_KEY,
    list: loadGgufs,
    add: function (meta) {
      meta = meta || {};
      const name = ggufSafeName(meta.name || meta.file || meta.path || "");
      if (!name) return { ok: false, reason: "name required" };
      if (!/\.gguf$/i.test(name) && !meta.allowNonGguf) return { ok: false, reason: "file must be .gguf" };
      const models = loadGgufs();
      const id = "gguf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      const entry = {
        id: id,
        name: name,
        path: typeof meta.path === "string" ? String(meta.path).slice(0, 500) : "",
        bytes: typeof meta.bytes === "number" && isFinite(meta.bytes) ? Math.max(0, Math.floor(meta.bytes)) : 0,
        gateway: (meta.gateway === "llamacpp" || meta.gateway === "localai") ? meta.gateway : "lmstudio",
        addedAt: Date.now()
      };
      models.push(entry);
      saveGgufs(models);
      return { ok: true, model: entry };
    },
    remove: function (id) {
      const next = loadGgufs().filter(function (m) { return m.id !== id; });
      saveGgufs(next);
      return { ok: true, count: next.length };
    },
    select: function (id) {
      const m = loadGgufs().find(function (x) { return x.id === id; });
      if (!m) return { ok: false, reason: "unknown GGUF" };
      const gateway = m.gateway || "lmstudio";
      const p = providerById(gateway);
      const modelId = String(m.name).replace(/\.gguf$/i, "");
      setConfig({
        providerId: gateway,
        model: modelId || m.name,
        baseUrl: (p && p.baseUrl) || "http://127.0.0.1:1234",
        enabled: true
      });
      return { ok: true, model: m, providerId: gateway };
    }
  };

  // ----- Patch Engine.Agent.run: try LLM first, fall back to template -----
  function patchAgent() {
    if (!window.Engine || !window.Engine.Agent) return false;
    const Agent = window.Engine.Agent;
    if (Agent.__llmPatched) return true;

    const originalRun = Agent.run.bind(Agent);
    const originalPlan = Agent._plan.bind(Agent);

    Agent.run = function (prompt, onStep) {
      const cfg = liveConfig();
      const provider = resolveProvider(cfg);
      const useLLM = !!cfg.enabled && !!provider.baseUrl && (!needsApiKey(provider, cfg) || !!cfg.apiKey);
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
    isLocalEndpoint,
    needsApiKey,
    authToken,
    applyAuthHeaders,
    complete,
    llmPlan,
    testConnection,
    listModels,
    Gguf,
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
