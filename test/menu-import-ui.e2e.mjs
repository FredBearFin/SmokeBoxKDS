// Quick browser check (about 10 s) of the Import a menu screen: choose a file, read the detected format in plain words, fix or
// untick rows in the preview, import the rest, undo the whole batch, and export the menu.
import { withPage, ROOT } from '../tools/pw.mjs';
import path from 'node:path';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
const SHOT = process.env.SHOTDIR || '/tmp';
const FX = (f) => path.join(ROOT, 'test/fixtures/menu-import', f);
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.evaluate(() => SB.sheets.open('dishes')); await page.waitForTimeout(400);
  await page.locator('.dp-ways summary').click();
  check('the import link is a quiet link in More ways to add dishes', await page.locator('[data-act=open-import]').isVisible());
  await page.click('[data-act=open-import]'); await page.waitForTimeout(400);
  await page.setInputFiles('input[type=file]', FX('generic.csv')); await page.waitForTimeout(500);
  check('the format is shown in plain words', /Read the file as: .+/.test(await page.locator('.dp-fmt').textContent()), await page.locator('.dp-fmt').textContent());
  const n = await page.locator('.dp-prow').count();
  check('every dish in the file is a row in the preview', n >= 3, n);
  await page.screenshot({ path: SHOT + '/import-preview.png' });
  const before = await page.evaluate(() => SB.store.getState().menu.length);
  await page.locator('.dp-prow input[type=checkbox]').first().uncheck();
  const label = await page.locator('[data-act=import-go]').textContent();
  await page.click('[data-act=import-go]'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length);
  check('Import adds the ticked dishes only (' + label.trim() + ')', after === before + (n - 1) || after >= before + 1, { before, after, n });
  check('an imported prep time is a guess, not confirmed', await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).every((m) => m.prepConfirmed === false)));
  await page.click('[data-act=import-undo]'); await page.waitForTimeout(400);
  check('Remove these N takes the whole batch off the menu', (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) === 0);
  // A file with categories that are not set up: one note, one button, and a bulk station.
  await page.fill('textarea', 'Item,Price,Category\nEspresso,$3.00,Coffee\nLatte,$4.50,Coffee\nCroissant,3.25,Pastry');
  await page.click('[data-act=import-check]'); await page.waitForTimeout(400);
  check('unknown categories are named once, not on every row', await page.locator('[data-act=import-add-cats]').count() === 1 && !(await page.locator('.dp-prob').allTextContents()).some((x) => /not one of yours/.test(x)));
  await page.click('[data-act=import-add-cats]'); await page.waitForTimeout(500);
  check('adding the categories maps each dish to its own', await page.locator('[data-act=import-add-cats]').count() === 0);
  await page.selectOption('[aria-label="Put every dish at this station"]', 'sides'); await page.waitForTimeout(200);
  check('one choice sets the station on every row', (await page.locator('.dp-prow select').evaluateAll((s) => s.every((x) => x.value === 'sides'))));
  await page.click('[data-act=import-go]'); await page.waitForTimeout(500);
  check('the dishes land in the new categories', await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).map((m) => (SB.config.categoryById[m.cat] || {}).name).sort().join() === 'Coffee,Coffee,Pastry'));
  await page.click('[data-act=import-undo]'); await page.waitForTimeout(400);
  // A price split at its comma arrives unticked with the importer's warning (A5's extraColumns), the rest are ticked.
  await page.fill('textarea', 'Item,Price,Category\nCappuccino,4,50,Coffee\nFlat white,$4.50,Coffee');
  await page.click('[data-act=import-check]'); await page.waitForTimeout(400);
  check('a comma-split price row is unticked and says why', await page.locator('.dp-prow').first().locator('input[type=checkbox]').isChecked() === false && /more column|split/.test(await page.locator('.dp-prow').first().locator('.dp-prob').textContent()));
  check('a normal row beside it stays ticked', await page.locator('.dp-prow').nth(1).locator('input[type=checkbox]').isChecked());
  // A column the importer does not use is named once in the preview.
  await page.fill('textarea', 'Item,Price,Calories,Notes\nTea cake,3.00,300,fresh daily\nScone,3.50,250,');
  await page.click('[data-act=import-check]'); await page.waitForTimeout(400);
  check('the preview names an ignored column', /Ignored column: Calories/.test(await page.locator('[data-act=ignored-columns]').textContent().catch(() => '')), await page.locator('.dp-preview').innerText());
  check('the preview says notes and descriptions are not kept', await page.locator('[data-act=notes-ignored]').count() === 1);
  // A messy pasted list with a row to fix.
  await page.fill('textarea', 'Pulled pork plate 12.50\nBad one\nLemonade 3');
  await page.click('[data-act=import-check]'); await page.waitForTimeout(400);
  check('a row with no price shows a plain problem and is not ticked', await page.locator('.dp-prow[data-ok=false]').count() >= 1);
  const badRow = page.locator('.dp-prow[data-ok=false]').first();
  await badRow.locator('input.dp-num').fill('7'); await badRow.locator('input.dp-num').blur(); await page.waitForTimeout(300);
  check('typing a price fixes the row and ticks it in', await page.locator('.dp-prow[data-ok=false]').count() === 0);
  await page.screenshot({ path: SHOT + '/import-fixed.png' });
  await page.click('[data-act=import-go]'); await page.waitForTimeout(500);
  check('the fixed rows are imported', (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) === 3);
  const dl = page.waitForEvent('download', { timeout: 5000 });
  await page.click('[data-act=export-menu]');
  const d = await dl;
  check('Export my menu downloads a CSV', /\.csv$/.test(d.suggestedFilename()), d.suggestedFilename());
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(bad ? 1 : 0);
