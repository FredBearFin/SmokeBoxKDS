// Safety-record retention: trimming the main log (engine cap, prune, store quota) never drops safety entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { engine: E, store: S, config: C } = SB;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const MIN = 60e3, DAY = 86400e3;

// A busy kitchen: n pairs of (temperature reading, noise ticket) so the main log fills with non-safety events.
function busy(n, state, t0 = T0, step = MIN) {
  let s = state, now = t0;
  // a fresh batch so the readings are accepted at any date
  const add = E.apply(s, 'addBatch', { ing: 'pork', tempF: 150, cookedG: 2000 }, now);
  assert.equal(add.report, 'ok');
  s = add.state;
  const id = s.batches.at(-1).id;
  for (let i = 0; i < n; i++) {
    now += step;
    let r = E.apply(s, 'logTemp', { batchId: id, tempF: 150 + (i % 5), who: 'AB' }, now);
    if (r.report === 'ok') s = r.state;
    r = E.apply(s, 'toggle86', { menuId: 'tea', on: i % 2 === 0 }, now + 1);
    if (r.report === 'ok') s = r.state;
  }
  return { s, now };
}
const count = (s, type) => (s.safetyKeep || []).concat(E.allEvents(s)).filter((e) => e.type === type).length;

test('prune moves dropped safety events into the bucket and keeps the books valid', () => {
  const { s } = busy(300, E.newState({ now: T0, starter: true }));
  const temps = count(s, 'temp_logged');
  assert.ok(temps >= 300);
  const p = E.prune(s, { maxEvents: 50 });
  assert.ok(E.allEvents(p).length <= 50);
  assert.equal(count(p, 'temp_logged'), temps);
  assert.ok(p.safetyKeep.length > 0);
  assert.deepEqual(E.checkInvariants(p), []);
  // the safety log shows all of it, oldest first
  const log = E.safetyLog(p);
  assert.equal(log.filter((r) => r.event.type === 'temp_logged').length, temps);
  for (let i = 1; i < log.length; i++) assert.ok(log[i].event.t >= log[i - 1].event.t);
  // and it survives a save and load
  const back = E.validateBackup(E.serialize(p));
  assert.equal(back.ok, true, back.error);
  assert.equal(count(back.state, 'temp_logged'), temps);
});

test('the engine cap on the main log also keeps safety entries', () => {
  const old = C.limits.maxEvents;
  C.limits.maxEvents = 400;
  try {
    const { s } = busy(600, E.newState({ now: T0, starter: true }));
    assert.ok(E.allEvents(s).length <= 400);
    assert.ok(s.safetyKeep.length > 0);
    assert.ok(s.safetyKeep.every((e) => ['temp_logged', 'batch_reheat', 'batch_discard', 'cooling_started', 'sanitize_done'].includes(e.type) || e.type.startsWith('quality') || e.type === 'safety_correction'));
    assert.ok(count(s, 'temp_logged') >= 600);
    assert.deepEqual(E.checkInvariants(s), []);
    // loading a save that has more events than the cap keeps the safety ones too
    C.limits.maxEvents = 100;
    const back = E.validateBackup(E.serialize(s));
    assert.equal(back.ok, true, back.error);
    assert.equal(count(back.state, 'temp_logged'), count(s, 'temp_logged'));
  } finally { C.limits.maxEvents = old; }
});

test('entries older than 190 days leave the bucket, newer ones never do', () => {
  let { s, now } = busy(40, E.newState({ now: T0, starter: true }));
  const first = count(s, 'temp_logged');
  s = E.prune(s, { maxEvents: 0 });
  assert.equal(E.allEvents(s).length, 0);
  assert.equal(count(s, 'temp_logged'), first);
  // 200 days later, more activity and another prune: the old entries are gone, the new ones stay
  const later = busy(10, E.tick(s, now + 200 * DAY).state, now + 200 * DAY);
  const p = E.prune(later.s, { maxEvents: 0 });
  assert.equal(count(p, 'temp_logged'), 10);
  const mid = busy(10, E.tick(s, now + 150 * DAY).state, now + 150 * DAY);
  assert.equal(count(E.prune(mid.s, { maxEvents: 0 }), 'temp_logged'), first + 10);
});

test('old saves without a bucket load, and a damaged bucket is cleaned', () => {
  const { s } = busy(5, E.newState({ now: T0, starter: true }));
  const o = JSON.parse(E.serialize(s));
  delete o.safetyKeep;
  assert.equal(E.validateBackup(JSON.stringify(o)).ok, true);
  o.safetyKeep = [{ id: 'x', t: 5, type: 'order_paid' }, 7, { id: 'old_1', t: T0, type: 'temp_logged', batchId: 'b_1', f: 140 }];
  const r = E.validateBackup(JSON.stringify(o));
  assert.equal(r.ok, true);
  assert.equal(r.state.safetyKeep.length, 1);
  assert.deepEqual(E.checkInvariants(r.state), []);
  assert.ok(E.checkInvariants(Object.assign({}, s, { safetyKeep: [{ id: 'a', t: 1, type: 'order_paid' }] })).some((x) => x.startsWith('I19')));
});

// A fake browser storage with a tiny quota: set() fails when the text is longer than the limit.
function quotaStorage(limit) {
  const m = new Map();
  return {
    persistent: true, m,
    get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } },
    set(k, v) { const raw = JSON.stringify(v); if (raw.length > limit) return false; m.set(k, raw); return true; },
    remove(k) { m.delete(k); },
  };
}

test('store quota trimming never drops temperature readings or discards', () => {
  const clock = { real: T0 };
  const storage = quotaStorage(450000);
  S.init({ now: () => clock.real, storage, noTimers: true, noSync: true, starter: true });
  const id = S.getState().batches.find((b) => b.kind === 'hot').id;
  let temps = 0;
  for (let i = 0; i < 700; i++) {
    clock.real += MIN;
    if (S.dispatch('logTemp', { batchId: id, tempF: 150 + (i % 4), who: 'AB' }) === 'ok') temps++;
    S.dispatch('toggle86', { menuId: 'tea', on: i % 2 === 0 });
    S.dispatch('createTicket', { customer: 'Table ' + i, items: [{ menuId: 'tea' }] });
  }
  const b2 = S.dispatchEx('addBatch', { ing: 'pork', tempF: 150, cookedG: 2000 });
  assert.equal(b2.report, 'ok');
  assert.equal(S.dispatch('discardBatch', { batchId: S.getState().batches.at(-1).id, reason: 'manual', who: 'CD' }), 'ok');
  assert.equal(S.flush(), true);
  assert.equal(S.status().trimmed, true, 'the tiny quota should have forced trimming');
  const live = S.getState();
  const saved = E.validateBackup(storage.get(S.KEY).state);
  assert.equal(saved.ok, true, saved.error);
  const logged = (st, type) => (st.safetyKeep || []).concat(E.allEvents(st)).filter((e) => e.type === type).length;
  assert.equal(logged(saved.state, 'temp_logged'), logged(live, 'temp_logged'));
  assert.ok(logged(saved.state, 'temp_logged') >= temps);
  assert.equal(logged(saved.state, 'batch_discard'), logged(live, 'batch_discard'));
  assert.ok(E.allEvents(saved.state).length < E.allEvents(live).length, 'ordinary history was trimmed');
  S.destroy();
});
