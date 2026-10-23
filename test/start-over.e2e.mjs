// Quick browser check (about 15 s) of "Start over with an empty menu": it lives at the bottom of the Menu sheet, explains what goes and
// what stays, makes the owner save a backup (or say they have one), needs the typed word, empties the kitchen, keeps or resets tax and
// hours as chosen, and lands on the first-run screen. In the demo the Menu sheet offers the way back instead.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
const SHOT = process.env.SHOTDIR || '/tmp';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.evaluate(() => {
    ['Pulled pork plate', 'Sweet tea'].forEach((n, i) => SB.store.dispatchEx('addMenuItem', { name: n, zone: i ? 'cold' : 'pit', cat: i ? 'cold' : 'meat', price: 10, prepSec: 120, track: 'two' }, { source: 'ui' }));
    SB.store.dispatchEx('updateSettings', { patch: { service: { taxRatePct: 6 } } }, { source: 'ui' });
  });
  await page.waitForTimeout(500);
  await page.click('.fl-menu'); await page.waitForTimeout(400);
  check('Start over is in the Menu sheet, apart from the everyday links', await page.getByRole('button', { name: /Start over with an empty menu/ }).isVisible());
  await page.getByRole('button', { name: /Start over with an empty menu/ }).click(); await page.waitForTimeout(500);
  check('step 1 says what goes and what stays, and that there is no undo', /This goes/.test(await page.locator('.so').innerText()) && /no undo/i.test(await page.locator('.so').innerText()));
  check('the keep box starts ticked', await page.locator('#so-keep').isChecked());
  await page.screenshot({ path: SHOT + '/startover-1.png' });
  await page.click('[data-act=so-next1]');
  check('step 2: the Next button waits for a backup', await page.locator('[data-act=so-next2]').isDisabled());
  const dl = page.waitForEvent('download', { timeout: 5000 });
  await page.click('[data-act=so-backup]'); const d = await dl;
  check('Save a backup downloads a .json file and says it was saved', /\.json$/.test(d.suggestedFilename()) && /Saved smokebox-backup/.test(await page.locator('.so [role=status], .so .dp-msg').first().textContent()));
  await page.screenshot({ path: SHOT + '/startover-2.png' });
  await page.click('[data-act=so-next2]');
  check('step 3: the red button is off until the word is typed', await page.locator('[data-act=so-go]').isDisabled());
  await page.fill('.so input.input', 'start ov'); check('a part of the word is not enough', await page.locator('[data-act=so-go]').isDisabled());
  await page.fill('.so input.input', 'start over'); check('the word, in any case, switches it on', await page.locator('[data-act=so-go]').isEnabled());
  await page.screenshot({ path: SHOT + '/startover-3.png' });
  await page.click('[data-act=so-go]'); await page.waitForTimeout(600);
  const s = await page.evaluate(() => { const st = SB.store.getState(); return { dishes: st.menu.filter((m) => !m.archived).length, tax: st.settings.service.taxRatePct, blank: SB.store.isBlank() }; });
  check('everything is erased and the tax stayed (box was ticked)', s.dishes === 0 && s.tax === 6 && s.blank, s);
  check('the done screen says so and offers the first screen', /Done/.test(await page.locator('.so').innerText()) && await page.locator('[data-act=so-finish]').isVisible());
  await page.screenshot({ path: SHOT + '/startover-done.png' });
  await page.click('[data-act=so-finish]'); await page.waitForTimeout(500);
  check('back on the empty first screen', await page.locator('.fl-first-dish').isVisible());
  // Second time: untick the keep box.
  await page.evaluate(() => { SB.store.dispatchEx('updateSettings', { patch: { service: { taxRatePct: 8 } } }, { source: 'ui' }); SB.store.dispatchEx('addMenuItem', { name: 'Tea', zone: 'cold', cat: 'cold', price: 3, prepSec: 60, track: 'one' }, { source: 'ui' }); });
  await page.waitForTimeout(400);
  await page.evaluate(() => SB.sheets.open('startover')); await page.waitForTimeout(400);
  await page.locator('#so-keep').uncheck(); await page.click('[data-act=so-next1]'); await page.click('[data-act=so-skip-backup]');
  await page.fill('.so input.input', 'START OVER'); await page.click('[data-act=so-go]'); await page.waitForTimeout(600);
  check('with the box unticked the tax goes back to its start', await page.evaluate(() => SB.store.getState().settings.service.taxRatePct === 0));
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
await withPage({ w: 1280, h: 800, hash: '?demo' }, async (page) => {
  await page.waitForFunction(() => window.SB && SB.booted === true); await page.waitForTimeout(400);
  await page.click('.fl-menu'); await page.waitForTimeout(400);
  check('in the demo the Menu sheet has Back to my kitchen and no Start over', await page.getByRole('button', { name: /Back to my kitchen/ }).count() >= 1 && (await page.getByRole('button', { name: /Start over with an empty menu/ }).count()) === 0);
});
process.exit(bad ? 1 : 0);
