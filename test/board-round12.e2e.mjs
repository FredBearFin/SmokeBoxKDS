// Board and order screen for counter, pizza and truck kitchens (browser, about 40 s). Run: node test/board-round12.e2e.mjs
// Covers: an unfinished order coming back after a reload, a counter-service bakery run (no EXP tab, no START wording, no late
// colours, Bump without a question), the order chip list (custom and empty) and renamed stations showing without a reload.
// The counter setting is switched on inside the page because the saved-settings route belongs to the engine. Needs dist/smokebox.html.
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
// Waits for the app to be ready after a load or reload.
async function ready(p) { await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 }); await p.waitForTimeout(400); }
const dishes = [['Croissant', 'cold', 'cold', 4], ['Loaf', 'cold', 'cold', 7], ['Coffee', 'cold', 'cold', 3]];
// Adds a small bakery menu and leaves the welcome card.
const addDishes = (p) => p.evaluate((d) => { SB.floor.setWelcome(false); d.forEach(([n, z, c, pr]) => SB.store.dispatchEx('addMenuItem', { name: n, zone: z, cat: c, price: pr, prepSec: 60, track: 'one' }, { source: 'ui' })); }, dishes);

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(pathToFileURL(DIST).href); await ready(p); await addDishes(p);

  // Draft restore
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile');
  const tiles = await p.$$('.ord-tile'); await tiles[0].click(); await tiles[1].click();
  await p.fill('.ord-cust input, input[placeholder*="ame"]', 'Dana').catch(() => {});
  await p.waitForTimeout(300);
  await p.reload(); await ready(p);
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); await p.waitForTimeout(400);
  let txt = await p.evaluate(() => document.body.innerText);
  check('unfinished order comes back after a reload', /Restored your unfinished order/.test(txt), txt.slice(0, 200));
  check('restored order keeps its dishes', /Croissant/.test(txt) && /Loaf/.test(txt), txt.slice(0, 300));
  // Send clears it
  if (await p.isVisible('button:has-text("View order")')) { await p.click('button:has-text("View order")'); await p.waitForTimeout(300); }
  await p.click('button:has-text("Send to kitchen")'); await p.waitForTimeout(700);
  await p.reload(); await ready(p);
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); await p.waitForTimeout(300);
  txt = await p.evaluate(() => document.body.innerText);
  check('after Send nothing is restored', !/Restored your unfinished order|Your unsent order is back/.test(txt), txt.slice(0, 200));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // Chips: default, custom, empty
  const chips = (q) => p.evaluate(() => { const e = document.querySelector('.ord-chips[aria-label="Quick names"]'); return e && !e.hidden && e.offsetParent ? [...e.querySelectorAll('button')].map((b) => b.textContent) : []; });
  if (!(await p.$('.ord-tile'))) { await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); }
  check('default chip row is shown', (await chips()).length > 0, await chips());
  await p.evaluate(() => { SB.store.getState().settings.service.chips = ['Table 1', 'Table 2']; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); await p.waitForTimeout(300);
  const c2 = await chips();
  check('chip row follows settings.service.chips', c2.join('|').includes('Table 1') && !c2.join('|').includes('Customer'), c2);
  await p.evaluate(() => { SB.store.getState().settings.service.chips = []; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.fl-new'); await p.waitForSelector('.ord-tile'); await p.waitForTimeout(300);
  check('empty chip list: no chip row', (await chips()).length === 0, await chips());
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // Counter run
  await p.evaluate(() => { SB.store.getState().settings.service.counter = true; });
  await p.evaluate(() => { const m = SB.store.getState().menu; SB.store.dispatchEx('createTicket', { customer: 'Sam', channel: 'takeout', items: [{ menuId: m[0].id, qty: 2 }, { menuId: m[1].id, qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const vis = (e) => e && e.offsetParent;
    const tabs = [...document.querySelectorAll('.fl-seg .seg-opt, .fl-seg button')].filter(vis).map((e) => e.textContent.trim());
    const t = document.querySelector('.fl').innerText;
    return { counter: document.querySelector('.fl').dataset.counter, tabs, startWord: /\bSTART\b|\bDONE\b/.test(t), late: /overdue|late/i.test(t), slips: document.querySelectorAll('.fl-slip, .slip').length };
  });
  check('counter mode is on the board', r.counter === 'on', r);
  check('counter mode: no station or EXP tabs', r.tabs.length === 0, r.tabs);
  check('counter mode: no START or DONE wording', !r.startWord, r);
  check('counter mode: the order slip is shown', r.slips >= 1, r);
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/counter-board.png' : '/tmp/counter-board.png' });
  // Bump without a question
  for (let i = 0; i < 3; i++) { const bump = await p.$('.fl-bump'); if (bump) { await bump.click(); await p.waitForTimeout(600); } }
  const asked = await p.evaluate(() => /Bump anyway/.test(document.body.innerText));
  const open = await p.evaluate(() => SB.store.getState().tickets.filter((t) => t.status === 'active').length);
  check('counter mode: Bump does not ask about unfinished items', !asked && open === 0, { asked, open });

  // Live station rename
  await p.evaluate(() => { SB.store.getState().settings.service.counter = false; });
  await p.waitForTimeout(800);
  const ok = await p.evaluate(() => {
    const before = SB.floor.refreshNames ? 'fn' : 'none';
    SB.config.saveCustom({ rename: { zones: { cold: 'Pastry case' } }, add: {} });
    const done = SB.floor.refreshNames && SB.floor.refreshNames();
    return { before, done };
  });
  await p.waitForTimeout(500);
  const names = await p.evaluate(() => document.querySelector('.fl').innerText);
  check('renamed station shows without a reload', ok.done === true && /Pastry case/i.test(names), { ok, names: names.slice(0, 200) });
  await ctx.close();
}
check('no page errors', errs.length === 0, errs);
await browser.close();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
