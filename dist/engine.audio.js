/* =====================================================================
   engine.audio.js  —  Engine.Audio   (offline-plan §2)

   Offline speech-to-text. A voice brief is a first-class prompt input:
   the runtime router sends the audio to a LOCAL Whisper runtime
   (whisper.cpp by default, faster-whisper when Python/CTranslate2 are
   present) — no hosted API, no account.

     Audio → FFmpeg normalize (16 kHz mono WAV)
           → whisper runtime
           → segments + timestamps
           → .sovereign/audio/{transcript.json,transcript.txt,transcript.srt}
           → audio-evidence.json

   A missing binary or model weights → BLOCKED <REASON> + the exact install
   command. The capability stays SUPPORTED — `support != environment`.

   window.Engine.Audio
     RUNTIMES
     plan()                         -> { runtimes, pipeline, install }
     transcribe(ref, opts?)         -> Promise<{ status, text, segments, srt, runtime, reason?, need? }>
     analyze(refs?)                 -> writes .sovereign/audio-evidence.json
     load()                         -> the evidence or null
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});
  var S = function () { return Engine.Sovereign; };

  var RUNTIMES = [
    { id: 'whisper.cpp', bin: 'whisper-cli', repo: 'https://github.com/ggml-org/whisper.cpp',
      install: 'git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && cmake -B build && cmake --build build -j && ./models/download-ggml-model.sh base.en' },
    { id: 'faster-whisper', bin: 'python -m faster_whisper', repo: 'https://github.com/SYSTRAN/faster-whisper',
      install: 'pip install faster-whisper  (needs CTranslate2 + a CPU/GPU)' }
  ];

  function adapters() { return window.CSAdapters || null; }

  function plan() {
    return {
      capability: 'audio-transcription',
      support: 'SUPPORTED',
      runtimes: RUNTIMES.map(function (r) { return { id: r.id, repo: r.repo }; }),
      pipeline: ['ffmpeg normalize -> 16kHz mono wav', 'whisper runtime', 'segments + timestamps', 'srt + json + txt', 'evidence'],
      install: { ffmpeg: 'https://github.com/FFmpeg/FFmpeg (or `winget install ffmpeg` / `brew install ffmpeg`)', whisper: RUNTIMES[0].install }
    };
  }

  function toSrt(segments) {
    function ts(s) {
      var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
      return (('0' + h).slice(-2)) + ':' + (('0' + m).slice(-2)) + ':' + (('0' + sec).slice(-2)) + ',' + (('00' + ms).slice(-3));
    }
    return (segments || []).map(function (g, i) {
      return (i + 1) + '\n' + ts(g.start || 0) + ' --> ' + ts(g.end || 0) + '\n' + (g.text || '').trim() + '\n';
    }).join('\n');
  }

  function persist(res) {
    if (!S()) return;
    var seg = res.segments || [];
    S().write('audio/transcript.json', { runtime: res.runtime, language: res.language || null, duration: res.duration || null, segments: seg });
    S().write('audio/transcript.txt', res.text || '');
    S().write('audio/transcript.srt', res.srt || toSrt(seg));
    S().write('audio-evidence.json', {
      generatedAt: Date.now(), capability: 'audio-transcription', support: 'SUPPORTED',
      status: res.status, reason: res.reason || null, need: res.need || null,
      runtime: res.runtime || null, words: (res.text || '').split(/\s+/).filter(Boolean).length,
      segments: seg.length, checks: res.checks || null
    });
  }

  function transcribe(ref, opts) {
    opts = opts || {};
    var A = adapters();
    if (!A || !A.run) {
      var blocked = {
        status: 'BLOCKED', reason: 'RUNTIME_BRIDGE_UNAVAILABLE',
        need: 'the desktop app with a folder open — the Whisper runtime runs through the local process bridge',
        runtime: null, text: '', segments: []
      };
      persist(blocked);
      return Promise.resolve(blocked);
    }
    return Promise.resolve(A.run('audio', {
      audio: (ref && (ref.path || ref.dataUrl || ref)) || null,
      model: opts.model || 'base.en',
      runtime: opts.runtime || null,
      language: opts.language || null
    })).then(function (r) {
      r = r || { status: 'FAIL', reason: 'ADAPTER_NO_RESULT' };
      if (r.status === 'PASS' && !r.srt) r.srt = toSrt(r.segments || []);
      persist(r);
      return r;
    }, function (e) {
      var fail = { status: 'FAIL', reason: 'ADAPTER_ERROR', detail: String(e && e.message || e), text: '', segments: [] };
      persist(fail);
      return fail;
    });
  }

  function analyze(refs) {
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    if (!refs.length) {
      var prev = load();
      if (prev) return prev;
      var none = { generatedAt: Date.now(), present: false, capability: 'audio-transcription', support: 'SUPPORTED', note: 'no audio input — nothing to transcribe' };
      if (S()) S().write('audio-evidence.json', none);
      return none;
    }
    // analyze only reports; transcribe(ref) is the executing call
    return transcribe(refs[0], {}).then(function (r) { return load() || r; });
  }

  function load() { try { var v = S() && S().read('audio-evidence.json'); return (v && typeof v === 'object') ? v : null; } catch (_) { return null; } }

  Engine.Audio = { RUNTIMES: RUNTIMES, plan: plan, transcribe: transcribe, analyze: analyze, load: load, _toSrt: toSrt };
  console.info('[Audio] offline speech-to-text (whisper.cpp / faster-whisper) ready — Engine.Audio');
})();
