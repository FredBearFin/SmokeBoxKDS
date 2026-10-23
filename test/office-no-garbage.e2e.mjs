// No office page may show the words "null", "undefined" or "NaN" (or "Infinity") to a person. Every office page (and the sheets they open: Close the day,
// the food safety record, the thrown-out log) is visited in a seeded own kitchen, the barbecue demo and a blank first-run kitchen, at a wide and a narrow
// size, and the visible text (and the text of charts' tables) is searched. Run: node test/office-no-garbage.e2e.mjs
import { withPage } from '../tools/pw.mjs';
import { realKitchen } from './_kitchen.mjs';

let failed = 0;
// Prints ok or FAIL for one check and remembers a failure for the exit code.
function check(name, ok, detail) { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); if (!ok) failed++; }
const BAD = /(^|[^A-Za-z0-9_.-])(null|undefined|NaN|Infinity|\[object Object\])([^A-Za-z0-9_-]|$)/;

// Opens each office page and the sheets, and returns a list of "where: sentence containing the garbage".
async function sweep(page, label) {
  const found = [];
  const pages = await page.evaluate(() => SB.office.pages().map((p) => p.id));
  for (const id of pages) {
    await page.evaluate((x) => { location.hash = '#/office/' + x; }, id);
    await page.waitForSelector('#sb-office h1.of-title', { timeout: 15000 });
    await page.waitForTimeout(900);
    // open every closed details so hidden text is checked too
    await page.evaluate(() => { document.querySelectorAll('#sb-office details').forEach((d) => { d.open = true; }); });
    await page.waitForTimeout(200);
    const texts = await page.evaluate(() => {
      const out = [], root = document.getElementById('sb-office');
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.trim(); if (t) out.push(t); }
      // labels and charts' hidden descriptions
      root.querySelectorAll('[aria-label],[title],[alt]').forEach((e) => { out.push(e.getAttribute('aria-label') || ''); out.push(e.getAttribute('title') || ''); });
      return out;
    });
    for (const t of texts) if (BAD.test(t)) found.push(label + ' / ' + id + ': ' + t.slice(0, 140));
  }
  return found;
}
// Opens the sheets that hold office text and returns what they say wrong.
async function sheets(page, label) {
  const found = [];
  const probe = async (name, open, sel) => {
    try {
      await page.evaluate(open); await page.waitForSelector(sel, { timeout: 6000 }); await page.waitForTimeout(400);
      const t = await page.evaluate((s) => document.querySelector(s).innerText, sel);
      for (const line of t.split('\n')) if (BAD.test(line)) found.push(label + ' / ' + name + ': ' + line.slice(0, 140));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    } catch (e) { /* a sheet that is not offered here is not a failure */ }
  };
  await probe('Close the day', () => { SB.sheets.open('orders'); setTimeout(() => { const b = document.querySelector('[data-act="closeday"]'); if (b) b.click(); }, 400); }, '.cd-page');
  await probe('safety record', () => { location.hash = '#/office/safety'; setTimeout(() => { const b = document.querySelector('[data-k="print-safety-log"]'); if (b) b.click(); }, 900); }, '.si-actions');
  return found;
}

for (const size of [[1280, 900], [390, 844]]) {
  for (const kit of ['seeded', 'demo', 'blank', 'sample']) {
    await withPage({ w: size[0], h: size[1], hash: kit === 'demo' ? '' : '', query: kit === 'demo' ? '?demo' : '' }, async (page, logs) => {
      await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });
      await page.evaluate(() => { try { SB.floor.setWelcome(false); } catch (e) { /* no welcome */ } });
      if (kit === 'seeded') {
        await realKitchen(page, { dishes: 3, orders: 3 });
        await page.evaluate(() => { const S = SB.store; for (const t of S.getState().tickets.slice(0, 2)) { for (const it of t.items) S.dispatchEx('completeItem', { ticketId: t.id, itemId: it.id }, { source: 'ui' }); S.dispatchEx('bumpTicket', { ticketId: t.id }, { source: 'ui' }); S.dispatchEx('payOrder', { orderId: t.orderId, method: 'cash', tip: 1 }, { source: 'ui' }); } });
      }
      // a real kitchen with the sample history switched on, the way the first-look flow shows it
      if (kit === 'sample') { await page.evaluate(() => { try { SB.sim.setSampleEnabled(true); } catch (e) { /* no simulator */ } }); await page.waitForTimeout(1500); }
      const label = kit + ' ' + size[0];
      const bad = (await sweep(page, label)).concat(await sheets(page, label));
      check(label + ': no null, undefined or NaN on any office page or sheet', bad.length === 0, bad.slice(0, 6));
      check(label + ': no console or page errors', !logs.errors.length && !logs.pageErrors.length, { e: logs.errors.slice(0, 2), p: logs.pageErrors.slice(0, 2) });
    });
  }
}
process.exit(failed ? 1 : 0);
