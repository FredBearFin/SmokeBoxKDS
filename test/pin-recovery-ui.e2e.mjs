// Quick browser check (about 15 s) of the PIN recovery screens: setting a PIN shows a write-this-down code screen (Done stays off until
// "I saved it" is selected), and the keypad's Forgot the PIN path accepts the code to set a new PIN, with plain refusals.
import { withPage } from '../tools/pw.mjs';
let bad = 0;
const check = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); if (!ok) bad++; };
const SHOT = process.env.SHOTDIR || '/tmp';
await withPage({ w: 1280, h: 800, touch: true }, async (page, logs) => {
  await page.waitForFunction(() => window.SB && SB.booted === true);
  await page.evaluate(() => SB.sheets.open('shop')); await page.waitForTimeout(400);
  await page.fill('[aria-label="Manager PIN, 4 digits"]', '1234'); await page.getByRole('button', { name: 'Set PIN' }).click(); await page.waitForTimeout(800);
  check('setting a PIN shows the recovery code screen', await page.locator('.rc-code').isVisible());
  const code = (await page.locator('.rc-code').textContent()).trim();
  check('the code looks like ABCDE-FGHJK', /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code), code);
  check('Done is off until I saved it is selected', await page.locator('[data-act=rc-done]').isDisabled());
  await page.screenshot({ path: SHOT + '/recovery-code.png' });
  await page.check('#rc-saved'); check('selecting I saved it switches Done on', await page.locator('[data-act=rc-done]').isEnabled());
  await page.click('[data-act=rc-done]'); await page.waitForTimeout(300);
  check('no readable copy of the code is in the saved state', !JSON.stringify(await page.evaluate(() => SB.store.getState())).includes(code));
  await page.evaluate(() => SB.sheets.closeAll()); await page.waitForTimeout(300);
  // The keypad: Back office asks for the PIN; Forgot the PIN? takes the code.
  await page.evaluate(() => { SB.shell.ignite({}); }); await page.waitForTimeout(600);
  await page.locator('.pin-forgot summary').click();
  await page.fill('[aria-label="Recovery code"]', 'AAAAA-BBBBB'); await page.fill('[aria-label^="New 4-digit PIN"]', '4321'); await page.click('[data-act=pin-recover]'); await page.waitForTimeout(500);
  check('a wrong code is refused in plain words', /code|wrong|not right/i.test(await page.locator('.pin-recover .pin-msg').textContent()), await page.locator('.pin-recover .pin-msg').textContent());
  await page.screenshot({ path: SHOT + '/recovery-keypad.png' });
  await page.fill('[aria-label="Recovery code"]', code.toLowerCase().replace('-', ' ')); await page.click('[data-act=pin-recover]'); await page.waitForTimeout(800);
  check('the right code (any case, a space) sets the new PIN and lets the owner in', await page.evaluate(() => SB.shell.inOffice && SB.shell.inOffice()) || !(await page.locator('.pin-forgot').count()));
  check('no page errors', logs.pageErrors.length === 0, logs.pageErrors);
});
process.exit(bad ? 1 : 0);
