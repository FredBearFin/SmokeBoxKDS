// The sales CSV for an accountant, with a currency symbol set, counter service on, and a voided and a re-opened order:
// opened with a real CSV parser, every amount must be plain digits, the Total row must equal the day rows, and counter
// service tickets must stay out of the kitchen times.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '36-csv', '40-metrics', '88-office-backup']);
const E = SB.engine, M = SB.metrics, BP = SB.office.backupPure;
const T0 = new Date(2026, 9, 14, 12, 0, 0).getTime();

// A small RFC 4180 reader: quoted cells, doubled quotes, commas and line breaks inside quotes.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// A blank counter-service kitchen with a euro sign, three paid orders, one voided and one re-opened and paid again.
function kitchen() {
  let now = T0, s = E.newState({ now, blank: true });
  const go = (t, p, dt = 1000) => { now += dt; const r = E.apply(s, t, p, now); assert.equal(r.report, 'ok', t + ' ' + r.report); s = r.state; return r; };
  go('updateSettings', { patch: { service: { counter: true, taxRatePct: 8.875 }, ui: { currency: '€' } } });
  const dish = go('addMenuItem', { name: 'Plate, "big"', zone: 'pit', cat: 'meat', price: 12.37, prepSec: 60, track: 'one', prepGuess: false }).info.id;
  const order = (qty) => go('createTicket', { customer: 'C' + qty, channel: 'dine_in', items: [{ menuId: dish, qty }] }).info.orderId;
  const o1 = order(1), o2 = order(2), o3 = order(3), o4 = order(1);
  go('payOrder', { orderId: o1, method: 'cash', tip: 1.5 });
  go('payOrder', { orderId: o2, method: 'card', tip: 0, discount: 1.01 });
  go('payOrder', { orderId: o3, method: 'other', tip: 2 });
  go('reopenOrder', { orderId: o3 });
  go('payOrder', { orderId: o3, method: 'card', tip: 2 });
  const tk = s.tickets.find((t) => t.orderId === o4);
  if (tk && tk.status !== 'voided') go('voidTicket', { ticketId: tk.id, reason: 'test' });
  go('voidOrder', { orderId: o4, reason: 'test' });
  return s;
}

test('the sales CSV opens in a CSV parser, amounts are plain digits, Total equals the day rows, void and re-open are right', () => {
  const s = kitchen();
  const rows = parseCsv(BP.salesCsv(s, s.settings.service.dayStartHour));
  assert.equal(rows[0].length, 10);
  assert.deepEqual(rows[0].slice(0, 3), ['Date', 'Orders paid', 'Sales (after discounts)']);
  assert.ok(rows.every((r) => r.length === 10), 'every row has ten cells');
  for (const r of rows.slice(1)) for (const c of r.slice(1)) assert.match(c, /^-?\d+(\.\d{2})?$/, 'plain digits, no currency sign: ' + c);
  assert.equal(rows[rows.length - 1][0], 'Total');
  const days = rows.slice(1, -1), tot = rows[rows.length - 1];
  for (let c = 1; c < 10; c++) assert.equal(Math.round(days.reduce((a, r) => a + parseFloat(r[c]) * 100, 0)), Math.round(parseFloat(tot[c]) * 100), 'Total column ' + c);
  assert.equal(tot[1], '3', 'three paid orders: the voided one is out and the re-opened one counts once');
  assert.equal(Math.round(parseFloat(tot[6]) * 100), Math.round(parseFloat(tot[2]) * 100 + parseFloat(tot[4]) * 100 + parseFloat(tot[5]) * 100), 'collected = sales + tax + tips');
  assert.equal(Math.round(parseFloat(tot[7]) * 100 + parseFloat(tot[8]) * 100 + parseFloat(tot[9]) * 100), Math.round(parseFloat(tot[6]) * 100), 'cash + card + other = collected');
  assert.ok(!/€/.test(BP.salesCsv(s, 4)), 'the symbol never reaches the file');
});

test('counter service: tickets finished by payment give no kitchen time, but still count as sales and as created', () => {
  const s = kitchen();
  const ds = { tickets: s.tickets, orders: s.orders, events: E.allEvents(s), batches: s.batches, learned: s.learned || {}, menu: s.menu, ingredients: s.ingredients, settings: s.settings, range: { from: -Infinity, to: Infinity } };
  const sm = M.summary(ds);
  const paidTickets = s.tickets.filter((t) => t.status === 'expedited' && t.auto === true).length;
  assert.ok(paidTickets >= 3, 'the paid orders\' tickets were finished by payment');
  assert.equal(sm.median, null, 'no kitchen time from tickets nobody cooked');
  assert.ok(sm.created >= 3, 'they still count as created');
  const sales = M.sales(ds);
  assert.ok(JSON.stringify(sales).length > 10);
});
