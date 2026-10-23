// Found by the endurance run: at the counter, the sale that pushes the order list past its cap trims old orders first, which moved the new
// order's position, so the payment hit the wrong place and every later counter sale failed with an internal error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;

test('counter service keeps taking payment once the order list is over its cap', () => {
  const old = SB.config.limits.maxOrders;
  SB.config.limits.maxOrders = 40;
  try {
    let now = new Date(2026, 9, 20, 12, 0, 0).getTime();
    let s = E.newState({ now, blank: true });
    const go = (type, p) => { now += 1000; const r = E.apply(s, type, p, now); if (r.report === 'ok') s = r.state; return r; };
    go('updateSettings', { patch: { service: { counter: true } } });
    const dish = go('addMenuItem', { name: 'Plain', zone: 'pit', cat: 'meat', price: 5, prepSec: 60, track: 'one', prepGuess: false }).info.id;
    for (let i = 0; i < 120; i++) {
      const r = go('createTicket', { customer: 'C' + i, items: [{ menuId: dish }], pay: { method: 'cash' } });
      assert.equal(r.report, 'ok', 'sale ' + i + ': ' + r.report + ' ' + JSON.stringify(r.info));
      assert.equal(r.info.paid, true);
    }
    assert.ok(s.orders.length <= 40);
    assert.ok(s.orders.every((o) => o.status === 'paid'));
    assert.deepEqual(E.checkInvariants(s, now), []);
  } finally { SB.config.limits.maxOrders = old; }
});
