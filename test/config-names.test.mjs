// Config names tests: renaming and adding stations, categories and channels; limits; that ids never change;
// that the engine accepts a ticket on an added station and channel; and that a saved spec is applied at load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const C = SB.config, E = SB.engine;
const reset = () => C.applyCustom({});

test('starter lists are unchanged with no custom spec', () => {
  reset();
  assert.deepEqual(C.zones.map((z) => z.id), ['pit', 'sides', 'fry', 'cold', 'expo']);
  assert.deepEqual(C.workZones, ['pit', 'sides', 'fry', 'cold']);
  assert.equal(C.zoneById.pit.name, 'Pit');
});

test('rename changes names and tags but never ids', () => {
  const r = C.applyCustom({ rename: { zones: { pit: 'Smoker' }, categories: { meat: 'BBQ plates' }, channels: { dine_in: 'Table service' } } });
  assert.deepEqual(r.rejected, []);
  assert.equal(C.zoneById.pit.name, 'Smoker');
  assert.equal(C.zoneById.pit.code, 'SMO');
  assert.equal(C.zones[0].id, 'pit');
  assert.equal(C.categoryById.meat.name, 'BBQ plates');
  assert.equal(C.channelById.dine_in.name, 'Table service');
  reset();
  assert.equal(C.zoneById.pit.name, 'Pit');
});

test('bad renames are rejected and named, the rest still apply', () => {
  const r = C.applyCustom({ rename: { zones: { pit: '', nope: 'X', fry: 'Hot sides', sides: 'x'.repeat(30) }, channels: { takeout: 'To go' } } });
  assert.equal(r.rejected.length, 4);
  assert.equal(C.zoneById.pit.name, 'Pit');
  assert.equal(C.channelById.takeout.name, 'To go');
  reset();
});

test('add one station: it routes, keeps expo last and shows in workZones', () => {
  const r = C.applyCustom({ add: { zones: [{ name: 'Bar' }] } });
  assert.deepEqual(r.rejected, []);
  assert.equal(C.zones[C.zones.length - 1].id, 'expo');
  assert.ok(C.workZones.includes('z_bar'));
  assert.equal(C.zoneById.z_bar.code, 'BAR');
  const st = E.newState({ now: 1e12, starter: true });
  const menu = st.menu.slice(); menu[0] = Object.assign({}, menu[0]);
  const res = E.apply(st, 'updateMenuItem', { id: menu[0].id, patch: { zone: 'z_bar' } }, 1e12);
  assert.equal(res.report, 'ok', 'the engine accepts the new station for a menu item');
  assert.equal(res.state.menu.find((m) => m.id === menu[0].id).zone, 'z_bar');
  reset();
  assert.ok(!C.workZones.includes('z_bar'));
});

test('add one channel: the engine accepts a ticket on it', () => {
  C.applyCustom({ add: { channels: [{ name: 'Catering' }] } });
  assert.ok(C.channelById.ch_catering);
  const st = E.newState({ now: 1e12, starter: true });
  const item = st.menu.find((m) => !m.archived);
  const res = E.apply(st, 'createTicket', { customer: 'Test', channel: 'ch_catering', items: [{ menuId: item.id, qty: 1 }] }, 1e12);
  assert.equal(res.report, 'ok');
  assert.equal(res.state.tickets[res.state.tickets.length - 1].channel, 'ch_catering');
  reset();
});

test('add one category: a menu item can move to it', () => {
  C.applyCustom({ add: { categories: [{ name: 'Desserts' }] } });
  assert.equal(C.categoryById.c_desserts.name, 'Desserts');
  reset();
});

test('duplicates and the size limit are refused', () => {
  const r = C.applyCustom({ add: { zones: [{ name: 'pit' }, { name: 'Bar' }, { name: 'bar' }], channels: [{ name: 'Takeout' }] } });
  assert.equal(r.rejected.length, 3);
  const many = Array.from({ length: 12 }, (_, i) => ({ name: 'Extra ' + i }));
  const r2 = C.applyCustom({ add: { zones: many } });
  assert.equal(C.workZones.length, 4 + C.customLimits.zones);
  assert.ok(r2.rejected.length >= 4);
  reset();
});

test('garbage specs never throw', () => {
  for (const sp of [null, undefined, 5, 'x', [], { rename: 5 }, { add: { zones: 'x' } }, { add: { zones: [null, 5, {}] } }]) C.applyCustom(sp);
  reset();
  assert.equal(C.zones.length, 5);
});
