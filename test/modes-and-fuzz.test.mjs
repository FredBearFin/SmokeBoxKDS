// Mode and module switching, interleaved random actions on blank kitchens, and mutation checks for the clean-start rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadSB, ROOT } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '13-menu-import', '20-engine', '25-deadlines', '30-store']);
const { store: S, engine: E, config: C, menuImport: MI } = SB;
const T0 = 1780326000000;
const MIN = 60e3;
// SB_FUZZ_MULT=3 runs three times as many random sequences (a release check); the default keeps the suite quick.
const MULT = Number(process.env.SB_FUZZ_MULT) || 1;
// SB_FUZZ_BASE moves every seed, so a second run covers different sequences.
const BASE = Number(process.env.SB_FUZZ_BASE) || 0;
// A small seeded random generator (mulberry32) so a failure can be replayed from its seed.
function rng(seed) { let a = seed >>> 0; return { next() { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } }; }
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((y) => [y, v[y]])) : v));
// The state without the revision, undo stack and derived availability; batches are sorted by id because a backup check lists them by age.
const body = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.rev; delete c.undo; delete c.avail; c.batches.sort((a, b) => (a.id < b.id ? -1 : 1)); return canon(c); };
function backend(entries) {
  const m = new Map(Object.entries(entries || {})), writes = [];
  return { m, writes, persistent: true, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => { writes.push(k); m.set(k, JSON.stringify(v)); return true; }, remove: (k) => { m.delete(k); }, keys: (p) => Array.from(m.keys()).filter((k) => k.indexOf(p) === 0) };
}

/* ------------------------------ interleaved random actions on engine states ------------------------------ */

// Picks and builds one random action for the state; some payloads are junk on purpose.
function genAction(r, s, t) {
  const pick = (a) => (a.length ? a[Math.floor(r.next() * a.length)] : undefined);
  const dishes = s.menu.filter((m) => !m.archived), any = pick(s.menu), ing = pick(s.ingredients), tk = pick(s.tickets.filter((x) => x.status === 'active')), od = pick(s.orders || []);
  const junk = r.next() < 0.12;
  const kinds = ['addMenuItem', 'addMenuItem', 'addIngredient', 'setPortions', 'setPortions', 'moveMenuItem', 'recipe', 'restock', 'createTicket', 'createTicket', 'createTicket', 'work', 'work', 'bump', 'pay', 'closeDay', 'resetLive', 'modules', 'toggle86', 'undo', 'import', 'archive', 'price', 'batch', 'demoTicket', 'clearDemo', 'counter', 'chips', 'currency'];
  const k = pick(kinds);
  const J = (v) => (junk ? pick([undefined, null, NaN, -1, 'x', {}, [], 1e9, '__proto__']) : v);
  switch (k) {
    case 'addMenuItem': return ['addMenuItem', { name: J('Dish ' + Math.floor(r.next() * 25)), zone: J(pick(['pit', 'sides', 'fry', 'cold'])), cat: J(pick(['meat', 'side', 'cold', 'fried'])), price: J(pick([0, 4, 9.5, 14])), prepSec: J(pick([30, 120, 400])), track: J(pick(['one', 'two'])), prepGuess: r.next() < 0.3 }];
    case 'addIngredient': return ['addIngredient', { name: J('Stuff ' + Math.floor(r.next() * 15)), unit: J(pick(['g', 'ea'])), costPerKg: pick([undefined, 3]), costEach: undefined, thresholdG: pick([0, 50]) }];
    case 'setPortions': return ['setPortions', { menuId: J((pick(s.menu.filter((m) => !m.bom.length || m.bom.some((l) => /^p_/.test(l.ing)))) || {}).id), on: r.next() < 0.75, count: J(pick([0, 3, 10, undefined])) }];
    case 'moveMenuItem': return ['moveMenuItem', { id: J((any || {}).id), toIndex: J(Math.floor(r.next() * (s.menu.length + 1))) }];
    case 'recipe': return ['updateMenuItem', { id: J((any || {}).id), patch: { bom: ing ? [{ ing: ing.id, qty: pick([1, 50, 200]) }] : [] } }];
    case 'restock': return ['restock', { ing: J((ing || {}).id), g: J(pick([1, 20, 500])) }];
    case 'createTicket': return ['createTicket', { customer: 'c', channel: 'dine_in', items: dishes.length ? [{ menuId: J(pick(dishes).id), qty: J(pick([1, 2])) }] : [] }];
    case 'work': { if (!tk) return ['undo', {}]; const it = pick(tk.items.filter((x) => x.status !== 'done')); return [pick(['advanceItem', 'completeItem', 'completeItem']), { ticketId: J(tk.id), itemId: J((it || tk.items[0]).id) }]; }
    case 'bump': return ['bumpTicket', { ticketId: J((tk || {}).id) }];
    case 'pay': return ['payOrder', { orderId: J((od || {}).id), method: pick(['cash', 'card']), tip: 0, discount: 0 }];
    case 'closeDay': return ['closeDay', { leftovers: pick(['keep', 'discard']) }];
    case 'resetLive': return ['resetLive', { keepSettings: r.next() < 0.6, starter: r.next() < 0.5, stagger: r.next() < 0.3, catalog: pick([undefined, undefined, 'blank', 'sample']), replaceOwn: r.next() < 0.5 }];
    case 'modules': return ['updateSettings', { patch: { modules: { cookAhead: r.next() < 0.5 } } }];
    case 'toggle86': return ['toggle86', { menuId: J((any || {}).id), on: r.next() < 0.5 }];
    case 'undo': return ['undo', {}];
    case 'import': {
      const text = pick(['Soup 5\nSalad, 7.5, cold\nCake - $4\n', 'Name,Price\nWrap,8\nWrap,9\nBad,x\n', 'Pie 4\n'.repeat(3), '']);
      const out = MI.toActions(MI.parse(text, { existing: s.menu }).rows, s.menu).actions;
      return out.length ? [out[0].type, out[0].payload] : ['addMenuItem', {}];
    }
    case 'demoTicket': return ['createTicket', { customer: 'demo', channel: 'dine_in', items: dishes.length ? [{ menuId: pick(dishes).id, qty: 1 }] : [], src: pick(['demo', 'sample']) }];
    case 'clearDemo': return ['clearDemoTickets', {}];
    case 'counter': return ['updateSettings', { patch: { service: { counter: r.next() < 0.6 } } }];
    case 'chips': return ['setChips', { chips: J(pick([['Counter', 'Pickup'], [], null, ['Phone', 'Delivery', 'Table 1'], ['a', 'a']])) }];
    case 'currency': return ['updateSettings', { patch: { ui: { currency: J(pick(['$', '€', '£', 'KSh', 'toolong', ''])) } } }];
    case 'archive': return ['updateMenuItem', { id: J((any || {}).id), patch: { archived: r.next() < 0.5 } }];
    case 'price': return ['updateMenuItem', { id: J((any || {}).id), patch: { price: pick([0, 5, 12.25, 5000]) } }];
    default: return ['addBatch', { ing: (s.ingredients.find((i) => i.tcs) || {}).id, tempF: 160, cookedG: 2000 }];
  }
}

// Runs one random sequence from a start state, checking after every step; returns the list of problems found.
function runSeq(seed, startKind, steps) {
  const r = rng(seed);
  let s = startKind === 'legacy' ? E.newState({ now: T0, starter: true }) : startKind === 'sample' ? E.newState({ now: T0, starter: true, stagger: true }) : E.newState({ now: T0, blank: true });
  let t = T0;
  const bad = [];
  const tag = 'seed ' + seed + ' ' + startKind;
  for (let i = 0; i < steps; i++) {
    t += Math.floor(r.next() * 4) * MIN + 1000;
    s = E.tick(s, t).state;
    const [type, payload] = genAction(r, s, t);
    let res;
    try { res = E.apply(s, type, payload, t); } catch (e) { bad.push(tag + ' step ' + i + ' ' + type + ' THREW ' + e.message); break; }
    if (res.report !== 'ok' && res.state !== s) bad.push(tag + ' step ' + i + ' ' + type + ' refused (' + res.report + ') but changed the state');
    if (res.report === 'ok') s = res.state;
    const inv = E.checkInvariants(s, t);
    if (inv.length) { bad.push(tag + ' step ' + i + ' after ' + type + ': ' + inv[0]); break; }
    // every 7th step the whole state must survive a backup round trip unchanged
    if (i % 7 === 6) {
      const v = E.validateBackup(E.serialize(s));
      if (!v.ok) { bad.push(tag + ' step ' + i + ' backup refused: ' + v.error); break; }
      if (v.repaired.length) { bad.push(tag + ' step ' + i + ' backup repaired: ' + v.repaired[0]); break; }
      if (body(v.state) !== body(s)) { bad.push(tag + ' step ' + i + ' backup round trip changed: ' + diffKeys(v.state, s)); break; }
      if ((v.state.catalog === 'own') !== (s.catalog === 'own')) { bad.push(tag + ' step ' + i + ' lost the own-catalog marker'); break; }
    }
    // a kitchen that began empty never shows sample dishes unless resetLive loaded the sample
    if (s.catalog === 'own' && s.menu.some((m) => hasOwnProp(C.menuById, m.id))) { bad.push(tag + ' step ' + i + ' sample dish in an own kitchen'); break; }
  }
  return bad;
}
// Names the parts of two states that differ, for a readable failure.
const diffKeys = (a, b) => { const A = JSON.parse(JSON.stringify(a)), B = JSON.parse(JSON.stringify(b)); return Object.keys(Object.assign({}, A, B)).filter((k) => k !== 'rev' && k !== 'undo' && k !== 'avail' && canon(k === 'batches' ? A[k].slice().sort((x, y) => (x.id < y.id ? -1 : 1)) : A[k]) !== canon(k === 'batches' ? B[k].slice().sort((x, y) => (x.id < y.id ? -1 : 1)) : B[k])).join(','); };
const hasOwnProp = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

test('interleaved random actions keep every invariant (blank, legacy and sample starts)', () => {
  const bad = [];
  for (let seed = 1; seed <= 120 * MULT; seed++) for (const kind of ['blank', 'legacy', 'sample']) bad.push(...runSeq(BASE + seed * 7919 + kind.length, kind, 90));
  assert.deepEqual(bad, []);
});

test('a longer family of seeds on blank kitchens', () => {
  const bad = [];
  for (let seed = 1; seed <= 25 * MULT; seed++) bad.push(...runSeq(BASE + 900000 + seed, 'blank', 300));
  assert.deepEqual(bad, []);
});

/* ------------------------------ switching catalogs and modules with data present ------------------------------ */

test('resetLive catalog rules across every start and option', () => {
  const dish = { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' };
  const starts = {
    legacy: () => E.newState({ now: T0, starter: true }),
    blankEmpty: () => E.newState({ now: T0, blank: true }),
    ownWithDish: () => E.apply(E.newState({ now: T0, blank: true }), 'addMenuItem', dish, T0).state,
    sample: () => E.newState({ now: T0, starter: true, stagger: true }),
  };
  for (const [name, mk] of Object.entries(starts)) for (const catalog of [undefined, 'blank', 'sample']) for (const keep of [true, false]) for (const replaceOwn of [false, true]) {
    const s = mk();
    const r = E.apply(s, 'resetLive', { keepSettings: keep, catalog, replaceOwn, starter: catalog === 'sample' }, T0 + 1000);
    const label = [name, catalog, 'keep=' + keep, 'replace=' + replaceOwn].join(' ');
    const own = s.catalog === 'own', hasData = s.menu.length > 0;
    if (catalog === 'sample' && own && hasData && !replaceOwn) { assert.equal(r.report, 'badPatch', label); assert.equal(r.state, s, label); continue; }
    assert.equal(r.report, 'ok', label);
    const n = r.state;
    assert.deepEqual(E.checkInvariants(n, T0 + 1000), [], label);
    const wantOwn = catalog === 'blank' || (catalog === undefined && own);
    assert.equal(n.catalog === 'own', wantOwn, label);
    if (catalog === 'sample') assert.deepEqual([n.menu.length, n.ingredients.length], [21, 15], label);
    if (catalog === 'blank') assert.deepEqual([n.menu.length, n.ingredients.length], [0, 0], label);
    if (catalog === undefined) assert.equal(n.menu.length, keep ? s.menu.length : (own ? 0 : 21), label);
    assert.deepEqual([n.tickets.length, n.batches.length > 0 && catalog !== 'sample' && !own ? 'ok' : 'ok'], [0, 'ok'], label);
    // the sample always comes with cook-ahead on (modules absent), and a blank restart keeps the owner's setting
    if (catalog === 'sample') assert.equal(E.moduleOn(n, 'cookAhead'), name === 'sample' || name === 'legacy' ? E.moduleOn(s, 'cookAhead') : true, label);
    if (catalog === 'blank') assert.equal(E.moduleOn(n, 'cookAhead'), E.moduleOn(s, 'cookAhead'), label);
    const v = E.validateBackup(E.serialize(n));
    assert.deepEqual(v.repaired, [], label);
  }
});

test('turning cook-ahead off and on with food in the cabinet loses nothing and never silences a batch', () => {
  let s = E.newState({ now: T0, starter: true });
  const before = SB.deadlines.build(s, T0 + 3 * 3600e3).length;
  assert.ok(before > 0);
  const off = E.apply(s, 'updateSettings', { patch: { modules: { cookAhead: false } } }, T0).state;
  assert.equal(SB.deadlines.build(off, T0 + 3 * 3600e3).length, before);                 // food is in the cabinet: still warned
  assert.equal(E.apply(off, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 500 }, T0).report, 'moduleOff');
  assert.equal(E.apply(off, 'logTemp', { batchId: off.batches[0].id, tempF: 150 }, T0 + MIN).report, 'ok'); // existing batches keep working
  const back = E.apply(off, 'updateSettings', { patch: { modules: { cookAhead: true } } }, T0 + 2 * MIN).state;
  assert.equal(E.apply(back, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 500 }, T0 + 3 * MIN).report, 'ok');
  assert.deepEqual(E.checkInvariants(back, T0 + 3 * MIN), []);
  // all batches thrown out and the module off: the feed goes quiet
  let q = off;
  for (const b of q.batches) q = E.apply(q, 'discardBatch', { batchId: b.id, reason: 'other' }, T0 + 5 * MIN).state;
  assert.equal(E.cookAheadActive(q), false);
  assert.equal(SB.deadlines.build(q, T0 + 6 * 3600e3).filter((x) => x.kind !== 'late').length, 0);
});

test('a real kitchen full of orders is untouched by a demo session, and a backup restore inside the demo is refused', () => {
  const b = backend();
  S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => T0 });
  S.dispatch('addMenuItem', { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' });
  for (let i = 0; i < 30; i++) S.dispatch('createTicket', { customer: 'c' + i, channel: 'dine_in', items: [{ menuId: 'pie', qty: 1 }] });
  S.flush();
  const realText = S.exportAll(), realBody = body(S.getState());
  const keysBefore = new Map(b.m);
  S.destroy();
  const sess = new Map();
  const old = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: (k) => (sess.has(k) ? sess.get(k) : null), setItem: (k, v) => sess.set(k, String(v)), removeItem: (k) => sess.delete(k) };
  try {
    S.init({ storage: b, mode: 'demo', blank: true, noTimers: true, noSync: true, now: () => T0 });
    S.dispatch('createTicket', { customer: 'demo', channel: 'dine_in', items: [{ menuId: 'tea', qty: 1 }] });
    S.flush();
    assert.equal(S.importAll(realText), 'wrongBackupMode');                        // a restore in the middle of an open demo
    assert.equal(S.getState().tickets.some((t) => t.customer === 'demo'), true);
    for (const [k, v] of keysBefore) assert.equal(b.m.get(k), v, 'real key changed in the demo: ' + k);
    S.leaveDemo();
    assert.deepEqual(b.keys('smokebox.demo.'), []);
    S.destroy();
  } finally { if (old === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = old; }
  S.init({ storage: b, mode: 'real', blank: true, noTimers: true, noSync: true, now: () => T0 });
  assert.equal(body(S.getState()), realBody);
  S.destroy();
});

/* ------------------------------ mutation checks ------------------------------ */

const SRC = { util: fs.readFileSync(path.join(ROOT, 'src/js/00-util.js'), 'utf8'), config: fs.readFileSync(path.join(ROOT, 'src/js/10-config.js'), 'utf8'), engine: fs.readFileSync(path.join(ROOT, 'src/js/20-engine.js'), 'utf8') };
// Loads a copy of the engine with one rule broken, in its own context.
function loadEngine(mutations) {
  let src = SRC.engine;
  for (const [from, to] of mutations) { assert.equal(src.split(from).length - 1, 1, 'mutation target must occur once: ' + from); src = src.replace(from, () => to); }
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(SRC.util, ctx); vm.runInContext(SRC.config, ctx); vm.runInContext(src, ctx);
  return ctx.SB.engine;
}
// Scenarios that must be clean on the real engine; each returns a list of violations.
function scenarios(Eng) {
  const bad = [];
  const ok = (r) => (r.report === 'ok' ? r.state : null);
  const mk = (s, n) => ok(Eng.apply(s, 'addMenuItem', { name: n, zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' }, T0));
  // the last portion on hand can be sold
  let s = Eng.apply(Eng.newState({ now: T0, blank: true }), 'addMenuItem', { name: 'Pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' }, T0).state;
  s = ok(Eng.apply(s, 'setPortions', { menuId: 'pie', on: true, count: 1 }, T0));
  if (!s || s.avail.pie.ok !== true) bad.push('PORTIONS the only portion on hand is not sellable');
  // a blank save does not get the sample back
  const v = Eng.validateBackup(Eng.serialize(mk(Eng.newState({ now: T0, blank: true }), 'Cake')));
  if (!v.ok || v.state.menu.length !== 1 || v.state.ingredients.length !== 0 || v.repaired.length) bad.push('BLANK a blank save was topped up with the sample');
  // a dish with no recipe records no cost
  let c = mk(Eng.newState({ now: T0, blank: true }), 'Soup');
  c = ok(Eng.apply(c, 'createTicket', { customer: 'a', channel: 'dine_in', items: [{ menuId: 'soup', qty: 1 }] }, T0 + 1000));
  c = Eng.tick(c, T0 + 100e3).state;
  c = ok(Eng.apply(c, 'completeItem', { ticketId: c.tickets[0].id, itemId: c.tickets[0].items[0].id }, T0 + 101e3));
  if (!c || 'cost' in c.tickets[0].items[0]) bad.push('COST a dish with no recipe recorded a cost');
  // batches cannot start while cook-ahead is off
  const offK = Eng.apply(Eng.newState({ now: T0, blank: true }), 'updateSettings', { patch: { modules: { cookAhead: false } } }, T0).state;
  const r = Eng.apply(offK, 'addBatch', { ing: 'brisket', tempF: 160, cookedG: 100 }, T0);
  if (r.report !== 'moduleOff') bad.push('MODULE a batch was started with cook-ahead off (' + r.report + ')');
  // a recipe line cannot point at a missing ingredient (invariant B1 sees it)
  const broken = JSON.parse(JSON.stringify(Eng.newState({ now: T0, blank: true })));
  broken.menu.push({ id: 'x', name: 'X', short: 'X', zone: 'pit', cat: 'meat', price: 1, prepSec: 60, track: 'one', bom: [{ ing: 'ghost', qty: 1 }], prepConfirmed: true, archived: false });
  if (!Eng.checkInvariants(broken, T0).some((m) => /^B1/.test(m))) bad.push('B1 a recipe naming a missing ingredient was not reported');
  // a reorder undoes
  let o = mk(mk(Eng.newState({ now: T0, blank: true }), 'A'), 'B');
  const mv = ok(Eng.apply(o, 'moveMenuItem', { id: 'b', toIndex: 0 }, T0));
  const un = mv && ok(Eng.apply(mv, 'undo', {}, T0 + 1000));
  if (!un || un.menu.map((m) => m.id).join() !== 'a,b') bad.push('MOVE undo did not restore the order');
  return bad;
}

test('the scenarios are clean on the real engine', () => assert.deepEqual(scenarios(E), []));

test('each broken rule turns a scenario red (mutation checks)', () => {
  const muts = [
    ['PORTIONS', [["ing.exact === true ? have < ln.qty : have - ln.qty <= 0 || have <= (ing.thresholdG || 0)", "have - ln.qty <= 0 || have <= (ing.thresholdG || 0)"]]],
    ['BLANK', [["      if (!own) for (const base of C.menu) if (!seenMenu.has(base.id))", "      for (const base of C.menu) if (!seenMenu.has(base.id))"]]],
    ['COST', [["cost: priced > 0 && unpriced === 0 ? round(cost, 4) : null, shortG", "cost: round(cost, 4), shortG"]]],
    ['MODULE', [["    if (!moduleOn(tx.state(), 'cookAhead')) return 'moduleOff';\n    const ing = typeof p.ing === 'string' ? ingMap(tx.get('ingredients')).get(p.ing) : undefined;\n    if (!ing || !ing.tcs) return 'unknownIng';\n    if (!isNum(p.tempF)", "    const ing = typeof p.ing === 'string' ? ingMap(tx.get('ingredients')).get(p.ing) : undefined;\n    if (!ing || !ing.tcs) return 'unknownIng';\n    if (!isNum(p.tempF)"]]],
    ['B1', [["for (const ln of Array.isArray(mi.bom) ? mi.bom : []) if (!ids.has(ln.ing)) add('B1 '", "for (const ln of Array.isArray(mi.bom) ? mi.bom : []) if (false) add('B1 '"]]],
    ['MOVE', [["    const [mi] = w.splice(d.to, 1);\n    w.splice(d.from, 0, mi);", "    const [mi] = w.splice(d.to, 1);\n    w.splice(d.to, 0, mi);"]]],
  ];
  for (const [tag, m] of muts) {
    const bad = scenarios(loadEngine(m));
    assert.ok(bad.some((x) => x.startsWith(tag)), tag + ' mutant survived: ' + JSON.stringify(bad));
  }
});
