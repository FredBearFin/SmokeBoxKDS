// Quick browser check (about 10 s) of production mode: clock speeds and the contrast checker are hidden
// until the demo is loaded, and the Demo sheet says plainly that demo data is pretend.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForTimeout(600);
  check('demoLoaded is false on a fresh kitchen', (await page.evaluate(() => SB.shell.demoLoaded())) === false);
  await page.evaluate(() => SB.sheets.open('menu')); await page.waitForTimeout(300);
  const vis = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  check('settings: no Specs link, no clock speed', !(await page.locator('.mn-link:has-text("Specs")').count()) && !(await page.locator('.dm-speed:visible').count()));
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await page.evaluate(() => SB.sheets.open('demo')); await page.waitForTimeout(300);
  check('demo sheet: no clock speed, practice note shown', !(await page.locator('.dm-speed:visible').count()) && (await page.locator('.dm:has-text("Everything here is for practice")').count()) === 1);
  check('demo sheet: reset says it erases demo orders', (await page.locator('.dm-reset:has-text("including all demo orders")').count()) === 1);
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await page.evaluate(() => SB.sim.restartDemo()); await page.waitForTimeout(500);
  check('demoLoaded after loading the demo', await page.evaluate(() => SB.shell.demoLoaded()));
  await page.evaluate(() => SB.sheets.open('demo')); await page.waitForTimeout(300);
  check('demo sheet: clock speed shows with the demo', (await page.locator('.dm-speed:visible').count()) === 1);
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(bad ? 1 : 0);
