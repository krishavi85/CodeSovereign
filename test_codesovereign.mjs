import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';

const BASE_URL = 'https://9ufbgmcow9u7.space.mcode.io';
const SCREENSHOT_DIR = 'C:/Users/krish/Downloads/CodeSovereign application/screenshots';

// Ensure screenshot directory exists
import { mkdirSync } from 'fs';
try { mkdirSync(SCREENSHOT_DIR, { recursive: true }); } catch(e) {}

const results = [];
const consoleErrors = [];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Launching Chromium browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[ERROR] ${msg.text()}`);
    }
    if (msg.type() === 'warning') {
      consoleErrors.push(`[WARN] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });

  // --- STEP 1: Navigate to the app ---
  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // --- STEP 3: Screenshot of initial state ---
  const ss1 = path.join(SCREENSHOT_DIR, '01_initial_state.png');
  await page.screenshot({ path: ss1, fullPage: false });
  console.log('Screenshot 1 (initial state) saved:', ss1);

  // Check initial state - Welcome should be highlighted
  const welcomeTopNavHighlighted = await page.evaluate(() => {
    // Look for top nav tabs
    const topNavEls = document.querySelectorAll('nav button, [role="tab"], .tab, .nav-item');
    const allElements = Array.from(document.querySelectorAll('*'));
    // Find elements with text "Welcome" that might be highlighted
    const welcomeEls = allElements.filter(el => 
      el.textContent.trim() === 'Welcome' && 
      el.children.length === 0
    );
    return welcomeEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      style: el.getAttribute('style'),
      parentClasses: el.parentElement ? el.parentElement.className : '',
      computedColor: window.getComputedStyle(el).color,
      computedBorderBottom: window.getComputedStyle(el).borderBottom,
      computedBackground: window.getComputedStyle(el).backgroundColor
    }));
  });
  console.log('Welcome elements found:', JSON.stringify(welcomeTopNavHighlighted, null, 2));

  // Dump the top nav HTML
  const topNavHTML = await page.evaluate(() => {
    // Try to find top navigation
    const nav = document.querySelector('nav') || document.querySelector('header') || document.querySelector('[class*="nav"]') || document.querySelector('[class*="top"]');
    return nav ? nav.outerHTML.substring(0, 3000) : 'No nav found';
  });
  console.log('Top nav HTML:', topNavHTML);

  // Dump full page structure for understanding
  const pageStructure = await page.evaluate(() => {
    return document.body.innerHTML.substring(0, 5000);
  });
  console.log('Page structure (first 5000 chars):', pageStructure);

  results.push({
    step: 'initial_state',
    screenshot: ss1,
    note: 'Initial page load - Welcome should be highlighted'
  });

  // --- STEP 4: Click "Agent" tab in top nav ---
  console.log('\n--- Clicking Agent in top nav ---');

  // Find and click Agent in top nav
  // First, let's find all clickable elements with "Agent" text
  const agentTopNavInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const agentEls = allEls.filter(el => 
      el.textContent.trim() === 'Agent' && 
      el.children.length === 0
    );
    return agentEls.map((el, i) => ({
      index: i,
      tag: el.tagName,
      classes: el.className,
      parentTag: el.parentElement ? el.parentElement.tagName : '',
      parentClasses: el.parentElement ? el.parentElement.className : '',
      rect: el.getBoundingClientRect(),
      id: el.id
    }));
  });
  console.log('Agent elements:', JSON.stringify(agentTopNavInfo, null, 2));

  // Try to click the Agent button in top nav (should be horizontally laid out, so top part of page)
  try {
    // Look for nav/horizontal bar elements with Agent text that are in the top area
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const agentEls = allEls.filter(el => 
        el.textContent.trim() === 'Agent' && 
        el.children.length === 0
      );
      // Find the one in top nav (y position < 100)
      const topNavAgent = agentEls.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.y < 100 && rect.y > 0;
      });
      if (topNavAgent) {
        console.log('Found top nav Agent at y:', topNavAgent.getBoundingClientRect().y);
        topNavAgent.click();
      }
    });
  } catch (e) {
    console.log('Could not click Agent via evaluate:', e.message);
  }

  await sleep(1000);

  const ss2 = path.join(SCREENSHOT_DIR, '02_after_agent_click.png');
  await page.screenshot({ path: ss2, fullPage: false });
  console.log('Screenshot 2 (after Agent click) saved:', ss2);

  // Check if Agent is highlighted
  const agentHighlightInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const agentEls = allEls.filter(el => 
      el.textContent.trim() === 'Agent' && 
      el.children.length === 0
    );
    return agentEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      rect: el.getBoundingClientRect(),
      computedBorderBottom: window.getComputedStyle(el).borderBottom,
      computedColor: window.getComputedStyle(el).color,
      computedBackground: window.getComputedStyle(el.parentElement || el).backgroundColor,
      parentClasses: el.parentElement ? el.parentElement.className : ''
    }));
  });
  console.log('Agent highlight info:', JSON.stringify(agentHighlightInfo, null, 2));

  results.push({
    step: 'agent_top_nav_click',
    screenshot: ss2,
    highlightInfo: agentHighlightInfo
  });

  // --- STEP 8: Click "Factory" in left rail ---
  console.log('\n--- Clicking Factory in left rail ---');

  const factoryInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const factoryEls = allEls.filter(el => 
      el.textContent.trim() === 'Factory' && 
      el.children.length === 0
    );
    return factoryEls.map((el, i) => ({
      index: i,
      tag: el.tagName,
      classes: el.className,
      parentClasses: el.parentElement ? el.parentElement.className : '',
      rect: el.getBoundingClientRect()
    }));
  });
  console.log('Factory elements:', JSON.stringify(factoryInfo, null, 2));

  try {
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const factoryEls = allEls.filter(el => 
        el.textContent.trim() === 'Factory' && 
        el.children.length === 0
      );
      // Find the one in left rail (x position < 150)
      const leftRailFactory = factoryEls.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.x < 150 && rect.x >= 0;
      });
      if (leftRailFactory) {
        console.log('Found left rail Factory at x:', leftRailFactory.getBoundingClientRect().x);
        leftRailFactory.click();
      } else {
        // click any factory element
        if (factoryEls.length > 0) factoryEls[0].click();
      }
    });
  } catch (e) {
    console.log('Could not click Factory via evaluate:', e.message);
  }

  await sleep(1000);

  const ss3 = path.join(SCREENSHOT_DIR, '03_after_factory_left_rail.png');
  await page.screenshot({ path: ss3, fullPage: false });
  console.log('Screenshot 3 (after Factory left rail click) saved:', ss3);

  const factoryHighlightInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const factoryEls = allEls.filter(el => 
      el.textContent.trim() === 'Factory' && 
      el.children.length === 0
    );
    return factoryEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      rect: el.getBoundingClientRect(),
      computedBackground: window.getComputedStyle(el.parentElement || el).backgroundColor,
      parentClasses: el.parentElement ? el.parentElement.className : ''
    }));
  });

  results.push({
    step: 'factory_left_rail_click',
    screenshot: ss3,
    highlightInfo: factoryHighlightInfo
  });

  // --- STEP 12: Click "IDE" in top nav ---
  console.log('\n--- Clicking IDE in top nav ---');

  try {
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const ideEls = allEls.filter(el => 
        el.textContent.trim() === 'IDE' && 
        el.children.length === 0
      );
      const topNavIDE = ideEls.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.y < 100 && rect.y > 0;
      });
      if (topNavIDE) {
        topNavIDE.click();
      } else if (ideEls.length > 0) {
        ideEls[0].click();
      }
    });
  } catch (e) {
    console.log('Could not click IDE:', e.message);
  }

  await sleep(1000);

  const ss4 = path.join(SCREENSHOT_DIR, '04_after_ide_top_nav.png');
  await page.screenshot({ path: ss4, fullPage: false });
  console.log('Screenshot 4 (after IDE top nav click) saved:', ss4);

  const ideHighlightInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const ideEls = allEls.filter(el => 
      el.textContent.trim() === 'IDE' && 
      el.children.length === 0
    );
    return ideEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      rect: el.getBoundingClientRect(),
      computedBorderBottom: window.getComputedStyle(el).borderBottom,
      computedColor: window.getComputedStyle(el).color,
      parentClasses: el.parentElement ? el.parentElement.className : ''
    }));
  });

  results.push({
    step: 'ide_top_nav_click',
    screenshot: ss4,
    highlightInfo: ideHighlightInfo
  });

  // --- STEP 16: Click "Recovery" in left rail ---
  console.log('\n--- Clicking Recovery in left rail ---');

  try {
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const recoveryEls = allEls.filter(el => 
        el.textContent.trim() === 'Recovery' && 
        el.children.length === 0
      );
      const leftRailRecovery = recoveryEls.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.x < 150 && rect.x >= 0;
      });
      if (leftRailRecovery) {
        leftRailRecovery.click();
      } else if (recoveryEls.length > 0) {
        recoveryEls[0].click();
      }
    });
  } catch (e) {
    console.log('Could not click Recovery:', e.message);
  }

  await sleep(1000);

  const ss5 = path.join(SCREENSHOT_DIR, '05_after_recovery_left_rail.png');
  await page.screenshot({ path: ss5, fullPage: false });
  console.log('Screenshot 5 (after Recovery left rail click) saved:', ss5);

  const recoveryHighlightInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const recoveryEls = allEls.filter(el => 
      el.textContent.trim() === 'Recovery' && 
      el.children.length === 0
    );
    return recoveryEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      rect: el.getBoundingClientRect(),
      computedBackground: window.getComputedStyle(el.parentElement || el).backgroundColor,
      parentClasses: el.parentElement ? el.parentElement.className : ''
    }));
  });

  results.push({
    step: 'recovery_left_rail_click',
    screenshot: ss5,
    highlightInfo: recoveryHighlightInfo
  });

  // --- STEP 20: Click "Pipelines" in top nav ---
  console.log('\n--- Clicking Pipelines in top nav ---');

  try {
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const pipelinesEls = allEls.filter(el => 
        el.textContent.trim() === 'Pipelines' && 
        el.children.length === 0
      );
      const topNavPipelines = pipelinesEls.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.y < 100 && rect.y > 0;
      });
      if (topNavPipelines) {
        topNavPipelines.click();
      } else if (pipelinesEls.length > 0) {
        pipelinesEls[0].click();
      }
    });
  } catch (e) {
    console.log('Could not click Pipelines:', e.message);
  }

  await sleep(1000);

  const ss6 = path.join(SCREENSHOT_DIR, '06_after_pipelines_top_nav.png');
  await page.screenshot({ path: ss6, fullPage: false });
  console.log('Screenshot 6 (after Pipelines top nav click) saved:', ss6);

  const pipelinesHighlightInfo = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const pipelinesEls = allEls.filter(el => 
      el.textContent.trim() === 'Pipelines' && 
      el.children.length === 0
    );
    return pipelinesEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      rect: el.getBoundingClientRect(),
      computedBorderBottom: window.getComputedStyle(el).borderBottom,
      computedColor: window.getComputedStyle(el).color,
      parentClasses: el.parentElement ? el.parentElement.className : ''
    }));
  });

  results.push({
    step: 'pipelines_top_nav_click',
    screenshot: ss6,
    highlightInfo: pipelinesHighlightInfo
  });

  // --- Final: Save results ---
  console.log('\n=== FINAL RESULTS ===');
  console.log('Console errors:', JSON.stringify(consoleErrors, null, 2));
  console.log('Test steps:', JSON.stringify(results, null, 2));

  writeFileSync('C:/Users/krish/Downloads/CodeSovereign application/test_results.json', JSON.stringify({
    url: BASE_URL,
    consoleErrors,
    results
  }, null, 2));

  await browser.close();
  console.log('\nDone! All screenshots saved to:', SCREENSHOT_DIR);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
