// Hostile data on every screen (browser, about 3 minutes). Run: node test/hostile-data.e2e.mjs
// A backup, ticket and order text, dish, ingredient, batch, station, category and channel names, initials, discard notes, readings
// names and batch labels are filled with hostile strings (markup, script, javascript: links, a style break, template and CSS tricks,
// right-to-left override, zero-width and control characters, emoji and 50,000-character strings). Then every screen, sheet and office
// page is opened and the page is checked: window.__pwn never set, no element made from the strings, no new script, no horizontal page
// scroll, no uncaught error. CSV exports are checked for spreadsheet formula injection. Needs dist/smokebox.html.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
let fail = 0;
const failures = [];
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) { fail++; failures.push(name); } console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail).slice(0, 300))); }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: false });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('dialog', (d) => { errs.push('DIALOG ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
await p.addInitScript(() => { window.__printed = []; window.print = () => { window.__printed.push('print'); }; window.__blobs = []; const real = URL.createObjectURL; URL.createObjectURL = function (b) { try { if (b && b.text) b.text().then((t) => window.__blobs.push(t)); } catch (e) { /* none */ } return real.call(URL, b); }; });
await p.goto(pathToFileURL(DIST).href + '?demo');
await p.waitForFunction(() => window.SB && SB.booted === true);
const scriptsBefore = await p.evaluate(() => document.scripts.length);

const HOSTILE = [
  '<img src=x onerror=window.__pwn=1>', '"><script>window.__pwn=1</script>', 'javascript:window.__pwn=1', '</style><img src=x onerror=window.__pwn=1>',
  "'; window.__pwn=1; '", '‮evil‬ text', 'a​‍﻿b', '🔥🍖 smoke', 'x\u0000y\u0007z\u001b[31m', 'url(javascript:window.__pwn=1)',
  '{{constructor.constructor("window.__pwn=1")()}} ${window.__pwn=1}', '<svg onload=window.__pwn=1>', '=HYPERLINK("http://evil","x")', '@SUM(1+1)*cmd|\' /C calc\'!A0', 'A'.repeat(50000), 'W'.repeat(300) + ' ' + 'M'.repeat(300),
];
// Fills the kitchen with hostile text through an import and through the browser's own saved lists.
await p.evaluate((H) => {
  SB.floor.setWelcome(false);
  const env = JSON.parse(SB.store.exportAll());
  let k = 0;
  const next = () => H[k++ % H.length];
  const KEYS = new Set(['name', 'short', 'customer', 'note', 'label', 'who', 'reason', 'voidReason', 'keptBy', 'unitName']);
  (function walk(o, depth) {
    if (!o || typeof o !== 'object' || depth > 7) return;
    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'string' && KEYS.has(key)) o[key] = next();
      else if (key === 'mods' && Array.isArray(o[key])) o[key] = o[key].map(() => next());
      else walk(o[key], depth + 1);
    }
  })(env.state, 0);
  const cust = { rename: { zones: { pit: H[0], fry: H[5] }, categories: { meat: H[1] }, channels: { takeout: H[2] } }, add: { zones: [{ name: H[3] }], categories: [{ name: H[4] }], channels: [{ name: H[6] }] } };
  env.names = cust;
  window.__imp = SB.store.importAll(JSON.stringify(env));
  const U = SB.util;
  U.storage.set('smokebox.v1.initials', { who: H[0], at: Date.now() });
  { const ids = SB.store.getState().batches.map((b) => b.id); for (const id of ids.slice(0, 3)) SB.store.dispatchEx('discardBatch', { batchId: id, reason: 'manual' }, { source: 'ui' }); const ini = {}, ext = {}; ids.slice(0, 3).forEach((id, i) => { ini[id] = H[12 + (i % 2)]; ext[id] = H[0]; }); U.storage.set('smokebox.v1.dlog', { cols: [{ key: 'extra', label: H[1], on: true }], initials: ini, extra: ext, lastSaveAt: 0 }); }
  U.storage.set('smokebox.v1.readings', { labels: [H[3], H[7], H[13]], products: [H[4], H[8]], places: [H[5], H[9]], unit: 'cooler', ppm: 200 });
  U.storage.set('smokebox.v1.lastbatch', { [Object.keys(SB.store.getState().ingredients)[0] || 'x']: { rawKg: 3 } });
  for (let i = 0; i < 4; i++) SB.store.dispatchEx('createTicket', { customer: H[i], channel: 'takeout', items: [{ menuId: SB.store.getState().menu[0].id, qty: 1, mods: [H[i + 4]] }], note: H[i + 8], rush: false }, { source: 'ui' });
}, HOSTILE);
const imp = await p.evaluate(() => window.__imp);
console.log('  note  hostile backup import answered: ' + JSON.stringify(imp));
await p.waitForTimeout(1500);
const landed = await p.evaluate((H) => { const t = JSON.stringify(SB.store.getState()); return H.map((h) => t.includes(JSON.stringify(h.slice(0, 60)).slice(1, -1))).filter(Boolean).length + ' of ' + H.length; }, HOSTILE);
console.log('  note  hostile strings present in the saved kitchen: ' + landed);

// Cells of a CSV text that a spreadsheet would run as a formula.
const formula = (txt) => (String(txt).split(/\r?\n/).flatMap((ln) => ln.split(',')).filter((c) => /^"?[=@]/.test(c) || /^"?[+-][A-Za-z(@=]/.test(c)));
const stateCheck = async (where) => {
  const r = await p.evaluate((sb) => {
    const bad = [...document.querySelectorAll('img[src="x"], [onerror], [onload], svg[onload], iframe[src^="javascript"], a[href^="javascript"]')].length;
    const de = document.documentElement;
    const wide = [...document.querySelectorAll('#sb-floor, #sb-office, .sheet')].filter((e) => e.scrollWidth - e.clientWidth > 1).map((e) => (e.id || e.className.split(' ')[0]) + ' +' + (e.scrollWidth - e.clientWidth));
    return { pwn: window.__pwn, bad, scripts: document.scripts.length, doc: de.scrollWidth - window.innerWidth, wide };
  });
  const ok = r.pwn === undefined && r.bad === 0 && r.scripts === scriptsBefore && r.doc <= 1 && !r.wide.length;
  check(where + ': nothing runs, no element made from the text, no sideways scroll', ok, r);
  return ok;
};
await stateCheck('board after loading the hostile kitchen');
check('the hostile backup was accepted or refused cleanly (no throw)', typeof imp === 'string', imp);

// A backup whose ids are hostile (ids end up in selectors and data attributes)
const idImp = await p.evaluate((H) => {
  const env = JSON.parse(SB.store.exportAll());
  const st = env.state;
  const old = st.menu[0].id, bad = '"]\\' + H[0];
  st.menu[0].id = bad;
  for (const t of st.tickets) { if (t.orderId) t.orderId = t.orderId; for (const it of t.items) if (it.menuId === old) it.menuId = bad; }
  if (st.tickets[0]) st.tickets[0].id = H[1];
  return SB.store.importAll(JSON.stringify(env));
}, HOSTILE);
console.log('  note  a backup with hostile ids answered: ' + JSON.stringify(idImp));
await p.waitForTimeout(1500);
await stateCheck('board after a backup with hostile ids');
await p.evaluate(() => SB.sheets.open('order')); await p.waitForTimeout(500); await stateCheck('order sheet after hostile ids'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// Board tabs, wall and far display
const tabs = await p.evaluate(() => [...document.querySelectorAll('.fl-seg .seg-opt')].map((b) => b.dataset.id));
for (const id of tabs) { await p.evaluate((id) => SB.floor.setZone(id) || document.querySelector('.fl-seg [data-id="' + id + '"]').click(), id).catch(() => {}); await p.waitForTimeout(350); await stateCheck('board tab ' + id); }
await p.evaluate(() => SB.floor.setZone('all'));
await p.evaluate(() => SB.floor.setFarDisplay(true)); await p.waitForTimeout(500); await stateCheck('far display'); await p.evaluate(() => SB.floor.setFarDisplay(false));
await p.setViewportSize({ width: 1920, height: 1080 }); await p.evaluate(() => SB.floor.setWall(true)); await p.waitForTimeout(800); await stateCheck('wall mode (1920)'); await p.evaluate(() => SB.floor.setWall(false));
await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(400);

// Every sheet
const sheets = ['order', 'orders', 'recall', 'hold', 'board86', 'demo', 'help', 'specs', 'menu', 'discards', 'readings', 'setup', 'dishes', 'shop', 'ready', 'pilot', 'serve', 'menuimport', 'cookahead', 'wizard'];
for (const name of sheets) {
  await p.evaluate((n) => { try { SB.sheets.open(n); } catch (e) { window.__sheetErr = String(e); } }, name);
  await p.waitForTimeout(500);
  await stateCheck('sheet ' + name);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
}
// Payment box for the first open order
await p.evaluate(() => { const o = SB.store.getState().orders.find((x) => x.status === 'open'); if (o && SB.orders && SB.orders.openPay) SB.orders.openPay(o.id); else if (o) SB.sheets.open('orders'); });
await p.waitForTimeout(500); await stateCheck('payment / orders'); await p.keyboard.press('Escape');
// The Cabinet tab and the hold sheet with hostile batch labels
await p.evaluate(() => { const t = document.querySelector('.fl-seg [data-id="cabinet"]'); if (t) t.click(); }); await p.waitForTimeout(600); await stateCheck('cabinet'); await p.evaluate(() => SB.floor.setZone('all'));
// Import preview with a hostile menu file
await p.evaluate(() => { try { SB.sheets.open('menuimport'); } catch (e) { /* none */ } }); await p.waitForTimeout(500);
const ta = p.locator('.sheet textarea').first();
if (await ta.count()) { await ta.fill('name,price,category\n"<img src=x onerror=window.__pwn=1>",5,"javascript:1"\n"=HYPERLINK(""http://e"")",7,meat\n"' + 'Z'.repeat(5000) + '",3,side'); await p.waitForTimeout(800); await stateCheck('menu import preview'); }
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
// Guide search
await p.evaluate(() => { try { SB.guide.open(); } catch (e) { /* none */ } }); await p.waitForTimeout(700);
const gs = p.locator('input[type="search"], .gd-search input, input[placeholder*="earch"]').first();
if (await gs.count()) { for (const q of [HOSTILE[0], HOSTILE[1], HOSTILE[14].slice(0, 5000)]) { await gs.fill(q); await p.waitForTimeout(400); await stateCheck('guide search'); } }
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
// Office pages
for (const pg of ['pace', 'tickets', 'stations', 'money', 'safety', 'stock', 'data']) {
  await p.evaluate((pg) => { location.hash = '#/office/' + pg; }, pg); await p.waitForTimeout(1500);
  await stateCheck('office ' + pg);
}
// Print buttons on the safety page and the discards log (the print is a stub; the frames are read)
await p.evaluate(() => { location.hash = '#/office/safety'; }); await p.waitForTimeout(1200);
for (const b of await p.locator('button:has-text("Print")').all()) { try { await b.click({ timeout: 1500 }); await p.waitForTimeout(500); } catch (e) { /* not clickable */ } }
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
await p.evaluate(() => SB.sheets.open('discards')); await p.waitForTimeout(500);
for (const b of await p.locator('.sheet button:has-text("Print")').all()) { try { await b.click({ timeout: 1500 }); await p.waitForTimeout(600); } catch (e) { /* none */ } }
const frames = await p.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => { try { return { img: f.contentDocument.querySelectorAll('img[src="x"], [onerror], script').length, len: f.contentDocument.documentElement.outerHTML.length }; } catch (e) { return { err: String(e) }; } }));
check('print frames hold no element made from the text', frames.every((f) => f.img === 0), frames);
await stateCheck('after printing'); await p.keyboard.press('Escape');

// Every download button on the sheets and pages that make a file
const clickDownloads = async (re) => { for (const b of await p.locator('button, a.btn').filter({ hasText: re }).all()) { try { await b.click({ timeout: 1200 }); await p.waitForTimeout(300); } catch (e) { /* not visible or not clickable */ } } };
for (const sh of ['discards', 'dishes', 'menu', 'pilot']) { await p.evaluate((n) => SB.sheets.open(n), sh); await p.waitForTimeout(500); await clickDownloads(/spreadsheet|csv|save .*file|download|export/i); await p.keyboard.press('Escape'); await p.waitForTimeout(250); await p.keyboard.press('Escape'); }
for (const pg of ['money', 'safety', 'data', 'tickets']) { await p.evaluate((pg) => { location.hash = '#/office/' + pg; }, pg); await p.waitForTimeout(1200); await clickDownloads(/csv|spreadsheet|download|export|save/i); }
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(500);
await p.waitForTimeout(500);
const blobs = await p.evaluate(() => window.__blobs.slice());
console.log('  note  files made by download buttons: ' + blobs.length + ' (' + blobs.map((b) => b.length).join(', ') + ' characters)');
const fileFormula = blobs.filter((b) => !/^\s*[{\[]/.test(b)).flatMap(formula);
check('files made by the download buttons: no cell starts with = + - or @ as a formula', fileFormula.length === 0, fileFormula.slice(0, 5));
check('a backup file made by a button does not carry live markup as code (JSON text only)', blobs.filter((b) => /^\s*[{\[]/.test(b)).every((b) => { try { JSON.parse(b); return true; } catch (e) { return false; } }));
// The other exporters, called directly with the hostile kitchen
const direct = await p.evaluate(() => {
  const out = {};
  try { out.discards = SB.discards.csv(SB.store.getState()); } catch (e) { out.discards = 'ERR ' + e; }
  try { out.menu = SB.menuImport.exportMenu(SB.store.getState().menu); } catch (e) { out.menu = 'ERR ' + e; }
  try { const st = SB.store.getState(); const rep = SB.pilot.build(st, { from: Date.now() - 864e5 * 30, to: Date.now() + 864e5, events: SB.engine.allEvents(st) }); out.pilot = SB.pilot.toCsv(rep); } catch (e) { out.pilot = 'ERR ' + e; }
  return out;
});
for (const k of Object.keys(direct)) { const f = formula(direct[k]); check('the ' + k + ' CSV: no cell starts with = + - or @ as a formula (' + String(direct[k]).slice(0, 12).replace(/\n/g, ' ') + '...)', !/^ERR/.test(direct[k]) && f.length === 0, /^ERR/.test(direct[k]) ? direct[k].slice(0, 100) : f.slice(0, 3)); }
// CSV exports: no spreadsheet formula can start a cell
const csvs = await p.evaluate(() => ['tickets', 'items', 'orders'].map((k) => { try { return SB.store.exportCsv(k); } catch (e) { return 'ERR ' + e; } }));
const bad = csvs.flatMap(formula);
console.log('  note  formula-like CSV cells seen: ' + JSON.stringify(csvs.join('\n').split(/\r?\n/).filter((l) => /HYPERLINK|SUM\(/.test(l)).slice(0, 2)).slice(0, 300));
check('CSV exports (tickets, items, orders): no cell starts with = + - or @ as a formula', bad.length === 0, bad.slice(0, 5));
check('no uncaught error and no dialog during the whole run', errs.length === 0, errs.slice(0, 5));
await browser.close();
console.log(fail ? fail + ' check(s) failed: ' + failures.slice(0, 8).join(' | ') : 'all checks passed');
process.exit(fail ? 1 : 0);
