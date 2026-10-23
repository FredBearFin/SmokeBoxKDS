// Money in whole cents (tax half-cent rounding, discounts, tips, rounds, voids, close day) checked against an independent
// integer reference over thousands of random orders; and time: midnight, the 2026 daylight-saving changes, a clock that
// goes back or jumps forward, and a day closed twice. The time tests run in the New York time zone.
process.env.TZ = 'America/New_York';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { engine: E, store: S } = SB;
const MIN = 60e3, H = 3600e3;
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();   // local time
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const toC = (d) => Math.round(d * 100);
// The independent reference: whole cents, tax half-up on the taxable cents at the rate to four decimals of a percent.
function ref(subC, discD, ratePct) {
  const discC = Math.min(toC(discD), subC), taxableC = subC - discC;
  const taxC = Math.floor((taxableC * Math.round(ratePct * 1e4) + 500000) / 1e6);
  return { subC, discC, taxC, totalC: taxableC + taxC };
}
const blank = (now, rate) => {
  let s = E.newState({ now, blank: true });
  if (rate) s = E.apply(s, 'updateSettings', { patch: { service: { taxRatePct: rate } } }, now).state;
  return s;
};
const ok = (r, what) => { assert.equal(r.report, 'ok', what + ': ' + r.report + ' ' + JSON.stringify(r.info)); return r.state; };

test('the time zone is really New York with daylight saving', () => {
  assert.notEqual(new Date(2026, 0, 15).getTimezoneOffset(), new Date(2026, 6, 15).getTimezoneOffset());
});

test('exact half cents of tax round up (the cases reported by the reconciliation tests)', () => {
  for (const [prices, rate, taxCents] of [[[2], 7.25, 15], [[0.4], 8.875, 4], [[1000, 480.75], 10, 14808], [[10], 7.25, 73], [[0.5], 10, 5], [[0.05], 10, 1], [[0.04], 10, 0], [[100], 8.875, 888]]) {
    const price = prices.reduce((a, b) => a + b, 0);
    let s = blank(T0, rate);
    prices.forEach((pr, i) => { s = ok(E.apply(s, 'addMenuItem', { name: 'X' + i, zone: 'cold', cat: 'cold', price: pr, prepSec: 30, track: 'one' }, T0), 'dish'); });
    s = ok(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: prices.map((_, i) => ({ menuId: 'x' + i, qty: 1 })) }, T0 + 1000), 'ticket');
    s = ok(E.apply(s, 'payOrder', { orderId: 'o_1', method: 'cash' }, T0 + 2000), 'pay');
    const t = s.orders[0].totals;
    assert.equal(Math.round(t.tax * 100), taxCents, price + ' at ' + rate);
    assert.equal(Math.round(t.total * 100), Math.round(price * 100) + taxCents);
  }
});
const T0 = L(2026, 6, 10, 12, 0);

test('thousands of random orders add up exactly in whole cents: order, tickets, payment event, close day', () => {
  const rnd = rng(20261111), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const rates = [0, 6, 7, 7.25, 8.875, 8.25, 9.5, 10, 10.5, 4.712, 6.35, 1.5, 19.99, 20, 0.125, 5.5, 8.375];
  let checked = 0;
  for (let batch = 0; batch < 60; batch++) {
    const rate = rates[ri(0, rates.length - 1)];
    let s = blank(T0, rate);
    const dishes = [];
    for (let i = 0; i < 12; i++) { const pc = rnd() < 0.5 ? ri(1, 2500) : ri(1, 100000); s = ok(E.apply(s, 'addMenuItem', { name: 'D' + i, zone: 'cold', cat: 'cold', price: pc / 100, prepSec: 30, track: 'one' }, T0), 'dish'); dishes.push({ id: s.menu[i].id, pc }); }
    const sums = { cash: [0, 0, 0, 0, 0, 0], card: [0, 0, 0, 0, 0, 0], other: [0, 0, 0, 0, 0, 0] };     // subtotal, discount, tax, total, tip, count (cents)
    let t = T0;
    for (let k = 0; k < 40; k++) {
      t += 7 * MIN;
      const rounds = ri(1, 3);
      let subC = 0, orderId = null;
      for (let r = 0; r < rounds; r++) {
        const items = [];
        for (let i = ri(1, 3); i > 0; i--) { const d = dishes[ri(0, dishes.length - 1)], q = ri(1, 4); items.push({ menuId: d.id, qty: q, pc: d.pc }); }
        const res = E.apply(s, 'createTicket', Object.assign({ customer: 'c' + k, channel: 'dine_in', items: items.map((x) => ({ menuId: x.menuId, qty: x.qty })) }, orderId ? { orderId } : {}), t + r);
        s = ok(res, 'ticket');
        orderId = res.info.orderId;
        // a round that is voided does not count
        if (rnd() < 0.15 && rounds > 1) { s = ok(E.apply(s, 'voidTicket', { ticketId: res.info.ticketId, reason: 'wrong' }, t + r + 1), 'void'); }
        else subC += items.reduce((a, x) => a + x.pc * x.qty, 0);
      }
      if (subC === 0) { s = ok(E.apply(s, 'voidOrder', { orderId, reason: 'empty' }, t + 9), 'void order'); continue; }
      const mode = ri(0, 3);
      const discD = mode === 0 ? 0 : mode === 1 ? ri(0, subC) / 100 : mode === 2 ? ri(0, 3000) / 100 : Math.round(subC * ri(0, 100) / 100) / 100;   // amount, or a percent of the food
      const method = ['cash', 'card', 'other'][ri(0, 2)];
      const want = ref(subC, discD, rate);
      const tipD = rnd() < 0.5 ? ri(0, 5000) / 100 : Math.round(want.totalC * ri(0, 25) / 100) / 100;  // by amount or a percent of the total
      const pay = E.apply(s, 'payOrder', { orderId, method, tip: tipD, discount: discD }, t + 10);
      if (toC(discD) > subC || discD > 10000) {
        assert.equal(pay.report, 'outOfBounds', 'discount over the food or the limit');
        // the refused order is taken off the board again: every round voided, then the order
        for (const x of s.tickets.filter((y) => y.orderId === orderId && y.status !== 'voided')) s = ok(E.apply(s, 'voidTicket', { ticketId: x.id, reason: 'x' }, t + 11), 'void');
        s = ok(E.apply(s, 'voidOrder', { orderId, reason: 'x' }, t + 12), 'void order');
        continue;
      }
      s = ok(pay, 'pay');
      const o = s.orders.find((x) => x.id === orderId), T = o.totals;
      assert.deepEqual([toC(T.subtotal), toC(T.discount), toC(T.tax), toC(T.total)], [want.subC, want.discC, want.taxC, want.totalC], 'rate ' + rate + ' sub ' + subC + ' disc ' + discD);
      assert.equal(toC(o.tip), toC(tipD));
      // the payment event says the same, and the live view of the order matches the frozen one
      const ev = E.allEvents(s).filter((e) => e.type === 'order_paid' && e.orderId === orderId).at(-1);
      assert.deepEqual([toC(ev.subtotal), toC(ev.tax), toC(ev.total), toC(ev.tip)], [want.subC, want.taxC, want.totalC, toC(tipD)]);
      assert.deepEqual(E.orderTotals(s, o), T);
      const m = sums[method]; m[0] += want.subC; m[1] += want.discC; m[2] += want.taxC; m[3] += want.totalC; m[4] += toC(tipD); m[5]++;
      // a ticket of the order carries the food that was charged
      const food = s.tickets.filter((x) => x.orderId === orderId && x.status !== 'voided').reduce((a, x) => a + x.items.reduce((b, it) => b + toC(it.price) * it.qty, 0), 0);
      assert.equal(food, want.subC);
      checked++;
    }
    assert.deepEqual(E.checkInvariants(s, t + 20), [], 'batch ' + batch);
    // close the day: per-method and overall sums equal the reference sums, to the cent
    const cl = ok(E.apply(s, 'closeDay', {}, t + 30), 'close');
    const ev = E.allEvents(cl).filter((e) => e.type === 'day_closed').at(-1);
    let allTotal = 0, allTip = 0;
    for (const k of ['cash', 'card', 'other']) {
      const b = ev.byMethod[k], m = sums[k];
      assert.deepEqual([toC(b.subtotal), toC(b.discount), toC(b.tax), toC(b.total), toC(b.tip), b.count], [m[0], m[1], m[2], m[3], m[4], m[5]], 'close day ' + k);
      allTotal += m[3]; allTip += m[4];
    }
    assert.deepEqual([toC(ev.total), toC(ev.tip)], [allTotal, allTip]);
  }
  assert.ok(checked > 1500, 'orders checked: ' + checked);
});

test('a discount over the food and bad money values are refused; nothing is overpaid or negative', () => {
  let s = ok(E.apply(blank(T0, 8.875), 'addMenuItem', { name: 'X', zone: 'cold', cat: 'cold', price: 10, prepSec: 30, track: 'one' }, T0), 'dish');
  s = ok(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'x', qty: 1 }] }, T0 + 1000), 'ticket');
  const pay = (p) => E.apply(s, 'payOrder', Object.assign({ orderId: 'o_1', method: 'cash' }, p), T0 + 2000).report;
  assert.equal(pay({ discount: 10.01 }), 'outOfBounds');
  for (const bad of [-1, NaN, 'x', Infinity, 1e9]) { assert.notEqual(pay({ tip: bad }), 'ok', 'tip ' + bad); assert.notEqual(pay({ discount: bad }), 'ok', 'discount ' + bad); }
  assert.equal(pay({ method: 'gold' }), 'badPayment');
  const full = ok(E.apply(s, 'payOrder', { orderId: 'o_1', method: 'card', discount: 10 }, T0 + 2000), 'full discount');
  assert.deepEqual([full.orders[0].totals.total, full.orders[0].totals.tax], [0, 0]);
});

test('prices, tips and discounts are whole cents at the door; paid totals stay frozen; reopening works them out afresh', () => {
  let s = ok(E.apply(blank(T0, 7.25), 'addMenuItem', { name: 'X', zone: 'cold', cat: 'cold', price: 9.995, prepSec: 30, track: 'one' }, T0), 'dish');
  assert.equal(s.menu[0].price, 10);
  s = ok(E.apply(s, 'updateMenuItem', { id: 'x', patch: { price: 1.005 } }, T0), 'edit');
  assert.equal(s.menu[0].price, 1.01);
  s = ok(E.apply(s, 'updateMenuItem', { id: 'x', patch: { price: 10 } }, T0), 'edit back');
  s = ok(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'x', qty: 3 }] }, T0 + 1000), 'ticket');
  const paid = ok(E.apply(s, 'payOrder', { orderId: 'o_1', method: 'cash', tip: 1.005 }, T0 + 2000), 'pay');
  assert.equal(paid.orders[0].tip, 1.01);
  assert.equal(paid.orders[0].totals.total, 32.18);       // 30.00 + 2.175 -> 2.18
  const changed = ok(E.apply(ok(E.apply(paid, 'updateSettings', { patch: { service: { taxRatePct: 9 } } }, T0 + 3000), 'rate') && E.apply(paid, 'updateSettings', { patch: { service: { taxRatePct: 9 } } }, T0 + 3000).state, 'updateMenuItem', { id: 'x', patch: { price: 99 } }, T0 + 3500), 'price');
  assert.equal(changed.orders[0].totals.total, 32.18);    // frozen
  const re = ok(E.apply(changed, 'reopenOrder', { orderId: 'o_1' }, T0 + 4000), 'reopen');
  const again = ok(E.apply(re, 'payOrder', { orderId: 'o_1', method: 'card' }, T0 + 5000), 'pay again');
  assert.equal(again.orders[0].totals.subtotal, 30);       // the ticket kept the price it was sold at
  assert.equal(again.orders[0].totals.total, 32.7);       // 30.00 at the new rate of 9 percent
  assert.deepEqual(E.checkInvariants(again, T0 + 6000), []);
});

test('invariant I16 catches totals that do not add up in whole cents', () => {
  let s = ok(E.apply(blank(T0, 10), 'addMenuItem', { name: 'X', zone: 'cold', cat: 'cold', price: 10, prepSec: 30, track: 'one' }, T0), 'dish');
  s = ok(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'x', qty: 1 }] }, T0 + 1000), 'ticket');
  s = ok(E.apply(s, 'payOrder', { orderId: 'o_1', method: 'cash', tip: 2 }, T0 + 2000), 'pay');
  const bend = (f) => { const c = JSON.parse(JSON.stringify(s)); f(c.orders[0]); return E.checkInvariants(c, T0 + 3000).join('|'); };
  assert.equal(bend(() => {}), '');
  assert.match(bend((o) => { o.totals.total += 0.01; }), /do not add up/);
  assert.match(bend((o) => { o.totals.tax += 0.005; o.totals.total += 0.005; }), /not whole cents/);
  assert.match(bend((o) => { o.tip = 1.005; }), /tip/);
  assert.match(bend((o) => { o.tip = -1; }), /tip/);
  assert.match(bend((o) => { o.totals.discount = o.totals.subtotal + 1; }), /do not add up/);
});

test('totals frozen by an older build (float tax, half cent one cent lower) still pass the checks', () => {
  let s = blank(T0, 10);
  for (const [n, pr] of [['A', 700.25], ['B', 780.5]]) s = ok(E.apply(s, 'addMenuItem', { name: n, zone: 'cold', cat: 'cold', price: pr, prepSec: 30, track: 'one' }, T0), 'dish');
  s = ok(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'a', qty: 1 }, { menuId: 'b', qty: 1 }] }, T0 + 1000), 'ticket');
  s = ok(E.apply(s, 'payOrder', { orderId: 'o_1', method: 'cash' }, T0 + 2000), 'pay');
  assert.equal(s.orders[0].totals.tax, 148.08);
  const old = JSON.parse(JSON.stringify(s));
  old.orders[0].totals.tax = 148.07; old.orders[0].totals.total = 1628.82;     // what the old float rule gave
  assert.deepEqual(E.checkInvariants(old, T0 + 3000), []);
  assert.equal(E.validateBackup(E.serialize(old)).repaired.length, 0);
});

/* ------------------------------ time ------------------------------ */

const num = (s) => s.tickets.map((t) => t.num);
function dishState(now) { return ok(E.apply(blank(now), 'addMenuItem', { name: 'X', zone: 'cold', cat: 'cold', price: 5, prepSec: 30, track: 'one' }, now), 'dish'); }
// Sells one dish at time t and pays it; returns the new state.
function sell(s, t) { const r = E.apply(s, 'createTicket', { customer: 'c', channel: 'dine_in', items: [{ menuId: 'x', qty: 1 }] }, t); s = ok(r, 'ticket'); return ok(E.apply(s, 'payOrder', { orderId: r.info.orderId, method: 'cash' }, t + 1000), 'pay'); }

test('midnight: orders before and after 12 o\'clock stay in one service day until 4 am, then the numbering restarts', () => {
  let s = dishState(L(2026, 6, 10, 20, 0));
  s = sell(s, L(2026, 6, 10, 23, 55)); s = sell(s, L(2026, 6, 11, 0, 10)); s = sell(s, L(2026, 6, 11, 3, 59));
  assert.deepEqual(num(s), [101, 102, 103]);
  assert.equal(new Set(s.tickets.map((t) => t.serviceDate)).size, 1);
  s = sell(s, L(2026, 6, 11, 4, 0));
  assert.equal(s.tickets[3].num, 101); assert.notEqual(s.tickets[3].serviceDate, s.tickets[0].serviceDate);
  // closing at 00:20 covers the evening's two orders and not the 4 am one
  let c = dishState(L(2026, 6, 10, 20, 0));
  c = sell(c, L(2026, 6, 10, 23, 55)); c = sell(c, L(2026, 6, 11, 0, 10));
  const d = ok(E.apply(c, 'closeDay', {}, L(2026, 6, 11, 0, 20)), 'close');
  assert.deepEqual([E.allEvents(d).at(-1).orders, E.allEvents(d).at(-1).total], [2, 10]);
  assert.deepEqual(E.checkInvariants(s, L(2026, 6, 11, 5, 0)), []);
});

test('daylight saving 2026: spring forward (8 March) and fall back (1 November) lose and duplicate nothing', () => {
  // spring: 01:59 EST then 03:01 EDT are two minutes apart
  let s = dishState(L(2026, 3, 7, 20, 0));
  const a = L(2026, 3, 8, 1, 59), b = L(2026, 3, 8, 3, 1);
  assert.equal(b - a, 2 * MIN);
  s = sell(s, L(2026, 3, 7, 23, 0)); s = sell(s, a); s = sell(s, b);
  assert.deepEqual(num(s), [101, 102, 103]); assert.equal(new Set(s.tickets.map((t) => t.serviceDate)).size, 1);
  const tm = E.ticketTiming(s.tickets[2], b + 3 * MIN, s.settings);
  assert.equal(tm.elapsedMs, 3 * MIN);
  // fall: 01:30 happens twice, an hour apart
  let f = dishState(L(2026, 10, 31, 20, 0));
  const first = L(2026, 11, 1, 1, 30), second = first + H;
  assert.equal(new Date(first).getHours(), 1); assert.equal(new Date(second).getHours(), 1);
  f = sell(f, L(2026, 10, 31, 23, 0)); f = sell(f, first); f = sell(f, second); f = sell(f, L(2026, 11, 1, 2, 30));
  assert.deepEqual(num(f), [101, 102, 103, 104]); assert.equal(new Set(f.tickets.map((t) => t.serviceDate)).size, 1);
  const d = ok(E.apply(f, 'closeDay', {}, L(2026, 11, 1, 3, 0)), 'close');
  assert.equal(E.allEvents(d).at(-1).orders, 4);
  assert.deepEqual(E.checkInvariants(d, L(2026, 11, 1, 3, 0)), []);
  // the long night: hold-time style gaps are real elapsed time, not clock-face time
  assert.equal(L(2026, 11, 1, 6, 0) - L(2026, 10, 31, 20, 0), 11 * H);
});

test('a clock that goes back or jumps forward: no ticket lost or repeated, events stay in order, everything saves and reloads', () => {
  const rnd = rng(77);
  for (let run = 0; run < 40; run++) {
    let s = dishState(T0), t = T0;
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const jump = rnd();
      t += jump < 0.15 ? -ri(rnd, 1, 180) * MIN : jump < 0.25 ? ri(rnd, 1, 3000) * MIN : ri(rnd, 1, 8) * MIN;
      const r = E.apply(s, 'createTicket', { customer: 'c' + i, channel: 'dine_in', items: [{ menuId: 'x', qty: 1 }] }, t);
      if (r.report === 'ok') { s = r.state; seen.add(r.info.ticketId); }
      const r2 = E.apply(s, 'payOrder', { orderId: s.orders.at(-1).id, method: 'cash' }, t + 1);
      if (r2.report === 'ok') s = r2.state;
      const inv = E.checkInvariants(s, Math.max(t, ...s.tickets.map((x) => x.createdAt)));
      assert.deepEqual(inv, [], 'run ' + run + ' step ' + i);
    }
    assert.equal(s.tickets.length, seen.size);                                         // none lost
    const nums = s.tickets.map((x) => x.serviceDate + '#' + x.num);
    assert.equal(new Set(nums).size, nums.length);                                     // none repeated
    const ev = E.allEvents(s).map((e) => e.t);
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i] >= ev[i - 1], 'events out of order');
    const v = E.validateBackup(E.serialize(s));
    assert.equal(v.ok, true); assert.deepEqual(v.repaired, []);
  }
});
const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));

test('the store clock never goes back, survives a jump forward, and reloads the same kitchen', () => {
  let real = T0;
  const m = new Map(), b = { persistent: true, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, JSON.stringify(v)); return true; }, remove: (k) => m.delete(k), keys: () => [] };
  S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => real });
  try {
    S.dispatch('addMenuItem', { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' });
    const stamps = [];
    for (const step of [5 * MIN, -3 * H, 10 * MIN, 50 * H, -20 * H, 7 * MIN]) {
      real += step;
      const r = S.dispatchEx('createTicket', { customer: 'c', channel: 'dine_in', items: [{ menuId: 'pie', qty: 1 }] });
      assert.equal(r.report, 'ok'); stamps.push(S.now());
    }
    for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i] >= stamps[i - 1], 'store time went back at step ' + i);
    assert.equal(S.getState().tickets.length, 6);
    assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
    S.flush(); const before = S.getState().tickets.map((t) => t.id).join();
    S.destroy();
    real += 2 * H;
    S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => real });
    assert.equal(S.getState().tickets.map((t) => t.id).join(), before);
    assert.ok(S.now() >= stamps[stamps.length - 1]);
  } finally { S.destroy(); }
});

test('a day closed twice: two close records, the second covers the whole day, nothing is duplicated', () => {
  let s = dishState(L(2026, 6, 10, 11, 0));
  s = sell(s, L(2026, 6, 10, 12, 0)); s = sell(s, L(2026, 6, 10, 13, 0));
  s = ok(E.apply(s, 'closeDay', {}, L(2026, 6, 10, 21, 0)), 'first close');
  const first = E.allEvents(s).filter((e) => e.type === 'day_closed').at(-1);
  assert.deepEqual([first.orders, first.total], [2, 10]);
  assert.equal(E.apply(s, 'closeDay', {}, L(2026, 6, 10, 21, 5)).state.orders.length, 2);
  s = sell(s, L(2026, 6, 10, 21, 30));                                         // a late sale after closing
  s = ok(E.apply(s, 'closeDay', {}, L(2026, 6, 10, 22, 0)), 'second close');
  const closes = E.allEvents(s).filter((e) => e.type === 'day_closed');
  assert.equal(closes.length, 2);
  assert.deepEqual([closes[1].orders, closes[1].total, closes[1].day], [3, 15, first.day]);
  assert.equal(s.lastClose.day, first.day); assert.ok(s.lastClose.at >= closes[0].t);
  assert.equal(s.orders.length, 3); assert.equal(s.tickets.length, 3);
  // an open order blocks closing, and a new service day closes separately
  let o = ok(E.apply(s, 'createTicket', { customer: 'open', channel: 'dine_in', items: [{ menuId: 'x', qty: 1 }] }, L(2026, 6, 10, 22, 10)), 'open order');
  assert.equal(E.apply(o, 'closeDay', {}, L(2026, 6, 10, 22, 20)).report, 'ordersStillOpen');
  const next = sell(s, L(2026, 6, 11, 12, 0));
  const c3 = ok(E.apply(next, 'closeDay', {}, L(2026, 6, 11, 21, 0)), 'next day');
  const last = E.allEvents(c3).filter((e) => e.type === 'day_closed').at(-1);
  assert.deepEqual([last.orders, last.day === first.day], [1, false]);
  assert.deepEqual(E.checkInvariants(c3, L(2026, 6, 11, 21, 0)), []);
});
