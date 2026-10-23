/*
 * WHAT THIS FILE IS: Browser check for "Use one kitchen on several tablets": the plain explanation, address and code
 * validation with plain errors, Connect building a ?follow link without touching saved data, hidden in the demo.
 * USES: tools/pw.mjs, dist/smokebox.html. RUN: node test/follow-ui.e2e.mjs
 */
import { withPage } from '../tools/pw.mjs';
let fails = 0;
// Records one check result and prints it.
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }
await withPage({ w: 1024, h: 768, init: () => { window.__followNoNav = true; } }, async (page, logs) => {
  await page.evaluate(() => window.SB.store.dispatchEx('addMenuItem', { name: 'Chili', price: 6 }, { source: 'ui' }));
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  await page.evaluate(() => window.SB.sheets.open('follow'));
  await page.waitForSelector('[data-part="main"]');
  const main = await page.locator('[data-part="main"]').innerText();
  ok(/Show only/.test(main) && /not set up in this version/.test(main), 'explains it only shows and the hub is not set up');
  ok(await page.locator('[data-role="file-note"]').count() === 1, 'file copy says another screen cannot reach it');
  await page.click('[data-act="follow-connect"]');
  ok(/Type the address/.test(await page.locator('[data-role="msg"]').innerText()), 'empty address: plain error');
  await page.fill('[data-field="url"]', 'not a url at all');
  await page.click('[data-act="follow-connect"]');
  ok(/address/i.test(await page.locator('[data-role="msg"]').innerText()), 'bad address: plain error');
  await page.fill('[data-field="url"]', 'ftp://kitchen.example.com');
  await page.click('[data-act="follow-connect"]');
  ok(/http/.test(await page.locator('[data-role="msg"]').innerText()), 'wrong scheme: plain error');
  await page.fill('[data-field="url"]', 'kitchen.example.com');
  await page.fill('[data-field="code"]', 'a!b');
  await page.click('[data-act="follow-connect"]');
  ok(/letters and numbers/.test(await page.locator('[data-role="msg"]').innerText()), 'bad code: plain error');
  await page.fill('[data-field="code"]', 'abc 123');
  await page.click('[data-act="follow-connect"]');
  const target = await page.evaluate(() => window.__followTarget);
  ok(/\?follow=https%3A%2F%2Fkitchen\.example\.com&code=ABC123$/.test(target || ''), 'Connect builds the follow link: ' + target);
  ok(await page.locator('[data-act="follow-disconnect"]').count() === 0, 'no Disconnect when not following');
  ok(/Not connected/.test(await page.locator('.fw-status').innerText()), 'status says not connected');
  const after = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  ok(before === after, 'Connect and the checks leave saved data untouched');
  const unit = await page.evaluate(() => { const S = window.SB.setup; return [S.checkHubAddress('localhost:8080').url, S.checkHubAddress('http://192.168.1.5:8787/').url, S.checkHubAddress('https://a.co/x/').url]; });
  ok(unit.join(' ') === 'http://localhost:8080 http://192.168.1.5:8787 https://a.co/x', 'addresses are cleaned: ' + unit.join(' '));
  ok(logs.pageErrors.length === 0, 'no page errors ' + logs.pageErrors.join('|').slice(0, 200));
});
await withPage({ w: 1024, h: 768, query: '?demo' }, async (page) => {
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 8000 });
  await page.evaluate(() => window.SB.sheets.open('follow'));
  await page.waitForSelector('.fw');
  ok(/not available in the demo/.test(await page.locator('.fw').innerText()), 'demo: sheet says not available');
  await page.evaluate(() => window.SB.sheets.open('menu'));
  await page.waitForTimeout(400);
  ok(await page.locator('.mn-links').getByText('Use one kitchen on several tablets').count() === 0, 'demo: Settings has no follow link');
});
// A normal kitchen's Settings shows the link and opens the sheet from it.
await withPage({ w: 1024, h: 768 }, async (page) => {
  await page.evaluate(() => window.SB.sheets.open('menu'));
  await page.waitForTimeout(400);
  await page.locator('.mn-links').getByText('Use one kitchen on several tablets').click();
  await page.waitForSelector('[data-part="other"]');
  ok(true, 'Settings link opens the follow sheet');
});
// While following (stubbed status), the sheet shows honest status words, Disconnect and Back to my own kitchen.
await withPage({ w: 1024, h: 768 }, async (page) => {
  await page.evaluate(() => { SB.store.isFollower = () => true; SB.store.followStatus = () => ({ state: 'error', error: 'badCode' }); SB.sheets.open('follow'); });
  await page.waitForSelector('[data-act="follow-back"]');
  ok(/access code was not accepted/.test(await page.locator('.fw-status').innerText()), 'badCode shown in plain words');
  ok(await page.locator('[data-act="follow-disconnect"]').count() === 1, 'Disconnect shown while following');
  await page.evaluate(() => { SB.store.followStatus = () => ({ state: 'stale', lastUpdate: Date.now() }); });
  await page.waitForFunction(() => /out of date/.test(document.querySelector('.fw-status').textContent), null, { timeout: 5000 });
  ok(true, 'stale status says it may be out of date');
});
process.exit(fails ? 1 : 0);
