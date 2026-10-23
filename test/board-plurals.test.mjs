// Counts on the board read "1 ticket", "2 tickets": one shared helper (U.plural) picks the word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util']);
const U = SB.util;

test('plural: one is singular, zero and many are plural', () => {
  for (const [n, w] of [[0, 'tickets'], [1, 'ticket'], [2, 'tickets'], [11, 'tickets']]) assert.equal(n + ' ' + U.plural(n, 'ticket'), n + ' ' + w);
  assert.equal(U.plural(1, 'batch', 'batches'), 'batch');
  assert.equal(U.plural(3, 'batch', 'batches'), 'batches');
  assert.equal(U.plural(1, 'order'), 'order');
  assert.equal(U.plural(0, 'notice'), 'notices');
  assert.equal(U.plural(1, 'day', 'days'), 'day');
});
