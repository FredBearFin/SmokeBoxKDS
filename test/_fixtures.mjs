// Fixture builders for hand-computable analytics tests (reusable by other test files).
//
//   import { ticket, item, event, batch, dataset, quick, at, BASE, local } from './_fixtures.mjs';
//
// Every time argument is in SECONDS relative to BASE (Friday 2026-10-16, 12:00:00 local time), so expected values can be worked out by hand.
// Pass an absolute ms value with the "...At" spelling (createdAt, firedAt, startedAt, doneAt, expeditedAt, t) when you need a specific wall-clock time.
// Importing this file loads SB.util and SB.config into globalThis.SB (no DOM needed).
import { loadSB } from './_load.mjs';

await loadSB(['00-util', '10-config']);
const SB = globalThis.SB;

/** Friday 2026-10-16 12:00:00 local. Service date '2026-10-16'. No DST change anywhere near this date in the US or EU. */
export const BASE = new Date(2026, 9, 16, 12, 0, 0, 0).getTime();
export const DAY = '2026-10-16';
/** Epoch ms for `sec` seconds after BASE. */
export const at = (sec) => BASE + Math.round(sec * 1000);
/** Epoch ms for a local wall-clock time (month is 1-12). */
export const local = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s, 0).getTime();

let seq = 0;
// Copy only the defined keys (never `delete`, which would put every fixture object into slow dictionary mode and skew performance tests).
const strip = (o) => { const r = {}; for (const k of Object.keys(o)) if (o[k] !== undefined) r[k] = o[k]; return r; };

/**
 * item({menu:'brisket_half', fired, started, done, qty, price, cost, zone, override, depleted, prepSec})
 * fired/started/done are seconds after BASE. status is derived (done > cooking > displayed > queued) unless given.
 * A started time makes it a two-step item; leaving started out gives a one-step item with no startedAt.
 */
export function item(o = {}) {
  const menu = SB.config.menuById[o.menu || o.menuId || 'brisket_half'];
  const firedAt = o.firedAt ?? (o.fired !== undefined ? at(o.fired) : undefined);
  const startedAt = o.startedAt ?? (o.started !== undefined ? at(o.started) : undefined);
  const doneAt = o.doneAt ?? (o.done !== undefined ? at(o.done) : undefined);
  const status = o.status ?? (doneAt !== undefined ? 'done' : startedAt !== undefined ? 'cooking' : firedAt !== undefined ? 'displayed' : 'queued');
  return strip({
    id: o.id || 'i_' + ++seq, menuId: menu.id, name: o.name || menu.name, zone: o.zone || menu.zone, qty: o.qty ?? 1, mods: o.mods || [],
    track: o.track || (startedAt !== undefined ? 'two' : menu.track), price: o.price ?? menu.price, prepSec: o.prepSec ?? menu.prepSec,
    offsetSec: o.offsetSec ?? 0, fireAt: o.fireAt ?? firedAt, status, firedAt, startedAt, doneAt, override: o.override, depleted: o.depleted, cost: o.cost,
  });
}

/**
 * ticket({id, created, expedited, voided, channel, items:[item(...)], pacing, rush, forced, recalls, ...})
 * created/expedited/voided are seconds after BASE. status: voided > expedited > active unless given. serviceDate is derived with SB.util.
 */
export function ticket(o = {}) {
  const id = o.id || 't_' + ++seq;
  const createdAt = o.createdAt ?? at(o.created ?? 0);
  const expeditedAt = o.expeditedAt ?? (o.expedited !== undefined ? at(o.expedited) : undefined);
  const voidedAt = o.voidedAt ?? (o.voided !== undefined ? at(o.voided) : undefined);
  const status = o.status ?? (voidedAt !== undefined ? 'voided' : expeditedAt !== undefined ? 'expedited' : 'active');
  const items = (o.items || []).map((x, i) => { const it = Object.assign({}, x); if (!o.keepItemIds && /^i_\d+$/.test(it.id)) it.id = id + '.' + (i + 1); return it; });
  return strip({
    id, num: o.num ?? 100 + ++seq, serviceDate: SB.util.serviceDate(createdAt), customer: o.customer || 'Table 4', channel: o.channel || 'dine_in', createdAt,
    rush: !!o.rush, note: o.note || '', src: o.src || 'live', pacing: o.pacing ?? true, dmaxSec: o.dmaxSec ?? 0, status, expeditedAt, forced: o.forced, voidedAt,
    voidReason: o.voidReason ?? (status === 'voided' ? 'other' : undefined), recalls: o.recalls ?? 0, items,
  });
}

/** quick({created, total, channel, ...}): a one-item ticket that was fired at once and finished `total` seconds after `created`. Handy for percentile maths. */
export function quick(o = {}) {
  const created = o.created ?? 0, total = o.total ?? 300;
  return ticket(Object.assign({ expedited: created + total, items: [item({ menu: o.menu || 'brisket_qtr', fired: created, done: created + total, cost: o.cost, qty: o.qty })] }, o, { created, total: undefined }));
}

/** quickAt(createdAtMs, totalSec, {channel, menu, ...}): like quick() but anchored at an absolute wall-clock time (for midnight / service-day tests). */
export function quickAt(createdAt, totalSec = 300, o = {}) {
  const doneAt = createdAt + Math.round(totalSec * 1000);
  return ticket(Object.assign({ createdAt, expeditedAt: doneAt, items: [item({ menu: o.menu || 'slaw', firedAt: createdAt, doneAt })] }, o));
}

/** event({type, at (seconds after BASE) or t (ms), ...fields}) */
export function event(o = {}) {
  const { at: sec, t, ...rest } = o;
  return Object.assign({ id: 'e_' + ++seq, t: t ?? at(sec ?? 0) }, rest);
}

/** batch({id, ing, entered (seconds), cookedG, rawG, remainingG, discarded (seconds), wasteG, discardReason, ...}) */
export function batch(o = {}) {
  const enteredAt = o.enteredAt ?? at(o.entered ?? 0);
  const discardedAt = o.discardedAt ?? (o.discarded !== undefined ? at(o.discarded) : undefined);
  const cookedG = o.cookedG ?? 5000;
  return strip({
    id: o.id || 'b_' + ++seq, ing: o.ing || 'brisket', label: o.label || 'Brisket batch', kind: o.kind || 'hot', enteredAt, rawG: o.rawG, cookedG,
    remainingG: o.remainingG ?? (discardedAt !== undefined ? 0 : cookedG), yieldPct: o.yieldPct, costPerCookedKg: o.costPerCookedKg, src: o.src || 'cook',
    temps: o.temps || [], lastTempF: o.lastTempF, lastTempAt: o.lastTempAt, reheats: o.reheats ?? 0, status: o.status || 'ok', action: o.action || 'NONE',
    canServe: o.canServe ?? true, discardedAt, discardReason: o.discardReason, wasteG: o.wasteG, endpointC: o.endpointC, holdH: o.holdH,
  });
}

/** dataset({tickets, events, batches, learned, menu, ingredients, settings, range}) with starter config defaults. Range defaults to the data's own span. */
export function dataset(o = {}) {
  const tickets = o.tickets || [], events = o.events || [], batches = o.batches || [];
  const stamps = [];
  for (const t of tickets) stamps.push(t.createdAt);
  for (const e of events) stamps.push(e.t);
  for (const b of batches) stamps.push(b.enteredAt);
  const range = o.range || (stamps.length ? { from: Math.min(...stamps), to: Math.max(...stamps) + 1 } : { from: BASE, to: BASE + 1 });
  const C = SB.config;
  return {
    tickets, events, batches, orders: o.orders || [], learned: o.learned || {}, range,
    menu: o.menu || C.menu.map((m) => Object.assign({ prepConfirmed: false, archived: false }, m)),
    ingredients: o.ingredients || C.ingredients.map((i) => Object.assign({}, i)),
    settings: o.settings || { pacing: Object.assign({}, C.pacing), service: Object.assign({}, C.service), channels: [], syncTargetSec: C.syncTargetSec },
  };
}

/** Seconds helpers so tests read naturally: m(2) = 120 s, h(1) = 3600 s. */
export const m = (min) => min * 60;
export const h = (hr) => hr * 3600;
