// The back office on a read-only follower screen (browser, about 40 s). Run: node test/office-follower.e2e.mjs
// A hub runs in this process; the page is opened at <hub>/?follow. Covers: every office page opens, the Data page says what
// this screen cannot do and shuts the edit, restore and erase controls while backups and spreadsheet files stay, and
// Close the day cannot be pressed. Then a hub-connected tablet is simulated: restore and erase are shut, edits stay.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createHub } from '../server/server.mjs';

const { chromium } = toolRequire('playwright');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const dataFile = path.join(os.tmpdir(), 'smokebox-office-follower-' + process.pid + '.json');
try { fs.unlinkSync(dataFile); } catch (e) { /* none yet */ }
const hub = await createHub({ dataFile, starter: true, heartbeatMs: 500 });
const port = await hub.listen(0);
const base = 'http://127.0.0.1:' + port;
let n = 0;
// Sends one action to the hub the way a cooking tablet would.
async function act(type, payload) {
  const r = await fetch(base + '/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload, clientId: 'leader', opId: 'leader:' + (++n) }) });
  return r.json();
}
check('the leader made a ticket', (await act('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: 'tea', qty: 2 }] })).report === 'ok');
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(base + '/?follow');
await page.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const go = async (pg) => { await page.evaluate((x) => { location.hash = '#/office/' + x; }, pg); await page.waitForTimeout(1200); };
for (const pg of ['pace', 'tickets', 'stations', 'money', 'safety', 'stock']) {
  await go(pg);
  check(pg + ' opens on a follower', await page.evaluate(() => !!document.querySelector('#sb-office h1.of-title')));
}
await go('safety');
check('Safety keeps its print button (read only)', await page.evaluate(() => [...document.querySelectorAll('#sb-office button')].some((b) => /Print the safety record/.test(b.innerText))));
await go('data');
const banner = await page.evaluate(() => (document.querySelector('.od-conn') || {}).textContent || '');
check('the Data page says this screen only shows the shared kitchen', /only shows the shared kitchen/.test(banner), banner);
const open = await page.evaluate(() => [...document.querySelectorAll('.od-content button:not([disabled]), .od-content input:not([disabled]), .od-content select:not([disabled]), .od-content textarea:not([disabled])')].filter((b) => b.offsetParent).map((b) => (b.innerText || b.getAttribute('aria-label') || b.dataset.action || '').trim()));
check('only downloads, copies and report controls stay usable', open.every((t) => /backup|CSV|window|counted|^$/i.test(t)), open);
check('Download backup and the spreadsheet files stay', open.includes('Download backup (JSON)') && open.includes('Download tickets as CSV'), open);
check('restore and both erase buttons are shut', await page.evaluate(() => ['import-choose', 'import-check-paste'].every((a) => { const b = document.querySelector('[data-action="' + a + '"]'); return !b || b.disabled; }) && [...document.querySelectorAll('.od-content .btn-danger')].every((b) => b.disabled)));
check('the follower can still make a backup copy of the hub kitchen', await page.evaluate(() => { try { return String(SB.store.exportAll()).length > 1000; } catch (e) { return false; } }));
await go('money');
await page.evaluate(() => document.querySelector('[data-k="close-day"]').click());
await page.waitForTimeout(800);
const cd = await page.evaluate(() => ({ disabled: [...document.querySelectorAll('.cd-actions .btn-primary')].map((b) => b.disabled), status: (document.querySelector('.cd-status') || {}).textContent || '' }));
check('Close the day cannot be pressed and says why', cd.disabled.length === 1 && cd.disabled[0] === true && /Close the day on the hub computer/.test(cd.status), cd);
// A hub-connected tablet (simulated): edits stay, restore and erase are shut.
await page.evaluate(() => { SB.store.isFollower = () => false; SB.store.isHub = () => true; location.hash = '#/office/pace'; });
await page.waitForTimeout(500);
await go('data');
const hubInfo = await page.evaluate(() => ({ banner: (document.querySelector('.od-conn') || {}).textContent || '', erase: [...document.querySelectorAll('.od-content .btn-danger')].filter((b) => /^Erase /.test(b.innerText)).every((b) => b.disabled) }));
check('a hub tablet is told restore and erase are done on the hub computer', /shared kitchen/.test(hubInfo.banner) && /hub computer/.test(hubInfo.banner) && hubInfo.erase, hubInfo);
check('no page errors', errs.length === 0, errs);
await browser.close();
try { hub.close && hub.close(); } catch (e) { /* closing */ }
console.log(fail ? 'FAILED: ' + fail : 'PASSED');
process.exit(fail ? 1 : 0);
