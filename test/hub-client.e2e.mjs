// The board in hub mode, two tablets against a real hub (browser, about 90 s). Run: SMOKEBOX_TOOLS=$(npm root -g) node test/hub-client.e2e.mjs
// Covers: both tablets Connected, a tap on one shows on the other within a second, a tablet that goes offline shows the chip with its
// unsent count and marks changed slips "Not confirmed yet", a tap the hub refuses (the ticket was already bumped from the other screen)
// shows "Not done: ..." on the tablet that tapped and takes the change back, reconnecting clears the chip, and nothing demo-only shows.
// Uses the hub starter from test/_connected.mjs. Needs the hub client in the store (initHubClient); prints SKIP without it.
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, sleep } from './_connected.mjs';

const { chromium } = toolRequire('playwright');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + JSON.stringify(detail))); }
// Polls until fn() answers true, up to ms.
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return false; }
const hub = await startHub({ starter: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
// Opens one tablet on the hub and waits for the board.
async function tablet(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(hub.origin + '/?hub');
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  return { ctx, p };
}
const A = await tablet(1024, 768);
if (!(await A.p.evaluate(() => typeof SB.store.initHubClient === 'function'))) { console.log('  skip  the hub client is not in this build'); await browser.close(); await hub.stop(); process.exit(0); }
const B = await tablet(1024, 768);
const chip = (t) => t.p.evaluate(() => { const c = document.querySelector('.fl-hchip'); return c ? { text: c.innerText.replace(/\n/g, ' '), tone: c.dataset.tone, h: Math.round(c.getBoundingClientRect().height) } : null; });
const count = (t) => t.p.evaluate(() => document.querySelectorAll('.fl-slip').length);
check('tablet A says Connected', await until(async () => /Connected/.test((await chip(A) || {}).text || '')), await chip(A));
check('tablet B says Connected', await until(async () => /Connected/.test((await chip(B) || {}).text || '')), await chip(B));
const c0 = await chip(A);
check('the chip is small and calm (under 36 px tall)', c0 && c0.h < 36, c0);
check('a tablet in hub mode is not a read-only follower and can take orders', await A.p.evaluate(() => document.documentElement.dataset.follow !== 'on' && !!document.querySelector('.fl-new') && document.querySelector('.fl-new').offsetParent !== null));
check('nothing demo-only shows in hub mode', await A.p.evaluate(() => ['.fl-demo-chip', '.fl-start-demo', '.fl-tool[data-tool="demo"]'].every((s) => [...document.querySelectorAll(s)].every((e) => e.offsetParent === null))));
await A.p.evaluate(() => SB.floor.setWelcome(false)); await B.p.evaluate(() => SB.floor.setWelcome(false));

// A taps, B sees it within a second
const t0 = Date.now();
await A.p.evaluate(() => { SB.store.dispatchEx('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: 'tea', qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
check('B shows the ticket A made within a second', await until(async () => (await count(B)) === 1, 1500), await count(B));
check('A shows it too', (await count(A)) === 1);
const tid = await A.p.evaluate(() => SB.store.getState().tickets[0].id);
await until(async () => (await B.p.evaluate(() => SB.store.getState().tickets.length)) === 1);

// B goes offline and taps; meanwhile A finishes and bumps the ticket
await B.ctx.setOffline(true);
await B.p.evaluate((id) => { const t = SB.store.getState().tickets.find((x) => x.id === id); SB.store.dispatchEx('completeItem', { ticketId: id, itemId: t.items[0].id }, { source: 'ui' }); }, tid);
check('B offline: the chip says Offline and your taps are saved', await until(async () => /Offline: your taps are saved/.test((await chip(B) || {}).text || ''), 15000), await chip(B));
check('B offline: the chip counts the unsent tap', /1 tap waiting|1 waiting/.test((await chip(B) || {}).text || ''), await chip(B));
check('B offline: the changed slip is marked Not confirmed yet', await B.p.evaluate(() => !!document.querySelector('.fl-slip[data-pending="on"] .slip-pending')), await B.p.evaluate(() => document.querySelectorAll('.slip-pending').length));
check('B offline: a line says the change is not confirmed', /not confirmed yet/.test(await B.p.evaluate(() => document.querySelector('.fl-hnote') ? document.querySelector('.fl-hnote').innerText : '')));
await B.p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/hub-offline-1024.png' : '/tmp/hub-offline-1024.png' });
await A.p.evaluate((id) => { const t = SB.store.getState().tickets.find((x) => x.id === id); SB.store.dispatchEx('completeItem', { ticketId: id, itemId: t.items[0].id }, { source: 'ui' }); SB.store.dispatchEx('bumpTicket', { ticketId: id }, { source: 'ui' }); }, tid);
await sleep(500);
await B.ctx.setOffline(false);
check('B back online: B gets "Not done:" with a reason on its own screen', await until(() => B.p.evaluate(() => [...document.querySelectorAll('.toast')].some((e) => /Not done:/.test(e.textContent))), 20000), await B.p.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent)));
check('A did not get that toast', !(await A.p.evaluate(() => [...document.querySelectorAll('.toast')].some((e) => /Not done:/.test(e.textContent)))));
check('B back online: the chip is Connected again and nothing is unsent', await until(async () => /Connected/.test((await chip(B) || {}).text || '')), await chip(B));
check('B: the marker and the line are gone', await until(() => B.p.evaluate(() => document.querySelectorAll('.slip-pending').length === 0 && (!document.querySelector('.fl-hnote') || document.querySelector('.fl-hnote').hidden))));
check('B and A agree: the ticket is bumped on both', await until(async () => (await count(B)) === 0 && (await count(A)) === 0));
await B.p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/hub-refused-1024.png' : '/tmp/hub-refused-1024.png' });

// Phone
const C = await tablet(390, 844);
check('a phone in hub mode shows the chip and does not scroll sideways', await until(async () => /Connected/.test((await chip(C) || {}).text || '')) && await C.p.evaluate(() => document.documentElement.scrollWidth <= 390));
await C.ctx.setOffline(true);
await C.p.evaluate(() => { SB.store.dispatchEx('createTicket', { customer: 'Phone', channel: 'takeout', items: [{ menuId: 'tea', qty: 1 }], note: '', rush: false }, { source: 'ui' }); });
await until(async () => /Offline/.test((await chip(C) || {}).text || ''), 15000);
await C.p.waitForTimeout(500);
await C.p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/hub-offline-390.png' : '/tmp/hub-offline-390.png' });
await C.ctx.setOffline(false);
check('the phone catches up after reconnecting (the hub has its ticket)', await until(async () => /Connected/.test((await chip(C) || {}).text || '')) && await until(async () => (await B.p.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'Phone')))), await chip(C));
check('no page errors', errs.length === 0, errs);
await browser.close(); await hub.stop();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
