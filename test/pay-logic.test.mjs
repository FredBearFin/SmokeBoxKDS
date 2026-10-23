// Unit tests for the pure payment helpers (73-floor-orders.js): tip presets, round-up tip, cash buttons and change.
// Run: node --test test/pay-logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '73-floor-orders']);
const { tipPresets, roundUpTip, cashChoices, changeFor } = SB.payLogic;

test('tipPresets: 15, 18, 20 and 25 percent in whole cents', () => {
  assert.deepEqual(tipPresets(12).map((t) => t.amount), [1.8, 2.16, 2.4, 3]);
  assert.deepEqual(tipPresets(0).map((t) => t.amount), [0, 0, 0, 0]);
  assert.deepEqual(tipPresets(-5).map((t) => t.amount), [0, 0, 0, 0]);
  assert.equal(tipPresets(10.05)[0].amount, 1.51); // 1.5075 rounds to 1.51
});

test('roundUpTip: brings the total to a whole dollar, zero when already whole', () => {
  assert.equal(roundUpTip(23.4), 0.6);
  assert.equal(roundUpTip(23), 0);
  assert.equal(roundUpTip(22.999), 0);
  assert.equal(roundUpTip(0.01), 0.99);
});

test('cashChoices: exact first, then the next bills, each once and never below the bill', () => {
  assert.deepEqual(cashChoices(23.4).map((c) => c.amount), [23.4, 25, 30, 40, 50]);
  assert.deepEqual(cashChoices(20).map((c) => c.amount), [20, 50, 100]);
  cashChoices(87.12).forEach((c) => assert.ok(c.amount >= 87.12));
  assert.equal(cashChoices(23.4)[0].label, 'Exact');
  assert.equal(new Set(cashChoices(4.5).map((c) => c.amount)).size, cashChoices(4.5).length);
});

test('changeFor: change owed, negative when short, exact in cents', () => {
  assert.equal(changeFor(25, 23.4), 1.6);
  assert.equal(changeFor(20, 23.4), -3.4);
  assert.equal(changeFor(0.3, 0.1), 0.2);
});
