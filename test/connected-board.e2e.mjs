// The kitchen board in hub mode with the newest board features (browser against a real hub, about 2 minutes). Run: node test/connected-board.e2e.mjs
// A writing tablet (?hub) and a follower (?follow) on one hub. Covers: the device clock jumping while the hub keeps the time (no clock notice,
// no timer jump), the Closed-day Reopen label and its toast in hub mode (never over the hub chip or a notice), the one-notice-at-a-time rule with
// the update note, damaged saved data on a tablet that joins a hub (the board opens, the saved data stays), and the chef voice (the writing tablet
// speaks, a follower is silent unless its sound is on). Needs dist/smokebox.html and the hub in server/.
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, httpLeader, sleep } from './_connected.mjs';

const { chromium } = toolRequire('playwright');
let fail = 0;
// Records one check and prints it.
function check(name, ok, detail) { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ' -> ' + String(JSON.stringify(detail)).slice(0, 300))); }
// Polls until fn() answers true, up to ms.
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return false; }
const SHOTS = process.env.SHOT_DIR || '/tmp';
const STUB = "window.__said = []; window.SpeechSynthesisUtterance = function (t) { this.text = t; }; Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: (u) => window.__said.push(u.text), cancel() {}, getVoices: () => [], speaking: false, pending: false, paused: false, addEventListener() {}, removeEventListener() {} } });";
const UPDATE_STUB = "(() => { const iv = setInterval(() => { if (window.SB) { clearInterval(iv); SB.offline = { status: () => ({ supported: true, state: 'update', updateReady: true }), subscribe: () => () => {}, register: () => Promise.resolve({ ok: true }), check: () => Promise.resolve({ ok: true }), applyUpdate() {}, reset() {} }; } }, 1); })();";
const hub = await startHub({ starter: true });
const L = httpLeader(hub.origin);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errs = [];
// Opens a writing tablet on the hub and waits until it says connected.
async function tablet(w, h, init) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  for (const s of init || []) await p.addInitScript(s);
  await p.goto(hub.origin + '/?hub');
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await p.waitForFunction(() => SB.store.hubStatus && SB.store.hubStatus().state === 'connected', null, { timeout: 15000 });
  await p.evaluate(() => SB.floor.setWelcome(false));
  p.ctx = ctx;
  return p;
}

// 1. The device clock jumps while the tablet is on the hub: the hub keeps the time, so no notice and no timer jump
for (const [label, w, h] of [['390', 390, 844], ['1024', 1024, 768]]) {
  const p = await tablet(w, h);
  const mid = await p.evaluate(() => SB.store.getState().menu[0].id);
  await L.act('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: mid, qty: 1 }], note: '', rush: false });
  await until(() => p.evaluate(() => document.querySelectorAll('.fl-slip').length >= 1));
  await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 3 * 86400e3; });
  await p.waitForTimeout(7000);
  const s = await p.evaluate(() => ({ sus: !!SB.store.status().clockSuspect, bar: !!document.querySelector('.fl-bar-clock:not([hidden])'), banner: !!document.querySelector('.sb-banner[data-kind="clock"]'), dlg: !!document.querySelector('[role="alertdialog"], [role="dialog"]'), timer: (document.querySelector('.fl-slip .slip-timer') || {}).textContent, chip: !!document.querySelector('.fl-hchip') }));
  check('hub mode ' + label + ': a device clock jump raises no clock notice, banner or box', !s.sus && !s.bar && !s.banner && !s.dlg, s);
  check('hub mode ' + label + ': the ticket timer follows the hub (under a minute old, not days)', /^00:/.test((s.timer || '').trim()), s);
  check('hub mode ' + label + ': the hub chip stays', s.chip, s);
  await p.ctx.close();
}

// 2. Closed day in hub mode: the Reopen button says so before the tap, and the refusal toast never covers the chip or a notice
{
  const p = await tablet(390, 844, [UPDATE_STUB]);
  const mid = await p.evaluate(() => SB.store.getState().menu[0].id);
  await p.evaluate((mid) => { SB.store.dispatch('createTicket', { customer: 'Paid Pam', channel: 'dine_in', items: [{ menuId: mid, qty: 1 }], note: '', rush: false, pay: { method: 'cash' } }); }, mid);
  await sleep(800);
  await p.evaluate(() => SB.store.dispatch('closeDay', {}));
  await until(() => p.evaluate(() => !!SB.store.getState().lastClose));
  await p.evaluate(() => SB.sheets.open('orders')); await p.waitForTimeout(700);
  await p.click('.seg-opt[data-id="paid"], button:has-text("Paid today")').catch(() => {}); await p.waitForTimeout(500);
  const rb = p.locator('[data-act="reopen"]').first();
  const lab = (await rb.count()) ? await rb.innerText() : '';
  check('hub mode: the closed-day Reopen button says so before the tap', /Closed day: cannot reopen/.test(lab), lab);
  if (await rb.count()) {
    await rb.click({ force: true }); await p.waitForTimeout(600);
    const g = await p.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const ts = [...document.querySelectorAll('.toast')].map((e) => ({ box: r(e), txt: e.innerText }));
      const others = [...document.querySelectorAll('.fl-hchip, .fl-bar-clock, .fl-strip-bar')].filter((e) => e.offsetParent !== null).map(r);
      const hit = ts.some((t) => others.some((o) => o.l < t.box.r && t.box.l < o.r && o.t < t.box.b && t.box.t < o.b));
      return { n: ts.length, txt: ts[0] && ts[0].txt, inside: ts.every((t) => t.box.l >= 0 && t.box.r <= innerWidth), hit };
    });
    check('hub mode: the refusal toast gives the plain reason, inside the screen', g.n > 0 && /already closed/.test(g.txt || '') && g.inside, g);
    check('hub mode: the refusal toast does not cover the chip or a notice', !g.hit, g);
    await p.screenshot({ path: SHOTS + '/hub-reopen-refused-390.png' });
  }
  await p.ctx.close();
}

// 3. One notice at a time with the update note in hub mode
{
  const p = await tablet(1280, 800, [UPDATE_STUB]);
  await p.evaluate(() => SB.floor.setSound(false));
  await p.waitForTimeout(1500);
  const bars = () => p.evaluate(() => [...document.querySelectorAll('.fl-strip-bar')].filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  const b1 = await bars();
  check('hub mode: sound off shows the silent line first and says one more notice waits', b1.length === 1 && /Warnings are silent/.test(b1[0]) && /\(1 more notice\)/.test(b1[0]), b1);
  check('hub mode: the hub chip is visible with the notice', await p.evaluate(() => { const c = document.querySelector('.fl-hchip'); return !!c && c.offsetParent !== null; }));
  await p.click('.fl-bar-pause .fl-strip-x'); await p.waitForTimeout(1200);
  const b2 = await bars();
  check('hub mode: clearing the silent line lets the update line show', b2.length === 1 && /A new version is ready/.test(b2[0]), b2);
  await p.ctx.close();
}

// 4. Damaged saved data on a tablet that joins a hub: the board opens from the hub and the saved data is left alone
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.addInitScript("try { localStorage.setItem('smokebox.v1.state', '{\"damaged ticket data'); } catch (e) {}");
  await p.goto(hub.origin + '/?hub');
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await p.waitForFunction(() => SB.store.hubStatus && SB.store.hubStatus().state === 'connected', null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  const s = await p.evaluate(() => ({ board: !!document.querySelector('.fl-new, .fl'), held: /could not be read|kept safe|damaged/i.test(document.body.innerText) && !!document.querySelector('.sb-held, [data-held]'), kept: (localStorage.getItem('smokebox.v1.state') || '').indexOf('damaged ticket data') >= 0 }));
  check('joining a hub with damaged local data: the board opens', s.board && !s.held, s);
  check('the damaged local data is left on the device, not overwritten by the hub board', s.kept, s);
  await ctx.close();
}

// 5. Chef voice: the writing tablet speaks, a follower is silent unless its sound is on
{
  const w = await tablet(1024, 768, [STUB]);
  await w.evaluate(() => SB.floor.setSound(true));
  const fctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const f = await fctx.newPage();
  f.on('pageerror', (e) => errs.push(String(e)));
  await f.addInitScript(STUB);
  await f.goto(hub.origin + '/?follow');
  await f.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await f.evaluate(() => SB.floor.setWelcome && SB.floor.setWelcome(false));
  const mid = await w.evaluate(() => SB.store.getState().menu[0].id);
  await L.act('createTicket', { customer: 'Table 9', channel: 'dine_in', items: [{ menuId: mid, qty: 2 }], note: '', rush: true });
  const said = await until(() => w.evaluate(() => window.__said.length > 0), 8000);
  check('the writing tablet speaks the new ticket', said, await w.evaluate(() => window.__said));
  await sleep(1500);
  check('the follower stays silent by default', (await f.evaluate(() => window.__said)).length === 0, await f.evaluate(() => window.__said));
  await f.evaluate(() => SB.floor.setSound(true));
  await L.act('createTicket', { customer: 'Table 10', channel: 'dine_in', items: [{ menuId: mid, qty: 1 }], note: '', rush: true });
  const fsaid = await until(() => f.evaluate(() => window.__said.length > 0), 8000);
  check('the follower speaks once its own sound is on', fsaid, await f.evaluate(() => window.__said));
  await fctx.close(); await w.ctx.close();
}

check('no uncaught page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
await hub.stop();
console.log(fail ? fail + ' check(s) failed' : 'all checks passed');
process.exit(fail ? 1 : 0);
