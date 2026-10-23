// closeDay: refuses while orders are open, totals the paid orders by method, optionally discards leftovers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine, C = SB.config;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const HR = 3600e3, MIN = 60e3;
const price = (id) => C.menuById[id].price;

// Applies one action, checks the invariants, and returns the result.
function go(k, type, payload, expect = 'ok', dt = 0) {
  k.now += dt;
  const r = E.apply(k.s, type, payload, k.now);
  assert.equal(r.report, expect, type + ' -> ' + r.report + ' ' + JSON.stringify(r.info));
  if (r.report === 'ok') k.s = r.state; else assert.equal(r.state, k.s);
  assert.deepEqual(E.checkInvariants(k.s, k.now), []);
  return r;
}
const kit = () => ({ s: E.newState({ now: T0 }), now: T0 });

test('closeDay is refused while an order is open, with a fix the cook can follow', () => {
  const k = kit();
  const a = go(k, 'createTicket', { customer: 'Table 1', items: [{ menuId: 'tea' }] }, 'ok', MIN).info.orderId;
  const b = go(k, 'createTicket', { customer: 'Table 2', items: [{ menuId: 'slaw' }] }, 'ok', MIN).info.orderId;
  const r = go(k, 'closeDay', {}, 'ordersStillOpen');
  assert.equal(r.info.count, 2);
  assert.deepEqual(r.info.orderIds, [a, b]);
  assert.match(E.describe('ordersStillOpen', r.info, k.s.settings), /^2 orders still open\. Take payment on each one, or void them/);
  go(k, 'payOrder', { orderId: a, method: 'cash' });
  assert.equal(go(k, 'closeDay', {}, 'ordersStillOpen').info.count, 1);
  assert.match(E.describe('ordersStillOpen', { count: 1 }, k.s.settings), /Take payment on it, or void it/);
  // voiding the last one needs its ticket voided first
  go(k, 'voidTicket', { ticketId: k.s.tickets[1].id, reason: 'customer left' });
  go(k, 'voidOrder', { orderId: b, reason: 'customer left' });
  go(k, 'closeDay', {});
});

test('closeDay totals paid orders by cash, card and other and counts voids', () => {
  const k = kit();
  k.s = E.newState({ now: T0, settings: Object.assign(E.defaultSettings(), { service: Object.assign(E.defaultSettings().service, { taxRatePct: 10 }) }) });
  const o1 = go(k, 'createTicket', { items: [{ menuId: 'brisket_half', qty: 2 }] }, 'ok', MIN).info.orderId;
  const o2 = go(k, 'createTicket', { items: [{ menuId: 'slaw' }] }, 'ok', MIN).info.orderId;
  const o3 = go(k, 'createTicket', { items: [{ menuId: 'tea' }] }, 'ok', MIN).info.orderId;
  const o4 = go(k, 'createTicket', { items: [{ menuId: 'tea' }] }, 'ok', MIN).info.orderId;
  go(k, 'payOrder', { orderId: o1, method: 'cash', tip: 5 });
  go(k, 'payOrder', { orderId: o2, method: 'card', tip: 1.5, discount: 1 });
  go(k, 'payOrder', { orderId: o3, method: 'other' });
  go(k, 'voidTicket', { ticketId: k.s.tickets[3].id, reason: 'dropped' });
  go(k, 'voidOrder', { orderId: o4, reason: 'dropped' });
  const r = go(k, 'closeDay', {}, 'ok', MIN);
  const ev = r.events.find((e) => e.type === 'day_closed');
  const c = (v) => Math.round(v * 100) / 100;
  const sub1 = c(2 * price('brisket_half'));
  assert.equal(ev.orders, 3);
  assert.equal(ev.voidedOrders, 1);
  assert.equal(ev.tickets, 3);
  assert.equal(ev.voidedTickets, 1);
  assert.equal(ev.byMethod.cash.count, 1);
  assert.equal(ev.byMethod.cash.total, c(sub1 + c(sub1 * 0.1)));
  assert.equal(ev.byMethod.cash.tip, 5);
  assert.equal(ev.byMethod.card.discount, 1);
  assert.equal(ev.byMethod.other.count, 1);
  assert.equal(ev.tip, 6.5);
  assert.equal(c(ev.byMethod.cash.total + ev.byMethod.card.total + ev.byMethod.other.total), ev.total);
  assert.equal(ev.again, false);
  assert.equal(ev.leftovers, 'keep');
  assert.deepEqual(k.s.lastClose, { day: ev.day, at: ev.t, leftovers: 'keep' });
  // a late sale and a second close the same day covers the whole day and says so
  const o5 = go(k, 'createTicket', { items: [{ menuId: 'tea' }] }, 'ok', MIN).info.orderId;
  go(k, 'payOrder', { orderId: o5, method: 'card' });
  const r2 = go(k, 'closeDay', {}, 'ok', MIN);
  const ev2 = r2.events.find((e) => e.type === 'day_closed');
  assert.equal(ev2.orders, 4);
  assert.equal(ev2.again, true);
});

test('closeDay only counts the service day it is closed in', () => {
  const k = kit();
  const o = go(k, 'createTicket', { items: [{ menuId: 'tea' }] }).info.orderId;
  go(k, 'payOrder', { orderId: o, method: 'cash' });
  const r = go(k, 'closeDay', {}, 'ok', 20 * HR); // next service day
  const ev = r.events.find((e) => e.type === 'day_closed');
  assert.equal(ev.orders, 0);
  assert.equal(ev.total, 0);
});

test('closeDay leftovers: keep leaves batches, discard throws them out and the books balance', () => {
  const k = kit();
  const live = k.s.batches.filter((b) => b.remainingG > 0 && b.status !== 'discard');
  assert.ok(live.length > 0);
  go(k, 'closeDay', { leftovers: 'keep' });
  assert.equal(k.s.batches.filter((b) => b.remainingG > 0).length, live.length);
  const r = go(k, 'closeDay', { leftovers: 'discard' });
  assert.equal(k.s.batches.filter((b) => b.remainingG > 0).length, 0);
  const ev = r.events.find((e) => e.type === 'day_closed');
  assert.equal(ev.discarded, live.length);
  assert.ok(ev.discardedG > 0);
  assert.equal(r.events.filter((e) => e.type === 'batch_discard').length, live.length);
  assert.equal(ev.again, true);
});

test('closeDay refuses a bad leftovers choice and junk, and an old save without lastClose still loads', () => {
  const k = kit();
  for (const v of ['maybe', 1, true, {}, []]) go(k, 'closeDay', { leftovers: v }, 'badLeftovers');
  go(k, 'closeDay', null);
  const saved = JSON.parse(E.serialize(k.s));
  assert.equal(saved.lastClose.leftovers, 'keep');
  const back = E.validateBackup(JSON.stringify(saved));
  assert.equal(back.ok, true, back.error);
  assert.deepEqual(back.state.lastClose, saved.lastClose);
  delete saved.lastClose;
  const old = E.validateBackup(JSON.stringify(saved));
  assert.equal(old.ok, true);
  assert.equal(old.state.lastClose, undefined);
  saved.lastClose = { day: 'yesterday', at: 'x' };
  const bad = E.validateBackup(JSON.stringify(saved));
  assert.equal(bad.ok, true);
  assert.equal(bad.state.lastClose, undefined);
  assert.ok(bad.repaired.includes('lastClose dropped'));
  assert.ok(E.checkInvariants(Object.assign({}, k.s, { lastClose: { day: 'x' } })).some((x) => x.startsWith('I17')));
  // a fresh board has never been closed
  go(k, 'resetLive', {});
  assert.deepEqual(E.checkInvariants(k.s), []);
  assert.equal(k.s.lastClose, undefined);
});
