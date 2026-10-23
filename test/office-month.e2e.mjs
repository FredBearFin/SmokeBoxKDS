// Browser check for Close the month on the Data page and the cleared-days note: a real kitchen of 50 closed days is loaded, the card shows the
// store's own preview and starts the guarded flow, and after the history is cleared the office pages say so (and the safety page does not).
// Run: node test/office-month.e2e.mjs
import { withPage } from '../tools/pw.mjs';
import { realKitchen } from './_kitchen.mjs';

let failed = 0;
// Prints ok or FAIL for one check and remembers a failure for the exit code.
function check(name, ok, detail) { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); if (!ok) failed++; }

await withPage({ w: 1280, h: 900, hash: '' }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });
  await page.evaluate(() => { try { SB.floor.setWelcome(false); } catch (e) { /* no welcome */ } });
  await realKitchen(page, { dishes: 3, orders: 0 });
  // A kitchen with nothing old must still draw the whole Data page, with the card saying there is nothing to clear
  await page.evaluate(() => { location.hash = '#/office/data'; });
  await page.waitForSelector('#od-data', { timeout: 15000 });
  check('a young kitchen: the card says nothing is old enough and the button is off', /Nothing is old enough to clear yet/.test(await page.locator('[aria-label="Close the month"]').innerText()) && await page.locator('[data-action="close-month"]').isDisabled());
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(500);
  // Build 50 closed days ending yesterday inside the page with the real engine, then load that kitchen like a restore.
  const built = await page.evaluate(() => {
    const E = SB.engine, MIN = 60e3, today = new Date(); today.setHours(0, 0, 0, 0);
    const at = (d, h, m) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 50 + d, h, m || 0, 0, 0).getTime();
    let now = at(0, 7), s = E.newState({ now, blank: true });
    const go = (type, p, t) => { now = Math.max(now + 1000, t == null ? now : t); const r = E.apply(s, type, p, now); if (r.report !== 'ok') throw new Error(type + ' ' + r.report); s = r.state; return r; };
    go('updateSettings', { patch: { service: { taxRatePct: 8.25 } } });
    const ids = [['Brisket', 16.49], ['Pork', 12.99]].map(([name, price]) => go('addMenuItem', { name, zone: 'pit', cat: 'meat', price, prepSec: 60, track: 'one', prepGuess: false }).info.id);
    for (let d = 0; d < 50; d++) {
      for (let j = 0; j < 3; j++) {
        const cr = go('createTicket', { customer: 'D' + d + j, channel: 'dine_in', items: [{ menuId: ids[j % 2], qty: 1 }] }, at(d, 12 + j, 5));
        const tk = s.tickets.find((x) => x.id === cr.info.ticketId);
        for (const it of tk.items) go('completeItem', { ticketId: tk.id, itemId: it.id }, now + 20000);
        go('bumpTicket', { ticketId: tk.id }, now + 5000);
        go('payOrder', { orderId: cr.info.orderId, method: 'cash', tip: 1 }, now + 3 * MIN);
      }
      go('closeDay', {}, at(d, 23, 30));
    }
    const todayKey = SB.util.serviceDate(now + 3600e3, 4);
    const env = (st) => JSON.stringify({ v: 1, takenAt: Date.now(), rev: 1, clock: { virtual: now + 3600e3, real: Date.now(), speed: 1 }, state: st });
    const pr = E.closeMonth(s, { before: todayKey }, now + 3600e3);
    window.__full = env(s); window.__pruned = pr.state ? env(pr.state) : null;
    return { report: pr.report, before: pr.state && pr.state.archivedBefore, orders: s.orders.length, left: pr.state ? pr.state.orders.length : null };
  });
  check('(setup) the page built 50 closed days and a pruned copy', built.report === 'ok' && built.left < built.orders, built);
  const rep = await page.evaluate(() => SB.store.importAll(window.__full));
  check('(setup) the full kitchen is loaded', rep === 'ok', rep);
  await page.evaluate(() => { location.hash = '#/office/data'; });
  await page.waitForSelector('#od-data', { timeout: 15000 });
  const card = page.locator('[aria-label="Close the month"]');
  await card.waitFor({ timeout: 8000 });
  const txt = await card.innerText();
  check('the card says in one paragraph what it does', /saves a complete backup/.test(txt) && /safety record/.test(txt), txt);
  check('and shows the store\'s own preview numbers', /Ready to save and clear \d+ days? .*\d+ tickets?, \d+ orders? and \d+ activity records?/.test(txt), txt);
  check('and what stays', /Stays on this tablet: \d+ safety records?, \d+ end-of-day totals?/.test(txt), txt);
  // Start with the guarded flow from the other part missing: a plain refusal, nothing changed
  const before = await page.evaluate(() => SB.store.getState().orders.length);
  await card.locator('[data-action="close-month"]').click();
  await page.waitForTimeout(300);
  const hasFlow = await page.evaluate(() => !!(SB.setup && SB.setup.openCloseMonth));
  if (hasFlow) {
    await page.waitForSelector('.sheet', { timeout: 8000 });
    check('the real confirm flow opens as a sheet and nothing is changed yet', (await page.evaluate(() => SB.store.getState().orders.length)) === before);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.sheet-backdrop'), null, { timeout: 5000 }).catch(() => {});
  } else check('without the confirm flow the button says so and changes nothing', /not available in this build/.test(await card.innerText()) && (await page.evaluate(() => SB.store.getState().orders.length)) === before);
  // With a flow present the button calls it with the day to count back from
  await page.evaluate(() => { window.__cmArgs = null; SB.setup = SB.setup || {}; SB.setup.openCloseMonth = async (o) => { window.__cmArgs = o; }; });
  await card.locator('[data-action="close-month"]').click();
  await page.waitForFunction(() => window.__cmArgs !== null, null, { timeout: 4000 });
  check('the button opens the guarded flow with the day to count back from', await page.evaluate(() => /^\d{4}-\d\d-\d\d$/.test(window.__cmArgs.before)));
  // After the history is cleared the pages say so
  await page.evaluate(() => SB.store.importAll(window.__pruned));
  await page.evaluate(() => {
    const today = SB.metrics.rangePresets(SB.store.now(), 4).find((p) => p.id === 'today');
    SB.office._debug.setFilterDefaults(() => ({ range: { id: 'custom', from: 0, to: today.to, label: 'All', fromKey: null, toKey: today.toKey }, channel: 'all', source: 'live' }));
  });
  const banner = async (pg) => { await page.evaluate((x) => { location.hash = '#/office/' + x; }, pg); await page.waitForSelector('#sb-office .of-banner-t', { state: 'attached', timeout: 10000 }); await page.waitForTimeout(900); return page.evaluate(() => document.querySelector('#sb-office .of-banner-t').textContent); };
    // leave the back office so it opens fresh with the range set above
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(800);
  for (const pg of ['money', 'pace', 'tickets', 'stations']) check(pg + ': the banner says the old days were saved and cleared', /Days before .+ were saved to your month files and cleared from this tablet\. Totals for those days are not shown here\./.test(await banner(pg)));
  check('safety: no such note (that record keeps its own entries)', !/cleared from this tablet/.test(await banner('safety')));
  check('Close the month card now offers at most the one day that aged past the keep time since', await (async () => { await page.evaluate(() => { location.hash = '#/office/data'; }); await page.waitForSelector('[aria-label="Close the month"]'); await page.waitForTimeout(400); const t = await page.locator('[aria-label="Close the month"]').innerText(); return /Nothing is old enough to clear yet/.test(t) || /Ready to save and clear [12] days?/.test(t); })());
  check('no console or page errors', !logs.errors.length && !logs.pageErrors.length, { e: logs.errors, p: logs.pageErrors });
});
process.exit(failed ? 1 : 0);
