// Close the month: what the engine plans and removes, and the store's preview / export / prune steps with their refusals.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store', '36-csv', '40-metrics']);
const E = SB.engine, S = SB.store, U = SB.util;
const DAY = 24 * 3600e3;
// A small seeded random generator so each run builds the same kitchens.
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// Builds a kitchen with `days` service days ending on the day of `end`; each day has a few paid orders, a void, a safety reading, and (except the
// days in `skipClose`) a closeDay. Returns { s, now, dayKeys }.
function kitchen({ days = 60, seed = 1, end = new Date(2026, 9, 20, 15, 0, 0).getTime(), skipClose = [], perDay = 4 } = {}) {
  const r = rng(seed);
  let now = new Date(end); now.setDate(now.getDate() - (days - 1)); now.setHours(9, 0, 0, 0); now = now.getTime();
  let s = E.newState({ now, blank: true });
  let dish = null;
  const go = (type, p, at) => { if (at > now) now = at; const res = E.apply(s, type, p, now); if (res.report !== 'ok') throw new Error(type + ' ' + res.report + ' ' + JSON.stringify(res.info)); s = res.state; return res; };
  dish = go('addMenuItem', { name: 'Plain dish', zone: 'pit', cat: 'meat', price: 6.5, prepSec: 120, track: 'one', prepGuess: false }, now + 1000).info.id;
  const dayKeys = [];
  const first = now;
  for (let d = 0; d < days; d++) {
    const base = new Date(first); base.setDate(base.getDate() + d); base.setHours(11, 0, 0, 0);
    const key = U.serviceDate(base.getTime());
    dayKeys.push(key);
    const n = 1 + Math.floor(r() * perDay);
    for (let k = 0; k < n; k++) {
      const at = base.getTime() + k * 600e3;
      const res = go('createTicket', { customer: 'C' + k, channel: 'dine_in', items: [{ menuId: dish, qty: 1 + Math.floor(r() * 2) }], allowPast: true }, at);
      const oid = res.info.orderId, tk = s.tickets[s.tickets.length - 1];
      if (r() < 0.15) { go('voidTicket', { ticketId: tk.id, reason: 'test' }, at + 1000); go('voidOrder', { orderId: oid, reason: 'test' }, at + 2000); continue; }
      for (const it of tk.items) for (let g = 0; g < 2; g++) { const cur = s.tickets.find((x) => x.id === tk.id).items.find((x) => x.id === it.id); if (cur.status !== 'done') go('advanceItem', { ticketId: tk.id, itemId: it.id }, at + 60000 + g * 1000); }
      go('bumpTicket', { ticketId: tk.id }, at + 70000);
      go('payOrder', { orderId: oid, method: ['cash', 'card', 'other'][Math.floor(r() * 3)], tip: r() < 0.5 ? 1.25 : 0 }, at + 80000);
    }
    go('sanitizeDone', { who: 'JM' }, base.getTime() + 9 * 3600e3);
    if (!skipClose.includes(d)) go('closeDay', {}, base.getTime() + 10 * 3600e3);
  }
  now = Math.max(now, end);
  return { s: E.tick(s, now).state, now, dayKeys };
}
const countType = (s, type) => E.allEvents(s).filter((e) => e.type === type).length;
const safetyCount = (s) => E.safetyLog(s).length;

test('plan: only closed days before the boundary and older than 35 days go; open work, today and safety entries stay', () => {
  const { s, now, dayKeys } = kitchen({ days: 60, skipClose: [3] });
  const before = dayKeys[40];
  const r = E.monthPlan(s, { before }, now);
  assert.equal(r.ok, true);
  const pl = r.plan;
  assert.ok(pl.before <= before && pl.tickets > 0 && pl.orders > 0 && pl.events > 0);
  assert.ok(pl.uncoveredDays.includes(dayKeys[3]), 'the day without a close is reported');
  for (const t of s.tickets) if (pl.ticketIds.has(t.id)) assert.ok(t.serviceDate < pl.before && t.serviceDate !== dayKeys[3]);
  // the last 35 days are never planned, even for a boundary in the future
  const far = E.monthPlan(s, { before: '2099-01-01' }, now).plan;
  assert.ok(far.before <= U.addDays(U.serviceDate(now), -35));
  assert.equal(pl.safetyEventsKept, safetyCount(s) + 0, 'every safety entry stays');
  // an unreal date, a bad keepDays
  assert.equal(E.monthPlan(s, { before: '2026-13-40' }, now).report, 'badPatch');
  assert.equal(E.monthPlan(s, { before: dayKeys[40], keepDays: 0 }, now).report, 'badPatch');
});

test('close: the kitchen stays valid, books balance, day totals and safety stay, the rest of the history is intact', () => {
  const { s, now, dayKeys } = kitchen({ days: 60, seed: 3 });
  const plan = E.monthPlan(s, { before: dayKeys[45] }, now).plan;
  const res = E.closeMonth(s, { before: dayKeys[45], backup: { filename: 'b.json', chars: 10, sha256: 'a'.repeat(64) } }, now);
  assert.equal(res.report, 'ok', JSON.stringify(res.info));
  const o = res.state;
  assert.deepEqual(E.checkInvariants(o, now), []);
  assert.equal(o.tickets.length, s.tickets.length - plan.tickets);
  assert.equal(o.orders.length, s.orders.length - plan.orders);
  assert.equal(countType(o, 'day_closed'), countType(s, 'day_closed'));
  assert.equal(safetyCount(o), safetyCount(s) + 1, 'all safety entries plus the month_closed entry');
  const mc = E.allEvents(o).filter((e) => e.type === 'month_closed');
  assert.equal(mc.length, 1);
  assert.equal(mc[0].tickets, plan.tickets); assert.equal(mc[0].orders, plan.orders); assert.equal(mc[0].events, plan.events);
  assert.equal(o.archivedBefore, plan.before);
  assert.equal(E.isArchivedDay(o, dayKeys[0]), true); assert.equal(E.isArchivedDay(o, dayKeys[59]), false);
  assert.ok(o.tickets.every((t) => t.serviceDate >= plan.before || t.status === 'active' || !plan.ticketIds.has(t.id)));
  // the saved text loads again without repairs, and a second run has nothing left to do
  const v = E.validateBackup(JSON.stringify({ v: 1, state: o }));
  assert.equal(v.ok, true, v.error); assert.deepEqual(v.repaired, []);
  assert.equal(v.state.archivedBefore, plan.before);
  assert.equal(E.closeMonth(o, { before: dayKeys[45] }, now).report, 'nothingToDo');
  // the day totals of pruned days still sum to what the orders were (from the original state)
  const paid = s.orders.filter((x) => plan.orderIds.has(x.id) && x.status === 'paid').reduce((a, x) => a + Math.round(x.totals.total * 100), 0);
  assert.equal(Math.round(plan.paidTotal * 100), paid);
});

test('close: open tickets and open orders in old closed days are never removed', () => {
  const { s, now, dayKeys } = kitchen({ days: 50, seed: 5 });
  // an order left open on an old day: make a copy of the state where one old paid order becomes open again and its ticket active
  const o0 = s.orders.find((o) => o.status === 'paid' && o.serviceDate < dayKeys[10]);
  const t0 = s.tickets.find((t) => t.orderId === o0.id);
  const s2 = Object.assign({}, s, { orders: s.orders.map((o) => (o.id === o0.id ? { id: o.id, serviceDate: o.serviceDate, customer: o.customer, channel: o.channel, createdAt: o.createdAt, status: 'open', src: o.src, rounds: o.rounds } : o)),
    tickets: s.tickets.map((t) => (t.id === t0.id ? Object.assign({}, t, { status: 'active' }) : t)) });
  const pl = E.monthPlan(s2, { before: dayKeys[30] }, now).plan;
  assert.ok(!pl.orderIds.has(o0.id) && !pl.ticketIds.has(t0.id));
  assert.equal(pl.openOrdersKept, 1);
});

test('random kitchens: pruning always leaves a valid kitchen and removes only what the plan said', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const days = 40 + seed * 5, skip = seed % 2 ? [2, 9] : [];
    const { s, now, dayKeys } = kitchen({ days, seed, skipClose: skip, perDay: 2 + (seed % 4) });
    const before = dayKeys[Math.max(1, days - 38 - (seed % 3))];
    const r = E.monthPlan(s, { before }, now);
    if (!r.plan.tickets && !r.plan.events) continue;
    const res = E.closeMonth(s, { before }, now);
    assert.equal(res.report, 'ok', 'seed ' + seed + ' ' + JSON.stringify(res.info));
    assert.deepEqual(E.checkInvariants(res.state, now), [], 'seed ' + seed);
    assert.equal(s.tickets.length - res.state.tickets.length, r.plan.tickets);
    assert.equal(E.allEvents(s).length - E.allEvents(res.state).length, r.plan.events - 1);
    assert.equal(E.validateBackup(JSON.stringify({ v: 1, state: res.state })).ok, true);
    // later activity still works after pruning
    const next = E.apply(res.state, 'createTicket', { customer: 'After', items: [{ menuId: res.state.menu.find((m) => !m.archived).id }] }, now + 1000);
    assert.equal(next.report, 'ok');
  }
});

for (const tz of ['America/New_York', 'Pacific/Auckland', 'Europe/London', 'Australia/Lord_Howe']) {
  test('time zone ' + tz + ': the boundary follows service days across the daylight-saving changes', () => {
    const old = process.env.TZ;
    process.env.TZ = tz;
    try {
      const { s, now, dayKeys } = kitchen({ days: 230, seed: 11, end: new Date(2026, 10, 20, 15, 0, 0).getTime(), perDay: 2 });
      for (const cut of [60, 120, 200]) {
        const before = dayKeys[cut];
        const r = E.monthPlan(s, { before }, now);
        assert.equal(r.ok, true);
        const pl = r.plan;
        const expectT = s.tickets.filter((t) => t.serviceDate < pl.before).length;
        assert.equal(pl.tickets, expectT, tz + ' cut ' + cut);
        const res = E.closeMonth(s, { before }, now);
        assert.equal(res.report, 'ok');
        assert.deepEqual(E.checkInvariants(res.state, now), []);
        assert.ok(res.state.tickets.every((t) => t.serviceDate >= pl.before));
      }
    } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  });
}

// ---------- the store ----------
// A memory storage like the app's, with a switch that makes writes of one key fail.
function memStorage() {
  const m = new Map();
  const st = {
    persistent: true, m, failKey: null,
    get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } },
    raw(k) { return m.has(k) ? m.get(k) : null; },
    set(k, v) { if (st.failKey === k) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, JSON.stringify(v)); return true; },
    remove(k) { m.delete(k); }, keys(prefix) { return [...m.keys()].filter((k) => !prefix || k.startsWith(prefix)); },
  };
  return st;
}
// Starts the store on a saved copy of a built kitchen, as a real (strict) kitchen.
function boot(k, opts = {}) {
  const storage = opts.storage || memStorage();
  storage.set('smokebox.v1.state', { v: 1, savedAt: k.now, rev: k.s.rev, clock: { virtual: k.now, real: k.now, speed: 1 }, state: k.s });
  const clock = { real: k.now };
  S.init({ now: () => clock.real, storage, noTimers: true, noSync: !opts.transport, mode: opts.mode || 'real', transport: opts.transport });
  return { storage, clock };
}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

test('store: preview, export and prune; refusals; the saved-file proof; restore from the pre-prune backup', () => {
  const k = kitchen({ days: 60, seed: 21 });
  const { storage } = boot(k);
  const before = k.dayKeys[40];
  const pv = S.closeMonthPreview({ before });
  assert.equal(pv.ok, true);
  assert.ok(pv.preview.tickets > 0 && !('ticketIds' in pv.preview));
  const nTickets = S.getState().tickets.length;
  // nothing happens without an export and a proof
  assert.equal(S.closeMonthPrune({ before }).report, 'backupRequired');
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: 'x.json', chars: 5, sha256: 'a'.repeat(64) } }).report, 'backupRequired');
  const ex = S.closeMonthExport({ before });
  assert.equal(ex.ok, true);
  assert.deepEqual(ex.files.map((f) => f.kind), ['backup', 'orders', 'tickets', 'days', 'manifest']);
  for (const f of ex.files) assert.equal(f.sha256, sha(f.text), f.name);
  assert.equal(ex.manifest.counts.tickets, pv.preview.tickets);
  assert.equal(ex.manifest.files.length, 4);
  // the CSV rows add up to the plan
  const lines = (name) => ex.files.find((f) => f.kind === name).text.trim().split('\r\n').length - 1;
  assert.equal(lines('tickets'), pv.preview.tickets);
  assert.equal(lines('orders'), pv.preview.orders);
  assert.equal(S.getState().tickets.length, nTickets, 'export changes nothing');
  const backup = ex.files[0];
  // a wrong hash, a wrong size and a bad shape are refused
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: backup.name, chars: backup.chars, sha256: 'b'.repeat(64) } }).report, 'backupRequired');
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: backup.name, chars: backup.chars + 1, sha256: backup.sha256 } }).report, 'backupRequired');
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: '', chars: backup.chars, sha256: backup.sha256 } }).report, 'backupRequired');
  assert.equal(S.getState().tickets.length, nTickets);
  const ok = S.closeMonthPrune({ before, confirmBackupSaved: { filename: backup.name, chars: backup.chars, sha256: backup.sha256 } });
  assert.equal(ok.report, 'ok', JSON.stringify(ok.info));
  assert.equal(ok.info.copyKept, true);
  assert.equal(S.getState().tickets.length, nTickets - pv.preview.tickets);
  assert.deepEqual(E.checkInvariants(S.getState(), k.now), []);
  assert.equal(storage.get('smokebox.v1.state').state.tickets.length, S.getState().tickets.length, 'the save holds the pruned kitchen');
  assert.equal(storage.get('smokebox.v1.lastgood').reason, 'before month close');
  assert.equal(S.beforeRestoreInfo().reason, 'before month close');
  // a second prune with the same proof has nothing to do
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: backup.name, chars: backup.chars, sha256: backup.sha256 } }).report, 'nothingToDo');
  // restoring the backup file brings everything back
  assert.equal(S.importAll(backup.text), 'ok');
  assert.equal(S.getState().tickets.length, nTickets);
  assert.equal(S.getState().orders.length, k.s.orders.length);
  assert.equal(S.getState().archivedBefore, undefined);
  // restoring first, then pruning again, then undoing with the kept copy
  assert.equal(S.closeMonthExport({ before }).ok, true);
  S.destroy();
});

test('store: the 7-day copy undoes a prune', () => {
  const k = kitchen({ days: 60, seed: 22 });
  boot(k);
  const before = k.dayKeys[40];
  const n = S.getState().tickets.length;
  const f = S.closeMonthExport({ before }).files[0];
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: f.name, chars: f.chars, sha256: f.sha256 } }).report, 'ok');
  assert.ok(S.getState().tickets.length < n);
  assert.equal(S.undoRestore(), 'ok');
  assert.equal(S.getState().tickets.length, n);
  S.destroy();
});

test('store: a stale export (the plan changed since), the demo and a hub tablet are refused', () => {
  const k = kitchen({ days: 60, seed: 23 });
  const { clock } = boot(k);
  const before = k.dayKeys[50];
  const f = S.closeMonthExport({ before }).files[0];
  const proof = { filename: f.name, chars: f.chars, sha256: f.sha256 };
  // a day passes: one more day is are now old enough, so what would be removed is no longer what was exported
  clock.real += 30 * 3600e3;
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: proof }).report, 'exportStale');
  S.destroy();
  // demo
  const kd = kitchen({ days: 50, seed: 24 });
  boot(kd, { mode: 'demo' });
  assert.equal(S.closeMonthExport({ before: kd.dayKeys[20] }).report, 'notInDemo');
  assert.equal(S.closeMonthPrune({ before: kd.dayKeys[20], confirmBackupSaved: proof }).report, 'notInDemo');
  S.destroy();
  // a tablet that works through a hub (a transport that pushes actions)
  const kh = kitchen({ days: 50, seed: 25 });
  const transport = { name: 'fake-hub', open() { return true; }, push: async () => ({ acked: [] }), post() { return true; }, close() {} };
  boot(kh, { transport });
  const f2 = S.closeMonthExport({ before: kh.dayKeys[20] }).files[0];
  assert.equal(S.closeMonthPrune({ before: kh.dayKeys[20], confirmBackupSaved: { filename: f2.name, chars: f2.chars, sha256: f2.sha256 } }).report, 'hubKitchen');
  S.destroy();
});

test('store: an interrupted prune (the save fails) leaves the kitchen exactly as it was', () => {
  const k = kitchen({ days: 60, seed: 26 });
  const { storage } = boot(k);
  const before = k.dayKeys[40];
  const f = S.closeMonthExport({ before }).files[0];
  const savedBefore = storage.raw('smokebox.v1.state');
  const stateBefore = S.getState();
  storage.failKey = 'smokebox.v1.state';
  const res = S.closeMonthPrune({ before, confirmBackupSaved: { filename: f.name, chars: f.chars, sha256: f.sha256 } });
  assert.equal(res.report, 'storageBlocked');
  assert.equal(S.getState().tickets.length, stateBefore.tickets.length);
  assert.equal(S.getState().archivedBefore, undefined);
  assert.equal(storage.raw('smokebox.v1.state'), savedBefore, 'what is stored is the untouched full kitchen');
  assert.deepEqual(E.checkInvariants(S.getState(), k.now), []);
  // the storage works again: the same proof still works
  storage.failKey = null;
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: f.name, chars: f.chars, sha256: f.sha256 } }).report, 'ok');
  S.destroy();
});

test('metrics and the back-office dataset do not crash or return NaN on a pruned kitchen', () => {
  const k = kitchen({ days: 60, seed: 31 });
  boot(k);
  const before = k.dayKeys[40];
  const f = S.closeMonthExport({ before }).files[0];
  assert.equal(S.closeMonthPrune({ before, confirmBackupSaved: { filename: f.name, chars: f.chars, sha256: f.sha256 } }).report, 'ok');
  const ds = S.dataset();
  assert.ok(ds && typeof ds === 'object');
  assert.equal(ds.archivedBefore, S.getState().archivedBefore, 'the dataset carries the archive boundary');
  const M = SB.metrics;
  const bad = [];
  for (const name of Object.keys(M)) {
    if (typeof M[name] !== 'function' || ['histogram', 'thermal', 'rangePresets', 'insightRules', 'level', 'thresholds', 'discardSentence', 'unprepare', 'ticketGantt', 'headline', 'prepare'].includes(name)) continue;
    try { const out = M[name](ds, {}); const j = JSON.stringify(out, (kk, v) => (typeof v === 'number' && Number.isNaN(v) ? '__NaN__' : v)); if (j && j.includes('__NaN__')) bad.push(name + ' NaN'); } catch (e) { bad.push(name + ' threw ' + e.message); }
  }
  assert.deepEqual(bad, []);
  S.destroy();
});
