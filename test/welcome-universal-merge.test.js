'use strict';
/* The app rendered two separate, inconsistent nav bars simultaneously - a
 * top header (renderTopNav) and a left sidebar (renderRail) - with
 * different, overlapping screen lists between them. At the user's request:
 * the Universal 19-stage composer was folded into the Welcome screen
 * (toggled inline via S.showUniversal, not a separate route) and named
 * "welcome"; the top nav's screen-tab row (which just duplicated the
 * sidebar) was removed entirely, keeping only its non-duplicate chrome
 * (logo, Agent/Environment/Backend chips, Run Preview/Deploy/Settings
 * buttons). Final screen set: Welcome, Agent, IDE, Settings.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');

  const railBody = appSrc.slice(appSrc.indexOf('function renderRail()'), appSrc.indexOf('function renderRail()') + 500);
  t.ok('the left rail no longer lists Universal as a separate screen', !/\['universal'/.test(railBody));
  t.ok('...but still has Welcome, Agent and IDE', /\['welcome'/.test(railBody) && /\['agent'/.test(railBody) && /\['ide'/.test(railBody));

  const topNavBody = appSrc.slice(appSrc.indexOf('function renderTopNav()'), appSrc.indexOf('function renderRail()'));
  t.ok('the top header no longer renders a <nav> of screen tabs', !/<nav class="cs-nav"/.test(topNavBody));
  t.ok('...but keeps its non-duplicate chrome (agent/env/backend chips)', /modelChip/.test(topNavBody) && /envChip/.test(topNavBody) && /backendChip/.test(topNavBody));
  t.ok('...and keeps the Run Preview / Deploy / Settings controls', /runPreviewBtn/.test(topNavBody) && /deployBtnTop/.test(topNavBody) && /settingsBtnTop/.test(topNavBody));

  const renderAllBody = appSrc.slice(appSrc.indexOf('function renderAll('), appSrc.indexOf('function renderAll(') + 1400);
  t.ok('renderAll() no longer treats "universal" as its own routable screen', !/screen === 'universal'/.test(renderAllBody));
  t.ok('...an unknown/legacy screen value falls back to welcome instead of rendering blank', /screen = 'welcome'/.test(renderAllBody));

  const welcomeBody = appSrc.slice(appSrc.indexOf('function renderWelcome()'), appSrc.indexOf('function bindWelcome()'));
  t.ok('the Welcome screen embeds the Universal composer inline, toggled by S.showUniversal',
    /S\.showUniversal/.test(welcomeBody) && /renderUniversal\(\)/.test(welcomeBody));

  const bindWelcomeBody = appSrc.slice(appSrc.indexOf('function bindWelcome()'), appSrc.indexOf('function bindWelcome()') + 900);
  t.ok('the "Open Universal Composer" button toggles the inline section instead of navigating away', /ucBtn\.onclick = \(\) => \{ S\.showUniversal = !S\.showUniversal; renderAll\(\); \}/.test(bindWelcomeBody));
  t.ok('bindWelcome() wires up the embedded Universal composer\'s own interactive elements when shown', /if \(S\.showUniversal\) bindUniversal\(\);/.test(bindWelcomeBody));

  // The actual generation path (what the user cares most about not breaking)
  // must be completely untouched by this nav consolidation.
  t.ok('genApp() (Welcome\'s "Generate App") still exists and is unrelated to the nav change', /function genApp\(\)/.test(appSrc));
  t.ok('runAgent()/runAgentWith() (the real generation path) still exist, untouched', /function runAgent\(\)/.test(appSrc) && /function runAgentWith\(/.test(appSrc));
};
