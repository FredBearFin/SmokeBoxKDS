// Orders page and one-tap payment check (browser, quick). Run: node test/orders-page.e2e.mjs
// Covers 73-floor-orders.js: the sheet still opens, SB.orders.mountPage shows the same list as a page, Add items on a
// page opens New ticket on top, the one-tap Pay button pays with the last way of paying and its Undo reopens the order.
import { withPage } from '../tools/pw.mjs';

let pass = 0, fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); } }

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => { SB.floor.setWelcome(false); if (SB.sim) SB.sim.live.crew(false); });
  const made = await page.evaluate(() => {
    const m = SB.store.getState().menu.find((x) => !x.archived && SB.store.select.availability(x.id).ok);
    return SB.store.dispatchEx('createTicket', { customer: 'Pay test', channel: 'dine_in', items: [{ menuId: m.id, qty: 2 }], note: '', rush: false }, { source: 'ui' }).report;
  });
  check('an open order to test with', made === 'ok', made);
  const orderState = () => page.evaluate(() => { const o = SB.store.getState().orders.find((x) => x.customer === 'Pay test'); return o && { status: o.status, method: o.method }; });

  // The sheet still opens and has the new buttons.
  await page.evaluate(() => SB.sheets.open('orders'));
  await page.waitForSelector('.sheet .ox-row');
  check('sheet: row has Pay and Tip or discount buttons', (await page.locator('.ox-row .ox-quick').count()) === 1 && (await page.locator('.ox-row .ox-take').count()) === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // The page version.
  await page.evaluate(() => { window.__exit = []; window.__pg = SB.orders.mountPage(document.getElementById('sb-order'), { onExit: (w) => window.__exit.push(w) }); document.getElementById('sb-order').hidden = false; });
  await page.waitForSelector('.ox-page .ox-row');
  const label = await page.textContent('.ox-page .ox-quick');
  check('page: Pay button names the amount and way', /^Pay \$[\d.,]+ cash$/.test(label.trim()), label);
  await page.screenshot({ path: 'test/.out/orders-page.png' });
  await page.click('.ox-page .ox-add');
  await page.waitForSelector('.sheet .ord');
  check('page: Add items opens New ticket on top, page stays', (await page.locator('.ox-page').count()) === 1 && (await page.inputValue('.sheet .ord-cust-input')) === '');
  await page.evaluate(() => SB.sheets.closeAll());
  await page.waitForTimeout(300);

  // One-tap pay and undo.
  await page.click('.ox-page .ox-quick');
  await page.waitForTimeout(300);
  let o = await orderState();
  check('one tap marked the order paid by cash', o && o.status === 'paid' && o.method === 'cash', o);
  await page.click('.toast button:has-text("Undo")');
  await page.waitForTimeout(300);
  o = await orderState();
  check('Undo reopened the order', o && o.status === 'open', o);

  await page.evaluate(() => window.__pg.destroy());
  check('page: destroy removes it', (await page.locator('.ox-page').count()) === 0);
  check('console clean', logs.errors.length === 0 && logs.pageErrors.length === 0, { e: logs.errors.slice(0, 3), p: logs.pageErrors.slice(0, 3) });
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
