// Hidden-and-restored board test: a batch walks its warning ladder while the page is marked hidden, then comes back.
// Run: node test/ux-hidden-restore.mjs      (browser test, about 20 seconds; not part of tools/test.mjs)
// WHAT THIS PROVES: the catch-up logic. With Playwright's clock.runFor the 1-second ticks run, so each rung sounds once when
// it is crossed and nothing sounds twice. With clock.fastForward the ticks do not run, so one catch-up tick sees only the rung
// the batch is on now and plays that one sound (the earlier rungs are not replayed).
// WHAT IT DOES NOT PROVE: real tablet behavior. A hidden page gets throttled timers (about one a second, and about one a minute
// after some minutes hidden), a locked screen runs no JavaScript at all, and real audio is not played (a stub counts notes).
import { toolRequire } from '../tools/_deps.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = toolRequire('playwright');
const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist/smokebox.html');
const MIN = 60e3, H = 3600e3;
const T0 = new Date(2026, 9, 19, 11, 0, 0).getTime();

// Replaces the audio and speech engines with counters before the app loads.
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

// One run: opens the board with a fresh ribs batch at 11:00, marks the page hidden, moves time with `how`, restores it. Returns what sounded.
async function run(how) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  await page.addInitScript(stubScript);
  await page.addInitScript(() => { let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; try { localStorage.clear(); } catch (e) { /* blocked */ } });
  await page.clock.install({ time: T0 - H });
  await page.goto(pathToFileURL(DIST).href);
  await page.waitForTimeout(1500);
  await page.clock.pauseAt(T0 - 10 * MIN);
  await page.clock.runFor(2000);
  await page.evaluate(() => {
    SB.floor.setWelcome(false); SB.sim.live.crew(false);
    SB.store.dispatchEx('resetLive', { keepSettings: true }, { source: 'ui' });
    SB.store.dispatchEx('updateSettings', { patch: { service: { openHour: 11, closeHour: 21, soundStartHour: 11 } } }, { source: 'ui' });
    for (const b of SB.store.getState().batches.slice()) SB.store.dispatchEx('discardBatch', { batchId: b.id, reason: 'manual' }, { source: 'ui' });
    SB.floor.setSound(true); SB.floor.setSpeech(true);
  });
  await page.clock.runFor(10 * MIN);
  await page.evaluate(() => { SB.floor._alerts = []; window.__notes.length = 0; window.__said.length = 0; SB.store.dispatchEx('addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, { source: 'ui' }); });
  await page.clock.runFor(30 * MIN);
  const setHidden = (v) => page.evaluate((hv) => { Object.defineProperty(document, 'hidden', { value: hv, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: hv ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  await setHidden(true);
  // The ribs batch (4 h limit, ladder 90, 45, 20 and 10 minutes) is 30 minutes old. Go to 10 minutes before its limit.
  const gap = 3 * H + 20 * MIN - 0;
  if (how === 'runFor') await page.clock.runFor(gap); else await page.clock.fastForward(gap);
  const beforeRestore = await page.evaluate(() => ({ alerts: SB.floor._alerts.slice(), notes: window.__notes.length }));
  await setHidden(false);
  await page.clock.runFor(2000);
  // Then past the limit.
  await page.clock.runFor(11 * MIN);
  const after = await page.evaluate(() => ({ alerts: SB.floor._alerts.slice(), notes: window.__notes.slice(), said: window.__said.slice() }));
  await browser.close();
  return { beforeRestore, after, errors };
}

// What the board plays: calls made in the same tick are one sound (the strongest), so group the first sounds by moment.
const firsts = (alerts) => { const by = new Map(); for (const a of alerts) if (!a.repeat) by.set(a.t, Math.max(by.get(a.t) || 0, a.level)); return [...by.entries()].sort((x, y) => x[0] - y[0]).map((x) => x[1]); };
const sum = (r) => ({ first: firsts(r.after.alerts), repeats: r.after.alerts.filter((a) => a.repeat).length, said: r.after.said.length, expiryTones: r.after.notes.filter((f) => f === 660).length });

const a = await run('runFor');
console.log('runFor      :', JSON.stringify(sum(a)));
// Ticks ran: no pace is known (nothing pulled), so the 90-minute rung is silent; 45 and 20 minutes speak (level 2), 10 minutes is the loud tone (3), the limit is the past sound (4).
assert.deepEqual(firsts(a.after.alerts), [2, 2, 3, 4], 'one sound per rung crossed, in order, none twice');
assert.equal(new Set(a.after.alerts.filter((x) => !x.repeat).map((x) => x.id + '|' + x.rung)).size, a.after.alerts.filter((x) => !x.repeat).length, 'no row sounded twice');
assert.equal(a.after.notes.filter((f) => f === 660).length, 1, 'the expiry tone played once');
assert.ok(a.after.alerts.every((x) => x.kind === 'expiry' || x.kind === 'past'));
assert.equal(a.errors.length, 0);

const b = await run('fastForward');
console.log('fastForward :', JSON.stringify(sum(b)));
// Ticks did not run during the jump: when the tab wakes it sees the batch on its last rung and plays that one sound, then the limit.
assert.deepEqual(firsts(b.beforeRestore.alerts), [3], 'one catch-up sound for the rung the batch is on, nothing replayed');
assert.deepEqual(firsts(b.after.alerts), [3, 4], 'then the past sound at the limit');
assert.equal(b.after.notes.filter((f) => f === 660).length, 1, 'the expiry tone played once');
assert.equal(b.errors.length, 0);
console.log('ok: hidden and restored board sounds once per rung (runFor) or once for the current rung (fastForward)');
