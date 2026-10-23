// The back office numbers at real volume: a busy kitchen (about 3,000 paid tickets over 90 days) is built with the real engine,
// then the metrics, the stock page's per-day burn, the sales CSV and the pilot report are timed with generous budgets.
// The timing checks skip themselves on a slow or busy machine (a calibration loop decides); the correctness checks always run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBig } from './_big-kitchen.mjs';
import { loadSB } from './_load.mjs';

const { SB, state } = await buildBig({ tickets: 3000, days: 90 });
await loadSB(['25-deadlines', '35-pilot', '40-metrics', '88-office-backup']);
const M = SB.metrics, E = SB.engine, U = SB.util;
const ds = { tickets: state.tickets, orders: state.orders, events: E.allEvents(state), batches: state.batches, learned: {}, menu: state.menu, ingredients: state.ingredients, settings: state.settings, range: { from: -Infinity, to: Infinity } };

// How long a fixed bit of work takes here, so a slow machine can skip the timing checks instead of failing them.
const calib = (() => { const t0 = performance.now(); let x = 0; for (let i = 0; i < 4e6; i++) x += Math.sqrt(i); return performance.now() - t0 + (x < 0 ? 1 : 0); })();
const slow = calib > 250;
// Runs fn and checks it stays under a budget in milliseconds (skipped on a slow machine).
function within(name, ms, fn) { const t0 = performance.now(); const r = fn(); const dt = performance.now() - t0; if (!slow) assert.ok(dt < ms, name + ' took ' + Math.round(dt) + ' ms, budget ' + ms); return r; }

test('the volume kitchen is big enough to mean something', () => {
  assert.ok(state.tickets.length >= 2500, 'tickets ' + state.tickets.length);
  assert.ok(state.orders.filter((o) => o.status === 'paid').length >= 2500);
});

test('the main metrics stay within a generous budget at about 3,000 tickets', () => {
  within('summary', 1500, () => M.summary(ds));
  within('byHour', 1500, () => M.byHour(ds));
  within('sales', 1500, () => M.sales(ds));
  within('insights', 2500, () => M.insights(ds));
});

test('the stock page asks for one day of each protein dozens of times: that stays cheap, and the answers are stable', () => {
  const ing = state.ingredients.find((i) => i.tcs).id;
  const days = [...new Set(state.batches.map((b) => U.serviceDate(b.enteredAt, 4)))].sort().slice(-35);
  const first = within('35 stockBurn calls', 1500, () => days.map((day) => M.stockBurn(ds, { day, ing })));
  const again = within('35 more stockBurn calls (remembered context)', 600, () => days.map((day) => M.stockBurn(ds, { day, ing })));
  assert.deepEqual(again, first);
  assert.ok(first.some((r) => r.points.length > 0), 'the busy kitchen has intake and use on some days');
  // used + waste never exceeds what came in on a hot-held day
  for (const r of first) if (r.tcs) assert.ok(r.usedG + r.wasteG <= r.intakeG + 1e-6, r.day);
});

test('the sales CSV and the pilot report stay quick at volume', () => {
  const csv = within('sales CSV', 800, () => SB.office.backupPure.salesCsv(state, 4));
  assert.ok(csv.trim().split('\r\n').length > 80, 'one row per day plus a total');
  const rep = within('pilot report', 1500, () => SB.pilot.build(state, { from: 0, to: Date.now() + 864e5, cutsCounted: 500 }));
  assert.ok(rep.pulls.n >= 0 && rep.discards.n >= 0);
  within('pilot text and CSV', 800, () => { SB.pilot.toText(rep); SB.pilot.toCsv(rep); });
});
