// Independent-review fixes for money: the draft preview uses the charge's own whole-cent rule (#9 helper), numbers are bounded and finite (#8),
// and a sale stays in the day it was made (#10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;

test('#9 helper: totalsOf gives the engine\'s own cents for the reviewer\'s case (6.25 percent on 2.32) and for every rate and subtotal tried', () => {
  assert.equal(E.totalsOf([{ price: 2.32, qty: 1 }], { taxRatePct: 6.25 }).tax, 0.15);
  let bad = 0;
  for (const rate of [4, 5, 5.5, 6, 6.25, 6.5, 7, 7.25, 7.5, 8, 8.25, 8.875, 9, 9.5, 10]) {
    for (let c = 1; c <= 30000; c += 37) {
      const t = E.totalsOf([{ price: c / 100, qty: 1 }], { taxRatePct: rate });
      const expect = Math.floor((c * Math.round(rate * 1e4) + 500000) / 1e6);
      if (Math.round(t.tax * 100) !== expect || Math.round(t.total * 100) !== c + expect) bad++;
    }
  }
  assert.equal(bad, 0);
  const t = E.totalsOf([{ price: 3.1, qty: 2 }, { price: 1.15, qty: 1 }], { extraSubtotalCents: 500, discount: 1, taxRatePct: 8 });
  assert.deepEqual([t.subtotal, t.discount, t.qty], [12.35, 1, 3]);
  assert.deepEqual(E.totalsOf([], {}).total, 0);
  assert.equal(E.totalsOf([{ price: NaN, qty: -2 }, null], { taxRatePct: 8 }).total, 0, 'junk lines add nothing');
});

// A tiny saved kitchen as the app writes it, from the engine itself, with one dish sold.
function kitchen() {
  let s = E.newState({ now: 1700000000000, starter: false });
  const r = E.apply(s, 'createTicket', { customer: 'Pat', items: [{ menuId: 'tea', qty: 2 }] }, 1700000001000, {});
  assert.equal(r.report, 'ok'); return r.state;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

test('#8: a huge menu price in a backup is reset, so totals stay finite and a paid order survives a reload', () => {
  const s = clone(kitchen());
  s.menu.find((m) => m.id === 'tea').price = 1e308;
  const v = E.validateBackup(JSON.stringify(s));
  assert.equal(v.ok, true);
  assert.ok(v.repaired.some((x) => /tea.*price reset/.test(x)), v.repaired.join('|'));
  const price = v.state.menu.find((m) => m.id === 'tea').price;
  assert.ok(price >= 0 && price <= 1000);
  const t = v.state.tickets[0];
  const open = E.orderTotals(v.state, v.state.orders[0]);
  assert.ok(Number.isFinite(open.total));
  const paid = E.apply(v.state, 'payOrder', { orderId: v.state.orders[0].id, method: 'cash' }, 1700000002000, {});
  assert.equal(paid.report, 'ok');
  const back = E.validateBackup(JSON.stringify(paid.state));
  assert.equal(back.ok, true); assert.equal(back.repaired.some((x) => /dropped order/.test(x)), false);
  assert.equal(back.state.orders[0].status, 'paid');
  assert.ok(t);
});

test('#8: a ticket line with a huge price or quantity is brought back into range, and the order stays', () => {
  const s = clone(kitchen());
  s.tickets[0].items[0].price = 1e308; s.tickets[0].items[0].qty = 1e9;
  const v = E.validateBackup(JSON.stringify(s));
  assert.equal(v.ok, true);
  const it = v.state.tickets[0].items[0];
  assert.ok(it.price >= 0 && it.price <= 1000 && it.qty >= 1 && it.qty <= 20, JSON.stringify([it.price, it.qty]));
  assert.ok(v.state.orders.length === 1 && Number.isFinite(E.orderTotals(v.state, v.state.orders[0]).total));
});

test('#8: non-finite or absurd money on a paid order is refused as a whole (and the loader parks it), never half-kept', () => {
  const s = clone(kitchen());
  const pay = E.apply(s, 'payOrder', { orderId: s.orders[0].id, method: 'cash', tip: 1 }, 1700000002000, {});
  const p = clone(pay.state);
  p.orders[0].totals.total = 1e308;
  const v = E.validateBackup(JSON.stringify(p));
  assert.equal(v.ok, true); assert.ok(v.repaired.some((x) => /dropped order/.test(x)));
  const q = clone(pay.state); q.orders[0].tip = 'NaN';
  assert.ok(E.validateBackup(JSON.stringify(q)).repaired.some((x) => /dropped order/.test(x)));
  assert.equal(E.validateBackup('{"v":1,"x":1e999}').ok, false, 'an infinite number never gets in');
});

test('#8: paying never stores a non-finite or absurd total', () => {
  const s = clone(kitchen());
  s.tickets[0].items[0].price = 1000;   // the most a line may cost
  for (const it of s.tickets[0].items) it.qty = 20;
  const pay = E.apply(s, 'payOrder', { orderId: s.orders[0].id, method: 'cash' }, 1700000002000, {});
  assert.equal(pay.report, 'ok');
  assert.ok(Number.isFinite(pay.state.orders[0].totals.total) && pay.state.orders[0].totals.total <= 10000000);
});

test('#10: a paid order from a closed day cannot be reopened, so one sale never lands in two day_closed records', () => {
  const T = new Date(2026, 9, 20, 12, 0, 0).getTime();
  let s = E.newState({ now: T, starter: false });
  let r = E.apply(s, 'createTicket', { customer: 'Pat', items: [{ menuId: 'tea' }], pay: { method: 'cash' } }, T + 1000, {}); assert.equal(r.report, 'ok'); s = r.state;
  r = E.apply(s, 'closeDay', { leftovers: 'keep' }, T + 3600e3, {}); assert.equal(r.report, 'ok'); s = r.state;
  const orderId = s.orders[0].id;
  const next = T + 24 * 3600e3;
  r = E.apply(s, 'reopenOrder', { orderId }, next, {});
  assert.equal(r.report, 'dayClosed');
  assert.equal(r.state, s, 'nothing changed');
  assert.match(E.describe('dayClosed', r.info), /already closed/);
  // the same day is refused too (the day was closed), an order from an open day still reopens
  assert.equal(E.apply(s, 'reopenOrder', { orderId }, T + 7200e3, {}).report, 'dayClosed');
  let u = E.newState({ now: T, starter: false });
  u = E.apply(u, 'createTicket', { customer: 'Sam', items: [{ menuId: 'tea' }], pay: { method: 'card' } }, T + 1000, {}).state;
  const re = E.apply(u, 'reopenOrder', { orderId: u.orders[0].id }, T + 2000, {});
  assert.equal(re.report, 'ok');
  const pay2 = E.apply(re.state, 'payOrder', { orderId: u.orders[0].id, method: 'cash' }, T + 3000, {});
  assert.equal(pay2.report, 'ok');
  const closes = (st) => E.allEvents(st).filter((e) => e.type === 'day_closed');
  assert.equal(closes(s).length, 1);
});
