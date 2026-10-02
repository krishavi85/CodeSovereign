/* =================================================================
   engine.llm.js
   -----------------------------------------------------------------
   Real LLM provider integration for CodeSovereign.

   - Provider registry: OpenAI / MiniMax / Anthropic-compat / Custom
   - Each provider stores: id, label, baseUrl, chatPath, defaultModel,
     supportsJson, headerStyle, keyHeader, keyPrefix
   - Persists config in localStorage under cs.llm.v1
   - Patches Engine.Agent.run so that when an LLM is configured AND
     reachable, the agent operates as THINK → ACT → OBSERVE →
     DIAGNOSE → ACT AGAIN → VERIFY → DONE (search, edit, test, MCP,
     browser snapshot, ask the user without stopping). There is no
     product limit on tool calls; SAFETY_CAP is only a runaway guard.
     Local models that cannot emit a full JSON plan are asked for
     files one at a time. When the real LLM is enabled it is NOT
     replaced by the template synthesizer — a failed call surfaces
     the error so the user can keep prompting.

   - Discovers and persists /v1/models so any model loaded in
     LM Studio (or another OpenAI-compatible server) stays in the
     Settings dropdown, including a typed custom id.

   - Exposes:
       Engine.LLM.providers        -> array
       Engine.LLM.getConfig()      -> {providerId, model, apiKey, baseUrl}
       Engine.LLM.setConfig(...)
       Engine.LLM.testConnection() -> Promise<{ok,status,text,model}>
       Engine.LLM.complete(prompt, ctx, opts)
       Engine.LLM.llmPlan(prompt, proj, specCtx, extraUser)
       Engine.LLM.listModels() / cachedModels / rememberModels
       Engine.LLM.scoreBuild / extractFilesFromText
       Engine.LLM.status()         -> {configured,providerId,model,ok,error}
   ================================================================= */
(function () {
  "use strict";

  // ----- Provider registry (OpenAI-compatible chat completions) -----
  const PROVIDERS = [
    {
      id: "omniroute",
      label: "OmniRoute — local gateway, ~150 free tiers",
      baseUrl: "http://localhost:20128",
      chatPath: "/v1/chat/completions",
      defaultModel: "auto",
      modelOptions: ["auto", "opencode-free", "kilocode-free", "siliconflow-free"],
      supportsJson: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      keyless: true,
      notes: "Self-hosted gateway (github.com/diegosouzapw/OmniRoute) that fans out to 350+ providers incl. ~150 free tiers. Start it from the Local AI card — a brand-new instance may need no key; once it's set up with real provider connections its HTTP API needs one, free from its own dashboard (http://localhost:20128/dashboard)."
    },
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
      id: "hermes",
      label: "Hermes (Nous Research, via OpenRouter)",
      baseUrl: "https://openrouter.ai/api",
      chatPath: "/v1/chat/completions",
      defaultModel: "nousresearch/hermes-4-405b",
      modelOptions: ["nousresearch/hermes-4-405b", "nousresearch/hermes-4-70b", "nousresearch/hermes-3-llama-3.1-405b", "nousresearch/hermes-3-llama-3.1-70b"],
      supportsJson: true,
      keyHeader: "Authorization",
      keyPrefix: "Bearer ",
      notes: "Open-weight Hermes models from Nous Research, hosted on OpenRouter. Needs an OpenRouter API key (openrouter.ai/keys)."
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
    // custom base URL override: openai_compat, a provider explicitly flagged
    // local, or any loopback endpoint the router points at
    if (cfg.baseUrl && (p.id === "openai_compat" || p.local || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(cfg.baseUrl))) {
      p = Object.assign({}, p, { baseUrl: cfg.baseUrl.replace(/\/+$/, "") });
    }
    return p;
  }
  // A provider is usable if it has a key, OR it is keyless (OmniRoute / a local
  // runtime), OR it points at a loopback endpoint. Delegates to computeUseLLM
  // (below) so "is the LLM usable" has one definition instead of three.
  function isConfigured(cfg) {
    if (!cfg || !cfg.enabled) return false;
    return computeUseLLM(cfg);
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
    // a keyless provider (OmniRoute, or any provider flagged keyless) never
    // needs one — regardless of whether it's local. Without this a keyless
    // cloud provider would be wrongly reported as "no API key set".
    if (provider && provider.keyless) return false;
    return !isLocalEndpoint(provider, cfg);
  }

  // Local servers never receive the cloud apiKey (Electron keychain still
  // injects it into getConfig). Optional localToken is the only localhost auth.
  function authToken(provider, cfg) {
    if (isLocalEndpoint(provider, cfg)) return String((cfg && cfg.localToken) || "");
    return String((cfg && cfg.apiKey) || "");
  }

  // The single definition of "is the LLM usable right now" — enabled, has a
  // reachable baseUrl, and either doesn't need a key or has one. status() and
  // patchAgent()'s run-time gate both call this instead of re-deriving it.
  function computeUseLLM(cfg, provider) {
    if (!cfg || !cfg.enabled) return false;
    // OpenClaw doesn't go through PROVIDERS/resolveProvider at all — its
    // readiness is "the desktop bridge exists", not baseUrl/apiKey.
    if (cfg.executionBackend === "openclaw") return true;
    const p = provider || resolveProvider(cfg);
    if (!p.baseUrl) return false;
    return !needsApiKey(p, cfg) || !!cfg.apiKey;
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

  // Informational only — exported on Engine.LLM but never read by the round
  // loop below. The real guards are STUCK_ABORT_AT and TIME_BUDGET_MS.
  const MAX_ROUNDS = 4;
  const SAFETY_CAP = 48;
  const MODELS_KEY = "cs.llm.models.v1";

  function modelsCacheKey(providerId, baseUrl) {
    return String(providerId || "") + "|" + String(baseUrl || "").replace(/\/+$/, "");
  }
  function loadModelCache() {
    try {
      const raw = localStorage.getItem(MODELS_KEY);
      const c = raw ? JSON.parse(raw) : null;
      if (c && typeof c === "object") return c;
    } catch (_) {}
    return {};
  }
  function saveModelCache(store) {
    try { localStorage.setItem(MODELS_KEY, JSON.stringify(store || {})); } catch (_) {}
  }
  function uniqueModelIds() {
    const seen = {};
    const list = [];
    for (let i = 0; i < arguments.length; i++) {
      (arguments[i] || []).forEach(function (id) {
        const v = String(id || "").trim();
        if (!v || seen[v]) return;
        seen[v] = true;
        list.push(v);
      });
    }
    return list.slice(0, 48);
  }
  function rememberModels(ids, providerId, baseUrl) {
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    const pid = providerId || cfg.providerId || (provider && provider.id) || "";
    const url = (baseUrl != null && baseUrl !== "") ? baseUrl : (provider && provider.baseUrl) || cfg.baseUrl || "";
    const store = loadModelCache();
    const key = modelsCacheKey(pid, url);
    const prev = Array.isArray(store[key]) ? store[key] : [];
    const list = uniqueModelIds(ids, prev);
    store[key] = list;
    saveModelCache(store);
    return list;
  }
  function cachedModels(providerId, baseUrl) {
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    const pid = providerId || cfg.providerId || (provider && provider.id) || "";
    const url = (baseUrl != null && baseUrl !== "") ? baseUrl : (provider && provider.baseUrl) || cfg.baseUrl || "";
    const list = loadModelCache()[modelsCacheKey(pid, url)];
    return Array.isArray(list) ? list.slice() : [];
  }

  // ----- Build a code-generation system prompt -----
  function buildSystemPrompt(specCtx) {
    const stack = (specCtx && specCtx.stack) || "vanilla-html-css-js";
    const arch = (specCtx && specCtx.architecture) || "";
    const mods = (specCtx && (specCtx.modules || (specCtx.classification && specCtx.classification.estimatedModules))) || 0;
    const cls = (specCtx && specCtx.classification && specCtx.classification.primaryType) || "web_application";
    const followUp = !!(specCtx && specCtx.followUp);
    const ctxBlk = (specCtx && specCtx.classification)
      ? "\n\n[PROJECT CONTEXT FROM UNIVERSAL COMPOSER]\n" +
        "primaryType: " + cls + "\n" +
        "modules: " + mods + "\n" +
        "stack: " + JSON.stringify(stack) + "\n" +
        (arch ? "architecture: " + JSON.stringify(arch) + "\n" : "")
      : "";
    const stance = followUp
      ? "You are editing an EXISTING app in the workspace. Preserve product identity, name, architecture, and working features. Apply the user's latest request. Return complete updated files — do not switch to a different product."
      : "Replace any leftover files from a previous project. Do not keep starter-template copy.";
    return [
      "You are CodeSovereign's coding agent — an expert product engineer, not a tutorial generator.",
      "You write production-quality, fully working source files. No placeholders, no TODOs, no pseudo-code, no 'Simple Notepad'.",
      "Ship a distinctive, polished UI: app shell, sidebar or top nav, dark theme, design tokens, real empty states, keyboard shortcuts, and local persistence.",
      stance,
      "You operate as THINK → ACT → OBSERVE → DIAGNOSE → ACT AGAIN → VERIFY → DONE.",
      "There is no product limit on how many tools you may call. Keep acting until the work is verified.",
      "ask_user records a question and you MUST continue working — do not wait.",
      "Prefer a single JSON object (no prose, no markdown fences). Either a file plan:",
      '{ "summary": "<one-line summary of what you built>",',
      '  "files": [ { "path": "/index.html", "content": "<full file contents>" }, ... ],',
      '  "suggestions": ["<a real, specific follow-up feature for THIS app>", "...", "..."] }',
      "suggestions is optional but preferred on the FINAL accepted plan (2-3 items, specific to what you just built — not generic advice).",
      "or a tool call:",
        '{ "think": "<brief>", "tool": "grep|list_dir|read_file|write_file|delete_file|run_tests|install_deps|run_command|observe|web_search|browser|mcp|generate_image|understand_image|ask_user|delegate|computer|goal|done", "args": {} }',
      "If you cannot emit valid JSON, emit files as blocks:",
      "FILE: /index.html",
      "```html",
      "...full contents...",
      "```",
      "Constraints:",
      "- Escape JSON newlines as \\n and quotes as \\\".",
      "- Always include /index.html plus /styles/*.css and /scripts/*.js (or equivalent).",
      "- index.html must reference styles and scripts via /styles/... and /scripts/... paths.",
      "- Use plain HTML/CSS/JS unless the project context requires a framework.",
      "- All file paths start with /. Keep paths short and ASCII.",
      "- Every file must be complete and runnable on its own. Visual quality matters as much as behavior.",
      "- If the app calls an AI model, put it behind a small vendor-neutral provider",
      "  module (local Ollama first, then an API key) — never hard-code one vendor.",
      "- Prefer zero-cost / self-hostable services; list required keys in /.env.example.",
      "- run_command only runs workspace package jobs (install, test, build, lint, typecheck). It cannot spawn arbitrary node/python/git argv.",
      "- Prefer delegate/subagents for multi-role work. The coordinator plans; workers implement. Reuse Project brain memories.",
      "- /goal starts a persistent self-healing loop (run tests → fix → run again) with no product step cap. computer drives mouse/keyboard. web_search uses docs beyond this repo.",
      "- MCP tools use stdio, SSE, or Streamable HTTP (OAuth for remote). Named tools include database.query, jira.createIssue, figma.getDesign, supabase.executeSQL, github.createPR, playwright.openPage, plus Google Drive / Gmail / Calendar.",
      "- Custom Modes and Skills stay active. Steering messages arrive at the next safe tool boundary — merge them and continue; do not abort working state.",
      "- Bugbot is a separate CODE REVIEWER. Do not approve your own diff. Require screenshots/logs/demos; never treat 'task completed' as proof.",
      "- Checkpoints are created before major edits. Design-to-code must compare visually and re-verify. Audit a11y (contrast, semantic HTML, ARIA, keyboard, alt).",
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
        headers: (init && init.headers) || {}, body: (init && init.body) || null,
        timeoutMs: init && init.timeoutMs, partialOnTimeout: !!(init && init.partialOnTimeout)
      });
      if (r && r.ok) return { ok: r.status >= 200 && r.status < 300, status: r.status, partial: !!r.partial, text: async () => r.body };
      throw new Error((r && r.error) || "request failed");
    }
    const res = await fetch(url, init);
    return { ok: res.ok, status: res.status, text: () => res.text() };
  }

  // ----- HTTP call (OpenAI-compatible chat completions) -----
  function buildRequest(provider, cfg, systemPrompt, userPrompt, opts) {
    opts = opts || {};
    const url = provider.baseUrl.replace(/\/+$/, "") + (provider.chatPath || "/v1/chat/completions");
    const headers = { "Content-Type": "application/json" };
    applyAuthHeaders(headers, provider, cfg);
    const local = isLocalEndpoint(provider, cfg);
    const model = String((opts.model != null ? opts.model : cfg.model) || provider.defaultModel || "").trim();
    const body = {
      // opts.messages carries a multi-turn history (user / assistant with
      // tool_calls / tool results) for a tool-calling loop; otherwise the
      // classic single system + user pair.
      messages: [{ role: "system", content: systemPrompt }].concat(
        Array.isArray(opts.messages) && opts.messages.length ? opts.messages : [{ role: "user", content: userPrompt }]
      ),
      temperature: opts.temperature != null ? opts.temperature : (local ? 0.35 : 0.2),
      max_tokens: opts.maxTokens || (local ? 8192 : 4096)
    };
    if (model) body.model = model;
    // LM Studio / llama.cpp set supportsJson: false; LocalAI still requests JSON mode.
    if (provider.supportsJson && opts.json !== false) {
      body.response_format = { type: "json_object" };
    }
    // Standard OpenAI-compatible function-calling — opts.tools is an array
    // of {name, description, parameters} defs; the provider constrains the
    // model's output into structured tool_calls instead of free text.
    if (Array.isArray(opts.tools) && opts.tools.length) {
      body.tools = opts.tools.map(function (t) {
        return { type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } };
      });
      if (opts.toolChoice) body.tool_choice = opts.toolChoice;
    }
    return { url, headers, body };
  }

  // Raw chat completion — a plain string reply, no file-plan JSON contract.
  // messages: string | [{role,content}]. Returns { text, model, provider }.
  async function chat(messages, opts) {
    opts = opts || {};
    const cfg = loadConfig();
    if (!isConfigured(cfg) && !opts.force) throw new Error("LLM not configured.");
    const provider = resolveProvider(cfg);
    if (!provider.baseUrl) throw new Error("Provider has no baseUrl.");
    const msgs = typeof messages === "string"
      ? [{ role: "user", content: messages }]
      : messages;
    const url = provider.baseUrl.replace(/\/+$/, "") + (provider.chatPath || "/v1/chat/completions");
    const headers = { "Content-Type": "application/json" };
    // NOTE: a keyless-flagged provider (OmniRoute's default design) sends no
    // Authorization header at all when no key is set — there is no working
    // placeholder token to send instead. A deployment that has been set up
    // with real provider connections requires a real key; see the 401 hint
    // below (the dashboard issues one).
    if (cfg.apiKey) headers[provider.keyHeader || "Authorization"] = (provider.keyPrefix || "Bearer ") + cfg.apiKey;
    const body = { model: cfg.model || provider.defaultModel || "auto", messages: msgs,
      temperature: opts.temperature == null ? 0.2 : opts.temperature, max_tokens: opts.maxTokens || 2048 };
    if (opts.json && provider.supportsJson) body.response_format = { type: "json_object" };
    // Local models can legitimately take minutes for a full completion —
    // the desktop proxy's default 45s HTTP timeout was aborting real,
    // in-progress generations (confirmed live: llama3.1:8b on modest
    // hardware routinely needs 60-90s+ per round once the prompt grows).
    const res = await httpText(url, { method: "POST", headers, body: JSON.stringify(body), timeoutMs: opts.timeoutMs || 300000 });
    const raw = await res.text();
    if (!res.ok) {
      if (res.status === 401 && provider.id === "omniroute") {
        throw new Error("OmniRoute needs an API key for its HTTP API — open " + provider.baseUrl + "/dashboard, generate a free key, and paste it in Settings.");
      }
      throw new Error("HTTP " + res.status + " " + (raw || "").slice(0, 240));
    }
    let data = null; try { data = JSON.parse(raw); } catch (_) {}
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || raw;
    return { text: String(text || ""), model: body.model, provider: provider.id };
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
      if (res.ok && models.length) rememberModels(models.concat(cachedModels(cfg.providerId, provider.baseUrl)), cfg.providerId, provider.baseUrl);
      return { ok: res.ok, models: models, url: url, status: res.status, cached: cachedModels(cfg.providerId, provider.baseUrl) };
    } catch (e) {
      return { ok: false, models: [], cached: cachedModels(cfg.providerId, provider.baseUrl), error: String(e && e.message || e), url: url };
    }
  }

  // isConfigured() (not needsApiKey — that ignores keyless providers like a
  // local runtime or OmniRoute and would wrongly demand an API key for them)
  // gates the call; opts.force bypasses the gate for a caller that already
  // knows what it's doing (e.g. a just-picked provider not yet persisted).
  // The single choke point every model call in the round loop passes through
  // (llmDecide/llmPlan/sequentialGenerate all call this). executionBackend
  // branches here instead of anywhere upstream, so OpenClaw/Hermes routing
  // is invisible to everything that calls complete() — same {raw, content,
  // model} shape out, regardless of backend.
  async function complete(prompt, ctx, opts) {
    opts = opts || {};
    const cfg = liveConfig();
    // opts.runState is a mutable object shared across every complete() call
    // within ONE Agent.run() invocation (see patchAgent()'s round loop). It
    // is never persisted — this is what makes an OpenClaw fallback last for
    // "the rest of this generation" without permanently changing the user's
    // configured backend, which requires them to deliberately re-select it.
    const runState = opts.runState || null;
    const effectiveBackend = (runState && runState.forceBackend) || cfg.executionBackend;
    if (effectiveBackend === "openclaw") {
      try {
        return await completeViaOpenClaw(prompt, ctx, opts, cfg);
      } catch (err) {
        // OpenClaw failed — most commonly it's too slow to finish before its
        // own timeout on modest local-model hardware. Confirmed live: an 8B
        // Ollama model with OpenClaw's own ~12K-token agent-runtime system
        // prompt (tool schemas, skills, workspace files) ran 10-20+ minutes
        // without completing, while the SAME class of local model called
        // directly (no agent-runtime overhead) answered correctly in well
        // under a minute. If Direct is actually configured and usable, fall
        // back to it for THIS run only (via runState, not persisted config)
        // — the next, separate Agent.run() call still tries OpenClaw again;
        // the user's configured backend is never silently changed.
        // cfg.providerId must be an explicit, user-made choice — an empty
        // providerId resolves to PROVIDERS[0] (omniroute, keyless) by
        // default, which would make this silently fall back to a provider
        // the user never actually set up, not "their configured Direct".
        const directCfg = Object.assign({}, cfg, { executionBackend: "direct" });
        if (!cfg.providerId || !isConfigured(directCfg)) throw err;
        if (runState) runState.forceBackend = "direct";
        try {
          if (typeof window.toast === "function") {
            window.toast("OpenClaw was too slow — using Direct (" + (resolveProvider(directCfg).label || directCfg.providerId) + ") for this generation", "#e08a3f");
          }
        } catch (_) {}
        const result = await completeDirect(prompt, ctx, opts, directCfg);
        return Object.assign({}, result, { fallback: { from: "openclaw", reason: String((err && err.message) || err) } });
      }
    }
    // Hermes (OpenRouter) needs its own key, separate from whatever key is
    // stored for the user's actual configured Direct provider — reusing
    // cfg.apiKey here would silently send e.g. an OpenAI key to OpenRouter.
    const effectiveCfg = effectiveBackend === "hermes"
      ? Object.assign({}, cfg, { providerId: "hermes", model: cfg.hermesModel || null, apiKey: cfg.hermesApiKey || "" })
      : effectiveBackend === "direct" && cfg.executionBackend !== "direct"
        // An in-run forced fallback (runState) — cfg itself still says
        // 'openclaw' on disk, so build the same directCfg the catch block
        // above would have, without touching persisted config.
        ? Object.assign({}, cfg, { executionBackend: "direct" })
        : cfg;
    return completeDirect(prompt, ctx, opts, effectiveCfg);
  }

  // The plain HTTP chat-completions path — used directly by complete() for
  // 'direct'/'hermes', and as the fallback target when OpenClaw fails.
  // Rebuild a chat-completions message from an SSE stream ("data: {…}" lines
  // with choices[0].delta). With `partial` (the stream was cut at the time
  // limit) keep only what is provably complete: tool calls whose arguments
  // parse as JSON, and text up to the start of its last FILE: block (that
  // block may be cut mid-file — saving it would write a truncated file).
  function parseChatStream(text, partial) {
    let content = "";
    const calls = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      const m = /^data:\s*(.*)$/.exec(line);
      if (!m || m[1] === "[DONE]") return;
      let j; try { j = JSON.parse(m[1]); } catch (_) { return; }
      const ch = j && j.choices && j.choices[0];
      if (!ch) return;
      const d = ch.delta || ch.message || {};
      if (typeof d.content === "string") content += d.content;
      (d.tool_calls || []).forEach(function (tc) {
        const i = tc.index != null ? tc.index : calls.length;
        const cur = calls[i] || (calls[i] = { id: tc.id, function: { name: "", arguments: "" } });
        if (tc.id) cur.id = tc.id;
        if (tc.function && tc.function.name) cur.function.name += tc.function.name;
        if (tc.function && tc.function.arguments) cur.function.arguments += tc.function.arguments;
      });
    });
    let toolCalls = calls.filter(Boolean);
    if (partial) {
      toolCalls = toolCalls.filter(function (c) { try { JSON.parse(c.function.arguments || ""); return !!c.function.name; } catch (_) { return false; } });
      const heads = []; const re = /^[ \t]*(?:FILE|Path)\s*[:\-]/gim; let h;
      while ((h = re.exec(content))) heads.push(h.index);
      if (heads.length) content = content.slice(0, heads[heads.length - 1]);
    }
    return { content: content, tool_calls: toolCalls };
  }

  async function completeDirect(prompt, ctx, opts, effectiveCfg) {
    const provider = resolveProvider(effectiveCfg);
    if (!isConfigured(effectiveCfg) && !opts.force) {
      throw new Error("LLM not configured. Pick a provider (and key, unless keyless) in Settings.");
    }
    if (!provider.baseUrl) {
      throw new Error("Provider has no baseUrl. Set a custom base URL in Settings.");
    }
    const systemPrompt = opts.system || buildSystemPrompt(ctx || null);
    const userPrompt = String(prompt || "").trim();
    const req = buildRequest(provider, effectiveCfg, systemPrompt, userPrompt, opts);
    // opts.allowPartial (the task-graph tool loop): stream the answer from a
    // local model through the desktop proxy, so a time-limit cut keeps the
    // files that were already complete instead of losing the whole answer.
    const streaming = !!(opts.allowPartial && window.desktop && window.desktop.isDesktop && window.desktop.ai && isLocalEndpoint(provider, effectiveCfg));
    if (streaming) req.body.stream = true;
    // Route through the desktop proxy (httpText) rather than a bare fetch — the
    // renderer CSP blocks localhost + most API hosts directly; the main-process
    // proxy is the vetted bypass. In a plain browser httpText falls back to fetch.
    // See the same note on chat()'s httpText call above — the desktop
    // proxy's 45s default was killing real, in-progress local generations.
    const send = function () {
      return httpText(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        timeoutMs: opts.timeoutMs || 300000,
        partialOnTimeout: streaming
      });
    };
    let res = await send();
    let text = await res.text();
    // Ollama answers HTTP 400 "<model> does not support tools" for a model
    // without tool support, and some OpenAI-compatible servers reject an
    // unknown `tools` param outright — either would fail every call that
    // offers tools. Retry once without them and remember it for the rest of
    // the run (runState) so later calls don't repeat the doomed request.
    if (!res.ok && req.body.tools && res.status >= 400 && res.status < 500 && /tool/i.test(text || "")) {
      delete req.body.tools;
      delete req.body.tool_choice;
      if (opts.runState) opts.runState.toolsUnsupported = true;
      res = await send();
      text = await res.text();
    }
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " " + (text || "").slice(0, 240));
    }
    let data = null;
    const isStream = streaming && /^\s*(data:|:)/.test(text || "");
    if (isStream) {
      const msg = parseChatStream(text, res.partial);
      data = { choices: [{ message: { content: msg.content, tool_calls: msg.tool_calls } }], partial: !!res.partial };
    } else {
      try { data = JSON.parse(text); } catch (_) { data = null; }
    }
    const message = data && data.choices && data.choices[0] && data.choices[0].message;
    const content = (message && message.content) || text;
    // Standard OpenAI tool-calls shape: message.tool_calls = [{id, function:
    // {name, arguments}}], arguments a JSON-encoded string. Surfaced raw —
    // callers that asked for opts.tools decide how to interpret them; a
    // provider that ignores tools simply omits the field, and content-based
    // parsing still works unchanged.
    const toolCalls = (message && Array.isArray(message.tool_calls) ? message.tool_calls : [])
      .filter(function (c) { return c && c.function && typeof c.function.name === "string"; })
      .map(function (c) { return { id: c.id, name: c.function.name, arguments: c.function.arguments }; });
    return { raw: data, content: String((isStream ? (message && message.content) : content) || ""), model: req.body.model || effectiveCfg.model || "", toolCalls: toolCalls, partial: !!(isStream && res.partial) };
  }

  // executionBackend === 'openclaw': route through the OpenClaw agent
  // runtime (electron/lib/openclaw-manager.js -> Engine.AIRouter.OpenClaw)
  // instead of a direct HTTP chat-completions call. Adapts its reply into
  // the same {raw, content, model} shape complete() always returns, so
  // llmDecide/llmPlan/sequentialGenerate need no changes at all.
  // With no OpenClaw model chosen, OpenClaw falls back to ITS default model —
  // on a real install a cloud model (minimax/MiniMax-M3) it had no
  // credentials for, so every turn failed. If the Direct backend is pointed
  // at a local Ollama, ask OpenClaw for that same model instead. Other
  // runtimes keep OpenClaw's default: their OpenClaw provider ids aren't known.
  function openclawModelFor(cfg) {
    if (cfg.openclawModel) return cfg.openclawModel;
    if (cfg.model && /^https?:\/\/(127\.0\.0\.1|localhost):11434(\/|$)/i.test(String(cfg.baseUrl || ""))) return "ollama/" + cfg.model;
    return null;
  }

  async function completeViaOpenClaw(prompt, ctx, opts, cfg) {
    const AR = window.Engine && window.Engine.AIRouter;
    if (!AR || !AR.OpenClaw || !AR.OpenClaw.runAgentTurn) {
      throw new Error("OpenClaw control needs the desktop app.");
    }
    const systemPrompt = opts.system || buildSystemPrompt(ctx || null);
    const userPrompt = String(prompt || "").trim();
    const message = systemPrompt ? (systemPrompt + "\n\n" + userPrompt) : userPrompt;
    const sessionKey = opts.openclawSessionKey || cfg.openclawSessionKey || null;
    const r = await AR.OpenClaw.runAgentTurn({
      agentId: cfg.openclawAgentId || "main",
      sessionKey: sessionKey,
      model: openclawModelFor(cfg),
      message: message,
      // opts.openClawTimeoutMs lets a caller give the OpenClaw attempt a
      // SHORTER leash than opts.timeoutMs (which governs the Direct
      // fallback below) — see the task-graph's llmTaskComplete() for why:
      // OpenClaw's own agent-runtime overhead means "give it more time"
      // just delays reaching the fast path that actually works.
      timeoutSec: Math.round((opts.openClawTimeoutMs || opts.timeoutMs || 300000) / 1000)
    });
    if (!r || r.ok === false) {
      const err = (r && r.error) || "OpenClaw agent turn failed.";
      throw new Error("OpenClaw: " + err);
    }
    const json = r.json || {};
    // Confirmed live (openclaw 2026.7.1-2, `openclaw agent --json`): the
    // real success shape is { status, result: { payloads: [{ text }], meta:
    // { agentMeta: { provider, model }, finalAssistantVisibleText, aborted,
    // stopReason } } } — not a flat {reply|text|message|content}.
    //
    // Also confirmed live (openclaw 2026.9.5): a CLI-level failure (e.g. a
    // provider quota error) is now ALSO valid JSON on stdout — a distinct
    // shape, { ok: false, runId, origin, error: { type, message } } — not
    // the {status:'ok', result:{...}} shape above at all. This `ok` is the
    // CLI's own top-level flag, unrelated to runJSON()'s `r.ok` (which only
    // means "execFile + JSON.parse succeeded"). Checked first so the real
    // provider error message surfaces instead of a generic "(unknown)".
    if (json.ok === false) {
      throw new Error("OpenClaw: " + ((json.error && json.error.message) || json.error || "agent turn failed"));
    }
    const result = json.result || {};
    const meta = result.meta || {};
    if (json.status !== "ok" || meta.aborted) {
      throw new Error("OpenClaw: run did not complete (" + (json.status || "unknown") + (meta.stopReason ? ", " + meta.stopReason : "") + ")");
    }
    const payloadText = (result.payloads && result.payloads[0] && result.payloads[0].text) || "";
    const content = payloadText || meta.finalAssistantVisibleText || meta.finalAssistantRawText || "";
    const model = (meta.agentMeta && meta.agentMeta.model) || openclawModelFor(cfg) || "openclaw";
    return { raw: json, content: String(content || ""), model: model };
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

  function normalizePath(p) {
    let out = String(p == null ? "" : p).trim().replace(/\\/g, "/");
    if (!out) return "";
    if (!out.startsWith("/")) out = "/" + out;
    return out.replace(/\/+/g, "/");
  }

  function stripFence(body, path) {
    const trimmed = String(body == null ? "" : body).trim();
    if (!trimmed) return "";
    const ext = String(path || "").split(".").pop().toLowerCase();
    const lines = trimmed.split(/\r?\n/);

    function lineLooksLikeSource(line) {
      const s = String(line || "").trim();
      if (!s) return false;
      return /^(?:\/\/|\/\*|\*|const\s|let\s|var\s|function\s|import\s|export\s|class\s|return\s|if\s*\(|for\s*\(|while\s*\(|<!DOCTYPE|<html[\s>]|<body[\s>]|<script[\s>]|:root|@[\w-]|[.#][\w-]+\s*\{|[{}()]|"use strict"|'use strict')/i.test(s);
    }

    if (lines.length >= 3 && /^```(?:[\w+-]*)[ \t]*$/.test(lines[0]) && /^```[ \t]*$/.test(lines[lines.length - 1])) {
      return lines.slice(1, -1).join("\n");
    }

    let openAt = -1;
    for (let i = 0; i < lines.length && i <= 4; i++) {
      if (/^```(?:[\w+-]*)[ \t]*$/.test(lines[i])) { openAt = i; break; }
      if (lineLooksLikeSource(lines[i])) break;
      if (lines[i].indexOf("```") >= 0) break;
    }
    if (openAt >= 0) {
      let closeAt = -1;
      let skipped = 0;
      for (let j = lines.length - 1; j > openAt; j--) {
        if (/^```[ \t]*$/.test(lines[j])) { closeAt = j; break; }
        if (lines[j].indexOf("```") >= 0) break;
        skipped++;
        if (skipped > 3) break;
      }
      if (closeAt > openAt) return lines.slice(openAt + 1, closeAt).join("\n");
    }

    if ((ext === "html" || ext === "htm") && !/^<!DOCTYPE|^<html/i.test(trimmed)) {
      const html = trimmed.match(/((?:<!DOCTYPE[\s\S]*?<\/html>|<html[\s\S]*?<\/html>))/i);
      if (html && html[1].length >= trimmed.length * 0.5) return html[1];
    }
    return trimmed;
  }

  function issuesForFiles(files, issues) {
    const fileSet = {};
    (files || []).forEach(function (f) { if (f && f.path) fileSet[f.path] = true; });
    return (issues || []).filter(function (i) {
      return !i || !i.file || fileSet[i.file];
    });
  }

  function isTransportError(err) {
    const msg = String(err && err.message || err || "");
    return /^HTTP \d+/.test(msg)
      || /ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|Failed to fetch|NetworkError|network blocked/i.test(msg)
      || /LLM not configured|no baseUrl/i.test(msg);
  }

  function isPlanParseError(err) {
    const msg = String(err && err.message || err || "");
    return /did not contain a valid file plan|no usable files/i.test(msg);
  }

  // Translate raw network/HTTP error text into something a non-technical
  // user can act on. Found live: "Failed to fetch" and "timeout" reached
  // the UI verbatim and told the user nothing they could do about it.
  function humanizeTransportError(err, cfg) {
    const msg = String(err && err.message || err || "");
    const where = (cfg && cfg.baseUrl) || "the configured provider";
    if (/timeout/i.test(msg)) {
      return "the model at " + where + " didn't respond in time. Local models can be slow on modest hardware, " +
        "especially on the first request — try again (it may just need a moment), or switch to a smaller/faster " +
        "model or a cloud provider in Settings.";
    }
    if (/Failed to fetch|NetworkError|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
      return "couldn't reach " + where + ". Check that it's actually running (for a local model: is the server " +
        "still up? is it busy with another request?), then try again.";
    }
    if (/ECONNRESET/i.test(msg)) {
      return where + " closed the connection before responding — it may be overloaded (busy with an earlier " +
        "request) or have crashed. Check it's still running, then try again.";
    }
    if (/^HTTP 401/.test(msg)) {
      return "authentication failed (401) — check the API key for this provider in Settings.";
    }
    if (/^HTTP \d/.test(msg)) {
      return where + " rejected the request: " + msg;
    }
    if (/LLM not configured|no baseUrl/i.test(msg)) {
      return "no AI provider is connected — pick one in Settings first.";
    }
    return msg;
  }

  function pushFile(files, path, content) {
    const p = normalizePath(path);
    if (!p || typeof content !== "string") return;
    const existing = files.find(function (f) { return f.path === p; });
    if (existing) existing.content = content;
    else files.push({ path: p, content: content });
  }

  function extractFilesFromText(text) {
    const parsed = extractJson(text);
    const files = [];
    let summary = "";
    let suggestions = [];
    if (parsed) {
      summary = String(parsed.summary || parsed.message || "");
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions.filter(function (s) { return typeof s === "string" && s.trim(); }).slice(0, 5);
      }
      const rows = parsed.files || parsed.targets || parsed.artifacts;
      if (Array.isArray(rows)) {
        rows.forEach(function (f) {
          if (!f) return;
          if (typeof f === "string") return;
          const content = typeof f.content === "string" ? f.content : (typeof f.body === "string" ? f.body : null);
          if (typeof f.path === "string" && typeof content === "string") pushFile(files, f.path, content);
        });
      }
    }
    if (!files.length) {
      const src = String(text || "");
      const reFile = /(?:^|\n)(?:FILE|Path)\s*[:\-]\s*`?(\/[^\s`\n]+)`?\s*\n+```(?:[\w-]+)?\s*\n([\s\S]*?)```/gi;
      let m;
      while ((m = reFile.exec(src))) pushFile(files, m[1], m[2].replace(/\n$/, ""));
      const reHead = /(?:^|\n)#{1,6}\s*`?(\/[^\s`\n]+)`?\s*\n+```(?:[\w-]+)?\s*\n([\s\S]*?)```/gi;
      while ((m = reHead.exec(src))) pushFile(files, m[1], m[2].replace(/\n$/, ""));
    }
    if (!files.length) return null;
    return { summary: summary, files: files, suggestions: suggestions };
  }

  function planFromParsed(parsed, model, source) {
    const targets = [];
    (parsed.files || []).forEach(function (f) {
      if (!f || typeof f.path !== "string" || typeof f.content !== "string") return;
      targets.push({ path: normalizePath(f.path), content: f.content });
    });
    if (!targets.length) throw new Error("LLM plan had no usable files.");
    return {
      summary: parsed.summary || ("Generated " + targets.length + " file(s) via " + (model || "LLM")),
      targets: targets,
      source: source || "llm",
      model: model || "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    };
  }

  // ----- Build the LLM plan in the shape _plan() returns -----
  function llmPlan(prompt, proj, specCtx, extraUser, runState) {
    const userPrompt = extraUser
      ? String(prompt || "").trim() + "\n\n" + String(extraUser)
      : String(prompt || "").trim();
    return complete(userPrompt, specCtx, { runState: runState }).then(function (res) {
      const parsed = extractFilesFromText(res.content);
      if (!parsed || !parsed.files.length) {
        throw new Error("LLM response did not contain a valid file plan.");
      }
      return planFromParsed(parsed, res.model, "llm");
    });
  }

  function llmDecide(prompt, proj, specCtx, extraUser, runState) {
    const userPrompt = extraUser
      ? String(prompt || "").trim() + "\n\n" + String(extraUser)
      : String(prompt || "").trim();
    return complete(userPrompt, specCtx, { runState: runState }).then(function (res) {
      const files = extractFilesFromText(res.content);
      const parsed = extractJson(res.content);
      if (files && files.files && files.files.length) {
        return { kind: "files", think: parsed && parsed.think, plan: planFromParsed(files, res.model, "llm") };
      }
      const Loop = window.Engine && window.Engine.Loop;
      if (Loop && Loop.parse) {
        const d = Loop.parse(res.content);
        if (d && d.kind === "tool") return d;
      }
      throw new Error("LLM response did not contain a valid file plan.");
    });
  }

  function snapshotWorkspace() {
    const FS = window.Engine && window.Engine.FS;
    const files = [];
    if (!FS || !FS._data) return files;
    Object.keys(FS._data).forEach(function (p) {
      if (FS.isFile(p)) files.push({ path: p, content: FS.read(p) || "" });
    });
    return files;
  }

  function scoreBuild(files, issues) {
    files = files || [];
    issues = issuesForFiles(files, issues);
    const html = files.find(function (f) { return /\/index\.html$/i.test(f.path); });
    const css = files.filter(function (f) { return /\.css$/i.test(f.path); });
    const js = files.filter(function (f) { return /\.js$/i.test(f.path); });
    const htmlText = html ? html.content : "";
    const cssText = css.map(function (f) { return f.content; }).join("\n");
    const all = files.map(function (f) { return f.content; }).join("\n");
    let score = 0;
    const reasons = [];
    if (html) score += 12; else reasons.push("missing /index.html");
    if (css.length) score += 10; else reasons.push("no stylesheet");
    if (js.length) score += 8; else reasons.push("no script");
    if (htmlText.length >= 2500) score += 12;
    else if (htmlText.length >= 1200) score += 6;
    else reasons.push("HTML is too thin");
    if (cssText.length >= 1800) score += 14;
    else if (cssText.length >= 800) score += 7;
    else reasons.push("CSS is too thin — UI will look unfinished");
    if (files.length >= 4) score += 8;
    else if (files.length >= 3) score += 4;
    else reasons.push("too few files");
    if (/<nav[\s>]|sidebar|app-shell|class=["'][^"']*(sidebar|app-nav)/i.test(htmlText)) score += 8;
    else reasons.push("no app shell / sidebar / nav");
    if (/--[a-zA-Z-]+:/.test(cssText) || /linear-gradient/.test(cssText)) score += 8;
    else reasons.push("no design tokens or visual polish");
    if (/simple notepad|start writing your notes here|save manually|clear all content/i.test(all)) {
      score -= 25;
      reasons.push("generic placeholder notepad UI");
    }
    if (/a real starter project built from your prompt/i.test(all)) {
      score -= 20;
      reasons.push("starter-template leftovers");
    }
    const errors = issues.filter(function (i) { return i.severity === "error"; }).length;
    const warnings = issues.filter(function (i) { return i.severity === "warning"; }).length;
    score -= errors * 10;
    score -= warnings * 2;
    if (errors) reasons.push(errors + " validator error(s)");
    const pass = score >= 55 && errors === 0 && !!html && css.length > 0
      && !/simple notepad/i.test(all);
    return {
      score: score,
      pass: pass,
      errors: errors,
      warnings: warnings,
      files: files.length,
      htmlLen: htmlText.length,
      cssLen: cssText.length,
      reasons: reasons
    };
  }

  function looksLikeRestart(prompt) {
    return /\b(start over|from scratch|brand[- ]new(?: app)?|replace (?:the |this )?(?:entire )?app|rebuild (?:everything|from scratch)|throw (?:it|this) away|different (?:app|product))\b/i.test(String(prompt || ""));
  }

  function conversationHistory(latest) {
    const out = [];
    try {
      const S = window.S;
      if (!S) return out;
      const chat = Array.isArray(S.agentChat) ? S.agentChat : [];
      if (chat.length) {
        chat.forEach(function (t) {
          if (!t || !t.text) return;
          out.push({ role: t.role || "user", text: String(t.text).slice(0, 500) });
        });
      } else {
        (S.agentRuns || []).forEach(function (p) {
          out.push({ role: "user", text: String(p).slice(0, 500) });
        });
      }
    } catch (_) {}
    const latestTrim = String(latest || "").trim();
    return out.filter(function (t) {
      return !(t.role === "user" && String(t.text).trim() === latestTrim);
    }).slice(-10);
  }

  function hasPriorTurns(prompt) {
    try {
      const S = window.S;
      if (!S) return false;
      if (S.agentBuilt) return true;
      const runs = Array.isArray(S.agentRuns) ? S.agentRuns : [];
      return runs.some(function (p) {
        return String(p || "").trim() && String(p).trim() !== String(prompt || "").trim();
      });
    } catch (_) { return false; }
  }

  function isFollowUp(prompt) {
    if (looksLikeRestart(prompt)) return false;
    return hasPriorTurns(prompt);
  }

  function buildFollowUpPrompt(latest, files, issues, history) {
    const fileBlk = (files || []).slice(0, 12).map(function (f) {
      return "FILE: " + f.path + "\n```\n" + String(f.content || "").slice(0, 4500) + "\n```";
    }).join("\n\n");
    const issueBlk = (issues || []).slice(0, 24).map(function (i) {
      return "- [" + (i.severity || "info") + "] " + (i.file || "") + ": " + (i.message || i.msg || "");
    }).join("\n");
    const histBlk = (history || []).map(function (t) {
      return "- " + (t.role === "assistant" ? "Agent" : "User") + ": " + t.text;
    }).join("\n");
    return [
      "FOLLOW-UP on the EXISTING app. Do not start a different product.",
      "Keep the current architecture, name, and working features unless the latest request explicitly replaces them.",
      "Apply this latest request as an edit: " + String(latest || ""),
      histBlk ? ("Conversation so far:\n" + histBlk) : "",
      "Validator issues to consider:\n" + (issueBlk || "(none)"),
      "Selected files for this request (not the whole repository). Only return files you change — unlisted files stay as they are.\n" + fileBlk,
      "Preserve distinctive UI. No 'Simple Notepad'. No leftover music-app copy. No starter-template dashboard unless that is the current app."
    ].filter(Boolean).join("\n\n");
  }

  function buildRefinePrompt(original, files, issues, quality, opts) {
    opts = opts || {};
    issues = issuesForFiles(files, issues);
    const fileBlk = (files || []).slice(0, 12).map(function (f) {
      return "FILE: " + f.path + "\n```\n" + String(f.content || "").slice(0, 4500) + "\n```";
    }).join("\n\n");
    const issueBlk = (issues || []).slice(0, 24).map(function (i) {
      return "- [" + (i.severity || "info") + "] " + (i.file || "") + ": " + (i.message || i.msg || "");
    }).join("\n");
    const lead = opts.followUp
      ? "The current version is NOT good enough. Improve THIS same app to production quality. Do not switch products."
      : "The current version is NOT good enough. Rebuild the entire app to production quality.";
    const previewBlk = formatCapture(opts.capture);
    return [
      lead,
      "Original request:\n" + String(original || ""),
      "Quality score: " + ((quality && quality.score) || 0) + ". Failures:\n- " + ((quality && quality.reasons) || []).join("\n- "),
      "Validator issues:\n" + (issueBlk || "(none)"),
      previewBlk ? ("Live preview snapshot of the built app (look at the UI, not just source):\n" + previewBlk) : "",
      "Current files:\n" + fileBlk,
      "Replace every file with a polished, distinctive UI: app shell, sidebar or top nav, dark theme, real interactions, empty states, keyboard shortcuts, local persistence.",
      "No 'Simple Notepad'. No starter template. No leftover music-app copy. Return the full file plan again.",
      // Kept through every refine round, not just the opening prompt — a
      // low-quality retry must still target the same structured
      // requirements, not just "make it prettier".
      opts.contractBlk || ""
    ].filter(Boolean).join("\n\n");
  }

  function formatCapture(capture) {
    if (!capture || !capture.inspect) return "";
    const i = capture.inspect;
    const lines = [];
    lines.push("Title: " + (i.title || "(none)"));
    if (i.headings && i.headings.length) lines.push("Headings: " + i.headings.map(function (h) { return "H" + h.level + " " + h.text; }).join(" | "));
    if (i.buttons && i.buttons.length) lines.push("Buttons: " + i.buttons.map(function (b) { return b.text || "button"; }).join(", "));
    if (i.missingAltCount) lines.push(i.missingAltCount + " image(s) missing alt");
    if (i.issues && i.issues.length) lines.push("Visible UI problems: " + i.issues.join("; "));
    if (i.textSample) lines.push("Visible text: " + String(i.textSample).slice(0, 280));
    return lines.join("\n");
  }

  function llmAvailable() {
    try { return !!(status() && status().configured); } catch (_) { return false; }
  }

  const NODE_BUILTINS = {
    fs: 1, path: 1, http: 1, https: 1, url: 1, util: 1, os: 1, crypto: 1, stream: 1,
    events: 1, buffer: 1, child_process: 1, net: 1, zlib: 1, querystring: 1, assert: 1,
    process: 1, module: 1, console: 1, timers: 1, tty: 1, vm: 1
  };

  function referencedRemotes(prompt) {
    const text = String(prompt || "");
    const out = [];
    const re = /https?:\/\/(?:www\.)?(?:github\.com|huggingface\.co)\/[^\s)'"`<>]+/gi;
    let m;
    while ((m = re.exec(text))) out.push(m[0].replace(/[.,;]+$/, ""));
    return out;
  }

  function extractExternalImports(content) {
    const names = [];
    const re = /(?:from\s+['"]([^./'"][^'"]*)['"]|require\s*\(\s*['"]([^./'"][^'"]*)['"]\s*\)|import\s*\(\s*['"]([^./'"][^'"]*)['"]\s*\))/g;
    let m;
    const src = String(content || "");
    while ((m = re.exec(src))) {
      const raw = m[1] || m[2] || m[3] || "";
      const pkg = raw.charAt(0) === "@" ? raw.split("/").slice(0, 2).join("/") : raw.split("/")[0];
      if (pkg && !NODE_BUILTINS[pkg]) names.push(pkg);
    }
    return names;
  }

  function looksLikeExplore(prompt) {
    return /\b(where (?:is|are)|find (?:the )?(?:file|function|class|caller|callers|implementation|reference|references)|who (?:calls|imports|uses)|how does|how is|architecture|project structure|directory tree|search for|\bgrep\b|locate|show me (?:the )?(?:file|code|implementation)|trace (?:the )?(?:dep|import|call)|what files)\b/i.test(String(prompt || ""));
  }

  // Router selects engines. Running GitHub/HF fetch + npm install on every
  // "make the button purple" prompt would add noise, not intelligence.
  function classifyIntent(prompt) {
    const p = String(prompt || "");
    const remotes = referencedRemotes(p);
    if (looksLikeRestart(p)) {
      return { mode: "generate", engines: ["runtime"], reason: "start-over", remotes: remotes };
    }
    if (/\b(npm i(?:nstall)?\b|yarn add|pnpm (?:add|i)\b|pip install|missing (?:module|dependency|package)|cannot find module)\b/i.test(p)) {
      return { mode: "deps", engines: ["deps", "runtime"], reason: "dependency-request", remotes: remotes };
    }
    if (remotes.length || /\b(git clone|clone (?:this |the )?(?:repo|repository)|import (?:this )?repo)\b/i.test(p) || /huggingface\.co|\bhf\.co\b/i.test(p)) {
      const engines = ["repo", "runtime"];
      if (/\b(npm i(?:nstall)?\b|yarn add|pip install)\b/i.test(p)) engines.splice(1, 0, "deps");
      return { mode: "repo", engines: engines, reason: "external-source", remotes: remotes };
    }
    if (looksLikeExplore(p) && (isFollowUp(p) || hasPriorTurns(p))) {
      return { mode: "explore", engines: ["repo", "runtime"], reason: "architecture-or-search", remotes: remotes };
    }
    if (/\b(fix|repair|bug|broken|crash|workaround|placeholder|hard-?coded secret|timeout after)\b/i.test(p)) {
      const prior = isFollowUp(p) || hasPriorTurns(p);
      return {
        mode: prior ? "repair" : "generate",
        engines: ["repo", "deps", "runtime"],
        reason: prior ? "repair-request" : "repair-without-app",
        remotes: remotes
      };
    }
    if (isFollowUp(p)) {
      return { mode: "edit", engines: ["repo", "runtime"], reason: "follow-up-edit", remotes: remotes };
    }
    return { mode: "generate", engines: ["repo", "deps", "runtime"], reason: "new-app", remotes: remotes };
  }

  function scanRepo() {
    const files = snapshotWorkspace();
    const langs = {};
    const paths = [];
    files.forEach(function (f) {
      const m = (f.path || "").match(/\.([a-z0-9]+)$/i);
      const ext = m ? m[1].toLowerCase() : "other";
      langs[ext] = (langs[ext] || 0) + 1;
      if (f.path && !/^\/\.codesovereign\//.test(f.path)) paths.push(f.path);
    });
    let aider = null;
    try {
      const Stack = window.Engine && window.Engine.BuildingStack;
      if (Stack && Stack.Aider && Stack.Aider.analyzeRepository) aider = Stack.Aider.analyzeRepository();
    } catch (_) {}
    let memory = [];
    try {
      const Mem = window.Engine && window.Engine.BuildingStack && window.Engine.BuildingStack.Memory;
      if (Mem && Mem.search) {
        memory = Mem.search("workspace errors files", "repository").slice(0, 5).map(function (h) { return h.text; });
      }
    } catch (_) {}
    return { fileCount: files.length, languages: langs, paths: paths.slice(0, 40), aider: aider, memory: memory };
  }

  const EXPLORE_SKIP = /^\/\.codesovereign\/|\/node_modules\/|^\/\.git\//;
  const EXPLORE_STOP = {
    the: 1, a: 1, an: 1, and: 1, or: 1, to: 1, of: 1, in: 1, on: 1, for: 1, with: 1, from: 1,
    this: 1, that: 1, these: 1, those: 1, your: 1, my: 1, our: 1, their: 1, it: 1, its: 1,
    is: 1, are: 1, was: 1, were: 1, be: 1, been: 1, being: 1, do: 1, does: 1, did: 1, make: 1,
    create: 1, add: 1, build: 1, fix: 1, repair: 1, please: 1, just: 1, new: 1, old: 1,
    app: 1, application: 1, project: 1, file: 1, files: 1, code: 1, function: 1, class: 1,
    how: 1, what: 1, where: 1, who: 1, when: 1, why: 1, which: 1, can: 1, you: 1, me: 1,
    we: 1, they: 1, not: 1, no: 1, yes: 1, like: 1, about: 1, into: 1, over: 1, after: 1,
    before: 1, than: 1, then: 1, also: 1, using: 1, use: 1, used: 1, based: 1, should: 1,
    would: 1, could: 1, must: 1, need: 1, needs: 1, want: 1, wanted: 1, same: 1, keep: 1
  };
  const EXPLORE_RANK = { path: 0, glob: 1, symbol: 2, search: 3, ref: 4, dep: 5, entrypoint: 6 };

  function workspaceIndex() {
    const FS = window.Engine && window.Engine.FS;
    const files = [];
    if (!FS || !FS._data) return files;
    Object.keys(FS._data).forEach(function (p) {
      if (!FS.isFile(p) || EXPLORE_SKIP.test(p)) return;
      const content = FS.read(p) || "";
      if (content.length > 250000) return;
      files.push({ path: p, content: content, bytes: content.length });
    });
    return files;
  }

  function escapeRe(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function globToRe(pat) {
    let s = String(pat || "").replace(/\\/g, "/");
    const anchored = s.charAt(0) === "/";
    s = s.replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\u0000/g, ".*");
    return new RegExp("^" + (anchored ? "" : ".*/?") + s + "$", "i");
  }

  function listDir(dir) {
    dir = String(dir == null ? "/" : dir).replace(/\\/g, "/");
    if (!dir || dir === ".") dir = "/";
    if (dir.charAt(0) !== "/") dir = "/" + dir;
    if (dir.length > 1 && dir.slice(-1) === "/") dir = dir.slice(0, -1);
    const prefix = dir === "/" ? "/" : dir + "/";
    const kids = {};
    workspaceIndex().forEach(function (f) {
      const p = f.path;
      if (dir === "/") {
        const rest = p.replace(/^\//, "");
        const name = rest.split("/")[0];
        kids["/" + name] = { path: "/" + name, name: name, type: rest.indexOf("/") >= 0 ? "dir" : "file" };
        return;
      }
      if (p === dir) {
        kids[p] = { path: p, name: p.split("/").pop(), type: "file" };
        return;
      }
      if (p.indexOf(prefix) !== 0) return;
      const rest = p.slice(prefix.length);
      const name = rest.split("/")[0];
      kids[prefix + name] = { path: prefix + name, name: name, type: rest.indexOf("/") >= 0 ? "dir" : "file" };
    });
    return Object.keys(kids).sort().map(function (k) { return kids[k]; });
  }

  function glob(pattern) {
    const re = globToRe(pattern);
    return workspaceIndex().map(function (f) { return f.path; }).filter(function (p) { return re.test(p); });
  }

  function grep(query, opts) {
    opts = opts || {};
    const maxHits = opts.maxHits || 40;
    const maxPerFile = opts.maxPerFile || 8;
    let re;
    try {
      if (opts.regex) re = new RegExp(query, opts.i === false ? "g" : "gi");
      else {
        const body = opts.word ? ("\\b" + escapeRe(query) + "\\b") : escapeRe(query);
        re = new RegExp(body, opts.i === false ? "g" : "gi");
      }
    } catch (_) {
      return { hits: [], error: "invalid-pattern", query: String(query || "") };
    }
    const hits = [];
    const files = opts.glob ? glob(opts.glob).reduce(function (m, p) { m[p] = true; return m; }, {}) : null;
    workspaceIndex().forEach(function (f) {
      if (files && !files[f.path]) return;
      const lines = String(f.content || "").split(/\r?\n/);
      let n = 0;
      for (let i = 0; i < lines.length && hits.length < maxHits; i++) {
        re.lastIndex = 0;
        if (!re.test(lines[i])) continue;
        hits.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 220) });
        n++;
        if (n >= maxPerFile) break;
      }
    });
    return { hits: hits, count: hits.length, query: String(query || "") };
  }

  function readFile(path, opts) {
    opts = opts || {};
    const FS = window.Engine && window.Engine.FS;
    if (!FS || !path || !FS.isFile(path) || EXPLORE_SKIP.test(path)) return null;
    let content = FS.read(path) || "";
    const bytes = content.length;
    const max = opts.max || 8000;
    const truncated = bytes > max;
    if (truncated) content = content.slice(0, max) + "\n/* … truncated (" + bytes + " bytes) */";
    return { path: path, content: content, bytes: bytes, truncated: truncated };
  }

  function projectStructure(maxEntries) {
    const paths = workspaceIndex().map(function (f) { return f.path; }).sort();
    const dirs = {};
    paths.forEach(function (p) {
      const parts = p.split("/").filter(Boolean);
      parts.slice(0, -1).forEach(function (_, i) {
        dirs["/" + parts.slice(0, i + 1).join("/")] = true;
      });
    });
    return {
      fileCount: paths.length,
      dirs: Object.keys(dirs).sort(),
      paths: paths.slice(0, maxEntries || 80)
    };
  }

  function findSymbol(name) {
    const hits = [];
    if (!name) return hits;
    const AST = window.Engine && window.Engine.AST;
    const reFn = new RegExp("(?:function\\s+|class\\s+|(?:const|let|var)\\s+|export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\s+|class\\s+)?)\\s*" + escapeRe(name) + "\\b");
    workspaceIndex().forEach(function (f) {
      if (AST && AST.parse && /\.(js|mjs|cjs)$/.test(f.path)) {
        try {
          const parsed = AST.parse(f.content, f.path);
          if (parsed && parsed.ok) {
            let found = false;
            ["functions", "classes", "exports"].forEach(function (k) {
              (parsed[k] || []).forEach(function (n) {
                if (n === name) {
                  hits.push({ path: f.path, kind: k === "functions" ? "function" : (k === "classes" ? "class" : "export"), name: name });
                  found = true;
                }
              });
            });
            if (found) return;
          }
        } catch (_) {}
      }
      if (reFn.test(f.content)) hits.push({ path: f.path, kind: "match", name: name });
    });
    return hits;
  }

  function findRefs(name) {
    if (!name) return [];
    const AST = window.Engine && window.Engine.AST;
    const out = [];
    const seen = {};
    function push(h) {
      const k = h.path + ":" + (h.line || 0) + ":" + (h.text || h.kind || "");
      if (seen[k]) return;
      seen[k] = true;
      out.push(h);
    }
    grep(name, { word: true, maxHits: 30 }).hits.forEach(push);
    if (AST && AST.parse) {
      workspaceIndex().forEach(function (f) {
        if (!/\.(js|mjs|cjs)$/.test(f.path)) return;
        try {
          const parsed = AST.parse(f.content, f.path);
          if (!parsed || !parsed.ok) return;
          (parsed.calls || []).forEach(function (c) {
            if (c === name || c.slice(-(name.length + 1)) === "." + name) {
              push({ path: f.path, kind: "call", text: c, name: name });
            }
          });
        } catch (_) {}
      });
    }
    return out.slice(0, 40);
  }

  function traceDeps(path) {
    const file = readFile(path, { max: 20000 });
    const imports = file ? extractExternalImports(file.content) : [];
    const rel = [];
    if (file) {
      String(file.content).replace(/(?:from|import|require\()\s*['"](\.[^'"]+)['"]/g, function (_, spec) {
        rel.push(spec);
        return _;
      });
    }
    const importers = [];
    const needle = String(path || "").split("/").pop() || "";
    if (needle) {
      grep(needle, { maxHits: 20 }).hits.forEach(function (h) {
        if (h.path !== path) importers.push(h.path);
      });
    }
    const uniq = [];
    importers.forEach(function (p) { if (uniq.indexOf(p) < 0) uniq.push(p); });
    return { path: path, packages: imports, relative: rel, importers: uniq.slice(0, 16) };
  }

  function unique(arr) {
    const seen = {};
    const out = [];
    (arr || []).forEach(function (x) {
      if (!x || seen[x]) return;
      seen[x] = true;
      out.push(x);
    });
    return out;
  }

  function queryTokens(prompt) {
    const p = String(prompt || "");
    const quoted = [];
    p.replace(/"([^"]{1,120})"|'([^']{1,120})'|`([^`]{1,120})`/g, function (_, a, b, c) {
      const s = a || b || c;
      if (s) quoted.push(s);
      return _;
    });
    const paths = [];
    p.replace(/(^|[\s"'`(])(\/[\w./-]+\.\w{1,10})/g, function (_, _s, path) {
      paths.push(path);
      return _;
    });
    const globs = [];
    p.replace(/\b([\w./-]*\*[\w./-]*)\b/g, function (m) {
      globs.push(m);
      return m;
    });
    const idents = [];
    p.replace(/\b([A-Za-z_][\w]{2,})\b/g, function (m) {
      if (EXPLORE_STOP[m.toLowerCase()]) return m;
      idents.push(m);
      return m;
    });
    return { quoted: unique(quoted), paths: unique(paths), globs: unique(globs), idents: unique(idents).slice(0, 12) };
  }

  function relevantContext(prompt, opts) {
    opts = opts || {};
    const followUp = !!opts.followUp;
    const includeContents = opts.includeContents != null ? !!opts.includeContents : followUp;
    const tokens = queryTokens(prompt);
    const structure = projectStructure(80);
    const locate = [];
    const hits = [];
    const symbols = [];
    const refs = [];
    const deps = [];
    const selected = {};

    function take(path, reason) {
      if (!path || EXPLORE_SKIP.test(path)) return;
      const rank = EXPLORE_RANK[reason] != null ? EXPLORE_RANK[reason] : 9;
      if (selected[path] && selected[path].rank <= rank) return;
      const f = readFile(path, { max: 4500 });
      if (!f) return;
      selected[path] = {
        path: path,
        content: includeContents ? f.content : "",
        bytes: f.bytes,
        reason: reason,
        rank: rank
      };
    }

    if (!includeContents) {
      return {
        structure: structure,
        tokens: tokens,
        locate: [],
        hits: [],
        symbols: [],
        refs: [],
        deps: [],
        files: [],
        skippedDump: true
      };
    }

    tokens.paths.forEach(function (p) { locate.push(p); take(p, "path"); });
    tokens.globs.forEach(function (g) {
      glob(g).forEach(function (p) { locate.push(p); take(p, "glob"); });
    });
    tokens.quoted.forEach(function (q) {
      grep(q, { regex: false }).hits.forEach(function (h) { hits.push(h); take(h.path, "search"); });
    });
    tokens.idents.forEach(function (id) {
      findSymbol(id).forEach(function (s) { symbols.push(s); take(s.path, "symbol"); });
      findRefs(id).slice(0, 16).forEach(function (h) { refs.push(h); take(h.path, "ref"); });
      grep(id, { word: true, maxHits: 16 }).hits.forEach(function (h) { hits.push(h); take(h.path, "search"); });
    });
    tokens.paths.forEach(function (p) {
      const t = traceDeps(p);
      deps.push(t);
      (t.importers || []).forEach(function (ip) { take(ip, "dep"); });
    });

    if (!Object.keys(selected).length) {
      ["/index.html", "/package.json", "/scripts/app.js", "/styles/app.css"].forEach(function (p) {
        take(p, "entrypoint");
      });
    }

    let arch = "";
    try {
      const Sov = window.Engine && window.Engine.Sovereign;
      if (Sov && Sov.read) {
        const md = Sov.read("architecture.md");
        if (typeof md === "string" && md) arch = md.slice(0, 1500);
      }
    } catch (_) {}

    const files = Object.keys(selected).map(function (k) { return selected[k]; })
      .sort(function (a, b) { return a.rank - b.rank; })
      .slice(0, 6)
      .map(function (f) {
        return { path: f.path, content: f.content, bytes: f.bytes, reason: f.reason };
      });

    return {
      structure: structure,
      tokens: tokens,
      locate: unique(locate).slice(0, 24),
      hits: hits.slice(0, 40),
      symbols: symbols.slice(0, 20),
      refs: refs.slice(0, 20),
      deps: deps.slice(0, 8),
      files: files,
      architecture: arch,
      skippedDump: false
    };
  }

  function formatExplore(ctx) {
    if (!ctx || ctx.skippedDump) return "";
    const lines = [];
    lines.push("REPO EXPLORE (selected files only — do not assume you have the whole repository).");
    if (ctx.structure) {
      lines.push("Project structure (" + ctx.structure.fileCount + " files):\n- " + (ctx.structure.paths || []).slice(0, 40).join("\n- "));
    }
    if (ctx.architecture) lines.push("Architecture notes:\n" + ctx.architecture);
    if (ctx.locate && ctx.locate.length) lines.push("Locate:\n- " + ctx.locate.join("\n- "));
    if (ctx.hits && ctx.hits.length) {
      lines.push("Search matches:\n" + ctx.hits.slice(0, 20).map(function (h) {
        return "- " + h.path + ":" + h.line + "  " + String(h.text || "").trim();
      }).join("\n"));
    }
    if (ctx.symbols && ctx.symbols.length) {
      lines.push("Implementations:\n" + ctx.symbols.slice(0, 12).map(function (s) {
        return "- " + s.name + " (" + s.kind + ") in " + s.path;
      }).join("\n"));
    }
    if (ctx.refs && ctx.refs.length) {
      lines.push("Callers / references:\n" + ctx.refs.slice(0, 12).map(function (h) {
        return "- " + h.path + (h.line ? (":" + h.line) : "") + (h.text ? ("  " + String(h.text).trim()) : "");
      }).join("\n"));
    }
    if (ctx.deps && ctx.deps.length) {
      lines.push("Dependency trace:\n" + ctx.deps.map(function (d) {
        return "- " + d.path + " imports " + (d.packages || []).join(", ") +
          (d.importers && d.importers.length ? ("; imported by " + d.importers.join(", ")) : "");
      }).join("\n"));
    }
    if (ctx.files && ctx.files.length) {
      lines.push("Why these files: " + ctx.files.map(function (f) { return f.path + " (" + f.reason + ")"; }).join(", "));
    }
    return lines.join("\n\n");
  }

  function scanDeps() {
    const FS = window.Engine && window.Engine.FS;
    let pkg = {};
    try { pkg = JSON.parse((FS && FS.read && FS.read("/package.json")) || "{}") || {}; } catch (_) { pkg = {}; }
    const declared = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
    const used = {};
    snapshotWorkspace().forEach(function (f) {
      if (!/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(f.path || "")) return;
      extractExternalImports(f.content).forEach(function (n) { used[n] = true; });
    });
    const missing = Object.keys(used).filter(function (n) { return !declared[n]; });
    const DR = (window.Engine && window.Engine.DependencyResolver) || window.DependencyResolver;
    const install = missing.map(function (n) {
      const r = DR && DR.resolve ? DR.resolve(n) : { resolved: false, importName: n };
      return { name: n, install: (r && r.install) || ("npm install " + n), resolved: !!(r && r.resolved) };
    });
    return { declared: Object.keys(declared), used: Object.keys(used), missing: missing, install: install };
  }

  function observeRuntime(writtenFiles) {
    const scope = writtenFiles && writtenFiles.length ? writtenFiles : snapshotWorkspace();
    const issues = [];
    function pushIssue(i) {
      if (!i) return;
      const row = {
        severity: i.severity || "warning",
        file: i.file || (i.issue && i.issue.file) || "",
        message: i.message || i.why || (i.issue && i.issue.message) || i.kind || "",
        kind: i.kind,
        faultClass: i.faultClass
      };
      if (!row.message) return;
      issues.push(row);
    }
    try {
      issuesForFiles(scope, window.Engine.Validator.runAll()).forEach(pushIssue);
    } catch (_) {}
    try {
      const MD = (window.Engine && window.Engine.MockDetect) || window.MockDetect;
      if (MD && MD.run) {
        (MD.run() || []).forEach(function (m) {
          pushIssue({ severity: m.severity || "warning", file: m.file, message: m.why || m.kind, kind: m.kind });
        });
      }
    } catch (_) {}
    try {
      const UI = (window.Engine && window.Engine.UnresolvedInspector) || window.UnresolvedInspector;
      if (UI && UI.collect) {
        (UI.collect() || []).forEach(function (x) {
          const it = x.issue || x;
          pushIssue({
            severity: it.severity || "warning",
            file: it.file || x.file,
            message: it.message || x.message,
            kind: it.kind || x.kind,
            faultClass: x.faultClass || it.faultClass
          });
        });
      }
    } catch (_) {}
    const scoped = issuesForFiles(scope, issues);
    let capture = null;
    try {
      if (window.Engine.Preview && window.Engine.Preview.capture) capture = window.Engine.Preview.capture();
    } catch (_) {}
    return { issues: scoped, capture: capture };
  }

  function evaluateBuild(files, observation, quality) {
    const obs = observation || { issues: [], capture: null };
    const scored = quality || scoreBuild(files, obs.issues);
    const judged = {
      score: scored.score,
      pass: scored.pass,
      errors: scored.errors,
      warnings: scored.warnings,
      files: scored.files,
      htmlLen: scored.htmlLen,
      cssLen: scored.cssLen,
      reasons: (scored.reasons || []).slice()
    };
    const p1 = (obs.issues || []).filter(function (i) {
      const sev = String(i.severity || "").toLowerCase();
      const cls = String(i.faultClass || i.kind || "");
      return sev === "error" || sev === "p1" || /sec\.secret|db\.connect|throw-placeholder|hardcoded-auth|rt\.timeout/.test(cls);
    });
    if (p1.length) {
      judged.pass = false;
      judged.reasons = judged.reasons.concat(p1.slice(0, 6).map(function (i) {
        return (i.file || "") + ": " + (i.message || i.kind || "p1");
      }));
    }
    const vis = (obs.capture && obs.capture.inspect && obs.capture.inspect.issues) || [];
    if (vis.length) {
      judged.reasons = judged.reasons.concat(vis);
      if ((obs.capture.inspect && obs.capture.inspect.missingAltCount) || /placeholder notepad/i.test(vis.join(" "))) {
        judged.pass = false;
      }
    }
    return { quality: judged, p1: p1.length, issues: obs.issues || [], capture: obs.capture || null };
  }

  function formatRag(intent, repo, deps, observation, opts) {
    intent = intent || classifyIntent("");
    opts = opts || {};
    const followUp = !!opts.followUp;
    const lines = [];
    const fresh = !followUp && (intent.mode === "generate" || intent.mode === "repo");
    const hasObs = !!(observation && ((observation.issues && observation.issues.length) || observation.capture));
    lines.push("AI BRAIN ROUTE: mode=" + intent.mode + " engines=" + (intent.engines || []).join(",") + " (" + intent.reason + ").");
    if (fresh && !hasObs) {
      lines.push("NEW APP: replace leftover starter/template files. Do not patch the seeded project. Return a complete new product.");
    } else if (fresh && hasObs) {
      lines.push("Improve the app you just generated. Do not revert to the starter template. Do not ignore observed errors.");
    } else {
      lines.push("Decide, then patch the EXISTING app. Do not ignore observed errors. Do not start a different product.");
    }
    if (intent.remotes && intent.remotes.length) {
      lines.push("Referenced GitHub/HF URLs (work from the workspace; do not invent a clone):\n- " + intent.remotes.join("\n- "));
    }
    if (!fresh && repo && repo.fileCount) {
      lines.push("Repository scan: " + repo.fileCount + " files.\n- " + (repo.paths || []).slice(0, 24).join("\n- "));
      if (repo.memory && repo.memory.length) lines.push("Memory hits:\n- " + repo.memory.join("\n- "));
    }
    if ((!fresh || hasObs) && deps && deps.missing && deps.missing.length) {
      lines.push("Missing dependencies — install strategy:\n" + deps.install.map(function (p) {
        return "- " + p.name + " → " + p.install;
      }).join("\n"));
      lines.push("Do not fake node_modules. Add the package to package.json or replace the import with in-app code.");
    }
    if (observation && observation.issues && observation.issues.length) {
      lines.push("Observed issues after run:\n" + observation.issues.slice(0, 20).map(function (i) {
        return "- [" + (i.severity || "info") + "] " + (i.file || "") + ": " + (i.message || "");
      }).join("\n"));
    }
    const previewBlk = observation && observation.capture ? formatCapture(observation.capture) : "";
    if (previewBlk) lines.push("Live preview snapshot of the built app:\n" + previewBlk);
    return lines.join("\n\n");
  }

  // Renders the shared Contract/AppSpec (see patchAgent()'s round loop) into
  // the same kind of context block formatRag() builds, so the model plans
  // against structured, machine-checkable requirements instead of only the
  // free-text prompt. Mirrors what Engine.Scaffold.specFromContract() reads
  // on the offline path (entities, requirement statements, acceptance
  // criteria) without duplicating that path's full-repo scaffolding.
  function formatContract(contract) {
    if (!contract) return "";
    const ents = (contract.entities || []).map(function (e) {
      const fields = (e.fields || []).map(function (f) { return typeof f === "string" ? f : (f && f.name) || ""; }).filter(Boolean);
      return e.name + (fields.length ? " (" + fields.join(", ") + ")" : "");
    });
    const reqs = (contract.requirements || []).slice(0, 20).map(function (r) {
      const crit = (r.acceptanceCriteria || []).map(function (c) { return typeof c === "string" ? c : (c && c.check) || ""; }).filter(Boolean);
      return "- " + (r.id ? r.id + ": " : "") + (r.statement || "") + (crit.length ? " [" + crit.slice(0, 2).join("; ") + "]" : "");
    });
    if (!ents.length && !reqs.length) return "";
    const lines = ["PRODUCT CONTRACT (derived from the prompt — build to satisfy these requirements, not just the literal wording):"];
    if (ents.length) lines.push("Entities: " + ents.join(", "));
    if (reqs.length) lines.push("Requirements:\n" + reqs.join("\n"));
    return lines.join("\n");
  }

  // ---- Task-graph decomposition for the connected-LLM path ----
  // Applies Engine.Orchestrator's real Build Graph -> Executor -> Observer
  // -> Validator -> Repair system to a substantial, fresh, connected-LLM
  // build — Backend generates first, then Frontend generates SECOND with
  // the backend's actual already-written code as ground truth (via
  // dependsOn), so the two integrate against real endpoints instead of two
  // independent guesses that have to be reconciled after the fact. Applied
  // unconditionally once the gates below are met (not scaled back for a
  // slow model) — a deliberate product decision, not an oversight.
  function llmTaskFilesBlock(paths, maxChars) {
    const FS = window.Engine && window.Engine.FS;
    if (!FS) return "";
    const list = (paths && paths.length) ? paths : Object.keys(FS._data || {}).filter(function (p) { return FS.isFile(p); });
    return list.map(function (p) {
      const c = FS.read(p) || "";
      return "FILE: " + p + "\n```\n" + c.slice(0, maxChars || 4000) + "\n```";
    }).join("\n\n");
  }

  // The end-to-end gate, shared by T-integration and the repair loop: reads
  // Engine.DoD's own per-criterion booleans (never a 4th "is it done" score).
  function integrationVerified() {
    const dod = window.Engine.DoD && window.Engine.DoD.load();
    if (!dod || !dod.criteria) return false;
    return !!dod.criteria.dependenciesConnected && !!dod.criteria.runtimeActionSucceeds;
  }

  // Confirmed from Ollama's own timings on a CPU-only machine (~3-11 prompt
  // tokens/s): a repair prompt carrying the WHOLE app was 2,679 tokens and was
  // killed at the 10-minute limit before the model had even finished READING
  // it (2,034 tokens in). Send the files the evidence implicates — plus
  // package.json and the server entry — and only NAME the rest.
  function repairFilesBlock(appPaths, evidence) {
    const FS = window.Engine && window.Engine.FS;
    const ev = String(evidence || "");
    const has = function (p) { return appPaths.indexOf(p) >= 0; };
    const want = [];
    const add = function (p) { if (p && has(p) && want.indexOf(p) < 0) want.push(p); };
    add("/package.json");
    let entry = "/server.js";
    try {
      const pkg = JSON.parse((FS && FS.read("/package.json")) || "{}");
      const m = /\bnode\s+(\S+\.js)\b/.exec((pkg.scripts && pkg.scripts.start) || "");
      if (m) entry = normalizePath(m[1].replace(/^\.\//, ""));
    } catch (_) { /* invalid package.json is itself in the evidence */ }
    add(entry);
    appPaths.forEach(function (p) {
      const base = p.split("/").pop();
      if (base && ev.indexOf(base) >= 0) add(p);
    });
    if (/interactive controls|console error|HTTP 4\d\d|could not be loaded/i.test(ev)) { add("/index.html"); add("/public/index.html"); }
    if (/`npm test` failed/.test(ev)) appPaths.filter(function (p) { return /^\/tests?\//.test(p); }).forEach(add);
    const BUDGET = 9000;
    const shown = [];
    let used = 0;
    want.forEach(function (p) {
      const len = ((FS && FS.read(p)) || "").length;
      if (shown.length && used + len > BUDGET) return;
      shown.push(p);
      used += len;
    });
    const others = appPaths.filter(function (p) { return shown.indexOf(p) < 0; });
    return "\n\nTHE FILES THE EVIDENCE IMPLICATES:\n\n" + llmTaskFilesBlock(shown, 6000) +
      (others.length ? "\n\nOther files in the app (not shown — leave them alone unless the evidence requires a change): " + others.join(", ") : "");
  }

  // Confirmed live: `npm test` crashed on `SyntaxError: Unexpected token
  // 'delete'` (a function named `delete`) — a one-line fix — but a blind
  // 800-char tail kept only stack frames and cut off the error itself, so
  // the repair model "fixed" package.json instead. Errors come FIRST in
  // Node's output; stack frames and ANSI colour codes are pure noise.
  // An uncaught error / crash in a server's output (not a log line that merely
  // mentions "error", e.g. "GET /api/errors").
  const SERVER_ERROR_RE = /^\s*(?:\w*Error(?::|\s*\[|\s*$)|Uncaught\b|UnhandledPromiseRejection|\[server process exited with code [1-9])|\bE(?:ADDRINUSE|ACCES|CONNREFUSED)\b|Cannot find module/m;

  function summarizeCommandOutput(raw) {
    const lines = String(raw || "")
      .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
      .split(/\r?\n/)
      .filter(function (l) { return !/^\s+at\s/.test(l) && !/^Node\.js v\d/.test(l); });
    const seen = {};
    const kept = lines.filter(function (l) {
      const k = l.trim();
      if (!k) return false;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    const text = kept.join("\n");
    if (text.length <= 1600) return text;
    return text.slice(0, 1200) + "\n…\n" + text.slice(-400);
  }

  function sovRead(p) {
    const Sov = window.Engine && window.Engine.Sovereign;
    try { const v = Sov && Sov.read(p); return typeof v === "string" ? JSON.parse(v) : v; } catch (_) { return null; }
  }
  // How far along the app is, by the run's own evidence: failing DoD checks,
  // and tests passing (parsed from the real `npm test` output). Confirmed
  // live: repair round 1 took the generated app's tests from 0/6 to 5/6,
  // then round 2 — fixing the last assertion — rewrote the whole test file
  // and fell back to 0/6, and that worse version is what the build kept.
  function repairProgress(since) {
    const dod = window.Engine.DoD && window.Engine.DoD.load();
    const crit = (dod && dod.criteria) || {};
    const failing = Object.keys(crit).filter(function (k) { return crit[k] === false; }).length;
    let testsPassed = null, testsRun = null;
    const ev = sovRead("execution-evidence.json");
    const s = ev && ev.steps && ev.steps.test;
    if (s && !s.skipped && (!since || !ev.generatedAt || ev.generatedAt >= since)) {
      const tail = String(s.tail || "").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
      const m = /ℹ pass (\d+)/.exec(tail) || /(\d+) passing/.exec(tail) || /Tests:.*?(\d+) passed/.exec(tail);
      if (m) testsPassed = Number(m[1]);
      const n = /ℹ tests (\d+)/.exec(tail);
      if (n) testsRun = Number(n[1]);
    }
    return { failing: failing, testsPassed: testsPassed, testsRun: testsRun };
  }
  function repairWorse(after, before) {
    if (after.failing !== before.failing) return after.failing > before.failing;
    if (after.testsPassed != null && before.testsPassed != null && after.testsPassed !== before.testsPassed) return after.testsPassed < before.testsPassed;
    // Tie-break on how many tests even ran. Live run 2026-09-29: a repair
    // swapped JSON-file storage for sequelize+sqlite (driver missing), so the
    // test file crashed on require — 4 tests running became 1 failed file,
    // yet failing checks (5) and passing tests (0) were unchanged, so the
    // regression was kept instead of rolled back.
    return after.testsRun != null && before.testsRun != null && after.testsRun < before.testsRun;
  }
  function describeProgress(p) {
    return p.failing + " check" + (p.failing === 1 ? "" : "s") + " failing" + (p.testsPassed != null ? ", " + p.testsPassed + " test" + (p.testsPassed === 1 ? "" : "s") + " passing" : "");
  }

  // What the automated run actually saw, phrased for the model: failing
  // checks, real command output, and what the runtime observer found.
  // `since` drops artifacts left over from an EARLIER round — observe()
  // only writes runtime-trace.json on success, so a failed round would
  // otherwise leave the previous round's trace looking current.
  function integrationEvidence(since) {
    const Sov = window.Engine && window.Engine.Sovereign;
    const read = function (p) {
      try { const v = Sov && Sov.read(p); return typeof v === "string" ? JSON.parse(v) : v; } catch (_) { return null; }
    };
    const fresh = function (at) { return !since || !at || at >= since; };
    const lines = [];
    const dod = window.Engine.DoD && window.Engine.DoD.load();
    const crit = (dod && dod.criteria) || {};
    const failing = Object.keys(crit).filter(function (k) { return crit[k] === false; });
    if (failing.length) lines.push("Failing checks: " + failing.join(", ") + ".");
    const ev = read("execution-evidence.json");
    if (ev && ev.steps && fresh(ev.generatedAt)) {
      Object.keys(ev.steps).forEach(function (k) {
        const s = ev.steps[k];
        if (!s || s.pass || s.skipped) return;
        // A timed-out run used to read as just "exit -2". Live run 2026-09-29:
        // one failing test skipped its server.close(), the test process never
        // exited, and the model couldn't tell why the run "failed".
        const hung = s.timedOut || s.code === -2;
        lines.push("`npm " + k + "` " + (hung
          ? "did not finish — it was stopped after the time limit. Usually a test (or the code it imports) leaves a server, socket or timer open, so the process never exits: close every server a test starts in a finally block or an after() hook, even when an assertion fails, and never call listen() on import"
          : "failed (exit " + s.code + ")") + ". Output (stack frames removed):\n" + summarizeCommandOutput(s.tail));
      });
    }
    // A package.json that doesn't parse silently turns the app into a
    // "static site" for every later check — say so first, it's the root cause.
    try {
      const FS = window.Engine && window.Engine.FS;
      const pkgRaw = FS && FS.exists && FS.exists("/package.json") ? FS.read("/package.json") : null;
      if (pkgRaw != null) JSON.parse(pkgRaw);
    } catch (e) {
      lines.push("/package.json is NOT valid JSON (" + String((e && e.message) || e) + ") — so no dependencies were installed, `npm test` and `npm start` could not run, and the app was treated as a static site. Rewrite /package.json as raw JSON only.");
    }
    const rt = read("runtime-trace.json");
    let failure = null;
    if (rt && fresh(rt.at) && !((failure = read("runtime-failure.json")) && failure.at > rt.at)) {
      const how = rt.serverStartedByUs === false
        ? "did NOT start the app itself — it found an already-running server at "
        : "started the app with `npm start` and loaded ";
      lines.push("Runtime check: the verifier " + how + (rt.url || rt.serverUrl || "http://localhost:3000/") + (rt.title ? " (page title: \"" + rt.title + "\")" : "") + ", found " + (rt.controlsFound || 0) + " interactive controls and exercised " + (rt.controlsExercised || 0) + ".");
      if (!rt.controlsFound) {
        lines.push("The page served at that URL has NO interactive controls — usually the server isn't serving index.html at / at all (it returns a 404 page). Make the server serve the static frontend files from the project root (e.g. app.use(express.static(__dirname))) and make sure index.html itself contains the forms and buttons.");
      }
      // Confirmed live: the observer clicked all 6 buttons and every one was
      // MOCK (no request, no page change) — but the evidence only said
      // "found 6, exercised 6", so the repair model never learned the UI
      // wasn't wired up. Name them.
      const dead = (rt.trace || []).filter(function (x) { return x && (x.status === "MOCK" || x.status === "BROKEN"); });
      if (dead.length) {
        lines.push("Controls that did NOT work when clicked (MOCK = no network request and no page change; BROKEN = threw an error): " +
          dead.slice(0, 12).map(function (x) {
            const name = (x.control && (x.control.name || x.control.tag)) || "?";
            return "\"" + name + "\" " + x.status + (x.status === "BROKEN" && x.threw ? " (" + String(x.threw).slice(0, 120) + ")" : "");
          }).join(", ") +
          ". Wire each one in the client JS: a click/submit handler that calls the matching backend endpoint with fetch and updates the page with the result.");
      }
      (rt.consoleErrors || []).slice(0, 5).forEach(function (e) { lines.push("Browser console error: " + summarizeCommandOutput((e && (e.text || e.message)) || e).slice(0, 300)); });
      (rt.network || []).filter(function (n) { return n && n.status >= 400; }).slice(0, 5).forEach(function (n) { lines.push("HTTP " + n.status + " for " + (n.method || "GET") + " " + n.url); });
      if (SERVER_ERROR_RE.test(rt.serverLog || "")) {
        lines.push("The server printed errors while the page was being used (`npm start` output):\n" + summarizeCommandOutput(rt.serverLog));
      }
    } else if ((failure = read("runtime-failure.json")) && failure.at && fresh(failure.at)) {
      // Live 2026-10-02: the page loaded, then the server crashed on its first
      // API call — and the model was told it "may crash on startup".
      lines.push("Runtime check: the verifier could not finish observing the app at http://localhost:3000/: " + String(failure.reason || "unknown error").slice(0, 300) + ".");
      if (failure.serverLog && failure.serverLog.trim()) {
        lines.push("Output of `npm start` (the server) — fix the error it shows:\n" + summarizeCommandOutput(failure.serverLog));
      } else {
        lines.push("The server printed nothing — check that `npm start` runs the server and that it listens on process.env.PORT || 3000.");
      }
    } else {
      lines.push("Runtime check: the app could not be loaded at http://localhost:3000/ at all — `npm start` may crash on startup (e.g. a require() of a package missing from package.json, or a syntax error), or the server isn't listening on process.env.PORT || 3000.");
    }
    return lines.join("\n");
  }

  // Standard OpenAI-compatible function tool: given to the model so a
  // tool-calling-capable provider (Ollama's OpenAI-compat endpoint supports
  // this for tool-trained models, including llama3.1) returns structured,
  // schema-constrained JSON arguments instead of free text the model has to
  // format correctly on its own. Confirmed live: even a small, correctly-
  // sized prompt sometimes gets llama3.1:8b to ignore the FILE:/fence text
  // convention and answer in its own prose+**filename** style instead —
  // genuine model non-determinism in following a TEXT instruction, which
  // tool-calling sidesteps because the provider's own decoding constrains
  // the shape, not just the prompt asking nicely for it.
  const WRITE_FILE_TOOL = {
    name: "write_file",
    description: "Write one complete source file to the project. Call this once per file — call it multiple times to write multiple files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, e.g. /server.js" },
        content: { type: "string", description: "The COMPLETE, EXACT file content — nothing paraphrased or omitted." }
      },
      required: ["path", "content"]
    }
  };

  // Tool calling is a conversation, not one shot: confirmed live, llama3.1:8b
  // emits ONE write_file call and stops (finish_reason: tool_calls) waiting
  // for the result — the standard contract. Same shape as opencode's session
  // runner: execute each call, feed a role:"tool" result back, call again,
  // until the model answers without tool calls. Bounded by turn count and by
  // "no progress" turns so it can never spin forever.
  const MAX_TOOL_TURNS = 8;

  // Confirmed live: when llama3.1 emits more than one tool call, Ollama
  // sometimes parses only the FIRST into tool_calls and leaves the rest as
  // raw text in `content`, in llama3.1's native shape
  //   {"name": "write_file", "parameters": {"path": ..., "content": ...}}
  // — a correct /package.json was lost exactly this way. Recover them by
  // scanning the text for balanced top-level JSON objects of that shape.
  function textualToolCalls(text) {
    const src = String(text || "");
    const found = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === "\"") inStr = false;
        continue;
      }
      if (ch === "\"") { if (depth > 0) inStr = true; continue; }
      if (ch === "{") { if (depth === 0) start = i; depth++; }
      else if (ch === "}") {
        if (depth === 0) continue; // stray closer from a truncated prefix
        depth--;
        if (depth === 0 && start >= 0) {
          let obj = null;
          try { obj = JSON.parse(src.slice(start, i + 1)); } catch (_) { obj = null; }
          const args = obj && (obj.parameters || obj.arguments);
          if (obj && typeof obj.name === "string" && args && typeof args === "object") {
            found.push({ name: obj.name, arguments: JSON.stringify(args) });
          }
          start = -1;
        }
      }
    }
    return found;
  }

  var SAVED_STUB_RE = /^\s*\[saved: \d+ chars\]\s*$/;
  function stubArguments(argsJson) {
    let a = null;
    try { a = JSON.parse(argsJson); } catch (_) { return argsJson; }
    if (!a || typeof a.content !== "string") return argsJson;
    return JSON.stringify(Object.assign({}, a, { content: "[saved: " + a.content.length + " chars]" }));
  }

  function assistantText(res) {
    const m = res && res.raw && res.raw.choices && res.raw.choices[0] && res.raw.choices[0].message;
    if (m) return typeof m.content === "string" ? m.content : "";
    return String((res && res.content) || "");
  }

  // "message (line:col)" when `content` of a .js/.cjs/.mjs file fails to parse
  // as either a script or a module; null otherwise (including when acorn isn't
  // loaded, or the file uses JSX — acorn can't parse that and it's not an error).
  function jsSyntaxError(p, content) {
    if (!/\.(c|m)?js$/i.test(String(p || ""))) return null;
    const acorn = window.acorn || (window.Engine && window.Engine.acorn);
    if (!acorn || typeof acorn.parse !== "function") return null;
    const src = String(content || "");
    if (/(return|=>|=)\s*\(?\s*<[A-Za-z][\w.:-]*[\s/>]/.test(src)) return null; // JSX
    const opts = { ecmaVersion: "latest", allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true };
    try { acorn.parse(src, Object.assign({ sourceType: "script" }, opts)); return null; } catch (scriptErr) {
      try { acorn.parse(src, Object.assign({ sourceType: "module" }, opts)); return null; } catch (moduleErr) {
        const e = /\b(import|export)\b/.test(src) ? moduleErr : scriptErr;
        return String((e && e.message) || e);
      }
    }
  }

  function llmTaskComplete(userPrompt, systemPrompt, runState, protectedPaths) {
    // Files earlier stages already wrote. Confirmed live: asked for TESTS
    // ONLY, llama3.1:8b's first tool call rewrote the /server.js it was
    // shown as context. Rejecting that write WITH a reason in the tool
    // result lets the model correct itself on the next turn, instead of
    // silently clobbering the real backend with a restated copy.
    const protectedSet = {};
    (protectedPaths || []).forEach(function (p) { protectedSet[normalizePath(p)] = true; });
    const isProtected = function (p) { return !!protectedSet[normalizePath(p)]; };
    // json:false — the prompt asks for FILE: + fenced-code-block output
    // (the format small/local models produce reliably, no JSON-string
    // escaping of full file contents required). Without this, a provider
    // with supportsJson:true (e.g. "OpenAI-compatible", which is what
    // Ollama's own OpenAI-compat endpoint reports as) forces
    // response_format:json_object at the API level, which fights the
    // prompt directly — the model gets grammar-constrained into pure JSON
    // regardless of what was asked for, which is exactly the harder,
    // more failure-prone format for embedding full source files.
    //
    // openClawTimeoutMs / timeoutMs are deliberately different budgets.
    // Confirmed live: routing a task-graph stage through OpenClaw (its own
    // ~12K-token agent-runtime system prompt on top of an already-slow
    // local model, and these stages' prompts are themselves large —
    // Frontend/Tests also carry the prior stage's real files as context)
    // can blow past a single shared 5-minute budget with nothing left over
    // for the Direct fallback that would have succeeded quickly. Giving
    // OpenClaw a short, bounded leash (3 min) means a doomed attempt fails
    // fast and hands off to Direct's much longer budget (10 min) — and
    // since complete() remembers the fallback for the rest of this run
    // (runState.forceBackend), only the FIRST stage to hit this ever pays
    // the OpenClaw tax; every later stage goes straight to Direct.
    function attempt() {
      const history = [{ role: "user", content: String(userPrompt || "").trim() }];
      const written = {};
      const order = [];
      const jsRejected = {}; // path -> refused once for a syntax error
      let lastRes = null;
      let stalls = 0;

      function handleCall(c) {
        if (c.name !== "write_file") return { message: "Unknown tool " + c.name + " — only write_file is available." };
        let args = null;
        try { args = JSON.parse(c.arguments); } catch (_) { args = null; }
        if (!args || typeof args.path !== "string" || typeof args.content !== "string" || !args.path.trim()) {
          return { message: "Rejected: arguments must be a JSON object with string \"path\" and \"content\". Call write_file again with both." };
        }
        const p = normalizePath(args.path.trim().replace(/^\.\//, ""));
        if (isProtected(p)) {
          return { message: "Rejected: " + p + " was already written by an earlier stage and must not be rewritten here. Write only this stage's own NEW files." };
        }
        // Confirmed live: llama3.1:8b put the text-fallback heading INSIDE
        // the tool's content — package.json began with "FILE: /package.json"
        // — which made it unparseable, so the whole app was treated as a
        // static site: no npm install, `npm test` skipped-as-passing, and the
        // observer crawled an unrelated server. Strip an echoed heading for
        // this same path and a wrapping code fence, then refuse JSON that
        // still doesn't parse, telling the model exactly why.
        let content = args.content;
        if (SAVED_STUB_RE.test(content)) {
          return { message: "Rejected: \"" + content.slice(0, 40) + "\" is a placeholder for a file that was already saved, not file content. Call write_file with the file's COMPLETE real content." };
        }
        const head = /^\s*(?:FILE|Path)\s*[:\-]\s*`?([^\s`]+)`?[ \t]*\r?\n/i.exec(content);
        if (head && normalizePath(head[1]) === p) content = content.slice(head[0].length);
        if (/^\s*```/.test(content)) content = stripFence(content, p);
        if (/\.json$/i.test(p)) {
          try { JSON.parse(content); } catch (e) {
            return { message: "Rejected: " + p + " is not valid JSON (" + String((e && e.message) || e) + "). Call write_file again with ONLY the raw JSON as content — no FILE: heading, no code fences, no comments." };
          }
        }
        // Same for JavaScript that doesn't parse. Live run 2026-09-29: the
        // backend stage wrote `const todo = { title, done, dueDate);` and was
        // marked done; the SyntaxError only surfaced 12 minutes later in
        // `npm test`, costing a whole repair round. Refuse ONCE per file with
        // the exact error so the model fixes it in the same turn; a second
        // broken attempt is written anyway (never lose the file) with the
        // error noted. JSX isn't plain JS — leave those files alone.
        let jsNote = "";
        const syntaxErr = jsSyntaxError(p, content);
        if (syntaxErr) {
          if (!jsRejected[p]) {
            jsRejected[p] = true;
            return { message: "Rejected: " + p + " has a JavaScript syntax error — " + syntaxErr + ". Call write_file again with the COMPLETE corrected file." };
          }
          jsNote = " Note: it still has a syntax error (" + syntaxErr + ") — it will fail when run.";
        }
        if (written[p] === content) return { message: p + " is already written with this exact content — no change." };
        const isNew = !Object.prototype.hasOwnProperty.call(written, p);
        if (isNew) order.push(p);
        written[p] = content;
        return {
          progressed: isNew,
          message: "Wrote " + p + (jsNote ? "." + jsNote : " successfully.") + " Call write_file again for any remaining files this stage needs; once every file is written, reply with a one-line summary and no tool calls."
        };
      }

      function finish() {
        // The final answer can still carry FILE:/fence blocks — confirmed
        // live: llama3.1:8b wrote 5 files via tool calls, then put
        // /package.json in its closing TEXT reply. And a model/provider that
        // never used tools at all (or OpenClaw, which never gets opts.tools)
        // answers entirely in text. Either way, take NEW, unprotected paths
        // only — a text restatement must never overwrite a file the tool
        // already wrote.
        const parsed = extractFilesFromText(assistantText(lastRes));
        (parsed ? parsed.files : []).forEach(function (f) {
          if (isProtected(f.path) || Object.prototype.hasOwnProperty.call(written, f.path)) return;
          order.push(f.path);
          written[f.path] = f.content;
        });
        if (!order.length) throw new Error("no usable file plan came back for this stage");
        return order.map(function (p) { return { path: p, content: written[p] }; });
      }

      function turn(n) {
        // Live run 2026-10-01: a thinking model on LM Studio (~1-2 tok/s on
        // CPU) was still writing server.js when the 10-minute limit cut the
        // connection, so the backend stage ended with only package.json. A
        // local model gets 30 minutes per request; cloud keeps 10.
        const localModel = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(String((getConfig() || {}).baseUrl || ""));
        return complete(userPrompt, null, {
          system: systemPrompt, runState: runState, json: false,
          openClawTimeoutMs: 180000, timeoutMs: localModel ? 1800000 : 600000,
          allowPartial: true, // keep complete files if the time limit cuts the answer
          tools: runState && runState.toolsUnsupported ? undefined : [WRITE_FILE_TOOL],
          messages: history
        }).then(onResponse, function (err) {
          // Confirmed live: Tests' SECOND turn hit the 10-minute timeout
          // after its first turn had already written a real test file — and
          // the thrown error discarded that file along with the whole stage.
          // A follow-up turn failing must not erase earlier progress; only a
          // first-turn failure propagates (the OpenClaw->Direct fallback and
          // honest error reporting depend on it).
          if (n > 0 && order.length) return finish();
          throw err;
        });

        function onResponse(res) {
          lastRes = res;
          // Only look for textual calls when tools were actually offered —
          // otherwise a plain JSON answer is just a JSON answer.
          const textual = (runState && runState.toolsUnsupported) ? [] : textualToolCalls(assistantText(res));
          const calls = (res.toolCalls || []).concat(textual).map(function (c, i) {
            return { id: c.id || ("call_" + n + "_" + i), name: c.name, arguments: c.arguments };
          });
          if (!calls.length) return finish();
          // Confirmed from Ollama's own timings: re-sending every file the
          // model already wrote (as tool-call arguments) cost a full re-read
          // each turn — 1,755 prompt tokens re-evaluated at ~4.7 tok/s, 6+
          // minutes, before a single new token. The file is saved; the model
          // only needs to know THAT it was written, so history keeps a short
          // placeholder (and handleCall rejects the placeholder if imitated).
          history.push({
            role: "assistant",
            // recovered textual calls live in `content`; they're represented
            // by tool_calls now, so don't carry their file bodies twice
            content: textual.length ? "" : assistantText(res),
            tool_calls: calls.map(function (c) { return { id: c.id, type: "function", function: { name: c.name, arguments: stubArguments(c.arguments) } }; })
          });
          let progressed = false;
          calls.forEach(function (c) {
            const r = handleCall(c);
            if (r.progressed) progressed = true;
            history.push({ role: "tool", tool_call_id: c.id, content: r.message });
          });
          // The answer was cut at the time limit: keep what was salvaged and
          // end the stage rather than start another equally long turn (the
          // backend stage then asks only for files that are still missing).
          if (res.partial) return finish();
          // A rejected write gets ONE chance to self-correct; two turns in a
          // row with nothing new written means the model is looping.
          stalls = progressed ? 0 : stalls + 1;
          if (n + 1 >= MAX_TOOL_TURNS || stalls >= 2) return finish();
          return turn(n + 1);
        }
      }

      return turn(0);
    }
    // Orchestrator's own retry-on-failure ("cycles") never applies here —
    // it's skipped entirely for deferProof:true tasks (the task-graph's
    // default), so without this a single bad response permanently fails
    // the stage. Confirmed live: with a small, well-formed prompt (the
    // context-scoping fix above already ruled out overflow), llama3.1:8b
    // still sometimes ignores the FILE:/fence instruction and falls back to
    // its own prose + **filename** convention — genuine model
    // non-determinism, not a deterministic defect a prompt tweak fixes.
    // Retrying ONLY on this specific parse failure (not on network/timeout
    // errors, which the OpenClaw->Direct fallback above already handles)
    // costs one extra call and doesn't weaken what counts as success — a
    // retry still has to produce a genuinely parseable, non-empty plan.
    return attempt().catch(function (err) {
      if (!/no usable file plan/.test(String((err && err.message) || err))) throw err;
      return attempt();
    });
  }

  // Small/local models reliably struggle to hand-escape full multi-line
  // file content as a single JSON string (every newline/quote/backslash
  // has to come out perfectly, or the whole response is unparseable) —
  // confirmed live: llama3.1:8b failed to produce usable JSON under an
  // earlier, JSON-only version of this prompt. Hence the write_file tool
  // first, the FILE: + fenced-code-block text format as the fallback, and
  // strict JSON only as a last resort. A short worked example matters more
  // than a format description for a small model — show, don't just tell.
  // Shared by every stage AND the repair loop, so they can't drift apart.
  function taskGraphBaseRules(contract) {
    return [
      "You are CodeSovereign's coding agent, building ONE stage of a larger app.",
      "Write production-quality, fully working source files. No placeholders, no TODOs, no pseudo-code.",
      "You have a write_file tool — call it once per file (call it multiple times for multiple files) with the COMPLETE, EXACT file content. Prefer the tool when it's available to you.",
      "If you cannot use tools, output EACH file as a heading line 'FILE: /path/to/file' immediately followed by a fenced code block containing the COMPLETE, EXACT file content — nothing paraphrased, nothing omitted. Do not write any other prose before, between, or after the file blocks — no greeting, no explanation, no summary.",
      "Example of the exact fallback text format (follow this shape precisely, using YOUR real files instead):",
      "FILE: /server.js\n```javascript\nconst http = require('http');\nconst server = http.createServer((req, res) => { res.end('ok'); });\nif (require.main === module) server.listen(process.env.PORT || 3000);\nmodule.exports = server;\n```",
      "FILE: /package.json\n```json\n{\n  \"name\": \"app\",\n  \"version\": \"1.0.0\",\n  \"scripts\": { \"start\": \"node server.js\", \"test\": \"node --test\" }\n}\n```",
      "(If you strongly prefer JSON instead, a single object { \"summary\": \"...\", \"files\": [ { \"path\": \"/...\", \"content\": \"...\" } ] } is also accepted — but the write_file tool or the FILE:/code-block format above are preferred and more reliable.)",
      formatContract(contract)
    ].filter(Boolean).join("\n\n");
  }

  // Small local models reliably ignore "start the app inside the test": they
  // require('../server') — which only listens under require.main — and then
  // fetch http://localhost:3000, so every test dies with ECONNREFUSED (live
  // run 2026-09-29: 0/4 passing, the backend itself was fine). When a test
  // file does exactly that, prepend node:test before/after hooks that start
  // the exported app on a FREE port, and wrap fetch so requests to the port
  // the test hard-coded go there instead. Rewriting at request time (not in
  // the source) also covers URLs captured in constants at load time; a free
  // port avoids colliding with the app instance the runtime check already
  // started on that same port (seen live: EADDRINUSE :3000).
  function harnessServerTests(file) {
    if (!file || typeof file.content !== "string" || !/^\/?test\/.+\.test\.[cm]?js$/.test(String(file.path || ""))) return file;
    const src = file.content;
    if (/__csServer|\.listen\s*\(/.test(src)) return file; // already starts a server itself
    const ports = [];
    src.replace(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/g, function (_, p) { if (ports.indexOf(p) < 0) ports.push(p); return _; });
    if (ports.length !== 1) return file;
    const m = /require\(\s*(['"])(\.\.?\/[^'"]*)\1\s*\)/.exec(src);
    const serverReq = m ? m[2] : "../server";
    const pre = [
      "// Added by CodeSovereign: start the app for these HTTP tests (the test",
      "// imported it but never started it) and stop it when they finish.",
      "const { before: __csBefore, after: __csAfter } = require('node:test');",
      "let __csServer = null;",
      "const __csFetch = globalThis.fetch;",
      "globalThis.fetch = (input, init) => {",
      "  const port = __csServer && __csServer.address && __csServer.address() && __csServer.address().port;",
      "  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : null);",
      "  if (port && url) input = url.replace(/^(https?:[/][/])(localhost|127[.]0[.]0[.]1):" + ports[0] + "(?=[/?#]|$)/, '$1127.0.0.1:' + port);",
      "  return __csFetch(input, init);",
      "};",
      "__csBefore(() => new Promise((resolve, reject) => {",
      "  const mod = require(" + JSON.stringify(serverReq) + ");",
      "  const target = [mod, mod && mod.app, mod && mod.server].find((x) => x && typeof x.listen === 'function');",
      "  if (!target) return reject(new Error(" + JSON.stringify(serverReq) + " + ' exports nothing with .listen()'));",
      "  __csServer = target.listen(0, resolve);",
      "  if (__csServer && __csServer.once) __csServer.once('error', reject);",
      "}));",
      "__csAfter(() => new Promise((resolve) => (__csServer && __csServer.close ? __csServer.close(() => resolve()) : resolve())));",
      ""
    ].join("\n");
    return Object.assign({}, file, { content: pre + src });
  }

  // "/server.js" from a written package.json whose start script is
  // `node <file>`; null when there is no such script (static sites, other runners).
  function startEntryOf(files) {
    const pkg = (files || []).find(function (f) { return /(^|\/)package\.json$/.test(String(f.path || "")) && !/node_modules/.test(f.path); });
    if (!pkg) return null;
    let start = "";
    try { start = String(((JSON.parse(pkg.content) || {}).scripts || {}).start || ""); } catch (_) { return null; }
    const m = /^\s*node\s+(?:--[\w-]+(?:=\S+)?\s+)*([^\s&|;]+\.(?:c|m)?js)\b/.exec(start);
    return m ? normalizePath("/" + m[1].replace(/^\.?\//, "")) : null;
  }

  // Local modules the written JS files require() but nobody wrote. Live run
  // 2026-10-01 (Qwen): server.js required './app' and './db/schema', neither
  // existed, and the backend stage still counted as done. Resolves each
  // './x' / '../x' spec against the requiring file's folder, accepting
  // x, x.js, x.json and x/index.js. Returns paths like "/app.js".
  function missingLocalModules(files) {
    const have = {};
    (files || []).forEach(function (f) { have[normalizePath(f.path)] = true; });
    const missing = [];
    (files || []).forEach(function (f) {
      const p = normalizePath(f.path);
      if (!/\.(c|m)?js$/.test(p)) return;
      const dir = p.slice(0, p.lastIndexOf("/") + 1) || "/";
      const re = /\brequire\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(String(f.content || "")))) {
        const parts = (dir + m[1]).split("/");
        const out = [];
        parts.forEach(function (seg) { if (seg === "..") out.pop(); else if (seg && seg !== ".") out.push(seg); });
        const base = "/" + out.join("/");
        const candidates = [base, base + ".js", base + ".json", base + "/index.js"];
        if (!candidates.some(function (c) { return have[c]; })) {
          const want = /\.(c|m)?js(on)?$/.test(base) ? base : base + ".js";
          if (missing.indexOf(want) < 0) missing.push(want);
        }
      }
    });
    return missing;
  }

  // Local scripts/stylesheets the written HTML loads but nobody wrote. Live
  // run 2026-10-02 (Qwen): the frontend was cut at the time limit inside
  // /client.js; index.html and styles.css were kept, the page loaded a
  // script that didn't exist, and the stage still said "generated".
  // `exists(path)` lets the caller count files from other stages too.
  function missingPageAssets(files, exists) {
    const have = {};
    (files || []).forEach(function (f) { have[normalizePath(f.path)] = true; });
    const missing = [];
    (files || []).forEach(function (f) {
      const p = normalizePath(f.path);
      if (!/\.html?$/.test(p)) return;
      const dir = p.slice(0, p.lastIndexOf("/") + 1) || "/";
      const src = String(f.content || "");
      const refs = [];
      let m;
      const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
      while ((m = scriptRe.exec(src))) refs.push(m[1]);
      const linkRe = /<link\b[^>]*>/gi;
      while ((m = linkRe.exec(src))) {
        if (!/\brel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
        const h = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
        if (h) refs.push(h[1]);
      }
      refs.forEach(function (ref) {
        if (/^([a-z][\w+.-]*:|\/\/|#|data:)/i.test(ref)) return; // external / inline
        const clean = ref.split(/[?#]/)[0];
        if (!clean) return;
        const parts = (clean.charAt(0) === "/" ? clean : dir + clean).split("/");
        const out = [];
        parts.forEach(function (seg) { if (seg === "..") out.pop(); else if (seg && seg !== ".") out.push(seg); });
        const want = "/" + out.join("/");
        if (have[want] || (exists && exists(want))) return;
        if (missing.indexOf(want) < 0) missing.push(want);
      });
    });
    return missing;
  }

  function buildLLMTaskGraph(prompt, contract, runState) {
    const st = contract.supportedStack || {};
    const entityNames = (contract.entities || []).map(function (e) { return e.name; }).join(", ") || "the app's data";
    const baseRules = taskGraphBaseRules(contract);

    // Each generation stage tracks its OWN real success signal — "did this
    // stage's LLM call actually produce a usable file plan" — rather than
    // reading the shared/global DoD state. Using the global DoD.PASS here
    // would be wrong two ways at once: a task could be skipped as
    // "already met" before it ever ran (if DoD happens to read permissive
    // before this stage contributed anything), or reported FAILED for a
    // reason that has nothing to do with this specific stage (e.g. an
    // accessibility finding failing T-backend). Only T-integration, which
    // genuinely checks the whole assembled app, reads the real DoD state.
    const tasks = [];
    let backendDone = false;
    let backendEntry = null; // "/server.js" etc. — what package.json's start script runs
    let frontendDone = false;
    let testsDone = false;
    // llmTaskFilesBlock() with NO paths falls back to "every file in the
    // workspace" — fine for a fresh acceptance fixture, but a real desktop
    // session's FS also holds hundreds of .sovereign/*, delivery/*, CI/CD,
    // and docs files from Contract/Sovereign bookkeeping, none of which the
    // model needs to see. Confirmed live: that fallback ballooned Frontend's
    // context to 176 files / 200K+ chars, which Ollama's default context
    // window then silently truncated — losing the actual FILE:/fence
    // formatting instructions along with the (irrelevant) file dump, so the
    // model fell back to its natural prose+markdown style instead. Tracking
    // exactly what THIS stage actually wrote keeps later stages' context
    // scoped to the real, relevant app files only.
    let backendPaths = [];
    let frontendPaths = [];
    tasks.push({
      id: "T-backend",
      name: "Backend: " + entityNames + (st.auth ? " + auth" : "") + (st.jobs ? " + jobs" : ""),
      dependsOn: [],
      generate: function () {
        // Every requirement below exists because the runtime verifier (not
        // just a reviewer) must be able to run the result. Confirmed live:
        // llama3.1:8b reached for mongoose (no MongoDB server exists here),
        // and omitted a package.json "start" script — the observer can only
        // launch an app via dev/start/serve and loads port 3000 by default.
        const sys = baseRules + "\n\nYOUR JOB — BACKEND ONLY: build a real server exposing REST endpoints for every entity above, with REAL persistence that actually reads and writes — never mocked or hard-coded return values.\n" +
          "HARD REQUIREMENTS (the app is started automatically with only `npm install && npm start`, so these are not optional):\n" +
          "- Unless the user explicitly named a database, persist to a JSON file using Node's built-in fs. Do NOT use MongoDB, mongoose, Postgres, MySQL, Redis, or any database server — none is running.\n" +
          "- Write /package.json listing EVERY package you require(), with \"scripts\": { \"start\": \"node server.js\", \"test\": \"node --test\" }. Never list Node built-ins (fs, path, http, crypto, url, os, events) as dependencies — they are not npm packages.\n" +
          "- The server listens on process.env.PORT || 3000, ONLY when run directly: `if (require.main === module) app.listen(...)`, and `module.exports = app` so tests can import it without starting a second server.\n" +
          "- The server also serves the static frontend files (index.html, .css, .js) from the project root, so one `npm start` runs the whole app.\n" +
          "Do NOT output any frontend HTML/CSS/client JS.";
        return llmTaskComplete("Build the backend for: " + prompt, sys, runState).then(function (files) {
          files = files || [];
          // The stage can end with the server entry missing — a later turn
          // timed out mid-file and the turns already written were kept (live:
          // only package.json). Ask once more for exactly that file.
          const entry = startEntryOf(files);
          const has = function (p) { return files.some(function (f) { return normalizePath(f.path) === p; }); };
          // Missing: the start-script entry, plus any local module a written
          // file require()s that was never written.
          let missing = (entry && !has(entry)) ? [entry] : [];
          missingLocalModules(files).forEach(function (p) { if (missing.indexOf(p) < 0) missing.push(p); });
          if (missing.length) {
            return llmTaskComplete(
              "Write ONLY these missing backend files: " + missing.join(", ") + ". " +
              (entry && missing.indexOf(entry) >= 0 ? entry + " is the server entry point that /package.json's start script runs. " : "") +
              "Other files already require() them, but they were never written (the previous attempt was cut off). Keep their exports consistent with how the existing files use them.\n\nEXISTING BACKEND FILES:\n\n" +
              // From this stage's own output — it isn't in Engine.FS until the stage returns.
              files.filter(function (f) { return /\.(c|m)?js(on)?$/.test(String(f.path)); }).map(function (f) { return "FILE: " + f.path + "\n```\n" + String(f.content || "").slice(0, 4000) + "\n```"; }).join("\n\n") +
              "\n\nBuild the backend for: " + prompt,
              sys, runState, files.map(function (f) { return f.path; })
            ).then(function (more) { return files.concat(more || []); }, function () { return files; });
          }
          return files;
        }).then(function (files) {
          backendEntry = startEntryOf(files);
          backendDone = true;
          backendPaths = (files || []).map(function (f) { return f.path; });
          return files;
        });
      },
      // Done only when the file `npm start` runs actually exists — a stage
      // that wrote just package.json used to report "generated".
      check: function () {
        if (!backendDone) return false;
        const FSx = window.Engine && window.Engine.FS;
        if (!FSx || !FSx.exists) return true;
        if (backendEntry && !FSx.exists(backendEntry)) return false;
        // ...and nothing a backend file require()s locally is missing (resolved
        // against everything in the project, so modules from any stage count).
        const all = Object.keys(FSx._data || {}).filter(function (p) { return FSx.isFile(p) && !/node_modules|^\/\.sovereign\//.test(p); })
          .map(function (p) { return { path: p, content: FSx.read(p) || "" }; });
        const mine = all.filter(function (f) { return backendPaths.indexOf(f.path) >= 0; });
        const others = all.filter(function (f) { return backendPaths.indexOf(f.path) < 0; }).map(function (f) { return { path: f.path, content: "" }; });
        return missingLocalModules(mine.concat(others)).length === 0;
      }
    });
    tasks.push({
      id: "T-frontend",
      name: "Frontend: UI for " + entityNames,
      dependsOn: ["T-backend"],
      generate: function () {
        // Confirmed live: the page shipped as empty <div>s filled by script,
        // and with no data yet the runtime observer found 0 controls to
        // exercise — nothing it could verify as actually working.
        const sys = baseRules + "\n\nYOUR JOB — FRONTEND ONLY: build index.html, styles, and client-side JS. The backend below ALREADY EXISTS and is real — call its actual endpoints exactly as written; do not invent different routes. Ship a distinctive, polished, dark-themed UI with real interactivity, no 'Simple Notepad' placeholders.\n" +
          "The page must be usable from an EMPTY start: put real <form>s, <input>s and <button>s for creating, listing and deleting every entity directly in index.html (not only rendered after data loads), and wire each one to the matching endpoint.\n" +
          // Live 2026-10-02 (Qwen on CPU): one ~29k-character index.html with
          // inline CSS+JS took longer than the 30-minute request limit; cut
          // mid-file, nothing could be kept and the stage started over. Three
          // smaller files finish sooner, and a cut keeps the completed ones.
          "Write THREE separate files, each with its own write_file call, in this order: /index.html (markup only, with <link rel=\"stylesheet\" href=\"/styles.css\"> and <script src=\"/app.js\"></script>), then /styles.css, then /app.js (all client-side JS). Do not inline the CSS or JS in index.html.\n\nCURRENT BACKEND FILES:\n\n" + llmTaskFilesBlock(backendPaths);
        const FSx = window.Engine && window.Engine.FS;
        const onDisk = function (p) { return !!(FSx && FSx.exists && FSx.exists(p)); };
        return llmTaskComplete("Build the frontend for: " + prompt, sys, runState, backendPaths).then(function (files) {
          files = files || [];
          // A cut answer can keep index.html but lose a file it loads — ask
          // once more for exactly those files.
          const missing = missingPageAssets(files, onDisk);
          if (missing.length) {
            return llmTaskComplete(
              "Write ONLY these missing frontend files: " + missing.join(", ") + ". " +
              "index.html already loads them, but they were never written (the previous attempt was cut off). Wire every form and button in the existing index.html below to the backend endpoints.\n\nEXISTING FRONTEND FILES:\n\n" +
              files.filter(function (f) { return /\.(html?|js)$/.test(String(f.path)); }).map(function (f) { return "FILE: " + f.path + "\n```\n" + String(f.content || "").slice(0, 6000) + "\n```"; }).join("\n\n") +
              "\n\nBuild the frontend for: " + prompt,
              sys, runState, backendPaths.concat(files.map(function (f) { return f.path; }))
            ).then(function (more) { return files.concat(more || []); }, function () { return files; });
          }
          return files;
        }).then(function (files) {
          frontendDone = true;
          frontendPaths = (files || []).map(function (f) { return f.path; });
          return files;
        });
      },
      // Done only when every local script/stylesheet the page loads exists.
      check: function () {
        if (!frontendDone) return false;
        const FSx = window.Engine && window.Engine.FS;
        if (!FSx || !FSx.exists) return true;
        const mine = frontendPaths.filter(function (p) { return FSx.exists(p); }).map(function (p) { return { path: p, content: FSx.read(p) || "" }; });
        return missingPageAssets(mine, function (p) { return FSx.exists(p); }).length === 0;
      }
    });
    tasks.push({
      id: "T-tests",
      name: "Tests for " + entityNames,
      dependsOn: ["T-backend", "T-frontend"],
      maxCycles: 1,
      generate: function () {
        // Confirmed live: the tests used chai + supertest + mocha (none
        // installed), required './server' from inside test/ (wrong path),
        // and there was no "test" script — which this stage can't add, since
        // package.json belongs to the backend stage and is protected.
        const sys = baseRules + "\n\nYOUR JOB — TESTS ONLY: write real automated tests against the ACTUAL files below — test real behavior, not placeholders. They run with `npm test` (= `node --test`), so:\n" +
          "- Use ONLY Node built-ins: `const test = require('node:test'); const assert = require('node:assert');` and the global fetch. Do NOT use jest, mocha, chai, supertest, or any other package — none is installed for tests.\n" +
          "- Put test files in /test/ named *.test.js, and import the app with `require('../server')` (one level up from /test/).\n" +
          "- For HTTP tests, start the imported app on a free port inside the test (`const server = app.listen(0)`, read `server.address().port`), call it with fetch, and `server.close()` when done — otherwise the test process never exits.\n\nCURRENT APP FILES:\n\n" + llmTaskFilesBlock(backendPaths.concat(frontendPaths));
        return llmTaskComplete("Write tests for: " + prompt, sys, runState, backendPaths.concat(frontendPaths)).then(function (files) { testsDone = true; return (files || []).map(harnessServerTests); });
      },
      check: function () { return testsDone; }
    });
    tasks.push({
      id: "T-integration",
      name: "Integration: frontend/backend wired end-to-end",
      // The new tests are wanted first but not required: without them the
      // end-to-end check still runs the app (and the backend's own tests).
      dependsOn: ["T-frontend"],
      runsAfter: ["T-tests"],
      // A pure-verification task needs SOME generator or resolveGenerator()
      // marks it BLOCKED before check() ever runs — and BLOCKED must not
      // be mistaken for success by the caller below.
      generate: function () { return []; },
      check: integrationVerified
    });
    return tasks;
  }

  function runSelectedEngines(intent, steps, onStep) {
    const out = { repo: null, deps: null };
    (intent.engines || []).forEach(function (eng) {
      if (eng === "repo") {
        out.repo = scanRepo();
        const s = {
          kind: "repo",
          text: "Repository scan: " + out.repo.fileCount + " file(s)" +
            (intent.remotes && intent.remotes.length ? "; refs " + intent.remotes.join(", ") : "")
        };
        steps.push(s);
        onStep && onStep(s);
      } else if (eng === "deps") {
        out.deps = scanDeps();
        const s = {
          kind: "deps",
          text: out.deps.missing.length
            ? ("Install strategy: " + out.deps.install.map(function (p) { return p.install; }).join("; "))
            : "No missing packages"
        };
        steps.push(s);
        onStep && onStep(s);
      }
    });
    return out;
  }

  async function patchIssues(issues, capture) {
    if (!llmAvailable()) return { ok: false, skipped: true, reason: "llm-disabled" };
    const list = issues || [];
    if (!list.length) return { ok: true, skipped: true, files: [] };
    const files = snapshotWorkspace();
    const issueBlk = list.slice(0, 24).map(function (i) {
      const msg = i.message || (i.issue && i.issue.message) || i.why || "";
      const file = i.file || (i.issue && i.issue.file) || "";
      return "- [" + (i.severity || "info") + "] " + file + ": " + msg;
    }).join("\n");
    const fileBlk = files.slice(0, 10).map(function (f) {
      return "FILE: " + f.path + "\n```\n" + String(f.content || "").slice(0, 3500) + "\n```";
    }).join("\n\n");
    const previewBlk = formatCapture(capture);
    const prompt = [
      "Fix these issues in the existing app. Return a JSON file plan with the patched files.",
      "Issues:\n" + issueBlk,
      previewBlk ? ("Live preview snapshot:\n" + previewBlk) : "",
      "Current files:\n" + fileBlk,
      "Keep the same product. Patch only what is broken. No placeholders, no hardcoded secrets, real alt text, real timeouts."
    ].filter(Boolean).join("\n\n");
    const res = await complete(prompt, specContext(), {
      system: "You patch an existing web app. Reply with JSON {summary, files:[{path,content}]}. Production quality. No markdown outside JSON.",
      temperature: 0.2,
      maxTokens: 8192,
      json: true
    });
    const parsed = extractFilesFromText(res.content);
    if (!parsed || !parsed.files.length) return { ok: false, reason: "no-files" };
    const FS = window.Engine && window.Engine.FS;
    parsed.files.forEach(function (f) {
      if (FS && f.path) FS.write(f.path, stripFence(f.content, f.path));
    });
    return { ok: true, files: parsed.files, summary: parsed.summary || "" };
  }

  async function smartLoop(opts) {
    opts = opts || {};
    const steps = [];
    const UI = (window.Engine && window.Engine.UnresolvedInspector) || window.UnresolvedInspector;
    const MD = (window.Engine && window.Engine.MockDetect) || window.MockDetect;
    function push(kind, text, extra) {
      const s = Object.assign({ kind: kind, text: text }, extra || {});
      steps.push(s);
      return s;
    }
    push("inspect", "Inspecting workspace (validator + mocks + unresolved)…");
    let issues = opts.issues;
    if (!issues) {
      issues = [];
      try { if (UI && UI.collect) issues = issues.concat(UI.collect()); } catch (_) {}
      try { if (MD && MD.run) issues = issues.concat(MD.run()); } catch (_) {}
    }
    push("plan", "Planning auto-workarounds for " + issues.length + " finding(s)…");
    let auto = { patched: [], remaining: issues };
    try {
      if (opts.kind === "mocks" && MD && MD.fix) auto = MD.fix();
      else if (UI && UI.autoFixAll) auto = UI.autoFixAll(UI.inspectAll(issues));
    } catch (e) {
      push("error", "Auto-workaround failed: " + (e && e.message || e));
    }
    push("patch", "Applied " + ((auto.patched && auto.patched.length) || 0) + " auto-workaround(s)");
    const files = snapshotWorkspace();
    let observation = observeRuntime(files);
    if (observation.capture) {
      const vis = (observation.capture.inspect && observation.capture.inspect.issues) || [];
      push("screenshot", "Preview snapshot: " + ((observation.capture.inspect && observation.capture.inspect.title) || "untitled") + (vis.length ? " — " + vis.join("; ") : " — UI looks wired"), { capture: observation.capture });
    }
    let remaining = (auto.remaining && auto.remaining.length) ? auto.remaining : (observation.issues || []);
    let llm = { skipped: true };
    if (remaining.length && llmAvailable() && opts.llm !== false) {
      push("llm", "LLM refine on remaining issues + preview snapshot…");
      try {
        llm = await patchIssues(remaining, observation.capture);
        if (llm && llm.ok) push("llm-result", "LLM patched " + ((llm.files && llm.files.length) || 0) + " file(s)");
        else push("llm-result", "LLM skipped or returned no files");
      } catch (e) {
        llm = { ok: false, error: e && e.message || String(e) };
        push("error", "LLM refine failed: " + llm.error);
      }
      observation = observeRuntime(snapshotWorkspace());
      remaining = observation.issues || remaining;
    }
    const judged = evaluateBuild(snapshotWorkspace(), observation);
    push("evaluate", "Brain evaluated: quality " + judged.quality.score + (judged.quality.pass ? " pass" : " — repair/retry") + (judged.p1 ? ", " + judged.p1 + " P1" : ""));
    return { steps: steps, patched: auto.patched || [], remaining: remaining, capture: observation.capture, llm: llm, quality: judged.quality };
  }

  async function sequentialGenerate(prompt, specCtx, onChunk, runState) {
    const listSystem = "You plan file lists for web apps. Reply with JSON only.";
    const listPrompt = "App to build:\n" + String(prompt || "") +
      "\n\nReply with JSON only: {\"summary\":\"...\",\"paths\":[\"/index.html\",\"/styles/app.css\",\"/scripts/app.js\"]}. Include every file the UI needs. No prose.";
    const listing = await complete(listPrompt, specCtx, { system: listSystem, temperature: 0.2, maxTokens: 1024, json: true, runState: runState });
    let paths = ["/index.html", "/styles/app.css", "/scripts/app.js"];
    let summary = "";
    const parsed = extractJson(listing.content);
    if (parsed) {
      summary = String(parsed.summary || "");
      const listed = parsed.paths || parsed.files;
      if (Array.isArray(listed) && listed.length) {
        paths = listed.map(function (item) {
          if (typeof item === "string") return normalizePath(item);
          if (item && typeof item.path === "string") return normalizePath(item.path);
          return "";
        }).filter(Boolean);
      }
    }
    if (!paths.some(function (p) { return /index\.html$/i.test(p); })) paths.unshift("/index.html");
    paths = paths.slice(0, 8);
    const targets = [];
    const fileSystem = "You write a single complete source file. Output only that file. Production-quality UI. No placeholders.";
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      onChunk && onChunk({ kind: "plan", text: "Generating " + path + " (" + (i + 1) + "/" + paths.length + ")…" });
      const filePrompt = "Build this app:\n" + String(prompt || "") +
        "\n\nWrite the COMPLETE contents of " + path + " only. Polished UI, no 'Simple Notepad', no starter template. Optional markdown fence.";
      const res = await complete(filePrompt, specCtx, { system: fileSystem, temperature: 0.35, maxTokens: 8192, json: false, runState: runState });
      targets.push({ path: path, content: stripFence(res.content, path) });
    }
    return {
      summary: summary || ("Generated " + targets.length + " file(s) sequentially"),
      targets: targets,
      source: "llm-sequential",
      model: listing.model || ""
    };
  }

  function writeTargets(targets, steps, onStep) {
    const FS = window.Engine.FS;
    return new Promise(function (resolve) {
      let i = 0;
      const apply = function () {
        if (i >= targets.length) return resolve();
        const t = targets[i++];
        steps.push({ kind: "write", path: t.path, text: "Writing " + t.path });
        onStep && onStep(steps[steps.length - 1]);
        try { FS.write(t.path, t.content); } catch (_) {}
        setTimeout(apply, 40);
      };
      apply();
    });
  }

  // ----- Connection test -----
  async function testConnection() {
    const cfg = liveConfig();
    if (!isConfigured(cfg)) return { ok: false, error: "Not configured — pick a provider (key optional for OmniRoute / local)." };
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
      const res = await httpText(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        // A connectivity probe must fail fast even though a real generation
        // call (chat()/complete(), below) needs minutes — decouple this from
        // aihost.js's own default rather than inheriting whatever that is.
        timeoutMs: 20000
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
      if (!res.ok && res.status === 401 && provider.id === "omniroute") {
        // Some OmniRoute deployments truly need no key; an instance that has
        // been set up with real provider connections (the common case once
        // you have used it before) requires one for its HTTP API even though
        // `auto` itself is free. The dashboard issues one in a couple of clicks.
        out.hint = "This OmniRoute server requires an API key for its HTTP API. Open " + provider.baseUrl + "/dashboard, generate a free key, and paste it above.";
      } else if (!res.ok && res.status === 401 && isLocalEndpoint(provider, cfg)) {
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
    const ready = computeUseLLM(cfg, provider);
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

  // ----- Patch Engine.Agent.run: iterate until quality, never template-fallback -----
  function specContext() {
    try {
      if (window.S && window.S.univ && window.S.univ.state) {
        const bs = window.S.univ.state;
        return {
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
    return null;
  }

  async function generatePlan(prompt, proj, ctx, extraUser, onStep, steps, allowSequential) {
    try {
      return await llmPlan(prompt, proj, ctx, extraUser);
    } catch (err) {
      if (!allowSequential || isTransportError(err) || !isPlanParseError(err)) throw err;
      steps.push({ kind: "plan", text: "JSON plan failed (" + (err && err.message || err) + ") — generating files one at a time…" });
      onStep && onStep(steps[steps.length - 1]);
      const seqPrompt = extraUser ? (String(prompt) + "\n\n" + extraUser) : prompt;
      return await sequentialGenerate(seqPrompt, ctx, function (s) {
        steps.push(s);
        onStep && onStep(s);
      });
    }
  }

  function patchAgent() {
    if (!window.Engine || !window.Engine.Agent) return false;
    const Agent = window.Engine.Agent;
    if (Agent.__llmPatched) return true;

    const originalRun = Agent.run.bind(Agent);

    Agent.run = function (prompt, onStep) {
      const cfg = liveConfig();
      const provider = resolveProvider(cfg);
      const useLLM = computeUseLLM(cfg, provider);
      if (!useLLM) {
        return originalRun(prompt, onStep);
      }
      if (cfg.executionBackend === "openclaw") {
        // One OpenClaw session per Agent.run() call, so its own server-side
        // session memory persists across this run's multiple complete()
        // calls. Stashed on the persisted config (not threaded through
        // llmDecide/llmPlan's signatures) — completeViaOpenClaw reads it
        // back via liveConfig() the same way every other complete() call
        // already reads cfg fresh each time.
        setConfig({ openclawSessionKey: "cs-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
      }
      const steps = [];
      const proj = window.Engine.Proj.current();
      if (!proj) {
        steps.push({ kind: "error", text: "No active project. Create one first." });
        onStep && onStep(steps[steps.length - 1]);
        return Promise.resolve(steps);
      }
      let ctx = specContext() || {};
      const followUp = isFollowUp(prompt);
      const intent = classifyIntent(prompt);
      if (followUp) ctx = Object.assign({}, ctx, { followUp: true });
      ctx = Object.assign({}, ctx, { brainMode: intent.mode });

      return (async function () {
        let extraUser = null;
        let quality = { score: 0, pass: false, reasons: ["not generated"] };
        let lastErr = null;
        let wrote = false;
        // Shared AppSpec: the offline path (engine.js's base Agent.run) has
        // always derived a structured Contract (entities/requirements/
        // acceptanceCriteria) from the prompt before building; the LLM round
        // loop never did, so it planned from free prompt text alone with no
        // visibility into the same structured requirements an offline build
        // would have targeted. Deriving it here too — once, before the round
        // loop starts — means both code paths plan against the same AppSpec;
        // they remain two different intelligence providers (deterministic
        // template vs. model) feeding the same underlying spec, not two
        // separate application-building architectures.
        let contract = null;
        try {
          const C = window.Engine && window.Engine.Contract;
          if (C && C.deriveFromPrompt) contract = await C.deriveFromPrompt(prompt, { useLLM: false });
        } catch (_) { contract = null; }
        if (contract && ((contract.requirements && contract.requirements.length) || (contract.entities && contract.entities.length))) {
          steps.push({
            kind: "contract",
            text: "Contract: " + ((contract.requirements || []).length) + " requirements · " +
              (contract.entities || []).map(function (e) { return e.name; }).join(", "),
            requirements: (contract.requirements || []).length
          });
          onStep && onStep(steps[steps.length - 1]);
          // A genuine account of what's about to be attempted, built from the
          // real derived Contract — not the model narrating itself (that only
          // happens per-round below, and only for models that call tools).
          // This fires once, up front, for every fresh build.
          if (!followUp) {
            const stT = contract.supportedStack || {};
            // "quality"/"integrity"/"delivery" requirements are the same
            // boilerplate on every contract (tests pass, build succeeds,
            // lint clean, nothing mocked) — real per-app signal lives in
            // domain/functional/interaction categories. Prefer those; only
            // fall back to the generic ones if nothing else was derived.
            const allReqs = contract.requirements || [];
            const meaningful = allReqs.filter(function (r) { return ["domain", "functional", "interaction"].indexOf(r.category) >= 0; });
            const reqPool = meaningful.length ? meaningful : allReqs;
            const topReqs = reqPool.slice(0, 3).map(function (r) { return r.statement; }).filter(Boolean);
            const thinkText = "Planning to build " + (contract.entities || []).map(function (e) { return e.name; }).join(", ") +
              (stT.auth ? " with authentication" : "") + (stT.jobs ? " and background jobs" : "") +
              (topReqs.length ? ", covering: " + topReqs.join("; ") + (reqPool.length > 3 ? "…" : "") : "") + ".";
            steps.push({ kind: "thinking", text: thinkText });
            onStep && onStep(steps[steps.length - 1]);
          }
        }
        // Shared, in-memory, never-persisted across every complete() call in
        // THIS run only — see complete()'s own comment. A separate Agent.run()
        // call always starts fresh and tries the user's configured backend
        // again; this never mutates cfg.executionBackend.
        const runState = { forceBackend: null };

        // Route a substantial, FRESH build through Engine.Orchestrator's real
        // task graph — Backend -> Frontend -> Tests -> Integration check —
        // instead of one monolithic call regenerating the whole app every
        // refine round. Mirrors exactly how the offline path (engine.js)
        // already routes substantial builds through Orchestrator; applied
        // here unconditionally once these gates are met (not scaled back for
        // a slow/local model — a deliberate product decision). Still gated on
        // desktop: Orchestrator's reproof() needs a real npm test/build run
        // and a real runtime to observe, which cannot exist in a plain
        // browser tab or unit-test VM. Still skipped for follow-ups —
        // decomposing "add dark mode" into a Backend/Frontend/Tests graph
        // makes no sense; follow-ups keep editing the existing app directly
        // via the round loop below.
        const OR = window.Engine && window.Engine.Orchestrator;
        const desktopReadyLLM = !!(window.desktop && window.desktop.isDesktop && window.Engine.FS && window.Engine.FS.__hasWorkspace && window.Engine.FS.__hasWorkspace());
        const stSub = (contract && contract.supportedStack) || {};
        const entsSub = (contract && contract.entities) || [];
        const reqsSub = (contract && contract.requirements) || [];
        // A prompt that explicitly asks for a server side is a full-stack build
        // even with one entity. Live run 2026-09-29: "a todo list app … saved by
        // a Node.js backend" derived 1 entity + 7 requirements, missed the
        // thresholds below, went to the single-call round loop instead, and
        // the local model produced one index.html (quality 12) before Ollama
        // aborted on repeated tokens. supportedStack.backend is no signal here
        // — it defaults to "node" even for a pomodoro timer.
        const wantsServer = /\b(back-?end|server|node(\.js)?|express|rest(ful)?|api|database|db|sqlite|postgres(ql)?|mongo(db)?|mysql|crud)\b/i.test(String(prompt || ""));
        const substantialLLM = entsSub.length >= 2 || !!stSub.auth || !!stSub.jobs || reqsSub.length >= 8 || (entsSub.length >= 1 && wantsServer);
        if (!followUp && desktopReadyLLM && substantialLLM && contract && OR && OR.run) {
          let taskGraphTasks = null;
          try { taskGraphTasks = buildLLMTaskGraph(prompt, contract, runState); } catch (_) { taskGraphTasks = null; }
          if (taskGraphTasks && taskGraphTasks.length) {
            steps.push({
              kind: "plan-result",
              text: "Plan: build via task graph (" + taskGraphTasks.map(function (t) { return t.name; }).join(" → ") + ")",
              taskGraph: taskGraphTasks.map(function (t) { return { id: t.id, name: t.name }; })
            });
            onStep && onStep(steps[steps.length - 1]);
            steps.push({ kind: "validate", text: "Running the task graph — generate each stage, then build + test + observe…" });
            onStep && onStep(steps[steps.length - 1]);
            const writtenSoFarLLM = {};
            const runOpts = {
              tasks: taskGraphTasks,
              // Each stage is a real LLM call — Orchestrator's own
              // auto-detection would otherwise run a FULL reproof (real npm
              // test/build + a dev-server restart and crawl) after every
              // single stage, before the other stages even exist yet. Defer
              // to one shared batch pass once all stages are generated,
              // matching exactly how the offline path's Scaffold task
              // already runs — Integration's own check is what actually
              // verifies the finished app end-to-end.
              deferProof: true,
              onTaskStart: function (tr) {
                steps.push({ kind: "task-start", text: tr.name + ": generating…", taskId: tr.id, taskName: tr.name });
                onStep && onStep(steps[steps.length - 1]);
              },
              onTaskDone: function (tr) {
                let wroteAny = false;
                (tr.notes || []).forEach(function (n) {
                  const m = /^wrote (.+)$/.exec(n || "");
                  if (m) {
                    wroteAny = true;
                    if (!writtenSoFarLLM[m[1]]) {
                      writtenSoFarLLM[m[1]] = true;
                      steps.push({ kind: "write", path: m[1], text: "Writing " + m[1] });
                      onStep && onStep(steps[steps.length - 1]);
                    }
                  }
                });
                // GENERATED with zero files written means this stage's own
                // generate() actually failed (network/timeout/no usable
                // response) and Orchestrator's robustness catch swallowed it
                // into an empty file list rather than crashing the whole
                // run — that's correct for the run, but "generated —
                // verifying next" would misreport an attempt that never
                // produced anything. Say so honestly; the final batch check
                // will still correctly fail this task either way.
                const genErr = (tr.notes || []).find(function (n) { return /^generate failed/.test(n || ""); });
                const verb = tr.status === "COMPLETE" || tr.status === "ALREADY_MET" ? "verified"
                  : tr.status === "GENERATED" && !wroteAny && genErr ? "stage failed (" + genErr.replace(/^generate failed: /, "") + ") — will not verify"
                  : tr.status === "GENERATED" ? "generated — verifying next"
                  : tr.status === "FAILED" ? "did not verify"
                  : tr.status === "SKIPPED" ? ((tr.notes || []).filter(function (n) { return /^skipped/.test(n || ""); })[0] || "skipped")
                  : "blocked";
                steps.push({ kind: "task-done", text: tr.name + ": " + verb, taskId: tr.id, taskName: tr.name, status: tr.status });
                onStep && onStep(steps[steps.length - 1]);
              }
            };

            // Verify -> repair -> re-verify. Confirmed live: after every
            // pipeline fix, the build still failed end-to-end for a reason
            // the run itself had PROVEN (the observer loaded :3000 and found
            // 0 controls — the server never served index.html) — and then
            // simply stopped and reported it. Same shape as opencode's
            // session runner, which feeds real results back to the model
            // until it settles: hand the model the actual evidence, with
            // write access to the whole app, then run the real checks again.
            // Bounded, and a Stop press is honored between rounds.
            const MAX_REPAIR_ROUNDS = 2;
            const repairLoop = function (record, round) {
              const integ = (record.tasks || []).find(function (t2) { return t2.id === "T-integration"; });
              if (!integ || integ.status === "COMPLETE" || integ.status === "ALREADY_MET") return record;
              if (round > MAX_REPAIR_ROUNDS || (window.S && window.S.agentStopped)) return record;
              // Nothing was built (every stage failed or was skipped): there is
              // no app to repair, and a repair round can't rebuild it in one go.
              if (!(record.tasks || []).some(function (t2) { return !t2.genFailed && t2.status !== "SKIPPED" && (t2.notes || []).some(function (n) { return /^wrote /.test(n); }); })) return record;
              const appPaths = [];
              (record.tasks || []).forEach(function (t2) {
                (t2.notes || []).forEach(function (n) {
                  const m = /^wrote (.+)$/.exec(n || "");
                  if (m && appPaths.indexOf(m[1]) < 0) appPaths.push(m[1]);
                });
              });
              if (!appPaths.length) return record; // nothing was built — nothing to repair
              const evidence = integrationEvidence(record.startedAt);
              record.repairRounds = round;
              steps.push({ kind: "repair", text: "End-to-end check failed — repair round " + round + "/" + MAX_REPAIR_ROUNDS + ": sending what the run actually observed back to the model…", evidence: evidence });
              onStep && onStep(steps[steps.length - 1]);
              const repairSys = taskGraphBaseRules(contract) + "\n\nYOUR JOB — REPAIR. The app below was built, then automatically installed (`npm install`), tested (`npm test`) and started (`npm start`) — and it FAILED the end-to-end check. This is exactly what the automated run observed:\n\n" + evidence +
                "\n\nFix the real cause of every problem above. For each file you change, call write_file with its COMPLETE new content (the whole file, never a snippet or a diff). Leave files that are already correct alone. The fixed app must: start with only `npm install && npm start`; list every required package in /package.json; listen on process.env.PORT || 3000 only when run directly (`require.main === module`) and `module.exports = app`; serve the whole UI (index.html, CSS, JS) at http://localhost:3000/; and keep persistence as a JSON file written with Node's built-in fs unless the user explicitly named a database — do NOT switch to sequelize, sqlite, mongoose, prisma or any other database package to fix a bug (live run: a repair did, the driver was missing, and the app stopped loading at all)." +
                repairFilesBlock(appPaths, evidence);
              const FSx = window.Engine.FS;
              const before = repairProgress(record.startedAt);
              const snapshot = {};
              appPaths.forEach(function (p) { snapshot[p] = FSx.exists(p) ? FSx.read(p) : null; });
              const roundStart = Date.now();
              return OR.run({
                tasks: [{
                  id: "T-repair-" + round,
                  name: "Repair round " + round,
                  dependsOn: [],
                  generate: function () { return llmTaskComplete("Repair the app so it passes the end-to-end check: " + prompt, repairSys, runState).then(function (files) { return (files || []).map(harnessServerTests); }); },
                  check: integrationVerified
                }],
                deferProof: true,
                onTaskStart: runOpts.onTaskStart,
                onTaskDone: runOpts.onTaskDone
              }).then(function (rr) {
                const t = (rr.tasks || [])[0] || {};
                record.dodAfter = rr.dodAfter;
                record.startedAt = roundStart;
                if (t.status === "COMPLETE") {
                  (t.notes || []).forEach(function (n) { if (/^wrote /.test(n)) integ.notes.push(n); });
                  integ.status = "COMPLETE";
                  integ.notes.push("verified after repair round " + round);
                  return record;
                }
                const after = repairProgress(roundStart);
                if (repairWorse(after, before)) {
                  // Never keep a round that left the app worse than it found
                  // it: remove what it created, restore what it overwrote, and
                  // re-verify so the evidence matches the restored code.
                  const wrote = (t.notes || []).map(function (n) { return (/^wrote (.+)$/.exec(n || "") || [])[1]; }).filter(Boolean);
                  steps.push({ kind: "repair", text: "Repair round " + round + " made things worse (" + describeProgress(before) + " → " + describeProgress(after) + ") — rolling back its changes and re-verifying." });
                  onStep && onStep(steps[steps.length - 1]);
                  const rollbackStart = Date.now();
                  return OR.run({
                    tasks: [{
                      id: "T-rollback-" + round,
                      name: "Roll back repair round " + round,
                      dependsOn: [],
                      generate: function () {
                        wrote.forEach(function (p) {
                          const key = p.charAt(0) === "/" ? p : "/" + p;
                          if (snapshot[key] == null) { try { FSx.remove(key); } catch (_) {} }
                        });
                        return Object.keys(snapshot).filter(function (p) { return snapshot[p] != null; })
                          .map(function (p) { return { path: p, content: snapshot[p] }; });
                      },
                      check: integrationVerified
                    }],
                    deferProof: true,
                    onTaskStart: runOpts.onTaskStart,
                    onTaskDone: runOpts.onTaskDone
                  }).then(function (rb) {
                    record.dodAfter = rb.dodAfter;
                    record.startedAt = rollbackStart;
                    return repairLoop(record, round + 1);
                  });
                }
                // Carry the repair's writes forward so a later round (and the
                // final report) sees the files it changed — but NOT its
                // "generate failed" notes: Integration's failure reason is the
                // failing check, not the repair call.
                (t.notes || []).forEach(function (n) { if (/^wrote /.test(n)) integ.notes.push(n); });
                return repairLoop(record, round + 1);
              });
            };

            return OR.run(runOpts).then(function (record) {
              return repairLoop(record, 1);
            }).then(function (record) {
              if (record.repairRounds) {
                const ok = (record.tasks || []).filter(function (t2) { return t2.status === "COMPLETE" || t2.status === "ALREADY_MET"; }).length;
                record.summary = ok + "/" + record.tasks.length + " tasks satisfied · DoD " + (record.dodAfter && record.dodAfter.PASS ? "PASS" : "not yet") +
                  " · " + record.repairRounds + " repair round" + (record.repairRounds > 1 ? "s" : "");
              }
              steps.push({ kind: "validate-result", issues: [], dod: record.dodAfter });
              onStep && onStep(steps[steps.length - 1]);
              // BLOCKED (no generator could be resolved for a task) is just
              // as much "never actually verified" as FAILED — treating only
              // FAILED as failure would let a run report done while some
              // task silently never even ran.
              const failed = (record.tasks || []).filter(function (t2) { return t2.status === "FAILED" || t2.status === "BLOCKED" || t2.status === "SKIPPED"; });
              if (failed.length) {
                const reasons = failed.map(function (t2) {
                  const genErr = (t2.notes || []).find(function (n) { return /^generate failed/.test(n); });
                  return t2.name + (genErr ? " (" + genErr.replace(/^generate failed: /, "") + ")" : t2.status === "SKIPPED" ? " (skipped)" : "");
                }).join(", ");
                steps.push({ kind: "warn", text: "Built via task graph (" + record.summary + "), but " + reasons + " did not verify — see .sovereign/orchestrator-run.json." });
              } else {
                steps.push({ kind: "done", text: "Run complete (" + record.summary + ")." });
              }
              onStep && onStep(steps[steps.length - 1]);
              return steps;
            }).catch(function (e) {
              steps.push({ kind: "error", text: "Task-graph build failed: " + String((e && e.message) || e) });
              onStep && onStep(steps[steps.length - 1]);
              return steps;
            });
          }
        }
        // Guards a real failure mode found live: a small/local model can get
        // stuck repeatedly picking a tool call that keeps failing (e.g.
        // run_command outside the allowlist) without ever pivoting to
        // write_file — round after round, burning the full SAFETY_CAP
        // (48 rounds) without writing a single file. After a couple of
        // failed tool calls in a row, push a hard corrective instruction;
        // if it still hasn't recovered after a handful more, stop early
        // with an honest error instead of grinding out the rest of the cap.
        let consecutiveFailedTools = 0;
        const STUCK_NUDGE_AT = 2;
        const STUCK_ABORT_AT = 6;
        // A second, independent guard: STUCK_ABORT_AT bounds *round count*,
        // but a round's own wall-clock time isn't bounded by that — a
        // follow-up edit pulls in full file contents (up to ~6 files) on
        // top of the base system prompt, and on modest hardware prompt
        // processing alone can run for minutes per round. Round-counting
        // alone could still mean 20-30+ minutes of apparent silence before
        // ever giving up. Cap total wall-clock time with no progress
        // instead, so a too-slow setup fails honestly in a few minutes.
        const runStartedAt = Date.now();
        const TIME_BUDGET_MS = 360000;
        steps.push({
          kind: "route",
          text: "Brain: " + intent.mode + " via " + intent.engines.join(" + ") + " (" + intent.reason + ")"
        });
        onStep && onStep(steps[steps.length - 1]);
        if (window.Engine.ModelRouter && window.Engine.ModelRouter.select) {
          // The router only RECOMMENDS a model family; the request always goes
          // to the configured model. This step used to print just the
          // recommendation ("Model router: Qwen") while llama3.1:8b did the
          // work — name the model actually used.
          const pick = window.Engine.ModelRouter.select(prompt);
          const cfgNow = getConfig();
          const usingModel = cfgNow.model || cfgNow.providerId || "configured model";
          const sameFamily = String(usingModel).toLowerCase().indexOf(String(pick.family || "").toLowerCase()) >= 0;
          steps.push({
            kind: "model",
            text: "Model: " + usingModel + (sameFamily ? " (" + pick.reason + ")" : " · router would pick " + pick.label + " for this task (" + pick.reason + ") — not applied")
          });
          onStep && onStep(steps[steps.length - 1]);
        }
        const includeContents = followUp || intent.mode === "edit" || intent.mode === "repair" || intent.mode === "explore" || intent.mode === "deps";
        const explore = relevantContext(prompt, { followUp: followUp, includeContents: includeContents });
        steps.push({
          kind: "explore",
          text: explore.skippedDump
            ? "Repo explore: not dumping leftover starter files (new app)"
            : ("Repo explore: scanned " + ((explore.structure && explore.structure.fileCount) || 0) +
              " files, " + ((explore.hits && explore.hits.length) || 0) + " matches, " +
              ((explore.files && explore.files.length) || 0) + " files in context")
        });
        onStep && onStep(steps[steps.length - 1]);
        const engines = runSelectedEngines(intent, steps, onStep);
        if (window.Engine.Coordinator && window.Engine.Coordinator.shouldDelegate(prompt)) {
          const swarm = await window.Engine.Coordinator.run(prompt, {
            onStep: function (s) { steps.push(s); onStep && onStep(s); }
          });
          extraUser = (extraUser ? extraUser + "\n\n" : "") +
            "COORDINATOR RESULTS (coordinator did not write implementation):\n" +
            JSON.stringify({ ok: swarm.ok, agents: swarm.agents }).slice(0, 2000);
        }
        if (followUp) {
          const selected = (explore.files && explore.files.length) ? explore.files : snapshotWorkspace().slice(0, 6);
          const existingIssues = selected.length
            ? issuesForFiles(selected, window.Engine.Validator.runAll())
            : [];
          extraUser = buildFollowUpPrompt(prompt, selected, existingIssues, conversationHistory(prompt));
        }
        const exploreBlk = formatExplore(explore);
        extraUser = extraUser
          ? (extraUser + (exploreBlk ? "\n\n" + exploreBlk : "") + "\n\n" + formatRag(intent, null, followUp || intent.mode === "deps" ? engines.deps : null, null, { followUp: followUp }))
          : ((exploreBlk ? exploreBlk + "\n\n" : "") + formatRag(intent, null, followUp || intent.mode === "deps" ? engines.deps : null, null, { followUp: followUp }));
        const brainBlk = window.Engine.ProjectBrain && window.Engine.ProjectBrain.contextBlock
          ? window.Engine.ProjectBrain.contextBlock()
          : "";
        if (brainBlk) extraUser = extraUser + "\n\n" + brainBlk;
        // Only for a fresh build, not a follow-up edit — buildFollowUpPrompt
        // already frames edits around the existing app; re-deriving a
        // contract from a short edit instruction ("add dark mode") would add
        // noise, not structure.
        const contractBlk = !followUp ? formatContract(contract) : "";
        if (contractBlk) extraUser = extraUser + "\n\n" + contractBlk;
        // cap is a runaway guard, not a step budget — MAX_ROUNDS is unused here.
        // Real early-exit guards inside the loop: STUCK_ABORT_AT (consecutive
        // failed tool calls) and TIME_BUDGET_MS (wall-clock with no write_file).
        const cap = (window.Engine.Loop && window.Engine.Loop.SAFETY_CAP) || SAFETY_CAP;
        let roundsRun = 0; // for the final message — `round` is loop-scoped
        for (let round = 1; round <= cap; round++) {
          roundsRun = round;
          if (round > 1 && !wrote && (Date.now() - runStartedAt) > TIME_BUDGET_MS) {
            steps.push({
              kind: "error",
              text: "Stopped after " + Math.round((Date.now() - runStartedAt) / 1000) + "s with nothing written yet — " +
                (cfg.baseUrl || "the connected model") + " is too slow for this prompt on this machine (each round's " +
                "prompt processing alone can take minutes on modest hardware). Try a smaller/faster model, a cloud " +
                "provider, or a simpler request."
            });
            onStep && onStep(steps[steps.length - 1]);
            return steps;
          }
          steps.push({
            kind: "plan",
            text: round === 1
              ? (followUp
                  ? "Follow-up on the current app…"
                  : "Calling LLM to build the app…")
              : (wrote
                  ? "Quality too low (score " + quality.score + ") — refining round " + round + "…"
                  : "Diagnose and act again (tick " + round + ")…")
          });
          onStep && onStep(steps[steps.length - 1]);
          let decision;
          try {
            decision = await llmDecide(prompt, proj, ctx, extraUser, runState);
            lastErr = null;
          } catch (err) {
            lastErr = err;
            steps.push({ kind: "error", text: "Round " + round + " failed: " + humanizeTransportError(err, cfg) });
            onStep && onStep(steps[steps.length - 1]);
            if (isTransportError(err)) break;
            if (isPlanParseError(err)) {
              try {
                const seqPrompt = extraUser ? (String(prompt) + "\n\n" + extraUser) : prompt;
                const seqPlan = await sequentialGenerate(seqPrompt, ctx, function (s) {
                  steps.push(s);
                  onStep && onStep(s);
                }, runState);
                decision = { kind: "files", plan: seqPlan };
                lastErr = null;
              } catch (err2) {
                lastErr = err2;
                if (isTransportError(err2)) break;
                continue;
              }
            } else {
              continue;
            }
          }
          if (decision && decision.think) {
            steps.push({ kind: "think", text: String(decision.think).slice(0, 280) });
            onStep && onStep(steps[steps.length - 1]);
          }
          if (decision && decision.kind === "tool") {
            const tool = String(decision.tool || "");
            steps.push({ kind: "act", text: "Act: " + tool, tool: tool });
            onStep && onStep(steps[steps.length - 1]);
            if (tool === "done") {
              const doneFiles = snapshotWorkspace();
              const observation = observeRuntime(doneFiles);
              // Recovery.verifyBuild composes the build-quality score with the
              // Evidence (screenshot/log) gate and any test result — this is
              // the same "is this build actually done" decision the done-tool
              // dispatched through Engine.Loop.exec uses, so a `done` call
              // here can no longer skip the evidence check just because this
              // round loop returns early instead of going through Loop.exec.
              const verified = (window.Engine.Recovery && window.Engine.Recovery.verifyBuild)
                ? window.Engine.Recovery.verifyBuild(doneFiles, observation)
                : { ok: true, reasons: [], buildScore: evaluateBuild(doneFiles, observation, scoreBuild(doneFiles, observation.issues || [])) };
              quality = verified.buildScore.quality;
              steps.push({ kind: "evaluate", text: "Brain evaluated: quality " + quality.score + (verified.ok ? " pass" : " — " + verified.reasons.join("; ")) });
              onStep && onStep(steps[steps.length - 1]);
              if (verified.ok) {
                steps.push({ kind: "done", text: "Run complete (LLM, " + round + " act(s), quality " + quality.score + "). Prompt again to keep editing this app." });
                onStep && onStep(steps[steps.length - 1]);
                return steps;
              }
              extraUser = buildRefinePrompt(prompt, doneFiles, verified.buildScore.issues || [], quality, { followUp: followUp, capture: observation.capture, contractBlk: contractBlk }) +
                "\n\nThe agent called done, but verification failed: " + verified.reasons.join("; ") + ". Address this before calling done again.";
              continue;
            }
            let obs = { ok: false, error: "loop engine not loaded" };
            if (window.Engine.Loop && window.Engine.Loop.exec) {
              try { obs = await window.Engine.Loop.exec(tool, decision.args || {}); }
              catch (toolErr) { obs = { ok: false, error: String(toolErr && toolErr.message || toolErr) }; }
            }
            if (obs && obs.written && obs.written.length) wrote = true;
            // Only an actually-failed call counts as "stuck" — a successful
            // exploratory step (list_dir, grep, read_file) that hasn't
            // written files yet is legitimate progress, not stalling.
            if (obs && obs.ok) consecutiveFailedTools = 0;
            else consecutiveFailedTools++;
            steps.push({
              kind: "observe",
              text: "Observe " + tool + ": " + (obs.ok ? "ok" : (obs.error || "fail")),
              tool: tool,
              result: obs
            });
            onStep && onStep(steps[steps.length - 1]);
            if (consecutiveFailedTools >= STUCK_ABORT_AT) {
              steps.push({
                kind: "error",
                text: "Stopped after " + consecutiveFailedTools + " tool calls in a row that made no progress (" +
                  tool + " kept failing) — the connected model isn't recovering on its own. Try a larger/different " +
                  "model, or disconnect AI in Settings to use the built-in deterministic generator for this prompt."
              });
              onStep && onStep(steps[steps.length - 1]);
              return steps;
            }
            const answers = (window.Engine.Loop && window.Engine.Loop.pendingAnswers)
              ? window.Engine.Loop.pendingAnswers()
              : [];
            extraUser = (extraUser ? extraUser + "\n\n" : "") +
              "OBSERVATION (" + tool + "):\n" + JSON.stringify(obs).slice(0, 3500) +
              (answers.length ? "\n\nUSER ANSWERS (keep working):\n" + answers.map(function (a) {
                return "- " + a.question + " → " + a.answer;
              }).join("\n") : "") +
              (consecutiveFailedTools >= STUCK_NUDGE_AT
                ? "\n\nIMPORTANT: your last " + consecutiveFailedTools + " tool call(s) made no progress. " +
                  "Stop retrying run_command or similar tools. Call write_file (or create_file) RIGHT NOW with the " +
                  "actual application source files — that is the only tool that moves this forward."
                : "");
            continue;
          }
          const plan = decision && decision.plan;
          if (!plan || !plan.targets || !plan.targets.length) continue;
          steps.push({ kind: "plan-result", text: "Plan: " + plan.summary, files: plan.targets, round: round, suggestions: plan.suggestions });
          onStep && onStep(steps[steps.length - 1]);
          await writeTargets(plan.targets, steps, onStep);
          wrote = true;
          steps.push({ kind: "validate", text: "Runtime observe — validators, mocks, live preview…" });
          onStep && onStep(steps[steps.length - 1]);
          const files = (plan.targets || []).map(function (t) {
            return { path: t.path, content: t.content };
          });
          if (intent.engines.indexOf("deps") >= 0) engines.deps = scanDeps();
          const observation = observeRuntime(files);
          const judged = evaluateBuild(files, observation, scoreBuild(files, observation.issues));
          quality = judged.quality;
          if (observation.capture) {
            const vis = (observation.capture.inspect && observation.capture.inspect.issues) || [];
            steps.push({
              kind: "screenshot",
              text: "Preview snapshot: " + ((observation.capture.inspect && observation.capture.inspect.title) || "untitled") +
                (vis.length ? " — " + vis.join("; ") : " — UI looks wired"),
              capture: observation.capture
            });
            onStep && onStep(steps[steps.length - 1]);
          }
          steps.push({ kind: "evaluate", text: "Brain evaluated: quality " + quality.score + (quality.pass ? " pass" : " — repair/retry") + (judged.p1 ? ", " + judged.p1 + " P1" : "") });
          onStep && onStep(steps[steps.length - 1]);
          steps.push({ kind: "validate-result", issues: judged.issues, quality: quality });
          onStep && onStep(steps[steps.length - 1]);
          if (quality.pass) {
            steps.push({ kind: "done", text: "Run complete (LLM, " + round + " round(s), quality " + quality.score + "). Prompt again to keep editing this app." });
            onStep && onStep(steps[steps.length - 1]);
            if (plan.suggestions && plan.suggestions.length) {
              steps.push({ kind: "suggestions", text: "What next?", items: plan.suggestions });
              onStep && onStep(steps[steps.length - 1]);
            }
            return steps;
          }
          extraUser = buildRefinePrompt(prompt, files, judged.issues, quality, { followUp: followUp, capture: observation.capture, contractBlk: contractBlk }) +
            "\n\n" + formatRag(intent, followUp ? scanRepo() : null, engines.deps, observation, { followUp: followUp });
        }
        if (!wrote) {
          const reason = lastErr ? humanizeTransportError(lastErr, cfg) : "no usable file plan came back";
          steps.push({
            kind: "error",
            text: "Couldn't generate this app: " + reason +
              " Nothing was written yet — the built-in deterministic generator was deliberately not used instead, " +
              "so this failure doesn't get hidden. Fix the issue above, then prompt again."
          });
          onStep && onStep(steps[steps.length - 1]);
          return steps;
        }
        // Reaching here means no round passed (a passing round returns above),
        // so this is never "done". It used to report kind "done" — "Run
        // complete (LLM, 48 acts, quality 12)" on a live run that wrote one
        // index.html and then died on an Ollama error — and it printed the
        // round CAP (48), not the rounds actually run (3).
        steps.push({
          kind: "warn",
          text: "Stopped after " + roundsRun + " round(s) without a passing build (quality " + (quality ? quality.score : 0) + ")" +
            (lastErr ? " — last error: " + humanizeTransportError(lastErr, cfg) : "") +
            ". The files written so far are in the project; prompt the Agent again to keep fixing it."
        });
        onStep && onStep(steps[steps.length - 1]);
        return steps;
      })();
    };

    Agent.__llmPatched = true;
    Agent._llmPlan = llmPlan;
    Agent._originalRun = originalRun;
    return true;
  }

  // ----- Public surface -----
  window.Engine = window.Engine || {};
  // Fix the Problems-tab issues of ONE file with a single focused request:
  // that file, its problems, and the files directly related to them — not the
  // whole app, so it is far quicker than a build repair round. The model may
  // only rewrite `file` and create files that a problem names as missing
  // (js.missing-module); everything else in the project is read-only.
  // Resolves { ok, written:[paths], error }.
  function fixProblems(file, issues) {
    const FSx = window.Engine && window.Engine.FS;
    if (!FSx || !FSx.exists(file)) return Promise.resolve({ ok: false, written: [], error: file + " no longer exists" });
    const list = (issues || []).filter(function (i) { return i && i.file === file; });
    if (!list.length) return Promise.resolve({ ok: true, written: [] });
    const content = FSx.read(file) || "";
    // missing modules this file require()s: the model may create these
    const creatable = [];
    list.forEach(function (i) {
      if (i.faultClass !== "js.missing-module") return;
      const m = /require\('([^']+)'\)/.exec(i.message || "");
      if (!m) return;
      const dir = file.slice(0, file.lastIndexOf("/") + 1) || "/";
      const segs = []; (dir + m[1]).split("/").forEach(function (s) { if (s === "..") segs.pop(); else if (s && s !== ".") segs.push(s); });
      const p = "/" + segs.join("/");
      creatable.push(/\.(c|m)?js(on)?$/.test(p) ? p : p + ".js");
    });
    const all = Object.keys(FSx._data || {}).filter(function (p) { return FSx.isFile(p) && !/node_modules|^\/\.sovereign\//.test(p); });
    const protectedPaths = all.filter(function (p) { return p !== file && creatable.indexOf(p) < 0; });
    // context: package.json, plus files that load this one or that it loads
    const base = file.replace(/^\//, "").replace(/\.(c|m)?js$/, "");
    const related = all.filter(function (p) {
      if (p === file) return false;
      if (p === "/package.json") return true;
      const c = FSx.read(p) || "";
      return c.indexOf(base) >= 0 || content.indexOf(p.replace(/^\//, "").replace(/\.(c|m)?js$/, "")) >= 0;
    }).slice(0, 4);
    const sys = "You fix specific problems in ONE file of an existing app. Call write_file with the COMPLETE corrected content of " + file +
      (creatable.length ? " and, to fix the missing modules, the COMPLETE content of " + creatable.join(", ") : "") +
      ". Change only what the problems require; keep everything else exactly as it is. Do not touch any other file. When done, reply with one short line and no tool calls.\n\n" +
      "PROBLEMS IN " + file + ":\n" + list.map(function (i) { return "- [" + i.severity + "] " + i.faultClass + ": " + i.message; }).join("\n") +
      "\n\nFILE: " + file + "\n```\n" + content.slice(0, 20000) + "\n```" +
      (related.length ? "\n\nRELATED FILES (read-only):\n\n" + related.map(function (p) { return "FILE: " + p + "\n```\n" + String(FSx.read(p) || "").slice(0, 4000) + "\n```"; }).join("\n\n") : "");
    return llmTaskComplete("Fix the listed problems in " + file + ".", sys, { forceBackend: null }, protectedPaths).then(function (files) {
      const written = [];
      (files || []).forEach(function (f) {
        const p = normalizePath(f.path);
        if (p !== file && creatable.indexOf(p) < 0) return; // never write outside the allowed set
        FSx.write(p, f.content);
        written.push(p);
      });
      return { ok: written.length > 0, written: written, error: written.length ? null : "the model did not return a corrected file" };
    }, function (err) {
      return { ok: false, written: [], error: String((err && err.message) || err) };
    });
  }

  window.Engine.LLM = {
    providers: PROVIDERS,
    fixProblems: fixProblems,
    _harnessServerTests: harnessServerTests, // exposed for tests
    _integrationEvidence: integrationEvidence, // exposed for tests
    getConfig,
    setConfig,
    providerById,
    resolveProvider,
    isConfigured: () => isConfigured(loadConfig()),
    chat,
    isLocalEndpoint,
    needsApiKey,
    authToken,
    applyAuthHeaders,
    complete,
    llmPlan,
    llmDecide,
    sequentialGenerate,
    extractJson,
    extractFilesFromText,
    stripFence,
    isTransportError,
    isPlanParseError,
    scoreBuild,
    issuesForFiles,
    buildRefinePrompt,
    buildFollowUpPrompt,
    formatCapture,
    llmAvailable,
    patchIssues,
    smartLoop,
    classifyIntent,
    looksLikeExplore,
    scanRepo,
    scanDeps,
    listDir,
    glob,
    grep,
    readFile,
    projectStructure,
    findSymbol,
    findRefs,
    traceDeps,
    queryTokens,
    relevantContext,
    formatExplore,
    RepoExplore: {
      listDir: listDir,
      glob: glob,
      grep: grep,
      readFile: readFile,
      structure: projectStructure,
      findSymbol: findSymbol,
      findRefs: findRefs,
      traceDeps: traceDeps,
      queryTokens: queryTokens,
      relevantContext: relevantContext,
      formatExplore: formatExplore
    },
    observeRuntime,
    evaluateBuild,
    formatRag,
    extractExternalImports,
    isFollowUp,
    looksLikeRestart,
    conversationHistory,
    snapshotWorkspace,
    rememberModels,
    cachedModels,
    testConnection,
    listModels,
    Gguf,
    status,
    patchAgent,
    STORE_KEY,
    MODELS_KEY,
    MAX_ROUNDS,
    SAFETY_CAP,
    NO_FIXED_TOOL_LIMIT: true
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
