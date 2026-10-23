// Quick browser check (about 10 s) of the shell banner: the daily backup nudge appears after closing time,
// "Later" and a saved backup silence it, and a browser that cannot save shows the save-failure banner.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
await withPage({ w: 1280, h: 800 }, async (page, logs) => {
  await page.waitForTimeout(600);
  check('no banner on a fresh kitchen', (await page.locator('.sb-banner').count()) === 0);
  const hr = new Date().getHours();
  if (hr >= 1) {
    await page.evaluate((h) => {
      SB.store.dispatchEx('updateSettings', { patch: { service: { openHour: 0, closeHour: h } } }, { source: 'ui' });
      SB.store.dispatchEx('addBatch', { ing: 'brisket', cookedG: 3000, tempF: 160 }, { source: 'ui' });
    }, hr);
    await page.waitForTimeout(5500);
    check('nudge shows after closing time with data on the device', (await page.locator('.sb-banner[data-kind=nudge]').count()) === 1);
    await page.screenshot({ path: '/tmp/claude-0/-home-user/9ad563c9-fa82-588a-a959-8a11f3fc33d2/scratchpad/nudge.png' });
    check('board still fully visible below the strip', await page.evaluate(() => document.querySelector('.fl-head').getBoundingClientRect().top >= document.querySelector('.sb-banner').getBoundingClientRect().bottom - 1));
    await page.locator('.sb-banner button:has-text("Later")').click();
    check('Later hides it', (await page.locator('.sb-banner').count()) === 0);
    await page.evaluate(() => SB.shell.noteBackup());
    check('a saved backup is remembered', (await page.evaluate(() => SB.shell.lastBackupAt())) > 0);
  } else console.log('skip nudge (between midnight and 1 am)');
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
// A browser that refuses to save: the save-failure banner shows on the board.
await withPage({ w: 1280, h: 800, init: 'Storage.prototype.setItem = function () { throw new Error("quota"); };' }, async (page, logs) => {
  await page.waitForTimeout(6500);
  const t = await page.locator('.sb-banner[data-kind=save]').first().textContent().catch(() => '');
  check('save-failure banner shows when nothing can be saved', /not saving|save failed/.test(t), t);
  await page.screenshot({ path: '/tmp/claude-0/-home-user/9ad563c9-fa82-588a-a959-8a11f3fc33d2/scratchpad/savefail.png' });
});
process.exit(bad ? 1 : 0);
