// Performance guards for a full-size kitchen: 150 dishes, 200 open tickets, a long history. The bounds are about thirty times
// what was measured, so they only trip on a real regression (an accidental scan of the whole history), not on a slow machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines', '30-store']);
const { engine: E, store: S } = SB;
const T = 1780326000000;
let now = T;
let s = E.newState({ now: T, blank: true });
const ap = (type, p) => { const r = E.apply(s, type, p, now); assert.equal(r.report, 'ok', type + ' ' + r.report); s = r.state; };
ap('updateSettings', { patch: { modules: { cookAhead: true } } });
for (let i = 0; i < 80; i++) ap('addIngredient', { name: 'Ing ' + i, costPerKg: 3 });
for (let i = 0; i < 150; i++) ap('addMenuItem', { name: 'Dish ' + i, zone: ['pit', 'sides', 'fry', 'cold'][i % 4], cat: ['meat', 'side', 'fried', 'cold'][i % 4], price: 5 + (i % 20), prepSec: 120, track: 'two' });
for (let i = 0; i < 150; i++) ap('updateMenuItem', { id: s.menu[i].id, patch: { bom: [{ ing: s.ingredients[i % 80].id, qty: 100 }, { ing: s.ingredients[(i + 1) % 80].id, qty: 50 }] } });
for (const ing of s.ingredients) for (let k = 0; k < 3; k++) ap('restock', { ing: ing.id, g: 9e5 });
for (let i = 0; i < 2000; i++) {
  now += 20000; ap('createTicket', { customer: 'G' + i, channel: 'dine_in', items: [{ menuId: s.menu[i % 150].id, qty: 1 }, { menuId: s.menu[(i * 7) % 150].id, qty: 1 }] });
  now += 400000; s = E.tick(s, now).state;
  const tk = s.tickets[s.tickets.length - 1];
  for (const it of tk.items) { const r = E.apply(s, 'completeItem', { ticketId: tk.id, itemId: it.id }, now); if (r.report === 'ok') s = r.state; }
  ap('bumpTicket', { ticketId: tk.id });
  const o = s.orders[s.orders.length - 1];
  if (o.status === 'open') ap('payOrder', { orderId: o.id, method: 'cash', tip: 0, discount: 0 });
}
for (let i = 0; i < 200; i++) { now += 5000; ap('createTicket', { customer: 'Open' + i, channel: 'dine_in', items: [{ menuId: s.menu[i % 150].id, qty: 1 }, { menuId: s.menu[(i * 3) % 150].id, qty: 2 }] }); }
now += 300000; s = E.tick(s, now).state;
const base = s;
const open = base.tickets.filter((t) => t.status === 'active');
// Average milliseconds of n calls.
const avg = (f, n) => { const t = performance.now(); for (let i = 0; i < n; i++) f(i); return (performance.now() - t) / n; };

test('the busy kitchen has the intended size', () => {
  assert.deepEqual([base.menu.length, base.ingredients.length, open.length], [150, 80, 200]);
  assert.ok(base.tickets.length >= 2200);
});

test('each action stays cheap on a busy kitchen (bound 25 ms each, measured about 0.1)', () => {
  const tk = open[100], it = tk.items[0];
  const calls = {
    createTicket: (i) => E.apply(base, 'createTicket', { customer: 'x' + i, channel: 'dine_in', items: [{ menuId: base.menu[i % 150].id, qty: 1 }] }, now + i),
    advanceItem: () => E.apply(base, 'advanceItem', { ticketId: tk.id, itemId: it.id }, now),
    completeItem: () => E.apply(base, 'completeItem', { ticketId: tk.id, itemId: it.id }, now),
    toggle86: (i) => E.apply(base, 'toggle86', { menuId: base.menu[i % 150].id, on: true }, now),
    moveMenuItem: (i) => E.apply(base, 'moveMenuItem', { id: base.menu[10].id, toIndex: 100 + i }, now),
    updateMenuItem: (i) => E.apply(base, 'updateMenuItem', { id: base.menu[5].id, patch: { price: 7 + i } }, now),
    restock: () => E.apply(base, 'restock', { ing: base.ingredients[3].id, g: 100 }, now),
    tickIdle: () => E.tick(base, now),
  };
  for (const [name, f] of Object.entries(calls)) { const ms = avg(f, 20); assert.ok(ms < 25, name + ' took ' + ms.toFixed(2) + ' ms'); }
});

test('what the screens read each second stays cheap (bound 100 ms each, measured about 1)', () => {
  const reads = {
    computeAvail: () => E.computeAvail(base), counts: () => E.views.counts(base, now), activeTickets: () => E.views.activeTickets(base),
    allDay: () => E.allDay(base), deadlines: () => SB.deadlines.build(base, now), unavailable: () => E.views.unavailable(base),
  };
  for (const [name, f] of Object.entries(reads)) { const ms = avg(f, 10); assert.ok(ms < 100, name + ' took ' + ms.toFixed(2) + ' ms'); }
});

test('saving, checking and loading the whole kitchen stay within a second or two', () => {
  let text;
  const ser = avg(() => { text = E.serialize(base); }, 2);
  assert.ok(ser < 1500, 'serialize ' + ser.toFixed(0) + ' ms');
  const val = avg(() => E.validateBackup(text), 2);
  assert.ok(val < 4000, 'validateBackup ' + val.toFixed(0) + ' ms');
  const prune = avg(() => E.prune(base, { maxTickets: 1500, maxEvents: 10000 }), 2);
  assert.ok(prune < 500, 'prune ' + prune.toFixed(0) + ' ms');
});

test('a burst of 100 actions writes nothing until the pause, then once', async () => {
  const m = new Map(), writes = [];
  const b = { persistent: true, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { writes.push(k); m.set(k, JSON.stringify(v)); return true; }, remove: (k) => { m.delete(k); }, keys: () => [] };
  S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => T });
  try {
    S.dispatch('addMenuItem', { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' });
    writes.length = 0;
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) S.dispatch('toggle86', { menuId: 'pie', on: i % 2 === 0 });
    assert.equal(writes.length, 0);
    assert.ok(performance.now() - t0 < 500);
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(writes.filter((k) => k === 'smokebox.v1.state').length, 1);
  } finally { S.destroy(); }
});
