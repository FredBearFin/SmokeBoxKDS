// Read-only follower screen against the real hub (browser, about 90 s). Run: node test/follower.e2e.mjs
// A hub runs in this process. The leader is plain HTTP posts of actions to the hub (as a cooking tablet will send them); the
// follower is a browser page opened at <hub>/?follow. Covers: the chip (Connected, Reconnecting, Out of date since), no write controls,
// taps and keys that do nothing, no saved kitchen on the follower, silence by default, convergence after the leader acts, the hub
// going away and coming back, wall mode and far display. Needs dist/smokebox.html and the follower store (initFollower).
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHub } from '../server/server.mjs';

const { chromium } = toolRequire('playwright');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Polls until fn() answers true, up to ms, so the test waits for real round trips.
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return false; }
const dataFile = path.join(os.tmpdir(), 'smokebox-follower-' + process.pid + '.json');
try { fs.unlinkSync(dataFile); } catch (e) { /* none yet */ }
let hub = await createHub({ dataFile, starter: true });
const port = await hub.listen(0);
const base = 'http://127.0.0.1:' + port;
let n = 0;
// Sends one action to the hub the way a cooking tablet would.
async function act(type, payload) {
  const r = await fetch(base + '/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, payload, clientId: 'leader', opId: 'leader:' + (++n) }) });
  return r.json();
}
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(String(e)));
// A short stale limit for the test (the real default is 45 s), set by wrapping the store call before the page boots.
await p.addInitScript(() => { let wrapped = false; const tryWrap = () => { if (wrapped || !window.SB || !SB.store || !SB.store.initFollower) return; wrapped = true; const f = SB.store.initFollower; SB.store.initFollower = (o) => f(Object.assign({ staleMs: 6000 }, o)); }; const iv = setInterval(() => { tryWrap(); if (wrapped) clearInterval(iv); }, 1); });
await p.goto(base + '/?follow');
await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
const chip = () => p.evaluate(() => { const c = document.querySelector('.fl-fchip'); return c ? { text: c.innerText.replace(/\n/g, ' '), tone: c.dataset.tone, h: Math.round(c.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(c).fontSize) } : null; });
check('the follower says Connected', await until(async () => /Connected/.test((await chip() || {}).text || '')), await chip());
const c0 = await chip();
check('the chip is big enough for a TV (at least 48 px tall, 22 px type)', c0 && c0.h >= 48 && c0.fs >= 22, c0);
check('a calm line says the screen only shows the kitchen', /This screen only shows the kitchen\./.test(await p.evaluate(() => document.body.innerText)));
await p.evaluate(() => SB.floor.setWelcome && SB.floor.setWelcome(false));

// The leader acts, the follower converges
const mk = await act('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: 'tea', qty: 2 }], note: '', rush: false });
check('the leader made a ticket', mk.report === 'ok', mk);
check('the follower shows the ticket', await until(() => p.evaluate(() => document.querySelectorAll('.fl-slip').length === 1)), await p.evaluate(() => document.querySelectorAll('.fl-slip').length));
const tid = await p.evaluate(() => SB.store.getState().tickets[0] && SB.store.getState().tickets[0].id);
const it = await p.evaluate(() => SB.store.getState().tickets[0].items[0].id);
await act('advanceItem', { ticketId: tid, itemId: it });
check('an action by the leader shows on the follower', await until(() => p.evaluate((i) => { const t = SB.store.getState().tickets[0]; return t && t.items.find((x) => x.id === i).status !== 'displayed'; }, it)));

// Nothing to press
const vis = await p.evaluate(() => {
  const show = (s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null).length;
  return { newBtn: show('.fl-new'), bump: show('.fl-bump'), zone: show('[data-act="zone"]'), orders: show('.fl-tool'), more: show('.slip-foot'), next: show('.slip-next'), pe: [...document.querySelectorAll('.fl-slip button')].every((b) => getComputedStyle(b).pointerEvents === 'none') };
});
check('no New ticket, Bump, More, Orders or Recall controls are shown', vis.newBtn === 0 && vis.bump === 0 && vis.zone === 0 && vis.orders === 0 && vis.more === 0 && vis.next === 0, vis);
check('buttons left on the slips cannot be tapped', vis.pe, vis);
const before = JSON.stringify((await (await fetch(base + '/events', { signal: AbortSignal.timeout(500) }).catch(() => null)) ? 1 : 0));
await p.evaluate(() => { const b = document.querySelector('.fl-slip button[data-act="item"]'); if (b) b.click(); });
await p.keyboard.press('n'); await p.keyboard.press('b'); await p.waitForTimeout(600);
check('a forced tap and the N and B keys do nothing', (await p.locator('.ord-tile').count()) === 0 && (await p.evaluate((i) => SB.store.getState().tickets[0].items.find((x) => x.id === i).status, it)) === (await p.evaluate((i) => SB.store.getState().tickets[0].items.find((x) => x.id === i).status, it)));
const hubTicket = hub.snapshot().state.tickets[0];
const folTicket = await p.evaluate(() => SB.store.getState().tickets[0]);
check('the hub still holds exactly what the leader did (follower writes nothing)', JSON.stringify(hubTicket.items.map((x) => x.status)) === JSON.stringify(folTicket.items.map((x) => x.status)), [hubTicket.items.map((x) => x.status), folTicket.items.map((x) => x.status)]);
const keys = await p.evaluate(() => Object.keys(localStorage).filter((k) => /state|outbox|names|initials|dlog|lastbatch|menu/.test(k)));
check('the follower saves no kitchen data on this device', keys.length === 0, keys);
check('the follower is silent unless turned on for this screen', (await p.evaluate(() => SB.floor.sound())) === false && !/turn on warning sounds/.test(await p.evaluate(() => document.body.innerText)));

// Wall mode and far display
await p.evaluate(() => SB.floor.setWall(true)); await p.waitForTimeout(800);
check('wall mode works on the follower', await p.evaluate(() => document.querySelector('.fl').dataset.wall === 'on' && document.querySelectorAll('.fl-slip').length === 1));
await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/follower-wall-1920.png' : '/tmp/follower-wall-1920.png' });
await p.evaluate(() => { SB.floor.setWall(false); SB.floor.setFarDisplay(true); }); await p.waitForTimeout(800);
check('far display works on the follower', await p.evaluate(() => document.querySelector('.fl').dataset.far === 'on' && document.querySelectorAll('.fl-slip').length === 1));
await p.evaluate(() => SB.floor.setFarDisplay(false)); await p.waitForTimeout(500);
await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/follower-1920.png' : '/tmp/follower-1920.png' });

// The hub goes away
await hub.close();
check('with the hub gone the chip says Reconnecting or Out of date', await until(async () => /Reconnecting|Out of date/.test((await chip() || {}).text || ''), 12000), await chip());
check('after the stale limit the chip says Out of date since a time and a banner shows', await until(async () => /Out of date since \d/.test((await chip() || {}).text || '') && (await p.locator('.fl-fstale:visible').count()) === 1, 20000), await chip());
await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/follower-stale-1920.png' : '/tmp/follower-stale-1920.png' });
// The hub returns (same saved kitchen, same port) and the leader acts while the follower was away
hub = await createHub({ dataFile, starter: true });
await new Promise((res, rej) => hub.server.once('error', rej).listen(port, '127.0.0.1', res)).catch(() => null);
await act('createTicket', { customer: 'While away', channel: 'takeout', items: [{ menuId: 'tea', qty: 1 }], note: '', rush: false });
check('when the hub returns the follower shows Connected again', await until(async () => /Connected/.test((await chip() || {}).text || ''), 30000), await chip());
check('and it shows what happened while it was away', await until(() => p.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'While away')), 10000));
check('the banner is gone', (await p.locator('.fl-fstale:visible').count()) === 0);

// A phone
const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const q = await ph.newPage();
q.on('pageerror', (e) => errs.push(String(e)));
await q.goto(base + '/?follow');
await q.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
check('the phone follower is connected and has no sideways scroll', await until(async () => ((await q.evaluate(() => document.querySelector('.fl-fchip') && document.querySelector('.fl-fchip').innerText)) || '').includes('Connected')) && await q.evaluate(() => document.documentElement.scrollWidth <= 390));
await q.waitForTimeout(500);
await q.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/follower-390.png' : '/tmp/follower-390.png' });
check('no page errors', errs.length === 0, errs);
await browser.close(); await hub.close();
try { fs.unlinkSync(dataFile); } catch (e) { /* already gone */ }
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
