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
// Like seen(), but the text may be anywhere inside the element (for headings that start with a number).
const has = (page, text, scope) => page.evaluate(([t, sc]) => {
  const root = sc ? document.querySelector(sc) : document;
  return !!root && [...root.querySelectorAll('h2, h3, summary, button, a, label, p, div, span')].some((e) => e.getClientRects().length && e.textContent.replace(/\s+/g, ' ').indexOf(t) >= 0);
}, [text, scope || '']);
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
  check('price read-back: Reads as', await has(p, 'Reads as $5.50', sh));
  check('dishes sheet: Have a menu file? Import it', await seen(p, 'Have a menu file? Import it', sh));
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
  for (const t of ['Dishes and prices', 'Tax, hours and PIN', 'Guide', 'Set up this tablet', 'Help and about', 'Back office', 'Show me how it works']) check('menu: ' + t, await seen(p, t, sh));
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
  for (const t of ['Data, backup and reset', 'Back up now', 'Restore from a backup', 'Replacing this device', 'Danger zone: erase data']) check('data page: ' + t, await has(p, t, '#sb-office'));
  for (const t of ['Sales by day (for your accountant)', 'Download backup (JSON)', 'Copy backup', 'Choose a backup file', 'Check pasted backup', 'Erase live data', 'Erase everything']) check('data page: ' + t, await seen(p, t, '#sb-office'));
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

// Clicks the first visible button, summary or link whose text starts with this; true when one was found.
const tap = (page, t) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('button, summary, a')].filter((e) => e.getClientRects().length && e.textContent.trim().replace(/\s+/g, ' ').startsWith(t))[0];
  if (!b) return false;
  b.scrollIntoView({ block: 'center' }); b.click(); return true;
}, t);
// Adds a dish straight to the saved data (the add form is walked in blank()), so later walks start with something to sell.
const addDish = (page, d) => page.evaluate((d) => SB.store.dispatchEx('addMenuItem', Object.assign({ cat: 'fried', prepSec: 240, track: 'two' }, d), { source: 'ui' }), d);

// The cooked-ahead and portions walk: count portions, add a cooked-ahead item, log a batch, discard it with initials, fix the entry.
async function cooked(browser) {
  console.log('Cooked-ahead food, initials and fixes');
  const p = await fresh(browser);
  await addDish(p, { name: 'Hush puppies', short: 'Hush puppies', zone: 'fry', price: 5.5 });
  await addDish(p, { name: 'Pulled pork sandwich', short: 'Pork sand', zone: 'pit', cat: 'sandwich', price: 11 });
  await p.click('button:has-text("Menu")'); await p.click('[data-act="menu-edit"]'); await p.waitForTimeout(600);
  const sh = '.sheet-root';
  check('dishes: up and down arrows beside each dish', await p.evaluate(() => !!document.querySelector('.sheet-root button[aria-label="Move Hush puppies down"]') && !!document.querySelector('.sheet-root button[aria-label="Move Pulled pork sandwich up"]')));
  check('dishes: category list on each dish row', await p.evaluate(() => !!document.querySelector('.sheet-root select[aria-label="Category of Hush puppies"]')));
  check('portions: I count what I made', await seen(p, 'I count what I made', sh));
  await tap(p, 'I count what I made'); await p.waitForTimeout(300);
  await p.fill('input[aria-label="How many Hush puppies you made"]', '20');
  check('portions: Start counting', await tap(p, 'Start counting')); await p.waitForTimeout(1000);
  // The sheet does not redraw by itself after Start counting (reported to the setup owner), so close and reopen it to see the count.
  check('portions: the count is saved (20 portions on hand)', (await p.evaluate(() => SB.store.getState().ingredients.some((i) => i.unit === 'ea' && SB.store.getState().stock[i.id] === 20))));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('button:has-text("Menu")'); await p.click('[data-act="menu-edit"]'); await p.waitForTimeout(600);
  for (const t of ['20 left', '+10', 'Stop counting']) check('portions: ' + t, await seen(p, t, sh));
  for (const t of ['Do you cook any of this ahead and hold it?', 'Yes, I cook ahead', 'No, skip this']) check('cook ahead question: ' + t, await seen(p, t, sh));
  await tap(p, 'Yes, I cook ahead'); await p.waitForTimeout(400);
  check('cook ahead: Add a cooked-ahead item', await tap(p, 'Add a cooked-ahead item')); await p.waitForTimeout(600);
  for (const t of ['What do you cook ahead?', 'Hot or cold', 'How long may it stay, in hours?', 'Usual batch size, in kg', 'Which dishes use it?', 'Save cooked-ahead item']) check('cooked-ahead form: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await p.fill('.sheet-root:last-of-type input >> nth=0', 'Pulled pork');
  await p.click('.sheet-root:last-of-type input[type=checkbox] >> nth=0').catch(() => {});
  await tap(p, 'Save cooked-ahead item'); await p.waitForTimeout(700);
  // With no dish picked the first save warns once; a second tap keeps the item anyway.
  if (!(await seen(p, 'Log a first batch', '.sheet-root:last-of-type'))) { await tap(p, 'Save cooked-ahead item'); await p.waitForTimeout(700); }
  for (const t of ['Log a first batch', 'Done for now']) check('cooked-ahead saved: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await tap(p, 'Log a first batch'); await p.waitForTimeout(700);
  for (const t of ['New batch', 'Product', 'Put in hold cabinet']) check('cabinet new batch: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await tap(p, 'Put in hold cabinet'); await p.waitForTimeout(800);
  // The card shows one main button (Log temp here) and a "..." button named More for this batch; the rest are in its menu.
  check('batch card: Log temp', await seen(p, 'Log temp', '.sheet-root:last-of-type'));
  check('batch card: More for this batch', await p.evaluate(() => !!document.querySelector('button[aria-label="More for this batch"]')));
  await p.click('button[aria-label="More for this batch"]'); await p.waitForTimeout(400);
  for (const t of ['Pull', 'Start cooling', 'Discard']) check('batch card menu: ' + t, await p.evaluate((t) => [...document.querySelectorAll('[role=menuitem]')].some((e) => e.getClientRects().length && e.textContent.trim().startsWith(t)), t));
  await tap(p, 'Discard'); await p.waitForTimeout(500);
  await tap(p, 'Quality'); await tap(p, 'Discard batch'); await p.waitForTimeout(600);
  for (const t of ['Who is this?', 'Skip']) check('initials: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await p.fill('input[aria-label="Your initials"]', 'JM'); await tap(p, 'Discard batch'); await p.waitForTimeout(900);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await tap(p, 'Cabinet'); await p.waitForTimeout(500);
  check('cabinet: Entries are saved as JM, and Switch person', (await has(p, 'Entries are saved as JM')) && (await seen(p, 'Switch person')));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('button:has-text("Menu")'); await p.waitForTimeout(400);
  check('menu: Thrown-out log', await tap(p, 'Thrown-out log')); await p.waitForTimeout(600);
  for (const t of ['Save as spreadsheet', 'Print or save as PDF']) check('thrown-out log: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  check('thrown-out log: Fix this entry button', await p.evaluate(() => !!document.querySelector('.sheet-root:last-of-type button[data-act="fix-entry"]')));
  await p.click('.sheet-root:last-of-type button[data-act="fix-entry"]'); await p.waitForTimeout(500);
  for (const t of ['Fix this entry', 'What was wrong?', 'Save the fix']) check('fix: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await p.close();
}

// The close-the-day walk: an open order blocks it, paying it unblocks it, closing offers backup and print.
async function closeDay(browser) {
  console.log('Close the day');
  const p = await fresh(browser);
  await addDish(p, { name: 'Sweet tea', short: 'Sweet tea', zone: 'cold', price: 3, prepSec: 60, track: 'one' });
  await p.evaluate(() => SB.store.dispatchEx('createTicket', { customer: 'Maria', channel: 'dine_in', items: [{ menuId: 'sweet_tea', qty: 1 }], note: '', rush: false, src: 'live' }, { source: 'ui' }));
  await tap(p, 'Orders'); await p.waitForTimeout(500);
  check('orders: Close the day', await tap(p, 'Close the day')); await p.waitForTimeout(600);
  for (const t of ['Orders still open', 'Open Orders to pay or void', 'Money today']) check('close the day (open order): ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await tap(p, 'Open Orders to pay or void'); await p.waitForTimeout(600);
  await tap(p, 'Pay $'); await p.waitForTimeout(700);
  await tap(p, 'Close the day'); await p.waitForTimeout(600);
  for (const t of ['No open orders', 'Money today', 'Cash in the drawer should be', "Print today's summary"]) check('close the day (paid): ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await tap(p, 'Close the day'); await p.waitForTimeout(800);
  for (const t of ['The day is closed.', "Back up today's data now", "Print today's summary", 'Done']) check('closed: ' + t, await seen(p, t, '.sheet-root:last-of-type'));
  await p.close();
}

// The settings walk: units, stations marked Not used, the PIN pad's Forgot the PIN note.
async function settings(browser) {
  console.log('Units, stations, PIN');
  const p = await fresh(browser);
  await addDish(p, { name: 'Fries', short: 'Fries', zone: 'fry', price: 4 });
  await p.click('button:has-text("Menu")'); await p.click('[data-act="menu-edit"]'); await p.waitForTimeout(600);
  check('stations: Change stations', await tap(p, 'Change stations')); await p.waitForTimeout(400);
  for (const t of ['Not used', 'Add station']) check('stations: ' + t, await seen(p, t, '.sheet-root'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(() => SB.shell.setPin('1234')); await p.waitForTimeout(300);
  await tap(p, 'Back office'); await p.waitForTimeout(1000);
  for (const t of ['Manager PIN', 'Forgot the PIN?']) check('pin pad: ' + t, await seen(p, t));
  await p.evaluate(() => SB.shell.setPin(''));
  await p.close();
  const q = await fresh(browser);
  await tap(q, 'Back office'); await q.waitForTimeout(2200);
  await q.click('#sb-office nav >> text=Menu and settings'); await q.waitForTimeout(1400);
  for (const t of ['Temperatures', 'Weights']) check('units: ' + t, await seen(q, t, '#sb-office'));
  await q.close();
}

// The Try the demo walk: the welcome button asks first, the demo has a bar with Back to my kitchen, and your own kitchen stays empty.
async function tryDemo(browser) {
  console.log('Try the demo');
  const p = await fresh(browser);
  check('welcome: Try the demo', await seen(p, 'Try the demo'));
  await tap(p, 'Try the demo'); await p.waitForTimeout(700);
  for (const t of ['Try the demo?', 'Not now']) check('demo dialog: ' + t, await seen(p, t, '.sheet-host'));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.sheet-host button')].find((x) => x.textContent.trim() === 'Try the demo'); if (b) b.click(); });
  await p.waitForTimeout(2200);
  check('demo bar: You are trying the demo', await has(p, 'You are trying the demo.'));
  check('demo bar: Back to my kitchen', await seen(p, 'Back to my kitchen'));
  check('demo: sample tickets on the board', (await p.evaluate(() => document.querySelectorAll('.fl-slip').length)) > 0);
  await tap(p, 'Back to my kitchen'); await p.waitForTimeout(2200);
  check('back in your own kitchen: empty menu', (await p.evaluate(() => SB.store.getState().menu.length)) === 0);
  check('your own kitchen shows Add your first dish again', await seen(p, 'Add your first dish'));
  await p.close();
}

// The start-over walk: Menu has a Start over block, the sheet has three steps, and the erase needs a saved backup and the typed words.
async function startOver(browser) {
  console.log('Start over with an empty menu');
  const p = await fresh(browser);
  await addDish(p, { name: 'Fries', short: 'Fries', zone: 'fry', price: 4 });
  await p.click('button:has-text("Menu")'); await p.waitForTimeout(500);
  check('menu: Start over with an empty menu', await tap(p, 'Start over with an empty menu')); await p.waitForTimeout(600);
  const sh = '.sheet-root:last-of-type';
  for (const t of ['What happens', 'Keep my tax, hours, PIN and station names', 'Next: save a backup']) check('start over step 1: ' + t, await has(p, t, sh));
  await tap(p, 'Next: save a backup'); await p.waitForTimeout(500);
  check('start over step 2: Save a backup now', await seen(p, 'Save a backup now', sh));
  await tap(p, 'Save a backup now'); await p.waitForTimeout(900);
  await tap(p, 'Next: confirm'); await p.waitForTimeout(500);
  check('start over step 3: Erase everything and start over', await has(p, 'Erase everything and start over', sh));
  await p.fill(sh + ' input[type=text]', 'START OVER'); await tap(p, 'Erase everything and start over'); await p.waitForTimeout(1500);
  check('start over: the kitchen is empty afterwards', (await p.evaluate(() => SB.store.getState().menu.length)) === 0);
  await p.close();
}

// The demo walk: a fresh browser context opened with ?demo has sample dishes and tickets, and a normal tab in the same context stays empty.
async function demoMode(browser) {
  console.log('Demo mode (?demo)');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await ctx.newPage();
  await d.goto(FILE + '?demo'); await d.waitForTimeout(1000);
  check('?demo: sample dishes and tickets', (await d.evaluate(() => [SB.store.getState().menu.length, SB.store.getState().tickets.length])).every((n) => n > 0));
  check('?demo: Cabinet tab', await seen(d, 'Cabinet', '.fl-head'));
  const n = await ctx.newPage();
  await n.goto(FILE); await n.waitForTimeout(1000);
  check('a normal tab beside it stays empty', (await n.evaluate(() => [SB.store.getState().menu.length, SB.store.getState().tickets.length])).every((x) => x === 0));
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
try { await blank(browser); await cookAhead(browser); await cooked(browser); await closeDay(browser); await settings(browser); await startOver(browser); await tryDemo(browser); await demoMode(browser); } finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log('\n' + (results.length - bad.length) + ' of ' + results.length + ' checks held' + (bad.length ? '; ' + bad.length + ' failed' : ''));
process.exit(bad.length ? 1 : 0);
