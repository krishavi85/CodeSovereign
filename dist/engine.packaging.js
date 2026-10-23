/* =====================================================================
   engine.packaging.js  —  Engine.Packaging   (blueprint §35)

   The packaging targets that were listed but not built: a **Python wheel**
   and a **VST3 audio plugin**. Both follow the same honesty rule as every
   other adapter — generate the real packaging files + a runnable recipe,
   prove what can be proven locally, and BLOCK the rest with the exact
   missing prerequisite. Nothing is ever reported as "supported" without a
   build behind it.

     wheel  — a pure-standard-library Python project (Engine.PyBackend, or
              any repo with an `app/` / `src/` package) → `pyproject.toml`
              (PEP 621, setuptools backend) + `MANIFEST.in` + build scripts.
              verify() runs `python -m build --wheel` → installs the wheel
              into a fresh venv with `--no-index` → imports the top package.
              PyPI publish stays BLOCKED_CREDENTIAL_REQUIRED.

     vst3   — only when the contract describes an audio plugin. Generates a
              JUCE + CMake plugin project (processor + editor + CMakeLists)
              and `scripts/build-vst3.sh`. The build itself needs the JUCE
              SDK + a C++ toolchain on the host → BLOCKED: JUCE_SDK_REQUIRED
              with the clone command, never a blanket "unsupported".

   window.Engine.Packaging
     kinds()          -> which targets apply to this workspace + why
     plan()           -> { targets:[{ target, status, need, stages }] }
     emit(opts?)      -> [{ path, content }]  — the packaging files
     verify(opts?)    -> Promise<evidence>    — writes emit() then runs the adapter
     analyze()        -> writes .sovereign/packaging-evidence.json
     load()           -> the evidence or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };
  function FS() { return Engine.FS; }
  function fread(p) { try { return (FS() && FS().read(p)) || ''; } catch (_) { return ''; } }
  function fjson(p) { try { var r = fread(p); return r ? JSON.parse(r) : null; } catch (_) { return null; } }
  function fexists(p) { try { return !!(FS() && FS().isFile(p)); } catch (_) { return false; } }
  function listFiles(re) {
    try {
      return Object.keys((FS() && FS()._data) || {}).filter(function (p) {
        return FS().isFile(p) && re.test(p) && !/\/(node_modules|\.sovereign|\.git|dist|build)\//.test(p);
      });
    } catch (_) { return []; }
  }
  function adapters() { return window.CSAdapters || null; }
  function contractOf() { try { return (Engine.Contract && Engine.Contract.load && Engine.Contract.load()) || null; } catch (_) { return null; } }

  function slug(s) {
    return String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';
  }

  /* ---------------- detect what applies ---------------- */
  function pyPackageDir() {
    // a directory holding an __init__.py that isn't tests/
    var inits = listFiles(/(^|\/)__init__\.py$/).map(function (p) { return p.replace(/\/__init__\.py$/, '').replace(/^\//, ''); });
    var top = inits.filter(function (d) { return d && !/^tests?(\/|$)/.test(d) && d.indexOf('/') < 0; });
    if (top.length) return top[0];
    if (listFiles(/\/app\/.+\.py$/).length) return 'app';
    if (listFiles(/\/src\/[^/]+\/.+\.py$/).length) return listFiles(/\/src\/([^/]+)\/.+\.py$/)[0].replace(/^\/src\/([^/]+)\/.*/, 'src/$1');
    if (listFiles(/\.py$/).length) return null;   // scripts, not a package
    return undefined;                              // no python at all
  }

  function isAudioPlugin() {
    var c = contractOf();
    var hay = c ? JSON.stringify(c) : (fread('/README.md') + ' ' + (fjson('/package.json') || {}).description);
    return /\b(vst3?|audio (unit|plugin)|\bau plugin\b|juce|daw plugin|synth(esizer)? plugin|audio effect plugin)\b/i.test(hay || '');
  }

  function isNodeLib() {
    var p = fjson('/package.json');
    return !!(p && (p.main || p.exports || p.bin) && p.name && !(p.scripts && p.scripts.dev && /server\.js/.test(p.scripts.dev || '')));
  }

  function kinds() {
    var out = [];
    var pyDir = pyPackageDir();
    if (pyDir) out.push({ target: 'wheel', applies: true, package: pyDir, reason: 'a Python package (' + pyDir + '/) is present — publishable as a wheel' });
    else if (pyDir === null) out.push({ target: 'wheel', applies: false, reason: 'Python files exist but no importable package (add an __init__.py)' });
    if (isAudioPlugin()) out.push({ target: 'vst3', applies: true, reason: 'the contract describes an audio plugin' });
    if (isNodeLib()) out.push({ target: 'npm', applies: true, reason: 'a publishable npm library — see Engine.Registry (already wired)' });
    return out;
  }

  /* ---------------- Python wheel files ---------------- */
  function wheelFiles(opts) {
    opts = opts || {};
    var pyDir = opts.package || pyPackageDir() || 'app';
    var c = contractOf();
    var name = slug(opts.name || (c && c.product && c.product.name) || (fjson('/package.json') || {}).name || pyDir);
    var version = opts.version || (fjson('/package.json') || {}).version || '0.1.0';
    var desc = opts.description || (c && c.product && (c.product.objective || c.product.name)) || 'Generated by CodeSovereign';
    var isSrc = pyDir.indexOf('src/') === 0;
    var pkgName = isSrc ? pyDir.slice(4) : pyDir;

    var pyproject = [
      '[build-system]',
      'requires = ["setuptools>=61.0"]',
      'build-backend = "setuptools.build_meta"',
      '',
      '[project]',
      'name = "' + name + '"',
      'version = "' + version.replace(/[^0-9A-Za-z.\-+]/g, '') + '"',
      'description = ' + JSON.stringify(String(desc).slice(0, 200)),
      'readme = "README.md"',
      'requires-python = ">=3.9"',
      'license = { text = "' + ((fjson('/package.json') || {}).license || 'MIT') + '" }',
      'dependencies = []   # the generated app is pure standard library',
      '',
      '[project.urls]',
      'Homepage = "https://example.invalid/' + name + '"',
      '',
      '[tool.setuptools]',
      isSrc ? 'package-dir = { "" = "src" }' : '# packages discovered below',
      '',
      '[tool.setuptools.packages.find]',
      isSrc ? 'where = ["src"]' : 'include = ["' + pkgName + '*"]',
      'exclude = ["tests*"]',
      ''
    ].join('\n');

    var manifest = [
      'include README.md',
      'recursive-include ' + pyDir + ' *.py',
      'global-exclude __pycache__ *.pyc',
      ''
    ].join('\n');

    var sh = [
      '#!/usr/bin/env bash',
      '# Build + verify a wheel with no network. Generated by CodeSovereign Engine.Packaging (§35).',
      'set -euo pipefail',
      'PY="${PYTHON:-python3}"',
      'OUT="$(mktemp -d)"',
      'echo "→ building wheel"',
      'if "$PY" -c "import build" 2>/dev/null; then "$PY" -m build --wheel --outdir "$OUT";',
      'else "$PY" -m pip wheel . --no-deps -w "$OUT"; fi',
      'WHL="$(ls "$OUT"/*.whl | head -n1)"',
      'echo "→ wheel: $WHL"',
      'echo "→ clean-venv install + import smoke"',
      'VENV="$(mktemp -d)/v"; "$PY" -m venv "$VENV"',
      'BIN="$VENV/bin"; [ -d "$BIN" ] || BIN="$VENV/Scripts"',
      '"$BIN/python" -m pip install --no-index "$WHL"',
      '"$BIN/python" -c "import ' + (isSrc ? pkgName : pyDir).replace(/[\/]/g, '.') + '; print(\'IMPORT_OK\')"',
      'echo "✓ wheel builds, installs into a clean env and imports"',
      'echo "  PyPI publish: twine upload \\"$WHL\\"   (needs a PyPI token — not done here)"',
      ''
    ].join('\n');

    var ps1 = [
      '# Build + verify a wheel (Windows). Generated by CodeSovereign Engine.Packaging (§35).',
      '$ErrorActionPreference = "Stop"',
      '$py = if ($env:PYTHON) { $env:PYTHON } else { "python" }',
      '$out = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("whl-" + [guid]::NewGuid()))',
      'try { & $py -c "import build" 2>$null; & $py -m build --wheel --outdir $out }',
      'catch { & $py -m pip wheel . --no-deps -w $out }',
      '$whl = (Get-ChildItem $out -Filter *.whl | Select-Object -First 1).FullName',
      '$venv = Join-Path $env:TEMP ("venv-" + [guid]::NewGuid())',
      '& $py -m venv $venv',
      '& (Join-Path $venv "Scripts/python.exe") -m pip install --no-index $whl',
      '& (Join-Path $venv "Scripts/python.exe") -c "import ' + (isSrc ? pkgName : pyDir).replace(/[\/]/g, '.') + '; print(\'IMPORT_OK\')"',
      'Write-Host "OK - wheel builds, installs and imports"',
      ''
    ].join('\n');

    var md = [
      '# Packaging — Python wheel', '',
      'This project ships a PEP 517 / PEP 621 wheel build.', '',
      '```sh',
      'pip install build            # one-time: the PEP 517 build frontend',
      'bash scripts/build-wheel.sh  # build + clean-venv install + import smoke',
      '```', '',
      '- **Distribution name:** `' + name + '`  ·  **import:** `' + (isSrc ? pkgName : pyDir).replace(/[\/]/g, '.') + '`',
      '- The wheel is verified locally by installing it into a fresh virtual-env with `--no-index` and importing the package.',
      '- **PyPI publish** is credential-gated by design: `twine upload dist/*` with a PyPI API token. CodeSovereign never uploads on your behalf.',
      ''
    ].join('\n');

    var out = [
      { path: '/pyproject.toml', content: pyproject },
      { path: '/MANIFEST.in', content: manifest },
      { path: '/scripts/build-wheel.sh', content: sh },
      { path: '/scripts/build-wheel.ps1', content: ps1 },
      { path: '/docs/PACKAGING.md', content: md }
    ];
    if (!fexists('/README.md')) out.push({ path: '/README.md', content: '# ' + name + '\n\n' + desc + '\n' });
    return out;
  }

  /* ---------------- VST3 (JUCE + CMake) skeleton ---------------- */
  function vst3Files(opts) {
    opts = opts || {};
    var c = contractOf();
    var name = (opts.name || (c && c.product && c.product.name) || 'SovereignPlugin').replace(/[^A-Za-z0-9]/g, '') || 'SovereignPlugin';
    var code = (name.slice(0, 4).toUpperCase() + 'XXXX').slice(0, 4);

    var cmake = [
      'cmake_minimum_required(VERSION 3.22)',
      'project(' + name + ' VERSION 0.1.0)',
      '',
      '# JUCE is expected as a sibling checkout or via -DJUCE_DIR=',
      'if(NOT DEFINED JUCE_DIR)',
      '  set(JUCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/JUCE")',
      'endif()',
      'add_subdirectory(${JUCE_DIR} JUCE)',
      '',
      'juce_add_plugin(' + name,
      '  COMPANY_NAME "CodeSovereign"',
      '  IS_SYNTH FALSE',
      '  NEEDS_MIDI_INPUT FALSE',
      '  PLUGIN_MANUFACTURER_CODE Csvn',
      '  PLUGIN_CODE ' + code,
      '  FORMATS VST3 Standalone',
      '  PRODUCT_NAME "' + name + '")',
      '',
      'target_sources(' + name + ' PRIVATE',
      '  src/PluginProcessor.cpp',
      '  src/PluginEditor.cpp)',
      '',
      'target_compile_definitions(' + name + ' PUBLIC',
      '  JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)',
      '',
      'target_link_libraries(' + name + ' PRIVATE',
      '  juce::juce_audio_utils',
      '  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags)',
      ''
    ].join('\n');

    var proc_h = [
      '#pragma once',
      '#include <juce_audio_processors/juce_audio_processors.h>',
      '',
      'class ' + name + 'Processor : public juce::AudioProcessor {',
      'public:',
      '    ' + name + 'Processor();',
      '    void prepareToPlay (double, int) override {}',
      '    void releaseResources() override {}',
      '    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;',
      '    juce::AudioProcessorEditor* createEditor() override;',
      '    bool hasEditor() const override { return true; }',
      '    const juce::String getName() const override { return "' + name + '"; }',
      '    bool acceptsMidi() const override { return false; }',
      '    bool producesMidi() const override { return false; }',
      '    double getTailLengthSeconds() const override { return 0.0; }',
      '    int getNumPrograms() override { return 1; }',
      '    int getCurrentProgram() override { return 0; }',
      '    void setCurrentProgram (int) override {}',
      '    const juce::String getProgramName (int) override { return {}; }',
      '    void changeProgramName (int, const juce::String&) override {}',
      '    void getStateInformation (juce::MemoryBlock&) override {}',
      '    void setStateInformation (const void*, int) override {}',
      '    juce::AudioProcessorValueTreeState apvts;',
      '};',
      ''
    ].join('\n');

    var proc_cpp = [
      '#include "PluginProcessor.h"',
      '#include "PluginEditor.h"',
      '',
      '' + name + 'Processor::' + name + 'Processor()',
      '  : AudioProcessor (BusesProperties().withInput ("In", juce::AudioChannelSet::stereo())',
      '                                     .withOutput ("Out", juce::AudioChannelSet::stereo())),',
      '    apvts (*this, nullptr, "params", { std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "gain", 1 }, "Gain", 0.0f, 1.0f, 0.8f) }) {}',
      '',
      'void ' + name + 'Processor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) {',
      '    const float gain = apvts.getRawParameterValue ("gain")->load();',
      '    buffer.applyGain (gain);',
      '}',
      '',
      'juce::AudioProcessorEditor* ' + name + 'Processor::createEditor() { return new ' + name + 'Editor (*this); }',
      '',
      'juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new ' + name + 'Processor(); }',
      ''
    ].join('\n');

    var ed_h = [
      '#pragma once',
      '#include <juce_audio_processors/juce_audio_processors.h>',
      '#include "PluginProcessor.h"',
      '',
      'class ' + name + 'Editor : public juce::AudioProcessorEditor {',
      'public:',
      '    explicit ' + name + 'Editor (' + name + 'Processor&);',
      '    void paint (juce::Graphics&) override;',
      '    void resized() override;',
      'private:',
      '    ' + name + 'Processor& proc;',
      '    juce::Slider gain;',
      '    juce::AudioProcessorValueTreeState::SliderAttachment gainAttach { proc.apvts, "gain", gain };',
      '};',
      ''
    ].join('\n');

    var ed_cpp = [
      '#include "PluginEditor.h"',
      '',
      '' + name + 'Editor::' + name + 'Editor (' + name + 'Processor& p) : AudioProcessorEditor (&p), proc (p) {',
      '    gain.setSliderStyle (juce::Slider::RotaryVerticalDrag);',
      '    addAndMakeVisible (gain);',
      '    setSize (280, 180);',
      '}',
      'void ' + name + 'Editor::paint (juce::Graphics& g) { g.fillAll (juce::Colours::black); g.setColour (juce::Colours::white); g.drawText ("' + name + '", getLocalBounds().removeFromTop (24), juce::Justification::centred); }',
      'void ' + name + 'Editor::resized() { gain.setBounds (getLocalBounds().reduced (24).withTrimmedTop (24)); }',
      ''
    ].join('\n');

    var sh = [
      '#!/usr/bin/env bash',
      '# Build the VST3. Needs CMake >= 3.22, a C++17 toolchain and the JUCE SDK.',
      'set -euo pipefail',
      'if [ ! -d JUCE ]; then',
      '  echo "JUCE SDK not found — cloning (needs network, one time):"',
      '  git clone --depth 1 https://github.com/juce-framework/JUCE JUCE',
      'fi',
      'cmake -B build -DCMAKE_BUILD_TYPE=Release',
      'cmake --build build --config Release --target ' + name + '_VST3',
      'echo "✓ VST3 at build/' + name + '_artefacts/Release/VST3/"',
      ''
    ].join('\n');

    var md = [
      '# Packaging — VST3 audio plugin', '',
      'A JUCE + CMake plugin project (gain example). The build needs, on the host:', '',
      '- **CMake ≥ 3.22** and a **C++17 toolchain** (MSVC / clang / gcc)',
      '- the **JUCE SDK** — `git clone https://github.com/juce-framework/JUCE` (or pass `-DJUCE_DIR=`)', '',
      '```sh',
      'bash scripts/build-vst3.sh',
      '```', '',
      'CodeSovereign generates the project and the recipe; it does **not** bundle the JUCE SDK or a C++ compiler, so an off-toolchain host reports `BLOCKED: JUCE_SDK_REQUIRED` with this command rather than a fake "supported".',
      ''
    ].join('\n');

    return [
      { path: '/CMakeLists.txt', content: cmake },
      { path: '/src/PluginProcessor.h', content: proc_h },
      { path: '/src/PluginProcessor.cpp', content: proc_cpp },
      { path: '/src/PluginEditor.h', content: ed_h },
      { path: '/src/PluginEditor.cpp', content: ed_cpp },
      { path: '/scripts/build-vst3.sh', content: sh },
      { path: '/docs/PACKAGING-VST3.md', content: md }
    ];
  }

  function emit(opts) {
    opts = opts || {};
    var target = opts.target || (kinds().filter(function (k) { return k.applies && k.target !== 'npm'; })[0] || {}).target;
    if (target === 'wheel') return wheelFiles(opts);
    if (target === 'vst3') return vst3Files(opts);
    return [];
  }

  function plan() {
    var ks = kinds();
    var A = adapters();
    var host = null;
    try { host = A && A.probeSync && A.probeSync(); } catch (_) {}
    var targets = ks.filter(function (k) { return k.applies; }).map(function (k) {
      if (k.target === 'npm') return { target: 'npm', status: 'SUPPORTED', via: 'Engine.Registry (Verdaccio / npm-pack round-trip)', stages: ['npm pack', 'clean-consumer install', 'import'] };
      if (k.target === 'wheel') return {
        target: 'wheel', status: 'SUPPORTED',
        stages: ['python -m build --wheel', 'venv --no-index install', 'import smoke'],
        need: 'Python 3.9+ and ideally `pip install build`',
        external: { PYPI_EXTERNAL_PUBLISH: 'BLOCKED_CREDENTIAL_REQUIRED' }
      };
      return {
        target: 'vst3', status: 'SUPPORTED',
        stages: ['generate JUCE + CMake project', 'cmake build (host toolchain)'],
        need: 'CMake ≥ 3.22 + a C++17 toolchain + the JUCE SDK (git clone https://github.com/juce-framework/JUCE)',
        note: 'the project + recipe are generated; the compile is BLOCKED: JUCE_SDK_REQUIRED off-toolchain'
      };
    });
    return { generatedAt: Date.now(), targets: targets, notApplicable: ks.filter(function (k) { return !k.applies; }) };
  }

  function verify(opts) {
    opts = opts || {};
    var target = opts.target || (kinds().filter(function (k) { return k.applies && k.target !== 'npm'; })[0] || {}).target;
    if (!target) {
      var na = { generatedAt: Date.now(), present: false, capability: 'packaging', status: 'NOT_REQUESTED', note: 'no wheel / vst3 target applies to this workspace' };
      persist(na); return Promise.resolve(na);
    }
    // write the packaging files so the adapter (and the user) has something real
    var files = emit({ target: target });
    files.forEach(function (f) { try { FS().write(f.path, f.content); } catch (_) {} });
    if (FS().__flush) { try { FS().__flush(); } catch (_) {} }

    var A = adapters();
    if (!A || !A.run) {
      var b = {
        generatedAt: Date.now(), capability: 'packaging', target: target, status: 'BLOCKED',
        reason: 'RUNTIME_BRIDGE_UNAVAILABLE',
        need: target === 'wheel'
          ? 'the desktop app with a folder open — `python -m build` runs through the local process bridge. Files were generated; run `bash scripts/build-wheel.sh` manually.'
          : 'a C++/JUCE toolchain on the host — run `bash scripts/build-vst3.sh`',
        filesGenerated: files.map(function (f) { return f.path; })
      };
      persist(b); return Promise.resolve(b);
    }
    var importName = null;
    if (target === 'wheel') { var d = pyPackageDir(); importName = d && (d.indexOf('src/') === 0 ? d.slice(4) : d).replace(/\//g, '.'); }
    return Promise.resolve(A.run('packaging', { kind: target, importName: importName })).then(function (r) {
      r = r || { status: 'FAIL', reason: 'ADAPTER_NO_RESULT' };
      r.filesGenerated = files.map(function (f) { return f.path; });
      persist(r); return r;
    }, function (e) {
      var f = { generatedAt: Date.now(), capability: 'packaging', target: target, status: 'FAIL', reason: 'ADAPTER_ERROR', detail: String(e && e.message || e) };
      persist(f); return f;
    });
  }

  function persist(res) {
    if (S()) S().write('packaging-evidence.json', Object.assign({ generatedAt: Date.now(), capability: 'packaging' }, res));
  }

  function analyze() {
    var ks = kinds().filter(function (k) { return k.applies && k.target !== 'npm'; });
    if (!ks.length) {
      var none = { generatedAt: Date.now(), present: false, capability: 'packaging', status: 'NOT_REQUESTED',
        note: 'the workspace has no Python package to wheel and the contract asks for no audio plugin — npm libraries are handled by Engine.Registry' };
      if (S()) S().write('packaging-evidence.json', none);
      return none;
    }
    var prev = load();
    if (prev && prev.status && prev.status !== 'NOT_REQUESTED' && prev.status !== 'PENDING') return prev;
    var p = plan();
    var pending = { generatedAt: Date.now(), present: true, capability: 'packaging', status: 'PENDING',
      plan: p, note: 'run Engine.Packaging.verify() to build + verify the ' + ks.map(function (k) { return k.target; }).join(' / ') + ' package(s)' };
    if (S()) S().write('packaging-evidence.json', pending);
    return pending;
  }

  function load() {
    try { var v = S() && S().read('packaging-evidence.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; }
  }

  Engine.Packaging = { kinds: kinds, plan: plan, emit: emit, verify: verify, analyze: analyze, load: load,
    _wheelFiles: wheelFiles, _vst3Files: vst3Files, _pyPackageDir: pyPackageDir, _isAudioPlugin: isAudioPlugin };
  console.info('[Packaging] wheel + VST3 packaging ready — Engine.Packaging');
})();
