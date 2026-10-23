// The Data page's way back from a wrong restore: after "Replace everything with this backup" the page says the kitchen from before is kept
// (for the store's own keep time) and offers "Undo this restore", guarded by the same PIN check as the restore. Run: node test/office-undo-restore.e2e.mjs
import { withPage } from '../tools/pw.mjs';
import { realKitchen } from './_kitchen.mjs';

let failed = 0;
// Prints ok or FAIL for one check and remembers a failure for the exit code.
function check(name, ok, detail) { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); if (!ok) failed++; }

await withPage({ w: 1280, h: 900, hash: '' }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });
  await page.evaluate(() => { try { SB.floor.setWelcome(false); } catch (e) { /* no welcome */ } });
  await realKitchen(page, { dishes: 3, orders: 2 });
  const tickets = () => page.evaluate(() => SB.store.getState().tickets.length);
  const backup = await page.evaluate(() => SB.store.exportAll());
  // two more orders after the backup, so "before the restore" differs from the backup
  await page.evaluate(() => { const m = SB.store.getState().menu[0]; for (let i = 0; i < 2; i++) SB.store.dispatchEx('createTicket', { customer: 'Later ' + i, channel: 'dine_in', items: [{ menuId: m.id }] }, { source: 'ui' }); });
  const before = await tickets();
  check('(setup) two orders newer than the backup', before === 4, before);
  await page.evaluate(() => { location.hash = '#/office/data'; });
  await page.waitForSelector('#od-data', { timeout: 15000 });
  check('no undo line while nothing was restored', (await page.locator('[data-region="undo-restore"]:visible').count()) === 0);
  await page.locator('#od-data input[type="file"]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.waitForSelector('#od-data [data-action="import-replace"]');
  await page.locator('[data-action="import-replace"]').click();
  await page.waitForSelector('.sheet[role="alertdialog"]');
  await page.locator('.sheet[role="alertdialog"] .sheet-foot .btn-danger').click();
  await page.waitForFunction(() => SB.store.getState().tickets.length === 2, null, { timeout: 8000 });
  const info = await page.evaluate(() => SB.store.beforeRestoreInfo());
  check('the store keeps the kitchen from before the restore', info && info.expiresAt > info.takenAt, info);
  const days = info ? Math.round((info.expiresAt - info.takenAt) / 86400e3) : 0;
  await page.waitForSelector('[data-action="undo-restore"]', { timeout: 5000 });
  const line = await page.locator('.od-undo-line').innerText();
  check('the page says how long the old kitchen is kept, from the store\'s own number', line.includes('Your kitchen before this restore is kept for ' + days + ' day'), line);
  // with a PIN that is not entered nothing changes
  await page.evaluate(() => { window.__pinAsked = 0; window.__pinOk = false; SB.shell.requirePin = async () => { window.__pinAsked++; return window.__pinOk; }; });
  const undoBtn = page.locator('[data-action="undo-restore"]');
  await undoBtn.click();
  await page.waitForSelector('.sheet[role="alertdialog"]');
  await page.locator('.sheet[role="alertdialog"] .sheet-foot .btn-danger').click();
  await page.waitForFunction(() => window.__pinAsked === 1, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  check('a wrong or missing PIN leaves the restored kitchen as it is', (await tickets()) === 2);
  // cancel in the dialog never asks for the PIN
  await undoBtn.click();
  await page.waitForSelector('.sheet[role="alertdialog"]');
  await page.locator('.sheet[role="alertdialog"] .sheet-foot .btn:not(.btn-danger)').first().click();
  await page.waitForTimeout(300);
  check('cancel does not ask for the PIN and changes nothing', (await page.evaluate(() => window.__pinAsked)) === 1 && (await tickets()) === 2);
  // the right PIN puts the old kitchen back
  await page.evaluate(() => { window.__pinOk = true; });
  await undoBtn.click();
  await page.waitForSelector('.sheet[role="alertdialog"]');
  await page.locator('.sheet[role="alertdialog"] .sheet-foot .btn-danger').click();
  await page.waitForFunction(() => SB.store.getState().tickets.length === 4, null, { timeout: 8000 });
  check('the kitchen from before the restore is back (4 orders)', (await tickets()) === 4);
  check('it asked for the PIN again', (await page.evaluate(() => window.__pinAsked)) === 2);
  check('and the way forward is kept too (the restored kitchen can be put back once)', await page.evaluate(() => !!SB.store.beforeRestoreInfo()));
  check('no console or page errors', !logs.errors.length && !logs.pageErrors.length, { e: logs.errors, p: logs.pageErrors });
});
process.exit(failed ? 1 : 0);
