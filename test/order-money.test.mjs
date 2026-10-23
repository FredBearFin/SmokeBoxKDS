// The order screen's preview and the engine's charge are the same numbers (review finding 9): random baskets, random tax rates,
// with and without food already on the open order. The preview comes from SB.orderMath.previewTotals (which asks the engine's own
// orderTotals); the truth is what the engine really records after the round is sent. Also the tip split in whole cents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '66-order-math']);
const E = SB.engine, OM = SB.orderMath;
const T0 = Date.UTC(2026, 9, 12, 16, 0, 0);
// A small deterministic random number generator so a failure can be repeated.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const RATES = [7.25, 8.875, 4.712, 19.99, 6.25, 10, 0, 5.5, 8.25, 13.0];
const ap = (s, t, p) => { const r = E.apply(s, t, p, T0); assert.equal(r.report, 'ok', t + ' ' + r.report + JSON.stringify(r.info)); return r.state; };

test('preview equals charge: 1500 random baskets at many tax rates, new orders and rounds added to an open order', () => {
  const rnd = rng(20260101);
  let checked = 0, withExisting = 0;
  for (let n = 0; n < 1500; n++) {
    let s = E.newState({ now: T0, blank: true });
    const rate = RATES[Math.floor(rnd() * RATES.length)];
    { const r = E.apply(s, 'updateSettings', { patch: { service: { taxRatePct: rate } } }, T0); assert.ok(r.report === 'ok' || r.report === 'nothingToDo', r.report); s = r.state; }
    const ids = [];
    for (let i = 0; i < 6; i++) { const price = Math.round((0.01 + rnd() * 99.98) * 100) / 100; s = ap(s, 'addMenuItem', { name: 'D' + i, zone: 'pit', cat: 'meat', price, prepSec: 60, track: 'one' }); ids.push(s.menu[s.menu.length - 1].id); }
    const basket = () => { const k = 1 + Math.floor(rnd() * 5); const out = []; for (let i = 0; i < k; i++) out.push({ menuId: ids[Math.floor(rnd() * ids.length)], qty: 1 + Math.floor(rnd() * 9) }); return out; };
    let orderId = null;
    if (rnd() < 0.5) { s = ap(s, 'createTicket', { customer: 'First', channel: 'dine_in', items: basket() }); orderId = s.tickets[s.tickets.length - 1].orderId; withExisting++; }
    const lines = basket();
    const order = orderId ? E.findOrder(s, orderId) : null;
    const price = (id) => s.menu.find((m) => m.id === id).price;
    const pre = OM.previewTotals(s, order, lines.map((l) => ({ price: price(l.menuId), qty: l.qty })));
    s = ap(s, 'createTicket', Object.assign({ customer: 'Second', channel: 'dine_in', items: lines }, orderId ? { orderId } : {}));
    const oid = orderId || s.tickets[s.tickets.length - 1].orderId;
    const real = E.orderTotals(s, E.findOrder(s, oid));
    assert.deepEqual({ sub: pre.sub, tax: pre.tax, total: pre.total }, { sub: real.subtotal, tax: real.tax, total: real.total }, 'case ' + n + ' at ' + rate + ' percent');
    checked++;
  }
  assert.equal(checked, 1500);
  assert.ok(withExisting > 500, 'about half of the cases add a round to an open order');
});
test('the old floating-point way was wrong and this one is not: 6.25 percent on 2.32 is 15 cents of tax', () => {
  let s = E.newState({ now: T0, blank: true });
  s = ap(s, 'updateSettings', { patch: { service: { taxRatePct: 6.25 } } });
  const pre = OM.previewTotals(s, null, [{ price: 2.32, qty: 1 }]);
  assert.equal(pre.tax, 0.15);
  assert.equal(pre.total, 2.47);
  assert.equal(Math.round(2.32 * 6.25) / 100, 0.14, 'the old preview gave 14 cents');
});
test('an empty draft previews as nothing, and an open order is not changed by previewing', () => {
  let s = E.newState({ now: T0, blank: true });
  s = ap(s, 'updateSettings', { patch: { service: { taxRatePct: 8.875 } } });
  const before = JSON.stringify(s.tickets);
  assert.deepEqual(OM.previewTotals(s, null, []), { sub: 0, tax: 0, total: 0 });
  assert.equal(JSON.stringify(s.tickets), before, 'the state is untouched');
});
test('tip split: a percentage of the food in whole cents, half a cent up', () => {
  assert.equal(OM.pctOfDollars(23.5, 15), 3.53);
  assert.equal(OM.pctOfDollars(23.5, 18), 4.23);
  assert.equal(OM.pctOfDollars(10, 20), 2);
  assert.equal(OM.pctOfDollars(0, 20), 0);
  assert.equal(OM.pctOfDollars(-5, 20), 0);
  assert.equal(OM.pctOfDollars(2.32, 25), 0.58);
});
