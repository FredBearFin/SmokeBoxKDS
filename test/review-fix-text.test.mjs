// Independent-review follow-up: invisible direction and zero-width characters are stripped from typed names and notes, emoji sequences survive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const U = SB.util, E = SB.engine;
const T0 = new Date(2026, 9, 20, 12, 0, 0).getTime();

test('text #6: direction controls and zero-width characters are removed', () => {
  assert.equal(U.cleanText('Pul‮led‬ Pork'), 'Pulled Pork');
  assert.equal(U.cleanText('⁦A⁩⁧B⁨C'), 'ABC');
  assert.equal(U.cleanText('a​b‌c⁠d﻿e'), 'abcde');
  assert.equal(U.cleanText('  two   words​ '), 'two words');
  assert.equal(U.cleanText('x‍y'), 'xy', 'a lone joiner is removed');
  assert.equal(U.cleanText('x ‍'), 'x');
});

test('text #6: emoji sequences keep their joiners', () => {
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}', heart = '❤️‍\u{1F525}', tone = '\u{1F9D1}\u{1F3FD}‍\u{1F373}';
  for (const e of [family, heart, tone, '\u{1F3F3}️‍\u{1F308}']) assert.equal(U.cleanText('x ' + e + ' y'), 'x ' + e + ' y');
  assert.equal(U.cleanText(family + '‍'), family, 'a trailing joiner after the sequence goes');
});

test('text #6: the engine door strips them from a ticket customer, an ingredient name and a menu name', () => {
  const s0 = E.newState({ now: T0, starter: true });
  const t = E.apply(s0, 'createTicket', { items: [{ menuId: s0.menu[0].id }], customer: 'Al‮e‬​x' }, T0, {});
  assert.equal(t.report, 'ok');
  assert.equal(t.state.tickets[t.state.tickets.length - 1].customer, 'Alex');
  const m = E.apply(s0, 'addMenuItem', { name: 'Sm​oky‮ Beans', zone: s0.menu[0].zone, cat: s0.menu[0].cat, track: 'one', price: 5, prepSec: 300 }, T0 + 1000, {});
  if (m.report === 'ok') assert.ok(m.state.menu.some((x) => x.name === 'Smoky Beans'));
  else assert.fail('addMenuItem refused: ' + m.report + ' ' + JSON.stringify(m.info));
  const i = E.apply(s0, 'addIngredient', { name: 'Gar​lic‭' }, T0 + 2000, {});
  assert.equal(i.report, 'ok');
  assert.ok(i.state.ingredients.some((x) => x.name === 'Garlic'));
});

test('text #6: a screen name with invisible characters is cleaned', () => {
  const C = SB.config, before = C.customSpec();
  try {
    C.applyCustom({ rename: { zones: { pit: 'Gr\u200Bill\u202E' } }, add: {} });
    assert.equal(C.zoneById.pit.name, 'Grill');
  } finally { C.applyCustom(before); }
});

// A saved kitchen with long, dirty text in every field the review found uncapped, loaded through validateBackup (the restore and load door).
test('caps #7: a backup with huge or dirty names, notes and labels is cut and cleaned on load', () => {
  const s = E.newState({ now: T0, starter: true });
  let r = E.apply(s, 'createTicket', { items: [{ menuId: s.menu[0].id }], customer: 'Sam' }, T0, {});
  assert.equal(r.report, 'ok');
  const st = JSON.parse(JSON.stringify(r.state));
  const big = 'x'.repeat(5000), dirty = 'a‮b​c';
  st.menu[0].name = big; st.menu[0].short = big;
  st.menu[1].name = dirty; st.menu[1].short = dirty;
  st.ingredients[0].name = big; st.ingredients[0].note = big;
  const t = st.tickets[0];
  t.customer = big; t.note = big + '‮'; t.items[0].name = big; t.items[0].short = big; t.items[0].mods = Array(50).fill(big);
  const v = E.validateBackup(JSON.stringify({ v: 1, state: st }));
  assert.equal(v.ok, true, v.error);
  const o = v.state;
  assert.equal(o.menu[0].name.length, 60); assert.equal(o.menu[0].short.length, 24);
  assert.equal(o.menu[1].name, 'abc'); assert.equal(o.menu[1].short, 'abc');
  assert.equal(o.ingredients[0].name.length, 60); assert.equal(o.ingredients[0].note.length, SB.config.limits.maxNoteLen);
  const ot = o.tickets[0];
  assert.equal(ot.customer.length, SB.config.limits.maxCustomerLen); assert.equal(ot.note.length, SB.config.limits.maxNoteLen);
  assert.equal(ot.items[0].name.length, 60); assert.equal(ot.items[0].short.length, 24);
  assert.ok(ot.items[0].mods.length <= 10 && ot.items[0].mods.every((m) => m.length <= 60));
  assert.ok(v.repaired.length > 0);
});

test('caps #7: a batch label from a backup is cut to 40 and a cut never leaves half an emoji', () => {
  let s = E.newState({ now: T0, starter: true });
  const ing = s.ingredients.find((i) => i.tcs);
  const r = E.apply(s, 'addBatch', { ing: ing.id, rawG: 1000, tempF: 165 }, T0, {});
  assert.equal(r.report, 'ok');
  const st = JSON.parse(JSON.stringify(r.state));
  st.batches[st.batches.length - 1].label = 'y'.repeat(39) + '\u{1F600}\u{1F600}' + '‮';
  const v = E.validateBackup(JSON.stringify({ v: 1, state: st }));
  assert.equal(v.ok, true, v.error);
  const lb = v.state.batches[v.state.batches.length - 1].label;
  assert.ok(lb.length <= 40 && !/[\uD800-\uDBFF]$/.test(lb), lb);
});

test('caps #7: the ticket note action strips invisible characters; too-long text is still refused', () => {
  const s0 = E.newState({ now: T0, starter: true });
  const ok = E.apply(s0, 'createTicket', { items: [{ menuId: s0.menu[0].id }], note: 'no‮ nuts​' }, T0, {});
  assert.equal(ok.report, 'ok');
  assert.equal(ok.state.tickets[ok.state.tickets.length - 1].note, 'no nuts');
  const bad = E.apply(s0, 'createTicket', { items: [{ menuId: s0.menu[0].id }], note: 'z'.repeat(141) }, T0, {});
  assert.equal(bad.report, 'noteTooLong');
});
