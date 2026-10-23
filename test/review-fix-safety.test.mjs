// Independent-review "suspected" items that touch food-safety records: cold time above the limit adds up across readings, safety events are kept for
// 400 days, food-safety settings changes record old and new values, and a restore keeps a copy of what it replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;
const T0 = new Date(2026, 9, 20, 12, 0, 0).getTime(), H = 3600e3, MIN = 60e3;

// A kitchen with one cold batch (the sample slaw) at the start of its life, with the batch id.
function coldKitchen() {
  let s = E.newState({ now: T0, starter: true });
  let b = s.batches.find((x) => x.kind === 'cold');
  if (!b) {
    const ing = s.ingredients.find((i) => i.tcs && i.hold === 'cold');
    assert.ok(ing, 'the sample menu has a cold product');
    const r = E.apply(s, 'startBatch', { ing: ing.id, g: 2000 }, T0, {});
    assert.equal(r.report, 'ok', r.report); s = r.state; b = s.batches[s.batches.length - 1];
  }
  return { s, id: b.id };
}
const log = (s, id, f, t) => { const r = E.apply(s, 'logTemp', { batchId: id, tempF: f }, t, {}); assert.equal(r.report, 'ok', r.report); return r.state; };

test('safety #1: three hours above 41 F, a good reading, then above again: only the rest of the grace time is left', () => {
  const { s: s0, id } = coldKitchen();
  const grace = E.defaultSettings().safety.aboveColdGraceH;
  let s = log(s0, id, 38, T0 + 5 * MIN);
  s = log(s, id, 47, T0 + 10 * MIN);                       // out of range from here
  s = log(s, id, 38, T0 + 10 * MIN + (grace - 1) * H);      // back in range after grace-1 hours
  assert.equal(s.batches.find((b) => b.id === id).outSince, undefined);
  assert.ok(s.batches.find((b) => b.id === id).coldOutMs >= (grace - 1) * H - 1000);
  s = log(s, id, 47, T0 + 10 * MIN + (grace - 1) * H + 10 * MIN);   // out again
  const out = s.batches.find((b) => b.id === id);
  assert.ok(out.outSince != null);
  const later = E.tick(s, out.outSince + 70 * MIN).state.batches.find((b) => b.id === id);
  assert.equal(later.status, 'discard', 'one hour is all that is left, so it is thrown out after 70 minutes');
  // control: a batch that was never above before still has the whole grace time
  let c = log(s0, id, 47, T0 + 10 * MIN);
  const cb = E.tick(c, T0 + 10 * MIN + 70 * MIN).state.batches.find((b) => b.id === id);
  assert.notEqual(cb.status, 'discard');
});

test('safety #1: the accumulated time survives a save and reload', () => {
  const { s: s0, id } = coldKitchen();
  let s = log(s0, id, 47, T0 + 10 * MIN);
  s = log(s, id, 38, T0 + 70 * MIN);
  const v = E.validateBackup(JSON.stringify(s));
  assert.equal(v.ok, true);
  assert.equal(v.state.batches.find((b) => b.id === id).coldOutMs, 60 * MIN);
});

test('safety #3: safety entries are kept 400 days, not 190', () => {
  assert.equal(E.SAFETY_KEEP_DAYS, 400);
  assert.equal(E.SAFETY_KEEP_MS, 400 * 24 * H);
});

test('safety #4: changing a food-safety number records its old and new value; other settings stay name-only', () => {
  const s0 = E.newState({ now: T0, starter: true });
  const oldHot = s0.settings.safety.hotHoldF, oldCool = s0.settings.safety.cooling.stage1H;
  const r = E.apply(s0, 'updateSettings', { patch: { safety: { hotHoldF: 140, cooling: { stage1H: 1.5 } }, service: { openHour: 9 } } }, T0 + MIN, {});
  assert.equal(r.report, 'ok', JSON.stringify(r.info));
  const evs = E.allEvents(r.state).filter((e) => e.type === 'safety_setting_changed');
  const hot = evs.find((e) => e.key === 'safety.hotHoldF');
  assert.deepEqual([hot.from, hot.to], [oldHot, 140]);
  const cool = evs.find((e) => e.key === 'safety.cooling.stage1H');
  assert.deepEqual([cool.from, cool.to], [oldCool, 1.5]);
  const plain = E.allEvents(r.state).filter((e) => e.type === 'settings_changed');
  assert.ok(plain.length === 1 && plain[0].keys.every((k) => k.indexOf('safety.') !== 0));
  // the entries are part of the safety log, so they survive trimming and show in the log
  assert.ok(E.safetyLog(r.state).some((row) => row.event.type === 'safety_setting_changed'));
  const p = E.prune(r.state, { maxEvents: 0 });
  assert.ok(E.safetyLog(p).some((row) => row.event.type === 'safety_setting_changed' && row.event.key === 'safety.hotHoldF'));
  // a change with only safety numbers writes no empty settings_changed
  const r2 = E.apply(r.state, 'updateSettings', { patch: { safety: { hotHoldF: 145 } } }, T0 + 2 * MIN, {});
  assert.equal(r2.report, 'ok');
  assert.equal(E.allEvents(r2.state).filter((e) => e.type === 'settings_changed').length, 1);
});
