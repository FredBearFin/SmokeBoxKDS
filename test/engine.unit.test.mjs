// Engine unit tests: hand-computed expectations for pacing, FIFO depletion, gates, thermal yield, learning,
// availability precedence, undo, backups. Run: node tools/test.mjs engine
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine, C = SB.config;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime(); // local noon, Sat 17 Oct 2026
const SEC = 1000, MIN = 60 * SEC, HR = 60 * MIN;

/** Small driver: keeps a state and a clock, applies actions, checks invariants after every step. */
class K {
  constructor(s, now) { this.s = s; this.now = now; }
  at(t) { this.now = t; return this; }
  tickAt(t) { this.now = t; const r = E.tick(this.s, t); this.s = r.state; this.inv(); return r; }
  do(type, payload, expect = 'ok') {
    const before = this.s;
    const r = E.apply(this.s, type, payload, this.now);
    assert.equal(r.report, expect, `${type} -> ${r.report} (wanted ${expect}) ${JSON.stringify(r.info)}`);
    if (r.report === 'ok') this.s = r.state; else assert.equal(r.state, before, 'non-ok must return the same state reference');
    this.inv();
    return r;
  }
  inv() { assert.deepEqual(E.checkInvariants(this.s, this.now), []); }
  t(i = -1) { return this.s.tickets.at(i); }
  b(id) { return this.s.batches.find((x) => x.id === id); }
}
// Settings with the old 30-minute check interval, for the tests that walk the check-due gate by minutes.
const settings30 = () => { const s = E.defaultSettings(); s.safety.tempCheckEveryMin = 30; return s; };
const fresh = (opts = {}) => new K(E.newState(Object.assign({ now: T0 }, opts)), T0);
/** Strip fields that I13 ignores (events, undo stack, rev, id counters, simulated sync records). */
const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = canon(x[k]); return o; }, {}) : x);
function strip(s) {
  const o = canon(JSON.parse(JSON.stringify(s)));
  delete o.events; delete o.eventArchive; delete o.undo; delete o.rev; delete o.syncs;
  delete o.seq.event; delete o.seq.sync; delete o.seq.undo; delete o.seq.plan;
  return o;
}

/* ------------------------------------------------------------------ pacing ------------------------------------------------------------------ */
test('pacing: D_max, offsets O(i) = D_max - d(i), fire times exact at any tick time', () => {
  const k = fresh();
  const r = k.do('createTicket', { customer: 'Table 4', items: [{ menuId: 'brisket_half' }, { menuId: 'slaw', qty: 2 }, { menuId: 'mac' }] });
  assert.equal(r.info.num, 101);
  const t = k.t();
  // d = 120, 30 x (1 + 0.2 x 1) = 36, 300  ->  D_max = 300
  assert.equal(t.dmaxSec, 300);
  assert.deepEqual(t.items.map((i) => [i.prepSec, i.offsetSec, i.fireAt - T0]), [[120, 180, 180000], [36, 264, 264000], [300, 0, 0]]);
  assert.deepEqual(t.items.map((i) => i.status), ['queued', 'queued', 'displayed']);
  assert.equal(t.items[2].firedAt, T0);
  k.tickAt(T0 + 179999);
  assert.equal(k.t().items[0].status, 'queued');
  k.tickAt(T0 + 180000);
  assert.equal(k.t().items[0].status, 'displayed');
  assert.equal(k.t().items[0].firedAt, T0 + 180000);
  k.tickAt(T0 + 300000); // tick arrives 36 s late: firedAt is still the planned time
  assert.equal(k.t().items[1].firedAt, T0 + 264000);
});

test('pacing: qtyScale, floorSec and the plan preview', () => {
  const q = E.helpers.qtyScale;
  assert.equal(q(1), 1); assert.equal(q(3), 1.4); assert.equal(q(10), 2); assert.equal(q(0), 1); assert.equal(q(NaN), 1);
  const s = E.newState({ now: T0 });
  const plan = E.pacingPlan([{ menuId: 'tea' }, { menuId: 'mac' }, { menuId: 'nope' }], T0, s.settings, { tea: { n: 1, ema: 5, est: 5 } }, s.menu);
  assert.deepEqual(plan.lines.map((l) => [l.menuId, l.prepSec, l.offsetSec]), [['tea', 15, 285], ['mac', 300, 0]]); // tea floored at 15 s
  assert.equal(plan.readySec, 300);
  assert.equal(plan.lines[0].fireAt, T0 + 285000);
  const rush = E.planFor(s, [{ menuId: 'tea' }, { menuId: 'mac' }], T0, true);
  assert.equal(rush.dmaxSec, 0);
  assert.deepEqual(rush.lines.map((l) => l.offsetSec), [0, 0]);
  assert.equal(E.helpers.estimate(s.menu, {}, 'mac'), 300);
  assert.equal(E.helpers.estimate(s.menu, { mac: { n: 2, ema: 400, est: 340 } }, 'mac'), 340);
});

test('pacing: rush at creation and pacing off give zero offsets', () => {
  const k = fresh();
  k.do('createTicket', { rush: true, items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }] });
  assert.equal(k.t().dmaxSec, 0);
  assert.deepEqual(k.t().items.map((i) => [i.offsetSec, i.status]), [[0, 'displayed'], [0, 'displayed']]);
  k.do('updateSettings', { patch: { pacing: { enabled: false } } });
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }] });
  assert.equal(k.t().dmaxSec, 0);
  assert.equal(k.t().pacing, false);
  assert.deepEqual(k.t().items.map((i) => i.status), ['displayed', 'displayed']);
});

test('setRush fires queued items now with offset 0 (no override flag)', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }, { menuId: 'mac' }] });
  const id = k.t().id;
  k.at(T0 + 20 * SEC).do('setRush', { ticketId: id, on: true });
  const its = k.t().items;
  assert.deepEqual(its.map((i) => i.status), ['displayed', 'displayed', 'displayed']);
  assert.deepEqual(its.slice(0, 2).map((i) => [i.offsetSec, i.fireAt, i.firedAt, !!i.rushed, !!i.override]), [[0, T0, T0 + 20000, true, false], [0, T0, T0 + 20000, true, false]]);
  k.do('setRush', { ticketId: id, on: true }, 'nothingToDo');
  k.do('setRush', { ticketId: id, on: 'yes' }, 'badPatch');
  k.do('setRush', { ticketId: id, on: false });
  assert.equal(k.t().rush, false);
});

/* ------------------------------------------------------------------ item flow ------------------------------------------------------------------ */
test('fireNow, advance (two-step and one-step), completeItem, wrong-state reports', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }, { menuId: 'mac' }] });
  const t = k.t();
  const [b, sl, mac] = t.items.map((i) => i.id);
  k.do('advanceItem', { ticketId: t.id, itemId: b }, 'nothingToDo');
  k.at(T0 + 5 * SEC).do('fireNow', { ticketId: t.id, itemId: b });
  assert.deepEqual([k.t().items[0].status, k.t().items[0].firedAt, k.t().items[0].override], ['displayed', T0 + 5000, true]);
  k.do('fireNow', { ticketId: t.id, itemId: b }, 'alreadyFired');
  k.do('fireNow', { ticketId: t.id, itemId: mac }, 'alreadyFired');
  k.at(T0 + 10 * SEC).do('advanceItem', { ticketId: t.id, itemId: mac });
  assert.deepEqual([k.t().items[2].status, k.t().items[2].startedAt], ['cooking', T0 + 10000]);
  k.at(T0 + 300 * SEC).do('advanceItem', { ticketId: t.id, itemId: mac });
  assert.deepEqual([k.t().items[2].status, k.t().items[2].doneAt], ['done', T0 + 300000]);
  k.do('advanceItem', { ticketId: t.id, itemId: mac }, 'alreadyDone');
  k.do('completeItem', { ticketId: t.id, itemId: b }); // two-step completed without a start: startedAt stays undefined
  assert.equal(k.t().items[0].startedAt, undefined);
  assert.equal(k.t().items[1].status, 'displayed'); // slaw fired by the catch-up tick at 264 s
  k.do('advanceItem', { ticketId: t.id, itemId: sl });
  assert.equal(k.t().items[1].status, 'done');
  k.do('advanceItem', { ticketId: 't_999', itemId: sl }, 'unknownTicket');
  k.do('advanceItem', { ticketId: t.id, itemId: 't_1.9' }, 'unknownItem');
});

test('fireNow with start:true cooks a two-step item at once; a one-step item only moves to the screen; Undo puts it back', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }, { menuId: 'mac' }] });
  const t = k.t();
  const [b, sl] = t.items.map((i) => i.id);
  k.at(T0 + 5 * SEC).do('fireNow', { ticketId: t.id, itemId: b, start: true });
  const it = k.t().items[0];
  assert.deepEqual([it.status, it.firedAt, it.startedAt, it.override], ['cooking', T0 + 5000, T0 + 5000, true]);
  k.do('fireNow', { ticketId: t.id, itemId: b, start: true }, 'alreadyFired');
  assert.equal(k.t().items[1].status, 'queued');
  k.at(T0 + 6 * SEC).do('fireNow', { ticketId: t.id, itemId: sl, start: true });
  assert.deepEqual([k.t().items[1].status, k.t().items[1].startedAt], ['displayed', undefined], 'a one-step item has no cooking state');
  k.do('undo', {});
  assert.equal(k.t().items[1].status, 'queued');
  k.do('undo', {});
  assert.deepEqual([k.t().items[0].status, k.t().items[0].startedAt], ['queued', undefined]);
});

test('completeZone completes every not-done item of the station, on-deck ones count as overrides', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'sausage' }, { menuId: 'slaw' }] }); // pit 120, pit 240, cold 30
  const t = k.t();
  assert.deepEqual(t.items.map((i) => i.status), ['queued', 'displayed', 'queued']);
  k.at(T0 + 60 * SEC).do('completeZone', { ticketId: t.id, zone: 'pit' });
  const its = k.t().items;
  assert.deepEqual(its.map((i) => i.status), ['done', 'done', 'queued']);
  assert.equal(its[0].override, true);
  assert.equal(its[0].firedAt, T0 + 60000);
  k.do('completeZone', { ticketId: t.id, zone: 'pit' }, 'nothingToDo');
  k.do('completeZone', { ticketId: t.id, zone: 'expo' }, 'badPatch');
  assert.equal(k.s.learned.brisket_half, undefined, 'override items are not learned from');
});

test('bump, forced bump, recall and void', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'slaw' }, { menuId: 'tea' }] });
  const id = k.t().id;
  const r = k.do('bumpTicket', { ticketId: id }, 'notAllDone');
  assert.equal(r.info.remaining, 2);
  k.at(T0 + 30 * SEC).do('advanceItem', { ticketId: id, itemId: id + '.1' });
  k.at(T0 + 40 * SEC).do('bumpTicket', { ticketId: id, force: true });
  assert.deepEqual([k.t().status, k.t().forced, k.t().expeditedAt], ['expedited', true, T0 + 40000]);
  k.do('bumpTicket', { ticketId: id }, 'ticketNotActive');
  k.do('recallTicket', { ticketId: id });
  assert.deepEqual([k.t().status, k.t().recalls, k.t().expeditedAt, k.t().forced], ['active', 1, undefined, undefined]);
  k.do('recallTicket', { ticketId: id }, 'ticketNotExpedited');
  k.do('advanceItem', { ticketId: id, itemId: id + '.2' });
  k.at(T0 + 50 * SEC).do('bumpTicket', { ticketId: id });
  assert.deepEqual([k.t().status, k.t().forced], ['expedited', undefined]);
  // void
  k.do('createTicket', { items: [{ menuId: 'tea' }] });
  const v = k.t().id;
  k.do('voidTicket', { ticketId: v }, 'reasonRequired');
  k.do('voidTicket', { ticketId: v, reason: '   ' }, 'reasonRequired');
  k.do('voidTicket', { ticketId: v, reason: 'x'.repeat(41) }, 'noteTooLong');
  k.do('voidTicket', { ticketId: v, reason: 'customer left' });
  assert.deepEqual([k.t().status, k.t().voidReason, k.t().voidedAt], ['voided', 'customer left', T0 + 50000]);
  k.do('voidTicket', { ticketId: v, reason: 'again' }, 'ticketNotActive');
  k.do('advanceItem', { ticketId: v, itemId: v + '.1' }, 'ticketNotActive');
});

test('createTicket validation, service date, numbering and createdAt bounds', () => {
  const k = fresh();
  k.do('createTicket', { items: [] }, 'emptyOrder');
  k.do('createTicket', {}, 'emptyOrder');
  k.do('createTicket', { items: [{ menuId: 'tea', qty: 0 }] }, 'badQty');
  k.do('createTicket', { items: [{ menuId: 'tea', qty: 2.5 }] }, 'badQty');
  k.do('createTicket', { items: [{ menuId: 'tea', qty: 21 }] }, 'badQty');
  k.do('createTicket', { items: Array.from({ length: 31 }, () => ({ menuId: 'tea' })) }, 'tooManyItems');
  k.do('createTicket', { items: [{ menuId: 'tea' }], customer: 'x'.repeat(41) }, 'badCustomer');
  k.do('createTicket', { items: [{ menuId: 'tea' }], channel: 'fax' }, 'badChannel');
  k.do('createTicket', { items: [{ menuId: 'tea' }], note: 'n'.repeat(141) }, 'noteTooLong');
  k.do('createTicket', { items: [{ menuId: 'ghost' }] }, 'unknownMenu');
  k.do('createTicket', { items: [{ menuId: 'tea' }], createdAt: T0 + 1 }, 'outOfBounds');
  k.do('createTicket', { items: [{ menuId: 'tea' }], createdAt: T0 - 49 * HR }, 'outOfBounds');
  k.do('createTicket', { items: [{ menuId: 'tea' }], createdAt: T0 - 49 * HR, allowPast: true });
  assert.equal(k.t().serviceDate, '2026-10-15');
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'mac' }], createdAt: T0 - 5 * MIN, src: 'demo' });
  // brisket planned at -5:00 + 3:00 = -2:00: already due, so it fires at exactly its planned time
  assert.deepEqual(k.t().items.map((i) => [i.status, i.firedAt - T0]), [['displayed', -120000], ['displayed', -300000]]);
  assert.equal(k.t().customer, 'Walk-up');
  assert.equal(k.t().num, 101);
  k.do('createTicket', { items: [{ menuId: 'tea' }], customer: '  Table   9 ' });
  assert.deepEqual([k.t().num, k.t().customer], [102, 'Table 9']);
  // 1:00 am next calendar day still belongs to the 17th (service night); 11 am on the 18th starts again at 101
  k.at(new Date(2026, 9, 18, 1, 0).getTime()).do('createTicket', { items: [{ menuId: 'tea' }] });
  assert.deepEqual([k.t().serviceDate, k.t().num], ['2026-10-17', 103]);
  k.at(new Date(2026, 9, 18, 11, 0).getTime()).do('createTicket', { items: [{ menuId: 'tea' }] });
  assert.deepEqual([k.t().serviceDate, k.t().num], ['2026-10-18', 101]);
});

/* ------------------------------------------------------------------ depletion ------------------------------------------------------------------ */
test('FIFO depletion across batches, exact cost', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 300, tempF: 160 });
  k.at(T0 + SEC).do('addBatch', { ing: 'brisket', cookedG: 1000, tempF: 160 });
  assert.deepEqual(k.s.batches.map((b) => b.id), ['b_1', 'b_2']);
  k.do('createTicket', { items: [{ menuId: 'brisket_half', qty: 2 }] }); // need 2 x 227 = 454 g
  const t = k.t();
  assert.equal(t.items[0].prepSec, 144);
  k.at(T0 + 5 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id });
  k.at(T0 + 65 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id });
  const it = k.t().items[0];
  assert.deepEqual(it.depleted, [{ ing: 'brisket', g: 300, batchId: 'b_1' }, { ing: 'brisket', g: 154, batchId: 'b_2' }]);
  assert.deepEqual(k.s.batches.map((b) => b.remainingG), [0, 846]);
  // nominal brisket cost per cooked kg = 24.36 / 0.602 = 40.4651; 454 g -> 18.3712
  assert.equal(k.b('b_1').costPerCookedKg, 40.4651);
  assert.equal(it.cost, 18.3712);
});

test('shortage: deduct what exists, record short, never negative, auto-86 + simulated sync', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 300, tempF: 160 });
  k.do('addBatch', { ing: 'brisket', cookedG: 1000, tempF: 160 });
  k.do('createTicket', { items: [{ menuId: 'brisket_qtr', qty: 20 }] }); // 2260 g wanted, 1300 g exist
  const t = k.t();
  const r = k.at(T0 + 30 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id });
  assert.deepEqual(k.t().items[0].depleted, [{ ing: 'brisket', g: 300, batchId: 'b_1' }, { ing: 'brisket', g: 1000, batchId: 'b_2' }, { ing: 'brisket', g: 0, short: 960 }]);
  assert.deepEqual(k.s.batches.map((b) => b.remainingG), [0, 0]);
  const types = r.events.map((e) => e.type);
  assert.ok(types.includes('stock_short'));
  assert.equal(r.events.find((e) => e.type === 'stock_short').g, 960);
  assert.equal(r.events.find((e) => e.type === 'item_done').shortG, 960);
  const changed = r.events.filter((e) => e.type === 'avail_changed').map((e) => e.menuId).sort();
  assert.deepEqual(changed, ['brisket_half', 'brisket_qtr', 'brisket_sand', 'burnt_ends']); // every item that needs brisket goes 86 together
  assert.deepEqual(E.availability(k.s, 'brisket_qtr'), { ok: false, reason: 'stock', ing: 'brisket' });
  assert.equal(k.s.syncs.length >= 1, true);
  const sy = k.s.syncs.at(-1);
  assert.equal(sy.kind, '86');
  const delays = Object.values(sy.targets).map((x) => x.dueAt - sy.t);
  for (const d of delays) assert.ok(d >= 2000 && d <= 40000, 'delay ' + d);
  assert.deepEqual(delays, C.syncTargets.map((x) => E.helpers.syncDelayMs(sy.id, x.id)));
  const tr = k.tickAt(T0 + 30 * SEC + 40 * SEC);
  const done = tr.events.filter((e) => e.type === 'sync_done' && e.syncId === sy.id);
  assert.equal(done.length, 4);
  assert.deepEqual(done.map((e) => e.latencyMs).sort((a, b) => a - b), delays.slice().sort((a, b) => a - b));
});

test('I8 lockout: a locked batch is never drawn from, even when it is older', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 1000, tempF: 160 });
  k.at(T0 + SEC).do('addBatch', { ing: 'brisket', cookedG: 1000, tempF: 160 });
  k.do('logTemp', { batchId: 'b_1', tempF: 120 });
  assert.deepEqual([k.b('b_1').status, k.b('b_1').canServe, k.b('b_1').action], ['reheat', false, 'REHEAT_IMMEDIATE']);
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }] });
  const t = k.t();
  k.do('completeItem', { ticketId: t.id, itemId: t.items[0].id });
  assert.deepEqual(k.t().items[0].depleted, [{ ing: 'brisket', g: 227, batchId: 'b_2' }]);
  assert.equal(k.b('b_1').remainingG, 1000);
  assert.equal(E.servable(k.s, 'brisket'), 773);
});

test('non-TCS restock and depletion from state.stock; TCS restock makes a batch with no reading', () => {
  const k = fresh({ empty: true });
  k.do('restock', { ing: 'tea', g: 5000 });
  assert.equal(k.s.stock.tea, 5000);
  k.do('restock', { ing: 'tea', g: -1 }, 'badWeight');
  k.do('restock', { ing: 'tea', g: 1e7 }, 'badWeight');
  k.do('restock', { ing: 'gravy', g: 10 }, 'unknownIng');
  k.do('createTicket', { items: [{ menuId: 'tea', qty: 2 }] });
  k.do('completeItem', { ticketId: k.t().id, itemId: k.t().items[0].id });
  assert.equal(k.s.stock.tea, 5000 - 960);
  assert.equal(k.t().items[0].cost, 0.48); // 960 g x $0.50/kg
  k.do('restock', { ing: 'pork', g: 2000 });
  const b = k.s.batches.at(-1);
  assert.deepEqual([b.ing, b.remainingG, b.lastTempAt, b.status, b.canServe], ['pork', 2000, undefined, 'check', true]);
});

/* ------------------------------------------------------------------ availability ------------------------------------------------------------------ */
test('availability precedence: manual > safety > stock', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 2000, tempF: 160 });
  assert.deepEqual(E.availability(k.s, 'brisket_half'), { ok: true, reason: null, ing: null });
  assert.deepEqual(E.availability(k.s, 'brisket_sand'), { ok: false, reason: 'stock', ing: 'buns' }); // no buns in an empty state
  k.do('logTemp', { batchId: 'b_1', tempF: 120 });
  assert.deepEqual(E.availability(k.s, 'brisket_half'), { ok: false, reason: 'safety', ing: 'brisket' });
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }] }, 'itemUnavailable');
  k.do('toggle86', { menuId: 'brisket_half', on: true });
  assert.equal(k.s.avail.brisket_half.reason, 'manual');
  k.do('toggle86', { menuId: 'brisket_half', on: true }, 'nothingToDo');
  k.do('toggle86', { menuId: 'brisket_half', on: false });
  assert.equal(k.s.avail.brisket_half.reason, 'safety');
  k.do('reheatBatch', { batchId: 'b_1', tempF: 150 }, 'tempTooLow');
  k.do('reheatBatch', { batchId: 'b_1', tempF: 170 });
  assert.equal(k.s.avail.brisket_half.ok, true);
  for (let i = 0; i < 6; i++) { // 6 x 227 = 1362 g -> 638 g left <= 700 g threshold
    k.do('createTicket', { items: [{ menuId: 'brisket_half' }] });
    k.do('completeItem', { ticketId: k.t().id, itemId: k.t().items[0].id });
  }
  assert.deepEqual(E.availability(k.s, 'brisket_half'), { ok: false, reason: 'stock', ing: 'brisket' });
  const r = k.do('createTicket', { items: [{ menuId: 'brisket_qtr' }] }, 'itemUnavailable');
  assert.deepEqual([r.info.menuId, r.info.reason, r.info.ing], ['brisket_qtr', 'stock', 'brisket']);
});

test('safety hold after a safety discard; quality discard reads as sold out', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'pork', cookedG: 3000, tempF: 160 });
  k.do('discardBatch', { batchId: 'b_1', reason: 'temp' });
  assert.equal(k.s.avail.pork_half.reason, 'safety');
  k.do('addBatch', { ing: 'pork', cookedG: 3000, tempF: 160 });
  assert.equal(k.s.avail.pork_half.ok, true);
  k.do('discardBatch', { batchId: 'b_2', reason: 'quality' });
  assert.equal(k.s.avail.pork_half.reason, 'stock');
  k.do('discardBatch', { batchId: 'b_2', reason: 'quality' }, 'batchNotServable');
  k.do('discardBatch', { batchId: 'b_9', reason: 'quality' }, 'unknownBatch');
  k.do('discardBatch', { batchId: 'b_1' }, 'reasonRequired');
});

/* ------------------------------------------------------------------ gates ------------------------------------------------------------------ */
test('gate: every hot, cold and cooling branch', () => {
  const S = settings30().safety;
  const hot = { id: 'b', ing: 'brisket', kind: 'hot', enteredAt: T0, remainingG: 100, reheats: 0, lastTempAt: T0, lastTempF: 150, status: 'ok', canServe: true, maxHoldH: 4 };
  const G = (b, t, s = S) => { const g = E.gate(b, t, s); return [g.action, g.canServe, g.reason, g.severity, g.status]; };
  // 1 expiry (strict >)
  assert.deepEqual(G(hot, T0 + 4 * HR + 1), ['DISCARD_LOCKOUT', false, 'expired', 'bad', 'discard']);
  assert.deepEqual(G(hot, T0 + 4 * HR).slice(0, 2), ['CHECK_TEMP', true]);
  // 2 out of range
  assert.deepEqual(G({ ...hot, outSince: T0 + HR, reheats: 1 }, T0 + HR + MIN), ['DISCARD_LOCKOUT', false, 'temp', 'bad', 'discard']);
  assert.deepEqual(G({ ...hot, outSince: T0 + HR }, T0 + 3 * HR + 1), ['DISCARD_LOCKOUT', false, 'temp', 'bad', 'discard']);
  assert.deepEqual(G({ ...hot, outSince: T0 + HR }, T0 + 3 * HR), ['REHEAT_IMMEDIATE', false, 'belowHot', 'bad', 'reheat']);
  assert.equal(E.gate({ ...hot, outSince: T0 + HR }, T0 + 2 * HR, S).nextDeadlineAt, T0 + 3 * HR);
  // 3 check due: warn after 30 min, bad after 60 min, still servable
  assert.deepEqual(G(hot, T0 + 30 * MIN), ['NONE', true, 'ok', 'ok', 'ok']);
  assert.equal(E.gate(hot, T0 + 10 * MIN, S).nextDeadlineAt, T0 + 30 * MIN);
  assert.deepEqual(G(hot, T0 + 30 * MIN + 1), ['CHECK_TEMP', true, 'checkDue', 'warn', 'check']);
  assert.deepEqual(G(hot, T0 + 60 * MIN + 1), ['CHECK_TEMP', true, 'checkDue', 'bad', 'check']);
  assert.deepEqual(G({ ...hot, lastTempAt: undefined }, T0 + 10 * MIN), ['CHECK_TEMP', true, 'noReading', 'warn', 'check']);
  assert.deepEqual(G({ ...hot, lastTempAt: undefined }, T0 + 31 * MIN), ['CHECK_TEMP', true, 'noReading', 'bad', 'check']);
  // the hold limit is the tighter of the batch's own limit and the setting
  // the hold limit is the batch's own; the default setting is only the fallback for a batch with none, and the hard cap caps both
  const noOwn = { ...hot }; delete noOwn.maxHoldH;
  assert.deepEqual(G(noOwn, T0 + 2 * HR + 1, { ...S, defaultMaxHoldH: 2 }).slice(0, 3), ['DISCARD_LOCKOUT', false, 'expired']);
  assert.deepEqual(G(hot, T0 + 2 * HR + 1, { ...S, defaultMaxHoldH: 2 }).slice(0, 2), ['CHECK_TEMP', true]);
  assert.deepEqual(G(hot, T0 + 3 * HR + 1, { ...S, hardCapH: 3 }).slice(0, 3), ['DISCARD_LOCKOUT', false, 'expired']);
  // cold
  const cold = { ...hot, ing: 'slaw', kind: 'cold', lastTempF: 38 };
  const S1 = { ...S, aboveColdGraceH: 1 };
  assert.deepEqual(G(cold, T0 + 4 * HR + 1), ['DISCARD_LOCKOUT', false, 'expired', 'bad', 'discard']);
  assert.deepEqual(G({ ...cold, outSince: T0 + HR }, T0 + 2 * HR + 1, S1), ['DISCARD_LOCKOUT', false, 'temp', 'bad', 'discard']);
  assert.deepEqual(G({ ...cold, outSince: T0 + HR }, T0 + 90 * MIN, S1), ['CHILL_NOW', false, 'aboveCold', 'bad', 'chill']);
  assert.deepEqual(G(cold, T0 + 31 * MIN), ['CHECK_TEMP', true, 'checkDue', 'warn', 'check']);
  assert.deepEqual(G(cold, T0 + 29 * MIN), ['NONE', true, 'ok', 'ok', 'ok']);
  // cooling (P2): 135 -> 70 in 2 h, -> 41 within 6 h; never servable
  const cool = { ...hot, kind: 'cooling', coolStartAt: T0, lastTempAt: undefined, status: 'chill', canServe: false };
  assert.deepEqual(G(cool, T0 + HR), ['CHILL_NOW', false, 'cooling1', 'info', 'chill']);
  assert.equal(E.gate(cool, T0 + HR, S).nextDeadlineAt, T0 + 2 * HR);
  assert.deepEqual(G(cool, T0 + 2 * HR + 1), ['REHEAT_IMMEDIATE', false, 'stage1Missed', 'bad', 'reheat']);
  assert.deepEqual(G({ ...cool, reheats: 1 }, T0 + 2 * HR + 1), ['DISCARD_LOCKOUT', false, 'cooling', 'bad', 'discard']);
  assert.deepEqual(G({ ...cool, stage1At: T0 + HR }, T0 + 5 * HR), ['CHILL_NOW', false, 'cooling2', 'info', 'chill']);
  assert.deepEqual(G({ ...cool, stage1At: T0 + HR }, T0 + 6 * HR + 1), ['DISCARD_LOCKOUT', false, 'cooling', 'bad', 'discard']);
  assert.deepEqual(G({ ...cool, stage1At: T0 + HR, finalAt: T0 + 3 * HR }, T0 + 9 * HR), ['NONE', false, 'cooled', 'ok', 'ok']);
  // discarded / junk
  assert.deepEqual(G({ ...hot, status: 'discard', discardReason: 'manual' }, T0), ['DISCARD_LOCKOUT', false, 'manual', 'bad', 'discard']);
  assert.equal(E.gate(null, T0).canServe, false);
  assert.ok(E.gate({ ...hot, outSince: T0 }, T0, S).text.endsWith(C.safetyLine));
});

test('gates in the engine: tick discards on expiry (outSince logic), single reheat, logTemp on-time/late', () => {
  const k = fresh({ empty: true, settings: settings30() });
  k.do('addBatch', { ing: 'pork', cookedG: 3000, tempF: 160 });
  k.at(T0 + 20 * MIN);
  let r = k.do('logTemp', { batchId: 'b_1', tempF: 150 });
  assert.deepEqual([r.info.onTime, r.info.lateMs], [true, 0]);
  k.at(T0 + 20 * MIN + 45 * MIN);
  r = k.do('logTemp', { batchId: 'b_1', tempF: 130 }); // 15 min late, and below 135
  assert.deepEqual([r.info.onTime, r.info.lateMs, r.info.status], [false, 15 * MIN, 'reheat']);
  const out = T0 + 65 * MIN;
  assert.equal(k.b('b_1').outSince, out);
  k.do('logTemp', { batchId: 'b_1', tempF: 140 }); // back above 135 is NOT a correction: it needs a reheat to 165
  assert.equal(k.b('b_1').status, 'reheat');
  k.at(out + 30 * MIN).do('reheatBatch', { batchId: 'b_1', tempF: 168 });
  assert.deepEqual([k.b('b_1').status, k.b('b_1').reheats, k.b('b_1').outSince], ['ok', 1, undefined]);
  k.do('reheatBatch', { batchId: 'b_1', tempF: 170 }, 'notReheatable');
  r = k.at(out + 40 * MIN).do('logTemp', { batchId: 'b_1', tempF: 128 }); // second dip after its one reheat -> discard now
  assert.deepEqual([k.b('b_1').status, k.b('b_1').discardReason, k.b('b_1').wasteG, k.b('b_1').remainingG], ['discard', 'temp', 3000, 0]);
  assert.ok(r.events.some((e) => e.type === 'batch_discard' && e.reason === 'temp' && e.g === 3000));
  k.do('logTemp', { batchId: 'b_1', tempF: 150 }, 'batchNotServable');
  k.do('logTemp', { batchId: 'b_1', tempF: 400 }, 'badTemp');
  // a batch that dips and is never reheated: discarded by tick exactly after the 2 h grace from the first low READING
  k.do('addBatch', { ing: 'beans', cookedG: 2000, tempF: 160 });
  const t1 = k.now;
  k.at(t1 + 10 * MIN).do('logTemp', { batchId: 'b_2', tempF: 120 });
  k.tickAt(t1 + 10 * MIN + 2 * HR);
  assert.equal(k.b('b_2').status, 'reheat');
  const tr = k.tickAt(t1 + 10 * MIN + 2 * HR + 1);
  assert.equal(k.b('b_2').status, 'discard');
  assert.ok(tr.events.some((e) => e.type === 'batch_status' && e.to === 'discard'));
  assert.equal(k.s.avail.beans.reason, 'safety');
  // a reading at reheat temperature logged through logTemp counts as the reheat
  k.do('addBatch', { ing: 'turkey', cookedG: 2000, tempF: 120 });
  assert.equal(k.s.batches.at(-1).status, 'reheat');
  r = k.do('logTemp', { batchId: k.s.batches.at(-1).id, tempF: 166 });
  assert.equal(r.info.reheated, true);
  assert.deepEqual([k.s.batches.at(-1).status, k.s.batches.at(-1).reheats], ['ok', 1]);
});

test('tick: CHECK_TEMP after 30 min, expiry discard after 4 h; same reference when nothing is due', () => {
  const k = fresh({ settings: settings30() });
  const s0 = k.s;
  assert.equal(E.tick(s0, T0 + 1000).state, s0);
  assert.equal(E.tick(s0, NaN).state, s0);
  const r1 = k.tickAt(T0 + 30 * MIN + 1);
  assert.ok(r1.events.filter((e) => e.type === 'batch_status' && e.to === 'check').length === 10);
  assert.equal(E.tick(k.s, T0 + 31 * MIN).state, k.s, 'check status is stable: no re-evaluation storm');
  // Starters carry quality limits: eight products have 4 hours, brisket and pulled pork 8. Past its limit a
  // quality batch is held off the menu (status past), not thrown out; the 12-hour hard cap throws it out.
  const r2 = k.tickAt(T0 + 4 * HR + 1);
  assert.equal(r2.events.filter((e) => e.type === 'batch_discard').length, 0);
  assert.equal(r2.events.filter((e) => e.type === 'batch_status' && e.to === 'past').length, 8);
  assert.equal(k.s.batches.filter((b) => b.status === 'past').length, 8);
  assert.equal(k.s.avail.brisket_half.ok, true, 'brisket is still within its 8 hours');
  assert.equal(k.s.avail.tea.ok, true);
  assert.equal(k.tickAt(T0 + 8 * HR + 1).events.filter((e) => e.type === 'batch_status' && e.to === 'past').length, 2);
  assert.equal(k.tickAt(T0 + 12 * HR + 1).events.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').length, 10);
  assert.equal(k.s.avail.brisket_half.reason, 'safety');
  assert.equal(k.s.avail.tea.ok, true);
});

test('cooling (P2): start, stage 1, stage 2, missed stage 1 -> reheat and restart', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 3000, tempF: 160 });
  k.do('startCooling', { batchId: 'b_1', g: 4000 }, 'badWeight');
  k.do('startCooling', { batchId: 'b_1', g: 1000 });
  const cid = k.s.batches.at(-1).id;
  assert.deepEqual([k.b('b_1').remainingG, k.b(cid).kind, k.b(cid).canServe, k.b(cid).status], [2000, 'cooling', false, 'chill']);
  assert.equal(E.servable(k.s, 'brisket'), 2000);
  k.at(T0 + 90 * MIN).do('logTemp', { batchId: cid, tempF: 68 });
  assert.equal(k.b(cid).stage1At, T0 + 90 * MIN);
  k.at(T0 + 5 * HR).do('logTemp', { batchId: cid, tempF: 40 });
  assert.deepEqual([k.b(cid).finalAt, k.b(cid).status, k.b(cid).canServe], [T0 + 5 * HR, 'ok', false]);
  // second cooling batch misses stage 1, is reheated once, then misses again -> discard
  k.do('addBatch', { ing: 'pork', cookedG: 2000, tempF: 160 });
  k.do('startCooling', { batchId: k.s.batches.at(-1).id });
  const c2 = k.s.batches.at(-1).id;
  const t2 = k.now;
  k.tickAt(t2 + 2 * HR + 1);
  assert.equal(k.b(c2).status, 'reheat');
  k.do('reheatBatch', { batchId: c2, tempF: 170 });
  assert.deepEqual([k.b(c2).status, k.b(c2).coolStartAt, k.b(c2).reheats], ['chill', k.now, 1]);
  k.tickAt(k.now + 2 * HR + 1);
  assert.deepEqual([k.b(c2).status, k.b(c2).discardReason], ['discard', 'cooling']);
});

test('cooling (F-E8): a batch that already fell below 135 F starts its 2-hour cooling clock at the first low reading', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 3000, tempF: 160 });
  k.at(T0 + 30 * MIN).do('logTemp', { batchId: 'b_1', tempF: 120 });
  assert.equal(k.b('b_1').outSince, T0 + 30 * MIN);
  k.at(T0 + 50 * MIN).do('startCooling', { batchId: 'b_1' });
  const cid = k.s.batches.at(-1).id;
  assert.equal(k.b(cid).coolStartAt, T0 + 30 * MIN, 'the 20 minutes spent too cool are not forgotten');
  assert.equal(k.b(cid).enteredAt, T0 + 50 * MIN);
  k.tickAt(T0 + 30 * MIN + 2 * HR + 1);
  assert.equal(k.b(cid).status, 'reheat', 'stage 1 is judged from the first low reading, not from the tap');
});

test('sanitize (F-B22): closed overnight hours do not make the first round of the next day late', () => {
  const k = fresh({ empty: true });
  k.do('sanitizeDone', {});                                            // noon: next due 4 pm
  const nextMorning = new Date(2026, 9, 18, 11, 30, 0).getTime();       // 11:30 next day, open from 11:00
  const r = k.at(nextMorning).do('sanitizeDone', {});
  assert.deepEqual([r.info.onTime, r.info.lateMs], [true, 0], 'the 4-hour clock restarts at opening');
  assert.equal(E.views.counts(k.s, nextMorning).sanitizeOverdue, false);
  // but a round that is not done within 4 open hours is still late
  const late = new Date(2026, 9, 18, 16, 0, 0).getTime();               // 4.5 h after the 11:30 round
  const r2 = k.at(late).do('sanitizeDone', {});
  assert.equal(r2.info.onTime, false);
  assert.equal(r2.info.lateMs, 30 * MIN);
});

/* ------------------------------------------------------------------ thermal yield ------------------------------------------------------------------ */
test('thermal yield (Texas A&M): hand-computed values and clamps', () => {
  // 85 C, 2 h: 72.9 - 0.85 x 10 - 2.1 x 2 = 60.2 ; chilled 58.1
  let y = E.thermalYield({ endpointC: 85, holdH: 2, rawG: 6000, costPerKgRaw: 24.36 });
  assert.deepEqual([y.hotPct, y.chilledPct, y.cookedG, y.chilledG, y.trueCostPerCookedKg], [60.2, 58.1, 3612, 3486, 40.47]);
  y = E.thermalYield({ endpointC: 75, holdH: 0 });
  assert.deepEqual([y.hotPct, y.chilledPct], [72.9, 70.8]);
  y = E.thermalYield({ endpointC: 90, holdH: 3 }); // 72.9 - 12.75 - 6.3
  assert.deepEqual([y.hotPct, y.chilledPct], [53.85, 51.75]);
  y = E.thermalYield({ endpointC: 120, holdH: 9 }); // clamped to 90 C, 3 h
  assert.deepEqual([y.endpointC, y.holdH, y.hotPct], [90, 3, 53.85]);
  y = E.thermalYield({ endpointC: 'hot', holdH: NaN }); // defaults 85 C, 2 h
  assert.equal(y.hotPct, 60.2);
  const cmp = E.staticYieldComparison({ rawG: 6000, costPerKgRaw: 24.36, endpointC: 85, holdH: 2 });
  // static 50%: cost/kg 48.72 vs model 40.47 -> static overstates cost by 0.602/0.5 - 1 = 20.4%
  assert.deepEqual([cmp.staticCostPerKg, cmp.modelCostPerKg, cmp.costErrorPct, cmp.staticCookedG, cmp.modelCookedG, cmp.weightErrorPct], [48.72, 40.47, 20.4, 3000, 3612, -16.94]);
  // through the engine: thermal for brisket, static yield for pork
  const k = fresh({ empty: true });
  let r = k.do('addBatch', { ing: 'brisket', rawG: 6000, endpointC: 85, holdH: 2, tempF: 160 });
  assert.deepEqual([r.info.cookedG, r.info.yieldPct, r.info.costPerCookedKg], [3612, 60.2, 40.4651]);
  assert.deepEqual([k.s.batches.at(-1).endpointC, k.s.batches.at(-1).holdH, k.s.batches.at(-1).rawG], [85, 2, 6000]);
  r = k.do('addBatch', { ing: 'pork', rawG: 1000, tempF: 160 });
  assert.deepEqual([r.info.cookedG, r.info.yieldPct, r.info.costPerCookedKg], [550, 55, 14]);
  k.do('addBatch', { ing: 'pork', tempF: 160 }, 'badWeight');
  k.do('addBatch', { ing: 'pork', rawG: 1000 }, 'badTemp');
  k.do('addBatch', { ing: 'tea', rawG: 1000, tempF: 40 }, 'unknownIng');
});

/* ------------------------------------------------------------------ learning ------------------------------------------------------------------ */
test('learning prep times: EMA + shrinkage toward the starter, outlier cap, clamps, exclusions', () => {
  const k = fresh();
  const make = (qty = 1) => { k.do('createTicket', { items: [{ menuId: 'brisket_half', qty }] }); return k.t(); };
  let t = make();
  k.at(T0 + 10 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id });
  k.at(T0 + 190 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id }); // 180 s
  assert.deepEqual(k.s.learned.brisket_half, { n: 1, ema: 180, est: 135 }); // (180 + 3 x 120) / 4
  k.at(T0 + 200 * SEC);
  t = make();
  assert.equal(t.items[0].prepSec, 135);
  k.at(T0 + 210 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id });
  k.at(T0 + 270 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id }); // 60 s
  assert.deepEqual(k.s.learned.brisket_half, { n: 2, ema: 156, est: 134.4 }); // ema 0.8x180 + 0.2x60; (2x156 + 360)/5
  t = make(2);
  assert.equal(t.items[0].prepSec, 161); // round(134.4 x 1.2)
  // exclusions: overridden (fire now) and two-step completed without a start
  const k2 = fresh();
  k2.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'mac' }] });
  const t2 = k2.t();
  k2.do('fireNow', { ticketId: t2.id, itemId: t2.items[0].id });
  k2.at(T0 + MIN).do('completeItem', { ticketId: t2.id, itemId: t2.items[0].id });
  k2.do('completeItem', { ticketId: t2.id, itemId: t2.items[1].id });
  assert.deepEqual(k2.s.learned, {});
  // outlier cap (3 x starter = 360 s) and the upper clamp (2.5 x 120 = 300 s, reached after n > 9)
  const k3 = fresh();
  for (let i = 0; i < 12; i++) {
    k3.do('createTicket', { rush: true, items: [{ menuId: 'brisket_half' }] });
    const x = k3.t();
    k3.do('advanceItem', { ticketId: x.id, itemId: x.items[0].id });
    k3.at(k3.now + 1000 * SEC).do('advanceItem', { ticketId: x.id, itemId: x.items[0].id });
    if (i === 0) assert.deepEqual(k3.s.learned.brisket_half, { n: 1, ema: 360, est: 180 });
  }
  assert.equal(k3.s.learned.brisket_half.est, 300);
  // lower clamp 0.5 x 120 = 60 s
  const k4 = fresh();
  for (let i = 0; i < 5; i++) {
    k4.do('createTicket', { rush: true, items: [{ menuId: 'brisket_half' }] });
    const x = k4.t();
    k4.do('advanceItem', { ticketId: x.id, itemId: x.items[0].id });
    k4.do('advanceItem', { ticketId: x.id, itemId: x.items[0].id });
  }
  assert.equal(k4.s.learned.brisket_half.est, 60);
  // changing the starter estimate re-clamps the learned estimate (I14)
  k3.do('updateMenuItem', { id: 'brisket_half', patch: { prepSec: 100 } });
  assert.equal(k3.s.learned.brisket_half.est, 250);
});

/* ------------------------------------------------------------------ undo ------------------------------------------------------------------ */
test('undo of a done restores item, stock, learned and avail; events are marked reverted', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 1000, tempF: 160 });
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }] });
  const t = k.t();
  k.at(T0 + 5 * SEC).do('advanceItem', { ticketId: t.id, itemId: t.items[0].id });
  k.at(T0 + 125 * SEC);
  const pre = k.s;
  const r = k.do('advanceItem', { ticketId: t.id, itemId: t.items[0].id }); // 1000 - 227 = 773 g: still above 700
  assert.equal(r.info.undo, 'Brisket 1/2 done');
  assert.equal(k.b('b_1').remainingG, 773);
  const doneId = r.events.find((e) => e.type === 'item_done').id;
  const u = k.do('undo', {});
  assert.equal(u.info.label, 'Brisket 1/2 done');
  assert.deepEqual(strip(k.s), strip(pre));
  assert.equal(k.s.events.find((e) => e.id === doneId).reverted, true);
  assert.equal(k.s.events.at(-1).type, 'undo');
  k.do('undo', {}, 'undoNothing'); // the "started" entry expired and was pruned when the "done" entry was pushed
});

test('undo: expiry, nothing, bump/void/86/discard/sanitize inverses, conflicts', () => {
  const k = fresh();
  k.do('undo', {}, 'undoNothing');
  k.do('createTicket', { items: [{ menuId: 'tea' }] });
  const id = k.t().id;
  k.do('completeItem', { ticketId: id, itemId: id + '.1' });
  k.at(T0 + 10 * SEC + 1).do('undo', {}, 'undoExpired');
  // bump -> recall (not undoable) -> undo bump is a conflict
  k.do('bumpTicket', { ticketId: id });
  let pre = k.s;
  k.do('recallTicket', { ticketId: id });
  k.do('undo', {}, 'undoConflict');
  // bump undo
  k.s = pre;
  k.do('undo', {});
  assert.equal(k.t().status, 'active');
  // void undo
  pre = k.s;
  k.do('voidTicket', { ticketId: id, reason: 'dropped' });
  k.do('undo', {});
  assert.deepEqual(strip(k.s), strip(pre));
  // 86 undo restores avail.since too
  pre = k.s;
  k.do('toggle86', { menuId: 'mac', on: true });
  k.do('undo', {});
  assert.deepEqual(strip(k.s), strip(pre));
  // discard undo
  pre = k.s;
  k.do('discardBatch', { batchId: 'b_1', reason: 'quality' });
  assert.equal(k.s.avail.brisket_half.reason, 'stock');
  k.do('undo', {});
  assert.deepEqual(strip(k.s), strip(pre));
  // sanitize undo
  pre = k.s;
  k.do('sanitizeDone', {});
  k.do('undo', {});
  assert.deepEqual(strip(k.s), strip(pre));
  // crafted conflict: the item changed after the entry was written
  k.do('createTicket', { items: [{ menuId: 'tea' }] });
  k.do('completeItem', { ticketId: k.t().id, itemId: k.t().items[0].id });
  const bad = JSON.parse(JSON.stringify(k.s));
  bad.tickets.at(-1).items[0].doneAt += 1;
  const r = E.apply(bad, 'undo', {}, k.now);
  assert.equal(r.report, 'undoConflict');
  assert.equal(r.state, bad);
});

test('undo after the batch was discarded: partial, grams dropped, ledger (I2) still balances', () => {
  const k = fresh({ empty: true });
  k.do('addBatch', { ing: 'brisket', cookedG: 1000, tempF: 160 });
  k.do('logTemp', { batchId: 'b_1', tempF: 120 });
  k.do('reheatBatch', { batchId: 'b_1', tempF: 170 }); // its one reheat
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }] });
  k.do('completeItem', { ticketId: k.t().id, itemId: k.t().items[0].id });
  k.do('logTemp', { batchId: 'b_1', tempF: 120 }); // below 135 again -> discarded at once (773 g waste)
  assert.equal(k.b('b_1').wasteG, 773);
  const u = k.do('undo', {});
  assert.equal(u.info.partial, true);
  assert.equal(k.s.ledger.brisket.dropped, 227);
  assert.equal(k.t().items[0].status, 'displayed');
  assert.equal(k.t().items[0].depleted, undefined);
});

/* ------------------------------------------------------------------ settings / menu ------------------------------------------------------------------ */
test('updateSettings, updateMenuItem, updateIngredient: bounds and whitelist', () => {
  const k = fresh();
  let r = k.do('updateSettings', { patch: { safety: { hotHoldF: 130 } } }, 'outOfBounds');
  assert.deepEqual(r.info, { key: 'safety.hotHoldF', min: 135, max: 200 });
  r = k.do('updateSettings', { patch: { safety: { colour: 1 } } }, 'badPatch');
  assert.equal(r.info.key, 'safety.colour');
  k.do('updateSettings', { patch: { pacing: { enabled: 'yes' } } }, 'badPatch');
  k.do('updateSettings', { patch: { __proto__: { x: 1 } } }, 'nothingToDo');
  k.do('updateSettings', JSON.parse('{"patch":{"__proto__":{"x":1}}}'), 'badPatch');
  k.do('updateSettings', { patch: { pacing: { enabled: true } } }, 'nothingToDo');
  k.do('updateSettings', { patch: { channels: { dine_in: { warnSec: 800 } } } }, 'outOfBounds'); // warn must stay below breach 780
  r = k.do('updateSettings', { patch: { channels: [{ id: 'dine_in', warnSec: 300 }], ui: { theme: 'night' } } });
  assert.deepEqual(r.info.keys, ['channels.dine_in.warnSec', 'ui.theme']);
  assert.equal(E.channelThresholds(k.s.settings, 'dine_in').warnSec, 300);
  k.do('updateSettings', { patch: { safety: { sanitizeEveryH: 2 } } });
  k.do('updateSettings', { patch: { service: { openHour: 22 } } }, 'outOfBounds');
  r = k.do('updateMenuItem', { id: 'mac', patch: { price: 6.25, prepConfirmed: true } });
  assert.deepEqual(r.info.keys, ['menu.mac.price', 'menu.mac.prepConfirmed']);
  k.do('updateMenuItem', { id: 'mac', patch: { tracking: 'x' } }, 'badPatch');
  k.do('updateMenuItem', { id: 'mac', patch: { bom: [{ ing: 'gravy', qty: 1 }] } }, 'badPatch');
  k.do('updateMenuItem', { id: 'mac', patch: { zone: 'expo' } }, 'badPatch');
  k.do('updateMenuItem', { id: 'nope', patch: { price: 1 } }, 'unknownMenu');
  k.do('updateMenuItem', { id: 'mac', patch: { archived: true } });
  k.do('createTicket', { items: [{ menuId: 'mac' }] }, 'unknownMenu');
  k.do('updateIngredient', { id: 'buns', patch: { thresholdG: 200 } }); // 150 buns now below the 200 threshold
  assert.equal(k.s.avail.brisket_sand.reason, 'stock');
  k.do('updateIngredient', { id: 'buns', patch: { tcs: false } }, 'badPatch');
});

test('addMenuItem: a new dish can be ordered, paced and edited; bad input is refused', () => {
  const k = fresh();
  const good = { name: 'Brisket plate', zone: 'pit', cat: 'meat', price: 18.5, prepSec: 200, track: 'two' };
  let r = k.do('addMenuItem', good);
  assert.equal(r.info.id, 'brisket_plate');
  const mi = k.s.menu.find((m) => m.id === 'brisket_plate');
  assert.deepEqual([mi.name, mi.short, mi.zone, mi.cat, mi.price, mi.prepSec, mi.track, mi.bom.length, mi.prepConfirmed, mi.archived], ['Brisket plate', 'Brisket plate', 'pit', 'meat', 18.5, 200, 'two', 0, true, false]);
  k.do('addMenuItem', good, 'badPatch'); // the same name again, in any letter case
  k.do('addMenuItem', Object.assign({}, good, { name: 'BRISKET PLATE' }), 'badPatch');
  r = k.do('addMenuItem', Object.assign({}, good, { name: 'Brisket plate!' })); // a different name that makes the same id still gets its own id
  assert.equal(r.info.id, 'brisket_plate_2');
  k.do('addMenuItem', Object.assign({}, good, { name: 'x'.repeat(61) }), 'outOfBounds');
  k.do('addMenuItem', Object.assign({}, good, { name: 'Pie', zone: 'expo' }), 'badPatch');
  k.do('addMenuItem', Object.assign({}, good, { name: 'Pie', cat: 'dessert' }), 'badPatch');
  k.do('addMenuItem', Object.assign({}, good, { name: 'Pie', track: 'three' }), 'badPatch');
  k.do('addMenuItem', Object.assign({}, good, { name: 'Pie', price: -1 }), 'outOfBounds');
  k.do('addMenuItem', Object.assign({}, good, { name: 'Pie', prepSec: 2 }), 'outOfBounds');
  k.do('addMenuItem', Object.assign({}, good, { name: 'Pie', price: '5' }), 'badPatch');
  k.do('addMenuItem', Object.assign({}, good, { name: '   ' }), 'outOfBounds');
  // the new dish goes on a ticket like any other, with its own station, price and one-tap or start-then-finish setting
  k.do('createTicket', { items: [{ menuId: 'brisket_plate', qty: 2 }, { menuId: 'tea' }] });
  const it = k.t().items.find((x) => x.menuId === 'brisket_plate');
  assert.deepEqual([it.zone, it.price, it.track, it.qty], ['pit', 18.5, 'two', 2]);
  // it can be edited afterwards, including how it is cooked and its category
  r = k.do('updateMenuItem', { id: 'brisket_plate', patch: { track: 'one', cat: 'sandwich', prepSec: 90 } });
  assert.deepEqual(r.info.keys, ['menu.brisket_plate.track', 'menu.brisket_plate.cat', 'menu.brisket_plate.prepSec']);
  k.do('updateMenuItem', { id: 'brisket_plate', patch: { track: 'zero' } }, 'badPatch');
  k.do('updateMenuItem', { id: 'brisket_plate', patch: { archived: true } });
  k.do('createTicket', { items: [{ menuId: 'brisket_plate' }] }, 'unknownMenu');
  // a saved state with the custom dishes loads back unchanged
  const back = E.validateState ? E.validateState(JSON.parse(JSON.stringify(k.s))) : null;
  if (back && back.state) assert.ok(back.state.menu.some((m) => m.id === 'brisket_plate_2'));
});

/* ------------------------------------------------------------------ orders ------------------------------------------------------------------ */
const price = (id) => C.menuById[id].price;
const cents = (v) => Math.round(v * 100) / 100;

test('orders: a ticket opens an order, later rounds join it, and the kitchen numbering is unchanged', () => {
  const k = fresh();
  let r = k.do('createTicket', { customer: 'Table 4', channel: 'dine_in', items: [{ menuId: 'brisket_half' }] });
  const oid = r.info.orderId;
  assert.equal(oid, 'o_1');
  assert.deepEqual([r.info.round, k.t().orderId, k.t().round, k.t().num], [1, 'o_1', 1, 101]);
  assert.deepEqual([k.s.orders.length, k.s.orders[0].status, k.s.orders[0].rounds, k.s.orders[0].customer, k.s.orders[0].channel], [1, 'open', 1, 'Table 4', 'dine_in']);
  // round 2: the name and channel come from the order, whatever the payload says
  r = k.do('createTicket', { orderId: oid, customer: 'Someone else', channel: 'takeout', items: [{ menuId: 'slaw' }, { menuId: 'tea', qty: 2 }] });
  assert.deepEqual([r.info.orderId, r.info.round, k.t().customer, k.t().channel, k.t().round, k.t().num], [oid, 2, 'Table 4', 'dine_in', 2, 102]);
  assert.equal(k.s.orders.length, 1);
  assert.equal(k.s.orders[0].rounds, 2);
  // a plain ticket opens its own order
  r = k.do('createTicket', { customer: 'Bar', items: [{ menuId: 'tea' }] });
  assert.equal(r.info.orderId, 'o_2');
  assert.equal(k.s.orders.length, 2);
  // an order that does not exist is refused, and the refusal changes nothing
  k.do('createTicket', { orderId: 'o_99', items: [{ menuId: 'tea' }] }, 'unknownOrder');
  k.do('createTicket', { orderId: 'junk', items: [{ menuId: 'tea' }] }, 'unknownOrder');
  const ev = E.allEvents(k.s).filter((e) => e.type === 'order_opened');
  assert.equal(ev.length, 2);
  // the bill is the food on all its rounds
  const tot = E.orderTotals(k.s, k.s.orders[0]);
  assert.equal(tot.subtotal, cents(price('brisket_half') + price('slaw') + 2 * price('tea')));
  assert.deepEqual([tot.rounds, tot.qty, tot.tax, tot.total], [2, 4, 0, tot.subtotal]);
});

test('orders: payment adds tax, tip and discount, freezes the totals, and a paid order is protected', () => {
  const k = fresh();
  k.do('updateSettings', { patch: { service: { taxRatePct: 6.5 } } });
  const oid = k.do('createTicket', { customer: 'Table 7', items: [{ menuId: 'brisket_half', qty: 2 }, { menuId: 'slaw' }] }).info.orderId;
  const sub = cents(2 * price('brisket_half') + price('slaw'));
  // the open bill previews a discount before anyone is paid
  const prev = E.orderTotals(k.s, k.s.orders[0], { discount: 3 });
  assert.equal(prev.discount, 3);
  assert.equal(prev.tax, cents(cents(sub - 3) * 0.065));
  // refusals: bad method, bad tip, discount larger than the food
  k.do('payOrder', { orderId: oid, method: 'bitcoin' }, 'badPayment');
  k.do('payOrder', { orderId: oid, method: 'card', tip: -1 }, 'badPayment');
  k.do('payOrder', { orderId: oid, method: 'card', tip: '5' }, 'badPayment');
  k.do('payOrder', { orderId: oid, method: 'card', discount: sub + 1 }, 'outOfBounds');
  k.do('payOrder', { orderId: 'o_9', method: 'cash' }, 'unknownOrder');
  const r = k.do('payOrder', { orderId: oid, method: 'card', tip: 7.25, discount: 3 });
  const taxable = cents(sub - 3), tax = cents(taxable * 0.065);
  const o = k.s.orders[0];
  assert.deepEqual([o.status, o.method, o.tip, o.discount], ['paid', 'card', 7.25, 3]);
  assert.deepEqual([o.totals.subtotal, o.totals.discount, o.totals.tax, o.totals.total, o.totals.taxRate], [sub, 3, tax, cents(taxable + tax), 6.5]);
  assert.deepEqual([r.info.total, r.info.tip, r.info.method], [o.totals.total, 7.25, 'card']);
  const paid = E.allEvents(k.s).filter((e) => e.type === 'order_paid');
  assert.equal(paid.length, 1);
  assert.equal(paid[0].total, o.totals.total);
  // later price or tax changes never touch a paid order
  k.do('updateMenuItem', { id: 'brisket_half', patch: { price: 99 } });
  k.do('updateSettings', { patch: { service: { taxRatePct: 10 } } });
  assert.deepEqual(E.orderTotals(k.s, k.s.orders[0]), o.totals);
  // a paid order cannot be paid again, added to, or have its food voided
  k.do('payOrder', { orderId: oid, method: 'cash' }, 'orderNotOpen');
  k.do('createTicket', { orderId: oid, items: [{ menuId: 'tea' }] }, 'orderNotOpen');
  k.do('voidTicket', { ticketId: k.t().id, reason: 'wrong order' }, 'orderNotOpen');
  // reopen, add a round, and pay again: the totals are worked out afresh
  k.do('reopenOrder', { orderId: oid });
  assert.deepEqual([k.s.orders[0].status, k.s.orders[0].totals, k.s.orders[0].method, k.s.orders[0].paidAt], ['open', undefined, undefined, undefined]);
  k.do('reopenOrder', { orderId: oid }, 'orderNotPaid');
  k.do('createTicket', { orderId: oid, items: [{ menuId: 'tea' }] });
  k.do('payOrder', { orderId: oid, method: 'cash' });
  const t2 = k.s.orders[0].totals;
  // round 1 keeps the price it was rung at; only the new round could use a new price (tea did not change)
  assert.equal(t2.subtotal, cents(2 * price('brisket_half') + price('slaw') + price('tea')));
  assert.equal(t2.taxRate, 10);
  assert.equal(k.s.orders[0].tip, 0);
});

test('orders: pay at the counter in one tap; an empty order cannot be paid; only an empty order can be voided', () => {
  const k = fresh();
  // one tap sends the food and takes payment
  let r = k.do('createTicket', { customer: 'Walk-up', channel: 'takeout', items: [{ menuId: 'brisket_half' }], pay: { method: 'cash', tip: 1 } });
  assert.deepEqual([r.info.paid, r.info.total, k.s.orders[0].status, k.s.orders[0].method], [true, price('brisket_half'), 'paid', 'cash']);
  assert.equal(k.t().status, 'active', 'the kitchen still cooks it');
  // a bad payment refuses the whole send: no ticket, no order
  const n = k.s.tickets.length, on = k.s.orders.length;
  k.do('createTicket', { items: [{ menuId: 'tea' }], pay: { method: 'gold' } }, 'badPayment');
  k.do('createTicket', { items: [{ menuId: 'tea' }], pay: { method: 'card', discount: 99 } }, 'outOfBounds');
  assert.deepEqual([k.s.tickets.length, k.s.orders.length], [n, on]);
  // void the only ticket of an open order: nothing is left to pay, and the order can be voided
  r = k.do('createTicket', { customer: 'Table 2', items: [{ menuId: 'tea' }] });
  const oid = r.info.orderId;
  k.do('voidOrder', { orderId: oid, reason: 'customer left' }, 'orderNotEmpty');
  k.do('voidTicket', { ticketId: r.info.ticketId, reason: 'customer left' });
  k.do('payOrder', { orderId: oid, method: 'cash' }, 'orderEmpty');
  k.do('voidOrder', { orderId: oid, reason: '' }, 'reasonRequired');
  k.do('voidOrder', { orderId: oid, reason: 'x'.repeat(41) }, 'noteTooLong');
  k.do('voidOrder', { orderId: oid, reason: 'customer left' });
  const o = k.s.orders.find((x) => x.id === oid);
  assert.deepEqual([o.status, o.voidReason], ['voided', 'customer left']);
  k.do('createTicket', { orderId: oid, items: [{ menuId: 'tea' }] }, 'orderNotOpen');
  k.do('voidOrder', { orderId: oid, reason: 'again' }, 'orderNotOpen');
  // undoing the void of a ticket is refused once its order is voided
  assert.equal(E.checkInvariants(k.s, k.now).length, 0);
});

test('orders: backups keep orders, old saves without orders still load, and damaged orders are repaired', () => {
  const k = fresh();
  const a = k.do('createTicket', { customer: 'Table 1', items: [{ menuId: 'brisket_half' }] }).info.orderId;
  k.do('createTicket', { orderId: a, items: [{ menuId: 'slaw' }] });
  k.do('payOrder', { orderId: a, method: 'card', tip: 4 });
  k.do('createTicket', { customer: 'Table 2', items: [{ menuId: 'tea' }] });
  // the round trip keeps everything
  const back = E.validateBackup(E.serialize(k.s));
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.state.orders, k.s.orders);
  assert.deepEqual(back.state.tickets.map((t) => [t.orderId, t.round]), k.s.tickets.map((t) => [t.orderId, t.round]));
  assert.equal(back.state.seq.order, 2);
  // a save from before orders existed loads with an empty list, and new orders then number from 1
  const old = JSON.parse(E.serialize(k.s));
  delete old.orders; delete old.seq.order;
  for (const t of old.tickets) { delete t.orderId; delete t.round; }
  const o2 = E.validateBackup(old);
  assert.equal(o2.ok, true, JSON.stringify(o2));
  assert.deepEqual([o2.state.orders.length, o2.state.seq.order], [0, 0]);
  const k2 = new K(o2.state, T0 + 1000);
  assert.equal(k2.do('createTicket', { items: [{ menuId: 'tea' }] }).info.orderId, 'o_1');
  // damage: a paid order with no method is dropped; a live ticket on a missing order becomes a plain ticket; repeated rounds are renumbered
  const bad = JSON.parse(E.serialize(k.s));
  bad.orders[0].method = 'gold';
  const t3 = bad.tickets[2]; t3.orderId = 'o_77'; t3.round = 1;
  bad.tickets[1].round = bad.tickets[0].round;
  const fixed = E.validateBackup(bad);
  assert.equal(fixed.ok, true, JSON.stringify(fixed));
  assert.equal(fixed.state.orders.some((o) => o.id === 'o_1'), false);
  assert.equal(fixed.state.tickets[2].orderId, undefined);
  assert.ok(fixed.repaired.some((x) => /dropped order o_1/.test(x)));
  // a backup whose paid totals do not add up is refused whole
  const lie = JSON.parse(E.serialize(k.s));
  lie.orders[0].totals.total += 5;
  assert.equal(E.validateBackup(lie).ok, false);
});

test('orders: pruning keeps open orders and orders with food still on the board', () => {
  const k = fresh();
  const ids = [];
  for (let i = 0; i < 6; i++) { k.at(T0 + i * 10 * SEC); const r = k.do('createTicket', { customer: 'T' + i, items: [{ menuId: 'tea' }] }); ids.push(r.info.orderId); k.do('bumpTicket', { ticketId: r.info.ticketId, force: true }); }
  for (const id of ids.slice(0, 5)) k.do('payOrder', { orderId: id, method: 'cash' }); // the sixth stays open
  const pr = E.prune(k.s, { maxTickets: 3 });
  assert.equal(E.checkInvariants(pr, k.now).length, 0);
  assert.ok(pr.orders.length < k.s.orders.length);
  assert.ok(pr.orders.some((o) => o.id === ids[5] && o.status === 'open'), 'the open order is never pruned');
});

test('allDay aggregation, ticketTiming, ticketProgress, views', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'brisket_half', qty: 2 }, { menuId: 'slaw' }] });
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'mac' }] });
  let ad = E.allDay(k.s);
  assert.deepEqual(ad.map((e) => [e.menuId, e.required]), [['brisket_half', 3], ['slaw', 1], ['mac', 1]]);
  assert.deepEqual(E.allDay(k.s, 'pit').map((e) => e.menuId), ['brisket_half']);
  k.do('completeItem', { ticketId: 't_1', itemId: 't_1.2' }, 'nothingToDo'); // slaw is still on deck
  k.at(T0 + 5 * MIN).do('completeItem', { ticketId: 't_1', itemId: 't_1.2' });
  ad = E.allDay(k.s);
  assert.deepEqual(ad.at(-1), { menuId: 'slaw', name: 'Jalapeno slaw', short: 'Slaw', zone: 'cold', required: 0, total: 1, queued: 0, displayed: 0, cooking: 0, done: 1, zoneBreakdown: {} });
  const t = k.s.tickets[0];
  assert.deepEqual(E.ticketTiming(t, T0 + 539 * SEC, k.s.settings).level, 'ok');
  assert.deepEqual(E.ticketTiming(t, T0 + 540 * SEC, k.s.settings).level, 'warn');
  const tb = E.ticketTiming(t, T0 + 780 * SEC, k.s.settings);
  assert.deepEqual([tb.level, tb.pct, tb.warnMs, tb.breachMs], ['breach', 1, 540000, 780000]);
  const pg = E.ticketProgress(t);
  assert.deepEqual([pg.total, pg.done, pg.qtyTotal, pg.qtyDone, pg.ready], [2, 1, 3, 1, false]);
  const pit = E.views.ticketsForZone(k.s, 'pit');
  assert.equal(pit.length, 2);
  assert.deepEqual(pit[0].items.map((i) => i.menuId), ['brisket_half']);
  const cold = E.views.ticketsForZone(k.s, 'cold');
  assert.equal(cold.length, 0); // slaw done: the slip left the cold station
  const c = E.views.counts(k.s, k.now);
  assert.deepEqual([c.all, c.zones.pit, c.zones.sides, c.zones.cold], [2, 2, 1, 0]);
});

/* ------------------------------------------------------------------ backups ------------------------------------------------------------------ */
test('validateBackup: round trip, repairs, refusals', () => {
  const k = fresh();
  k.do('createTicket', { items: [{ menuId: 'brisket_half' }, { menuId: 'slaw' }] });
  k.at(T0 + 4 * MIN).do('advanceItem', { ticketId: 't_1', itemId: 't_1.1' });
  k.do('advanceItem', { ticketId: 't_1', itemId: 't_1.1' });
  const text = E.serialize(k.s);
  const v = E.deserialize(text);
  assert.equal(v.ok, true, v.error);
  const want = JSON.parse(text); want.undo = [];
  assert.deepEqual(JSON.parse(JSON.stringify(v.state)), want);
  assert.deepEqual(v.repaired, []);
  // envelope form
  assert.equal(E.validateBackup({ v: 1, savedAt: 1, state: JSON.parse(text) }).ok, true);
  // refusals change nothing and say why
  for (const bad of ['', 'nope', '[]', '{"v":2,"tickets":[]}', JSON.stringify({ ...JSON.parse(text), tickets: 5 }), null, 42]) {
    const r = E.validateBackup(bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.error, 'string');
  }
  // repairs
  const o = JSON.parse(text);
  o.stock.buns = -5;
  o.settings.safety.hotHoldF = 120;
  o.tickets.push({ id: 't_77', items: 'x' });
  o.tickets.push(Object.assign({}, o.tickets[0], { id: 't_78', num: 150, items: o.tickets[0].items.map((i) => Object.assign({}, i, { id: 't_78.' + i.id.split('.')[1], doneAt: i.doneAt !== undefined ? i.createdAt : undefined, firedAt: i.firedAt !== undefined ? T0 - 1 : undefined })) }));
  o.menu.push({ id: '__proto__', name: 'evil', zone: 'pit', prepSec: 10, price: 1, bom: [] });
  o.learned.brisket_half = { n: 1, ema: 10000, est: 9999 };
  const r = E.validateBackup(JSON.stringify(o));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.stock.buns, 0);
  assert.equal(r.state.settings.safety.hotHoldF, 135);
  assert.equal(r.state.tickets.length, 1);
  assert.equal(r.state.learned.brisket_half.est, 300);
  assert.ok(r.repaired.some((x) => x.includes('t_78')));
  assert.ok(r.repaired.some((x) => x.includes('ledger buns')));
  assert.deepEqual(E.checkInvariants(r.state), []);
  assert.equal(Object.prototype.x, undefined);
});

test('totality: junk payloads return a closed-set report and the same state', () => {
  const s = E.newState({ now: T0 });
  const junk = [undefined, null, NaN, -1, 1e308, '', '__proto__', [], {}, true, Symbol('x'), () => 1, 10n, JSON.parse('{"__proto__":{"polluted":1}}')];
  for (const type of Object.keys(E.ACTIONS).concat(['__proto__', 'constructor', 'toString', '', 'hasOwnProperty'])) {
    for (const p of junk) {
      for (const field of [null, 'ticketId', 'itemId', 'menuId', 'items', 'patch', 'g', 'tempF', 'batchId', 'ing', 'id', 'zone', 'on', 'reason']) {
        const payload = field ? { [field]: p } : p;
        const r = E.apply(s, type, payload, T0 + 1000);
        assert.ok(E.REPORT_IDS.includes(r.report), type + ' ' + r.report);
        assert.equal(r.info.internalError, undefined, type + ' threw: ' + r.info.internalError);
        if (r.report !== 'ok') assert.equal(r.state, s);
      }
    }
  }
  for (const now of [NaN, undefined, 'x', Infinity]) assert.equal(E.apply(s, 'sanitizeDone', {}, now).state, s);
  assert.equal(E.apply(null, 'undo', {}, T0).report, 'invalidBackup');
  assert.equal(Object.prototype.polluted, undefined);
  for (const id of E.REPORT_IDS) assert.equal(typeof E.REPORTS[id], 'string');
  assert.ok(E.REPORTS.tempTooLow.endsWith(C.safetyLine));
  assert.ok(E.describe('itemUnavailable', { menuId: 'mac', reason: 'safety' }).startsWith('Smoked mac and cheese is on a safety hold'));
});

test('default settings: a temperature check is due every 2 hours and can be set up to 4', () => {
  assert.equal(C.safety.tempCheckEveryMin, 120);
  assert.equal(C.safetyBounds.tempCheckEveryMin[1], 240);
  const k = fresh();
  assert.equal(k.tickAt(T0 + 119 * MIN).events.filter((e) => e.type === 'batch_status' && e.to === 'check').length, 0);
  assert.equal(k.tickAt(T0 + 120 * MIN + 1).events.filter((e) => e.type === 'batch_status' && e.to === 'check').length, 10);
});

test('migration: an old save with the 30-minute default moves to 2 hours once; chosen values and marked saves stay', () => {
  const mk = (safety) => { const s = JSON.parse(JSON.stringify(E.newState({ now: T0 }))); s.settings.safety = Object.assign({}, s.settings.safety, safety); return s; };
  const old = mk({ tempCheckEveryMin: 30 }); delete old.settings.safety.tempIntervalV2;
  const v = E.validateBackup(old);
  assert.equal(v.state.settings.safety.tempCheckEveryMin, 120);
  assert.equal(v.state.settings.safety.tempIntervalV2, true);
  const chosen = mk({ tempCheckEveryMin: 45 }); delete chosen.settings.safety.tempIntervalV2;
  assert.equal(E.validateBackup(chosen).state.settings.safety.tempCheckEveryMin, 45);
  assert.equal(E.validateBackup(mk({ tempCheckEveryMin: 30 })).state.settings.safety.tempCheckEveryMin, 30);
});

test('stagger: starter batches get different ages, the oldest nearest its limit, and no check is due at open', () => {
  const s = E.newState({ now: T0, stagger: true });
  const age = (id) => (T0 - s.batches.find((b) => b.ing === id).enteredAt) / MIN;
  assert.equal(age('brisket'), 455);
  assert.equal(age('pudding'), 20);
  assert.equal(new Set(s.batches.map((b) => b.enteredAt)).size, 10);
  assert.deepEqual(E.checkInvariants(s, T0), []);
  const k = new K(s, T0);
  assert.equal(k.tickAt(T0 + 1).events.filter((e) => e.type === 'batch_status').length, 0);
  assert.equal(k.tickAt(T0 + 26 * MIN).events.filter((e) => e.type === 'batch_status' && e.to === 'past').length, 1, 'brisket goes past its quality limit, it is not thrown out');
  assert.equal(E.newState({ now: T0 }).batches.every((b) => b.enteredAt === T0), true);
});

test('starter false: the pit starts empty with no made-up readings, plain stock stays at par, and a reset can choose either start', () => {
  const s = E.newState({ now: T0, starter: false });
  assert.equal(s.batches.length, 0);
  assert.equal(s.ingredients.filter((i) => !i.tcs).every((i) => s.stock[i.id] === i.parG), true);
  assert.deepEqual(E.checkInvariants(s, T0), []);
  assert.equal(E.newState({ now: T0 }).batches.length, 10, 'the default start is unchanged');
  const k = new K(E.newState({ now: T0, stagger: true }), T0);
  assert.equal(k.do('resetLive', { starter: false }).report, 'ok');
  assert.equal(k.s.batches.length, 0);
  assert.equal(k.do('resetLive', {}).report, 'ok');
  assert.equal(k.s.batches.length, 10, 'resetLive keeps the old default when starter is not given');
  k.do('resetLive', { starter: 'no' }, 'badPatch');
});

test('pullBatch: takes grams from the oldest batch first, keeps the books balanced, and undo puts them back', () => {
  const k = fresh({ stagger: true });
  const old = k.s.batches.find((b) => b.ing === 'brisket');
  k.do('addBatch', { ing: 'brisket', tempF: 150, cookedG: 6000 });
  const fresher = k.s.batches.filter((b) => b.ing === 'brisket' && b.id !== old.id)[0];
  let r = k.do('pullBatch', { ing: 'brisket', g: 1500 });
  assert.equal(r.info.g, 1500);
  assert.deepEqual(r.info.batchIds, [old.id]);
  assert.equal(k.b(old.id).remainingG, old.remainingG - 1500);
  assert.equal(k.b(fresher.id).remainingG, 6000);
  assert.deepEqual(E.checkInvariants(k.s, k.now), []);
  // a pull bigger than the oldest batch spills into the next one
  r = k.do('pullBatch', { ing: 'brisket', g: old.remainingG });
  assert.equal(k.b(old.id).remainingG, 0);
  assert.equal(r.info.batchIds.length, 2);
  assert.deepEqual(E.checkInvariants(k.s, k.now), []);
  k.do('undo', {});
  assert.equal(k.b(old.id).remainingG, old.remainingG - 1500);
  assert.equal(k.b(fresher.id).remainingG, 6000);
  assert.deepEqual(E.checkInvariants(k.s, k.now), []);
  // bad input
  k.do('pullBatch', { ing: 'tea', g: 100 }, 'unknownIng');
  k.do('pullBatch', { ing: 'brisket', g: 0 }, 'badWeight');
  k.do('pullBatch', { ing: 'beans', g: 1e9 }, 'badWeight');
});

/* ------------------------------------------------ quality limit versus safety limit ------------------------------------------------ */
// Builds a state with one ribs batch (4-hour quality limit) and, when asked, a second pork batch and a legacy batch.
function qualityKit(extra) {
  let s = E.newState({ now: T0, empty: true });
  s = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  if (extra) s = extra(s);
  return new K(s, T0);
}

test('quality limit: past the limit the batch stays on the board, off the menu, and is not thrown out; the hard cap throws it out', () => {
  const k = qualityKit();
  const id = k.s.batches[0].id;
  assert.equal(k.s.batches[0].holdBasis, 'quality');
  const r = k.tickAt(T0 + 4 * HR + 1);
  assert.equal(r.events.filter((e) => e.type === 'batch_discard').length, 0);
  assert.deepEqual([k.b(id).status, k.b(id).canServe, k.b(id).action], ['past', false, 'PAST_QUALITY']);
  assert.equal(k.b(id).remainingG, 6000);
  // Only ticks, no other activity: still there at 11 hours, thrown out at the 12-hour hard cap.
  assert.equal(k.tickAt(T0 + 11 * HR).events.filter((e) => e.type === 'batch_discard').length, 0);
  assert.equal(k.tickAt(T0 + 12 * HR - 1).events.filter((e) => e.type === 'batch_discard').length, 0);
  const end = k.tickAt(T0 + 12 * HR + 1);
  assert.equal(end.events.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').length, 1);
  // The stored status never leaves the board without a deadline: no re-evaluation storm while it waits.
  const k2 = qualityKit(); k2.tickAt(T0 + 4 * HR + 1); k2.tickAt(T0 + 4 * HR + 11 * MIN); // lets the simulated 86 sync finish (it starts after the 10-minute quality hold)
  assert.equal(E.tick(k2.s, T0 + 5 * HR).state, k2.s, 'a past batch is stable between ticks');
});

test('safety limit and legacy batches: thrown out at the limit as before', () => {
  const s = E.newState({ now: T0, empty: true });
  const settings = E.defaultSettings();
  const ings = s.ingredients.map((i) => (i.id === 'ribs' ? { ...i, holdBasis: 'safety' } : i));
  let st = E.newState({ now: T0, empty: true, ingredients: ings, settings });
  st = E.apply(st, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  assert.equal(st.batches[0].holdBasis, 'safety');
  assert.equal(E.tick(st, T0 + 4 * HR + 1).events.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').length, 1);
  // A batch saved before limit kinds existed has no kind and acts as a safety limit.
  let q = E.apply(E.newState({ now: T0, empty: true }), 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  q = { ...q, batches: q.batches.map((b) => { const c = { ...b }; delete c.holdBasis; return c; }) };
  assert.equal(E.tick(q, T0 + 4 * HR + 1).events.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').length, 1);
});

test('keepServing: needs initials and a fresh reading in range; covers several batches; never past the hard cap; lapses', () => {
  const k = qualityKit((s) => E.apply(s, 'addBatch', { ing: 'pork', tempF: 160, cookedG: 5000 }, T0 + 30 * MIN).state);
  const [rib, pork] = k.s.batches;
  k.tickAt(T0 + 4 * HR + 1);
  assert.equal(k.b(rib.id).status, 'past');
  const ids = [rib.id, pork.id];
  k.at(T0 + 4 * HR + 2 * MIN).do('keepServing', { batchIds: ids, who: '' }, 'whoRequired');
  k.do('keepServing', { batchIds: [rib.id], who: 'AB', forMin: 0 }, 'badUntil');
  // The last reading was 4 hours ago (older than the 2-hour check interval): refused.
  k.do('keepServing', { batchIds: [rib.id], who: 'AB' }, 'tempReadingNeeded');
  // A reading below 135 F does not qualify either.
  k.do('logTemp', { batchId: rib.id, tempF: 130 });
  k.do('keepServing', { batchIds: [rib.id], who: 'AB' }, 'tempReadingNeeded');
  // The pork is not past its limit yet (its limit is 8 hours): not due.
  k.at(T0 + 4 * HR + 10 * MIN).do('reheatBatch', { batchId: rib.id, tempF: 170 });
  const r = k.do('keepServing', { batchIds: ids, who: 'AB' });
  assert.deepEqual(r.info.kept, [rib.id]);
  assert.deepEqual(r.info.skipped, [{ batchId: pork.id, report: 'qualityNotDue' }]);
  assert.equal(k.b(rib.id).status, 'ok');
  assert.equal(k.b(rib.id).canServe, true);
  const ev = r.events.find((e) => e.type === 'quality_extend');
  assert.equal(ev.who, 'AB');
  assert.equal(ev.until, T0 + 4 * HR + 10 * MIN + 30 * MIN);
  // It lapses after 30 minutes and goes back to past; a repeat needs a fresh reading.
  const lapse = k.tickAt(T0 + 4 * HR + 41 * MIN);
  assert.equal(k.b(rib.id).status, 'past');
  assert.ok(lapse.events.some((e) => e.type === 'batch_status' && e.to === 'past'));
  k.do('logTemp', { batchId: rib.id, tempF: 150 });
  const r2 = k.do('keepServing', { batchIds: [rib.id], who: 'AB', until: T0 + 20 * HR });
  assert.equal(k.b(rib.id).keepUntil, T0 + 12 * HR, 'never past the 12-hour hard cap');
  assert.equal(r2.info.kept.length, 1);
  // Not past a quality limit at all: refused.
  k.do('keepServing', { batchIds: [pork.id], who: 'AB' }, 'qualityNotDue');
});

test('endKeepServing: a logged correction puts the batch back past its limit and keeps the original entry', () => {
  const k = qualityKit();
  const id = k.s.batches[0].id;
  k.tickAt(T0 + 4 * HR + 1);
  k.at(T0 + 4 * HR + 5 * MIN).do('logTemp', { batchId: id, tempF: 150 });
  const kept = k.do('keepServing', { batchIds: [id], who: 'AB', forMin: 60 });
  const orig = kept.events.find((e) => e.type === 'quality_extend');
  k.do('endKeepServing', { batchId: id, who: '' }, 'whoRequired');
  const fix = k.at(T0 + 4 * HR + 10 * MIN).do('endKeepServing', { batchId: id, who: 'AB', note: 'tapped by mistake' });
  const corr = fix.events.find((e) => e.type === 'quality_extend_corrected');
  assert.equal(corr.of, orig.id);
  assert.equal(k.b(id).status, 'past');
  assert.ok(E.allEvents(k.s).some((e) => e.id === orig.id && !e.reverted), 'the original entry is still there');
  k.do('endKeepServing', { batchId: id, who: 'AB' }, 'qualityNotDue');
});

/* ------------------------------------------------ availability reason "quality" and the held channel update ------------------------------------------------ */
// A ribs batch past its 4-hour quality limit takes ribs_half off the menu. Returns the kit just after the limit.
const syncsFor = (k, kind) => k.s.syncs.filter((x) => x.menuId === 'ribs_half' && (!kind || x.kind === kind));
const doneFor = (events) => events.filter((e) => e.type === 'sync_done' && e.menuId === 'ribs_half');
const ribs86 = (k) => { const e = k.s.avail.ribs_half; return [e.ok, e.reason]; };

test('quality 86: past-quality grams give their own reason, and no sync starts during the hold', () => {
  const k = qualityKit();
  k.tickAt(T0 + 4 * HR + 1);
  assert.deepEqual(ribs86(k), [false, 'quality']);
  const sy = syncsFor(k, '86');
  assert.equal(sy.length, 1);
  assert.equal(sy[0].holdUntil, T0 + 4 * HR + 1 + 10 * MIN);
  for (const tg of Object.values(sy[0].targets)) assert.ok(tg.dueAt >= sy[0].holdUntil + 2000);
  assert.equal(doneFor(k.tickAt(T0 + 4 * HR + 9 * MIN).events).length, 0, '0 syncs during the hold');
});

test('quality 86: not kept, the syncs start at the end of the hold with normal latency', () => {
  const k = qualityKit();
  k.tickAt(T0 + 4 * HR + 1);
  const ev = [...k.tickAt(T0 + 4 * HR + 11 * MIN).events, ...k.tickAt(T0 + 4 * HR + 12 * MIN).events];
  const done = doneFor(ev);
  assert.equal(done.length, C.syncTargets.length);
  for (const d of done) assert.ok(d.latencyMs >= 2000 && d.latencyMs <= 40000, 'latency ' + d.latencyMs);
});

test('quality 86: keeping inside the hold makes no syncs at all', () => {
  const k = qualityKit();
  const before = k.s.syncs.length; // the two start-up syncs from adding the batch
  k.tickAt(T0 + 4 * HR + 1);
  k.at(T0 + 4 * HR + 3 * MIN).do('logTemp', { batchId: k.s.batches[0].id, tempF: 150 });
  k.do('keepServing', { batchIds: [k.s.batches[0].id], who: 'AB', forMin: 30 });
  assert.equal(k.s.avail.ribs_half.ok, true);
  assert.equal(k.s.syncs.filter((x) => x.kind === '86').length, 0, 'the held update was dropped');
  assert.equal(k.s.syncs.length, before, 'and no back sync was made');
  const ev = [...k.tickAt(T0 + 4 * HR + 20 * MIN).events];
  assert.equal(doneFor(ev).length, 0);
});

test('quality 86: a safety lock during the hold starts the sync at once; mixed locks give safety', () => {
  const k = qualityKit((s) => E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 3000 }, T0 + 3 * HR).state);
  // The first batch passes its quality limit at 4 h; the second is still good until 7 h.
  const [a] = k.s.batches;
  k.tickAt(T0 + 4 * HR + 1);
  assert.equal(k.b(a.id).status, 'past');
  assert.equal(k.s.avail.ribs_half.ok, true, 'the second batch still serves');
  // Discard the good batch: only past-quality grams remain.
  k.at(T0 + 4 * HR + 2 * MIN).do('discardBatch', { batchId: k.s.batches[1].id, reason: 'quality' });
  assert.deepEqual(ribs86(k), [false, 'quality']);
  const held = syncsFor(k, '86')[0];
  assert.ok(held.holdUntil > k.now);
  // The past batch cools below the hot-hold line: now it is a safety lock.
  const w = E.defaultSettings().safety;
  k.tickAt(T0 + 4 * HR + 3 * MIN);
  k.at(T0 + 4 * HR + 3 * MIN).do('logTemp', { batchId: a.id, tempF: w.hotHoldF - 20 });
  assert.equal(k.s.avail.ribs_half.reason, 'safety', 'mixed or unsafe locks give safety');
  const after = syncsFor(k, '86')[0];
  assert.equal(after.holdUntil, k.now, 'the hold ended at once');
  for (const tg of Object.values(after.targets)) assert.ok(tg.dueAt <= k.now + 40000);
});

test('quality 86: hold 0 syncs at once as before; the setting is bounded; undo and backup round-trip', () => {
  const settings = E.defaultSettings(); settings.service.qualitySyncHoldMin = 0;
  let s = E.newState({ now: T0, empty: true, settings });
  s = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  const k0 = new K(s, T0); k0.tickAt(T0 + 4 * HR + 1);
  assert.equal(syncsFor(k0, '86')[0].holdUntil, undefined);
  // Held sync survives a backup round trip.
  const k = qualityKit();
  k.tickAt(T0 + 4 * HR + 1);
  const back = E.validateBackup(E.serialize(k.s));
  assert.equal(back.ok, true);
  assert.equal(back.state.syncs.find((x) => x.kind === '86').holdUntil, k.s.syncs.find((x) => x.kind === '86').holdUntil);
  // The setting refuses a wait above 30 minutes.
  k.do('updateSettings', { patch: { service: { qualitySyncHoldMin: 45 } } }, 'outOfBounds');
  k.do('updateSettings', { patch: { service: { qualitySyncHoldMin: 15 } } });
  assert.equal(k.s.settings.service.qualitySyncHoldMin, 15);
});

/* ------------------------------------------------ planned batches ------------------------------------------------ */
test('planBatch: adds a plan with the rest time on top, refuses nonsense, undo and cancel both come back', () => {
  const k = new K(E.newState({ now: T0, empty: true }), T0);
  k.do('planBatch', { ing: 'tea', grams: 5000, offAt: T0 + HR }, 'unknownIng');
  k.do('planBatch', { ing: 'pork', grams: 0, offAt: T0 + HR }, 'badWeight');
  k.do('planBatch', { ing: 'pork', grams: 5000, offAt: T0 + 50 * HR }, 'badPlanTime');
  k.do('planBatch', { ing: 'pork', grams: 5000, offAt: T0 - 20 * HR }, 'badPlanTime');
  k.do('cancelPlan', { planId: 'pl_9' }, 'unknownPlan');
  const r = k.do('planBatch', { ing: 'pork', grams: 5000, offAt: T0 + 2 * HR });
  const e = k.s.planned[0];
  assert.deepEqual([e.ing, e.grams, e.offAt, e.readyAt], ['pork', 5000, T0 + 2 * HR, T0 + 3 * HR], 'pork rests 1 hour');
  assert.equal(r.info.planId, e.id);
  k.do('undo', {});
  assert.equal(k.s.planned.length, 0, 'undo takes the plan out');
  k.do('planBatch', { ing: 'pork', grams: 5000, offAt: T0 + 2 * HR });
  k.do('planBatch', { ing: 'ribs', grams: 3000, offAt: T0 + 3 * HR });
  const ids = k.s.planned.map((x) => x.id);
  k.do('cancelPlan', { planId: ids[0] });
  assert.deepEqual(k.s.planned.map((x) => x.id), [ids[1]]);
  k.do('undo', {});
  assert.deepEqual(k.s.planned.map((x) => x.id), ids, 'undo puts the cancelled plan back in its place');
});

test('planned batches: the real batch of that product takes the earliest plan; other products leave it alone', () => {
  const k = new K(E.newState({ now: T0, empty: true }), T0);
  k.do('planBatch', { ing: 'pork', grams: 5000, offAt: T0 + 5 * HR });
  k.do('planBatch', { ing: 'pork', grams: 6000, offAt: T0 + 2 * HR });
  k.do('planBatch', { ing: 'ribs', grams: 3000, offAt: T0 + 2 * HR });
  const first = k.s.planned.find((x) => x.grams === 6000).id;
  k.do('addBatch', { ing: 'pork', tempF: 160, cookedG: 4000 });
  assert.equal(k.s.planned.length, 2);
  assert.equal(k.s.planned.some((x) => x.id === first), false, 'the earliest pork plan went');
  k.do('addBatch', { ing: 'mac', tempF: 160, cookedG: 4000 });
  assert.equal(k.s.planned.length, 2, 'another product does not consume a plan');
  k.do('addBatch', { ing: 'pork', tempF: 160, cookedG: 4000, src: 'sample' });
  assert.equal(k.s.planned.length, 2, 'a sample batch is not a real one');
});

test('planned batches: expire 2 hours after serving time, with an event; backup round trip', () => {
  const k = new K(E.newState({ now: T0, empty: true }), T0);
  k.do('planBatch', { ing: 'pork', grams: 5000, offAt: T0 + HR });
  const back = E.validateBackup(E.serialize(k.s));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state.planned, k.s.planned);
  assert.equal(back.state.seq.plan, 1);
  // Ready at T0+2h; still there until T0+4h.
  assert.equal(k.tickAt(T0 + 4 * HR - 1).state.planned.length, 1);
  const r = k.tickAt(T0 + 4 * HR);
  assert.equal(k.s.planned.length, 0);
  assert.equal(r.events.filter((e) => e.type === 'plan_expired').length, 1);
  // Junk in a backup is dropped, not kept.
  const bad = JSON.parse(E.serialize(k.s)); bad.planned = [{ id: 'pl_1', ing: 'tea', grams: 5, offAt: 1, readyAt: 2 }, { id: 'pl_2', ing: 'pork', grams: -1, offAt: 1, readyAt: 2 }];
  assert.equal(E.validateBackup(bad).state.planned.length, 0);
});

/* ------------------------------------------------ editable ladder thresholds (settings.alerts) ------------------------------------------------ */
test('settings.alerts.ladderThresholds: accepts good lists, refuses bad ones, round-trips a backup', () => {
  const k = new K(E.newState({ now: T0, empty: true }), T0);
  const set = (v, exp = 'ok') => k.do('updateSettings', { patch: { alerts: { ladderThresholds: v } } }, exp);
  assert.equal(k.s.settings.alerts.ladderThresholds, null);
  set({ default: [45, 20, 10], byIng: { brisket: [180, 60, 15] } });
  set({ default: [45, 10, 20] }, 'badPatch');                 // not falling
  set({ default: [45, 45] }, 'badPatch');                     // not strictly falling
  set({ default: [30, 4] }, 'outOfBounds');                   // the last warning needs 5 minutes or more
  set({ default: [300, 10] }, 'outOfBounds');
  set({ default: [60, 50, 40, 30, 20, 10] }, 'badPatch');     // more than 5
  set({ default: [30.5, 10] }, 'badPatch');
  set({ default: [] }, 'badPatch');
  set({ byIng: { tea: [30, 10] } }, 'badPatch');              // not a cooked product
  set({ byIng: { nope: [30, 10] } }, 'badPatch');
  set({ extra: 1 }, 'badPatch');
  set('x', 'badPatch');
  assert.deepEqual(k.s.settings.alerts.ladderThresholds, { default: [45, 20, 10], byIng: { brisket: [180, 60, 15] } });
  const back = E.validateBackup(E.serialize(k.s));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state.settings.alerts.ladderThresholds, k.s.settings.alerts.ladderThresholds);
  const bad = JSON.parse(E.serialize(k.s)); bad.settings.alerts.ladderThresholds = { default: [10, 20] };
  const fixed = E.validateBackup(bad);
  assert.equal(fixed.state.settings.alerts.ladderThresholds, null, 'a bad list is reset');
  set(null);
  assert.equal(k.s.settings.alerts.ladderThresholds, null);
});

/* ------------------------------------------------ put-off reminders (snoozeAlert) ------------------------------------------------ */
test('snoozeAlert: 1 to 30 minutes, clamped before the last warning, refused for past or gone batches; undo, clear, prune, backup', () => {
  const k = qualityKit();
  const id = k.s.batches[0].id;
  k.at(T0 + 2 * HR);
  k.do('snoozeAlert', { batchId: id, forMin: 0 }, 'badSnooze');
  k.do('snoozeAlert', { batchId: id, forMin: 31 }, 'badSnooze');
  k.do('snoozeAlert', { batchId: id, forMin: 'x' }, 'badSnooze');
  k.do('snoozeAlert', { batchId: 'b_99', forMin: 10 }, 'unknownBatch');
  const r = k.do('snoozeAlert', { batchId: id, forMin: 10 });
  assert.equal(r.info.until, T0 + 2 * HR + 10 * MIN);
  assert.deepEqual(k.s.alertSnoozes, { [id]: T0 + 2 * HR + 10 * MIN });
  k.do('undo', {});
  assert.deepEqual(k.s.alertSnoozes, {});
  k.do('snoozeAlert', { batchId: id, forMin: 10 });
  const back = E.validateBackup(E.serialize(k.s));
  assert.deepEqual(back.state.alertSnoozes, k.s.alertSnoozes);
  // Cleared by hand, then undone.
  k.do('clearSnooze', { batchId: id });
  assert.deepEqual(k.s.alertSnoozes, {});
  k.do('clearSnooze', { batchId: id }, 'unknownBatch');
  k.do('undo', {});
  assert.equal(Object.keys(k.s.alertSnoozes).length, 1);
  // It runs out by itself.
  const t = k.tickAt(T0 + 2 * HR + 11 * MIN);
  assert.deepEqual(k.s.alertSnoozes, {});
  // The limit is 4 h: 10 minutes before it a 30-minute reminder is clamped to 5 minutes before the limit.
  k.at(T0 + 3 * HR + 50 * MIN);
  const c = k.do('snoozeAlert', { batchId: id, forMin: 30 });
  assert.equal(c.info.until, T0 + 4 * HR - 5 * MIN);
  k.at(T0 + 3 * HR + 56 * MIN).do('snoozeAlert', { batchId: id, forMin: 10 }, 'badSnooze');
  // Past its limit: refused. A discarded batch drops its reminder.
  k.tickAt(T0 + 4 * HR + 1);
  k.do('snoozeAlert', { batchId: id, forMin: 10 }, 'badSnooze');
  const k2 = qualityKit(); k2.at(T0 + HR).do('snoozeAlert', { batchId: k2.s.batches[0].id, forMin: 20 });
  k2.do('discardBatch', { batchId: k2.s.batches[0].id, reason: 'manual' });
  k2.tickAt(T0 + HR + MIN);
  assert.deepEqual(k2.s.alertSnoozes, {});
});
