// The warning ladder as a pure object: what sounds, when, across keeps, lapses and corrections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines']);
const E = SB.engine, D = SB.deadlines;
const T0 = new Date(2026, 9, 12, 11, 0, 0).getTime(), MIN = 60e3, HR = 60 * MIN;

// A kitchen with one 6 kg ribs batch (4-hour quality limit, rungs 90/45/20/10) entered at T0, sounds always allowed.
function kit() {
  const settings = E.defaultSettings(); settings.service.openHour = 0; settings.service.closeHour = 30; settings.service.soundOutsideHours = true;
  let s = E.newState({ now: T0, empty: true, settings });
  s = E.apply(s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0).state;
  return { s, L: D.makeLadder(), sounds: [] };
}
// Moves the kitchen to minute m (from T0), ticks, asks the ladder and records what sounds.
function step(k, m) {
  const t = T0 + m * MIN;
  k.s = E.tick(k.s, t).state;
  const calls = k.L.decide(D.build(k.s, t), t, k.s);
  for (const c of calls) k.sounds.push({ m, level: c.level, kind: c.d.kind, id: c.d.id, repeat: c.repeat });
  return calls;
}
const run = (k, from, to) => { for (let m = from; m <= to; m++) step(k, m); };

test('ladder: keeping a batch for 30 minutes makes no sound at the tap', () => {
  const k = kit();
  run(k, 1, 239);                      // the batch has been through its rungs
  const before = k.sounds.length;
  run(k, 240, 241);                    // limit at 4:00 -> past, one sound
  assert.equal(k.sounds.filter((x) => x.kind === 'past').length, 1);
  k.s = E.apply(k.s, 'logTemp', { batchId: k.s.batches[0].id, tempF: 150 }, T0 + 242 * MIN).state;
  const n = k.sounds.length;
  k.s = E.apply(k.s, 'keepServing', { batchIds: [k.s.batches[0].id], who: 'AB', forMin: 30 }, T0 + 242 * MIN).state;
  step(k, 242);
  assert.equal(k.sounds.length, n, 'no sound at the tap');
  assert.ok(before > 0, 'the ladder did sound on the way to the limit');
});

test('ladder: keeping the same batch three times sounds at every lapse, with a rung sound before each', () => {
  const k = kit();
  const id = k.s.batches[0].id;
  let m = 1;
  run(k, m, 241); m = 242;
  const lapses = [];
  for (let keep = 1; keep <= 3; keep++) {
    k.s = E.apply(k.s, 'logTemp', { batchId: id, tempF: 150 }, T0 + m * MIN).state;
    const r = E.apply(k.s, 'keepServing', { batchIds: [id], who: 'AB', forMin: 30 }, T0 + m * MIN);
    assert.equal(r.report, 'ok', 'keep ' + keep);
    k.s = r.state;
    const mark = k.sounds.length;
    run(k, m, m + 40);                 // through the end of the extension and the lapse
    const mine = k.sounds.slice(mark);
    assert.ok(mine.some((x) => x.kind === 'expiry' && (x.level === 2 || x.level === 3)), 'a rung sound before lapse ' + keep + ': ' + JSON.stringify(mine));
    assert.equal(mine.filter((x) => x.kind === 'past').length, 1, 'one past sound at lapse ' + keep);
    lapses.push(mine.find((x) => x.kind === 'past'));
    m += 41;
  }
  assert.equal(new Set(lapses.map((x) => x.id)).size, 3, 'each lapse has its own id');
  assert.equal(k.sounds.filter((x) => x.kind === 'past').length, 4, 'the first past plus three lapses');
});

test('ladder: a correction (end of keep) makes no sound at the tap; acknowledging one lapse does not silence the next', () => {
  const k = kit();
  const id = k.s.batches[0].id;
  run(k, 1, 241);
  k.s = E.apply(k.s, 'logTemp', { batchId: id, tempF: 150 }, T0 + 242 * MIN).state;
  k.s = E.apply(k.s, 'keepServing', { batchIds: [id], who: 'AB', forMin: 30 }, T0 + 242 * MIN).state;
  step(k, 242);
  const n = k.sounds.length;
  k.s = E.apply(k.s, 'endKeepServing', { batchId: id, who: 'AB' }, T0 + 243 * MIN).state;
  step(k, 243);
  assert.equal(k.sounds.length, n, 'no sound at the correction');
  // Keep again, acknowledge the loud rung of this extension, then keep a third time: the third still sounds its loud rung.
  k.s = E.apply(k.s, 'keepServing', { batchIds: [id], who: 'AB', forMin: 30 }, T0 + 244 * MIN).state;
  step(k, 244);
  const loudIds = [];
  for (let m = 245; m <= 275; m++) { const calls = step(k, m); for (const c of calls) if (c.level === 3) { loudIds.push(c.d.id); k.L.acknowledge(c.d.id); } }
  assert.equal(loudIds.length >= 1, true);
  k.s = E.apply(k.s, 'logTemp', { batchId: id, tempF: 150 }, T0 + 276 * MIN).state;
  k.s = E.apply(k.s, 'keepServing', { batchIds: [id], who: 'AB', forMin: 30 }, T0 + 276 * MIN).state;
  let loud2 = 0;
  for (let m = 276; m <= 310; m++) loud2 += step(k, m).filter((c) => c.level === 3).length;
  assert.ok(loud2 >= 1, 'the next extension still sounds its loud rung');
});

test('ladder: the loud tone repeats every 20 seconds of kitchen time until acknowledged, not by wall time', () => {
  const k = kit();
  run(k, 1, 229);
  const t = T0 + 231 * MIN; // inside the last rung (10 minutes) of the 4 h limit... limit is at 240 min
  k.s = E.tick(k.s, t).state;
  const feed = D.build(k.s, t);
  const first = k.L.decide(feed, t, k.s);
  assert.ok(first.every((c) => c.level >= 1));
  const row = feed.find((x) => x.kind === 'expiry');
  assert.equal(row.rung, row.rungs);
  assert.equal(k.L.decide(D.build(k.s, t + 10e3), t + 10e3, k.s).length, 0, 'not within 20 s');
  assert.equal(k.L.decide(D.build(k.s, t + 21e3), t + 21e3, k.s).filter((c) => c.repeat).length, 1, 'repeats after 21 s of kitchen time');
  k.L.acknowledge(row.id);
  assert.equal(k.L.decide(D.build(k.s, t + 60e3), t + 60e3, k.s).length, 0, 'silent once acknowledged');
});

test('ladder: memory drops entries for batches that are gone and entries older than 24 hours', () => {
  const k = kit();
  run(k, 1, 160);
  assert.ok(k.L.size() > 0);
  const gone = { ...k.s, batches: [] };
  k.L.decide([], T0 + 161 * MIN, gone);
  assert.equal(k.L.size(), 0, 'orphaned entries are dropped');
  const k2 = kit();
  run(k2, 1, 160);
  k2.L.decide([], T0 + 28 * HR, k2.s);
  assert.equal(k2.L.size(), 0, 'old entries are dropped');
});

test('ladder: the limit sounds once, from the past row, not twice (expiry row at the limit is quiet)', () => {
  const k = kit();
  run(k, 1, 241);
  const atLimit = k.sounds.filter((s) => s.level === 4);
  assert.equal(atLimit.length, 1, JSON.stringify(atLimit));
  assert.equal(atLimit[0].kind, 'past');
});

/* ---------------------------------------- editable thresholds: the memory follows minutes, not rung numbers ---------------------------------------- */
const setLadder = (k, byIng) => { const r = E.apply(k.s, 'updateSettings', { patch: { alerts: { ladderThresholds: byIng === null ? null : { byIng } } } }, T0 + 1000); assert.equal(r.report, 'ok', r.report); k.s = r.state; };

test('thresholds: shortening the list mid-countdown does not turn the last rung into a speech-less repeat', () => {
  const k = kit();
  setLadder(k, { ribs: [60, 30, 10] });
  run(k, 1, 215);                         // 25 minutes left: the 30-minute rung has sounded
  assert.deepEqual(k.sounds.map((s) => s.level), [2]);
  setLadder(k, { ribs: [30, 10] });
  run(k, 216, 229);
  assert.equal(k.sounds.length, 1, 'the edit made no sound by itself');
  step(k, 230);                           // 10 minutes left
  const last = k.sounds[k.sounds.length - 1];
  assert.deepEqual([last.level, last.repeat], [3, false], 'the last rung sounds in full, not as a repeat');
});

test('thresholds: lengthening the list mid-countdown does not sound a warning at the moment it is saved', () => {
  const k = kit();
  setLadder(k, { ribs: [60, 30, 10] });
  run(k, 1, 228);                         // 12 minutes left
  const before = k.sounds.length;
  setLadder(k, { ribs: [90, 45, 20, 10] });
  step(k, 229);
  assert.equal(k.sounds.length, before, 'no unannounced voice call');
  run(k, 230, 232);
  assert.deepEqual(k.sounds.slice(before).map((s) => [s.level, s.repeat]).slice(0, 1), [[3, false]], 'the last rung still sounds in full');
});

test('thresholds: rung sounds follow the place in the list (one rung is only the loud tone)', () => {
  const one = kit(); setLadder(one, { ribs: [15] }); run(one, 1, 232);
  assert.deepEqual(one.sounds.filter((s) => !s.repeat && s.kind === 'expiry').map((s) => s.level), [3]);
  const five = kit(); setLadder(five, { ribs: [120, 90, 60, 30, 10] }); run(five, 1, 232);
  // No pace is known, so the first rung is silent; three voice rungs, then the loud tone.
  assert.deepEqual(five.sounds.filter((s) => !s.repeat && s.kind === 'expiry').map((s) => s.level), [2, 2, 2, 3]);
});

/* ---------------------------------------- remind me later: early rungs only ---------------------------------------- */
test('snooze: the early warning waits and sounds when the time is up; the last rung and the limit are never put off', () => {
  const k = kit();
  run(k, 1, 149);                                   // 91 minutes left: nothing yet (90-minute rung is silent without a pace anyway)
  step(k, 150);                                     // 90 left
  run(k, 151, 194);                                 // 45 minutes left is at minute 195
  const before = k.sounds.length;
  const r = E.apply(k.s, 'snoozeAlert', { batchId: k.s.batches[0].id, forMin: 30 }, T0 + 194 * MIN);
  assert.equal(r.report, 'ok'); k.s = r.state;
  run(k, 195, 223);                                 // the 45 and 20 minute rungs fall inside the snooze (until minute 224)
  assert.equal(k.sounds.length, before, 'nothing sounds while the reminder is put off');
  step(k, 224);                                     // 16 minutes left, snooze over: the pending rung sounds once
  assert.deepEqual(k.sounds.slice(before).map((s) => s.level), [2]);
  run(k, 225, 229);
  step(k, 230);                                     // 10 minutes left: the last rung
  assert.equal(k.sounds[k.sounds.length - 1].level, 3);
  // Put off again during the last stretch: it does not silence the last rung or the limit.
  const k2 = kit();
  run(k2, 1, 228);
  const r2 = E.apply(k2.s, 'snoozeAlert', { batchId: k2.s.batches[0].id, forMin: 10 }, T0 + 228 * MIN);
  k2.s = r2.state;
  assert.equal(r2.report, 'ok');
  step(k2, 230);
  assert.equal(k2.sounds.filter((s) => s.level === 3 && !s.repeat).length, 1, 'the loud last rung sounds although a reminder was put off');
  run(k2, 231, 242);
  assert.equal(k2.sounds.filter((s) => s.level === 4).length, 1, 'and so does the limit');
});

test('snooze: feed rows carry the reminder time and sort after live rows of the same severity', () => {
  const k = kit();
  let s = E.apply(k.s, 'addBatch', { ing: 'ribs', tempF: 160, cookedG: 6000 }, T0 + MIN).state;
  s = E.apply(s, 'snoozeAlert', { batchId: s.batches[0].id, forMin: 20 }, T0 + 200 * MIN).state;
  const rows = D.build(E.tick(s, T0 + 201 * MIN).state, T0 + 201 * MIN).filter((x) => x.kind === 'expiry');
  assert.equal(rows.length, 2);
  assert.ok(!rows[0].snoozedUntil && rows[1].snoozedUntil > 0, 'the put-off row comes last');
});

/* ---------------------------------------- sound leader helpers (no browser) ---------------------------------------- */
test('electLeader: visible beats hidden, lowest id breaks ties, silent or gone tabs do not count, a lone tab leads', () => {
  const now = 100000, h = (tab, visible, eligible = true, t = now) => ({ tab, visible, eligible, t });
  assert.equal(D.electLeader([h('b', true), h('a', true)], now, 'a'), true);
  assert.equal(D.electLeader([h('b', true), h('a', true)], now, 'b'), false);
  assert.equal(D.electLeader([h('a', false), h('b', true)], now, 'b'), true, 'the visible tab wins over a lower id');
  assert.equal(D.electLeader([h('a', true, false), h('b', true)], now, 'b'), true, 'a tab that cannot make sound is skipped');
  assert.equal(D.electLeader([h('a', true, true, now - 20000), h('b', true)], now, 'b'), true, 'a tab not heard from for 15 s is gone');
  assert.equal(D.electLeader([h('a', true), h('b', true, false)], now, 'b'), false, 'a tab that cannot make sound never leads');
  assert.equal(D.electLeader([], now, 'a'), false);
  assert.equal(D.electLeader([h('a', false)], now, 'a'), true, 'a lone hidden tab still leads');
});

test('pending sounds: forgotten when played or acknowledged; on promotion only what is still true plays, once, the strongest', () => {
  const k = kit();
  run(k, 1, 232);
  const feed = D.build(k.s, T0 + 232 * MIN);
  const row = feed.find((x) => x.kind === 'expiry');
  const P = D.makePending();
  const call = (level, d) => ({ level, d, repeat: false });
  P.add(call(2, row)); P.add(call(3, row));
  assert.equal(P.size(), 2);
  P.played([row.id + ':2:0']);
  assert.equal(P.size(), 1);
  let out = P.drain(feed, () => false);
  assert.deepEqual(out.map((c) => c.level), [3]);
  assert.equal(P.size(), 0, 'the queue is emptied');
  // Acknowledged: nothing to play. A row that is gone: nothing to play.
  P.add(call(3, row));
  assert.deepEqual(P.drain(feed, (id) => id === row.id), []);
  P.add(call(3, row)); P.forget(row.id);
  assert.equal(P.size(), 0);
  P.add(call(3, row));
  assert.deepEqual(P.drain([], () => false), [], 'the row is no longer in the feed');
  // Two rows: the stronger level wins and only one call comes back.
  const other = Object.assign({}, row, { id: 'expiry:b_x:0', batchId: 'b_x' });
  P.add(call(2, other)); P.add(call(3, row));
  assert.equal(P.drain(feed.concat([other]), () => false).length, 1);
});
