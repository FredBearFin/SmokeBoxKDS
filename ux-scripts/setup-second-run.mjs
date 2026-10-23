// Second-run script: what an owner sees when they come back. Closed tab in the middle of adding a dish, the next day, after a restore
// from a backup, and after leaving the demo. Each part uses a NEW browser context carrying only the saved site data (so session-only
// state is gone, like a closed tab). Headless Chromium; not a real device. Run after building: node ux-scripts/setup-second-run.mjs
import { toolRequire } from '../tools/_deps.mjs';
import { DIST } from '../tools/pw.mjs';
import { pathToFileURL } from 'node:url';
const { chromium } = toolRequire('playwright');
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
const URL = pathToFileURL(DIST).href;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
// Opens a page in a fresh context, optionally with saved site data, and waits for the app to start.
async function open(state, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const page = await ctx.newPage();
  // Playwright does not carry file:// site data between contexts, so the saved keys are put back by a start-up script (once per tab).
  if (state) await page.addInitScript((d) => { try { if (!sessionStorage.getItem('__restored')) { for (const k of Object.keys(d)) localStorage.setItem(k, d[k]); sessionStorage.setItem('__restored', '1'); } } catch (e) { /* ignore */ } }, state);
  await page.goto(URL + (extra || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.waitForTimeout(500);
  return { ctx, page };
}
// Counts the taps needed to open Dishes and prices from the board: Menu, then the entry.
async function viaMenu(page) { let taps = 0; await page.click('.fl-menu'); taps++; await page.click('button:has-text("Dishes and prices")'); taps++; await page.waitForSelector('.dp-form'); return taps; }
const dishes = (page) => page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).map((m) => m.name));

// Part 1: first run, two dishes, a half-typed third, then the tab is closed.
let s1;
{
  const { ctx, page } = await open(undefined);
  await page.click('.fl-first-dish'); await page.waitForSelector('.dp-form');
  await page.keyboard.type('Pulled pork plate'); await page.keyboard.press('Enter'); await page.keyboard.type('12.50'); await page.click('.dp-tile[data-zone=pit]'); await page.click('[data-act=save-again]');
  await page.keyboard.type('Mac and cheese'); await page.keyboard.press('Enter'); await page.keyboard.type('4.50'); await page.click('.dp-tile[data-zone=sides]'); await page.click('[data-act=save-again]');
  await page.keyboard.type('Chili'); await page.keyboard.press('Enter'); await page.keyboard.type('6'); await page.waitForTimeout(500);
  await page.evaluate(() => SB.store.flush());
  s1 = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); await ctx.close();
}
// Part 2: the owner comes back in a new tab.
let s2;
{
  const { ctx, page } = await open(s1);
  check('back in a new tab the board shows, not a setup sheet', await page.locator('.fl-new').isVisible() && !(await page.locator('.sheet').count()));
  check('the two saved dishes are there', (await dishes(page)).length === 2, await dishes(page));
  check('the first-steps card still shows because there is no ticket yet', await page.locator('.fl-welcome').isVisible());
  const taps = await viaMenu(page);
  check('Dishes and prices is two taps from the board (' + taps + ')', taps === 2);
  check('the half-typed dish is restored', (await page.inputValue('.dp-name')) === 'Chili' && (await page.inputValue('.dp-price')) === '6');
  await page.click('[data-act=save-done]'); await page.waitForTimeout(300);
  // First paid ticket, then a backup of the kitchen.
  await page.click('.fl-new'); await page.waitForSelector('.ord-tile');
  await (await page.$$('.ord-tile:not(.is-86)'))[0].click(); await page.click('.ord-pay [data-id="cash"]'); await page.click('.ord-send'); await page.waitForTimeout(600);
  check('after the first ticket the card is gone', !(await page.locator('.fl-welcome').isVisible()));
  await page.evaluate(() => SB.store.flush());
  globalThis.backup = await page.evaluate(() => SB.store.exportAll());
  s2 = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))); await ctx.close();
}
// Part 3: the next day.
{
  const { ctx, page } = await open(s2);
  check('next day: the board shows, no setup card, no sheet open', await page.locator('.fl-new').isVisible() && !(await page.locator('.fl-welcome').isVisible()) && !(await page.locator('.sheet').count()));
  check('next day: all three dishes are still there', (await dishes(page)).length === 3, await dishes(page));
  check('next day: Dishes and prices is two taps away', (await viaMenu(page)) === 2);
  // Part 5 (inside this context): leave the demo and come back to the real kitchen.
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(900);
  await page.evaluate(() => SB.store.enterDemo());
  await page.waitForFunction(() => window.SB && SB.booted === true && SB.store.isDemo(), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.locator('.sb-banner[data-kind=demo] button').click();
  await page.waitForFunction(() => window.SB && SB.booted === true && !SB.store.isDemo(), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  check('after leaving the demo: the real dishes are back, board shown, no card', (await dishes(page)).length === 3 && await page.locator('.fl-new').isVisible() && !(await page.locator('.fl-welcome').isVisible()));
  await ctx.close();
}
// Part 4: a restore from a backup into a clean browser.
{
  const { ctx, page } = await open(undefined);
  const res = await page.evaluate((txt) => SB.store.importAll(txt), globalThis.backup);
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.SB && SB.booted === true); await page.waitForTimeout(500);
  check('after a restore: the dishes are back and the first-run screen is not shown', (await dishes(page)).length === 3 && !(await page.locator('.fl-first-dish').isVisible()), { res: JSON.stringify(res).slice(0, 120), d: await dishes(page) });
  check('after a restore: no setup card', !(await page.locator('.fl-welcome').isVisible()));
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
