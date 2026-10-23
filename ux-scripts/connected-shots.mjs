// Takes the final screenshots of the connected states (follower at 1920 TV and 390, the hub chip states on a writing tablet, the
// "Is this tablet ready" offline card) against a real hub, in headless Chromium. Run: SHOT_DIR=docs/ux-shots/final node ux-scripts/connected-shots.mjs
import { toolRequire } from '../tools/_deps.mjs';
import { startHub, httpLeader, sleep } from '../test/_connected.mjs';
import fs from 'node:fs';

const { chromium } = toolRequire('playwright');
const OUT = process.env.SHOT_DIR || 'docs/ux-shots/final';
fs.mkdirSync(OUT, { recursive: true });
const hub = await startHub({ starter: true });
const L = httpLeader(hub.origin);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const shot = async (p, name) => { await p.screenshot({ path: OUT + '/' + name }); console.log('shot', name); };
// Opens a page of the hub (a follower with ?follow, a writing tablet with ?hub, or a plain page) and waits for the board.
async function page(w, h, q, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage(); p.ctx = ctx;
  if (theme) await p.addInitScript(`try { localStorage.setItem('smokebox.v1.theme', JSON.stringify('${theme}')); } catch (e) {}`);
  await p.goto(hub.origin + '/' + q);
  await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 });
  await p.evaluate(() => SB.floor.setWelcome && SB.floor.setWelcome(false));
  return p;
}
const first = await (await browser.newContext()).newPage();
await first.goto(hub.origin + '/?follow'); await first.waitForFunction(() => window.SB && SB.booted === true);
const menu = await first.evaluate(() => SB.store.getState().menu.map((m) => m.id));
await first.context().close();
const people = ['Table 4', 'Pickup: Dana', 'Table 9', 'Delivery: Sam', 'Table 2', 'Bar 3'];
for (let i = 0; i < people.length; i++) await L.act('createTicket', { customer: people[i], channel: i % 3 === 1 ? 'takeout' : 'dine_in', items: [{ menuId: menu[i % menu.length], qty: 1 + (i % 2) }, { menuId: menu[(i + 2) % menu.length], qty: 1 }], note: '', rush: i === 2 });
await sleep(1500);
for (const [w, h, name] of [[1920, 1080, '10-follower-tv-1920.png'], [390, 844, '11-follower-390.png']]) {
  const p = await page(w, h, '?follow'); await p.waitForTimeout(2500); await shot(p, name); await p.ctx.close();
}
const wd = await page(390, 844, '?hub'); await wd.waitForFunction(() => SB.store.hubStatus().state === 'connected'); await wd.waitForTimeout(1500);
await shot(wd, '12-hub-chip-connected-390.png');
const wn = await page(390, 844, '?hub', 'night'); await wn.waitForFunction(() => SB.store.hubStatus().state === 'connected'); await wn.waitForTimeout(1500);
await shot(wn, '12-hub-chip-connected-night-390.png');
await wd.evaluate(() => { const m = SB.store.getState().menu[0].id; SB.store.dispatch('createTicket', { customer: 'Walk-up', channel: 'takeout', items: [{ menuId: m, qty: 1 }], note: '', rush: false }); });
await hub.stop('SIGKILL');
await wd.waitForFunction(() => SB.store.hubStatus().state !== 'connected', null, { timeout: 30000 }).catch(() => {});
await wd.evaluate(() => { const m = SB.store.getState().menu[1].id; SB.store.dispatch('createTicket', { customer: 'Second', channel: 'takeout', items: [{ menuId: m, qty: 1 }], note: '', rush: false }); });
await wd.waitForTimeout(3000); await shot(wd, '13-hub-chip-offline-waiting-390.png');
await wn.waitForTimeout(1000); await shot(wn, '13-hub-chip-offline-night-390.png');
await hub.restart();
await wd.waitForFunction(() => SB.store.hubStatus().state === 'connected', null, { timeout: 40000 }).catch(() => {});
await wd.waitForTimeout(2500); await shot(wd, '14-hub-chip-back-and-sent-390.png');
for (const [w, h, name] of [[390, 844, '15-offline-card-390.png'], [1024, 768, '15-offline-card-1024.png']]) {
  const p = await page(w, h, ''); await p.evaluate(() => SB.sheets.open('ready')); await p.waitForTimeout(2500);
  await p.evaluate(() => { const b = document.querySelector('[data-act="offline-check"]'); if (b) b.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(500);
  await shot(p, name); await p.ctx.close();
}
await browser.close(); await hub.stop();
