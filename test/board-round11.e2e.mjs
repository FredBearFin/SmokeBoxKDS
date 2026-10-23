// Board in other kitchens and under abuse (browser, about 45 s). Run: node test/board-round11.e2e.mjs
// Covers: a one-station kitchen on a phone (no station tabs, a short header, no "to 1 station" wording), a double-tapped Send,
// three tabs staying in step, rotating the tablet mid-order, a clock that goes backwards, offline use, and long names on the wall
// list. Needs dist/smokebox.html.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
// Opens the app in a fresh page of the given context and waits for it to boot.
async function boot(ctx, query) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(pathToFileURL(DIST).href + (query || ''));
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await p.waitForTimeout(400);
  return p;
}
const dishes = [['Wings', 'pit', 'meat', 14, 'two'], ['Slaw', 'cold', 'cold', 4, 'one'], ['Tea', 'cold', 'cold', 3, 'one']];
const addDishes = (p) => p.evaluate((d) => { SB.floor.setWelcome(false); d.forEach(([n, z, c, pr, tr]) => SB.store.dispatchEx('addMenuItem', { name: n, zone: z, cat: c, price: pr, prepSec: 60, track: tr }, { source: 'ui' })); }, dishes);

// One-station kitchen on a phone
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  let p = await boot(ctx);
  await p.evaluate(() => localStorage.setItem('smokebox.v1.setup.hiddenStations', JSON.stringify(['sides', 'fry', 'cold'])));
  await p.reload(); await p.waitForFunction(() => window.SB && SB.booted === true); await p.waitForTimeout(400);
  await p.evaluate((d) => { SB.floor.setWelcome(false); d.forEach(([n, , c, pr]) => SB.store.dispatchEx('addMenuItem', { name: n, zone: 'pit', cat: c, price: pr, prepSec: 60, track: 'two' }, { source: 'ui' })); }, dishes);
  await p.evaluate(() => { const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'A', channel: 'takeout', items: [{ menuId: m[0].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
  await p.waitForTimeout(1300);
  const r = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('.fl-seg .seg-opt')].filter((e) => e.offsetParent).length, head: Math.round(document.querySelector('.fl-head').getBoundingClientRect().height), sw: document.documentElement.scrollWidth }));
  check('one-station kitchen: no station tabs on the phone', r.tabs === 0, r);
  check('one-station kitchen: header is one row and the page does not scroll sideways', r.head <= 100 && r.sw <= 390, r);
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); await (await p.$$('.ord-tile'))[0].click();
  await p.click('button:has-text("View order")'); await p.waitForTimeout(300);
  await p.click('button:has-text("Send to kitchen")'); await p.waitForTimeout(700);
  const toast = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | '));
  check('one-station kitchen: the sent message does not count stations', /sent/.test(toast) && !/station/.test(toast), toast);
  await ctx.close();
}

// Abuse
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const p = await boot(ctx); await addDishes(p);
  const counts = () => p.evaluate(() => ({ t: SB.store.getState().tickets.length, o: SB.store.getState().orders.length }));
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); const tiles = await p.$$('.ord-tile'); await tiles[0].click(); await tiles[1].click();
  await p.locator('button:has-text("Send to kitchen")').first().dblclick({ delay: 10 }).catch(() => {}); await p.waitForTimeout(700);
  const c1 = await counts();
  check('a double-tapped Send makes one ticket and one order', c1.t === 1 && c1.o === 1, c1);
  await p.keyboard.press('n'); await p.waitForTimeout(300); const t3 = await p.$$('.ord-tile'); await t3[0].click(); await t3[1].click();
  await p.setViewportSize({ width: 768, height: 1024 }); await p.waitForTimeout(500);
  const rot = await p.evaluate(() => ({ lines: document.querySelectorAll('.ord-line').length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('rotating to portrait mid-order keeps the lines and does not scroll sideways', rot.lines === 2 && rot.sw <= rot.cw, rot);
  await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(400);
  check('rotating back keeps the lines', (await p.evaluate(() => document.querySelectorAll('.ord-line').length)) === 2);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); if (await p.locator('button:has-text("Close, keep draft")').count()) await p.click('button:has-text("Close, keep draft")'); await p.waitForTimeout(300);
  await ctx.setOffline(true);
  await p.evaluate(() => { const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'Offline', channel: 'takeout', items: [{ menuId: m[2].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); }); await p.waitForTimeout(300);
  const off = await counts(); await ctx.setOffline(false);
  check('a ticket made while offline is kept', off.t === 2, off);
  await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() - 3 * 3600e3; });
  await p.waitForTimeout(2500);
  check('the clock going back three hours does not break the board', (await p.evaluate(() => document.querySelectorAll('.fl-slip').length)) === 2);
  const b = await boot(ctx), c = await boot(ctx);
  for (const [i, q] of [p, b, c].entries()) await q.evaluate((i) => { const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'Tab' + i, channel: 'takeout', items: [{ menuId: m[i % m.length].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); }, i);
  await p.waitForTimeout(2500);
  const all = await Promise.all([p, b, c].map((q) => q.evaluate(() => SB.store.getState().tickets.length)));
  check('three tabs end with the same tickets and none lost', new Set(all).size === 1 && all[0] >= 5, all);
  await ctx.close();
}

// Long names on the wall list
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await boot(ctx, '?demo');
  await p.evaluate(() => { SB.floor.setWelcome(false); SB.floor.setWall(true); SB.sim.live.crew(false); SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true }); const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'Customer Name That Is Forty Characters!!', channel: 'dine_in', items: [{ menuId: m[0].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
  await p.waitForTimeout(1500);
  const wn = await p.evaluate(() => { const e = document.querySelector('.fl-wall-name'); return e ? { h: Math.round(e.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(e).fontSize) } : null; });
  check('a 40-character name on the wall list wraps onto two lines', !!wn && wn.h > wn.fs * 1.6, wn);
  await ctx.close();
}
check('no page errors in any of it', errs.length === 0, errs.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
