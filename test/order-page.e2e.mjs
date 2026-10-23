// New ticket page and sheet check (browser, quick: about 6 s). Run: node test/order-page.e2e.mjs
// Covers 71-floor-order.js: the sheet still works after the buildOrder split, SB.order.mount shows the same screen as a
// page, the unsent draft survives sheet -> page, and leaving a page with items asks first. Needs dist/smokebox.html.
import { withPage } from '../tools/pw.mjs';

let pass = 0, fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); } }

await withPage({ w: 1280, h: 800, query: '?demo' }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => { SB.floor.setWelcome(false); if (SB.sim) SB.sim.live.crew(false); });
  // Picks two menu items that are sellable right now (a fresh kitchen has no stock, so make some sellable if needed).
  const ids = await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived && SB.store.select.availability(m.id).ok).slice(0, 2).map((m) => m.id));
  check('at least two sellable menu items to test with', ids.length >= 2, ids);
  if (ids.length < 2) return;
  const tile = (id) => '.ord-tile[data-id="' + id + '"]';

  // 1. The sheet still works.
  await page.evaluate(() => SB.sheets.open('order'));
  await page.waitForSelector('.sheet .ord');
  await page.click(tile(ids[0]));
  check('sheet: tapping a tile adds a line', (await page.locator('.ord-line').count()) === 1);
  await page.fill('.ord-cust-input', 'Page test');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-side="center"] .sheet');
  await page.click('button:has-text("Close, keep draft")');
  await page.waitForTimeout(400);
  check('sheet: closing keeps the draft (no sheet left open)', (await page.locator('.sheet-root:not(.is-closing)').count()) === 0);

  // 2. The page shows the same draft.
  await page.evaluate(() => { window.__exit = []; window.__pg = SB.order.mountPage(document.getElementById('sb-order'), { onExit: (w) => window.__exit.push(w) }); document.getElementById('sb-order').hidden = false; });
  await page.waitForSelector('.ord-page .ord');
  check('page: the unsent draft is back', (await page.locator('.ord-page .ord-line').count()) === 1);
  check('page: customer name kept', (await page.inputValue('.ord-page .ord-cust-input')) === 'Page test');
  await page.click('.ord-page ' + tile(ids[1]));
  check('page: tapping a second tile adds a line', (await page.locator('.ord-page .ord-line').count()) === 2);
  await page.screenshot({ path: 'test/.out/order-page.png' });

  // 3. Leaving with items asks first; keep editing stays on the page.
  await page.click('.ord-page-back');
  await page.waitForSelector('[data-side="center"] .sheet');
  await page.click('button:has-text("Keep editing")');
  await page.waitForTimeout(300);
  check('page: Keep editing stays on the page', (await page.evaluate(() => window.__exit.length)) === 0 && (await page.locator('.ord-page').count()) === 1);

  // 4. Send from the page: ticket created, page closes with reason sent.
  const before = await page.evaluate(() => SB.store.getState().tickets.length);
  await page.click('.ord-page .ord-send');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => SB.store.getState().tickets.length);
  check('page: Send created one ticket', after === before + 1, { before, after });
  check('page: closed with reason sent and left the DOM', (await page.evaluate(() => window.__exit.join())) === 'sent' && (await page.locator('.ord-page').count()) === 0);

  // 5. After sending, a new page opens with an empty draft; destroy closes without asking.
  await page.evaluate(() => { window.__pg = SB.order.mountPage(document.getElementById('sb-order'), { onExit: (w) => window.__exit.push(w) }); });
  await page.waitForSelector('.ord-page .ord');
  check('page: next order starts empty', (await page.locator('.ord-page .ord-line').count()) === 0);
  await page.evaluate(() => window.__pg.destroy());
  check('page: destroy removes it', (await page.locator('.ord-page').count()) === 0);
  // 6. The router's #/new route mounts the page and leaving the route takes it down.
  await page.evaluate(() => SB.router.go({ kind: 'new' }));
  await page.waitForTimeout(300);
  check('route #/new shows the order page', (await page.locator('#sb-order .ord-page .ord').count()) === 1, await page.evaluate(() => location.hash));
  await page.evaluate(() => SB.router.go({ kind: 'floor', zone: 'all' }));
  await page.waitForTimeout(300);
  check('leaving #/new removes the page', (await page.locator('.ord-page').count()) === 0);
  check('console clean', logs.errors.length === 0 && logs.pageErrors.length === 0, { e: logs.errors.slice(0, 3), p: logs.pageErrors.slice(0, 3) });
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
