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
