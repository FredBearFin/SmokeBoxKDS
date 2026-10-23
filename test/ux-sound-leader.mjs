// Two tabs of the board open on one device: only one makes sound. Run: node test/ux-sound-leader.mjs (browser test, about 1 minute).
// Variant 'lossy' drops the leader's "I played it" messages (as if it died right after playing): the new leader plays once what it held back.
// Both tabs share one browser context (so one BroadcastChannel and one Web Locks scope), use a fake clock, and count the notes
// and spoken phrases a stub audio engine would play. NOT TESTED here: a crash or force-kill of the leader (the page is closed
// normally), Safari and iPad, and real audio.
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
const MIN = 60e3, H = 3600e3;
const T0 = new Date(2026, 9, 19, 11, 0, 0).getTime();

// Counting stand-ins for the audio engine and the speech engine, installed before the app loads.
const stubScript = () => {
  window.__notes = []; window.__said = [];
  class FakeCtx { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { const o = { type: '', frequency: { value: 0 }, connect() {}, start() { window.__notes.push(o.frequency.value); }, stop() {} }; return o; } }
  window.AudioContext = FakeCtx; window.webkitAudioContext = FakeCtx;
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, speak(u) { window.__said.push(u.text); } }, configurable: true });
};

async function scenario(lossy) {
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const errors = [];
const open = async (first, atMs) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  await page.addInitScript(stubScript);
  if (first) await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* blocked */ } });
  await page.clock.install({ time: atMs - 120000 });
  await page.goto(pathToFileURL(DIST).href);
  await page.waitForTimeout(1200);
  await page.clock.pauseAt(atMs);
  await page.clock.runFor(1500);
  return page;
};
const A = await open(true, T0 - 10 * MIN);
// In the lossy run the leader's "I played it" messages are dropped, as if it died right after playing: a follower must then replay once on promotion.
if (lossy) await A.evaluate(() => { const real = SB.store.broadcast; SB.store.broadcast = (m) => (m && m.type === 'alert-played' ? true : real(m)); });
await A.evaluate(() => {
  SB.floor.setWelcome(false); SB.sim.live.crew(false);
  SB.store.dispatchEx('resetLive', { keepSettings: true }, { source: 'ui' });
  SB.store.dispatchEx('updateSettings', { patch: { service: { openHour: 11, closeHour: 21, soundStartHour: 11 } } }, { source: 'ui' });
  for (const b of SB.store.getState().batches.slice()) SB.store.dispatchEx('discardBatch', { batchId: b.id, reason: 'manual' }, { source: 'ui' });
});
await A.clock.runFor(10 * MIN);
await A.evaluate(() => { SB.store.dispatchEx('addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, { source: 'ui' }); SB.floor.setSound(true); SB.store.flush(); });
const nowA = await A.evaluate(() => Date.now());
const B = await open(false, nowA);
await B.evaluate(() => { SB.floor.setWelcome(false); SB.floor.setSound(true); });
const both = async (ms) => { await A.clock.runFor(ms); await B.clock.runFor(ms); };
await both(3000);
await A.waitForTimeout(300);
const who = async () => ({ a: (await A.evaluate(() => SB.floor.leader())).leader, b: (await B.evaluate(() => SB.floor.leader())).leader });
const l1 = await who();
console.log('leaders:', JSON.stringify(l1));
assert.equal(+l1.a + +l1.b, 1, 'exactly one tab leads');
const lead = l1.a ? A : B, other = l1.a ? B : A;
const count = (p) => p.evaluate(() => ({ alarm: window.__notes.filter((f) => f === 880).length, expiry: window.__notes.filter((f) => f === 660).length, said: window.__said.length }));
const base = { lead: await count(lead), other: await count(other) };
// The ribs batch is a few minutes old (4 hour limit; warnings at 90, 45, 20 and 10 minutes before it).
// Run the app clock at 30x until the batch is 25 minutes from its limit, then at normal speed so every later rung is crossed by a tick.
const msLeft = (p) => p.evaluate(() => { const b = SB.store.getState().batches[0]; return Math.round((b.enteredAt + 4 * 3600e3 - SB.store.now()) / 60000); });
await A.evaluate(() => SB.store.setSpeed(30)); await B.evaluate(() => SB.store.setSpeed(30));
while ((await msLeft(lead)) > 25) await both(30e3);
await A.evaluate(() => SB.store.setSpeed(1)); await B.evaluate(() => SB.store.setSpeed(1));
console.log('now', await msLeft(lead), 'minutes before the limit');
for (const ms of [10 * MIN, 10 * MIN, 4 * MIN]) await both(ms);
const c1 = { lead: await count(lead), other: await count(other) };
console.log('after the rungs, leader:', JSON.stringify(c1.lead), 'follower:', JSON.stringify(c1.other));
assert.ok(c1.lead.alarm > base.lead.alarm, 'the leader played the loud tone');
assert.equal(c1.other.alarm, base.other.alarm, 'the follower played no loud tone');
assert.equal(c1.other.said, base.other.said, 'the follower said nothing');
assert.ok(c1.lead.said > base.lead.said, 'the leader spoke');
// The leader tab goes away: the other tab takes over.
await lead.close();
await other.waitForFunction(() => SB.floor.leader().leader, null, { timeout: 8000 });
const c2 = await count(other);
await other.clock.runFor(60e3);
const c3 = await count(other);
console.log(lossy ? 'lossy run, after promotion:' : 'after the leader closed, new leader:', JSON.stringify(c3));
if (lossy) assert.equal(c3.expiry + c3.said > 0, true, 'the sound the leader may not have played is played once by the new leader');
else { assert.deepEqual(c3, c2, 'nothing already played is played again'); assert.equal(c2.alarm + c2.expiry + c2.said, 0, 'and the new leader made no sound of its own for it'); }
assert.equal(errors.length, 0, errors.join('\n'));
await browser.close();
}
// Each variant runs in its own process (two browsers one after the other in one process misbehaved).
const only = process.argv[2];
if (only === 'plain') await scenario(false);
else if (only === 'lossy') await scenario(true);
else {
  const { spawnSync } = await import('node:child_process');
  for (const v of ['plain', 'lossy']) { const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), v], { stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1); }
  console.log('ok: both variants passed');
}
