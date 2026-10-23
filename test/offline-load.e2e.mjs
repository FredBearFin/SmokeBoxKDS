// Opening the app with the hub down, the update notice and the reset (browser, about 90 s).
// Run: SMOKEBOX_TOOLS=$(npm root -g) node test/offline-load.e2e.mjs
// Uses the real hub from test/_connected.mjs on 127.0.0.1 (a secure origin for service workers) with its own copy of the page, so a
// second build can be made by changing that copy. Covers: the worker installs, the Tablet checks card says yes, the hub stops and a
// reload still opens the board, a second build makes "A new version is ready" appear (Settings has a Reload button that asks first),
// and "Reset the offline copy" removes the worker and its caches. Prints SKIP without the offline module (SB.offline).
import { toolRequire } from '../tools/_deps.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHub, sleep } from './_connected.mjs';

const { chromium } = toolRequire('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
// Polls until fn() answers true, up to ms.
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); } return false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sboffline-'));
const page = path.join(tmp, 'smokebox.html');
fs.copyFileSync(path.join(ROOT, 'dist/smokebox.html'), page);
process.env.SMOKEBOX_HTML = page;
const hub = await startHub({ starter: false });
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(hub.origin + '/');
await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
if (!(await p.evaluate(() => !!(window.SB && SB.offline && SB.offline.register)))) { console.log('  skip  the offline module is not in this build'); await browser.close(); await hub.stop(); process.exit(0); }
const st = () => p.evaluate(() => SB.offline.status());
check('the worker installs and the state becomes ready', await until(async () => (await st()).state === 'ready', 20000), await st());
await p.evaluate(() => SB.floor.setWelcome && SB.floor.setWelcome(false));

// Tablet checks: the sixth card
await p.evaluate(() => SB.sheets.open('ready'));
await p.waitForSelector('[data-check="offline"]');
check('Tablet checks has a sixth card that says this tablet can open without the internet', await until(() => p.evaluate(() => document.querySelector('[data-check="offline"]').dataset.ok === 'true'), 10000), await p.evaluate(() => document.querySelector('[data-check="offline"]').innerText));
await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/offline-checks.png' : '/tmp/offline-checks.png' });
await p.keyboard.press('Escape');

// The server goes away and the app still opens
await hub.stop();
await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
check('with the server down a reload still opens the board', await until(() => p.evaluate(() => !!(window.SB && SB.booted === true && document.querySelector('.fl'))), 15000));

// A second build: change the page the hub serves, bring the hub back, check for the update
fs.appendFileSync(page, '\n<!-- second build -->\n');
await hub.restart();
// The hub may come back on another port; open it fresh on the new address and install there too is not the point: keep the same port.
const same = hub.origin === (await p.evaluate(() => location.origin));
if (!same) console.log('  note  the hub came back on another port, so the update check is skipped');
if (same) {
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
  check('a second build makes the update notice appear', await until(async () => (await st()).updateReady === true, 20000), await st());
  // The strip shows one notice at a time and a silent-sound warning comes first, so the update notice is read from the strip OR the Settings sheet, which always shows it.
  await p.evaluate(() => { SB.sheets.open('menu'); });
  const strip = await until(() => p.evaluate(() => /A new version is ready/.test(document.body.innerText)), 6000);
  check('the update notice is shown (strip or Settings): "A new version is ready"', strip);
  await p.evaluate(() => { SB.sheets.closeAll(); });
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/offline-update.png' : '/tmp/offline-update.png' });
  await p.evaluate(() => SB.sheets.open('menu'));
  await p.waitForSelector('[data-act="reload-update"]');
  await p.click('[data-act="reload-update"]');
  await p.waitForSelector('[role="alertdialog"]');
  check('the Reload button asks first, with Not now', /Not now/.test(await p.evaluate(() => document.querySelector('[role="alertdialog"]').innerText)));
  await p.click('[role="alertdialog"] button:has-text("Not now")'); await p.waitForTimeout(500);
  check('Not now leaves the board where it is (no reload)', await p.evaluate(() => !!window.SB && SB.booted === true) && (await st()).updateReady === true);
  await p.keyboard.press('Escape');
}

// Reset the offline copy
await p.evaluate(() => SB.sheets.open('help', { tab: 'about' }));
await p.waitForSelector('[data-act="reset-offline"]');
await p.click('[data-act="reset-offline"]');
await p.waitForSelector('[role="alertdialog"]');
await p.click('[role="alertdialog"] button:has-text("Reset it")');
await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 }).catch(() => {});
await sleep(1500);
const after = await until(async () => { const x = await st().catch(() => null); return x && x.state === 'ready' && x.updateReady === false; }, 20000);
check('after Reset the page stores a fresh copy and the update notice is gone', after, await st().catch(() => null));
if (same) check('the fresh copy is the second build (the old stored copy was removed)', (await st()).cachedVersion === (await st()).pageVersion, await st());
check('no page errors', errs.length === 0, errs);
await browser.close(); await hub.stop();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
