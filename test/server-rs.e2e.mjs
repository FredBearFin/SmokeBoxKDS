// Browser check of the Rust server (about 30 s): start a kitchen on the start page, open Devices, add a second tablet with the
// 6-digit code, and see a ticket made on one tablet appear on the other. Then remove the second tablet and see it sent to the
// start page. Needs the release server (cd server-rs && cargo build --release), dist/smokebox.html and a Postgres database:
//   SMOKEBOX_E2E_DB=postgres://smokebox:dev@127.0.0.1/smokebox_e2e node test/server-rs.e2e.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolRequire } from '../tools/_deps.mjs';

const { chromium } = toolRequire('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.SMOKEBOX_E2E_DB || 'postgres://smokebox:dev@127.0.0.1/smokebox_e2e';
const PORT = 8791, BASE = 'http://127.0.0.1:' + PORT;
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(path.join(ROOT, 'server-rs/target/release/smokebox-server'), [], { env: Object.assign({}, process.env, { DATABASE_URL: DB, PORT: String(PORT), SMOKEBOX_HTML: path.join(ROOT, 'dist/smokebox.html') }), stdio: ['ignore', 'pipe', 'inherit'] });
// Waits for the server to say it is listening.
await new Promise((resolve, reject) => { srv.stdout.on('data', (d) => { if (/Smokebox on/.test(String(d))) resolve(); }); srv.on('exit', (c) => reject(new Error('server stopped: ' + c))); });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const email = 'owner' + Date.now() + '@example.com';
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await a.goto(BASE + '/');
  check('a new device lands on the start page', /\/start$/.test(a.url()), a.url());
  await a.click('text=Start a new kitchen');
  await a.fill('#kitchen', 'Freddy Test Kitchen'); await a.fill('#nemail', email); await a.fill('#npw', 'grill-master-1');
  await a.click('#new button[type=submit]');
  await a.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  check('starting a kitchen opens the app on this device', await a.evaluate(() => !!(SB.cloud && SB.cloud.on && SB.cloud.kitchen.name === 'Freddy Test Kitchen')));
  // Devices: Add a device shows the code.
  await a.evaluate(() => SB.floor && SB.floor.setWelcome && SB.floor.setWelcome(false));
  await a.evaluate(() => SB.sheets.open('devices')); await a.waitForSelector('[data-act="add-device"]');
  await a.click('[data-act="add-device"]'); await a.waitForSelector('.dv-digits');
  const code = (await a.textContent('.dv-digits')).replace(/\D/g, '');
  check('Add a device shows a 6-digit code', /^\d{6}$/.test(code), code);
  await a.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'rs-devices.png') });
  // A second tablet joins with the code.
  const b = await (await browser.newContext({ viewport: { width: 962, height: 601 } })).newPage();
  await b.goto(BASE + '/start');
  await b.click('text=Join a kitchen'); await b.fill('#code', code); await b.click('#join button[type=submit]');
  await b.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  check('the second tablet joined the same kitchen', await b.evaluate(() => SB.cloud.kitchen.name) === 'Freddy Test Kitchen');
  // A dish and a ticket made on tablet A show on tablet B.
  await a.evaluate(() => { const r = SB.store.dispatchEx('addMenuItem', { name: 'Fries', zone: 'fry', cat: 'fried', price: 4, prepSec: 420, track: 'two' }, { source: 'ui' }); SB.store.dispatchEx('createTicket', { customer: 'Freddy', items: [{ menuId: r.info.id }] }, { source: 'ui' }); });
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) { await sleep(300); seen = await b.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'Freddy')); }
  check('a ticket made on tablet A shows on tablet B', seen);
  // Tablet A removes tablet B; B is sent to the start page on its next call.
  await a.evaluate(() => SB.sheets.closeAll()); await sleep(400);
  await a.evaluate(() => SB.sheets.open('devices')); await a.waitForSelector('.dv-row');
  const rows = await a.$$('.dv-row');
  check('both devices are listed', rows.length === 2, rows.length);
  const other = await a.evaluateHandle(() => [...document.querySelectorAll('.dv-row')].find((r) => !/This device/.test(r.textContent)));
  await (await other.asElement().$('[data-act="remove-device"]')).click();
  await a.click('.sheet-root:last-of-type .btn-danger');
  await sleep(800);
  const me = await b.evaluate(() => fetch('/api/me').then((r) => r.status));
  check('the removed tablet is signed out', me === 401, me);
} finally {
  await browser.close();
  srv.kill('SIGINT');
}
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
