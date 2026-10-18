#!/usr/bin/env node
/* Smokebox KDS - QA contact sheets (independent QA engineer).
 *
 * Takes screenshots of the real app (dist/qa.html) in a fixed set of scenes, lays them out in a captioned grid inside a page and screenshots
 * that into one PNG per sheet, so a person can check the whole look of the app at a glance:
 *
 *   test/.out/qa/contact-floor.png          the board in Day, Night, large text and with demo traffic, at 1280 and 390 wide
 *   test/.out/qa/contact-sheets.png         order, hold, 86, recall, demo, help, specs and the menu sheet
 *   test/.out/qa/contact-office-ember.png   the 7 office pages in Ember
 *   test/.out/qa/contact-office-paper.png   the 7 office pages in Paper
 *   test/.out/qa/contact-narrow.png         board, sheets and office at 280 and 390 wide
 *
 *   node tools/qa-contact.mjs                      all five (builds dist/qa.html first)
 *   node tools/qa-contact.mjs --only floor,narrow  some of them: floor, sheets, ember, paper, narrow
 *   node tools/qa-contact.mjs --no-build           reuse dist/qa.html
 *
 * One Chromium, one page at a time. A scene that cannot be set up still gets a picture, captioned with what went wrong.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seedStandard, settle, wait, closeSheets, waitOffice, gotoOffice, OFFICE_PAGES } from '../test/e2e/_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const OUT = path.join(ROOT, 'test/.out/qa');
const BUILD = path.join(ROOT, 'dist/qa.html');
fs.mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const only = (argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : 'floor,sheets,ember,paper,narrow').split(',');

if (!argv.includes('--no-build')) {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.mjs'), '--out', 'dist/qa.html', '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  if (b.status !== 0) { process.stdout.write(b.stdout + b.stderr); process.exit(1); }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A fresh page from empty storage. */
async function openApp({ w, h, touch = false, hash = '' }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(TUNNEL|NAME|INTERNET|PROXY)/.test(m.text() + (m.location().url || ''))) errors.push(m.text().slice(0, 160)); });
  await page.goto(pathToFileURL(BUILD).href + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 }).catch(() => errors.push('SB.booted never became true'));
  page.__errors = errors; page.__ctx = ctx;
  return page;
}
const done = (page) => page.__ctx.close().catch(() => {});

/** Run a scene's setup; keep going with a note if it fails. */
async function scene(page, label, fn) {
  let note = '';
  try { await fn(); } catch (e) { note = ' [setup problem: ' + String(e.message || e).split('\n')[0].slice(0, 90) + ']'; }
  await wait(250);
  // let every finite animation (a sheet sliding in, the scrim fading) run to its end before the picture is taken
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => { try { return a.effect.getTiming().iterations !== Infinity; } catch (e) { return false; } }).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])).catch(() => {});
  await wait(150);
  if (process.env.QA_DEBUG) console.log(label.slice(0, 30), await page.evaluate(() => JSON.stringify({ sx: scrollX, vw: innerWidth, d: Array.from(document.querySelectorAll('[role=dialog]')).map((d) => { const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), d.getAnimations().map((a) => a.playState + ':' + Math.round(a.currentTime)).join('/')]; }) })).catch(() => ''));
  // 'disabled' jumps finite animations to their end state: on this loaded machine the compositor frame can lag behind the DOM and catch a sheet half way in
  const png = await page.screenshot({ animations: 'disabled' });
  if (process.env.QA_DEBUG) { try { (await import('node:fs')).writeFileSync(path.join(OUT, 'dbg-' + label.slice(0, 10).replace(/\W/g, '_') + '.png'), png); } catch (e) { /* ignore */ } }
  const errs = page.__errors.length ? ' [console: ' + page.__errors[page.__errors.length - 1].slice(0, 80) + ']' : '';
  return { caption: label + note + errs, png, w: page.viewportSize().width, h: page.viewportSize().height };
}

/** Compose sections of captioned pictures into one PNG. section = { title, cols, cellW, items }. */
async function compose(file, title, sections) {
  const css = `body{margin:0;background:#1b1a18;color:#e8e2d6;font:13px/1.35 system-ui,sans-serif;padding:16px}
  h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 8px;color:#f0b35a}.sub{color:#a79f90;margin-bottom:6px}
  .g{display:grid;gap:14px;align-items:start}figure{margin:0}img{display:block;border:1px solid #6b6558;background:#fff}
  figcaption{margin-top:4px;color:#d8d0c0;font-size:12px}`;
  const html = '<!doctype html><meta charset="utf-8"><style>' + css + '</style><h1>' + esc(title) + '</h1><div class="sub">dist/qa.html, ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' (each picture is the real screen, scaled down)</div>' +
    sections.map((s) => '<h2>' + esc(s.title) + '</h2><div class="g" style="grid-template-columns:repeat(' + s.cols + ',' + s.cellW + 'px)">' +
      s.items.map((it) => '<figure><img width="' + s.cellW + '" src="data:image/png;base64,' + it.png.toString('base64') + '"><figcaption>' + esc(it.caption) + '</figcaption></figure>').join('') + '</div>').join('');
  const widest = Math.max(...sections.map((s) => s.cols * (s.cellW + 14)));
  const page = await browser.newPage({ viewport: { width: Math.max(600, widest + 40), height: 800 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log('wrote ' + path.relative(ROOT, file) + ' (' + kb + ' KB)');
}

/** The cook's own flow to fill the order sheet (copied from the cook-flow test). Failures are tolerated by `scene`. */
async function fillOrder(page) {
  await page.keyboard.press('n');
  const dlg = page.getByRole('dialog', { name: 'New ticket' });
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await wait(300);
  for (const n of ['Brisket, 1/2 lb, $14.00', 'Smoked mac and cheese, $5.50', 'Jalapeno slaw, $4.00', 'Fried pickle chips, $7.00']) await dlg.getByRole('button', { name: n }).click({ timeout: 4000 });
  await dlg.locator('.ord-line').first().getByRole('button', { name: 'Mods' }).click({ timeout: 4000 }).catch(() => {});
  await dlg.getByRole('button', { name: 'Moist cut' }).click({ timeout: 3000 }).catch(() => {});
  await dlg.locator('.ord-editor-done').first().click({ timeout: 3000 }).catch(() => {});
  await dlg.getByRole('textbox', { name: 'Customer' }).fill('Dana K').catch(() => {});
  await dlg.getByRole('radio', { name: 'Drive-thru' }).click({ timeout: 3000 }).catch(() => {});
  await dlg.getByRole('textbox', { name: 'Note for the line' }).fill('Allergy: peanuts').catch(() => {});
  await wait(300);
}
async function demoOn(page, secs = 7) {
  await closeSheets(page);
  await page.keyboard.press('d');
  const d = page.getByRole('dialog', { name: 'Demo and clock' });
  await d.waitFor({ state: 'visible', timeout: 8000 });
  await wait(300);
  await d.getByRole('radio', { name: 'Busy' }).click({ timeout: 3000 }).catch(async () => { await d.getByRole('radio', { name: 'Normal' }).click({ timeout: 3000 }); });
  const crew = d.getByRole('switch', { name: /Auto crew/ });
  if (await crew.count()) { if (!(await crew.isChecked().catch(() => false))) await crew.click(); }
  await d.getByRole('radio', { name: 'Fifteen times faster' }).click({ timeout: 3000 });
  await closeSheets(page);
  await wait(secs * 1000);
}
/** Leave the order sheet the way a cook does: Esc, and when it asks "Leave this order?" choose Discard. */
async function discardOrder(page) {
  for (let i = 0; i < 3; i++) {
    const n = await page.evaluate(() => SB.sheets.count()).catch(() => 0);
    if (!n) break;
    await page.keyboard.press('Escape'); await wait(500);
    const disc = page.getByRole('button', { name: /^Discard/ });
    if (await disc.count()) {
      await disc.first().click().catch(() => {}); await wait(500);
      // the "Order discarded." toast would otherwise sit on top of the next sheet in the picture
      await page.waitForFunction(() => { const t = document.querySelector('.toast-host'); return !t || !t.innerText.trim(); }, null, { timeout: 7000 }).catch(() => {});
    }
  }
}
const openSheetKey = async (page, key, name) => {
  await discardOrder(page); await closeSheets(page);
  if (key.length === 1) await page.keyboard.press(key); else await page.evaluate((n) => SB.sheets.open(n), key);
  await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 8000 });
  // wait until the sheet has stopped sliding in (a loaded machine takes longer than 500 ms): same box twice in a row
  let prev = '';
  for (let i = 0; i < 24; i++) {
    const b = await page.evaluate(() => { const ds = document.querySelectorAll('[role=dialog]'); if (ds.length !== 1) return 'n' + ds.length; const r = ds[0].getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); });
    if (b && !/^n/.test(b) && b === prev) break; // exactly one sheet in the page (the one that was open before has finished closing) and it has stopped moving
    prev = b; await wait(250);
  }
  await wait(250);
};

/* ------------------------------------------------------------------------------------------------------------------ */
async function floor() {
  const desk = [], phone = [];
  for (const [vw, vh, touch, list] of [[1280, 800, false, desk], [390, 844, true, phone]]) {
    const page = await openApp({ w: vw, h: vh, touch });
    await seedStandard(page);
    list.push(await scene(page, vw + ' Day, 4 seeded tickets (overdue, late, rush, on time)', async () => { await page.evaluate(() => { SB.theme.set('day'); SB.theme.setTextSize('normal'); }); await settle(page, 400); }));
    list.push(await scene(page, vw + ' Night', async () => { await page.evaluate(() => SB.theme.set('night')); await settle(page, 400); }));
    list.push(await scene(page, vw + ' Day, large text', async () => { await page.evaluate(() => { SB.theme.set('day'); SB.theme.setTextSize('large'); }); await settle(page, 400); }));
    list.push(await scene(page, vw + ' Day, demo traffic (Busy, crew on, clock x15, about 7 s)', async () => { await page.evaluate(() => { SB.theme.set('day'); SB.theme.setTextSize('normal'); }); await demoOn(page, 7); }));
    await done(page);
  }
  await compose(path.join(OUT, 'contact-floor.png'), 'Contact sheet: the board', [
    { title: '1280 x 800', cols: 2, cellW: 640, items: desk }, { title: '390 x 844 (touch)', cols: 4, cellW: 300, items: phone },
  ]);
}

async function sheets() {
  const page = await openApp({ w: 1280, h: 800 });
  await seedStandard(page);
  await page.evaluate(() => {
    const S = SB.store, tk = S.getState().tickets;
    try { S.dispatchEx('toggle86', { menuId: 'pudding', on: true }, { source: 'live' }); } catch (e) { /* ignore */ }
    try { const w = tk.find((x) => x.customer === 'Walk-up'); if (w) S.dispatchEx('bumpTicket', { ticketId: w.id, force: true }, { source: 'live' }); } catch (e) { /* ignore */ }
    try { const d = tk.find((x) => /Drive/.test(x.customer)); if (d) S.dispatchEx('voidTicket', { ticketId: d.id, reason: 'Customer left' }, { source: 'live' }); } catch (e) { /* ignore */ }
  });
  await settle(page, 400);
  const items = [];
  items.push(await scene(page, 'New ticket, 4 items, a modifier, customer, channel and note', async () => { await fillOrder(page); }));
  await discardOrder(page);
  items.push(await scene(page, 'Hold cabinet (starter batches)', async () => { await openSheetKey(page, 'h'); }));
  items.push(await scene(page, '86 board (pudding set to 86)', async () => { await openSheetKey(page, '8'); }));
  items.push(await scene(page, 'Recall (one bumped, one voided)', async () => { await openSheetKey(page, 'r'); }));
  items.push(await scene(page, 'Demo and clock', async () => { await openSheetKey(page, 'd'); }));
  items.push(await scene(page, 'Help', async () => { await openSheetKey(page, '?'); }));
  items.push(await scene(page, 'Specs', async () => { await openSheetKey(page, 'specs'); }));
  items.push(await scene(page, 'Menu (settings)', async () => { await openSheetKey(page, 'menu'); }));
  // the hold sheet, scrolled to its second tab where there is one
  items.push(await scene(page, 'Hold cabinet, "New batch" form', async () => { await closeSheets(page); await page.evaluate(() => SB.sheets.open('hold', { tab: 'new' })); await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 8000 }); await wait(500); }));
  await done(page);
  await compose(path.join(OUT, 'contact-sheets.png'), 'Contact sheet: the sheets at 1280 x 800', [{ title: 'Sheets', cols: 2, cellW: 640, items }]);
}

async function office(look) {
  const page = await openApp({ w: 1280, h: 1000, hash: '#/office/pace' });
  await seedStandard(page);
  await waitOffice(page, 8000);
  await page.evaluate((l) => SB.theme.setOffice(l), look);
  await wait(500);
  const items = [];
  for (const p of OFFICE_PAGES) items.push(await scene(page, p.title + ' (' + look + ', sample history on)', async () => { await gotoOffice(page, p.id, 8000); await wait(500); }));
  await done(page);
  await compose(path.join(OUT, 'contact-office-' + look + '.png'), 'Contact sheet: the office in ' + (look === 'ember' ? 'Ember (dark)' : 'Paper (light)') + ' at 1280 x 1000', [{ title: 'Seven pages', cols: 3, cellW: 620, items }]);
}

async function narrow() {
  const secs = [];
  for (const [vw, vh, cell] of [[280, 640, 200], [390, 844, 280]]) {
    const page = await openApp({ w: vw, h: vh, touch: true });
    await seedStandard(page);
    const items = [];
    items.push(await scene(page, vw + ' board', async () => { await settle(page, 300); }));
    items.push(await scene(page, vw + ' New ticket', async () => { await fillOrder(page); }));
    await discardOrder(page);
    items.push(await scene(page, vw + ' Hold cabinet', async () => { await openSheetKey(page, 'h'); }));
    items.push(await scene(page, vw + ' 86 board', async () => { await openSheetKey(page, '8'); }));
    items.push(await scene(page, vw + ' Menu', async () => { await openSheetKey(page, 'menu'); }));
    await closeSheets(page);
    await page.evaluate(() => { location.hash = '#/office/pace'; });
    await waitOffice(page, 8000);
    items.push(await scene(page, vw + ' office Pace', async () => { await gotoOffice(page, 'pace', 8000); }));
    items.push(await scene(page, vw + ' office Sales and money', async () => { await gotoOffice(page, 'money', 8000); }));
    items.push(await scene(page, vw + ' office Safety', async () => { await gotoOffice(page, 'safety', 8000); }));
    secs.push({ title: vw + ' x ' + vh + ' (touch)', cols: 4, cellW: cell, items });
    await done(page);
  }
  await compose(path.join(OUT, 'contact-narrow.png'), 'Contact sheet: narrow screens', secs);
}

try {
  if (only.includes('floor')) await floor();
  if (only.includes('sheets')) await sheets();
  if (only.includes('ember')) await office('ember');
  if (only.includes('paper')) await office('paper');
  if (only.includes('narrow')) await narrow();
} finally { await browser.close(); }
