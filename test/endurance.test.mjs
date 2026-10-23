// Data-layer endurance: the real engine and store, in-memory storage with a real quota, weeks of simulated service for three kinds of kitchen
// (see tools/endurance.mjs). The default run is 12 days and takes a few seconds. ENDURANCE_LONG=1 runs six months, three seeds, three kitchens,
// at 5 MB and 2 MB (about ten minutes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runEndurance } from '../tools/endurance.mjs';

const LONG = process.env.ENDURANCE_LONG === '1';
const kitchens = ['blank', 'cookahead', 'counter'];

for (const kitchen of kitchens) {
  for (const seed of LONG ? [1, 2, 3] : [1]) {
    for (const quota of LONG ? [5e6, 2e6] : kitchen === 'blank' ? [5e6, 2e6] : [5e6]) {
      test('endurance: ' + kitchen + ' kitchen, seed ' + seed + ', ' + (LONG ? '6 months' : '12 days') + ', ' + quota / 1e6 + ' MB quota', { timeout: LONG ? 1800e3 : 120e3 }, async () => {
        const res = await runEndurance({ kitchen, seed, quota, days: LONG ? 183 : 12, perDay: LONG ? [80, 250] : [20, 40] });
        if (res.problems.length) console.log(res.problems.join('\n'));
        assert.deepEqual(res.problems, []);
        assert.ok(res.summary.maxHeapMB < 1500, 'heap ' + res.summary.maxHeapMB + ' MB');
        assert.ok(res.summary.peakBytes <= quota);
        const last = res.rows[res.rows.length - 1];
        assert.ok(last.bytes <= quota);
      });
    }
  }
}
