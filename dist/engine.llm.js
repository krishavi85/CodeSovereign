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
      if (res.ok && models.length) rememberModels(models.concat(cachedModels(cfg.providerId, provider.baseUrl)), cfg.providerId, provider.baseUrl);
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
      "No 'Simple Notepad'. No starter template. No leftover music-app copy. Return the full file plan again."
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
        steps.push({
          kind: "route",
          text: "Brain: " + intent.mode + " via " + intent.engines.join(" + ") + " (" + intent.reason + ")"
        });
        onStep && onStep(steps[steps.length - 1]);
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
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          steps.push({
            kind: "plan",
            text: round === 1
              ? (followUp
                  ? "Follow-up on the current app (round 1/" + MAX_ROUNDS + ")…"
                  : "Calling LLM to build the app (round 1/" + MAX_ROUNDS + ")…")
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
            if (isTransportError(err)) break;
            continue;
          }
          steps.push({ kind: "plan-result", text: "Plan: " + plan.summary, files: plan.targets, round: round });
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
            return steps;
          }
          extraUser = buildRefinePrompt(prompt, files, judged.issues, quality, { followUp: followUp, capture: observation.capture }) +
            "\n\n" + formatRag(intent, followUp ? scanRepo() : null, engines.deps, observation, { followUp: followUp });
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
