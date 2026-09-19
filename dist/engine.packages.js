/* =====================================================================
   engine.packages.js — real desktop/mobile packages from the prompted app.

   After the Agent writes /index.html (and CSS/JS), this wraps that product in:
     web zip, Electron (Windows/macOS/Linux), Android WebView, iOS WKWebView.

   Continuous prompting: each follow-up re-syncs packages from the latest
   workspace files. Target chips (S.plat) actually select which trees exist.
   Analogues on existing screens — no new routes.
   ===================================================================== */
(function () {
  'use strict';
  const Engine = window.Engine || (window.Engine = {});
  const ALL = ['web', 'ios', 'android', 'windows', 'macos', 'linux'];
  const DESKTOP = ['windows', 'macos', 'linux'];

  function fs() { return Engine.FS; }
  function write(p, c) { try { fs().write(p, String(c == null ? '' : c)); return true; } catch (_) { return false; } }
  function read(p) { try { return fs().read(p) || ''; } catch (_) { return ''; } }
  function exists(p) { try { return !!(fs() && fs().exists && fs().exists(p)); } catch (_) { return false; } }
  function isFile(p) { try { return !!(fs() && fs().isFile && fs().isFile(p)); } catch (_) { return false; } }

  function slugify(s) {
    return String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app';
  }
  function productName() {
    const html = read('/index.html');
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
    if (title && title.trim()) return title.trim().slice(0, 60);
    const proj = Engine.Proj && Engine.Proj.current && Engine.Proj.current();
    return (proj && proj.name) || 'Generated App';
  }
  function productId(name) {
    return 'app.codesovereign.' + slugify(name).replace(/-/g, '');
  }

  function selected(prompt) {
    const out = [];
    const plat = (window.S && window.S.plat) || {};
    let univ = [];
    try {
      univ = (window.S && S.univ && S.univ.state && S.univ.state.normalized && S.univ.state.normalized.selectedPlatforms)
        || (window.Universal && Universal.PromptComposer && Universal.PromptComposer.fields && Universal.PromptComposer.fields.selectedPlatforms)
        || [];
    } catch (_) { univ = []; }
    const text = String(prompt || (window.S && S.lastPrompt) || '').toLowerCase();
    ALL.forEach(function (k) {
      const fromChip = !!plat[k];
      const fromUniv = univ.indexOf(k) >= 0 || univ.indexOf(k + '-desktop') >= 0;
      const fromPrompt = (k === 'ios' && /\bios\b|iphone|ipad|app store/.test(text))
        || (k === 'android' && /\bandroid\b|play store|apk/.test(text))
        || (k === 'windows' && /\bwindows\b|\.exe\b|win32/.test(text))
        || (k === 'macos' && /\bmacos\b|\bos x\b|\.dmg\b/.test(text))
        || (k === 'linux' && /\blinux\b|appimage|\.deb\b/.test(text))
        || (k === 'web' && /\bweb\b|pwa|browser/.test(text));
      if (fromChip || fromUniv || fromPrompt) out.push(k);
    });
    if (!out.length) out.push('web');
    return out;
  }

  function rewriteRefs(content) {
    return String(content == null ? '' : content)
      .replace(/(href|src)=(["'])\/(styles|scripts|assets|fonts)\//gi, '$1=$2$3/');
  }

  function productFiles() {
    const data = (fs() && fs()._data) || {};
    const out = [];
    Object.keys(data).forEach(function (p) {
      if (!isFile(p)) return;
      if (/^\/packages\//.test(p)) return;
      if (/^\/\.codesovereign\//.test(p)) return;
      if (/^\/project-docs\//.test(p) || /^\/project-state\//.test(p)) return;
      out.push({ path: p, content: read(p) });
    });
    return out;
  }

  function wwwCopies() {
    const files = productFiles();
    const copies = [];
    files.forEach(function (f) {
      let rel = f.path.replace(/^\//, '');
      if (rel === 'index.html' || /^styles\//.test(rel) || /^scripts\//.test(rel) || /^assets\//.test(rel) || /^fonts\//.test(rel)) {
        copies.push({ rel: rel, content: /\.html?$/i.test(rel) ? rewriteRefs(f.content) : f.content });
      }
    });
    if (!copies.some(function (c) { return c.rel === 'index.html'; })) {
      copies.unshift({ rel: 'index.html', content: rewriteRefs(read('/index.html') || '<!doctype html><title>App</title><h1>App</h1>') });
    }
    return copies;
  }

  /* ---------- STORE zip (no compression) so downloads are real .zip files ---------- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32Bytes(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(n) { const b = new Uint8Array(2); b[0] = n & 255; b[1] = (n >>> 8) & 255; return b; }
  function u32(n) {
    const b = new Uint8Array(4);
    b[0] = n & 255; b[1] = (n >>> 8) & 255; b[2] = (n >>> 16) & 255; b[3] = (n >>> 24) & 255;
    return b;
  }
  function concat(parts) {
    let n = 0;
    parts.forEach(function (p) { n += p.length; });
    const o = new Uint8Array(n);
    let i = 0;
    parts.forEach(function (p) { o.set(p, i); i += p.length; });
    return o;
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(s));
    const str = unescape(encodeURIComponent(String(s)));
    const b = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i);
    return b;
  }
  function buildZip(entries) {
    const now = new Date();
    const time = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() / 2) & 0x1F);
    const date = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);
    const chunks = [];
    const central = [];
    let offset = 0;
    entries.forEach(function (e) {
      const nameBuf = utf8(String(e.name || 'file').replace(/^\/+/, ''));
      const raw = e.data instanceof Uint8Array ? e.data : utf8(e.data == null ? '' : e.data);
      const crc = crc32Bytes(raw);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
        u32(crc), u32(raw.length), u32(raw.length), u16(nameBuf.length), u16(0),
        nameBuf, raw
      ]);
      chunks.push(local);
      const cd = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
        u32(crc), u32(raw.length), u32(raw.length), u16(nameBuf.length), u16(0),
        u16(0), u16(0), u16(0), u32(0), u32(offset), nameBuf
      ]);
      central.push(cd);
      offset += local.length;
    });
    const centralBuf = concat(central);
    const end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(centralBuf.length), u32(offset), u16(0)
    ]);
    return concat(chunks.concat([centralBuf, end]));
  }

  function listUnder(prefix) {
    const data = (fs() && fs()._data) || {};
    const out = [];
    Object.keys(data).forEach(function (p) {
      if (isFile(p) && p.indexOf(prefix) === 0) out.push(p);
    });
    return out.sort();
  }

  function zipPrefix(prefix, rootName) {
    const files = listUnder(prefix);
    const entries = files.map(function (p) {
      let rel = p.slice(prefix.length).replace(/^\/+/, '');
      if (rootName) rel = rootName.replace(/\/$/, '') + '/' + rel;
      return { name: rel, data: read(p) };
    });
    return buildZip(entries);
  }

  function downloadBytes(bytes, filename, mime) {
    if (typeof document === 'undefined' || !document.createElement) {
      return { ok: true, filename: filename, bytes: bytes.length, blob: false };
    }
    const blob = new Blob([bytes], { type: mime || 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (_) {} }, 1000);
    return { ok: true, filename: filename, bytes: bytes.length, blob: true };
  }

  /* ---------- generators ---------- */
  function writeWww(base) {
    const copies = wwwCopies();
    copies.forEach(function (c) { write(base + '/' + c.rel, c.content); });
    return copies.length;
  }

  function writeWeb(name, slug) {
    const n = writeWww('/packages/web');
    write('/packages/web/README.md',
      '# ' + name + ' (Web)\n\nOpen `index.html` in a browser, or:\n\n```\nnpx --yes serve .\n```\n\nThis folder is the source UI. Follow-up prompts in CodeSovereign keep updating it.\n');
    write('/packages/web/package.json', JSON.stringify({
      name: slug, version: '1.0.0', private: true,
      scripts: { start: 'npx --yes serve .', preview: 'npx --yes serve .' }
    }, null, 2));
    return n + 2;
  }

  function writeDesktop(name, slug, plats) {
    const id = productId(name);
    writeWww('/packages/desktop/renderer');
    write('/packages/desktop/main.js',
      "const { app, BrowserWindow } = require('electron');\nconst path = require('path');\n"
      + "function create() {\n"
      + "  const win = new BrowserWindow({ width: 1100, height: 760, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });\n"
      + "  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));\n"
      + "}\n"
      + "app.whenReady().then(create);\n"
      + "app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });\n"
      + "app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) create(); });\n");
    write('/packages/desktop/preload.js',
      "const { contextBridge } = require('electron');\ncontextBridge.exposeInMainWorld('generatedApp', { platform: process.platform });\n");
    const targets = {
      appId: id,
      productName: name,
      files: ['**/*'],
      directories: { output: 'dist' },
      win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }] },
      mac: { target: [{ target: 'dmg', arch: ['universal'] }], category: 'public.app-category.productivity' },
      linux: { target: ['AppImage', 'deb'], category: 'Utility' }
    };
    write('/packages/desktop/package.json', JSON.stringify({
      name: slug,
      version: '1.0.0',
      private: true,
      main: 'main.js',
      scripts: {
        start: 'electron .',
        dist: 'electron-builder',
        'dist:win': 'electron-builder --win nsis portable',
        'dist:mac': 'electron-builder --mac dmg',
        'dist:linux': 'electron-builder --linux AppImage deb'
      },
      devDependencies: { electron: '^28.3.3', 'electron-builder': '^24.13.3' },
      build: targets
    }, null, 2));
    write('/packages/desktop/electron-builder.yml',
      'appId: ' + id + '\nproductName: "' + name.replace(/"/g, '') + '"\nfiles:\n  - "**/*"\nwin:\n  target:\n    - nsis\n    - portable\nmac:\n  target:\n    - dmg\nlinux:\n  target:\n    - AppImage\n    - deb\n');
    write('/packages/desktop/README.md',
      '# ' + name + ' — desktop (' + plats.join(', ') + ')\n\nElectron shell around the prompted UI. Real installers:\n\n```\ncd packages/desktop\nnpm install\nnpm start                 # run it\nnpm run dist:win          # .exe (NSIS + portable)\nnpm run dist:mac          # .dmg (needs macOS)\nnpm run dist:linux        # AppImage + .deb\n```\n\nFollow-up prompts in CodeSovereign refresh `renderer/` from the live app.\n');
    return true;
  }

  function writeAndroid(name, slug) {
    writeWww('/packages/android/app/src/main/assets/www');
    write('/packages/android/settings.gradle', "rootProject.name = '" + slug + "'\ninclude ':app'\n");
    write('/packages/android/build.gradle',
      'buildscript {\n  repositories { google(); mavenCentral() }\n  dependencies {\n    classpath "com.android.tools.build:gradle:8.2.2"\n    classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22"\n  }\n}\nallprojects { repositories { google(); mavenCentral() } }\n');
    write('/packages/android/gradle.properties', 'org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\n');
    write('/packages/android/gradle/wrapper/gradle-wrapper.properties',
      'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n');
    write('/packages/android/app/build.gradle',
      'plugins { id "com.android.application"; id "org.jetbrains.kotlin.android" }\n'
      + 'android {\n  namespace "app.generated"\n'
      + '  compileSdk 34\n  defaultConfig { applicationId "app.generated.' + slug.replace(/-/g, '') + '"; minSdk 24; targetSdk 34; versionCode 1; versionName "1.0" }\n'
      + '  buildTypes { release { minifyEnabled false } }\n}\n'
      + 'dependencies { implementation "androidx.appcompat:appcompat:1.6.1" }\n');
    write('/packages/android/app/src/main/AndroidManifest.xml',
      '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n'
      + '  <uses-permission android:name="android.permission.INTERNET"/>\n'
      + '  <application android:label="' + name.replace(/"/g, '') + '" android:usesCleartextTraffic="true" android:theme="@style/Theme.AppCompat.NoActionBar">\n'
      + '    <activity android:name=".MainActivity" android:exported="true">\n'
      + '      <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>\n'
      + '    </activity>\n  </application>\n</manifest>\n');
    write('/packages/android/app/src/main/java/app/generated/MainActivity.kt',
      'package app.generated\n'
      + 'import android.os.Bundle\nimport android.webkit.WebChromeClient\nimport android.webkit.WebView\nimport android.webkit.WebViewClient\nimport androidx.appcompat.app.AppCompatActivity\n'
      + 'class MainActivity : AppCompatActivity() {\n'
      + '  override fun onCreate(savedInstanceState: Bundle?) {\n'
      + '    super.onCreate(savedInstanceState)\n'
      + '    val web = WebView(this)\n'
      + '    web.settings.javaScriptEnabled = true\n'
      + '    web.settings.domStorageEnabled = true\n'
      + '    web.settings.allowFileAccess = true\n'
      + '    web.webViewClient = WebViewClient()\n'
      + '    web.webChromeClient = WebChromeClient()\n'
      + '    web.loadUrl("file:///android_asset/www/index.html")\n'
      + '    setContentView(web)\n'
      + '  }\n}\n');
    write('/packages/android/app/src/main/res/values/strings.xml',
      '<resources><string name="app_name">' + name.replace(/[<>]/g, '') + '</string></resources>\n');
    write('/packages/android/README.md',
      '# ' + name + ' — Android\n\nNative WebView app that loads the prompted UI from `app/src/main/assets/www`.\n\n```\ncd packages/android\ngradle wrapper        # once, if gradlew is missing\n./gradlew assembleDebug\n```\n\nAPK: `app/build/outputs/apk/debug/app-debug.apk`. Needs the Android SDK. Follow-up prompts refresh the `www` assets.\n');
    return true;
  }

  function writeIos(name, slug) {
    writeWww('/packages/ios/www');
    write('/packages/ios/App/App.swift',
      'import SwiftUI\n@main\nstruct GeneratedApp: App {\n  var body: some Scene { WindowGroup { ContentView() } }\n}\n');
    write('/packages/ios/App/ContentView.swift',
      'import SwiftUI\nimport WebKit\nstruct ContentView: View {\n  var body: some View { WebView().ignoresSafeArea() }\n}\n'
      + 'struct WebView: UIViewRepresentable {\n'
      + '  func makeUIView(context: Context) -> WKWebView {\n'
      + '    let w = WKWebView()\n'
      + '    if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {\n'
      + '      w.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())\n'
      + '    }\n'
      + '    return w\n'
      + '  }\n  func updateUIView(_ uiView: WKWebView, context: Context) {}\n}\n');
    write('/packages/ios/App/Info.plist',
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
      + '<plist version="1.0"><dict>\n'
      + '<key>CFBundleName</key><string>' + name.replace(/[<>]/g, '') + '</string>\n'
      + '<key>CFBundleIdentifier</key><string>' + productId(name) + '</string>\n'
      + '<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>\n'
      + '<key>UILaunchScreen</key><dict/>\n'
      + '</dict></plist>\n');
    write('/packages/ios/project.yml',
      'name: ' + slug + '\noptions:\n  bundleIdPrefix: ' + productId(name) + '\n'
      + 'targets:\n  App:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n'
      + '    sources: [App, www]\n    info:\n      path: App/Info.plist\n      properties:\n        CFBundleDisplayName: "' + name.replace(/"/g, '') + '"\n'
      + '    settings:\n      base:\n        PRODUCT_BUNDLE_IDENTIFIER: ' + productId(name) + '\n        GENERATE_INFOPLIST_FILE: NO\n');
    write('/packages/ios/README.md',
      '# ' + name + ' — iOS\n\nWKWebView app that loads the prompted UI from `www/`.\n\n```\ncd packages/ios\nbrew install xcodegen     # once\nxcodegen generate\nxcodebuild -scheme App -sdk iphonesimulator -configuration Debug\n```\n\nNeeds macOS + Xcode. Follow-up prompts refresh `www/`.\n');
    return true;
  }

  function sync(opts) {
    opts = opts || {};
    if (!exists('/index.html') && !(read('/index.html'))) {
      return { ok: false, error: 'no /index.html yet', platforms: [], files: 0 };
    }
    const name = productName();
    const slug = slugify(name);
    const plats = (opts.platforms && opts.platforms.length) ? opts.platforms.slice() : selected(opts.prompt);
    const written = [];
    if (plats.indexOf('web') >= 0) { writeWeb(name, slug); written.push('web'); }
    const desk = plats.filter(function (p) { return DESKTOP.indexOf(p) >= 0; });
    if (desk.length) { writeDesktop(name, slug, desk); written.push('desktop'); }
    if (plats.indexOf('android') >= 0) { writeAndroid(name, slug); written.push('android'); }
    if (plats.indexOf('ios') >= 0) { writeIos(name, slug); written.push('ios'); }
    const rec = {
      ok: true,
      name: name,
      slug: slug,
      platforms: plats,
      trees: written,
      files: listUnder('/packages/').length,
      at: Date.now()
    };
    try {
      if (window.S) window.S.lastPackages = rec;
    } catch (_) {}
    return rec;
  }

  function prefixFor(kind) {
    if (kind === 'windows' || kind === 'macos' || kind === 'linux' || kind === 'desktop') return '/packages/desktop';
    if (kind === 'android') return '/packages/android';
    if (kind === 'ios') return '/packages/ios';
    return '/packages/web';
  }

  function zipKind(kind) {
    const name = productName();
    const slug = slugify(name);
    const prefix = prefixFor(kind);
    if (!listUnder(prefix).length) sync({ platforms: selected().concat([kind === 'desktop' ? 'windows' : kind]) });
    const root = slug + '-' + (kind === 'desktop' ? 'desktop' : kind);
    return { filename: root + '.zip', bytes: zipPrefix(prefix, root) };
  }

  function download(kind) {
    const z = zipKind(kind);
    return Object.assign(downloadBytes(z.bytes, z.filename), { kind: kind });
  }

  function downloadAll() {
    const rec = sync();
    const entries = listUnder('/packages/').map(function (p) {
      return { name: slugify(productName()) + '-packages' + p.replace(/^\/packages/, ''), data: read(p) };
    });
    const bytes = buildZip(entries);
    return Object.assign(downloadBytes(bytes, slugify(productName()) + '-packages.zip'), rec);
  }

  async function build(kind) {
    const rec = sync();
    const ex = window.CSExec;
    if (!ex || !ex.available || !ex.available()) {
      return { ok: false, skipped: true, reason: 'desktop shell required to compile installers', rec: rec, hint: 'Download the zip and run the README commands, or open this project in the CodeSovereign desktop app.' };
    }
    if (kind === 'android') {
      const r = await ex.run('./gradlew', ['assembleDebug'], { cwdHint: 'packages/android', label: 'android apk' });
      return { ok: r.code === 0, rec: rec, output: r.output, artifact: 'app-debug.apk' };
    }
    if (kind === 'ios') {
      return { ok: false, skipped: true, rec: rec, hint: 'iOS packages need macOS + Xcode. Download the iOS zip and run xcodegen generate && xcodebuild.' };
    }
    const script = kind === 'windows' ? 'dist:win' : kind === 'macos' ? 'dist:mac' : kind === 'linux' ? 'dist:linux' : 'dist';
    if (typeof ex.build === 'function' && script === 'dist') {
      const r = await ex.build();
      return { ok: r.code === 0, rec: rec, output: r.output };
    }
    const r = await ex.run('npm', ['run', script], { cwdHint: 'packages/desktop', label: 'electron ' + script });
    return { ok: r.code === 0, rec: rec, output: r.output, script: script };
  }

  function status() {
    return {
      selected: selected(),
      web: listUnder('/packages/web').length,
      desktop: listUnder('/packages/desktop').length,
      android: listUnder('/packages/android').length,
      ios: listUnder('/packages/ios').length,
      last: (window.S && S.lastPackages) || null
    };
  }

  function platformBlock(prompt) {
    const plats = selected(prompt);
    return [
      'CONTINUOUS SESSION: each user message extends THIS same app. Do not start over unless they say start over.',
      'TARGET PLATFORMS: ' + plats.join(', ') + '.',
      'Always ship a working /index.html UI. CodeSovereign then wraps it into real packages:',
      '- web zip, Electron (Windows NSIS/portable, macOS dmg, Linux AppImage/deb), Android WebView (assembleDebug APK), iOS WKWebView (Xcode).',
      'Follow-ups may add screens, fix bugs, or ask for another platform — keep the product identity.'
    ].join('\n');
  }

  function syncFromRun(prompt, steps) {
    const wrote = (steps || []).some(function (s) {
      return s && (s.kind === 'write' || (s.kind === 'observe' && s.result && s.result.written && s.result.written.length));
    });
    if (!wrote && !exists('/index.html')) return null;
    if (!wrote) return null;
    return sync({ prompt: prompt });
  }

  function patchAgent() {
    if (!Engine.Agent || typeof Engine.Agent.run !== 'function') return false;
    if (Engine.Agent.__pkgPatched) return true;
    const orig = Engine.Agent.run.bind(Engine.Agent);
    Engine.Agent.run = function (prompt, onStep) {
      return orig(prompt, function (step) {
        onStep && onStep(step);
      }).then(function (steps) {
        try {
          const rec = syncFromRun(prompt, steps);
          if (rec && rec.ok) {
            const step = { kind: 'packages', text: 'Packages ready: ' + rec.trees.join(', ') + ' (' + rec.files + ' files). Keep prompting to grow this app.', rec: rec };
            steps.push(step);
            onStep && onStep(step);
          }
        } catch (_) {}
        return steps;
      });
    };
    Engine.Agent.__pkgPatched = true;
    return true;
  }

  Engine.Packages = {
    ALL: ALL,
    selected: selected,
    sync: sync,
    status: status,
    download: download,
    downloadAll: downloadAll,
    zipKind: zipKind,
    build: build,
    platformBlock: platformBlock,
    rewriteRefs: rewriteRefs,
    buildZip: buildZip,
    productName: productName,
    patchAgent: patchAgent
  };

  function tryPatch() {
    if (patchAgent()) return;
    setTimeout(tryPatch, 40);
  }
  tryPatch();
})();
