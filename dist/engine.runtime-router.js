/* =====================================================================
   engine.runtime-router.js  —  Engine.RuntimeRouter

   The multi-runtime verification router from the Three-Blocked-Capabilities
   plan. CodeSovereign no longer assumes every target runs inside one web
   observer: it detects the target, routes to the right execution + verification
   adapter, and returns PASS / FAIL / BLOCKED.

     WEB        -> Chromium observer            (Engine.UltraMode default path)
     DESKTOP    -> Electron runtime
     ANDROID    -> Android SDK + emulator + adb  (Engine.Mobile)
     IOS        -> macOS worker + simulator      (Engine.Mobile, BLOCKED off-macOS)
     EVM        -> solc + local chain / Foundry  (Engine.Blockchain)
     ML         -> PyTorch training run          (Engine.ML)
     NODE       -> Node runtime
     PYTHON     -> Python runtime + unittest

   support != environment availability. A target is fully SUPPORTED even when
   this host can't execute it — the run then returns BLOCKED with a precise
   machine-readable reason (FOUNDRY_NOT_INSTALLED, ANDROID_SDK_REQUIRED,
   DATASET_REQUIRED, MACOS_RUNNER_REQUIRED, INSUFFICIENT_COMPUTE, …).

   window.Engine.RuntimeRouter
     TARGETS
     targetOf(contract)          -> 'web' | 'android' | 'ios' | 'evm' | 'ml-training' | …
     requirements(target)        -> [{ tool, why, install }]
     adapterEngine(target)       -> Engine.Blockchain | Engine.Mobile | Engine.ML | null
     probe(target?)              -> Promise<{ target, available, canRun, missing[], reason, host }>
     route(contract)             -> { target, adapter, engine, verify(fn), webPath:boolean }
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  var TARGETS = {
    web:           { label: 'Web application',        adapter: 'web',        webPath: true },
    desktop:       { label: 'Desktop application (Tauri / Electron)', adapter: 'desktop', webPath: false },
    extension:     { label: 'Browser extension (MV3)', adapter: 'extension', webPath: false },
    android:       { label: 'Native Android app',     adapter: 'mobile',     webPath: false },
    ios:           { label: 'Native iOS app',         adapter: 'mobile',     webPath: false },
    evm:           { label: 'Ethereum / EVM contracts', adapter: 'blockchain', webPath: false },
    'ml-training': { label: 'ML model training',      adapter: 'ml',         webPath: false }
  };

  var REQUIREMENTS = {
    android: [
      { tool: 'Android SDK + platform-tools', why: 'build and install the generated APK', install: 'https://developer.android.com/studio' },
      { tool: 'JDK 17+', why: 'Gradle / Android Gradle Plugin', install: 'https://adoptium.net' },
      { tool: 'Android Emulator + an AVD + HW acceleration (WHPX/HAXM/KVM)', why: 'run and observe the app', install: 'sdkmanager "emulator" "system-images;android-34;google_apis;x86_64" && avdmanager create avd -n cs -k "system-images;android-34;google_apis;x86_64"' },
      { tool: 'Maestro (optional)', why: 'drive UI flows', install: 'https://github.com/mobile-dev-inc/Maestro' }
    ],
    ios: [
      { tool: 'macOS worker with Xcode', why: 'xcodebuild + iOS Simulator + simctl', install: 'https://developer.apple.com/xcode/' }
    ],
    evm: [
      { tool: 'Bundled solc + @ethereumjs/vm', why: 'compile + run a local deterministic chain in-loop', install: 'ships with CodeSovereign' },
      { tool: 'Foundry (optional, richer testing)', why: 'forge fuzz/invariant tests + anvil', install: 'curl -L https://foundry.paradigm.xyz | bash && foundryup' },
      { tool: 'Slither (optional)', why: 'deeper static security analysis', install: 'pipx install slither-analyzer' }
    ],
    'ml-training': [
      { tool: 'Python 3.10+ and PyTorch', why: 'run the real training loop', install: 'https://pytorch.org' },
      { tool: 'A dataset under dataset/ (for "train on our data")', why: 'there is no verifiable trained artifact without data', install: 'drop jsonl/csv/txt files in dataset/' },
      { tool: 'CUDA GPU (for large models)', why: 'full fine-tuning / pretraining needs VRAM; QLoRA/LoRA run smaller', install: 'https://pytorch.org/get-started/locally/' },
      { tool: 'Axolotl / TRL (optional, for LLM fine-tuning)', why: 'SFT / DPO / GRPO workflows', install: 'pip install axolotl-ai trl transformers datasets peft' }
    ],
    desktop: [
      { tool: 'Rust + Cargo (Tauri)', why: '`cargo check` proves the Rust core compiles', install: 'curl https://sh.rustup.rs -sSf | sh  (https://github.com/rust-lang/rustup)' },
      { tool: '@tauri-apps/cli + a system webview (WebView2 on Windows)', why: 'the packaged .app/.exe build', install: 'npm i -D @tauri-apps/cli' },
      { tool: 'Electron (alternative)', why: 'headless boot smoke + electron-forge make', install: 'npm i -D electron @electron-forge/cli' }
    ],
    extension: [
      { tool: 'zero deps for the plain path', why: 'static MV3 validation + a store-only zip run with nothing installed', install: 'ships with CodeSovereign' },
      { tool: 'WXT / Plasmo (optional)', why: 'a bundled build with HMR', install: 'npm i -D wxt  (https://github.com/wxt-dev/wxt)' },
      { tool: 'Playwright + Chromium', why: 'load the unpacked extension + drive the popup / content script / service worker', install: 'npm i -D playwright && npx playwright install chromium' }
    ]
  };

  // Prompt / contract -> target. Contract.deriveFromPrompt already sets .target;
  // this also works from a raw contract that predates that field.
  var TARGET_RE = [
    ['extension', /\b(browser extension|chrome extension|firefox extension|edge extension|web ?extension|manifest v3|mv3 extension|content script|browser add-?on)\b/i],
    ['desktop', /\b(desktop app(?:lication)?|native desktop|tauri app|electron app|menu ?bar app|system tray app|cross-platform desktop)\b/i],
    ['ios', /\b(swift ?ui|swiftui|\bswift\b|xcode|\.ipa\b|app ?store\b|iphone app|ipad app|ios app|ios-only|for ios)\b/i],
    ['android', /\b(android app|android application|\.apk\b|play ?store|jetpack compose|android kotlin|kotlin android|native android|react native|flutter|expo|native mobile|mobile app(?! ?builder)|mobile-only)\b/i],
    ['evm', /\b(smart contract|solidity|\bevm\b|erc-?20|erc-?721|erc-?1155|nft (mint|contract|collection)|on-chain|web3 (dapp|app|contract)|foundry|hardhat|defi protocol|dao contract|token contract)\b/i],
    ['ml-training', /\b(train (a|an|the|our|my)? ?(new )?(ml |ai |deep learning )?model|model training|fine-?tun(e|ing) (a|an|the|our)? ?(model|llm|network)|from-scratch training|pre-?train(ing)? (a|an)? ?(model|llm)|train a (neural net|transformer|classifier|lstm|cnn)|lora|qlora|\bsft\b|\bdpo\b|\bgrpo\b|reinforcement learning from)\b/i]
  ];

  function targetOf(contract) {
    if (contract && contract.target && TARGETS[contract.target]) return contract.target;
    var text = contract && contract.product && (contract.product.prompt || contract.product.objective) || '';
    for (var i = 0; i < TARGET_RE.length; i++) if (TARGET_RE[i][1].test(text)) return TARGET_RE[i][0];
    return 'web';
  }

  function requirements(target) { return REQUIREMENTS[target] || []; }

  function adapterEngine(target) {
    var t = TARGETS[target];
    if (!t) return null;
    if (t.adapter === 'blockchain') return Engine.Blockchain || null;
    if (t.adapter === 'mobile') return Engine.Mobile || null;
    if (t.adapter === 'ml') return Engine.ML || null;
    if (t.adapter === 'desktop') return Engine.Desktop || null;
    if (t.adapter === 'extension') return Engine.Extension || null;
    return null;
  }

  // Probe this host for the target's runtime. Read-only; safe to call anytime.
  function probe(target) {
    var CA = window.CSAdapters;
    var p = CA && CA.probe ? CA.probe() : Promise.resolve({ host: { platform: 'browser' } });
    return p.then(function (h) {
      h = h || {};
      var out = { host: h.host || {}, probedAt: Date.now() };
      function shape(name, node, canKey) {
        node = node || {};
        return { available: !!node.available, canRun: canKey ? !!node[canKey] : !!node.available, detail: node };
      }
      out.web = { available: true, canRun: !!(window.desktop && window.desktop.isDesktop) };
      // desktop + extension: generation + static validation run everywhere; the
      // build/launch stages need a toolchain (cargo / electron / playwright).
      out.desktop = h.desktop ? shape('desktop', h.desktop, 'canRun') : { available: true, canRun: !!(h.host && (h.host.cargo || h.host.electron)) };
      out.extension = h.extension ? shape('extension', h.extension, 'canRun') : { available: true, canRun: !!(window.desktop && window.desktop.isDesktop) };
      out.evm = shape('evm', h.evm);
      out.android = shape('android', h.android, 'canRun');
      out.ios = shape('ios', h.ios, 'canRun');
      out.ios.available = true;   // SwiftUI generation + static validation run everywhere
      out['ml-training'] = shape('ml', h.ml);
      if (!target) return out;
      var r = out[target] || { available: false, canRun: false, detail: {} };
      var missing = [];
      if (target === 'evm' && !r.available) missing.push('solc / @ethereumjs/vm (bundled) or Foundry');
      if (target === 'android') {
        if (!r.detail.sdk) missing.push('ANDROID SDK'); if (!r.detail.java) missing.push('JDK');
        if (!r.detail.emulator || !r.detail.avds || !r.detail.avds.length) missing.push('emulator + an AVD');
        if (!r.detail.accel) missing.push('emulator hardware acceleration');
      }
      if (target === 'ios') {
        // source generation + static validation run on every host; only the
        // build/runtime stages may be host-limited.
        if (!r.detail.swift && !r.detail.xcode) missing.push('a Swift toolchain (for full static type-checking)');
        if (r.detail.os !== 'macos' && !r.detail.xcross && !r.detail.theos) missing.push('Xcode (macOS) or a compatible xcross/Theos adapter (for build + runtime)');
      }
      if (target === 'ml-training') {
        if (!r.detail.python) missing.push('Python'); if (!r.detail.torch) missing.push('PyTorch');
      }
      if (target === 'desktop') {
        if (!r.detail.cargo && !r.detail.electron) missing.push('Rust/Cargo (Tauri) or Electron');
        if (r.detail.cargo && !r.detail.tauriCli) missing.push('@tauri-apps/cli + a system webview (for the packaged build)');
      }
      if (target === 'extension') {
        if (!r.detail.playwright) missing.push('Playwright + Chromium (for load-unpacked inspection)');
      }
      return {
        target: target, host: out.host,
        available: r.available, canRun: r.canRun, missing: missing,
        reason: r.canRun ? null : (missing[0] ? missing.join(', ') + ' not available on this host' : null),
        detail: r.detail
      };
    });
  }

  function route(contract) {
    var target = targetOf(contract);
    var meta = TARGETS[target] || TARGETS.web;
    return {
      target: target,
      label: meta.label,
      adapter: meta.adapter,
      engine: adapterEngine(target),
      webPath: !!meta.webPath,
      requirements: requirements(target)
    };
  }

  Engine.RuntimeRouter = {
    TARGETS: TARGETS,
    targetOf: targetOf,
    requirements: requirements,
    adapterEngine: adapterEngine,
    probe: probe,
    route: route
  };
  console.info('[RuntimeRouter] multi-runtime verification router ready — Engine.RuntimeRouter');
})();
