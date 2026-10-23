/*
 * WHAT THIS FILE IS: Browser check of the owner "Screens in this kitchen" panel against a REAL hub that requires pairing (A6's helpers).
 * An owner tablet sees the list and adds a screen (a big one-use code with a countdown); a second tablet pairs with it and shows the
 * read-only line; the owner removes it after a confirm; the owner cannot remove itself or the last owner.
 * USES: test/_connected.mjs, tools/_deps.mjs. RUN: node test/screens-panel.e2e.mjs
 */
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, pairingCode } from './_connected.mjs';
const { chromium } = toolRequire('playwright');
let fails = 0;
// Records one check result and prints it.
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hub = await startHub({ starter: false, tokens: true });
const errs = [];
// Opens the hub's own page as a new tablet, pairs it with the code and a name, and joins by showing the hub's kitchen (or sending its own if told).
async function tablet(name, code, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(hub.origin + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await page.evaluate(() => SB.sheets.open('follow')); await page.waitForSelector('[data-mode="orders"]'); await page.click('[data-mode="orders"]');
  await page.fill('[data-field="hub-url"]', hub.origin); await page.fill('[data-field="hub-name"]', name);
  await page.click('[data-act="hub-check"]'); await page.waitForSelector('[data-role="pair-box"]:not([hidden])');
  await page.fill('[data-field="hub-pair"]', code); await page.click('[data-act="hub-pair"]');
  await page.waitForSelector('[data-opt="adopt"]', { timeout: 8000 });
  await page.check(seed ? '[data-choice="seed"]' : '[data-choice="adopt"]'); await page.click('[data-act="hub-join"]');
  await page.waitForSelector('[data-role="hub-joined"]:not([hidden])', { timeout: 8000 });
  return page;
}
try {
  const owner = await tablet('Pass', pairingCode(hub, { owner: true }), true);
  await owner.waitForSelector('[data-part="screens"]:not([hidden])', { timeout: 8000 });
  ok(await owner.locator('[data-part="screens"] h3').innerText() === 'Screens in this kitchen', 'owner tablet shows Screens in this kitchen');
  await owner.waitForSelector('[data-screen]');
  ok(await owner.locator('[data-screen]').count() === 1 && await owner.locator('[data-role="this-tablet"]').count() === 1, 'one row, marked this tablet');
  ok(await owner.locator('[data-act="screen-remove"]').count() === 0, 'no Remove on this tablet');
  ok(/last owner screen cannot be removed|cannot remove the tablet you are using/.test(await owner.locator('[data-role="screen-list"]').innerText()), 'says why it cannot be removed');
  await owner.click('[data-act="screen-add"]');
  await owner.waitForSelector('[data-role="new-code"]');
  const shown = (await owner.locator('[data-role="new-code"]').innerText()).replace(/\s/g, '');
  ok(/^[A-Z0-9]{6}$/.test(shown), 'a six-character code is shown: ' + shown);
  const cd = await owner.locator('[data-role="countdown"]').innerText();
  ok(/Works once\. Good for \d+:\d\d more\./.test(cd), 'countdown and works-once: ' + cd);
  ok(/Type this code on the other tablet/.test(await owner.locator('[data-role="code-box"]').innerText()), 'tells where to type it');
  const second = await tablet('Counter', shown, false);
  ok(await second.locator('[data-role="read-only"]').count() === 1 && /Ask the owner to add or remove screens/.test(await second.locator('[data-role="read-only"]').innerText()), 'a non-owner tablet sees the read-only line');
  ok(await second.locator('[data-act="screen-add"]').count() === 0, 'a non-owner tablet has no Add a screen');
  // owner refreshes the list: two rows
  await owner.evaluate(() => SB.sheets.closeAll()); await owner.evaluate(() => SB.sheets.open('follow'));
  await owner.waitForFunction(() => document.querySelectorAll('[data-screen]').length === 2, null, { timeout: 8000 });
  ok(true, 'the owner sees both screens');
  ok(/Counter/.test(await owner.locator('[data-role="screen-list"]').innerText()) && /Last seen/.test(await owner.locator('[data-role="screen-list"]').innerText()), 'rows have names and last-seen words');
  await owner.click('[data-act="screen-remove"]');
  ok(/cut off at once/.test(await owner.locator('.sc-confirm').innerText()), 'Remove asks first in plain words');
  await owner.click('[data-act="screen-remove-no"]');
  ok(await owner.locator('[data-act="screen-remove"]').isVisible(), 'Keep it changes nothing');
  await owner.click('[data-act="screen-remove"]'); await owner.click('[data-act="screen-remove-yes"]');
  await owner.waitForFunction(() => document.querySelectorAll('[data-screen]').length === 1, null, { timeout: 8000 });
  ok(/was removed/.test(await owner.locator('[data-role="screen-msg"]').innerText()), 'removed, and it says so');
  ok(errs.length === 0, 'no page errors ' + errs.join('|').slice(0, 200));
} finally { await browser.close(); await hub.stop(); }
process.exit(fails ? 1 : 0);
