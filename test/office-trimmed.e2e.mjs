// The back office on a TRIMMED follower (browser, real hub): a hub holding 60 days is followed with ?follow&trim=7, so the screen holds only the
// last week. Every office page that reads history must say so ("Showing the last 7 days; the full history is on the hub computer.") instead
// of showing partial numbers as if they were complete; a follower that holds everything says nothing. Run: node test/office-trimmed.e2e.mjs
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createHub } from '../server/server.mjs';
import { buildBig } from './_big-kitchen.mjs';

const { chromium } = toolRequire('playwright');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const WORDS = 'Showing the last 7 days; the full history is on the hub computer.';
const yesterday = new Date(); yesterday.setHours(0, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1);
const big = await buildBig({ tickets: 900, days: 60, endDay: yesterday.getTime() });
const dataFile = path.join(os.tmpdir(), 'smokebox-trimmed-' + process.pid + '.json');
fs.writeFileSync(dataFile, JSON.stringify({ v: 1, seq: 0, hubId: 'hub-trim-test', seeded: false, state: big.state }));
const hub = await createHub({ dataFile, heartbeatMs: 500 });
const port = await hub.listen(0);
const base = 'http://127.0.0.1:' + port;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
// Opens a follower page and waits until it has booted and the hub's copy has arrived.
async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base + '/' + query);
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });
  await page.waitForFunction(() => SB.store.getState() && SB.store.getState().tickets.length > 0, null, { timeout: 20000 });
  return page;
}
// Goes to an office page and gives the banner text and the headline.
async function visit(page, pg) {
  await page.evaluate((x) => { location.hash = '#/office/' + x; }, pg);
  await page.waitForSelector('#sb-office h1.of-title', { timeout: 15000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => ({ banner: (document.querySelector('.of-banner-t') || {}).textContent || '', headline: (document.querySelector('.of-headline') || {}).textContent || '' }));
}
const trimmed = await open('?follow&trim=7');
const info = await trimmed.evaluate(() => SB.store.trimInfo());
check('the trimmed follower knows what it holds', info && info.days === 7 && info.left && info.left.tickets > 0, info);
const held = await trimmed.evaluate(() => SB.store.getState().tickets.length);
check('it holds far fewer tickets than the hub', held < big.state.tickets.length / 3, [held, big.state.tickets.length]);
for (const pg of ['money', 'pace', 'tickets', 'stations', 'safety']) {
  const r = await visit(trimmed, pg);
  check(pg + ': the banner says the screen shows only the last 7 days', r.banner.includes(WORDS), r.banner);
}
await visit(trimmed, 'safety');
await trimmed.evaluate(() => document.querySelector('[data-k="print-safety-log"]').click());
await trimmed.waitForSelector('.si-table', { timeout: 8000 });
check('the safety record sheet says the same', await trimmed.evaluate((w) => (document.querySelector('.si-trim') || {}).textContent === w, WORDS));
await trimmed.keyboard.press('Escape');
await visit(trimmed, 'data');
check('the Data page says a backup made here is partial', await trimmed.evaluate(() => /only part of the history/.test((document.querySelector('.od-conn') || {}).textContent || '')));
// Close the day only ever counts today, which a trimmed follower always holds, so it needs no banner; it must still open and read as today.
await trimmed.evaluate(() => { SB.sheets.open('orders'); });
await trimmed.waitForSelector('[data-act="closeday"]', { timeout: 8000 });
await trimmed.locator('[data-act="closeday"]').first().click();
await trimmed.waitForSelector('.cd-page', { timeout: 8000 });
check('Close the day opens on a trimmed follower and is about today only', await trimmed.evaluate(() => /Today is /.test(document.querySelector('.cd-page').innerText)));
const full = await open('?follow');
check('a follower that holds everything says nothing about trimming', (await visit(full, 'money')).banner.indexOf('Showing the last') < 0);
await visit(full, 'safety');
await full.evaluate(() => document.querySelector('[data-k="print-safety-log"]').click());
await full.waitForSelector('.si-table', { timeout: 8000 });
check('and neither does its safety record', await full.evaluate(() => !document.querySelector('.si-trim')));
check('no page errors', errs.length === 0, errs);
await browser.close();
try { hub.close && hub.close(); } catch (e) { /* closing */ }
try { fs.unlinkSync(dataFile); } catch (e) { /* gone */ }
console.log(fail ? 'FAILED: ' + fail : 'PASSED');
process.exit(fail ? 1 : 0);
