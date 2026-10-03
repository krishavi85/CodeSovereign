/* =====================================================================
   engine.mobile.ios.js  —  Engine.MobileIOS
   (CodeSovereign_Native_iOS_Cross_Platform_Runtime_Spec.md)

   Native iOS is SUPPORTED WITH TARGET-SPECIFIC EXECUTION. A SwiftUI project is
   generated on EVERY host; verification is staged:

     sourceGeneration · staticValidation   — universal (any host)
     build · signing · deviceExecution      — the strongest compatible adapter
     simulatorExecution                     — macOS only

   generate(spec) -> a real SwiftUI project that BOTH build systems accept:
     Package.swift            SwiftPM (so a Swift toolchain can parse/typecheck
                              it on any host — real static validation)
     project.yml              xcodegen spec for the Xcode / xcodebuild path
     Sources/<App>/*.swift    @main App + ContentView + a model + a view model
     <App>/Info.plist, <App>.entitlements
     Makefile                 Theos target (compatible plain-Swift path)
     .maestro/flow.yaml       UI flow for when a runtime is available
     README.md                the staged model, spelled out

   verify() -> window.CSAdapters.ios()  ->  electron/lib/ios.js  ->
     .sovereign/mobile-ios-evidence.json  (the spec's per-stage schema)

   window.Engine.MobileIOS
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function appName(spec) {
    var n = String((spec && spec.name) || 'App').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
      .map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('');
    return n || 'App';
  }
  function bundleId(spec) {
    return 'com.codesovereign.' + (String((spec && spec.name) || 'app').toLowerCase().replace(/[^a-z0-9]/g, '') || 'app');
  }
  function entities(spec) {
    var e = ((spec && spec.entities) || []).filter(function (x) { return ['user', 'session', 'job'].indexOf(x.name) < 0; })
      .slice(0, 3).map(function (x) { return x.name; });
    return e.length ? e : ['item'];
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function generate(spec) {
    spec = spec || {};
    var name = appName(spec);
    var id = bundleId(spec);
    var ents = entities(spec);
    var primary = ents[0];
    var Model = cap(primary);
    var f = {};

    f['Package.swift'] =
      '// swift-tools-version:5.9\n' +
      'import PackageDescription\n\n' +
      'let package = Package(\n' +
      '    name: "' + name + '",\n' +
      '    platforms: [.iOS(.v16)],\n' +
      '    products: [ .library(name: "' + name + 'Core", targets: ["' + name + 'Core"]) ],\n' +
      '    targets: [\n' +
      '        .target(name: "' + name + 'Core", path: "Sources/' + name + 'Core"),\n' +
      '        .testTarget(name: "' + name + 'CoreTests", dependencies: ["' + name + 'Core"], path: "Tests/' + name + 'CoreTests")\n' +
      '    ]\n' +
      ')\n';

    f['project.yml'] =
      '# xcodegen spec — `xcodegen generate` then `xcodebuild -scheme ' + name + '`\n' +
      'name: ' + name + '\n' +
      'options:\n  bundleIdPrefix: com.codesovereign\n  deploymentTarget:\n    iOS: "16.0"\n' +
      'targets:\n  ' + name + ':\n    type: application\n    platform: iOS\n    sources: [App, Sources]\n' +
      '    settings:\n      base:\n        PRODUCT_BUNDLE_IDENTIFIER: ' + id + '\n        GENERATE_INFOPLIST_FILE: NO\n        INFOPLIST_FILE: App/Info.plist\n        CODE_SIGNING_ALLOWED: NO\n' +
      '    info:\n      path: App/Info.plist\n';

    // ---- the model layer (pure Swift — parses/typechecks on any host) ----
    f['Sources/' + name + 'Core/' + Model + '.swift'] =
      'import Foundation\n\n' +
      '/// A ' + primary + ' record. Pure model — no Apple UI frameworks, so this file\n' +
      '/// type-checks with a plain Swift toolchain on Windows / Linux too.\n' +
      'public struct ' + Model + ': Identifiable, Codable, Equatable {\n' +
      '    public let id: UUID\n' +
      '    public var title: String\n' +
      '    public var done: Bool\n\n' +
      '    public init(id: UUID = UUID(), title: String, done: Bool = false) {\n' +
      '        self.id = id\n        self.title = title\n        self.done = done\n' +
      '    }\n' +
      '}\n\n' +
      'public final class ' + Model + 'Store {\n' +
      '    public private(set) var items: [' + Model + ']\n' +
      '    public init(items: [' + Model + '] = [' + Model + '(title: "first ' + primary + '")]) { self.items = items }\n\n' +
      '    @discardableResult\n' +
      '    public func add(_ title: String) -> Bool {\n' +
      '        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)\n' +
      '        guard !t.isEmpty else { return false }\n' +
      '        items.append(' + Model + '(title: t))\n        return true\n' +
      '    }\n\n' +
      '    public func toggle(_ id: UUID) {\n' +
      '        guard let i = items.firstIndex(where: { $0.id == id }) else { return }\n' +
      '        items[i].done.toggle()\n' +
      '    }\n\n' +
      '    public func remove(_ id: UUID) { items.removeAll { $0.id == id } }\n' +
      '}\n';

    f['Tests/' + name + 'CoreTests/' + Model + 'StoreTests.swift'] =
      'import XCTest\n@testable import ' + name + 'Core\n\n' +
      'final class ' + Model + 'StoreTests: XCTestCase {\n' +
      '    func testAddAndToggle() {\n' +
      '        let s = ' + Model + 'Store(items: [])\n' +
      '        XCTAssertTrue(s.add("a"))\n' +
      '        XCTAssertFalse(s.add("   "))\n' +
      '        XCTAssertEqual(s.items.count, 1)\n' +
      '        s.toggle(s.items[0].id)\n' +
      '        XCTAssertTrue(s.items[0].done)\n' +
      '        s.remove(s.items[0].id)\n' +
      '        XCTAssertTrue(s.items.isEmpty)\n' +
      '    }\n' +
      '}\n';

    // ---- the SwiftUI layer (needs the iOS SDK to fully type-check; parses anywhere) ----
    f['App/' + name + 'App.swift'] =
      'import SwiftUI\n' +
      'import ' + name + 'Core\n\n' +
      '@main\n' +
      'struct ' + name + 'App: App {\n' +
      '    @StateObject private var vm = AppViewModel()\n' +
      '    var body: some Scene {\n' +
      '        WindowGroup { ContentView().environmentObject(vm) }\n' +
      '    }\n' +
      '}\n\n' +
      'final class AppViewModel: ObservableObject {\n' +
      '    @Published var store = ' + Model + 'Store()\n' +
      '    @Published var draft = ""\n' +
      '    func add() { if store.add(draft) { draft = "" } ; objectWillChange.send() }\n' +
      '    func toggle(_ id: UUID) { store.toggle(id); objectWillChange.send() }\n' +
      '}\n';

    f['App/ContentView.swift'] =
      'import SwiftUI\n' +
      'import ' + name + 'Core\n\n' +
      'struct ContentView: View {\n' +
      '    @EnvironmentObject var vm: AppViewModel\n' +
      '    var body: some View {\n' +
      '        NavigationStack {\n' +
      '            VStack(spacing: 0) {\n' +
      '                HStack {\n' +
      '                    TextField("new ' + primary + '", text: $vm.draft)\n' +
      '                        .textFieldStyle(.roundedBorder)\n' +
      '                        .accessibilityIdentifier("draftField")\n' +
      '                    Button("Add") { vm.add() }\n' +
      '                        .accessibilityIdentifier("addButton")\n' +
      '                }.padding()\n' +
      '                List {\n' +
      '                    ForEach(vm.store.items) { item in\n' +
      '                        HStack {\n' +
      '                            Image(systemName: item.done ? "checkmark.circle.fill" : "circle")\n' +
      '                            Text(item.title)\n' +
      '                        }\n' +
      '                        .contentShape(Rectangle())\n' +
      '                        .onTapGesture { vm.toggle(item.id) }\n' +
      '                    }\n' +
      '                }\n' +
      '            }\n' +
      '            .navigationTitle("' + name + '")\n' +
      '        }\n' +
      '    }\n' +
      '}\n\n' +
      '#Preview { ContentView().environmentObject(AppViewModel()) }\n';

    f['App/Info.plist'] =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      '<plist version="1.0"><dict>\n' +
      '  <key>CFBundleName</key><string>' + name + '</string>\n' +
      '  <key>CFBundleIdentifier</key><string>' + id + '</string>\n' +
      '  <key>CFBundleShortVersionString</key><string>0.1.0</string>\n' +
      '  <key>CFBundleVersion</key><string>1</string>\n' +
      '  <key>UILaunchScreen</key><dict/>\n' +
      '  <key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><false/></dict>\n' +
      '</dict></plist>\n';

    f['App/' + name + '.entitlements'] =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
      '<plist version="1.0"><dict>\n  <key>com.apple.security.app-sandbox</key><true/>\n</dict></plist>\n';

    // ---- Theos target (compatible plain-Swift path) ----
    f['Makefile'] =
      'export ARCHS = arm64\nexport TARGET = iphone:clang:latest:16.0\n\n' +
      'include $(THEOS)/makefiles/common.mk\n\n' +
      'APPLICATION_NAME = ' + name + '\n' +
      '$(APPLICATION_NAME)_FILES = $(wildcard App/*.swift) $(wildcard Sources/' + name + 'Core/*.swift)\n' +
      '$(APPLICATION_NAME)_SWIFTFLAGS = -ISources\n' +
      '$(APPLICATION_NAME)_FRAMEWORKS = UIKit SwiftUI\n\n' +
      'include $(THEOS)/makefiles/application.mk\n';
    f['control'] =
      'Package: ' + id + '\nName: ' + name + '\nVersion: 0.1.0\nArchitecture: iphoneos-arm64\n' +
      'Description: Generated by CodeSovereign.\nAuthor: CodeSovereign\nSection: Applications\n';

    f['.maestro/flow.yaml'] =
      'appId: ' + id + '\n---\n- launchApp\n- assertVisible: "' + name + '"\n' +
      '- tapOn:\n    id: "draftField"\n- inputText: "verified"\n- tapOn:\n    id: "addButton"\n- assertVisible: "verified"\n';

    f['.gitignore'] = '.build/\nbuild/\n*.xcodeproj\n*.xcworkspace\nDerivedData/\n.theos/\npackages/\n.sovereign/\n';

    f['package.json'] = JSON.stringify({
      name: (spec.name || 'ios-app').toLowerCase().replace(/[^a-z0-9-]/g, '-'), version: '0.1.0', private: true,
      description: 'Generated by CodeSovereign — a native iOS SwiftUI app, staged verification.',
      scripts: {
        build: 'xcodegen generate && xcodebuild -scheme ' + name + ' -sdk iphonesimulator build',
        test: 'swift test'
      }
    }, null, 2) + '\n';

    f['README.md'] =
      '# ' + name + ' (iOS)\n\n' +
      'Generated by **CodeSovereign** — a native **SwiftUI** app. iOS is *supported with\n' +
      'target-specific execution*: the project is generated and source/static-verified on\n' +
      '**every host**; build + runtime stages use the strongest compatible adapter.\n\n' +
      '| Stage | Windows / Linux | macOS |\n|---|---|---|\n' +
      '| SwiftUI source generation | full | full |\n' +
      '| Static source validation | full (`swift`/`swiftc` if present, else structural) | full |\n' +
      '| Build | Flutter-iOS → xcross · plain-Swift → Theos · else `MACOS_XCODE_REQUIRED` | Xcode |\n' +
      '| Signing | zsign (`CS_IOS_P12`) | Apple codesign |\n' +
      '| Physical iPhone | xcross / Theos + `libimobiledevice`/`pymobiledevice3` | Xcode |\n' +
      '| iOS Simulator | `MACOS_SIMULATOR_REQUIRED` | full |\n\n' +
      'Every result is normalised into `.sovereign/mobile-ios-evidence.json`.\n\n' +
      '## macOS — full verification\n\n```\nbrew install xcodegen\nxcodegen generate\nxcodebuild -scheme ' + name + ' -sdk iphonesimulator build\nxcrun simctl boot "iPhone 15" && xcrun simctl install booted <app> && xcrun simctl launch booted ' + id + '\n```\n\n' +
      '## Windows / Linux — static + (compatible) build\n\n```\n# static validation (any host with a Swift toolchain)\nswift build\n\n# Flutter-iOS build/sign/run on a real iPhone, no Mac:\ndart pub global activate xcross && xcross build && xcross install && xcross run\n\n# plain-Swift lower-level target:\nexport THEOS=~/theos && make package\n\n# cross-platform signing:\nCS_IOS_P12=cert.p12 CS_IOS_P12_PASS=... CS_IOS_MOBILEPROVISION=app.mobileprovision  # picked up by the adapter\n```\n';

    var out = [];
    Object.keys(f).sort().forEach(function (p) { out.push({ path: '/' + p, content: f[p] }); });
    return out;
  }

  function verify(opts) {
    opts = opts || {};
    var CA = window.CSAdapters;
    if (!CA || !CA.ios) {
      return Promise.resolve({ status: 'BLOCKED', capability: 'native-mobile', platform: 'ios',
        reason: 'DESKTOP_REQUIRED', need: 'the iOS adapter runs in the desktop app' });
    }
    return CA.ios(opts);
  }

  Engine.MobileIOS = { generate: generate, verify: verify, appName: appName, bundleId: bundleId };
  console.info('[MobileIOS] native iOS staged generator + verifier ready — Engine.MobileIOS');
})();
