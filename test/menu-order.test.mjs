// Dish reorder (moveMenuItem) and refusal messages that name the dish from the live menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;
const T = 1780326000000;
const ok = (r, w) => { assert.equal(r.report, 'ok', w + ': ' + r.report + ' ' + JSON.stringify(r.info)); return r.state; };
const withDishes = (...names) => names.reduce((s, n) => ok(E.apply(s, 'addMenuItem', { name: n, zone: 'pit', cat: 'meat', price: 5, prepSec: 60, track: 'one' }, T), 'add ' + n), E.newState({ now: T, blank: true }));
const order = (s) => s.menu.map((m) => m.id).join(',');

test('moveMenuItem moves a dish, keeps everything else, and logs it', () => {
  let s = withDishes('A', 'B', 'C', 'D');
  assert.equal(order(s), 'a,b,c,d');
  const before = s.menu.slice();
  s = ok(E.apply(s, 'moveMenuItem', { id: 'd', toIndex: 0 }, T), 'to front');
  assert.equal(order(s), 'd,a,b,c');
  s = ok(E.apply(s, 'moveMenuItem', { id: 'd', toIndex: 3 }, T), 'to back');
  assert.equal(order(s), 'a,b,c,d');
  s = ok(E.apply(s, 'moveMenuItem', { id: 'b', toIndex: 2 }, T), 'middle');
  assert.equal(order(s), 'a,c,b,d');
  assert.deepEqual(s.menu.map((m) => m.name).sort(), ['A', 'B', 'C', 'D']);
  assert.ok(s.menu.every((m) => before.some((b) => b.id === m.id && JSON.stringify(b) === JSON.stringify(m))));
  assert.ok(E.allEvents(s).some((e) => e.type === 'settings_changed' && e.keys[0] === 'menu.b.moved'));
  assert.deepEqual(E.checkInvariants(s, T), []);
  const v = E.validateBackup(E.serialize(s));
  assert.deepEqual(v.repaired, []); assert.equal(order(v.state), 'a,c,b,d');   // the order survives a save
});

test('moveMenuItem refusals', () => {
  const s = withDishes('A', 'B', 'C');
  const r = (p) => E.apply(s, 'moveMenuItem', p, T);
  assert.equal(r({ id: 'zzz', toIndex: 0 }).report, 'unknownMenu');
  assert.equal(r({ id: 'a', toIndex: 0 }).report, 'nothingToDo');
  for (const toIndex of [-1, 3, 1.5, '1', NaN, undefined, null]) assert.equal(r({ id: 'a', toIndex }).report, 'outOfBounds', String(toIndex));
  assert.deepEqual(r({ id: 'a', toIndex: 9 }).info, { key: 'toIndex', min: 0, max: 2 });
  assert.equal(r({ id: {}, toIndex: 1 }).report, 'unknownMenu');
});

test('moveMenuItem undoes cleanly, and refuses when the dish has moved again', () => {
  const s0 = withDishes('A', 'B', 'C', 'D');
  const s1 = ok(E.apply(s0, 'moveMenuItem', { id: 'a', toIndex: 2 }, T), 'move');
  assert.equal(order(s1), 'b,c,a,d');
  const back = ok(E.apply(s1, 'undo', {}, T + 1000), 'undo');
  assert.equal(order(back), 'a,b,c,d');
  assert.deepEqual(back.menu, s0.menu);
  assert.deepEqual(E.checkInvariants(back, T + 1000), []);
  // two moves in a row undo in reverse order
  const s2 = ok(E.apply(s1, 'moveMenuItem', { id: 'a', toIndex: 0 }, T + 10), 'again');
  assert.equal(order(s2), 'a,b,c,d');
  const u = ok(E.apply(s2, 'undo', {}, T + 20), 'undo second');
  assert.equal(order(u), 'b,c,a,d');
  assert.equal(order(ok(E.apply(u, 'undo', {}, T + 30), 'undo first')), 'a,b,c,d'); // the older move is undone next
  const stuck = ok(E.apply(s1, 'moveMenuItem', { id: 'd', toIndex: 0 }, T + 40), 'other move');
  const shifted = ok(E.apply(stuck, 'moveMenuItem', { id: 'a', toIndex: 1 }, T + 50), 'a moves');
  const gone = ok(E.apply(shifted, 'undo', {}, T + 60), 'undo a');
  assert.equal(order(gone), order(stuck));
  assert.equal(E.apply(s0, 'undo', {}, T).report, 'undoNothing');
});

test('moving a dish does not disturb availability, tickets or the books', () => {
  let s = withDishes('A', 'B');
  s = ok(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'b', qty: 1 }] }, T + 1000), 'ticket');
  const moved = ok(E.apply(s, 'moveMenuItem', { id: 'b', toIndex: 0 }, T + 2000), 'move');
  assert.deepEqual(moved.tickets, s.tickets); assert.deepEqual(moved.avail, s.avail); assert.deepEqual(moved.ledger, s.ledger);
});

test('refusal messages name the live dish, not only the sample menu', () => {
  let s = withDishes('Chili bowl');
  s = ok(E.apply(s, 'toggle86', { menuId: 'chili_bowl', on: true }, T), '86');
  const r = E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'chili_bowl', qty: 1 }] }, T);
  assert.equal(r.report, 'itemUnavailable');
  const msg = E.describe(r.report, r.info, s.settings);
  assert.match(msg, /^Chili bowl is marked 86 by hand\./);
  // a sample dish keeps its name, and older callers that pass only the id still get the sample name
  assert.match(E.describe('itemUnavailable', { menuId: 'tea', reason: 'stock' }, s.settings), /^Sweet tea, large is sold out/);
  assert.match(E.describe('itemUnavailable', { menuId: 'nope', reason: 'stock' }, s.settings), /^That item is sold out/);
  // portions that ran out
  let p = ok(E.apply(withDishes('Pie'), 'setPortions', { menuId: 'pie', on: true, count: 0 }, T), 'portions');
  const rp = E.apply(p, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'pie', qty: 1 }] }, T);
  assert.match(E.describe(rp.report, rp.info, p.settings), /^Pie is sold out\./);
});
