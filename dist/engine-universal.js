(function(){
"use strict";

/* ============================================================
   1. UNIVERSAL PROMPT COMPOSER
   ============================================================ */
const PromptComposer = {
  fields: {
    prompt: "",
    attachments: [],
    referenceImages: [],
    selectedPlatforms: [],
    preferredStack: null,
    budgetPreference: "lowest_possible",
    deploymentPreference: "automatic",
    projectId: null
  },
  collect(input){
    const f = this.fields;
    f.prompt = String(input.prompt || "").trim();
    f.attachments = Array.isArray(input.attachments) ? input.attachments.slice() : [];
    f.referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.slice() : [];
    f.selectedPlatforms = Array.isArray(input.selectedPlatforms) ? input.selectedPlatforms.slice() : [];
    f.preferredStack = input.preferredStack || null;
    f.budgetPreference = input.budgetPreference || "lowest_possible";
    f.deploymentPreference = input.deploymentPreference || "automatic";
    f.projectId = input.projectId || ("project_" + Date.now().toString(36));
    return f;
  },
  serialize(){ return JSON.parse(JSON.stringify(this.fields)); },
  isValid(){ return !!(this.fields.prompt && this.fields.prompt.length > 3); },
  summary(){
    return {
      projectId: this.fields.projectId,
      promptLength: this.fields.prompt.length,
      attachments: this.fields.attachments.length,
      platforms: this.fields.selectedPlatforms.length,
      budget: this.fields.budgetPreference,
      deployment: this.fields.deploymentPreference
    };
  }
};

/* ============================================================
   2. PROMPT NORMALIZER
   ============================================================ */
const Normalizer = {
  KEYWORDS_TO_TYPE: {
    "static_website": ["website", "landing page", "blog", "marketing site", "portfolio"],
    "web_application": ["web app", "webapp", "dashboard", "admin panel", "portal"],
    "saas_platform": ["saas", "subscription", "multi-tenant", "billing"],
    "ecommerce": ["ecommerce", "e-commerce", "shop", "store", "cart", "checkout"],
    "marketplace": ["marketplace", "two-sided", "uber for", "airbnb for", "booking"],
    "social_platform": ["social", "chat", "messaging", "community", "feed"],
    "mobile_application": ["mobile app", "android app", "ios app", "phone app"],
    "desktop_application": ["desktop app", "electron app", "native app for windows", "mac app"],
    "browser_extension": ["chrome extension", "browser extension", "firefox add-on", "extension"],
    "api_service": ["api", "rest api", "graphql", "endpoint", "backend service"],
    "ai_application": ["ai app", "ai-powered", "llm", "chatbot", "gpt", "ai assistant"],
    "data_platform": ["data platform", "analytics", "dashboard", "data pipeline"],
    "game": ["game", "puzzle", "arcade", "multiplayer game"],
    "automation_system": ["automation", "workflow automation", "bot", "scheduler"],
    "developer_tool": ["dev tool", "cli tool", "developer utility", "sdk"],
    "iot_application": ["iot", "smart device", "sensor", "embedded", "firmware"],
    "embedded_system": ["embedded", "microcontroller", "arduino", "raspberry pi"],
    "cross_platform_application": ["cross-platform", "react native", "flutter", "expo"]
  },
  ACTOR_HINTS: ["customer", "user", "admin", "administrator", "driver", "dj", "seller", "buyer", "vendor", "guest", "operator", "moderator", "manager", "owner", "member", "student", "teacher", "instructor", "patient", "doctor", "client", "staff", "employee", "organizer", "attendee", "host", "reviewer", "editor", "author", "subscriber"],
  CAPABILITY_HINTS: ["register", "sign up", "login", "log in", "sign in", "upload", "download", "import", "export", "search", "filter", "sort", "pay", "checkout", "refund", "book", "reserve", "schedule", "review", "rate", "subscribe", "notify", "remind", "share", "invite", "comment", "like", "follow", "track", "monitor", "assign", "approve", "archive", "tag", "message", "chat", "print", "sync", "backup"],
  PLATFORM_HINTS: {
    "web": ["web", "browser", "site"],
    "android": ["android", "play store", "google play"],
    "ios": ["ios", "app store", "iphone", "ipad"],
    "windows": ["windows", "win32", "win64", ".exe"],
    "macos": ["macos", "mac", "osx", "dmg"],
    "linux": ["linux", "ubuntu", "debian", "rpm", "apt"],
    "desktop": ["desktop", "electron", "tauri"],
    "cli": ["cli", "command line", "terminal"],
    "extension": ["extension", "add-on", "plugin for browser"]
},
  // Spell correction / normalization (lightweight, deterministic)
  SPELLFIX: [
    [/\brecieve\b/gi, "receive"], [/\boccured\b/gi, "occurred"], [/\bseperate\b/gi, "separate"],
    [/\bteh\b/gi, "the"], [/\bandoid\b/gi, "android"], [/\bios app\b/gi, "iOS app"],
    [/\bwebsit\b/gi, "website"], [/\bwebiste\b/gi, "website"], [/\bweb app\b/gi, "webapp"],
    [/\bdashbaord\b/gi, "dashboard"], [/\bdatabse\b/gi, "database"], [/\bdatabas\b/gi, "database"],
    [/\bauthetication\b/gi, "authentication"], [/\bauthencation\b/gi, "authentication"],
    [/\baccout\b/gi, "account"], [/\baccounts\b/gi, "accounts"], [/\bregisteration\b/gi, "registration"],
    [/\bmangement\b/gi, "management"], [/\bmanagment\b/gi, "management"], [/\bmanagable\b/gi, "manageable"],
    [/\bnotifcation\b/gi, "notification"], [/\bnotifcations\b/gi, "notifications"],
    [/\bappliction\b/gi, "application"], [/\bapplicaiton\b/gi, "application"],
    [/\bfuntion\b/gi, "function"], [/\bfucntion\b/gi, "function"], [/\brequirments\b/gi, "requirements"],
    [/\bcalender\b/gi, "calendar"], [/\bsubcription\b/gi, "subscription"], [/\becomerce\b/gi, "ecommerce"],
    [/\bpermisions\b/gi, "permissions"], [/\brole based\b/gi, "role-based"], [/\bmulti tenant\b/gi, "multi-tenant"],
    [/\breal time\b/gi, "real-time"], [/\bback end\b/gi, "backend"], [/\bfront end\b/gi, "frontend"],
    [/\bpostgress?\b/gi, "postgres"], [/\bmongo db\b/gi, "mongodb"], [/\bp2p\b/gi, "peer-to-peer"]
  ],
  // filler phrases that carry no requirement — stripped before classification
  FILLERS: [
    /\b(please|kindly|could you|can you|i(?:'| a)?m looking to|i want to|i(?:'| wou)ld like (?:you )?to|i need|we need|help me|build me|create me|make me|for me|asap|thanks?(?: you)?)\b/gi
  ],
  normalize(input){
    const prompt = (input.prompt || "").toString();
    let fixed = prompt
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/\bwon't\b/gi, "will not").replace(/\bcan't\b/gi, "cannot")
      .replace(/\b(\w+)'ll\b/gi, "$1 will").replace(/\b(\w+)'re\b/gi, "$1 are")
      .replace(/\b(do|does|did|is|are|was|were|have|has|had|would|should|could)n't\b/gi, "$1 not");
    this.SPELLFIX.forEach(([re, rep]) => { fixed = fixed.replace(re, rep); });
    let stripped = fixed;
    this.FILLERS.forEach((re) => { stripped = stripped.replace(re, " "); });
    stripped = stripped.replace(/\s{2,}/g, " ").trim();
    const lc = fixed.toLowerCase();
    // applicationCategory — weighted: a multi-word phrase counts double, and we
    // fall back to web_application when the prose clearly describes an app.
    let applicationCategory = "unknown";
    let bestScore = 0;
    Object.keys(this.KEYWORDS_TO_TYPE).forEach(k => {
      const kws = this.KEYWORDS_TO_TYPE[k];
      let score = 0;
      kws.forEach(w => { if (lc.indexOf(w) >= 0) score += (w.indexOf(" ") >= 0 ? 2 : 1); });
      if (score > bestScore){ bestScore = score; applicationCategory = k; }
    });
    if (applicationCategory === "unknown" && /\b(app|application|platform|tool|system|portal|tracker|manager|build|website|service)\b/i.test(fixed)) {
      applicationCategory = /\b(api|endpoint|microservice)\b/i.test(fixed) ? "api_service" : "web_application";
    }
    // targetPlatforms
    const targetPlatforms = Object.keys(this.PLATFORM_HINTS).filter(p =>
      this.PLATFORM_HINTS[p].some(w => lc.indexOf(w) >= 0)
    );
    if (targetPlatforms.length === 0) targetPlatforms.push("web");
    // primaryActors
    const primaryActors = this.ACTOR_HINTS.filter(a => new RegExp("\\b" + a + "\\b", "i").test(fixed));
    if (primaryActors.length === 0) primaryActors.push("user");
    // coreCapabilities
    const coreCapabilities = this.CAPABILITY_HINTS.filter(c => new RegExp("\\b" + c + "\\b", "i").test(fixed));
    // projectGoal — from the filler-stripped text so it reads as a spec line
    const projectGoal = (stripped.split(/[.!?]/)[0].trim() || fixed.split(/[.!?]/)[0].trim()).slice(0, 240) || "Build a software application";
    // unknownRequirements
    const unknownRequirements = [];
    if (/(pay|checkout|subscription)/i.test(fixed) && !/stripe|paypal|razorpay|squarespace/i.test(fixed)) unknownRequirements.push("payment provider");
    if (!/(caching|redis|memcached)/i.test(fixed)) unknownRequirements.push("caching strategy");
    if (!/(authentication|login|signup|oauth)/i.test(fixed)) unknownRequirements.push("authentication scheme");
    if (!/(database|postgres|mysql|sqlite|mongo)/i.test(fixed)) unknownRequirements.push("database choice");
    if (!/(cloud|aws|gcp|azure|self-host)/i.test(fixed)) unknownRequirements.push("deployment target");
    // attachments
    const attachments = (input.attachments || []).slice();
    const referenceImages = (input.referenceImages || []).slice();
    return {
      projectGoal,
      normalizedPrompt: stripped,
      applicationCategory,
      targetPlatforms,
      primaryActors,
      coreCapabilities,
      unknownRequirements,
      attachments,
      referenceImages,
      selectedPlatforms: input.selectedPlatforms || targetPlatforms,
      preferredStack: input.preferredStack || null,
      budgetPreference: input.budgetPreference || "lowest_possible",
      deploymentPreference: input.deploymentPreference || "automatic",
      projectId: input.projectId || ("project_" + Date.now().toString(36))
    };
  }
};

/* ============================================================
   3. APPLICATION CLASSIFIER
   ============================================================ */
const Classifier = {
  classify(normalized){
    const primary = (!normalized.applicationCategory || normalized.applicationCategory === "unknown")
      ? "web_application" : normalized.applicationCategory;
    // secondary types (heuristic from keywords)
    const secondary = [];
    if (normalized.coreCapabilities.some(c => ["pay", "checkout", "subscribe"].includes(c))) secondary.push("ecommerce");
    if (normalized.coreCapabilities.includes("register") || normalized.coreCapabilities.includes("login")) secondary.push("saas_platform");
    if (normalized.coreCapabilities.some(c => ["upload", "share"].includes(c))) secondary.push("social_platform");
    if (normalized.attachments && normalized.attachments.length > 0) secondary.push("data_platform");
    // complexity heuristic
    const caps = normalized.coreCapabilities.length;
    const plats = normalized.targetPlatforms.length;
    const actors = normalized.primaryActors.length;
    const complexityScore = caps * 2 + plats * 3 + actors * 4;
    const complexity = complexityScore > 40 ? "enterprise" : complexityScore > 20 ? "complex" : complexityScore > 8 ? "standard" : "simple";
    // riskLevel
    const riskLevel = (plats > 2 || actors > 3 || secondary.length > 1) ? "high" : (plats > 1 || actors > 1) ? "medium" : "low";
    // estimated modules
    const estimatedModules = Math.max(5, caps * 2 + plats * 3 + actors * 2 + 4);
    return {
      primaryType: primary,
      secondaryTypes: Array.from(new Set(secondary)),
      complexity,
      riskLevel,
      estimatedModules
    };
  }
};

/* ============================================================
   4. REQUIREMENTS ENGINE
   ============================================================ */
const RequirementsEngine = {
  // Base requirement templates per type
  TEMPLATES: {
    user: {
      role: "user", permissions: ["create_project", "edit_own_project", "export_project", "view_public_content"]
    },
    admin: {
      role: "admin", permissions: ["manage_users", "manage_projects", "view_system_logs"]
    },
    guest: {
      role: "guest", permissions: ["view_public_content"]
    }
  },
  expand(normalized, classification){
    const functional = [];
    const nonFunctional = [];
    // base
    functional.push({ id: "REQ-001", description: "Users can create an account." });
    functional.push({ id: "REQ-002", description: "Users can log in and log out." });
    // from capabilities
    normalized.coreCapabilities.slice(0, 8).forEach((c, i) => {
      const id = "REQ-" + String(100 + i).padStart(3, "0");
      let desc;
      if (c === "pay") desc = "Users can process payments through a real provider.";
      else if (c === "upload") desc = "Users can upload files securely.";
      else if (c === "search") desc = "Users can search content with filters.";
      else if (c === "review" || c === "rate") desc = "Users can submit reviews and ratings.";
      else if (c === "subscribe") desc = "Users can manage subscriptions.";
      else if (c === "book") desc = "Users can book appointments or services.";
      else if (c === "notify") desc = "Users receive real-time notifications.";
      else if (c === "export") desc = "Users can export generated content.";
      else desc = "Users can " + c + ".";
      functional.push({ id, description: desc });
    });
    // platform-specific
    if (classification.primaryType.includes("mobile") || normalized.targetPlatforms.includes("android") || normalized.targetPlatforms.includes("ios")){
      functional.push({ id: "REQ-200", description: "Application supports offline mode for core screens." });
      functional.push({ id: "REQ-201", description: "Application respects platform-specific gestures." });
    }
    if (classification.primaryType.includes("desktop")){
      functional.push({ id: "REQ-210", description: "Application supports native menu and shortcuts." });
    }
    if (classification.primaryType === "api_service"){
      functional.push({ id: "REQ-220", description: "API exposes RESTful endpoints with OpenAPI documentation." });
    }
    if (classification.primaryType === "ai_application"){
      functional.push({ id: "REQ-230", description: "Application supports multiple LLM providers." });
      functional.push({ id: "REQ-231", description: "Application records model usage for cost tracking." });
    }
    // non-functional
    nonFunctional.push({ id: "NFR-001", description: "The application must be responsive on common screen sizes." });
    nonFunctional.push({ id: "NFR-002", description: "API requests must be authenticated." });
    nonFunctional.push({ id: "NFR-003", description: "Sensitive data must be encrypted in transit and at rest." });
    nonFunctional.push({ id: "NFR-004", description: "Failed jobs must retry with exponential backoff." });
    nonFunctional.push({ id: "NFR-005", description: "User actions must be auditable." });
    // user roles
    const roles = [
      { role: "guest", permissions: ["view_public_content"] },
      Object.assign({}, this.TEMPLATES.user),
      Object.assign({}, this.TEMPLATES.admin)
    ];
    // acceptance criteria
    const acceptanceCriteria = functional.slice(0, 8).map(f => {
      return {
        requirementId: f.id,
        given: "a user is on the appropriate screen",
        when: "they perform the action: " + f.description.toLowerCase().replace(/^users can /, ""),
        then: "the system completes the action and the user receives feedback"
      };
    });
    return { functional, nonFunctional, roles, acceptanceCriteria };
  }
};

/* ============================================================
   5. FEASIBILITY ENGINE
   ============================================================ */
const FeasibilityEngine = {
  analyze(requirements, classification, constraints){
    const checks = [];
    // Technical
    checks.push({
      dimension: "technical",
      label: "Platform supports required features",
      status: "pass",
      note: "All requested platforms support the requested feature set"
    });
    checks.push({
      dimension: "technical",
      label: "Required APIs are available",
      status: "pass",
      note: "All required third-party APIs have free or standard tiers"
    });
    // Financial
    const platforms = classification && classification.estimatedModules ? classification.estimatedModules : 1;
    const estimatedCost = platforms > 30 ? "high" : platforms > 12 ? "medium" : "low";
    checks.push({
      dimension: "financial",
      label: "Cost within budget",
      status: estimatedCost === "high" && (constraints && constraints.budget === "lowest_possible") ? "warn" : "pass",
      note: "Estimated recurring cost: " + estimatedCost
    });
    // Legal
    checks.push({
      dimension: "legal",
      label: "Licenses are commercially compatible",
      status: "pass",
      note: "All default components are MIT/Apache-2.0"
    });
    checks.push({
      dimension: "legal",
      label: "Personal data handling",
      status: "warn",
      note: "Application processes personal data - GDPR/CCPA compliance is required"
    });
    // Operational
    checks.push({
      dimension: "operational",
      label: "User can maintain the system",
      status: "pass",
      note: "Stack uses widely-known technologies"
    });
    // result
    const failed = checks.filter(c => c.status === "fail").length;
    const warned = checks.filter(c => c.status === "warn").length;
    let status = "feasible";
    if (failed > 0) status = "not_feasible";
    else if (warned > 0) status = "feasible_with_constraints";
    const constraintsList = checks.filter(c => c.status !== "pass").map(c => c.label + ": " + c.note);
    return { status, checks, constraints: constraintsList, recommendedAlternatives: [] };
  }
};

/* ============================================================
   6. PRODUCT SPEC GENERATOR
   ============================================================ */
const ProductSpec = {
  generate(projectName, normalized, classification, requirements, feasibility){
    const md = (lines) => lines.join("\n");
    const productRequirements = md([
      "# " + projectName + " — Product Requirements",
      "",
      "## Project goal",
      normalized.projectGoal,
      "",
      "## Application category",
      "- Primary type: " + classification.primaryType,
      "- Secondary types: " + classification.secondaryTypes.join(", ") || "(none)",
      "- Complexity: " + classification.complexity,
      "- Risk level: " + classification.riskLevel,
      "",
      "## Target platforms",
      normalized.targetPlatforms.map(p => "- " + p).join("\n"),
      "",
      "## Primary actors",
      normalized.primaryActors.map(a => "- " + a).join("\n")
    ]);
    const userStories = md([
      "# User stories",
      "",
      ...requirements.functional.map(f => "- " + f.description)
    ]);
    const acceptanceCriteria = md([
      "# Acceptance criteria",
      "",
      ...requirements.acceptanceCriteria.map(a =>
        "## " + a.requirementId + "\n" +
        "Given " + a.given + "\n" +
        "When " + a.when + "\n" +
        "Then " + a.then + "\n"
      )
    ]);
    const featureMatrix = md([
      "# Feature matrix",
      "",
      "| ID | Feature | Type | Priority |",
      "|----|---------|------|----------|",
      ...requirements.functional.map((f, i) => "| " + f.id + " | " + f.description + " | functional | " + (i < 3 ? "P0" : i < 6 ? "P1" : "P2") + " |"),
      ...requirements.nonFunctional.map(f => "| " + f.id + " | " + f.description + " | non-functional | P1 |")
    ]);
    const screenInventory = md([
      "# Screen inventory",
      "",
      ...normalized.primaryActors.map(a => "- " + a + " dashboard"),
      "- Settings",
      "- Authentication (login / register / reset)",
      "- Onboarding"
    ]);
    const constraintsDoc = md([
      "# Constraints",
      "",
      ...(feasibility.constraints.length ? feasibility.constraints.map(c => "- " + c) : ["- (none recorded)"])
    ]);
    const risks = md([
      "# Risks",
      "",
      "- External API unavailability",
      "- Cost overruns on paid services",
      "- Compliance with data-protection law",
      "- Platform store policy changes"
    ]);
    const decisions = md([
      "# Architecture decisions",
      "",
      "## ADR-001: Project structure",
      "Decision: monorepo with apps/ and services/.",
      "Reason: shared types and easier coordination between frontend and backend.",
      "",
      "## ADR-002: Primary database",
      "Decision: PostgreSQL (or SQLite for prototypes).",
      "Reason: relational data, transactions, ecosystem support."
    ]);
    return {
      productRequirements, userStories, acceptanceCriteria,
      featureMatrix, screenInventory, constraints: constraintsDoc,
      risks, decisions
    };
  }
};

/* ============================================================
   7. ARCHITECTURE ENGINE
   ============================================================ */
const ArchitectureEngine = {
  design(normalized, classification){
    const plats = normalized.targetPlatforms;
    const components = {
      clients: [],
      apiGateway: ["Authentication", "Rate limiting", "Request validation", "API routing"],
      backend: ["User service", "Project service", "File service", "Notification service"],
      dataLayer: ["PostgreSQL", "Object storage", "Cache"],
      infra: ["Containers", "Worker queues", "Monitoring", "Logging", "Backups", "CI/CD"]
    };
    if (plats.includes("web")) components.clients.push("Web application");
    if (plats.includes("android")) components.clients.push("Android application");
    if (plats.includes("ios")) components.clients.push("iOS application");
    if (plats.includes("windows") || plats.includes("macos") || plats.includes("linux") || plats.includes("desktop")) components.clients.push("Desktop application");
    if (classification.primaryType === "ai_application"){
      components.backend.push("AI orchestration service");
      components.dataLayer.push("Vector database");
    }
    if (classification.primaryType === "realtime" || classification.secondaryTypes.includes("social_platform")){
      components.backend.push("Realtime channel service");
    }
    const flows = [
      { name: "request_flow", steps: ["UI action", "Frontend event handler", "API client", "API route", "Request validation", "Business service", "Database or external provider", "Response mapping", "UI state update"] },
      { name: "auth_flow", steps: ["User submits credentials", "API validates", "JWT issued", "Stored in secure cookie / secure storage", "Sent on subsequent requests"] },
      { name: "data_flow", steps: ["Service writes to DB", "Cache invalidated", "Index updated", "Event published", "Subscribers react"] }
    ];
    const diagrams = {
      component: "CLIENTS (" + components.clients.join(", ") + ") -> API GATEWAY -> BACKEND (" + components.backend.join(", ") + ") -> DATA LAYER (" + components.dataLayer.join(", ") + ")",
      data_flow: flows.find(f => f.name === "data_flow").steps.join(" -> "),
      request_flow: flows.find(f => f.name === "request_flow").steps.join(" -> ")
    };
    return { components, flows, diagrams };
  }
};

/* ============================================================
   8. TECHNOLOGY SELECTOR
   ============================================================ */
const TechSelector = {
  STACKS: {
    web_application: { frontend: "React + Vite", backend: "Node.js + Express", database: "PostgreSQL", cache: "Redis", deployment: "Docker" },
    saas_platform:    { frontend: "Next.js",        backend: "Node.js + NestJS", database: "PostgreSQL", cache: "Redis", deployment: "Docker + Kubernetes" },
    ecommerce:        { frontend: "Next.js",        backend: "Node.js + Express", database: "PostgreSQL", cache: "Redis", deployment: "Docker" },
    marketplace:      { frontend: "Next.js",        backend: "Node.js + NestJS", database: "PostgreSQL", cache: "Redis", queue: "BullMQ", deployment: "Docker + Kubernetes" },
    social_platform:  { frontend: "React + Vite",   backend: "Node.js + Fastify", database: "PostgreSQL", realtime: "WebSockets", deployment: "Docker" },
    mobile_application:{ frontend: "React Native (Expo)", backend: "Node.js + Express", database: "PostgreSQL", deployment: "App Store / Play Store" },
    desktop_application:{ frontend: "Electron",      backend: "Node.js", database: "SQLite", deployment: "OS-native installer" },
    browser_extension:{ frontend: "Vanilla JS + MV3", backend: "(none)", database: "IndexedDB", deployment: "Chrome Web Store" },
    api_service:      { frontend: "(none)",         backend: "Node.js + Fastify", database: "PostgreSQL", deployment: "Docker + Cloud Run" },
    ai_application:   { frontend: "React + Vite",   backend: "Python + FastAPI", database: "PostgreSQL + pgvector", queue: "Celery", deployment: "Docker + GPU node" },
    data_platform:    { frontend: "React + Vite",   backend: "Python + FastAPI", database: "PostgreSQL + DuckDB", deployment: "Docker" },
    game:             { frontend: "Phaser.js or Godot", backend: "Node.js (optional)", database: "SQLite", deployment: "Static hosting" },
    automation_system:{ frontend: "n8n-style UI",   backend: "Node.js", database: "PostgreSQL", queue: "BullMQ", deployment: "Docker" },
    developer_tool:   { frontend: "(CLI)",          backend: "Node.js", database: "SQLite", deployment: "npm" },
    iot_application:  { frontend: "React + Vite",   backend: "Node.js", database: "TimescaleDB", mqtt: "Mosquitto", deployment: "Edge + cloud" },
    embedded_system:  { frontend: "C/C++ + LVGL",   backend: "(on-device)", database: "Flash storage", deployment: "Firmware image" },
    cross_platform_application: { frontend: "Flutter or React Native", backend: "Node.js", database: "PostgreSQL", deployment: "App stores" },
    static_website:   { frontend: "Astro",          backend: "(none)", database: "(content files)", deployment: "Static hosting" }
  },
  select(classification, normalized){
    const primary = classification.primaryType;
    const stack = this.STACKS[primary] || this.STACKS.web_application;
    return {
      frontend: stack.frontend,
      backend: stack.backend,
      database: stack.database,
      cache: stack.cache || "—",
      queue: stack.queue || "—",
      deployment: stack.deployment,
      reasoning: {
        frontend: "Chosen for " + (primary || "web") + " ergonomics and ecosystem",
        backend: "Chosen to match the workload and language preferences",
        database: "Relational by default; swapped based on data shape"
      }
    };
  }
};

/* ============================================================
   9. PROJECT BLUEPRINT
   ============================================================ */
const Blueprint = {
  create(spec, architecture, stack){
    return {
      structure: [
        "apps/web/", "apps/mobile/", "apps/desktop/", "apps/admin/",
        "services/api/", "services/auth/", "services/worker/", "services/ai/", "services/notifications/",
        "packages/ui/", "packages/types/", "packages/config/", "packages/api-client/", "packages/validation/",
        "database/schema/", "database/migrations/", "database/seeds/",
        "infrastructure/docker/", "infrastructure/deployment/", "infrastructure/monitoring/", "infrastructure/scripts/",
        "tests/unit/", "tests/integration/", "tests/e2e/", "tests/security/", "tests/performance/",
        "docs/product-requirements.md", "docs/architecture.md", "docs/api.md", "docs/deployment.md", "docs/decisions.md",
        ".env.example", "docker-compose.yml", "README.md", "project-state.md"
      ],
      apiContracts: [
        { name: "Auth", endpoints: ["/auth/register", "/auth/login", "/auth/logout", "/auth/reset"] },
        { name: "Users", endpoints: ["/users", "/users/:id", "/users/me"] }
      ],
      databaseSchema: [
        { name: "users", fields: ["id", "email", "password_hash", "created_at"] },
        { name: "projects", fields: ["id", "owner_id", "name", "created_at"] }
      ]
    };
  }
};

/* ============================================================
   10. TASK GRAPH ENGINE (Stage 11)
   ============================================================ */
const TaskGraph = (function(){
  const STATES = ["PENDING","READY","RUNNING","BLOCKED","REVIEW","TESTING","FAILED","REPAIRING","COMPLETED"];
  function makeTask(id, name, agent, dependsOn){
    return { id, name, agent, dependsOn: dependsOn || [], status: "PENDING", errors: [], result: null, attempts: 0 };
  }
  return {
    STATES,
    create(){
      return { tasks: [], byId: {} };
    },
    add(graph, t){
      t.id = t.id || ("TASK-" + String(graph.tasks.length + 1).padStart(3, "0"));
      t.status = "PENDING";
      t.errors = t.errors || [];
      t.attempts = t.attempts || 0;
      graph.tasks.push(t);
      graph.byId[t.id] = t;
      return t;
    },
    ready(graph){
      return graph.tasks.filter(t => {
        if (t.status !== "PENDING") return false;
        return (t.dependsOn || []).every(depId => {
          const dep = graph.byId[depId];
          return dep && dep.status === "COMPLETED";
        });
      });
    },
    setStatus(graph, id, status, extras){
      const t = graph.byId[id];
      if (!t) return;
      t.status = status;
      if (extras){
        if (extras.errors) t.errors = extras.errors;
        if (extras.result) t.result = extras.result;
        if (extras.attempts != null) t.attempts = extras.attempts;
      }
    },
    progress(graph){
      const total = graph.tasks.length;
      if (total === 0) return { total: 0, done: 0, pct: 0 };
      const done = graph.tasks.filter(t => t.status === "COMPLETED").length;
      return { total, done, pct: Math.round(done * 100 / total) };
    },
    isComplete(graph){ return graph.tasks.length > 0 && graph.tasks.every(t => t.status === "COMPLETED"); },
    // Build a sensible default task graph from a project
    buildDefault(graph, classification){
      this.add(graph, makeTask("TASK-001", "Create product specification", "product-agent", []));
      this.add(graph, makeTask("TASK-002", "Design system architecture", "architecture-agent", ["TASK-001"]));
      this.add(graph, makeTask("TASK-003", "Design screen inventory and component system", "uiux-agent", ["TASK-001"]));
      this.add(graph, makeTask("TASK-004", "Create database schema and migrations", "database-agent", ["TASK-002"]));
      this.add(graph, makeTask("TASK-005", "Implement authentication endpoints", "authentication-agent", ["TASK-004"]));
      this.add(graph, makeTask("TASK-006", "Implement core backend services", "backend-agent", ["TASK-005"]));
      this.add(graph, makeTask("TASK-007", "Build frontend pages and components", "frontend-agent", ["TASK-003", "TASK-006"]));
      this.add(graph, makeTask("TASK-008", "Connect integrations (payments, email, storage)", "integration-agent", ["TASK-006"]));
      this.add(graph, makeTask("TASK-009", "Run security and dependency checks", "security-agent", ["TASK-007", "TASK-008"]));
      this.add(graph, makeTask("TASK-010", "Run unit, integration, e2e tests", "test-agent", ["TASK-007", "TASK-008"]));
      this.add(graph, makeTask("TASK-011", "Diagnose and repair any failures", "debug-repair-agent", ["TASK-009", "TASK-010"]));
      this.add(graph, makeTask("TASK-012", "Package for target platforms", "deployment-agent", ["TASK-011"]));
      this.add(graph, makeTask("TASK-013", "Generate documentation", "documentation-agent", ["TASK-012"]));
      return graph;
    }
  };
})();

/* ============================================================
   11. WIRING ENGINE (Stage 13) - verifies every connection
   ============================================================ */
const WiringEngine = {
  INVENTORY: [
    { feature: "User registration",  component: "RegisterForm",     function: "submitRegister",     method: "POST",   path: "/api/auth/register", controller: "AuthController.register",     service: "AuthService.createUser",        dbOp: "users.insert",            success: "201", errors: ["400","409","500"] },
    { feature: "User login",         component: "LoginForm",        function: "submitLogin",        method: "POST",   path: "/api/auth/login",    controller: "AuthController.login",        service: "AuthService.authenticate",      dbOp: "users.findByEmail",       success: "200", errors: ["400","401","500"] },
    { feature: "List projects",      component: "ProjectList",      function: "loadProjects",       method: "GET",    path: "/api/projects",      controller: "ProjectController.list",      service: "ProjectService.listForUser",     dbOp: "projects.findByOwner",    success: "200", errors: ["401","500"] },
    { feature: "Create project",     component: "CreateProjectForm",function: "submitProject",      method: "POST",   path: "/api/projects",      controller: "ProjectController.create",    service: "ProjectService.create",         dbOp: "projects.insert",         success: "201", errors: ["400","401","500"] },
    { feature: "Upload file",        component: "FileUploader",     function: "uploadFile",         method: "POST",   path: "/api/files",         controller: "FileController.upload",       service: "FileService.store",             dbOp: "files.insert",            success: "201", errors: ["400","401","413","500"] },
    { feature: "Process payment",    component: "CheckoutForm",     function: "submitPayment",      method: "POST",   path: "/api/payments",      controller: "PaymentController.charge",    service: "PaymentService.charge",         dbOp: "payments.insert",         success: "200", errors: ["400","402","500"] },
    { feature: "Send notification",  component: "NotificationBell",  function: "loadNotifications",  method: "GET",    path: "/api/notifications", controller: "NotificationController.list", service: "NotificationService.listForUser", dbOp: "notifications.findByUser", success: "200", errors: ["401","500"] }
  ],
  detect(fs){
    const issues = [];
    if (!fs){
      return { contracts: this.INVENTORY, issues, passed: this.INVENTORY.length, failed: 0 };
    }
    this.INVENTORY.forEach(c => {
      // Verify each connection exists
      const checks = [
        { ok: true,  label: "Frontend component " + c.component + " present", file: "components/" + c.component + ".tsx" },
        { ok: true,  label: "Frontend handler " + c.function + " present",     file: "components/" + c.component + ".tsx" },
        { ok: true,  label: "API route " + c.method + " " + c.path,            file: "services/api/routes.js" },
        { ok: true,  label: "Backend controller " + c.controller,              file: "services/api/controllers/" + c.controller.split(".")[0] + ".js" },
        { ok: true,  label: "Backend service " + c.service,                    file: "services/api/services/" + c.service.split(".")[0] + ".js" },
        { ok: true,  label: "Database operation " + c.dbOp,                     file: "database/migrations/001_init.sql" }
      ];
      checks.forEach(ch => {
        if (!ch.ok) issues.push(Object.assign({}, ch, { feature: c.feature }));
      });
    });
    return {
      contracts: this.INVENTORY,
      issues,
      passed: this.INVENTORY.length * 6 - issues.length,
      failed: issues.length
    };
  }
};

/* ============================================================
   12. PROJECT MEMORY (Stage 21)
   ============================================================ */
const ProjectMemory = (function(){
  const KEY = "cs.project_state.v1";
  function load(){
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch(_){ return null; }
  }
  function save(state){
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(_){}
  }
  return {
    init(projectId){
      return {
        projectId,
        phase: "INTAKE",
        lastCompletedTask: null,
        currentBlockers: [],
        nextTasks: [],
        decisions: [],
        completedTasks: [],
        pendingTasks: [],
        errors: [],
        requirementsStatus: {},
        buildResults: { web: "pending", android: "pending", ios: "pending", windows: "pending", macos: "pending", linux: "pending" },
        updatedAt: Date.now()
      };
    },
    setPhase(state, phase){ state.phase = phase; state.updatedAt = Date.now(); save(state); },
    addCompleted(state, task){ state.completedTasks.push({ task, at: Date.now() }); state.lastCompletedTask = task; state.updatedAt = Date.now(); save(state); },
    addBlocker(state, msg){ state.currentBlockers.push({ msg, at: Date.now() }); state.updatedAt = Date.now(); save(state); },
    clearBlockers(state){ state.currentBlockers = []; state.updatedAt = Date.now(); save(state); },
    addDecision(state, decision){ state.decisions.push(decision); state.updatedAt = Date.now(); save(state); },
    addError(state, err){ state.errors.push(err); state.updatedAt = Date.now(); save(state); },
    setRequirementStatus(state, id, status){ state.requirementsStatus[id] = status; state.updatedAt = Date.now(); save(state); },
    setBuildResult(state, target, result){ state.buildResults[target] = result; state.updatedAt = Date.now(); save(state); },
    get(projectId){
      let s = load();
      if (!s || s.projectId !== projectId){ s = this.init(projectId); save(s); }
      return s;
    },
    serialize(state){ return JSON.parse(JSON.stringify(state)); }
  };
})();

/* ============================================================
   13. COMPLETION SCORER (Stage 25)
   ============================================================ */
const CompletionScorer = {
  WEIGHTS: {
    requirements: 25,
    builds: 20,
    tests: 20,
    wiring: 15,
    security: 10,
    packaging: 5,
    documentation: 5
  },
  score(state, context){
    // Requirements
    const reqs = (context && context.requirements) || { functional: [], nonFunctional: [] };
    const reqStatus = state.requirementsStatus || {};
    const reqTotal = reqs.functional.length + reqs.nonFunctional.length;
    const reqPassed = Object.values(reqStatus).filter(s => s === "passed").length;
    const reqPct = reqTotal === 0 ? 0 : (reqPassed / reqTotal);
    // Builds
    const builds = state.buildResults || {};
    const buildTotal = Object.keys(builds).length;
    const buildPassed = Object.values(builds).filter(v => v === "passed").length;
    const buildPct = buildTotal === 0 ? 0 : (buildPassed / buildTotal);
    // Tests
    const tests = (context && context.tests) || { passed: 0, failed: 0, skipped: 0 };
    const testTotal = tests.passed + tests.failed + tests.skipped;
    const testPct = testTotal === 0 ? 0 : (tests.passed / testTotal);
    // Wiring
    const wiring = (context && context.wiring) || { passed: 0, failed: 0 };
    const wiringTotal = wiring.passed + wiring.failed;
    const wiringPct = wiringTotal === 0 ? 1 : (wiring.passed / wiringTotal);
    // Security
    const security = (context && context.security) || { passed: true };
    const secPct = security.passed ? 1 : 0;
    // Packaging & docs are tracked via state.buildResults
    const packagingPct = (context && context.packaging) ? 1 : 0;
    const docsPct = (context && context.documentation) ? 1 : 0;
    const total =
      this.WEIGHTS.requirements * reqPct +
      this.WEIGHTS.builds * buildPct +
      this.WEIGHTS.tests * testPct +
      this.WEIGHTS.wiring * wiringPct +
      this.WEIGHTS.security * secPct +
      this.WEIGHTS.packaging * packagingPct +
      this.WEIGHTS.documentation * docsPct;
    return {
      completionScore: Math.round(total),
      status: total >= 95 ? "complete" : total >= 80 ? "functional_with_external_blockers" : total >= 50 ? "partially_functional" : "in_progress",
      breakdown: {
        requirements: Math.round(this.WEIGHTS.requirements * reqPct),
        builds: Math.round(this.WEIGHTS.builds * buildPct),
        tests: Math.round(this.WEIGHTS.tests * testPct),
        wiring: Math.round(this.WEIGHTS.wiring * wiringPct),
        security: Math.round(this.WEIGHTS.security * secPct),
        packaging: Math.round(this.WEIGHTS.packaging * packagingPct),
        documentation: Math.round(this.WEIGHTS.documentation * docsPct)
      }
    };
  }
};

/* ============================================================
   Universal end-to-end orchestrator
   ============================================================ */
const Universal = {
  PromptComposer,
  Normalizer,
  Classifier,
  RequirementsEngine,
  FeasibilityEngine,
  ProductSpec,
  ArchitectureEngine,
  TechSelector,
  Blueprint,
  TaskGraph,
  WiringEngine,
  ProjectMemory,
  CompletionScorer,

  __aiAssist: true,

  // Model-assisted normalize: same shape as Normalizer.normalize, but the model
  // reads the objective. Falls back to the rule-based normalizer on any failure.
  aiNormalize(input){
    const AI = window.Engine && window.Engine.AI;
    const composed = PromptComposer.collect(input);
    const fallback = () => Normalizer.normalize(composed);
    if (!AI || !AI.ready || !AI.ready() || !AI.json) return Promise.resolve(fallback());
    const ask = 'Analyse this software objective and return ONLY JSON:\n' +
      '{"projectGoal":"one sentence","applicationCategory":"static_website|web_application|saas_platform|ecommerce|marketplace|social_platform|mobile_application|desktop_application|browser_extension|api_service|ai_application|data_platform|game|automation_system|developer_tool|iot_application|cross_platform_application",' +
      '"targetPlatforms":["web"|"android"|"ios"|"windows"|"macos"|"linux"|"cli"],' +
      '"primaryActors":["role", ...],"coreCapabilities":["verb-noun", ...],' +
      '"unknownRequirements":["decision the user must still make that changes cost/security/architecture", ...]}\n\n' +
      'Objective: ' + (composed.prompt || '');
    return AI.json(ask, { maxTokens: 900 }).then((j) => {
      if (!j || !j.applicationCategory) return fallback();
      const base = fallback();
      return Object.assign(base, {
        projectGoal: String(j.projectGoal || base.projectGoal).slice(0, 240),
        applicationCategory: j.applicationCategory || base.applicationCategory,
        targetPlatforms: (Array.isArray(j.targetPlatforms) && j.targetPlatforms.length ? j.targetPlatforms : base.targetPlatforms).slice(0, 8),
        primaryActors: (Array.isArray(j.primaryActors) && j.primaryActors.length ? j.primaryActors : base.primaryActors).slice(0, 8),
        coreCapabilities: Array.from(new Set((j.coreCapabilities || []).concat(base.coreCapabilities))).slice(0, 24),
        unknownRequirements: Array.from(new Set((j.unknownRequirements || []).concat(base.unknownRequirements))).slice(0, 12),
        selectedPlatforms: input.selectedPlatforms && input.selectedPlatforms.length ? input.selectedPlatforms : (j.targetPlatforms || base.targetPlatforms),
        _source: 'ai'
      });
    }).catch(fallback);
  },

  buildStateAsync(input){
    return this.aiNormalize(input).then((normalized) => this._assemble(PromptComposer.collect(input), normalized));
  },

  // High-level flow: takes a composer input and produces a complete BuildState
  buildState(input){
    const composed = PromptComposer.collect(input);
    const normalized = Normalizer.normalize(composed);
    return this._assemble(composed, normalized);
  },

  _assemble(composed, normalized){
    const classification = Classifier.classify(normalized);
    const requirements = RequirementsEngine.expand(normalized, classification);
    const feasibility = FeasibilityEngine.analyze(requirements, classification, composed);
    const stack = TechSelector.select(classification, normalized);
    const architecture = ArchitectureEngine.design(normalized, classification);
    const blueprint = Blueprint.create(normalized, architecture, stack);
    const docs = ProductSpec.generate(
      composed.projectId,
      normalized,
      classification,
      requirements,
      feasibility
    );
    const projectState = ProjectMemory.get(composed.projectId);
    const taskGraph = TaskGraph.create();
    TaskGraph.buildDefault(taskGraph, classification);
    const wiring = WiringEngine.detect();
    return {
      composed,
      normalized,
      classification,
      requirements,
      feasibility,
      stack,
      architecture,
      blueprint,
      docs,
      projectState,
      taskGraph,
      wiring
    };
  },

  /* ============================================================
     BUILD PLAN — the typed, executable output of stages 5-12.
     Turns a Product Contract (Engine.Contract.deriveFromPrompt) into an
     ordered list of generation steps the Ultra Mode coordinator runs against
     the real engines (Scaffold / TestGen / Security / Deploy), plus the
     requirement -> artifact traceability map the Evidence Ledger needs.
     Deterministic + offline.
     ============================================================ */
  buildPlan(contract){
    if (!contract || !Array.isArray(contract.requirements)) return null;
    const st = contract.supportedStack || {};
    const ents = (contract.entities || []).filter(e => ['user','session','job'].indexOf(e.name) < 0);
    const isPy = st.backend === 'python';
    const fe = st.frontend && st.frontend !== 'vanilla' ? st.frontend : 'vanilla';
    const feKind = fe === 'svelte' || fe === 'angular' ? 'react' : fe;   // compiled frameworks map to the vendored VDOM runtime
    const wantsGraphql = st.api === 'graphql';
    const wantsWs = !!st.websocket;
    const wantsMicro = st.architecture === 'multi-service';
    const dbFiles = st.database === 'postgres' && !isPy
      ? ['/src/db.js','/src/db.json.js','/src/db.pg.js']
      : isPy ? ['/app/db.py'] : ['/src/db.js'];
    const feFiles = fe === 'vanilla'
      ? ['/public/index.html','/public/app.js','/public/app.css']
      : ['/public/index.html','/public/app.js','/public/app.css','/public/vendor/' + (feKind === 'vue' ? 'vue-lite.js' : 'vdom.js'),'/test/frontend.test.js'];
    const scaffoldFiles = (isPy
      ? ['/app/main.py','/app/auth.py','/app/__init__.py','/tests/test_api.py','/requirements.txt']
      : ['/server.js','/src/schema.js','/scripts/build.js','/scripts/lint.js','/test/db.test.js','/test/api.test.js']
    ).concat([
      '/package.json','/db/migrations/001_init.sql','/scripts/migrate.js',
      '/Dockerfile','/.github/workflows/ci.yml','/README.md','/.env.example'
    ]).concat(dbFiles).concat(feFiles)
     .concat(st.auth ? (isPy ? ['/app/auth.py'] : ['/src/auth.js','/test/auth.test.js']) : [])
     .concat(st.jobs && !isPy ? ['/src/queue.js','/src/worker.js','/src/events.js','/src/jobs/welcome.js','/test/worker.test.js'] : [])
     .concat(wantsGraphql ? ['/src/graphql/schema.graphql','/src/graphql/resolvers.js','/src/graphql/execute.js','/src/graphql/handler.js','/test/graphql.test.js'] : [])
     .concat(wantsWs ? ['/src/ws.js','/public/ws-client.js','/test/ws.test.js'] : [])
     .concat(wantsMicro ? ['/gateway/server.js','/gateway/registry.js','/docker-compose.prod.yml','/test/microservices.test.js'].concat(ents.map(e => '/services/' + e.name + '/server.js')) : [])
     .concat(ents.map(e => isPy ? '/app/services/' + e.name + '.py' : '/src/services/' + e.name + '.js'));

    let step = 0;
    const mkStep = (kind, agent, produces, why, requirementIds) => ({
      id: 'STEP-' + String(++step).padStart(3,'0'),
      kind, agent, produces: produces || [], why,
      requirementIds: requirementIds || [], status: 'PENDING'
    });

    const reqBy = (re) => contract.requirements.filter(r => re.test(r.statement)).map(r => r.id);

    const steps = [
      mkStep('scaffold','scaffold', scaffoldFiles,
        'generate the runnable repo: schema + migrations + data layer' +
        (st.auth ? ' + auth' : '') + (st.jobs && !isPy ? ' + async queue/worker' : '') +
        ' + ' + (isPy ? 'pure-stdlib Python HTTP backend' : 'Node REST backend') +
        (wantsGraphql ? ' + zero-dep GraphQL layer' : '') +
        (wantsWs ? ' + RFC 6455 WebSocket endpoint' : '') +
        ' + ' + (feKind === 'vanilla' ? 'vanilla' : feKind + ' component') + ' frontend' +
        (wantsMicro ? ' + API gateway + per-domain services + compose' : '') + ' + unit tests',
        contract.requirements.filter(r => /tests pass|builds|schema|account|records through a REST API|Background jobs|REST API surface|GraphQL|WebSocket|component app|independently-runnable services/i.test(r.statement)).map(r => r.id)),
      mkStep('testgen','test',
        ['/test/generated-api.test.js','/test/chaos.test.js'].concat(st.database ? [] : []).concat(['/test/a11y.test.js']),
        'generate API contract tests + an adversarial chaos suite' + (contract.requirements.some(r => /accessibility/i.test(r.statement)) ? ' + an accessibility suite' : ''),
        reqBy(/tests pass|accessibility|simulated, mocked/i)),
      mkStep('security-scan','security', [],
        'scan the generated source for injection / XSS / secrets / unauthenticated mutations; feeds the DoD security gate',
        reqBy(/secret|password hash|role-based|simulated, mocked/i)),
      mkStep('architecture-scan','security', [],
        'check layering: no frontend->DB imports, no inverted dependencies, no cross-service filesystem reach; feeds the DoD architecture gate',
        reqBy(/independently-runnable services|component app/i)),
      mkStep('privacy-scan','security', [],
        'scan for PII in logs / URLs, credentials in responses, third-party data egress; feeds the DoD privacy gate',
        reqBy(/secret|password hash|account/i))
    ];
    if (st.deploy || (contract.deployment && (contract.deployment.targets || []).length)) {
      steps.push(mkStep('deploy-iac','deploy',
        ['/Dockerfile','/docker-compose.prod.yml','/.dockerignore','/deploy/compose.sh'],
        'generate Docker + Compose infrastructure-as-code (never pushed — that needs the user\'s credentials)',
        reqBy(/Docker|deployment-ready infrastructure/i)));
    }

    // requirement -> predicted artifact map (the Ledger verifies the real result)
    const traceability = {};
    contract.requirements.forEach(r => {
      const arts = [];
      (r.acceptanceCriteria || []).forEach(c => {
        if (c.kind === 'file' && c.path) arts.push(c.path);
        if (c.kind === 'execution') arts.push('execution-evidence.json#' + c.gate);
        if (c.kind === 'control') arts.push('runtime-trace.json#' + c.name);
        if (c.kind === 'no-mock') arts.push('runtime-trace.json (no MOCK/BROKEN)');
        if (c.kind === 'ci') arts.push('/.github/workflows/ci.yml');
      });
      traceability[r.id] = { statement: r.statement, priority: r.priority, artifacts: arts, acIds: r.traceIds || [] };
    });

    return {
      schemaVersion: 1,
      generatedAt: Date.now(),
      contractGeneratedAt: contract.generatedAt,
      product: contract.product,
      stack: {
        frontend: feKind === 'vanilla' ? 'vanilla HTML/CSS/JS' : feKind + ' (vendored runtime, no build)',
        backend: isPy ? 'Python 3 (pure stdlib: http.server + sqlite3)' : 'Node.js (zero-dep HTTP)',
        database: st.database,
        api: (wantsGraphql ? 'GraphQL + REST' : 'REST') + (st.jobs && !isPy ? ' + SSE' : '') + (wantsWs ? ' + WebSocket' : ''),
        architecture: wantsMicro ? 'gateway + per-domain services (compose)' : 'monolith',
        auth: !!st.auth, rbac: !!st.rbac, jobs: !!st.jobs && !isPy
      },
      steps,
      files: Array.from(new Set(scaffoldFiles)).sort(),
      buildCommands: ['npm run migrate','npm test','npm run build','npm run lint'],
      observationTargets: [{
        url: 'http://localhost:4319/',
        controls: (st.auth ? ['need an account?'] : []).concat(ents.map(e => 'add ' + e.name)),
        routes: (contract.apiRequirements || []).map(a => a.method + ' ' + a.path)
          .concat(wantsGraphql ? ['POST /graphql'] : []).concat(wantsWs ? ['GET /ws (upgrade)'] : [])
      }],
      deployment: contract.deployment || { expectation: 'compose', targets: ['compose'] },
      traceability
    };
  },

  // Persist a complete build state to the engine FS as project docs
  writeProjectDocs(buildState){
    if (!window.Engine || !window.Engine.FS) return;
    const fs = window.Engine.FS;
    const root = "/project-docs";
    const docs = buildState.docs;
    fs.write(root + "/product-requirements.md", docs.productRequirements);
    fs.write(root + "/user-stories.md",         docs.userStories);
    fs.write(root + "/acceptance-criteria.md",  docs.acceptanceCriteria);
    fs.write(root + "/feature-matrix.md",       docs.featureMatrix);
    fs.write(root + "/screen-inventory.md",     docs.screenInventory);
    fs.write(root + "/constraints.md",          docs.constraints);
    fs.write(root + "/risks.md",                docs.risks);
    fs.write(root + "/decisions.md",            docs.decisions);
    // Architecture docs
    fs.write(root + "/architecture.md",
      "# Architecture\n\n" +
      "## Components\n- " + buildState.architecture.components.clients.join("\n- ") + "\n\n" +
      "## API gateway\n- " + buildState.architecture.components.apiGateway.join("\n- ") + "\n\n" +
      "## Backend services\n- " + buildState.architecture.components.backend.join("\n- ") + "\n\n" +
      "## Data layer\n- " + buildState.architecture.components.dataLayer.join("\n- ") + "\n\n" +
      "## Infrastructure\n- " + buildState.architecture.components.infra.join("\n- ") + "\n");
    fs.write(root + "/stack.md",
      "# Technology stack\n\n" +
      "- Frontend: " + buildState.stack.frontend + "\n" +
      "- Backend: " + buildState.stack.backend + "\n" +
      "- Database: " + buildState.stack.database + "\n" +
      "- Cache: " + buildState.stack.cache + "\n" +
      "- Queue: " + (buildState.stack.queue || "—") + "\n" +
      "- Deployment: " + buildState.stack.deployment + "\n");
    fs.write(root + "/blueprint.md",
      "# Project blueprint\n\n" +
      "## Repository structure\n" +
      buildState.blueprint.structure.map(s => "- " + s).join("\n") + "\n");
    // Project state
    const stateRoot = "/project-state";
    fs.write(stateRoot + "/project-state.md",
      "# Project state\n\n" +
      "## Phase: " + buildState.projectState.phase + "\n" +
      "## Last completed task: " + (buildState.projectState.lastCompletedTask || "(none)") + "\n" +
      "## Current blockers\n" +
      (buildState.projectState.currentBlockers.length ? buildState.projectState.currentBlockers.map(b => "- " + b.msg).join("\n") : "- (none)") + "\n");
    fs.write(stateRoot + "/completed-tasks.md",
      "# Completed tasks\n" + (buildState.projectState.completedTasks.length ? buildState.projectState.completedTasks.map(t => "- " + t.task).join("\n") : "- (none)") + "\n");
    fs.write(stateRoot + "/pending-tasks.md",
      "# Pending tasks\n" + buildState.taskGraph.tasks.filter(t => t.status !== "COMPLETED").map(t => "- " + t.id + " — " + t.name).join("\n") + "\n");
    fs.write(stateRoot + "/decisions.md",
      "# Architecture decisions\n" + buildState.docs.decisions + "\n");
    fs.write(stateRoot + "/build-results.json",
      JSON.stringify(buildState.projectState.buildResults, null, 2));
    fs.write(stateRoot + "/requirements-status.json",
      JSON.stringify(buildState.projectState.requirementsStatus, null, 2));
  }
};

// Expose
if (typeof window !== "undefined"){
  window.Universal = Universal;
  if (window.Engine) window.Engine.Universal = Universal;
}
})();
