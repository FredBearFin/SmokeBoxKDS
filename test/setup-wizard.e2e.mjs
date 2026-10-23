// Quick browser check (about 10 s) of the "Set up your kitchen" wizard: welcome card, tax, hours, starter
// dishes, an opening batch that needs a real reading, and the 86 board's "nothing is cooked yet" line.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForTimeout(700);
  check('welcome card offers Set up your kitchen on an empty board', await page.locator('.fl-welcome [data-act=setup]').isVisible());
  await page.evaluate(() => SB.sheets.open('board86'));
  await page.waitForTimeout(300);
  check('86 board says nothing is cooked yet', await page.locator('.bd-nocook').isVisible());
  await page.evaluate(() => SB.sheets.closeAll());
  await page.waitForTimeout(300);
  await page.locator('.fl-welcome [data-act=setup]').click();
  await page.waitForTimeout(300);
  const sheet = page.locator('.sheet:has-text("Set up your kitchen")').first();
  const fill = (label, v) => page.getByLabel(label, { exact: false }).first().fill(v);
  await fill('Sales tax rate', '6');
  await page.getByRole('button', { name: 'Save tax rate' }).click();
  await fill('Opens at', '10'); await fill('Closes at', '22');
  await page.getByRole('button', { name: 'Save hours' }).click();
  const s1 = await page.evaluate(() => SB.store.getState().settings.service);
  check('tax and hours saved', s1.taxRatePct === 6 && s1.openHour === 10 && s1.closeHour === 22, s1);
  // A batch with no temperature is refused and nothing is added.
  await fill('Cooked weight', '4.5');
  await page.getByRole('button', { name: 'Add this batch' }).click();
  check('no batch without a real reading', (await page.evaluate(() => SB.store.getState().batches.length)) === 0);
  await fill('First temperature', '160');
  await page.getByRole('button', { name: 'Add this batch' }).click();
  const b = await page.evaluate(() => SB.store.getState().batches.map((x) => [x.ingId || x.ing, x.lastTempF]));
  check('batch added with the typed reading', b.length === 1 && b[0][1] === 160, b);
  await page.getByRole('button', { name: 'Archive the starter dishes' }).click();
  await page.getByRole('button', { name: 'Archive them' }).click();
  await page.waitForTimeout(200);
  check('starter dishes archived', await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived && SB.config.menuById[m.id]).length) === 0);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.waitForTimeout(300);
  check('welcome card gone after finishing', !(await page.locator('.fl-welcome').isVisible()));
  await page.screenshot({ path: '/tmp/claude-0/-home-user/9ad563c9-fa82-588a-a959-8a11f3fc33d2/scratchpad/wiz.png' });
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(bad ? 1 : 0);
