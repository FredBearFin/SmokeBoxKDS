// Taps and seconds to log the common cabinet actions from the board (browser, about 40 s). Run: node test/board-round16-taps.e2e.mjs
// Counts real taps and typed characters for: a pull, a temperature log, a new batch (first product, another product, same as last time),
// and moving a cold item out of and back into the fridge, on a 390 px phone and a 1024 px tablet. The seconds are a stated model, not a
// stopwatch on a person: 1.5 s per tap with greasy hands plus 0.6 s per typed character. Needs dist/smokebox.html. Prints a table and
// fails when a tap count goes above the limit given in LIMITS (the numbers after the fix).
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
const LIMITS = { pull: 2, log: 3, batchFirst: 3, batchOther: 4, batchSame: 3, takeOut: 2, putBack: 1 };
let fail = 0;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const rows = [];
for (const [label, w, h] of [['phone 390', 390, 844], ['tablet 1024', 1024, 768]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(DIST).href + '?demo');
  await p.waitForFunction(() => window.SB && SB.booted === true);
  await p.evaluate(() => {
    SB.floor.setWelcome(false); SB.sim.live.crew(false);
    SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true });
    SB.store.dispatchEx('clearDemoTickets', {}, { source: 'ui' });
    SB.store.dispatchEx('sanitizeDone', {}, { source: 'ui' });
    SB.store.dispatchEx('addIngredient', { name: 'Chicken salad', tcs: true, hold: 'cold', fridge: true, fridgeDays: 3, outHours: 2, parG: 2000 }, { source: 'ui' });
    const i = SB.store.getState().ingredients.find((x) => x.name === 'Chicken salad');
    SB.store.dispatchEx('addBatch', { ing: i.id, tempF: 38, cookedG: 2000, label: 'Chicken salad batch 1' }, { source: 'ui' });
    SB.who.set('FW');
  });
  await p.waitForTimeout(800);
  let taps = 0, typed = 0, smallest = 999;
  // Taps one element, counting it and recording the smallest tap target seen.
  async function tap(sel) {
    const el = p.locator(sel).first();
    await el.waitFor({ state: 'visible', timeout: 5000 });
    const b = await el.boundingBox(); if (b) smallest = Math.min(smallest, Math.round(Math.min(b.width, b.height)));
    await el.click(); taps++; await p.waitForTimeout(250);
  }
  // Runs one flow and records its taps, typed characters and modelled seconds.
  async function flow(name, fn) {
    taps = 0; typed = 0; smallest = 999;
    try { await fn(); } catch (e) { rows.push({ label, name, taps: 'n/a', note: String(e.message).split('\n')[0] }); fail++; return; }
    const secs = Math.round((taps * 1.5 + typed * 0.6) * 10) / 10;
    rows.push({ label, name, taps, typed, secs, smallest });
    if (taps > LIMITS[name]) { fail++; rows[rows.length - 1].note = 'over limit ' + LIMITS[name]; }
  }
  const cab = '.fl-seg [data-id="cabinet"]';
  const card = (n) => '.hc-card:has(.hc-name:text-matches("^' + n + '"))';
  // Back to the plain board between flows.
  const home = async () => { await p.evaluate(() => { document.querySelectorAll('.toast .toast-close, .toast button[aria-label*="lose"]').forEach((b) => b.click()); }); await p.keyboard.press('Escape'); await p.evaluate(() => SB.floor.setZone && SB.floor.setZone('all')); await p.waitForTimeout(400); };
  const pullBtn = (n) => card(n) + ' [data-act="pull"]:not(.hc-sec)';
  await flow('pull', async () => {
    await tap(cab);
    if (await p.locator(pullBtn('Brisket')).count() && await p.locator(pullBtn('Brisket')).first().isVisible()) await tap(pullBtn('Brisket'));
    else { await tap(card('Brisket') + ' .hc-more'); await tap('[role="menuitem"]:has-text("Pull")'); }
    await p.waitForSelector('.toast:has-text("Pulled")', { timeout: 3000 });
  });
  await home();
  await flow('log', async () => {
    await tap(cab);
    await tap(card('Brisket') + ' [data-act="log"]:not(.hc-sec)');
    await tap('.hc-editor .btn-primary');
    await p.waitForSelector('.toast', { timeout: 3000 });
  });
  await home();
  await flow('batchFirst', async () => {
    await tap(cab); await tap('.fs-tabs [data-id="new"], .hc [data-id="new"]'); await tap('.hc-add');
    await p.waitForSelector('.toast:has-text("cabinet"), .toast:has-text("batch")', { timeout: 3000 });
  });
  await home();
  await flow('batchOther', async () => {
    await tap(cab); await tap('.fs-tabs [data-id="new"], .hc [data-id="new"]');
    const opts = await p.locator('.hc-prod .seg-opt').count();
    if (opts > 1) await tap('.hc-prod .seg-opt >> nth=1');
    await tap('.hc-add');
    await p.waitForSelector('.toast', { timeout: 3000 });
  });
  await home();
  await flow('batchSame', async () => {
    await tap(cab); await tap('.fs-tabs [data-id="new"], .hc [data-id="new"]'); await tap('.hc-add');
    await p.waitForSelector('.toast', { timeout: 3000 });
  });
  await home();
  await flow('takeOut', async () => { await tap(cab); await tap(card('Chicken') + ' [data-act="take-out"]'); await p.waitForSelector('.toast:has-text("taken out")', { timeout: 3000 }); });
  await flow('putBack', async () => { await tap(card('Chicken') + ' [data-act="put-back"]'); await p.waitForSelector('.toast:has-text("put back")', { timeout: 3000 }); });
  await ctx.close();
}
console.log('flow          screen        taps  typed  seconds  smallest target');
for (const r of rows) console.log(r.name.padEnd(13), r.label.padEnd(13), String(r.taps).padEnd(5), String(r.typed ?? '').padEnd(6), String(r.secs ?? '').padEnd(8), String(r.smallest ?? '') + (r.note ? '  ' + r.note : ''));
await browser.close();
console.log(fail ? fail + ' flow(s) over the limit or failed' : 'all flows within limits');
process.exit(fail ? 1 : 0);
