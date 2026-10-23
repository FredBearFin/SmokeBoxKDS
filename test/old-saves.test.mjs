// Old saves: real storage contents and backups written by older Smokebox builds (made by tools/make-old-saves.mjs from git
// checkouts of those commits) must load in the current build with nothing lost, and round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSB, ROOT } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E, config: C } = SB;
const DIR = path.join(ROOT, 'test/fixtures/old-saves');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const NOW = Date.UTC(2026, 9, 17, 20);
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
// A storage object over a Map, preloaded with the keys an old build left in the browser.
function backend(entries) {
  const m = new Map(Object.entries(entries || {})), writes = [];
  return { m, writes, persistent: true, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => { writes.push(k); m.set(k, JSON.stringify(v)); return true; }, remove: (k) => { m.delete(k); }, keys: (p) => Array.from(m.keys()).filter((k) => k.indexOf(p) === 0) };
}
const start = (b, mode) => S.init({ storage: b, mode: mode || 'real', blank: true, noTimers: true, noSync: true, now: () => NOW });
// The state without the parts that legitimately change on a save (revision counter).
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((y) => [y, v[y]])) : v));
const body = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.rev; return canon(c); };

test('there are fixtures from several old builds', () => {
  assert.ok(FILES.length >= 6, FILES.join());
  for (const f of FILES) { const x = load(f); assert.ok(x.storage['smokebox.v1.state'], f); assert.ok(x.backup.length > 1000, f); assert.equal('mode' in JSON.parse(x.backup), false, f + ': old backups have no mode'); }
});

for (const f of FILES) {
  const fx = load(f);
  const ex = fx.expect;

  test(f + ': the saved kitchen loads with its menu, settings, PIN and edits, and nothing is dropped', () => {
    const b = backend(fx.storage);
    const st = start(b);
    try {
      assert.equal(st.firstRun, false); assert.equal(st.corrupt, null);
      assert.deepEqual(st.repaired.filter((r) => /dropped|restored|reset to 0|re-opened/.test(r)), [], 'repairs: ' + st.repaired.join(' | '));
      const s = S.getState();
      assert.equal(S.isOwn(), false); assert.equal(S.isBlank(), false); assert.equal(s.catalog, undefined);
      assert.deepEqual([s.menu.length, s.ingredients.length, s.tickets.length, s.batches.length, (s.orders || []).length], [ex.menu, ex.ingredients, ex.tickets, ex.batches, ex.orders]);
      assert.deepEqual([s.settings.service.taxRatePct, s.settings.service.openHour, s.settings.office.pinHash], [ex.taxRatePct, ex.openHour, ex.pinHash]);
      assert.equal(s.menu.find((m) => m.id === 'brisket_half').price, ex.brisketHalfPrice);
      assert.equal(s.menu.some((m) => m.name === 'Chef special'), ex.customDish);
      assert.equal(s.ingredients.find((i) => i.id === 'brisket').costPerKg, ex.brisketCost);
      assert.deepEqual(E.checkInvariants(s, S.now()), []);
      assert.equal(E.moduleOn(s, 'cookAhead'), true);       // an old kitchen keeps every cook-ahead feature
      assert.equal(s.settings.modules, undefined);
      assert.equal(s.menu.length >= 21, true);              // the barbecue menu is still there
      // loading wrote nothing and touched no demo key and no other key
      assert.deepEqual(b.writes, []);
      assert.deepEqual(b.keys('smokebox.demo.'), []);
      assert.equal(b.m.get('smokebox.v1.dlog'), fx.storage['smokebox.v1.dlog']);
      assert.equal(b.m.get('smokebox.v1.theme'), fx.storage['smokebox.v1.theme']);
    } finally { S.destroy(); }
  });

  test(f + ': the old backup file imports as a real kitchen, is refused by the demo, and matches the saved kitchen', () => {
    const b = backend(fx.storage);
    start(b);
    const loaded = S.getState();
    try {
      assert.equal(S.importAll(fx.backup), 'ok');
      assert.equal(body(S.getState()), body(loaded), 'the backup and the saved kitchen are the same kitchen');
      const spec = ex.names;
      if (spec) assert.deepEqual(C.customSpec(), spec);
    } finally { C.applyCustom({}); SB.util.storage.remove('smokebox.v1.names'); S.destroy(); }
    start(backend(), 'demo');
    const before = S.getState();
    assert.equal(S.importAll(fx.backup), 'wrongBackupMode');
    assert.equal(S.getState(), before);
    S.destroy();
  });

  test(f + ': export from the current build and import again changes nothing (twice)', () => {
    const b = backend(fx.storage);
    start(b);
    try {
      const s1 = S.getState();
      const t1 = S.exportAll();
      assert.ok(t1); assert.equal(JSON.parse(t1).mode, 'real');
      assert.equal(S.importAll(t1), 'ok');
      assert.equal(body(S.getState()), body(s1));
      const t2 = S.exportAll();
      assert.equal(S.importAll(t2), 'ok');
      assert.equal(body(S.getState()), body(s1));
      // a second device: the current backup restores into an empty install
      S.destroy();
      start(backend());
      assert.equal(S.isBlank(), true);
      assert.equal(S.importAll(t2), 'ok');
      assert.equal(body(S.getState()), body(s1));
      assert.equal(S.isOwn(), false);
    } finally { C.applyCustom({}); SB.util.storage.remove('smokebox.v1.names'); S.destroy(); }
  });

  test(f + ': the loaded kitchen keeps working (orders, a batch, close day, reorder) and stays healthy', () => {
    start(backend(fx.storage));
    try {
      const has = (id) => S.getState().menu.some((m) => m.id === id && !m.archived);
      assert.equal(S.dispatch('addMenuItem', { name: 'Test pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' }), 'ok');
      assert.equal(S.dispatch('moveMenuItem', { id: 'test_pie', toIndex: 0 }), 'ok');
      assert.equal(S.dispatch('setPortions', { menuId: 'test_pie', on: true, count: 3 }), 'ok');
      if (has('tea')) { const r = S.dispatch('createTicket', { customer: 'Late', channel: 'takeout', items: [{ menuId: 'tea', qty: 1 }, { menuId: 'test_pie', qty: 1 }] }); assert.ok(r === 'ok' || r === 'itemUnavailable', r); }
      assert.equal(S.dispatch('addIngredient', { name: 'Mustard', costPerKg: 4 }), 'ok');
      assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
      S.flush();
      const v = E.validateBackup(S.exportAll());
      assert.equal(v.ok, true);
    } finally { S.destroy(); }
  });
}

test('a backup from the current build of a blank kitchen restores into a fresh install, and an old install keeps its barbecue menu', () => {
  start(backend());
  S.dispatch('addMenuItem', { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' });
  const text = S.exportAll(); S.destroy();
  start(backend());
  assert.equal(S.importAll(text), 'ok');
  assert.deepEqual([S.getState().menu.length, S.isOwn()], [1, true]);
  S.destroy();
  // restoring that own-kitchen backup over an old kitchen replaces it with the own kitchen (nothing from the sample comes back)
  start(backend(load(FILES[0]).storage));
  assert.equal(S.importAll(text), 'ok');
  assert.equal(S.getState().menu.length, 1); assert.equal(S.getState().ingredients.length, 0);
  S.destroy();
});
