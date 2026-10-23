// Quick browser check (about 15 s) of the first-run flow: the empty board with one "Add your first dish" button, the
// Dishes and prices form (name, price, station tile, save and add another, remembered station, More options), editing
// and removing a dish, the example menu fold, the Tax, hours and PIN sheet, no "New tablet?" toast, and that closing the
// tab and coming back loses nothing. A brand-new install is blank once the blank-start data work is merged; before that
// this test archives the old sample dishes first, which gives the same "no dishes" state.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
const SHOT = process.env.SHOTDIR || '/tmp';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  // Reaches the blank first-run state whichever way this build starts (blank, or with old sample dishes to archive).
  await page.evaluate(() => { SB.store.getState().menu.filter((m) => !m.archived).forEach((m) => SB.store.dispatchEx('updateMenuItem', { id: m.id, patch: { archived: true } }, { source: 'ui' })); });
  await page.waitForTimeout(500);
  check('first run shows one big Add your first dish button', await page.locator('.fl-first-dish').isVisible());
  check('no welcome card and no demo tickets on first run', !(await page.locator('.fl-welcome').isVisible()) && (await page.evaluate(() => SB.store.getState().tickets.length)) === 0);
  await page.screenshot({ path: SHOT + '/first-run.png' });
  check('New ticket with no dishes opens Dishes and prices', await (async () => { await page.click('.fl-new'); await page.waitForTimeout(300); return page.locator('.sheet:has-text("Dishes and prices")').isVisible(); })());
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  await page.click('.fl-first-dish'); await page.waitForTimeout(300);
  const dp = page.locator('.sheet:has-text("Dishes and prices")');
  check('the form opens', await dp.isVisible());
  // A dish with no station is refused with a plain message.
  await page.fill('.dp-name', 'Pulled pork plate'); await page.fill('.dp-price', '12.50');
  await page.click('[data-act=save-again]');
  check('tap-where-it-is-made message when no station is chosen', await page.locator('.dp-tiles ~ .field-error:visible').count() === 1 && (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) === 0);
  await page.click('.dp-tile[data-zone=pit]'); await page.click('[data-act=save-again]'); await page.waitForTimeout(200);
  const d1 = await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived));
  check('first dish saved with its station, guessed prep time and price', d1.length === 1 && d1[0].zone === 'pit' && d1[0].price === 12.5 && d1[0].prepSec === 300 && d1[0].prepConfirmed === false, d1);
  check('the station choice is remembered and the name box is empty', (await page.locator('.dp-tile[aria-checked=true]').getAttribute('data-zone')) === 'pit' && (await page.inputValue('.dp-name')) === '');
  await page.fill('.dp-name', 'Mac and cheese'); await page.fill('.dp-price', '4.5'); await page.click('.dp-tile[data-zone=sides]'); await page.click('[data-act=save-again]');
  await page.fill('.dp-name', 'Sweet tea'); await page.fill('.dp-price', '$3'); await page.click('.dp-tile[data-zone=cold]');
  await page.screenshot({ path: SHOT + '/dishes-form.png' });
  await page.click('[data-act=save-done]'); await page.waitForTimeout(400);
  const d3 = await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).map((m) => [m.name, m.zone, m.cat, m.track]));
  check('three dishes saved with the right category and tap style', d3.length === 3 && d3[2][2] === 'cold' && d3[2][3] === 'one' && d3[1][2] === 'side', d3);
  check('a duplicate name is refused', await (async () => { await page.waitForTimeout(600); await page.evaluate(() => SB.sheets.open('dishes')); await page.waitForTimeout(500); await page.fill('.dp-name', 'sweet tea'); await page.fill('.dp-price', '3'); await page.click('.dp-tile[data-zone=cold]'); await page.click('[data-act=save-again]'); const c = await page.locator('.dp-form .field-error:visible').count(); if (!c) console.log(await page.evaluate(() => JSON.stringify({ sheets: document.querySelectorAll('.sheet').length, forms: document.querySelectorAll('.dp-form').length, name: document.querySelector('.dp-name').value, status: document.querySelector('.dp-status').textContent, errs: [...document.querySelectorAll('.field-error')].map((e) => e.hidden + e.textContent) }))); return c > 0; })());
  // Edit a price in the list; remove a dish.
  await page.fill('.dp-name', ''); await page.fill('.dp-price', '');
  await page.locator('.dp-rp').first().fill('13'); await page.locator('.dp-rp').first().blur(); await page.waitForTimeout(300);
  check('a price edited in the list is saved', (await page.evaluate(() => SB.store.getState().menu.find((m) => m.name === 'Pulled pork plate').price)) === 13);
  await page.locator('.dp-row').nth(2).getByRole('button', { name: /Remove/ }).click(); await page.waitForTimeout(300);
  check('Remove archives the dish', (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) === 2);
  // Example menu fold.
  await page.locator('.dp-ways summary').click(); await page.click('[data-act=example-menu]'); await page.waitForTimeout(300);
  const ex = await page.locator('.dp-ex').count();
  check('example dishes are marked Example (some names may collide with old sample dishes)', ex >= 4, ex);
  await page.click('[data-act=example-remove]'); await page.waitForTimeout(300);
  check('one tap removes every example dish', (await page.locator('.dp-ex').count()) === 0 && (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) === 2);
  // Removed dishes: Undo, Bring it back, and a taken-by-removed name offers to bring the dish back.
  await page.locator('.dp-row').nth(1).getByRole('button', { name: /Remove/ }).click(); await page.waitForTimeout(200);
  check('Remove offers Undo and Undo puts the dish back', await page.locator('[data-act=undo-remove]').isVisible() && await (async () => { await page.click('[data-act=undo-remove]'); await page.waitForTimeout(250); return (await page.evaluate(() => SB.store.getState().menu.filter((m) => !m.archived).length)) === 2; })());
  await page.locator('.dp-row').nth(1).getByRole('button', { name: /Remove/ }).click(); await page.waitForTimeout(200);
  const goneName = await page.evaluate(() => SB.store.getState().menu.filter((m) => m.archived).slice(-1)[0].name);
  await page.fill('.dp-name', goneName); await page.fill('.dp-price', '9'); await page.click('[data-act=save-again]'); await page.waitForTimeout(200);
  check('a name taken by a removed dish offers Bring it back', await page.locator('[data-act=bring-back]').isVisible());
  await page.click('[data-act=bring-back]'); await page.waitForTimeout(250);
  check('Bring it back un-archives the dish at the typed price', await page.evaluate((n) => { const m = SB.store.getState().menu.find((x) => x.name === n); return !!m && !m.archived && m.price === 9; }, goneName));
  // Stations: rename live, hide down to one (the question disappears), show again.
  await page.locator('.dp-stfold summary').click();
  await page.fill('[aria-label="Name of station Pit"]', 'Smoker'); await page.locator('[aria-label="Name of station Smoker"], [aria-label="Name of station Pit"]').first().blur(); await page.waitForTimeout(300);
  check('a renamed station is saved in the shared names and shown on its tile', (await page.evaluate(() => JSON.stringify(SB.config.customSpec()))).includes('Smoker') && await page.locator('.dp-tile:has-text("Smoker")').count() === 1);
  await page.screenshot({ path: SHOT + '/stations-three.png' });
  for (const nm of ['Hot sides', 'Fry']) { await page.locator('.dp-strow:has([aria-label="Name of station ' + nm + '"]) button').click(); await page.waitForTimeout(150); }
  check('hiding stations leaves tiles for the rest', await page.locator('.dp-tile').count() === 2);
  await page.locator('.dp-strow:has([aria-label="Name of station Cold and drinks"]) button').click(); await page.waitForTimeout(150);
  check('with one station showing the question is skipped', await page.locator('.dp-tile').count() === 1 && !(await page.locator('.dp-tiles').isVisible()));
  await page.fill('.dp-name', 'Test'); await page.fill('.dp-price', '1'); await page.click('[data-act=save-again]'); await page.waitForTimeout(250);
  check('a dish saves with no station tap when only one station shows', await page.evaluate(() => SB.store.getState().menu.some((m) => m.name === 'Test' && !m.archived)));
  await page.screenshot({ path: SHOT + '/station-one.png' });
  await page.locator('.dp-strow:has([aria-label="Name of station Cold and drinks"]) button').click();
  await page.locator('.dp-strow:has([aria-label="Name of station Hot sides"]) button').click();
  await page.locator('.dp-strow:has([aria-label="Name of station Fry"]) button').click(); await page.waitForTimeout(150);
  await page.fill('[aria-label="New station name"]', 'Bar'); await page.getByRole('button', { name: 'Add station' }).click(); await page.waitForTimeout(250);
  check('a new station can be added', await page.evaluate(() => SB.config.workZones.length === 5));
  await page.evaluate(() => { SB.store.getState().menu.filter((m) => m.name === 'Test').forEach((m) => SB.store.dispatchEx('updateMenuItem', { id: m.id, patch: { archived: true } }, { source: 'ui' })); });
  // A half-typed dish survives a reload; dishes survive too.
  await page.fill('.dp-name', 'Brisket pl'); await page.waitForTimeout(100);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.SB && SB.booted === true); await page.waitForTimeout(500);
  check('after a reload the dishes are still there and the board shows the next-step card', (await page.evaluate(() => SB.setup.dishCount())) === 2 && await page.locator('.fl-welcome').isVisible());
  await page.evaluate(() => SB.sheets.open('dishes')); await page.waitForTimeout(300);
  check('the half-typed dish name comes back', (await page.inputValue('.dp-name')) === 'Brisket pl');
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(200);
  // The Tax, hours and PIN sheet.
  await page.evaluate(() => SB.sheets.open('shop')); await page.waitForTimeout(300);
  await page.fill('[aria-label="Sales tax percent"]', '6'); await page.getByRole('button', { name: 'Save tax' }).click();
  await page.selectOption('[aria-label="Opens at"]', '10'); await page.selectOption('[aria-label="Closes at"]', '22'); await page.getByRole('button', { name: 'Save hours' }).click(); await page.waitForTimeout(200);
  const sv = await page.evaluate(() => SB.store.getState().settings.service);
  check('tax and hours saved from the Tax, hours and PIN sheet', sv.taxRatePct === 6 && sv.openHour === 10 && sv.closeHour === 22, sv);
  await page.screenshot({ path: SHOT + '/shop.png' });
  await page.locator('.sheet .seg-opt', { hasText: 'Yes' }).click(); await page.waitForTimeout(250);
  check('the cook-ahead question writes the real setting', await page.evaluate(() => SB.store.getState().settings.modules.cookAhead === true));
  await page.locator('.sheet .seg-opt', { hasText: 'No' }).click(); await page.waitForTimeout(250);
  check('cook-ahead can be turned back off', await page.evaluate(() => SB.store.getState().settings.modules.cookAhead === false));
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(9500);
  check('no "New tablet?" toast arrives after about 8 seconds', !(await page.evaluate(() => document.body.innerText.includes('New tablet?'))));
  check('the main menu has a Dishes and prices entry', await (async () => { await page.evaluate(() => SB.sheets.open('menu')); await page.waitForTimeout(300); return page.getByRole('button', { name: /Dishes and prices/ }).isVisible(); })());
  // The first-steps card goes for good once a ticket exists, even if the board is cleared again.
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(200);
  await page.evaluate(() => { const id = SB.store.getState().menu.find((m) => !m.archived).id; SB.store.dispatchEx('createTicket', { customer: 'T', items: [{ menuId: id, qty: 1 }] }, { source: 'ui' }); });
  await page.waitForTimeout(300);
  check('the first-steps card is gone once a ticket exists', !(await page.locator('.fl-welcome').isVisible()));
  await page.evaluate(() => SB.store.resetLive({ keepSettings: true, starter: false })); await page.waitForTimeout(400);
  check('and it does not come back when the board is cleared', !(await page.locator('.fl-welcome').isVisible()));
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(bad ? 1 : 0);
