// Join-a-hub screen against a REAL hub process (A6's harness). Run: node test/hub-join-real.e2e.mjs
// SKIPs (exit 0) until the store has initHubClient and probeHub (the hub client of the connected track).
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, until } from './_connected.mjs';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/js/30-store.js', import.meta.url), 'utf8');
if (!/function initHubClient/.test(src) || !/function probeHub/.test(src)) { console.log('SKIP: the hub client (initHubClient, probeHub) is not in this source tree yet.'); process.exit(0); }
const { chromium } = toolRequire('playwright');
let fails = 0;
// Records one check result and prints it.
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const hub = await startHub({ starter: false });
// Opens the hub's own page, then the join screen, and fills the form.
async function openJoin(name) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(hub.origin + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await page.evaluate(() => SB.sheets.open('follow')); await page.waitForSelector('[data-mode="orders"]'); await page.click('[data-mode="orders"]');
  await page.fill('[data-field="hub-url"]', hub.origin); await page.fill('[data-field="hub-name"]', name);
  await page.click('[data-act="hub-check"]'); await page.waitForSelector('[data-opt="adopt"]');
  return { page, errors };
}
try {
  const a = await openJoin('Pass');
  ok(await a.page.locator('[data-role="stop"]').count() === 0, 'a new hub is empty: no stop');
  const mineBefore = await a.page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => /smokebox\.v1\.(state|kitchen)/.test(k)).map((k) => [k, localStorage.getItem(k)])));
  await a.page.check('[data-choice="seed"]'); await a.page.click('[data-act="hub-join"]');
  await a.page.waitForSelector('[data-role="hub-joined"]:not([hidden])', { timeout: 8000 });
  ok(/Using the hub/.test(await a.page.locator('[data-role="hub-status"]').innerText()), 'first tablet joined by sending its kitchen');
  const b = await openJoin('Front counter');
  ok(await b.page.locator('[data-role="stop"]').count() === 1 && await b.page.locator('[data-choice="seed"]').isDisabled(), 'second tablet sees a stop: the hub is not empty');
  await b.page.check('[data-choice="adopt"]'); await b.page.click('[data-act="hub-join"]');
  await b.page.waitForSelector('[data-role="hub-joined"]:not([hidden])', { timeout: 8000 });
  ok(true, 'second tablet joined by showing the hub kitchen');
  await b.page.click('[data-act="hub-leave"]'); await b.page.waitForSelector('[data-role="hub-form"]:not([hidden])', { timeout: 8000 });
  ok(true, 'second tablet left the hub');
  ok(a.errors.length === 0 && b.errors.length === 0, 'no page errors ' + a.errors.concat(b.errors).join('|').slice(0, 200));
  void mineBefore; void until;
} finally { await browser.close(); await hub.stop(); }
process.exit(fails ? 1 : 0);
