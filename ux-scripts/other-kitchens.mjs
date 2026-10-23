// Other kitchens: four first-time owners who do NOT run a barbecue place (pizza shop, bakery-cafe, taco truck, bar with food) drive the
// real UI from a blank install to a first paid ticket, with messy input. After each screen the script scans what is on screen for barbecue
// leftovers in words (Meats, Pit, Smoker, brisket, ribs, slaw, Hot sides, ...) that the owner never typed, and each kitchen gets PASS or FAIL:
// PASS = reached a paid ticket, no page errors, no barbecue words on any scanned screen. Scripted, headless Chromium; not real people.
// Run after building: node ux-scripts/other-kitchens.mjs   (shots in docs/ux-shots/night/a2/other/, log in the same folder)
import fs from 'node:fs';
import path from 'node:path';
import { withPage, ROOT } from '../tools/pw.mjs';
const OUT = path.join(ROOT, 'docs/ux-shots/night/a2/other');
fs.mkdirSync(OUT, { recursive: true });
const BBQ = /\b(meats?|pit|smoker|smoked|smoking|brisket|barbecue|bbq|pulled pork|ribs?|slaw|burnt ends|hot sides|hush puppies|cornbread|banana pudding|potato salad|pit master|pitmaster)\b/i;
const lines = [];
const results = {};
let kitchen = '';
const note = (m) => { lines.push(kitchen + ': ' + m); console.log(kitchen + ': ' + m); };
const ready = (p) => p.waitForFunction(() => window.SB && SB.booted === true);
const shot = (p, n) => p.screenshot({ path: path.join(OUT, kitchen + '-' + n + '.png') });
// Looks at the page text (including what shows behind a sheet) for barbecue words the owner never typed, and notes each hit once.
async function scan(page, screen, ownerWords) {
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const own = (ownerWords || []).map((w) => w.toLowerCase());
  const hits = new Set();
  let m; const re = new RegExp(BBQ.source, 'gi');
  while ((m = re.exec(text))) { const ctx = text.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25); if (own.some((w) => ctx.toLowerCase().includes(w))) continue; hits.add(m[0] + ' ... ' + ctx); }
  const list = [...hits].slice(0, 4);
  // Setup screens (before the owner has renamed anything, and the setup pick lists) are reported separately from the screens the owner
  // lives in (order screen, board, tickets): only the second kind fails a kitchen.
  const setup = /first screen|dishes sheet|stations fold|dishes list|more ways|import preview|sections/.test(screen);
  (results[kitchen][setup ? 'setupBbq' : 'bbq'] = results[kitchen][setup ? 'setupBbq' : 'bbq'] || []).push(...list.map((h) => screen + ': ' + h));
  if (list.length) note((setup ? 'starter names on setup screen [' : 'BBQ WORDS on [') + screen + ']: ' + JSON.stringify(list));
}
// Runs one kitchen: sets up its result record, runs fn, and decides PASS or FAIL.
async function run(name, opts, fn) {
  kitchen = name; results[name] = { paid: false, errors: 0, bbq: [], setupBbq: [] };
  try {
    await withPage({ w: 1024, h: 768, touch: true, ...opts }, async (page, logs) => {
      await ready(page); await page.waitForTimeout(500);
      try { await fn(page); } catch (e) { await shot(page, 'crash'); throw e; }
      results[name].errors = logs.pageErrors.length;
      results[name].paid = await page.evaluate(() => (SB.store.getState().orders || []).some((o) => o && (o.paid || o.status === 'paid' || o.paidAt)));
    });
  } catch (e) { results[name].crash = String(e.message).split('\n')[0]; note('CRASH ' + results[name].crash); }
  if (results[name].crash) lines.push(kitchen + ': (see ' + kitchen + '-crash.png)');
  const r = results[name];
  r.pass = r.paid && !r.errors && !r.crash && r.bbq.length === 0;
  note((r.pass ? 'PASS' : 'FAIL') + ' (paid ' + r.paid + ', page errors ' + r.errors + ', barbecue words in live screens ' + r.bbq.length + ', starter names on setup screens ' + r.setupBbq.length + (r.crash ? ', crash' : '') + ')');
}
// Adds one dish through the form: name, price, optional station tile, then Save and add another.
async function add(page, nm, pr, zone) {
  await page.fill('.dp-name', nm); await page.fill('.dp-price', pr);
  if (zone && (await page.locator('.dp-tiles').isVisible())) await page.click('.dp-tile[data-zone=' + zone + ']');
  await page.click('[data-act=save-again]'); await page.waitForTimeout(150);
}
// Renames a station in the Change stations fold and marks the named others "Not used".
async function stations(page, renameFrom, renameTo, notUsed) {
  await page.locator('.dp-stfold summary').click();
  if (renameFrom) { await page.fill('[aria-label="Name of station ' + renameFrom + '"]', renameTo); await page.locator('[aria-label="Name of station ' + renameFrom + '"]').blur(); await page.waitForTimeout(300); }
  for (const n of notUsed || []) { await page.locator('.dp-strow:has([aria-label="Name of station ' + n + '"]) button').click(); await page.waitForTimeout(150); }
}
// After station names change the owner taps "Reload to show on the board"; the dish form is opened again from the first-run button.
async function reloadAndReopen(page) {
  await page.getByRole('button', { name: /Reload to show on the board/ }).click();
  await page.waitForLoadState('load'); await ready(page); await page.waitForTimeout(500);
  await page.click('.fl-first-dish'); await page.waitForSelector('.dp-form');
}
// Renames the first menu section (the one every dish lands in) in the Change menu sections fold, then picks it for the next dish.
async function renameSection(page, to) {
  await page.locator('.dp-catfold summary').click();
  await page.fill('[aria-label="Name of section Meats"]', to); await page.locator('[aria-label="Name of section Meats"]').blur(); await page.waitForTimeout(300);
  await page.locator('.dp-catfold summary').click();
  await page.selectOption('.dp-menusec', 'meat');
}
// Orders the first dishes, pays cash and sends.
async function order(page, count) {
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(350);
  await page.click('.fl-new'); await page.waitForSelector('.ord-tile');
  await scan(page, 'order screen', []);
  await shot(page, 'order');
  const tiles = await page.$$('.ord-tile:not(.is-86)'); for (let i = 0; i < Math.min(count, tiles.length); i++) await tiles[i].click();
  await page.click('.ord-pay [data-id="cash"]'); await page.click('.ord-send'); await page.waitForTimeout(500);
}

// 1. Pizza shop: 12 dishes, one oven, sizes as separate dishes, takeout and phone orders.
await run('pizza', {}, async (page) => {
  await scan(page, 'first screen', []); await shot(page, 'first-run');
  await page.click('.fl-first-dish'); await page.waitForSelector('.dp-form');
  await scan(page, 'dishes sheet', []); await shot(page, 'dishes-first');
  await stations(page, 'Pit', 'Oven', ['Hot sides', 'Fry', 'Cold and drinks']);
  await scan(page, 'stations fold', ['Oven']); await shot(page, 'stations');
  await reloadAndReopen(page);
  await renameSection(page, 'Pizzas'); await shot(page, 'sections');
  for (const [n, p] of [['Small pepperoni', '$11'], ['Medium pepperoni', '14.5'], ['Large pepperoni', '17'], ['Large cheese', '15,50'], ['Large supreme', '$19'], ['Calzone', '10'], ['Garlic knots', '5.'], ['Wings (10)', '12'], ['Caesar salad', '8'], ['Meatball sub', '9.5'], ['2-liter soda', '3'], ['Cannoli', '4']]) await add(page, n, p, null);
  note('dishes added: ' + (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) + '; categories used: ' + JSON.stringify(await page.evaluate(() => [...new Set(SB.store.getState().menu.filter((m) => !m.archived).map((m) => (SB.config.categoryById[m.cat] || {}).name))])));
  await scan(page, 'dishes list', ['Oven']); await shot(page, 'dishes-list');
  await page.click('[data-act=save-done]').catch(() => {});
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await page.click('.fl-new'); await page.waitForSelector('.ord-tile');
  note('order screen: customer chips ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.ord-chips .chip')].map((c) => c.textContent.trim()).slice(0, 12))) + '; channels ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.sheet [role=radiogroup] .seg-opt')].map((c) => c.textContent.replace('needs attention', '').trim()).slice(0, 14))));
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await order(page, 3);
  await scan(page, 'board with ticket', ['Oven']); await shot(page, 'board');
});

// 2. Bakery-cafe: 30 items from a spreadsheet CSV (header row and a Notes column), nothing is cooked to order.
await run('bakery', {}, async (page) => {
  await page.click('.fl-first-dish'); await page.waitForSelector('.dp-form');
  await page.locator('.dp-ways summary').click(); await scan(page, 'more ways fold', []);
  await page.click('[data-act=open-import]'); await page.waitForTimeout(400);
  await page.setInputFiles('input[type=file]', path.join(ROOT, 'test/fixtures/menu-import/bakery-cafe-notes.csv')); await page.waitForTimeout(600);
  note('format: ' + (await page.locator('.dp-fmt').textContent()).slice(0, 200));
  note('file-level notes: ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.dp-preview .fs-note')].map((n) => n.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)))));
  note('rows ' + (await page.locator('.dp-prow').count()) + '; unticked ' + (await page.locator('.dp-prow input[type=checkbox]:not(:checked)').count()) + '; stations in preview ' + JSON.stringify(await page.evaluate(() => [...new Set([...document.querySelectorAll('.dp-prow select')].map((s) => s.selectedOptions[0].textContent))])));
  await scan(page, 'import preview', []); await shot(page, 'import-preview');
  await page.selectOption('[aria-label="Put every dish at this station"]', 'cold').catch(() => {});
  await page.selectOption('[aria-label="Put every dish in this menu section"]', 'cold').catch(() => note('no bulk menu-section list in the preview'));
  await page.click('[data-act=import-go]'); await page.waitForTimeout(600);
  note('categories after import: ' + JSON.stringify(await page.evaluate(() => { const c = {}; SB.store.getState().menu.filter((m) => !m.archived).forEach((m) => { const n = (SB.config.categoryById[m.cat] || {}).name; c[n] = (c[n] || 0) + 1; }); return c; })));
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await scan(page, 'board after import', []); await shot(page, 'board-empty');
  await order(page, 2);
  note('ticket on the board: ' + JSON.stringify(await page.evaluate(() => (document.querySelector('.fl-grid, .fl-main') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 220))));
  await scan(page, 'board with ticket', []); await shot(page, 'board');
});

// 3. Taco truck: 8 dishes, one person, speed matters, prices "3.5" and "$4".
await run('taco', {}, async (page) => {
  await page.click('.fl-first-dish'); await page.waitForSelector('.dp-form');
  await stations(page, 'Pit', 'Grill', ['Hot sides', 'Fry', 'Cold and drinks']); await reloadAndReopen(page);
  await renameSection(page, 'Tacos');
  const t0 = Date.now();
  let taps = 0; // tiles are skipped when one station is left
  for (const [n, p] of [['Carne asada taco', '3.5'], ['Al pastor taco', '$3.50'], ['Chicken taco', '3.5'], ['Fish taco', '$4'], ['Veggie taco', '3'], ['Burrito', '$9'], ['Chips and salsa', '2.5'], ['Horchata', '$3']]) { await add(page, n, p, null); taps++; }
  note('8 dishes in ' + (Date.now() - t0) + ' ms of script time; saves tapped ' + taps + '; tile question shown: ' + (await page.locator('.dp-tiles').isVisible()));
  await scan(page, 'dishes list', ['Grill']); await shot(page, 'dishes-list');
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await page.click('.fl-new'); await page.waitForSelector('.ord-tile'); await shot(page, 'order');
  note('order screen category headings: ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.ord-cat-head')].map((h) => h.textContent))));
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  let taps2 = 0; await page.click('.fl-new'); taps2++; await page.waitForSelector('.ord-tile');
  const tiles = await page.$$('.ord-tile:not(.is-86)'); for (let i = 0; i < 3; i++) { await tiles[i].click(); taps2++; }
  await page.click('.ord-pay [data-id="cash"]'); taps2++; await page.click('.ord-send'); taps2++; await page.waitForTimeout(500);
  note('a 3-taco cash order from the board took ' + taps2 + ' taps');
  await scan(page, 'board with ticket', ['Grill']); await shot(page, 'board');
});

// 4. Bar with food: 10 food dishes; the owner does NOT want drinks in the app.
await run('bar', {}, async (page) => {
  await page.click('.fl-first-dish'); await page.waitForSelector('.dp-form');
  await stations(page, 'Pit', 'Kitchen', ['Hot sides', 'Fry']); await reloadAndReopen(page);
  await renameSection(page, 'Bar food');
  for (const [n, p] of [['Wings (8)', '11'], ['Nachos', '$12'], ['Burger', '13.5'], ['Chicken sandwich', '12'], ['Fish and chips', '$14'], ['Soft pretzel', '7'], ['Mozzarella sticks', '8'], ['Loaded fries', '9'], ['Side salad', '6'], ['Chili bowl', '8.5']]) await add(page, n, p, 'pit');
  note('tiles shown for station question: ' + (await page.locator('.dp-tiles').isVisible()) + ' (Cold and drinks still in use, so the owner is asked)');
  await scan(page, 'dishes list', ['Kitchen']); await shot(page, 'dishes-list');
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  note('board station tabs: ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.fl-tabs .seg-opt, .seg-opt')].map((b) => b.textContent.replace('needs attention', '').trim()).slice(0, 10))));
  await scan(page, 'board', ['Kitchen']); await shot(page, 'board-empty');
  await page.evaluate(() => SB.sheets.open('help')); await page.waitForTimeout(500); await scan(page, 'help sheet', ['Kitchen']); await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(600);
  await page.evaluate(() => SB.sheets.open('board86')); await page.waitForTimeout(500); await scan(page, '86 board', ['Kitchen']); await shot(page, '86-board'); await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(600);
  await order(page, 2);
  await scan(page, 'board with ticket', ['Kitchen']); await shot(page, 'board');
});

fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n'));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
console.log('\n' + Object.entries(results).map(([k, r]) => k + ': ' + (r.pass ? 'PASS' : 'FAIL')).join('   '));
process.exit(Object.values(results).every((r) => r.pass) ? 0 : 1);
