// Several tabs of one browser creating tickets at once, each tab's clock set differently (hours behind or ahead): no ticket may be lost and
// ticket numbers stay unique. Random interleavings of creating, saving and message delivery; tabs are copies of the modules sharing one storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './_load.mjs';

const H = 3600e3;
const T0 = new Date(2026, 9, 20, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A small seeded random generator so a failing run can be repeated.
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
// A memory storage like the browser's.
function memStorage() {
  const m = new Map();
  return { persistent: true, m, get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } }, raw(k) { return m.has(k) ? m.get(k) : null; }, set(k, v) { m.set(k, JSON.stringify(v)); return true; }, remove(k) { m.delete(k); }, keys(p) { return [...m.keys()].filter((k) => !p || k.startsWith(p)); } };
}
// One tab: its own copy of the modules, its own clock (offset from the shared real time), and optionally the Web Locks the browser has.
function tab(clock, offset, locks) {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, BroadcastChannel: globalThis.BroadcastChannel };
  if (locks) ctx.navigator = { locks };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  return { S: ctx.SB.store, off: offset, clock };
}
// Runs one random scenario and returns the problems found.
async function scenario(seed, tabs, offsets, opts = {}) {
  const r = rng(seed), clock = { t: T0 }, storage = memStorage();
  let chain = Promise.resolve();
  const locks = opts.locks ? { request(name, fn) { const run = chain.then(() => fn()); chain = run.catch(() => {}); return run; } } : null;
  const ts = [];
  for (let i = 0; i < tabs; i++) {
    const t = tab(clock, offsets[i], locks);
    t.S.init({ now: () => clock.t + t.off, storage, noTimers: !opts.locks, mode: 'real', blank: true, starter: false });
    ts.push(t);
  }
  const problems = [];
  try {
    const dish = ts[0].S.dispatch('addMenuItem', { name: 'Dish', zone: 'pit', cat: 'meat', price: 5, prepSec: 60, track: 'one', prepGuess: false }) === 'ok' ? ts[0].S.lastResult().info.id : null;
    ts[0].S.flush(); await sleep(60);
    const made = [];
    const steps = opts.steps || 24;
    for (let i = 0; i < steps; i++) {
      const t = ts[Math.floor(r() * ts.length)];
      const roll = r();
      clock.t += 1000 + Math.floor(r() * 4000);
      if (roll < 0.6) {
        const name = 'c' + i;
        const rep = t.S.dispatch('createTicket', { customer: name, items: [{ menuId: dish }] });
        if (rep === 'ok') made.push(name); else problems.push('createTicket refused: ' + rep);
      } else if (roll < 0.85) t.S.flush();
      else await sleep(Math.floor(r() * 12));
    }
    for (let k = 0; k < 4; k++) { for (const t of ts) t.S.flush(); await sleep(60); }
    if (opts.locks) await sleep(900);
    for (let k = 0; k < 2; k++) { for (const t of ts) t.S.flush(); await sleep(60); }
    const want = made.slice().sort().join();
    ts.forEach((t, i) => {
      const got = t.S.getState().tickets.map((x) => x.customer).sort().join();
      if (got !== want) problems.push('tab ' + i + ' (offset ' + t.off / H + ' h) has ' + got.split(',').filter(Boolean).length + ' of ' + made.length + ' tickets');
      const nums = t.S.getState().tickets.map((x) => x.serviceDate + '#' + x.num);
      if (new Set(nums).size !== nums.length) problems.push('tab ' + i + ' has a repeated ticket number');
    });
    const saved = storage.get('smokebox.v1.state', null);
    const sc = saved ? saved.state.tickets.map((x) => x.customer).sort().join() : '';
    if (sc !== want) problems.push('the saved copy has ' + sc.split(',').filter(Boolean).length + ' of ' + made.length + ' tickets');
  } finally { for (const t of ts) t.S.destroy(); }
  return problems;
}
const skip = typeof globalThis.BroadcastChannel !== 'function';

for (const [name, offsets] of [['first tab 3 hours behind', [-3 * H, 0, 0]], ['first tab 3 hours ahead', [3 * H, 0, 0]], ['tabs 36 hours apart', [-36 * H, 0, 36 * H]], ['five tabs, mixed', [-3 * H, 3 * H, 0, -H, 30 * H]]]) {
  test('tabs with skewed clocks keep every ticket: ' + name, { skip }, async () => {
    const bad = [];
    for (let seed = 1; seed <= 12; seed++) {
      const p = await scenario(seed, offsets.length, offsets);
      if (p.length) bad.push('seed ' + seed + ': ' + p.slice(0, 3).join('; '));
    }
    assert.deepEqual(bad, []);
  });
}
test('with Web Locks and timers the tabs also keep every ticket (clock 3 hours behind)', { skip, timeout: 120e3 }, async () => {
  const bad = [];
  for (let seed = 1; seed <= 3; seed++) { const p = await scenario(seed, 3, [-3 * H, 0, 0], { locks: true, steps: 14 }); if (p.length) bad.push('seed ' + seed + ': ' + p.slice(0, 3).join('; ')); }
  assert.deepEqual(bad, []);
});

// ---- late reads: each tab sees what the others wrote only after a delay (a browser's storage is a copy per process) ----
// A storage backing shared by all tabs, with a view per tab whose reads are `lag` steps behind the writes. A step is one write by anyone.
function laggyBacking() {
  const hist = new Map();           // key -> list of { step, text }
  let step = 0;
  return {
    view(lag) {
      return {
        persistent: true,
        get(k, fb) { const h = hist.get(k); if (!h) return fb; let e = null; for (let i = h.length - 1; i >= 0; i--) if (h[i].step <= step - lag) { e = h[i]; break; } if (!e || e.text == null) return fb; try { return JSON.parse(e.text); } catch (x) { return fb; } },
        raw(k) { const h = hist.get(k); if (!h) return null; for (let i = h.length - 1; i >= 0; i--) if (h[i].step <= step - lag) return h[i].text; return null; },
        set(k, v) { step++; if (!hist.has(k)) hist.set(k, []); hist.get(k).push({ step, text: JSON.stringify(v) }); return true; },
        remove(k) { step++; if (!hist.has(k)) hist.set(k, []); hist.get(k).push({ step, text: null }); },
        keys() { return [...hist.keys()]; },
      };
    },
    latest(k) { const h = hist.get(k); return h && h.length ? JSON.parse(h[h.length - 1].text) : null; },
  };
}
// Three or more tabs create tickets and save in random order while reads are late: every ticket must survive in every tab and in the saved copy.
async function lagScenario(seed, tabs, lag, offsets) {
  const r = rng(seed), clock = { t: T0 }, backing = laggyBacking();
  const ts = [];
  for (let i = 0; i < tabs; i++) {
    const t = tab(clock, offsets[i % offsets.length], null);
    t.S.init({ now: () => clock.t + t.off, storage: backing.view(i === 0 ? 0 : lag), noTimers: true, mode: 'real', blank: true, starter: false });
    ts.push(t);
  }
  const problems = [], who = {};
  try {
    const dish = ts[0].S.dispatch('addMenuItem', { name: 'Dish', zone: 'pit', cat: 'meat', price: 5, prepSec: 60, track: 'one', prepGuess: false }) === 'ok' ? ts[0].S.lastResult().info.id : null;
    ts[0].S.flush(); await sleep(60);
    for (const t of ts) { t.S.flush(); }
    await sleep(40);
    const made = [];
    for (let i = 0; i < 20; i++) {
      const t = ts[Math.floor(r() * ts.length)];
      clock.t += 500 + Math.floor(r() * 3000);
      if (r() < 0.55) { const name = 'c' + i; if (t.S.dispatch('createTicket', { customer: name, items: [{ menuId: dish }] }) === 'ok') { made.push(name); who[name] = ts.indexOf(t); } }
      else if (r() < 0.8) t.S.flush();
      else await sleep(Math.floor(r() * 10));
    }
    // reads catch up while tabs keep checking their own actions are in the saved copy
    for (let k = 0; k < 6; k++) { for (const t of ts) { t.S.flush(); t.S.reconcile(); } await sleep(50); }
    const want = made.slice().sort().join();
    ts.forEach((t, i) => { const got = t.S.getState().tickets.map((x) => x.customer).sort().join(); if (got !== want) problems.push('tab ' + i + ' has ' + got.split(',').filter(Boolean).length + ' of ' + made.length + '; missing ' + made.filter((n) => got.split(',').indexOf(n) < 0).map((n) => n + ' (tab ' + who[n] + ')').join(' ')); });
    const saved = backing.latest('smokebox.v1.state');
    if (saved.state.tickets.map((x) => x.customer).sort().join() !== want) problems.push('the saved copy has ' + saved.state.tickets.length + ' of ' + made.length);
    for (const t of ts) { const nums = t.S.getState().tickets.map((x) => x.serviceDate + '#' + x.num); if (new Set(nums).size !== nums.length) problems.push('a repeated ticket number'); }
  } finally { for (const t of ts) t.S.destroy(); }
  return problems;
}
for (const [name, tabs, lag, offsets] of [['3 tabs, reads 2 writes late', 3, 2, [0]], ['3 tabs, reads 3 writes late, first tab 3 hours behind', 3, 3, [-3 * H, 0, 0]], ['5 tabs, reads 4 writes late, clocks 36 hours apart', 5, 4, [-36 * H, 36 * H, 0, 3 * H, -3 * H]]]) {
  test('late storage reads lose no ticket: ' + name, { skip }, async () => {
    const bad = [];
    for (let seed = 1; seed <= 25; seed++) { const p = await lagScenario(seed, tabs, lag, offsets); if (p.length) bad.push('seed ' + seed + ': ' + p.slice(0, 2).join('; ')); }
    assert.deepEqual(bad, []);
  });
}
