// Wall mode numbers: money so far, late count, 86 list, brisket run-out and the order lists for the side panes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines']);
const E = SB.engine, D = SB.deadlines;
const T0 = Date.UTC(2026, 9, 12, 16, 0, 0), MIN = 60e3;

test('glance: an empty kitchen has no money, no late tickets and brisket "none"', () => {
  const s = E.newState({ now: T0, empty: true });
  const g = D.wallGlance(s, T0, D.build(s, T0), E.views.counts(s, T0));
  assert.equal(g.money, 0); assert.equal(g.paidCount, 0); assert.equal(g.late, 0);
  assert.equal(g.brisket.kind, 'none');
  assert.deepEqual(g.open, []);
});

test('glance: an open order is listed, a paid one adds its total to money so far and moves to the paid list', () => {
  let s = E.newState({ now: T0, stagger: true });
  const mi = SB.config.menu.slice(0, 1).map((m) => ({ menuId: m.id, qty: 1 }));
  let r = E.apply(s, 'createTicket', { customer: 'Table 9', channel: 'dine_in', items: mi }, T0 + MIN);
  assert.equal(r.report, 'ok'); s = r.state;
  let g = D.wallGlance(s, T0 + 2 * MIN, [], E.views.counts(s, T0 + 2 * MIN));
  assert.equal(g.open.length, 1); assert.equal(g.open[0].name, 'Table 9'); assert.equal(g.open[0].rounds, 1); assert.equal(g.money, 0);
  const oid = s.orders[0].id;
  r = E.apply(s, 'payOrder', { orderId: oid, method: 'cash' }, T0 + 3 * MIN);
  assert.equal(r.report, 'ok'); s = r.state;
  g = D.wallGlance(s, T0 + 4 * MIN, [], E.views.counts(s, T0 + 4 * MIN));
  assert.equal(g.open.length, 0); assert.equal(g.paid.length, 1); assert.equal(g.paidCount, 1);
  assert.equal(g.money, s.orders[0].totals.total);
});

test('glance: a forecast brisket run-out in the feed gives its time; brisket in the cabinet with no forecast is "enough"', () => {
  const s = E.newState({ now: T0, stagger: true });
  const g1 = D.wallGlance(s, T0, [{ kind: 'shortfall', ing: 'brisket', at: T0 + 90 * MIN }], {});
  assert.equal(g1.brisket.kind, 'runout'); assert.equal(g1.brisket.at, T0 + 90 * MIN);
  assert.equal(D.wallGlance(s, T0, [], {}).brisket.kind, 'enough');
});

test('glance: items that are 86 are named', () => {
  const s = E.newState({ now: T0, empty: true });
  const g = D.wallGlance(s, T0, [], {});
  assert.ok(g.out86.length > 0, 'an empty kitchen has dishes that cannot be made');
});
