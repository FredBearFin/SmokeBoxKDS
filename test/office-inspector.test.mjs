// The printable safety record: rows come from the engine's safety log, oldest first, with corrections hanging under their entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '88-office-backup', '89-office-inspector']);
const E = SB.engine;
const { inspectorRows, rangeFor } = SB.office.inspectorPure;
const BP = SB.office.backupPure;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const MIN = 60e3;

test('sanitize rounds and corrections appear as rows and a note under the entry', () => {
  let s = E.newState({ now: T0 });
  let r = E.apply(s, 'sanitizeDone', { who: 'JM' }, T0 + MIN);
  assert.equal(r.report, 'ok', r.report);
  s = r.state;
  const first = inspectorRows(s, T0, T0 + 3600e3);
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, 'Sanitized surfaces');
  assert.equal(first[0].who, 'JM');
  const id = first[0].id;
  r = E.apply(s, 'correctSafety', { eventId: id, who: 'AB', note: 'Wrong time entered' }, T0 + 5 * MIN);
  assert.equal(r.report, 'ok', r.report);
  const rows = inspectorRows(r.state, T0, T0 + 3600e3);
  assert.equal(rows.length, 1, 'a correction is not a row of its own');
  assert.equal(rows[0].corrections.length, 1);
  assert.equal(rows[0].corrections[0].note, 'Wrong time entered');
});

test('rows outside the range are left out and an empty state gives no rows', () => {
  let s = E.newState({ now: T0 });
  s = E.apply(s, 'sanitizeDone', { who: 'JM' }, T0 + MIN).state;
  assert.equal(inspectorRows(s, T0 + 2 * 3600e3, T0 + 3 * 3600e3).length, 0);
  assert.deepEqual(inspectorRows(null, 0, 1), []);
});

test('the preset ranges cover whole service days ending after today', () => {
  const w = rangeFor('7', T0, 4);
  assert.ok(w.from < T0 && T0 < w.to);
  assert.equal(Math.round((w.to - w.from) / 86400e3), 7);
});

test('backup freshness warns when never backed up or old, and the reset word check ignores capitals', () => {
  assert.equal(BP.backupFreshness(null, T0).tone, 'bad');
  assert.equal(BP.backupFreshness(T0 - 2 * 3600e3, T0).tone, 'ok');
  assert.equal(BP.backupFreshness(T0 - 40 * 3600e3, T0).tone, 'warn');
  assert.equal(BP.backupFreshness(T0 - 5 * 86400e3, T0).tone, 'bad');
  assert.equal(BP.resetWordOk(' reset ', 'RESET'), true);
  assert.equal(BP.resetWordOk('rest', 'RESET'), false);
});

test('a backup from the other kind of kitchen is flagged with a plain refusal', () => {
  const state = E.newState({ now: T0 });
  const d = BP.describeBackup({ state, savedAt: T0, mode: 'demo' }, 'real');
  assert.equal(d.wrongKitchen, true);
  assert.match(d.refusal, /practice kitchen/);
  assert.equal(BP.describeBackup({ state, savedAt: T0, mode: 'real' }, 'real').wrongKitchen, false);
  assert.ok(d.rows.some((r) => r[0] === 'Dishes'));
});
