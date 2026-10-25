// Tests for the picture rule on special requests (SB.util.modKind): typed words decide the kind, and the kind decides the
// picture (shield, slashed circle, plus, arrow). Any food works; nothing about a dish is hard-coded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util']);
const U = SB.util;

test('each kind of request gets its picture', () => {
  const cases = { 'No onion': 'no', 'without cheese': 'no', 'Hold the mayo': 'no', 'Peanut allergy': 'allergy', 'ALLERGY': 'allergy',
    'gluten free bun': 'allergy', 'Extra cheese': 'extra', 'add bacon': 'extra', '+ pickles': 'extra', 'Sub fries': 'swap',
    'sauce on the side': 'swap', 'slaw instead of fries': 'swap' };
  for (const [text, kind] of Object.entries(cases)) assert.equal(U.modKind(text), kind, text);
  assert.equal(U.MOD_ICON.no, 'ban');
  assert.equal(U.MOD_ICON.allergy, 'shield');
});

test('an allergy wins over leave-off, and plain notes get no picture', () => {
  assert.equal(U.modKind('No nuts'), 'allergy');
  for (const text of ['Well done', 'Medium rare', '', null, undefined]) assert.equal(U.modKind(text), null, String(text));
});
