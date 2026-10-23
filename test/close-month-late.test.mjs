// Close the month must not clear a day that has sales after its last end-of-day close: that sale would exist only in the owner's files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine, U = SB.util;
const DAY = 24 * 3600e3, H = 3600e3;

// Builds 4 old days: A clean; B a sale after the close; C closed twice with a sale between; D a new order left open after the close.
function build() {
  const now = new Date(2026, 9, 20, 15, 0, 0).getTime();
  const base = new Date(now); base.setDate(base.getDate() - 70); base.setHours(12, 0, 0, 0);
  let s = E.newState({ now: base.getTime(), blank: true });
  let t = base.getTime();
  const go = (type, p, at) => { t = Math.max(t + 1000, at); const r = E.apply(s, type, p, t); if (r.report !== 'ok') throw new Error(type + ' ' + r.report + ' ' + JSON.stringify(r.info)); s = r.state; return r; };
  const dish = go('addMenuItem', { name: 'Plain', zone: 'pit', cat: 'meat', price: 10, prepSec: 60, track: 'one', prepGuess: false }, t).info.id;
  const sale = (at, tip) => { const r = go('createTicket', { customer: 'C', items: [{ menuId: dish }], allowPast: true }, at); const tk = s.tickets[s.tickets.length - 1]; for (const it of tk.items) { go('advanceItem', { ticketId: tk.id, itemId: it.id }, t + 1000); const c = s.tickets.find((x) => x.id === tk.id).items.find((x) => x.id === it.id); if (c.status !== 'done') go('advanceItem', { ticketId: tk.id, itemId: it.id }, t + 1000); } go('bumpTicket', { ticketId: tk.id }, t + 1000); go('payOrder', { orderId: r.info.orderId, method: 'cash', tip }, t + 1000); return r.info.orderId; };
  const days = [];
  for (let i = 0; i < 4; i++) { const d = new Date(base); d.setDate(d.getDate() + i); d.setHours(12, 0, 0, 0); days.push(d.getTime()); }
  // A
  sale(days[0] + H, 1); sale(days[0] + 2 * H, 0); go('closeDay', {}, days[0] + 3 * H);
  // B: a sale after the close
  sale(days[1] + H, 0); go('closeDay', {}, days[1] + 3 * H); sale(days[1] + 4 * H, 2);
  // C: closed, a sale, closed again
  sale(days[2] + H, 0); go('closeDay', {}, days[2] + 3 * H); sale(days[2] + 4 * H, 0); go('closeDay', {}, days[2] + 5 * H);
  // D: closed, then an order is started and left open
  sale(days[3] + H, 0); go('closeDay', {}, days[3] + 3 * H); go('createTicket', { customer: 'Late', items: [{ menuId: dish }], allowPast: true }, days[3] + 4 * H);
  // paid-but-pruned-day state: close the open order's day by paying it later on the same day
  return { s: E.tick(s, now).state, now, days: days.map((d) => U.serviceDate(d)) };
}

test('a day with a sale after its last close is not cleared; a day closed twice and a clean day are', () => {
  const { s, now, days } = build();
  const r = E.monthPlan(s, { before: U.addDays(days[3], 1) }, now);
  assert.equal(r.ok, true);
  const pl = r.plan;
  assert.deepEqual(pl.days, [days[0], days[2]].sort(), 'only A and C go');
  assert.ok(pl.lateSaleDays.includes(days[1]) && pl.lateSaleDays.includes(days[3]));
  assert.ok(pl.uncoveredDays.includes(days[1]) && pl.uncoveredDays.includes(days[3]));
  assert.ok(!pl.uncoveredDays.includes(days[0]) && !pl.uncoveredDays.includes(days[2]));
  // the open order and its ticket stay
  assert.equal(pl.openOrdersKept, 1);
});

test('totals reconcile: cleared days by their day_closed record, kept days by their orders', () => {
  const { s, now, days } = build();
  const paidOn = (st, day) => st.orders.filter((o) => o.status === 'paid' && U.serviceDate(o.paidAt) === day).reduce((a, o) => a + Math.round(o.totals.total * 100), 0);
  const closedTotal = (st, day) => { const ev = E.allEvents(st).filter((e) => e.type === 'day_closed' && e.day === day); return ev.length ? Math.round(ev[ev.length - 1].total * 100) : null; };
  const before = days.map((d) => paidOn(s, d));
  const res = E.closeMonth(s, { before: U.addDays(days[3], 1) }, now);
  assert.equal(res.report, 'ok', JSON.stringify(res.info));
  const o = res.state;
  assert.deepEqual(E.checkInvariants(o, now), []);
  // cleared days (A, C): the kept day_closed record equals what the removed orders added up to
  for (const i of [0, 2]) { assert.equal(closedTotal(o, days[i]), before[i], 'day ' + days[i]); assert.equal(paidOn(o, days[i]), 0, 'its orders are gone'); }
  // kept days (B, D): the orders are still there and add up as before, including the late sale
  for (const i of [1, 3]) assert.equal(paidOn(o, days[i]), before[i], 'day ' + days[i]);
  assert.ok(closedTotal(o, days[1]) < paidOn(o, days[1]), 'the late sale is not in the close record, and is still in the kitchen');
  // nothing is lost overall: kept orders plus cleared-day records equal the original
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  assert.equal(sum([0, 2].map((i) => closedTotal(o, days[i]))) + sum([1, 3].map((i) => paidOn(o, i === 1 ? days[1] : days[3]))), sum(before));
});
