// Backups carry the owner's station/category/channel names so tickets on an added station survive a restore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E, config: C } = SB;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const mem = () => ({ persistent: true, m: new Map(), get(k, fb) { const r = this.m.get(k); return r == null ? fb : JSON.parse(r); }, set(k, v) { this.m.set(k, JSON.stringify(v)); return true; }, remove(k) { this.m.delete(k); } });
const noNames = () => { C.applyCustom({}); C.saveCustom({ rename: {}, add: {} }); };

test('export carries the names, and import on a device without them keeps the added-station ticket', () => {
  noNames();
  C.applyCustom({ add: { zones: [{ name: 'Bar' }] }, rename: { channels: { takeout: 'To go' } } });
  C.saveCustom({ add: { zones: [{ name: 'Bar' }] }, rename: { channels: { takeout: 'To go' } } });
  S.init({ now: () => T0, storage: mem(), noTimers: true, noSync: true });
  assert.equal(S.dispatch('updateMenuItem', { id: 'tea', patch: { zone: 'z_bar' } }), 'ok');
  assert.equal(S.dispatch('createTicket', { items: [{ menuId: 'tea' }] }), 'ok');
  const text = S.exportAll();
  assert.ok(text);
  assert.deepEqual(JSON.parse(text).names.add.zones, [{ name: 'Bar' }]);
  S.destroy();
  // a fresh device: no names at all
  noNames();
  assert.equal(C.zoneById.z_bar, undefined);
  S.init({ now: () => T0, storage: mem(), noTimers: true, noSync: true });
  assert.equal(S.importAll(text), 'ok');
  const st = S.getState();
  assert.equal(st.tickets.length, 1);
  assert.equal(st.tickets[0].items[0].zone, 'z_bar');
  assert.equal(C.zoneById.z_bar.name, 'Bar');
  assert.equal(C.channelById.takeout.name, 'To go');
  assert.deepEqual(C.customSpec().add.zones, [{ name: 'Bar' }]); // saved for the next start
  S.destroy();
  noNames();
});

test('an older backup without names imports and leaves current names alone; a refused import restores names', () => {
  noNames();
  S.init({ now: () => T0, storage: mem(), noTimers: true, noSync: true });
  const plain = S.exportAll();
  assert.equal('names' in JSON.parse(plain), false); // nothing custom: no field
  C.applyCustom({ add: { zones: [{ name: 'Bar' }] } });
  C.saveCustom({ add: { zones: [{ name: 'Bar' }] } });
  assert.equal(S.importAll(plain), 'ok');
  assert.ok(C.zoneById.z_bar);
  const bad = JSON.stringify({ v: 1, names: { rename: { zones: { pit: 'Smoker' } } }, state: { junk: true } });
  assert.equal(S.importAll(bad), 'invalidBackup');
  assert.equal(C.zoneById.pit.name, 'Pit');
  assert.ok(C.zoneById.z_bar);
  S.destroy();
  noNames();
});
