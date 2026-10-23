// Payment helpers check (browser, quick). Run: node test/pay-ui.e2e.mjs
// Covers 73-floor-orders.js (Take payment box: tip presets, cash buttons, change) and 71-floor-order.js (tip buttons on a
// pay-now order). Only the existing payOrder fields are used: method, tip, discount.
import { withPage } from '../tools/pw.mjs';

let pass = 0, fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); } }

await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => { SB.floor.setWelcome(false); if (SB.sim) SB.sim.live.crew(false); });
  const made = await page.evaluate(() => {
    const m = SB.store.getState().menu.find((x) => !x.archived && SB.store.select.availability(x.id).ok);
    window.__food = m.price * 2;
    return SB.store.dispatchEx('createTicket', { customer: 'Cash test', channel: 'dine_in', items: [{ menuId: m.id, qty: 2 }], note: '', rush: false }, { source: 'ui' }).report;
  });
  check('an open order to pay', made === 'ok', made);
  const food = await page.evaluate(() => window.__food);
  await page.evaluate(() => SB.sheets.open('orders'));
  await page.waitForSelector('.ox-row');
  await page.click('.ox-row .ox-take');
  await page.waitForSelector('.ox-pay-go');
  check('cash buttons are shown for cash, starting with Exact', (await page.locator('.ox-cash-chips .chip').count()) >= 2 && /^Exact/.test(await page.locator('.ox-cash-chips .chip').first().textContent()));
  check('change line prompts before cash is chosen', /handed over/.test(await page.textContent('.ox-change')));
  await page.click('.ox-pay [aria-label="Quick tips"] .chip:has-text("20%")');
  const tip = Math.round(food * 20) / 100;
  const due = Math.round((food + tip) * 100) / 100;
  const bills = await page.$$eval('.ox-cash-chips .chip', (els) => els.map((e) => e.textContent));
  const big = bills.find((t) => /^\$\d+$/.test(t) && Number(t.slice(1)) > due);
  await page.click('.ox-cash-chips .chip:has-text("' + big + '")');
  const change = Math.round((Number(big.slice(1)) - due) * 100) / 100;
  check('change is worked out from the bill and the tip', (await page.textContent('.ox-change')).includes('$' + change.toFixed(2)), { text: await page.textContent('.ox-change'), change });
  await page.screenshot({ path: 'test/.out/pay-box.png' });
  await page.click('.ox-pay-go');
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => { const x = SB.store.getState().orders.find((y) => y.customer === 'Cash test'); return x && { status: x.status, tip: x.tip, method: x.method }; });
  check('order paid by cash with the 20% tip', o && o.status === 'paid' && o.method === 'cash' && Math.abs(o.tip - tip) < 0.005, o);
  await page.evaluate(() => SB.sheets.closeAll());

  // Pay now on a new ticket: tip buttons write into the tip box.
  await page.evaluate(() => SB.sheets.open('order'));
  await page.waitForSelector('.sheet .ord');
  await page.locator('.ord-tile:not(.is-86)').first().click();
  await page.click('.ord-pay [data-id="cash"]');
  await page.click('.ord-tip-chips .chip:has-text("18%")');
  const typed = await page.inputValue('.ord-tip-input');
  const sub = await page.evaluate(() => { const l = document.querySelector('.ord-total-sum').textContent.replace('$', ''); return Number(l); });
  check('18% button fills the tip box from the food total', Math.abs(Number(typed) - Math.round(sub * 18) / 100) < 0.005 && Number(typed) > 0, { typed, sub });
  await page.click('.ord-tip-chips .chip:has-text("No tip")');
  check('No tip clears the box', (await page.inputValue('.ord-tip-input')) === '');
  check('console clean', logs.errors.length === 0 && logs.pageErrors.length === 0, { e: logs.errors.slice(0, 3), p: logs.pageErrors.slice(0, 3) });
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
