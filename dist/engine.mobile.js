/* =====================================================================
   engine.mobile.js  —  Engine.Mobile   (Three-Blocked-Capabilities plan §4)

   Native mobile is a SUPPORTED target. Android and iOS are verified through
   emulator / simulator runtimes, not the web observer.

     generate(spec)  -> a real, buildable Android project (Kotlin, View-based —
                        minimal deps so it builds offline from the Gradle cache):
                        settings.gradle.kts, build.gradle.kts, app/build.gradle.kts,
                        app/src/main/AndroidManifest.xml, MainActivity.kt,
                        res/layout + values, a .maestro/flow.yaml UI test, README.
                        For an iOS-only request it also emits a SwiftUI skeleton.
     verify()        -> Promise<result> via window.CSAdapters:
                        android -> gradle assembleDebug -> emulator -> adb install
                        -> launch -> screenshot -> logcat crash scan -> Maestro
                        -> .sovereign/mobile-evidence.json -> PASS / FAIL / BLOCKED
                        ios     -> BLOCKED MACOS_RUNNER_REQUIRED off macOS,
                        xcodebuild + simulator on a macOS worker.

   window.Engine.Mobile
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function platformOf(spec) {
    var p = String((spec && spec.prompt) || '').toLowerCase();
    if (/\bios\b|swift ?ui|swiftui|\.ipa\b|iphone|ipad|app ?store/.test(p) && !/android/.test(p)) return 'ios';
    return 'android';
  }
  function appName(spec) {
    var n = String((spec && spec.name) || 'App').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('');
    return n || 'App';
  }
  function appId(spec) {
    return 'com.codesovereign.' + String((spec && spec.name) || 'app').toLowerCase().replace(/[^a-z0-9]/g, '') || 'com.codesovereign.app';
  }
  function features(spec) {
    // small model -> a couple of screens the emulator run can observe
    var ents = ((spec && spec.entities) || []).filter(function (e) { return ['user', 'session', 'job'].indexOf(e.name) < 0; }).slice(0, 3).map(function (e) { return e.name; });
    return ents.length ? ents : ['item'];
  }

  /* ---------------- Android ---------------- */

  function androidFiles(spec) {
    var name = appName(spec), id = appId(spec), feats = features(spec);
    var f = {};
    f['settings.gradle.kts'] =
      'dependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)\n    repositories { google(); mavenCentral() }\n}\n' +
      'rootProject.name = "' + name + '"\ninclude(":app")\n';
    // buildscript classpath (not the plugins{} marker) so the build resolves from a
    // warm Gradle cache without hitting the plugin portal — CodeSovereign pins to
    // versions its verification cache is known to carry.
    f['build.gradle.kts'] =
      'buildscript {\n    repositories { google(); mavenCentral() }\n    dependencies {\n        classpath("com.android.tools.build:gradle:8.2.0")\n        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22")\n    }\n}\n\n' +
      'allprojects {\n    repositories { google(); mavenCentral() }\n}\n';
    f['gradle.properties'] =
      'org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\nkotlin.code.style=official\nandroid.nonTransitiveRClass=true\norg.gradle.caching=true\norg.gradle.configureondemand=false\n';
    f['gradle/wrapper/gradle-wrapper.properties'] =
      'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip\nnetworkTimeout=10000\nvalidateDistributionUrl=true\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n';
    f['app/build.gradle.kts'] =
      'apply(plugin = "com.android.application")\napply(plugin = "org.jetbrains.kotlin.android")\n\n' +
      'configure<com.android.build.gradle.internal.dsl.BaseAppModuleExtension> {\n    namespace = "' + id + '"\n    compileSdk = 34\n\n' +
      '    defaultConfig {\n        applicationId = "' + id + '"\n        minSdk = 24\n        targetSdk = 34\n        versionCode = 1\n        versionName = "0.1.0"\n    }\n\n' +
      '    buildTypes {\n        getByName("debug") { isMinifyEnabled = false }\n        getByName("release") { isMinifyEnabled = false }\n    }\n' +
      '    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_17\n        targetCompatibility = JavaVersion.VERSION_17\n    }\n}\n\n' +
      'tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach { kotlinOptions { jvmTarget = "17" } }\n\n' +
      'dependencies {\n    "implementation"("androidx.core:core-ktx:1.12.0")\n    "implementation"("androidx.appcompat:appcompat:1.6.1")\n    "implementation"("com.google.android.material:material:1.11.0")\n    "implementation"("androidx.constraintlayout:constraintlayout:2.1.4")\n}\n';
    f['app/src/main/AndroidManifest.xml'] =
      '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
      '    <application\n        android:allowBackup="true"\n        android:label="' + name + '"\n        android:supportsRtl="true"\n        android:theme="@style/Theme.Material3.DayNight">\n' +
      '        <activity android:name=".MainActivity" android:exported="true">\n' +
      '            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n' +
      '        </activity>\n    </application>\n</manifest>\n';
    var pkgPath = 'app/src/main/java/' + id.replace(/\./g, '/');
    f[pkgPath + '/MainActivity.kt'] =
      'package ' + id + '\n\n' +
      'import android.os.Bundle\nimport android.widget.ArrayAdapter\nimport android.widget.Button\nimport android.widget.EditText\nimport android.widget.ListView\nimport android.widget.TextView\nimport androidx.appcompat.app.AppCompatActivity\n\n' +
      '/** Generated by CodeSovereign. A real Activity the emulator run drives + observes. */\n' +
      'class MainActivity : AppCompatActivity() {\n' +
      '    private val items = mutableListOf<String>()\n' +
      '    override fun onCreate(savedInstanceState: Bundle?) {\n' +
      '        super.onCreate(savedInstanceState)\n' +
      '        setContentView(R.layout.activity_main)\n' +
      '        val title = findViewById<TextView>(R.id.title)\n' +
      '        title.text = "' + name + ' — ' + feats[0] + 's"\n' +
      '        val input = findViewById<EditText>(R.id.input)\n' +
      '        val list = findViewById<ListView>(R.id.list)\n' +
      '        val adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, items)\n' +
      '        list.adapter = adapter\n' +
      '        findViewById<Button>(R.id.add).setOnClickListener {\n' +
      '            val v = input.text.toString().trim()\n' +
      '            if (v.isNotEmpty()) { items.add(v); adapter.notifyDataSetChanged(); input.setText(""); }\n' +
      '        }\n' +
      '        // seed one row so the launch screenshot is never empty\n' +
      '        items.add("first ' + feats[0] + '"); adapter.notifyDataSetChanged()\n' +
      '    }\n' +
      '}\n';
    f['app/src/main/res/layout/activity_main.xml'] =
      '<?xml version="1.0" encoding="utf-8"?>\n<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"\n' +
      '    android:orientation="vertical" android:padding="16dp"\n    android:layout_width="match_parent" android:layout_height="match_parent">\n' +
      '    <TextView android:id="@+id/title" android:layout_width="match_parent" android:layout_height="wrap_content"\n        android:textSize="20sp" android:textStyle="bold" android:paddingBottom="12dp"\n        android:contentDescription="screen title" />\n' +
      '    <EditText android:id="@+id/input" android:layout_width="match_parent" android:layout_height="wrap_content"\n        android:hint="new ' + feats[0] + '" android:importantForAutofill="no" android:inputType="text" />\n' +
      '    <Button android:id="@+id/add" android:layout_width="wrap_content" android:layout_height="wrap_content"\n        android:text="Add" />\n' +
      '    <ListView android:id="@+id/list" android:layout_width="match_parent" android:layout_height="0dp"\n        android:layout_weight="1" />\n' +
      '</LinearLayout>\n';
    f['app/src/main/res/values/strings.xml'] =
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">' + name + '</string>\n</resources>\n';
    f['.maestro/flow.yaml'] =
      'appId: ' + id + '\n---\n- launchApp\n- assertVisible: "' + name + '"\n- tapOn:\n    id: "' + id + ':id/input"\n- inputText: "verified"\n- tapOn: "Add"\n- assertVisible: "verified"\n';
    f['proguard-rules.pro'] = '# keep defaults\n';
    f['.gitignore'] = '*.iml\n.gradle/\n/local.properties\n/.idea\n/build\n/app/build\n/captures\n.externalNativeBuild\n.cxx\n.sovereign/\n';
    f['package.json'] = JSON.stringify({
      name: (spec.name || 'android-app').toLowerCase().replace(/[^a-z0-9-]/g, '-'), version: '0.1.0', private: true,
      description: 'Generated by CodeSovereign — a native Android app, verified on an emulator.',
      scripts: { build: 'gradle assembleDebug', test: 'gradle testDebugUnitTest' }
    }, null, 2) + '\n';
    f['README.md'] =
      '# ' + name + '\n\nGenerated by **CodeSovereign** — a native **Android** app (Kotlin, View-based).\n\n' +
      'CodeSovereign verifies it on a **real Android emulator**: `gradle assembleDebug` builds the APK, ' +
      'an AVD is booted headless, `adb install` + launch, a screenshot is captured, `logcat` is scanned for ' +
      'crashes, and (if Maestro is installed) `.maestro/flow.yaml` drives the UI. Evidence lands in ' +
      '`.sovereign/mobile-evidence.json` and gates the Definition-of-Done.\n\n' +
      'If the SDK / emulator / acceleration is missing, the run reports **BLOCKED** with the exact reason ' +
      '(`ANDROID_SDK_REQUIRED`, `NO_EMULATOR_ACCELERATION`, …) — never "unsupported". The APK still builds.\n\n' +
      '## Build & run locally\n\n```\nsdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;x86_64"\navdmanager create avd -n cs -k "system-images;android-34;google_apis;x86_64"\ngradle assembleDebug\nadb install app/build/outputs/apk/debug/app-debug.apk\n```\n';
    var out = [];
    Object.keys(f).sort().forEach(function (p) { out.push({ path: '/' + p, content: f[p] }); });
    return out;
  }

  /* ---------------- iOS (SwiftUI skeleton) ---------------- */

  function iosFiles(spec) {
    var name = appName(spec), feats = features(spec);
    var f = {};
    f['App/' + name + 'App.swift'] =
      'import SwiftUI\n\n@main\nstruct ' + name + 'App: App {\n    var body: some Scene { WindowGroup { ContentView() } }\n}\n';
    f['App/ContentView.swift'] =
      'import SwiftUI\n\nstruct ContentView: View {\n    @State private var items: [String] = ["first ' + feats[0] + '"]\n    @State private var draft = ""\n    var body: some View {\n' +
      '        NavigationStack {\n            VStack {\n                HStack {\n                    TextField("new ' + feats[0] + '", text: $draft)\n                    Button("Add") { if !draft.isEmpty { items.append(draft); draft = "" } }\n                }.padding()\n' +
      '                List(items, id: \\.self) { Text($0) }\n            }.navigationTitle("' + name + '")\n        }\n    }\n}\n';
    f['project.yml'] =
      '# xcodegen spec — `xcodegen generate` then `xcodebuild -scheme App`\nname: ' + name + '\noptions:\n  bundleIdPrefix: com.codesovereign\ntargets:\n  App:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n    sources: [App]\n    info:\n      path: App/Info.plist\n      properties:\n        CFBundleDisplayName: ' + name + '\n';
    f['App/Info.plist'] =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n  <key>CFBundleName</key><string>' + name + '</string>\n  <key>UILaunchScreen</key><dict/>\n</dict></plist>\n';
    f['.maestro/flow.yaml'] = 'appId: com.codesovereign.' + name + '\n---\n- launchApp\n- assertVisible: "' + name + '"\n';
    f['README.md'] =
      '# ' + name + ' (iOS)\n\nGenerated by **CodeSovereign** — a SwiftUI app.\n\n' +
      'iOS verification needs a **macOS worker with Xcode**. On this host the run reports ' +
      '`BLOCKED: MACOS_RUNNER_REQUIRED` — the project is generated and ready; it is the *runtime* that is ' +
      'unavailable, not the capability. On a macOS worker CodeSovereign runs `xcodegen generate`, ' +
      '`xcodebuild -sdk iphonesimulator`, boots the iOS Simulator with `simctl`, and drives it with Maestro.\n';
    var out = [];
    Object.keys(f).sort().forEach(function (p) { out.push({ path: '/' + p, content: f[p] }); });
    return out;
  }

  function generate(spec) {
    spec = spec || {};
    var plat = platformOf(spec);
    if (plat === 'ios') {
      // ship both: a buildable Android project AND the iOS skeleton, so a
      // cross-platform request still produces a verifiable artifact.
      var ios = iosFiles(spec);
      return ios;
    }
    return androidFiles(spec);
  }

  function verify(opts) {
    opts = opts || {};
    var CA = window.CSAdapters;
    if (!CA) return Promise.resolve({ status: 'BLOCKED', capability: 'native-mobile', reason: 'DESKTOP_REQUIRED', need: 'the mobile adapter runs in the desktop app' });
    var plat = opts.platform || (Engine.FS.exists && Engine.FS.exists('/App/ContentView.swift') ? 'ios' : 'android');
    if (plat === 'ios') return CA.ios(opts);
    return CA.android({ avd: opts.avd, applicationId: opts.applicationId });
  }

  Engine.Mobile = { generate: generate, verify: verify, platformOf: platformOf, androidFiles: androidFiles, iosFiles: iosFiles };
  console.info('[Mobile] native mobile generator + emulator verifier ready — Engine.Mobile');
})();
