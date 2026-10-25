// A simulated three day pilot on a blank own kitchen: the pilot report must give exactly the right counts for pulls, discards and their
// cost (an unknown cost reads as unknown, never zero), warnings shown and acknowledged, undo storms and refused taps, with demo data left
// out and Start over resetting the counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '36-csv', '25-deadlines', '35-pilot']);
const { engine: E, pilot: P, util: U } = SB;
const MIN = 60e3, HR = 60 * MIN, DAY = 24 * HR;
const T0 = new Date(2026, 9, 19, 10, 0, 0).getTime();
const ok = (r, w) => { assert.equal(r.report, 'ok', (w || '') + ' ' + r.report + ' ' + JSON.stringify(r.info)); return r; };

// A blank own kitchen (the Hold cabinet starts on) and two cooked products: one with a cost per kilogram, one without.
function kitchen() {
  let s = E.newState({ now: T0, empty: true, settings: E.blankSettings() });
  const go = (type, p, t) => { s = ok(E.apply(s, type, p, t), type).state; };
  go('addIngredient', { name: 'Pit pork', unit: 'g', tcs: true, hold: 'hot', costPerKg: 12 }, T0);
  go('addIngredient', { name: 'House ribs', unit: 'g', tcs: true, hold: 'hot' }, T0);
  return { get s() { return s; }, set s(v) { s = v; }, go };
}

test('a three day pilot: pulls, discards with and without cost, warnings, undo storms and refusals are counted exactly', () => {
  const rng = U.rng(2026);
  const k = kitchen();
  const want = { pulls: 0, pullG: 0, discards: 0, discardsKnown: 0, discardsUnknown: 0, undos: 0, refused: 0 };
  const alerts = [];
  let warnedIds = 0, ackedIds = 0;
  for (let day = 0; day < 3; day++) {
    const d0 = T0 + day * DAY;
    const batchIds = {};
    for (const ing of ['pit_pork', 'house_ribs']) {
      k.go('addBatch', { ing, tempF: 165, cookedG: 12000 }, d0 + 5 * MIN);
      batchIds[ing] = k.s.batches.filter((b) => b.ing === ing).at(-1).id;
    }
    let t = d0 + 30 * MIN;
    for (let i = 0; i < 24; i++) {
      t += Math.round((3 + rng.next() * 6) * MIN);
      const ing = rng.next() < 0.7 ? 'pit_pork' : 'house_ribs';
      const g = [250, 400, 600][Math.floor(rng.next() * 3)];
      const r = ok(E.apply(k.s, 'pullBatch', { ing, g }, t), 'pull');
      k.s = r.state;
      const roll = rng.next();
      if (roll < 0.2) {                                                   // an undo storm: the pull is taken back, never counted
        k.s = ok(E.apply(k.s, 'undo', {}, t + 2000), 'undo').state; want.undos++;
      } else if (roll < 0.3) {                                            // pull again, undo, pull again, undo, then one for real
        k.s = ok(E.apply(k.s, 'pullAgain', {}, t + 1000)).state; k.s = ok(E.apply(k.s, 'undo', {}, t + 2000)).state; want.undos++;
        k.s = ok(E.apply(k.s, 'pullAgain', {}, t + 3000)).state; k.s = ok(E.apply(k.s, 'undo', {}, t + 4000)).state; want.undos++;
        want.pulls++; want.pullG += g;
      } else { want.pulls++; want.pullG += g; }
      if (rng.next() < 0.15) { k.s = ok(E.apply(k.s, 'uiReport', { action: 'pullBatch', report: 'batchNotServable' }, t + 5000), 'ui').state; want.refused++; }
      if (rng.next() < 0.3) {                                             // a warning shown, sometimes acknowledged (repeats do not count twice)
        const id = 'past:' + batchIds[ing] + ':' + i;
        alerts.push({ t, id, level: 1 }); warnedIds++;
        if (rng.next() < 0.5) alerts.push({ t, id, level: 2, repeat: true });
        if (rng.next() < 0.6) { alerts.push({ t: t + 1000, id, ack: true }); ackedIds++; }
      }
    }
    // end of day: throw out what is left of both batches
    for (const ing of ['pit_pork', 'house_ribs']) {
      const b = k.s.batches.find((x) => x.id === batchIds[ing]);
      k.s = E.tick(k.s, d0 + 11 * HR).state;
      const live = k.s.batches.find((x) => x.id === batchIds[ing]);
      if (live.status !== 'discard') k.s = ok(E.apply(k.s, 'discardBatch', { batchId: live.id, reason: 'manual' }, d0 + 11 * HR + MIN), 'discard').state;
      const done = k.s.batches.find((x) => x.id === batchIds[ing]);
      if (done.wasteG > 0) { want.discards++; if (ing === 'pit_pork') want.discardsKnown++; else want.discardsUnknown++; }
      void b;
    }
  }
  const to = T0 + 3 * DAY;
  const r = P.build(k.s, { from: T0, to, alerts });
  assert.equal(r.pulls.n, want.pulls); assert.equal(r.pulls.g, want.pullG);
  assert.equal(r.discards.n, want.discards);
  assert.equal(r.discards.costKnownN, want.discardsKnown); assert.equal(r.discards.costUnknownN, want.discardsUnknown);
  assert.equal(r.undos, want.undos); assert.equal(r.refused, want.refused);
  assert.equal(r.sounds.warnings, warnedIds); assert.equal(r.sounds.warningsAcked, ackedIds);
  assert.equal(r.sounds.ackRate, Math.round(1000 * ackedIds / warnedIds) / 10);
  // the cost is exactly the cost of the batches that have one, worked out from the batch itself; the ribs have no cost at all
  const pork = k.s.batches.filter((b) => b.ing === 'pit_pork' && b.wasteG > 0);
  const expected = Math.round(pork.reduce((a, b) => a + b.wasteG / 1000 * b.costPerCookedKg, 0) * 100) / 100;
  assert.ok(pork.every((b) => typeof b.costPerCookedKg === 'number'));
  assert.equal(r.discards.cost, expected); assert.ok(expected > 0);
  assert.equal(r.discards.byIng.pit_pork.cost, expected);
  assert.equal(r.discards.byIng.house_ribs.cost, null, 'a product with no cost reads as unknown, never zero');
  assert.equal(r.discards.byIng.house_ribs.costUnknownN, want.discardsUnknown);
  assert.match(P.toText(r), /plus \d+ with no cost recorded/);
  // the pull rate: counted cuts against pulls logged
  assert.equal(P.build(k.s, { from: T0, to, cutsCounted: want.pulls * 2 }).pulls.tapRate, 50);
  assert.deepEqual(E.checkInvariants(k.s, to), []);
});

test('a pilot with no cost on any ingredient says the cost is unknown, never zero, in the numbers, the text and the CSV', () => {
  const k = kitchen();
  k.go('addBatch', { ing: 'house_ribs', tempF: 165, cookedG: 5000 }, T0 + MIN);
  k.go('discardBatch', { batchId: k.s.batches[0].id, reason: 'quality' }, T0 + HR);
  const r = P.build(k.s, { from: T0, to: T0 + 2 * HR });
  assert.equal(r.discards.n, 1); assert.equal(r.discards.cost, null); assert.equal(r.discards.perWeekCost, null); assert.equal(r.discards.costUnknownN, 1);
  assert.equal(r.discards.byReason.quality.cost, null);
  assert.match(P.toText(r), /cost unknown/);
  assert.doesNotMatch(P.toText(r), /\$0\.00/);
  const csv = P.toCsv(r);
  assert.ok(csv.split('\n').includes('discards,cost,,$'), 'an empty cell, not 0');
  assert.ok(csv.split('\n').includes('discards,batches with no cost recorded,1,'));
  // an empty pilot is calm: zero discards cost 0, not unknown
  const empty = P.build(E.newState({ now: T0, empty: true }), { from: T0, to: T0 + HR });
  assert.equal(empty.discards.cost, 0); assert.equal(empty.undos, 0);
});

test('demo and sample things are left out: sample batches, their pulls and discards, and demo tickets', () => {
  let s = E.newState({ now: T0, stagger: true });                                   // the barbecue sample: batches marked as sample or starter
  const r0 = P.build(s, { from: T0 - HR, to: T0 + HR });
  assert.ok(r0.excluded.sampleOrStarterBatches > 0);
  const sample = s.batches.find((b) => (b.src === 'sample' || b.src === 'starter') && b.remainingG > 500 && b.canServe);
  s = ok(E.apply(s, 'pullBatch', { ing: sample.ing, g: 300 }, T0 + 10 * MIN), 'pull sample').state;
  const pulled = s.events.filter((e) => e.type === 'cabinet_pull').at(-1);
  assert.equal(pulled.batchIds.every((id) => s.batches.find((b) => b.id === id && (b.src === 'sample' || b.src === 'starter'))), true);
  assert.equal(P.build(s, { from: T0, to: T0 + HR }).pulls.n, 0, 'pulling pretend food is not a pilot pull');
  const demo = E.apply(s, 'createTicket', { items: [{ menuId: s.menu[0].id }], src: 'demo', allowPast: true }, T0 + 20 * MIN);
  assert.equal(demo.report, 'ok');
  const real = ok(E.apply(demo.state, 'createTicket', { items: [{ menuId: s.menu[1].id }], src: 'live', allowPast: true }, T0 + 21 * MIN)).state;
  assert.equal(P.build(real, { from: T0, to: T0 + HR }).tickets.n, 1, 'only the real ticket counts');
});

test('Start over resets the pilot counters', () => {
  const k = kitchen();
  k.go('addBatch', { ing: 'pit_pork', tempF: 165, cookedG: 8000 }, T0 + MIN);
  k.go('pullBatch', { ing: 'pit_pork', g: 500 }, T0 + 10 * MIN);
  k.go('discardBatch', { batchId: k.s.batches[0].id, reason: 'manual' }, T0 + HR);
  const before = P.build(k.s, { from: T0, to: T0 + 2 * HR });
  assert.equal(before.pulls.n, 1); assert.equal(before.discards.n, 1);
  k.go('resetLive', { keepSettings: true, catalog: 'blank', replaceOwn: true, starter: false }, T0 + 3 * HR);
  const after = P.build(k.s, { from: T0, to: T0 + 4 * HR });
  assert.deepEqual([after.pulls.n, after.discards.n, after.discards.cost, after.undos, after.refused, after.tickets.n], [0, 0, 0, 0, 0, 0]);
});

test('pullAgain repeats the last pull that was not undone, is undoable, and says why when there is nothing to repeat', () => {
  const k = kitchen();
  k.go('addBatch', { ing: 'pit_pork', tempF: 165, cookedG: 8000 }, T0 + MIN);
  k.go('addBatch', { ing: 'house_ribs', tempF: 165, cookedG: 8000 }, T0 + MIN);
  const none = E.apply(k.s, 'pullAgain', {}, T0 + 5 * MIN);
  assert.equal(none.report, 'nothingToDo'); assert.equal(none.info.why, 'noPullYet');
  assert.equal(E.lastPull(k.s), null);
  k.go('pullBatch', { ing: 'pit_pork', g: 450 }, T0 + 10 * MIN);
  k.go('pullBatch', { ing: 'house_ribs', g: 300 }, T0 + 20 * MIN);
  assert.deepEqual([E.lastPull(k.s).ing, E.lastPull(k.s).g, E.lastPull(k.s, 'pit_pork').g], ['house_ribs', 300, 450]);
  k.go('pullAgain', {}, T0 + 30 * MIN);                                       // same product and weight as the last one
  assert.deepEqual(k.s.events.filter((e) => e.type === 'cabinet_pull').slice(-1).map((e) => [e.ing, e.g]), [['house_ribs', 300]]);
  k.go('pullAgain', { ing: 'pit_pork' }, T0 + 31 * MIN);                      // that product's last weight
  assert.equal(k.s.events.filter((e) => e.type === 'cabinet_pull').at(-1).g, 450);
  k.go('pullAgain', { g: 120 }, T0 + 32 * MIN);                               // a different weight for the last product
  assert.equal(k.s.events.filter((e) => e.type === 'cabinet_pull').at(-1).g, 120);
  k.go('undo', {}, T0 + 32 * MIN + 1000);
  assert.equal(E.lastPull(k.s).g, 450, 'an undone pull is not the last pull');
  assert.equal(E.apply(k.s, 'pullAgain', { ing: 7 }, T0 + 40 * MIN).report, 'unknownIng');
  assert.equal(E.apply(k.s, 'pullAgain', { g: -3 }, T0 + 40 * MIN).report, 'badWeight');
  assert.deepEqual(E.checkInvariants(k.s, T0 + 40 * MIN), []);
});
