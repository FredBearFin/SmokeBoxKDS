// addIngredient, "portions on hand", live categories, the cook-ahead switch on the data side, and unknown cost for batches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines', '30-store']);
const E = SB.engine;
const T = 1780326000000;
const blank = () => E.newState({ now: T, blank: true });
// A new kitchen with the Hold cabinet switched off (it starts on).
const off = () => E.apply(blank(), 'updateSettings', { patch: { modules: { cookAhead: false } } }, T).state;
const ok = (r, what) => { assert.equal(r.report, 'ok', what + ': ' + r.report + ' ' + JSON.stringify(r.info)); return r.state; };
const dish = (s, name = 'Burger', extra = {}) => ok(E.apply(s, 'addMenuItem', Object.assign({ name, zone: 'pit', cat: 'meat', price: 9, prepSec: 60, track: 'one' }, extra), T), 'addMenuItem');
// Orders one portion of a dish, lets it appear, and marks it done at time t.
function sell(s, menuId, t, qty = 1) {
  let r = E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId, qty }] }, t);
  if (r.report !== 'ok') return r;
  const x = E.tick(r.state, t + 100e3).state, ti = x.tickets[x.tickets.length - 1];
  return E.apply(x, 'completeItem', { ticketId: ti.id, itemId: ti.items[0].id }, t + 101e3);
}

test('addIngredient adds a counted-in-grams ingredient with zero stock and balanced books', () => {
  let s = ok(E.apply(blank(), 'addIngredient', { name: 'Ground beef', costPerKg: 9.5, parG: 5000, thresholdG: 500 }, T), 'add');
  const ing = s.ingredients[0];
  assert.deepEqual([ing.id, ing.name, ing.unit, ing.tcs, ing.costPerKg, ing.parG, ing.thresholdG], ['ground_beef', 'Ground beef', 'g', false, 9.5, 5000, 500]);
  assert.equal(s.stock.ground_beef, 0);
  assert.deepEqual(E.checkInvariants(s, T), []);
  s = ok(E.apply(s, 'restock', { ing: 'ground_beef', g: 3000 }, T), 'restock');
  assert.equal(E.servable(s, 'ground_beef'), 3000);
  const v = E.validateBackup(E.serialize(s));
  assert.deepEqual(v.repaired, []); assert.equal(v.state.ingredients.length, 1);
});

test('a recipe can be set with updateMenuItem, stock depletes, cost is recorded, 86 follows the level', () => {
  let s = ok(E.apply(blank(), 'addIngredient', { name: 'Rolls', unit: 'ea', costEach: 0.4, thresholdG: 2 }, T), 'add');
  s = dish(s);
  s = ok(E.apply(s, 'updateMenuItem', { id: 'burger', patch: { bom: [{ ing: 'rolls', qty: 1 }] } }, T), 'recipe');
  s = ok(E.apply(s, 'restock', { ing: 'rolls', g: 4 }, T), 'restock');
  assert.equal(s.avail.burger.ok, true);
  s = sell(s, 'burger', T + 1000);
  s = ok(s, 'sell');
  assert.equal(s.tickets[0].items[0].cost, 0.4);
  assert.equal(s.stock.rolls, 3);
  assert.equal(s.avail.burger.ok, true);  // 3 left; one more portion would leave 2, which is the 86 level, so it is still on
  s = ok(sell(s, 'burger', T + 400e3), 'second');
  assert.equal(s.stock.rolls, 2);
  assert.deepEqual([s.avail.burger.ok, s.avail.burger.reason], [false, 'stock']); // at the 86 level
  assert.deepEqual(E.checkInvariants(s, T + 200e3), []);
});

test('addIngredient refusals carry their codes', () => {
  let s = ok(E.apply(off(), 'addIngredient', { name: 'Flour' }, T), 'add');
  const bad = (p, code) => assert.equal(E.apply(s, 'addIngredient', p, T).report, code, JSON.stringify(p));
  bad({ name: 'flour' }, 'nameTaken');
  bad({ name: '' }, 'outOfBounds');
  bad({ name: 5 }, 'badPatch');
  bad({ name: 'X', unit: 'kg' }, 'badPatch');
  bad({ name: 'X', unit: 'g', costEach: 1 }, 'badPatch');
  bad({ name: 'X', unit: 'ea', costPerKg: 1 }, 'badPatch');
  bad({ name: 'X', costPerKg: -1 }, 'outOfBounds');
  bad({ name: 'X', parG: 'lots' }, 'badPatch');
  bad({ name: 'X', tcs: true }, 'moduleOff');
  s = ok(E.apply(s, 'updateSettings', { patch: { modules: { cookAhead: true } } }, T), 'module on');
  bad({ name: 'X', tcs: true, unit: 'ea' }, 'badPatch');
  bad({ name: 'X', tcs: true, hold: 'warm' }, 'badPatch');
  bad({ name: 'X', tcs: true, maxHoldH: 99 }, 'outOfBounds');
  assert.ok(E.describe('moduleOff').length > 20 && E.describe('nameTaken').length > 20);
});

test('cook-ahead ingredients default to careful hold rules and create no cost they do not have', () => {
  let s = blank();
  s = ok(E.apply(s, 'addIngredient', { name: 'Chili', tcs: true }, T), 'add');
  const i = s.ingredients[0];
  assert.deepEqual([i.tcs, i.hold, i.maxHoldH, i.holdBasis], [true, 'hot', 4, 'safety']);
  s = ok(E.apply(s, 'addBatch', { ing: 'chili', tempF: 160, cookedG: 2000 }, T), 'batch');
  assert.equal('costPerCookedKg' in s.batches[0], false);
  s = dish(s, 'Chili bowl');
  s = ok(E.apply(s, 'updateMenuItem', { id: 'chili_bowl', patch: { bom: [{ ing: 'chili', qty: 300 }] } }, T), 'recipe');
  s = ok(sell(s, 'chili_bowl', T + 1000), 'sell');
  assert.equal('cost' in s.tickets[0].items[0], false);
  s = ok(E.apply(s, 'discardBatch', { batchId: 'b_1', reason: 'other' }, T + 300e3), 'discard');
  assert.equal(E.allEvents(s).find((e) => e.type === 'batch_discard').cost, undefined);
  assert.deepEqual(E.checkInvariants(s, T + 300e3), []);
});

test('undo of addIngredient removes it only while nothing uses it', () => {
  let s = ok(E.apply(blank(), 'addIngredient', { name: 'Salt' }, T), 'add');
  const gone = ok(E.apply(s, 'undo', {}, T + 1000), 'undo');
  assert.deepEqual([gone.ingredients.length, Object.keys(gone.stock).length, Object.keys(gone.ledger).length], [0, 0, 0]);
  assert.deepEqual(E.checkInvariants(gone, T + 1000), []);
  const used = ok(E.apply(s, 'restock', { ing: 'salt', g: 100 }, T), 'restock');
  const r = E.apply(used, 'undo', {}, T + 1000);
  // restock is not undoable, so the undo entry is still the add; it must refuse because stock now exists
  assert.equal(r.report, 'undoConflict');
});

test('the ingredient list has a size limit', () => {
  let s = blank();
  for (let i = 0; i < 80; i++) s = ok(E.apply(s, 'addIngredient', { name: 'Thing ' + i }, T), 'add ' + i);
  const r = E.apply(s, 'addIngredient', { name: 'One too many' }, T);
  assert.equal(r.report, 'tooManyIngredients');
});

test('a new ingredient never takes a config id', () => {
  const s = ok(E.apply(blank(), 'addIngredient', { name: 'Brisket' }, T), 'add');
  assert.equal(s.ingredients[0].id, 'brisket_2');
});

/* ---------------- portions on hand ---------------- */

test('portions on hand: counted stock, sold out at zero, restock, undo, off', () => {
  let s = dish(blank(), 'Pie');
  assert.equal(s.avail.pie.ok, true);                       // a dish that did not opt in is never sold out by itself
  s = ok(E.apply(s, 'setPortions', { menuId: 'pie', on: true, count: 2 }, T), 'on');
  const hidden = s.ingredients.find((i) => i.forMenu === 'pie');
  assert.deepEqual([hidden.hidden, hidden.exact, hidden.unit, s.stock[hidden.id]], [true, true, 'ea', 2]);
  assert.deepEqual(s.menu[0].bom, [{ ing: hidden.id, qty: 1 }]);
  assert.equal(s.avail.pie.ok, true);
  s = ok(sell(s, 'pie', T + 1000), 'first');
  assert.equal(s.stock[hidden.id], 1);
  assert.equal(s.avail.pie.ok, true);                       // the last portion can still be sold
  s = ok(sell(s, 'pie', T + 300e3), 'second');
  assert.equal(s.stock[hidden.id], 0);
  assert.deepEqual([s.avail.pie.ok, s.avail.pie.reason], [false, 'stock']);
  assert.equal(E.apply(s, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'pie', qty: 1 }] }, T + 400e3).report, 'itemUnavailable');
  const back = ok(E.apply(s, 'undo', {}, T + 300e3 + 101e3 + 500), 'undo');
  assert.equal(back.stock[hidden.id], 1); assert.equal(back.avail.pie.ok, true);
  s = ok(E.apply(s, 'restock', { ing: hidden.id, g: 5 }, T + 500e3), 'restock');
  assert.equal(s.avail.pie.ok, true);
  assert.deepEqual(E.checkInvariants(s, T + 500e3), []);
  const v = E.validateBackup(E.serialize(s));
  assert.deepEqual(v.repaired, []); assert.deepEqual(v.state.ingredients, s.ingredients);
  s = ok(E.apply(s, 'setPortions', { menuId: 'pie', on: false }, T + 600e3), 'off');
  assert.deepEqual([s.menu[0].bom, s.ingredients[0].archived, s.avail.pie.ok], [[], true, true]);
  assert.deepEqual(E.checkInvariants(s, T + 600e3), []);
  s = ok(E.apply(s, 'setPortions', { menuId: 'pie', on: true, count: 3 }, T + 700e3), 'on again');
  assert.equal(s.ingredients.length, 1);                    // the same hidden ingredient is revived
  assert.deepEqual([s.ingredients[0].archived, s.stock[s.ingredients[0].id]], [false, 5 + 3]);
});

test('portions on hand: a dish with ingredients cannot count portions; junk is refused; no cost is invented', () => {
  let s = ok(E.apply(blank(), 'addIngredient', { name: 'Flour' }, T), 'ing');
  s = dish(s, 'Bread');
  s = ok(E.apply(s, 'updateMenuItem', { id: 'bread', patch: { bom: [{ ing: 'flour', qty: 200 }] } }, T), 'recipe');
  assert.equal(E.apply(s, 'setPortions', { menuId: 'bread', on: true }, T).report, 'portionsConflict');
  assert.equal(E.apply(s, 'setPortions', { menuId: 'nope', on: true }, T).report, 'unknownMenu');
  assert.equal(E.apply(s, 'setPortions', { menuId: 'bread', on: 'yes' }, T).report, 'badPatch');
  assert.equal(E.apply(s, 'setPortions', { menuId: 'bread', on: false }, T).report, 'nothingToDo');
  let p = dish(blank(), 'Soup');
  for (const count of [-1, 1.5, 1e9, 'x']) assert.equal(E.apply(p, 'setPortions', { menuId: 'soup', on: true, count }, T).report, 'outOfBounds', String(count));
  p = ok(E.apply(p, 'setPortions', { menuId: 'soup', on: true, count: 5 }, T), 'on');
  assert.equal(E.apply(p, 'setPortions', { menuId: 'soup', on: true }, T).report, 'nothingToDo');
  p = ok(sell(p, 'soup', T + 1000), 'sell');
  assert.equal('cost' in p.tickets[0].items[0], false);     // portions carry no cost until the owner gives one
});

/* ---------------- live categories ---------------- */

test('a category added after load is accepted, and the old names stay valid', () => {
  const add = (cat) => E.apply(blank(), 'addMenuItem', { name: 'Cake', zone: 'cold', cat, price: 5, prepSec: 30, track: 'one' }, T).report;
  assert.equal(add('c_desserts'), 'badPatch');
  try {
    assert.deepEqual(SB.config.applyCustom({ add: { categories: [{ name: 'Desserts' }] } }).rejected, []);
    assert.equal(add('c_desserts'), 'ok');
    const s = dish(blank());
    assert.equal(E.apply(s, 'updateMenuItem', { id: 'burger', patch: { cat: 'c_desserts' } }, T).report, 'ok');
  } finally { SB.config.applyCustom({}); }
  assert.equal(add('c_desserts'), 'badPatch');
  for (const old of ['meat', 'sandwich', 'side', 'fried', 'cold']) assert.equal(add(old), 'ok', old);
});

/* ---------------- cook-ahead switch on the data side ---------------- */

test('with cook-ahead off the engine refuses to start batches and raises no sanitize or batch rows', () => {
  const s = off();
  assert.equal(E.apply(s, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 1000 }, T).report, 'moduleOff');
  assert.equal(E.apply(s, 'planBatch', { ing: 'brisket', grams: 1000, offAt: T + 3600e3 }, T).report, 'moduleOff');
  const later = T + 6 * 3600e3;
  const c = E.views.counts(s, later);
  assert.deepEqual([c.sanitizeOverdue, c.sanitizeDueAt, c.hold], [false, undefined, 0]);
  assert.deepEqual(SB.deadlines.build(s, later), []);
  assert.equal(E.apply(s, 'restock', { ing: 'x', g: 1 }, T).report, 'unknownIng');
});

test('with cook-ahead absent or on, everything works as before (sanitize row appears when due)', () => {
  const legacy = E.newState({ now: T });
  const later = T + 6 * 3600e3;
  assert.equal(E.views.counts(legacy, later).sanitizeOverdue, true);
  assert.ok(SB.deadlines.build(legacy, later).some((r) => r.kind === 'sanitize'));
  const on = blank();
  assert.equal(E.views.counts(on, later).sanitizeOverdue, true);
  assert.ok(SB.deadlines.build(on, later).some((r) => r.kind === 'sanitize'));
});

test('turning cook-ahead off never silences food that is in the cabinet', () => {
  const s = ok(E.apply(E.newState({ now: T, starter: true }), 'updateSettings', { patch: { modules: { cookAhead: false } } }, T), 'off');
  assert.equal(E.cookAheadActive(s), true);
  assert.ok(SB.deadlines.build(s, T + 3 * 3600e3).length > 0);
  assert.equal(E.apply(s, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 1000 }, T).report, 'moduleOff');
  const empty = ok(E.apply(E.newState({ now: T, starter: false }), 'updateSettings', { patch: { modules: { cookAhead: false } } }, T), 'off');
  assert.equal(E.cookAheadActive(empty), false);
});
