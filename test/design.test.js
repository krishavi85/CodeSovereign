'use strict';
/* engine.design.js (§11) — design / vision input: Figma export + HTML +
 * screenshot ingestion into a normalized design spec + token CSS. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeWin() {
  const win = { console, setTimeout, clearTimeout };
  win.window = win;
  win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const data = {}, sov = {};
  win.Engine = {
    FS: {
      _data: data, isFile: (p) => !!data[p], exists: (p) => p in data,
      read: (p) => (data[p] ? data[p].content : null),
      write: (p, c) => { data[p] = { type: 'file', content: String(c) }; }, remove: () => {}
    },
    Sovereign: {
      read: (p) => (sov[p] != null ? (/\.json$/.test(p) ? JSON.parse(sov[p]) : sov[p]) : null),
      write: (p, d) => { sov[p] = typeof d === 'string' ? d : JSON.stringify(d); }, list: () => Object.keys(sov)
    }
  };
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'engine.design.js'), 'utf8'), win, { filename: 'engine.design.js' });
  return win;
}

// a minimal but realistic Figma frame export
const FIGMA = {
  document: {
    type: 'DOCUMENT',
    children: [{
      type: 'FRAME', name: 'Home / Desktop',
      absoluteBoundingBox: { width: 1440, height: 1024 },
      background: [{ color: { r: 0.98, g: 0.98, b: 0.98 } }],
      children: [
        { type: 'FRAME', name: 'Header', absoluteBoundingBox: { width: 1440, height: 72 }, itemSpacing: 16 },
        { type: 'TEXT', name: 'Title', characters: 'My Dashboard', style: { fontFamily: 'Inter', fontSize: 32 } },
        { type: 'INSTANCE', name: 'Primary Button', characters: 'Get started', cornerRadius: 8,
          fills: [{ color: { r: 0.11, g: 0.31, b: 0.85 } }] },
        { type: 'FRAME', name: 'Search Field', absoluteBoundingBox: { width: 320, height: 40 }, cornerRadius: 6 },
        { type: 'FRAME', name: 'Project Card', absoluteBoundingBox: { width: 300, height: 180 },
          children: [{ type: 'TEXT', name: 'Card title', characters: 'Alpha', style: { fontFamily: 'Inter', fontSize: 18 } }] }
      ]
    }]
  }
};

module.exports = async function (t) {
  /* ---------- Figma ---------- */
  {
    const win = makeWin();
    const spec = win.Engine.Design.ingest({ kind: 'figma', json: FIGMA, name: 'dash' });
    t.equal('design(figma): status READY', spec.status, 'READY');
    t.ok('design(figma): viewport is the largest frame', spec.viewport && spec.viewport.width === 1440 && spec.viewport.height === 1024);
    t.ok('design(figma): detects button + input + card + nav from layer names', spec.components.some((c) => c.role === 'button') && spec.components.some((c) => c.role === 'input') && spec.components.some((c) => c.role === 'card') && spec.components.some((c) => c.role === 'nav'));
    t.ok('design(figma): button label extracted', spec.components.find((c) => c.role === 'button').label === 'Get started');
    t.ok('design(figma): colour + font tokens extracted', spec.tokens.colors.length >= 2 && spec.tokens.fontFamilies.includes('Inter') && spec.tokens.fontSizes.includes(32));
    t.ok('design(figma): text content captured', spec.text.includes('My Dashboard'));
    t.ok('design(figma): design-language.json fed for the contract', win.Engine.Sovereign.read('design-language.json') && win.Engine.Sovereign.read('design-language.json').palette.length >= 2);

    const ap = win.Engine.Design.applyTokens();
    t.ok('design: applyTokens writes public/design-tokens.css with CSS vars', ap.wrote === '/public/design-tokens.css' && /--font-sans: Inter/.test(win.Engine.FS.read('/public/design-tokens.css')) && /--radius:/.test(win.Engine.FS.read('/public/design-tokens.css')));

    const rep = win.Engine.Design.analyze();
    t.ok('design: analyze summarises component roles + tokens', rep.present && rep.componentRoles.button >= 1 && rep.tokens.colors >= 2 && rep.status === 'READY');
  }

  /* ---------- HTML ---------- */
  {
    const win = makeWin();
    const markup = '<style>:root{--x:0}button{background:#1d4ed8;border-radius:7px}body{font-family:"Georgia",serif;font-size:15px}</style>' +
      '<header><nav>Home</nav></header><main><h1>Welcome</h1><button>Save</button><input type="email"><section class="card">Item</section></main>';
    const spec = win.Engine.Design.ingest({ kind: 'html', markup: markup, name: 'page' });
    t.equal('design(html): status READY', spec.status, 'READY');
    t.ok('design(html): sections + button + input detected', spec.sections.some((s) => s.name === 'header') && spec.components.some((c) => c.role === 'button' && c.label === 'Save') && spec.components.some((c) => c.role === 'input' && c.inputType === 'email'));
    t.ok('design(html): css tokens extracted', spec.tokens.colors.includes('#1d4ed8') && spec.tokens.fontFamilies.some((f) => /Georgia/.test(f)) && spec.tokens.radii.includes(7));
  }

  /* ---------- screenshot — honestly staged (offline heuristic + vision path) ---------- */
  {
    const win = makeWin();
    const spec = win.Engine.Design.ingest({ kind: 'screenshot', dataUrl: 'data:image/png;base64,AAAA', name: 'shot' });
    t.equal('design(screenshot): status PARTIAL without a vision model (offline heuristic applied)', spec.status, 'PARTIAL');
    t.equal('design(screenshot): machine-readable reason still names the missing capability', spec.reason, 'VISION_MODEL_REQUIRED');
    t.ok('design(screenshot): the image is stored as the visual-fidelity reference', win.Engine.Sovereign.read('design-reference.txt') && spec.reference.stored === true);
    t.ok('design(screenshot): the note says SUPPORTED, not unsupported', /SUPPORTED/.test(spec.notes.join(' ')) && !/unsupported/i.test(spec.notes.join(' ')));
    // the async pixel pass runs but there is no canvas in the test VM -> records that honestly
    await win.Engine.Design.analyzeScreenshot('data:image/png;base64,AAAA').then((s2) => {
      t.ok('design(screenshot): the offline pixel pass records its result (no canvas here)', s2 && s2.pixelAnalyzed === false && /pixel analysis unavailable/.test(s2.notes.join(' ')));
    });
  }

  /* ---------- bad input ---------- */
  {
    const win = makeWin();
    t.equal('design: invalid figma json -> FAILED', win.Engine.Design.ingest({ kind: 'figma', json: '{not json' }).reason, 'INVALID_FIGMA_JSON');
    t.equal('design: unknown kind -> FAILED', win.Engine.Design.ingest({ kind: 'sketch' }).reason, 'UNKNOWN_INPUT_KIND');
  }
};
