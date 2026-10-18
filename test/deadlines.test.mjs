// Deadline feed tests: what the kitchen should be told, in what order, and what the projected waste says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines']);
const E = SB.engine, D = SB.deadlines, C = SB.config;
const T0 = Date.UTC(2026, 9, 12, 16, 0, 0), MIN = 60e3, HR = 60 * MIN;

test('rungs: brisket starts at 2 hours, others at 1 hour; the rung number counts crossed thresholds', () => {
  assert.deepEqual(D.rungsFor('brisket'), [120, 60, 30, 10]);
  assert.deepEqual(D.rungsFor('pork'), [60, 30, 10]);
  const r = [60, 30, 10];
  assert.equal(D.rungOf(61 * MIN, r), 0);
  assert.equal(D.rungOf(60 * MIN, r), 1);
  assert.equal(D.rungOf(29 * MIN, r), 2);
  assert.equal(D.rungOf(9 * MIN, r), 3);
  assert.equal(D.rungOf(0, r), 4);
});

test('feed: a fresh staggered kitchen is quiet except brisket 25 minutes from expiry, which is bad and says it goes 86', () => {
  const s = E.newState({ now: T0, stagger: true });
  const f = D.build(s, T0);
  const top = f[0];
  assert.equal(top.kind, 'expiry');
  assert.equal(top.ing, 'brisket');
  assert.equal(top.sev, 'bad', 'the last rung or the only batch left is bad');
  assert.ok(/86/.test(top.consequence) || /No other/.test(top.consequence), top.consequence);
  assert.equal(Math.round(top.msLeft / MIN), 25);
  assert.ok(f.every((x, i) => i === 0 || x.msLeft >= 0));
});

test('feed: projected waste follows the sales pace, oldest batch first, and quiet when the pace clears it', () => {
  let s = E.newState({ now: T0, empty: true });
  const r1 = E.apply(s, 'addBatch', { ing: 'pork', tempF: 160, cookedG: 6000 }, T0);
  s = r1.state;
  // Pull 1 kg every 30 minutes through the last 90 minutes before the check time.
  for (let i = 0; i < 3; i++) { const r = E.apply(s, 'pullBatch', { ing: 'pork', g: 1000 }, T0 + 2 * HR + 15 * MIN + i * 30 * MIN); assert.equal(r.report, 'ok'); s = r.state; }
  const at = T0 + 3.5 * HR;
  const f = D.build(s, at);
  const row = f.find((x) => x.kind === 'expiry');
  assert.ok(row, JSON.stringify(f.map((x) => x.id)));
  assert.ok(row.wasteG > 1500 && row.wasteG < 2500, '3000 g left, 1000 g sold in 30 minutes: ' + row.wasteG);
  assert.equal(row.guess, false);
  // A slower pace wastes more.
  const slow = E.apply(E.newState({ now: T0, empty: true }), 'addBatch', { ing: 'pork', tempF: 160, cookedG: 6000 }, T0).state;
  const slowRow = D.build(slow, T0 + 3.5 * HR).find((x) => x.kind === 'expiry');
  assert.equal(slowRow.guess, true, 'no sales data is labelled as a guess');
});

test('feed: a temperature check due soon, a late sanitize and late tickets appear; an empty kitchen is empty', () => {
  const s = E.newState({ now: T0, empty: true });
  assert.deepEqual(D.build(s, T0).map((x) => x.kind), ['sanitize'], 'a fresh kitchen only has the first sanitize round due');
  const withBatch = E.apply(s, 'addBatch', { ing: 'beans', tempF: 160, cookedG: 3000 }, T0).state;
  const f = D.build(withBatch, T0 + 110 * MIN);
  assert.ok(f.some((x) => x.kind === 'check'), f.map((x) => x.id).join());
  const san = D.build(withBatch, T0 + 5 * HR).find((x) => x.kind === 'sanitize');
  assert.ok(san && san.sev === 'warn');
});

test('feed: junk input is safe', () => {
  assert.deepEqual(D.build(null, T0), []);
  assert.deepEqual(D.build(E.newState({ now: T0 }), NaN), []);
});
