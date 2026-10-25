// Browser check of the Rust server (about 30 s): start a kitchen on the start page, open Devices, add a second tablet with the
// 6-digit code, and see a ticket made on one tablet appear on the other. Then remove the second tablet and see it sent to the
// start page. Needs the release server (cd server-rs && cargo build --release), dist/smokebox.html and a Postgres database:
//   SMOKEBOX_E2E_DB=postgres://smokebox:dev@127.0.0.1/smokebox_e2e node test/server-rs.e2e.mjs
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
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
// The 6-digit authenticator code for a base32 secret at a time (RFC 6238), as a staff member's phone would show it.
function totp(secret, ms) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of secret) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(ms / 30000)));
  const hm = crypto.createHmac('sha1', key).update(msg).digest(), o = hm[hm.length - 1] & 15;
  return String((hm.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

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
  // Support: a cook asks from the Help panel; staff answer in the console (password and authenticator code); the tablet shows the dot.
  await a.evaluate(() => SB.sheets.closeAll()); await sleep(300);
  await a.click('.fl-help'); await a.waitForSelector('.hp-what');
  await a.fill('.hp-what', 'The fryer tablet froze during lunch');
  await a.click('text=Kitchen is stuck right now');
  await a.click('[data-act="send-support"]');
  await a.waitForFunction(() => /Sent\. Request/.test(document.querySelector('.sheet-root:last-of-type [role=status]:not(:empty)') ? [...document.querySelectorAll('.sheet-root:last-of-type [role=status]')].map((e) => e.textContent).join(' ') : ''), null, { timeout: 8000 }).catch(() => {});
  const sentWords = await a.evaluate(() => [...document.querySelectorAll('.sheet-root:last-of-type [role=status]')].map((e) => e.textContent).join(' '));
  check('the Help panel sends a request', /Sent\. Request \d+/.test(sentWords), sentWords);
  await a.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'rs-help.png') });
  const staffOut = execFileSync(path.join(ROOT, 'server-rs/target/release/smokebox-server'), ['staff-add', 'staff' + Date.now() + '@smokebox.example', 'Freddy'], { env: Object.assign({}, process.env, { DATABASE_URL: DB }) }).toString();
  const sEmail = staffOut.match(/Staff added: (\S+)/)[1], sPass = staffOut.match(/Password: (\S+)/)[1], secret = staffOut.match(/Authenticator secret: (\S+)/)[1];
  const st = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await st.goto(BASE + '/staff');
  await st.fill('#em', sEmail); await st.fill('#pw', sPass); await st.fill('#cd', totp(secret, Date.now()));
  await st.click('#lf button[type=submit]');
  await st.waitForSelector('.t', { timeout: 8000 });
  check('the staff inbox shows the stuck kitchen first', /STUCK/.test(await st.textContent('.t')));
  await st.click('.t'); await st.waitForSelector('#view textarea');
  await st.fill('#view textarea', 'Hold the power button for 10 seconds, then open Smokebox again.');
  await st.click('#view .row button:first-child'); await sleep(800);
  await st.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'rs-staff.png') });
  await a.evaluate(() => SB.support.refresh()); await sleep(800);
  check('the tablet shows a new-reply dot on Help', await a.evaluate(() => !document.querySelector('.fl-help .fl-tool-n').hidden));
} finally {
  await browser.close();
  srv.kill('SIGINT');
}
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
