// Close the month and the back office: a real kitchen of 50 closed days is pruned with the engine's own closeMonth, then every office number is
// reconciled before and after on the days that stay, the sales CSV still lists every day (the cleared ones from their end-of-day records),
// the page note for cleared days appears exactly when a range reaches them, and the safety record labels the month_closed entry.
// Run in several time zones: TZ=America/New_York node --test test/office-month.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '36-csv', '40-metrics', '80-office-core', '87-office-closeday', '88-office-backup', '89-office-inspector']);
const E = SB.engine, M = SB.metrics, U = SB.util, BP = SB.office.backupPure, CD = SB.office.closeDayPure;
const MIN = 60e3;
const c100 = (v) => Math.round(v * 100 + 1e-7);
const at = (d, h, m = 0) => new Date(2026, 6, 1 + d, h, m, 0, 0).getTime();   // day d after 1 July 2026, wall clock

// A small RFC 4180 reader.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// A seeded random generator.
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// 50 service days of paid orders (voids, tips, discounts, three payment methods, an order paid after midnight), each day closed at night, plus today left open.
function kitchen() {
  const r = rng(99);
  const k = { now: at(0, 7) }; k.s = E.newState({ now: k.now, blank: true });
  const go = (type, p, t) => { k.now = Math.max(k.now + 1000, t == null ? k.now : t); const res = E.apply(k.s, type, p, k.now); assert.equal(res.report, 'ok', type + ' ' + res.report); k.s = res.state; return res; };
  go('updateSettings', { patch: { service: { taxRatePct: 8.25 } } });
  const dishes = [['Brisket', 'pit', 16.49], ['Pork', 'pit', 12.99], ['Slaw', 'cold', 3.37]].map(([name, zone, price]) => go('addMenuItem', { name, zone, cat: 'meat', price, prepSec: 60, track: 'one', prepGuess: false }).info.id);
  for (let d = 0; d < 50; d++) {
    for (let j = 0; j < 5; j++) {
      const t = at(d, 11 + j * 2, 5);
      const cr = go('createTicket', { customer: 'D' + d + 'n' + j, channel: 'dine_in', items: [{ menuId: dishes[Math.floor(r() * 3)], qty: 1 + Math.floor(r() * 3) }] }, t);
      if (j === 4 && d % 7 === 0) { go('voidTicket', { ticketId: cr.info.ticketId, reason: 'oops' }, k.now + 1000); go('voidOrder', { orderId: cr.info.orderId, reason: 'oops' }, k.now + 1000); continue; }
      const tk = k.s.tickets.find((x) => x.id === cr.info.ticketId);
      for (const it of tk.items) go('completeItem', { ticketId: tk.id, itemId: it.id }, k.now + 20000);
      go('bumpTicket', { ticketId: tk.id }, k.now + 5000);
      const late = j === 3 && d % 5 === 0;
      go('payOrder', { orderId: cr.info.orderId, method: ['cash', 'card', 'other'][Math.floor(r() * 3)], tip: Math.round(r() * 500) / 100, discount: r() < 0.2 ? 1.01 : 0 }, late ? at(d + 1, 0, 40) : k.now + 3 * MIN);
    }
    go('closeDay', {}, at(d + 1, 1, 0));
  }
  return k;
}
const K = kitchen();
const today = U.serviceDate(K.now, 4);
const R = E.closeMonth(K.s, { before: today, backup: { filename: 'x.json', chars: 10, sha256: 'a'.repeat(64) } }, K.now);
const full = K.s, pruned = R.state;
const dsOf = (s) => ({ tickets: s.tickets, orders: s.orders, events: E.allEvents(s), batches: s.batches, learned: {}, menu: s.menu, ingredients: s.ingredients, settings: s.settings, range: { from: -Infinity, to: Infinity }, archivedBefore: s.archivedBefore });
// Whole cents per service day from the paid orders alone.
function ledger(s) {
  const days = {};
  for (const o of s.orders) if (o.status === 'paid') { const d = U.serviceDate(o.paidAt, 4), x = days[d] || (days[d] = { n: 0, coll: 0, sales: 0, tax: 0 }); const T = o.totals; x.n++; x.coll += c100(T.total) + c100(o.tip || 0); x.sales += c100(T.subtotal) - c100(T.discount); x.tax += c100(T.tax); }
  return days;
}

test('the pruned kitchen is a real one: old days gone, the last 35 days and every end-of-day record stay', () => {
  assert.equal(R.report, 'ok', JSON.stringify(R.info));
  assert.ok(pruned.archivedBefore && pruned.archivedBefore <= today);
  assert.ok(pruned.orders.length < full.orders.length && pruned.orders.length > 0);
  assert.equal(E.allEvents(pruned).filter((e) => e.type === 'day_closed').length, E.allEvents(full).filter((e) => e.type === 'day_closed').length, 'no end-of-day record is lost');
  assert.ok(E.allEvents(pruned).some((e) => e.type === 'month_closed'));
});

test('reconcile before and after: every day that stays has exactly the same numbers; the cleared days add up to the record', () => {
  const Lf = ledger(full), Lp = ledger(pruned), sp = M.sales(dsOf(pruned), { from: -Infinity, to: Infinity });
  const keptDays = Object.keys(Lp);
  assert.ok(keptDays.length > 20 && keptDays.every((d) => d >= pruned.archivedBefore));
  for (const d of keptDays) assert.deepEqual(Lp[d], Lf[d], 'day ' + d);
  sp.byDay.forEach((x) => assert.equal(c100(x.collected), Lp[x.date].coll, 'sales page ' + x.date));
  assert.equal(sp.byDay.length, keptDays.length, 'the sales page shows only the days that stay');
  const goneColl = Object.keys(Lf).filter((d) => !Lp[d]).reduce((a, d) => a + Lf[d].coll, 0), goneTotal = Object.keys(Lf).filter((d) => !Lp[d]).reduce((a, d) => a + Lf[d].coll - 0, 0);
  const ev = E.allEvents(pruned).find((e) => e.type === 'month_closed');
  assert.ok(Object.keys(Lf).filter((d) => !Lp[d]).every((d) => d < pruned.archivedBefore), 'only archived days are missing');
  assert.equal(c100(ev.paidTotal), Object.keys(Lf).filter((d) => !Lp[d]).reduce((a, d) => a + Lf[d].coll - Lf[d].coll + (full.orders.filter((o) => o.status === 'paid' && U.serviceDate(o.paidAt, 4) === d).reduce((x, o) => x + c100(o.totals.total), 0)), 0), 'the record says what was cleared, in whole cents');
  assert.ok(goneColl > 0 && goneTotal === goneColl);
});

test('the sales CSV still has every day: cleared days come from their end-of-day records and equal the unpruned file', () => {
  const a = parseCsv(BP.salesCsv(full, 4)), b = parseCsv(BP.salesCsv(pruned, 4));
  assert.deepEqual(b, a, 'the file is identical before and after clearing');
  assert.ok(b.length > 40);
});

test('Close the day and the glance numbers (today only) do not change', () => {
  const m1 = CD.closeDayModel(full, K.now), m2 = CD.closeDayModel(pruned, K.now);
  assert.deepEqual(m2, m1);
});

test('the page note appears exactly when a range reaches cleared days, in plain words', () => {
  const b = pruned.archivedBefore, w = SB.office.archivedWords;
  const start = new Date(...b.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), 4, 0, 0, 0).getTime();
  assert.equal(w(b, start, 4), '', 'a range that starts on the first kept day says nothing');
  assert.equal(w(b, start + 3 * 86400e3, 4), '');
  const note = w(b, start - 86400e3, 4);
  assert.match(note, /^Days before .+ were saved to your month files and cleared from this tablet\. Totals for those days are not shown here\.$/);
  assert.equal(w(b, -Infinity, 4), note, 'all time reaches them');
  assert.equal(w(undefined, -Infinity, 4), '', 'a kitchen that never closed a month says nothing');
});

test('the safety record keeps its own entries and labels the month-close entry plainly', () => {
  const rows = SB.office.inspectorPure.inspectorRows(pruned, 0, K.now + 864e5);
  const row = rows.find((x) => x.kind === 'History saved and cleared');
  assert.ok(row, 'the entry is listed');
  assert.match(row.detail, /^Saved \d+ days before .+ to a backup and cleared them from this tablet \(\d+ tickets, \d+ orders\)$/);
});
