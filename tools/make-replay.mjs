#!/usr/bin/env node
// WHAT THIS FILE IS: Records random kitchens for the server's identical-replay check. Each kitchen is a list of steps (an action
//    or a clock tick) run through the JavaScript engine in Node, with the saved state at the end. The Rust server replays the same
//    steps through its own copy of the engine and must end with exactly the same saved state, byte for byte.
//    Run: node tools/make-replay.mjs [kitchens] [steps] > server-rs/tests/replay.jsonl
// PARTS: a seeded random number source, one random step, one kitchen, the command line.
// USES: test/_load.mjs (the engine and the Rust planner). USED BY: server-rs/tests/replay.rs.
import { loadSB } from '../test/_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;
const T0 = Date.UTC(2026, 9, 24, 15, 0, 0);
const MIN = 60e3;

// A small seeded random source, so the same seed always records the same kitchen.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Picks one random action for the state. Payloads stay JSON-safe (the server receives JSON), and some are refused on purpose.
function genAction(r, s) {
  const pick = (a) => (a.length ? a[Math.floor(r() * a.length)] : undefined);
  const dishes = s.menu.filter((m) => !m.archived), any = pick(s.menu), tk = pick(s.tickets.filter((x) => x.status === 'active'));
  const k = pick(['addMenuItem', 'addMenuItem', 'createTicket', 'createTicket', 'createTicket', 'createTicket', 'work', 'work', 'work', 'bump', 'capacity', 'perSlot', 'undo', 'toggle86', 'price', 'void', 'batch', 'modules']);
  switch (k) {
    case 'addMenuItem': return ['addMenuItem', { name: 'Dish ' + Math.floor(r() * 30), zone: pick(['pit', 'sides', 'fry', 'cold']), cat: pick(['meat', 'side', 'cold', 'fried']), price: pick([0, 4, 9.5, 14]), prepSec: pick([30, 120, 300, 420]), track: pick(['one', 'two']) }];
    case 'createTicket': return ['createTicket', { customer: 'c', channel: pick(['dine_in', 'takeout']), rush: r() < 0.1, items: dishes.length ? Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ menuId: pick(dishes).id, qty: pick([1, 1, 2]) })) : [] }];
    case 'work': { if (!tk) return ['undo', {}]; const it = pick(tk.items.filter((x) => x.status !== 'done')) || tk.items[0]; return [pick(['advanceItem', 'completeItem']), { ticketId: tk.id, itemId: it.id }]; }
    case 'bump': return ['bumpTicket', { ticketId: (tk || {}).id || 'none' }];
    case 'capacity': return ['updateSettings', { patch: { capacity: r() < 0.3 ? {} : { fry: pick([1, 2, 3]), pit: pick([0, 2, 4]) } } }];
    case 'perSlot': return any ? ['updateMenuItem', { id: any.id, patch: { perSlot: pick([1, 2, 4]) } }] : ['undo', {}];
    case 'toggle86': return ['toggle86', { menuId: (any || {}).id || 'none', on: r() < 0.5 }];
    case 'price': return any ? ['updateMenuItem', { id: any.id, patch: { price: pick([0, 5, 12.25]) } }] : ['undo', {}];
    case 'void': return ['voidTicket', { ticketId: (tk || {}).id || 'none', reason: 'Test' }];
    case 'modules': return ['updateSettings', { patch: { modules: { cookAhead: r() < 0.7 } } }];
    case 'batch': return ['addBatch', { ing: (s.ingredients.find((i) => i.tcs) || {}).id || 'none', tempF: 160, cookedG: 2000 }];
    default: return ['undo', {}];
  }
}

// Records one kitchen: its start, its steps and its final saved state.
function kitchen(seed, steps) {
  const r = rng(seed);
  const start = { now: T0, blank: r() < 0.5, starter: false };
  if (!start.blank) { start.starter = true; start.stagger = true; }
  let s = E.newState(start), t = T0;
  const out = [];
  for (let i = 0; i < steps; i++) {
    t += Math.floor(r() * 3) * MIN + 1000 + Math.floor(r() * 5000);
    if (r() < 0.3) { s = E.tick(s, t).state; out.push({ tick: t }); continue; }
    const [type, payload] = genAction(r, s);
    const res = E.apply(s, type, payload, t);
    s = res.state;
    out.push({ type, payload, now: t, report: res.report });
  }
  return { seed, start, steps: out, final: E.serialize(s) };
}

const n = Number(process.argv[2]) || 2000, steps = Number(process.argv[3]) || 60;
for (let i = 1; i <= n; i++) process.stdout.write(JSON.stringify(kitchen(i, steps)) + '\n');
