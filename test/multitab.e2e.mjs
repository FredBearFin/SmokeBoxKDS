// Three real Chromium tabs of one browser create tickets at the same moment, 20 times in fresh browsers (about 2 minutes). Run: node test/multitab.e2e.mjs [runs]
// Every run: the three tabs end with the same tickets, every ticket made is there exactly once, and each tab's clock being off (one 3 hours behind) changes nothing.
// A single failing run is a failure: before the store fix this lost a ticket in about 1 run in 10.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
const RUNS = Number(process.argv[2] || 20);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const bad = [];
async function boot(ctx) {
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(pathToFileURL(DIST).href);
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await p.waitForTimeout(300); return p;
}
for (let run = 1; run <= RUNS; run++) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const a = await boot(ctx);
  await a.evaluate(() => { SB.floor.setWelcome(false); [['Wings', 'pit', 'meat', 14, 'two'], ['Slaw', 'cold', 'cold', 4, 'one'], ['Tea', 'cold', 'cold', 3, 'one']].forEach(([n, z, c, pr, tr]) => SB.store.dispatchEx('addMenuItem', { name: n, zone: z, cat: c, price: pr, prepSec: 60, track: tr }, { source: 'ui' })); });
  await a.waitForTimeout(500);
  const b = await boot(ctx), c = await boot(ctx);
  await c.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() - 3 * 3600e3; });
  const tabs = [a, b, c];
  // all three at the same moment, several tickets each
  await Promise.all(tabs.map((q, i) => q.evaluate((i) => { const m = SB.store.getState().menu; for (let k = 0; k < 3; k++) SB.store.dispatchEx('createTicket', { customer: 'T' + i + '-' + k, channel: 'takeout', items: [{ menuId: m[(i + k) % m.length].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); }, i)));
  await a.waitForTimeout(3000);
  const views = await Promise.all(tabs.map((q) => q.evaluate(() => SB.store.getState().tickets.map((t) => t.customer).sort())));
  const want = ['T0-0', 'T0-1', 'T0-2', 'T1-0', 'T1-1', 'T1-2', 'T2-0', 'T2-1', 'T2-2'];
  const same = views.every((v) => JSON.stringify(v) === JSON.stringify(views[0]));
  const ok = same && JSON.stringify(views[0]) === JSON.stringify(want);
  if (!ok) bad.push({ run, views: views.map((v) => v.join(',')) });
  console.log((ok ? '  ok    ' : '  FAIL  ') + 'run ' + run + ': three tabs, nine tickets' + (ok ? '' : ' -> ' + JSON.stringify(views.map((v) => v.length))));
  await ctx.close();
}
await browser.close();
console.log(errs.length ? '  FAIL  page errors: ' + errs.slice(0, 2).join(' | ') : '  ok    no page errors');
console.log(bad.length || errs.length ? (bad.length + ' of ' + RUNS + ' runs failed') : 'all checks passed');
process.exit(bad.length || errs.length ? 1 : 0);
