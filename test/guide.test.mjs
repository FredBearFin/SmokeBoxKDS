// The in-app Guide: its data must match docs/sop, every page must be complete, and the words must not promise
// safety or compliance. Also checks that every button name the Guide shows in bold still exists in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSB, ROOT } from './_load.mjs';
import { readPages, dataBlock, inject, faqText } from '../tools/build-guide.mjs';

const SB = await loadSB(['00-util', '10-config', '60-shell', '78-guide']);
const G = SB.guide;
const GUIDE = ['getting-started', 'setup-recipes', 'how-you-serve', 'import-a-menu', 'taking-an-order', 'running-the-line', 'cooked-ahead-and-portions', 'hold-cabinet-and-warnings', 'cold-items-in-the-fridge', 'readings', 'closing-the-day', 'who-made-this-entry', 'backup-and-restore', 'close-the-month', 'start-over', 'replacing-a-device', 'get-the-tablet-ready', 'troubleshooting', 'empty-lost-or-locked', 'saved-data-that-cannot-be-read', 'trying-the-demo', 'questions-and-answers', 'what-this-app-does-not-replace'];
const CARDS = ['card-opening-checklist', 'card-closing-checklist', 'card-when-something-goes-wrong', 'card-first-day-checklist', 'card-tablet-setup', 'card-during-service'];
const FIGURES = ['ticket', 'ladder', 'cabinet'];
// Every piece of text on a page (picture descriptions included), in one list, for the word checks.
const textOf = (p) => G.textsOf(p);

test('the data in 78-guide.js is exactly what docs/sop produces (one source of truth)', () => {
  const file = path.join(ROOT, 'src/js/78-guide.js');
  const src = fs.readFileSync(file, 'utf8');
  assert.equal(inject(src, dataBlock(readPages())), src, 'run: node tools/build-guide.mjs');
});

test('the Guide has its fourteen pages and five quick cards, in order, each with a title, a summary and real content', () => {
  assert.deepEqual(G.pages.filter((p) => p.group === 'guide').map((p) => p.id), GUIDE);
  assert.deepEqual(G.pages.filter((p) => p.group === 'cards').map((p) => p.id), CARDS);
  G.pages.forEach((p) => {
    assert.ok(p.title && p.title.length >= 5, p.id + ' title');
    assert.ok(p.summary && p.summary.length >= 20, p.id + ' summary');
    assert.ok(p.blocks.length >= 1, p.id + ' has some body');
    p.blocks.forEach((b) => assert.ok(b.t === 'fig' ? b.alt.length > 3 : Array.isArray(b.x) ? b.x.length > 0 && b.x.every((x) => x.length > 3) : b.x.length > 3, p.id + ' block ' + b.t));
  });
});

test('each page is short: under 400 words, and a quick card under 160 so it fits one printed page', () => {
  G.pages.forEach((p) => assert.ok(textOf(p).join(' ').split(/\s+/).length < (p.group === 'cards' ? 160 : 400), p.id));
});

test('every picture is one of the three drawn in 79-guide-art.js and has a real description for screen readers', () => {
  const art = fs.readFileSync(path.join(ROOT, 'src/js/79-guide-art.js'), 'utf8');
  const figs = G.pages.flatMap((p) => p.blocks.filter((b) => b.t === 'fig'));
  assert.deepEqual([...new Set(figs.map((f) => f.id))].sort(), FIGURES.slice().sort(), 'all three pictures are placed');
  figs.forEach((f) => { assert.ok(f.alt.length >= 60, f.id + ' alt text'); assert.ok(new RegExp('function ' + f.id + '\\(').test(art), f.id + ' is drawn'); });
});

test('the quick cards are checklists, so they print with boxes to tick', () => {
  CARDS.forEach((id) => { const p = G.byId(id); assert.ok(p.blocks.filter((b) => b.t === 'check').reduce((n, b) => n + b.x.length, 0) >= 6, id); });
});

test('search finds pages by plain words, ranks a title match first, and says nothing for nonsense', () => {
  assert.equal(G.search('forgot pin')[0].page.id, 'empty-lost-or-locked');
  assert.equal(G.search('backup')[0].page.group, 'guide');
  assert.ok(G.search('sound').some((r) => r.page.id === 'troubleshooting'));
  assert.deepEqual(G.search('zzzzqq'), []);
  assert.deepEqual(G.search(''), []);
  assert.ok(G.search('hold cabinet')[0].snippet.length > 10);
});

test('the help-link helper exists (it returns nothing in Node, an element in the app)', () => {
  assert.equal(typeof G.link, 'function');
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
    .map((f) => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n').replace(/\\'/g, "'");
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

test('every "?" link and open() call in the app points at a Guide page that exists', () => {
  const dir = path.join(ROOT, 'src/js');
  const ids = new Set(G.pages.map((p) => p.id));
  const bad = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== '78-guide.js').forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/guide\.(?:link|open)\(\s*'([a-z0-9-]+)'/g)) if (!ids.has(m[1])) bad.push(f + ': ' + m[1]);
    for (const m of src.matchAll(/(?:helpLink|guideLink)\(\s*'([a-z0-9-]+)'/g)) if (!ids.has(m[1])) bad.push(f + ': ' + m[1]);
  });
  assert.deepEqual(bad, []);
});

test('docs/faq.md is a copy of the Questions and answers page (one source of truth)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/faq.md'), 'utf8'), faqText(), 'run: node tools/build-guide.mjs');
});
