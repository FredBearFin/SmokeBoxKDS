// Independent-review fixes for money: the draft preview uses the charge's own whole-cent rule (#9 helper), numbers are bounded and finite (#8),
// and a sale stays in the day it was made (#10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;

test('#9 helper: totalsOf gives the engine\'s own cents for the reviewer\'s case (6.25 percent on 2.32) and for every rate and subtotal tried', () => {
  assert.equal(E.totalsOf([{ price: 2.32, qty: 1 }], { taxRatePct: 6.25 }).tax, 0.15);
  let bad = 0;
  for (const rate of [4, 5, 5.5, 6, 6.25, 6.5, 7, 7.25, 7.5, 8, 8.25, 8.875, 9, 9.5, 10]) {
    for (let c = 1; c <= 30000; c += 37) {
      const t = E.totalsOf([{ price: c / 100, qty: 1 }], { taxRatePct: rate });
      const expect = Math.floor((c * Math.round(rate * 1e4) + 500000) / 1e6);
      if (Math.round(t.tax * 100) !== expect || Math.round(t.total * 100) !== c + expect) bad++;
    }
  }
  assert.equal(bad, 0);
  const t = E.totalsOf([{ price: 3.1, qty: 2 }, { price: 1.15, qty: 1 }], { extraSubtotalCents: 500, discount: 1, taxRatePct: 8 });
  assert.deepEqual([t.subtotal, t.discount, t.qty], [12.35, 1, 3]);
  assert.deepEqual(E.totalsOf([], {}).total, 0);
  assert.equal(E.totalsOf([{ price: NaN, qty: -2 }, null], { taxRatePct: 8 }).total, 0, 'junk lines add nothing');
});
