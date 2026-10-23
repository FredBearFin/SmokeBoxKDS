#!/usr/bin/env node
// WHAT THIS FILE IS: Clicks through the main steps the Guide describes on the real built app (dist/smokebox.html) and
//    fails when a button or screen the Guide names is not there any more. It is the check to run after any wording or
//    layout change on the board, the sheets or the back office.
// PARTS: a tiny step runner, the blank-kitchen walk, the demo walk, the summary.
// USES: Playwright through tools/_deps.mjs and a fresh `node tools/build.mjs`. USED BY: people, after a build. About 25 seconds.
// Run: node tools/build.mjs --quiet && node tools/guide-walk.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolRequire } from './_deps.mjs';

const { chromium } = toolRequire('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(ROOT, 'dist', 'smokebox.html');
const results = [];

// Records one check: its name, whether it held, and a short detail when it did not.
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : '  -> ' + JSON.stringify(detail))); };

// Opens a fresh copy of the app (empty saved data) in a new page.
async function fresh(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w || 1280, height: h || 800 } });
  page.on('pageerror', (e) => check('no page error', false, String(e)));
  await page.goto(FILE);
  await page.waitForTimeout(800);
  return page;
}
// True when an element with this visible text (or aria-label) can be seen inside the selector scope.
const seen = (page, text, scope) => page.evaluate(([t, sc]) => {
  const root = sc ? document.querySelector(sc) : document;
  if (!root) return false;
  return [...root.querySelectorAll('button, a, summary, h2, h3, label, legend, [role=tab], [role=radio], span, p, div')].some((e) => e.getClientRects().length && ((e.getAttribute('aria-label') || '').indexOf(t) === 0 || e.textContent.trim().replace(/\s+/g, ' ').indexOf(t) === 0));
}, [text, scope || '']);

// The blank-kitchen walk: every step of Getting started, Taking an order, Running the line and Backup.
async function blank(browser) {
  console.log('Blank kitchen');
  const p = await fresh(browser);
  check('welcome: Add your first dish', await seen(p, 'Add your first dish'));
  check('welcome: Show me how it works', await seen(p, 'Show me how it works'));
  await p.click('[data-act="first-dish"]'); await p.waitForTimeout(500);
  const sh = '.sheet-root';
  for (const t of ['Dishes and prices', 'What is it called?', 'Price in dollars', 'Where is it made?', 'Pit', 'Hot sides', 'Fry', 'Cold and drinks', 'Save and add another', 'Save and finish', 'Tax, hours and PIN']) check('dishes sheet: ' + t, await seen(p, t, sh));
  await p.fill(sh + ' input >> nth=0', 'Hush puppies'); await p.fill(sh + ' input >> nth=1', '5.50');
  await p.click(sh + ' >> text=Fry'); await p.click('text=Save and add another'); await p.waitForTimeout(400);
  check('dishes sheet: Remove', await seen(p, 'Remove', sh));
  await p.click(sh + ' >> text=Remove >> nth=0'); await p.waitForTimeout(400);
  check('dishes sheet: Removed dishes', await seen(p, 'Removed dishes', sh));
  await p.click('summary:has-text("Removed dishes")'); await p.waitForTimeout(300);
  check('dishes sheet: Bring it back', await seen(p, 'Bring it back', sh));
  await p.click('text=Bring it back >> nth=0'); await p.waitForTimeout(400);
  await p.click(sh + ' >> text=Tax, hours and PIN'); await p.waitForTimeout(500);
  for (const t of ['Sales tax', 'Opening hours', 'Manager PIN', 'Cooking ahead']) check('tax sheet: ' + t, await seen(p, t, sh));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('no Cabinet tab while Cooking ahead is No', !(await seen(p, 'Cabinet', '.fl-head')));
  // Menu list.
  await p.click('button:has-text("Menu")'); await p.waitForTimeout(500);
  for (const t of ['Dishes and prices', 'Guide', 'Set up this tablet', 'Help and about', 'Back office', 'Show me how it works']) check('menu: ' + t, await seen(p, t, sh));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // Order, cook, pay.
  await p.click('.fl-new'); await p.waitForTimeout(600);
  for (const t of ['Send to kitchen', 'Rush ticket', 'Add to open order', 'Any food allergy?']) check('new ticket: ' + t, await seen(p, t));
  await p.click('button[aria-label^="Hush puppies"]'); await p.click('text=Send to kitchen'); await p.waitForTimeout(800);
  for (const t of ['Start', 'Bump']) check('ticket: ' + t, await seen(p, t, '.fl-slip'));
  await p.click('.fl-slip .fl-row button >> nth=0'); await p.waitForTimeout(400);
  check('ticket: Done after Start', await seen(p, 'Done', '.fl-slip'));
  check('toast: Undo after an action', await seen(p, 'Undo', '.toast-host'));
  await p.click('text=Orders'); await p.waitForTimeout(500);
  for (const t of ['Tip or discount', 'Pay $']) check('orders: ' + t, await seen(p, t, sh));
  await p.click('text=Tip or discount'); await p.waitForTimeout(500);
  for (const t of ['Take payment', 'Cash', 'Card', 'Other', 'Mark paid']) check('take payment: ' + t, await seen(p, t));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('header: Recall and 86 board', (await seen(p, 'Recall', '.fl-head')) && (await seen(p, '86 board', '.fl-head')));
  // Back office: backup.
  await p.click('button:has-text("Back office")'); await p.waitForTimeout(2200);
  for (const t of ['Sales and money', 'Safety', 'Menu and settings']) check('back office nav: ' + t, await seen(p, t, '#sb-office'));
  await p.click('#sb-office nav >> text=Menu and settings'); await p.waitForTimeout(1400);
  for (const t of ['Data, backup and reset', 'Download backup (JSON)', 'Copy backup', 'Choose a backup file', 'Check pasted backup']) check('data page: ' + t, await seen(p, t, '#sb-office'));
  await p.close();
}

// The cook-ahead walk: turn Cooking ahead on, then the Cabinet appears.
async function cookAhead(browser) {
  console.log('Cooking ahead on');
  const p = await fresh(browser);
  await p.evaluate(() => SB.store.dispatchEx('addMenuItem', { name: 'Hush puppies', short: 'Hush puppies', zone: 'fry', cat: 'fried', price: 5.5, prepSec: 240, track: 'two' }, { source: 'ui' }));
  await p.click('button:has-text("Menu")'); await p.click('[data-act="menu-edit"]'); await p.waitForTimeout(500);
  await p.click('.sheet-root >> text=Tax, hours and PIN'); await p.waitForTimeout(500);
  await p.click('.sheet-root >> text=Yes >> nth=0'); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check('Cabinet tab appears when Cooking ahead is Yes', await seen(p, 'Cabinet', '.fl-head'));
  check('Sanitize button appears when Cooking ahead is Yes', await seen(p, 'Sanitize', '.fl-head'));
  await p.click('text=Cabinet'); await p.waitForTimeout(500);
  for (const t of ['New batch', 'Hold cabinet']) check('cabinet: ' + t, await seen(p, t, '.fl-cabinet'));
  await p.close();
}

// The demo walk: the practice kitchen fills the board and can be stopped.
async function demo(browser) {
  console.log('Demo kitchen');
  const p = await fresh(browser);
  const btn = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).find((t) => /busy-night demo/i.test(t)) || '');
  check('welcome offers the busy-night demo', !!btn, btn);
  if (btn) { await p.click('button:has-text("busy-night demo")'); await p.waitForTimeout(1500); check('demo: tickets appear on the board', (await p.evaluate(() => document.querySelectorAll('.fl-slip').length)) > 0); }
  check('header: Demo button', await seen(p, 'Demo', '.fl-head'));
  await p.close();
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
try { await blank(browser); await cookAhead(browser); await demo(browser); } finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log('\n' + (results.length - bad.length) + ' of ' + results.length + ' checks held' + (bad.length ? '; ' + bad.length + ' failed' : ''));
process.exit(bad.length ? 1 : 0);
