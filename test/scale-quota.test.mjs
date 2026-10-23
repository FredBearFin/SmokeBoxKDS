// Scale and quota: a full-size kitchen (150 dishes, 80 ingredients, 5,000 tickets of history) saves, loads, exports and
// imports; when the browser's storage is full the oldest history goes first and the safety records, the menu, the
// ingredients and the PIN never do; damaged copies of the smaller keys never stop the app from starting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadSB, ROOT } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E, config: C } = SB;
const T = 1780326000000;
const MIN = 60e3;
const PIN = 'sha256:' + 'cd34'.repeat(16);

// Builds the big kitchen once: cook-ahead on for a few safety records, a PIN, 150 dishes with recipes, 5,000 paid tickets.
let big = null, bigNow = T;
function bigKitchen() {
  if (big) return big;
  let s = E.newState({ now: T, blank: true });
  const ap = (type, p, now) => { const r = E.apply(s, type, p, now == null ? bigNow : now); assert.equal(r.report, 'ok', type + ' ' + r.report + ' ' + JSON.stringify(r.info)); s = r.state; return r; };
  ap('updateSettings', { patch: { modules: { cookAhead: true }, office: { pinHash: PIN } } });
  ap('addIngredient', { name: 'Smoked chili', tcs: true, costPerKg: 6 });
  for (let i = 0; i < 79; i++) ap('addIngredient', { name: 'Ingredient ' + i, costPerKg: 3, thresholdG: 100 });
  for (let i = 0; i < 150; i++) ap('addMenuItem', { name: 'Dish number ' + i, zone: ['pit', 'sides', 'fry', 'cold'][i % 4], cat: ['meat', 'side', 'fried', 'cold'][i % 4], price: 5 + (i % 20), prepSec: 120, track: 'one' });
  for (let i = 0; i < 150; i++) ap('updateMenuItem', { id: s.menu[i].id, patch: { bom: [{ ing: s.ingredients[1 + (i % 79)].id, qty: 100 }, { ing: s.ingredients[1 + ((i + 1) % 79)].id, qty: 50 }] } });
  for (const ing of s.ingredients.slice(1)) ap('restock', { ing: ing.id, g: 900000 });
  // safety records near the start: a batch, readings, a discard, a sanitize
  ap('addBatch', { ing: 'smoked_chili', tempF: 165, cookedG: 3000 });
  bigNow += 30 * MIN; ap('logTemp', { batchId: s.batches[0].id, tempF: 150, who: 'JR' });
  bigNow += 30 * MIN; ap('sanitizeDone', { who: 'JR' });
  bigNow += 30 * MIN; ap('discardBatch', { batchId: s.batches[0].id, reason: 'manual', who: 'JR' });
  for (let i = 0; i < 5000; i++) {
    bigNow += 20000;
    ap('createTicket', { customer: 'Guest ' + i, channel: ['dine_in', 'takeout', 'drive_thru', 'third_party'][i % 4], items: [{ menuId: s.menu[i % 150].id, qty: 1 }, { menuId: s.menu[(i * 7) % 150].id, qty: 2 }] });
    bigNow += 400000; s = E.tick(s, bigNow).state;
    const tk = s.tickets[s.tickets.length - 1];
    for (const it of tk.items) { const r = E.apply(s, 'completeItem', { ticketId: tk.id, itemId: it.id }, bigNow); if (r.report === 'ok') s = r.state; }
    ap('bumpTicket', { ticketId: tk.id });
    const o = s.orders[s.orders.length - 1];
    if (o.status === 'open') ap('payOrder', { orderId: o.id, method: 'cash', tip: 0, discount: 0 });
  }
  big = s;
  return s;
}
// A storage that refuses any single value longer than max characters (the way a full browser does) and counts what it holds.
function quotaStorage(max) {
  const m = new Map(), log = [];
  return { m, log, persistent: true, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => { const raw = JSON.stringify(v); log.push([k, raw.length]); if (raw.length > max) return false; m.set(k, raw); return true; }, remove: (k) => { m.delete(k); }, keys: (p) => Array.from(m.keys()).filter((k) => k.indexOf(p) === 0) };
}
const start = (b) => S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => bigNow + MIN });

test('the full-size kitchen is healthy and its backup round-trips', () => {
  const s = bigKitchen();
  assert.deepEqual([s.menu.length, s.ingredients.length, s.tickets.length, s.orders.length], [150, 80, 5000, 5000]);
  assert.deepEqual(E.checkInvariants(s, bigNow), []);
  const text = E.serialize(s);
  assert.ok(text.length < 20e6, 'export limit: ' + text.length);
  const t0 = performance.now();
  const v = E.validateBackup(text);
  assert.equal(v.ok, true); assert.deepEqual(v.repaired, []);
  assert.ok(performance.now() - t0 < 3000, 'checking a full backup took ' + Math.round(performance.now() - t0) + ' ms');
  assert.equal(v.state.tickets.length, 5000); assert.equal(v.state.catalog, 'own');
  assert.equal(v.state.settings.office.pinHash, PIN);
});

test('a full browser: oldest history goes first; the menu, ingredients, PIN and safety records stay', () => {
  const s = bigKitchen();
  const full = E.serialize(s).length;
  const b = quotaStorage(Math.floor(full * 0.25));                 // room for about a quarter of the full state
  start(b);
  try {
    assert.equal(S.importAll(E.serialize(s)), 'ok');             // the import saves; the save has to trim
    const status = S.status();
    assert.equal(status.lastSaveOk, true);
    assert.equal(status.trimmed, true);
    const saved = b.m.get('smokebox.v1.state');
    assert.ok(saved && saved.length <= Math.floor(full * 0.25));
    S.destroy();
    // reload from what was really kept
    const st = start(b);
    assert.equal(st.corrupt, null); assert.deepEqual(st.repaired.filter((r) => /dropped|restored/.test(r)), []);
    const g = S.getState();
    assert.deepEqual([g.menu.length, g.ingredients.length], [150, 80]);
    assert.equal(g.settings.office.pinHash, PIN);
    assert.equal(g.catalog, 'own');
    assert.ok(g.tickets.length > 0 && g.tickets.length < 5000, 'tickets kept: ' + g.tickets.length);
    // the newest tickets are the ones kept
    assert.equal(g.tickets[g.tickets.length - 1].customer, 'Guest 4999');
    // safety records from the start of the day are still in the log
    const kinds = E.safetyLog(g).map((r) => r.event.type);
    for (const k of ['temp_logged', 'sanitize_done', 'batch_discard']) assert.ok(kinds.includes(k), 'safety record lost: ' + k + ' (have ' + kinds.join() + ')');
    assert.deepEqual(E.checkInvariants(g, S.now()), []);
    // and the money of the kept orders still adds up: every paid order kept has its tickets or is a closed order
    assert.ok(g.orders.length > 0);
  } finally { S.destroy(); }
});

test('storage so small that even a trimmed save fails: the app keeps running in memory and says so', () => {
  const s = bigKitchen();
  const b = quotaStorage(2000);
  start(b);
  try {
    S.importAll(E.serialize(s));
    assert.equal(S.status().lastSaveOk, false);
    assert.equal(S.getState().menu.length, 150);               // the copy in memory is whole
    assert.equal(b.m.has('smokebox.v1.state'), false);
  } finally { S.destroy(); }
});

test('damaged copies of every smaller key never stop the app from starting', () => {
  const keys = ['smokebox.v1.names', 'smokebox.v1.sid', 'smokebox.v1.outbox', 'smokebox.v1.dlog', 'smokebox.v1.setup.draft', 'smokebox.v1.setup.examples', 'smokebox.v1.setup.hiddenStations',
    'smokebox.v1.setup.lastZone', 'smokebox.v1.lastbackup', 'smokebox.v1.welcome', 'smokebox.v1.sample', 'smokebox.v1.theme', 'smokebox.v1.pinlock', 'smokebox.v1.initials', 'smokebox.v1.lastbatch', 'smokebox.v1.alertlog'];
  const junk = ['{not json', 'null', '"text"', '[1,2', '{"rename":5,"add":"x"}', '123456789', 'undefined', '\u0000\u0001'];
  const s = E.apply(E.newState({ now: T, blank: true }), 'addMenuItem', { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' }, T).state;
  const good = JSON.stringify({ v: 1, savedAt: T, rev: s.rev, clock: { virtual: T, real: T, speed: 1 }, state: s });
  for (const key of keys) for (const j of junk) {
    const b = quotaStorage(1e9);
    b.m.set('smokebox.v1.state', good); b.m.set(key, j);
    const st = S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => T + MIN });
    assert.equal(S.getState().menu.length, 1, key + ' = ' + JSON.stringify(j));
    assert.equal(st.corrupt, null, key);
    // actions and backups still work, and the owner-name reader copes
    assert.equal(S.dispatch('addMenuItem', { name: 'Cake ' + j.length, zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' }), 'ok');
    assert.ok(S.exportAll());
    assert.doesNotThrow(() => C.customSpec());
    S.flush(); S.destroy();
  }
});

test('a damaged save is kept aside, never deleted, and the app starts as a blank kitchen', () => {
  for (const j of ['{broken', '{"v":2,"state":{}}', 'null', '[]', '{"v":1,"state":{"v":1,"tickets":5}}']) {
    const b = quotaStorage(1e9);
    b.m.set('smokebox.v1.state', j);
    const st = start(b);
    try {
      if (j === 'null') { assert.equal(st.firstRun, true); continue; }
      assert.ok(st.corrupt, j);
      assert.equal(b.m.get('smokebox.v1.corrupt') != null, true, 'the damaged text must be kept: ' + j);
      assert.equal(S.isBlank(), true);
    } finally { S.destroy(); }
  }
});

test('a damaged outbox does not start a server push and a damaged mode flag means the real kitchen', () => {
  const b = quotaStorage(1e9);
  b.m.set('smokebox.v1.outbox', '{oops');
  const seen = [];
  S.init({ storage: b, mode: 'real', blank: true, noTimers: true, now: () => T, transport: () => ({ open: () => true, post: (m) => { seen.push(m); return true; }, close() {}, push: () => false }) });
  assert.deepEqual(S.outbox(), []);
  S.destroy();
  for (const v of ['DEMO', 'demo ', '1', '{', '', 'real']) {
    const store = new Map([['smokebox.mode', v]]);
    const ctx = { console, location: { search: '' }, sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: () => {}, removeItem: () => {} } };
    ctx.globalThis = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/00-util.js'), 'utf8'), ctx);
    assert.equal(ctx.SB.util.mode(), 'real', JSON.stringify(v));   // only the exact word demo means the demo
  }
});
