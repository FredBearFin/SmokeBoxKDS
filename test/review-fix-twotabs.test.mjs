// Independent-review follow-up: two tabs of one browser saving at the same moment must not overwrite each other.
// Tab B writes its save in the middle of tab A's save; both tabs' tickets must survive. Two stores in their own VM contexts share one storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './_load.mjs';

const T0 = new Date(2026, 9, 20, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A memory storage like the app's, with an optional hook that runs before a write of a given key.
function memStorage() {
  const m = new Map();
  const st = {
    persistent: true, m, hooks: {},
    get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } },
    raw(k) { return m.has(k) ? m.get(k) : null; },
    set(k, v) { const h = st.hooks[k]; if (h) { delete st.hooks[k]; h(); } m.set(k, JSON.stringify(v)); return true; },
    remove(k) { m.delete(k); },
    keys(prefix) { return [...m.keys()].filter((k) => !prefix || k.startsWith(prefix)); },
  };
  return st;
}
// A second copy of the modules in its own VM context (one browser tab), optionally with a fake Web Locks manager.
function tab(locks) {
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, BroadcastChannel: globalThis.BroadcastChannel };
  if (locks) ctx.navigator = { locks };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  return ctx.SB.store;
}
const nums = (s) => s.getState().tickets.map((t) => t.num).sort().join();

test('two tabs #2: tab B saves in the middle of tab A\'s save (no Web Locks): A notices, builds on B\'s copy, nothing is lost', async (t) => {
  if (typeof globalThis.BroadcastChannel !== 'function') return;
  const storage = memStorage();
  let real = T0;
  const A = tab(), B = tab();
  t.after(() => { B.destroy(); A.destroy(); });
  A.init({ now: () => real, storage, noTimers: true, starter: true });
  B.init({ now: () => real, storage, noTimers: true, starter: true });
  real += 1000; assert.equal(A.dispatch('createTicket', { items: [{ menuId: 'tea' }] }), 'ok');
  real += 1000; assert.equal(B.dispatch('createTicket', { items: [{ menuId: 'mac' }] }), 'ok');
  // the moment A claims the write, B's whole save lands
  storage.hooks['smokebox.v1.writer'] = () => { B.flush(); delete storage.hooks['smokebox.v1.writer']; };
  A.flush();
  await sleep(80);
  const saved = storage.get(A.KEY).state.tickets;
  assert.equal(saved.length, 2, 'the saved copy has both tickets');
  assert.equal(new Set(saved.map((t) => t.num)).size, 2);
  A.flush(); B.flush(); await sleep(80);
  assert.equal(nums(A), nums(B));
  assert.equal(A.getState().tickets.length, 2);
});

test('two tabs #2: with Web Locks, timed saves take the lock and both tabs\' tickets survive', async (t) => {
  if (typeof globalThis.BroadcastChannel !== 'function') return;
  const storage = memStorage();
  const asked = [];
  let chain = Promise.resolve();
  // A fake lock manager: one holder at a time, in the order asked.
  const locks = { request(name, fn) { asked.push(name); const run = chain.then(() => fn()); chain = run.catch(() => {}); return run; } };
  const A = tab(locks), B = tab(locks);
  t.after(() => { B.destroy(); A.destroy(); });
  A.init({ storage, starter: true });
  B.init({ storage, starter: true });
  assert.equal(A.dispatch('createTicket', { items: [{ menuId: 'tea' }] }), 'ok');
  assert.equal(B.dispatch('createTicket', { items: [{ menuId: 'mac' }] }), 'ok');
  await sleep(1500);
  assert.ok(asked.length >= 2 && asked.every((n) => n === 'smokebox-save-lock'), 'timed saves asked for the lock');
  assert.equal(storage.get(A.KEY).state.tickets.length, 2);
  assert.equal(nums(A), nums(B));
});
