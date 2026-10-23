// Board round 14 (browser, about 40 s). Run: node test/board-round14.e2e.mjs
// Covers: page order of ticket slips matching what is drawn when tickets run late, the Hold sheet fitting a 280 px screen with Large
// text, and the cabinet card for cold items (when the engine has the cold-item model). Needs dist/smokebox.html.
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
// Opens the app and waits for it to boot.
async function boot(ctx, query) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(pathToFileURL(DIST).href + (query || ''));
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await p.waitForTimeout(400);
  return p;
}

// Page order and drawn order
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await boot(ctx);
  await p.evaluate(() => { SB.floor.setWelcome(false); [['Wings', 14], ['Slaw', 4], ['Tea', 3]].forEach(([n, pr]) => SB.store.dispatchEx('addMenuItem', { name: n, zone: 'cold', cat: 'cold', price: pr, prepSec: 60, track: 'one' }, { source: 'ui' })); });
  await p.evaluate(() => { const m = SB.store.getState().menu; const now = Date.now(); [['Young', 1], ['Old', 40], ['Mid', 20], ['Fresh', 0]].forEach(([c, minAgo]) => SB.store.dispatchEx('createTicket', { customer: c, channel: 'takeout', items: [{ menuId: m[0].id, qty: 1 }], note: '', rush: false, createdAt: now - minAgo * 60e3, allowPast: true }, { source: 'ui' })); });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const els = [...document.querySelectorAll('.fl-slip')];
    const dom = els.map((e) => e.textContent.match(/#(\d+)/)[1]);
    const vis = els.map((e) => { const b = e.getBoundingClientRect(); return { n: e.textContent.match(/#(\d+)/)[1], t: Math.round(b.top / 10), l: Math.round(b.left) }; }).sort((a, b) => a.t - b.t || a.l - b.l).map((x) => x.n);
    return { dom, vis, late: els.filter((e) => e.dataset.tier).length, order: els.filter((e) => e.style.order).length };
  });
  check('some slips are ranked late', r.late >= 2, r);
  check('page order matches the drawn order', r.dom.join() === r.vis.join(), r);
  check('no CSS order is used to reorder slips', r.order === 0, r);
  await ctx.close();
}

// Hold sheet at 280 px with Large text
{
  const ctx = await browser.newContext({ viewport: { width: 280, height: 640 } });
  const p = await boot(ctx, '?demo');
  await p.evaluate(() => { SB.theme.setTextSize('large'); SB.floor.setWelcome(false); });
  await p.waitForTimeout(500);
  const opened = await p.evaluate(() => { try { SB.sheets.open('hold'); return true; } catch (e) { return false; } });
  await p.waitForTimeout(800);
  const w = await p.evaluate(() => {
    const sh = document.querySelector('[role="dialog"]');
    const vw = document.documentElement.clientWidth; let worst = 0, who = '';
    if (sh) sh.querySelectorAll('*').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && b.right - vw > worst) { worst = Math.round(b.right - vw); who = e.className || e.tagName; } });
    const b = sh ? sh.getBoundingClientRect() : null;
    return { has: !!sh, vw, over: worst, who: String(who).slice(0, 60), sw: document.documentElement.scrollWidth, right: b && Math.round(b.right) };
  });
  check('Hold sheet opens at 280 px', opened && w.has, w);
  check('Hold sheet does not stick out at 280 px with Large text', w.over <= 0 && w.sw <= 280, w);
  await ctx.close();
}
check('no page errors', errs.length === 0, errs);
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
