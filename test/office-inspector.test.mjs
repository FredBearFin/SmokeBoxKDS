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
  assert.match(d.refusal, /demo kitchen/);
  assert.equal(BP.describeBackup({ state, savedAt: T0, mode: 'real' }, 'real').wrongKitchen, false);
  assert.ok(d.rows.some((r) => r[0] === 'Dishes'));
});

test('the sales CSV has plain headers, one row per day, a Total row, and plain money digits', () => {
  const k = { s: E.newState({ now: T0 }), now: T0 };
  const step = (type, payload, dt = MIN) => { k.now += dt; const r = E.apply(k.s, type, payload, k.now); assert.equal(r.report, 'ok', type + ' ' + r.report); k.s = r.state; return r; };
  const a = step('createTicket', { customer: 'A', items: [{ menuId: 'tea' }, { menuId: 'slaw' }] }).info.orderId;
  const b = step('createTicket', { customer: 'B', items: [{ menuId: 'tea' }] }).info.orderId;
  step('payOrder', { orderId: a, method: 'cash', tip: 2 });
  step('payOrder', { orderId: b, method: 'card', tip: 1.5 });
  const csv = BP.salesCsv(k.s, 4);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Date,Orders paid,Sales (after discounts),Discounts given,Tax,Tips,Total collected,Collected in cash,Collected by card,Collected other');
  assert.equal(lines.length, 3, 'header, one day, total');
  const day = lines[1].split(','), tot = lines[2].split(',');
  assert.equal(day[1], '2');
  assert.equal(tot[0], 'Total');
  assert.equal(day[5], '3.50', 'tips add up');
  assert.equal(Number(day[7]) + Number(day[8]) + Number(day[9]), Number(day[6]), 'methods add up to the total collected');
  assert.doesNotMatch(csv, /\$/);
  assert.equal(BP.salesCsv(E.newState({ now: T0 }), 4).trim().split('\r\n').length, 1, 'no paid orders: only the header');
});

test('facts under an entry: made date, days in the fridge, and cooling readings against the owner\'s limits', () => {
  const { factsOf } = SB.office.inspectorPure;
  const state = { settings: { safety: { cooling: { stage1ToF: 70, stage1H: 2, finalF: 41, totalH: 6 } } }, batches: [
    { id: 'c1', kind: 'cold', enteredAt: T0, maxHoldH: 48 },
    { id: 'k1', kind: 'cooling', enteredAt: T0, coolStartAt: T0, temps: [{ t: T0 + 30 * MIN, f: 120 }, { t: T0 + 100 * MIN, f: 80 }] },
  ] };
  const cold = factsOf(state, { type: 'batch_discard', batchId: 'c1', t: T0 + 3 * 86400e3 + 3600e3 });
  assert.ok(cold.some((f) => /^Made /.test(f)) && cold.includes('3 days in the fridge') && cold.includes('Your limit: 48 hours'), cold.join('|'));
  const cool = factsOf(state, { type: 'cooling_started', batchId: 'k1', t: T0 });
  assert.ok(cool.some((f) => /^Your limit: 70 °F within 2 h, 41 °F within 6 h/.test(f)), cool.join('|'));
  assert.ok(cool.some((f) => /^Readings: .*120 °F \(30 min\).*80 °F \(100 min\)/.test(f)), cool.join('|'));
  assert.deepEqual(factsOf(state, { type: 'batch_discard', batchId: 'gone', t: T0 }), []);
});

test('a fridge-kept cold item shows its made day, its own fridge and out-of-fridge limits, and out time', () => {
  const { factsOf } = SB.office.inspectorPure;
  const state = { settings: {}, batches: [{ id: 'f1', kind: 'cold', fridge: true, madeOn: '2026-10-17', fridgeDays: 3, outHours: 4, enteredAt: T0, lineMs: 90 * MIN }] };
  const f = factsOf(state, { type: 'batch_back', batchId: 'f1', t: T0 + 86400e3, outMs: 90 * MIN });
  assert.deepEqual(f, ['Made Sat 10/17', 'Your fridge limit: 3 days, last day Mon 10/19', 'Out of the fridge so far: 90 min (your limit 4 h)']);
});
