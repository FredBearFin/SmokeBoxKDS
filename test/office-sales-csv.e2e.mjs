// Browser check of the sales-by-day download for an accountant: the real download event, file name, contents, the empty case and the demo name.
// Run: node test/office-sales-csv.e2e.mjs   (about 20 s)
import { withPage } from '../tools/pw.mjs';
import fs from 'node:fs';

let failed = 0;
// Prints ok or FAIL for one check and remembers a failure for the exit code.
function check(name, ok, detail) { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); if (!ok) failed++; }

// Builds three weeks of paid orders inside the page with the real engine and loads them as a backup.
const loadThreeWeeks = () => {
  const E = SB.engine, H = 3600e3, MIN = 60e3;
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  let now = d0.getTime() - 21 * 86400e3 + 10 * H;
  let s = E.newState({ now, blank: true });
  const go = (type, p, dt) => { now += dt || 0; const r = E.apply(s, type, p, now); if (r.report !== 'ok') throw new Error(type + ' ' + r.report); s = r.state; return r; };
  const plate = go('addMenuItem', { name: 'Plate', zone: 'pit', cat: 'meat', price: 12.5, prepSec: 120, track: 'one', prepGuess: false }, 1000).info.id;
  const tea = go('addMenuItem', { name: 'Sweet tea', zone: 'cold', cat: 'cold', price: 3, prepSec: 20, track: 'one', prepGuess: false }, 1000).info.id;
  let n = 0;
  for (let day = 20; day >= 1; day--) {
    now = d0.getTime() - day * 86400e3 + 12 * H;
    for (let i = 0; i < 3; i++) {
      const r = go('createTicket', { customer: 'Order ' + (++n), channel: 'dine_in', items: [{ menuId: plate }, { menuId: tea }] }, 10 * MIN);
      const t = s.tickets[s.tickets.length - 1];
      t.items.forEach((it) => go('advanceItem', { ticketId: t.id, itemId: it.id }, 30000));
      go('bumpTicket', { ticketId: t.id }, 5000);
      go('payOrder', { orderId: r.info.orderId, method: i === 0 ? 'cash' : 'card', tip: i === 1 ? 2 : 0 }, 3 * MIN);
    }
  }
  const env = JSON.parse(SB.store.exportAll());
  env.state = s;
  return SB.store.importAll(JSON.stringify(env));
};

// Opens the Data page and clicks the sales button; returns the download or null when none starts.
async function clickSales(page) {
  await page.evaluate(() => { location.hash = '#/office/data'; });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { [...document.querySelectorAll('a')].find((a) => /^Data$/.test(a.textContent.trim()))?.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('.od-more').open = true; });
  const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await page.click('[data-csv=sales]');
  return dl;
}

await withPage({ w: 1280, h: 900 }, async (page, logs) => {
  await page.waitForTimeout(1200);
  await page.evaluate(() => SB.floor.setWelcome(false));
  const empty = await clickSales(page);
  check('a blank kitchen starts no download', empty === null);
  check('it says why in plain words', /No order has been paid yet/.test(await page.evaluate(() => [...document.querySelectorAll('.od-st')].map((e) => e.innerText).join(' '))));
  check('import of three weeks works', (await page.evaluate(loadThreeWeeks)) === 'ok');
  await page.waitForTimeout(500);
  const dl = await clickSales(page);
  check('a real-kitchen download starts', !!dl);
  if (dl) {
    const name = dl.suggestedFilename();
    check('the file name has sales-by-day and a date, no demo', /^smokebox-sales-by-day-\d{4}-\d{2}-\d{2}\.csv$/.test(name), name);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    const lines = text.trim().split('\r\n');
    check('header row has plain column names', lines[0] === 'Date,Orders paid,Sales (after discounts),Discounts given,Tax,Tips,Total collected,Collected in cash,Collected by card,Collected other', lines[0]);
    check('one row per day for 20 days plus a Total row', lines.length === 22 && lines[21].startsWith('Total,'), lines.length);
    const total = lines[21].split(',');
    check('the total counts 60 paid orders and adds up', total[1] === '60' && Math.abs(Number(total[7]) + Number(total[8]) + Number(total[9]) - Number(total[6])) < 0.005, total);
    check('every row has ten cells and no dollar signs', lines.every((l) => l.split(',').length === 10) && !/\$/.test(text));
  }
  check('no console or page errors', !logs.errors.length && !logs.pageErrors.length, { e: logs.errors, p: logs.pageErrors });
});

await withPage({ w: 1280, h: 900, hash: '?demo' }, async (page) => {
  await page.waitForTimeout(1500);
  await page.evaluate(() => { SB.floor.setWelcome(false); const s = SB.store.getState(); s.orders.filter((o) => o.status === 'open').forEach((o) => SB.store.dispatch('payOrder', { orderId: o.id, method: 'cash' })); });
  const dl = await clickSales(page);
  check('the demo kitchen download says demo in its name', !!dl && /^smokebox-sales-by-day-demo-/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
});
process.exit(failed ? 1 : 0);
