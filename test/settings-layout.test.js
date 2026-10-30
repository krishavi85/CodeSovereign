'use strict';
/* Settings layout (dist/app.settings.js): the long page becomes sections, and the cards whose
 * controls are wired to nothing are not shown. The visual result is checked in the browser;
 * this pins the rules. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async function (t) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.settings.js'), 'utf8');
  const win = { console, setTimeout: () => 0, document: { addEventListener() {}, getElementById: () => null }, S: {} };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'app.settings.js' });
  const CS = win.CSSettings;

  t.deepEqual('the sections are Project, AI & Models, Agents, Integrations, Advanced, About', CS.SECTIONS.map((s) => s.label), ['Project', 'AI & Models', 'Agents', 'Integrations', 'Advanced', 'About']);
  t.deepEqual('the cards with nothing behind them are the ones removed', CS.REMOVED.slice().sort(), ['agent runtime', 'customize · mcp · modes', 'environment', 'open-source building stack', 'tools']);

  // each removed control really has no consumer: the state it writes is never read by behaviour
  const dist = (f) => fs.readFileSync(path.join(__dirname, '..', 'dist', f), 'utf8');
  const all = fs.readdirSync(path.join(__dirname, '..', 'dist')).filter((f) => /\.js$/.test(f)).map((f) => [f, dist(f)]);
  const readers = (re, exclude) => all.filter(([f, s]) => !exclude.test(f) && re.test(s)).map(([f]) => f);
  t.deepEqual('nothing outside the settings/runtime UI reads the "run on" target or provider', readers(/Runtime\.get\(\)\.(target|provider)|Runtime\.get\(\)\s*\)\.(target|provider)/, /^(engine\.runtime|app\.runtime)\.js$/), []);
  t.deepEqual('nothing reads the temperature / max-token sliders', readers(/S\.temp\b|S\.maxTok\b/, /^app\.js$/), []);
  const appSrc = dist('app.js');
  t.ok('the Agent panel no longer shows tool switches or sampling sliders', !/\$\{tool\('/.test(appSrc) && !/id="tempRange"/.test(appSrc) && !/id="maxTokRange"/.test(appSrc));
  t.ok('the top bar has no environment switch or fake avatar', !/id="envChip"/.test(appSrc) && !/class="cs-avatar"/.test(appSrc));
  t.ok('the "LLM • local" pill that claimed a model when none was connected is retired', /Retired: the top bar's model chip/.test(dist('app.llm.extras.js')));
};
