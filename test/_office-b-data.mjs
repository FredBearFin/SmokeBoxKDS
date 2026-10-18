// WHAT THIS FILE IS: Synthetic sample history for the Office B pages (Sales and money, Safety, Stock and 86).
// Used until (and alongside) the real simulator: it drives the REAL engine on a private state with a virtual clock, exactly like the soak test,
// but shaped so that every chart has something to say:
//   * brisket and pork sell out on some days (no re-cook), at different hours, so the sell-out clock has a story;
//   * one day a brisket batch drops below 135 F and is not reheated -> reheat lockout -> auto discard (safety 86 spell);
//   * a few temperature checks and sanitize rounds are late; leftovers at close are discarded;
//   * brisket batches are weighed (rawG + cookedG) with a realised yield a little above the Texas A&M model;
//   * refused order attempts are recorded as ui_report events (what the live screen would do);
//   * two menu items (sweet tea, hush puppies) carry no recorded cost, so "cost not recorded" is exercised.
//
//   import { makeDataset, thinDataset } from './_office-b-data.mjs';
//   const ds = await makeDataset({ days: 14 });        // { tickets, events, batches, learned, menu, ingredients, settings, range }
//
// Plain data (JSON-safe): tests inject it into the page with SB.store.attachSim({ sample: () => ds }).
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine, C = SB.config, U = SB.util;
const SEC = 1000, MIN = 60 * SEC, HR = 60 * MIN;
const TRUE_FACTOR = { mac: 1.3, mac_lg: 1.25, fried_pickles: 0.75, brisket_sand: 1.1, slaw: 1.4 };
const NO_COST = new Set(['tea', 'hushpuppies']);
// how often each item is ordered (a BBQ menu is skewed toward brisket, sides and tea; a full rack is rare)
const WEIGHT = { brisket_qtr: 8, brisket_half: 10, burnt_ends: 4, pork_qtr: 5, pork_half: 6, ribs_half: 4, ribs_full: 1, sausage: 3, turkey_half: 2, brisket_sand: 7, pork_sand: 5, mac: 9, mac_lg: 2, beans: 5, cornbread: 7, fried_pickles: 4, hushpuppies: 3, slaw: 8, potato: 5, pudding: 3, tea: 10 };
// cooked grams the kitchen plans per day for each hold-cabinet ingredient (about what a normal day uses, set from a measured run)
const DAILY = { brisket: 12500, pork: 7600, ribs: 8000, sausage: 1300, turkey: 1200, mac: 7500, beans: 3000, slaw: 3500, potato: 2800, pudding: 1800 };
// cook waves: [hour of day the batch lands in the cabinet, share of the day's plan]
const WAVES = [[10.25, 0.52], [13.5, 0.18], [16.5, 0.30]];

/** Which service date is "today" for a real clock: the last 14 days end yesterday. */
export function todayKey(nowMs = Date.now()) { return U.serviceDate(nowMs, C.service.dayStartHour); }

// Runs the real engine on a private state with a virtual clock and returns the dataset it produced.
export async function makeDataset(o = {}) {
  const days = o.days || 14, seed = o.seed || 20261017;
  const endKey = U.addDays(o.todayKey || todayKey(), -1);            // last sample day = yesterday
  const startKey = U.addDays(endKey, -(days - 1));
  const rng = U.rng(seed);
  const day0 = U.dateKeyToMs(startKey);
  let now = day0 + 10.5 * HR;
  let s = E.newState({ now, empty: true });
  // Applies one engine action at the virtual time; the state advances only when the engine says ok.
  const go = (type, p) => { const r = E.apply(s, type, p, now); if (r.report === 'ok') s = r.state; return r; };
  const plan = new Map(), bumpAt = new Map(), tempDue = new Map(), pendingCooks = [], lastCook = {};
  // Tickets per hour: a lunch peak near 12:30 and a dinner peak near 18:30.
  const rate = (h) => 6 + 26 * Math.exp(-((h - 12.5) ** 2) / 1.2) + 20 * Math.exp(-((h - 18.5) ** 2) / 1.5);
  const refusedAt = [];
  const seenBatches = new Map();                                       // the engine prunes old batches from state; keep the final version of every one
  // Keeps the latest version of every batch, because the engine prunes old ones from its state.
  const keepBatches = () => { for (const b of s.batches) seenBatches.set(b.id, b); };
  for (let d = 0; d < days; d++) {
    const dayStart = day0 + d * 24 * HR;
    const open = dayStart + 11 * HR, close = dayStart + 21 * HR;
    now = Math.max(now, open - 30 * MIN);
    s = E.tick(s, now).state;
    const busy = d % 7 === 5 ? 1.4 : d % 7 === 2 ? 0.6 : 1;
    // plan of the day: which proteins run short, which day has the cold-hold accident
    const brisketShort = d % 5 === 1 || d === 12;                    // no re-cook, small morning batch
    const porkShort = d === 6 || d === 10;
    const lowTempDay = d === 3;                                      // a lone brisket batch dips below 135 F and is not reheated
    const lateSanitizeDay = d === 8;
    pendingCooks.length = 0;
    // restock the non-hold items; every hold-cabinet ingredient gets its cook waves (scheduled landings in the cabinet)
    for (const ing of s.ingredients) {
      if (!ing.tcs) { const need = ing.parG - (s.stock[ing.id] || 0); if (need > 0) go('restock', { ing: ing.id, g: need }); continue; }
      const short = (ing.id === 'brisket' && brisketShort) || (ing.id === 'pork' && porkShort);
      const plan = (DAILY[ing.id] || ing.parG * 0.5) * (o.supply || 1) * (short ? 0.8 : lowTempDay && ing.id === 'brisket' ? 0.95 : 0.97);
      WAVES.forEach(([hour, share], k) => {
        if (lowTempDay && ing.id === 'brisket' && k === 1) return;       // the accident day: only the morning and evening batch exist, so the dip leaves no spare
        if (short && ing.id === 'brisket' && d === 12 && k >= 1) return;  // the early sell-out: lunch eats the only batch
        if (short && k === 2) return;                                    // sells out for the evening
        pendingCooks.push({ ing: ing.id, at: dayStart + hour * HR, g: Math.max(plan * share * (short && k === 0 ? 1.1 : 1) * rng.range(0.92, 1.08), ing.thresholdG * 3.2) });
      });
    }
    go('sanitizeDone', {});
    let nextSan = now + 3.6 * HR;
    let nextOrder = open + rng.range(0, 3) * MIN;
    let step = 0, dippedBatch = null;
    while (now < close + 5 * MIN) {
      now += 5 * SEC; step++;
      s = E.tick(s, now).state;
      while (now >= nextOrder && nextOrder < close) {
        const avail = s.menu.filter((m) => !m.archived && s.avail[m.id] && s.avail[m.id].ok);
        const out = s.menu.filter((m) => s.avail[m.id] && !s.avail[m.id].ok);
        const lines = [];
        const n = 1 + Math.floor(rng.next() * rng.next() * 5);
        for (let i = 0; i < n && avail.length; i++) lines.push({ menuId: rng.weighted(avail, (m) => WEIGHT[m.id] || 1).id, qty: rng.chance(0.85) ? 1 : 2 });
        if (out.length && rng.chance(0.4)) {                         // the counter tries an 86 item: refused (recorded like the live screen does)
          const r = go('createTicket', { items: lines.concat([{ menuId: rng.pick(out).id }]) });
          if (r.report === 'itemUnavailable') { go('uiReport', { action: 'createTicket', report: 'itemUnavailable' }); refusedAt.push(now); }
        }
        if (lines.length) {
          const r = go('createTicket', { customer: rng.pick(C.quickNames), channel: rng.weighted(C.channels, (c) => ({ dine_in: 38, takeout: 30, drive_thru: 20, third_party: 12 }[c.id])).id, items: lines, rush: rng.chance(0.03), src: 'sample', pacing: d >= 5 });
          if (r.report === 'ok' && rng.chance(0.012)) go('voidTicket', { ticketId: r.info.ticketId, reason: rng.pick(['wrong order', 'customer left']) });
        }
        const h = (nextOrder - dayStart) / HR;
        nextOrder += (-Math.log(1 - rng.next()) / (rate(h) * busy)) * HR;
      }
      for (const t of E.views.activeTickets(s)) {
        let allDone = true;
        for (const it of t.items) {
          if (it.status !== 'done') allDone = false;
          if (it.status === 'queued') continue;
          if (it.status === 'done') continue;
          let p = plan.get(it.id);
          if (!p) {
            const work = rng.logNormal(C.menuById[it.menuId].prepSec * (TRUE_FACTOR[it.menuId] || 1) * E.helpers.qtyScale(it.qty), 0.25) * SEC;
            const resp = rng.logNormal(15, 0.5) * SEC;
            p = it.track === 'two' ? { startAt: it.firedAt + resp, doneAt: it.firedAt + resp + work } : { doneAt: it.firedAt + resp + work };
            plan.set(it.id, p);
          }
          if (it.status === 'displayed' && p.startAt !== undefined && now >= p.startAt) go('advanceItem', { ticketId: t.id, itemId: it.id });
          else if (now >= p.doneAt) go('advanceItem', { ticketId: t.id, itemId: it.id });
        }
        if (allDone) {
          if (!bumpAt.has(t.id)) bumpAt.set(t.id, now + rng.range(10, 45) * SEC);
          else if (now >= bumpAt.get(t.id)) go('bumpTicket', { ticketId: t.id });
        } else if (now - t.createdAt > 25 * MIN) go('bumpTicket', { ticketId: t.id, force: true });
      }
      // hold cabinet checks
      for (const b of s.batches) {
        if (b.status === 'discard' || !(b.remainingG > 0) || b.kind === 'cooling') continue;
        if (!tempDue.has(b.id)) tempDue.set(b.id, now + 30 * MIN);
        if (now < tempDue.get(b.id)) continue;
        if (rng.chance(0.05)) { tempDue.set(b.id, now + 22 * MIN); continue; }   // missed check -> the next one is late
        const hot = b.kind === 'hot';
        // the accident: the lone brisket batch reads 128 F around 1:30 pm, and nobody reheats it
        if (lowTempDay && b.ing === 'brisket' && !dippedBatch && now > dayStart + 13.5 * HR) { dippedBatch = b.id; go('logTemp', { batchId: b.id, tempF: 128 }); tempDue.set(b.id, now + 28 * MIN); continue; }
        if (dippedBatch === b.id) { go('logTemp', { batchId: b.id, tempF: 126 }); tempDue.set(b.id, now + 28 * MIN); continue; }
        const low = rng.chance(0.03);
        const r = go('logTemp', { batchId: b.id, tempF: hot ? (low ? 131 : rng.range(145, 170)) : (low ? 44 : rng.range(35, 40)) });
        if (low && r.report === 'ok') go(hot ? 'reheatBatch' : 'logTemp', { batchId: b.id, tempF: hot ? 168 : 38 });
        tempDue.set(b.id, now + rng.range(24, 30) * MIN);
      }
      // cooks land in the cabinet at their wave time (or after a 40-70 minute re-cook when the cabinet runs low)
      for (const pc of pendingCooks.slice()) {
        if (now < pc.at) continue;
        pendingCooks.splice(pendingCooks.indexOf(pc), 1);
        const ing = s.ingredients.find((i) => i.id === pc.ing);
        let r;
        if (ing.thermal) {
          const raw = Math.round(pc.g / 0.6), endpointC = 85 + Math.round(rng.range(-3, 3)), holdH = 1.5;
          const model = (72.9 - 0.85 * (endpointC - 75) - 2.1 * holdH) / 100;
          const cookedG = Math.round(raw * (model + rng.range(0.0, 0.035)));   // weighed: a little above the model, as real briskets often are
          r = go('addBatch', { ing: ing.id, rawG: raw, cookedG, endpointC, holdH, tempF: 160, src: 'sample' });
        } else r = go('addBatch', { ing: ing.id, cookedG: Math.round(pc.g), tempF: ing.hold === 'cold' ? 38 : 158, src: 'sample' });
        if (r.report === 'ok') { tempDue.set(r.info.batchId, now + rng.range(25, 32) * MIN); lastCook[ing.id] = now; }
      }
      if (now < close - 1.5 * HR && step % 12 === 0) for (const ing of s.ingredients) {
        if (!ing.tcs || pendingCooks.some((p) => p.ing === ing.id) || now - (lastCook[ing.id] || 0) < 45 * MIN) continue;
        if ((ing.id === 'brisket' && brisketShort) || (ing.id === 'pork' && porkShort)) continue;
        if (E.servable(s, ing.id) < ing.thresholdG * 3) pendingCooks.push({ ing: ing.id, at: now + rng.range(30, 50) * MIN, g: Math.max((DAILY[ing.id] || ing.parG * 0.5) * 0.2, ing.thresholdG * 3.2) });
      }
      if (now >= nextSan) { go('sanitizeDone', {}); nextSan = now + (lateSanitizeDay ? rng.range(4.4, 5.2) : rng.range(3.4, 4.1)) * HR; }
    }
    for (const b of s.batches) if (b.status !== 'discard' && b.remainingG > 0 && b.kind !== 'cooling') go('discardBatch', { batchId: b.id, reason: 'quality' });
    keepBatches();
  }
  // the sample is plain data: tickets already say src:'sample'; strip the costs of the two items we pretend are not costed
  const tickets = s.tickets.map((t) => Object.assign({}, t, { src: 'sample', items: t.items.map((it) => (NO_COST.has(it.menuId) ? stripCost(it) : it)) }));
  // end-of-day clean-up (the kitchen empties the cabinet after close) is not a sell-out or a lockout: drop those 86 events and their sync records
  const afterHours = (t) => { const h = (t - U.dateKeyToMs(U.serviceDate(t, C.service.dayStartHour))) / HR; return h >= C.service.closeHour || h < C.service.openHour - 1; };
  const all = E.allEvents(s);
  const events = all.filter((e) => !(e.type === 'avail_changed' && afterHours(e.t)) && !(e.type === 'sync_done' && afterHours(e.t)))
    .map((e) => (e.type === 'item_done' && NO_COST.has(e.menuId) ? stripCostEv(e) : e));
  const batches = Array.from(seenBatches.values()).map((b) => Object.assign({}, b, { src: 'sample' }));
  return { tickets, events, batches, learned: s.learned, menu: s.menu, ingredients: s.ingredients, settings: s.settings, range: { from: tickets.length ? tickets[0].createdAt : now, to: now }, meta: { startKey, endKey, days, refused: refusedAt.length } };
}
function stripCost(it) { const c = Object.assign({}, it); delete c.cost; return c; }
function stripCostEv(e) { const c = Object.assign({}, e); delete c.cost; return c; }

/** A deliberately thin history: two quiet days, a handful of tickets, one batch, nothing costed. Real data has days like this. */
export async function thinDataset(o = {}) {
  const key = U.addDays(o.todayKey || todayKey(), -1);
  const day = U.dateKeyToMs(key);
  let now = day + 11 * HR;
  let s = E.newState({ now, empty: true });
  // Applies one engine action at the virtual time, keeping the new state only when it is accepted.
  const go = (type, p) => { const r = E.apply(s, type, p, now); if (r.report === 'ok') s = r.state; return r; };
  go('addBatch', { ing: 'brisket', rawG: 8000, tempF: 160, src: 'sample' });
  go('restock', { ing: 'slaw', g: 1000 });
  for (let i = 0; i < 4; i++) {
    now += 20 * MIN;
    const r = go('createTicket', { customer: 'Walk-up', channel: 'dine_in', items: [{ menuId: 'brisket_half' }, { menuId: 'mac' }], src: 'sample' });
    if (r.report !== 'ok') continue;
    const t = s.tickets[s.tickets.length - 1];
    now += 4 * MIN;
    for (const it of t.items) go('completeItem', { ticketId: t.id, itemId: it.id });
    go('bumpTicket', { ticketId: t.id });
  }
  const tickets = s.tickets.map((t) => Object.assign({}, t, { src: 'sample', items: t.items.map(stripCost) }));
  return { tickets, events: E.allEvents(s).map((e) => (e.type === 'item_done' ? stripCostEv(e) : e)), batches: s.batches, learned: s.learned, menu: s.menu, ingredients: s.ingredients, settings: s.settings, range: { from: tickets.length ? tickets[0].createdAt : now, to: now }, meta: { startKey: key, endKey: key, days: 1 } };
}

// node test/_office-b-data.mjs  -> prints a summary of what the generator produced (for tuning)
if (import.meta.url === new URL(process.argv[1], 'file:///').href || process.argv[1]?.endsWith('_office-b-data.mjs')) {
  const t0 = performance.now();
  const ds = await makeDataset({});
  const ev = ds.events;
  // All events of one given type, in the order they happened.
  const by = (type) => ev.filter((e) => e.type === type);
  console.log('built in', Math.round(performance.now() - t0), 'ms;', ds.tickets.length, 'tickets,', ev.length, 'events,', ds.batches.length, 'batches', JSON.stringify(ds.meta));
  console.log('avail_changed:', by('avail_changed').length, 'sync_done:', by('sync_done').length, 'temp_logged:', by('temp_logged').length, 'discards:', by('batch_discard').length, 'ui_report:', by('ui_report').length);
  console.log('json size MB', (JSON.stringify(ds).length / 1e6).toFixed(2));
}
