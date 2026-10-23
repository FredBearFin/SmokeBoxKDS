// The cash-in-the-drawer helper: starting cash plus the cash customers paid, with cash tips shown apart, in exact cents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '87-office-closeday']);
const { drawerExpected } = SB.office.closeDayPure;
const model = { methods: [{ id: 'cash', collected: 53.1, tip: 4.1 }, { id: 'card', collected: 40, tip: 2 }] };

test('expected cash is the starting cash plus cash payments, and tips are only shown, never invented', () => {
  const d = drawerExpected('150', model);
  assert.equal(d.start, 150);
  assert.equal(d.cashSales, 49);
  assert.equal(d.cashTips, 4.1);
  assert.equal(d.expected, 203.1);
  assert.equal(drawerExpected('', model).expected, 53.1, 'no starting cash: just the cash payments');
  assert.equal(drawerExpected('$100.05', model).expected, 153.15);
});

test('a starting cash that is not dollars is flagged and ignored', () => {
  const d = drawerExpected('abc', model);
  assert.equal(d.bad, true);
  assert.equal(d.expected, 53.1);
  assert.equal(drawerExpected('1.234', model).bad, true);
});
