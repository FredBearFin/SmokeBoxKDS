#!/usr/bin/env node
// WHAT THIS FILE IS: Makes the old-save fixtures in test/fixtures/old-saves/. For each old Smokebox version (a git
// checkout of that commit under /home/user/scratch-old-<sha>) it loads that version's own engine and store, runs a
// scripted session (orders, batches, a discard, settings, a PIN, a custom dish, custom station names, a discard log),
// and writes what that version really put in the browser storage plus its backup file.
// Run: git worktree add --detach /home/user/scratch-old-<sha> <sha>   then   node tools/make-old-saves.mjs
// PARTS: loading an old version, the session, writing the fixture. USES: the old checkouts. USED BY: nobody at run time.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test/fixtures/old-saves');
// [commit, label, variant]: 'starter' opens with the demo stock (how old builds first ran); 'empty' opens with an
// empty pit and the owner's own batches (how the build just before the clean start ran).
const VERSIONS = [
  ['168ed17', 'first handoff import (2026-10-18)', 'starter'],
  ['7a61a04', 'cabinet pulls, deadline feed, discard log, setup checklist', 'starter'],
  ['3ea89a3', 'pilot protocol, alert ladder', 'starter'],
  ['5e02d1e', 'far display mode and pilot', 'starter'],
  ['b8e569e', 'the build just before the clean-start work, opened with the demo stock', 'starter'],
  ['b8e569e', 'the build just before the clean-start work, empty pit and own batches', 'empty'],
];
const T0 = new Date(2026, 9, 17, 11, 0, 0).getTime();

// Loads the files of one old version into a fresh context with a Map-backed localStorage; returns { SB, ls }.
function loadVersion(dir) {
  const map = new Map();
  const ls = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), key: (i) => Array.from(map.keys())[i] || null, get length() { return map.size; } };
  const ctx = { console, localStorage: ls, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} }; // timers do nothing: the script saves by hand
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['00-util', '10-config', '20-engine', '30-store']) vm.runInContext(fs.readFileSync(path.join(dir, 'src/js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return { SB: ctx.SB, map };
}

// Runs the scripted session on one old version and returns the fixture record.
function session(sha, label, variant) {
  const dir = '/home/user/scratch-old-' + sha;
  const { SB, map } = loadVersion(dir);
  const S = SB.store, E = SB.engine, C = SB.config;
  let t = T0;
  const log = [];
  S.init({ noTimers: true, noSync: true, now: () => t, starter: variant === 'starter' });
  const d = (type, payload) => { let r; try { r = S.dispatch(type, payload); } catch (e) { r = 'threw ' + e.message; } log.push(type + ' -> ' + r); return r; };
  const state = () => S.getState();
  const advance = (ms) => { t += ms; S.tick(); };
  const has = (id) => state().menu.some((m) => m.id === id);
  if (variant === 'empty') {
    for (const [ing, f, raw] of [['brisket', 160, 12000], ['pork', 160, 9000], ['ribs', 160, 8000], ['mac', 160, 4000], ['slaw', 38, 3000], ['sausage', 160, 2000]]) d('addBatch', { ing, tempF: f, rawG: raw });
    advance(4 * 3600e3);
    for (const b of state().batches) d('logTemp', { batchId: b.id, tempF: b.kind === 'cold' ? 38 : 150 });
  }
  // Two tickets, worked through and bumped; a third left open.
  const mk = (customer, channel, items) => { d('createTicket', { customer, channel, items: items.filter((i) => has(i.menuId)) }); return state().tickets[state().tickets.length - 1]; };
  const t1 = mk('Dana', 'dine_in', [{ menuId: 'brisket_half', qty: 2 }, { menuId: 'mac', qty: 1 }]);
  advance(200e3);
  if (t1) for (const it of state().tickets.find((x) => x.id === t1.id).items) { d('advanceItem', { ticketId: t1.id, itemId: it.id }); advance(30e3); d('completeItem', { ticketId: t1.id, itemId: it.id }); }
  if (t1) d('bumpTicket', { ticketId: t1.id });
  const t2 = mk('Pickup 7', 'takeout', [{ menuId: 'pork_sand', qty: 1 }, { menuId: 'tea', qty: 2 }]);
  advance(200e3);
  if (t2) for (const it of state().tickets.find((x) => x.id === t2.id).items) { d('completeItem', { ticketId: t2.id, itemId: it.id }); advance(10e3); }
  if (t2) d('bumpTicket', { ticketId: t2.id });
  if (t1 && state().tickets.find((x) => x.id === t1.id).orderId) d('payOrder', { orderId: state().tickets.find((x) => x.id === t1.id).orderId, method: 'cash', tip: 2, discount: 0 });
  mk('Table 3', 'dine_in', [{ menuId: 'ribs_half', qty: 1 }, { menuId: 'slaw', qty: 1 }]);
  // Cabinet work: a new batch, a temperature reading, a discard.
  d('addBatch', { ing: 'brisket', tempF: 160, rawG: 8000, label: 'Brisket second pit' });
  advance(20 * 60e3);
  const nb = state().batches[state().batches.length - 1];
  if (nb) d('logTemp', { batchId: nb.id, tempF: 150 });
  const old = state().batches.find((b) => b.ing === 'sausage');
  if (old) d('discardBatch', { batchId: old.id, reason: 'manual' });
  d('toggle86', { menuId: 'ribs_full', on: true });
  // Settings, PIN, menu and ingredient edits, a custom dish.
  d('updateSettings', { patch: { service: { taxRatePct: 8, openHour: 10, closeHour: 22 } } });
  d('updateSettings', { patch: { office: { pinHash: 'sha256:' + 'ab12'.repeat(16) } } });
  d('updateMenuItem', { id: 'brisket_half', patch: { price: 15.25 } });
  d('updateIngredient', { id: 'brisket', patch: { costPerKg: 25.5 } });
  d('addMenuItem', { name: 'Chef special', zone: 'pit', cat: 'meat', price: 18, prepSec: 240, track: 'two' });
  d('closeDay', { leftovers: 'keep' });
  // Browser-side extras the screens keep: owner names, the discard log, a device setting.
  let spec = null;
  if (typeof C.applyCustom === 'function' && typeof C.saveCustom === 'function') { spec = { rename: { zones: { pit: 'Smoker' } }, add: { zones: [{ name: 'Bar' }] } }; C.applyCustom(spec); C.saveCustom(spec); }
  const wasted = state().batches.find((b) => b.status === 'discard');
  SB.util.storage.set('smokebox.v1.dlog', { cols: [], initials: wasted ? { [wasted.id]: 'JR' } : {}, extra: {}, savedAt: t });
  SB.util.storage.set('smokebox.v1.theme', 'night');
  S.flush();
  const s = state();
  const rec = {
    sha, label, variant, session: log,
    storage: Object.fromEntries(Array.from(map.entries())),
    backup: S.exportAll(),
    expect: {
      menu: s.menu.length, ingredients: s.ingredients.length, tickets: s.tickets.length, batches: s.batches.length, orders: (s.orders || []).length,
      taxRatePct: s.settings.service.taxRatePct, openHour: s.settings.service.openHour, pinHash: s.settings.office.pinHash,
      brisketHalfPrice: s.menu.find((m) => m.id === 'brisket_half').price, customDish: s.menu.some((m) => m.name === 'Chef special'),
      brisketCost: s.ingredients.find((i) => i.id === 'brisket').costPerKg, names: spec, rev: s.rev,
    },
  };
  S.destroy();
  return rec;
}

fs.mkdirSync(outDir, { recursive: true });
for (const [sha, label, variant] of VERSIONS) {
  const rec = session(sha, label, variant);
  fs.writeFileSync(path.join(outDir, sha + (variant === 'empty' ? '-empty' : '') + '.json'), JSON.stringify(rec, null, 1) + '\n');
  console.log(sha, label, JSON.stringify(rec.expect), rec.session.filter((x) => !/-> ok$/.test(x)).join(' | ').slice(0, 300));
}
