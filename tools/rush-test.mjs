#!/usr/bin/env node
// WHAT THIS FILE IS: The rush test: a fake lunch rush against the real Rust server, standing in for a pilot in a real kitchen.
//    Six tablets (browsers) join one kitchen with codes. For a few minutes every tablet takes orders and works dishes at
//    lunch-rush speed, with fryer and grill limits set. Halfway, two tablets lose the internet for 20 seconds and keep working
//    (their taps wait in the outbox), and then the server itself is stopped and started again. At the end every tablet must
//    show exactly the server's kitchen, and every order taken must be there exactly once: no lost tickets, no doubles.
// USES: server-rs/target/release/smokebox-server, dist/smokebox.html, Postgres (SMOKEBOX_RUSH_PG, a database it may create
//    databases in). Run: node tools/rush-test.mjs [minutes] [tablets]   (default 3 minutes, 6 tablets; about 4 minutes in all)
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolRequire } from './_deps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = toolRequire('playwright');
const MINUTES = Number(process.argv[2]) || 3, TABLETS = Number(process.argv[3]) || 6;
const ADMIN = process.env.SMOKEBOX_RUSH_PG || 'postgres://smokebox:dev@127.0.0.1/postgres';
const DBNAME = 'rush_' + Date.now().toString(36);
const DB = ADMIN.replace(/\/[^/]*$/, '/' + DBNAME);
const PORT = 8793, BASE = 'http://127.0.0.1:' + PORT;
const BIN = path.join(ROOT, 'server-rs/target/release/smokebox-server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
// Prints a progress line with the time since the start.
const t0 = Date.now();
const log = (s) => console.log('[' + Math.round((Date.now() - t0) / 1000) + 's] ' + s);

// Makes the empty database for this run (psql CREATE DATABASE).
async function makeDb() {
  const r = spawn('psql', [ADMIN, '-qc', 'CREATE DATABASE ' + DBNAME], { stdio: 'inherit' });
  await new Promise((res, rej) => r.on('exit', (c) => (c === 0 ? res() : rej(new Error('createdb failed')))));
}
// Starts the server and waits until it listens. Returns the process.
async function startServer() {
  const p = spawn(BIN, [], { env: Object.assign({}, process.env, { DATABASE_URL: DB, PORT: String(PORT), SMOKEBOX_HTML: path.join(ROOT, 'dist/smokebox.html') }), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', (d) => { const s = String(d); if (/panicked|error/i.test(s)) process.stderr.write('[server] ' + s); });
  await new Promise((res, rej) => { p.stdout.on('data', (d) => { if (/Smokebox on/.test(String(d))) res(); }); p.on('exit', (c) => rej(new Error('server exited ' + c))); });
  return p;
}
// Stops the server (as a crash or a deploy would) and waits for it to be gone.
async function stopServer(p) { p.kill('SIGKILL'); await new Promise((r) => p.on('exit', r)); }

// What one tablet shows: its tickets as "customer:status:items" lines, sorted, plus how many actions wait to send.
const snapshot = (page) => page.evaluate(() => {
  const s = SB.store.getState();
  return { tickets: s.tickets.map((t) => t.customer + ':' + t.status + ':' + t.items.map((i) => i.status).join(',')).sort(), waiting: SB.cloud.status().waiting, connected: SB.cloud.status().connected };
});

let server = null, browser = null;
try {
  if (!fs.existsSync(BIN)) throw new Error('Build the server first: cd server-rs && cargo build --release');
  await makeDb();
  server = await startServer();
  log('server up, database ' + DBNAME);
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  // The owner's tablet starts the kitchen; the others join with codes made on it.
  const ctxs = [], pages = [];
  const owner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const op = await owner.newPage();
  const r = await op.request.post(BASE + '/api/start', { data: { kitchen: 'Rush Test', email: 'rush' + Date.now() + '@example.com', password: 'rush-test-1', device: 'tablet' } });
  if (!r.ok()) throw new Error('could not start the kitchen: ' + (await r.text()));
  await op.goto(BASE + '/'); await op.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  ctxs.push(owner); pages.push(op);
  for (let i = 1; i < TABLETS; i++) {
    const code = (await (await op.request.post(BASE + '/api/devices/code', { data: {} })).json()).code;
    const c = await browser.newContext({ viewport: { width: 962, height: 601 } });
    const p = await c.newPage();
    const j = await p.request.post(BASE + '/api/join', { data: { code, device: 'tablet' } });
    if (!j.ok()) throw new Error('tablet ' + i + ' could not join: ' + (await j.text()));
    await p.goto(BASE + '/'); await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
    ctxs.push(c); pages.push(p);
  }
  log(TABLETS + ' tablets joined');
  // A small fast menu (so dishes really finish during the test) and a fryer of 2 baskets and a grill of 3 spots.
  await op.evaluate(() => {
    const add = (name, zone, cat, prepSec, track) => SB.store.dispatchEx('addMenuItem', { name, zone, cat, price: 8, prepSec, track }, { source: 'ui' });
    add('Smash burger', 'pit', 'meat', 40, 'two'); add('Chicken sandwich', 'pit', 'meat', 35, 'two'); add('Fries', 'fry', 'fried', 30, 'two');
    add('Onion rings', 'fry', 'fried', 25, 'two'); add('Mac and cheese', 'sides', 'side', 20, 'two'); add('Slaw', 'cold', 'cold', 5, 'one'); add('Lemonade', 'cold', 'cold', 5, 'one');
    SB.store.dispatchEx('updateSettings', { patch: { capacity: { fry: 2, pit: 3 } } }, { source: 'ui' });
  });
  await sleep(2000);

  // The rush: every tablet, in turn, takes an order now and then and works whatever dishes it sees. Every order has a unique name.
  const made = new Map();
  let n = 0, cut = false, restarted = false;
  const end = Date.now() + MINUTES * 60e3, half = Date.now() + (MINUTES * 60e3) / 2;
  while (Date.now() < end) {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      // About 40 orders an hour per tablet: a busy lunch for a small kitchen.
      if (Math.random() < 0.25) {
        const name = 'T' + i + '-' + (++n);
        const rep = await p.evaluate((name) => {
          const menu = SB.store.getState().menu.filter((m) => !m.archived);
          if (!menu.length) return 'noMenu';
          const pick = () => menu[Math.floor(Math.random() * menu.length)].id;
          const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({ menuId: pick(), qty: 1 }));
          return SB.store.dispatchEx('createTicket', { customer: name, channel: 'takeout', items }, { source: 'ui' }).report;
        }, name).catch((e) => 'error ' + e.message);
        if (rep === 'ok') made.set(name, i);
      }
      // Work: start what is due, finish what has cooked long enough, bump finished tickets.
      await p.evaluate(() => {
        const s = SB.store.getState(), now = SB.store.now();
        for (const t of s.tickets.filter((x) => x.status === 'active')) {
          if (t.items.every((it) => it.status === 'done')) { if (Math.random() < 0.5) SB.store.dispatchEx('bumpTicket', { ticketId: t.id }, { source: 'ui' }); continue; }
          for (const it of t.items) {
            if (it.status === 'displayed' && !(it.freeAt > now) && Math.random() < 0.6) SB.store.dispatchEx('advanceItem', { ticketId: t.id, itemId: it.id }, { source: 'ui' });
            else if (it.status === 'cooking' && now - it.startedAt > it.prepSec * 1000 && Math.random() < 0.5) SB.store.dispatchEx('advanceItem', { ticketId: t.id, itemId: it.id }, { source: 'ui' });
          }
        }
      }).catch(() => {});
    }
    // Halfway: two tablets lose the internet for 20 seconds and keep working; then the server is stopped and started again.
    if (!cut && Date.now() > half - 25e3) {
      cut = true; log('tablets 1 and 2 lose the internet for 20 s');
      await ctxs[1].setOffline(true); await ctxs[2].setOffline(true);
      setTimeout(async () => { await ctxs[1].setOffline(false); await ctxs[2].setOffline(false); log('tablets 1 and 2 are back online'); }, 20e3);
    }
    if (!restarted && Date.now() > half + 10e3) {
      restarted = true; log('server stopped hard (as in a crash)');
      await stopServer(server); await sleep(5000);
      server = await startServer(); log('server started again');
    }
    await sleep(400);
  }
  log('rush over: ' + made.size + ' orders taken; letting every tablet catch up');
  // Catch-up: every queued tap sends, every screen hears the final kitchen.
  let snaps = [];
  for (let k = 0; k < 40; k++) {
    await sleep(1500);
    snaps = await Promise.all(pages.map(snapshot));
    if (snaps.every((x) => x.waiting === 0 && x.connected) && snaps.every((x) => JSON.stringify(x.tickets) === JSON.stringify(snaps[0].tickets))) break;
  }
  // The server's own kitchen, seen by a brand-new tablet.
  const fresh = await browser.newContext();
  const fp = await fresh.newPage();
  const code = (await (await op.request.post(BASE + '/api/devices/code', { data: {} })).json()).code;
  await fp.request.post(BASE + '/api/join', { data: { code, device: 'tablet' } });
  await fp.goto(BASE + '/'); await fp.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 }); await sleep(2500);
  // The tablets and the server's view are read at the same moment (the kitchen clock keeps moving waiting dishes along), a few
  // times over: a real disagreement stays, a reading taken mid-change does not.
  let truth = null;
  for (let k = 0; k < 6; k++) {
    const all = await Promise.all(pages.concat([fp]).map(snapshot));
    truth = all.pop(); snaps = all;
    if (snaps.every((x) => JSON.stringify(x.tickets) === JSON.stringify(truth.tickets))) break;
    await sleep(1000);
  }
  const names = truth.tickets.map((x) => x.split(':')[0]);
  const counts = names.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const lost = [...made.keys()].filter((x) => !counts.has(x));
  const doubled = [...counts].filter(([, c]) => c > 1).map(([x]) => x);
  check('orders were taken during the rush (' + made.size + ')', made.size >= TABLETS * 3, made.size);
  check('every tablet sent everything it queued (outboxes empty)', snaps.every((x) => x.waiting === 0), snaps.map((x) => x.waiting));
  // For a tablet still holding actions: what the server answers when its oldest one is sent again by hand, so a stuck queue says why.
  for (const [i, x] of snaps.entries()) {
    if (!x.waiting) continue;
    const why = await pages[i].evaluate(async () => {
      const e = SB.store.outbox()[0];
      const r = await fetch('/api/action', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: e.type, payload: e.payload, opId: e.opId, at: e.now }) });
      return { type: e.type, opId: e.opId, status: r.status, answer: (await r.text()).slice(0, 300) };
    });
    console.log('    tablet ' + i + ' oldest unsent action: ' + JSON.stringify(why));
  }
  check('every tablet is connected again after the outage and the restart', snaps.every((x) => x.connected), snaps.map((x) => x.connected));
  check('no order was lost (taken on a tablet but missing on the server)', lost.length === 0, lost.slice(0, 10));
  check('no order was doubled', doubled.length === 0, doubled.slice(0, 10));
  // What differs, if anything: the first few lines one tablet has that the server does not, and the other way round.
  const diff = (a, b) => ({ onlyTablet: a.filter((x) => !b.includes(x)).slice(0, 4), onlyServer: b.filter((x) => !a.includes(x)).slice(0, 4) });
  snaps.forEach((x, i) => { const d = diff(x.tickets, truth.tickets); if (d.onlyTablet.length || d.onlyServer.length) console.log('    tablet ' + i + ' differs: ' + JSON.stringify(d)); });
  check('every tablet shows exactly the server\'s kitchen', snaps.every((x) => JSON.stringify(x.tickets) === JSON.stringify(truth.tickets)), snaps.map((x, i) => i + ': ' + x.tickets.length + ' tickets').concat(['server: ' + truth.tickets.length]));
  const bumped = truth.tickets.filter((x) => x.split(':')[1] === 'expedited').length;
  log(truth.tickets.length + ' tickets on the server, ' + bumped + ' bumped');
} catch (e) {
  fail++; console.log('  FAIL  the rush test could not run -> ' + e.message);
} finally {
  if (browser) await browser.close();
  if (server) await stopServer(server).catch(() => {});
}
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
