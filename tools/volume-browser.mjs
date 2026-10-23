/*
 * WHAT THIS FILE IS: Times the back office at real volume in Chromium. node tools/volume-browser.mjs <tickets> <days> [--uncap]
 *    builds a busy own kitchen with the real engine (test/_big-kitchen.mjs), serves it to the app from an in-memory
 *    localStorage (no quota), then for every office page measures: time from the hash change to the page's headline
 *    on screen and one animation frame later, long tasks over 50 ms, and the JS heap after the page. It also times
 *    the range change to the whole history, Close the day, the sales CSV, the pilot report and the Data page.
 * USES: Playwright (tools/_deps.mjs), dist/smokebox.html (run tools/build.mjs first).   OUTPUT: a table on stdout and JSON on the last line.
 */
import { toolRequire } from './_deps.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIST } from './pw.mjs';
import { buildBig } from '../test/_big-kitchen.mjs';

const { chromium } = toolRequire('playwright');
const tickets = +process.argv[2] || 3000, days = +process.argv[3] || 90, uncap = process.argv.includes('--uncap');
const yesterday = new Date(); yesterday.setHours(0, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1);
const t0 = Date.now();
const big = await buildBig({ tickets, days, endDay: yesterday.getTime(), uncap });
const st = big.state;
console.error('built', tickets, 'x', days, 'days in', Date.now() - t0, 'ms: tickets', st.tickets.length, 'orders', st.orders.length, 'events', big.SB.engine.allEvents(st).length);
const payload = JSON.stringify({ v: 1, savedAt: Date.now(), rev: st.rev || 1, clock: { virtual: Date.now(), real: Date.now(), speed: 1 }, state: st });
const shim = '<script>(function(){var m=new Map([["smokebox.v1.state",' + JSON.stringify(payload) + ']]);var f={getItem:function(k){return m.has(k)?m.get(k):null},setItem:function(k,v){m.set(k,String(v))},removeItem:function(k){m.delete(k)},key:function(i){return Array.from(m.keys())[i]||null},get length(){return m.size},clear:function(){m.clear()}};Object.defineProperty(window,"localStorage",{value:f});window.__long=[];try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__long.push(Math.round(e.duration))})}).observe({entryTypes:["longtask"]})}catch(e){}})();</script>';
const html = fs.readFileSync(DIST, 'utf8').replace('<head>', '<head>' + shim);
const file = path.join(os.tmpdir(), 'smokebox-volume-' + process.pid + '.html');
fs.writeFileSync(file, html);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const results = [];
// Opens a fresh page on the board and waits until the app has booted; returns the page and the boot time.
async function open(hash) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('crash', () => console.log('  PAGE CRASHED')); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const t = Date.now();
  await page.goto('file://' + file + '#/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 120000 });
  return { page, ctx, errs, bootMs: Date.now() - t };
}
// Measures one action in the page: runs fn() there, waits for done() to be true, then one frame; returns ms and long tasks.
async function timeIt(page, label, fnSrc, doneSrc) {
  let cdp = null;
  if (process.env.PROFILE && label.includes(process.env.PROFILE)) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  await page.evaluate(() => { window.__long.length = 0; });
  const r = await page.evaluate(async ([f, d]) => {
    const t0 = performance.now();
    await (0, eval)('(async () => {' + f + '})()');
    const until = (0, eval)('(() => (' + d + '))');
    await new Promise((res) => { const t1 = performance.now(); window.__lastMut = 0; if (!window.__mo) { window.__mo = new MutationObserver(() => { window.__lastMut = performance.now(); }); window.__mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }); } const tick = () => { if (until() || performance.now() - t1 > 25000) res(); else setTimeout(tick, 5); }; tick(); });
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return Math.round((window.__lastMut > t0 ? window.__lastMut : performance.now()) - t0);
  }, [fnSrc, doneSrc]);
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, k = (f.functionName || '(anon)') + ' ' + f.url.split('/').pop() + ':' + f.lineNumber; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    console.log('  PROFILE self time (ms):'); [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log('   ', Math.round(v / 1000), k));
  }
  const long = await page.evaluate(() => window.__long.slice());
  const heap = await page.evaluate(() => { if (window.gc) window.gc(); return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null; });
  const row = { label, ms: r, long: long.filter((x) => x > 50).length, longMax: Math.max(0, ...long), heapMB: heap };
  results.push(row); console.log(label.padEnd(34), String(row.ms).padStart(6), 'ms  long>50:', row.long, ' max', row.longMax, ' heap', heap, 'MB');
  return row;
}
const PAGES = (process.env.PAGES || 'pace,tickets,stations,money,safety,stock,data').split(',');
const READY = (p) => "(document.querySelector('#sb-office h1.of-title') && " + (p === 'data' ? "document.querySelector('.od-content')" : "(document.querySelector('.of-headline') || document.querySelector('.of-empty') || document.querySelector('.of-card'))") + ")";
for (const pg of PAGES) {
  const { page, ctx, errs, bootMs } = await open();
  if (pg === PAGES[0]) console.log('app boot with this kitchen:'.padEnd(34), String(bootMs).padStart(6), 'ms');
  try {
  if (process.env.WRAP) await page.evaluate(() => { window.__tm = {}; for (const [ns, o] of [['M', SB.metrics], ['U', SB.util], ['E', SB.engine]]) for (const k of Object.keys(o)) if (typeof o[k] === 'function' && !/^[A-Z_]/.test(k)) { const f = o[k]; o[k] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { const e = window.__tm[ns + '.' + k] || (window.__tm[ns + '.' + k] = { n: 0, ms: 0 }); e.n++; e.ms += performance.now() - t; } }; } });
  if (process.env.DEBUG_PAGE) { await page.evaluate((x) => { location.hash = '#/office/' + x; }, pg); await page.waitForTimeout(3000); console.log('DBG', await page.evaluate(() => ({ h: location.hash, t: (document.querySelector('h1.of-title') || {}).textContent, head: !!document.querySelector('.of-headline') }))); }
  await timeIt(page, 'page ' + pg + ' (default range)', "location.hash = '#/office/" + pg + "';", READY(pg));
  if (pg !== 'data') {
    // the whole history as a custom range
    await timeIt(page, 'page ' + pg + ' (whole history)', "window.__h = document.querySelector('.of-headline') && document.querySelector('.of-headline').textContent; const b = [...document.querySelectorAll('.of-filters button')].find((x) => /Custom/.test(x.innerText)); b.click(); const el = document.querySelector('.of-date'); el.value = '" + new Date(yesterday.getTime() - (days - 1) * 86400e3).toISOString().slice(0, 10) + "'; el.dispatchEvent(new Event('change', { bubbles: true }));", "(window.__lastMut > 0 && performance.now() - window.__lastMut > 150)");
  }
  } catch (e) { console.log('  FAILED', pg, String(e).slice(0, 160)); }
  if (process.env.WRAP) console.log('  WRAP', pg, JSON.stringify(Object.entries(await page.evaluate(() => window.__tm)).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => k + ' x' + v.n + ' ' + Math.round(v.ms) + 'ms')));
  if (process.env.DOM) console.log('  DOM', pg, JSON.stringify(await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, svgNodes: document.querySelectorAll('svg *').length, cards: [...document.querySelectorAll('.of-card')].map((c) => (c.querySelector('.of-card-title') || {}).textContent + ':' + c.querySelectorAll('*').length + (c.closest('details') ? ' (folded)' : '')).filter((x) => /:\d{3,}/.test(x)) }))));
  if (errs.length) console.log('  page errors:', errs.slice(0, 2).join(' | ').slice(0, 200));
  await ctx.close();
}
// Close the day, the glance, the sales CSV, the pilot report
{
  const { page, ctx } = await open();
  await page.evaluate(() => { location.hash = '#/office/money'; }); await page.waitForTimeout(2500);
  await timeIt(page, 'Close the day sheet', "document.querySelector('[data-k=\"close-day\"]').click();", "document.querySelector('.cd-page .cd-sec')");
  await timeIt(page, 'sales CSV (function)', "window.__csv = SB.office.backupPure.salesCsv(SB.store.getState(), SB.store.getState().settings.service.dayStartHour).length;", "window.__csv > 0");
  await timeIt(page, 'pilot report (build + text)', "const s = SB.store.getState(); window.__rep = SB.pilot.toText(SB.pilot.build(s, { from: Date.now() - 90 * 864e5, to: Date.now(), cutsCounted: 100, batchesCounted: 10 })).length;", "window.__rep > 0");
  await timeIt(page, 'pilot report CSV', "const s = SB.store.getState(); window.__rc = SB.pilot.toCsv(SB.pilot.build(s, { from: Date.now() - 90 * 864e5, to: Date.now() })).length;", "window.__rc > 0");
  await timeIt(page, 'backup text (exportAll)', "window.__bk = String(SB.store.exportAll()).length;", "window.__bk > 0");
  await ctx.close();
}
await browser.close();
try { fs.unlinkSync(file); } catch (e) { /* gone */ }
console.log(JSON.stringify({ tickets, days, results }));
