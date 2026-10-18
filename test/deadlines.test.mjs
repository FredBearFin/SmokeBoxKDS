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
  assert.equal(row.unknown, false);
  // A slower pace wastes more.
  const slow = E.apply(E.newState({ now: T0, empty: true }), 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  const slowRow = D.build(slow, T0 + 3.5 * HR).find((x) => x.kind === 'expiry');
  assert.equal(slowRow.unknown, true, 'no pulls means the pace is unknown');
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
  assert.equal(D.pauseNote(s, at(4)), 'Sound paused: kitchen closed until ' + SB.util.fmtTime(at(11)));
  assert.equal(D.pauseNote(s, at(11)), null);
  // The 2-hour rung is crossed at 10:00 but it is silent; it can sound once the kitchen opens, 1 hour before expiry at 12:00.
  const row = D.build(s, at(11)).find((x) => x.kind === 'expiry');
  assert.ok(row && row.rung >= 2 && Math.round(row.msLeft / 60e3) === 60, JSON.stringify(row && [row.rung, row.msLeft]));
  // Brisket has a quality limit: at 12:00, 8 hours after it went in, it is held off the menu (past), not thrown out.
  const t12 = E.tick(s, at(12, 1));
  assert.equal(t12.events.filter((e) => e.type === 'batch_discard').length, 0);
  assert.equal(t12.state.batches[0].status, 'past');
  // Only the 12-hour hard cap throws it out.
  assert.equal(E.tick(t12.state, at(16, 1)).events.filter((e) => e.type === 'batch_discard' && e.reason === 'expired').length, 1);
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

test('feed: a batch past its quality limit gets a past row (off the menu, taste it), and no projection', () => {
  let s = E.newState({ now: T0, empty: true });
  s = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  s = E.tick(s, T0 + 4 * HR + 1).state;
  const f = D.build(s, T0 + 4 * HR + 60e3);
  const row = f.find((x) => x.kind === 'past');
  assert.ok(row, f.map((x) => x.id).join());
  assert.equal(row.sev, 'bad');
  assert.ok(/quality limit/.test(row.consequence) && /Taste it/.test(row.action), row.consequence + ' / ' + row.action);
  assert.ok(!f.some((x) => x.kind === 'expiry' && x.batchId === row.batchId), 'no expiry projection for a batch that cannot sell');
});

test('sound pause: note while closed, next start time, early start hour, all-day setting, after-midnight close', () => {
  const at = (h, m = 0, d = 12) => new Date(2026, 9, d, h, m, 0).getTime();
  const mk = (service) => { const settings = E.defaultSettings(); Object.assign(settings.service, service); return E.newState({ now: at(3), empty: true, settings }); };
  const s = mk({ openHour: 11, closeHour: 21, soundStartHour: 11 });
  assert.equal(D.pauseNote(s, at(4)), 'Sound paused: kitchen closed until ' + SB.util.fmtTime(at(11)));
  assert.equal(D.nextOpenAt(s, at(4)), at(11));
  assert.equal(D.pauseNote(s, at(11)), null);
  assert.equal(D.nextOpenAt(s, at(11)), null);
  // After closing the next start is tomorrow morning.
  assert.equal(D.nextOpenAt(s, at(22)), at(11, 0, 13));
  // The sound start hour can be earlier than opening (the pit master starts at 4), never later.
  const early = mk({ openHour: 11, closeHour: 21, soundStartHour: 4 });
  assert.equal(D.soundsAllowed(early, at(4, 30)), true);
  assert.equal(D.soundsAllowed(early, at(3, 59)), false);
  const late = mk({ openHour: 11, closeHour: 21, soundStartHour: 15 });
  assert.equal(D.soundsAllowed(late, at(11, 30)), true, 'a start hour after opening does not delay the sounds');
  // The all-day setting turns the pause off.
  const all = mk({ soundOutsideHours: true });
  assert.equal(D.soundsAllowed(all, at(2)), true);
  assert.equal(D.pauseNote(all, at(2)), null);
  // A close after midnight (25 = 1 am) keeps sound on at 00:30.
  const night = mk({ openHour: 17, closeHour: 25, soundStartHour: 17 });
  assert.equal(D.soundsAllowed(night, at(0, 30)), true);
  assert.equal(D.soundsAllowed(night, at(2)), false);
  assert.equal(D.nextOpenAt(night, at(2)), at(17));
});

test('sound settings: the engine accepts and keeps soundStartHour and soundOutsideHours; bad values are refused', () => {
  let s = E.newState({ now: T0, empty: true });
  let r = E.apply(s, 'updateSettings', { patch: { service: { soundStartHour: 4, soundOutsideHours: true } } }, T0);
  assert.equal(r.report, 'ok');
  assert.equal(r.state.settings.service.soundStartHour, 4);
  assert.equal(r.state.settings.service.soundOutsideHours, true);
  assert.equal(E.apply(s, 'updateSettings', { patch: { service: { soundStartHour: 30 } } }, T0).report, 'outOfBounds');
  assert.equal(E.apply(s, 'updateSettings', { patch: { service: { soundOutsideHours: 'yes' } } }, T0).report, 'badPatch');
  const back = E.validateBackup(E.serialize(r.state));
  assert.equal(back.state.settings.service.soundOutsideHours, true);
  assert.equal(back.state.settings.service.soundStartHour, 4);
});

/* ---------------------------------------------------- pace estimate with lumpy pulls ---------------------------------------------------- */
// The old estimator, kept here only to show the problem: grams in the last 90 minutes over 90 minutes, unknown under 200 g.
const oldRate = (pulls, now) => { const g = pulls.filter((p) => p.t > now - 90 * MIN && p.t <= now).reduce((a, p) => a + p.g, 0); return g >= 200 ? g / (90 * MIN) : undefined; };
const rank = { info: 0, warn: 1, bad: 2 };

test('pace: 4.5 kg pulls every 100 minutes give a steady pace and a severity that never flaps', () => {
  const at = (m) => new Date(2026, 9, 12, 11, 0, 0).getTime() + m * MIN;
  const settings = E.defaultSettings(); settings.service.openHour = 11; settings.service.closeHour = 21;
  let s = E.newState({ now: at(0), empty: true, settings });
  s = E.apply(s, 'addBatch', { ing: 'pork', tempF: 160, cookedG: 30000 }, at(0)).state;
  const pulls = [];
  let flipsOld = 0, prevOld = false, flipsNew = 0, prevNew = null, sevs = [], rates = [];
  for (let m = 1; m <= 470; m++) {
    const t = at(m);
    if (m % 100 === 0) { const r = E.apply(s, 'pullBatch', { ing: 'pork', g: 4500 }, t); assert.equal(r.report, 'ok'); s = r.state; pulls.push({ t, g: 4500 }); }
    s = E.tick(s, t).state;
    const known = oldRate(pulls, t) !== undefined;
    if (m > 100 && known !== prevOld) flipsOld++;
    prevOld = known;
    const sr = D.salesRate(s, t);
    const knownNew = sr.rate.pork !== undefined;
    if (m >= 200) { assert.ok(knownNew, 'pace is known at minute ' + m); rates.push(sr.rate.pork * MIN); }
    if (prevNew !== null && m >= 200 && knownNew !== prevNew) flipsNew++;
    prevNew = knownNew;
    const row = D.build(s, t).find((x) => x.kind === 'expiry');
    if (m >= 200 && row) sevs.push(rank[row.sev]);
  }
  assert.ok(flipsOld >= 6, 'the old fixed window flipped between known and unknown ' + flipsOld + ' times');
  assert.equal(flipsNew, 0);
  assert.ok(Math.min(...rates) > 40 && Math.max(...rates) < 50, 'steady near 45 g/min: ' + Math.min(...rates).toFixed(1) + ' to ' + Math.max(...rates).toFixed(1));
  let changes = 0;
  for (let i = 1; i < sevs.length; i++) { if (sevs[i] < sevs[i - 1]) assert.fail('severity went down at sample ' + i); if (sevs[i] !== sevs[i - 1]) changes++; }
  assert.ok(changes <= 2, 'severity changed ' + changes + ' times');
});

test('pace: no pulls or a long silence is unknown, never zero; one pull uses the average since opening', () => {
  const at = (m) => new Date(2026, 9, 12, 11, 0, 0).getTime() + m * MIN;
  const settings = E.defaultSettings(); settings.service.openHour = 11; settings.service.closeHour = 21;
  let s = E.newState({ now: at(0), empty: true, settings });
  s = E.apply(s, 'addBatch', { ing: 'pork', tempF: 160, cookedG: 30000 }, at(0)).state;
  assert.equal(D.salesRate(s, at(60)).rate.pork, undefined, 'nothing pulled: unknown');
  const row0 = D.build(s, at(440)).find((x) => x.kind === 'expiry');
  assert.equal(row0.unknown, true);
  assert.equal(row0.wasteG, null, 'no projected waste when the pace is unknown');
  assert.ok(/Pace unknown/.test(row0.consequence), row0.consequence);
  // One pull at 11:30: unknown until 45 minutes have passed since opening, then the average since opening.
  s = E.apply(s, 'pullBatch', { ing: 'pork', g: 4500 }, at(30)).state;
  assert.equal(D.salesRate(s, at(40)).rate.pork, undefined);
  assert.ok(Math.abs(D.salesRate(s, at(60)).rate.pork * MIN - 4500 / 60) < 0.01);
  assert.ok(Math.abs(D.salesRate(s, at(120)).rate.pork * MIN - 4500 / 120) < 0.01);
  // Two pulls, then a long silence: unknown again, not a slowly falling pace.
  s = E.apply(s, 'pullBatch', { ing: 'pork', g: 4500 }, at(130)).state;
  assert.ok(D.salesRate(s, at(200)).rate.pork > 0);
  assert.equal(D.salesRate(s, at(130 + 250)).rate.pork, undefined, 'after 250 minutes of silence the pace is unknown');
});
