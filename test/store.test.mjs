// Store tests: fake clock + memory storage injection, dispatch/report instrumentation, coalesced notify, ticker, virtual clock
// (never backwards), debounced persistence + flush, corrupt-storage recovery, quota trimming, export/import/CSV, dataset with
// a lazily attached sim, selectors, and two "tabs" sharing storage through a real BroadcastChannel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadSB, ROOT } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E } = SB;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function memStorage(limitChars = Infinity) {
  const m = new Map();
  return {
    persistent: true, m, writes: 0,
    get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } },
    set(k, v) { const raw = JSON.stringify(v); if (raw.length > limitChars) return false; m.set(k, raw); this.writes++; return true; },
    remove(k) { m.delete(k); },
  };
}
function boot(opts = {}) {
  const clock = { real: opts.real ?? T0 };
  const storage = opts.storage || memStorage();
  const st = S.init({ now: () => clock.real, storage, noTimers: true, noSync: true });
  return { clock, storage, st };
}

test('init: fresh state, first run, fake clock, dispatch and lastResult', () => {
  const { st } = boot();
  assert.equal(st.firstRun, true);
  assert.equal(S.now(), T0);
  assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
  assert.equal(S.dispatch('createTicket', { customer: 'Table 4', items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }] }), 'ok');
  assert.equal(S.lastResult().info.num, 101);
  assert.equal(S.getState().tickets.length, 1);
  S.destroy();
});

test('ui_report instrumentation: refused user actions are recorded, sim actions and nothingToDo are not', () => {
  boot();
  const n0 = E.allEvents(S.getState()).length;
  assert.equal(S.dispatch('createTicket', { items: [] }), 'emptyOrder');
  let ev = E.allEvents(S.getState());
  assert.equal(ev.length, n0 + 1);
  assert.deepEqual([ev.at(-1).type, ev.at(-1).action, ev.at(-1).report], ['ui_report', 'createTicket', 'emptyOrder']);
  assert.equal(S.dispatch('createTicket', { items: [] }, { source: 'sim' }), 'emptyOrder');
  assert.equal(S.dispatch('updateSettings', { patch: { pacing: { enabled: true } } }), 'nothingToDo');
  assert.equal(S.dispatch({ evil: 1 }, {}), 'unknownAction');
  ev = E.allEvents(S.getState());
  assert.equal(ev.length, n0 + 2);
  assert.equal(ev.at(-1).report, 'unknownAction');
  S.destroy();
});

test('subscribe is coalesced; subscribeTick gets now every tick; ticker fires due items', async () => {
  const { clock } = boot();
  let calls = 0, seen = null, ticks = [];
  const off = S.subscribe((s) => { calls++; seen = s; });
  S.subscribeTick((n) => ticks.push(n));
  S.dispatch('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }] });
  S.dispatch('createTicket', { items: [{ menuId: 'tea' }] });
  assert.equal(calls, 0);
  await sleep(30);
  assert.equal(calls, 1, 'two dispatches, one notification');
  assert.equal(seen, S.getState());
  clock.real = T0 + 90 * 1000; // slaw (offset 90 s) is due
  S.tick();
  assert.deepEqual(ticks, [T0 + 90000]);
  assert.equal(S.getState().tickets[0].items[1].status, 'displayed');
  S.flushNotify();
  assert.equal(calls, 2);
  off();
  S.dispatch('createTicket', { items: [{ menuId: 'tea' }] });
  S.flushNotify();
  assert.equal(calls, 2, 'unsubscribed');
  S.destroy();
});

test('virtual clock: setSpeed rebases without a jump and never goes backwards (I9)', () => {
  const { clock } = boot();
  assert.equal(S.setSpeed(5), true);
  clock.real += 1000;
  assert.equal(S.now(), T0 + 5000);
  assert.equal(S.setSpeed(1), true);
  assert.equal(S.now(), T0 + 5000);
  clock.real += 1000;
  assert.equal(S.now(), T0 + 6000);
  for (const bad of [NaN, 0, -1, 1e9, '5', undefined]) assert.equal(S.setSpeed(bad), false);
  clock.real -= 60000; // the device clock jumps back
  assert.equal(S.now(), T0 + 6000);
  let last = -Infinity;
  for (let i = 0; i < 500; i++) {
    clock.real += Math.round((Math.random() - 0.3) * 4000);
    if (i % 50 === 0) S.setSpeed([1, 5, 15, 30][i % 4]);
    const n = S.now();
    assert.ok(n >= last);
    last = n;
  }
  S.destroy();
});

test('persistence: debounced 400 ms write, flush, reload restores state and continues the clock at x1', async () => {
  const storage = memStorage();
  const { clock } = boot({ storage });
  await sleep(450);
  const w0 = storage.writes;
  S.setSpeed(30);
  clock.real += 2000; // 60 s of virtual time
  S.dispatch('createTicket', { items: [{ menuId: 'tea' }] });
  S.dispatch('createTicket', { items: [{ menuId: 'mac' }] });
  assert.equal(storage.writes, w0, 'not written yet');
  await sleep(450);
  assert.equal(storage.writes, w0 + 2, 'one coalesced save: the state and its small save marker');
  const saved = storage.get(S.KEY);
  assert.equal(saved.v, 1);
  assert.equal(saved.state.tickets.length, 2);
  assert.equal(saved.clock.virtual, T0 + 60000);
  const rev = S.getState().rev;
  S.flush();
  S.destroy();
  // reload 10 s later: same state, speed back to 1, virtual time continues from where it was (ahead of real time)
  clock.real += 10000;
  const st = S.init({ now: () => clock.real, storage, noTimers: true, noSync: true });
  assert.equal(st.firstRun, false);
  assert.equal(S.speed(), 1);
  assert.equal(S.getState().rev, rev);
  assert.equal(S.getState().tickets.length, 2);
  assert.equal(S.now(), T0 + 60000 + 10000);
  S.destroy();
});

test('a pristine first run is not written; the first change is', async () => {
  const storage = memStorage();
  boot({ storage });
  await sleep(450);
  assert.equal(storage.m.has(S.KEY), false, 'nothing happened yet: storage stays empty (a cleared store is not resurrected)');
  S.dispatch('sanitizeDone', {});
  await sleep(450);
  assert.equal(storage.m.has(S.KEY), true);
  S.destroy();
});

test('corrupt storage is kept aside and the app starts fresh', async () => {
  const storage = memStorage();
  storage.m.set('smokebox.v1.state', JSON.stringify({ v: 1, state: { v: 1, tickets: 'nope' } }));
  const { st } = boot({ storage });
  assert.ok(st.corrupt && st.corrupt.includes('tickets'));
  assert.ok(storage.m.has(S.CORRUPT_KEY));
  assert.equal(S.getState().tickets.length, 0);
  assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
  await sleep(450);
  assert.equal(E.validateBackup(storage.get(S.KEY)).ok, true, 'the corrupt payload is replaced by the fresh state');
  S.destroy();
  const s2 = memStorage();
  s2.m.set('smokebox.v1.state', '{not json');
  assert.equal(boot({ storage: s2 }).st.firstRun, true); // unreadable -> treated as no state, never throws
  S.destroy();
});

test('storage quota: the persisted copy is trimmed rather than lost', () => {
  const storage = memStorage(120000); // a tiny quota: the full state is ~245 KB
  boot({ storage });
  for (let i = 0; i < 400; i++) {
    S.dispatch('createTicket', { rush: true, items: [{ menuId: 'tea' }, { menuId: 'slaw' }] });
    const t = S.getState().tickets.at(-1);
    S.dispatch('completeItem', { ticketId: t.id, itemId: t.items[0].id });
    S.dispatch('completeItem', { ticketId: t.id, itemId: t.items[1].id });
    S.dispatch('bumpTicket', { ticketId: t.id });
  }
  assert.equal(S.flush(), true);
  assert.equal(S.status().trimmed, true);
  const saved = storage.get(S.KEY);
  const full = S.getState();
  assert.ok(saved.state.tickets.length < full.tickets.length);
  assert.equal(E.validateBackup(saved).ok, true); // the trimmed copy is still a valid, balanced state (I2)
  assert.deepEqual(E.checkInvariants(E.validateBackup(saved).state), []);
  assert.ok(JSON.stringify(full).length > 120000, 'memory keeps everything');
  S.destroy();
});

test('export / import / CSV', () => {
  boot();
  S.dispatch('createTicket', { customer: '=HYPERLINK("x")', note: 'Peanut, "severe"', items: [{ menuId: 'tea', qty: 2 }, { menuId: 'mac' }] });
  const text = S.exportAll();
  assert.equal(typeof text, 'string');
  assert.equal(S.lastResult().report, 'ok');
  const rev = S.getState().rev;
  assert.equal(S.importAll('garbage'), 'invalidBackup');
  assert.equal(S.getState().rev, rev, 'refusal changes nothing');
  assert.equal(S.importAll(42), 'invalidBackup');
  assert.equal(S.importAll('x'.repeat(20e6 + 1)), 'exportTooLarge');
  S.dispatch('createTicket', { items: [{ menuId: 'tea' }] });
  assert.equal(S.getState().tickets.length, 2);
  assert.equal(S.importAll(text), 'ok');
  assert.equal(S.getState().tickets.length, 1);
  assert.ok(S.getState().rev > rev, 'import bumps rev so other tabs reload');
  const csv = S.exportCsv('tickets').trim().split('\n');
  assert.equal(csv.length, 2);
  assert.ok(csv[0].startsWith('id,num,serviceDate,customer'));
  assert.ok(csv[1].includes(`"'=HYPERLINK(""x"")"`), csv[1]);
  assert.ok(csv[1].includes('"Peanut, ""severe"""'));
  assert.equal(S.exportCsv('items').trim().split('\n').length, 3);
  assert.ok(S.exportCsv('events').split('\n')[0].startsWith('id,t,time,type'));
  assert.ok(S.exportCsv('batches').split('\n').length > 10);
  assert.equal(S.exportCsv('nope'), '');
  S.destroy();
});

test('orders: the dataset carries live orders after sample ones, and the orders CSV has one row per order with paid amounts', () => {
  boot();
  S.dispatch('updateSettings', { patch: { service: { taxRatePct: 10 } } });
  S.dispatch('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: 'brisket_half', qty: 2 }] });
  const oid = S.lastResult().info.orderId;
  S.dispatch('createTicket', { orderId: oid, items: [{ menuId: 'slaw' }] });
  S.dispatch('createTicket', { customer: 'Bar', items: [{ menuId: 'tea' }] });
  const bar = S.lastResult().info.orderId;
  assert.equal(S.dispatch('payOrder', { orderId: oid, method: 'card', tip: 3, discount: 1 }), 'ok');
  const csv = S.exportCsv('orders').trim().split('\n');
  assert.equal(csv.length, 3);
  assert.ok(csv[0].startsWith('id,serviceDate,customer,channel,src,status,rounds'));
  const paid = csv.find((l) => l.startsWith(oid + ','));
  const food = E.orderTotals(S.getState(), S.getState().orders.find((o) => o.id === oid));
  assert.ok(paid.includes(',paid,2,') && paid.includes(',card,'), paid);
  assert.equal(food.discount, 1);
  assert.ok(paid.includes(',' + food.total + ',') || paid.endsWith(',' + food.total + ','), paid);
  assert.ok(csv.find((l) => l.startsWith(bar + ',')).includes(',open,1,'));
  // the dataset hands the pages the live orders, and sample orders (when a sim is attached) come first
  assert.deepEqual(S.dataset().orders.map((o) => o.id), [oid, bar]);
  const sampleOrder = { id: 'so_1', status: 'paid', createdAt: T0 - 86400e3, paidAt: T0 - 86000e3, channel: 'dine_in', method: 'cash', tip: 0, totals: { subtotal: 5, discount: 0, tax: 0, total: 5 } };
  S.attachSim({ sample: () => ({ tickets: [], events: [], batches: [], orders: [sampleOrder] }) });
  assert.deepEqual(S.dataset({ sample: true }).orders.map((o) => o.id), ['so_1', oid, bar]);
  assert.equal(S.exportCsv('orders').trim().split('\n').length, 3, 'the CSV is the real till, never the sample');
  S.destroy();
});

test('dataset: live only, or live + lazily pulled sample history', () => {
  boot();
  S.attachSim(null);
  S.dispatch('createTicket', { items: [{ menuId: 'tea' }] });
  let ds = S.dataset();
  assert.deepEqual([ds.tickets.length, ds.hasSample, ds.counts.live], [1, false, 1]);
  assert.equal(S.dataset({ sample: true }).hasSample, false, 'no sim attached: live only, no crash');
  let calls = 0;
  const sampleTicket = Object.assign({}, S.getState().tickets[0], { id: 's_1', src: 'sample', createdAt: T0 - 86400e3 });
  const sample = { tickets: [sampleTicket], events: [{ id: 'sev_1', t: T0 - 86400e3, type: 'ticket_created' }], batches: [] };
  S.attachSim({ sample: () => { calls++; return sample; } }); // SB.sim.sample() is memoised (SPEC 11): same object every call
  ds = S.dataset({ sample: true });
  assert.deepEqual([ds.tickets.length, ds.events[0].id, ds.hasSample, ds.counts.sample, ds.range.from], [2, 'sev_1', true, 1, T0 - 86400e3]);
  assert.equal(S.dataset({ sample: true }), S.dataset({ sample: true }), 'memoised per state');
  assert.equal(S.dataset(), S.dataset());
  const c0 = calls;
  S.dataset();
  assert.equal(calls, c0, 'live-only datasets never pull the sample');
  S.attachSim({ sample: () => { throw new Error('boom'); } });
  assert.equal(S.dataset({ sample: true }).hasSample, false);
  S.attachSim(null);
  S.destroy();
});

test('selectors are memoised per state and follow the SPEC shapes', () => {
  boot();
  S.dispatch('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }, { menuId: 'mac' }] });
  const a = S.select.ticketsForZone('pit');
  assert.equal(a, S.select.ticketsForZone('pit'));
  assert.deepEqual([a.length, a[0].items.length, a[0].onDeck], [1, 0, 1]); // brisket on deck at the pit
  assert.equal(S.select.ticketsForZone('sides')[0].items[0].menuId, 'mac');
  assert.equal(S.select.activeTickets().length, 1);
  assert.equal(S.select.allDay()[0].menuId, 'brisket_half');
  assert.equal(S.select.availability('mac').ok, true);
  S.dispatch('toggle86', { menuId: 'mac', on: true });
  assert.deepEqual(S.select.unavailable().map((x) => [x.menuId, x.reason]), [['mac', 'manual']]);
  assert.equal(S.select.counts().out86, 1);
  assert.equal(S.select.batches().length, 10);
  assert.equal(S.select.timing(S.getState().tickets[0]).level, 'ok');
  S.destroy();
});

test('resetLive clears live data and brings a demo-sped clock back to real time', () => {
  const { clock } = boot();
  S.setSpeed(30);
  clock.real += 60000; // 30 virtual minutes
  S.dispatch('createTicket', { items: [{ menuId: 'tea' }] });
  assert.equal(S.now(), T0 + 30 * 60000);
  assert.equal(S.resetLive(), 'ok');
  assert.equal(S.getState().tickets.length, 0);
  assert.equal(S.now(), T0 + 60000);
  assert.equal(S.getState().settings.pacing.enabled, true);
  assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
  S.destroy();
});

test('two tabs share one state through storage + BroadcastChannel (F17)', async () => {
  if (typeof globalThis.BroadcastChannel !== 'function') return;
  const storage = memStorage();
  let real = T0;
  // tab A: this realm's store, with tab sync on
  S.init({ now: () => real, storage, noTimers: true });
  // tab B: a second copy of the modules in its own VM context, same storage, same channel name
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, BroadcastChannel: globalThis.BroadcastChannel };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  const B = ctx.SB.store;
  B.init({ now: () => real, storage, noTimers: true });
  assert.equal(S.dispatch('createTicket', { items: [{ menuId: 'tea' }] }), 'ok');
  S.flush(); // persist + announce
  await sleep(50);
  assert.equal(B.getState().tickets.length, 1, 'tab B reloaded the newer rev');
  assert.equal(B.getState().rev, S.getState().rev);
  B.destroy();
  S.destroy();
});

test('two tabs creating tickets at the same moment keep all of them (F-L9)', async () => {
  if (typeof globalThis.BroadcastChannel !== 'function') return;
  const storage = memStorage();
  let real = T0;
  S.init({ now: () => real, storage, noTimers: true });
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, BroadcastChannel: globalThis.BroadcastChannel };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  const B = ctx.SB.store;
  B.init({ now: () => real, storage, noTimers: true });
  // Both tabs act before either one's save reaches the other.
  for (let i = 0; i < 3; i++) { real += 1000; assert.equal(S.dispatch('createTicket', { items: [{ menuId: 'tea' }] }), 'ok'); }
  for (let i = 0; i < 3; i++) { real += 1000; assert.equal(B.dispatch('createTicket', { items: [{ menuId: 'mac' }] }), 'ok'); }
  S.flush();
  B.flush();
  await sleep(80);
  S.flush();
  B.flush();
  await sleep(80);
  assert.equal(S.getState().tickets.length, 6, 'tab A has all six');
  assert.equal(B.getState().tickets.length, 6, 'tab B has all six');
  // Compared as text because tab B's arrays come from a different VM realm, which deepEqual treats as unequal.
  assert.equal(S.getState().tickets.map((t) => t.num).sort().join(), B.getState().tickets.map((t) => t.num).sort().join(), 'same tickets in both');
  assert.equal(new Set(S.getState().tickets.map((t) => t.num)).size, 6, 'no ticket number is used twice');
  assert.equal(storage.get(S.KEY).state.tickets.length, 6, 'and the saved copy has them too');
  B.destroy();
  S.destroy();
});

test('selectors called before init do not throw (they compute fresh and keep nothing)', async () => {
  const fresh = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
  const sel = fresh.store.select;
  assert.doesNotThrow(() => { sel.activeTickets(); sel.ticketsForZone('pit'); sel.expoTickets(); sel.recent(3); sel.voided(3); sel.allDay('pit'); sel.unavailable(); });
});

test('unreadable saved text (not JSON at all) is parked and reported, not silently replaced', () => {
  const storage = memStorage();
  storage.m.set(S.KEY, '{not json at all');
  storage.raw = (k) => (storage.m.has(k) ? storage.m.get(k) : null);
  const { st } = boot({ storage });
  assert.ok(st.corrupt, 'the status says the saved data was unreadable');
  assert.equal(st.firstRun, false);
  assert.equal(storage.m.get('smokebox.v1.corrupt'), JSON.stringify('{not json at all'), 'a copy of the damaged text is kept');
  S.destroy();
});

test('two tabs each planning a batch at the same moment keep both plans', async () => {
  if (typeof globalThis.BroadcastChannel !== 'function') return;
  const storage = memStorage();
  let real = T0;
  S.init({ now: () => real, storage, noTimers: true });
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, BroadcastChannel: globalThis.BroadcastChannel };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  const B = ctx.SB.store;
  B.init({ now: () => real, storage, noTimers: true });
  real += 1000; assert.equal(S.dispatch('planBatch', { ing: 'pork', grams: 5000, offAt: real + 3600e3 }), 'ok');
  real += 1000; assert.equal(B.dispatch('planBatch', { ing: 'ribs', grams: 3000, offAt: real + 3600e3 }), 'ok');
  S.flush(); B.flush();
  await sleep(80);
  S.flush(); B.flush();
  await sleep(80);
  const names = (st) => JSON.stringify(st.getState().planned.map((x) => x.ing).sort());
  assert.equal(names(S), '["pork","ribs"]');
  assert.equal(names(B), '["pork","ribs"]');
  assert.equal(new Set(S.getState().planned.map((x) => x.id)).size, 2, 'the two plans have different ids');
  B.destroy();
  S.destroy();
});
