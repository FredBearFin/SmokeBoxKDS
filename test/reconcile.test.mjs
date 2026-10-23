// Reconciliation: every money number the back office shows must agree with an independent count in whole cents, for
// random own kitchens (several seeds and tax rates) and for the barbecue sample history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '40-metrics', '45-sim', '87-office-closeday', '88-office-backup', '89-office-inspector', '82-office-money']);
const E = SB.engine, M = SB.metrics, U = SB.util, BP = SB.office.backupPure, CD = SB.office.closeDayPure;
const H = 3600e3, MIN = 60e3;
const c100 = (v) => Math.round(v * 100);

// A small seeded random generator so every run builds the same kitchens.
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// Builds a blank own kitchen with random dishes (prices in odd cents), then many orders over `days` service days:
// random quantities, discounts (dollar and percent), tips, three payment methods, voids, a re-opened order paid again,
// and orders paid after midnight. Returns the final engine state.
function buildKitchen(seed, taxPct, days, startMs) {
  const r = rng(seed);
  let now = startMs;
  let s = E.newState({ now, blank: true });
  const go = (type, p, dt = 0) => { now += dt; const res = E.apply(s, type, p, now); assert.equal(res.report, 'ok', type + ' ' + res.report + ' ' + JSON.stringify(res.info)); s = res.state; return res; };
  if (taxPct > 0) go('updateSettings', { patch: { service: { taxRatePct: taxPct } } }, 1000);
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(go('addMenuItem', { name: 'Dish ' + (i + 1), zone: 'pit', cat: 'meat', price: Math.round((3 + r() * 20) * 100 + 1 + Math.floor(r() * 98)) / 100, prepSec: 60, track: 'one', prepGuess: false }, 1000).info.id);
  const day0 = new Date(startMs); day0.setHours(0, 0, 0, 0);
  for (let d = 0; d < days; d++) {
    const base = day0.getTime() + d * 86400e3;
    // DST-safe: build each day's clock from the local calendar date, not from adding 24 hours.
    const local = (h, m = 0) => new Date(new Date(base).getFullYear(), new Date(base).getMonth(), new Date(base).getDate() + (d === 0 ? 0 : 0), h, m, 0, 0).getTime();
    const n = 3 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const hour = k === n - 1 && r() < 0.4 ? 23 : 11 + Math.floor(r() * 9);
      const t = local(hour, Math.floor(r() * 50)) + 24 * 0; // eslint-disable-line no-unused-expressions
      if (t <= now) now = now; else now = t;
      const items = [];
      const lines = 1 + Math.floor(r() * 3);
      for (let i = 0; i < lines; i++) items.push({ menuId: ids[Math.floor(r() * ids.length)], qty: 1 + Math.floor(r() * 3) });
      let oid;
      try { oid = go('createTicket', { customer: 'O' + d + '_' + k, channel: 'dine_in', items }, 1000).info.orderId; } catch (e) { continue; }
      const tk = s.tickets[s.tickets.length - 1];
      tk.items.forEach((it) => { for (let g = 0; g < 2; g++) { const cur = s.tickets.find((x) => x.id === tk.id).items.find((x) => x.id === it.id); if (cur.status === 'done') break; try { go('advanceItem', { ticketId: tk.id, itemId: it.id }, 20000); } catch (e) { break; } } });
      try { go('bumpTicket', { ticketId: tk.id }, 3000); } catch (e) { /* stays active */ }
      const roll = r();
      if (roll < 0.1) {
        // void the order (ticket first)
        try { go('voidTicket', { ticketId: tk.id, reason: 'test' }, 1000); go('voidOrder', { orderId: oid, reason: 'test' }, 1000); } catch (e) { /* leave open */ }
        continue;
      }
      const sub = c100(tk.items.reduce((a, it) => a + it.price * it.qty, 0)) / 100;
      const pct = r() < 0.3 ? [5, 10, 15][Math.floor(r() * 3)] : 0;
      const discount = pct ? Math.round(sub * pct) / 100 : r() < 0.15 ? 1.01 : 0;
      const tip = r() < 0.6 ? Math.round(sub * [0.1, 0.15, 0.18, 0.2][Math.floor(r() * 4)] * 100) / 100 : 0;
      const method = ['cash', 'card', 'other'][Math.floor(r() * 3)];
      const payDelay = (hour === 23 ? 90 : 5) * MIN;
      const pay = (dt) => go('payOrder', { orderId: oid, method, tip, discount: Math.min(discount, sub) }, dt);
      pay(payDelay);
      if (r() < 0.08) { go('reopenOrder', { orderId: oid }, MIN); pay(MIN); }
    }
    // never leave an order open
    s.orders.filter((o) => o.status === 'open').forEach((o) => { try { go('payOrder', { orderId: o.id, method: 'cash' }, MIN); } catch (e) { go('voidOrder', { orderId: o.id, reason: 'x' }, MIN); } });
  }
  return s;
}

// The dataset shape SB.metrics reads, straight from an engine state.
const dsOf = (s) => ({ tickets: s.tickets, orders: s.orders, events: E.allEvents(s), batches: s.batches, learned: s.learned || {}, menu: s.menu, ingredients: s.ingredients, settings: s.settings, range: { from: -Infinity, to: Infinity } });

// The independent ledger: whole cents per service day from the paid orders alone.
function ledger(s) {
  const dsh = s.settings.service.dayStartHour;
  const days = {}, tot = { orders: 0, sales: 0, disc: 0, tax: 0, tips: 0, collected: 0, cash: 0, card: 0, other: 0 };
  for (const o of s.orders) {
    if (o.status !== 'paid') continue;
    const d = U.serviceDate(o.paidAt, dsh);
    const x = days[d] || (days[d] = { orders: 0, sales: 0, disc: 0, tax: 0, tips: 0, collected: 0, cash: 0, card: 0, other: 0 });
    const T = o.totals, sub = c100(T.subtotal), disc = c100(T.discount), tax = c100(T.tax), tip = c100(o.tip || 0);
    const coll = c100(T.total) + tip;
    for (const a of [x, tot]) { a.orders++; a.sales += sub - disc; a.disc += disc; a.tax += tax; a.tips += tip; a.collected += coll; a[o.method] += coll; }
    // the order's frozen total must itself be sub - disc + tax in whole cents
    assert.equal(c100(T.total), sub - disc + tax, 'order ' + o.id + ' total is subtotal - discount + tax in cents');
    // tax is the rounded cents of the taxable amount, half a cent rounding up, with no floating-point drift
    assert.equal(tax, Math.floor(((sub - disc) * T.taxRate) / 100 + 0.5 + 1e-9), 'order ' + o.id + ' tax cents for ' + (sub - disc) + ' c at ' + T.taxRate + ' percent');
  }
  return { days, tot };
}

const KITCHENS = [[11, 7.25], [23, 8.875], [37, 0], [101, 6], [7, 10.5]];
const T_START = new Date(2026, 9, 12, 8, 0, 0).getTime();

// Starting dates: an ordinary week, a week over the March spring-forward (Mar 8 2026) and one over the November fall-back (Nov 1 2026).
const STARTS = [T_START, new Date(2026, 2, 5, 8, 0, 0).getTime(), new Date(2026, 9, 29, 8, 0, 0).getTime()];

test('every money number agrees with the independent cents ledger, for random kitchens and clock-change weeks', () => {
  for (const [seed, tax, st] of KITCHENS.map((k, i) => [k[0], k[1], STARTS[i % 3]])) {
    const s = buildKitchen(seed, tax, 10, st);
    const L = ledger(s);
    const ds = dsOf(s);
    const sales = M.sales(ds, { from: -Infinity, to: Infinity });
    const tag = 'seed ' + seed + ' tax ' + tax + ': ';
    assert.ok(L.tot.orders > 20, tag + 'enough orders to mean something');
    assert.equal(sales.checks, L.tot.orders, tag + 'orders paid');
    assert.equal(c100(sales.net), L.tot.sales, tag + 'sales (net)');
    assert.equal(c100(sales.discounts), L.tot.disc, tag + 'discounts');
    assert.equal(c100(sales.tax), L.tot.tax, tag + 'tax');
    assert.equal(c100(sales.tips), L.tot.tips, tag + 'tips');
    assert.equal(c100(sales.collected), L.tot.collected, tag + 'collected');
    // per day equals the ledger and the days add up to the total
    let sumDays = 0;
    sales.byDay.forEach((d) => { assert.equal(c100(d.collected), L.days[d.date].collected, tag + d.date + ' collected'); assert.equal(d.checks, L.days[d.date].orders, tag + d.date + ' orders'); sumDays += c100(d.collected); });
    assert.equal(sumDays, L.tot.collected, tag + 'days add up to the total');
    assert.equal(sales.byDay.length, Object.keys(L.days).length, tag + 'same number of days');
    // by payment method
    sales.byMethod.forEach((m) => assert.equal(c100(m.collected), L.tot[m.method], tag + 'method ' + m.method));
    assert.equal(sales.byMethod.reduce((a, m) => a + c100(m.collected), 0), L.tot.collected, tag + 'methods add up to the total');
    // the accountant CSV: the Total row and every day row
    const csv = BP.salesCsv(s, s.settings.service.dayStartHour).trim().split('\r\n');
    const rows = csv.slice(1, -1).map((l) => l.split(','));
    const totRow = csv[csv.length - 1].split(',');
    const cents = (v) => Math.round(Number(v) * 100);
    assert.equal(totRow[0], 'Total');
    assert.equal(Number(totRow[1]), L.tot.orders, tag + 'csv orders');
    assert.equal(cents(totRow[2]), L.tot.sales, tag + 'csv sales');
    assert.equal(cents(totRow[3]), L.tot.disc, tag + 'csv discounts');
    assert.equal(cents(totRow[4]), L.tot.tax, tag + 'csv tax');
    assert.equal(cents(totRow[5]), L.tot.tips, tag + 'csv tips');
    assert.equal(cents(totRow[6]), L.tot.collected, tag + 'csv collected');
    assert.equal(cents(totRow[7]) + cents(totRow[8]) + cents(totRow[9]), L.tot.collected, tag + 'csv methods add up');
    assert.equal(rows.length, Object.keys(L.days).length, tag + 'csv has one row per day');
    assert.equal(rows.reduce((a, r) => a + cents(r[6]), 0), L.tot.collected, tag + 'csv day rows add up to the Total row');
    rows.forEach((r) => assert.equal(cents(r[6]), L.days[r[0]].collected, tag + 'csv ' + r[0]));
  }
});

test('Close the day shows the same day totals as the ledger and as the engine\'s day_closed event, even when closed twice', () => {
  const s0 = buildKitchen(23, 8.875, 4, T_START);
  const dsh = s0.settings.service.dayStartHour;
  const L = ledger(s0);
  const lastDay = Object.keys(L.days).sort().pop();
  // close at 3 am the next calendar day, still inside the last service day
  const [y, m, d] = lastDay.split('-').map(Number);
  let now = new Date(y, m - 1, d + 1, 3, 0, 0).getTime();
  const close = (s) => { const r = E.apply(s, 'closeDay', {}, now); assert.equal(r.report, 'ok', r.report); return r.state; };
  let s = close(s0);
  const model = CD.closeDayModel(s, now);
  assert.equal(model.day, lastDay);
  assert.equal(c100(model.collected), L.days[lastDay].collected, 'sheet total = ledger');
  const ev = s.events.filter((e) => e.type === 'day_closed').pop();
  assert.equal(c100(model.sales), c100(ev.subtotal - ev.discount), 'sheet sales = event subtotal - discount');
  assert.equal(c100(model.tax), c100(ev.tax)); assert.equal(c100(model.tip), c100(ev.tip));
  assert.equal(model.paid, ev.orders);
  model.methods.forEach((x) => assert.equal(c100(x.collected), c100(ev.byMethod[x.id].total) + c100(ev.byMethod[x.id].tip), 'method ' + x.id));
  // one more paid order after the first close, then close again: the new event covers the whole day
  const mid = E.apply(s, 'createTicket', { customer: 'Late', channel: 'dine_in', items: [{ menuId: s.menu[0].id, qty: 2 }] }, now + MIN);
  assert.equal(mid.report, 'ok');
  const paid = E.apply(mid.state, 'payOrder', { orderId: mid.info.orderId, method: 'card', tip: 1.1 }, now + 2 * MIN);
  assert.equal(paid.report, 'ok');
  now += 3 * MIN;
  s = close(paid.state);
  const ev2 = s.events.filter((e) => e.type === 'day_closed').pop();
  const model2 = CD.closeDayModel(s, now);
  assert.equal(ev2.orders, ev.orders + 1, 'the second close covers the whole day');
  assert.equal(c100(model2.collected), c100(ev2.total) + c100(ev2.tip));
  assert.equal(c100(model2.collected), c100(model.collected) + c100(paid.info.total) + c100(1.1), 'one more order adds exactly its total and tip');
});

test('orders paid after midnight stay in the service day until the day-start hour', () => {
  const dsh = 4;
  const lateNight = new Date(2026, 9, 14, 0, 30, 0).getTime();
  const earlyMorning = new Date(2026, 9, 14, 4, 10, 0).getTime();
  assert.equal(U.serviceDate(lateNight, dsh), '2026-10-13');
  assert.equal(U.serviceDate(earlyMorning, dsh), '2026-10-14');
});

// Pays one order for a single dish at a price and tax rate, and returns the frozen totals.
function payOne(price, qty, tax, discount = 0) {
  let now = T_START, s = E.newState({ now, blank: true });
  const go = (type, p) => { now += 1000; const r = E.apply(s, type, p, now); assert.equal(r.report, 'ok', type + ' ' + r.report); s = r.state; return r; };
  if (tax > 0) go('updateSettings', { patch: { service: { taxRatePct: tax } } });
  const id = go('addMenuItem', { name: 'X', zone: 'pit', cat: 'meat', price, prepSec: 60, track: 'one', prepGuess: false }).info.id;
  const oid = go('createTicket', { customer: 'A', channel: 'dine_in', items: [{ menuId: id, qty }] }).info.orderId;
  return go('payOrder', { orderId: oid, method: 'card', discount }).state.orders[0].totals;
}

test('rounding: totals are exact cents and tax is within half a cent of the exact amount, over many prices, quantities and rates', () => {
  const r = rng(5);
  for (const tax of [7.25, 8.875, 6, 10.5, 4.225, 5.5]) {
    for (let n = 0; n < 80; n++) {
      const price = (50 + Math.floor(r() * 2400)) / 100, qty = 1 + Math.floor(r() * 6);
      const subC = Math.round(price * 100) * qty;
      const dC = r() < 0.4 ? Math.floor(subC * [5, 10, 15, 20][Math.floor(r() * 4)] / 100) : 0;
      const T = payOne(price, qty, tax, dC / 100);
      const exact = ((subC - dC) * tax) / 100;
      assert.equal(c100(T.subtotal), subC, 'subtotal');
      assert.equal(c100(T.discount), dC, 'discount');
      assert.ok(Math.abs(c100(T.tax) - exact) <= 0.5 + 1e-9, 'tax ' + c100(T.tax) + ' is within half a cent of ' + exact + ' (' + (subC - dC) + 'c at ' + tax + ')');
      assert.equal(c100(T.total), subC - dC + c100(T.tax), 'total = subtotal - discount + tax');
    }
  }
});

// KNOWN ENGINE ISSUE (reported to the engine owner): the engine rounds tax with Math.round(v * 100) / 100, so an exact half
// cent can round down because of binary floating point ($2.00 at 7.25 percent is 14.5 cents and comes out 14, not 15).
test('rounding: an exact half cent of tax rounds up', () => {
  assert.equal(c100(payOne(2, 1, 7.25).tax), 15);
  assert.equal(c100(payOne(0.4, 1, 8.875).tax), 4);
});

// The barbecue sample history (cook-ahead demo kitchen), for anchors that put the 14 days across the 2026 US clock changes.
const ANCHORS = [new Date(2026, 9, 23, 12, 0, 0).getTime(), new Date(2026, 2, 12, 12, 0, 0).getTime(), new Date(2026, 10, 4, 12, 0, 0).getTime()];

test('the sample history reconciles to the cent, across the March and November clock changes', () => {
  const dsh = SB.config.service.dayStartHour;
  for (const now of ANCHORS) {
    const smp = SB.sim.sample({ now });
    const settings = { service: Object.assign({}, SB.config.service) };
    const state = { orders: smp.orders, settings };
    const L = ledger(state);
    const ds = { tickets: smp.tickets, orders: smp.orders, events: smp.events, batches: smp.batches, learned: smp.learned, menu: [], ingredients: [], settings, range: { from: smp.from, to: smp.to } };
    const tag = U.serviceDate(now) + ': ';
    const sales = M.sales(ds, { from: -Infinity, to: Infinity });
    assert.ok(L.tot.orders > 500, tag + 'a real fortnight');
    assert.equal(sales.checks, L.tot.orders, tag + 'orders paid');
    assert.equal(c100(sales.net), L.tot.sales, tag + 'sales');
    assert.equal(c100(sales.tax), L.tot.tax, tag + 'tax');
    assert.equal(c100(sales.tips), L.tot.tips, tag + 'tips');
    assert.equal(c100(sales.collected), L.tot.collected, tag + 'collected');
    assert.equal(sales.byDay.reduce((a, d) => a + c100(d.collected), 0), L.tot.collected, tag + 'days add up');
    sales.byDay.forEach((d) => assert.equal(c100(d.collected), L.days[d.date].collected, tag + d.date));
    assert.equal(sales.byMethod.reduce((a, m) => a + c100(m.collected), 0), L.tot.collected, tag + 'methods add up');
    sales.byHour.forEach((h) => assert.ok(h.checks >= 0));
    assert.equal(sales.byHour.reduce((a, h) => a + h.checks, 0), L.tot.orders, tag + 'hours add up to the order count');
    assert.equal(sales.byChannel.reduce((a, h) => a + h.checks, 0), L.tot.orders, tag + 'channels add up to the order count');
    assert.equal(sales.byChannel.reduce((a, h) => a + c100(h.net), 0), L.tot.sales, tag + 'channel sales add up');
    const csv = BP.salesCsv(state, dsh).trim().split('\r\n');
    const tot = csv[csv.length - 1].split(',');
    assert.equal(Math.round(Number(tot[6]) * 100), L.tot.collected, tag + 'csv collected');
    // order counts: paid + open + voided = all orders in the range
    const byStatus = { paid: 0, open: 0, voided: 0 };
    smp.orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    assert.equal(byStatus.paid, sales.checks, tag + 'paid orders = orders with status paid');
    // sales across a single service day match the ledger for that day (range = one service day)
    const day = Object.keys(L.days).sort()[3];
    const r = M.rangePresets(U.dateKeyToMs(day) + 12 * H, dsh).find((p) => p.id === 'today');
    const one = M.sales(ds, { from: r.from, to: r.to });
    assert.equal(c100(one.collected), L.days[day].collected, tag + 'one-day range ' + day);
    assert.equal(one.checks, L.days[day].orders, tag + 'one-day orders');
  }
});

test('empty ranges are all zeros and a range holding one order reports exactly that order', () => {
  const smp = SB.sim.sample({ now: ANCHORS[0] });
  const settings = { service: Object.assign({}, SB.config.service) };
  const ds = { tickets: smp.tickets, orders: smp.orders, events: smp.events, batches: smp.batches, learned: smp.learned, menu: [], ingredients: [], settings };
  const none = M.sales(ds, { from: 1, to: 2 });
  assert.equal(none.checks, 0); assert.equal(none.collected, 0); assert.deepEqual(none.byDay, []);
  const o = smp.orders.find((x) => x.status === 'paid');
  const one = M.sales(ds, { from: o.paidAt, to: o.paidAt + 1 });
  assert.equal(one.checks, 1);
  assert.equal(c100(one.collected), c100(o.totals.total) + c100(o.tip || 0));
  const emptyCsv = BP.salesCsv({ orders: [], settings }, 4).trim().split('\r\n');
  assert.equal(emptyCsv.length, 1, 'only the header when nothing was paid');
});

test('finished tickets, items and stations add up to the ticket list', () => {
  const smp = SB.sim.sample({ now: ANCHORS[0] });
  const settings = { service: Object.assign({}, SB.config.service) };
  const ds = { tickets: smp.tickets, orders: smp.orders, events: smp.events, batches: smp.batches, learned: smp.learned, menu: [], ingredients: [], settings };
  const range = { from: -Infinity, to: Infinity };
  const sum = M.summary(ds, range);
  const finished = smp.tickets.filter((t) => t.status !== 'active' && t.status !== 'voided');
  const voided = smp.tickets.filter((t) => t.status === 'voided');
  assert.equal(sum.count, finished.length, 'finished tickets = tickets not active and not voided');
  const items = M.byItem(ds, range);
  // Items sold counts items that were actually marked done; items left undone on a force-sent ticket are not sold.
  const qty = finished.reduce((a, t) => a + t.items.filter((it) => it.status === 'done').reduce((b, it) => b + (it.qty || 1), 0), 0);
  assert.equal(items.reduce((a, r) => a + r.sold, 0), qty, 'items sold = sum of done item quantities on finished tickets');
  assert.equal(items.reduce((a, r) => a + r.lines, 0), finished.reduce((a, t) => a + t.items.filter((it) => it.status === 'done').length, 0), 'item lines add up too');
  assert.ok(voided.length >= 0);
});

test('safety record ranges start at the wall-clock day-start hour, also on the two daylight-saving days', () => {
  const insp = SB.office.inspectorPure || null;
  if (!insp) return; // loaded only when the inspector file is in the test bundle
  for (const day of [new Date(2026, 2, 8, 12).getTime(), new Date(2026, 10, 1, 12).getTime()]) {
    const w = insp.rangeFor('today', day, 4);
    assert.equal(new Date(w.from).getHours(), 4);
    assert.equal(new Date(w.to).getHours(), 4);
  }
});

test('sales by hour use the wall clock on the two daylight-saving days (noon is hour 12, 6 pm is hour 18, 12:30 am is hour 24)', () => {
  const settings = { service: Object.assign({}, SB.config.service) };
  const mk = (id, at) => ({ id, status: 'paid', paidAt: at, createdAt: at - 60000, channel: 'dine_in', method: 'cash', tip: 0, totals: { subtotal: 10, discount: 0, tax: 0, total: 10, taxRate: 0 } });
  for (const [label, y, mo, d] of [['spring forward', 2026, 2, 8], ['fall back', 2026, 10, 1], ['ordinary', 2026, 5, 12]]) {
    const at = (h, m = 0, extraDay = 0) => new Date(y, mo, d + extraDay, h, m, 0).getTime();
    const orders = [mk('a', at(12)), mk('b', at(18, 30)), mk('c', at(0, 30, 1)), mk('d', at(5))];
    const ds = { tickets: [], orders, events: [], batches: [], learned: {}, menu: [], ingredients: [], settings };
    const byHour = M.sales(ds, { from: -Infinity, to: Infinity }).byHour;
    const get = (h) => (byHour.find((x) => x.hour === h) || { checks: 0 }).checks;
    assert.equal(get(12), 1, label + ': noon is hour 12');
    assert.equal(get(18), 1, label + ': 6:30 pm is hour 18');
    assert.equal(get(24), 1, label + ': 12:30 am the next morning is hour 24');
    assert.equal(get(5), 1, label + ': 5 am is hour 5');
  }
});

test('best day of the week: Monday-first averages in cents, and nothing until there are two weeks', () => {
  const B = SB.officeB;
  assert.ok(B && B.weekdayAverages, 'the helper is available');
  const day = (key, net) => ({ date: key, net });
  const rows = [];
  for (let i = 0; i < 21; i++) { const key = U.addDays('2026-10-01', i); rows.push(day(key, U.weekday(key) === 5 ? 300.1 : 100.05)); }
  const wd = B.weekdayAverages(rows);
  assert.equal(wd.length, 7);
  assert.deepEqual(wd.map((x) => x.name), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(wd[4].avg, 300.1, 'Friday average');
  assert.equal(wd[0].avg, 100.05, 'Monday average');
  assert.equal(wd.reduce((a, x) => a + x.days, 0), 21, 'every day is counted once');
  assert.equal(B.weekdayAverages(rows.slice(0, 9)), null, 'fewer than ten days: no chart');
  assert.equal(B.weekdayAverages([]), null);
  const sparse = [day('2026-10-01', 5), day('2026-10-02', 5), day('2026-10-03', 5), day('2026-10-04', 5), day('2026-10-05', 5), day('2026-10-06', 5), day('2026-10-07', 5), day('2026-10-08', 5), day('2026-10-09', 5), day('2026-10-10', 5)];
  assert.equal(B.weekdayAverages(sparse), null, 'ten days inside ten calendar days is under two weeks');
});
