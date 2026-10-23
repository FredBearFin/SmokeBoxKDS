// The in-app Guide: its data must match docs/sop, every page must be complete, and the words must not promise
// safety or compliance. Also checks that every button name the Guide shows in bold still exists in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSB, ROOT } from './_load.mjs';
import { readPages, dataBlock, inject } from '../tools/build-guide.mjs';

const SB = await loadSB(['00-util', '10-config', '60-shell', '78-guide']);
const G = SB.guide;
const EXPECTED = ['getting-started', 'taking-an-order', 'running-the-line', 'closing-the-day', 'backup-and-restore', 'replacing-a-device', 'what-this-app-does-not-replace'];
// Every piece of text on a page, in one list, for the word checks.
const textOf = (p) => [p.title, p.summary].concat(p.blocks.map((b) => (Array.isArray(b.x) ? b.x.join(' ') : b.x)));

test('the data in 78-guide.js is exactly what docs/sop produces (one source of truth)', () => {
  const file = path.join(ROOT, 'src/js/78-guide.js');
  const src = fs.readFileSync(file, 'utf8');
  assert.equal(inject(src, dataBlock(readPages())), src, 'run: node tools/build-guide.mjs');
});

test('the Guide has the seven agreed pages, in order, each with a title, a summary and real content', () => {
  assert.deepEqual(G.pages.map((p) => p.id), EXPECTED);
  G.pages.forEach((p) => {
    assert.ok(p.title && p.title.length >= 5, p.id + ' title');
    assert.ok(p.summary && p.summary.length >= 20, p.id + ' summary');
    assert.ok(p.blocks.length >= 1, p.id + ' has some body');
    p.blocks.forEach((b) => assert.ok(Array.isArray(b.x) ? b.x.length > 0 && b.x.every((x) => x.length > 3) : b.x.length > 3, p.id + ' block ' + b.t));
  });
});

test('each page is short enough to read on one screen or so (under 330 words)', () => {
  G.pages.forEach((p) => assert.ok(textOf(p).join(' ').split(/\s+/).length < 330, p.id));
});

test('no page claims food or a kitchen is safe, compliant, certified or guaranteed', () => {
  const bad = /\bsafe\b|\bsafely\b|\bcompliant\b|\bcompliance\b|\bguarantee[sd]?\b|\bcertified\b|\bapproved\b/i;
  G.pages.forEach((p) => textOf(p).forEach((t) => assert.ok(!bad.test(t), p.id + ': ' + t)));
});

test('the last page says what the app does not replace: food-safety procedures, the health code, card processing, the POS', () => {
  const t = textOf(G.byId('what-this-app-does-not-replace')).join(' ');
  ['Food-safety procedures', 'health code', 'Card processing', 'register or POS'].forEach((w) => assert.ok(t.includes(w), w));
});

test('words follow the house rules: US spelling, grams and kilograms, no developer words', () => {
  const t = G.pages.map((p) => textOf(p).join(' ')).join(' ');
  assert.ok(!/colour|favourite|centre|grey|whilst|\btill\b|takings|\btick\b/i.test(t), 'non-US words');
  assert.ok(!/\b(lb|lbs|pounds?|ounces?|oz)\b/i.test(t), 'weights');
  assert.ok(!/\bSB\.|\bJSON\b|module|simulat|pretend|Pitcall/i.test(t.replace(/Download backup \(JSON\)|\.json/g, '')), 'developer words');
});

test('every button or screen name shown in bold exists as text in the app source', () => {
  const src = fs.readdirSync(path.join(ROOT, 'src/js')).filter((f) => f.endsWith('.js') && f !== '78-guide.js')
    .map((f) => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
  const missing = G.labels().filter((l) => !src.includes(l));
  assert.deepEqual(missing, [], 'rename these in docs/sop (then run tools/build-guide.mjs), or restore the label');
});

test('text helpers: bold marks split correctly and plain() removes them', () => {
  assert.deepEqual(G.pieces('Tap **Pay** now'), [{ b: false, s: 'Tap ' }, { b: true, s: 'Pay' }, { b: false, s: ' now' }]);
  assert.equal(G.plain('Tap **Pay** now'), 'Tap Pay now');
  assert.equal(G.byId('nope').id, 'getting-started');
});

test('the router understands #/guide and #/guide/page, and cleans junk', () => {
  const R = SB.router;
  assert.deepEqual(R.viewFor('#/guide'), { kind: 'guide', page: '' });
  assert.deepEqual(R.viewFor('#/guide/closing-the-day'), { kind: 'guide', page: 'closing-the-day' });
  assert.deepEqual(R.viewFor('#/guide/../x?y'), { kind: 'guide', page: '' });
  assert.equal(R.hashFor({ kind: 'guide', page: 'closing-the-day' }), '#/guide/closing-the-day');
  assert.equal(R.hashFor({ kind: 'guide' }), '#/guide');
  assert.deepEqual(R.viewFor(R.hashFor({ kind: 'guide', page: 'a-b' })), { kind: 'guide', page: 'a-b' });
});
