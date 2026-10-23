// Menu import: pasted lines, spreadsheet tables, and item exports in the style of Square, Toast and Clover. The fixture files are
// hand-written to the documented column names of those exports; they are not real exports from any restaurant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSB, ROOT } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '13-menu-import', '20-engine']);
const M = SB.menuImport, E = SB.engine;
const T = 1780326000000;
const fx = (f) => fs.readFileSync(path.join(ROOT, 'test/fixtures/menu-import', f), 'utf8');
const names = (r) => r.rows.map((x) => x.name);
const codes = (row) => row.problems.map((p) => p.code);
const blank = () => E.newState({ now: T, blank: true });
// Runs the actions through the real engine; returns the final state.
function run(s, actions) { for (const a of actions) { const r = E.apply(s, a.type, a.payload, T); assert.equal(r.report, 'ok', a.payload.name + ': ' + r.report + ' ' + JSON.stringify(r.info)); s = r.state; } return s; }

test('typed lines in many shapes', () => {
  const r = M.parse(fx('lines-pasted.txt'));
  assert.equal(r.format, 'lines'); assert.match(r.label, /lines/);
  const by = Object.fromEntries(r.rows.map((x) => [x.name, x]));
  assert.deepEqual([by['Brisket plate'].price, by['Brisket plate'].station], [14, 'pit']);
  assert.equal(by.Burger.price, 9.5);
  assert.equal(by.Fries.price, 4);                                // tab
  assert.deepEqual([by['Sweet tea'].price, by['Sweet tea'].station], [3.5, 'cold']); // semicolons
  assert.equal(by.Mac.price, 9);                                  // "Name - $9"
  assert.equal(by['Smoked, sliced brisket'].price, 16.5);        // quoted comma
  assert.equal(by['Smoked, sliced turkey'].price, 12);           // unquoted comma inside the name
  assert.equal(by.Pickles.price, 3.5);                           // comma for the cents
  assert.equal(by['Free sample'].price, 0); assert.deepEqual(codes(by['Free sample']), ['freeItem']);
  assert.equal(r.rows.length, 11);                                // blank and # lines skipped
  assert.deepEqual(codes(by['Mystery plate']), ['variablePrice']);
  assert.equal(by['Mystery plate'].ok, false);
  assert.equal(r.summary.total, 11);
});

test('messy lines: duplicates, missing, negative, huge, junk prices, rounding, CRLF', () => {
  const r = M.parse(fx('lines-messy.txt'));
  const c = r.rows.map(codes);
  assert.deepEqual(c, [[], [], ['duplicateInFile'], ['noPrice'], ['negativePrice'], ['hugePrice'], ['badPrice'], ['priceRounded']]);
  for (const row of r.rows) for (const p of row.problems) { assert.ok(p.message.length > 10 && p.fix.length > 10, p.code); assert.match(p.level, /^(error|warn)$/); }
  assert.equal(r.summary.duplicates, 1);
});

test('generic tables: comma, semicolon with BOM and CRLF, tab; quoted fields', () => {
  const g = M.parse(fx('generic.csv'));
  assert.equal(g.format, 'csv'); assert.deepEqual(names(g), ['Brisket plate', 'Burger', 'Sweet tea']);
  assert.deepEqual(g.rows.map((x) => [x.station, x.category]), [['pit', 'meat'], ['fry', 'sandwich'], ['cold', 'cold']]);
  assert.equal(g.rows[0].description, 'Sliced, with two sides');
  assert.equal(g.rows[2].description, 'Large, "house" brew');
  const x = M.parse(fx('excel-semicolon.csv'));
  assert.equal(x.format, 'csv'); assert.deepEqual(x.rows.map((r) => r.price), [14, 5.5, 5.5]); assert.equal(x.rows[0].category, 'meat');
  const t = M.parse(fx('sheets-export.tsv'));
  assert.deepEqual(t.rows.map((r) => [r.name, r.price, r.station]), [['Brisket plate', 14, 'pit'], ['Burger', 9.5, 'fry'], ['Sweet tea', 3.5, 'cold']]);
});

test('Square, Toast and Clover exports are recognised by their headers and say so', () => {
  const sq = M.parse(fx('square-items.csv'));
  assert.equal(sq.format, 'square'); assert.match(sq.label, /Square/);
  assert.deepEqual(names(sq), ['Brisket Sandwich', 'Sweet Tea (Small)', 'Sweet Tea (Large)', 'Catering tray', 'Pulled Pork']); // variation joined only when several
  assert.deepEqual(sq.rows.map((r) => r.price), [13.5, 2.5, 3.5, null, 11.5]);
  assert.deepEqual(codes(sq.rows[3]).includes('variablePrice'), true);
  assert.deepEqual(sq.summary.unmatched.categories.sort(), ['Catering', 'Drinks']);
  const ts = M.parse(fx('toast-menu.csv'));
  assert.equal(ts.format, 'toast'); assert.match(ts.label, /Toast/);
  assert.deepEqual(ts.rows.map((r) => [r.name, r.price, r.categoryText]), [['Brisket plate', 14, 'Mains'], ['Rib rack', 29, 'Mains'], ['Mac and cheese', 5.5, 'Sides'], ['Sweet tea', 3.5, 'Drinks']]);
  assert.equal(ts.rows[3].problems.some((p) => p.code === 'hiddenItem'), true);
  const cl = M.parse(fx('clover-items.csv'));
  assert.equal(cl.format, 'clover'); assert.match(cl.label, /Clover/);
  assert.deepEqual(cl.rows.map((r) => r.price), [14, 9.5, null, 12.5]);          // cents converted
  assert.ok(codes(cl.rows[0]).includes('centsConverted'));
  assert.ok(codes(cl.rows[2]).includes('variablePrice'));
  assert.ok(cl.summary.notes.some((n) => /cents/.test(n)));
  const dollars = M.parse('Clover ID,Name,Price,Price Type\nA,Tea,3.5,FIXED\n', { priceUnit: 'dollars' });
  assert.equal(dollars.rows[0].price, 3.5);
  assert.equal(M.parse('Clover ID,Name,Price,Price Type\nA,Tea,350,FIXED\n').rows[0].price, 3.5);
  assert.equal(M.parse(fx('clover-items.csv'), { format: 'lines' }).format, 'lines'); // the caller can force lines
});

test('nasty tables: quotes, embedded commas and line breaks, empty rows, formulas, duplicates', () => {
  const r = M.parse(fx('nasty.csv'));
  assert.deepEqual(names(r), ['Ribs, "St. Louis", half', 'Two line name', '=SUM(A1)', 'Burnt ends', 'Burnt ends']);
  assert.deepEqual(codes(r.rows[4]), ['duplicateInFile']);
  assert.equal(M.parse(fx('header-only.csv')).rows.length, 0);
  assert.ok(M.parse(fx('header-only.csv')).summary.notes[0]);
  assert.match(M.parse(fx('empty.csv')).error, /empty/);
  assert.match(M.parse(null).error, /No text/);
  assert.match(M.parse('x'.repeat(2e6)).error, /too much/);
});

test('prices: symbols, thousands, cents, ranges and words', () => {
  const p = (t) => M.readPrice(t);
  assert.equal(p('$9').value, 9); assert.equal(p('USD 12.5').value, 12.5); assert.equal(p('1,250.00').value, 1250); assert.equal(p('9,50').value, 9.5);
  assert.equal(p('9.999').value, 10); assert.equal(p('9.999').rounded, true);
  assert.equal(p('-3').value, -3);
  for (const [t, e] of [['', 'missing'], ['MP', 'variable'], ['$9 - $12', 'range'], ['9 to 12', 'range'], ['abc', 'bad'], ['1.2.3', 'bad'], ['NaN', 'bad']]) assert.equal(p(t).error, e, t);
});

test('limits match the engine: name length, price bounds, menu size', () => {
  let s = blank();
  const add = (name, price) => E.apply(s, 'addMenuItem', { name, zone: 'pit', cat: 'meat', price, prepSec: 60, track: 'one' }, T).report;
  const long = 'x'.repeat(M.limits.nameMax);
  assert.equal(add(long, 5), 'ok'); assert.notEqual(add(long + 'y', 5), 'ok');
  const rows = M.parse(long + 'y, 5\n' + long + ', 1000\nCheap, 1000.01\nFree, 0\n').rows;
  assert.deepEqual(rows.map((r) => r.ok), [false, true, false, true]);
  assert.equal(add('At the limit', 1000), 'ok'); assert.notEqual(add('Over', 1000.01), 'ok');
  const big = M.parse(fx('big-500.csv'));
  assert.equal(big.rows.length, 500);
  assert.equal(big.summary.ok, M.limits.maxDishes);
  assert.ok(big.rows[M.limits.maxDishes].problems.some((p) => p.code === 'menuFull'));
  const existing = [{ name: 'Brisket plate' }, { name: 'Dish number 1' }];
  const withEx = M.parse(fx('big-500.csv'), { existing });
  assert.equal(withEx.summary.ok, M.limits.maxDishes - 2); assert.ok(codes(withEx.rows[0]).includes('duplicateExisting'));
  // the engine really stops at the limit the importer states
  const { actions } = M.toActions(big.rows, []);
  assert.equal(actions.length, M.limits.maxDishes);
  s = run(blank(), actions);
  assert.equal(s.menu.length, M.limits.maxDishes);
  assert.equal(E.apply(s, 'addMenuItem', { name: 'One more', zone: 'pit', cat: 'meat', price: 1, prepSec: 60, track: 'one' }, T).report, 'outOfBounds');
});

test('toActions gives addMenuItem actions the engine accepts, with safe defaults and unconfirmed prep times', () => {
  const rows = M.parse(fx('generic.csv')).rows.concat(M.parse(fx('lines-messy.txt')).rows);
  const { actions, skipped } = M.toActions(rows, []);
  assert.ok(actions.every((a) => a.type === 'addMenuItem'));
  assert.deepEqual(actions[0].payload, { name: 'Brisket plate', zone: 'pit', cat: 'meat', price: 14, prepSec: 300, track: 'one', prepGuess: true });
  assert.ok(skipped.length >= 5 && skipped.every((x) => x.reason));
  const s = run(blank(), actions);
  assert.ok(s.menu.length === actions.length);
  assert.ok(s.menu.every((m) => m.prepConfirmed === false && Array.isArray(m.bom) && m.bom.length === 0));
  assert.deepEqual(E.checkInvariants(s, T), []);
  // an ordinary add still counts the prep time as confirmed
  assert.equal(E.apply(blank(), 'addMenuItem', { name: 'Typed', zone: 'pit', cat: 'meat', price: 1, prepSec: 60, track: 'one' }, T).state.menu[0].prepConfirmed, true);
  // defaults come from the options; rows already on the menu are skipped again
  const o = M.toActions(M.parse('Pie, 4\nTea, 2\n').rows, [{ name: 'tea' }], { zone: 'cold', cat: 'cold', prepSec: 45, track: 'one' });
  assert.equal(o.actions.length, 1); assert.deepEqual([o.actions[0].payload.zone, o.actions[0].payload.cat, o.actions[0].payload.prepSec], ['cold', 'cold', 45]);
  assert.equal(o.skipped[0].name, 'Tea');
  assert.deepEqual(M.toActions(null, null), { actions: [], skipped: [] });
});

test('exportMenu writes a file the importer reads back exactly', () => {
  const menu = [
    { name: 'Brisket plate', price: 14, zone: 'pit', cat: 'meat' }, { name: 'Ribs, "St. Louis", half', price: 16.5, zone: 'pit', cat: 'meat' },
    { name: '=Danger', price: 1, zone: 'cold', cat: 'cold' }, { name: 'Old', price: 3, zone: 'fry', cat: 'fried', archived: true },
    { name: 'Two\nlines', price: 7.25, zone: 'sides', cat: 'side' }, { name: 'Sweet tea', price: 3.5, zone: 'cold', cat: 'cold' },
  ];
  const text = M.exportMenu(menu);
  assert.match(text, /^Name,Price,Station,Category\r\n/); assert.ok(text.includes("'=Danger"));
  const r = M.parse(text);
  assert.equal(r.format, 'csv');
  assert.deepEqual(r.rows.map((x) => [x.name, x.price, x.station, x.category]),
    [['Brisket plate', 14, 'pit', 'meat'], ['Ribs, "St. Louis", half', 16.5, 'pit', 'meat'], ['=Danger', 1, 'cold', 'cold'], ['Two lines', 7.25, 'sides', 'side'], ['Sweet tea', 3.5, 'cold', 'cold']]);
  assert.equal(r.rows.every((x) => x.ok), true);
  // the whole barbecue sample menu goes out and comes back
  const sample = SB.config.menu;
  const back = M.parse(M.exportMenu(sample));
  assert.equal(back.rows.length, sample.length);
  assert.deepEqual(back.rows.map((x) => [x.name, x.price, x.station, x.category]), sample.map((m) => [m.name, m.price, m.zone, m.cat]));
  assert.equal(M.exportMenu(null), 'Name,Price,Station,Category\r\n');
});

test('parse never throws on junk', () => {
  for (const t of ['', ' ', '\n\n', ',,,,', '"', '"""', 'a'.repeat(5000), '\u0000\u0001', 'Name,Price\n"unterminated,5', ';;;\n;;;', 'Name\tPrice\n\t\n', '=1+1', '-', '$', ',']) {
    const r = M.parse(t);
    assert.ok(r && Array.isArray(r.rows), JSON.stringify(t));
  }
  for (const v of [undefined, 5, {}, [], () => 1]) assert.ok(M.parse(v).error);
});
