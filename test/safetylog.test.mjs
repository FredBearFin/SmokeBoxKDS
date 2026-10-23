// Who-did-it: initials on safety actions, append-only safety log with corrections, old saves without initials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const MIN = 60e3;

// Applies one action, checks invariants, returns the result.
function go(k, type, payload, expect = 'ok', dt = MIN) {
  k.now += dt;
  const r = E.apply(k.s, type, payload, k.now);
  assert.equal(r.report, expect, type + ' -> ' + r.report + ' ' + JSON.stringify(r.info));
  if (r.report === 'ok') k.s = r.state; else assert.equal(r.state, k.s);
  assert.deepEqual(E.checkInvariants(k.s, k.now), []);
  return r;
}
const kit = () => ({ s: E.newState({ now: T0, starter: true }), now: T0 });
const evs = (k, type) => E.allEvents(k.s).filter((e) => e.type === type);

test('initials are optional on every safety action and are logged when given', () => {
  const k = kit();
  const id = k.s.batches.find((b) => b.kind === 'hot').id;
  go(k, 'logTemp', { batchId: id, tempF: 150 });
  assert.equal(evs(k, 'temp_logged').at(-1).who, undefined);
  go(k, 'logTemp', { batchId: id, tempF: 151, who: ' fw ' });
  assert.equal(evs(k, 'temp_logged').at(-1).who, 'fw');
  assert.equal(k.s.batches.find((b) => b.id === id).temps.at(-1).who, 'fw');
  go(k, 'sanitizeDone', { who: 'AB' });
  assert.equal(evs(k, 'sanitize_done').at(-1).who, 'AB');
  go(k, 'sanitizeDone', {});
  assert.equal('who' in evs(k, 'sanitize_done').at(-1), false);
  go(k, 'startCooling', { batchId: id, g: 500, who: 'CD' });
  assert.equal(evs(k, 'cooling_started').at(-1).who, 'CD');
  go(k, 'discardBatch', { batchId: id, reason: 'manual', who: 'EF' });
  assert.equal(evs(k, 'batch_discard').at(-1).who, 'EF');
});

test('reheat keeps initials, and bad initials are refused without changing anything', () => {
  const k = kit();
  const id = k.s.batches.find((b) => b.kind === 'hot').id;
  for (const who of [5, {}, 'ABCDEFGHIJKLM', []]) {
    go(k, 'logTemp', { batchId: id, tempF: 150, who }, 'badWho');
    go(k, 'discardBatch', { batchId: id, reason: 'manual', who }, 'badWho');
    go(k, 'sanitizeDone', { who }, 'badWho');
    go(k, 'startCooling', { batchId: id, who }, 'badWho');
  }
  go(k, 'logTemp', { batchId: id, tempF: 120 }); // below hot hold: out of range
  go(k, 'reheatBatch', { batchId: id, tempF: 170, who: 'GH' });
  assert.equal(evs(k, 'batch_reheat').at(-1).who, 'GH');
});

test('corrections are new entries; the original is never edited', () => {
  const k = kit();
  const id = k.s.batches.find((b) => b.kind === 'hot').id;
  go(k, 'logTemp', { batchId: id, tempF: 99, who: 'AB' }); // a typo for 199? whatever: wrong reading
  const orig = evs(k, 'temp_logged').at(-1);
  const snapshot = JSON.stringify(orig);
  go(k, 'correctSafety', { eventId: orig.id, note: 'Probe was in the pan, not the meat', who: 'CD' });
  go(k, 'correctSafety', { eventId: orig.id, note: 'Second look: same', who: 'EF' });
  assert.equal(JSON.stringify(E.allEvents(k.s).find((e) => e.id === orig.id)), snapshot);
  const corr = evs(k, 'safety_correction');
  assert.equal(corr.length, 2);
  assert.deepEqual([corr[0].of, corr[0].ofType, corr[0].who, corr[0].batchId], [orig.id, 'temp_logged', 'CD', id]);
  const row = E.safetyLog(k.s).find((r) => r.event.id === orig.id);
  assert.equal(row.corrections.length, 2);
  // refusals
  go(k, 'correctSafety', { eventId: orig.id, note: 'x', who: '' }, 'whoRequired');
  go(k, 'correctSafety', { eventId: orig.id, note: '  ', who: 'AB' }, 'reasonRequired');
  go(k, 'correctSafety', { eventId: orig.id, note: 'x'.repeat(500), who: 'AB' }, 'noteTooLong');
  go(k, 'correctSafety', { eventId: 'ev_99999', note: 'x', who: 'AB' }, 'unknownSafetyEntry');
  const other = E.allEvents(k.s).find((e) => e.type === 'order_opened' || e.type === 'avail_changed' || e.type === 'safety_correction');
  go(k, 'correctSafety', { eventId: other.id, note: 'x', who: 'AB' }, 'unknownSafetyEntry');
  go(k, 'correctSafety', { eventId: 7, note: 'x', who: 'AB' }, 'unknownSafetyEntry');
});

test('old saves without initials load, and a damaged correction is caught by the invariant', () => {
  const k = kit();
  const id = k.s.batches.find((b) => b.kind === 'hot').id;
  go(k, 'logTemp', { batchId: id, tempF: 150 });
  const back = E.validateBackup(E.serialize(k.s));
  assert.equal(back.ok, true, back.error);
  assert.deepEqual(E.checkInvariants(back.state), []);
  // initials survive a round trip; junk initials on a reading are stripped
  go(k, 'logTemp', { batchId: id, tempF: 151, who: 'ZZ' });
  const o = JSON.parse(E.serialize(k.s));
  const temps = o.batches.find((b) => b.id === id).temps;
  temps[temps.length - 1].who = 12345;
  temps[0].who = 'ok';
  const r2 = E.validateBackup(JSON.stringify(o));
  assert.equal(r2.ok, true);
  const t2 = r2.state.batches.find((b) => b.id === id).temps;
  assert.equal(t2.at(-1).who, undefined);
  assert.equal(t2[0].who, 'ok');
  const bad = JSON.parse(JSON.stringify(k.s));
  bad.events.push({ id: 'ev_999999', t: bad.events.at(-1).t + 1, type: 'safety_correction', of: 'ev_1' });
  assert.ok(E.checkInvariants(bad).some((x) => x.startsWith('I18')));
});
