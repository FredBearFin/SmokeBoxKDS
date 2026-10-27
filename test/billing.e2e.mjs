// Browser check of billing against the Rust server and a pretend Stripe (about 20 s): starting a kitchen goes to Checkout and
// comes back with "Card added"; before Stripe confirms, every screen shows the countdown strip; once the card is in, the strip
// goes and the Billing sheet says "Free weeks"; a failed payment brings back a red strip with "Update the card", which opens
// Stripe's portal; a paid invoice clears it. Webhooks are signed the way Stripe signs them. Needs the release server, the
// built app and Postgres, like test/server-rs.e2e.mjs:
//   SMOKEBOX_E2E_DB=postgres://smokebox:dev@127.0.0.1/smokebox_e2e node test/billing.e2e.mjs
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolRequire } from '../tools/_deps.mjs';

const { chromium } = toolRequire('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.SMOKEBOX_E2E_DB || 'postgres://smokebox:dev@127.0.0.1/smokebox_e2e';
const PORT = 8792, BASE = 'http://127.0.0.1:' + PORT, FAKE = 8793, SECRET = 'whsec_e2e';
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The pretend Stripe: Checkout sends the owner straight back as if the card was added; the portal goes back to the board.
const asked = [];
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const f = new URLSearchParams(body);
    asked.push({ path: req.url, kitchen: f.get('client_reference_id'), customer: f.get('customer') });
    const url = req.url === '/v1/checkout/sessions' ? f.get('success_url') : BASE + '/?portal=1';
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ url }));
  });
});
await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));
// Sends one webhook, signed the way Stripe signs it, and returns the HTTP status.
async function event(id, type, object) {
  const body = JSON.stringify({ id, type, data: { object } }), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(t + '.' + body).digest('hex');
  return (await fetch(BASE + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=' + t + ',v1=' + sig }, body })).status;
}

const env = { DATABASE_URL: DB, PORT: String(PORT), PUBLIC_URL: BASE, SMOKEBOX_HTML: path.join(ROOT, 'dist/smokebox.html'), STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_ID: 'price_e2e', STRIPE_API_BASE: 'http://127.0.0.1:' + FAKE };
const srv = spawn(path.join(ROOT, 'server-rs/target/release/smokebox-server'), [], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'inherit'] });
// Waits for the server to say it is listening.
await new Promise((resolve, reject) => { srv.stdout.on('data', (d) => { if (/Smokebox on/.test(String(d))) resolve(); }); srv.on('exit', (c) => reject(new Error('server stopped: ' + c))); });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
// The strip at the top of the screen right now: its kind, tone, words and button.
const strip = (p) => p.evaluate(() => { const b = document.querySelector('.sb-banner'); return b ? { kind: b.dataset.kind, tone: b.dataset.tone, text: b.querySelector('.sb-banner-t').textContent, act: b.querySelector('.btn').textContent } : null; });
// Fetches billing from the server now and waits for the strip to show the kind wanted (or none).
async function waitStrip(p, kind) {
  let s = null;
  for (let i = 0; i < 40; i++) { await p.evaluate(() => SB.cloud.refreshBilling()); await sleep(250); s = await strip(p); if ((s ? s.kind : null) === kind) return s; }
  return s;
}
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(BASE + '/start');
  await p.click('text=Start a new kitchen');
  await p.fill('#kitchen', 'Card Test Kitchen'); await p.fill('#nemail', 'card' + Date.now() + '@example.com'); await p.fill('#npw', 'grill-master-1');
  await p.click('#new button[type=submit]');
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  const kitchen = asked.find((a) => a.path === '/v1/checkout/sessions');
  check('starting a kitchen goes through Stripe Checkout for this kitchen', !!(kitchen && kitchen.kitchen), asked);
  await p.waitForSelector('.toast, [role="status"]:has-text("Card added")', { timeout: 5000 }).catch(() => null);
  check('coming back from Checkout says Card added and tidies the address', await p.evaluate(() => /Card added/.test(document.body.textContent) && !/billing=/.test(location.search)));
  await p.evaluate(() => SB.floor && SB.floor.setWelcome && SB.floor.setWelcome(false));
  let s = await waitStrip(p, 'billing');
  check('until Stripe confirms the card, a countdown strip says when new orders pause', s && /pause in \d+ hours/.test(s.text) && s.act === 'Add a card', s);
  await p.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'billing-strip.png') });

  const cus = 'cus_e2e' + Date.now();
  check('Stripe confirms the card', await event('evt_e1_' + Date.now(), 'checkout.session.completed', { client_reference_id: kitchen.kitchen, customer: cus, subscription: 'sub_e2e' }) === 200);
  s = await waitStrip(p, null);
  check('with the card in, the strip goes away', s === null, s);
  await p.evaluate(() => SB.sheets.open('billing')); await p.waitForSelector('.bl-state'); await sleep(600);
  const sheet = await p.textContent('.bl');
  check('the Billing sheet says Free weeks, 21 days left, and offers Stripe\'s portal', /Free weeks/.test(sheet) && /21 days left/.test(sheet) && /receipts/.test(sheet), sheet);
  await p.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'billing-sheet.png') });
  await p.keyboard.press('Escape');

  const failed = await event('evt_e2_' + Date.now(), 'invoice.payment_failed', { customer: cus });
  check('Stripe says a payment failed', failed === 200);
  s = await waitStrip(p, 'billing');
  check('a failed payment shows a red strip with hours left and Update the card', s && s.tone === 'bad' && /Payment failed\. New orders pause in \d+ hours/.test(s.text) && s.act === 'Update the card', s);
  await Promise.all([p.waitForURL(/portal=1/, { timeout: 8000 }).catch(() => null), p.click('.sb-banner .btn')]);
  check('Update the card opens Stripe\'s portal for this kitchen\'s customer', /portal=1/.test(p.url()) && asked.some((a) => a.path === '/v1/billing_portal/sessions' && a.customer === cus), { url: p.url(), asked });
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  check('a paid invoice', await event('evt_e5_' + Date.now(), 'invoice.paid', { customer: cus }) === 200);
  s = await waitStrip(p, null);
  check('paying clears the strip at once', s === null, s);
  check('no page errors', errors.length === 0, errors.slice(0, 2));
} finally {
  await browser.close(); srv.kill(); fake.close();
}
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
