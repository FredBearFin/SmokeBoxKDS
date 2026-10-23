// Browser check of the Saved history card on the Data page and the line on the Close the day sheet. A real kitchen is driven by the engine to 50,
// 75, 90 and 100 percent of a lowered ticket limit. The page uses the store's historyFill() when it exists; when the store does not have it yet
// this test supplies the same numbers from the state (and says so). Also a quick axe pass on the amber card. Run: node test/office-history-fill.e2e.mjs
import fs from 'node:fs';
import { withPage } from '../tools/pw.mjs';
import { toolRequire } from '../tools/_deps.mjs';
import { realKitchen } from './_kitchen.mjs';

let failed = 0;
// Prints ok or FAIL for one check and remembers a failure for the exit code.
function check(name, ok, detail) { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); if (!ok) failed++; }
const axeSource = fs.readFileSync(toolRequire.resolve ? toolRequire.resolve('axe-core/axe.min.js') : '/opt/npm-tools/node_modules/axe-core/axe.min.js', 'utf8');
const CAP = 200;

await withPage({ w: 1280, h: 900, hash: '' }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });
  await page.evaluate(() => { try { SB.floor.setWelcome(false); } catch (e) { /* no welcome */ } });
  await realKitchen(page, { dishes: 3, orders: 0 });
  const real = await page.evaluate(() => typeof SB.store.historyFill === 'function');
  console.log('  note  the store has historyFill: ' + real + (real ? '' : ' (this test supplies the same numbers from the state)'));
  // Builds a kitchen of n tickets (about 8 a day, ending yesterday) with the engine, lowered ticket limit, and loads it like a restore.
  const load = (n, extra) => page.evaluate(({ n, CAP, extra }) => {
    SB.config.limits.maxTickets = CAP;
    const E = SB.engine, MIN = 60e3, today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.ceil(n / 8);
    const at = (d, h, m) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + d, h, m || 0, 0, 0).getTime();
    let now = at(0, 7), s = E.newState({ now, blank: true });
    const go = (type, p, t) => { now = Math.max(now + 1000, t); const r = E.apply(s, type, p, now); if (r.report !== 'ok') throw new Error(type + ' ' + r.report); s = r.state; return r; };
    const dish = go('addMenuItem', { name: 'Plate', zone: 'pit', cat: 'meat', price: 12, prepSec: 60, track: 'one', prepGuess: false }, now).info.id;
    for (let i = 0; i < n; i++) {
      const d = Math.floor(i / 8), cr = go('createTicket', { customer: 'T' + i, channel: 'dine_in', items: [{ menuId: dish }] }, at(d, 11 + (i % 8), 5));
      const tk = s.tickets.find((x) => x.id === cr.info.ticketId);
      go('completeItem', { ticketId: tk.id, itemId: tk.items[0].id }, now + 20000); go('bumpTicket', { ticketId: tk.id }, now + 5000); go('payOrder', { orderId: cr.info.orderId, method: 'cash' }, now + 3 * MIN);
      if (i % 8 === 7) go('closeDay', {}, at(d, 23, 30));
    }
    const rep = SB.store.importAll(JSON.stringify({ v: 1, takenAt: Date.now(), rev: 1, clock: { virtual: Date.now(), real: Date.now(), speed: 1 }, state: s }));
    if (!SB.store.__realFill) SB.store.__realFill = SB.store.historyFill || null;
    if (!SB.store.__realFill) SB.store.historyFill = () => { const st = SB.store.getState(); return Object.assign({ tickets: st.tickets.length, ticketsCap: CAP, events: SB.engine.allEvents(st).length, eventsCap: 1e6, bytes: 1e5, quotaBytes: 5e6, persisted: true }, window.__fillExtra || {}); };
    window.__fillExtra = extra || {};
    return { rep, tickets: SB.store.getState().tickets.length };
  }, { n, CAP, extra });
  // Opens the Data page fresh and gives the card's text.
  const cardText = async () => { await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(500); await page.evaluate(() => { location.hash = '#/office/data'; }); await page.waitForSelector('[aria-label="Saved history"]', { timeout: 15000 }); await page.waitForTimeout(300); return page.locator('[aria-label="Saved history"]').innerText(); };

  let r = await load(100);
  check('(setup) 100 tickets of 200', r.rep === 'ok' && r.tickets === 100, r);
  let t = await cardText();
  check('50 percent: a plain meter with days left, no warning, no button', /Your saved history: 50% full \(about \d+ more days at today's pace\)/.test(t) && !/Close the month/.test(t), t);
  check('the card is always there and not amber below 70 percent', (await page.locator('[aria-label="Saved history"]').getAttribute('data-level')) === 'ok');

  r = await load(150);
  t = await cardText();
  check('75 percent: the calm amber warning with the button', /Your saved history is 75% full\. Close the month to save it to files before older days are dropped\./.test(t) && (await page.locator('[aria-label="Saved history"] [data-action="history-close-month"]').isVisible()), t);
  check('and the card is amber', (await page.locator('[aria-label="Saved history"]').getAttribute('data-level')) === 'near');
  await page.evaluate(() => { window.__cm = 0; SB.setup = SB.setup || {}; SB.setup.openCloseMonth = () => { window.__cm++; }; });
  await page.locator('[data-action="history-close-month"]').click();
  check('the button opens the Close the month flow', (await page.evaluate(() => window.__cm)) === 1);
  // axe on the amber card
  await page.evaluate(axeSource);
  const ax = await page.evaluate(async () => { const res = await window.axe.run(document.querySelector('[aria-label="Saved history"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }); return res.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | ')); });
  check('axe finds nothing on the amber Saved history card', ax.length === 0, ax);
  const axPage = await page.evaluate(async () => { const res = await window.axe.run(document.querySelector('#od-data'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }); return res.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')); });
  check('and nothing on the whole Data page with the card in it', axPage.length === 0, axPage);

  r = await load(180);
  await page.evaluate(() => { SB.sheets.open('orders'); });
  await page.waitForSelector('[data-act="closeday"]', { timeout: 8000 });
  await page.locator('[data-act="closeday"]').first().click();
  await page.waitForSelector('.cd-page', { timeout: 8000 });
  check('90 percent: the Close the day sheet repeats the amber line', await page.evaluate(() => /Your saved history is 90% full/.test((document.querySelector('.cd-hist') || {}).textContent || '')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  r = await load(150);
  await page.evaluate(() => { SB.sheets.open('orders'); });
  await page.waitForSelector('[data-act="closeday"]', { timeout: 8000 });
  await page.locator('[data-act="closeday"]').first().click();
  await page.waitForSelector('.cd-page', { timeout: 8000 });
  check('75 percent: the Close the day sheet stays quiet (the line starts at 85 percent)', await page.evaluate(() => !document.querySelector('.cd-hist')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  r = await load(CAP + 30);
  check('100 percent: the engine holds the limit', r.tickets === CAP, r);
  t = await cardText();
  check('the card says it is full and what to do', /Your saved history is full, so older days are being dropped to make room\. Close the month to save them to files\./.test(t), t);

  // The browser line: with the real store it follows the browser's own answer; with the stub we say the browser did not promise.
  r = await load(100, { persisted: false });
  t = await cardText();
  const persisted = await page.evaluate(() => SB.store.historyFill().persisted);
  check('the browser-may-delete line shows exactly when the browser did not promise to keep the data (persisted: ' + persisted + ')', /This browser may delete saved data if the tablet is unused for a while\. Add Smokebox to the home screen/.test(t) === (persisted === false), t);

  // A real drop: a small limit, then more tickets than fit through the store, so the oldest days are dropped and the store notes it.
  r = await load(50);
  await page.evaluate(() => { SB.config.limits.maxTickets = 60; });
  await page.evaluate(() => {
    const S = SB.store, m = S.getState().menu[0];
    for (let i = 0; i < 25; i++) {
      const c = S.dispatchEx('createTicket', { customer: 'Late ' + i, channel: 'dine_in', items: [{ menuId: m.id }] }, { source: 'ui' });
      if (c.report !== 'ok') continue;
      const tk = S.getState().tickets.find((x) => x.id === c.info.ticketId);
      for (const it of tk.items) S.dispatchEx('completeItem', { ticketId: tk.id, itemId: it.id }, { source: 'ui' });
      S.dispatchEx('bumpTicket', { ticketId: tk.id }, { source: 'ui' }); S.flush();
    }
  });
  const dropped = await page.evaluate(() => SB.store.dataset({ sample: false }).droppedBefore || null);
  check('(real) the store notes the day before which history was dropped', typeof dropped === 'string', dropped);
  t = await cardText();
  check('after a drop the card says days before the date were dropped', /Older history was dropped to make room \(days before .+\)\. Close the month regularly to keep it in files\./.test(t), t);
  await page.evaluate(() => { SB.config.limits.maxTickets = 200; });
  check('no console or page errors', !logs.errors.length && !logs.pageErrors.length, { e: logs.errors, p: logs.pageErrors });
});
process.exit(failed ? 1 : 0);
