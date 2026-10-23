// Unit tests for the pure helpers of the New ticket screen (71-floor-order.js): recent customer names and the
// last-order summary. Run: node --test test/order-logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '71-floor-order']);
const { recentNames, summarize } = SB.orderLogic;

test('recentNames: newest first, no blanks, no quick names, no repeats ignoring case', () => {
  const state = { orders: [
    { customer: 'Dave', createdAt: 10 }, { customer: '', createdAt: 50 }, { customer: 'Table 4', createdAt: 40 },
    { customer: 'dave', createdAt: 30 }, { customer: 'Mia', createdAt: 20 }, { customer: ' Walk-up ', createdAt: 60 }] };
  assert.deepEqual(recentNames(state, ['Walk-up', 'Table 4'], 4), ['dave', 'Mia']);
});

test('recentNames: respects the limit and tolerates a missing state', () => {
  const orders = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => ({ customer: n, createdAt: i }));
  assert.equal(recentNames({ orders }, [], 3).length, 3);
  assert.deepEqual(recentNames({}, [], 3), []);
  assert.deepEqual(recentNames(null, null), []);
});

test('summarize: three dishes in full, more are counted', () => {
  const nm = (id) => id.toUpperCase();
  assert.equal(summarize([{ menuId: 'a', qty: 2 }, { menuId: 'b', qty: 1 }], nm), 'A x2, B');
  assert.equal(summarize([1, 2, 3, 4, 5].map((n) => ({ menuId: 'm' + n, qty: 1 })), nm), 'M1, M2, M3 and 2 more');
});
