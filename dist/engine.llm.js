/* =================================================================
   engine.llm.js
   -----------------------------------------------------------------
   Real LLM provider integration for CodeSovereign.

   - Provider registry: OpenAI / MiniMax / Anthropic-compat / Custom
   - Each provider stores: id, label, baseUrl, chatPath, defaultModel,
     supportsJson, headerStyle, keyHeader, keyPrefix
   - Persists config in localStorage under cs.llm.v1
   - Patches Engine.Agent.run so that when an LLM is configured AND
     reachable, the agent loops generate → validate → critique →
     rewrite until a quality gate passes (or a round cap). Local
     models that cannot emit a full JSON plan are asked for files
     one at a time. When the real LLM is enabled it is NOT replaced
     by the template synthesizer — a failed call surfaces the error
     so the user can keep prompting.

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

  const MAX_ROUNDS = 4;
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
  function rememberModels(ids, providerId, baseUrl) {
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    const pid = providerId || cfg.providerId || (provider && provider.id) || "";
    const url = (baseUrl != null && baseUrl !== "") ? baseUrl : (provider && provider.baseUrl) || cfg.baseUrl || "";
    const store = loadModelCache();
    const seen = {};
    const list = [];
    (ids || []).forEach(function (id) {
      const v = String(id || "").trim();
      if (!v || seen[v]) return;
      seen[v] = true;
      list.push(v);
    });
    store[modelsCacheKey(pid, url)] = list;
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
    const ctxBlk = (specCtx && specCtx.classification)
      ? "\n\n[PROJECT CONTEXT FROM UNIVERSAL COMPOSER]\n" +
        "primaryType: " + cls + "\n" +
        "modules: " + mods + "\n" +
        "stack: " + JSON.stringify(stack) + "\n" +
        (arch ? "architecture: " + JSON.stringify(arch) + "\n" : "")
      : "";
    return [
      "You are CodeSovereign's coding agent — an expert product engineer, not a tutorial generator.",
      "You write production-quality, fully working source files. No placeholders, no TODOs, no pseudo-code, no 'Simple Notepad'.",
      "Ship a distinctive, polished UI: app shell, sidebar or top nav, dark theme, design tokens, real empty states, keyboard shortcuts, and local persistence.",
      "Replace any leftover files from a previous project. Do not keep starter-template copy.",
      "Prefer a single JSON object (no prose, no markdown fences) with this shape:",
      '{ "summary": "<one-line summary of what you built>",',
      '  "files": [ { "path": "/index.html", "content": "<full file contents>" }, ... ] }',
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
      "- Every file must be complete and runnable. Visual quality matters as much as behavior.",
      ctxBlk
    ].join("\n");
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
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: opts.temperature != null ? opts.temperature : (local ? 0.35 : 0.2),
      max_tokens: opts.maxTokens || (local ? 8192 : 4096)
    };
    if (model) body.model = model;
    // LM Studio / llama.cpp set supportsJson: false; LocalAI still requests JSON mode.
    if (provider.supportsJson && opts.json !== false) {
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
      if (res.ok && models.length) rememberModels(models, cfg.providerId, provider.baseUrl);
      return { ok: res.ok, models: models, url: url, status: res.status, cached: cachedModels(cfg.providerId, provider.baseUrl) };
    } catch (e) {
      return { ok: false, models: [], cached: cachedModels(cfg.providerId, provider.baseUrl), error: String(e && e.message || e), url: url };
    }
  }

  async function complete(prompt, ctx, opts) {
    opts = opts || {};
    const cfg = liveConfig();
    const provider = resolveProvider(cfg);
    if (!cfg.enabled && !opts.force) {
      throw new Error("LLM not configured. Set provider + key in Settings.");
    }
    if (needsApiKey(provider, cfg) && !cfg.apiKey) {
      throw new Error("LLM not configured. Set provider + key in Settings.");
    }
    if (!provider.baseUrl) {
      throw new Error("Provider has no baseUrl. Set a custom base URL in Settings.");
    }
    const systemPrompt = opts.system || buildSystemPrompt(ctx || null);
    const userPrompt = String(prompt || "").trim();
    const req = buildRequest(provider, cfg, systemPrompt, userPrompt, opts);
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
    return { raw: data, content: String(content || ""), model: req.body.model || cfg.model || "" };
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

  function stripFence(body) {
    const trimmed = String(body == null ? "" : body).trim();
    const m = trimmed.match(/^```(?:[\w-]+)?\s*\n?([\s\S]*?)\n?```$/);
    return m ? m[1] : trimmed;
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
    if (parsed) {
      summary = String(parsed.summary || parsed.message || "");
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
    return { summary: summary, files: files };
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
      model: model || ""
    };
  }

  // ----- Build the LLM plan in the shape _plan() returns -----
  function llmPlan(prompt, proj, specCtx, extraUser) {
    const userPrompt = extraUser
      ? String(prompt || "").trim() + "\n\n" + String(extraUser)
      : String(prompt || "").trim();
    return complete(userPrompt, specCtx).then(function (res) {
      const parsed = extractFilesFromText(res.content);
      if (!parsed || !parsed.files.length) {
        throw new Error("LLM response did not contain a valid file plan.");
      }
      return planFromParsed(parsed, res.model, "llm");
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
    issues = issues || [];
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

  function buildRefinePrompt(original, files, issues, quality) {
    const fileBlk = (files || []).slice(0, 12).map(function (f) {
      return "FILE: " + f.path + "\n```\n" + String(f.content || "").slice(0, 4500) + "\n```";
    }).join("\n\n");
    const issueBlk = (issues || []).slice(0, 24).map(function (i) {
      return "- [" + (i.severity || "info") + "] " + (i.file || "") + ": " + (i.message || i.msg || "");
    }).join("\n");
    return [
      "The current version is NOT good enough. Rebuild the entire app to production quality.",
      "Original request:\n" + String(original || ""),
      "Quality score: " + ((quality && quality.score) || 0) + ". Failures:\n- " + ((quality && quality.reasons) || []).join("\n- "),
      "Validator issues:\n" + (issueBlk || "(none)"),
      "Current files:\n" + fileBlk,
      "Replace every file with a polished, distinctive UI: app shell, sidebar or top nav, dark theme, real interactions, empty states, keyboard shortcuts, local persistence.",
      "No 'Simple Notepad'. No starter template. No leftover music-app copy. Return the full file plan again."
    ].join("\n\n");
  }

  async function sequentialGenerate(prompt, specCtx, onChunk) {
    const listSystem = "You plan file lists for web apps. Reply with JSON only.";
    const listPrompt = "App to build:\n" + String(prompt || "") +
      "\n\nReply with JSON only: {\"summary\":\"...\",\"paths\":[\"/index.html\",\"/styles/app.css\",\"/scripts/app.js\"]}. Include every file the UI needs. No prose.";
    const listing = await complete(listPrompt, specCtx, { system: listSystem, temperature: 0.2, maxTokens: 1024, json: true });
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
      const res = await complete(filePrompt, specCtx, { system: fileSystem, temperature: 0.35, maxTokens: 8192, json: false });
      targets.push({ path: path, content: stripFence(res.content) });
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
      if (!allowSequential) throw err;
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
      const useLLM = !!cfg.enabled && !!provider.baseUrl && (!needsApiKey(provider, cfg) || !!cfg.apiKey);
      if (!useLLM) {
        return originalRun(prompt, onStep);
      }
      const steps = [];
      const proj = window.Engine.Proj.current();
      if (!proj) {
        steps.push({ kind: "error", text: "No active project. Create one first." });
        onStep && onStep(steps[steps.length - 1]);
        return Promise.resolve(steps);
      }
      const ctx = specContext();

      return (async function () {
        let extraUser = null;
        let quality = { score: 0, pass: false, reasons: ["not generated"] };
        let lastErr = null;
        let wrote = false;
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          steps.push({
            kind: "plan",
            text: round === 1
              ? "Calling LLM to build the app (round 1/" + MAX_ROUNDS + ")…"
              : "Quality too low (score " + quality.score + ") — refining round " + round + "/" + MAX_ROUNDS + "…"
          });
          onStep && onStep(steps[steps.length - 1]);
          let plan;
          try {
            plan = await generatePlan(prompt, proj, ctx, extraUser, onStep, steps, true);
            lastErr = null;
          } catch (err) {
            lastErr = err;
            steps.push({ kind: "error", text: "LLM round " + round + " failed: " + (err && err.message || err) });
            onStep && onStep(steps[steps.length - 1]);
            continue;
          }
          steps.push({ kind: "plan-result", text: "Plan: " + plan.summary, files: plan.targets, round: round });
          onStep && onStep(steps[steps.length - 1]);
          await writeTargets(plan.targets, steps, onStep);
          wrote = true;
          steps.push({ kind: "validate", text: "Running validators…" });
          onStep && onStep(steps[steps.length - 1]);
          const issues = window.Engine.Validator.runAll();
          const files = snapshotWorkspace();
          quality = scoreBuild(files, issues);
          steps.push({ kind: "validate-result", issues: issues, quality: quality });
          onStep && onStep(steps[steps.length - 1]);
          if (quality.pass) {
            steps.push({ kind: "done", text: "Run complete (LLM, " + round + " round(s), quality " + quality.score + ")." });
            onStep && onStep(steps[steps.length - 1]);
            return steps;
          }
          extraUser = buildRefinePrompt(prompt, files, issues, quality);
        }
        if (!wrote) {
          steps.push({
            kind: "error",
            text: "LLM failed: " + (lastErr && lastErr.message || lastErr || "no usable file plan") +
              " — the local synthesizer was not used. Fix the model or connection, then run again (or keep prompting to continue)."
          });
          onStep && onStep(steps[steps.length - 1]);
          return steps;
        }
        steps.push({
          kind: "done",
          text: "Run complete (LLM, " + MAX_ROUNDS + " rounds, quality " + quality.score +
            "). Prompt the Agent again to keep refining — it will iterate from this version."
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
    sequentialGenerate,
    extractJson,
    extractFilesFromText,
    scoreBuild,
    buildRefinePrompt,
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
    MAX_ROUNDS
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
