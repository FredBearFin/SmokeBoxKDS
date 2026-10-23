// Independent-review fix #12: the menu importer's line reader takes linear time on long runs of spaces and on very long lines, and says so in
// plain words when a line is too long to be a dish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '13-menu-import', '20-engine']);
const M = SB.menuImport;
// Times one parse in milliseconds.
const time = (text, opts) => { const t0 = process.hrtime.bigint(); const r = M.parse(text, opts); return { ms: Number(process.hrtime.bigint() - t0) / 1e6, r }; };

test('#12: a name followed by a long run of spaces and a stray letter is read in well under a second (it took 7 s at 40 000 spaces)', () => {
  const a = time('Burger' + ' '.repeat(40000) + 'x', { format: 'lines' });
  assert.ok(a.ms < 400, 'took ' + a.ms + ' ms');
  const b = time('Burger' + ' '.repeat(200000) + 'x', { format: 'lines' });
  assert.ok(b.ms < 800, 'took ' + b.ms + ' ms at 200 000 spaces');
});

test('#12: the same attack on the other line shapes (cents with a comma, a dash, a price at the end) stays fast', () => {
  for (const tail of ['1,5', '- 9', '9.50', '$', '-']) {
    const t = time('Pickles' + ' '.repeat(60000) + tail + ' '.repeat(10) + 'z', { format: 'lines' });
    assert.ok(t.ms < 500, tail + ' took ' + t.ms + ' ms');
  }
  const t = time(('Item ' + '1,'.repeat(20000)) + '\n' + ('Dish\t'.repeat(20000)), { format: 'lines' });
  assert.ok(t.ms < 1000, 'long delimited lines took ' + t.ms + ' ms');
});

test('#12: a normal menu still reads the same, with ordinary spacing and tabs', () => {
  const r = M.parse('Brisket plate   14.00\nBurger\t9.50\t\tpit\nPickles 3,50\nTea - $2', { format: 'lines' });
  assert.deepEqual(r.rows.map((x) => [x.name, x.price]), [['Brisket plate', 14], ['Burger', 9.5], ['Pickles', 3.5], ['Tea', 2]]);
});

test('#12: a line far longer than any dish line is refused for that row with a plain message, and the rest still reads', () => {
  const r = M.parse('Burger 9.50\n' + 'a'.repeat(5000) + ' 4.00\nTea 2.00', { format: 'lines' });
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows[1].problems.some((p) => p.code === 'lineTooLong' && /too long/i.test(p.message)), JSON.stringify(r.rows[1].problems.map((p) => p.code)));
  assert.deepEqual([r.rows[0].price, r.rows[2].price], [9.5, 2]);
});
