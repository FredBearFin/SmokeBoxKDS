// The Close the day view logic: the sheet's numbers must agree with what the engine's closeDay logs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '87-office-closeday']);
const E = SB.engine;
const { closeDayModel, whatClosingDoes, blockedLine } = SB.office.closeDayPure;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const MIN = 60e3;

// Applies one engine action and returns the new state, failing on any refusal.
function go(k, type, payload, dt = 0) {
  k.now += dt;
  const r = E.apply(k.s, type, payload, k.now);
  assert.equal(r.report, 'ok', type + ' -> ' + r.report);
  k.s = r.state;
  return r;
}

test('the model counts open orders and blocks the button with a plain line', () => {
  const k = { s: E.newState({ now: T0 }), now: T0 };
  go(k, 'createTicket', { customer: 'Table 1', items: [{ menuId: 'tea' }] }, MIN);
  const m = closeDayModel(k.s, k.now);
  assert.equal(m.open.length, 1);
  assert.equal(m.open[0].customer, 'Table 1');
  assert.ok(m.open[0].total > 0);
  assert.match(blockedLine(m), /1 order is still open\. Pay or void it first\./);
});

test('the model agrees with the day_closed event the engine logs', () => {
  const k = { s: E.newState({ now: T0 }), now: T0 };
  const a = go(k, 'createTicket', { customer: 'A', items: [{ menuId: 'tea' }, { menuId: 'slaw' }] }, MIN).info.orderId;
  const b = go(k, 'createTicket', { customer: 'B', items: [{ menuId: 'tea' }] }, MIN).info.orderId;
  go(k, 'payOrder', { orderId: a, method: 'cash', tip: 2 }, MIN);
  go(k, 'payOrder', { orderId: b, method: 'card', tip: 1.5 }, MIN);
  const m = closeDayModel(k.s, k.now);
  assert.equal(blockedLine(m), '');
  go(k, 'closeDay', {}, MIN);
  const ev = k.s.events.filter((e) => e.type === 'day_closed').pop();
  assert.equal(m.paid, ev.orders);
  assert.equal(m.tip, ev.tip);
  assert.equal(m.tax, ev.tax);
  assert.equal(m.collected, Math.round((ev.total + ev.tip) * 100) / 100);
  assert.equal(m.methods.find((x) => x.id === 'cash').collected, Math.round((ev.byMethod.cash.total + ev.byMethod.cash.tip) * 100) / 100);
  assert.equal(m.cashExpected, m.methods.find((x) => x.id === 'cash').collected);
  assert.ok(closeDayModel(k.s, k.now).closedAt, 'a closed day says when it was closed');
});

test('another service day is not mixed in, and an empty day is all zeros', () => {
  const k = { s: E.newState({ now: T0 }), now: T0 };
  const a = go(k, 'createTicket', { customer: 'A', items: [{ menuId: 'tea' }] }, MIN).info.orderId;
  go(k, 'payOrder', { orderId: a, method: 'cash' }, MIN);
  const nextDay = closeDayModel(k.s, k.now + 24 * 3600e3);
  assert.equal(nextDay.paid, 0);
  assert.equal(nextDay.collected, 0);
  const empty = closeDayModel(null, T0);
  assert.equal(empty.paid, 0);
  assert.deepEqual(empty.open, []);
});

test('the explanation says plainly that closing does not lock the day', () => {
  assert.match(whatClosingDoes(4), /does not lock anything/);
  assert.match(whatClosingDoes(4), /4 am/);
});
