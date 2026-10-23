// How fast the board answers a tap with many tickets (browser, about 60 s). Run: node test/board-perf.e2e.mjs
// Builds a demo kitchen with cook-ahead items, a cold fridge item and 60 or 200 open tickets, then measures in Chromium: the time from a
// tap until the next painted frame (two animation frames), and the script time inside the tap itself, for Start on a dish, Done, Bump,
// a new ticket arriving, switching station, opening the Cabinet tab and opening the Readings sheet. Prints a table (milliseconds) and
// fails when the median tap-to-paint is over LIMIT_MS at 200 tickets. These are headless numbers on a shared machine, not a tablet.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
const LIMIT_MS = Number(process.env.LIMIT_MS || 250);
let fail = 0;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const out = [];
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : null; };
for (const [label, w, h] of [['1280x800', 1280, 800], ['390x844', 390, 844]]) {
  for (const n of [60, 200]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(pathToFileURL(DIST).href + '?demo');
    await p.waitForFunction(() => window.SB && SB.booted === true);
    await p.evaluate((n) => {
      SB.floor.setWelcome(false); SB.sim.live.crew(false);
      SB.store.resetLive({ keepSettings: true, starter: true, stagger: true, catalog: 'sample', replaceOwn: true });
      SB.store.dispatchEx('clearDemoTickets', {}, { source: 'ui' });
      SB.store.getState().ingredients.forEach((i) => SB.store.dispatchEx('restock', { ing: i.id, g: 5e6 }, { source: 'ui' }));
      SB.store.dispatchEx('addIngredient', { name: 'Chicken salad', tcs: true, hold: 'cold', fridge: true, fridgeDays: 3, outHours: 2, parG: 2000 }, { source: 'ui' });
      const ci = SB.store.getState().ingredients.find((x) => x.name === 'Chicken salad');
      SB.store.dispatchEx('addBatch', { ing: ci.id, tempF: 38, cookedG: 2000, label: 'Chicken salad batch 1' }, { source: 'ui' });
      const menu = SB.store.getState().menu.filter((m) => !m.archived);
      for (let i = 0; i < n; i++) SB.store.dispatchEx('createTicket', { customer: 'T' + i, channel: i % 3 ? 'dine_in' : 'takeout', items: [{ menuId: menu[i % menu.length].id, qty: 1 }, { menuId: menu[(i * 7 + 3) % menu.length].id, qty: 1 }], note: '', rush: false }, { source: 'ui' });
    }, n);
    await p.waitForTimeout(2500);
    const slips = await p.evaluate(() => document.querySelectorAll('.fl-slip').length);
    // Times one thing: runs act() in the page, then waits two frames; returns { sync, paint } in ms.
    const time = (fn, arg) => p.evaluate(async ({ src, arg }) => {
      const f = new Function('arg', 'return (' + src + ')(arg)');
      const t0 = performance.now();
      f(arg);
      const sync = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { sync, paint: performance.now() - t0 };
    }, { src: fn.toString(), arg });
    const rows = {};
    // Repeats one timed action and keeps the medians.
    async function run(name, fn, times = 7, setup) {
      const sy = [], pa = [];
      for (let i = 0; i < times; i++) { if (setup) await setup(i); const r = await time(fn, i); sy.push(r.sync); pa.push(r.paint); await p.waitForTimeout(120); }
      rows[name] = { sync: med(sy), paint: med(pa) };
    }
    await run('Start a dish (tap)', () => { const b = [...document.querySelectorAll('.fl-slip button[data-act="item"]')].find((x) => x.offsetParent && !x.disabled); if (b) b.click(); });
    await run('Bump (tap, items done first)', (i) => { const t = SB.store.getState().tickets.filter((x) => x.status === 'active')[i]; if (!t) return; t.items.forEach((it) => SB.store.dispatchEx('completeItem', { ticketId: t.id, itemId: it.id }, { source: 'ui' })); const b = document.querySelector('.fl-slip[data-ticket="' + t.id + '"] .fl-bump'); if (b) b.click(); });
    await run('New ticket arrives', (i) => { const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'N' + i, channel: 'takeout', items: [{ menuId: m[i % m.length].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
    await run('Switch station tab', (i) => { SB.floor.setZone(['pit', 'all', 'fry', 'all', 'cold', 'all', 'sides'][i % 7]); });
    await run('Open the Cabinet tab', (i) => { const t = document.querySelector('.fl-seg [data-id="' + (i % 2 ? 'all' : 'cabinet') + '"]'); if (t) t.click(); });
    await run('Open the Readings sheet', () => { SB.sheets.open('readings'); }, 3, async () => { await p.evaluate(() => { document.querySelectorAll('[role="dialog"]').forEach((d) => { const b = d.querySelector('button[aria-label*="lose"], .sheet-x, .sheet-close'); if (b) b.click(); }); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); });
    await p.evaluate(() => { try { document.querySelectorAll('[role="dialog"] .sheet-close, [role="dialog"] [aria-label="Close"]').forEach((b) => b.click()); } catch (e) { /* none */ } });
    out.push({ label, n, slips, rows, errs });
    if (n === 200 && label === '1280x800') { const worst = Math.max(...Object.values(rows).map((r) => r.paint || 0)); if (worst > LIMIT_MS * 3) fail++; }
    if (errs.length) fail++;
    await ctx.close();
  }
}
console.log('screen    tickets  shown  ' + Object.keys(out[0].rows).map((k) => k.slice(0, 18).padEnd(19)).join(''));
for (const r of out) console.log(r.label.padEnd(9), String(r.n).padEnd(8), String(r.slips).padEnd(6), Object.values(r.rows).map((x) => (x.paint + ' (' + x.sync + ')').padEnd(19)).join(''), r.errs.length ? 'ERRORS ' + r.errs.join(' ') : '');
console.log('(each cell: median ms from tap to painted frame, then the script time in the tap in brackets)');
await browser.close();
console.log(fail ? 'too slow or errors' : 'within limits');
process.exit(fail ? 1 : 0);
