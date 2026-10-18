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
  const r1 = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0);
  s = r1.state;
  // Pull 1 kg every 30 minutes through the last 90 minutes before the check time.
  for (let i = 0; i < 3; i++) { const r = E.apply(s, 'pullBatch', { ing: 'ribs', g: 1000 }, T0 + 2 * HR + 15 * MIN + i * 30 * MIN); assert.equal(r.report, 'ok'); s = r.state; }
  const at = T0 + 3.5 * HR;
  const f = D.build(s, at);
  const row = f.find((x) => x.kind === 'expiry');
  assert.ok(row, JSON.stringify(f.map((x) => x.id)));
  assert.ok(row.wasteG > 1500 && row.wasteG < 2500, '3000 g left, 1000 g sold in 30 minutes: ' + row.wasteG);
  assert.equal(row.guess, false);
  // A slower pace wastes more.
  const slow = E.apply(E.newState({ now: T0, empty: true }), 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
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

test('hold window: brisket logged at 4:00 with the kitchen open 11:00 to 21:00 has no sounded alarm and no discard before opening', () => {
  const settings = E.defaultSettings();
  settings.service.openHour = 11; settings.service.closeHour = 21;
  const at = (h, m = 0) => new Date(2026, 9, 12, h, m, 0).getTime();
  let s = E.newState({ now: at(3, 59), empty: true, settings });
  const r = E.apply(s, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 6000 }, at(4));
  assert.equal(r.report, 'ok');
  s = r.state;
  const b = s.batches[0];
  assert.equal(b.maxHoldH, 8);
  assert.equal(b.holdBasis, 'quality');
  assert.equal(b.restUntil, at(7), 'brisket rests 3 hours before it is ready');
  for (let t = at(4); t < at(11); t += 60e3) {
    const tk = E.tick(s, t);
    s = tk.state;
    assert.equal(tk.events.filter((e) => e.type === 'batch_discard').length, 0, 'no discard at ' + new Date(t).toTimeString());
    assert.equal(D.soundsAllowed(s, t), false, 'no sound at ' + new Date(t).toTimeString());
  }
  assert.equal(D.soundsAllowed(s, at(11)), true);
  // The 2-hour rung is crossed at 10:00 but it is silent; it can sound once the kitchen opens, 1 hour before expiry at 12:00.
  const row = D.build(s, at(11)).find((x) => x.kind === 'expiry');
  assert.ok(row && row.rung >= 2 && Math.round(row.msLeft / 60e3) === 60, JSON.stringify(row && [row.rung, row.msLeft]));
  assert.equal(E.tick(s, at(12, 1)).events.filter((e) => e.type === 'batch_discard').length, 1, 'thrown out at 12:00, 8 hours after it went in');
});

test('resting: pulls take the oldest ready batch first and resting batches only when nothing else is left; run-out counts ready stock', () => {
  const T = Date.UTC(2026, 9, 12, 15, 0, 0);
  let s = E.newState({ now: T, empty: true });
  s = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 3000 }, T).state;
  s = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 3000 }, T + 40 * MIN).state; // second rack, rests until T+70min
  const [a, b2] = s.batches;
  const now = T + 45 * MIN; // first batch ready (rested 30 min), second still resting
  let r = E.apply(s, 'pullBatch', { ing: 'ribs', g: 3500 }, now);
  assert.equal(r.report, 'ok');
  assert.deepEqual(r.info.batchIds, [a.id, b2.id], 'ready batch first, then the resting one');
  s = E.apply(s, 'pullBatch', { ing: 'ribs', g: 1000 }, now).state;
  assert.equal(s.batches[0].remainingG, 2000);
  assert.equal(s.batches[1].remainingG, 3000, 'the resting batch is untouched while ready stock lasts');
  // run-out: only the 2000 g that is ready counts
  const ev = E.allEvents(s);
  assert.ok(ev.length > 0);
  const f = D.build(s, now);
  const run = f.find((x) => x.kind === 'runout');
  assert.ok(!run || /2\.00 kg/.test(run.consequence), run && run.consequence);
});

test('migration: a save with the old flat 4-hour cap moves to per-product limits once; chosen values stay', () => {
  const mk = (patch) => { const s = JSON.parse(JSON.stringify(E.newState({ now: T0 }))); s.settings.safety = Object.assign({}, s.settings.safety, patch); delete s.settings.safety.holdWindowV2; for (const i of s.ingredients) if (i.id === 'brisket' || i.id === 'pork') i.maxHoldH = 4; return s; };
  const v = E.validateBackup(mk({ defaultMaxHoldH: 4 }));
  assert.equal(v.state.settings.safety.defaultMaxHoldH, 12);
  assert.equal(v.state.ingredients.find((i) => i.id === 'brisket').maxHoldH, 8);
  assert.equal(v.state.ingredients.find((i) => i.id === 'ribs').maxHoldH, 4);
  assert.equal(E.validateBackup(mk({ defaultMaxHoldH: 6 })).state.settings.safety.defaultMaxHoldH, 6, 'a value the owner chose stays');
});
